import { useSyncExternalStore } from 'react';
import {
  createUser, fetchSettings, isNetworkError, readUsersCache, saveSettings, syncUsers,
  updateUser, writeUsersCache, type User,
} from './api';
import { writeSettingsCache, type AppSettings } from './settings';
import { toastError, toastInfo, toastOk } from './toasts';

/**
 * =========================================================================
 * CENTRO DE SINCRONIZACIÓN
 * =========================================================================
 * Un único sitio que sabe dos cosas: qué cambios míos todavía NO están en la
 * nube, y qué tan viejos son los datos que estoy viendo.
 *
 * Las escrituras siguen yendo directas a la nube. La cola solo recoge las que
 * fallaron por **conexión** (`NetworkError`), porque son las únicas que tiene
 * sentido reintentar tal cual. Un rechazo del servidor (credenciales, datos
 * inválidos) se le dice a la persona en el momento y no se encola: reintentarlo
 * daría el mismo "no".
 *
 * Los componentes no reciben los datos por aquí: al terminar una
 * sincronización sube `dataVersion`, y cada módulo vuelve a leer su caché. Así
 * el centro no necesita conocer a nadie.
 */
export type SyncStatus = 'sincronizado' | 'pendiente' | 'sincronizando' | 'sin-conexion';

export interface NewUserInput { dni: string; apellidos: string; nombres: string; tipoUsuario: User['tipoUsuario'] }
export interface EditUserInput { dni: string; apellidos: string; nombres: string; estado: User['estado']; tipoUsuario: User['tipoUsuario']; password?: string }

interface ChangeBase {
  id: string;
  /** Texto que se lee en el panel del botón: "Nuevo usuario 12345678" */
  label: string;
  createdAt: string;
  /** Motivo por el que el servidor lo rechazó; si está, no se reintentará solo */
  lastError?: string;
}

export type PendingChange = ChangeBase & (
  | { kind: 'crear-usuario'; payload: NewUserInput }
  | { kind: 'editar-usuario'; payload: EditUserInput }
  | { kind: 'guardar-config'; payload: AppSettings }
);

export interface SyncState {
  status: SyncStatus;
  pending: PendingChange[];
  /** ISO de la última vez que los datos vinieron de la nube */
  lastSync: string;
  /** Resultado de la última operación, para el panel del botón */
  lastMessage: string;
  /** Sube cada vez que hay datos nuevos en caché */
  dataVersion: number;
}

const EMPTY: SyncState = { status: 'sincronizado', pending: [], lastSync: '', lastMessage: '', dataVersion: 0 };

let state: SyncState = EMPTY;
let owner = '';
let ownerIsAdmin = false;
let running = false;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  emit();
}

/* ─── Persistencia de la cola: sobrevive a recargas y a quedarse sin batería ─── */
const pendingKey = (dni: string) => `loginapp_pending_${dni}`;

function readPending(dni: string): PendingChange[] {
  try {
    const raw = JSON.parse(localStorage.getItem(pendingKey(dni)) || 'null');
    return Array.isArray(raw) ? (raw as PendingChange[]) : [];
  } catch { localStorage.removeItem(pendingKey(dni)); return []; }
}

function writePending(dni: string, pending: PendingChange[]): void {
  try {
    if (pending.length) localStorage.setItem(pendingKey(dni), JSON.stringify(pending));
    else localStorage.removeItem(pendingKey(dni));
  } catch { /* almacenamiento no disponible */ }
}

const restingStatus = (pending: PendingChange[]): SyncStatus => (pending.length ? 'pendiente' : 'sincronizado');

/** Deja el centro apuntando a la sesión en curso. Idempotente. */
export function attachSync(dni: string, isAdmin: boolean): void {
  ownerIsAdmin = isAdmin;
  if (owner === dni) return;
  owner = dni;
  const pending = readPending(dni);
  state = { ...EMPTY, pending, status: restingStatus(pending), lastSync: readUsersCache(dni).lastSync };
  emit();
}

export function detachSync(): void {
  owner = ''; ownerIsAdmin = false; running = false;
  state = EMPTY;
  emit();
}

/** Guarda un cambio que no pudo salir por falta de conexión. */
export function queueChange(change: Omit<PendingChange, 'id' | 'createdAt'>): void {
  if (!owner) return;
  const pending = [...state.pending, { ...change, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString() } as PendingChange];
  writePending(owner, pending);
  setState({ pending, status: 'sin-conexion', lastMessage: 'Guardado en este dispositivo. Se enviará al sincronizar.' });
}

/** Descarta un cambio que el servidor rechazó y que no tiene arreglo automático. */
export function discardChange(id: string): void {
  const pending = state.pending.filter((change) => change.id !== id);
  writePending(owner, pending);
  setState({ pending, status: restingStatus(pending) });
}

async function apply(change: PendingChange, adminDni: string): Promise<void> {
  if (change.kind === 'crear-usuario') { await createUser({ adminDni, ...change.payload }); return; }
  if (change.kind === 'editar-usuario') { await updateUser({ adminDni, ...change.payload }); return; }
  await saveSettings(adminDni, change.payload);
}

const describe = (cause: unknown): string => (cause instanceof Error ? cause.message : 'Error desconocido.');

/**
 * Envía la cola y luego vuelve a traer los datos de la nube.
 *
 * `silent` evita los avisos cuando la sincronización no la pidió nadie (al
 * abrir un módulo o al recuperar la conexión): solo se avisa si algo va mal.
 */
export async function runSync({ silent = false } = {}): Promise<void> {
  if (!owner || running) return;
  running = true;
  setState({ status: 'sincronizando', lastMessage: 'Sincronizando…' });

  const queue = state.pending;
  const remaining: PendingChange[] = [];
  let sent = 0;
  let rejected = 0;
  let offline = false;

  for (let index = 0; index < queue.length; index++) {
    const change = queue[index];
    try {
      await apply(change, owner);
      sent++;
    } catch (cause) {
      if (isNetworkError(cause)) {
        // Sigue sin haber conexión: se conserva el resto de la cola en orden.
        offline = true;
        remaining.push(...queue.slice(index));
        break;
      }
      // El servidor lo rechazó: se queda visible con su motivo para decidir a mano.
      rejected++;
      remaining.push({ ...change, lastError: describe(cause) });
    }
  }

  let refreshed = false;
  let refreshError = '';
  if (!offline) {
    try {
      if (ownerIsAdmin) {
        const users = await syncUsers(owner);
        writeUsersCache(owner, { users, lastSync: new Date().toISOString() });
      }
      writeSettingsCache(await fetchSettings());
      refreshed = true;
    } catch (cause) {
      if (isNetworkError(cause)) offline = true; else refreshError = describe(cause);
    }
  }

  writePending(owner, remaining);
  running = false;

  const status: SyncStatus = offline ? 'sin-conexion' : restingStatus(remaining);
  const lastMessage = offline
    ? 'Sin conexión con la nube. Los cambios siguen guardados aquí.'
    : rejected
      ? `${rejected} cambio(s) rechazados por el servidor.`
      : refreshError || (refreshed ? 'Todo al día.' : 'Sin cambios.');

  setState({
    pending: remaining,
    status,
    lastMessage,
    lastSync: refreshed ? new Date().toISOString() : state.lastSync,
    dataVersion: refreshed ? state.dataVersion + 1 : state.dataVersion,
  });

  if (offline) {
    if (!silent) toastError('Sin conexión', remaining.length ? `${remaining.length} cambio(s) esperan a que vuelva la conexión.` : 'No se pudieron traer los datos de la nube.');
    return;
  }
  if (rejected) { if (!silent) toastError('El servidor rechazó un cambio', remaining.find((change) => change.lastError)?.lastError); return; }
  if (refreshError) { if (!silent) toastError('No se pudo actualizar', refreshError); return; }
  if (sent) { if (!silent) toastOk('Cambios enviados', `${sent} cambio(s) guardados en la nube.`); return; }
  if (!silent) toastOk('Datos actualizados', 'Ya estás viendo lo que hay en la nube.');
}

/**
 * Marca los datos locales como recién traídos de la nube. La usan los módulos
 * que ya sincronizaron por su cuenta, para que el botón no diga "desactualizado"
 * justo después de una sincronización correcta.
 */
export function markSynced(): void {
  setState({ lastSync: new Date().toISOString(), status: restingStatus(state.pending), lastMessage: 'Todo al día.' });
}

export const useSyncState = (): SyncState => useSyncExternalStore(subscribe, () => state);

/** Avisa de un guardado que sí llegó a la nube, sin pasar por la cola. */
export function reportSaved(what: string): void {
  setState({ lastSync: new Date().toISOString(), lastMessage: `${what} · guardado en la nube` });
  toastOk('Guardado en la nube', what);
}

/** Guarda el cambio para más tarde y lo dice, cuando falló por conexión. */
export function reportQueued(change: Omit<PendingChange, 'id' | 'createdAt'>): void {
  queueChange(change);
  toastInfo('Sin conexión: guardado aquí', `${change.label} se enviará cuando sincronices.`);
}

// Al recuperar la conexión, lo que estaba esperando sale solo y en silencio.
window.addEventListener('online', () => {
  if (owner && state.pending.length) runSync({ silent: true });
});

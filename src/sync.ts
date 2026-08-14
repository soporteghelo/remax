import { useSyncExternalStore } from 'react';
import {
  createUser, fetchSettings, isNetworkError, readUsersCache, saveSettings, syncUsers,
  updateUser, writeUsersCache, type User,
} from './api';
import { writeSettingsCache, type AppSettings } from './settings';
import {
  addInteraction, convertProspect, dashboard, listCatalogs, listClients, listProspects, rescheduleInteraction, saveCatalog, saveClient, saveProfile, saveProspect, updateUserCategory,
  type CatalogInput, type Client, type ConvertDetails, type InteractionInput, type ProspectInput,
} from './crm-api';

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
 *
 * La sincronización se dispara SOLO desde la nube de la barra superior
 * (`SyncControl`). Ningún módulo lleva su propio botón de sincronizar o
 * actualizar: se registra con `registerSyncModule` y entra en esa misma pulsación.
 */
type SyncStatus = 'sincronizado' | 'pendiente' | 'sincronizando' | 'sin-conexion';

interface NewUserInput { dni: string; apellidos: string; nombres: string; tipoUsuario: User['tipoUsuario']; correo?: string; celular?: string; categoria?: string }
interface EditUserInput { dni: string; apellidos: string; nombres: string; estado: User['estado']; tipoUsuario: User['tipoUsuario']; password?: string; correo?: string; celular?: string; categoria?: string }

interface ChangeBase {
  id: string;
  /** Qué cambio es, en palabras: "Nuevo usuario 12345678" */
  label: string;
  createdAt: string;
}

export type PendingChange = ChangeBase & (
  | { kind: 'crear-usuario'; payload: NewUserInput }
  | { kind: 'editar-usuario'; payload: EditUserInput }
  | { kind: 'actualizar-categoria-usuario'; payload: { dni: string; categoria: string } }
  | { kind: 'guardar-config'; payload: AppSettings }
  | { kind: 'guardar-prospecto'; payload: ProspectInput }
  | { kind: 'registrar-interaccion'; payload: InteractionInput }
  | { kind: 'reprogramar-interaccion'; payload: { interactionId: string; proximoContacto: string } }
  | { kind: 'convertir-prospecto'; payload: { id: string; details: ConvertDetails } }
  | { kind: 'guardar-cliente'; payload: Partial<Client> & { id: string } }
  | { kind: 'guardar-catalogo'; payload: CatalogInput }
  | { kind: 'guardar-perfil'; payload: { nombres: string; apellidos: string; correo?: string; celular?: string } }
);

export interface SyncState {
  status: SyncStatus;
  pending: PendingChange[];
  /** ISO de la última vez que los datos vinieron de la nube */
  lastSync: string;
  /** Sube cada vez que hay datos nuevos en caché */
  dataVersion: number;
}

const EMPTY: SyncState = { status: 'sincronizado', pending: [], lastSync: '', dataVersion: 0 };

/* ─── Registro de módulos: lo que la nube de la barra superior trae de vuelta ─── */
export interface SyncModuleContext { dni: string; isAdmin: boolean }

export interface SyncModule {
  id: string;
  /** Nombre legible; encabeza el aviso cuando ese módulo falla */
  label: string;
  /** Se omite cuando la sesión no puede leer esos datos (p. ej. solo administración) */
  appliesTo?: (context: SyncModuleContext) => boolean;
  /** Trae los datos de la nube y los deja en la caché local del propio módulo */
  refresh: (context: SyncModuleContext) => Promise<void>;
}

const modules = new Map<string, SyncModule>();

/**
 * Suma un módulo a la sincronización global. Se llama UNA vez, al importarse el
 * módulo (no al montar un componente): el botón debe poder actualizarlo aunque
 * la persona esté viendo otra pantalla. Registrar dos veces el mismo `id`
 * reemplaza al anterior, así que recargar en caliente no duplica trabajo.
 */
export function registerSyncModule(module: SyncModule): void {
  modules.set(module.id, module);
}

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
  setState({ pending, status: 'sin-conexion' });
}

/**
 * Cada tipo de cambio se envía por su propia vía. La lista es exhaustiva a
 * propósito: la cola vive en localStorage y puede contener un cambio guardado
 * por una versión anterior de la app. Antes esos casos caían en el último
 * `await` de la función y se enviaban como si fueran un catálogo; ahora se
 * descartan, que es lo único seguro cuando ya no se sabe qué significaban.
 */
async function apply(change: PendingChange, adminDni: string): Promise<void> {
  switch (change.kind) {
    case 'crear-usuario': await createUser({ adminDni, ...change.payload }); return;
    case 'editar-usuario': await updateUser({ adminDni, ...change.payload }); return;
    case 'actualizar-categoria-usuario': await updateUserCategory(adminDni, change.payload.dni, change.payload.categoria); return;
    case 'guardar-config': await saveSettings(adminDni, change.payload); return;
    case 'guardar-prospecto': await saveProspect(adminDni, change.payload); return;
    case 'registrar-interaccion': await addInteraction(adminDni, change.payload); return;
    case 'reprogramar-interaccion': await rescheduleInteraction(adminDni, change.payload.interactionId, change.payload.proximoContacto); return;
    case 'convertir-prospecto': await convertProspect(adminDni, change.payload.id, change.payload.details); return;
    case 'guardar-cliente': await saveClient(adminDni, change.payload); return;
    case 'guardar-perfil': await saveProfile(adminDni, change.payload); return;
    case 'guardar-catalogo': await saveCatalog(adminDni, change.payload); return;
    default: return;
  }
}

/** Envía la cola y luego vuelve a traer los datos de la nube. */
export async function runSync(): Promise<void> {
  if (!owner || running) return;
  running = true;
  setState({ status: 'sincronizando' });

  const queue = state.pending;
  const remaining: PendingChange[] = [];
  let offline = false;

  for (let index = 0; index < queue.length; index++) {
    const change = queue[index];
    try {
      await apply(change, owner);
    } catch (cause) {
      if (isNetworkError(cause)) {
        // Sigue sin haber conexión: se conserva el resto de la cola en orden.
        offline = true;
        remaining.push(...queue.slice(index));
        break;
      }
      // El servidor lo rechazó. Se queda en la cola —la insignia del botón lo
      // delata— y se reintentará en la siguiente pulsación.
      remaining.push(change);
    }
  }

  // Cada módulo registrado se actualiza en la misma pulsación y en paralelo.
  // Las lecturas son independientes; hacerlas en serie multiplicaba la espera.
  let refreshed = false;
  if (!offline) {
    const context: SyncModuleContext = { dni: owner, isAdmin: ownerIsAdmin };
    const applicable = [...modules.values()].filter((module) => !module.appliesTo || module.appliesTo(context));
    const results = await Promise.allSettled(applicable.map((module) => module.refresh(context)));
    refreshed = results.some((result) => result.status === 'fulfilled');
    offline = results.some((result) => result.status === 'rejected' && isNetworkError(result.reason));
  }

  writePending(owner, remaining);
  running = false;

  setState({
    pending: remaining,
    status: offline ? 'sin-conexion' : restingStatus(remaining),
    lastSync: refreshed ? new Date().toISOString() : state.lastSync,
    dataVersion: refreshed ? state.dataVersion + 1 : state.dataVersion,
  });
}

export const useSyncState = (): SyncState => useSyncExternalStore(subscribe, () => state);

/** Un guardado que sí llegó a la nube: adelanta el sello de frescura. */
export function markSaved(): void {
  setState({ lastSync: new Date().toISOString() });
}

// Al recuperar la conexión, lo que estaba esperando sale solo y en silencio.
window.addEventListener('online', () => {
  if (owner && state.pending.length) runSync();
});

/* ─────────────────────────────────────────────────────────────────────────
 * MÓDULOS DE SERIE
 * Un módulo nuevo se añade aquí (o llama a `registerSyncModule` en su propio
 * archivo) y queda cubierto por la nube de la barra superior. No añadas botones
 * de sincronizar ni de actualizar en la pantalla del módulo.
 * ───────────────────────────────────────────────────────────────────────── */
registerSyncModule({
  id: 'usuarios',
  label: 'Usuarios',
  appliesTo: ({ isAdmin }) => isAdmin,
  refresh: async ({ dni }) => {
    const users = await syncUsers(dni);
    writeUsersCache(dni, { users, lastSync: new Date().toISOString() });
  },
});

registerSyncModule({
  id: 'configuracion',
  label: 'Configuración',
  refresh: async () => { writeSettingsCache(await fetchSettings()); },
});

registerSyncModule({ id: 'crm-prospectos', label: 'Prospectos', refresh: async ({ dni }) => { await listProspects(dni); } });
registerSyncModule({ id: 'crm-clientes', label: 'Clientes', refresh: async ({ dni }) => { await listClients(dni); } });
registerSyncModule({ id: 'crm-catalogos', label: 'Catálogos', refresh: async ({ dni }) => { await listCatalogs(dni); } });
registerSyncModule({ id: 'crm-panel', label: 'Panel comercial', refresh: async ({ dni }) => { await dashboard(dni); } });

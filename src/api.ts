import { normalizeSettings, type AppSettings } from './settings';

export interface User {
  dni: string;
  apellidos: string;
  nombres: string;
  estado: 'ACTIVO' | 'CESADO';
  tipoUsuario: 'ADMINISTRADOR' | 'USUARIO';
  fechaRegistro: string;
  ultimoAcceso: string;
  dispositivo: string;
}

/**
 * Motivo del veredicto sobre una sesión guardada. Los tres primeros son motivos
 * *positivos* de cierre. `desconocida` significa "no se pudo comprobar" —nunca
 * "inválida"— y por eso no cierra la sesión de nadie.
 */
export type SessionEndReason = 'contrasena' | 'cesado' | 'inexistente' | 'desconocida';

type ApiResult = { status?: string; message?: string; record?: Record<string, unknown>; users?: Record<string, unknown>[]; settings?: Record<string, unknown>; stamp?: string; valid?: boolean; reason?: string };
const endpoint = import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined;

function device(): string {
  const agent = navigator.userAgent;
  if (/Android/i.test(agent)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(agent)) return 'iOS';
  if (/Windows/i.test(agent)) return 'Windows';
  if (/Mac/i.test(agent)) return 'Mac';
  return 'Otro';
}

function mapUser(row: Record<string, unknown>, fallbackDni = ''): User {
  return { dni: String(row.DNI ?? fallbackDni), apellidos: String(row.Apellidos ?? ''), nombres: String(row.Nombres ?? ''), estado: String(row.Estado ?? 'ACTIVO').toUpperCase() === 'CESADO' ? 'CESADO' : 'ACTIVO', tipoUsuario: String(row.TipoUsuario ?? 'USUARIO').toUpperCase() === 'ADMINISTRADOR' ? 'ADMINISTRADOR' : 'USUARIO', fechaRegistro: String(row.FechaRegistro ?? ''), ultimoAcceso: String(row.UltimoAcceso ?? ''), dispositivo: String(row.Dispositivo ?? '') };
}

/**
 * No se pudo hablar con el servicio (sin conexión, servicio caído, respuesta
 * ilegible). Se distingue del rechazo del servidor porque un cambio que falla
 * así **puede reintentarse tal cual**: es lo que la cola de sincronización
 * guarda. Un rechazo (credenciales, datos inválidos) nunca mejoraría al
 * reintentarlo, así que ese sí se le comunica a la persona en el momento.
 */
export class NetworkError extends Error {
  constructor(message = 'No se pudo conectar con el servicio.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export const isNetworkError = (cause: unknown): boolean => cause instanceof NetworkError;

async function request(payload: Record<string, unknown>): Promise<ApiResult> {
  if (!endpoint) throw new NetworkError('Falta VITE_APPS_SCRIPT_URL en el archivo .env.');
  let response: Response;
  try { response = await fetch(endpoint, { method: 'POST', redirect: 'follow', body: JSON.stringify(payload) }); }
  catch { throw new NetworkError(); }

  const result = await response.json().catch(() => null) as ApiResult | null;
  if (!response.ok || !result) throw new NetworkError();
  // A partir de aquí el servidor respondió y opinó: su mensaje es el que vale.
  if (result.status !== 'ok') throw new Error(result.message || 'El servicio rechazó la operación.');
  return result;
}

/**
 * Credencial del administrador en curso. El servidor sigue verificándola en cada
 * operación privilegiada; aquí solo se conserva mientras dura la pestaña para no
 * volver a pedirla en cada alta o sincronización. Nunca pasa a localStorage.
 */
const ADMIN_KEY = 'loginapp_admin';
/** Huella devuelta al iniciar sesión: cambia si el administrador cambia la contraseña. */
const STAMP_KEY = 'loginapp_stamp';

function rememberAdmin(dni: string, password: string): void {
  try { sessionStorage.setItem(ADMIN_KEY, JSON.stringify({ dni, password })); } catch { /* almacenamiento no disponible */ }
}

function rememberStamp(stamp: string): void {
  try { localStorage.setItem(STAMP_KEY, stamp); } catch { /* almacenamiento no disponible */ }
}

export function forgetSession(): void {
  try { sessionStorage.removeItem(ADMIN_KEY); localStorage.removeItem(STAMP_KEY); } catch { /* almacenamiento no disponible */ }
}

function adminPasswordFor(dni: string): string {
  let saved: { dni?: string; password?: string } | null = null;
  try { saved = JSON.parse(sessionStorage.getItem(ADMIN_KEY) || 'null'); } catch { saved = null; }
  if (!saved || saved.dni !== dni || !saved.password) throw new Error('Vuelve a iniciar sesión para confirmar tus credenciales de administrador.');
  return saved.password;
}

export async function signIn(input: { dni: string; password: string }): Promise<User> {
  const result = await request({ action: 'authenticateUser', ...input, dispositivo: device() });
  if (!result.record) throw new Error('El servidor no devolvió los datos del usuario.');
  const user = mapUser(result.record, input.dni);
  if (result.stamp) rememberStamp(result.stamp);
  if (user.tipoUsuario === 'ADMINISTRADOR') rememberAdmin(user.dni, input.password);
  return user;
}

/**
 * Revalida contra el servidor la sesión restaurada del navegador. Devuelve
 * `valid: false` si el administrador cambió la contraseña o cesó la cuenta, y el
 * registro actualizado si sigue vigente (así se reflejan cambios de rol o datos).
 *
 * Si en este dispositivo no hay huella guardada, la pregunta se hace igual: el
 * servidor no podrá comprobar la contraseña, pero sí que la cuenta exista y no
 * esté cesada. Antes se resolvía aquí mismo con `valid: false`, y eso expulsaba
 * al login en cada recarga a quien tuviera una sesión sin huella.
 */
export async function checkSession(dni: string): Promise<{ valid: boolean; reason: SessionEndReason; user: User | null }> {
  const stamp = localStorage.getItem(STAMP_KEY) || '';
  const result = await request({ action: 'checkSession', dni, stamp });
  const reason = (result.reason ?? 'desconocida') as SessionEndReason;
  return { valid: Boolean(result.valid), reason, user: result.record ? mapUser(result.record, dni) : null };
}

/** La contraseña inicial de toda cuenta nueva es su propio DNI. */
export async function createUser(input: { adminDni: string; dni: string; apellidos: string; nombres: string; tipoUsuario: User['tipoUsuario'] }): Promise<User> {
  const { adminDni, ...usuario } = input;
  const result = await request({ action: 'createUser', adminDni, adminPassword: adminPasswordFor(adminDni), usuario: { ...usuario, password: usuario.dni } });
  if (!result.record) throw new Error('El servidor no devolvió el usuario creado.');
  return mapUser(result.record, usuario.dni);
}

/**
 * Edita una cuenta. `password` vacío deja la contraseña intacta; con valor, la
 * reemplaza y esa persona quedará fuera de la app en su siguiente carga. Marcarla
 * como CESADO tiene el mismo efecto.
 */
export async function updateUser(input: { adminDni: string; dni: string; apellidos: string; nombres: string; estado: User['estado']; tipoUsuario: User['tipoUsuario']; password?: string }): Promise<User> {
  const { adminDni, ...usuario } = input;
  const result = await request({ action: 'updateUser', adminDni, adminPassword: adminPasswordFor(adminDni), usuario });
  if (!result.record) throw new Error('El servidor no devolvió el usuario actualizado.');
  // Al cambiar la propia contraseña hay que renovar huella y credencial en curso.
  if (usuario.dni === adminDni) {
    if (result.stamp) rememberStamp(result.stamp);
    if (usuario.password) rememberAdmin(adminDni, usuario.password);
  }
  return mapUser(result.record, usuario.dni);
}

export async function syncUsers(adminDni: string): Promise<User[]> {
  const result = await request({ action: 'listUsers', adminDni, adminPassword: adminPasswordFor(adminDni) });
  return (result.users ?? []).map((row) => mapUser(row)).sort((a, b) => a.apellidos.localeCompare(b.apellidos, 'es'));
}

/* ─── Configuración general de la app (pestaña CONFIGURACION) ─── */

/**
 * Lectura pública: la pantalla de acceso muestra el título y los colores antes
 * de que exista una sesión, así que esta acción no exige credenciales.
 */
export async function fetchSettings(): Promise<AppSettings> {
  const result = await request({ action: 'getSettings' });
  return normalizeSettings(result.settings);
}

/** Guarda la configuración. El servidor revalida las credenciales del administrador. */
export async function saveSettings(adminDni: string, settings: AppSettings): Promise<{ settings: AppSettings; message: string }> {
  const result = await request({ action: 'saveSettings', adminDni, adminPassword: adminPasswordFor(adminDni), settings });
  return { settings: normalizeSettings(result.settings), message: result.message || 'Configuración guardada.' };
}

/** Completa los campos que no existían en versiones anteriores (Estado). */
export function normalizeUser(saved: User): User {
  return { ...saved, estado: saved.estado === 'CESADO' ? 'CESADO' : 'ACTIVO', tipoUsuario: saved.tipoUsuario === 'ADMINISTRADOR' ? 'ADMINISTRADOR' : 'USUARIO' };
}

/** Caché local de usuarios: la comparten el módulo de administración y el panel principal. */
export interface UsersCache { users: User[]; lastSync: string }
const cacheKey = (dni: string) => `loginapp_users_cache_${dni}`;

export function readUsersCache(dni: string): UsersCache {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey(dni)) || 'null') as Partial<UsersCache> | null;
    return { users: (cached?.users ?? []).map(normalizeUser), lastSync: cached?.lastSync ?? '' };
  } catch { localStorage.removeItem(cacheKey(dni)); return { users: [], lastSync: '' }; }
}

export function writeUsersCache(dni: string, cache: UsersCache): void {
  localStorage.setItem(cacheKey(dni), JSON.stringify(cache));
}

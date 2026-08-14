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
  /** Canales por los que se le entregan sus credenciales; ambos opcionales */
  correo: string;
  celular: string;
  categoria: string;
}

/**
 * Qué pasó con el acceso de una cuenta recién creada. El correo lo envía el
 * servidor; el mensaje de WhatsApp no puede enviarse solo, así que el servidor
 * devuelve el enlace ya escrito y quien administra lo abre.
 */
export type InviteChannel = 'whatsapp' | 'correo' | 'ambos';

export interface CredentialDelivery {
  /** Correo de la cuenta; vacío si no registró ninguno */
  email: string;
  emailSent: boolean;
  emailError: string;
  /** El envío por WhatsApp no manda correo aunque la cuenta lo tenga */
  emailSkipped: boolean;
  whatsappUrl: string;
  /** El mismo mensaje en texto plano, para copiarlo y compartirlo a mano */
  text: string;
  /** Enlace de acceso configurado; vacío si falta en CONFIGURACION */
  link: string;
  /**
   * Contraseña incluida en el mensaje. Al reenviar llega vacía si esa persona
   * ya la cambió: el servidor guarda un valor protegido y no puede recuperarla.
   */
  password: string;
}

/**
 * Motivo del veredicto sobre una sesión guardada. Los tres primeros son motivos
 * *positivos* de cierre. `desconocida` significa "no se pudo comprobar" —nunca
 * "inválida"— y por eso no cierra la sesión de nadie.
 */
export type SessionEndReason = 'contrasena' | 'cesado' | 'inexistente' | 'desconocida';

export type ApiResult = { ok?: boolean; data?: unknown; error?: string | null; status?: string; message?: string; record?: Record<string, unknown>; users?: Record<string, unknown>[]; settings?: Record<string, unknown>; delivery?: Record<string, unknown>; stamp?: string; valid?: boolean; reason?: string };
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
  return { dni: String(row.DNI ?? fallbackDni), apellidos: String(row.Apellidos ?? ''), nombres: String(row.Nombres ?? ''), estado: String(row.Estado ?? 'ACTIVO').toUpperCase() === 'CESADO' ? 'CESADO' : 'ACTIVO', tipoUsuario: String(row.TipoUsuario ?? 'USUARIO').toUpperCase() === 'ADMINISTRADOR' ? 'ADMINISTRADOR' : 'USUARIO', fechaRegistro: String(row.FechaRegistro ?? ''), ultimoAcceso: String(row.UltimoAcceso ?? ''), dispositivo: String(row.Dispositivo ?? ''), correo: String(row.Correo ?? ''), celular: String(row.Celular ?? ''), categoria: String(row.Categoria ?? '') };
}

function mapDelivery(raw: Record<string, unknown> | undefined): CredentialDelivery {
  return {
    email: String(raw?.email ?? ''), emailSent: Boolean(raw?.emailSent), emailError: String(raw?.emailError ?? ''), emailSkipped: Boolean(raw?.emailSkipped),
    whatsappUrl: String(raw?.whatsappUrl ?? ''), text: String(raw?.text ?? ''), link: String(raw?.link ?? ''), password: String(raw?.password ?? ''),
  };
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

/**
 * El navegador se cansó de esperar la respuesta, pero Apps Script sigue
 * corriendo en el servidor y puede terminar guardando igual: reintentar tal
 * cual, como con `NetworkError`, arriesga duplicar el registro. Por eso es una
 * clase aparte y no se encola sola — quien la atrape debe decirle a la
 * persona que compruebe si el cambio ya llegó antes de repetirlo.
 */
export class TimeoutError extends Error {
  constructor(message = 'El servicio está tardando más de lo normal en responder.') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export const isNetworkError = (cause: unknown): boolean => cause instanceof NetworkError;
export const isTimeoutError = (cause: unknown): boolean => cause instanceof TimeoutError;

/** Apps Script puede tardar en arrancar (arranque en frío), pero nunca debe dejar la pantalla de carga girando para siempre. */
const REQUEST_TIMEOUT_MS = 25000;

export async function request(payload: Record<string, unknown>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<ApiResult> {
  if (!endpoint) throw new NetworkError('Falta VITE_APPS_SCRIPT_URL en el archivo .env.');
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  let response: Response;
  let responseText: string;
  try {
    response = await fetch(endpoint, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), signal: controller.signal });
    // El temporizador también cubre la descarga del cuerpo. Antes se cancelaba
    // apenas llegaban las cabeceras y `response.json()` podía esperar sin límite.
    responseText = await response.text();
  }
  catch { throw timedOut ? new TimeoutError() : new NetworkError(); }
  finally { clearTimeout(timeout); }

  let result: ApiResult | null = null;
  try { result = JSON.parse(responseText) as ApiResult; } catch { result = null; }
  if (!response.ok || !result) throw new NetworkError();
  // A partir de aquí el servidor respondió y opinó: su mensaje es el que vale.
  if (result.ok === false || (result.status !== undefined && result.status !== 'ok')) {
    throw new Error(result.error || result.message || 'El servicio rechazó la operación.');
  }
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

/** Credencial de sesión para las operaciones CRM. El rol nunca viaja: lo resuelve el servidor. */
export function sessionStamp(): string {
  try { return localStorage.getItem(STAMP_KEY) || ''; } catch { return ''; }
}

export async function authenticatedRequest<T>(action: string, actorDni: string, payload: Record<string, unknown> = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const result = await request({ action, ...payload, actorDni, stamp: sessionStamp() }, timeoutMs);
  return result.data as T;
}

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

/**
 * La contraseña inicial de toda cuenta nueva es su propio DNI. El servidor
 * envía el acceso al correo indicado y devuelve en `delivery` qué pudo entregar.
 */
export async function createUser(input: { adminDni: string; dni: string; apellidos: string; nombres: string; tipoUsuario: User['tipoUsuario']; correo?: string; celular?: string; categoria?: string }): Promise<{ user: User; delivery: CredentialDelivery }> {
  const { adminDni, ...usuario } = input;
  const result = await request({ action: 'createUser', adminDni, adminPassword: adminPasswordFor(adminDni), usuario: { ...usuario, password: usuario.dni } });
  if (!result.record) throw new Error('El servidor no devolvió el usuario creado.');
  return { user: mapUser(result.record, usuario.dni), delivery: mapDelivery(result.delivery) };
}

/**
 * Reenvía el acceso de una cuenta existente. El servidor solo incluye la
 * contraseña si sigue siendo la inicial; si esa persona ya la cambió, el
 * mensaje se lo recuerda sin revelarla.
 */
export async function resendInvite(adminDni: string, dni: string, canal: InviteChannel = 'ambos'): Promise<{ user: User; delivery: CredentialDelivery }> {
  const result = await request({ action: 'resendInvite', adminDni, adminPassword: adminPasswordFor(adminDni), dni, canal });
  if (!result.record) throw new Error('El servidor no devolvió los datos de la cuenta.');
  return { user: mapUser(result.record, dni), delivery: mapDelivery(result.delivery) };
}

/**
 * Edita una cuenta. `password` vacío deja la contraseña intacta; con valor, la
 * reemplaza y esa persona quedará fuera de la app en su siguiente carga. Marcarla
 * como CESADO tiene el mismo efecto.
 */
export async function updateUser(input: { adminDni: string; dni: string; apellidos: string; nombres: string; estado: User['estado']; tipoUsuario: User['tipoUsuario']; password?: string; correo?: string; celular?: string; categoria?: string }): Promise<{ user: User; delivery: CredentialDelivery | null }> {
  const { adminDni, ...usuario } = input;
  const result = await request({ action: 'updateUser', adminDni, adminPassword: adminPasswordFor(adminDni), usuario });
  if (!result.record) throw new Error('El servidor no devolvió el usuario actualizado.');
  // Al cambiar la propia contraseña hay que renovar huella y credencial en curso.
  if (usuario.dni === adminDni) {
    if (result.stamp) rememberStamp(result.stamp);
    if (usuario.password) rememberAdmin(adminDni, usuario.password);
  }
  return { user: mapUser(result.record, usuario.dni), delivery: usuario.password ? mapDelivery(result.delivery) : null };
}

/**
 * Elimina definitivamente una cuenta de agente sin historial comercial. Esta
 * operación no se encola: si no hay conexión, no se puede verificar que sus
 * prospectos, clientes e interacciones estén protegidos antes de borrarla.
 */
export async function deleteAgent(adminDni: string, dni: string): Promise<void> {
  await authenticatedRequest('crmDeleteAgent', adminDni, { dni });
}

export async function syncUsers(adminDni: string): Promise<User[]> {
  // La lectura usa la huella de sesión persistente, igual que el resto del CRM.
  // Así Equipo puede actualizarse al entrar incluso después de recargar la app,
  // cuando la contraseña temporal del administrador ya no está en sessionStorage.
  const users = await authenticatedRequest<User[]>('crmListAgents', adminDni);
  return (users ?? []).map(normalizeUser).sort((a, b) => a.apellidos.localeCompare(b.apellidos, 'es'));
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

/** Completa los campos que no existían en versiones anteriores (Estado, Correo, Celular). */
export function normalizeUser(saved: User): User {
  const row = saved as unknown as Record<string, unknown>;
  return {
    dni: String(row.dni ?? row.DNI ?? ''), apellidos: String(row.apellidos ?? row.Apellidos ?? ''), nombres: String(row.nombres ?? row.Nombres ?? ''),
    estado: String(row.estado ?? row.Estado ?? 'ACTIVO').toUpperCase() === 'CESADO' ? 'CESADO' : 'ACTIVO',
    tipoUsuario: String(row.tipoUsuario ?? row.TipoUsuario ?? 'USUARIO').toUpperCase() === 'ADMINISTRADOR' ? 'ADMINISTRADOR' : 'USUARIO',
    fechaRegistro: String(row.fechaRegistro ?? row.FechaRegistro ?? ''), ultimoAcceso: String(row.ultimoAcceso ?? row.UltimoAcceso ?? ''), dispositivo: String(row.dispositivo ?? row.Dispositivo ?? ''),
    correo: String(row.correo ?? row.Correo ?? ''), celular: String(row.celular ?? row.Celular ?? ''), categoria: String(row.categoria ?? row.Categoria ?? ''),
  };
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

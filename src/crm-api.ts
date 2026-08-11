import { authenticatedRequest, isTimeoutError, type User } from './api';

export type CatalogType = 'CANAL' | 'ESTADO' | 'RESULTADO' | 'CAPTADO_RESULTADO' | 'REUNION' | 'CATEGORIA_AGENTE';

/**
 * CATALOGOS no tiene columna de código: la `etiqueta` es a la vez lo que se ve en
 * el desplegable y el valor que queda escrito en el prospecto o la interacción.
 * Por eso identifica la opción dentro de su `tipo`.
 */
export interface CatalogItem {
  tipo: CatalogType;
  etiqueta: string;
  orden: number;
  activo: boolean;
}

/**
 * `etiquetaAnterior` dice qué opción se está editando. Al cambiarla, el backend
 * reescribe también los registros históricos que la usaban; sin ese dato la
 * llamada crea una opción nueva.
 */
export interface CatalogInput extends CatalogItem {
  etiquetaAnterior?: string;
}

/**
 * Respuesta de una eliminación. Cuando la opción todavía se usa, el primer
 * intento vuelve con `eliminado: false` y el número de registros afectados para
 * que la vista pida confirmación antes de insistir con `forzar`.
 */
export interface CatalogDeleteResult {
  eliminado: boolean;
  uso: number;
  tipo: CatalogType;
  etiqueta: string;
}

/** Campo libre guardado dentro de la columna JSON del prospecto. */
export interface CustomField {
  etiqueta: string;
  valor: string;
}

export interface Prospect {
  id: string;
  nombre: string;
  documento: string;
  telefono: string;
  correo: string;
  canal: string;
  resultado: string;
  etapa: 'PROSPECTO' | 'NEGOCIACION' | 'CLIENTE' | 'NO CONTINUA';
  agenteDni: string;
  agenteNombre: string;
  fechaCreacion: string;
  fechaActualizacion: string;
  proximoContacto: string;
  observaciones: string;
  fechaNacimiento: string;
  profesion: string;
  distrito: string;
  direccion: string;
  notas: string;
  camposPersonalizados: CustomField[];
  clienteId: string;
  captado: boolean;
}

export interface Interaction {
  id: string;
  prospectoId: string;
  agenteDni: string;
  agenteNombre: string;
  fechaHoraContacto: string;
  /** Compatibilidad temporal con respuestas de un Apps Script anterior. */
  fechaHora?: string;
  tipo: string;
  resultado: string;
  comentario: string;
  proximoContacto: string;
  estadoCaptacion: string;
  captacion: 'SI' | 'NO';
  etapa: 'PROSPECTO' | 'NEGOCIACION' | 'CLIENTE' | 'NO CONTINUA';
}

export interface Client {
  id: string;
  prospectoId: string;
  nombre: string;
  documento: string;
  telefono: string;
  correo: string;
  fechaNacimiento: string;
  profesion: string;
  distrito: string;
  direccion: string;
  fechaCierre: string;
  estado: string;
  estadoCaptacion: string;
  cierreVenta: string;
  notas: string;
  agenteDni: string;
  agenteNombre: string;
}

export interface DashboardData {
  metrics: {
    total: number;
    nuevos: number;
    contactados: number;
    captados: number;
    pendientes: number;
    vencidos: number;
    conversiones: number;
    tasaGestion: number;
    tasaCaptacion: number;
    tasaConversion: number;
  };
  funnel: Array<{ estado: string; total: number }>;
  /** Resultado de INTERACCIONES cuya Etapa es NEGOCIACION. */
  negotiationStates: Array<{ estado: string; total: number }>;
  /** Distribución de todas las INTERACCIONES por la columna Etapa. */
  interactionStages: Array<{ etapa: string; total: number }>;
  /** Distribución de PROSPECTOS por columna Canal, de mayor a menor. */
  canal: Array<{ canal: string; total: number }>;
  /** Conteo de INTERACCIONES por día (columna FechaHoraContacto/FechaHora), hasta los últimos 30 días con actividad. */
  interactionsByDate: Array<{ fecha: string; total: number }>;
  /** Altas de PROSPECTOS por día (columna FechaCreacion), hasta los últimos 30 días con registros. */
  prospectsByDate: Array<{ fecha: string; total: number }>;
  upcoming: Prospect[];
  agents: Array<{
    dni: string;
    nombre: string;
    prospectos: number;
    gestionados: number;
    prospectosContactados: number;
    seguimientos: number;
    /** Prospectos donde esta persona registró la interacción más antigua: quién abrió la conversación primero. */
    primerasInteracciones: number;
    captaciones: number;
    captados: number;
    pendientes: number;
    conversiones: number;
  }>;
}

export interface ProspectInput {
  id?: string;
  nombre: string;
  documento: string;
  telefono: string;
  correo: string;
  canal: string;
  agenteDni?: string;
  observaciones: string;
  /** Datos de captación. Se envían al editar la ficha completa del usuario. */
  fechaNacimiento?: string;
  profesion?: string;
  distrito?: string;
  direccion?: string;
  notas?: string;
  /** Se omite en formularios generales para conservar el JSON existente. */
  camposPersonalizados?: CustomField[];
}

export interface ConvertDetails {
  fechaNacimiento: string;
  profesion: string;
  distrito: string;
  direccion: string;
  notas: string;
  camposPersonalizados: CustomField[];
}

export interface InteractionInput {
  /** Identifica un único envío para poder reintentarlo sin duplicar filas. */
  requestId?: string;
  prospectoId: string;
  fechaHoraContacto: string;
  tipo: string;
  /** Permite un medio libre cuando la persona elige OTRO en el formulario. */
  tipoManual?: boolean;
  resultado: string;
  comentario: string;
  proximoContacto: string;
  estadoCaptacion?: string;
}

const cacheKey = (dni: string, name: string) => `fort_${name}_${dni}`;
const CATALOG_CACHE_NAME = 'catalogs-v4';
// Las escrituras del CRM fuerzan una actualización mediante dataVersion; entre
// cambios, conservar los agregados evita releer Apps Script al alternar filtros.
const DASHBOARD_RANGE_CACHE_MS = 30 * 60 * 1000;
const DASHBOARD_CACHE_SCHEMA = 'v7-sales-by-client-close';
const pendingReads = new Map<string, Promise<unknown>>();
const prospectDetailCacheName = (id: string): string => `prospect-detail-${id}`;

interface ProspectDetailData { prospect: Prospect; interactions: Interaction[] }
interface ProspectDetailCache extends Partial<ProspectDetailData> { protectedIds?: string[]; preserveUntil?: number }
const RECENT_WRITE_GRACE_MS = 3000;

const interactionDate = (item: Interaction): number => new Date(item.fechaHoraContacto || item.fechaHora || 0).getTime() || 0;

/** Une únicamente registros que deban protegerse durante una escritura reciente. */
function mergeInteractions(fresh: Interaction[], cached: Interaction[]): Interaction[] {
  const byId = new Map<string, Interaction>();
  cached.forEach((item) => { if (item.id) byId.set(item.id, item); });
  fresh.forEach((item) => { if (item.id) byId.set(item.id, item); });
  return [...byId.values()].sort((a, b) => interactionDate(b) - interactionDate(a));
}

function readProspectDetailCache(dni: string, id: string): ProspectDetailCache {
  return readCrmCache<ProspectDetailCache>(dni, prospectDetailCacheName(id), {});
}

function protectedCachedInteractions(cache: ProspectDetailCache): Interaction[] {
  if (!cache.preserveUntil || cache.preserveUntil <= Date.now()) return [];
  const ids = new Set(cache.protectedIds || []);
  return (cache.interactions || []).filter((item) => ids.has(item.id));
}

function prospectWithInteractions(prospect: Prospect, interactions: Interaction[]): Prospect {
  const latest = interactions[0];
  return latest ? { ...prospect, resultado: latest.resultado, etapa: latest.etapa, proximoContacto: latest.proximoContacto } : prospect;
}

function updateCachedProspect(dni: string, prospect: Prospect): void {
  if (!hasCrmCache(dni, 'prospects')) return;
  const current = readCrmCache<Prospect[]>(dni, 'prospects', []);
  writeCache(dni, 'prospects', [prospect, ...current.filter((item) => item.id !== prospect.id)]);
}

/** Comparte una misma lectura mientras está en curso para no duplicar llamadas. */
async function sharedRead<T>(action: string, dni: string, payload: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> {
  const key = `${dni}|${action}|${timeoutMs || 'default'}|${JSON.stringify(payload)}`;
  const current = pendingReads.get(key);
  if (current) return current as Promise<T>;
  const pending = authenticatedRequest<T>(action, dni, payload, timeoutMs);
  pendingReads.set(key, pending);
  try { return await pending; }
  finally { if (pendingReads.get(key) === pending) pendingReads.delete(key); }
}

function writeCache(dni: string, name: string, data: unknown): void {
  try { localStorage.setItem(cacheKey(dni, name), JSON.stringify({ data, savedAt: new Date().toISOString() })); } catch { /* caché opcional */ }
}

export function readCrmCache<T>(dni: string, name: string, fallback: T): T {
  try { return (JSON.parse(localStorage.getItem(cacheKey(dni, name)) || 'null')?.data as T) ?? fallback; }
  catch { return fallback; }
}

function readFreshCrmCache<T>(dni: string, name: string, maxAgeMs: number): T | null {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey(dni, name)) || 'null') as { data?: T; savedAt?: string } | null;
    const savedAt = cached?.savedAt ? new Date(cached.savedAt).getTime() : 0;
    return cached?.data !== undefined && savedAt && Date.now() - savedAt <= maxAgeMs ? cached.data : null;
  } catch { return null; }
}

/**
 * Si ya hay una caché guardada (aunque sea una lista vacía o métricas en cero),
 * la vista puede mostrarla de inmediato en vez de la pantalla de carga completa.
 * Sin esto, un dato legítimamente vacío (0 clientes, por ejemplo) se confundía
 * con "todavía no se cargó nada" y la persona veía el spinner en cada visita.
 */
export function hasCrmCache(dni: string, name: string): boolean {
  try { return localStorage.getItem(cacheKey(dni, name)) !== null; } catch { return false; }
}

export function hasCatalogCache(dni: string): boolean {
  return hasCrmCache(dni, CATALOG_CACHE_NAME);
}

export function hasProspectDetailCache(dni: string, id: string): boolean {
  return hasCrmCache(dni, prospectDetailCacheName(id));
}

export function readProspectInteractionsCache(dni: string, id: string): Interaction[] {
  return readProspectDetailCache(dni, id).interactions ?? [];
}

/**
 * Una etiqueta por tipo. La hoja puede traer repetidos —o una caché guardada por
 * una versión anterior— y dos opciones con el mismo texto no solo son
 * indistinguibles: comparten clave de React y la lista deja de repintarse al
 * cambiar de pestaña.
 */
export function uniqueCatalogs(items: CatalogItem[]): CatalogItem[] {
  /*
   * Compatibilidad con el despliegue antiguo del backend: mezcla presets con
   * las filas reales de CATALOGOS. Se reconoce el bloque completo del preset y
   * solo se retira cuando el mismo tipo también contiene opciones propias. Así
   * ESTADO, que actualmente coincide con su preset histórico, no pierde filas.
   */
  const legacyDefaults: Partial<Record<CatalogType, Set<string>>> = {
    CANAL: new Set(['WHATSAPP', 'LLAMADA', 'SITIO WEB']),
    RESULTADO: new Set(['SIN RESULTADO', 'INTERESADO', 'NO RESPONDE', 'REPROGRAMADO', 'CONVERTIDO', 'DESCARTADO']),
  };
  const pollutedTypes = new Set<CatalogType>();
  (Object.keys(legacyDefaults) as CatalogType[]).forEach((type) => {
    const defaults = legacyDefaults[type]!;
    const labels = items.filter((item) => item.tipo === type).map((item) => String(item.etiqueta || '').trim().toUpperCase());
    if ([...defaults].every((key) => labels.includes(key)) && labels.some((key) => !defaults.has(key))) pollutedTypes.add(type);
  });
  const seen = new Set<string>();
  return items.filter((item) => {
    const labelKey = String(item.etiqueta || '').trim().toUpperCase();
    if (pollutedTypes.has(item.tipo) && legacyDefaults[item.tipo]?.has(labelKey)) return false;
    const key = `${item.tipo}|${labelKey}`;
    if (!item.etiqueta || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Catálogos de la caché local, ya sin repetidos: es lo que pintan las vistas antes de que responda la nube. */
export function readCatalogCache(dni: string): CatalogItem[] {
  return uniqueCatalogs(readCrmCache<CatalogItem[]>(dni, CATALOG_CACHE_NAME, []));
}

export async function listCatalogs(dni: string): Promise<CatalogItem[]> {
  const data = uniqueCatalogs(await sharedRead<CatalogItem[]>('crmListCatalogs', dni));
  writeCache(dni, CATALOG_CACHE_NAME, data);
  return data;
}

export async function saveCatalog(dni: string, item: CatalogInput): Promise<CatalogItem> {
  return authenticatedRequest<CatalogItem>('crmSaveCatalog', dni, { item });
}

export async function deleteCatalog(dni: string, item: CatalogItem, forzar = false): Promise<CatalogDeleteResult> {
  return authenticatedRequest<CatalogDeleteResult>('crmDeleteCatalog', dni, { tipo: item.tipo, etiqueta: item.etiqueta, forzar });
}

export async function listProspects(dni: string, filters: Record<string, string> = {}): Promise<Prospect[]> {
  const fresh = await sharedRead<Prospect[]>('crmListProspects', dni, { filters });
  const data = fresh.map((prospect) => prospectWithInteractions(prospect, protectedCachedInteractions(readProspectDetailCache(dni, prospect.id))));
  writeCache(dni, 'prospects', data);
  return data;
}

export async function getProspect(dni: string, id: string): Promise<{ prospect: Prospect; interactions: Interaction[] }> {
  const fresh = await sharedRead<ProspectDetailData>('crmGetProspect', dni, { id });
  const cached = readProspectDetailCache(dni, id);
  const freshIds = new Set(fresh.interactions.map((item) => item.id));
  const protectedMissing = protectedCachedInteractions(cached).filter((item) => !freshIds.has(item.id));
  const interactions = mergeInteractions(fresh.interactions, protectedMissing);
  const data = { prospect: prospectWithInteractions(fresh.prospect, interactions), interactions };
  writeCache(dni, prospectDetailCacheName(id), { ...data, protectedIds: protectedMissing.map((item) => item.id), preserveUntil: protectedMissing.length ? cached.preserveUntil : 0 });
  updateCachedProspect(dni, data.prospect);
  return data;
}

export async function saveProspect(dni: string, prospect: ProspectInput): Promise<Prospect> {
  return authenticatedRequest<Prospect>('crmSaveProspect', dni, { prospect });
}

export async function addInteraction(dni: string, interaction: InteractionInput): Promise<{ prospect: Prospect; interaction: Interaction }> {
  const request = { ...interaction, requestId: interaction.requestId || `INT-WEB-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` };
  let saved: { prospect: Prospect; interaction: Interaction };
  try {
    saved = await authenticatedRequest<{ prospect: Prospect; interaction: Interaction }>('crmAddInteraction', dni, { interaction: request }, 45000);
  } catch (cause) {
    if (!isTimeoutError(cause)) throw cause;
    // Apps Script puede terminar la escritura después de que venza el navegador.
    // Repetir la misma requestId es seguro: el servidor devuelve la fila existente.
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    saved = await authenticatedRequest<{ prospect: Prospect; interaction: Interaction }>('crmAddInteraction', dni, { interaction: request }, 45000);
  }
  const cached = readProspectInteractionsCache(dni, interaction.prospectoId);
  writeCache(dni, prospectDetailCacheName(interaction.prospectoId), { prospect: saved.prospect, interactions: mergeInteractions([saved.interaction], cached), protectedIds: [saved.interaction.id], preserveUntil: Date.now() + RECENT_WRITE_GRACE_MS });
  updateCachedProspect(dni, saved.prospect);
  return saved;
}

/** Cambia únicamente la programación de la última interacción del prospecto. */
export async function rescheduleInteraction(dni: string, interactionId: string, proximoContacto: string): Promise<{ prospect: Prospect; interaction: Interaction }> {
  const saved = await authenticatedRequest<{ prospect: Prospect; interaction: Interaction }>('crmRescheduleInteraction', dni, { interactionId, proximoContacto });
  const cached = readProspectDetailCache(dni, saved.interaction.prospectoId);
  const interactions = (cached.interactions || []).map((item) => item.id === saved.interaction.id ? saved.interaction : item);
  writeCache(dni, prospectDetailCacheName(saved.interaction.prospectoId), { ...cached, prospect: saved.prospect, interactions });
  updateCachedProspect(dni, saved.prospect);
  return saved;
}

export async function convertProspect(dni: string, id: string, details: ConvertDetails): Promise<{ prospect: Prospect; client: Client; capturedInteraction: Interaction | null }> {
  const saved = await authenticatedRequest<{ prospect: Prospect; client: Client; capturedInteraction: Interaction | null }>('crmConvertProspect', dni, { id, details });
  const cached = readProspectDetailCache(dni, id);
  const interactions = saved.capturedInteraction
    ? (cached.interactions || []).map((item) => item.id === saved.capturedInteraction?.id ? saved.capturedInteraction : item)
    : (cached.interactions || []);
  writeCache(dni, prospectDetailCacheName(id), { ...cached, prospect: saved.prospect, interactions });
  updateCachedProspect(dni, saved.prospect);
  const clients = readCrmCache<Client[]>(dni, 'clients', []);
  writeCache(dni, 'clients', [saved.client, ...clients.filter((item) => item.id !== saved.client.id)]);
  return saved;
}

export async function convertProspectToClient(dni: string, id: string): Promise<{ prospect: Prospect; client: Client; clientInteraction: Interaction | null }> {
  const saved = await authenticatedRequest<{ prospect: Prospect; client: Client; clientInteraction: Interaction | null }>('crmConvertProspectToClient', dni, { id });
  const cached = readProspectDetailCache(dni, id);
  const interactions = saved.clientInteraction
    ? (cached.interactions || []).map((item) => item.id === saved.clientInteraction?.id ? saved.clientInteraction : item)
    : (cached.interactions || []);
  writeCache(dni, prospectDetailCacheName(id), { ...cached, prospect: saved.prospect, interactions });
  updateCachedProspect(dni, saved.prospect);
  const clients = readCrmCache<Client[]>(dni, 'clients', []);
  writeCache(dni, 'clients', [saved.client, ...clients.filter((item) => item.id !== saved.client.id)]);
  return saved;
}

export async function markProspectNoContinue(dni: string, id: string): Promise<{ prospect: Prospect; interaction: Interaction }> {
  const saved = await authenticatedRequest<{ prospect: Prospect; interaction: Interaction }>('crmMarkProspectNoContinue', dni, { id });
  const cached = readProspectDetailCache(dni, id);
  const interactions = mergeInteractions([saved.interaction], cached.interactions || []);
  writeCache(dni, prospectDetailCacheName(id), { ...cached, prospect: saved.prospect, interactions, protectedIds: [saved.interaction.id], preserveUntil: Date.now() + RECENT_WRITE_GRACE_MS });
  updateCachedProspect(dni, saved.prospect);
  return saved;
}

export async function restoreProspectStage(dni: string, id: string): Promise<{ prospect: Prospect; interaction: Interaction }> {
  const saved = await authenticatedRequest<{ prospect: Prospect; interaction: Interaction }>('crmRestoreProspectStage', dni, { id });
  const cached = readProspectDetailCache(dni, id);
  const interactions = mergeInteractions([saved.interaction], cached.interactions || []);
  writeCache(dni, prospectDetailCacheName(id), { ...cached, prospect: saved.prospect, interactions, protectedIds: [saved.interaction.id], preserveUntil: Date.now() + RECENT_WRITE_GRACE_MS });
  updateCachedProspect(dni, saved.prospect);
  return saved;
}

export async function reassignProspect(dni: string, id: string, agentDni: string): Promise<Prospect> {
  return authenticatedRequest('crmReassignProspect', dni, { id, agentDni });
}

export async function listClients(dni: string): Promise<Client[]> {
  const data = await sharedRead<Client[]>('crmListClients', dni);
  writeCache(dni, 'clients', data);
  return data;
}

function updateCachedClient(dni: string, client: Client): void {
  const cached = readCrmCache<Client[]>(dni, 'clients', []);
  const exists = cached.some((item) => item.id === client.id);
  writeCache(dni, 'clients', exists ? cached.map((item) => item.id === client.id ? client : item) : [client, ...cached]);
}

/**
 * Recupera el registro completo al abrir la ficha. El listado puede proceder de
 * una caché anterior o contener solo las columnas propias de CLIENTES; esta
 * lectura vuelve a unirlo con PROSPECTOS, donde viven los datos de captación.
 */
export async function getClient(dni: string, id: string): Promise<Client> {
  const client = await sharedRead<Client>('crmGetClient', dni, { id });
  updateCachedClient(dni, client);
  return client;
}

export async function saveClient(dni: string, client: Partial<Client> & { id: string }): Promise<Client> {
  const saved = await authenticatedRequest<Client>('crmSaveClient', dni, { client });
  updateCachedClient(dni, saved);
  return saved;
}

export async function dashboard(dni: string, from = '', to = '', cacheName = 'dashboard', force = false, agentDni = ''): Promise<DashboardData> {
  // Ambos bloques consumen la misma respuesta del servidor. La caché por
  // combinación se comparte para que repetir agente+rango abajo no duplique la
  // lectura que ya se hizo arriba (cacheName solo conserva la vista vigente).
  const rangeCacheName = `dashboard-${DASHBOARD_CACHE_SCHEMA}-range-${from || 'all'}-${to || 'all'}-${agentDni || 'all'}`;
  const cached = force ? null : readFreshCrmCache<DashboardData>(dni, rangeCacheName, DASHBOARD_RANGE_CACHE_MS);
  if (cached) {
    writeCache(dni, cacheName, cached);
    return cached;
  }
  const stale = readCrmCache<DashboardData | null>(dni, rangeCacheName, null);
  let data: DashboardData;
  try {
    data = await sharedRead<DashboardData>('crmDashboard', dni, { from, to, agentDni }, 45000);
  } catch (cause) {
    // Esta consulta solo lee. Ante un arranque frío que supere el tiempo del
    // navegador, reutilizar la copia de esta misma combinación es seguro; si
    // aún no existe, se reintenta una vez para aprovechar la caché del servidor.
    if (!isTimeoutError(cause)) throw cause;
    if (stale) return stale;
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    data = await sharedRead<DashboardData>('crmDashboard', dni, { from, to, agentDni }, 45000);
  }
  writeCache(dni, cacheName, data);
  writeCache(dni, rangeCacheName, data);
  return data;
}

export async function listAgents(dni: string): Promise<User[]> {
  return sharedRead<User[]>('crmListAgents', dni);
}

export async function exportProspects(dni: string, filters: Record<string, string> = {}): Promise<{ filename: string; csv: string }> {
  return authenticatedRequest('crmExportProspects', dni, { filters });
}

export async function saveProfile(dni: string, profile: { nombres: string; apellidos: string; correo?: string; celular?: string }): Promise<User> {
  return authenticatedRequest<User>('crmUpdateProfile', dni, { profile });
}

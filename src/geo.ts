/**
 * =========================================================================
 * GEOGRAFÍA EN CASCADA: PAÍS → DEPARTAMENTO → PROVINCIA → DISTRITO
 * =========================================================================
 * Alimenta los desplegables de la conversión a usuario captado. Dos fuentes
 * públicas y gratuitas, ninguna con clave ni registro:
 *
 * - **Perú** → `free.e-api.net.pe/ubigeos.json`: el ubigeo oficial completo
 *   (25 departamentos, 196 provincias, 1893 distritos) en una sola descarga de
 *   ~110 KB. Es la fuente buena para el país que más se usa aquí.
 * - **Resto de Latinoamérica** → `countriesnow.space`: estado/región y luego
 *   ciudad, dos niveles (esos países no tienen "provincia" intermedia).
 *
 * Por qué NO se usa countriesnow para Perú: su lista de "ciudades" de Lima no
 * trae Miraflores, San Juan de Lurigancho, Comas, San Borja, Barranco ni Villa
 * El Salvador —los distritos más buscados— y mezcla provincias con
 * urbanizaciones. Para el resto de países sí es correcta (Chile 16 regiones,
 * Colombia 32, México 32, Argentina 24…).
 *
 * Todo lo descargado se guarda en `localStorage`: la geografía no cambia, así
 * que a partir de la primera vez los desplegables funcionan sin conexión. Si la
 * descarga falla y no hay copia, quien llame a estas funciones debe dejar
 * escribir el valor a mano —convertir un prospecto nunca puede depender de que
 * un servicio de terceros esté en pie—.
 */

export interface CountryOption {
  /** ISO-2, lo que se guarda en la hoja. */
  code: string;
  nombre: string;
  /** Nombre en inglés que espera countriesnow.space. */
  api: string;
}

/** Perú primero por ser el caso habitual; el resto en orden alfabético. */
export const COUNTRIES: CountryOption[] = [
  { code: 'PE', nombre: 'Perú', api: 'Peru' },
  { code: 'AR', nombre: 'Argentina', api: 'Argentina' },
  { code: 'BO', nombre: 'Bolivia', api: 'Bolivia' },
  { code: 'BR', nombre: 'Brasil', api: 'Brazil' },
  { code: 'CL', nombre: 'Chile', api: 'Chile' },
  { code: 'CO', nombre: 'Colombia', api: 'Colombia' },
  { code: 'CR', nombre: 'Costa Rica', api: 'Costa Rica' },
  { code: 'CU', nombre: 'Cuba', api: 'Cuba' },
  { code: 'EC', nombre: 'Ecuador', api: 'Ecuador' },
  { code: 'SV', nombre: 'El Salvador', api: 'El Salvador' },
  { code: 'GT', nombre: 'Guatemala', api: 'Guatemala' },
  { code: 'HN', nombre: 'Honduras', api: 'Honduras' },
  { code: 'HT', nombre: 'Haití', api: 'Haiti' },
  { code: 'MX', nombre: 'México', api: 'Mexico' },
  { code: 'NI', nombre: 'Nicaragua', api: 'Nicaragua' },
  { code: 'PA', nombre: 'Panamá', api: 'Panama' },
  { code: 'PY', nombre: 'Paraguay', api: 'Paraguay' },
  { code: 'DO', nombre: 'República Dominicana', api: 'Dominican Republic' },
  { code: 'UY', nombre: 'Uruguay', api: 'Uruguay' },
  { code: 'VE', nombre: 'Venezuela', api: 'Venezuela' },
];

/** Perú es el país por defecto de toda alta. */
export const DEFAULT_COUNTRY = 'PE';

export const countryName = (code: string): string => COUNTRIES.find((row) => row.code === code)?.nombre || code;
const apiName = (code: string): string => COUNTRIES.find((row) => row.code === code)?.api || code;

/**
 * Cómo se llama cada nivel en el país elegido. Perú tiene tres niveles
 * (departamento → provincia → distrito); los demás, dos.
 */
export interface GeoLevels { region: string; province: string; district: string; hasProvince: boolean }

export function levelsFor(code: string): GeoLevels {
  if (code === 'PE') return { region: 'Departamento', province: 'Provincia', district: 'Distrito', hasProvince: true };
  return { region: 'Departamento / Estado', province: '', district: 'Ciudad / Distrito', hasProvince: false };
}

/* ─── Caché local: la geografía no cambia, se guarda y ya ─── */
const CACHE_PREFIX = 'loginapp_geo_v1_';

function readCache<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + key) || 'null') as T | null; }
  catch { return null; }
}

function writeCache(key: string, value: unknown): void {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)); } catch { /* almacenamiento lleno o no disponible */ }
}

/** Descarga JSON con un tope de espera: un desplegable no puede colgar el formulario. */
async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}

const sortEs = (values: string[]): string[] => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

/* ─── Perú: el árbol completo del ubigeo, en una sola descarga ─── */
type UbigeoTree = Record<string, Record<string, Record<string, unknown>>>;
const PERU_URL = 'https://free.e-api.net.pe/ubigeos.json';

let peruPromise: Promise<UbigeoTree> | null = null;

/** Una sola descarga por sesión aunque el formulario pida varios niveles a la vez. */
function peruTree(): Promise<UbigeoTree> {
  if (peruPromise) return peruPromise;
  const cached = readCache<UbigeoTree>('PE');
  if (cached) { peruPromise = Promise.resolve(cached); return peruPromise; }
  peruPromise = getJson(PERU_URL).then((data) => {
    const tree = data as UbigeoTree;
    if (!tree || typeof tree !== 'object' || !Object.keys(tree).length) throw new Error('Respuesta de ubigeo vacía.');
    writeCache('PE', tree);
    return tree;
  }).catch((cause) => { peruPromise = null; throw cause; });
  return peruPromise;
}

/* ─── Resto de países: countriesnow.space ─── */
const CN_BASE = 'https://countriesnow.space/api/v0.1/countries';

async function countriesNowStates(code: string): Promise<string[]> {
  const key = `states_${code}`;
  const cached = readCache<string[]>(key);
  if (cached) return cached;
  const data = await getJson(`${CN_BASE}/states/q?country=${encodeURIComponent(apiName(code))}`) as { data?: { states?: { name: string }[] } };
  const states = sortEs((data?.data?.states || []).map((row) => row.name));
  if (states.length) writeCache(key, states);
  return states;
}

async function countriesNowCities(code: string, state: string): Promise<string[]> {
  const key = `cities_${code}_${state}`;
  const cached = readCache<string[]>(key);
  if (cached) return cached;
  const data = await getJson(`${CN_BASE}/state/cities/q?country=${encodeURIComponent(apiName(code))}&state=${encodeURIComponent(state)}`) as { data?: string[] };
  const cities = sortEs(data?.data || []);
  if (cities.length) writeCache(key, cities);
  return cities;
}

/* ─── Lo que consume el formulario ─── */

/** Departamentos (Perú) o estados/regiones (resto). */
export async function loadRegions(code: string): Promise<string[]> {
  if (code === 'PE') return sortEs(Object.keys(await peruTree()));
  return countriesNowStates(code);
}

/** Provincias del departamento. Solo Perú tiene este nivel; el resto devuelve vacío. */
export async function loadProvinces(code: string, region: string): Promise<string[]> {
  if (code !== 'PE' || !region) return [];
  const tree = await peruTree();
  return sortEs(Object.keys(tree[region] || {}));
}

/** Distritos de la provincia (Perú) o ciudades del estado (resto). */
export async function loadDistricts(code: string, region: string, province: string): Promise<string[]> {
  if (!region) return [];
  if (code !== 'PE') return countriesNowCities(code, region);
  if (!province) return [];
  const tree = await peruTree();
  return sortEs(Object.keys(tree[region]?.[province] || {}));
}

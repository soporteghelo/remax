/**
 * =========================================================================
 * CONFIGURACIÓN GENERAL DE LA APP
 * =========================================================================
 * Catálogo de los ajustes que un administrador edita desde el módulo
 * "Configuración de la app". Cada clave vive en una fila de la pestaña
 * CONFIGURACION de la misma hoja de cálculo.
 *
 * Este archivo replica `APP_SETTINGS` de `apps-script/Code.gs`: al añadir un
 * ajuste hay que declararlo en ambos lados. Aquí viven además las etiquetas en
 * español, el orden de la vista y la traducción de los colores a tokens CSS.
 *
 * No importa nada de `api.ts` a propósito: `api.ts` sí importa de aquí, y el
 * sentido único evita un ciclo entre ambos módulos.
 */

export type SettingType = 'text' | 'color' | 'boolean' | 'select';
export type SettingGroupId = 'identidad' | 'acceso' | 'colores' | 'comportamiento';

export interface SettingDef {
  key: string;
  label: string;
  /** Descripción de una línea bajo el campo */
  hint: string;
  type: SettingType;
  /** Valor por defecto: el mismo que crea el servidor en la hoja */
  def: string;
  group: SettingGroupId;
  /** Solo para `select` */
  options?: { value: string; label: string }[];
  maxLength?: number;
  /** Texto guía cuando el campo es opcional y está vacío */
  placeholder?: string;
}

export interface SettingGroup {
  id: SettingGroupId;
  title: string;
  hint: string;
  /** Ligadura de Material Symbols */
  icon: string;
  /** Clase de tono (.ds-tone-*) del sistema de diseño */
  tone: string;
}

export const SETTING_GROUPS: SettingGroup[] = [
  { id: 'identidad', title: 'Identidad', hint: 'Cómo se llama y se identifica la aplicación', icon: 'badge', tone: 'ds-tone-primary' },
  { id: 'acceso', title: 'Pantalla de acceso', hint: 'Textos que ve quien todavía no inicia sesión', icon: 'login', tone: 'ds-tone-slate' },
  { id: 'colores', title: 'Colores', hint: 'Se aplican al instante en toda la interfaz', icon: 'palette', tone: 'ds-tone-violet' },
  { id: 'comportamiento', title: 'Comportamiento', hint: 'Valores con los que arranca cada dispositivo', icon: 'tune', tone: 'ds-tone-amber' },
];

export const SETTING_DEFS: SettingDef[] = [
  { key: 'appName', group: 'identidad', type: 'text', def: 'Portal Seguro', maxLength: 40, label: 'Nombre de la aplicación', hint: 'Barra superior y pestaña del navegador.' },
  { key: 'appShortName', group: 'identidad', type: 'text', def: 'PS', maxLength: 3, label: 'Sigla de marca', hint: 'De 1 a 3 letras para el distintivo del acceso.' },
  { key: 'appVersion', group: 'identidad', type: 'text', def: 'Portal v1.0.0', maxLength: 24, label: 'Versión', hint: 'Se muestra en el pie del menú lateral.' },
  { key: 'organization', group: 'identidad', type: 'text', def: '', maxLength: 60, label: 'Organización', hint: 'Opcional. Acompaña a la versión y a la pantalla de acceso.', placeholder: 'Nombre de tu organización' },
  { key: 'supportContact', group: 'identidad', type: 'text', def: '', maxLength: 80, label: 'Contacto de soporte', hint: 'Opcional. Se ofrece a quien no puede ingresar.', placeholder: 'correo o teléfono' },

  { key: 'loginEyebrow', group: 'acceso', type: 'text', def: 'PORTAL SEGURO', maxLength: 30, label: 'Etiqueta superior', hint: 'Texto corto sobre el título del acceso.' },
  { key: 'loginTitle', group: 'acceso', type: 'text', def: 'Bienvenido', maxLength: 40, label: 'Título', hint: 'Encabezado de la tarjeta de acceso.' },
  { key: 'loginSubtitle', group: 'acceso', type: 'text', def: 'Ingresa con tus credenciales para continuar.', maxLength: 120, label: 'Mensaje', hint: 'Una línea bajo el título.' },

  { key: 'primaryColor', group: 'colores', type: 'color', def: '#000666', label: 'Primario (tema claro)', hint: 'Botones, enlaces activos y anillo de foco.' },
  { key: 'primaryColorDark', group: 'colores', type: 'color', def: '#bdc2ff', label: 'Primario (tema oscuro)', hint: 'En oscuro el primario se aclara, no se invierte.' },
  { key: 'brandGradientStart', group: 'colores', type: 'color', def: '#000666', label: 'Degradado: inicio', hint: 'Cabecera del menú lateral y botón principal.' },
  { key: 'brandGradientEnd', group: 'colores', type: 'color', def: '#283593', label: 'Degradado: fin', hint: 'Extremo del mismo degradado de marca.' },

  {
    key: 'defaultTheme', group: 'comportamiento', type: 'select', def: 'light', label: 'Tema inicial',
    hint: 'Solo afecta a dispositivos que aún no eligieron uno.',
    options: [{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }],
  },
  { key: 'showConnectionStatus', group: 'comportamiento', type: 'boolean', def: 'true', label: 'Indicador de conexión', hint: 'Muestra Online/Offline en la barra superior.' },
];

export type AppSettings = Record<string, string>;

export const DEFAULT_SETTINGS: AppSettings = Object.fromEntries(SETTING_DEFS.map((def) => [def.key, def.def]));

/** Valor de un ajuste de texto; un campo vacío recupera su valor por defecto. */
export function settingText(settings: AppSettings, key: string): string {
  return (settings[key] ?? '').trim() || DEFAULT_SETTINGS[key] || '';
}

export const settingOn = (settings: AppSettings, key: string): boolean => settings[key] === 'true';

/**
 * Deja la respuesta del servidor (o un borrador local) en un mapa completo y del
 * tipo correcto. Se descarta cualquier clave desconocida y cualquier valor que
 * no encaje con su tipo, de modo que la interfaz nunca recibe un color roto.
 */
export function normalizeSettings(raw: Record<string, unknown> | null | undefined): AppSettings {
  const settings: AppSettings = { ...DEFAULT_SETTINGS };
  for (const def of SETTING_DEFS) {
    const value = raw?.[def.key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (def.type === 'color') {
      if (/^#[0-9a-f]{6}$/i.test(text)) settings[def.key] = text.toLowerCase();
    } else if (def.type === 'boolean') {
      settings[def.key] = text.toLowerCase() === 'true' ? 'true' : 'false';
    } else if (def.type === 'select') {
      if (def.options?.some((option) => option.value === text)) settings[def.key] = text;
    } else {
      settings[def.key] = text.slice(0, def.maxLength ?? 120);
    }
  }
  return settings;
}

export const settingsEqual = (a: AppSettings, b: AppSettings): boolean =>
  SETTING_DEFS.every((def) => (a[def.key] ?? '') === (b[def.key] ?? ''));

/* ─── Caché local: sirve la configuración sin conexión y antes del primer pintado ─── */

/** También lo lee el script de [index.html](../index.html) para evitar el destello de marca. */
export const SETTINGS_CACHE_KEY = 'loginapp_app_settings';

export interface SettingsCache { settings: AppSettings; lastSync: string }

export function readSettingsCache(): SettingsCache {
  try {
    const cached = JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY) || 'null') as Partial<SettingsCache> | null;
    return { settings: normalizeSettings(cached?.settings), lastSync: cached?.lastSync ?? '' };
  } catch {
    localStorage.removeItem(SETTINGS_CACHE_KEY);
    return { settings: { ...DEFAULT_SETTINGS }, lastSync: '' };
  }
}

export function writeSettingsCache(settings: AppSettings, lastSync = new Date().toISOString()): void {
  try { localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({ settings, lastSync })); }
  catch { /* almacenamiento no disponible */ }
}

/* ─── Contraste: el sistema de diseño exige 4.5:1 en ambos temas ─── */

const channel = (hex: string, offset: number): number => parseInt(hex.slice(offset, offset + 2), 16) / 255;

function luminance(hex: string): number {
  const linear = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(channel(hex, 1)) + 0.7152 * linear(channel(hex, 3)) + 0.0722 * linear(channel(hex, 5));
}

/** Razón de contraste WCAG entre dos colores `#rrggbb`. */
export function contrastRatio(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** Texto legible sobre un fondo del color dado: blanco o casi negro, el que más contraste. */
export const onColorFor = (hex: string): string => (contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#101014') ? '#ffffff' : '#101014');

/** Punto medio de dos colores: representa el degradado a la hora de elegir su texto. */
function midColor(from: string, to: string): string {
  const mix = (offset: number) => Math.round((channel(from, offset) + channel(to, offset)) * 127.5).toString(16).padStart(2, '0');
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

/**
 * Traduce los colores configurados a los tokens `--brand-*` que
 * `design-system.css` consume. Se escriben en el elemento raíz, así que valen
 * para los dos temas a la vez: el CSS decide cuál usar según `data-theme`.
 */
export function applySettings(settings: AppSettings): void {
  const root = document.documentElement;
  const primary = settingText(settings, 'primaryColor');
  const primaryDark = settingText(settings, 'primaryColorDark');
  root.style.setProperty('--brand-primary', primary);
  root.style.setProperty('--brand-primary-dark', primaryDark);
  root.style.setProperty('--brand-on-primary', onColorFor(primary));
  root.style.setProperty('--brand-on-primary-dark', onColorFor(primaryDark));
  const from = settingText(settings, 'brandGradientStart');
  const to = settingText(settings, 'brandGradientEnd');
  root.style.setProperty('--brand-gradient-from', from);
  root.style.setProperty('--brand-gradient-to', to);
  root.style.setProperty('--brand-on-gradient', onColorFor(midColor(from, to)));

  document.title = settingText(settings, 'appName');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', primary);
}

/** Tema con el que abre un dispositivo que todavía no eligió uno. */
export const configuredTheme = (settings: AppSettings): 'light' | 'dark' => (settings.defaultTheme === 'dark' ? 'dark' : 'light');

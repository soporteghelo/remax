/** Configuración del módulo de login. */
const APPS_SCRIPT_URL = (import.meta as any).env?.VITE_APPS_SCRIPT_URL || '';

export const APP_CONFIG = {
  name: 'Mi App',
  storage: {
    prefix: 'miapp_',
    keys: { session: 'user_session' },
  },
} as const;

export const APPS_SCRIPT_CONFIG = { url: APPS_SCRIPT_URL } as const;

export function getStorageKey(key: string): string {
  return `${APP_CONFIG.storage.prefix}${key}`;
}

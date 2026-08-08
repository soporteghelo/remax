import { useCallback, useEffect, useState } from 'react';
import { configuredTheme, readSettingsCache } from './settings';

/**
 * Modelo de navegación compartido: el drawer, el footer y el panel principal
 * leen de aquí. Añadir un módulo es añadir una entrada a MODULES.
 */
export type SectionId = 'home' | 'admin' | 'settings' | 'profile';

export interface NavItem {
  id: SectionId;
  /** Nombre completo — drawer y panel principal */
  label: string;
  /** Nombre corto — footer de navegación */
  short: string;
  /** Descripción de una línea — panel principal */
  hint: string;
  /** Ligadura de Material Symbols */
  icon: string;
  /** Clase de tono (.ds-tone-*) del sistema de diseño */
  tone: string;
  adminOnly?: boolean;
  /** Aparece en el footer de navegación */
  inFooter?: boolean;
}

/** Destinos visibles antes de "Ver más módulos" en el drawer. */
export const DRAWER_VISIBLE_MODULES = 5;

export const MODULES: NavItem[] = [
  { id: 'home', label: 'Panel principal', short: 'Inicio', hint: 'Resumen de tu sesión', icon: 'dashboard', tone: 'ds-tone-primary', inFooter: true },
  { id: 'admin', label: 'Administración de usuarios', short: 'Usuarios', hint: 'Altas y sincronización', icon: 'manage_accounts', tone: 'ds-tone-violet', adminOnly: true, inFooter: true },
  { id: 'settings', label: 'Configuración de la app', short: 'Ajustes', hint: 'Identidad, colores y arranque', icon: 'tune', tone: 'ds-tone-amber', adminOnly: true },
  { id: 'profile', label: 'Mi perfil', short: 'Perfil', hint: 'Datos de tu cuenta', icon: 'account_circle', tone: 'ds-tone-slate', inFooter: true },
];

export const moduleList = (isAdmin: boolean): NavItem[] => MODULES.filter((item) => !item.adminOnly || isAdmin);

/** Un destino solo es válido si el rol en curso lo tiene disponible. */
export const resolveSection = (section: SectionId, isAdmin: boolean): SectionId =>
  (moduleList(isAdmin).some((item) => item.id === section) ? section : 'home');

/** El destino principal queda al centro, como en el footer de MOTOR. */
export function footerItems(isAdmin: boolean): NavItem[] {
  const items = moduleList(isAdmin).filter((item) => item.inFooter);
  const home = items.find((item) => item.id === 'home');
  if (!home || items.length !== 3) return items;
  return [items.find((item) => item.id === 'admin')!, home, items.find((item) => item.id === 'profile')!];
}

/* ─── Tema claro/oscuro (persistente, emparejado con los tokens --ds-*) ─── */
export type Theme = 'light' | 'dark';
const THEME_KEY = 'pwa_theme';

/**
 * Preferencia guardada en este dispositivo. Si aún no eligió tema, manda el
 * `defaultTheme` de la configuración de la app (mismo criterio que el script de
 * index.html, que lo aplica antes del primer pintado).
 */
export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return configuredTheme(readSettingsCache().settings);
  } catch { return 'light'; }
}

/**
 * Solo se guarda la preferencia cuando alguien pulsa el botón de tema: mientras
 * nadie lo haga, el dispositivo sigue al `defaultTheme` configurado por el
 * administrador y refleja sus cambios.
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  const toggle = useCallback(() => setTheme((current) => {
    const next = current === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch { /* almacenamiento no disponible */ }
    return next;
  }), []);
  return [theme, toggle];
}

/* ─── Estado de conexión (indicador de la barra superior y del drawer) ─── */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online;
}

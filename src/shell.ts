import { useCallback, useEffect, useState } from 'react';
import { configuredTheme, readSettingsCache } from './settings';

/**
 * Modelo de navegación compartido: el drawer, el footer y el panel principal
 * leen de aquí. Añadir un módulo es añadir una entrada a MODULES.
 */
export type SectionId = 'home' | 'prospects' | 'agenda' | 'clients' | 'team' | 'catalogs' | 'settings' | 'profile';

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
  { id: 'home', label: 'Panel principal', short: 'Inicio', hint: 'Indicadores y actividad comercial', icon: 'dashboard', tone: 'ds-tone-primary', inFooter: true },
  { id: 'prospects', label: 'Prospectos', short: 'Prospectos', hint: 'Captación y seguimiento de oportunidades', icon: 'person_search', tone: 'ds-tone-violet', inFooter: true },
  { id: 'agenda', label: 'Agenda', short: 'Agenda', hint: 'Seguimientos vencidos y próximos', icon: 'event', tone: 'ds-tone-amber', inFooter: true },
  { id: 'clients', label: 'Clientes', short: 'Clientes', hint: 'Cartera comercial convertida', icon: 'groups', tone: 'ds-tone-teal', inFooter: true },
  { id: 'team', label: 'Equipo', short: 'Equipo', hint: 'Usuarios, roles y accesos', icon: 'manage_accounts', tone: 'ds-tone-violet', adminOnly: true },
  { id: 'catalogs', label: 'Catálogos', short: 'Catálogos', hint: 'Canales, medios, estados y resultados', icon: 'category', tone: 'ds-tone-teal', adminOnly: true },
  { id: 'settings', label: 'Configuración', short: 'Ajustes', hint: 'Identidad, colores y arranque', icon: 'tune', tone: 'ds-tone-amber', adminOnly: true },
  { id: 'profile', label: 'Mi perfil', short: 'Perfil', hint: 'Datos de tu cuenta', icon: 'account_circle', tone: 'ds-tone-slate' },
];

export const moduleList = (isAdmin: boolean): NavItem[] => MODULES.filter((item) => !item.adminOnly || isAdmin);

/** Un destino solo es válido si el rol en curso lo tiene disponible. */
export const resolveSection = (section: SectionId, isAdmin: boolean): SectionId =>
  (moduleList(isAdmin).some((item) => item.id === section) ? section : 'home');

/** El destino principal queda al centro, como en el footer de MOTOR. */
export function footerItems(isAdmin: boolean): NavItem[] {
  return moduleList(isAdmin).filter((item) => item.inFooter);
}

/* ─── Tema claro/oscuro (persistente, emparejado con los tokens --ds-*) ─── */
export type Theme = 'light' | 'dark';
const THEME_KEY = 'pwa_theme';

/**
 * Preferencia guardada en este dispositivo. Si aún no eligió tema, manda el
 * `defaultTheme` de la configuración de la app (mismo criterio que el script de
 * index.html, que lo aplica antes del primer pintado).
 */
function readTheme(): Theme {
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

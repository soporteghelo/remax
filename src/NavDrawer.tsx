import { RefObject, useEffect, useRef, useState } from 'react';
import { DRAWER_VISIBLE_MODULES, moduleList, type NavItem, type SectionId } from './shell';
import { settingText, type AppSettings } from './settings';
import type { User } from './api';

interface Props {
  open: boolean;
  /** En escritorio la navegación forma parte del marco, no un diálogo superpuesto. */
  persistent: boolean;
  user: User;
  /** Identidad configurable de la app: versión y organización del pie */
  settings: AppSettings;
  isAdmin: boolean;
  section: SectionId;
  online: boolean;
  /** Recibe el foco al cerrar el panel (escape-routes / focus-management). */
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onNavigate: (section: SectionId) => void;
  onLogout: () => void;
}

export default function NavDrawer({ open, persistent, user, settings, isAdmin, section, online, menuButtonRef, onClose, onNavigate, onLogout }: Props) {
  const [expanded, setExpanded] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const firstLinkRef = useRef<HTMLButtonElement>(null);
  const modules = moduleList(isAdmin);
  // Cada apertura inicia con los destinos principales y evita un menú largo.
  const visible = expanded ? modules : modules.slice(0, DRAWER_VISIBLE_MODULES);
  const hasMore = modules.length > DRAWER_VISIBLE_MODULES;
  const initial = `${user.nombres.charAt(0)}${user.apellidos.charAt(0)}`.toUpperCase() || 'U';

  useEffect(() => {
    // Cerrado sigue en el DOM para conservar la animación de salida: `inert` lo
    // saca del recorrido de teclado y del árbol de accesibilidad.
    drawerRef.current?.toggleAttribute('inert', !open && !persistent);
    if (!open && !persistent) { setExpanded(false); return; }
    if (persistent) return;
    // Foco al primer destino del menú (lector de pantalla y teclado)
    const focus = setTimeout(() => firstLinkRef.current?.focus({ preventScroll: true }), 120);
    // escape-routes: Escape cierra el panel lateral (patrón esperado en diálogos)
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => { clearTimeout(focus); document.removeEventListener('keydown', onKeyDown); };
  }, [open, persistent, onClose]);

  const close = () => {
    if (!persistent) onClose();
    menuButtonRef.current?.focus({ preventScroll: true });
  };
  const go = (id: SectionId) => {
    if (!persistent) onClose();
    onNavigate(id);
  };

  const link = (item: NavItem, index: number) => (
    <button
      key={item.id}
      type="button"
      ref={index === 0 ? firstLinkRef : undefined}
      className={`drawer-nav-link ${section === item.id ? 'active' : ''}`}
      aria-current={section === item.id ? 'page' : undefined}
      onClick={() => go(item.id)}
    >
      <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
      <span className="drawer-link-label">{item.label}</span>
    </button>
  );

  return (
    <>
      {!persistent && <button
        type="button"
        className={`nav-overlay ${open ? 'overlay-visible' : ''}`}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        aria-label="Cerrar menú de navegación"
        onClick={close}
      />}
      <aside ref={drawerRef} id="nav-drawer" className={`nav-drawer ${open ? 'drawer-open' : ''} ${persistent ? 'drawer-persistent' : ''}`} role={persistent ? undefined : 'dialog'} aria-modal={persistent ? undefined : true} aria-label="Menú de navegación">

        {/* ═══ Cabecera: perfil con degradado de marca ═══ */}
        <div className="drawer-head">
          <div className="drawer-head-pattern" aria-hidden="true" />
          {!persistent && <button type="button" className="drawer-close" onClick={close} title="Cerrar menú" aria-label="Cerrar menú">
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>}
          <div className="drawer-profile">
            <div className="drawer-avatar" aria-hidden="true">{initial}</div>
            <div className="drawer-username">{`${user.nombres} ${user.apellidos}`.trim() || 'Usuario'}</div>
            <div className="drawer-email">DNI: {user.dni}</div>
            <div className="drawer-role">
              <span className="material-symbols-outlined" aria-hidden="true">verified</span>
              <span>{isAdmin ? 'Administrador' : 'Usuario'}</span>
            </div>
            <button type="button" className="drawer-profile-link" onClick={() => go('profile')}>
              <span className="material-symbols-outlined" aria-hidden="true">account_circle</span>
              Ver mi perfil
            </button>
          </div>
        </div>

        {/* ═══ Navegación: cada destino lleva icono Y texto; el activo usa aria-current ═══ */}
        <nav className="drawer-nav" aria-label="Navegación principal">
          <div className="drawer-group-title">Módulos</div>
          {visible.map(link)}
          {hasMore && (
            <button type="button" className="drawer-nav-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
              <span className="material-symbols-outlined" aria-hidden="true">{expanded ? 'expand_less' : 'expand_more'}</span>
              <span>{expanded ? 'Ver menos módulos' : 'Ver más módulos'}</span>
            </button>
          )}

          {/* destructive-nav-separation: cerrar sesión, separado del resto */}
          <div className="drawer-divider" />
          <button type="button" className="drawer-nav-link is-destructive" onClick={() => { if (!persistent) onClose(); onLogout(); }}>
            <span className="material-symbols-outlined" aria-hidden="true">logout</span>
            <span className="drawer-link-label">Cerrar sesión</span>
          </button>
        </nav>

        {/* ═══ Pie: estado del sistema ═══ */}
        <div className="drawer-foot">
          <div className="drawer-status">
            <span className={`drawer-status-dot ${online ? '' : 'offline'}`} aria-hidden="true" />
            <span className="drawer-status-text">{online ? 'Sistema Online' : 'Sin conexión'}</span>
          </div>
          <span className="drawer-version">{[settings.organization?.trim(), settingText(settings, 'appVersion')].filter(Boolean).join(' · ')}</span>
        </div>

      </aside>
    </>
  );
}

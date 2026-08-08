import { footerItems, type SectionId } from './shell';

/**
 * Footer de navegación persistente (portado de MOTOR: .main-footer).
 * Icono + texto en cada destino, área táctil ≥ 44px y estado activo teñido.
 */
export default function AppFooter({ isAdmin, section, onNavigate }: { isAdmin: boolean; section: SectionId; onNavigate: (section: SectionId) => void }) {
  return (
    <footer className="main-footer" aria-label="Navegación rápida">
      {footerItems(isAdmin).map((item) => (
        <button
          key={item.id}
          type="button"
          className={`footer-nav-button ${section === item.id ? 'is-active' : ''}`}
          data-footer-view={item.id}
          aria-current={section === item.id ? 'page' : undefined}
          aria-label={`Ir a ${item.label}`}
          onClick={() => onNavigate(item.id)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
          <span>{item.short}</span>
        </button>
      ))}
    </footer>
  );
}

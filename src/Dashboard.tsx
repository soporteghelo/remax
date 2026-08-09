import type { User } from './api';
import { moduleList, type SectionId } from './shell';

/**
 * =========================================================================
 * PANEL PRINCIPAL — Disposición por prioridad operativa
 * =========================================================================
 * Inicio compacto: contexto de sesión y accesos directos a los módulos.
 */
const greetingFor = (hour: number) => (hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches');

export default function Dashboard({ user, isAdmin, onNavigate }: { user: User; isAdmin: boolean; onNavigate: (section: SectionId) => void }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  const userName = user.nombres || 'usuario';
  const roleLabel = isAdmin ? 'Administrador' : 'Usuario';
  // Inicio, Usuarios y Perfil ya viven en el footer. Aquí solo queda el acceso
  // administrativo que no tiene un botón permanente abajo.
  const shortcuts = moduleList(isAdmin).filter((item) => item.id === 'settings');

  return (
    <div className="dash">

      <div className="dash-context">
        <div style={{ minWidth: 0 }}>
          <h1 className="dash-greeting">{greetingFor(now.getHours())}, {userName}</h1>
          <p className="dash-meta">{dateStr} · {roleLabel}</p>
        </div>
      </div>

      {shortcuts.length > 0 && <section className="dash-section" aria-labelledby="dash-modules-title">
        <h2 className="ds-section-title" id="dash-modules-title">Ir a un módulo</h2>
        <div className="ds-grid ds-grid-mod">
          {shortcuts.map((item) => (
            <button key={item.id} type="button" className="ds-mod" onClick={() => onNavigate(item.id)}>
              <span className={`ds-mod-ico ${item.tone}`}>
                <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
              </span>
              <span className="ds-mod-txt">
                <span className="ds-mod-name">{item.label}</span>
                <span className="ds-mod-hint">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </section>}

    </div>
  );
}

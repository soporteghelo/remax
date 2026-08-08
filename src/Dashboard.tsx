import { useMemo, useState } from 'react';
import { readUsersCache, type User } from './api';
import { moduleList, type SectionId } from './shell';

/**
 * =========================================================================
 * PANEL PRINCIPAL — Disposición por prioridad operativa
 * =========================================================================
 * Sistema de diseño: "Data-Dense Dashboard" (design-system/portal-pwa/MASTER.md)
 *
 * Orden de lectura (patrón F / content-priority):
 *   1. Contexto — quién soy y qué tan fresco es el dato (franja delgada)
 *   2. Estado   — indicadores operativos; cada uno navega al módulo que los explica
 *   3. Atención — lo accionable primero
 *   4. Accesos  — navegación pura, sin repetir métricas
 *
 * Cada dato aparece UNA vez.
 */
type Severity = 'crit' | 'high' | 'med' | 'ok' | 'neutral';
interface Alert { severity: Severity; icon: string; chip: string; text: string; target?: SectionId }

const greetingFor = (hour: number) => (hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches');
const percent = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : '—');

export default function Dashboard({ user, isAdmin, online, onNavigate }: { user: User; isAdmin: boolean; online: boolean; onNavigate: (section: SectionId) => void }) {
  const [cache, setCache] = useState(() => readUsersCache(user.dni));
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());
  const refresh = () => { setCache(readUsersCache(user.dni)); setRefreshedAt(new Date()); };

  const now = new Date();
  const dateStr = now.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  const userName = user.nombres || 'usuario';
  const roleLabel = isAdmin ? 'Administrador' : 'Usuario';

  const users = cache.users.length ? cache.users : [user];
  const admins = users.filter((row) => row.tipoUsuario === 'ADMINISTRADOR').length;

  const alerts = useMemo<Alert[]>(() => {
    const list: Alert[] = [];
    if (!import.meta.env.VITE_APPS_SCRIPT_URL) list.push({ severity: 'high', icon: 'key_off', chip: 'Config', text: 'Falta VITE_APPS_SCRIPT_URL en el archivo .env: no se puede consultar la base de datos.' });
    if (!online) list.push({ severity: 'med', icon: 'cloud_off', chip: 'Offline', text: 'Sin conexión. Se muestran los datos guardados en este dispositivo.' });
    if (isAdmin && !cache.lastSync) list.push({ severity: 'med', icon: 'sync_problem', chip: 'Pendiente', text: 'Aún no has sincronizado usuarios. Abre el módulo y confirma tu contraseña.', target: 'admin' });
    if (!list.length) list.push({ severity: 'ok', icon: 'task_alt', chip: 'Al día', text: isAdmin ? 'Sin pendientes: la base local está sincronizada.' : 'Acceso habilitado. Tu sesión se mantiene al recargar la página.' });
    return list;
  }, [cache.lastSync, isAdmin, online]);

  return (
    <div className="dash">

      {/* ═══ 1. CONTEXTO — una franja, no un banner ═══ */}
      <div className="dash-context">
        <div style={{ minWidth: 0 }}>
          <h1 className="dash-greeting">{greetingFor(now.getHours())}, {userName}</h1>
          <p className="dash-meta">{dateStr} · {roleLabel}</p>
        </div>
        <div className="dash-context-actions">
          <span className="dash-updated">Actualizado {refreshedAt.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>
          <button type="button" className="dash-refresh" onClick={refresh} aria-label="Actualizar indicadores del panel">
            <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
            Actualizar
          </button>
        </div>
      </div>

      {/* ═══ 2. ESTADO — solo para quien administra usuarios ═══ */}
      {isAdmin && (
        <section className="dash-section" aria-labelledby="dash-state-title">
          <h2 className="ds-section-title" id="dash-state-title">Estado de las cuentas</h2>
          <div className="ds-grid ds-grid-kpi">
            <Kpi icon="group" tone="ds-tone-primary" value={users.length} label="Usuarios en caché" onClick={() => onNavigate('admin')} />
            <Kpi icon="admin_panel_settings" tone="ds-tone-violet" value={admins} label="Administradores" share={percent(admins, users.length)} onClick={() => onNavigate('admin')} />
            <Kpi icon="badge" tone="ds-tone-slate" value={users.length - admins} label="Usuarios estándar" share={percent(users.length - admins, users.length)} onClick={() => onNavigate('admin')} />
          </div>
          <p className="dash-meta" style={{ marginTop: 8, paddingLeft: 4 }}>
            Última sincronización: {cache.lastSync ? new Date(cache.lastSync).toLocaleString('es-PE') : 'aún no sincronizado'}
          </p>
        </section>
      )}

      {/* ═══ 3. ATENCIÓN — lo accionable primero ═══ */}
      <section className="dash-section" aria-labelledby="dash-alerts-title">
        <h2 className="ds-section-title" id="dash-alerts-title">Requiere atención</h2>
        <div className="dash-alerts">
          {alerts.map((alert, index) => (
            <button
              key={index}
              type="button"
              className={`ds-alert sev-${alert.severity}`}
              disabled={!alert.target}
              onClick={() => alert.target && onNavigate(alert.target)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">{alert.icon}</span>
              <span className="ds-alert-tx">{alert.text}</span>
              <span className="ds-sev-chip">{alert.chip}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ═══ 4. ACCESOS — navegación principal del sistema ═══ */}
      <section className="dash-section" aria-labelledby="dash-modules-title">
        <h2 className="ds-section-title" id="dash-modules-title">Ir a un módulo</h2>
        <div className="ds-grid ds-grid-mod">
          {moduleList(isAdmin).map((item) => (
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
      </section>

    </div>
  );
}

function Kpi({ icon, tone, value, label, share, onClick }: { icon: string; tone: string; value: number; label: string; share?: string; onClick: () => void }) {
  return (
    <button type="button" className="ds-kpi" onClick={onClick}>
      <span className={`ds-kpi-ico ${tone}`}>
        <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
      </span>
      <span>
        <span className="ds-kpi-val">{value}</span>
        <span className="ds-kpi-lbl">{label}</span>
      </span>
      {share && <span className="ds-kpi-share">{share}</span>}
    </button>
  );
}

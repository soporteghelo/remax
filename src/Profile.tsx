import type { User } from './api';

/** Destino de "Ver mi perfil" del drawer y del footer de navegación. */
export default function Profile({ user, isAdmin, onLogout }: { user: User; isAdmin: boolean; onLogout: () => void }) {
  const fields: [string, string][] = [
    ['Nombres', user.nombres || '—'],
    ['Apellidos', user.apellidos || '—'],
    ['DNI', user.dni],
    ['Tipo de usuario', isAdmin ? 'ADMINISTRADOR' : 'USUARIO'],
    ['Fecha de registro', user.fechaRegistro || '—'],
    ['Último acceso', user.ultimoAcceso || '—'],
    ['Dispositivo', user.dispositivo || '—'],
  ];
  return (
    <section className="page-content">
      <p className="eyebrow dark">CUENTA</p>
      <h1>Mi perfil</h1>
      <p className="subtitle">Datos con los que el servidor identifica tu sesión. Se actualizan en cada inicio de sesión válido.</p>
      <dl className="profile-grid">
        {fields.map(([label, value]) => (
          <div className="profile-field" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="profile-actions">
        <button type="button" className="danger-button" onClick={onLogout}>
          <span className="material-symbols-outlined" aria-hidden="true">logout</span>
          Cerrar sesión
        </button>
      </div>
    </section>
  );
}

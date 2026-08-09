import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createUser, isNetworkError, readUsersCache, updateUser, writeUsersCache, type User } from './api';
import { reportQueued, reportSaved, useSyncState } from './sync';

/**
 * Resumen → Detalle → Edición, el mismo recorrido de los módulos de MOTOR.
 * El alta es una vista más, no una ventana flotante: se escribe con el mismo
 * ancho y el mismo formulario que la edición.
 */
type View = { name: 'list' } | { name: 'create' } | { name: 'detail'; dni: string } | { name: 'edit'; dni: string };

export default function UserAdmin({ user, onSessionUserChange }: { user: User; onSessionUserChange: (user: User) => void }) {
  const [view, setView] = useState<View>({ name: 'list' });
  const [users, setUsers] = useState<User[]>([user]);
  const [lastSync, setLastSync] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const syncState = useSyncState();

  useEffect(() => {
    const cached = readUsersCache(user.dni);
    if (cached.users.length) setUsers(cached.users);
    if (cached.lastSync) setLastSync(cached.lastSync);
  }, [user.dni, syncState.dataVersion]);

  const saveCache = (nextUsers: User[], date = new Date().toISOString()) => {
    setUsers(nextUsers); setLastSync(date); writeUsersCache(user.dni, { users: nextUsers, lastSync: date });
  };
  const upsert = (saved: User) => {
    saveCache([...users.filter((item) => item.dni !== saved.dni), saved].sort((a, b) => a.apellidos.localeCompare(b.apellidos, 'es')));
    if (saved.dni === user.dni) onSessionUserChange(saved);
  };

  const list = <UserList {...{ user, users, lastSync, syncMessage }}
                         onNew={() => { setSyncMessage(''); setView({ name: 'create' }); }}
                         onOpen={(dni) => setView({ name: 'detail', dni })} />;

  if (view.name === 'create') {
    return <UserCreate
      adminDni={user.dni}
      onCancel={() => setView({ name: 'list' })}
      onCreated={(created) => { upsert(created); setSyncMessage(`Usuario creado. Su contraseña inicial es su DNI: ${created.dni}.`); setView({ name: 'list' }); }}
    />;
  }

  const selected = view.name === 'list' ? null : users.find((item) => item.dni === view.dni) ?? null;
  if (view.name !== 'list' && !selected) return list;

  if (view.name === 'detail' && selected) {
    return <UserDetail user={selected} isSelf={selected.dni === user.dni} onBack={() => setView({ name: 'list' })} onEdit={() => setView({ name: 'edit', dni: selected.dni })} />;
  }
  if (view.name === 'edit' && selected) {
    return <UserEdit
      target={selected}
      adminDni={user.dni}
      onCancel={() => setView({ name: 'detail', dni: selected.dni })}
      onSaved={(saved, message) => { upsert(saved); setSyncMessage(message); setView({ name: 'detail', dni: saved.dni }); }}
    />;
  }
  return list;
}

/* ─── Resumen ─── */
interface ListProps {
  user: User; users: User[]; lastSync: string; syncMessage: string;
  onNew: () => void; onOpen: (dni: string) => void;
}

function UserList({ user, users, lastSync, syncMessage, onNew, onOpen }: ListProps) {
  const syncedAt = lastSync ? new Date(lastSync).toLocaleString('es-PE') : 'Aún no sincronizado';
  const activos = users.filter((row) => row.estado === 'ACTIVO').length;
  return <section className="page-content user-admin-page"><p className="eyebrow dark">MÓDULO TEMPORAL</p><h1>Administrador de usuarios</h1><p className="subtitle">Toca una fila para ver o editar la cuenta. El listado se guarda localmente y se actualiza al sincronizar.</p>
    <div className="user-admin-summary" aria-label="Resumen de usuarios">
      <article><span className="material-symbols-outlined" aria-hidden="true">group</span><div><small>USUARIOS</small><b>{users.length}</b><em>{activos} activo(s)</em></div></article>
      <article><span className="material-symbols-outlined" aria-hidden="true">sync</span><div><small>SINCRONIZACIÓN</small><b>{lastSync ? 'Actualizada' : 'Pendiente'}</b><em>{lastSync ? syncedAt : 'Toca la nube de la barra superior'}</em></div></article>
    </div>
    <section className="panel">
      <div className="panel-title">
        <div><h2>Usuarios</h2><p>{syncMessage || 'La nube de la barra superior actualiza los datos de la base de datos.'}</p></div>
        <div className="panel-actions">
          <button type="button" className="new-user-button" onClick={onNew}>+ Nuevo usuario</button>
        </div>
      </div>
      <div className="user-table">
        <div className="table-head"><span>Usuario</span><span>DNI</span><span>Estado</span></div>
        {users.map((row) => (
          <button type="button" className="table-row" key={row.dni} onClick={() => onOpen(row.dni)} aria-label={`Ver detalle de ${row.nombres} ${row.apellidos}`}>
            <span><b>{row.nombres} {row.apellidos}</b><small>{row.tipoUsuario}{row.dni === user.dni ? ' · Tu cuenta' : ''}</small></span>
            <span>{row.dni}</span>
            <span><EstadoBadge estado={row.estado} /></span>
          </button>
        ))}
      </div>
    </section>
  </section>;
}

function EstadoBadge({ estado }: { estado: User['estado'] }) {
  return <span className={`state-badge ${estado === 'ACTIVO' ? 'is-activo' : 'is-cesado'}`}>
    <span className="material-symbols-outlined" aria-hidden="true">{estado === 'ACTIVO' ? 'check_circle' : 'block'}</span>
    {estado}
  </span>;
}

/* ─── Detalle ─── */
function UserDetail({ user, isSelf, onBack, onEdit }: { user: User; isSelf: boolean; onBack: () => void; onEdit: () => void }) {
  const fields: [string, React.ReactNode][] = [
    ['Apellidos', user.apellidos || '—'],
    ['Nombres', user.nombres || '—'],
    ['DNI', user.dni],
    ['Estado', <EstadoBadge estado={user.estado} />],
    ['Tipo de usuario', user.tipoUsuario],
    ['Fecha de registro', user.fechaRegistro || '—'],
    ['Último acceso', user.ultimoAcceso || '—'],
    ['Dispositivo', user.dispositivo || '—'],
  ];
  return <section className="page-content user-detail-page">
    <button type="button" className="back-button" onClick={onBack}>
      <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
      Volver al listado
    </button>
    <p className="eyebrow dark">DETALLE DE LA CUENTA</p>
    <h1>{user.nombres} {user.apellidos}</h1>
    <p className="subtitle">Datos registrados en la base de datos.{isSelf ? ' Esta es tu propia cuenta.' : ''}</p>
    <dl className="profile-grid">
      {fields.map(([label, value]) => <div className="profile-field" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <div className="profile-actions">
      <button type="button" className="new-user-button" onClick={onEdit}>Editar usuario</button>
    </div>
  </section>;
}

/* ─── Edición ─── */
function UserEdit({ target, adminDni, onCancel, onSaved }: { target: User; adminDni: string; onCancel: () => void; onSaved: (saved: User, message: string) => void }) {
  const isSelf = target.dni === adminDni;
  const [apellidos, setApellidos] = useState(target.apellidos);
  const [nombres, setNombres] = useState(target.nombres);
  const [estado, setEstado] = useState<User['estado']>(target.estado);
  const [tipoUsuario, setTipoUsuario] = useState<User['tipoUsuario']>(target.tipoUsuario);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Cambiar la contraseña o cesar la cuenta invalida su sesión en el servidor.
  const cierraSesion = !isSelf && (Boolean(password) || (estado === 'CESADO' && target.estado !== 'CESADO'));

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!apellidos.trim() || !nombres.trim()) return setError('Completa nombres y apellidos.');
    if (password && password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    setSaving(true);
    try {
      const saved = await updateUser({ adminDni, dni: target.dni, apellidos, nombres, estado, tipoUsuario, password: password || undefined });
      reportSaved(`Usuario ${saved.dni} actualizado`);
      onSaved(saved, cierraSesion ? `Usuario actualizado. ${saved.nombres} deberá iniciar sesión de nuevo.` : 'Usuario actualizado correctamente.');
    } catch (cause) {
      if (isNetworkError(cause)) {
        reportQueued({ kind: 'editar-usuario', label: `Usuario modificado ${target.dni}`, payload: { dni: target.dni, apellidos, nombres, estado, tipoUsuario, password: password || undefined } });
        setError('El cambio quedó guardado en este dispositivo. Toca la nube de la barra superior cuando vuelva la conexión.');
      } else setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el usuario.');
    }
    finally { setSaving(false); }
  };

  return <section className="page-content user-edit-page">
    <button type="button" className="back-button" onClick={onCancel}>
      <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
      Volver al detalle
    </button>
    <p className="eyebrow dark">EDICIÓN</p>
    <h1>Editar usuario</h1>
    <p className="subtitle">DNI {target.dni}. El DNI identifica la cuenta y no se puede cambiar.</p>
    <form className="admin-form edit-form" onSubmit={submit}>
      <label>Apellidos<AutoGrowTextarea value={apellidos} onChange={(value) => setApellidos(value.toUpperCase())} /></label>
      <label>Nombres<AutoGrowTextarea value={nombres} onChange={(value) => setNombres(value.toUpperCase())} /></label>
      <label>Estado<select value={estado} onChange={(e) => setEstado(e.target.value as User['estado'])} disabled={isSelf}>
        <option value="ACTIVO">ACTIVO</option>
        <option value="CESADO">CESADO</option>
      </select></label>
      <label>Tipo de usuario<select value={tipoUsuario} onChange={(e) => setTipoUsuario(e.target.value as User['tipoUsuario'])} disabled={isSelf}>
        <option value="USUARIO">USUARIO</option>
        <option value="ADMINISTRADOR">ADMINISTRADOR</option>
      </select></label>
      <label className="span-2">Nueva contraseña
        <span className="password-row">
          <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Déjalo vacío para no cambiarla" autoComplete="new-password" />
          <button type="button" className="back-button" onClick={() => setPassword(target.dni)}>Usar el DNI</button>
        </span>
      </label>
      {isSelf && <p className="form-hint span-2">No puedes cesar tu propia cuenta ni quitarte el rol de administrador.</p>}
      {cierraSesion && <p className="form-hint span-2">Al guardar, esta persona quedará fuera de la aplicación y deberá iniciar sesión de nuevo.</p>}
      {error && <p className="form-error">{error}</p>}
      <div className="form-buttons">
        <button type="button" className="back-button" onClick={onCancel}>Cancelar</button>
        <button className="primary-button" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
      </div>
    </form>
  </section>;
}

/* ─── Alta ─── */
/** Campo de edición que se expande hasta mostrar todo el contenido escrito. */
function AutoGrowTextarea({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  };
  useLayoutEffect(resize, [value]);
  return <textarea ref={ref} className="edit-textarea" rows={1} value={value} onInput={resize} onChange={(event) => onChange(event.target.value)} />;
}

/** Misma página que la edición: nada flota, se llega y se vuelve con el mismo gesto. */
function UserCreate({ adminDni, onCancel, onCreated }: { adminDni: string; onCancel: () => void; onCreated: (created: User) => void }) {
  const [dni, setDni] = useState(''); const [apellidos, setApellidos] = useState(''); const [nombres, setNombres] = useState('');
  const [tipoUsuario, setTipoUsuario] = useState<User['tipoUsuario']>('USUARIO'); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!/^\d{8}$/.test(dni)) return setError('Ingresa un DNI válido de 8 dígitos.');
    if (!apellidos.trim() || !nombres.trim()) return setError('Completa nombres y apellidos.');
    setSaving(true);
    try {
      const created = await createUser({ adminDni, dni, apellidos, nombres, tipoUsuario });
      reportSaved(`Usuario ${created.dni} creado`);
      onCreated(created);
    } catch (cause) {
      if (isNetworkError(cause)) {
        reportQueued({ kind: 'crear-usuario', label: `Nuevo usuario ${dni}`, payload: { dni, apellidos, nombres, tipoUsuario } });
        setError('El usuario quedó guardado en este dispositivo. Toca la nube de la barra superior cuando vuelva la conexión.');
      } else setError(cause instanceof Error ? cause.message : 'No se pudo crear el usuario.');
    }
    finally { setSaving(false); }
  };
  return <section className="page-content user-edit-page">
    <button type="button" className="back-button" onClick={onCancel}>
      <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
      Volver al listado
    </button>
    <p className="eyebrow dark">ALTA</p>
    <h1>Nuevo usuario</h1>
    <p className="subtitle">La cuenta se registra en la base de datos y se agrega al listado. El DNI identifica la cuenta y no se podrá cambiar después.</p>
    <form className="admin-form edit-form" onSubmit={submit}>
      <label>DNI<input value={dni} onChange={(e) => setDni(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" maxLength={8} placeholder="8 dígitos" autoFocus /></label>
      <label>Tipo de usuario<select value={tipoUsuario} onChange={(e) => setTipoUsuario(e.target.value as User['tipoUsuario'])}>
        <option value="USUARIO">USUARIO</option>
        <option value="ADMINISTRADOR">ADMINISTRADOR</option>
      </select></label>
      <label>Apellidos<AutoGrowTextarea value={apellidos} onChange={(value) => setApellidos(value.toUpperCase())} /></label>
      <label>Nombres<AutoGrowTextarea value={nombres} onChange={(value) => setNombres(value.toUpperCase())} /></label>
      <p className="form-hint span-2">La contraseña inicial es el propio DNI; puedes cambiarla luego desde la edición de la cuenta.</p>
      {error && <p className="form-error span-2">{error}</p>}
      <div className="form-buttons">
        <button type="button" className="back-button" onClick={onCancel}>Cancelar</button>
        <button className="primary-button" disabled={saving}>{saving ? 'Creando…' : 'Crear usuario'}</button>
      </div>
    </form>
  </section>;
}

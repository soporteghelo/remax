import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createUser, isNetworkError, readUsersCache, resendInvite, syncUsers, updateUser, writeUsersCache, type CredentialDelivery, type InviteChannel, type User } from './api';
import { formatDateTime } from './dates';
import { markSaved, queueChange, useSyncState } from './sync';
import { WhatsAppGlyph } from './whatsapp';
import { listCatalogs, readCatalogCache } from './crm-api';

/**
 * Resumen → Detalle → Edición, el mismo recorrido de los módulos de MOTOR.
 * El alta es una vista más, no una ventana flotante: se escribe con el mismo
 * ancho y el mismo formulario que la edición.
 */
type View = { name: 'list' } | { name: 'create' } | { name: 'detail'; dni: string } | { name: 'edit'; dni: string } | { name: 'invite'; dni: string } | { name: 'credentials'; dni: string; delivery: CredentialDelivery };

export default function UserAdmin({ user, onSessionUserChange }: { user: User; onSessionUserChange: (user: User) => void }) {
  const [view, setView] = useState<View>({ name: 'list' });
  const [users, setUsers] = useState<User[]>([user]);
  const [lastSync, setLastSync] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [categories, setCategories] = useState<string[]>(() => categoryOptions(readCatalogCache(user.dni)));
  const syncState = useSyncState();

  useEffect(() => {
    const cached = readUsersCache(user.dni);
    if (cached.users.length) setUsers(cached.users);
    if (cached.lastSync) setLastSync(cached.lastSync);
  }, [user.dni, syncState.dataVersion]);

  useEffect(() => {
    let active = true;
    const loadCategories = () => { const cached = categoryOptions(readCatalogCache(user.dni)); if (cached.length) setCategories(cached); void listCatalogs(user.dni).then((items) => { if (active) setCategories(categoryOptions(items)); }).catch(() => { /* el selector conserva la copia local */ }); };
    loadCategories();
    return () => { active = false; };
  }, [user.dni, syncState.dataVersion]);

  useEffect(() => {
    let active = true;
    let refreshInProgress = false;
    const refresh = async () => {
      if (document.hidden || refreshInProgress) return;
      refreshInProgress = true;
      setRefreshing(true);
      setRefreshError('');
      try {
        const fresh = await syncUsers(user.dni);
        if (!active) return;
        const date = new Date().toISOString();
        setUsers(fresh);
        setLastSync(date);
        writeUsersCache(user.dni, { users: fresh, lastSync: date });
      } catch (cause) {
        if (active) setRefreshError(cause instanceof Error ? cause.message : 'No se pudieron actualizar los usuarios.');
      } finally {
        refreshInProgress = false;
        if (active) setRefreshing(false);
      }
    };
    const refreshOnReturn = () => { if (!document.hidden) void refresh(); };
    void refresh();
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      active = false;
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [user.dni]);

  const saveCache = (nextUsers: User[], date = new Date().toISOString()) => {
    setUsers(nextUsers); setLastSync(date); writeUsersCache(user.dni, { users: nextUsers, lastSync: date });
  };
  const upsert = (saved: User) => {
    saveCache([...users.filter((item) => item.dni !== saved.dni), saved].sort((a, b) => a.apellidos.localeCompare(b.apellidos, 'es')));
    if (saved.dni === user.dni) onSessionUserChange(saved);
  };

  const quickUpdateCategory = async (target: User, categoria: string) => {
    const input = { dni: target.dni, apellidos: target.apellidos, nombres: target.nombres, estado: target.estado, tipoUsuario: target.tipoUsuario, correo: target.correo, celular: target.celular, categoria };
    try {
      const { user: saved } = await updateUser({ adminDni: user.dni, ...input });
      markSaved();
      upsert(saved);
    } catch (cause) {
      if (isNetworkError(cause)) {
        queueChange({ kind: 'editar-usuario', label: `Categoría actualizada ${target.dni}`, payload: input });
        upsert({ ...target, categoria });
        return;
      }
      throw cause;
    }
  };

  const list = <UserList {...{ user, users, lastSync, syncMessage, refreshing, refreshError, categories }}
                         onNew={() => { setSyncMessage(''); setView({ name: 'create' }); }}
                         onOpen={(dni) => setView({ name: 'detail', dni })}
                         onInvite={(dni) => { setSyncMessage(''); setView({ name: 'invite', dni }); }}
                         onQuickUpdateCategory={quickUpdateCategory} />;

  if (view.name === 'create') {
    return <UserCreate
      adminDni={user.dni}
      categories={categories}
      onCancel={() => setView({ name: 'list' })}
      onCreated={upsert}
      onFinish={(message) => { setSyncMessage(message); setView({ name: 'list' }); }}
    />;
  }

  const selected = view.name === 'list' ? null : users.find((item) => item.dni === view.dni) ?? null;
  if (view.name !== 'list' && !selected) return list;

  if (view.name === 'detail' && selected) {
    return <UserDetail user={selected} isSelf={selected.dni === user.dni} onBack={() => setView({ name: 'list' })} onEdit={() => setView({ name: 'edit', dni: selected.dni })} />;
  }
  if (view.name === 'invite' && selected) {
    return <UserInvite
      target={selected}
      adminDni={user.dni}
      onBack={() => setView({ name: 'list' })}
      onFinish={(message) => { setSyncMessage(message); setView({ name: 'list' }); }}
    />;
  }
  if (view.name === 'credentials' && selected) {
    return <UserCredentials user={selected} delivery={view.delivery} mode="reset" onFinish={(message) => { setSyncMessage(message); setView({ name: 'list' }); }} />;
  }
  if (view.name === 'edit' && selected) {
    return <UserEdit
      target={selected}
      adminDni={user.dni}
      categories={categories}
      onCancel={() => setView({ name: 'detail', dni: selected.dni })}
      onSaved={(saved, message, delivery) => {
        upsert(saved);
        if (delivery) setView({ name: 'credentials', dni: saved.dni, delivery });
        else { setSyncMessage(message); setView({ name: 'detail', dni: saved.dni }); }
      }}
    />;
  }
  return list;
}

/* ─── Resumen ─── */
interface ListProps {
  user: User; users: User[]; lastSync: string; syncMessage: string; refreshing: boolean; refreshError: string; categories: string[];
  onNew: () => void; onOpen: (dni: string) => void; onInvite: (dni: string) => void;
  onQuickUpdateCategory: (target: User, categoria: string) => Promise<void>;
}

function UserList({ user, users, lastSync, syncMessage, refreshing, refreshError, categories, onNew, onOpen, onInvite, onQuickUpdateCategory }: ListProps) {
  // Los filtros solo recortan lo que se lista; el resumen de arriba sigue
  // contando todo el equipo, que es el dato que se consulta de un vistazo.
  const [estado, setEstado] = useState('');
  const [tipoUsuario, setTipoUsuario] = useState('');
  const [agentQuery, setAgentQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [savingCategoryDni, setSavingCategoryDni] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const syncedAt = lastSync ? formatDateTime(lastSync) : 'Aún no sincronizado';
  const activos = users.filter((row) => row.estado === 'ACTIVO').length;
  const normalizedAgentQuery = agentQuery.trim().toLocaleLowerCase('es-PE');
  const activeFilters = [estado, tipoUsuario, normalizedAgentQuery].filter(Boolean).length;
  const hasFilters = activeFilters > 0;
  const filtered = useMemo(
    () => users.filter((row) => {
      const agentText = `${row.nombres} ${row.apellidos} ${row.dni}`.toLocaleLowerCase('es-PE');
      return (!estado || row.estado === estado) && (!tipoUsuario || row.tipoUsuario === tipoUsuario) && (!normalizedAgentQuery || agentText.includes(normalizedAgentQuery));
    }),
    [users, estado, tipoUsuario, normalizedAgentQuery],
  );
  const status = categoryError
    || syncMessage
    || (refreshError ? `${refreshError} Se muestra la copia guardada.`
      : refreshing ? 'Consultando la hoja USUARIOS…'
      : hasFilters ? `Mostrando ${filtered.length} de ${users.length} cuenta(s).`
      : 'Listado actualizado desde la base de datos.');
  return <section className="page-content user-admin-page"><p className="eyebrow dark">ADMINISTRACIÓN</p><h1>Equipo</h1><p className="subtitle">Crea, edita, desactiva o reactiva las cuentas de agentes y administradores.</p>
    <div className="user-admin-summary" aria-label="Resumen de usuarios">
      <article><span className="material-symbols-outlined" aria-hidden="true">group</span><div><small>USUARIOS</small><b>{users.length}</b><em>{activos} activo(s)</em></div></article>
      <article><span className={`material-symbols-outlined${refreshing ? ' is-spinning' : ''}`} aria-hidden="true">sync</span><div><small>SINCRONIZACIÓN</small><b>{refreshing ? 'Actualizando…' : lastSync ? 'Actualizada' : 'Pendiente'}</b><em>{lastSync ? syncedAt : 'Conectando con la base de datos'}</em></div></article>
    </div>
    <section className="panel">
      <div className="panel-title">
        <div><h2>Usuarios</h2><p>{status}</p></div>
        <div className="panel-actions">
          {/* Plegado no significa desactivado: el contador y el texto de arriba
              recuerdan que hay un filtro puesto aunque no se vean los campos. */}
          <button type="button" className={`user-admin-filter-toggle${filtersOpen ? ' is-open' : ''}`} aria-expanded={filtersOpen} aria-controls="user-admin-filters" onClick={() => setFiltersOpen((current) => !current)}>
            <span className="material-symbols-outlined" aria-hidden="true">filter_list</span>
            <span>Filtros</span>
            {hasFilters && <small aria-label={`${activeFilters} filtro(s) activo(s)`}>{activeFilters}</small>}
            <span className="material-symbols-outlined" aria-hidden="true">{filtersOpen ? 'expand_less' : 'expand_more'}</span>
          </button>
          <button type="button" className="new-user-button" onClick={onNew}>+ Nuevo usuario</button>
        </div>
      </div>
      <div id="user-admin-filters" className={`crm-filters user-admin-filters${filtersOpen ? ' is-open' : ' is-collapsed'}`} aria-label="Filtros de usuarios">
        <label><span>Estado</span><select value={estado} onChange={(event) => setEstado(event.target.value)}>
          <option value="">Todos</option>
          <option value="ACTIVO">ACTIVO</option>
          <option value="CESADO">CESADO</option>
        </select></label>
        <label><span>Rol comercial</span><select value={tipoUsuario} onChange={(event) => setTipoUsuario(event.target.value)}>
          <option value="">Todos</option>
          <option value="USUARIO">AGENTE</option>
          <option value="ADMINISTRADOR">ADMINISTRADOR</option>
        </select></label>
        <label><span>Agente</span><input type="search" value={agentQuery} onChange={(event) => setAgentQuery(event.target.value)} placeholder="Escribe para filtrar por agente o DNI" autoComplete="off" /></label>
        <button type="button" className="crm-clear-filters" onClick={() => { setEstado(''); setTipoUsuario(''); setAgentQuery(''); }} disabled={!hasFilters} aria-label="Eliminar todos los filtros">
          <span className="material-symbols-outlined" aria-hidden="true">filter_alt_off</span><span>Limpiar filtros</span>
        </button>
      </div>
      {/* La acción solo aparece si existe un celular al que enviar el
          recordatorio por WhatsApp. */}
      <div className={`user-table${filtered.some((row) => row.celular) ? ' has-row-actions' : ''}`}>
        <div className="table-head"><span>Usuario</span><span>DNI</span><span>Categoría</span><span>Estado</span></div>
        {filtered.length ? filtered.map((row) => (
          // La acción de WhatsApp va FUERA del botón de la fila: anidar dos
          // controles no es válido, así que ocupa su propia columna. Cuando la
          // cuenta no tiene por dónde recibirla queda un hueco, y así todas las
          // filas conservan las mismas columnas.
          <div className="user-row" key={row.dni}>
            <button type="button" className="table-row" onClick={() => onOpen(row.dni)} aria-label={`Ver detalle de ${row.nombres} ${row.apellidos}`}>
              <span><b>{row.nombres} {row.apellidos}</b><small>{row.tipoUsuario === 'USUARIO' ? 'AGENTE' : 'ADMINISTRADOR'}{row.dni === user.dni ? ' · Tu cuenta' : ''}</small></span>
            </button>
            <span className="user-dni-cell">{row.dni}</span>
            <span className="user-category-cell">
              <label className="sr-only-ds" htmlFor={`user-category-${row.dni}`}>Categoría de {row.nombres} {row.apellidos}</label>
              <select id={`user-category-${row.dni}`} value={row.categoria} disabled={savingCategoryDni === row.dni}
                onChange={(event) => {
                  const categoria = event.target.value;
                  setCategoryError(''); setSavingCategoryDni(row.dni);
                  void onQuickUpdateCategory(row, categoria).catch((cause) => {
                    setCategoryError(cause instanceof Error ? cause.message : 'No se pudo actualizar la categoría.');
                  }).finally(() => setSavingCategoryDni(''));
                }}>
                <option value="">Sin categoría</option>
                {row.categoria && !categories.includes(row.categoria) && <option value={row.categoria}>{row.categoria}</option>}
                {categories.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
            </span>
            <span className="user-state-cell"><EstadoBadge estado={row.estado} /></span>
            {row.celular ? (
              <button type="button" className="row-action" onClick={() => onInvite(row.dni)}
                      title={`Enviar recordatorio de credenciales por WhatsApp a ${row.nombres} ${row.apellidos}`}
                      aria-label={`Enviar recordatorio de credenciales por WhatsApp a ${row.nombres} ${row.apellidos}`}>
                <WhatsAppGlyph />
              </button>
            ) : <span aria-hidden="true" />}
          </div>
        )) : <p className="user-admin-empty">{users.length ? 'No hay cuentas que coincidan con los filtros.' : 'Todavía no hay usuarios registrados.'}</p>}
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

function categoryOptions(items: Array<{ tipo: string; etiqueta: string; activo: boolean }>): string[] {
  return [...new Set(items.filter((item) => item.tipo === 'CATEGORIA_AGENTE' && item.activo).map((item) => item.etiqueta.trim()).filter(Boolean))];
}

/* ─── Detalle ─── */
function UserDetail({ user, isSelf, onBack, onEdit }: { user: User; isSelf: boolean; onBack: () => void; onEdit: () => void }) {
  const fields: [string, React.ReactNode][] = [
    ['Apellidos', user.apellidos || '—'],
    ['Nombres', user.nombres || '—'],
    ['DNI', user.dni],
    ['Correo', user.correo || '—'],
    ['Celular', user.celular || '—'],
    ['Categoría', user.categoria || '—'],
    ['Estado', <EstadoBadge estado={user.estado} />],
    ['Rol comercial', user.tipoUsuario === 'USUARIO' ? 'AGENTE' : 'ADMINISTRADOR'],
    ['Fecha de registro', formatDateTime(user.fechaRegistro)],
    ['Último acceso', formatDateTime(user.ultimoAcceso)],
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
function UserEdit({ target, adminDni, categories, onCancel, onSaved }: { target: User; adminDni: string; categories: string[]; onCancel: () => void; onSaved: (saved: User, message: string, delivery: CredentialDelivery | null) => void }) {
  const isSelf = target.dni === adminDni;
  const [apellidos, setApellidos] = useState(target.apellidos);
  const [nombres, setNombres] = useState(target.nombres);
  const [estado, setEstado] = useState<User['estado']>(target.estado);
  const [tipoUsuario, setTipoUsuario] = useState<User['tipoUsuario']>(target.tipoUsuario);
  const [correo, setCorreo] = useState(target.correo);
  const [celular, setCelular] = useState(target.celular);
  const [categoria, setCategoria] = useState(target.categoria);
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
      const { user: saved, delivery } = await updateUser({ adminDni, dni: target.dni, apellidos, nombres, estado, tipoUsuario, password: password || undefined, correo, celular, categoria });
      markSaved();
      if (delivery) { onSaved(saved, '', delivery); return; }
      onSaved(saved, cierraSesion ? `Usuario actualizado. ${saved.nombres} deberá iniciar sesión de nuevo.` : 'Usuario actualizado correctamente.', null);
    } catch (cause) {
      if (isNetworkError(cause)) {
        queueChange({ kind: 'editar-usuario', label: `Usuario modificado ${target.dni}`, payload: { dni: target.dni, apellidos, nombres, estado, tipoUsuario, password: password || undefined, correo, celular, categoria } });
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
      <label>Apellidos *<AutoGrowTextarea required value={apellidos} onChange={(value) => setApellidos(value.toUpperCase())} /></label>
      <label>Nombres *<AutoGrowTextarea required value={nombres} onChange={(value) => setNombres(value.toUpperCase())} /></label>
      <label>Estado *<select required value={estado} onChange={(e) => setEstado(e.target.value as User['estado'])} disabled={isSelf}>
        <option value="ACTIVO">ACTIVO</option>
        <option value="CESADO">CESADO</option>
      </select></label>
      <label>Rol comercial *<select required value={tipoUsuario} onChange={(e) => setTipoUsuario(e.target.value as User['tipoUsuario'])} disabled={isSelf}>
        <option value="USUARIO">AGENTE</option>
        <option value="ADMINISTRADOR">ADMINISTRADOR</option>
      </select></label>
      <label>Correo<input type="email" value={correo} onChange={(e) => setCorreo(e.target.value.trim())} inputMode="email" autoComplete="off" placeholder="correo@ejemplo.com" /></label>
      <label>Celular<input type="tel" value={celular} onChange={(e) => setCelular(e.target.value)} inputMode="tel" autoComplete="off" placeholder="9 dígitos o +51…" /></label>
      <label>Categoría<select value={categoria} onChange={(e) => setCategoria(e.target.value)}><option value="">Sin categoría</option>{categoria && !categories.includes(categoria) && <option value={categoria}>{categoria}</option>}{categories.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
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
function AutoGrowTextarea({ value, onChange, required = false }: { value: string; onChange: (value: string) => void; required?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  };
  useLayoutEffect(resize, [value]);
  return <textarea ref={ref} className="edit-textarea" rows={1} value={value} required={required} onInput={resize} onChange={(event) => onChange(event.target.value)} />;
}

/**
 * Misma página que la edición: nada flota, se llega y se vuelve con el mismo
 * gesto. Al guardar, el servidor envía por correo el acceso completo (objetivo
 * de la app, rol asignado, enlace, usuario y contraseña) y devuelve ese mismo
 * mensaje escrito para WhatsApp, que solo puede abrir quien administra.
 */
function UserCreate({ adminDni, categories, onCancel, onCreated, onFinish }: {
  adminDni: string; categories: string[]; onCancel: () => void; onCreated: (created: User) => void; onFinish: (message: string) => void;
}) {
  const [dni, setDni] = useState(''); const [apellidos, setApellidos] = useState(''); const [nombres, setNombres] = useState('');
  const [tipoUsuario, setTipoUsuario] = useState<User['tipoUsuario']>('USUARIO');
  const [correo, setCorreo] = useState(''); const [celular, setCelular] = useState('');
  const [categoria, setCategoria] = useState('');
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ user: User; delivery: CredentialDelivery } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!/^\d{8}$/.test(dni)) return setError('Ingresa un DNI válido de 8 dígitos.');
    if (!apellidos.trim() || !nombres.trim()) return setError('Completa nombres y apellidos.');
    setSaving(true);
    try {
      const result = await createUser({ adminDni, dni, apellidos, nombres, tipoUsuario, correo, celular, categoria });
      markSaved();
      onCreated(result.user);
      setCreated(result);
    } catch (cause) {
      if (isNetworkError(cause)) {
        queueChange({ kind: 'crear-usuario', label: `Nuevo usuario ${dni}`, payload: { dni, apellidos, nombres, tipoUsuario, correo, celular, categoria } });
        setError('El usuario quedó guardado en este dispositivo. Su acceso se enviará al crearse la cuenta: toca la nube de la barra superior cuando vuelva la conexión.');
      } else setError(cause instanceof Error ? cause.message : 'No se pudo crear el usuario.');
    }
    finally { setSaving(false); }
  };

  if (created) return <UserCredentials user={created.user} delivery={created.delivery} mode="create" onFinish={onFinish} />;

  return <section className="page-content user-edit-page">
    <button type="button" className="back-button" onClick={onCancel}>
      <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
      Volver al listado
    </button>
    <p className="eyebrow dark">ALTA</p>
    <h1>Nuevo usuario</h1>
    <p className="subtitle">La cuenta se registra en la base de datos y se agrega al listado. El DNI identifica la cuenta y no se podrá cambiar después.</p>
    <form className="admin-form edit-form" onSubmit={submit}>
      <label>DNI *<input required value={dni} onChange={(e) => setDni(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" maxLength={8} placeholder="8 dígitos" autoFocus /></label>
      <label>Rol comercial *<select required value={tipoUsuario} onChange={(e) => setTipoUsuario(e.target.value as User['tipoUsuario'])}>
        <option value="USUARIO">AGENTE</option>
        <option value="ADMINISTRADOR">ADMINISTRADOR</option>
      </select></label>
      <label>Apellidos *<AutoGrowTextarea required value={apellidos} onChange={(value) => setApellidos(value.toUpperCase())} /></label>
      <label>Nombres *<AutoGrowTextarea required value={nombres} onChange={(value) => setNombres(value.toUpperCase())} /></label>
      <label>Correo<input type="email" value={correo} onChange={(e) => setCorreo(e.target.value.trim())} inputMode="email" autoComplete="off" placeholder="correo@ejemplo.com" /></label>
      <label>Celular<input type="tel" value={celular} onChange={(e) => setCelular(e.target.value)} inputMode="tel" autoComplete="off" placeholder="9 dígitos o +51…" /></label>
      <label>Categoría<select value={categoria} onChange={(e) => setCategoria(e.target.value)}><option value="">Sin categoría</option>{categories.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      <p className="form-hint span-2">
        La contraseña inicial es el propio DNI. Al crear la cuenta se envía el acceso al correo indicado;
        con el celular podrás enviárselo por WhatsApp en el siguiente paso.
      </p>
      {error && <p className="form-error span-2">{error}</p>}
      <div className="form-buttons">
        <button type="button" className="back-button" onClick={onCancel}>Cancelar</button>
        <button className="primary-button" disabled={saving}>{saving ? 'Creando…' : 'Crear usuario'}</button>
      </div>
    </form>
  </section>;
}

/**
 * Reenvía el acceso de una cuenta que ya existe: la pulsación en el listado es
 * la confirmación, así que el envío sale al entrar. El resultado se muestra con
 * el mismo panel que el alta.
 */
function UserInvite({ target, adminDni, onBack, onFinish }: {
  target: User; adminDni: string; onBack: () => void; onFinish: (message: string) => void;
}) {
  const [delivery, setDelivery] = useState<CredentialDelivery | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  // El envío se dispara una vez por intento, aunque el componente vuelva a pintarse.
  const sentFor = useRef('');

  useEffect(() => {
    const key = `${target.dni}|${attempt}`;
    if (sentFor.current === key) return;
    sentFor.current = key;
    let active = true;
    setDelivery(null); setError('');
    resendInvite(adminDni, target.dni, 'whatsapp')
      .then((result) => { if (active) setDelivery(result.delivery); })
      .catch((cause) => {
        if (!active) return;
        setError(isNetworkError(cause)
          ? 'No hay conexión con el servicio. Vuelve a intentarlo cuando regrese: el reenvío no queda en cola para no duplicar mensajes.'
          : cause instanceof Error ? cause.message : 'No se pudo reenviar la invitación.');
      });
    return () => { active = false; };
  }, [adminDni, target.dni, attempt]);

  if (delivery) return <UserCredentials user={target} delivery={delivery} mode="resend" onFinish={onFinish} />;

  return <section className="page-content user-edit-page">
    <button type="button" className="back-button" onClick={onBack}>
      <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
      Volver al listado
    </button>
    <p className="eyebrow dark">ENVÍO</p>
    <h1>Preparando recordatorio</h1>
    <p className="subtitle">{target.nombres} {target.apellidos} · DNI {target.dni}</p>
    {error
      ? <>
          <p className="form-error">{error}</p>
          <div className="profile-actions">
            <button type="button" className="primary-button" onClick={() => setAttempt((current) => current + 1)}>Reintentar</button>
          </div>
        </>
      : <p className="form-hint" role="status">Preparando el mensaje de WhatsApp…</p>}
  </section>;
}

/**
 * Qué se entregó y por dónde. El correo ya salió del servidor; WhatsApp y el
 * copiado quedan a mano porque el navegador no puede enviarlos por su cuenta.
 */
function UserCredentials({ user, delivery, mode, onFinish }: {
  user: User; delivery: CredentialDelivery; mode: 'create' | 'resend' | 'reset'; onFinish: (message: string) => void;
}) {
  const [copyNote, setCopyNote] = useState('');
  const creating = mode === 'create';
  const resetting = mode === 'reset';
  const role = user.tipoUsuario === 'USUARIO' ? 'AGENTE' : 'ADMINISTRADOR';
  const copy = async () => {
    try { await navigator.clipboard.writeText(delivery.text); setCopyNote('Mensaje copiado: pégalo donde quieras enviarlo.'); }
    catch { setCopyNote('El navegador no permitió copiar. Selecciona el mensaje de abajo y cópialo a mano.'); }
  };
  const fields: [string, string][] = [
    ['Enlace de ingreso', delivery.link || 'Sin configurar'],
    ['Usuario (DNI)', user.dni],
    // Al reenviar, una contraseña ya cambiada no se puede recuperar: el mensaje
    // remite a la que esa persona definió, y aquí se dice lo mismo.
    [creating ? 'Contraseña inicial' : resetting ? 'Nueva contraseña' : 'Contraseña', delivery.password || 'La que ya definió'],
    ['Tipo de usuario', role],
  ];

  return <section className="page-content user-edit-page">
    <p className="eyebrow dark">{creating ? 'ALTA' : 'ENVÍO'}</p>
    <h1>{creating ? 'Cuenta creada' : resetting ? 'Contraseña actualizada' : 'Invitación reenviada'}</h1>
    <p className="subtitle">{user.nombres} {user.apellidos} · DNI {user.dni} · {role}</p>

    {resetting
      ? <p className="form-hint">El mensaje con la nueva contraseña está listo para enviarse al celular registrado por WhatsApp.</p>
      : mode === 'resend'
      ? <p className="form-hint">El recordatorio está listo para enviarse al celular registrado por WhatsApp.</p>
      : delivery.emailSent
      ? <p className="form-success"><span className="material-symbols-outlined" aria-hidden="true">mark_email_read</span>Acceso enviado a {delivery.email}.</p>
      : delivery.email
        ? <p className="form-error">No se pudo enviar el correo a {delivery.email}. {delivery.emailError} Envíalo por WhatsApp o copia el mensaje.</p>
        : <p className="form-hint">Esta cuenta no registró un correo: entrega el acceso por WhatsApp o copiando el mensaje.</p>}

    {!delivery.link && (
      <div className="ds-alert sev-med" role="status">
        <span className="material-symbols-outlined" aria-hidden="true">link_off</span>
        <span className="ds-alert-tx">El mensaje salió sin la dirección del portal. Defínela en <b>Configuración de la app → Enlace de acceso</b> para los próximos envíos.</span>
      </div>
    )}

    <dl className="profile-grid">
      {fields.map(([label, value]) => <div className="profile-field" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>

    <div className="profile-actions">
      {delivery.whatsappUrl && (
        <a className="whatsapp-action" href={delivery.whatsappUrl} target="_blank" rel="noopener noreferrer">
          <WhatsAppGlyph />
          {creating ? 'Enviar por WhatsApp' : resetting ? 'Enviar nueva contraseña por WhatsApp' : 'Enviar recordatorio por WhatsApp'}
        </a>
      )}
      <button type="button" className="back-button" onClick={copy}>
        <span className="material-symbols-outlined" aria-hidden="true">content_copy</span>
        Copiar mensaje
      </button>
      <button type="button" className="primary-button" onClick={() => onFinish(
        `${creating ? `Usuario ${user.dni} creado.` : resetting ? `Nueva contraseña enviada a ${user.nombres} ${user.apellidos}.` : `Invitación reenviada a ${user.nombres} ${user.apellidos}.`}`
        + (delivery.emailSent ? ` Acceso enviado a ${delivery.email}.` : creating ? ' Su contraseña inicial es su DNI.' : ''),
      )}>
        Volver al listado
      </button>
    </div>
    {copyNote && <p className="form-hint credentials-note">{copyNote}</p>}
    <details className="credentials-preview">
      <summary>Ver el mensaje que recibe</summary>
      <p>{delivery.text}</p>
    </details>
  </section>;
}

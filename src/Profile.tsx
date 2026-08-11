import { FormEvent, useState } from 'react';
import { isNetworkError, type User } from './api';
import { saveProfile } from './crm-api';
import { formatDateTime } from './dates';
import { markSaved, queueChange } from './sync';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\d{9}$/;
const editablePhone = (value: string) => value.replace(/\D/g, '').slice(-9);

/** Perfil de la sesión activa: identidad de acceso y campos personales autorizados. */
export default function Profile({ user, isAdmin, onLogout, onUserChange }: { user: User; isAdmin: boolean; onLogout: () => void; onUserChange: (user: User) => void }) {
  const [editing, setEditing] = useState(false);
  const [nombres, setNombres] = useState(user.nombres);
  const [apellidos, setApellidos] = useState(user.apellidos);
  const [correo, setCorreo] = useState(user.correo || '');
  const [celular, setCelular] = useState(editablePhone(user.celular || ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fields: [string, string][] = [
    ['Nombres', user.nombres || '—'],
    ['Apellidos', user.apellidos || '—'],
    ['Correo', user.correo || '—'],
    ['Celular', user.celular || '—'],
    ['DNI', user.dni],
    ['Rol comercial', isAdmin ? 'ADMINISTRADOR' : 'AGENTE'],
    ['Fecha de registro', formatDateTime(user.fechaRegistro)],
    ['Último acceso', formatDateTime(user.ultimoAcceso)],
    ['Dispositivo', user.dispositivo || '—'],
  ];

  const cancel = () => {
    setNombres(user.nombres);
    setApellidos(user.apellidos);
    setCorreo(user.correo || '');
    setCelular(editablePhone(user.celular || ''));
    setError('');
    setEditing(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    const cleanCorreo = correo.trim();
    const cleanCelular = celular.trim();
    if (!nombres.trim() || !apellidos.trim()) return setError('Nombres y apellidos son obligatorios.');
    if (cleanCorreo && !EMAIL_PATTERN.test(cleanCorreo)) return setError('Ingresa un correo válido.');
    if (cleanCelular && !PHONE_PATTERN.test(cleanCelular)) return setError('El celular debe contener exactamente 9 dígitos.');
    setSaving(true);
    const payload = { nombres, apellidos, correo: cleanCorreo, celular: cleanCelular };
    try {
      const saved = await saveProfile(user.dni, payload);
      onUserChange(saved);
      markSaved();
      setEditing(false);
      setMessage('Perfil actualizado correctamente.');
    } catch (cause) {
      if (isNetworkError(cause)) {
        queueChange({ kind: 'guardar-perfil', label: `Perfil ${user.dni}`, payload });
        setMessage('El cambio quedó pendiente y se enviará al recuperar conexión.');
      } else setError(cause instanceof Error ? cause.message : 'No se pudo guardar el perfil.');
    } finally { setSaving(false); }
  };

  return <section className="page-content crm-page">
    <div className="crm-heading">
      <div><p className="eyebrow dark">CUENTA</p><h1>Mi perfil</h1><p className="subtitle">Datos personales y credenciales con las que el servidor identifica tu sesión.</p></div>
      {!editing && <button type="button" className="primary-button" onClick={() => setEditing(true)}><span className="material-symbols-outlined">edit</span>Editar perfil</button>}
    </div>
    {message && <p className="form-hint" role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {editing ? <form className="crm-form ds-panel" onSubmit={submit}>
      <label>Nombres *<input required value={nombres} onChange={(event) => setNombres(event.target.value.toUpperCase())} autoComplete="given-name" autoFocus /></label>
      <label>Apellidos *<input required value={apellidos} onChange={(event) => setApellidos(event.target.value.toUpperCase())} autoComplete="family-name" /></label>
      <label>Correo<input type="email" value={correo} onChange={(event) => setCorreo(event.target.value)} autoComplete="email" maxLength={160} placeholder="nombre@correo.com" /></label>
      <label>Celular<input type="tel" value={celular} onChange={(event) => setCelular(event.target.value.replace(/\D/g, '').slice(0, 9))} autoComplete="tel" inputMode="numeric" pattern="[0-9]{9}" minLength={9} maxLength={9} placeholder="Ej. 987654321" /></label>
      <p className="form-hint span-2">El DNI y el rol solo pueden modificarse desde Equipo por un administrador. El correo y celular son opcionales.</p>
      <div className="form-buttons span-2"><button type="button" className="back-button" onClick={cancel}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? 'Guardando…' : 'Guardar perfil'}</button></div>
    </form> : <dl className="profile-grid">{fields.map(([label, value]) => <div className="profile-field" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    <div className="profile-actions"><button type="button" className="danger-button" onClick={onLogout}><span className="material-symbols-outlined" aria-hidden="true">logout</span>Cerrar sesión</button></div>
  </section>;
}

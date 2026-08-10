import { FormEvent, useEffect, useMemo, useState } from 'react';
import { isNetworkError, type User } from './api';
import {
  getClient, getProspect, hasCrmCache, hasProspectDetailCache, listClients, readCrmCache,
  readProspectInteractionsCache, saveClient, type Client, type Interaction,
} from './crm-api';
import { formatDate, toDateInput } from './dates';
import { Badge, InteractionTimeline, State } from './Prospects';
import { markSaved, queueChange, useSyncState } from './sync';
import GeoFields from './GeoFields';
import { countryName, DEFAULT_COUNTRY } from './geo';

export default function Clients({ user, isAdmin, onOpenProspect }: { user: User; isAdmin: boolean; onOpenProspect: (id: string) => void }) {
  const [items, setItems] = useState<Client[]>(() => readCrmCache(user.dni, 'clients', [])); const [selected, setSelected] = useState<Client | null>(null); const [query, setQuery] = useState(''); const [agent, setAgent] = useState(''); const [loading, setLoading] = useState(!hasCrmCache(user.dni, 'clients')); const [error, setError] = useState('');
  const syncState = useSyncState();
  useEffect(() => { listClients(user.dni).then(setItems).catch((cause) => setError(cause instanceof Error ? cause.message : 'No se pudo cargar la cartera.')).finally(() => setLoading(false)); }, [user.dni]);
  useEffect(() => { if (syncState.dataVersion) setItems(readCrmCache(user.dni, 'clients', [])); }, [syncState.dataVersion, user.dni]);
  const agents = useMemo(() => Array.from(new Map(items.filter((item) => item.agenteDni || item.agenteNombre).map((item) => [item.agenteDni || item.agenteNombre, item.agenteNombre || item.agenteDni])).entries()).map(([dni, nombre]) => ({ dni, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [items]);
  const filtered = useMemo(() => items.filter((item) => `${item.nombre} ${item.documento} ${item.telefono}`.toLowerCase().includes(query.toLowerCase()) && (!agent || item.agenteDni === agent || (!item.agenteDni && item.agenteNombre === agent))), [items, query, agent]);
  const replace = (saved: Client) => { setItems((current) => current.map((row) => row.id === saved.id ? saved : row)); setSelected(saved); };
  const saved = (client: Client) => { replace(client); markSaved(); };
  const openProspect = (client: Client) => {
    if (!client.prospectoId) {
      setError('Este cliente no tiene un prospecto de origen asociado.');
      return;
    }
    onOpenProspect(client.prospectoId);
  };

  const content = selected
    ? <ClientDetail client={selected} dni={user.dni} onBack={() => setSelected(null)} onLoaded={replace} onSaved={saved} />
    : <section className="page-content crm-page crm-clients-list"><p className="eyebrow dark">CARTERA COMERCIAL</p><h1>Clientes</h1><p className="subtitle">Información complementaria y notas de fidelización de las conversiones.</p><div className={`crm-filters crm-client-filter${isAdmin ? ' is-admin' : ''}`}><label className="crm-search"><span>Buscar</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre, documento o teléfono" /></label>{isAdmin && <label><span>Agente</span><select value={agent} onChange={(e) => setAgent(e.target.value)}><option value="">Todos los agentes</option>{agents.map((item) => <option value={item.dni} key={item.dni}>{item.nombre}</option>)}</select></label>}</div>{error && <p className="form-error">{error}</p>}{loading ? <State icon="progress_activity" title="Cargando clientes" text="Consultando la cartera…" spin /> : !filtered.length ? <State icon="groups" title="Sin clientes" text="Los prospectos convertidos aparecerán aquí." /> : <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Cliente</th><th>Estado</th><th>Fecha de cierre</th>{isAdmin && <th>Agente</th>}</tr></thead><tbody>{filtered.map((item) => <tr key={item.id} tabIndex={0} onClick={() => openProspect(item)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProspect(item); } }}><td data-label="Cliente"><b>{item.nombre}</b><small>{item.documento || item.telefono}</small></td><td data-label="Estado"><Badge value={item.estado} /></td><td data-label="Fecha de cierre">{formatDate(item.fechaCierre)}</td>{isAdmin && <td data-label="Agente">{item.agenteNombre || item.agenteDni}</td>}</tr>)}</tbody></table></div>}</section>;

  return <div className="page-transition crm-inner-transition" key={selected ? `detail-${selected.id}` : 'list'}>{content}</div>;
}

function normalizeClient(client: Client): Client {
  return { ...client, pais: client.pais || DEFAULT_COUNTRY, departamento: client.departamento || '', provincia: client.provincia || '', distrito: client.distrito || '', direccion: client.direccion || '' };
}

function ClientDetail({ client, dni, onBack, onLoaded, onSaved }: { client: Client; dni: string; onBack: () => void; onLoaded: (client: Client) => void; onSaved: (client: Client) => void }) {
  const [current, setCurrent] = useState(client); const [form, setForm] = useState(() => normalizeClient(client)); const [editing, setEditing] = useState(false); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [interactions, setInteractions] = useState<Interaction[]>(() => client.prospectoId ? readProspectInteractionsCache(dni, client.prospectoId) : []);
  const [historyLoading, setHistoryLoading] = useState(() => Boolean(client.prospectoId) && !hasProspectDetailCache(dni, client.prospectoId));
  const [historyError, setHistoryError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getClient(dni, client.id)
      .then((fresh) => { if (!active) return; setCurrent(fresh); setForm(normalizeClient(fresh)); onLoaded(fresh); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el detalle del cliente.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client.id, dni]);
  useEffect(() => {
    let active = true;
    if (!current.prospectoId) {
      setInteractions([]); setHistoryLoading(false); setHistoryError('Este cliente no tiene un prospecto de origen asociado.');
      return () => { active = false; };
    }
    setInteractions(readProspectInteractionsCache(dni, current.prospectoId));
    setHistoryLoading(!hasProspectDetailCache(dni, current.prospectoId));
    setHistoryError('');
    getProspect(dni, current.prospectoId)
      .then((data) => { if (active) setInteractions(data.interactions); })
      .catch((cause) => { if (active) setHistoryError(cause instanceof Error ? cause.message : 'No se pudo cargar el historial comercial.'); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [current.prospectoId, dni]);
  const update = (key: keyof Client, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(''); try { const saved = await saveClient(dni, form); setCurrent(saved); setForm(normalizeClient(saved)); onSaved(saved); setEditing(false); } catch (cause) { if (isNetworkError(cause)) { queueChange({ kind: 'guardar-cliente', label: `Cliente modificado ${form.nombre}`, payload: form }); setError('El cambio quedó pendiente y se enviará al recuperar conexión.'); } else setError(cause instanceof Error ? cause.message : 'No se pudo guardar el cliente.'); } finally { setSaving(false); } };
  return <section className="page-content crm-page" aria-busy={loading}>
    <button type="button" className="back-button" onClick={onBack}><span className="material-symbols-outlined">arrow_back</span>Volver a clientes</button>
    <div className="crm-heading"><div><p className="eyebrow dark">DETALLE DEL CLIENTE</p><h1>{current.nombre}</h1><p className="subtitle">Cliente desde {formatDate(current.fechaCierre)}</p></div>{!editing && <button type="button" className="primary-button" disabled={loading} onClick={() => { setForm(normalizeClient(current)); setEditing(true); }}><span className={`material-symbols-outlined${loading ? ' is-spinning' : ''}`}>{loading ? 'progress_activity' : 'edit'}</span>{loading ? 'Cargando datos…' : 'Editar datos'}</button>}</div>
    {error && <p className="form-error">{error}</p>}
    {editing ? <form className="crm-form ds-panel" onSubmit={submit}>
      <label>Nombre *<input required value={form.nombre} onChange={(e) => update('nombre', e.target.value)} /></label><label>Documento<input value={form.documento} onChange={(e) => update('documento', e.target.value)} /></label>
      <label>Teléfono *<input required value={form.telefono} onChange={(e) => update('telefono', e.target.value)} /></label><label>Correo<input type="email" value={form.correo} onChange={(e) => update('correo', e.target.value)} /></label>
      <label>Fecha de nacimiento<input type="date" value={toDateInput(form.fechaNacimiento)} onChange={(e) => update('fechaNacimiento', e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></label><label>Profesión<input value={form.profesion} onChange={(e) => update('profesion', e.target.value)} /></label>
      <GeoFields value={form} onChange={(geo) => setForm((current) => ({ ...current, ...geo }))} disabled={saving} />
      <label className="span-2">Dirección<input value={form.direccion} onChange={(e) => update('direccion', e.target.value)} /></label>
      <label>Estado<select value={form.estado} onChange={(e) => update('estado', e.target.value)}><option value="ACTIVO">ACTIVO</option><option value="INACTIVO">INACTIVO</option></select></label>
      <label className="span-2">Notas de fidelización<textarea rows={5} value={form.notas} onChange={(e) => update('notas', e.target.value)} /></label>
      <div className="form-buttons span-2"><button type="button" className="back-button" onClick={() => { setForm(normalizeClient(current)); setEditing(false); }}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
    </form> : <div className="crm-detail-grid"><section className="ds-panel crm-info"><h2>Información principal</h2><dl>
      <Info label="Documento" value={current.documento} /><Info label="Teléfono" value={current.telefono} /><Info label="Correo" value={current.correo} /><Info label="Nacimiento" value={current.fechaNacimiento ? formatDate(current.fechaNacimiento) : ''} /><Info label="Profesión" value={current.profesion} />
      <Info label="País" value={countryName(current.pais || DEFAULT_COUNTRY)} /><Info label="Departamento / Estado" value={current.departamento} />{current.provincia && <Info label="Provincia" value={current.provincia} />}<Info label="Distrito / Ciudad" value={current.distrito} /><Info label="Dirección" value={current.direccion} />
      <Info label="Agente" value={current.agenteNombre || current.agenteDni} /><Info label="Estado" value={current.estado} />
    </dl></section><div className="crm-history-stack">
      <section className="ds-panel crm-history"><h2>Notas de fidelización</h2><p className="notes-text">{current.notas || 'Sin notas registradas.'}</p></section>
      <section className="ds-panel crm-history" aria-busy={historyLoading}><h2>Historial comercial</h2>
        {historyError && <p className="form-error" role="alert">{historyError}</p>}
        {historyLoading && !interactions.length
          ? <State icon="progress_activity" title="Cargando historial" text="Consultando interacciones…" spin />
          : <InteractionTimeline items={interactions} emptyTitle="Sin interacciones" emptyText="Este cliente todavía no tiene contactos registrados." />}
      </section>
    </div></div>}
  </section>;
}
function Info({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value || '—'}</dd></div>; }

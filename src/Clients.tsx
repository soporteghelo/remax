import { FormEvent, useEffect, useMemo, useState } from 'react';
import { isNetworkError, type User } from './api';
import {
  getClient, getProspect, hasCrmCache, hasProspectDetailCache, listClients, readCrmCache,
  readProspectInteractionsCache, saveClient, type Client, type Interaction,
} from './crm-api';
import { formatDate, toDateInput } from './dates';
import { Badge, InteractionTimeline, State } from './Prospects';
import { markSaved, queueChange, useSyncState } from './sync';

const CAPTURE_STATE_OPTIONS = ['EN PRECIO', 'HASTA 20% SOBRE PRECIO', 'SOBREPRECIO', 'DESISTIÓ', 'SIN DEFINIR'];
type ClientSortKey = 'nombre' | 'telefono' | 'correo' | 'canal' | 'fechaCierre' | 'estadoCaptacion' | 'cierreVenta' | 'agente';
const clientText = (value: unknown): string => typeof value === 'string' ? value : '';
const clientCaptureState = (client: Partial<Client>): string => clientText(client.estadoCaptacion).trim() || 'SIN DEFINIR';

export default function Clients({ user, isAdmin, onOpenProspect }: { user: User; isAdmin: boolean; onOpenProspect: (id: string) => void }) {
  const [items, setItems] = useState<Client[]>(() => readCrmCache(user.dni, 'clients', [])); const [selected, setSelected] = useState<Client | null>(null); const [query, setQuery] = useState(''); const [captureState, setCaptureState] = useState(''); const [canal, setCanal] = useState(''); const [agent, setAgent] = useState(''); const [filtersOpen, setFiltersOpen] = useState(false); const [sortKey, setSortKey] = useState<ClientSortKey | null>(null); const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc'); const [loading, setLoading] = useState(!hasCrmCache(user.dni, 'clients')); const [error, setError] = useState('');
  const syncState = useSyncState();
  useEffect(() => { listClients(user.dni).then((data) => setItems(Array.isArray(data) ? data : [])).catch((cause) => setError(cause instanceof Error ? cause.message : 'No se pudo cargar la cartera.')).finally(() => setLoading(false)); }, [user.dni]);
  useEffect(() => { if (syncState.dataVersion) { const cached = readCrmCache<unknown>(user.dni, 'clients', []); setItems(Array.isArray(cached) ? cached as Client[] : []); } }, [syncState.dataVersion, user.dni]);
  const clientRows = Array.isArray(items) ? items : [];
  const agents = useMemo(() => Array.from(new Map(clientRows.filter((item) => clientText(item.agenteDni) || clientText(item.agenteNombre)).map((item) => { const dni = clientText(item.agenteDni) || clientText(item.agenteNombre); return [dni, clientText(item.agenteNombre) || dni]; })).entries()).map(([dni, nombre]) => ({ dni, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [clientRows]);
  const captureStates = useMemo(() => Array.from(new Set([...CAPTURE_STATE_OPTIONS, ...clientRows.map(clientCaptureState)])).sort((a, b) => a.localeCompare(b, 'es')), [clientRows]);
  const channels = useMemo(() => Array.from(new Set(clientRows.map((item) => clientText(item.canal).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')), [clientRows]);
  const hasActiveFilters = Boolean(query.trim() || captureState || canal || agent);
  const activeFiltersCount = [query.trim(), captureState, canal, agent].filter(Boolean).length;
  const clearFilters = () => { setQuery(''); setCaptureState(''); setCanal(''); setAgent(''); };
  const filtered = useMemo(() => clientRows.filter((item) => {
    const itemCaptureState = clientCaptureState(item);
    return `${clientText(item.nombre)} ${clientText(item.documento)} ${clientText(item.telefono)}`.toLowerCase().includes(query.toLowerCase())
      && (!captureState || itemCaptureState === captureState)
      && (!canal || clientText(item.canal) === canal)
      && (!agent || clientText(item.agenteDni) === agent || (!clientText(item.agenteDni) && clientText(item.agenteNombre) === agent));
  }), [clientRows, query, captureState, canal, agent]);
  const ordered = useMemo(() => {
    if (!sortKey) return filtered;
    const value = (item: Client): string => ({
      nombre: clientText(item.nombre), telefono: clientText(item.telefono), correo: clientText(item.correo), canal: clientText(item.canal),
      fechaCierre: clientText(item.fechaCierre), estadoCaptacion: clientCaptureState(item), cierreVenta: clientText(item.cierreVenta), agente: clientText(item.agenteNombre) || clientText(item.agenteDni),
    })[sortKey];
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((left, right) => {
      if (sortKey === 'fechaCierre' || sortKey === 'cierreVenta') {
        const leftDate = Date.parse(value(left)); const rightDate = Date.parse(value(right));
        if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) return (leftDate - rightDate) * multiplier;
        if (!Number.isNaN(leftDate)) return -1 * multiplier;
        if (!Number.isNaN(rightDate)) return multiplier;
      }
      return value(left).localeCompare(value(right), 'es', { sensitivity: 'base', numeric: true }) * multiplier;
    });
  }, [filtered, sortKey, sortDirection]);
  const toggleSort = (nextKey: ClientSortKey) => {
    if (sortKey === nextKey) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else { setSortKey(nextKey); setSortDirection('asc'); }
  };
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
    : <section className="page-content crm-page crm-clients-list"><p className="eyebrow dark">CARTERA COMERCIAL</p><h1>Clientes</h1><p className="subtitle">Información complementaria y notas de fidelización de las conversiones.</p><button className="crm-mobile-filter-toggle" type="button" aria-expanded={filtersOpen} aria-controls="client-filters" onClick={() => setFiltersOpen((current) => !current)}><span className="material-symbols-outlined" aria-hidden="true">filter_list</span><span>Filtros</span>{hasActiveFilters && <small aria-label={`${activeFiltersCount} filtro(s) activo(s)`}>{activeFiltersCount}</small>}<span className="material-symbols-outlined" aria-hidden="true">{filtersOpen ? 'expand_less' : 'expand_more'}</span></button><div id="client-filters" className={`crm-filters crm-client-filter${isAdmin ? ' is-admin' : ''}${filtersOpen ? ' is-open' : ' is-collapsed'}`}><label className="crm-search"><span>Buscar</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre, documento o teléfono" /></label><label><span>Estado de captación</span><select value={captureState} onChange={(e) => setCaptureState(e.target.value)}><option value="">Todos los estados</option>{captureStates.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label><span>Canal</span><select value={canal} onChange={(e) => setCanal(e.target.value)}><option value="">Todos los canales</option>{channels.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>{isAdmin && <label><span>Agente</span><select value={agent} onChange={(e) => setAgent(e.target.value)}><option value="">Todos los agentes</option>{agents.map((item) => <option value={item.dni} key={item.dni}>{item.nombre}</option>)}</select></label>}<button className="crm-clear-filters" type="button" onClick={clearFilters} disabled={!hasActiveFilters} aria-label="Reiniciar todos los filtros"><span className="material-symbols-outlined" aria-hidden="true">filter_alt_off</span><span>Limpiar filtros</span></button></div>{error && <p className="form-error">{error}</p>}{loading ? <State icon="progress_activity" title="Cargando clientes" text="Consultando la cartera…" spin /> : !ordered.length ? <State icon="groups" title="Sin clientes" text="Los prospectos convertidos aparecerán aquí." /> : <div className="crm-table-wrap"><table className="crm-table"><thead><tr><ClientSortHeader label="Cliente" sortKey="nombre" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} /><ClientSortHeader label="Teléfono" sortKey="telefono" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} /><ClientSortHeader label="Correo" sortKey="correo" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} /><ClientSortHeader label="Canal" sortKey="canal" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} /><ClientSortHeader label="Fecha de cierre" sortKey="fechaCierre" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} /><ClientSortHeader label="Estado de captación" sortKey="estadoCaptacion" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} /><ClientSortHeader label="Cierre de venta" sortKey="cierreVenta" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />{isAdmin && <ClientSortHeader label="Agente" sortKey="agente" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />}</tr></thead><tbody>{ordered.map((item) => <tr key={clientText(item.id)} tabIndex={0} onClick={() => openProspect(item)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProspect(item); } }}><td data-label="Cliente"><b>{clientText(item.nombre)}</b><small>{clientText(item.documento)}</small></td><td data-label="Teléfono">{clientText(item.telefono) || '—'}</td><td data-label="Correo">{clientText(item.correo) || '—'}</td><td data-label="Canal">{clientText(item.canal) || '—'}</td><td data-label="Fecha de cierre">{formatDate(item.fechaCierre)}</td><td data-label="Estado de captación"><Badge value={clientCaptureState(item)} /></td><td data-label="Cierre de venta">{formatDate(item.cierreVenta)}</td>{isAdmin && <td data-label="Agente">{clientText(item.agenteNombre) || clientText(item.agenteDni)}</td>}</tr>)}</tbody></table></div>}</section>;

  return <div className="page-transition crm-inner-transition" key={selected ? `detail-${selected.id}` : 'list'}>{content}</div>;
}

function ClientSortHeader({ label, sortKey, activeKey, direction, onSort }: { label: string; sortKey: ClientSortKey; activeKey: ClientSortKey | null; direction: 'asc' | 'desc'; onSort: (key: ClientSortKey) => void }) {
  const active = activeKey === sortKey;
  return <th aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button className={`crm-sort-button${active ? ' is-active' : ''}`} type="button" onClick={() => onSort(sortKey)}>{label}<span className="material-symbols-outlined" aria-hidden="true">{active ? direction === 'asc' ? 'arrow_upward' : 'arrow_downward' : 'unfold_more'}</span></button></th>;
}

function normalizeClient(client: Client): Client {
  return { ...client, distrito: client.distrito || '', direccion: client.direccion || '' };
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
      <label>Distrito<input value={form.distrito} onChange={(e) => update('distrito', e.target.value)} placeholder="Escribe el distrito" disabled={saving} /></label>
      <label className="span-2">Dirección<input value={form.direccion} onChange={(e) => update('direccion', e.target.value)} /></label>
      <label>Estado<select value={form.estado} onChange={(e) => update('estado', e.target.value)}><option value="ACTIVO">ACTIVO</option><option value="INACTIVO">INACTIVO</option></select></label>
      <label className="span-2">Notas de fidelización<textarea rows={5} value={form.notas} onChange={(e) => update('notas', e.target.value)} /></label>
      <div className="form-buttons span-2"><button type="button" className="back-button" onClick={() => { setForm(normalizeClient(current)); setEditing(false); }}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
    </form> : <div className="crm-detail-grid"><section className="ds-panel crm-info"><h2>Información principal</h2><dl>
      <Info label="Documento" value={current.documento} /><Info label="Teléfono" value={current.telefono} /><Info label="Correo" value={current.correo} /><Info label="Canal" value={current.canal} /><Info label="Nacimiento" value={current.fechaNacimiento ? formatDate(current.fechaNacimiento) : ''} /><Info label="Profesión" value={current.profesion} />
      <Info label="Distrito" value={current.distrito} /><Info label="Dirección" value={current.direccion} />
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

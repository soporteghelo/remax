import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isNetworkError, isTimeoutError, type User } from './api';
import {
  addInteraction, convertProspect, convertProspectToClient, exportProspects, getProspect, hasCrmCache, hasProspectDetailCache, listAgents, listCatalogs, listProspects,
  markProspectNoContinue, readCatalogCache, readCrmCache, readProspectInteractionsCache, reassignProspect, restoreProspectStage, saveProspect, type CatalogItem, type ConvertDetails, type CustomField, type Interaction, type Prospect, type ProspectInput,
} from './crm-api';
import { formatDate as formatDateOnly, formatDateTime, toDateTimeInput } from './dates';
import GeoFields, { type GeoValue } from './GeoFields';
import { countryName, DEFAULT_COUNTRY, levelsFor } from './geo';
import { markSaved, queueChange, useSyncState } from './sync';

type View = { name: 'list' } | { name: 'create' } | { name: 'detail'; id: string } | { name: 'edit'; id: string };
type ProspectSortKey = 'nombre' | 'estado' | 'canal' | 'proximoContacto' | 'agente' | 'etapa';
const EMPTY: ProspectInput = { nombre: '', documento: '', telefono: '', correo: '', canal: '', observaciones: '' };
const OTHER_MEDIUM = '__OTRO__';

/** Solo los datos editables del prospecto; estado, resultado y próxima fecha se gestionan desde sus interacciones. */
function prospectInput(item: Prospect): ProspectInput {
  return { id: item.id, nombre: item.nombre, documento: item.documento, telefono: item.telefono, correo: item.correo, canal: item.canal, agenteDni: item.agenteDni, observaciones: item.observaciones, camposPersonalizados: item.camposPersonalizados };
}

const activeOptions = (catalogs: CatalogItem[], type: string): CatalogItem[] => catalogs.filter((item) => item.tipo === type && item.activo);
const interactionContactDate = (item: Interaction): string => item.fechaHoraContacto || item.fechaHora || '';
/**
 * La etiqueta del catálogo es el valor que se guarda: se conserva la del registro
 * mientras siga existiendo y, si el administrador la quitó o renombró, se propone
 * la primera opción activa en lugar de dejar el desplegable en blanco.
 */
function pickOption(catalogs: CatalogItem[], type: string, current: string): string {
  const options = activeOptions(catalogs, type);
  return options.some((item) => item.etiqueta === current) ? current : (options[0]?.etiqueta ?? '');
}
function messageOf(cause: unknown): string { return cause instanceof Error ? cause.message : 'No se pudo completar la operación.'; }
const formatDate = (value: string): string => formatDateTime(value, 'Sin programar');
function tone(value: string): string {
  const text = value.toUpperCase();
  if (/GANADO|CONVERTIDO|CERRADO|CAPTADO/.test(text)) return 'is-success';
  if (/PERDIDO|DESCARTADO|VENCIDO|NO CONTINUA/.test(text)) return 'is-danger';
  if (/SEGUIMIENTO|PENDIENTE/.test(text)) return 'is-warning';
  return 'is-neutral';
}

export default function Prospects({ user, isAdmin, initialId = '' }: { user: User; isAdmin: boolean; initialId?: string }) {
  const [view, setView] = useState<View>(initialId ? { name: 'detail', id: initialId } : { name: 'list' });
  const [items, setItems] = useState<Prospect[]>(() => readCrmCache(user.dni, 'prospects', []));
  const [catalogs, setCatalogs] = useState<CatalogItem[]>(() => readCatalogCache(user.dni));
  const [agents, setAgents] = useState<User[]>([]);
  const [loading, setLoading] = useState(!hasCrmCache(user.dni, 'prospects'));
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const syncState = useSyncState();

  const refresh = async () => {
    setError('');
    try {
      const [prospects, nextCatalogs, nextAgents] = await Promise.all([
        listProspects(user.dni), listCatalogs(user.dni), isAdmin ? listAgents(user.dni) : Promise.resolve([]),
      ]);
      setItems(prospects); setCatalogs(nextCatalogs); setAgents(nextAgents);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    const refreshOnReturn = () => { if (!document.hidden) void refresh(); };
    void refresh();
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => { window.removeEventListener('focus', refreshOnReturn); document.removeEventListener('visibilitychange', refreshOnReturn); };
  }, [user.dni, isAdmin]);
  useEffect(() => {
    if (!syncState.dataVersion) return;
    setItems(readCrmCache(user.dni, 'prospects', []));
    setCatalogs(readCatalogCache(user.dni));
  }, [syncState.dataVersion, user.dni]);

  const saved = (item: Prospect, message = '') => {
    setItems((current) => [item, ...current.filter((row) => row.id !== item.id)]);
    markSaved(); setConfirmation(message); setView({ name: 'detail', id: item.id });
  };

  let content: React.ReactNode;
  if (view.name === 'list') content = <ProspectList {...{ items, loading, error, catalogs, agents, isAdmin }} dni={user.dni} onNew={() => { setConfirmation(''); setView({ name: 'create' }); }} onOpen={(id) => { setConfirmation(''); setView({ name: 'detail', id }); }} />;
  else if (view.name === 'create') content = <ProspectForm value={EMPTY} dni={user.dni} catalogs={catalogs} agents={agents} isAdmin={isAdmin} onCancel={() => setView({ name: 'list' })} onSave={async (value) => saved(await saveProspect(user.dni, value), 'Prospecto guardado correctamente.')} />;
  else {
    const item = items.find((row) => row.id === view.id);
    if (!item) content = <State icon="search_off" title="Prospecto no disponible" text="Vuelve al listado y sincroniza los datos." action={() => setView({ name: 'list' })} />;
    else if (view.name === 'edit') content = <ProspectForm value={prospectInput(item)} dni={user.dni} catalogs={catalogs} agents={agents} isAdmin={isAdmin} onCancel={() => setView({ name: 'detail', id: item.id })} onSave={async (value) => saved(await saveProspect(user.dni, { ...value, id: item.id }), 'Cambios guardados correctamente.')} />;
    else content = <ProspectDetail prospect={item} user={user} isAdmin={isAdmin} catalogs={catalogs} agents={agents} confirmation={confirmation} onBack={() => { setConfirmation(''); setView({ name: 'list' }); }} onEdit={() => { setConfirmation(''); setView({ name: 'edit', id: item.id }); }} onChanged={saved} />;
  }
  return <div className="page-transition crm-inner-transition" key={`${view.name}-${'id' in view ? view.id : ''}`}>{content}</div>;
}

function ProspectList({ items, loading, error, catalogs, agents, isAdmin, dni, onNew, onOpen }: {
  items: Prospect[]; loading: boolean; error: string; catalogs: CatalogItem[]; agents: User[]; isAdmin: boolean; dni: string;
  onNew: () => void; onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState(''); const [estado, setEstado] = useState(''); const [etapa, setEtapa] = useState(''); const [resultado, setResultado] = useState(''); const [captado, setCaptado] = useState(''); const [agente, setAgente] = useState('');
  const [exporting, setExporting] = useState(false); const [exportError, setExportError] = useState(''); const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState<ProspectSortKey | null>(null); const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const hasActiveFilters = Boolean(query || estado || etapa || resultado || captado || agente);
  const activeFiltersCount = [query, estado, etapa, resultado, captado, agente].filter(Boolean).length;
  const clearFilters = () => { setQuery(''); setEstado(''); setEtapa(''); setResultado(''); setCaptado(''); setAgente(''); };
  const filtered = useMemo(() => items.filter((item) => {
    const haystack = `${item.nombre} ${item.documento} ${item.telefono}`.toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (!estado || item.estado === estado) && (!etapa || (item.etapa || 'PROSPECTO') === etapa) && (!resultado || item.resultado === resultado) && (!captado || item.captado === (captado === 'SI')) && (!agente || item.agenteDni === agente);
  }), [items, query, estado, etapa, resultado, captado, agente]);
  const ordered = useMemo(() => {
    if (!sortBy) return filtered;
    const value = (item: Prospect): string => ({ nombre: item.nombre, estado: item.estado, canal: item.canal, proximoContacto: item.proximoContacto, agente: item.agenteNombre || item.agenteDni, etapa: item.etapa || 'PROSPECTO' })[sortBy] || '';
    return [...filtered].sort((left, right) => {
      if (sortBy === 'proximoContacto') {
        const leftDate = Date.parse(value(left)); const rightDate = Date.parse(value(right));
        if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) return (leftDate - rightDate) * (sortDirection === 'asc' ? 1 : -1);
        if (!Number.isNaN(leftDate)) return -1;
        if (!Number.isNaN(rightDate)) return 1;
      }
      return value(left).localeCompare(value(right), 'es', { sensitivity: 'base', numeric: true }) * (sortDirection === 'asc' ? 1 : -1);
    });
  }, [filtered, sortBy, sortDirection]);
  const toggleSort = (key: ProspectSortKey) => { if (sortBy === key) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortBy(key); setSortDirection('asc'); } };
  const options = (type: string) => activeOptions(catalogs, type);
  const download = async () => {
    setExporting(true); setExportError('');
    try {
      const result = await exportProspects(dni, { estado, etapa, resultado, captado, agente });
      const url = URL.createObjectURL(new Blob(['\ufeff', result.csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = result.filename; link.click(); URL.revokeObjectURL(url);
    } catch (cause) { setExportError(messageOf(cause)); }
    finally { setExporting(false); }
  };
  return <section className={`page-content crm-page crm-prospects-list${isAdmin ? ' is-admin' : ''}`}>
    <div className="crm-heading"><div><p className="eyebrow dark">GESTIÓN COMERCIAL</p><h1>Prospectos</h1><p className="subtitle">Busca, filtra y continúa cada oportunidad desde su historial.</p></div><div className="crm-actions"><button className="back-button" type="button" disabled={exporting} onClick={() => void download()}><span className="material-symbols-outlined">download</span>{exporting ? 'Exportando…' : 'Exportar CSV'}</button><button className="primary-button crm-icon-button" type="button" onClick={onNew}><span className="material-symbols-outlined">person_add</span>Nuevo prospecto</button></div></div>
    <button className="crm-mobile-filter-toggle" type="button" aria-expanded={filtersOpen} aria-controls="prospect-filters" onClick={() => setFiltersOpen((current) => !current)}><span className="material-symbols-outlined">filter_list</span><span>Filtros</span>{hasActiveFilters && <small>{activeFiltersCount}</small>}<span className="material-symbols-outlined">{filtersOpen ? 'expand_less' : 'expand_more'}</span></button>
    <div id="prospect-filters" className={`crm-filters crm-prospect-filters${isAdmin ? ' is-admin' : ''}${filtersOpen ? ' is-open' : ' is-collapsed'}`}>
      <label className="crm-search"><span>Buscar</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre, documento o teléfono" /></label>
      <Filter label="Resultado de la cita" value={estado} onChange={setEstado} items={options('RESULTADO CITA')} />
      <label><span>Etapa</span><select value={etapa} onChange={(e) => setEtapa(e.target.value)}><option value="">Todos</option><option value="PROSPECTO">PROSPECTO</option><option value="NEGOCIACION">NEGOCIACION</option><option value="CLIENTE">CLIENTE</option><option value="NO CONTINUA">NO CONTINUA</option></select></label>
      <Filter label="Resultado" value={resultado} onChange={setResultado} items={options('RESULTADO')} />
      <div className="crm-captured-filter"><span>Usuario captado</span><div role="group" aria-label="Filtrar por usuario captado">
        {[{ value: '', label: 'Ambos' }, { value: 'SI', label: 'Sí' }, { value: 'NO', label: 'No' }].map((option) => <button type="button" className={captado === option.value ? 'is-active' : ''} aria-pressed={captado === option.value} onClick={() => setCaptado(option.value)} key={option.value || 'AMBOS'}>{option.label}</button>)}
      </div></div>
      {isAdmin && <label><span>Agente</span><select value={agente} onChange={(e) => setAgente(e.target.value)}><option value="">Todos</option>{agents.map((row) => <option value={row.dni} key={row.dni}>{row.nombres} {row.apellidos}</option>)}</select></label>}
      <button className="crm-clear-filters" type="button" onClick={clearFilters} disabled={!hasActiveFilters} aria-label="Eliminar todos los filtros"><span className="material-symbols-outlined">filter_alt_off</span><span>Limpiar filtros</span></button>
    </div>
    {(error || exportError) && <p className="form-error" role="alert">{error || exportError}</p>}
    {loading ? <State icon="progress_activity" title="Cargando prospectos" text="Consultando la operación comercial…" spin /> : !filtered.length ? <State icon="person_search" title="Sin prospectos" text={items.length ? 'No hay coincidencias con los filtros.' : 'Crea el primer prospecto para comenzar.'} action={!items.length ? onNew : undefined} /> :
      <div className="crm-table-wrap"><table className="crm-table"><thead><tr><SortHeader label="Prospecto" active={sortBy === 'nombre'} direction={sortDirection} onClick={() => toggleSort('nombre')} /><SortHeader label="Resultado de la cita" active={sortBy === 'estado'} direction={sortDirection} onClick={() => toggleSort('estado')} /><SortHeader label="Canal" active={sortBy === 'canal'} direction={sortDirection} onClick={() => toggleSort('canal')} /><SortHeader label="Próximo contacto" active={sortBy === 'proximoContacto'} direction={sortDirection} onClick={() => toggleSort('proximoContacto')} />{isAdmin && <SortHeader label="Agente" active={sortBy === 'agente'} direction={sortDirection} onClick={() => toggleSort('agente')} />}<SortHeader label="Etapa" active={sortBy === 'etapa'} direction={sortDirection} onClick={() => toggleSort('etapa')} /></tr></thead><tbody>{ordered.map((item) => <tr key={item.id} onClick={() => onOpen(item.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(item.id); }}><td data-label="Prospecto"><b>{item.nombre}</b><small>{item.documento || item.telefono}</small></td><td data-label="Resultado de la cita"><Badge value={item.estado} /></td><td data-label="Canal">{item.canal}</td><td data-label="Próximo contacto">{formatDate(item.proximoContacto)}</td>{isAdmin && <td data-label="Agente">{item.agenteNombre || item.agenteDni}</td>}<td data-label="Etapa"><StageBadge value={item.etapa || 'PROSPECTO'} /></td></tr>)}</tbody></table></div>}
  </section>;
}

function SortHeader({ label, active, direction, onClick }: { label: string; active: boolean; direction: 'asc' | 'desc'; onClick: () => void }) {
  return <th aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button className={`crm-sort-button${active ? ' is-active' : ''}`} type="button" onClick={onClick}>{label}<span className="material-symbols-outlined" aria-hidden="true">{active ? direction === 'asc' ? 'arrow_upward' : 'arrow_downward' : 'unfold_more'}</span></button></th>;
}

function Filter({ label, value, onChange, items }: { label: string; value: string; onChange: (value: string) => void; items: CatalogItem[] }) {
  return <label><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}><option value="">Todos</option>{items.map((item) => <option value={item.etiqueta} key={item.etiqueta}>{item.etiqueta}</option>)}</select></label>;
}

function ProspectForm({ value, dni, catalogs, agents, isAdmin, onCancel, onSave }: { value: ProspectInput; dni: string; catalogs: CatalogItem[]; agents: User[]; isAdmin: boolean; onCancel: () => void; onSave: (value: ProspectInput) => Promise<void> }) {
  const [form, setForm] = useState<ProspectInput>({ ...value }); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const update = (key: keyof ProspectInput, next: string) => setForm((current) => ({ ...current, [key]: next }));
  const options = (type: string) => activeOptions(catalogs, type);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!form.nombre.trim() || !form.telefono.trim()) return setError('Nombre y teléfono son obligatorios.');
    if (form.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo)) return setError('Ingresa un correo válido.');
    setSaving(true); try { await onSave(form); } catch (cause) {
      if (isNetworkError(cause)) { queueChange({ kind: 'guardar-prospecto', label: `${form.id ? 'Prospecto modificado' : 'Nuevo prospecto'} ${form.nombre}`, payload: form }); setError('El cambio quedó pendiente en este dispositivo. La nube lo enviará al recuperar conexión.'); }
      // Reintentar por nuestra cuenta duplicaría el registro: el servidor pudo haberlo guardado ya.
      else if (isTimeoutError(cause)) setError('El servicio tardó demasiado en responder. Vuelve al listado y sincroniza para comprobar si el prospecto ya se guardó antes de intentarlo de nuevo.');
      else setError(messageOf(cause));
    } finally { setSaving(false); }
  };
  return <section className="page-content crm-page"><button type="button" className="back-button" onClick={onCancel}><span className="material-symbols-outlined">arrow_back</span>Volver</button><p className="eyebrow dark">{value.id ? 'EDICIÓN' : 'NUEVO REGISTRO'}</p><h1>{value.id ? 'Editar prospecto' : 'Nuevo prospecto'}</h1><p className="subtitle">Los campos con * son obligatorios.</p>
    <form className="crm-form ds-panel" onSubmit={submit}>
      <label>Nombre completo *<input required value={form.nombre} onChange={(e) => update('nombre', e.target.value)} autoFocus /></label>
      <label>Documento<input value={form.documento} onChange={(e) => update('documento', e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" maxLength={8} /></label>
      <label>Teléfono *<input required value={form.telefono} onChange={(e) => update('telefono', e.target.value.replace(/\D/g, '').slice(0, 9))} inputMode="numeric" maxLength={9} /></label>
      <label>Correo<input value={form.correo} onChange={(e) => update('correo', e.target.value)} type="email" /></label>
      <label>Canal *<select required value={form.canal} onChange={(e) => update('canal', e.target.value)}><option value="">Selecciona</option>{options('CANAL').map((row) => <option value={row.etiqueta} key={row.etiqueta}>{row.etiqueta}</option>)}</select></label>
      {isAdmin && <label>Agente asignado<select value={form.agenteDni || ''} onChange={(e) => update('agenteDni', e.target.value)}><option value="">Asignarme a mí</option>{agents.filter((row) => row.estado === 'ACTIVO').map((row) => <option value={row.dni} key={row.dni}>{row.nombres} {row.apellidos}</option>)}</select></label>}
      <label className="span-2">Observaciones<textarea value={form.observaciones} onChange={(e) => update('observaciones', e.target.value)} rows={4} /></label>
      {error && <p className="form-error span-2" role="alert">{error}</p>}
      <div className="form-buttons span-2"><button type="button" className="back-button" onClick={onCancel}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? 'Guardando…' : 'Guardar prospecto'}</button></div>
    </form>
  </section>;
}

function ProspectDetail({ prospect, user, isAdmin, catalogs, agents, confirmation, onBack, onEdit, onChanged }: { prospect: Prospect; user: User; isAdmin: boolean; catalogs: CatalogItem[]; agents: User[]; confirmation: string; onBack: () => void; onEdit: () => void; onChanged: (prospect: Prospect, message?: string) => void }) {
  const [interactions, setInteractions] = useState<Interaction[]>(() => readProspectInteractionsCache(user.dni, prospect.id)); const [historyLoading, setHistoryLoading] = useState(() => !hasProspectDetailCache(user.dni, prospect.id)); const [error, setError] = useState(''); const [showInteraction, setShowInteraction] = useState(false); const [showConvert, setShowConvert] = useState(false); const [showCapturedDetails, setShowCapturedDetails] = useState(false); const [showClientData, setShowClientData] = useState(false); const [showClientConfirm, setShowClientConfirm] = useState(false); const [busy, setBusy] = useState(false); const [clientBusy, setClientBusy] = useState(false); const [stageBusy, setStageBusy] = useState(false);
  const interactionSectionRef = useRef<HTMLElement>(null);
  const latestInteraction = interactions[0];
  const captured = Boolean(prospect.captado || prospect.clienteId);
  const historicalInteractions = interactions.filter((item) => item.etapa !== 'NEGOCIACION' && item.etapa !== 'CLIENTE' && item.etapa !== 'NO CONTINUA');
  const negotiationInteractions = interactions.filter((item) => item.etapa === 'NEGOCIACION' || item.etapa === 'CLIENTE' || item.etapa === 'NO CONTINUA');
  const displayedResult = latestInteraction?.resultado ?? '';
  const displayedState = latestInteraction?.estadoResultante ?? '';
  const displayedNextContact = latestInteraction?.proximoContacto ?? '';
  const currentStage = (prospect.etapa || latestInteraction?.etapa || '').toUpperCase();
  const isClient = displayedState.trim().toUpperCase() === 'CLIENTE' || currentStage === 'CLIENTE';
  const isNoContinue = currentStage === 'NO CONTINUA';
  const isNegotiating = currentStage === 'NEGOCIACION';
  const showStageActions = !isClient;
  useEffect(() => {
    if (showInteraction) interactionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showInteraction]);
  useEffect(() => {
    let active = true;
    const loadHistory = () => {
      if (document.hidden) return;
      getProspect(user.dni, prospect.id)
        .then((data) => { if (active) setInteractions(data.interactions); })
        .catch((cause) => { if (active) setError(messageOf(cause)); })
        .finally(() => { if (active) setHistoryLoading(false); });
    };
    loadHistory();
    const confirmationRefresh = window.setTimeout(loadHistory, 3500);
    window.addEventListener('focus', loadHistory);
    document.addEventListener('visibilitychange', loadHistory);
    return () => { active = false; window.clearTimeout(confirmationRefresh); window.removeEventListener('focus', loadHistory); document.removeEventListener('visibilitychange', loadHistory); };
  }, [user.dni, prospect.id]);
  const reassign = async (agentDni: string) => { if (!agentDni || agentDni === prospect.agenteDni) return; setBusy(true); try { onChanged(await reassignProspect(user.dni, prospect.id, agentDni), 'Prospecto reasignado correctamente.'); markSaved(); } catch (cause) { setError(messageOf(cause)); } finally { setBusy(false); } };
  const convertToClient = async () => {
    setClientBusy(true); setError('');
    try {
      const saved = await convertProspectToClient(user.dni, prospect.id);
      if (saved.clientInteraction) setInteractions((current) => current.map((item) => item.id === saved.clientInteraction?.id ? saved.clientInteraction : item));
      setShowInteraction(false); markSaved(); onChanged(saved.prospect, 'Usuario captado convertido en cliente correctamente.');
    }
    catch (cause) {
      if (isNetworkError(cause)) { queueChange({ kind: 'convertir-cliente', label: `Conversión a cliente de ${prospect.nombre}`, payload: { id: prospect.id } }); setError('La conversión a cliente quedó pendiente y se enviará al recuperar conexión.'); }
      else if (isTimeoutError(cause)) setError('El servicio tardó demasiado en responder. Sincroniza para comprobar si el cliente ya se registró antes de repetir la conversión.');
      else setError(messageOf(cause));
    } finally { setClientBusy(false); }
  };
  const stopProspect = async () => {
    setStageBusy(true); setError('');
    try {
      const saved = await markProspectNoContinue(user.dni, prospect.id);
      setInteractions((current) => [saved.interaction, ...current.filter((item) => item.id !== saved.interaction.id)].sort((a, b) => new Date(interactionContactDate(b)).getTime() - new Date(interactionContactDate(a)).getTime()));
      setShowInteraction(false); markSaved(); onChanged(saved.prospect, 'Etapa actualizada a NO CONTINUA.');
    } catch (cause) {
      if (isNetworkError(cause)) { queueChange({ kind: 'marcar-no-continua', label: `Cierre de ${prospect.nombre} como NO CONTINUA`, payload: { id: prospect.id } }); setError('El cambio a NO CONTINUA quedó pendiente y se enviará al recuperar conexión.'); }
      else if (isTimeoutError(cause)) setError('El servicio tardó demasiado en responder. Sincroniza para comprobar si la etapa ya se actualizó.');
      else setError(messageOf(cause));
    } finally { setStageBusy(false); }
  };
  const restoreProspect = async () => {
    setStageBusy(true); setError('');
    try {
      const saved = await restoreProspectStage(user.dni, prospect.id);
      setInteractions((current) => [saved.interaction, ...current.filter((item) => item.id !== saved.interaction.id)].sort((a, b) => new Date(interactionContactDate(b)).getTime() - new Date(interactionContactDate(a)).getTime()));
      markSaved(); onChanged(saved.prospect, 'Etapa restaurada a PROSPECTO.');
    } catch (cause) {
      if (isNetworkError(cause)) { queueChange({ kind: 'restaurar-prospecto', label: `Reapertura de ${prospect.nombre} como PROSPECTO`, payload: { id: prospect.id } }); setError('El cambio a PROSPECTO quedó pendiente y se enviará al recuperar conexión.'); }
      else if (isTimeoutError(cause)) setError('El servicio tardó demasiado en responder. Sincroniza para comprobar si la etapa ya se restauró.');
      else setError(messageOf(cause));
    } finally { setStageBusy(false); }
  };
  const interactionSaved = (result: { prospect: Prospect; interaction: Interaction }) => {
    setInteractions((current) => [...current.filter((item) => item.id !== result.interaction.id), result.interaction].sort((a, b) => new Date(interactionContactDate(b)).getTime() - new Date(interactionContactDate(a)).getTime()));
    onChanged(result.prospect, captured ? 'Negociación registrada correctamente.' : 'Interacción registrada correctamente.');
    setShowInteraction(false);
  };
  return <section className="page-content crm-page"><button className="back-button" type="button" onClick={onBack}><span className="material-symbols-outlined">arrow_back</span>Volver al listado</button>
    <div className="crm-heading"><div><p className="eyebrow dark">DETALLE DEL PROSPECTO</p><h1>{prospect.nombre}</h1><p className="subtitle">Creado {formatDate(prospect.fechaCreacion)}</p></div><div className="crm-actions"><button className="back-button" type="button" onClick={onEdit}><span className="material-symbols-outlined">edit</span>Editar</button>{!isClient && !isNoContinue && <button className="primary-button" type="button" onClick={() => setShowInteraction(!showInteraction)}><span className="material-symbols-outlined">add_call</span>{captured ? 'Registrar negociación' : 'Registrar interacción'}</button>}</div></div>
    {confirmation && <p className="form-success" role="status"><span className="material-symbols-outlined">check_circle</span>{confirmation}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="crm-detail-grid"><section className="ds-panel crm-info"><div className="crm-info-heading"><h2>Información principal</h2>{captured && <button className="back-button crm-full-details-button" type="button" onClick={() => setShowCapturedDetails(true)}><span className="material-symbols-outlined">visibility</span>Ver detalles completos</button>}</div><dl><Field label="Documento" value={prospect.documento} /><Field label="Teléfono" value={prospect.telefono} /><Field label="Correo" value={prospect.correo} /><Field label="Canal" value={prospect.canal} /><Field label="Resultado de la cita" value={displayedState ? <Badge value={displayedState} /> : ''} /><Field label="Resultado" value={displayedResult} /><Field label="Agente" value={prospect.agenteNombre || prospect.agenteDni} /><Field label="Próximo contacto" value={displayedNextContact ? formatDate(displayedNextContact) : ''} /></dl>{prospect.observaciones && <div className="crm-notes"><b>Observaciones</b><p>{prospect.observaciones}</p></div>}
      {isAdmin && <label className="crm-reassign">Reasignar a<select value={prospect.agenteDni} disabled={busy} onChange={(e) => void reassign(e.target.value)}>{agents.filter((row) => row.estado === 'ACTIVO').map((row) => <option value={row.dni} key={row.dni}>{row.nombres} {row.apellidos}</option>)}</select></label>}
      {!captured && <div className="crm-convert crm-client-convert"><button className="success-button" type="button" onClick={() => setShowConvert(true)}><span className="material-symbols-outlined">verified</span>Convertir en usuario captado</button>{showConvert && <ConvertForm prospect={prospect} dni={user.dni} onCancel={() => setShowConvert(false)} onSaved={(result) => { if (result.capturedInteraction) setInteractions((current) => current.map((item) => item.id === result.capturedInteraction?.id ? result.capturedInteraction : item)); onChanged(result.prospect, 'Prospecto convertido en usuario captado.'); setShowConvert(false); }} />}</div>}
      {showStageActions && <div className="crm-convert crm-client-convert crm-stage-actions">{isNoContinue ? <button className="primary-button" type="button" disabled={stageBusy} onClick={() => void restoreProspect()}><span className="material-symbols-outlined">person</span>{stageBusy ? 'Actualizando…' : 'Prospecto'}</button> : <>{captured && <button className="success-button" type="button" disabled={clientBusy || stageBusy || !isNegotiating} title={!isNegotiating ? 'Registra primero una negociación para habilitar esta conversión.' : undefined} onClick={() => setShowClientData(true)}><span className="material-symbols-outlined">person_check</span>{clientBusy ? 'Convirtiendo…' : isNegotiating ? 'Convertir a cliente' : 'Disponible al negociar'}</button>}<button className="danger-button" type="button" disabled={clientBusy || stageBusy} onClick={() => void stopProspect()}><span className="material-symbols-outlined">person_cancel</span>{stageBusy ? 'Actualizando…' : 'No continúa'}</button></>}</div>}
      {isClient && <div className="crm-client-stamp" role="status" aria-label="Este usuario ya es cliente"><span className="material-symbols-outlined" aria-hidden="true">verified</span><div><strong>CLIENTE</strong><small>Conversión completada</small></div></div>}
    </section>
    <div className="crm-history-stack">
      <section className="ds-panel crm-history"><h2>Historial</h2>{!captured && showInteraction && <InteractionForm prospect={prospect} catalogs={catalogs} dni={user.dni} captured={false} onCancel={() => setShowInteraction(false)} onSaved={interactionSaved} />}{historyLoading && !interactions.length ? <State icon="progress_activity" title="Cargando historial" text="Consultando interacciones…" spin /> : <InteractionTimeline items={historicalInteractions} emptyTitle="Sin interacciones" emptyText="Registra el primer contacto comercial." />}</section>
      {captured && <section ref={interactionSectionRef} className="ds-panel crm-history crm-negotiation"><h2>NEGOCIACION</h2>{!isClient && !isNoContinue && showInteraction && <InteractionForm prospect={prospect} catalogs={catalogs} dni={user.dni} captured onCancel={() => setShowInteraction(false)} onSaved={interactionSaved} />}<InteractionTimeline items={negotiationInteractions} emptyTitle="Sin negociaciones" emptyText="Registra el primer contacto posterior a la captación." /></section>}
    </div></div>
    {showCapturedDetails && <CapturedProspectDetails prospect={prospect} dni={user.dni} catalogs={catalogs} agents={agents} isAdmin={isAdmin} onClose={() => setShowCapturedDetails(false)} onSaved={(saved) => onChanged(saved, 'Información del usuario actualizada correctamente.')} />}
    {showClientData && <CapturedProspectDetails conversion prospect={prospect} dni={user.dni} catalogs={catalogs} agents={agents} isAdmin={isAdmin} onClose={() => setShowClientData(false)} onSaved={(saved) => onChanged(saved)} onRequestConversion={() => { setShowClientData(false); setShowClientConfirm(true); }} />}
    {showClientConfirm && <ClientConversionConfirm prospect={prospect} onCancel={() => { setShowClientConfirm(false); setShowClientData(true); }} onConfirm={() => { setShowClientConfirm(false); void convertToClient(); }} />}
  </section>;
}

function ClientConversionConfirm({ prospect, onCancel, onConfirm }: { prospect: Prospect; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', closeOnEscape); };
  }, [onCancel]);
  return createPortal(<div className="crm-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="crm-modal crm-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="client-confirm-title" aria-describedby="client-confirm-description">
      <header className="crm-modal-header"><div><p className="eyebrow dark">CONFIRMACIÓN DE DATOS</p><h2 id="client-confirm-title">¿Los datos son correctos?</h2><p>Revisa la información antes de convertir.</p></div><button className="crm-modal-close" type="button" aria-label="Cancelar conversión" onClick={onCancel}><span className="material-symbols-outlined">close</span></button></header>
      <div className="crm-confirm-body"><dl className="crm-client-confirm-data"><Field label="Nombre completo" value={prospect.nombre} /><Field label="Documento" value={prospect.documento} /><Field label="Teléfono" value={prospect.telefono} /><Field label="Correo" value={prospect.correo} /><Field label="Profesión" value={prospect.profesion} /><Field label="Ubicación" value={[prospect.distrito, prospect.provincia, prospect.departamento].filter(Boolean).join(', ')} /><Field label="Dirección" value={prospect.direccion} /></dl><div className="crm-confirm-warning"><span className="material-symbols-outlined">warning</span><p id="client-confirm-description">Al confirmar, el usuario captado se convertirá definitivamente en cliente y la acción no podrá deshacerse.</p></div><div className="crm-confirm-actions"><button className="back-button" type="button" onClick={onCancel}>Volver y revisar</button><button className="danger-button" type="button" onClick={onConfirm}><span className="material-symbols-outlined">person_check</span>Confirmar y convertir</button></div></div>
    </section>
  </div>, document.body);
}

function whatsappNumber(contact: string): string {
  const digits = contact.replace(/\D/g, '');
  if (contact.trim().startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? digits : '';
  if (digits.length === 9) return `51${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : '';
}

function WhatsAppGlyph() {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.13h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.36c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.21-8.24 8.21Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z" /></svg>;
}

function ContactAction({ href, label, kind }: { href: string; label: string; kind: 'whatsapp' | 'email' }) {
  const content = kind === 'whatsapp' ? <WhatsAppGlyph /> : <span className="material-symbols-outlined" aria-hidden="true">mail</span>;
  if (!href) return <button className={`crm-contact-action is-${kind}`} type="button" aria-label={label} title={label} disabled>{content}</button>;
  return <a className={`crm-contact-action is-${kind}`} href={href} aria-label={label} title={label} target={kind === 'whatsapp' ? '_blank' : undefined} rel={kind === 'whatsapp' ? 'noopener noreferrer' : undefined}>{content}</a>;
}

function cleanCustomFields(fields: CustomField[]): CustomField[] {
  return fields
    .map((field) => ({ etiqueta: field.etiqueta.trim(), valor: field.valor.trim() }))
    .filter((field) => field.etiqueta || field.valor);
}

function customFieldsError(fields: CustomField[]): string {
  const cleaned = cleanCustomFields(fields);
  if (cleaned.some((field) => !field.etiqueta || !field.valor)) return 'Completa la etiqueta y el valor de cada campo adicional.';
  const labels = cleaned.map((field) => field.etiqueta.toLocaleLowerCase('es'));
  if (new Set(labels).size !== labels.length) return 'Cada campo adicional debe tener una etiqueta diferente.';
  return '';
}

function CustomFieldsEditor({ value, onChange, disabled, idPrefix, readOnly = false }: { value: CustomField[]; onChange: (value: CustomField[]) => void; disabled: boolean; idPrefix: string; readOnly?: boolean }) {
  const update = (index: number, key: keyof CustomField, next: string) => onChange(value.map((field, fieldIndex) => fieldIndex === index ? { ...field, [key]: next } : field));
  const remove = (index: number) => onChange(value.filter((_, fieldIndex) => fieldIndex !== index));
  return <section className="crm-custom-fields" aria-labelledby={`${idPrefix}-title`}>
    <div className="crm-custom-fields-heading"><div><h3 id={`${idPrefix}-title`}>Campos adicionales</h3><p>{readOnly ? 'Información personalizada del usuario.' : 'Agrega información libre mediante una etiqueta y su valor.'}</p></div>{!readOnly && <button className="back-button crm-add-custom-field" type="button" disabled={disabled || value.length >= 30} onClick={() => onChange([...value, { etiqueta: '', valor: '' }])}><span className="material-symbols-outlined" aria-hidden="true">add</span>Agregar campo</button>}</div>
    {!value.length ? <p className="crm-custom-fields-empty">Aún no hay campos adicionales.</p> : readOnly ? <dl className="crm-custom-fields-view">{value.map((field, index) => <div key={`${field.etiqueta}-${index}`}><dt>{field.etiqueta}</dt><dd>{field.valor}</dd></div>)}</dl> : <div className="crm-custom-fields-list">{value.map((field, index) => <div className="crm-custom-field-row" key={index}>
      <label htmlFor={`${idPrefix}-label-${index}`}><span>Etiqueta</span><input id={`${idPrefix}-label-${index}`} value={field.etiqueta} maxLength={80} disabled={disabled} placeholder="Ej. Empresa" onChange={(event) => update(index, 'etiqueta', event.target.value)} /></label>
      <label htmlFor={`${idPrefix}-value-${index}`}><span>Valor</span><input id={`${idPrefix}-value-${index}`} value={field.valor} maxLength={500} disabled={disabled} placeholder="Ej. Grupo RX" onChange={(event) => update(index, 'valor', event.target.value)} /></label>
      <button className="crm-delete-custom-field" type="button" disabled={disabled} aria-label={`Eliminar campo ${field.etiqueta || index + 1}`} title="Eliminar campo" onClick={() => remove(index)}><span className="material-symbols-outlined" aria-hidden="true">delete</span></button>
    </div>)}</div>}
  </section>;
}

type CapturedProspectForm = ProspectInput & Required<Pick<ProspectInput, 'fechaNacimiento' | 'profesion' | 'pais' | 'departamento' | 'provincia' | 'distrito' | 'direccion' | 'notas'>>;

function capturedProspectForm(prospect: Prospect): CapturedProspectForm {
  return {
    ...prospectInput(prospect),
    fechaNacimiento: prospect.fechaNacimiento,
    profesion: prospect.profesion,
    pais: prospect.pais || DEFAULT_COUNTRY,
    departamento: prospect.departamento,
    provincia: prospect.provincia,
    distrito: prospect.distrito,
    direccion: prospect.direccion,
    notas: prospect.notas,
    camposPersonalizados: (prospect.camposPersonalizados || []).map((field) => ({ ...field })),
  };
}

function normalizedCapturedForm(form: CapturedProspectForm): CapturedProspectForm {
  return {
    ...form,
    nombre: form.nombre.trim(), documento: form.documento.trim(), telefono: form.telefono.trim(), correo: form.correo.trim(), canal: form.canal.trim(),
    observaciones: form.observaciones.trim(), fechaNacimiento: form.fechaNacimiento.trim(), profesion: form.profesion.trim(), pais: form.pais.trim(),
    departamento: form.departamento.trim(), provincia: form.provincia.trim(), distrito: form.distrito.trim(), direccion: form.direccion.trim(), notas: form.notas.trim(),
    camposPersonalizados: cleanCustomFields(form.camposPersonalizados || []),
  };
}

function CapturedProspectDetails({ prospect, dni, catalogs, agents, isAdmin, conversion = false, onClose, onSaved, onRequestConversion }: { prospect: Prospect; dni: string; catalogs: CatalogItem[]; agents: User[]; isAdmin: boolean; conversion?: boolean; onClose: () => void; onSaved: (prospect: Prospect) => void; onRequestConversion?: (prospect: Prospect) => void }) {
  const [form, setForm] = useState<CapturedProspectForm>(() => capturedProspectForm(prospect));
  const [editing, setEditing] = useState(conversion);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const normalized = normalizedCapturedForm(form);
  const original = normalizedCapturedForm(capturedProspectForm(prospect));
  const dirty = JSON.stringify(normalized) !== JSON.stringify(original);
  const whatsapp = whatsappNumber(normalized.telefono);
  const validEmail = !normalized.correo || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.correo);
  const options = (type: string) => activeOptions(catalogs, type);
  const channelOptions = options('CANAL');
  const update = <K extends keyof CapturedProspectForm>(key: K, value: CapturedProspectForm[K]) => {
    setForm((current) => ({ ...current, [key]: value })); setConfirmation('');
  };
  const cancelEditing = () => { if (conversion) return onClose(); setForm(capturedProspectForm(prospect)); setEditing(false); setError(''); setConfirmation(''); };
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', closeOnEscape); };
  }, [onClose, saving]);
  useEffect(() => { setForm(capturedProspectForm(prospect)); }, [prospect]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setConfirmation('');
    if (!editing) return;
    if (!normalized.nombre || !normalized.telefono) return setError('El nombre y el teléfono son obligatorios.');
    if (!validEmail) return setError('Ingresa un correo válido.');
    if (!normalized.canal) return setError('Selecciona un canal.');
    const levels = levelsFor(normalized.pais || DEFAULT_COUNTRY);
    if (!normalized.fechaNacimiento || !normalized.profesion || !normalized.pais || !normalized.departamento || (levels.hasProvince && !normalized.provincia) || !normalized.distrito || !normalized.direccion) return setError('Completa todos los campos obligatorios del usuario captado.');
    const fieldsError = customFieldsError(form.camposPersonalizados || []); if (fieldsError) return setError(fieldsError);
    if (!dirty) { if (conversion) onRequestConversion?.(prospect); return; }
    setSaving(true);
    try {
      const saved = await saveProspect(dni, normalized);
      markSaved(); onSaved(saved);
      if (conversion) onRequestConversion?.(saved);
      else { setEditing(false); setConfirmation('Datos del usuario guardados correctamente.'); }
    } catch (cause) {
      if (isNetworkError(cause)) { queueChange({ kind: 'guardar-prospecto', label: `Datos de ${prospect.nombre}`, payload: normalized }); setError('El cambio quedó pendiente en este dispositivo. La nube lo enviará al recuperar conexión.'); }
      else if (isTimeoutError(cause)) setError('El servicio tardó demasiado en responder. Sincroniza para comprobar si los datos ya se guardaron antes de intentarlo otra vez.');
      else setError(messageOf(cause));
    } finally { setSaving(false); }
  };
  return createPortal(<div className="crm-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="crm-modal crm-details-modal" role="dialog" aria-modal="true" aria-labelledby="captured-details-title">
      <header className="crm-modal-header"><div><p className="eyebrow dark">{conversion ? 'CONVERTIR A CLIENTE' : 'USUARIO CAPTADO'}</p><h2 id="captured-details-title">{conversion ? 'Revisar datos del cliente' : editing ? 'Editar detalles' : 'Detalles completos'}</h2><p>{conversion ? 'Completa y verifica la información antes de continuar.' : form.nombre}</p></div><div className="crm-modal-header-actions">{!conversion && !editing && <button className="crm-modal-edit" type="button" aria-label="Editar todos los datos" title="Editar datos" onClick={() => { setEditing(true); setError(''); setConfirmation(''); }}><span className="material-symbols-outlined">edit</span></button>}<button className="crm-modal-close" type="button" aria-label="Cerrar detalles" disabled={saving} onClick={onClose}><span className="material-symbols-outlined">close</span></button></div></header>
      <form className="crm-captured-details" onSubmit={submit}>
        <dl>
          {editing ? <>
            <DetailInput label="Nombre completo *" value={form.nombre} disabled={saving} autoFocus onChange={(value) => update('nombre', value)} />
            <DetailInput label="Documento" value={form.documento} disabled={saving} inputMode="numeric" maxLength={8} onChange={(value) => update('documento', value.replace(/\D/g, '').slice(0, 8))} />
            <div className="crm-contact-field"><dt><label htmlFor="captured-phone">Teléfono *</label></dt><dd><div className="crm-contact-control"><input id="captured-phone" required value={form.telefono} onChange={(event) => update('telefono', event.target.value.replace(/\D/g, '').slice(0, 9))} inputMode="numeric" maxLength={9} disabled={saving} /><ContactAction href={whatsapp ? `https://wa.me/${whatsapp}` : ''} label="Abrir chat de WhatsApp" kind="whatsapp" /></div></dd></div>
            <div className="crm-contact-field"><dt><label htmlFor="captured-email">Correo</label></dt><dd><div className="crm-contact-control"><input id="captured-email" value={form.correo} onChange={(event) => update('correo', event.target.value)} type="email" disabled={saving} /><ContactAction href={validEmail && normalized.correo ? `mailto:${normalized.correo}` : ''} label="Enviar correo" kind="email" /></div></dd></div>
            <DetailSelect label="Canal *" value={form.canal} disabled={saving} onChange={(value) => update('canal', value)}><option value="">Selecciona</option>{form.canal && !channelOptions.some((row) => row.etiqueta === form.canal) && <option value={form.canal}>{form.canal}</option>}{channelOptions.map((row) => <option value={row.etiqueta} key={row.etiqueta}>{row.etiqueta}</option>)}</DetailSelect>
            <DetailInput label="Fecha de nacimiento *" value={form.fechaNacimiento} disabled={saving} type="date" onChange={(value) => update('fechaNacimiento', value)} />
            <DetailInput label="Profesión *" value={form.profesion} disabled={saving} onChange={(value) => update('profesion', value)} />
            <div className="crm-details-geo"><GeoFields required value={form} onChange={(geo) => { setForm((current) => ({ ...current, ...geo })); setConfirmation(''); }} disabled={saving} /></div>
            <DetailInput label="Dirección *" value={form.direccion} disabled={saving} className="span-2" onChange={(value) => update('direccion', value)} />
            {isAdmin ? <DetailSelect label="Agente" value={form.agenteDni || ''} disabled={saving} onChange={(value) => update('agenteDni', value)}>{prospect.agenteDni && !agents.some((row) => row.dni === prospect.agenteDni) && <option value={prospect.agenteDni}>{prospect.agenteNombre || prospect.agenteDni}</option>}{agents.filter((row) => row.estado === 'ACTIVO' || row.dni === prospect.agenteDni).map((row) => <option value={row.dni} key={row.dni}>{row.nombres} {row.apellidos}</option>)}</DetailSelect> : <Field label="Agente" value={prospect.agenteNombre || prospect.agenteDni} />}
          </> : <>
            <Field label="Nombre completo" value={prospect.nombre} />
            <Field label="Documento" value={prospect.documento} />
            <ContactDetail label="Teléfono" value={prospect.telefono} action={<ContactAction href={whatsapp ? `https://wa.me/${whatsapp}` : ''} label="Abrir chat de WhatsApp" kind="whatsapp" />} />
            <ContactDetail label="Correo" value={prospect.correo} action={<ContactAction href={validEmail && normalized.correo ? `mailto:${normalized.correo}` : ''} label="Enviar correo" kind="email" />} />
            <Field label="Canal" value={prospect.canal} />
            <Field label="Fecha de nacimiento" value={formatDateOnly(prospect.fechaNacimiento)} />
            <Field label="Profesión" value={prospect.profesion} />
            <Field label="País" value={countryName(prospect.pais || DEFAULT_COUNTRY)} />
            <Field label="Departamento / región" value={prospect.departamento} />
            <Field label="Provincia" value={prospect.provincia} />
            <Field label="Distrito / ciudad" value={prospect.distrito} />
            <Field label="Dirección" value={prospect.direccion} />
            <Field label="Agente" value={prospect.agenteNombre || prospect.agenteDni} />
          </>}
          <Field label="Etapa" value={<Badge value={prospect.etapa || 'NEGOCIACION'} />} />
          <Field label="Fecha de registro" value={formatDate(prospect.fechaCreacion)} />
        </dl>
        <CustomFieldsEditor value={form.camposPersonalizados || []} onChange={(fields) => update('camposPersonalizados', fields)} disabled={saving} readOnly={!editing} idPrefix="captured-details-custom" />
        {editing ? <div className="crm-details-notes-editor"><label>Observaciones<textarea rows={3} value={form.observaciones} disabled={saving} onChange={(event) => update('observaciones', event.target.value)} /></label><label>Notas de captación<textarea rows={3} value={form.notas} disabled={saving} onChange={(event) => update('notas', event.target.value)} /></label></div> : <><div className="crm-notes"><b>Observaciones</b><p>{prospect.observaciones || '—'}</p></div><div className="crm-notes"><b>Notas de captación</b><p>{prospect.notas || '—'}</p></div></>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {confirmation && <p className="form-success" role="status"><span className="material-symbols-outlined">check_circle</span>{confirmation}</p>}
        {editing && <footer className="crm-details-actions"><button className="back-button" type="button" disabled={saving} onClick={cancelEditing}>Cancelar</button><button className="primary-button" disabled={saving || (!conversion && !dirty)}>{saving ? 'Guardando…' : conversion ? 'Guardar y continuar' : 'Guardar cambios'}</button></footer>}
      </form>
    </section>
  </div>, document.body);
}

function DetailInput({ label, value, onChange, className = '', ...inputProps }: { label: string; value: string; onChange: (value: string) => void; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'>) {
  return <div className={`crm-detail-control ${className}`.trim()}><dt>{label}</dt><dd><input {...inputProps} value={value} onChange={(event) => onChange(event.target.value)} /></dd></div>;
}

function DetailSelect({ label, value, onChange, children, disabled }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode; disabled?: boolean }) {
  return <div className="crm-detail-control"><dt>{label}</dt><dd><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{children}</select></dd></div>;
}

function ContactDetail({ label, value, action }: { label: string; value: string; action: React.ReactNode }) {
  return <div className="crm-contact-field"><dt>{label}</dt><dd><div className="crm-contact-control crm-contact-read"><span>{value || '—'}</span>{action}</div></dd></div>;
}

export function InteractionTimeline({ items, emptyTitle, emptyText }: { items: Interaction[]; emptyTitle: string; emptyText: string }) {
  if (!items.length) return <State icon="history" title={emptyTitle} text={emptyText} />;
  return <ol>{items.map((item) => <li key={item.id}><span className="timeline-dot" /><div><b>{item.tipo} · {item.resultado}</b><time>Contacto: {formatDate(interactionContactDate(item))}</time><p>{item.comentario || 'Sin comentario'}</p>{item.proximoContacto && <small>Próximo: {formatDate(item.proximoContacto)}</small>}</div></li>)}</ol>;
}

function ConvertForm({ prospect, dni, onCancel, onSaved }: { prospect: Prospect; dni: string; onCancel: () => void; onSaved: (result: { prospect: Prospect; capturedInteraction: Interaction | null }) => void }) {
  const [fechaNacimiento, setFechaNacimiento] = useState(''); const [profesion, setProfesion] = useState(''); const [geo, setGeo] = useState<GeoValue>({ pais: DEFAULT_COUNTRY, departamento: '', provincia: '', distrito: '' }); const [direccion, setDireccion] = useState(''); const [notas, setNotas] = useState(''); const [customFields, setCustomFields] = useState<CustomField[]>([]); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onCancel(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', closeOnEscape); };
  }, [onCancel, saving]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    const levels = levelsFor(geo.pais || DEFAULT_COUNTRY);
    if (!fechaNacimiento || !profesion.trim() || !geo.pais || !geo.departamento || (levels.hasProvince && !geo.provincia) || !geo.distrito || !direccion.trim()) {
      return setError('Completa todos los campos obligatorios de la captación.');
    }
    const fieldsError = customFieldsError(customFields); if (fieldsError) return setError(fieldsError);
    setSaving(true);
    const details: ConvertDetails = { fechaNacimiento, profesion, ...geo, direccion, notas, camposPersonalizados: cleanCustomFields(customFields) };
    try { const saved = await convertProspect(dni, prospect.id, details); markSaved(); onSaved(saved); } catch (cause) {
      if (isNetworkError(cause)) { queueChange({ kind: 'convertir-prospecto', label: `Conversión de ${prospect.nombre}`, payload: { id: prospect.id, details } }); setError('La conversión quedó pendiente y se enviará desde la nube al recuperar conexión.'); }
      else if (isTimeoutError(cause)) setError('El servicio tardó demasiado en responder. Sincroniza para comprobar si la conversión ya se registró antes de repetirla.');
      else setError(messageOf(cause));
    } finally { setSaving(false); }
  };
  return createPortal(<div className="crm-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel(); }}>
    <section className="crm-modal" role="dialog" aria-modal="true" aria-labelledby="convert-title">
      <header className="crm-modal-header"><div><p className="eyebrow dark">USUARIO CAPTADO</p><h2 id="convert-title">Captar a {prospect.nombre}</h2><p>Completa la información adicional de la captación.</p></div><button className="crm-modal-close" type="button" aria-label="Cerrar" disabled={saving} onClick={onCancel}><span className="material-symbols-outlined">close</span></button></header>
      <form className="crm-modal-form" onSubmit={submit}><div className="interaction-fields">
        <label>Fecha de nacimiento *<input required type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} autoFocus /></label>
        <label>Profesión *<input required value={profesion} onChange={(e) => setProfesion(e.target.value)} /></label>
        <GeoFields required value={geo} onChange={setGeo} disabled={saving} />
        <label className="span-2">Dirección *<input required value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle, avenida, número y referencia" /></label>
        <label className="span-2">Notas<textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} /></label>
        <CustomFieldsEditor value={customFields} onChange={setCustomFields} disabled={saving} idPrefix="capture-custom" />
      </div>{error && <p className="form-error" role="alert">{error}</p>}<footer className="form-buttons"><button type="button" className="back-button" disabled={saving} onClick={onCancel}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? 'Guardando…' : 'Confirmar captación'}</button></footer></form>
    </section>
  </div>, document.body);
}

function InteractionForm({ prospect, catalogs, dni, captured, onCancel, onSaved }: { prospect: Prospect; catalogs: CatalogItem[]; dni: string; captured: boolean; onCancel: () => void; onSaved: (result: { prospect: Prospect; interaction: Interaction }) => void }) {
  const resultCatalog = captured ? 'CAPTADO_RESULTADO' : 'RESULTADO';
  const appointmentCatalog = captured ? 'CAPTADO_CITA' : 'RESULTADO CITA';
  const [tipo, setTipo] = useState(() => pickOption(catalogs, 'REUNION', '')); const [tipoOtro, setTipoOtro] = useState(''); const [resultado, setResultado] = useState(() => pickOption(catalogs, resultCatalog, captured ? '' : prospect.resultado)); const [resultadoCita, setResultadoCita] = useState(() => pickOption(catalogs, appointmentCatalog, captured ? '' : prospect.estado)); const [fechaHoraContacto, setFechaHoraContacto] = useState(() => toDateTimeInput(new Date())); const [comentario, setComentario] = useState(''); const [next, setNext] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const options = (type: string) => activeOptions(catalogs, type);
  useEffect(() => {
    setTipo((current) => current === OTHER_MEDIUM ? current : pickOption(catalogs, 'REUNION', current));
    setResultado((current) => pickOption(catalogs, resultCatalog, current));
    setResultadoCita((current) => pickOption(catalogs, appointmentCatalog, current));
  }, [catalogs, resultCatalog, appointmentCatalog]);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!fechaHoraContacto) return setError('Indica la fecha y hora del contacto.'); const manualMedium = tipoOtro.trim().toLocaleUpperCase('es-PE'); if (tipo === OTHER_MEDIUM && !manualMedium) return setError('Escribe el otro medio de contacto.'); if (!comentario.trim()) return setError('Describe brevemente el contacto realizado.'); setSaving(true); const payload = { prospectoId: prospect.id, fechaHoraContacto, tipo: tipo === OTHER_MEDIUM ? manualMedium : tipo, tipoManual: tipo === OTHER_MEDIUM, resultado, comentario, proximoContacto: next, estadoResultante: resultadoCita }; try { const saved = await addInteraction(dni, payload); markSaved(); onSaved(saved); } catch (cause) { if (isNetworkError(cause)) { queueChange({ kind: 'registrar-interaccion', label: `Interacción de ${prospect.nombre}`, payload }); setError('La interacción quedó pendiente y se enviará desde la nube al recuperar conexión.'); } else if (isTimeoutError(cause)) setError('El servicio tardó demasiado en responder. Sincroniza para comprobar si la interacción ya quedó registrada antes de repetirla.'); else setError(messageOf(cause)); } finally { setSaving(false); } };
  return <form className="interaction-form" onSubmit={submit}><h3>Nueva interacción</h3><div className="interaction-fields">
    <label>Fecha y hora de contacto *<input type="datetime-local" required value={fechaHoraContacto} onChange={(e) => setFechaHoraContacto(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></label>
    <label>Medio *<select required value={tipo} onChange={(e) => { setTipo(e.target.value); if (e.target.value !== OTHER_MEDIUM) setTipoOtro(''); }}><option value="" disabled>Selecciona</option>{options('REUNION').filter((row) => row.etiqueta.trim().toUpperCase() !== 'OTRO').map((row) => <option value={row.etiqueta} key={row.etiqueta}>{row.etiqueta}</option>)}<option value={OTHER_MEDIUM}>OTRO</option></select>{tipo === OTHER_MEDIUM && <input required autoFocus maxLength={80} value={tipoOtro} onChange={(e) => setTipoOtro(e.target.value.toLocaleUpperCase('es-PE'))} placeholder="ESCRIBE EL MEDIO" aria-label="Especificar otro medio" />}</label>
    <label>Resultado *<select required value={resultado} onChange={(e) => setResultado(e.target.value)}><option value="" disabled>Selecciona</option>{options(resultCatalog).map((row) => <option value={row.etiqueta} key={row.etiqueta}>{row.etiqueta}</option>)}</select></label><label>Resultado de la cita *<select required value={resultadoCita} onChange={(e) => setResultadoCita(e.target.value)}><option value="" disabled>Selecciona</option>{options(appointmentCatalog).map((row) => <option value={row.etiqueta} key={row.etiqueta}>{row.etiqueta}</option>)}</select></label><label>Próximo contacto<span className="datetime-clear-field"><input type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} />{next && <button type="button" className="datetime-clear-button" onClick={() => setNext('')} aria-label="Limpiar próximo contacto" title="Limpiar próximo contacto"><span className="material-symbols-outlined" aria-hidden="true">close</span></button>}</span></label><label className="span-2">Comentario *<textarea required rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} /></label></div>{error && <p className="form-error">{error}</p>}<div className="form-buttons"><button type="button" className="back-button" onClick={onCancel}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? 'Registrando…' : 'Registrar'}</button></div></form>;
}

export function Badge({ value }: { value: string }) { return <span className={`crm-badge ${tone(value)}`}>{value || 'SIN DEFINIR'}</span>; }
function StageBadge({ value }: { value: string }) {
  const stage = value.toUpperCase();
  if (stage === 'CLIENTE') return <span className="crm-stage-badge is-client"><span className="material-symbols-outlined" aria-hidden="true">workspace_premium</span>Cliente</span>;
  if (stage === 'NEGOCIACION') return <span className="crm-stage-badge is-negotiation">Negociación</span>;
  return <Badge value={value || 'PROSPECTO'} />;
}
function Field({ label, value }: { label: string; value: React.ReactNode }) { return <div><dt>{label}</dt><dd>{value || '—'}</dd></div>; }
export function State({ icon, title, text, action, spin }: { icon: string; title: string; text: string; action?: () => void; spin?: boolean }) { return <div className="crm-state"><span className={`material-symbols-outlined${spin ? ' is-spinning' : ''}`}>{icon}</span><b>{title}</b><p>{text}</p>{action && <button type="button" className="back-button" onClick={action}>Continuar</button>}</div>; }

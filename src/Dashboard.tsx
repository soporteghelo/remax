import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { User } from './api';
import { dashboard, hasCrmCache, listAgents, readCrmCache, type DashboardData } from './crm-api';
import { chartDayLabel, formatDate, toDateInput } from './dates';
import { MODULES, type SectionId } from './shell';
import { State } from './Prospects';
import { useSyncState } from './sync';

const EMPTY: DashboardData = {
  metrics: {
    total: 0,
    nuevos: 0,
    contactados: 0,
    captados: 0,
    pendientes: 0,
    vencidos: 0,
    conversiones: 0,
    tasaGestion: 0,
    tasaCaptacion: 0,
    tasaConversion: 0,
  },
  funnel: [],
  negotiationStates: [],
  interactionStages: [],
  canal: [],
  interactionsByDate: [],
  prospectsByDate: [],
  upcoming: [],
  agents: [],
};
const KPI_CACHE = 'dashboard-kpis';
const BOARD_CACHE = 'dashboard-board';
const PREFETCH_CACHE = 'dashboard-prefetch';

function readDashboardCache(dni: string, name: string): DashboardData {
  return hasCrmCache(dni, name)
    ? readCrmCache(dni, name, EMPTY)
    : readCrmCache(dni, 'dashboard', EMPTY);
}

function hasDashboardCache(dni: string, name: string): boolean {
  return hasCrmCache(dni, name) || hasCrmCache(dni, 'dashboard');
}

// El panel entra en una sola pantalla: cada widget muestra su top 5 y el gráfico
// completo se abre en una ventana flotante al pulsar sobre él.
const TOP = 5;
const SERIES_COMPACT = 12;
const DEFAULT_CHART_ORDER = ['cartera', 'cobertura', 'canal', 'captaciones', 'altas', 'tasa', 'seguimientos', 'interaction-stages', 'funnel', 'series'];

const orderKey = (dni: string) => `fort_dash_order_${dni}`;
function readOrder(dni: string): string[] {
  try { const saved = JSON.parse(localStorage.getItem(orderKey(dni)) || 'null'); return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : []; }
  catch { return []; }
}
function saveOrder(dni: string, ids: string[]): void {
  try { if (ids.length) localStorage.setItem(orderKey(dni), JSON.stringify(ids)); else localStorage.removeItem(orderKey(dni)); }
  catch { /* orden opcional */ }
}

/**
 * Tamaño de cada widget en unidades del tablero: ancho sobre una rejilla de 12
 * columnas y alto en filas. Los que no tengan medida propia usan la de fábrica
 * (definida en CSS), así que solo se guarda lo que la persona redimensionó.
 */
const MIN_COLS = 3;
const MAX_COLS = 12;
const MIN_ROWS = 1;
const MAX_ROWS = 3;
type Size = { cols: number; rows: number };
type Sizes = Record<string, Size>;
const sizeKey = (dni: string) => `fort_dash_size_${dni}`;
const clampSpan = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)));
function readSizes(dni: string): Sizes {
  try {
    const saved = JSON.parse(localStorage.getItem(sizeKey(dni)) || 'null');
    if (!saved || typeof saved !== 'object') return {};
    const result: Sizes = {};
    Object.keys(saved).forEach((id) => {
      const value = saved[id];
      if (value && Number(value.cols) && Number(value.rows)) result[id] = { cols: clampSpan(Number(value.cols), MIN_COLS, MAX_COLS), rows: clampSpan(Number(value.rows), MIN_ROWS, MAX_ROWS) };
    });
    return result;
  } catch { return {}; }
}
function saveSizes(dni: string, sizes: Sizes): void {
  try { if (Object.keys(sizes).length) localStorage.setItem(sizeKey(dni), JSON.stringify(sizes)); else localStorage.removeItem(sizeKey(dni)); }
  catch { /* medidas opcionales */ }
}

const todayStr = () => toDateInput(new Date());
type DateFilterMode = 'days' | 'months';
const monthValue = (date: string) => date ? date.slice(0, 7) : '';
const monthStart = (month: string) => month ? `${month}-01` : '';
function monthEnd(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return '';
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}
const percent = (value: number, total: number) => total ? Math.round(value / total * 1000) / 10 : 0;
const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

type SeriesPoint = { fecha: string; total: number; label: string };
type SliceRow = { key: string; label: string; value: number };
type RankRow = { key: string; name: string; hint: string; value: number; display?: string };
type Chart = { id: string; kicker: string; title: string; hint: string; badge: ReactNode; count: number; empty: ReactNode; body: (full: boolean) => ReactNode; size: Size; expandable?: boolean; admin?: boolean };
type DragProps = { dragging: boolean; onGrab: (armed: boolean) => void; onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void; onMove: (offset: number) => void; armed: boolean };
type ResizeProps = { cols: number; rows: number; active: boolean; onStart: () => void; onResize: (cols: number, rows: number) => void; onEnd: () => void };

/**
 * Un punto por día con registro; el mes solo se repite en la etiqueta cuando
 * cambia, para no saturar el eje.
 */
function seriesLabels(points: Array<{ fecha: string; total: number }>): SeriesPoint[] {
  let lastMonth = '';
  return points.map((point) => {
    const monthKey = point.fecha.slice(0, 7);
    const withMonth = monthKey !== lastMonth;
    lastMonth = monthKey;
    return { ...point, label: chartDayLabel(point.fecha, withMonth) };
  });
}

/** Serie diaria en columnas: compacto muestra los últimos días, completo la serie entera. */
function ColumnChart({ points, max, full, singular, plural, color }: { points: SeriesPoint[]; max: number; full: boolean; singular: string; plural: string; color?: string }) {
  const total = points.reduce((sum, point) => sum + point.total, 0);
  const shown = full ? points : points.slice(-SERIES_COMPACT);
  const chart = <div
    className={`dash-series${full ? ' is-full' : ''}`}
    style={color ? { '--series-color': color } as CSSProperties : undefined}
    role="img"
    aria-label={`${total} ${plural} en ${points.length} día${points.length === 1 ? '' : 's'} con registro`}
  >{shown.map((point) => <div className="dash-series-col" key={point.fecha} title={`${formatDate(point.fecha)}: ${point.total} ${point.total === 1 ? singular : plural}`}>
    {/* La barra se queda en el 86% del alto para dejar sitio a su cifra encima. */}
    <div className="dash-series-track" style={{ '--bar': `${Math.max(6, point.total / max * 86)}%` } as CSSProperties}><b>{point.total}</b><i /></div>
    <small>{point.label}</small>
  </div>)}</div>;
  return full ? <div className="dash-series-scroll">{chart}</div> : chart;
}

/**
 * Distribución sobre un total: dona de sectores más leyenda con cifra y
 * porcentaje, nunca solo el color. En compacto entran el top 5 y un sector
 * "Otros" con el resto, de modo que la dona siempre suma el 100%.
 */
function DonutChart({ rows, full, unit }: { rows: SliceRow[]; full: boolean; unit: string }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const shown = full ? rows : rows.slice(0, TOP);
  const rest = rows.slice(shown.length).reduce((sum, row) => sum + row.value, 0);
  const slices = [
    ...shown.map((row, index) => ({ ...row, color: `var(--chart-${index % 8 + 1})` })),
    ...(rest ? [{ key: 'otros', label: `Otros (${rows.length - shown.length})`, value: rest, color: 'var(--chart-other)' }] : []),
  ];
  let cursor = 0;
  const stops = slices.map((slice) => {
    const from = total ? cursor / total * 100 : 0;
    cursor += slice.value;
    return `${slice.color} ${from}% ${total ? cursor / total * 100 : 0}%`;
  }).join(',');
  return <div className={`dash-pie${full ? ' is-full' : ''}`}>
    <div className="dash-pie-ring" style={{ '--dash-slices': stops } as CSSProperties} role="img" aria-label={`${total} ${unit} repartidos en ${rows.length} categorías`}><span><strong>{total}</strong><small>{unit}</small></span></div>
    <ul className="dash-pie-legend">{slices.map((slice) => <li key={slice.key}>
      <i style={{ background: slice.color }} />
      <span title={slice.label}>{slice.label}</span>
      <b>{slice.value}</b>
      <small>{percent(slice.value, total)}%</small>
    </li>)}</ul>
  </div>;
}

function RankRows({ rows, max, full, unit, tone }: { rows: RankRow[]; max: number; full: boolean; unit: string; tone?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleRows, setVisibleRows] = useState(TOP);
  useEffect(() => {
    if (full) return;
    const container = containerRef.current;
    if (!container) return;
    const fitRows = () => {
      const renderedRows = Array.from(container.children) as HTMLElement[];
      const rowHeight = Math.max(...renderedRows.map((row) => row.offsetHeight), 1);
      const gap = Number.parseFloat(getComputedStyle(container).rowGap) || 0;
      const available = container.clientHeight;
      const next = Math.max(1, Math.min(rows.length, Math.floor((available + gap) / (rowHeight + gap))));
      setVisibleRows((current) => current === next ? current : next);
    };
    fitRows();
    const observer = new ResizeObserver(fitRows);
    observer.observe(container);
    return () => observer.disconnect();
  }, [full, rows.length]);
  const displayedRows = full ? rows : rows.slice(0, visibleRows);
  return <div ref={containerRef} className={`dash-rank${full ? ' is-full' : ''}${tone ? ` is-${tone}` : ''}`}>{displayedRows.map((row, index) => <div className={index === 0 && row.value ? 'is-leader' : ''} key={row.key}>
    <span className="dash-rank-pos">{index + 1}</span>
    <span className="dash-rank-name"><b>{row.name}</b><small>{row.hint}</small></span>
    <div className="dash-bar-track" role="progressbar" aria-label={`${row.name}: ${row.display || row.value} ${unit}`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={row.value}><i style={{ width: `${Math.max(3, clampPercent(row.value / max * 100))}%` }} /></div>
    <span className="dash-rank-value"><b>{row.display || row.value}</b><small>{unit}</small></span>
  </div>)}</div>;
}

/** Widget del tablero: muestra el top 5 y abre el gráfico completo al pulsarlo. */
function ChartPanel({ chart, onExpand, drag, resize }: { chart: Chart; onExpand: () => void; drag: DragProps; resize: ResizeProps }) {
  const expandable = chart.expandable !== false && chart.count > 0;
  // Las filas con botón propio (agenda) conservan su acción: la ventana solo se
  // abre cuando el clic no cae sobre un control interno.
  const openFromSurface = (event: { target: EventTarget | null }) => { if (!(event.target as HTMLElement | null)?.closest('button')) onExpand(); };

  /**
   * Redimensionado: el paso de la rejilla se deduce del propio panel (su ancho
   * partido por las columnas que ocupa), así no hace falta conocer por dentro la
   * rejilla ni recalcularla cuando cambia el ancho de la ventana.
   */
  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const handle = event.currentTarget;
    const panel = handle.closest('.dash-panel') as HTMLElement | null;
    const board = handle.closest('.dash-board') as HTMLElement | null;
    if (!panel || !board) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = panel.getBoundingClientRect();
    const styles = getComputedStyle(board);
    const columnGap = parseFloat(styles.columnGap) || 0;
    const rowGap = parseFloat(styles.rowGap) || 0;
    const from = { cols: resize.cols, rows: resize.rows, x: event.clientX, y: event.clientY };
    const colPitch = (rect.width + columnGap) / from.cols;
    const rowPitch = (rect.height + rowGap) / from.rows;
    handle.setPointerCapture(event.pointerId);
    resize.onStart();
    const move = (moveEvent: PointerEvent) => resize.onResize(
      clampSpan(from.cols + (moveEvent.clientX - from.x) / colPitch, MIN_COLS, MAX_COLS),
      clampSpan(from.rows + (moveEvent.clientY - from.y) / rowPitch, MIN_ROWS, MAX_ROWS),
    );
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      resize.onEnd();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  // El panel solo se vuelve arrastrable mientras se sujeta el asa, para que el
  // clic sobre el gráfico siga abriendo la ventana.
  return <section
    className={`ds-panel dash-panel${expandable ? ' is-expandable' : ''}${drag.dragging ? ' is-dragging' : ''}${resize.active ? ' is-resizing' : ''}`}
    style={{ '--col-span': resize.cols, '--row-span': resize.rows } as CSSProperties}
    draggable
    onClick={expandable ? openFromSurface : undefined}
    onDragStart={(event) => {
      // El panel es arrastrable siempre para que el navegador arranque el gesto,
      // pero solo lo dejamos correr si se sujetó el asa.
      if (!drag.armed) { event.preventDefault(); return; }
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', chart.id);
      drag.onDragStart();
    }}
    onDragEnter={drag.onDragEnter}
    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
    onDrop={(event) => event.preventDefault()}
    onDragEnd={drag.onDragEnd}
  >
    <header className="dash-panel-head">
      <div><p className="dash-kicker">{chart.kicker}</p><h2>{chart.title}</h2></div>
      <div className="dash-panel-meta">
        {chart.badge}
        {expandable && <button type="button" className="dash-expand" aria-label={`Ver todo: ${chart.title}`} onClick={onExpand}><span className="material-symbols-outlined">open_in_full</span></button>}
        <button
          type="button"
          className="dash-grip"
          aria-label={`Mover ${chart.title}. Usa las flechas para cambiarlo de posición.`}
          onPointerDown={() => drag.onGrab(true)}
          onPointerUp={() => drag.onGrab(false)}
          onBlur={() => drag.onGrab(false)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            const offset = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : 0;
            if (!offset) return;
            event.preventDefault();
            drag.onMove(offset);
          }}
        ><span className="material-symbols-outlined">drag_indicator</span></button>
      </div>
    </header>
    <div className="dash-panel-body">{chart.count ? chart.body(false) : chart.empty}</div>
    <button
      type="button"
      className="dash-resize"
      aria-label={`Redimensionar ${chart.title}: ${resize.cols} de ${MAX_COLS} de ancho y ${resize.rows} de alto. Usa las flechas para ajustarlo.`}
      onPointerDown={startResize}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        const width = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        const height = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
        if (!width && !height) return;
        event.preventDefault();
        resize.onResize(clampSpan(resize.cols + width, MIN_COLS, MAX_COLS), clampSpan(resize.rows + height, MIN_ROWS, MAX_ROWS));
        resize.onEnd();
      }}
    ><span className="material-symbols-outlined">south_east</span></button>
  </section>;
}

/** Ventana flotante con el gráfico completo, ya sin recorte al top 5. */
function ChartModal({ chart, onClose }: { chart: Chart; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', closeOnEscape); };
  }, [onClose]);
  return createPortal(<div className="crm-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="crm-modal dash-modal" role="dialog" aria-modal="true" aria-labelledby="dash-modal-title">
      <header className="crm-modal-header">
        <div><p className="eyebrow dark">{chart.kicker}</p><h2 id="dash-modal-title">{chart.title}</h2><p>{chart.hint}</p></div>
        <div className="dash-modal-actions">{chart.badge}<button className="crm-modal-close" type="button" aria-label="Cerrar" onClick={onClose}><span className="material-symbols-outlined">close</span></button></div>
      </header>
      <div className="dash-modal-body">{chart.count ? chart.body(true) : chart.empty}</div>
    </section>
  </div>, document.body);
}

function agentLabel(agent: User): string {
  return `${agent.nombres} ${agent.apellidos}`.trim() || agent.dni;
}

function searchableAgentText(agent: User): string {
  return `${agentLabel(agent)} ${agent.dni}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

/** Selector con búsqueda local para no obligar a recorrer listas largas de agentes. */
function AgentSearch({ agents, value, onChange, onValidityChange, id }: { agents: User[]; value: string; onChange: (dni: string) => void; onValidityChange: (valid: boolean) => void; id: string }) {
  const selected = agents.find((agent) => agent.dni === value);
  const [query, setQuery] = useState(() => selected ? agentLabel(selected) : '');
  const [open, setOpen] = useState(false);
  const [valid, setValid] = useState(true);
  const [editing, setEditing] = useState(false);
  const normalizedQuery = query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const queryParts = normalizedQuery.split(/\s+/).filter(Boolean);
  const matches = agents.filter((agent) => {
    const searchable = searchableAgentText(agent);
    return queryParts.every((part) => searchable.includes(part));
  }).sort((left, right) => agentLabel(left).localeCompare(agentLabel(right), 'es'));

  useEffect(() => {
    if (editing) return;
    setQuery(selected ? agentLabel(selected) : '');
    setValid(true);
    onValidityChange(true);
  }, [value, selected?.dni, editing]);

  const choose = (agent?: User) => {
    setEditing(false);
    onChange(agent?.dni || '');
    onValidityChange(true);
    setValid(true);
    setQuery(agent ? agentLabel(agent) : '');
    setOpen(false);
  };

  return <div className="dash-agent-search">
    <input
      id={id}
      type="search"
      value={query}
      placeholder="Buscar agente o DNI"
      autoComplete="off"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={`${id}-options`}
      aria-invalid={!valid}
      onFocus={(event) => { event.currentTarget.select(); setEditing(true); setOpen(true); }}
      onChange={(event) => {
        const nextQuery = event.target.value;
        const parts = nextQuery.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().split(/\s+/).filter(Boolean);
        const nextMatches = agents.filter((agent) => parts.every((part) => searchableAgentText(agent).includes(part)));
        const nextValid = !parts.length || nextMatches.length === 1;
        setEditing(true);
        setQuery(nextQuery);
        setValid(nextValid);
        setOpen(true);
        onValidityChange(nextValid);
        onChange(nextMatches.length === 1 ? nextMatches[0].dni : '');
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { setOpen(false); return; }
        if (event.key === 'Enter' && matches.length === 1) { event.preventDefault(); choose(matches[0]); }
      }}
      onBlur={() => window.setTimeout(() => { setEditing(false); setOpen(false); }, 120)}
    />
    {query && <button type="button" className="dash-agent-search-clear" aria-label="Borrar búsqueda de agente" onMouseDown={(event) => event.preventDefault()} onClick={() => choose()}><span className="material-symbols-outlined">close</span></button>}
    {open && <div className="dash-agent-options" id={`${id}-options`} role="listbox">
      <button type="button" role="option" aria-selected={!value} onMouseDown={(event) => event.preventDefault()} onClick={() => choose()}>Todos los agentes</button>
      {matches.map((agent) => <button type="button" role="option" aria-selected={value === agent.dni} key={agent.dni} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(agent)}><b>{agentLabel(agent)}</b><small>DNI {agent.dni}</small></button>)}
      {!matches.length && <p>No se encontraron agentes.</p>}
    </div>}
  </div>;
}

export default function Dashboard({ user, isAdmin, onNavigate }: { user: User; isAdmin: boolean; onNavigate: (section: SectionId) => void }) {
  const [data, setData] = useState<DashboardData>(() => readDashboardCache(user.dni, BOARD_CACHE));
  const [metricData, setMetricData] = useState<DashboardData>(() => readDashboardCache(user.dni, KPI_CACHE));
  const [hasData, setHasData] = useState(() => hasDashboardCache(user.dni, BOARD_CACHE));
  const [hasMetricData, setHasMetricData] = useState(() => hasDashboardCache(user.dni, KPI_CACHE));
  const [loading, setLoading] = useState(!hasData);
  const [metricLoading, setMetricLoading] = useState(!hasMetricData);
  const [error, setError] = useState('');
  const [metricError, setMetricError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayStr);
  const [boardFrom, setBoardFrom] = useState('');
  const [boardTo, setBoardTo] = useState(todayStr);
  const [metricDateMode, setMetricDateMode] = useState<DateFilterMode>('days');
  const [boardDateMode, setBoardDateMode] = useState<DateFilterMode>('days');
  const [metricAgentDni, setMetricAgentDni] = useState('');
  const [boardAgentDni, setBoardAgentDni] = useState('');
  const [metricAgentValid, setMetricAgentValid] = useState(true);
  const [boardAgentValid, setBoardAgentValid] = useState(true);
  const [availableAgents, setAvailableAgents] = useState<User[]>([]);
  const [metricsFiltersOpen, setMetricsFiltersOpen] = useState(false);
  const [boardFiltersOpen, setBoardFiltersOpen] = useState(false);
  const [expanded, setExpanded] = useState('');
  // Orden del tablero ajustable arrastrando cada widget. Se guarda por persona;
  // los widgets que no figuren en el orden guardado se colocan al final, así un
  // panel nuevo aparece igual sin borrar la disposición elegida.
  const [order, setOrder] = useState<string[]>(() => readOrder(user.dni));
  const [sizes, setSizes] = useState<Sizes>(() => readSizes(user.dni));
  const [resizing, setResizing] = useState('');
  const [dragged, setDragged] = useState('');
  const [armed, setArmed] = useState('');
  const initialViewRef = useRef<HTMLElement>(null);
  const metricRequestRef = useRef(0);
  const boardRequestRef = useRef(0);
  // Último panel sobre el que ya se recolocó: sin esto, cada `dragenter` que
  // burbujea desde los hijos volvería a intercambiar y el tablero parpadearía.
  const hovered = useRef('');
  const syncState = useSyncState();

  const loadMetrics = (rangeFrom = from, rangeTo = to, force = false, agentDni = metricAgentDni) => {
    if (rangeFrom && rangeTo && rangeFrom > rangeTo) { setMetricError('La fecha Desde no puede ser posterior a Hasta.'); return; }
    const requestId = ++metricRequestRef.current;
    setMetricLoading(true);
    setMetricError('');
    dashboard(user.dni, rangeFrom, rangeTo, KPI_CACHE, force, agentDni)
      .then((result) => { if (metricRequestRef.current === requestId) { setMetricData(result); setHasMetricData(true); } })
      .catch((cause) => { if (metricRequestRef.current === requestId) setMetricError(cause instanceof Error ? cause.message : 'No se pudieron cargar los indicadores.'); })
      .finally(() => { if (metricRequestRef.current === requestId) setMetricLoading(false); });
  };

  const loadBoard = (rangeFrom = boardFrom, rangeTo = boardTo, force = false, agentDni = boardAgentDni) => {
    if (rangeFrom && rangeTo && rangeFrom > rangeTo) { setError('La fecha Desde no puede ser posterior a Hasta.'); return; }
    const requestId = ++boardRequestRef.current;
    setLoading(true);
    setError('');
    dashboard(user.dni, rangeFrom, rangeTo, BOARD_CACHE, force, agentDni)
      .then((result) => { if (boardRequestRef.current === requestId) { setData(result); setHasData(true); } })
      .catch((cause) => { if (boardRequestRef.current === requestId) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los gráficos del tablero.'); })
      .finally(() => { if (boardRequestRef.current === requestId) setLoading(false); });
  };

  const clearMetricsFilter = () => { setFrom(''); setTo(''); setMetricAgentDni(''); loadMetrics('', '', false, ''); };
  const clearBoardFilter = () => { setBoardFrom(''); setBoardTo(''); setBoardAgentDni(''); loadBoard('', '', false, ''); };
  const changeMetricDateMode = (mode: DateFilterMode) => {
    setMetricDateMode(mode);
    if (mode === 'months') { setFrom(monthStart(monthValue(from))); setTo(monthEnd(monthValue(to))); }
  };
  const changeBoardDateMode = (mode: DateFilterMode) => {
    setBoardDateMode(mode);
    if (mode === 'months') { setBoardFrom(monthStart(monthValue(boardFrom))); setBoardTo(monthEnd(monthValue(boardTo))); }
  };

  useEffect(() => {
    loadMetrics(); loadBoard();
    if (isAdmin) listAgents(user.dni).then((result) => setAvailableAgents(result.filter((agent) => agent.estado === 'ACTIVO'))).catch(() => setAvailableAgents([]));
    else setAvailableAgents([]);
  }, [user.dni, isAdmin]);
  // Precarga la combinación elegida mientras la persona termina de revisar los
  // filtros y llega al botón Aplicar. `dashboard` comparte las lecturas en curso
  // y la caché por rango, por lo que esto adelanta el trabajo sin duplicarlo.
  useEffect(() => {
    if (!metricAgentValid || (from && to && from > to)) return;
    dashboard(user.dni, from, to, PREFETCH_CACHE, false, metricAgentDni).catch(() => { /* Aplicar mostrará el error si persiste. */ });
  }, [user.dni, from, to, metricAgentDni, metricAgentValid]);
  useEffect(() => {
    if (!boardAgentValid || (boardFrom && boardTo && boardFrom > boardTo)) return;
    dashboard(user.dni, boardFrom, boardTo, PREFETCH_CACHE, false, boardAgentDni).catch(() => { /* Aplicar mostrará el error si persiste. */ });
  }, [user.dni, boardFrom, boardTo, boardAgentDni, boardAgentValid]);
  useLayoutEffect(() => {
    initialViewRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, [user.dni]);
  useEffect(() => {
    if (syncState.dataVersion) { loadMetrics(from, to, true); loadBoard(boardFrom, boardTo, true); }
  }, [syncState.dataVersion, user.dni]);
  // Las medidas se guardan solas al cambiar: `applySize` mantiene la referencia
  // cuando no hay cambio real, así el efecto no escribe en cada pixel arrastrado.
  useEffect(() => { saveSizes(user.dni, sizes); }, [sizes, user.dni]);

  const metricTotal = Number(metricData.metrics.total || 0);
  const metricNuevos = Number(metricData.metrics.nuevos || 0);
  const metricContactados = Number(metricData.metrics.contactados || 0);
  const metricCaptados = Number(metricData.metrics.captados || 0);
  const metricConversiones = Number(metricData.metrics.conversiones || 0);
  const metricTasaGestion = Number(metricData.metrics.tasaGestion ?? percent(metricContactados, metricTotal));
  const metricTasaCaptacion = Number(metricData.metrics.tasaCaptacion ?? percent(metricCaptados, metricTotal));
  const metricTasaConversion = Number(metricData.metrics.tasaConversion || 0);
  const metrics = [
    { label: 'Prospectos', value: metricTotal, icon: 'person_search', tone: 'primary', hint: 'registrados en el rango', description: 'Prospectos creados dentro del rango del filtro superior.' },
    { label: 'Nuevos', value: metricNuevos, icon: 'fiber_new', tone: 'info', hint: 'aún sin gestionar', description: 'Prospectos del rango superior que todavía no tienen ninguna interacción registrada.' },
    { label: 'Contactados', value: metricContactados, icon: 'forum', tone: 'primary', hint: `${metricTasaGestion}% de cobertura`, description: 'Prospectos con al menos una interacción. El % usa el total del filtro superior.' },
    { label: 'Captados', value: metricCaptados, icon: 'person_check', tone: 'success', hint: `${metricTasaCaptacion}% del total`, description: 'Prospectos captados o convertidos dentro del alcance del filtro superior.' },
    { label: 'Ventas', value: metricConversiones, icon: 'verified', tone: 'success', hint: 'ventas cerradas', description: 'Clientes del rango con CierreVenta registrado.' },
  ];
  const shortcuts = MODULES.filter((item) => ['prospects', 'agenda', 'birthdays', 'clients', ...(isAdmin ? ['team'] : [])].includes(item.id));
  const donutStyle = { '--dash-managed': `${clampPercent(metricTasaGestion)}%` } as CSSProperties;
  const funnelTotal = data.funnel.reduce((sum, item) => sum + item.total, 0);
  const negotiationStates = data.negotiationStates || [];
  const negotiationTotal = negotiationStates.reduce((sum, item) => sum + item.total, 0);
  const interactionStages = data.interactionStages || [];
  const interactionStageTotal = interactionStages.reduce((sum, item) => sum + item.total, 0);
  const agents = data.agents.map((agent) => ({ ...agent, gestionados: Number(agent.gestionados || 0), seguimientos: Number(agent.seguimientos || 0), primerasInteracciones: Number(agent.primerasInteracciones || 0), captaciones: Number(agent.captaciones || 0), prospectosContactados: Number(agent.prospectosContactados || 0), captados: Number(agent.captados || 0), pendientes: Number(agent.pendientes || 0) })).sort((a, b) => b.seguimientos - a.seguimientos || b.prospectosContactados - a.prospectosContactados);
  const primaryAgents = metricData.agents.map((agent) => ({ ...agent, gestionados: Number(agent.gestionados || 0), seguimientos: Number(agent.seguimientos || 0), primerasInteracciones: Number(agent.primerasInteracciones || 0), captaciones: Number(agent.captaciones || 0), prospectosContactados: Number(agent.prospectosContactados || 0), captados: Number(agent.captados || 0), pendientes: Number(agent.pendientes || 0) })).sort((a, b) => b.seguimientos - a.seguimientos || b.prospectosContactados - a.prospectosContactados);
  const maxAgentProspects = Math.max(...primaryAgents.map((item) => item.prospectos), 1);
  const maxAgentFollowups = Math.max(...agents.map((item) => item.seguimientos), 1);
  const maxAgentCaptures = Math.max(...primaryAgents.map((item) => item.captaciones), 1);
  const prospectRanking = [...primaryAgents].sort((a, b) => b.prospectos - a.prospectos || b.conversiones - a.conversiones);
  const captureRanking = [...primaryAgents].sort((a, b) => b.captaciones - a.captaciones || b.seguimientos - a.seguimientos);
  const captureRateRanking = [...primaryAgents].sort((a, b) => percent(b.captados, b.prospectos) - percent(a.captados, a.prospectos) || b.captados - a.captados);
  // `|| []`: protege una caché o un backend todavía sin redesplegar que no
  // conozca estos dos campos, agregados junto con esta vista.
  const canalData = metricData.canal || [];
  const canalTotal = canalData.reduce((sum, item) => sum + item.total, 0);
  const seriesPoints = seriesLabels(data.interactionsByDate || []);
  const maxSeries = Math.max(...seriesPoints.map((item) => item.total), 1);
  const seriesTotal = seriesPoints.reduce((sum, item) => sum + item.total, 0);
  // `|| []`: igual que arriba, tolera una caché guardada antes de que el backend
  // devolviera esta serie.
  const createdPoints = seriesLabels(metricData.prospectsByDate || []);
  const maxCreated = Math.max(...createdPoints.map((item) => item.total), 1);
  const createdTotal = createdPoints.reduce((sum, item) => sum + item.total, 0);

  // Orden y medida de fábrica del tablero. La rejilla es de 12 columnas: la
  // primera fila la llenan cartera + cobertura + canal + captaciones (3 cada
  // uno), cartera baja dos filas y a su derecha van altas (6) y tasa (3).
  const charts: Chart[] = ([
    {
      id: 'cartera',
      kicker: 'CARTERA',
      title: 'Prospectos por agente',
      hint: 'Cartera asignada a cada agente, con cuántos captó y cuántos llegaron a cliente.',
      badge: <span className="crm-badge is-neutral">{primaryAgents.length} agentes</span>,
      count: primaryAgents.length,
      size: { cols: 3, rows: 2 },
      admin: true,
      empty: <State icon="groups" title="Sin distribución" text="Asigna prospectos al equipo para ver estadísticas." />,
      body: (full) => <RankRows full={full} max={maxAgentProspects} unit="prospectos" rows={prospectRanking.map((agent) => ({ key: agent.dni, name: agent.nombre, hint: `${agent.dni} · ${agent.captados} captados · ${agent.conversiones} clientes`, value: agent.prospectos }))} />,
    },
    {
      id: 'cobertura',
      kicker: 'COBERTURA',
      title: 'Gestión de prospectos',
      hint: '',
      badge: <span className="crm-badge is-neutral">{metricTotal} total</span>,
      count: metricTotal,
      size: { cols: 3, rows: 1 },
      expandable: false,
      empty: <State icon="person_search" title="Sin prospectos" text="Los indicadores aparecerán al registrar prospectos." />,
      body: () => <div className="dash-donut-body">
        <div className="dash-donut" style={donutStyle} role="img" aria-label={`${metricTasaGestion}% de prospectos contactados`}><span><strong>{metricTasaGestion}%</strong><small>gestionados</small></span></div>
        <div className="dash-donut-legend"><div><i className="is-managed" /><span><b>Contactados</b><small>{metricContactados} prospectos</small></span></div><div><i /><span><b>Sin gestionar</b><small>{metricNuevos} prospectos</small></span></div></div>
      </div>,
    },
    {
      id: 'canal',
      size: { cols: 3, rows: 1 },
      kicker: 'ORIGEN',
      title: 'Prospectos por canal',
      hint: `${canalTotal} prospectos repartidos en ${canalData.length} canales de captación.`,
      badge: <span className="crm-badge is-neutral">{canalTotal}</span>,
      count: canalData.length,
      empty: <State icon="campaign" title="Sin canal registrado" text="El canal de captación aparecerá al registrar prospectos." />,
      body: (full) => <DonutChart full={full} unit="prospectos" rows={canalData.map((row) => ({ key: row.canal, label: row.canal, value: row.total }))} />,
    },
    {
      id: 'captaciones',
      kicker: 'CAPTACIÓN DEL EQUIPO',
      title: '¿Quién captó más clientes?',
      hint: 'Captaciones cerradas por cada agente dentro del rango.',
      badge: <span className="crm-badge is-neutral">{primaryAgents.reduce((sum, agent) => sum + agent.captaciones, 0)}</span>,
      count: primaryAgents.length,
      size: { cols: 3, rows: 1 },
      admin: true,
      empty: <State icon="person_check" title="Sin captaciones registradas" text="Las captaciones realizadas por cada agente aparecerán aquí." />,
      body: (full) => <RankRows full={full} max={maxAgentCaptures} unit="captaciones" tone="success" rows={captureRanking.map((agent) => ({ key: agent.dni, name: agent.nombre, hint: `${agent.conversiones} clientes cerrados en su cartera`, value: agent.captaciones }))} />,
    },
    {
      id: 'altas',
      kicker: 'ALTAS DIARIAS',
      title: 'Prospectos por fecha de creación',
      hint: createdPoints.length ? `${createdTotal} altas entre ${formatDate(createdPoints[0].fecha)} y ${formatDate(createdPoints[createdPoints.length - 1].fecha)}.` : '',
      badge: <span className="crm-badge is-neutral">{createdTotal}</span>,
      count: createdPoints.length,
      size: { cols: 6, rows: 1 },
      empty: <State icon="bar_chart" title="Sin altas en el rango" text="Los prospectos aparecerán aquí según su fecha de creación." />,
      body: (full) => <ColumnChart full={full} points={createdPoints} max={maxCreated} singular="alta" plural="altas" color="var(--chart-2)" />,
    },
    {
      id: 'tasa',
      kicker: 'INDICADOR DE CAPTACIÓN',
      title: '% de captación por agente',
      hint: 'Parte de la cartera de cada agente que llegó a captación.',
      badge: <span className="crm-badge is-neutral">{metricTasaCaptacion}% equipo</span>,
      count: primaryAgents.length,
      size: { cols: 3, rows: 1 },
      admin: true,
      empty: <State icon="monitoring" title="Sin datos de captación" text="El porcentaje aparecerá cuando existan prospectos asignados." />,
      body: (full) => <RankRows full={full} max={100} unit="de captación" tone="success" rows={captureRateRanking.map((agent) => { const rate = percent(agent.captados, agent.prospectos); return { key: agent.dni, name: agent.nombre, hint: `${agent.captados} captados de ${agent.prospectos} prospectos`, value: rate, display: `${rate}%` }; })} />,
    },
    {
      id: 'funnel',
      size: { cols: 4, rows: 1 },
      kicker: 'RESULTADOS',
      title: 'Resultados',
      hint: `${funnelTotal} registros repartidos en ${data.funnel.length} resultados.`,
      badge: <span className="crm-badge is-neutral">{funnelTotal}</span>,
      count: data.funnel.length,
      empty: <State icon="filter_alt" title="Sin actividad" text="Los resultados aparecerán al registrar interacciones." />,
      body: (full) => <DonutChart full={full} unit="registros" rows={data.funnel.map((row) => ({ key: row.estado, label: row.estado, value: row.total }))} />,
    },
    {
      id: 'negotiation-states',
      size: { cols: 4, rows: 1 },
      kicker: 'NEGOCIACIÓN',
      title: 'Estado de negociaciones',
      hint: `${negotiationTotal} interacciones en etapa NEGOCIACION, agrupadas por Resultado.`,
      badge: <span className="crm-badge is-neutral">{negotiationTotal}</span>,
      count: negotiationStates.length,
      empty: <State icon="handshake" title="Sin negociaciones en el rango" text="Aquí aparecerán los valores de Resultado cuya Etapa sea NEGOCIACION." />,
      body: (full) => <DonutChart full={full} unit="negociaciones" rows={negotiationStates.map((row) => ({ key: row.estado, label: row.estado, value: row.total }))} />,
    },
    {
      id: 'interaction-stages',
      size: { cols: 4, rows: 1 },
      kicker: 'ETAPAS',
      title: 'Interacciones por etapa',
      hint: `${interactionStageTotal} interacciones agrupadas por la columna Etapa.`,
      badge: <span className="crm-badge is-neutral">{interactionStageTotal}</span>,
      count: interactionStages.length,
      empty: <State icon="donut_large" title="Sin etapas en el rango" text="Las etapas de las interacciones aparecerán dentro del rango seleccionado." />,
      body: (full) => <DonutChart full={full} unit="interacciones" rows={interactionStages.map((row) => ({ key: row.etapa, label: row.etapa, value: row.total }))} />,
    },
    {
      id: 'series',
      size: { cols: 12, rows: 1 },
      kicker: 'ACTIVIDAD DIARIA',
      title: 'Interacciones por día',
      hint: seriesPoints.length ? `${seriesTotal} interacciones entre ${formatDate(seriesPoints[0].fecha)} y ${formatDate(seriesPoints[seriesPoints.length - 1].fecha)}.` : '',
      badge: <span className="crm-badge is-neutral">{seriesTotal}</span>,
      count: seriesPoints.length,
      empty: <State icon="show_chart" title="Sin interacciones en el rango" text="Los registros de la pestaña Interacciones aparecerán aquí por fecha." />,
      body: (full) => <ColumnChart full={full} points={seriesPoints} max={maxSeries} singular="interacción" plural="interacciones" />,
    },
    {
      id: 'seguimientos',
      kicker: 'ACTIVIDAD DEL EQUIPO',
      title: '¿Quién hizo más interacciones?',
      hint: 'Interacciones registradas por cada agente dentro del rango.',
      badge: <span className="crm-badge is-neutral">{agents.reduce((sum, agent) => sum + agent.seguimientos, 0)}</span>,
      count: agents.length,
      size: { cols: 4, rows: 1 },
      admin: true,
      empty: <State icon="forum" title="Sin seguimientos registrados" text="Cada interacción registrada por los agentes aparecerá aquí." />,
      body: (full) => <RankRows full={full} max={maxAgentFollowups} unit="seguimientos" rows={agents.map((agent) => ({ key: agent.dni, name: agent.nombre, hint: `${agent.prospectosContactados} prospectos únicos atendidos`, value: agent.seguimientos }))} />,
    },
  ] as Chart[]).filter((chart) => (isAdmin || !chart.admin) && chart.id !== 'negotiation-states');
  const activeChart = charts.find((chart) => chart.id === expanded);
  // El orden guardado manda; sin personalización se aplica la vista inicial del tablero.
  const ranked = [...charts].sort((a, b) => {
    const left = order.indexOf(a.id); const right = order.indexOf(b.id);
    const fallback = (chart: Chart) => {
      const position = DEFAULT_CHART_ORDER.indexOf(chart.id);
      return position < 0 ? DEFAULT_CHART_ORDER.length + charts.indexOf(chart) : position;
    };
    return (left < 0 ? order.length + fallback(a) : left) - (right < 0 ? order.length + fallback(b) : right);
  });
  const primaryChartIds = new Set(['cartera', 'cobertura', 'canal', 'captaciones', 'altas', 'tasa']);
  const primaryCharts = ranked.filter((chart) => primaryChartIds.has(chart.id));
  const secondaryCharts = ranked.filter((chart) => !primaryChartIds.has(chart.id));
  const applyOrder = (ids: string[]) => { setOrder(ids); saveOrder(user.dni, ids); };
  const moveChart = (id: string, target: string | number) => {
    const ids = ranked.map((chart) => chart.id);
    const from = ids.indexOf(id);
    const to = typeof target === 'number' ? from + target : ids.indexOf(target);
    if (from < 0 || to < 0 || to >= ids.length || from === to) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    applyOrder(ids);
  };
  // Cada widget trae su medida de fábrica; `sizes` solo guarda lo redimensionado.
  const sizeOf = (chart: Chart) => sizes[chart.id] || chart.size;
  // Devolver el mismo objeto cuando la medida no cambió evita repintar en cada
  // pixel del arrastre: solo se rerenderiza al cruzar una unidad de la rejilla.
  const applySize = (id: string, cols: number, rows: number) => {
    setSizes((current) => {
      const previous = current[id];
      if (previous && previous.cols === cols && previous.rows === rows) return current;
      return { ...current, [id]: { cols: cols, rows: rows } };
    });
  };
  const customized = order.length > 0 || Object.keys(sizes).length > 0;
  const resetLayout = () => { setOrder([]); saveOrder(user.dni, []); setSizes({}); };
  const renderChart = (chart: Chart) => <ChartPanel
    chart={chart}
    onExpand={() => setExpanded(chart.id)}
    resize={{
      cols: sizeOf(chart).cols,
      rows: sizeOf(chart).rows,
      active: resizing === chart.id,
      onStart: () => setResizing(chart.id),
      onResize: (cols, rows) => applySize(chart.id, cols, rows),
      onEnd: () => setResizing(''),
    }}
    drag={{
      armed: armed === chart.id,
      dragging: dragged === chart.id,
      onGrab: (grab) => setArmed(grab ? chart.id : ''),
      onDragStart: () => { hovered.current = chart.id; setDragged(chart.id); },
      onDragEnter: () => {
        if (!dragged || dragged === chart.id || hovered.current === chart.id) return;
        hovered.current = chart.id;
        moveChart(dragged, chart.id);
      },
      onDragEnd: () => { hovered.current = ''; setDragged(''); setArmed(''); },
      onMove: (offset) => moveChart(chart.id, offset),
    }}
    key={chart.id}
  />;

  return <section className="page-content crm-page dash">
    <div className="crm-heading dash-heading">
      <div><p className="eyebrow dark">SISTEMA RX</p><h1>Hola, {user.nombres || 'usuario'}</h1><p className="subtitle">Indicadores y seguimiento de tu operación comercial.</p></div>
      <button type="button" className="dash-filter-toggle" aria-expanded={metricsFiltersOpen} onClick={() => setMetricsFiltersOpen((open) => !open)}><span className="material-symbols-outlined">filter_list</span>Filtros<span className="material-symbols-outlined">{metricsFiltersOpen ? 'expand_less' : 'expand_more'}</span></button>
      <div className={`date-filter dash-filter-fields${metricsFiltersOpen ? ' is-open' : ''}`} aria-label="Filtro de fechas de indicadores y paneles superiores">
        <button type="button" className="back-button dash-filter-action" onClick={clearMetricsFilter} disabled={metricLoading}><span className="material-symbols-outlined">filter_alt_off</span>Limpiar filtro</button>
        <button type="button" className="back-button dash-filter-action dash-reset-order" onClick={resetLayout} disabled={!customized}><span className="material-symbols-outlined">restart_alt</span>Diseño original</button>
        {isAdmin && <label>Agente<AgentSearch id="metric-agent" agents={availableAgents} value={metricAgentDni} onChange={setMetricAgentDni} onValidityChange={setMetricAgentValid} /></label>}
        <div className="dash-date-mode" aria-label="Unidad del rango superior"><span>Periodo</span><div><button type="button" className={metricDateMode === 'days' ? 'is-active' : ''} aria-pressed={metricDateMode === 'days'} onClick={() => changeMetricDateMode('days')}>Días</button><button type="button" className={metricDateMode === 'months' ? 'is-active' : ''} aria-pressed={metricDateMode === 'months'} onClick={() => changeMetricDateMode('months')}>Meses</button></div></div>
        <label>Desde<input type={metricDateMode === 'months' ? 'month' : 'date'} value={metricDateMode === 'months' ? monthValue(from) : from} onChange={(e) => setFrom(metricDateMode === 'months' ? monthStart(e.target.value) : e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></label>
        <label>Hasta<input type={metricDateMode === 'months' ? 'month' : 'date'} value={metricDateMode === 'months' ? monthValue(to) : to} onChange={(e) => setTo(metricDateMode === 'months' ? monthEnd(e.target.value) : e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></label>
        <button type="button" className="back-button" onClick={() => loadMetrics()} disabled={metricLoading || !metricAgentValid}>{metricLoading && hasMetricData ? 'Aplicando…' : 'Aplicar'}</button>
      </div>
    </div>
    {metricError && <p className="form-error dash-filter-error" role="alert">{metricError}</p>}
    {metricLoading && !hasMetricData
      ? <State icon="progress_activity" title="Cargando indicadores" text="Calculando el resumen superior…" spin />
      : <>
        <div className="dash-kpis" aria-busy={metricLoading}>{metrics.map((metric) => <article className={`ds-panel dash-kpi is-${metric.tone}`} tabIndex={0} key={metric.label}><span className="material-symbols-outlined">{metric.icon}</span><div><small>{metric.label}</small><b>{metric.value}</b><em>{metric.hint}</em></div><span className="dash-kpi-tip" role="tooltip">{metric.description}</span></article>)}</div>
        <div className={`dash-board is-primary-group${dragged ? ' is-reordering' : ''}${resizing ? ' is-sizing' : ''}`} aria-busy={metricLoading}>
          {primaryCharts.map(renderChart)}
        </div>
      </>}

    <section ref={initialViewRef} className="ds-panel dash-board-filter dash-initial-view" aria-label="Filtro de fechas del resto del tablero">
      <div className="dash-board-filter-copy"><p className="dash-kicker">FILTRO DEL TABLERO</p><h2>Gráficos y actividad</h2><span>Este rango se aplica a todos los paneles ubicados debajo.</span></div>
      <button type="button" className="dash-filter-toggle" aria-expanded={boardFiltersOpen} onClick={() => setBoardFiltersOpen((open) => !open)}><span className="material-symbols-outlined">filter_list</span>Filtros<span className="material-symbols-outlined">{boardFiltersOpen ? 'expand_less' : 'expand_more'}</span></button>
      <div className={`date-filter dash-filter-fields${boardFiltersOpen ? ' is-open' : ''}`} aria-label="Filtro de fechas del tablero">
        <button type="button" className="back-button dash-filter-action" onClick={clearBoardFilter} disabled={loading}><span className="material-symbols-outlined">filter_alt_off</span>Limpiar filtro</button>
        <button type="button" className="back-button dash-filter-action dash-reset-order" onClick={resetLayout} disabled={!customized}><span className="material-symbols-outlined">restart_alt</span>Diseño original</button>
        {isAdmin && <label>Agente<AgentSearch id="board-agent" agents={availableAgents} value={boardAgentDni} onChange={setBoardAgentDni} onValidityChange={setBoardAgentValid} /></label>}
        <div className="dash-date-mode" aria-label="Unidad del rango del tablero"><span>Periodo</span><div><button type="button" className={boardDateMode === 'days' ? 'is-active' : ''} aria-pressed={boardDateMode === 'days'} onClick={() => changeBoardDateMode('days')}>Días</button><button type="button" className={boardDateMode === 'months' ? 'is-active' : ''} aria-pressed={boardDateMode === 'months'} onClick={() => changeBoardDateMode('months')}>Meses</button></div></div>
        <label>Desde<input type={boardDateMode === 'months' ? 'month' : 'date'} value={boardDateMode === 'months' ? monthValue(boardFrom) : boardFrom} onChange={(e) => setBoardFrom(boardDateMode === 'months' ? monthStart(e.target.value) : e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></label>
        <label>Hasta<input type={boardDateMode === 'months' ? 'month' : 'date'} value={boardDateMode === 'months' ? monthValue(boardTo) : boardTo} onChange={(e) => setBoardTo(boardDateMode === 'months' ? monthEnd(e.target.value) : e.target.value)} onClick={(e) => e.currentTarget.showPicker?.()} /></label>
        <button type="button" className="back-button" onClick={() => loadBoard()} disabled={loading || !boardAgentValid}>{loading && hasData ? 'Aplicando…' : 'Aplicar'}</button>
      </div>
    </section>
    {error && <p className="form-error dash-filter-error" role="alert">{error}</p>}
    {loading && !hasData ? <State icon="progress_activity" title="Cargando tablero" text="Calculando gráficos y actividad…" spin /> : <>
      <div className={`dash-board is-secondary-group${dragged ? ' is-reordering' : ''}${resizing ? ' is-sizing' : ''}`} aria-busy={loading}>
        {secondaryCharts.map(renderChart)}
      </div>

      <div className="dash-quick">{shortcuts.map((item) => <button type="button" onClick={() => onNavigate(item.id)} key={item.id}><span className="material-symbols-outlined">{item.icon}</span>{item.label}</button>)}</div>
    </>}
    {activeChart && <ChartModal chart={activeChart} onClose={() => setExpanded('')} />}
  </section>;
}

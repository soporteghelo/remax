import { useEffect, useMemo, useState } from 'react';
import type { User } from './api';
import { hasCrmCache, listProspects, readCrmCache, type Prospect } from './crm-api';
import { formatDate, formatTime, toDateInput } from './dates';
import { State } from './Prospects';
import { useSyncState } from './sync';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MAX_VISIBLE_EVENTS = 3;

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function moveMonth(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

/** Devuelve las seis semanas de una cuadrícula mensual que empieza en lunes. */
function calendarDays(month: Date): Date[] {
  const first = startOfMonth(month);
  const mondayOffset = (first.getDay() + 6) % 7;
  const firstCell = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => new Date(firstCell.getFullYear(), firstCell.getMonth(), firstCell.getDate() + index));
}

function eventTime(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

export default function Agenda({ user, isAdmin, onOpenProspect }: { user: User; isAdmin: boolean; onOpenProspect: (id: string) => void }) {
  const [items, setItems] = useState<Prospect[]>(() => readCrmCache(user.dni, 'prospects', []));
  const [loading, setLoading] = useState(!hasCrmCache(user.dni, 'prospects'));
  const [error, setError] = useState('');
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [expandedDay, setExpandedDay] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const syncState = useSyncState();

  useEffect(() => {
    listProspects(user.dni)
      .then(setItems)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'No se pudo cargar la agenda.'))
      .finally(() => setLoading(false));
  }, [user.dni]);

  useEffect(() => {
    if (syncState.dataVersion) setItems(readCrmCache(user.dni, 'prospects', []));
  }, [syncState.dataVersion, user.dni]);

  const eventsByDay = useMemo(() => {
    const result = new Map<string, Prospect[]>();
    // proximoContacto proviene de la interacción más reciente del prospecto.
    items.filter((item) => toDateInput(item.proximoContacto)).forEach((item) => {
      const key = toDateInput(item.proximoContacto);
      const dayEvents = result.get(key) || [];
      dayEvents.push(item);
      result.set(key, dayEvents);
    });
    result.forEach((dayEvents) => dayEvents.sort((a, b) => eventTime(a.proximoContacto) - eventTime(b.proximoContacto)));
    return result;
  }, [items]);

  const days = useMemo(() => calendarDays(month), [month]);
  const todayKey = toDateInput(new Date());
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const monthTotal = useMemo(() => [...eventsByDay.entries()].reduce((total, [key, events]) => total + (key.startsWith(monthKey) ? events.length : 0), 0), [eventsByDay, monthKey]);
  const selectedEvents = selectedDay ? (eventsByDay.get(selectedDay) || []) : [];
  const selectedDate = selectedDay ? days.find((day) => toDateInput(day) === selectedDay) : undefined;

  const changeMonth = (offset: number) => {
    setMonth((current) => moveMonth(current, offset));
    setExpandedDay('');
    setSelectedDay('');
  };

  const goToday = () => {
    setMonth(startOfMonth(new Date()));
    setExpandedDay('');
    setSelectedDay('');
  };

  return (
    <section className="page-content crm-page">
      <p className="eyebrow dark">SEGUIMIENTOS</p>
      <h1>Agenda</h1>
      <p className="subtitle">Seguimientos programados según el campo Próximo contacto de Interacciones.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? (
        <State icon="progress_activity" title="Cargando agenda" text="Consultando seguimientos…" spin />
      ) : (
        <section className="ds-panel agenda-calendar" aria-label={`Calendario de ${MONTHS[month.getMonth()]} de ${month.getFullYear()}`}>
          <header className="agenda-calendar-head">
            <div className="agenda-calendar-title">
              <h2 aria-live="polite">{MONTHS[month.getMonth()]} {month.getFullYear()}</h2>
              <span>{monthTotal} {monthTotal === 1 ? 'contacto' : 'contactos'}</span>
            </div>
            <div className="agenda-calendar-actions">
              <button type="button" className="agenda-today" onClick={goToday}>Hoy</button>
              <button type="button" className="agenda-month-button" onClick={() => changeMonth(-1)} aria-label="Mes anterior" title="Mes anterior">
                <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
              </button>
              <button type="button" className="agenda-month-button" onClick={() => changeMonth(1)} aria-label="Mes siguiente" title="Mes siguiente">
                <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
              </button>
            </div>
          </header>

          <div className="agenda-calendar-scroll">
            <div className="agenda-weekdays" aria-hidden="true">
              {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
            </div>
            <div className="agenda-month-grid" role="grid">
              {days.map((day) => {
                const dayKey = toDateInput(day);
                const events = eventsByDay.get(dayKey) || [];
                const isCurrentMonth = day.getMonth() === month.getMonth();
                const isToday = dayKey === todayKey;
                const visibleEvents = expandedDay === dayKey ? events : events.slice(0, MAX_VISIBLE_EVENTS);
                const hiddenCount = events.length - visibleEvents.length;
                return (
                  <div
                    className={`agenda-day${isCurrentMonth ? '' : ' is-outside'}${isToday ? ' is-today' : ''}${events.length ? ' has-events' : ''}${selectedDay === dayKey ? ' is-selected' : ''}`}
                    key={dayKey}
                    role="gridcell"
                    aria-label={`${formatDate(day)}, ${events.length} ${events.length === 1 ? 'contacto' : 'contactos'}`}
                    aria-selected={selectedDay === dayKey}
                    tabIndex={events.length ? 0 : undefined}
                    onClick={() => { if (events.length) setSelectedDay(dayKey); }}
                    onKeyDown={(event) => { if (events.length && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedDay(dayKey); } }}
                  >
                    <div className="agenda-day-number">
                      <time dateTime={dayKey}>{day.getDate()}</time>
                      {isToday && <span>Hoy</span>}
                    </div>
                    <div className="agenda-day-events">
                      {visibleEvents.map((item) => (
                        <button
                          type="button"
                          className="agenda-event"
                          key={item.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (window.matchMedia('(max-width: 760px)').matches) setSelectedDay(dayKey);
                            else onOpenProspect(item.id);
                          }}
                          title={`${formatTime(item.proximoContacto)} · Seguimiento · ${item.nombre} · ${item.telefono}`}
                          aria-label={`Abrir ${item.nombre}, seguimiento a las ${formatTime(item.proximoContacto)}`}
                        >
                          <span>{formatTime(item.proximoContacto)}</span>
                          <b>{item.nombre}</b>
                          <small>{item.telefono}</small>
                          {isAdmin && <em>{item.agenteNombre || item.agenteDni}</em>}
                        </button>
                      ))}
                      {hiddenCount > 0 && (
                        <button type="button" className="agenda-more" onClick={() => setExpandedDay(dayKey)}>
                          +{hiddenCount} {hiddenCount === 1 ? 'contacto' : 'contactos'}
                        </button>
                      )}
                      {expandedDay === dayKey && events.length > MAX_VISIBLE_EVENTS && (
                        <button type="button" className="agenda-more" onClick={() => setExpandedDay('')}>Ver menos</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {selectedDate && selectedEvents.length > 0 && (
            <aside className="agenda-day-detail" aria-live="polite" aria-label={`Programación del ${formatDate(selectedDate)}`}>
              <header>
                <div><span>PROGRAMACIÓN</span><h3>{formatDate(selectedDate)}</h3></div>
                <button type="button" className="agenda-detail-close" onClick={() => setSelectedDay('')} aria-label="Cerrar detalle de programación">
                  <span className="material-symbols-outlined" aria-hidden="true">close</span>
                </button>
              </header>
              <div className="agenda-detail-list">
                {selectedEvents.map((item) => (
                  <button type="button" className="agenda-detail-item" onClick={() => onOpenProspect(item.id)} key={item.id}>
                    <time dateTime={item.proximoContacto}>{formatTime(item.proximoContacto)}</time>
                    <dl>
                      <div><dt>Prospecto</dt><dd>{item.nombre}</dd></div>
                      <div><dt>Agente</dt><dd>{item.agenteNombre || item.agenteDni || 'Sin asignar'}</dd></div>
                      <div><dt>Etapa</dt><dd>Seguimiento</dd></div>
                    </dl>
                    <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
                  </button>
                ))}
              </div>
            </aside>
          )}
          {!monthTotal && <p className="agenda-month-empty">No hay próximos contactos programados para este mes.</p>}
        </section>
      )}
    </section>
  );
}

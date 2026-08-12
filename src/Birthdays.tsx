import { useEffect, useMemo, useState } from 'react';
import type { User } from './api';
import { hasCrmCache, listClients, listProspects, readCrmCache, type Client, type Prospect } from './crm-api';
import { formatDate, toDateInput } from './dates';
import { State } from './Prospects';
import { useSyncState } from './sync';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function birthdayDateInYear(birthday: string, year: number): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toDateInput(birthday));
  if (!match) return undefined;
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  // El 29 de febrero se presenta el 28 en los años que no son bisiestos.
  return month === 1 && day === 29 && new Date(year, 1, 29).getMonth() !== 1
    ? new Date(year, 1, 28)
    : new Date(year, month, day);
}

export default function Birthdays({ user, isAdmin, onOpenProspect }: { user: User; isAdmin: boolean; onOpenProspect: (id: string) => void }) {
  const [items, setItems] = useState<Prospect[]>(() => readCrmCache(user.dni, 'prospects', []));
  const [clients, setClients] = useState<Client[]>(() => readCrmCache(user.dni, 'clients', []));
  const [profession, setProfession] = useState('');
  const [loading, setLoading] = useState(!hasCrmCache(user.dni, 'prospects') || !hasCrmCache(user.dni, 'clients'));
  const [error, setError] = useState('');
  const [year, setYear] = useState(() => new Date().getFullYear());
  const syncState = useSyncState();

  useEffect(() => {
    Promise.all([listProspects(user.dni), listClients(user.dni)])
      .then(([prospects, clientList]) => { setItems(prospects); setClients(clientList); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los cumpleaños.'))
      .finally(() => setLoading(false));
  }, [user.dni]);

  useEffect(() => {
    if (syncState.dataVersion) {
      setItems(readCrmCache(user.dni, 'prospects', []));
      setClients(readCrmCache(user.dni, 'clients', []));
    }
  }, [syncState.dataVersion, user.dni]);

  const clientProspectIds = useMemo(() => new Set(clients.map((client) => client.prospectoId).filter(Boolean)), [clients]);
  const professions = useMemo(() => Array.from(new Set(items.filter((item) => item.captado && clientProspectIds.has(item.id)).map((item) => item.profesion.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')), [clientProspectIds, items]);
  const birthdaysByMonth = useMemo(() => {
    const result = Array.from({ length: 12 }, () => [] as Array<{ item: Prospect; date: Date }>);
    items
      .filter((item) => item.captado && clientProspectIds.has(item.id) && (!profession || item.profesion.trim() === profession))
      .forEach((item) => {
        const date = birthdayDateInYear(item.fechaNacimiento, year);
        if (date) result[date.getMonth()].push({ item, date });
      });
    result.forEach((month) => month.sort((a, b) => a.date.getTime() - b.date.getTime() || a.item.nombre.localeCompare(b.item.nombre, 'es')));
    return result;
  }, [clientProspectIds, items, profession, year]);
  const yearTotal = useMemo(() => birthdaysByMonth.reduce((total, month) => total + month.length, 0), [birthdaysByMonth]);
  const currentMonth = new Date().getFullYear() === year ? new Date().getMonth() : -1;

  return (
    <section className="page-content crm-page">
      <p className="eyebrow dark">USUARIOS CAPTADOS</p>
      <h1>Cumpleaños</h1>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <State icon="cake" title="Cargando cumpleaños" text="Consultando usuarios captados…" spin /> : (
        <section className="ds-panel birthday-year" aria-label={`Cumpleaños de ${year}`}>
          <header className="birthday-year-head">
            <div className="birthday-year-title"><h2 aria-live="polite">{year}</h2><span>{yearTotal} {yearTotal === 1 ? 'cumpleaños' : 'cumpleaños'}</span></div>
            <div className="birthday-year-controls">
              <label className="agenda-birthday-profession"><span>Profesión</span><select value={profession} onChange={(event) => setProfession(event.target.value)}><option value="">Todas las profesiones</option>{professions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
              <div className="agenda-calendar-actions">
                <button type="button" className="agenda-today" onClick={() => setYear(new Date().getFullYear())}>Año actual</button>
                <button type="button" className="agenda-month-button" onClick={() => setYear((current) => current - 1)} aria-label="Año anterior" title="Año anterior"><span className="material-symbols-outlined" aria-hidden="true">chevron_left</span></button>
                <button type="button" className="agenda-month-button" onClick={() => setYear((current) => current + 1)} aria-label="Año siguiente" title="Año siguiente"><span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>
              </div>
            </div>
          </header>
          <div className="birthday-year-grid">
            {MONTHS.map((month, index) => {
              const birthdays = birthdaysByMonth[index];
              return <section className={`birthday-month${index === currentMonth ? ' is-current' : ''}`} key={month} aria-labelledby={`birthday-month-${index}`}>
                <header><h3 id={`birthday-month-${index}`}>{month}</h3><span>{birthdays.length}</span></header>
                {birthdays.length ? <ol>{birthdays.map(({ item, date }) => <li key={item.id}><button type="button" onClick={() => onOpenProspect(item.id)} aria-label={`Abrir a ${item.nombre}; cumpleaños el ${formatDate(date)}`}><time dateTime={toDateInput(date)}>{formatDate(date).slice(0, 5)}</time><span><b>{item.nombre}</b><small>{item.profesion || 'Sin profesión'}{isAdmin && (item.agenteNombre || item.agenteDni) ? ` · ${item.agenteNombre || item.agenteDni}` : ''}</small></span><span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></button></li>)}</ol> : <p className="birthday-month-empty">Sin cumpleaños</p>}
              </section>;
            })}
          </div>
          {!yearTotal && <p className="agenda-month-empty">No hay cumpleaños de usuarios captados para este año.</p>}
        </section>
      )}
    </section>
  );
}

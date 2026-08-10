/**
 * =========================================================================
 * FECHAS Y HORAS: UN ÚNICO FORMATO EN TODA LA APLICACIÓN
 * =========================================================================
 * Fecha `DD/MM/AAAA` y hora `HH:MM` en 24 horas. Cualquier vista que muestre
 * una fecha usa estas funciones; no vuelvas a llamar a `toLocaleDateString`
 * ni a `toLocaleString` en un componente.
 *
 * El formato se arma a mano en vez de con `Intl`/`toLocale*` a propósito: el
 * locale `es-PE` devuelve la hora en 12 horas ("6:17 p. m.") y la fecha en
 * formatos que cambian según el navegador y el sistema. Aquí el resultado es
 * siempre el mismo, en cualquier dispositivo.
 *
 * En la hoja de cálculo se guardan como fechas reales con formato visible
 * `DD/MM/AAAA`; la API las entrega en ISO 8601 para conservar una comunicación
 * inequívoca con el navegador.
 */

/** Lo que se muestra cuando no hay fecha o no se puede leer. */
const EMPTY = '—';

/**
 * Acepta las formas que pueden llegar: ISO con zona de la hoja
 * ("2026-08-10T08:18:45.455Z"), el valor de un `datetime-local` sin zona
 * ("2026-08-10T08:18"), una fecha suelta ("2026-08-10") y registros
 * históricos ya escritos como `DD/MM/AAAA`.
 *
 * Las dos últimas se interpretan como hora **local** a propósito: `new Date()`
 * las leería como UTC y en Perú (UTC-5) "2026-06-01" se mostraría como
 * 31/05/2026, un día antes del que la persona eligió.
 */
function parse(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  if (!text) return null;
  const plain = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(text);
  if (plain) return new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]), Number(plain[4] || 0), Number(plain[5] || 0));
  const display = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?$/.exec(text);
  if (display) return new Date(Number(display[3]), Number(display[2]) - 1, Number(display[1]), Number(display[4] || 0), Number(display[5] || 0));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** `DD/MM/AAAA` */
export function formatDate(value: string | Date | null | undefined, fallback = EMPTY): string {
  const date = parse(value);
  return date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}` : fallback;
}

/** `HH:MM` en 24 horas */
export function formatTime(value: string | Date | null | undefined, fallback = EMPTY): string {
  const date = parse(value);
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : fallback;
}

/** `DD/MM/AAAA HH:MM` */
export function formatDateTime(value: string | Date | null | undefined, fallback = EMPTY): string {
  const date = parse(value);
  return date ? `${formatDate(date)} ${formatTime(date)}` : fallback;
}

/**
 * Valor para un `<input type="date">`, que **siempre** exige `AAAA-MM-DD` sea
 * cual sea el idioma: el navegador ya lo pinta como dd/mm/aaaa por su cuenta.
 * Sirve para no cortar un ISO con `slice(0, 10)`, que en Perú devuelve el día
 * equivocado cuando la hora UTC ya pasó de medianoche.
 */
export function toDateInput(value: string | Date | null | undefined): string {
  const date = parse(value);
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : '';
}

/** Valor para un `<input type="datetime-local">`: `AAAA-MM-DDTHH:MM`. */
export function toDateTimeInput(value: string | Date | null | undefined): string {
  const date = parse(value);
  return date ? `${toDateInput(date)}T${formatTime(date)}` : '';
}

const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Etiqueta compacta para el eje de un gráfico de barras por día: solo el
 * número salvo que `withMonth` sea true (primer punto de la serie o cambio de
 * mes), donde antepone el mes abreviado para no dejar el eje ambiguo.
 */
export function chartDayLabel(value: string | Date | null | undefined, withMonth: boolean): string {
  const date = parse(value);
  if (!date) return '';
  return withMonth ? `${date.getDate()} ${MONTH_ABBR[date.getMonth()]}` : String(date.getDate());
}

/**
 * Unified Local Date and Time Utility
 * 
 * Prevents timezone displacement bugs (e.g. UTC ISO string splitting shifting evening sessions into the next day).
 * Uses local browser/environment timezone components consistently.
 */

/**
 * Returns 'YYYY-MM-DD' formatted strictly in the LOCAL timezone.
 */
export function toLocalDateString(input: Date | string): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Alias for toLocalDateString for compatibility.
 */
export function formatDate(d: Date): string {
  return toLocalDateString(d);
}

/**
 * Parses 'HH:mm' string to minutes from midnight.
 */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Constructs a local Date object from 'YYYY-MM-DD' and 'HH:mm' strings.
 */
export function makeDateTime(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = (timeStr || '00:00').split(':').map(Number);
  return new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0);
}

/**
 * Rounds a Date up to the nearest 15-minute boundary.
 */
export function roundUpTo15(d: Date): Date {
  const rem = d.getMinutes() % 15;
  const addMs = (rem === 0 ? 0 : 15 - rem) * 60 * 1000;
  const rounded = new Date(d.getTime() + addMs);
  rounded.setSeconds(0, 0);
  return rounded;
}

/**
 * Checks if two dates/ISO strings fall on the exact same local calendar day.
 */
export function isSameLocalDate(a: Date | string, b: Date | string): boolean {
  return toLocalDateString(a) === toLocalDateString(b);
}

/**
 * Returns a human-friendly date string (e.g. "Mon, Sep 14") in local time.
 */
export function formatHumanDate(dateOrIso: Date | string): string {
  const d = typeof inputToDate(dateOrIso) === 'object' ? inputToDate(dateOrIso) : new Date();
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Returns the local start of the academic week (Monday 00:00:00.000).
 */
export function getLocalStartOfWeek(referenceDate: Date): Date {
  const d = new Date(referenceDate);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday, 0, 0, 0, 0);
}

/**
 * Returns the local end of the academic week (Sunday 23:59:59.999).
 */
export function getLocalEndOfWeek(referenceDate: Date): Date {
  const monday = getLocalStartOfWeek(referenceDate);
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 23, 59, 59, 999);
}

/**
 * Checks whether a timestamp falls strictly within the local week of referenceDate (Mon 00:00:00 - Sun 23:59:59.999).
 */
export function isInLocalWeek(date: Date | string, referenceDate: Date): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return false;
  const start = getLocalStartOfWeek(referenceDate);
  const end = getLocalEndOfWeek(referenceDate);
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}

function inputToDate(input: Date | string): Date {
  return typeof input === 'string' ? new Date(input) : input;
}

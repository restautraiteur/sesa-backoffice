export const MONTH_NAMES = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export const SHORT_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function isoOf(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, count: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return isoOf(date);
}

/** Monday of the week containing the given ISO date. */
export function mondayOf(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  const shift = (date.getUTCDay() + 6) % 7;
  return addDays(iso, -shift);
}

/** Weeks (Monday → Sunday) covering the whole month. */
export function monthWeeks(year: number, month: number) {
  const first = isoOf(new Date(Date.UTC(year, month, 1)));
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const last = isoOf(new Date(Date.UTC(year, month, lastDay)));
  const weeks: string[][] = [];
  let cursor = mondayOf(first);
  while (cursor <= last) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

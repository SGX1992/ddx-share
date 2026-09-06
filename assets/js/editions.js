/* The DDX tour. This file is the single source of truth: the picker, the poster
   headline, the date line, the background image and the export filename all read
   from it. Add or re-date an edition here and nothing else needs touching.

   `bg` names a file in assets/img/bg/. Missing files fall back to default.jpg,
   and if that's missing too the poster draws a tinted gradient using `tint`.  */
export const EDITIONS = [
  { id: 'san-diego', city: 'San Diego', date: '17TH SEPTEMBER 2026', dated: true,  tint: '#1E4E6B' },
  { id: 'miami',     city: 'Miami',     date: '25TH SEPTEMBER 2026', dated: true,  tint: '#1F5C63' },
  { id: 'london',    city: 'London',    date: '20TH NOVEMBER 2026',  dated: true,  tint: '#3A3F5C' },
  { id: 'dubai',     city: 'Dubai',     date: '27–28 JANUARY 2027',  dated: true,  tint: '#6B4A1E' },
  { id: 'tokyo',     city: 'Tokyo',     date: '12TH FEBRUARY 2027',  dated: true,  tint: '#5C2440' },
  { id: 'munich',    city: 'Munich',    date: '15TH MAY 2027',       dated: true,  tint: '#2B3A4A' },
  { id: 'new-york',  city: 'New York',  date: '25TH JUNE 2027',      dated: true,  tint: '#2E3440' },
];

export const DEFAULT_EDITION = 'san-diego';

export const byId = (id) => EDITIONS.find((e) => e.id === id) || EDITIONS[0];

/* Nice-cased for the picker: "17TH SEPTEMBER 2026" -> "17th September 2026". */
export const prettyDate = (e) =>
  e.date.replace(/\b(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase());

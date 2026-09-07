/* The DDX tour. This file is the single source of truth: the picker, the poster
   headline, the date line, the background image and the export filename all read
   from it. Add or re-date an edition here and nothing else needs touching.

   `bg` names a file in assets/img/bg/. Missing files fall back to default.jpg,
   and if that's missing too the poster draws a tinted gradient using `tint`.

   `partners` is an optional logo strip in assets/img/, printed under the name.
   White marks on transparent, wide and short — it is scaled to a fixed width. */
export const EDITIONS = [
  { id: 'san-diego', city: 'San Diego', date: '17TH SEPTEMBER 2026', dated: true,  tint: '#1E4E6B',
    partners: 'partners-san-diego.png' },
  { id: 'miami',     city: 'Miami',     date: '25TH SEPTEMBER 2026', dated: true,  tint: '#1F5C63' },
  { id: 'london',    city: 'London',    date: '20TH NOVEMBER 2026',  dated: true,  tint: '#3A3F5C' },
  { id: 'dubai',     city: 'Dubai',     date: '27–28 JANUARY 2027',  dated: true,  tint: '#6B4A1E' },
  /* Out of date order on purpose: it is a Tokyo event, and sitting next to the
     other one is more use in the picker than sitting where September falls. */
  { id: 'tokyo-roundtable', city: 'Tokyo Roundtable', date: '9TH SEPTEMBER 2026', dated: true, tint: '#5C2440' },
  { id: 'tokyo',     city: 'Tokyo',     date: '12TH FEBRUARY 2027',  dated: true,  tint: '#5C2440' },
  { id: 'munich',    city: 'Munich',    date: '15TH MAY 2027',       dated: true,  tint: '#2B3A4A' },
  { id: 'new-york',  city: 'New York',  date: '25TH JUNE 2027',      dated: true,  tint: '#2E3440' },
];

/* Nothing is selected to begin with. A link shared with Miami people must not
   arrive with San Diego already chosen — the poster says just "DDX" until
   someone picks, and everything downstream of the choice stays locked. */
export const NO_EDITION = '';
export const DEFAULT_EDITION = NO_EDITION;

export const byId = (id) => EDITIONS.find((e) => e.id === id) || null;

/* Nice-cased for the picker: "17TH SEPTEMBER 2026" -> "17th September 2026". */
export const prettyDate = (e) =>
  e.date.replace(/\b(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase());

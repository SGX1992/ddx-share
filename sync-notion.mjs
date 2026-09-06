#!/usr/bin/env node
/* Pulls the tour straight out of Notion → DDX → Events and rewrites
   assets/js/editions.js, downloading each row's "Key Background Visual"
   into assets/img/bg/.

     NOTION_TOKEN=ntn_xxx node sync-notion.mjs
     NOTION_TOKEN=ntn_xxx node sync-notion.mjs --dry-run

   Needs an internal integration token (notion.so/profile/integrations) with the
   Events database shared to it. The MCP connector can read the database but not
   hand over file bytes — file properties come back as signed URLs only through
   the REST API, which is the whole reason this script exists.

   Signed URLs expire about an hour after they're issued, so the download has to
   happen in the same run as the query. Don't split the two.  */

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BG_DIR = join(HERE, 'assets', 'img', 'bg');
const EDITIONS = join(HERE, 'assets', 'js', 'editions.js');

const DATA_SOURCE = '2289967f-86f3-8035-8430-000b8a3c0891'; // DDX → Events
const TITLE_PROP = 'Conference (Title has to match Lu.ma)';
const BG_PROP = 'Key Background Visual';
const NOTION_VERSION = '2025-09-03';

/* Which rows become editions. The database also holds ideas, past events and
   roundtables — an "I am going" poster only makes sense for something that is
   both real and still upcoming. */
const SKIP_STATUS = ['Idea'];
const INCLUDE_PAST = false;

/* Only used to tint the drawn stand-in when a row has no background file. */
const TINTS = {
  'san-diego': '#1E4E6B', miami: '#1F5C63', london: '#3A3F5C',
  tokyo: '#5C2440', dubai: '#6B4A1E', 'new-york': '#2E3440',
  munich: '#2B3A4A', singapore: '#1F4A57', paris: '#3F3550',
};
const DEFAULT_TINT = '#243040';

const token = process.env.NOTION_TOKEN;
const dryRun = process.argv.includes('--dry-run');
if (!token) {
  console.error('NOTION_TOKEN is not set. See the header of this file.');
  process.exit(1);
}

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'notion-version': NOTION_VERSION,
      'content-type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Notion ${path} → ${res.status} ${await res.text()}`);
  return res.json();
};

/* "🇺🇸 DDX San Diego" → { slug: 'san-diego', city: 'San Diego' } */
function nameParts(title) {
  const city = title
    .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/^\s*DDX\s*/i, '')
    .trim();
  const slug = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { city, slug };
}

const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

/* "2026-09-17" → "17TH SEPTEMBER 2026". Parsed as parts, not as a Date, so a
   machine in a western timezone doesn't shift the day back by one. */
function formatDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const n = d % 100;
  const suffix = n >= 11 && n <= 13 ? 'TH' : { 1: 'ST', 2: 'ND', 3: 'RD' }[d % 10] || 'TH';
  return `${d}${suffix} ${MONTHS[m - 1]} ${y}`;
}

const fileUrl = (prop) => {
  const f = prop?.files?.[0];
  return f?.file?.url || f?.external?.url || null;
};

const extOf = (url) => (new URL(url).pathname.match(/\.(jpe?g|png|webp|avif)$/i)?.[1] || 'jpg').toLowerCase();

async function main() {
  const rows = [];
  let cursor;
  do {
    const page = await api(`/data_sources/${DATA_SOURCE}/query`, {
      method: 'POST',
      body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
    });
    rows.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);

  const today = new Date().toISOString().slice(0, 10);
  const editions = [];
  const downloads = [];

  for (const row of rows) {
    const p = row.properties;
    const title = p[TITLE_PROP]?.title?.map((t) => t.plain_text).join('') || '';
    const start = p.Date?.date?.start;
    const status = p.Status?.select?.name || '';

    if (!title || !start) continue;
    if (SKIP_STATUS.includes(status)) continue;
    if (!INCLUDE_PAST && start.slice(0, 10) < today) {
      console.log(`  skipped (past)  ${title} — ${start}`);
      continue;
    }

    const { city, slug } = nameParts(title);
    const bg = fileUrl(p[BG_PROP]);
    editions.push({
      id: slug, city, date: formatDate(start), start,
      dated: true, tint: TINTS[slug] || DEFAULT_TINT,
      status, hasBg: Boolean(bg),
    });
    if (bg) downloads.push({ slug, url: bg });
  }

  editions.sort((a, b) => a.start.localeCompare(b.start));

  console.log(`\n${editions.length} edition(s):`);
  for (const e of editions)
    console.log(`  ${e.id.padEnd(20)} ${e.date.padEnd(22)} ${e.status.padEnd(15)} ${e.hasBg ? 'bg ✓' : 'bg —'}`);

  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  await mkdir(BG_DIR, { recursive: true });
  for (const { slug, url } of downloads) {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  ! ${slug}: download failed (${res.status})`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const name = `${slug}.${extOf(url)}`;
    await writeFile(join(BG_DIR, name), buf);
    console.log(`  ↓ ${name} (${(buf.length / 1024).toFixed(0)} KB)`);
  }

  const body = editions
    .map((e) => `  { id: ${JSON.stringify(e.id)}, city: ${JSON.stringify(e.city)}, ` +
                `date: ${JSON.stringify(e.date)}, dated: true, tint: ${JSON.stringify(e.tint)} },`)
    .join('\n');

  await writeFile(
    EDITIONS,
    `/* GENERATED by sync-notion.mjs from Notion → DDX → Events. Edits here are\n` +
    `   overwritten on the next sync — change the Notion row instead.\n` +
    `   Last synced: ${new Date().toISOString().slice(0, 10)}\n\n` +
    `   \`bg\` artwork lives in assets/img/bg/<id>.*, pulled from each row's\n` +
    `   "Key Background Visual". A row without one falls back to default.*, then\n` +
    `   to a \`tint\`ed gradient drawn in the browser. */\n` +
    `export const EDITIONS = [\n${body}\n];\n\n` +
    `export const DEFAULT_EDITION = ${JSON.stringify(editions[0]?.id || 'san-diego')};\n\n` +
    `export const byId = (id) => EDITIONS.find((e) => e.id === id) || EDITIONS[0];\n\n` +
    `/* Nice-cased for the picker: "17TH SEPTEMBER 2026" -> "17th September 2026". */\n` +
    `export const prettyDate = (e) =>\n` +
    `  e.date.replace(/\\b(\\w)(\\w*)/g, (_, a, b) => a + b.toLowerCase());\n`,
  );
  console.log(`\nWrote ${EDITIONS}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

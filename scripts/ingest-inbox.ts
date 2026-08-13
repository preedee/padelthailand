#!/usr/bin/env bun
/**
 * ingest-inbox.ts — turn posts you shared from Instagram into tournaments on the site.
 *
 * For each queued post it downloads the poster, reads the artwork with Claude to get the
 * name, dates and city, works out the organizer from the account handle, and then either
 * attaches the poster to a tournament you already have or appends a new row.
 *
 * Reading the poster is the whole point. Captions do not carry the dates — of seven
 * organizers sampled, only two put dates in the caption, and Bangkok Padel Tour's caption
 * gives the *registration* date (9 Dec) for a tournament played on 20 Dec. The dates are
 * printed on the artwork, so that is what gets read.
 *
 *   bun scripts/ingest-inbox.ts              # dry run — prints what it would write
 *   bun scripts/ingest-inbox.ts --apply      # actually writes to the sheet
 *   bun scripts/ingest-inbox.ts --apply --limit 3
 *
 * Config, from scripts/.ingest-config.json (gitignored) or the environment:
 *   { "endpoint": "https://script.google.com/macros/s/…/exec", "secret": "…" }
 *   PADEL_INBOX_ENDPOINT / PADEL_INBOX_SECRET override the file.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { shortcodeOf } from './fetch-posters.ts';

const SHEET_ID = '1uEk015Jv8tNGFYlQ7f5Q_DuO4FZbL8ls3cmZLPwsjsk';
const TOURNAMENTS_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const INBOX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Inbox`;

const ROOT = new URL('..', import.meta.url).pathname;
const POSTER_DIR = join(ROOT, 'posters');
const CRAWLER_UA = 'Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php)';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Column order of the Tournaments tab; the Apps Script maps payload keys onto it.
const ORG_FIELDS = ['Organizer', 'Organizer Website', 'Organizer Instagram',
                    'Organizer Logo', 'Organizer HEX Color'] as const;

interface Extracted {
  name: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  venue: string | null;
  confidence: 'high' | 'low';
}

// ---- CSV -------------------------------------------------------------------

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCSV(csv: string): Record<string, string>[] {
  const lines: string[] = [];
  let buf = '';
  for (const line of csv.split('\n')) {
    buf = buf ? `${buf}\n${line}` : line;
    if (((buf.match(/"/g) || []).length) % 2 === 0) { if (buf.trim()) lines.push(buf); buf = ''; }
  }
  if (buf.trim()) lines.push(buf);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map((line, i) => {
    const cols = parseCSVLine(line);
    const row: Record<string, string> = { __row: String(i + 2) };
    headers.forEach((h, n) => { row[h] = (cols[n] || '').trim(); });
    return row;
  });
}

// ---- dates -----------------------------------------------------------------

/** `2026-03-07` → `07-Mar-2026`, the format the sheet and the site already use. */
function toSheetDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}-${MONTHS[parseInt(m[2], 10) - 1]}-${m[1]}`;
}

function fromSheetDate(value: string): Date | null {
  const parts = (value || '').trim().split('-');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = MONTHS.indexOf(parts[1]);
  const year = parseInt(parts[2], 10);
  return isNaN(day) || month < 0 || isNaN(year) ? null : new Date(year, month, day);
}

// ---- Instagram post metadata ------------------------------------------------

function metaTag(html: string, prop: string): string {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="(.*?)"\\s*/?>`, 's'));
  if (!m) return '';
  return m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"')
             .replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

interface PostMeta { handle: string; caption: string; posted: string }

async function postMeta(shortcode: string): Promise<PostMeta> {
  const res = await fetch(`https://www.instagram.com/p/${shortcode}/`, {
    headers: { 'user-agent': CRAWLER_UA, 'accept-language': 'en-US,en;q=0.9' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`post page ${res.status}`);
  const html = await res.text();

  const description = metaTag(html, 'og:description');
  // "…likes, …comments - appt_challenger on February 27, 2026: "caption…"
  const head = description.match(/-\s*([A-Za-z0-9._]+)\s+on\s+([A-Z][a-z]+ \d{1,2}, \d{4})\s*:/);
  const handleFromUrl = metaTag(html, 'og:url').match(/instagram\.com\/([^/]+)\/p\//);

  const posted = head ? new Date(head[2]) : null;
  return {
    handle: (handleFromUrl?.[1] || head?.[1] || '').toLowerCase(),
    caption: description.replace(/^.*?:\s*"/, '').replace(/"\.?$/, '').slice(0, 900),
    posted: posted && !isNaN(+posted) ? posted.toISOString().slice(0, 10) : '',
  };
}

// ---- reading the poster ------------------------------------------------------

const PROMPT = (file: string, posted: string, caption: string) => `Read the image at ${file}.
It is a poster for a padel tournament in Thailand or Asia.

${posted ? `The post was published on ${posted}. The tournament takes place ON OR AFTER that
date, almost always within six months of it. Use this to resolve the year when the poster
shows only a day and month, and do not be misled by a "Season 2026" or "Vol. 1" year in the
branding — that is marketing, not the date.` : ''}

Caption for context (the dates on the artwork win if they disagree):
"""${caption}"""

Return ONLY a JSON object, no prose, no code fence:
{"name":string|null,"start_date":"YYYY-MM-DD"|null,"end_date":"YYYY-MM-DD"|null,
 "city":string|null,"venue":string|null,"confidence":"high"|"low"}

Rules:
- NEVER use a registration deadline, an "early bird" date or a "registrations open" date as
  the tournament date. Only the date the tournament is played.
- A single-day event has end_date equal to start_date.
- Use null for anything you cannot read with confidence, and set confidence to "low" if the
  dates are not clearly printed on the artwork.`;

async function readPoster(file: string, posted: string, caption: string): Promise<Extracted | null> {
  const proc = Bun.spawn(
    ['claude', '--print', '--model', 'sonnet', '--allowedTools', 'Read',
     '--setting-sources', '', PROMPT(file, posted, caption)],
    { env: { ...process.env, ANTHROPIC_API_KEY: undefined, CLAUDECODE: undefined } as any,
      stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });

  const text = await new Response(proc.stdout).text();
  if (await proc.exited !== 0) {
    console.warn(`    ✗ vision failed: ${(await new Response(proc.stderr).text()).slice(0, 160)}`);
    return null;
  }
  const json = text.match(/\{[\s\S]*\}/);
  if (!json) { console.warn(`    ✗ no JSON in reply: ${text.slice(0, 120)}`); return null; }
  try { return JSON.parse(json[0]) as Extracted; }
  catch { console.warn('    ✗ reply was not valid JSON'); return null; }
}

// ---- matching ----------------------------------------------------------------

/** Organizer identity, keyed by Instagram handle, taken from tournaments already recorded. */
function organizerIndex(rows: Record<string, string>[]) {
  const index = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const handle = (row['Organizer Instagram'] || '').match(/instagram\.com\/([^/?#]+)/)?.[1]?.toLowerCase();
    if (handle && !index.has(handle)) {
      index.set(handle, Object.fromEntries(ORG_FIELDS.map(f => [f, row[f] || ''])));
    }
  }
  return index;
}

/** An existing tournament by the same organizer whose dates overlap — same event, no poster yet. */
function findExisting(rows: Record<string, string>[], organizer: string, start: Date, end: Date) {
  return rows.find(row => {
    if (row['Organizer'] !== organizer) return false;
    if ((row['Tournament Instagram URL'] || '').trim()) return false;
    const rs = fromSheetDate(row['Start Date']);
    const re = fromSheetDate(row['End Date']) || rs;
    return rs && re && rs <= end && re >= start;
  });
}

// ---- endpoint ----------------------------------------------------------------

async function loadConfig() {
  const file = join(ROOT, 'scripts', '.ingest-config.json');
  const onDisk = existsSync(file) ? JSON.parse(await Bun.file(file).text()) : {};
  const endpoint = process.env.PADEL_INBOX_ENDPOINT || onDisk.endpoint;
  const secret = process.env.PADEL_INBOX_SECRET || onDisk.secret;
  return { endpoint, secret };
}

async function post(endpoint: string, fields: Record<string, string>) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
    redirect: 'follow',
  });
  const body = await res.text();
  try { return JSON.parse(body); } catch { return { ok: false, error: body.slice(0, 200) }; }
}

// ---- main ---------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const limitArg = args.indexOf('--limit');
  const limit = limitArg !== -1 ? parseInt(args[limitArg + 1], 10) : Infinity;

  const { endpoint, secret } = await loadConfig();
  if (apply && (!endpoint || !secret)) {
    console.error('--apply needs an endpoint and secret; see the header of this file.');
    process.exit(1);
  }

  // A single post passed on the command line, for one-offs and for testing without
  // an Inbox tab. `--force` re-processes a post already attached to a tournament.
  const urlArg = args.indexOf('--url');
  const single = urlArg !== -1 ? args[urlArg + 1] : null;
  const force = args.includes('--force');

  const tourCsv = await fetch(TOURNAMENTS_URL, { redirect: 'follow' }).then(r => r.text());
  const tournaments = parseCSV(tourCsv).filter(r => r['Tournament Name']);
  const organizers = organizerIndex(tournaments);
  const known = force ? new Set<string>()
    : new Set(tournaments.map(r => shortcodeOf(r['Tournament Instagram URL'])).filter(Boolean));

  let queued: { url: string; status: string }[];
  if (single) {
    queued = [{ url: single, status: 'new' }];
  } else {
    const inboxRes = await fetch(INBOX_URL, { redirect: 'follow' });
    const inboxBody = await inboxRes.text();
    if (!inboxRes.ok || inboxBody.trimStart().startsWith('<')) {
      console.log('No Inbox tab yet — share a post from the Shortcut first, or pass --url <post>.');
      return;
    }
    queued = parseCSV(inboxBody)
      .map(r => ({ url: r['Instagram URL'] || r['URL'] || '', status: (r['Status'] || '').toLowerCase() }))
      .filter(r => r.url && (r.status === 'new' || r.status === ''))
      .slice(0, limit);
  }

  console.log(`${queued.length} queued · ${tournaments.length} tournaments · ${organizers.size} known organizers`);
  console.log(apply ? 'APPLY — the sheet will be written\n' : 'DRY RUN — nothing will be written (pass --apply)\n');

  for (const item of queued) {
    const code = shortcodeOf(item.url);
    if (!code) { console.log(`- ${item.url}\n    skip: not a post URL`); continue; }
    if (known.has(code)) { console.log(`- ${code}\n    skip: already on a tournament row`); continue; }

    const file = join(POSTER_DIR, `${code}.jpg`);
    if (!existsSync(file)) {
      console.log(`- ${code}\n    skip: poster not downloaded yet — run fetch-posters.ts first`);
      continue;
    }

    let meta: PostMeta;
    try { meta = await postMeta(code); }
    catch (err) { console.log(`- ${code}\n    skip: ${(err as Error).message}`); continue; }

    const found = await readPoster(file, meta.posted, meta.caption);
    if (!found || !found.start_date || !found.name) {
      console.log(`- ${code} @${meta.handle}\n    needs you: could not read name/dates from the artwork`);
      continue;
    }

    const org = organizers.get(meta.handle);
    const start = new Date(found.start_date);
    const end = new Date(found.end_date || found.start_date);
    const existing = org ? findExisting(tournaments, org['Organizer'], start, end) : undefined;

    const flag = found.confidence === 'low' ? '  ⚠ low confidence' : '';
    console.log(`- ${code} @${meta.handle}${flag}`);
    console.log(`    ${found.name}  ${found.start_date} → ${found.end_date || found.start_date}  ${found.city || '?'}`);

    if (existing) {
      console.log(`    → link to existing row ${existing.__row}: ${existing['Tournament Name']}`);
      if (apply) {
        const r = await post(endpoint!, { secret: secret!, action: 'linkPoster', row: existing.__row, url: item.url });
        console.log(`      ${r.ok ? 'linked' : 'FAILED: ' + r.error}`);
      }
      continue;
    }

    if (!org) {
      console.log(`    → new row, but @${meta.handle} is not a known organizer — it will have no logo or colour`);
    } else {
      console.log(`    → new row for ${org['Organizer']}`);
    }

    const payload: Record<string, string> = {
      'Tournament Name': found.name,
      'Start Date': toSheetDate(found.start_date),
      'End Date': toSheetDate(found.end_date || found.start_date),
      'City': found.city || '',
      'Country': 'Thailand',
      'Club': found.venue || '',
      'Tournament Instagram URL': item.url,
      'Hide': found.confidence === 'low' ? 'yes' : '',
      ...(org || { Organizer: meta.handle }),
    };
    if (found.confidence === 'low') {
      console.log('      marked Hide=yes so it stays off the site until you check it');
    }
    if (apply) {
      const r = await post(endpoint!, { secret: secret!, action: 'addTournament', payload: JSON.stringify(payload) });
      console.log(`      ${r.ok ? 'added row ' + r.row : 'FAILED: ' + r.error}`);
    }
  }

  if (!apply) console.log('\nRe-run with --apply to write these to the sheet.');
}

if (import.meta.main) await main();

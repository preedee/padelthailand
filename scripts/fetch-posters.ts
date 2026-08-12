#!/usr/bin/env bun
/**
 * fetch-posters.ts — download tournament posters from Instagram into the repo.
 *
 * Instagram's CDN URLs are signed and expire within days, and instagram.com blocks
 * hotlinking, so the posters have to live here rather than being referenced live.
 *
 * For each tournament whose sheet row carries a `Tournament Instagram URL`, the post page
 * is fetched with a crawler user-agent, its `og:image` is read, and the JPEG is written to
 * posters/<shortcode>.jpg. Re-runs skip anything already on disk, so the normal run is free.
 *
 *   bun scripts/fetch-posters.ts                 # fetch what is missing
 *   bun scripts/fetch-posters.ts --force         # re-download everything
 *   bun scripts/fetch-posters.ts --limit 10      # stop after 10 downloads
 */

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const SHEET_ID = '1uEk015Jv8tNGFYlQ7f5Q_DuO4FZbL8ls3cmZLPwsjsk';
const TOURNAMENTS_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const INBOX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Inbox`;

const ROOT = new URL('..', import.meta.url).pathname;
const POSTER_DIR = join(ROOT, 'posters');
const MANIFEST = join(ROOT, 'data', 'posters.json');

// Instagram serves og:image to crawlers. A browser UA gets the logged-out wall instead.
const CRAWLER_UA = 'Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php)';
const CONCURRENCY = 6;
const RETRIES = 2;
const RETRY_DELAY_MS = 1500;

type Manifest = Record<string, { file: string; w: number; h: number; fetched: string }>;

// ---- CSV ------------------------------------------------------------------

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
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
  // A quoted cell may contain newlines, so rows are assembled by quote parity.
  const rawLines = csv.split('\n');
  const lines: string[] = [];
  let buf = '';
  for (const line of rawLines) {
    buf = buf ? `${buf}\n${line}` : line;
    const quotes = (buf.match(/"/g) || []).length;
    if (quotes % 2 === 0) { if (buf.trim()) lines.push(buf); buf = ''; }
  }
  if (buf.trim()) lines.push(buf);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cols[i] || '').trim(); });
    return row;
  });
}

// ---- Instagram ------------------------------------------------------------

/** `https://www.instagram.com/p/DNz0yDZ2mEY/?igsh=x` → `DNz0yDZ2mEY` */
export function shortcodeOf(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function ogImageFrom(html: string): string | null {
  const m = html.match(/property="og:image"\s+content="([^"]+)"/)
    || html.match(/content="([^"]+)"\s+property="og:image"/);
  return m ? decodeEntities(m[1]) : null;
}

/** Pixel size straight from the JPEG SOF marker — avoids pulling in an image library. */
export function jpegSize(buf: Uint8Array): { w: number; h: number } | null {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    // SOF0..SOF15, excluding the non-frame markers DHT(c4), JPGA(c8) and DAC(cc)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: (buf[i + 5] << 8) | buf[i + 6], w: (buf[i + 7] << 8) | buf[i + 8] };
    }
    i += 2 + ((buf[i + 2] << 8) | buf[i + 3]);
  }
  return null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * The full-size original, at the post's real aspect ratio.
 *
 * `og:image` is a centre-cropped 640px square — the crop is signed into the URL
 * (`stp=c216.0.648.648a_…`) and cannot be rewritten away. `/media/?size=l` serves the
 * uncropped original instead, typically 1080×1350 for a standard 4:5 Instagram post.
 */
async function fetchFullSize(shortcode: string): Promise<Uint8Array | null> {
  const res = await fetch(`https://www.instagram.com/p/${shortcode}/media/?size=l`, {
    headers: { 'user-agent': CRAWLER_UA },
    redirect: 'follow',
  });
  if (!res.ok) return null;
  // A login wall answers 200 with HTML, so the content type is what actually decides.
  if (!(res.headers.get('content-type') || '').startsWith('image/')) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  return bytes.length > 1024 ? bytes : null;
}

/** Cropped square fallback for posts the media endpoint will not serve. */
async function fetchOgImage(shortcode: string): Promise<Uint8Array | null> {
  const page = await fetch(`https://www.instagram.com/p/${shortcode}/`, {
    headers: { 'user-agent': CRAWLER_UA, 'accept-language': 'en-US,en;q=0.9' },
    redirect: 'follow',
  });
  if (!page.ok) throw new Error(`post page ${page.status}`);

  const src = ogImageFrom(await page.text());
  if (!src) throw new Error('no og:image (private, deleted, or login-walled)');

  const img = await fetch(src, { headers: { 'user-agent': CRAWLER_UA } });
  if (!img.ok) throw new Error(`image ${img.status}`);

  const bytes = new Uint8Array(await img.arrayBuffer());
  return bytes.length > 1024 ? bytes : null;
}

async function fetchPoster(shortcode: string): Promise<{ w: number; h: number } | null> {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const bytes = (await fetchFullSize(shortcode)) ?? (await fetchOgImage(shortcode));
      if (!bytes) throw new Error('no image available');

      await writeFile(join(POSTER_DIR, `${shortcode}.jpg`), bytes);
      return jpegSize(bytes) ?? { w: 0, h: 0 };
    } catch (err) {
      if (attempt === RETRIES) {
        console.warn(`  ✗ ${shortcode}: ${(err as Error).message}`);
        return null;
      }
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
  return null;
}

// ---- Sources --------------------------------------------------------------

/** Post URLs shared from the Instagram app via the iOS Shortcut. Tab may not exist yet. */
async function inboxUrls(): Promise<string[]> {
  try {
    const res = await fetch(INBOX_URL, { redirect: 'follow' });
    if (!res.ok) return [];
    const body = await res.text();
    if (body.trimStart().startsWith('<')) return []; // gviz error page — no Inbox tab
    return parseCSV(body)
      .map(r => r['Instagram URL'] || r['URL'] || '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const limitArg = args.indexOf('--limit');
  const limit = limitArg !== -1 ? parseInt(args[limitArg + 1], 10) : Infinity;

  await mkdir(POSTER_DIR, { recursive: true });
  await mkdir(join(ROOT, 'data'), { recursive: true });

  const [csv, shared] = await Promise.all([
    fetch(TOURNAMENTS_URL, { redirect: 'follow' }).then(r => r.text()),
    inboxUrls(),
  ]);

  const rows = parseCSV(csv).filter(r => r['Tournament Name']);
  const fromSheet = rows.map(r => r['Tournament Instagram URL']).filter(Boolean);
  const codes = [...new Set([...fromSheet, ...shared].map(shortcodeOf).filter(Boolean))] as string[];

  console.log(`${rows.length} tournaments · ${fromSheet.length} with an Instagram post · ${shared.length} shared via Inbox`);
  console.log(`${codes.length} distinct posts to consider`);

  const manifest: Manifest = existsSync(MANIFEST)
    ? JSON.parse(await Bun.file(MANIFEST).text())
    : {};

  const onDisk = new Set((await readdir(POSTER_DIR)).filter(f => f.endsWith('.jpg')).map(f => f.slice(0, -4)));
  const pending = codes.filter(c => force || !onDisk.has(c) || !manifest[c]);
  const todo = pending.slice(0, limit);
  console.log(`${codes.length - pending.length} already downloaded · fetching ${todo.length}\n`);

  let ok = 0;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    const sizes = await Promise.all(batch.map(fetchPoster));
    batch.forEach((code, n) => {
      const size = sizes[n];
      if (!size) return;
      manifest[code] = {
        file: `posters/${code}.jpg`,
        w: size.w,
        h: size.h,
        fetched: new Date().toISOString().slice(0, 10),
      };
      ok++;
    });
    // Written every batch so an interrupted run keeps everything it already earned.
    await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`  ${Math.min(i + CONCURRENCY, todo.length)}/${todo.length} · ${ok} downloaded`);
    if (i + CONCURRENCY < todo.length) await sleep(600);
  }

  console.log(`\n✓ ${ok}/${todo.length} new posters · ${Object.keys(manifest).length} in manifest`);

  if (ok > 0) await optimize();
}

/**
 * Instagram's originals are progressive 1080px JPEGs — far larger than any tile draws, and
 * slow enough to decode that a month's worth paints blank for a beat. The Python step
 * rewrites them as baseline JPEGs at display width and refreshes their manifest dimensions.
 */
async function optimize() {
  const script = join(ROOT, 'scripts', 'optimize-posters.py');
  const proc = Bun.spawn(['python3', script], { stdout: 'inherit', stderr: 'pipe' });
  const code = await proc.exited;
  if (code !== 0) {
    console.warn('\n⚠ optimize-posters.py failed — posters kept at original size');
    console.warn(await new Response(proc.stderr).text());
  }
}

if (import.meta.main) await main();

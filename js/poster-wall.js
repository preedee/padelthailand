// PadelThailand.com — Poster Wall
// One month of tournaments as a wall of Instagram posters. Each poster links to its post.
// Posters are downloaded into posters/ by scripts/fetch-posters.ts and indexed in
// data/posters.json — Instagram CDN URLs are signed and expire, so they are never used live.

const SHEET_ID = '1uEk015Jv8tNGFYlQ7f5Q_DuO4FZbL8ls3cmZLPwsjsk';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const MANIFEST_URL = 'data/posters.json';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_INDEX = MONTHS.reduce((acc, m, i) => (acc[m] = i, acc), {});

const i18n = {
  en: {
    months: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    one: 'tournament', many: 'tournaments', empty: 'No tournaments this month',
    calendar: 'Calendar', loading: 'Loading', failed: 'Could not load tournaments',
  },
  th: {
    months: ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'],
    one: 'ทัวร์นาเมนต์', many: 'ทัวร์นาเมนต์', empty: 'ไม่มีทัวร์นาเมนต์ในเดือนนี้',
    calendar: 'ปฏิทิน', loading: 'กำลังโหลด', failed: 'โหลดข้อมูลไม่สำเร็จ',
  },
};

let events = [];
let posters = {};
let cursor = null;                       // {year, month} currently on screen
let lang = safeGet('pt-lang') || 'en';

const t = key => (i18n[lang] || i18n.en)[key];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } }

// ---- Sheet ----------------------------------------------------------------

function parseCSVLine(line) {
  const out = [];
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

function parseDate(str) {
  const parts = (str || '').trim().split('-');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = MONTH_INDEX[parts[1]];
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || month === undefined || isNaN(year)) return null;
  return new Date(year, month, day);
}

/** `TBC-Sep-2026` — a known month with an undecided day. */
function parseTBCMonth(str) {
  const trimmed = (str || '').trim();
  if (!trimmed.startsWith('TBC-')) return null;
  const parts = trimmed.split('-');
  const month = MONTH_INDEX[parts[1]];
  const year = parseInt(parts[2], 10);
  if (parts.length !== 3 || month === undefined || isNaN(year)) return null;
  return { month, year };
}

/** Google Drive share links are not directly embeddable; rewrite them to the file endpoint. */
function toDirectImageUrl(url) {
  const m = (url || '').match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/);
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}` : (url || '');
}

function shortcodeOf(url) {
  const m = (url || '').match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

function parseSheet(csv) {
  // A quoted cell may span newlines, so rows are assembled by quote parity.
  const lines = [];
  let buf = '';
  for (const line of csv.split('\n')) {
    buf = buf ? `${buf}\n${line}` : line;
    if (((buf.match(/"/g) || []).length) % 2 === 0) { if (buf.trim()) lines.push(buf); buf = ''; }
  }
  if (buf.trim()) lines.push(buf);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (cols[i] || '').trim(); });
    if (!row['Tournament Name']) return null;
    if ((row['Hide'] || '').toLowerCase() === 'yes') return null;

    const tbc = parseTBCMonth(row['Start Date']);
    const start = tbc ? new Date(tbc.year, tbc.month, 1) : parseDate(row['Start Date']);
    if (!start) return null;

    return {
      name: row['Tournament Name'],
      organizer: row['Organizer'] || '',
      color: row['Organizer HEX Color'] || '#666',
      start,
      end: tbc ? new Date(tbc.year, tbc.month + 1, 0) : (parseDate(row['End Date']) || start),
      tbc: !!tbc,
      city: row['City'] || '',
      instagramUrl: row['Tournament Instagram URL'] || '',
      shortcode: shortcodeOf(row['Tournament Instagram URL']),
      orgInstagram: row['Organizer Instagram'] || '',
      logoUrl: toDirectImageUrl(row['Organizer Logo']),
      featured: (row['Featured'] || '').toLowerCase() === 'true',
    };
  }).filter(Boolean);
}

// ---- Month model ----------------------------------------------------------

const monthKey = ({ year, month }) => `${year}-${String(month + 1).padStart(2, '0')}`;

function parseMonthKey(value) {
  const m = (value || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const month = parseInt(m[2], 10) - 1;
  return month >= 0 && month <= 11 ? { year: parseInt(m[1], 10), month } : null;
}

function shiftMonth({ year, month }, delta) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** A tournament belongs to a month if any of its days fall inside it. */
function eventsIn({ year, month }) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0, 23, 59, 59);
  return events
    .filter(e => e.start <= last && e.end >= first)
    .sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
}

function formatDates(e) {
  if (e.tbc) return `TBC ${MONTHS[e.start.getMonth()].toUpperCase()}`;
  const sameDay = e.start.getTime() === e.end.getTime();
  const startStr = `${e.start.getDate()} ${MONTHS[e.start.getMonth()].toUpperCase()}`;
  if (sameDay) return startStr;
  const sameMonth = e.start.getMonth() === e.end.getMonth() && e.start.getFullYear() === e.end.getFullYear();
  return sameMonth
    ? `${e.start.getDate()}–${e.end.getDate()} ${MONTHS[e.end.getMonth()].toUpperCase()}`
    : `${startStr} – ${e.end.getDate()} ${MONTHS[e.end.getMonth()].toUpperCase()}`;
}

// ---- Render ---------------------------------------------------------------

const FALLBACK_ASPECT = 1;               // organizer logos are square brand images

function tileHTML(e) {
  const poster = e.shortcode ? posters[e.shortcode] : null;
  const dates = formatDates(e);
  const wide = e.featured ? ' tile--wide' : '';
  const meta = `
      <span class="tile-dates">${esc(dates)}</span>
      <span class="tile-name">${esc(e.name)}</span>
      <span class="tile-org">${esc([e.organizer, e.city].filter(Boolean).join(' · '))}</span>`;

  if (poster) {
    const aspect = poster.w && poster.h ? poster.h / poster.w : 1;
    return `<a class="tile${wide}" href="${esc(e.instagramUrl)}" target="_blank" rel="noopener"
        data-aspect="${aspect}" aria-label="${esc(`${e.name}, ${dates} — view on Instagram`)}">
      <img class="tile-img" src="${esc(poster.file)}" alt="${esc(e.name)} poster"
           width="${poster.w}" height="${poster.h}" loading="lazy" decoding="async">
      <span class="tile-meta">${meta}</span>
      <span class="tile-accent" style="background:${esc(e.color)}"></span>
    </a>`;
  }

  // No poster yet. Organizer logos in this sheet are full-bleed square brand images, not
  // transparent marks, so they fill the tile like a poster would. The caption stays visible
  // because a logo alone does not say which tournament this is.
  const link = e.instagramUrl || e.orgInstagram;
  const tag = link ? 'a' : 'div';
  const attrs = link ? ` href="${esc(link)}" target="_blank" rel="noopener"` : '';
  const mark = e.logoUrl
    ? `<img class="tile-img" src="${esc(e.logoUrl)}" alt="${esc(e.organizer)} logo" loading="lazy"
           decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">`
    : '';

  return `<${tag} class="tile tile--fallback${wide}"${attrs} data-aspect="${FALLBACK_ASPECT}"
      style="--org:${esc(e.color)}"${link ? ` aria-label="${esc(`${e.name}, ${dates} — view on Instagram`)}"` : ''}>
    ${mark}
    <span class="tile-meta tile-meta--static">${meta}</span>
    <span class="tile-accent" style="background:${esc(e.color)}"></span>
  </${tag}>`;
}

/** Coalesce the bursts of layout requests that image loads produce into one pass per frame. */
let layoutQueued = false;
function scheduleLayout() {
  if (layoutQueued) return;
  layoutQueued = true;
  requestAnimationFrame(() => { layoutQueued = false; layout(); });
}

/** Masonry: convert each tile's true aspect ratio into a grid row span. */
function layout() {
  const wall = document.getElementById('wall');
  const styles = getComputedStyle(wall);
  const row = parseFloat(styles.getPropertyValue('grid-auto-rows')) || 8;
  const gap = parseFloat(styles.getPropertyValue('row-gap')) || 14;

  wall.querySelectorAll('.tile').forEach(tile => {
    const aspect = parseFloat(tile.dataset.aspect) || 1;
    const height = tile.getBoundingClientRect().width * aspect;
    tile.style.gridRow = `span ${Math.max(1, Math.round((height + gap) / (row + gap)))}`;
  });
}

function render() {
  const wall = document.getElementById('wall');
  const list = eventsIn(cursor);
  const months = t('months');

  document.getElementById('month-name').textContent = months[cursor.month];
  document.getElementById('month-year').textContent = cursor.year;
  document.getElementById('month-count').textContent =
    list.length ? `${list.length} ${list.length === 1 ? t('one') : t('many')}` : '';
  document.title = `${months[cursor.month]} ${cursor.year} — Padel Thailand`;

  wall.innerHTML = list.length
    ? list.map(tileHTML).join('')
    : `<p class="wall-empty">${esc(t('empty'))}</p>`;

  layout();
  // Cached images report width 0 until decoded; re-measure once each settles.
  wall.querySelectorAll('img').forEach(img => {
    if (!img.complete) img.addEventListener('load', scheduleLayout, { once: true });
  });
}

function goTo(next, { push = true } = {}) {
  cursor = next;
  if (push) {
    const url = `${location.pathname}?m=${monthKey(cursor)}`;
    history.pushState({ m: monthKey(cursor) }, '', url);
  }
  render();
}

// ---- Chrome ---------------------------------------------------------------

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  safeSet('pt-theme', theme);
}

function applyLang(next) {
  lang = next;
  safeSet('pt-lang', next);
  document.documentElement.lang = next;
  document.getElementById('lang-label').textContent = next.toUpperCase();
  document.getElementById('calendar-link').textContent = t('calendar');
  if (cursor) render();
}

function wireChrome() {
  document.getElementById('prev-month').addEventListener('click', () => goTo(shiftMonth(cursor, -1)));
  document.getElementById('next-month').addEventListener('click', () => goTo(shiftMonth(cursor, 1)));

  document.getElementById('theme-toggle').addEventListener('click', () => {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  document.getElementById('lang-toggle').addEventListener('click', () => {
    applyLang(lang === 'en' ? 'th' : 'en');
  });

  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowLeft') goTo(shiftMonth(cursor, -1));
    if (e.key === 'ArrowRight') goTo(shiftMonth(cursor, 1));
  });

  window.addEventListener('popstate', () => {
    const fromUrl = parseMonthKey(new URLSearchParams(location.search).get('m'));
    goTo(fromUrl || thisMonth(), { push: false });
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(scheduleLayout, 120);
  });
}

function thisMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

async function init() {
  applyLang(lang);
  wireChrome();

  const wall = document.getElementById('wall');
  wall.innerHTML = `<p class="wall-loading">${esc(t('loading'))}</p>`;

  try {
    const [csv, manifest] = await Promise.all([
      fetch(SHEET_URL).then(r => { if (!r.ok) throw new Error(`sheet ${r.status}`); return r.text(); }),
      fetch(MANIFEST_URL).then(r => (r.ok ? r.json() : {})).catch(() => ({})),
    ]);
    events = parseSheet(csv);
    posters = manifest;
  } catch (err) {
    console.error('[poster-wall]', err);
    wall.innerHTML = `<p class="wall-empty">${esc(t('failed'))}</p>`;
    return;
  }

  goTo(parseMonthKey(new URLSearchParams(location.search).get('m')) || thisMonth(), { push: false });
}

document.addEventListener('DOMContentLoaded', init);

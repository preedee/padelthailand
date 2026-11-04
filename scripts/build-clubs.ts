#!/usr/bin/env bun
/**
 * Club registry -> padelthailand.com.
 *
 * Reads the public view clubs.clubs_public (and clubs.club_photos_public) from the registry in Supabase with the
 * public, read-only anon key, then writes:
 *   data/clubs.json          what the calendar map loads
 *   data/club-slugs.json     place_id -> slug, append-only so a renamed club keeps its URL
 *   clubs/<slug>/index.html  one static page per club (what search engines index)
 *   clubs/index.html         the directory that links every club page, grouped by city
 *   sitemap.xml, robots.txt
 *
 * Run weekly by .github/workflows/clubs-build.yml, after the registry's own weekly refresh.
 * Usage: bun scripts/build-clubs.ts [--check]   (--check builds into memory and prints a summary, writes nothing)
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const SUPABASE_URL = "https://bnxmlaulhvfhxvstphwh.supabase.co";
// The anon key is public by design (the registry's preview site ships it too); the view grants anon SELECT only.
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJueG1sYXVsaHZmaHh2c3RwaHdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NzgyMzQsImV4cCI6MjA4OTQ1NDIzNH0.HrrkN3NGMi6_qNgEPkDfvcIN8FUBClsAr3T_NYiSbTs";
const PHOTO_BASE = `${SUPABASE_URL}/storage/v1/object/public/club-photos/`;
const SITE = "https://padelthailand.com";
const ROOT = new URL("..", import.meta.url).pathname;
const CHECK = process.argv.includes("--check");
// --no-pages: write only the data files; scripts/build-directory.ts renders the redesigned pages from data/clubs-full.json
const NO_PAGES = process.argv.includes("--no-pages");

type Amenities = Record<string, boolean>;
type Row = {
  place_id: string; name: string; name_th: string | null; province: string | null; district: string | null;
  lat: number; lng: number; formatted_address: string | null; phone: string | null; phone_local: string | null;
  website: string | null; google_maps_uri: string | null; rating: number | null; user_rating_count: number | null;
  weekday_descriptions: string[] | null; current_weekday_descriptions: string[] | null;
  courts_total: number | null; courts_indoor: number | null; courts_outdoor: number | null; courts_covered: number | null; courts_surface: string | null;
  booking_platform: string | null; booking_url: string | null; price_note: string | null;
  instagram: string | null; facebook: string | null; line_id: string | null; opening_soon: boolean;
  amenities: Amenities | null; google_links: Record<string, string> | null; last_detailed_at: string;
};
type PhotoRow = { place_id: string; storage_path: string; position: number; author_name: string | null; author_uri: string | null };
type Photo = { url: string; author: string | null; authorUrl: string | null };

const COLUMNS = "place_id,name,name_th,province,district,lat,lng,formatted_address,phone,phone_local,website,google_maps_uri,rating,user_rating_count," +
  "weekday_descriptions,current_weekday_descriptions,courts_total,courts_indoor,courts_outdoor,courts_covered,courts_surface," +
  "booking_platform,booking_url,price_note,instagram,facebook,line_id,opening_soon,amenities,google_links,last_detailed_at";

async function get<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Accept-Profile": "clubs", Range: "0-999", "Range-Unit": "items" },
  });
  if (!res.ok) throw new Error(`${path.split("?")[0]}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

// ---- text and link safety: every string from Google or a club's website passes through one of these ----
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeUrl = (u: string | null | undefined): string | null => {
  if (!u) return null;
  try {
    const x = new URL(u);
    // the URL parser leaves quotes and angle brackets in a hostname; none belongs in a real link and they end HTML attributes
    return (x.protocol === "http:" || x.protocol === "https:") && !/["<>]/.test(x.href) ? x.href : null;
  } catch { return null; }
};
const tidy = (s: string) => s.replace(/[   ]/g, " ");
const jsonLd = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");

// ---- the same "city the way a player says it" as the registry's preview site ----
const CITY_RULES: [RegExp, string][] = [
  [/samui/i, "Koh Samui"], [/phangan|pha-ngan|พะงัน/i, "Koh Phangan"], [/koh chang|เกาะช้าง/i, "Koh Chang"],
  [/pattaya|พัทยา|bang lamung|บางละมุง/i, "Pattaya"], [/bangsaen|bang saen|บางแสน|saen suk|แสนสุข/i, "Bangsaen"],
  [/hua hin|หัวหิน|cha-am|ชะอำ/i, "Hua Hin"], [/chiang mai|เชียงใหม่/i, "Chiang Mai"], [/phuket|ภูเก็ต/i, "Phuket"],
  [/krabi|ao nang|กระบี่/i, "Krabi"], [/bangkok|กรุงเทพ|nonthaburi|นนทบุรี|pathum thani|ปทุมธานี|samut prakan|สมุทรปราการ/i, "Bangkok"],
];
const ISLANDS: [string, number, number, number, number][] = [
  ["Koh Samui", 9.38, 9.62, 99.92, 100.10], ["Koh Phangan", 9.66, 9.82, 99.93, 100.12], ["Koh Chang", 11.95, 12.20, 102.22, 102.45], ["Phuket", 7.75, 8.20, 98.25, 98.45],
];
function cityOf(r: Row): string {
  for (const [city, la0, la1, ln0, ln1] of ISLANDS) if (r.lat >= la0 && r.lat <= la1 && r.lng >= ln0 && r.lng <= ln1) return city;
  const hay = [r.name, r.district, r.province].join(" ");
  for (const [re, city] of CITY_RULES) if (re.test(hay)) return city;
  return r.province || "Thailand";
}

const slugify = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const BOOKING: Record<string, string> = { playtomic: "on Playtomic", matchi: "on Matchi", tps: "on The Padel Society", line: "via LINE", whatsapp: "via WhatsApp", facebook: "via Facebook", website: "on the Club's Website", kross: "via the Kross App" };
const bookLabel = (p: string) => "Book " + (BOOKING[p] ?? `on ${p}`);
const AMENITIES: [string, string][] = [
  ["free_parking", "Free Parking"], ["paid_parking", "Paid Parking"], ["restroom", "Restroom"], ["cards", "Cards Accepted"], ["contactless", "Contactless Payment"],
  ["cash_only", "Cash Only"], ["wheelchair_entrance", "Wheelchair-Accessible Entrance"], ["wheelchair_restroom", "Wheelchair-Accessible Restroom"], ["wheelchair_parking", "Wheelchair-Accessible Parking"],
];

type Courts = { total: number | null; indoor: number | null; outdoor: number | null; covered: number | null; surface?: string | null };
function courtsText(c: Courts): string {
  if (!c.total) return "";
  const parts = [`${c.total} ${c.total === 1 ? "court" : "courts"}`];
  if (c.indoor) parts.push(`${c.indoor} indoor`);
  if (c.outdoor) parts.push(`${c.outdoor} outdoor`);
  if (c.covered) parts.push(`${c.covered} covered`);
  return parts.join(" · ");
}
const instagramUrl = (h: string | null) => (h ? `https://www.instagram.com/${encodeURIComponent(h)}/` : null);
const facebookUrl = (h: string | null) => (h ? "https://www.facebook.com/" + h.replace(/[^A-Za-z0-9_.?=\-]/g, "") : null);

type Club = ReturnType<typeof toClub>;
function toClub(r: Row, slug: string, city: string, photos: Photo[], aliases: string[]) {
  const booking = r.booking_platform && safeUrl(r.booking_url) ? { platform: r.booking_platform, url: safeUrl(r.booking_url)!, label: bookLabel(r.booking_platform) } : null;
  return {
    id: r.place_id, slug, name: r.name, nameTh: r.name_th && r.name_th !== r.name ? r.name_th : "",
    city, province: r.province ?? "", district: r.district ?? "", lat: r.lat, lng: r.lng, address: r.formatted_address ?? "",
    courts: { total: r.courts_total, indoor: r.courts_indoor, outdoor: r.courts_outdoor, covered: r.courts_covered, surface: r.courts_surface },
    hours: (r.weekday_descriptions ?? []).map(tidy),
    weekHours: (r.current_weekday_descriptions ?? []).map(tidy),
    phone: r.phone ?? "", phoneLocal: r.phone_local ?? "",
    website: safeUrl(r.website) ?? "", instagramUrl: instagramUrl(r.instagram) ?? "", facebookUrl: facebookUrl(r.facebook) ?? "", tel: r.phone ? r.phone.replace(/[^+\d]/g, "") : "",
    mapsUrl: safeUrl(r.google_maps_uri) ?? "", directionsUrl: safeUrl(r.google_links?.directions) ?? safeUrl(r.google_maps_uri) ?? "", reviewsUrl: safeUrl(r.google_links?.reviews) ?? "",
    booking, priceNote: r.price_note ?? "",
    rating: r.rating, ratingCount: r.user_rating_count ?? 0,
    amenities: AMENITIES.filter(([k]) => r.amenities?.[k] === true).map(([, label]) => label),
    openingSoon: r.opening_soon, photos, aliases, updated: r.last_detailed_at.slice(0, 10),
  };
}

// ---- page templates ----
const GA = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-HYHPE5BTL7"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-HYHPE5BTL7');</script>`;
const THEME_GUARD = `<script>(function(){try{document.documentElement.setAttribute('data-theme',localStorage.getItem('pt-theme')||'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();</script>`;
const SUN = `<svg class="theme-icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const MOON = `<svg class="theme-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

function shell(o: { title: string; description: string; path: string; image?: string; ld?: unknown; body: string }): string {
  const url = `${SITE}${o.path}`;
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${esc(o.title)}</title>
  <meta name="description" content="${esc(o.description)}">
  <link rel="canonical" href="${esc(url)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(o.title)}">
  <meta property="og:description" content="${esc(o.description)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${esc(o.image ?? `${SITE}/img/padel_thailand_logo_light.png`)}">
  <meta name="twitter:card" content="summary_large_image">
  ${THEME_GUARD}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/styles.css?v=1">
  <link rel="stylesheet" href="/css/clubs.css?v=5">
  ${o.ld ? `<script type="application/ld+json">${jsonLd(o.ld)}</script>` : ""}
  ${GA}
</head>
<body class="club-body">
  <header class="header">
    <div class="header-inner">
      <a class="logo" href="/" aria-label="Padel Thailand home">
        <img src="/img/padel_thailand_logo_dark.png" alt="Padel Thailand" class="logo-img logo-dark">
        <img src="/img/padel_thailand_logo_light.png" alt="Padel Thailand" class="logo-img logo-light">
      </a>
      <nav class="nav">
        <a href="/" class="nav-link">Posters</a>
        <a href="/calendar.html" class="nav-link">Calendar</a>
        <a href="/clubs/" class="nav-link active">Clubs</a>
        <button class="theme-toggle" id="theme-toggle" type="button" title="Toggle light or dark mode" aria-label="Toggle light or dark mode">${SUN}${MOON}</button>
      </nav>
    </div>
  </header>
  <main class="club-main">
${o.body}
  </main>
  <footer class="footer"><p>&copy; 2026 PadelThailand.com</p></footer>
  <script src="/js/club-page.js?v=1"></script>
</body>
</html>
`;
}

const link = (href: string | null | undefined, label: string, cls = "club-btn") => (href ? `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>` : "");

function clubPage(c: Club): string {
  const where = [c.district, c.city].filter((x, i, a) => x && a.indexOf(x) === i).join(", ");
  const courts = courtsText(c.courts);
  const phone = c.phone ? `<a class="club-btn" href="tel:${esc(c.tel)}">${esc(c.phoneLocal || c.phone)}</a>` : "";
  const ig = c.instagramUrl, fb = c.facebookUrl;
  const desc = `${c.name} is a padel club in ${c.city}, Thailand${courts ? ` with ${courts.replace(/ · /g, ", ")}` : ""}${c.rating ? `, rated ${c.rating} from ${c.ratingCount} Google ratings` : ""}. Hours, booking and directions.`;
  const photos = c.photos;
  const hero = photos[0]
    ? `<figure class="club-hero"><img src="${esc(photos[0].url)}" alt="${esc(c.name)} courts" fetchpriority="high">${credit(photos[0])}</figure>`
    : "";
  const more = photos.length > 1
    ? `<div class="club-gallery">${photos.slice(1).map((p, i) => `<figure><img loading="lazy" src="${esc(p.url)}" alt="${esc(c.name)} photo ${i + 2}">${credit(p)}</figure>`).join("")}</div>`
    : "";
  const hours = c.hours.length
    ? `<ul class="club-hours">${c.hours.map((h) => { const i = h.indexOf(":"); return `<li data-day="${esc(h.slice(0, i))}"><span>${esc(h.slice(0, i))}</span><span>${esc(h.slice(i + 1).trim())}</span></li>`; }).join("")}</ul>`
    : `<p class="club-muted">Hours not listed.</p>`;
  const amen = c.amenities.length
    ? `<ul class="club-pills">${c.amenities.map((label) => `<li>${esc(label)}</li>`).join("")}</ul>`
    : "";
  const ld = {
    "@context": "https://schema.org", "@type": "SportsActivityLocation", name: c.name, url: `${SITE}/clubs/${c.slug}/`,
    ...(photos.length ? { image: photos.map((p) => p.url) } : {}),
    ...(c.phone ? { telephone: c.phone } : {}),
    address: { "@type": "PostalAddress", ...(c.address ? { streetAddress: c.address } : {}), addressLocality: c.city, addressCountry: "TH" },
    geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lng },
    sameAs: [c.website, ig, fb].filter(Boolean),
  };
  const body = `    <nav class="club-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/clubs/">Clubs</a> / <span>${esc(c.city)}</span></nav>
    <article class="club">
      <h1>${esc(c.name)}</h1>
      ${c.nameTh ? `<p class="club-th" lang="th">${esc(c.nameTh)}</p>` : ""}
      <p class="club-meta">${esc(where)}${c.rating ? ` · ★ ${c.rating} (${c.ratingCount} Google ratings)` : ""}</p>
      ${c.openingSoon ? `<p class="club-soon">Opening Soon</p>` : ""}
      ${hero}
      <div class="club-actions">
        ${c.booking ? link(c.booking.url, c.booking.label, "club-btn club-btn-primary") : ""}
        ${link(c.website, "Website")}${link(ig, "Instagram")}${link(fb, "Facebook")}${phone}
        ${link(c.directionsUrl, "Directions")}${link(c.mapsUrl, "Google Maps")}
      </div>
      <div class="club-grid">
        <section aria-labelledby="h-courts"><h2 id="h-courts">Courts</h2>
          ${courts ? `<p class="club-big">${esc(courts)}</p>` : `<p class="club-muted">Court count not listed yet.</p>`}
          ${c.courts.surface ? `<p>Surface: ${esc(c.courts.surface)}</p>` : ""}
          ${c.priceNote ? `<p>${esc(c.priceNote)}</p>` : ""}
          ${amen}
        </section>
        <section aria-labelledby="h-hours"><h2 id="h-hours">Opening hours</h2>${hours}</section>
        <section aria-labelledby="h-where"><h2 id="h-where">Find it</h2>
          ${c.address ? `<p>${esc(c.address)}</p>` : ""}
          ${link(c.reviewsUrl, "Reviews On Google", "club-btn")}
        </section>
      </div>
      ${more}
      <p class="club-note">Details from Google Maps and the club's booking platform, checked ${esc(c.updated)}. Photos belong to the people credited. <a href="/calendar.html#map">See every club on the map</a>.</p>
    </article>`;
  return shell({ title: `${c.name}, ${c.city} | Padel Thailand`, description: desc, path: `/clubs/${c.slug}/`, image: photos[0]?.url, ld, body });
}
function credit(p: Photo): string {
  if (!p.author) return "";
  const a = safeUrl(p.authorUrl);
  return `<figcaption>Photo: ${a ? `<a href="${esc(a)}" target="_blank" rel="noopener">${esc(p.author)}</a>` : esc(p.author)}</figcaption>`;
}

function directoryPage(clubs: Club[]): string {
  const byCity = new Map<string, Club[]>();
  for (const c of clubs) byCity.set(c.city, [...(byCity.get(c.city) ?? []), c]);
  const cities = [...byCity.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const body = `    <nav class="club-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Clubs</span></nav>
    <article class="club">
      <h1>Padel clubs in Thailand</h1>
      <p class="club-meta">${clubs.length} clubs in ${cities.length} places. <a href="/calendar.html#map">Open the map</a>.</p>
      ${cities.map(([city, list]) => `<section class="club-city" aria-labelledby="c-${esc(slugify(city))}"><h2 id="c-${esc(slugify(city))}">${esc(city)} <span class="club-muted">(${list.length})</span></h2>
        <ul class="club-list">${list.sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
          const t = courtsText(c.courts);
          return `<li><a href="/clubs/${esc(c.slug)}/">${esc(c.name)}</a><span class="club-muted">${esc([t, c.rating ? `★ ${c.rating}` : ""].filter(Boolean).join(" · "))}</span></li>`;
        }).join("")}</ul></section>`).join("\n      ")}
    </article>`;
  return shell({ title: "Padel Clubs in Thailand | Padel Thailand", description: `${clubs.length} padel clubs across Thailand with courts, opening hours, booking links and directions.`, path: "/clubs/", body });
}

// ---- build ----
const [rows, photoRows] = await Promise.all([
  get<Row>(`clubs_public?select=${COLUMNS}&lat=not.is.null&lng=not.is.null&order=name`),
  get<PhotoRow>("club_photos_public?select=place_id,storage_path,position,author_name,author_uri&order=place_id,position"),
]);
if (rows.length < 30) throw new Error(`registry returned only ${rows.length} clubs; refusing to overwrite the site (expected ~65)`);

const photosBy = new Map<string, Photo[]>();
for (const p of photoRows) photosBy.set(p.place_id, [...(photosBy.get(p.place_id) ?? []), { url: PHOTO_BASE + p.storage_path, author: p.author_name, authorUrl: safeUrl(p.author_uri) }]);

const read = async <T>(f: string, fallback: T): Promise<T> => (existsSync(ROOT + f) ? JSON.parse(await readFile(ROOT + f, "utf8")) : fallback);
// aliases: the names tournaments use for a club ("Padel Asia" for "Padel Asia - Bangkok"), confirmed by hand, keyed by place_id
const [slugs, aliases, fixes] = await Promise.all([
  read<Record<string, string>>("data/club-slugs.json", {}), read<Record<string, string[]>>("data/club-aliases.json", {}),
  read<{ city: Record<string, string>; province: Record<string, string>; merge: Record<string, string> }>("data/club-fixes.json", { city: {}, province: {}, merge: {} }),
]);
// fixes: hand corrections keyed by place_id. city/province override what the registry or the rules above say; merge folds a duplicate listing into the club it repeats (its name stays as an alias)
for (const r of rows) { const into = fixes.merge[r.place_id]; if (into) aliases[into] = [...new Set([...(aliases[into] ?? []), r.name])]; }

const taken = new Set(Object.values(slugs));
const clubs: Club[] = rows.filter((r) => !fixes.merge[r.place_id]).map((r0) => {
  const r = { ...r0, province: fixes.province[r0.place_id] ?? r0.province };
  const city = fixes.city[r.place_id] ?? cityOf(r);
  if (!slugs[r.place_id]) {
    const base = slugify(r.name) || "club";
    let s = base;
    if (taken.has(s)) s = `${base}-${slugify(city)}`;
    for (let n = 2; taken.has(s); n++) s = `${base}-${n}`;
    slugs[r.place_id] = s; taken.add(s);
  }
  return toClub(r, slugs[r.place_id], city, (photosBy.get(r.place_id) ?? []).slice(0, 5), aliases[r.place_id] ?? []);
});
// hand-entered clubs the registry lacks (Playtomic venues Google has not listed); a registry club at the same spot or slug wins
const manualClubs = await read<Club[]>("data/club-manual.json", []);
for (const m of manualClubs)
  if (!clubs.some((c) => c.slug === m.slug || (Math.abs(c.lat - m.lat) < 0.0008 && Math.abs(c.lng - m.lng) < 0.0008))) clubs.push(m);
const sortedSlugs = Object.fromEntries(Object.entries(slugs).sort(([a], [b]) => a.localeCompare(b)));

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[["/", null], ["/tournaments/", null], ["/events/", null], ["/about/", null], ["/submit/", null], ["/calendar.html", null], ["/clubs/", null], ...clubs.map((c) => [`/clubs/${c.slug}/`, c.updated] as const)]
  .map(([p, d]) => `  <url><loc>${SITE}${p}</loc>${d ? `<lastmod>${d}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
// The map needs a fraction of each record; the full record only feeds the static pages. One club per line keeps weekly diffs readable.
const toMapClub = (c: Club) => ({
  id: c.id, slug: c.slug, name: c.name, nameTh: c.nameTh, city: c.city, province: c.province, lat: c.lat, lng: c.lng,
  courts: c.courts, hours: c.hours, weekHours: c.weekHours.join() === c.hours.join() ? [] : c.weekHours, updated: c.updated,
  phone: c.phone, phoneLocal: c.phoneLocal, tel: c.tel, website: c.website, instagramUrl: c.instagramUrl, directionsUrl: c.directionsUrl,
  booking: c.booking, openingSoon: c.openingSoon, aliases: c.aliases, photos: c.photos.slice(0, 1),
});
const json = `{"count":${clubs.length},"clubs":[\n${clubs.map((c) => JSON.stringify(toMapClub(c))).join(",\n")}\n]}\n`;

if (CHECK) {
  console.log(`check: ${clubs.length} clubs, ${new Set(clubs.map((c) => c.slug)).size} unique slugs, ${clubs.filter((c) => c.photos.length).length} with photos, json ${(json.length / 1024).toFixed(0)} KB`);
  process.exit(0);
}

await mkdir(ROOT + "data", { recursive: true });
await mkdir(ROOT + "clubs", { recursive: true });
await writeFile(ROOT + "data/club-slugs.json", JSON.stringify(sortedSlugs, null, 1) + "\n");
await writeFile(ROOT + "data/clubs.json", json);
// the full record (address, amenities, rating, every photo) for the page generator; one club per line keeps diffs readable
await writeFile(ROOT + "data/clubs-full.json", `{"count":${clubs.length},"clubs":[\n${clubs.map((c) => JSON.stringify(c)).join(",\n")}\n]}\n`);
if (!NO_PAGES) {
  await Promise.all(clubs.map(async (c) => {
    await mkdir(`${ROOT}clubs/${c.slug}`, { recursive: true });
    await writeFile(`${ROOT}clubs/${c.slug}/index.html`, clubPage(c));
  }));
  await writeFile(ROOT + "clubs/index.html", directoryPage(clubs));
}
// a club that left the registry loses its page; its slug stays reserved in the registry file
const live = new Set(clubs.map((c) => c.slug));
for (const d of await readdir(ROOT + "clubs", { withFileTypes: true }))
  if (d.isDirectory() && !live.has(d.name)) await rm(`${ROOT}clubs/${d.name}`, { recursive: true });
await writeFile(ROOT + "sitemap.xml", sitemap);
await writeFile(ROOT + "robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`built ${NO_PAGES ? "data files (pages: bun scripts/build-directory.ts)" : clubs.length + " club pages, directory"}, sitemap (${rows.length} public clubs, ${Object.keys(slugs).length} slugs reserved)`);

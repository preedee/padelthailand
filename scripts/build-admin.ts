#!/usr/bin/env bun
/**
 * The owner's Admin pages (noindex, not in the sitemap, locked behind a password: see lib/lock.ts).
 *   /admin/         the home: a card per tool and a data-health table (what each club still lacks)
 *   /admin/photos/  Top Photos: every registry photo per club; click the one that should come first. Picks are kept in the
 *                   browser; Download / Copy export { clubSlug: storage_path } as data/club-photo-picks.json, which
 *                   scripts/build-clubs.ts applies on the next build.
 * To add a tool: add a card in `tools` below and a page generator here. Run after build-clubs.ts (reads data/clubs-full.json).
 *
 * Usage: bun scripts/build-admin.ts [--check]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { esc, shell } from "./lib/chrome.ts";
import { ANON_KEY, PHOTO_BASE, SUPABASE_URL, registryGet, type PhotoRow } from "./lib/registry.ts";
import { REGION_ORDER } from "./lib/regions.ts";
import { readJson } from "./lib/util.ts";
import { lockPage } from "./lib/lock.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const CHECK = process.argv.includes("--check");
const OUT = "admin/photos/index.html";
const OUT_HOME = "admin/index.html";

type Club = { id: string; slug: string; name: string; city: string; photos: { url: string }[]; website: string; instagramUrl: string; booking: unknown; courts: { total: number | null }; hours: string[]; phone: string };
const clubs = (await readJson<{ clubs: Club[] }>(ROOT, "data/clubs-full.json", { clubs: [] })).clubs;
const saved = await readJson<Record<string, string>>(ROOT, "data/club-photo-picks.json", {});
const hiddenSaved = await readJson<string[]>(ROOT, "data/club-photo-hidden.json", []);
// photos the owner has already looked at (data/club-photo-seen.json, kept up to date by Mark Reviewed + Save to Site): anything else is new
const seenSaved = await readJson<string[]>(ROOT, "data/club-photo-seen.json", []);
const seenSet = new Set(seenSaved);
const logos = await readJson<Record<string, unknown>>(ROOT, "data/club-logos.json", {});
const photoRows = await registryGet<PhotoRow>("club_photos_public?select=place_id,storage_path,position,author_name,author_uri&order=place_id,position");
const byPlace = new Map<string, PhotoRow[]>();
for (const p of photoRows) { const have = byPlace.get(p.place_id) ?? []; if (!have.some((x) => x.storage_path === p.storage_path)) byPlace.set(p.place_id, [...have, p]); }  // the registry lists some files twice
const bySlug = new Map(clubs.map((c) => [c.slug, c]));
const rel = (url: string) => url.replace(PHOTO_BASE, "");

// clubs in the order of the regions on the map, then by name
const ordered: { region: string; club: Club }[] = [];
for (const [region, , slugs] of REGION_ORDER) for (const s of [...slugs].sort((a, b) => (bySlug.get(a)?.name ?? a).localeCompare(bySlug.get(b)?.name ?? b))) { const club = bySlug.get(s); if (club) ordered.push({ region, club }); }
for (const c of clubs) if (!ordered.some((o) => o.club.slug === c.slug)) ordered.push({ region: "Other", club: c });

const withPhotos = ordered.filter((o) => (byPlace.get(o.club.id) ?? []).length).length;
const newClubs = ordered.filter((o) => (byPlace.get(o.club.id) ?? []).some((p) => !seenSet.has(p.storage_path))).length;
const section = ({ region, club }: { region: string; club: Club }) => {
  const list = byPlace.get(club.id) ?? [];
  const current = club.photos[0] ? rel(club.photos[0].url) : "";
  const grid = list.length
    ? list.map((p, i) => `<div class="pk-ph" data-path="${esc(p.storage_path)}"><button class="pk-pick" type="button" aria-pressed="false" aria-label="Use photo ${i + 1} of ${list.length} as the top photo for ${esc(club.name)}"><img loading="lazy" decoding="async" src="${esc(PHOTO_BASE + p.storage_path)}" alt="${esc(club.name)} photo ${i + 1}"><span class="pk-badge now"${p.storage_path === current ? "" : " hidden"}>Top Now</span><span class="pk-badge pick" hidden>Your Pick</span><span class="pk-badge gone" hidden>Hidden</span><span class="pk-badge new" hidden>New</span></button><button class="pk-hide" type="button" aria-pressed="false" aria-label="Hide photo ${i + 1} from the site">Hide</button><a class="pk-zoom" href="${esc(PHOTO_BASE + p.storage_path)}" target="_blank" rel="noopener" aria-label="Open photo ${i + 1} larger (new tab)">↗</a>${p.author_name ? `<small>${esc(p.author_name)}</small>` : ""}</div>`).join("")
    : `<p class="pk-none">No photos in the registry for this club yet.</p>`;
  return `<section class="pk-club" id="c-${esc(club.slug)}" data-slug="${esc(club.slug)}" data-name="${esc(club.name.toLowerCase())}" data-has="${list.length ? 1 : 0}">
    <header><h2>${esc(club.name)}</h2><span class="pk-meta">${esc(region)} · ${list.length} ${list.length === 1 ? "photo" : "photos"}</span><span class="pk-state" aria-live="polite"></span><span class="pk-newchip" hidden></span><button class="pk-reviewed" type="button" hidden>Mark Reviewed</button><button class="pk-clear" type="button" hidden>Clear pick</button></header>
    <div class="pk-grid">${grid}</div></section>`;
};

const body = `<main class="wrap pk">
  <p class="ad-back"><a href="/admin/">← Admin</a></p>
  <div class="page-head"><span class="badge-ink">Admin · Top Photos</span><h1 style="margin-top:14px">Choose the Top Photo for Each Club</h1>
  <p class="pk-help">Click the photo that should come first on the club page. The first photo is also the one shown on cards and the map. <b>Hide</b> takes a photo off the site (it stays in the registry, and you can bring it back). Press <b>Save to Site</b> when you are done: the site updates by itself in about two minutes. <span class="pk-keys">↗ opens a photo larger in a new tab.</span></p>
  <details class="pk-gh" id="pk-gh"><summary>Connect GitHub (one time)</summary>
    <p>Saving writes two small files to the site's repository, so this page needs a GitHub token. Create one at <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>: choose <b>Only select repositories</b> and pick <b>padelthailand</b>, then under Permissions set <b>Contents</b> to <b>Read and write</b>. Paste the token below. It is kept only in this browser.</p>
    <div class="pk-gh-row"><label class="pk-search"><span class="sr">GitHub token</span><input id="pk-token" type="password" placeholder="github_pat_…" autocomplete="off"></label><button type="button" class="btn" id="pk-token-save">Connect</button><button type="button" class="btn" id="pk-token-clear" hidden>Disconnect</button></div>
  </details></div>
  <div class="pk-bar" role="region" aria-label="Progress and tools">
    <span class="pk-progress"><b id="pk-done">0</b> of ${withPhotos} clubs chosen</span>
    <div class="pk-filters" role="group" aria-label="Show"><button type="button" class="chip sq" data-f="all" aria-pressed="true">All</button><button type="button" class="chip sq" data-f="todo" aria-pressed="false">Not Chosen</button><button type="button" class="chip sq" data-f="done" aria-pressed="false">Chosen</button><button type="button" class="chip sq" data-f="new" aria-pressed="false">New Photos <span class="pk-newcount" id="pk-newcount"></span></button></div>
    <label class="pk-search"><span class="sr">Search clubs</span><input id="pk-q" type="search" placeholder="Search clubs" autocomplete="off"></label>
    <div class="pk-actions"><span class="pk-dirty" id="pk-dirty" role="status"></span><button type="button" class="btn solid" id="pk-save">Save to Site</button><button type="button" class="btn" id="pk-download" title="Backup: download the picks and hidden photos as files">Download</button><button type="button" class="btn" id="pk-reset" title="Forget this browser's changes and go back to the saved ones">Reset</button></div>
  </div>
  <p class="pk-msg" id="pk-msg" role="status" aria-live="polite"></p>
  ${ordered.map(section).join("\n  ")}
  <script type="application/json" id="pk-saved">${JSON.stringify(saved).replace(/</g, "\\u003c")}</script>
  <script type="application/json" id="pk-hidden">${JSON.stringify(hiddenSaved).replace(/</g, "\\u003c")}</script>
  <script type="application/json" id="pk-seen">${JSON.stringify(seenSaved).replace(/</g, "\\u003c")}</script>
</main>`;

const html = shell({ title: "Admin: Top Photos | Padel Thailand", description: "Owner tool: choose the top photo for each club.", path: "/admin/photos/", active: "", body, noindex: true, head: `<link rel="stylesheet" href="/css/admin.css?v=7">`, scripts: `<script src="/js/admin-photos.js?v=3" defer></script>` });

// ---------- /admin/: tool cards and the data-health table ----------
const picks = saved;
const yes = `<span class="ad-y" title="Yes">✓<span class="sr"> yes</span></span>`, no = `<span class="ad-n" title="Missing">—<span class="sr"> missing</span></span>`;
const rows = ordered.map(({ region, club }) => {
  const n = (byPlace.get(club.id) ?? []).length;
  const cells = [n ? `${n}` : no, picks[club.slug] ? yes : n ? no : "", logos[club.slug] ? yes : no, club.instagramUrl ? yes : no, club.website ? yes : no, club.phone ? yes : no, club.courts.total ? `${club.courts.total}` : no, club.booking ? yes : no, club.hours.length ? yes : no];
  const gaps = [!n, n > 0 && !picks[club.slug], !logos[club.slug], !club.instagramUrl, !club.website, !club.phone, !club.courts.total, !club.booking, !club.hours.length].filter(Boolean).length;
  return `<tr data-gaps="${gaps}"><th scope="row"><a href="/clubs/${esc(club.slug)}/">${esc(club.name)}</a><small>${esc(region)}</small></th>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
});
const count = (f: (c: Club) => boolean) => ordered.filter((o) => f(o.club)).length;
const stat = (label: string, have: number) => `<div class="ad-stat"><b>${have}</b><span>of ${ordered.length}</span><small>${label}</small></div>`;
// Submissions: the unlocked page reads and reviews visitor reports through two database functions that only answer to this key
// (supabase/0002_admin_submissions.sql). The key sits inside the encrypted pages only; with none set, that page is left unchanged.
const apiKey = process.env.ADMIN_API_KEY;
const sbConfig = apiKey ? `<script type="application/json" id="sb-config">${JSON.stringify({ url: SUPABASE_URL, anon: ANON_KEY, key: apiKey }).replace(/</g, "\\u003c")}</script>` : "";
const tools: { href: string; title: string; text: string; meta: string; id?: string }[] = [
  { href: "/admin/submissions/", title: "Submissions", text: "New club and correction reports from visitors. Mark each one live or rejected.", meta: "Open to see what is waiting", id: "sb-meta" },
  { href: "/admin/photos/", title: "Top Photos", text: "Choose the photo that comes first on each club page, card and map panel.", meta: `${Object.keys(picks).length} of ${withPhotos} clubs chosen${newClubs ? ` · ${newClubs} ${newClubs === 1 ? "club has" : "clubs have"} new photos to review` : ""}` },
  { href: "/admin/stats/", title: "Visitor Stats", text: "Visitors, most viewed pages, where people come from and what they tap, from Google Analytics.", meta: "Refreshed every morning" },
];
const home = `<main class="wrap pk">
  <div class="page-head"><span class="badge-ink">Admin</span><h1 style="margin-top:14px">Padel Thailand Admin</h1>
  <p class="pk-help">Owner tools. These pages are hidden from search engines and cannot change the live site by themselves: they read public data and export files that Claude (or you) commit.</p></div>
  ${sbConfig}
  <h2 class="ad-h">Tools</h2>
  <div class="ad-tools">${tools.map((t) => `<a class="ad-tool" href="${t.href}"><h3>${esc(t.title)}</h3><p>${esc(t.text)}</p><small${t.id ? ` id="${t.id}"` : ""}>${esc(t.meta)}</small></a>`).join("")}</div>
  <h2 class="ad-h">Data Health</h2>
  <p class="pk-help">What each club still lacks, from the registry and the files in <code>data/</code>. Refreshed with every weekly build.</p>
  <div class="ad-stats">${stat("with a top-photo pick", Object.keys(picks).length)}${stat("with a logo", count((c) => !!logos[c.slug]))}${stat("with Instagram", count((c) => !!c.instagramUrl))}${stat("with a website", count((c) => !!c.website))}${stat("with court counts", count((c) => !!c.courts.total))}${stat("with a booking link", count((c) => !!c.booking))}</div>
  <div class="pk-bar" style="position:static"><div class="pk-filters" role="group" aria-label="Show"><button type="button" class="chip sq" data-g="all" aria-pressed="true">All Clubs</button><button type="button" class="chip sq" data-g="gaps" aria-pressed="false">Only Clubs With Gaps</button></div></div>
  <div class="ad-table-wrap"><table class="ad-table"><thead><tr><th scope="col">Club</th><th scope="col">Photos</th><th scope="col">Top Pick</th><th scope="col">Logo</th><th scope="col">Instagram</th><th scope="col">Website</th><th scope="col">Phone</th><th scope="col">Courts</th><th scope="col">Booking</th><th scope="col">Hours</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>
</main>`;
const subBody = `<main class="wrap pk">
  <p class="ad-back"><a href="/admin/">← Admin</a></p>
  <div class="page-head"><span class="badge-ink">Admin · Submissions</span><h1 style="margin-top:14px">Club and Correction Reports</h1>
  <p class="pk-help">What visitors sent through the forms on <a href="/submit/">/submit/</a>. Nothing is on the site until you act: <b>Mark Live</b> means it is checked and ready, so tell Claude and it goes on the site. Contact details are removed 12 months after a report is reviewed.</p></div>
  ${sbConfig}
  <div class="pk-bar" style="position:static"><div class="pk-filters" role="group" aria-label="Show"><button type="button" class="chip sq" data-f="pending" aria-pressed="true">Pending<span></span></button><button type="button" class="chip sq" data-f="live" aria-pressed="false">Live<span></span></button><button type="button" class="chip sq" data-f="rejected" aria-pressed="false">Rejected<span></span></button><button type="button" class="chip sq" data-f="all" aria-pressed="false">All<span></span></button></div><button type="button" class="btn" id="sb-refresh">Refresh</button></div>
  <p class="pk-msg" id="sb-msg" role="status" aria-live="polite"></p>
  <div id="sb-list" class="sb-list"></div>
</main>`;
const subHtml = shell({ title: "Admin: Submissions | Padel Thailand", description: "Owner tool: review submissions.", path: "/admin/submissions/", active: "", body: subBody, noindex: true, head: `<link rel="stylesheet" href="/css/admin.css?v=7">`, scripts: `<script src="/js/admin-submissions.js?v=1" defer></script>` });
const homeHtml = shell({ title: "Admin | Padel Thailand", description: "Owner tools for Padel Thailand.", path: "/admin/", active: "", body: home, noindex: true, head: `<link rel="stylesheet" href="/css/admin.css?v=7">`, scripts: `<script src="/js/admin-home.js?v=2" defer></script>` });
if (CHECK) { console.log(`check: ${ordered.length} clubs, ${withPhotos} with photos, ${photoRows.length} photos, photos page ${(html.length / 1024) | 0} KB, home ${(homeHtml.length / 1024) | 0} KB`); process.exit(0); }
await mkdir(ROOT + dirname(OUT), { recursive: true });
// The pages are published encrypted (scripts/lib/lock.ts). With no ADMIN_PASSWORD the build leaves the published pages as
// they are rather than ever writing a readable copy.
const password = process.env.ADMIN_PASSWORD;
if (!password) { console.log("ADMIN_PASSWORD is not set: admin pages left unchanged (they are never published unlocked)"); process.exit(0); }
await writeFile(ROOT + OUT, await lockPage(html, password));
await writeFile(ROOT + OUT_HOME, await lockPage(homeHtml, password));
if (apiKey) { await mkdir(ROOT + "admin/submissions", { recursive: true }); await writeFile(ROOT + "admin/submissions/index.html", await lockPage(subHtml, password)); }
else console.log("ADMIN_API_KEY is not set: the Submissions page was left unchanged");
console.log(`built (locked) ${OUT_HOME} and ${OUT} (${ordered.length} clubs, ${photoRows.length} photos)`);

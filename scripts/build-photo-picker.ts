#!/usr/bin/env bun
/**
 * /tools/photo-picker/ — a page for choosing the top photo of each club (noindex, not in the sitemap).
 *
 * Lists every photo the registry holds for each club (not just the five the site shows), marks the photo the site uses now,
 * and lets the owner click the one that should come first. Picks are kept in the browser; "Download" / "Copy" export
 * { clubSlug: storage_path } as data/club-photo-picks.json, which scripts/build-clubs.ts applies on the next build.
 * Run after build-clubs.ts (it reads data/clubs-full.json for the current order).
 *
 * Usage: bun scripts/build-photo-picker.ts [--check]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { esc, shell } from "./lib/chrome.ts";
import { PHOTO_BASE, registryGet, type PhotoRow } from "./lib/registry.ts";
import { REGION_ORDER } from "./lib/regions.ts";
import { readJson } from "./lib/util.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const CHECK = process.argv.includes("--check");
const OUT = "tools/photo-picker/index.html";

type Club = { id: string; slug: string; name: string; city: string; photos: { url: string }[] };
const clubs = (await readJson<{ clubs: Club[] }>(ROOT, "data/clubs-full.json", { clubs: [] })).clubs;
const saved = await readJson<Record<string, string>>(ROOT, "data/club-photo-picks.json", {});
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
const section = ({ region, club }: { region: string; club: Club }) => {
  const list = byPlace.get(club.id) ?? [];
  const current = club.photos[0] ? rel(club.photos[0].url) : "";
  const grid = list.length
    ? list.map((p, i) => `<div class="pk-ph" data-path="${esc(p.storage_path)}"><button class="pk-pick" type="button" aria-pressed="false" aria-label="Use photo ${i + 1} of ${list.length} as the top photo for ${esc(club.name)}"><img loading="lazy" decoding="async" src="${esc(PHOTO_BASE + p.storage_path)}" alt="${esc(club.name)} photo ${i + 1}"><span class="pk-badge now"${p.storage_path === current ? "" : " hidden"}>Top Now</span><span class="pk-badge pick" hidden>Your Pick</span></button><a class="pk-zoom" href="${esc(PHOTO_BASE + p.storage_path)}" target="_blank" rel="noopener" aria-label="Open photo ${i + 1} larger (new tab)">↗</a>${p.author_name ? `<small>${esc(p.author_name)}</small>` : ""}</div>`).join("")
    : `<p class="pk-none">No photos in the registry for this club yet.</p>`;
  return `<section class="pk-club" id="c-${esc(club.slug)}" data-slug="${esc(club.slug)}" data-name="${esc(club.name.toLowerCase())}" data-has="${list.length ? 1 : 0}">
    <header><h2>${esc(club.name)}</h2><span class="pk-meta">${esc(region)} · ${list.length} ${list.length === 1 ? "photo" : "photos"}</span><span class="pk-state" aria-live="polite"></span><button class="pk-clear" type="button" hidden>Clear pick</button></header>
    <div class="pk-grid">${grid}</div></section>`;
};

const body = `<main class="wrap pk">
  <div class="page-head"><span class="badge-ink">Owner Tool</span><h1 style="margin-top:14px">Choose the Top Photo for Each Club</h1>
  <p class="pk-help">Click the photo that should come first on the club page. The first photo is also the one shown on cards and the map. Your picks are saved in this browser. When you are done, press <b>Download Picks</b> (or <b>Copy Picks</b>) and give the file or the text to Claude. <span class="pk-keys">↗ opens a photo larger in a new tab.</span></p></div>
  <div class="pk-bar" role="region" aria-label="Progress and tools">
    <span class="pk-progress"><b id="pk-done">0</b> of ${withPhotos} clubs chosen</span>
    <div class="pk-filters" role="group" aria-label="Show"><button type="button" class="chip sq" data-f="all" aria-pressed="true">All</button><button type="button" class="chip sq" data-f="todo" aria-pressed="false">Not Chosen</button><button type="button" class="chip sq" data-f="done" aria-pressed="false">Chosen</button></div>
    <label class="pk-search"><span class="sr">Search clubs</span><input id="pk-q" type="search" placeholder="Search clubs" autocomplete="off"></label>
    <div class="pk-actions"><button type="button" class="btn solid" id="pk-download">Download Picks</button><button type="button" class="btn" id="pk-copy">Copy Picks</button><button type="button" class="btn" id="pk-reset" title="Forget this browser's picks and go back to the saved ones">Reset</button></div>
  </div>
  <p class="pk-msg" id="pk-msg" role="status" aria-live="polite"></p>
  ${ordered.map(section).join("\n  ")}
  <script type="application/json" id="pk-saved">${JSON.stringify(saved).replace(/</g, "\\u003c")}</script>
</main>`;

const html = shell({ title: "Photo Picker | Padel Thailand", description: "Owner tool: choose the top photo for each club.", path: "/tools/photo-picker/", active: "", body, noindex: true, head: `<link rel="stylesheet" href="/css/picker.css?v=1">`, scripts: `<script src="/js/photo-picker.js?v=1" defer></script>` });
if (CHECK) { console.log(`check: ${ordered.length} clubs, ${withPhotos} with photos, ${photoRows.length} photos, ${(html.length / 1024) | 0} KB`); process.exit(0); }
await mkdir(ROOT + dirname(OUT), { recursive: true });
await writeFile(ROOT + OUT, html);
console.log(`built ${OUT} (${ordered.length} clubs, ${photoRows.length} photos)`);

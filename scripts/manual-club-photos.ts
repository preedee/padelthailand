#!/usr/bin/env bun
/**
 * Photos for a hand-entered club (data/club-manual.json) that the registry does not hold: downloads the photos of its Google
 * listing, uploads them to the public `club-photos` bucket under manual-<slug>/ (credit kept), and lists them on the club's
 * `photos` in data/club-manual.json. Then run scripts/photo-variants.ts for the 400/800px copies and rebuild.
 * Delete the club's manual entry (and its photos) once the registry lists the club.
 *
 * Usage: GOOGLE_PLACES_KEY=... SUPABASE_SERVICE_ROLE_KEY=... bun scripts/manual-club-photos.ts <slug> <google place id> [--max 5]
 * Each photo is one Place Photo call (free up to 1,000 a month); the listing lookup is one Place Details call.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { PHOTO_BASE, SUPABASE_URL } from "./lib/registry.ts";

const [slug, placeId] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const max = Number(process.argv[process.argv.indexOf("--max") + 1]) || 5;
const gkey = process.env.GOOGLE_PLACES_KEY, skey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!slug || !placeId || !gkey || !skey) { console.error("usage: GOOGLE_PLACES_KEY=… SUPABASE_SERVICE_ROLE_KEY=… bun scripts/manual-club-photos.ts <slug> <place id> [--max 5]"); process.exit(1); }
const FILE = new URL("../data/club-manual.json", import.meta.url).pathname;
const clubs = JSON.parse(readFileSync(FILE, "utf8")) as { slug: string; photos: { url: string; author: string | null; authorUrl: string | null }[] }[];
const club = clubs.find((c) => c.slug === slug);
if (!club) { console.error(`no manual club "${slug}" in data/club-manual.json`); process.exit(1); }

const det = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, { headers: { "X-Goog-Api-Key": gkey, "X-Goog-FieldMask": "photos" } });
if (!det.ok) throw new Error(`details: HTTP ${det.status} ${await det.text()}`);
const refs = ((await det.json()) as { photos?: { name: string; authorAttributions?: { displayName?: string; uri?: string }[] }[] }).photos ?? [];
console.log(`${refs.length} photos on the Google listing; taking up to ${max}`);

const have = new Set(club.photos.map((p) => p.url));
let added = 0;
for (const r of refs.slice(0, max)) {
  const meta = await fetch(`https://places.googleapis.com/v1/${r.name}/media?maxWidthPx=1600&maxHeightPx=1600&skipHttpRedirect=true`, { headers: { "X-Goog-Api-Key": gkey } });
  if (!meta.ok) throw new Error(`photo meta: HTTP ${meta.status} ${await meta.text()}`);
  const bytes = new Uint8Array(await (await fetch(((await meta.json()) as { photoUri: string }).photoUri)).arrayBuffer());
  const sha = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const path = `manual-${slug}/${sha}.jpg`;
  const url = PHOTO_BASE + path;
  if (have.has(url)) { console.log(`already have ${path}`); continue; }
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/club-photos/${path}`, { method: "POST", headers: { apikey: skey, Authorization: `Bearer ${skey}`, "Content-Type": "image/jpeg", "x-upsert": "true" }, body: bytes });
  if (!up.ok) throw new Error(`upload ${path}: HTTP ${up.status} ${await up.text()}`);
  const a = r.authorAttributions?.[0];
  club.photos.push({ url, author: a?.displayName ?? null, authorUrl: a?.uri ?? null });
  added++;
  console.log(`uploaded ${path} (${(bytes.length / 1024) | 0} KB, credit: ${a?.displayName ?? "none"})`);
}
writeFileSync(FILE, JSON.stringify(clubs, null, 2) + "\n");
console.log(`${added} photo(s) added to ${slug}; run scripts/photo-variants.ts, then the site build`);

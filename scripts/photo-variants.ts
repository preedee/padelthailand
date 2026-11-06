#!/usr/bin/env bun
/**
 * Makes 400px and 800px wide copies of every club photo and uploads them next to the original in the public
 * `club-photos` bucket (<path>-w400.jpg, <path>-w800.jpg), then writes data/photo-variants.json (the originals that have
 * copies). build-directory.ts only adds srcset for photos listed there, so a photo without copies falls back to the original.
 * Re-runnable: photos already in the manifest are skipped. Needs macOS `sips`, and SUPABASE_SERVICE_ROLE_KEY to upload.
 * Usage: bun scripts/photo-variants.ts [--limit N]
 */
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PHOTO_BASE, SUPABASE_URL, registryGet } from "./lib/registry.ts";

const SIZES = [400, 800];
const limit = Number(process.argv[process.argv.indexOf("--limit") + 1]) || Infinity;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) { console.error("missing SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const MANIFEST = new URL("../data/photo-variants.json", import.meta.url).pathname;
const done = new Set<string>(existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : []);
const rows = await registryGet<{ storage_path: string; width_px: number | null }>("club_photos_public?select=storage_path,width_px&limit=5000");
// photos of hand-entered clubs (scripts/manual-club-photos.ts) live in the same bucket but not in the registry
const manual = existsSync(new URL("../data/club-manual.json", import.meta.url).pathname) ? (JSON.parse(readFileSync(new URL("../data/club-manual.json", import.meta.url).pathname, "utf8")) as { photos?: { url: string }[] }[]) : [];
for (const c of manual) for (const p of c.photos ?? []) if (p.url.startsWith(PHOTO_BASE)) rows.push({ storage_path: p.url.slice(PHOTO_BASE.length), width_px: null });
const todo = [...new Set(rows.map((r) => r.storage_path))].filter((p) => !done.has(p)).slice(0, limit);
console.log(`${rows.length} photos, ${done.size} already done, ${todo.length} to do`);
const tmp = mkdtempSync(join(tmpdir(), "photo-variants-"));

async function one(path: string, n: number) {
  const src = join(tmp, `${n}.jpg`);
  const res = await fetch(PHOTO_BASE + path);
  if (!res.ok) throw new Error(`download ${path}: HTTP ${res.status}`);
  await Bun.write(src, await res.arrayBuffer());
  for (const w of SIZES) {
    const out = join(tmp, `${n}-w${w}.jpg`);
    // -Z fits the longest side, so a portrait photo is capped on its height; never enlarge
    const p = Bun.spawnSync(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "75", "-Z", String(w), src, "--out", out]);
    if (p.exitCode !== 0) throw new Error(`sips ${path}: ${p.stderr.toString()}`);
    const dest = path.replace(/\.jpg$/, `-w${w}.jpg`);
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/club-photos/${dest}`, { method: "POST", headers: { apikey: key!, Authorization: `Bearer ${key}`, "Content-Type": "image/jpeg", "x-upsert": "true", "Cache-Control": "max-age=31536000" }, body: Bun.file(out) });
    if (!up.ok) throw new Error(`upload ${dest}: HTTP ${up.status} ${await up.text()}`);
  }
}

let i = 0, ok = 0; const failed: string[] = [];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (i < todo.length) {
    const n = i++, path = todo[n];
    try { await one(path, n); done.add(path); ok++; } catch (e) { failed.push(`${path}: ${(e as Error).message}`); }
  }
}));
writeFileSync(MANIFEST, JSON.stringify([...done].sort(), null, 1) + "\n");
console.log(`uploaded ${ok}, failed ${failed.length}`); failed.slice(0, 10).forEach((f) => console.log(" -", f));

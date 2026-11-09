#!/usr/bin/env bun
/**
 * sitemap.xml, robots.txt and llms.txt: the only script that writes them. Run last, after every page generator.
 *
 * The sitemap is derived from the pages that were actually generated: each index.html is listed at its own
 * <link rel="canonical"> unless it carries a noindex robots meta, so a noindex page (Submit, an empty Events page, 404)
 * can never end up in the sitemap. llms.txt states only facts counted from the site's own data files.
 *
 * Usage: bun scripts/build-seo.ts [--check]   (--check prints what it would write and writes nothing)
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { SITE, SITE_IG } from "./lib/chrome.ts";
import { MIN_HUB_CLUBS, REGION_ORDER, hubPath, hubRegions } from "./lib/regions.ts";
import { readJson, todayBkk, tourEnd } from "./lib/util.ts";
import { CONSENT_REQUIRED } from "./lib/chrome.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const CHECK = process.argv.includes("--check");
const read = (f: string) => readFile(ROOT + f, "utf8");

type SeoClub = { slug: string; name: string; nameTh?: string; city?: string; district?: string; updated: string; courts: { total: number | null; indoor?: number | null; covered?: number | null; outdoor?: number | null }; booking?: { platform: string } | null; openingSoon?: boolean };
const clubs = (await readJson<{ clubs: SeoClub[] }>(ROOT, "data/clubs-full.json", { clubs: [] })).clubs;
const tournaments = (await readJson<{ tournaments: { startDate: string | null; endDate: string | null; monthOnly: string | null }[] }>(ROOT, "data/tournaments.json", { tournaments: [] })).tournaments;
const updatedOf = new Map(clubs.map((c) => [c.slug, c.updated]));
const today = todayBkk();

// ---------- sitemap: every generated page that is indexable ----------
const pageDirs = ["", "guide", "clubs", "regions", "tournaments", "events", "about", "submit"];
const files: string[] = [];
for (const d of pageDirs) {
  if (existsSync(ROOT + (d ? d + "/" : "") + "index.html")) files.push(d ? `${d}/index.html` : "index.html");
  if (d === "clubs" || d === "regions") for (const e of await readdir(ROOT + d, { withFileTypes: true })) if (e.isDirectory() && existsSync(`${ROOT}${d}/${e.name}/index.html`)) files.push(`${d}/${e.name}/index.html`);
}
const hubUpdated = new Map(hubRegions().map(([name, , slugs]) => [hubPath(name), slugs.map((s) => updatedOf.get(s) ?? "").sort().pop() || ""]));
const entries: { loc: string; lastmod: string }[] = [];
for (const f of files) {
  const html = await read(f);
  if (/<meta name="robots" content="[^"]*noindex/i.test(html)) continue;
  const loc = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  if (!loc) { console.warn(`no canonical in ${f}, left out of the sitemap`); continue; }
  const slug = /^clubs\/([^/]+)\/index\.html$/.exec(f)?.[1];
  const path = new URL(loc).pathname;
  entries.push({ loc, lastmod: slug ? updatedOf.get(slug) ?? "" : hubUpdated.get(path) ?? "" });
}
entries.push({ loc: `${SITE}/calendar.html`, lastmod: "" }); // the older calendar page stays indexed
entries.sort((a, b) => a.loc.localeCompare(b.loc));
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map((e) => `  <url><loc>${e.loc}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;

// ---------- robots.txt: crawlers (search and AI assistants) are welcome; the JSON the listing pages render from must stay fetchable ----------
const robots = `# padelthailand.com: all crawlers welcome, including search engines and AI assistants.
# Do not block /data/: the tournament and event pages render from the JSON files in it.
User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;

// ---------- llms.txt: facts counted from the data files, nothing else ----------
const totalCourts = clubs.reduce((a, c) => a + (c.courts.total ?? 0), 0);
const upcoming = tournaments.filter((t) => tourEnd(t) >= today).length;
const regionLines = REGION_ORDER.map(([name, , slugs]) => {
  const rc = slugs.reduce((a, sl) => a + (clubs.find((c) => c.slug === sl)?.courts.total ?? 0), 0);
  const counts = `${slugs.length} ${slugs.length === 1 ? "club" : "clubs"}, ${rc} ${rc === 1 ? "court" : "courts"}`;
  return slugs.length >= MIN_HUB_CLUBS ? `- [Padel in ${name}](${SITE}${hubPath(name)}): ${counts}` : `- Padel in ${name}: ${counts} (see the clubs page)`;
});
const llms = `# Padel Thailand

> Padel Thailand (padelthailand.com) is an independent directory of padel clubs in Thailand: ${clubs.length} clubs and ${totalCourts} courts in ${REGION_ORDER.length} regions, with court types, hours, booking links and directions, plus tournaments and events.

## Regions
${regionLines.join("\n")}

## Main pages
- [Network map](${SITE}/): every club on a transit-style map, including Bangkok BTS and MRT stations
- [All clubs](${SITE}/clubs/): photos, court counts and where each club takes bookings
- [Guide to padel in Thailand](${SITE}/guide/): courts by region, indoor and covered courts, hours, how to book, prices, getting there
- [Club index, one line per club](${SITE}/llms-full.txt): name, area, courts by type and booking platform for every club
- [Tournaments](${SITE}/tournaments/): ${upcoming} upcoming and the archive of past tournaments, with posters
- [Events](${SITE}/events/): weekly social play, once clubs and organisers list it
- [About](${SITE}/about/): where the data comes from and how clubs are treated equally

## Data notes
- Each club page lists courts by type (indoor, covered, outdoor), opening hours, address, and the platform where the club takes bookings.
- Walk times to BTS or MRT stations are straight-line estimates, not measured routes.
- Prices are shown only when a club has told us; otherwise the page says so.
- Photos carry a credit line. Club details come from a registry refreshed weekly and checked by hand.
- The Padel Society (TPS) runs the booking for its own clubs; every club is listed the same way.

## Contact
- Instagram: ${SITE_IG}
- Report a correction or add a club: ${SITE}/submit/
`;

// ---------- llms-full.txt: one line per club, counted from the same data ----------
const regionOf = new Map(REGION_ORDER.flatMap(([name, , slugs]) => slugs.map((s) => [s, name] as const)));
const PLATFORM = { playtomic: "Playtomic", matchi: "Matchi", tps: "The Padel Society", kross: "Kross", line: "LINE", facebook: "Facebook", whatsapp: "WhatsApp" } as Record<string, string>;
const clubLine = (c: SeoClub) => {
  const types = ([["indoor", c.courts.indoor], ["covered", c.courts.covered], ["outdoor", c.courts.outdoor]] as [string, number | null | undefined][]).filter(([, n]) => n).map(([t, n]) => `${n} ${t}`);
  const where = [regionOf.get(c.slug), c.district, c.city].filter((x, i, a) => x && a.indexOf(x) === i).join(", ");
  const courts = c.courts.total ? `${c.courts.total} ${c.courts.total === 1 ? "court" : "courts"}${types.length ? ` (${types.join(", ")})` : ""}` : "court count not listed";
  const book = c.booking ? `books via ${PLATFORM[c.booking.platform] ?? c.booking.platform}` : "no online booking link";
  return `- [${c.name}${c.nameTh ? ` / ${c.nameTh}` : ""}](${SITE}/clubs/${c.slug}/): ${where}; ${courts}; ${book}${c.openingSoon ? "; opening soon" : ""}`;
};
const llmsFull = `# Padel Thailand: club index

> ${clubs.length} padel clubs in Thailand, one line each. Source: padelthailand.com club pages (see ${SITE}/llms.txt). Court counts are as listed by the club or Google; walk times and prices are on each club page.

${REGION_ORDER.map(([name, , slugs]) => `## ${name}\n${clubs.filter((c) => slugs.includes(c.slug)).map(clubLine).join("\n")}`).join("\n\n")}
`;

const LEGACY = ["calendar.html", "competition.html", "organizer.html"];
for (const f of LEGACY) {
  const html = await read(f);
  const legacyRequired = /PT_ANALYTICS=\{consent:"required"\}/.test(html);
  if (legacyRequired !== CONSENT_REQUIRED) console.warn(`WARNING: ${f} is hand-written and has analytics consent "${legacyRequired ? "required" : "off"}", but data/site-config.json says "${CONSENT_REQUIRED ? "required" : "off"}". Update the GA snippet in ${f} to match.`);
}

if (CHECK) {
  console.log(`check: sitemap ${entries.length} urls (${entries.filter((e) => e.lastmod).length} with lastmod), robots ${robots.split("\n").length} lines, llms ${llms.split("\n").length} lines`);
  process.exit(0);
}
await writeFile(ROOT + "sitemap.xml", sitemap);
await writeFile(ROOT + "robots.txt", robots);
await writeFile(ROOT + "llms.txt", llms);
await writeFile(ROOT + "llms-full.txt", llmsFull);
console.log(`wrote sitemap.xml (${entries.length} urls), robots.txt, llms.txt`);

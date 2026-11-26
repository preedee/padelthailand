// The eight display regions (name, Thai name, club slugs, colour) derived from data/network.json, plus the URL slug of each
// region's hub page. Shared by scripts/build-directory.ts (pages) and scripts/build-seo.ts (sitemap, llms.txt).
import { readFileSync } from "node:fs";

type Stops = { slug: string }[];
type Net = {
  colors: Record<string, string>; regions: Record<string, { slugs: string[] }>;
  bkk: { clubs: Stops }[]; off: { slugs: string[] }[]; ring: Stops; pha: Stops; phk: Stops; kbi: Stops;
};
const net = JSON.parse(readFileSync(new URL("../../data/network.json", import.meta.url), "utf8")) as Net;
const INK = "#2D2A4A";
const C = net.colors;
const R = net.regions;

export const REGION_ORDER: [string, string, string[], string][] = [
  ["Bangkok", "กรุงเทพฯ", R.bkk.slugs, INK],
  ["Samui & Phangan", "สมุย · พะงัน", R.gulf.slugs, C.g],
  ["Phuket", "ภูเก็ต", R.phk.slugs, C.s],
  ["Pattaya & Bangsaen", "พัทยา · บางแสน", [...R.pty.slugs, ...R.bs.slugs], C.e],
  ["Chiang Mai", "เชียงใหม่", R.cm.slugs, C.n],
  ["Hua Hin", "หัวหิน", R.hh.slugs, C.s],
  ["Krabi & Lanta", "กระบี่ · เกาะลันตา", R.kbi.slugs, C.s],
  ["Koh Chang", "เกาะช้าง", R.chang.slugs, C.e],
];

// A club can be published only when data/network.json puts it both on a line (as scripts/build-directory.ts derives them)
// and in a region list. scripts/build-clubs.ts leaves the others out, with a warning, so one new club cannot stop the build.
const onLine = new Set([
  ...[...net.bkk.flatMap((s) => s.clubs), ...net.ring, ...net.pha, ...net.phk, ...net.kbi].map((c) => c.slug),
  ...net.off.flatMap((o) => o.slugs), ...["pty", "bs", "chang", "cm", "hh"].flatMap((k) => R[k].slugs),
]);
const inRegion = new Set(REGION_ORDER.flatMap((r) => r[2]));
export const isPlaced = (slug: string) => onLine.has(slug) && inRegion.has(slug);

// Published URLs must not change when a display name is edited, so each hub's slug is written down, not derived.
const HUB_SLUG: Record<string, string> = {
  "Bangkok": "bangkok", "Samui & Phangan": "samui-phangan-and-tao", "Phuket": "phuket", "Pattaya & Bangsaen": "pattaya-and-bangsaen",
  "Chiang Mai": "chiang-mai", "Hua Hin": "hua-hin", "Krabi & Lanta": "krabi-and-lanta", "Koh Chang": "koh-chang",
};
/** the region name tournaments and events use for each display region (listings use "Pattaya" and "Krabi" where the hubs say "Pattaya & Bangsaen" and "Krabi & Lanta") */
const LISTING_REGION: Record<string, string> = { "Pattaya & Bangsaen": "Pattaya", "Krabi & Lanta": "Krabi" };
export const listingRegion = (name: string) => LISTING_REGION[name] ?? name;
/** A hub page is only worth indexing with at least two clubs; a one-club region would be a thin duplicate of the club page. */
export const MIN_HUB_CLUBS = 2;
export const hubRegions = () => REGION_ORDER.filter((r) => r[2].length >= MIN_HUB_CLUBS);
export const isHub = (name: string) => hubRegions().some((r) => r[0] === name);
export const hubPath = (name: string) => `/regions/${HUB_SLUG[name]}/`;

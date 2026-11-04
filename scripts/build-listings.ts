#!/usr/bin/env bun
/**
 * Google Sheet -> data/tournaments.json + data/events.json (Phase 1b data layer).
 *
 * Sources (all read as CSV, no auth; the sheet is link-readable):
 *   Tournaments tab (gid 0)         curated tournaments, the same rows the poster wall used
 *   "Events" tab                    curated events (optional; the build warns and writes [] when it is missing)
 *   "<Type> Submissions" tabs       form submissions, merged ONLY when Status is "live" (pending/rejected are ignored)
 *
 * GOTCHA this script guards against: Google's gviz endpoint answers an unknown sheet name with the FIRST tab,
 * not an error. Every named tab is therefore accepted only if its header row carries the columns we need.
 *
 * Usage: bun scripts/build-listings.ts [--check]   (--check builds in memory, prints the report, writes nothing)
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { shortcodeOf } from "./fetch-posters.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const CHECK = process.argv.includes("--check");
const SHEET_ID = "1uEk015Jv8tNGFYlQ7f5Q_DuO4FZbL8ls3cmZLPwsjsk";
const TOURNAMENTS_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const tabUrl = (name: string) => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;

// ---------- types (the shapes the pages read) ----------
export type Poster = { src: string; w: number; h: number };
export type Tournament = {
  id: string; title: string; organizer: string; clubName: string; organizerColor: string | null; organizerWebsite: string | null; organizerInstagram: string | null; lineColor: string | null;
  startDate: string | null; endDate: string | null; monthOnly: string | null; // "2026-11" when the sheet only knows the month
  city: string; region: string; clubSlug: string | null; venueText: string;
  genders: string[]; tags: string[]; levels: string[]; format: string; entryFee: string; prize: string;
  poster: Poster | null; posterUrl: string | null; regUrl: string | null; regLabel: string; regUrl2: string | null; regLabel2: string;
  instagramUrl: string | null; source: "sheet" | "submission";
};
export type EventItem = {
  id: string; title: string; type: string; clubSlug: string | null; clubName: string; venueText: string; city: string; region: string;
  date: string | null; recurrence: { weekday: string; startTime: string; endTime: string; until: string | null } | null;
  startTime: string; endTime: string; levels: string[]; genders: string[]; capacity: number | null; pricePp: string;
  signupUrl: string | null; poster: Poster | null; posterUrl: string | null; lastConfirmedAt: string | null; lineColor: string | null; source: "sheet" | "submission";
};

// ---------- CSV (RFC 4180: quoted fields, doubled quotes, newlines inside quotes) ----------
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); f = ""; rows.push(row); row = []; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}
const toRecords = (rows: string[][]) => { const [h, ...b] = rows; return b.map((r) => Object.fromEntries(h.map((k, i) => [k.trim(), (r[i] ?? "").trim()]))); };
/** scripts/AppsScript-Submissions.gs prefixes an apostrophe to cells that start with = + - @ so Sheets cannot run them as formulas; undo that */
const unescapeCell = (s: string) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s);
const unescapeRecords = (rs: Record<string, string>[]) => rs.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, unescapeCell(v)])));

/** Google's sheet endpoints return the odd 5xx; retry those (and network errors) a couple of times, fail loudly on anything else. */
async function fetchCsv(url: string): Promise<string[][]> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (res.ok) return parseCsv(await res.text());
      if (res.status < 500 || attempt >= 3) throw new Error(`${url.split("?")[0]} -> HTTP ${res.status}`);
    } catch (err) {
      if (attempt >= 3 || (err instanceof Error && err.message.includes("-> HTTP"))) throw err;
    }
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}
/** A named tab, or null when it does not exist. Rejects the first-tab fallback by checking the header. */
async function fetchTab(name: string, requiredHeaders: string[]): Promise<Record<string, string>[] | null> {
  const rows = await fetchCsv(tabUrl(name)); // a network or HTTP error throws: the nightly job must fail, not commit an empty list
  if (!rows.length) return [];
  const have = new Set(rows[0].map((h) => h.trim()));
  if (!requiredHeaders.every((h) => have.has(h))) return null;
  return toRecords(rows);
}

// ---------- normalisation helpers ----------
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");
/** "21-Feb-2026" -> {date}, "TBC-Nov-2026" -> {month}, ISO "2026-02-21" -> {date}; anything else -> {} */
function parseDate(s: string): { date?: string; month?: string } {
  const t = s.trim();
  let m = /^(\d{1,2})-([A-Za-z]{3})[a-z]*-(\d{4})$/.exec(t);
  if (m && MONTHS[m[2].toLowerCase()]) return { date: `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(+m[1])}` };
  m = /^(?:TBC|TBD|\?+)-([A-Za-z]{3})[a-z]*-(\d{4})$/i.exec(t);
  if (m && MONTHS[m[1].toLowerCase()]) return { month: `${m[2]}-${pad(MONTHS[m[1].toLowerCase()])}` };
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return { date: t };
  return {};
}
const REGION_RULES: [RegExp, string][] = [
  [/samui|phangan|pha-ngan|koh tao|ko tao/i, "Samui & Phangan"], [/phuket/i, "Phuket"], [/krabi|lanta/i, "Krabi"],
  [/pattaya|chonburi|bangsaen|bang saen|rayong/i, "Pattaya"], [/hua hin|cha-?am|prachuap/i, "Hua Hin"], [/chiang mai/i, "Chiang Mai"],
  [/koh chang|ko chang/i, "Koh Chang"], [/bangkok|nonthaburi|pathum|samut prakan|krung thep/i, "Bangkok"],
];
const REGIONS = ["Bangkok", "Samui & Phangan", "Phuket", "Pattaya", "Hua Hin", "Chiang Mai", "Krabi", "Koh Chang"];
const regionOf = (city: string) => REGIONS.find((r) => r.toLowerCase() === city.trim().toLowerCase()) ?? REGION_RULES.find(([re]) => re.test(city))?.[1] ?? "";
const PLACEHOLDER = /^(tb[cd]|location tb[cd]|city tb[cd]|n\/?a|-|\?+|venue tb[cd])$/i;
const slugify = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
const GENDER: Record<string, string> = { male: "Men", men: "Men", mens: "Men", female: "Women", women: "Women", womens: "Women", mixed: "Mixed", open: "Open" };
const safeHttps = (u: string) => { try { const x = new URL(u.trim()); return (x.protocol === "https:" || x.protocol === "http:") && !/["<>]/.test(x.href) ? x.href : null; } catch { return null; } };
const isYes = (s?: string) => /^(y|yes|true|1|x)$/i.test(s ?? "");
const csvList = (s: string) => s.split(/[,;/]/).map((x) => x.trim()).filter(Boolean);

// ---------- club matching ----------
type ClubRef = { slug: string; name: string; city: string; aliases: string[] };
const clubsFile = JSON.parse(await readFile(ROOT + "data/clubs-full.json", "utf8")).clubs as ClubRef[];
const network = JSON.parse(await readFile(ROOT + "data/network.json", "utf8")) as {
  shortNames: Record<string, string>; colors: Record<string, string>;
  bkk: { color: string; clubs: { slug: string }[] }[]; ring: { slug: string }[]; pha: { slug: string }[]; phk: { slug: string }[]; kbi: { slug: string }[];
  regions: Record<string, { slugs: string[] }>;
};
// the transit-line colour a club sits on (the dot on each card); mirrors the line derivation in scripts/build-directory.ts
const lineColor = new Map<string, string>();
for (const s of network.bkk) for (const c of s.clubs) lineColor.set(c.slug, s.color);
for (const [list, col] of [[network.ring, network.colors.g], [network.pha, network.colors.pha], [network.phk, network.colors.s], [network.kbi, network.colors.e]] as const) for (const c of list) lineColor.set(c.slug, col);
for (const [keys, col] of [[["pty", "bs", "chang"], network.colors.e], [["cm"], network.colors.n], [["hh"], network.colors.s]] as const) for (const k of keys) for (const s of network.regions[k]?.slugs ?? []) lineColor.set(s, col);
for (const s of network.regions.bkk.slugs) if (!lineColor.has(s)) lineColor.set(s, "#4A5058"); // Bangkok clubs off the rail network
const manualAlias: Record<string, string> = existsSync(ROOT + "data/listing-club-aliases.json") ? JSON.parse(await readFile(ROOT + "data/listing-club-aliases.json", "utf8")) : {};
// regions for listings that only know their club
const REGION_OF_KEY: Record<string, string> = { bkk: "Bangkok", gulf: "Samui & Phangan", phk: "Phuket", pty: "Pattaya", bs: "Pattaya", cm: "Chiang Mai", hh: "Hua Hin", kbi: "Krabi", chang: "Koh Chang" };
const clubRegion = new Map<string, string>();
for (const [k, v] of Object.entries(network.regions)) for (const s of v.slugs) clubRegion.set(s, REGION_OF_KEY[k] ?? "");

const clubCity = new Map(clubsFile.map((c) => [c.slug, c.city]));
const cityConflicts: string[] = [];
const clubDisplay = new Map(clubsFile.map((c) => [c.slug, network.shortNames[c.slug] ?? c.name]));
const byNorm = new Map<string, string>();
for (const c of clubsFile) for (const n of [c.name, network.shortNames[c.slug] ?? "", ...(c.aliases ?? [])]) if (n && !byNorm.has(norm(n))) byNorm.set(norm(n), c.slug);
for (const [k, v] of Object.entries(manualAlias)) if (!k.startsWith("_")) byNorm.set(norm(k), v);
/** exact = the sheet's text normalises to a club name, short name or confirmed alias; otherwise a unique substring hit ("fuzzy") */
function clubMatchOf(name: string): { slug: string; exact: boolean } | null {
  if (!name || PLACEHOLDER.test(name.trim())) return null;
  const n = norm(name);
  if (byNorm.has(n)) return { slug: byNorm.get(n)!, exact: true };
  if (n.length < 6) return null;
  const hits = [...new Set([...byNorm].filter(([k]) => k.includes(n) || n.includes(k)).filter(([k]) => k.length >= 6).map(([, v]) => v))];
  return hits.length === 1 ? { slug: hits[0], exact: false } : null;
}
const clubSlugOf = (name: string) => clubMatchOf(name)?.slug ?? null;
const fuzzyMatches = new Map<string, string>();

// ---------- posters ----------
const posters: Record<string, { file: string; w: number; h: number }> = existsSync(ROOT + "data/posters.json") ? JSON.parse(await readFile(ROOT + "data/posters.json", "utf8")) : {};
const posterOf = (igUrl: string): Poster | null => { const sc = igUrl ? shortcodeOf(igUrl) : null; const p = sc ? posters[sc] : null; return p ? { src: "/" + p.file, w: p.w, h: p.h } : null; };

// ---------- tournaments ----------
const unmappedCities = new Set<string>(); const unmatchedClubs = new Map<string, number>();

function buildTournament(r: Record<string, string>, source: "sheet" | "submission"): Tournament | null {
  const sheet = source === "sheet";
  const title = r[sheet ? "Tournament Name" : "Title"]; if (!title) return null;
  const s = parseDate(r["Start Date"] ?? ""), e = parseDate(r["End Date"] ?? "");
  const start = s.date ?? null, end = e.date ?? s.date ?? null;
  const monthOnly = !start ? (s.month ?? e.month ?? null) : null;
  const sheetCity = r["City"] ?? ""; const sheetRegion = regionOf(sheetCity);
  if (sheetCity && !PLACEHOLDER.test(sheetCity) && !sheetRegion) unmappedCities.add(sheetCity);
  const clubName = r["Club"] ?? ""; const match = clubMatchOf(clubName); const clubSlug = match?.slug ?? null;
  if (match && !match.exact) fuzzyMatches.set(clubName, match.slug);
  // An exactly matched club knows where it is: if the sheet disagrees (a stale city) the club wins and the conflict is listed in the build log.
  // A fuzzy match is only a guess, so it never overrides the sheet; it just fills a blank.
  const clubReg = clubSlug ? clubRegion.get(clubSlug) ?? "" : "";
  if (match?.exact && clubReg && sheetRegion && clubReg !== sheetRegion) cityConflicts.push(`${title}: sheet city "${sheetCity}" but ${clubDisplay.get(clubSlug!)} is in ${clubReg}`);
  const city = (match?.exact ? clubCity.get(clubSlug!) : "") || sheetCity || (clubSlug ? clubCity.get(clubSlug) ?? "" : "");
  const region = (match?.exact ? clubReg : "") || sheetRegion || clubReg;
  if (clubName && !PLACEHOLDER.test(clubName) && !clubSlug) unmatchedClubs.set(clubName, (unmatchedClubs.get(clubName) ?? 0) + 1);
  const cats = csvList(sheet ? r["Categories"] ?? "" : r["Gender"] ?? "").map((x) => x.toLowerCase());
  const genders = [...new Set(cats.map((c) => GENDER[c]).filter(Boolean))];
  const tags = cats.filter((c) => !GENDER[c]);
  const ig = sheet ? r["Tournament Instagram URL"] ?? "" : r["Instagram URL"] ?? "";
  const poster = posterOf(ig);
  const reg1 = safeHttps(sheet ? r["Tournament Registration URL #1"] ?? "" : r["Registration URL"] ?? "");
  const reg2 = sheet ? safeHttps(r["Tournament Registration URL #2"] ?? "") : null;
  const posterUrl = !sheet ? safeHttps(r["Poster URL"] ?? "") : null;
  return {
    id: `${slugify(title)}-${start ?? monthOnly ?? "tbc"}${sheet ? "" : "-s"}`, title, organizer: r["Organizer"] ?? "", clubName: clubSlug ? clubDisplay.get(clubSlug) ?? "" : "", organizerColor: /^#[0-9a-f]{6}$/i.test(r["Organizer HEX Color"] ?? "") ? r["Organizer HEX Color"] : null,
    organizerWebsite: safeHttps(r["Organizer Website"] ?? ""), organizerInstagram: safeHttps(r["Organizer Instagram"] ?? ""), lineColor: clubSlug ? lineColor.get(clubSlug) ?? null : null, startDate: start, endDate: end, monthOnly,
    city: PLACEHOLDER.test(city) ? "" : city, region, clubSlug, venueText: clubSlug || PLACEHOLDER.test(clubName) ? "" : clubName,
    genders, tags, levels: sheet ? [] : csvList(r["Levels"] ?? ""), format: sheet ? "" : r["Format"] ?? "", entryFee: sheet ? "" : r["Entry Fee"] ?? "", prize: (sheet ? r["Prize Pool"] : r["Prize"]) ?? "",
    poster, posterUrl, regUrl: reg1, regLabel: (sheet ? r["Registration URL Label #1"] : "") || "Register", regUrl2: reg2, regLabel2: (sheet ? r["Registration URL Label #2"] : "") || "Register",
    instagramUrl: safeHttps(ig), source,
  };
}

const SUBMISSION_T = ["Submitted At", "Status", "Title", "Start Date"];
const EVENT_H = ["Title", "Type", "Date", "Weekday"];
const [tCsv, tSubs, eTab, eSubs] = await Promise.all([
  fetchCsv(TOURNAMENTS_URL), fetchTab("Tournament Submissions", SUBMISSION_T), fetchTab("Events", EVENT_H), fetchTab("Event Submissions", ["Submitted At", "Status", ...EVENT_H]),
]);
const tRows = toRecords(tCsv);
if (!tRows.length || !("Tournament Name" in tRows[0])) throw new Error("Tournaments tab did not look like tournaments (header check failed)");
let hidden = 0, foreign = 0;
const tournaments: Tournament[] = [];
for (const r of tRows) {
  if (r["Hide"]) { hidden++; continue; }
  if (r["Country"] && !/^thailand$/i.test(r["Country"])) { foreign++; continue; }
  const t = buildTournament(r, "sheet"); if (t) tournaments.push(t);
}
// live form submissions
let tLive = 0;
for (const r of unescapeRecords(tSubs ?? [])) if (/^live$/i.test(r["Status"])) { const t = buildTournament(r, "submission"); if (t) { tournaments.push(t); tLive++; } }
// de-duplicate ids (same title and date twice)
const seen = new Map<string, number>(); for (const t of tournaments) { const n = (seen.get(t.id) ?? 0) + 1; seen.set(t.id, n); if (n > 1) t.id += `-${n}`; }
tournaments.sort((a, b) => (a.startDate ?? (a.monthOnly ? a.monthOnly + "-28" : "9999")).localeCompare(b.startDate ?? (b.monthOnly ? b.monthOnly + "-28" : "9999")));

// ---------- events ----------
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function buildEvent(r: Record<string, string>, source: "sheet" | "submission"): EventItem | null {
  const title = r["Title"]; if (!title) return null;
  const date = parseDate(r["Date"] ?? "").date ?? null;
  const wd = WEEKDAYS.find((w) => w.toLowerCase() === (r["Weekday"] ?? "").trim().toLowerCase()) ?? "";
  if (!date && !wd) return null;
  const city = r["City"] ?? ""; const clubName = r["Club"] ?? ""; const clubSlug = clubSlugOf(clubName);
  const cap = parseInt(r["Capacity"] ?? "", 10);
  return {
    id: `${slugify(title)}-${date ?? wd.toLowerCase()}${source === "sheet" ? "" : "-s"}`, title, type: r["Type"] ?? "", clubSlug, clubName: clubSlug ? clubDisplay.get(clubSlug) ?? "" : "", venueText: clubSlug || PLACEHOLDER.test(clubName) ? "" : clubName,
    city, region: regionOf(city), date,
    recurrence: !date && wd ? { weekday: wd, startTime: r["Start Time"] ?? "", endTime: r["End Time"] ?? "", until: parseDate(r["Until"] ?? "").date ?? null } : null,
    startTime: r["Start Time"] ?? "", endTime: r["End Time"] ?? "", levels: csvList(r["Levels"] ?? ""), genders: csvList(r["Gender"] ?? "").map((g) => GENDER[g.toLowerCase()] ?? g),
    capacity: Number.isFinite(cap) ? cap : null, pricePp: r["Price Per Person"] ?? "", signupUrl: safeHttps(r["Signup URL"] ?? ""),
    poster: null, posterUrl: safeHttps(r["Poster URL"] ?? ""), lastConfirmedAt: parseDate(r["Last Confirmed At"] ?? "").date ?? null, lineColor: clubSlug ? lineColor.get(clubSlug) ?? null : null, source,
  };
}
const events: EventItem[] = [];
for (const r of eTab ?? []) { if (isYes(r["Hide"])) continue; const e = buildEvent(r, "sheet"); if (e) events.push(e); }
let eLive = 0;
for (const r of unescapeRecords(eSubs ?? [])) if (/^live$/i.test(r["Status"])) { const e = buildEvent(r, "submission"); if (e) { events.push(e); eLive++; } }
// ---------- report + write ----------
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
const up = tournaments.filter((t) => (t.endDate ?? (t.monthOnly ? t.monthOnly + "-31" : "")) >= today).length;
console.log(`tournaments: ${tournaments.length} (${hidden} hidden, ${foreign} outside Thailand skipped, ${tLive} live submissions) · ${up} upcoming · ${tournaments.filter((t) => t.monthOnly).length} month-only dates · ${tournaments.filter((t) => t.poster).length} with poster · ${tournaments.filter((t) => t.clubSlug).length} matched to a club · ${tournaments.filter((t) => !t.region).length} without a region`);
console.log(`events: ${events.length} (${eLive} live submissions)${eTab === null ? " — WARNING: no \"Events\" tab with the expected header; events.json is empty until the tab exists" : ""}${tSubs === null ? " · no Tournament Submissions tab yet" : ""}`);
if (fuzzyMatches.size) console.log("club names matched by substring only (sheet city kept; add an alias in data/listing-club-aliases.json to make it exact):", [...fuzzyMatches].map(([k, v]) => `${k} -> ${v}`).join("; "));
if (cityConflicts.length) console.log("sheet city vs club location conflicts (club location used; fix the sheet):", cityConflicts.join("; "));
if (unmappedCities.size) console.log("cities with no region:", [...unmappedCities].join(", "));
if (unmatchedClubs.size) console.log("club names that matched no club (add to data/listing-club-aliases.json):", [...unmatchedClubs].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`).join("; "));
if (!CHECK) {
  // no timestamp: the nightly job must produce a byte-identical file when the sheet has not changed
  const body = (key: string, list: unknown[]) => `{"count":${list.length},"${key}":[\n${list.map((x) => JSON.stringify(x)).join(",\n")}\n]}\n`;
  await writeFile(ROOT + "data/tournaments.json", body("tournaments", tournaments));
  await writeFile(ROOT + "data/events.json", body("events", events));
  console.log("wrote data/tournaments.json, data/events.json");
}

#!/usr/bin/env bun
/**
 * Pulls the numbers for the admin Stats page from Google Analytics 4 (Data API) into data/ga-snapshot.json.
 * The snapshot is git-ignored on purpose: this repo is public and the Stats page is published encrypted.
 *
 *   bun scripts/fetch-ga4.ts
 *
 * Property id: data/ga4-property.json ({ "property": "123456789" }) or the GA4_PROPERTY env var.
 * Auth: GA4_SA_KEY (the service-account JSON, a GitHub Actions secret), GA4_SA_KEY_FILE (a path), or ~/.config/tbdc/ga4-sa.json.
 * The service account's email needs Viewer on the property (GA > Admin > Property access management).
 * Every range ends yesterday (Bangkok): GA keeps finalising a day for 24 to 48 hours, so today is never shown.
 * A failed query stops the run without writing, so one bad night never replaces good numbers with zeros.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { runReport, type ReportRequest, type Row } from "./lib/ga4.ts";
import { readJson } from "./lib/util.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const property = (process.env.GA4_PROPERTY || (await readJson<{ property: string }>(ROOT, "data/ga4-property.json", { property: "" })).property || "").trim();
if (!property) { console.log("fetch-ga4: no GA4 property id (data/ga4-property.json): skipped"); process.exit(0); }

const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
const add = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const end = day(new Date(Date.now() - 864e5));
const cur = { startDate: add(end, -29), endDate: end }, prev = { startDate: add(end, -59), endDate: add(end, -30) };
const num = (v: string | undefined) => Number(v ?? 0) || 0;
const d = (...n: string[]) => n.map((name) => ({ name })), m = d;
// only the live site: hits from localhost or a preview (development and testing) never count
const LIVE = { filter: { fieldName: "hostName", stringFilter: { matchType: "EXACT", value: "padelthailand.com" } } };
const q = (r: ReportRequest) => runReport(property, { ...r, dimensionFilter: r.dimensionFilter ? { andGroup: { expressions: [LIVE, r.dimensionFilter] } } : LIVE });
const top = (rows: Row[], key: string, metric: string, n: number) => rows.slice(0, n).map((r) => ({ name: r[key] ?? "", n: num(r[metric]) }));

const EVENTS = ["book_click", "directions_click", "show_to_driver", "contact_click", "outbound_click", "club_open", "details_click", "register_click", "map_select", "filter_use"];
const TOTALS = ["activeUsers", "newUsers", "sessions", "screenPageViews", "engagementRate", "averageSessionDuration"];

const [totals, daily, pages, channels, sources, countries, cities, devices, events, landing] = await Promise.all([
  q({ dateRanges: [cur, prev], metrics: m(...TOTALS) }),
  q({ dateRanges: [cur], dimensions: d("date"), metrics: m("activeUsers", "sessions", "screenPageViews"), orderBys: [{ dimension: { dimensionName: "date" } }] }),
  q({ dateRanges: [cur], dimensions: d("pagePath"), metrics: m("screenPageViews", "activeUsers"), orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 60 }),
  q({ dateRanges: [cur], dimensions: d("sessionDefaultChannelGroup"), metrics: m("sessions"), orderBys: [{ metric: { metricName: "sessions" }, desc: true }] }),
  q({ dateRanges: [cur], dimensions: d("sessionSource"), metrics: m("sessions"), orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 10 }),
  q({ dateRanges: [cur], dimensions: d("country"), metrics: m("activeUsers"), orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }], limit: 10 }),
  q({ dateRanges: [cur], dimensions: d("city"), metrics: m("activeUsers"), orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }], limit: 10 }),
  q({ dateRanges: [cur], dimensions: d("deviceCategory"), metrics: m("activeUsers"), orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }] }),
  q({ dateRanges: [cur, prev], dimensions: d("eventName"), metrics: m("eventCount"), dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: EVENTS } } } }),
  q({ dateRanges: [cur], dimensions: d("landingPage"), metrics: m("sessions"), orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 10 }),
]);

// with two date ranges GA adds a "dateRange" dimension named date_range_0 / date_range_1
const pick = (rows: Row[], which: 0 | 1) => rows.filter((r) => (r.dateRange ?? "date_range_0") === `date_range_${which}`);
const tot = (which: 0 | 1) => { const r = pick(totals, which)[0] ?? {}; return Object.fromEntries(TOTALS.map((k) => [k, num(r[k])])); };
const ev = (which: 0 | 1) => Object.fromEntries(EVENTS.map((e) => [e, num(pick(events, which).find((r) => r.eventName === e)?.eventCount)]));

const snapshot = {
  generated: new Date().toISOString(), range: cur, prior: prev,
  totals: tot(0), priorTotals: tot(1),
  daily: daily.map((r) => ({ date: r.date, users: num(r.activeUsers), sessions: num(r.sessions), views: num(r.screenPageViews) })),
  pages: pages.map((r) => ({ path: r.pagePath, views: num(r.screenPageViews), users: num(r.activeUsers) })),
  channels: top(channels, "sessionDefaultChannelGroup", "sessions", 8), sources: top(sources, "sessionSource", "sessions", 8),
  countries: top(countries, "country", "activeUsers", 8), cities: top(cities, "city", "activeUsers", 8), devices: top(devices, "deviceCategory", "activeUsers", 4),
  landing: top(landing, "landingPage", "sessions", 8),
  events: ev(0), priorEvents: ev(1),
};
await mkdir(ROOT + "data", { recursive: true });
await writeFile(ROOT + "data/ga-snapshot.json", JSON.stringify(snapshot));
console.log(`fetch-ga4: ${property}, ${cur.startDate} to ${cur.endDate}: ${snapshot.totals.activeUsers} visitors, ${snapshot.totals.screenPageViews} page views`);

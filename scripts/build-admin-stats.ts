#!/usr/bin/env bun
/**
 * /admin/stats/: visitor numbers from Google Analytics, in plain words (modelled on the TBDC tbqdc.com/web dashboard).
 * Reads data/ga-snapshot.json (written by fetch-ga4.ts, git-ignored) and publishes the page encrypted like the other admin
 * pages (lib/lock.ts). With no snapshot it leaves an existing page alone, and writes a setup page only when there is none.
 *
 * Usage: bun scripts/fetch-ga4.ts && bun scripts/build-admin-stats.ts
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { esc, shell } from "./lib/chrome.ts";
import { lockPage } from "./lib/lock.ts";
import { readJson } from "./lib/util.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = "admin/stats/index.html";
const password = process.env.ADMIN_PASSWORD;
if (!password) { console.log("ADMIN_PASSWORD is not set: stats page left unchanged"); process.exit(0); }

type Pair = { name: string; n: number };
type Snap = {
  generated: string; range: { startDate: string; endDate: string };
  totals: Record<string, number>; priorTotals: Record<string, number>;
  daily: { date: string; users: number; sessions: number; views: number }[]; pages: { path: string; views: number; users: number }[];
  channels: Pair[]; sources: Pair[]; countries: Pair[]; cities: Pair[]; devices: Pair[]; landing: Pair[];
  events: Record<string, number>; priorEvents: Record<string, number>;
};
const snap = await readJson<Snap | null>(ROOT, "data/ga-snapshot.json", null);
const clubs = (await readJson<{ clubs: { slug: string; name: string }[] }>(ROOT, "data/clubs-full.json", { clubs: [] })).clubs;
const clubName = new Map(clubs.map((c) => [c.slug, c.name]));
const head = `<link rel="stylesheet" href="/css/admin.css?v=5">`;
const write = async (body: string) => {
  const html = shell({ title: "Admin: Visitor Stats | Padel Thailand", description: "Owner tool: visitor statistics.", path: "/admin/stats/", active: "", body, noindex: true, head, scripts: "" });
  await mkdir(ROOT + "admin/stats", { recursive: true });
  await writeFile(ROOT + OUT, await lockPage(html, password));
};
const back = `<p class="ad-back"><a href="/admin/">← Admin</a></p>`;

if (!snap) {
  if (existsSync(ROOT + OUT)) { console.log("no GA snapshot: stats page left unchanged"); process.exit(0); }
  await write(`<main class="wrap pk">${back}<div class="page-head"><span class="badge-ink">Admin · Stats</span><h1 style="margin-top:14px">Visitor Stats</h1></div>
  <p class="pk-help"><b>Not connected yet.</b> The numbers appear here once Google Analytics is linked. One-time setup:</p>
  <ol class="st-steps"><li>In Google Analytics, open Admin → Property access management and add <code>tbdc-web-dashboard@tbdc-analytics.iam.gserviceaccount.com</code> as a Viewer.</li>
  <li>Put the property id (Admin → Property details) in <code>data/ga4-property.json</code>.</li>
  <li>Add the repository secret <code>GA4_SA_KEY</code> (the service-account JSON, the same one the TBDC dashboard uses).</li></ol>
  <p class="pk-help">The page then refreshes every morning.</p></main>`);
  console.log("wrote setup page");
  process.exit(0);
}

const n0 = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const delta = (a: number, b: number) => { if (!b) return a ? `<small class="st-up">new</small>` : ""; const p = Math.round(((a - b) / b) * 100); return `<small class="${p >= 0 ? "st-up" : "st-down"}">${p >= 0 ? "▲" : "▼"} ${Math.abs(p)}% vs the 30 days before</small>`; };
const card = (label: string, k: string, fmt = n0) => `<div class="ad-stat"><b>${fmt(snap.totals[k] ?? 0)}</b><small>${label}</small>${delta(snap.totals[k] ?? 0, snap.priorTotals[k] ?? 0)}</div>`;
const mins = (s: number) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;

// 30-day bar chart of visitors per day
// GA leaves out days with no traffic: fill every day of the range so the chart shows the real 30 days
const byDay = new Map(snap.daily.map((r) => [r.date, r]));
const days: { date: string; users: number }[] = [];
for (let t = Date.parse(snap.range.startDate + "T00:00:00Z"); t <= Date.parse(snap.range.endDate + "T00:00:00Z"); t += 864e5) { const k = new Date(t).toISOString().slice(0, 10).replace(/-/g, ""); days.push({ date: k, users: byDay.get(k)?.users ?? 0 }); }
const max = Math.max(1, ...days.map((r) => r.users));
const bw = 100 / Math.max(1, days.length);
const chart = `<svg class="st-chart" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Visitors per day, last 30 days">${days.map((r, i) => { const h = (r.users / max) * 38; return `<rect x="${(i * bw + bw * 0.12).toFixed(2)}" y="${(40 - h).toFixed(2)}" width="${(bw * 0.76).toFixed(2)}" height="${h.toFixed(2)}"><title>${fmtDate(r.date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"))}: ${r.users} visitors</title></rect>`; }).join("")}</svg>
  <div class="st-axis"><span>${fmtDate(snap.range.startDate)}</span><span>Peak day: ${n0(max)} visitors</span><span>${fmtDate(snap.range.endDate)}</span></div>`;

const pageName = (p: string) => {
  if (p === "/") return "Home (Network Map)";
  const c = p.match(/^\/clubs\/([^/]+)\/?$/); if (c) return clubName.get(c[1]!) ?? c[1]!;
  const r = p.match(/^\/regions\/([^/]+)\/?$/); if (r) return `Region: ${r[1]!.replace(/-/g, " ").replace(/\b\w/g, (x) => x.toUpperCase())}`;
  const known: Record<string, string> = { "/clubs/": "All Clubs", "/tournaments/": "Tournaments", "/events/": "Events", "/about/": "About", "/submit/": "Submit" };
  return known[p] ?? p;
};
const pages = snap.pages.filter((p) => !p.path.startsWith("/admin"));
const maxViews = Math.max(1, ...pages.map((p) => p.views));
const pageRows = pages.slice(0, 15).map((p) => `<tr><th scope="row"><a href="${esc(p.path)}">${esc(pageName(p.path))}</a></th><td class="st-bar"><i style="width:${((p.views / maxViews) * 100).toFixed(1)}%"></i></td><td>${n0(p.views)}</td><td>${n0(p.users)}</td></tr>`).join("");
const clubPages = pages.filter((p) => /^\/clubs\/[^/]+\/?$/.test(p.path)).slice(0, 10);
const list = (rows: Pair[], label: (s: string) => string = (s) => s) => rows.length ? `<ul class="st-list">${rows.map((r) => `<li><span>${esc(label(r.name) || "(not set)")}</span><b>${n0(r.n)}</b></li>`).join("")}</ul>` : `<p class="pk-help">No data yet.</p>`;
const EVT: [string, string][] = [["book_click", "Tapped Book"], ["directions_click", "Opened Directions"], ["show_to_driver", "Used Show to Driver"], ["contact_click", "Tapped the phone number"], ["outbound_click", "Left for another site"], ["details_click", "Opened a club's details"], ["club_open", "Opened a club"], ["map_select", "Picked a stop on the map"], ["filter_use", "Used a filter"], ["register_click", "Tapped Register"]];
const evRows = EVT.filter(([k]) => (snap.events[k] ?? 0) || (snap.priorEvents[k] ?? 0)).map(([k, label]) => `<li><span>${label}</span><b>${n0(snap.events[k] ?? 0)}</b>${delta(snap.events[k] ?? 0, snap.priorEvents[k] ?? 0)}</li>`).join("");
const t = snap.totals;

await write(`<main class="wrap pk">${back}
  <div class="page-head"><span class="badge-ink">Admin · Stats</span><h1 style="margin-top:14px">Visitor Stats</h1>
  <p class="pk-help">From Google Analytics: ${fmtDate(snap.range.startDate)} to ${fmtDate(snap.range.endDate)}. Updated every morning; the newest day can still grow for a day or two. A visitor is one person on one device, so the same person on two phones counts twice.</p></div>
  <div class="ad-stats">${card("Visitors", "activeUsers")}${card("New Visitors", "newUsers")}${card("Visits", "sessions")}${card("Pages Viewed", "screenPageViews")}${card("Stayed and Engaged", "engagementRate", (v) => Math.round(v * 100) + "%")}${card("Average Visit Length", "averageSessionDuration", mins)}</div>
  <h2 class="ad-h">Visitors Per Day</h2>${chart}
  <h2 class="ad-h">What Visitors Did</h2><ul class="st-list st-events">${evRows || `<li><span>No taps recorded yet</span></li>`}</ul>
  <h2 class="ad-h">Most Viewed Pages</h2>
  <div class="ad-table-wrap"><table class="ad-table st-table"><thead><tr><th scope="col">Page</th><th scope="col"><span class="sr">Share</span></th><th scope="col">Views</th><th scope="col">Visitors</th></tr></thead><tbody>${pageRows}</tbody></table></div>
  ${clubPages.length ? `<h2 class="ad-h">Most Viewed Clubs</h2>${list(clubPages.map((p) => ({ name: pageName(p.path), n: p.views })))}` : ""}
  <div class="st-cols"><div><h2 class="ad-h">How They Found Us</h2>${list(snap.channels)}<h3 class="st-h3">Top Sources</h3>${list(snap.sources)}</div>
  <div><h2 class="ad-h">Where They Are</h2>${list(snap.countries)}<h3 class="st-h3">Cities</h3>${list(snap.cities)}</div>
  <div><h2 class="ad-h">Devices</h2>${list(snap.devices)}<h3 class="st-h3">First Page Seen</h3>${list(snap.landing, pageName)}</div></div>
  <p class="pk-help" style="margin-top:28px">Visits from you may not show: some browsers block Google Analytics. Visitors who decline cookies are counted without a profile, so totals can run a little low.</p></main>`);
console.log(`wrote ${OUT} (${n0(t.activeUsers ?? 0)} visitors)`);

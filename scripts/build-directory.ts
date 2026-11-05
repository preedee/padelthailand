#!/usr/bin/env bun
/**
 * Redesigned directory pages (Claude Design canvas "Padel Thailand Directory", Phase 1a).
 *
 * Reads data/clubs-full.json (written by scripts/build-clubs.ts) and data/network.json (hand-placed schematic data),
 * then writes:
 *   index.html               home: hero, search, network-map shell (js/network-map.js hydrates it), all-clubs index
 *   clubs/index.html         Clubs page: Photos / List, region filters
 *   clubs/<slug>/index.html  one station-sign page per club
 *   events/index.html        "coming soon" stub until Phase 1b
 *
 * Usage: bun scripts/build-directory.ts [--check]
 * Run after: bun scripts/build-clubs.ts --no-pages
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { SITE, esc, jsonLd, svg, shell, breadcrumbLd } from "./lib/chrome.ts";
import { REGION_ORDER, hubPath, hubRegions, isHub, listingRegion } from "./lib/regions.ts";
import { MONTHS_SHORT, readJson, todayBkk, tourEnd } from "./lib/util.ts";

const ROOT = new URL("..", import.meta.url).pathname;
/** src (+ srcset when the photo has 400px and 800px copies) for an <img> */
const imgAttrs = (p: Photo, sizes: string) => p.thumb && p.mid ? `src="${esc(p.mid)}" srcset="${esc(p.thumb)} 400w, ${esc(p.mid)} 800w" sizes="${sizes}"` : `src="${esc(p.url)}"`;
const CHECK = process.argv.includes("--check");
// the site's own handle sometimes appears as a club's Instagram in the registry; it is not club data (handoff decision 10)
const ownIg = (u: string) => /instagram\.com\/padelthailand\/?$/i.test(u);

// ---------- types ----------
type Photo = { url: string; thumb?: string; mid?: string; author: string | null; authorUrl: string | null };
type Club = {
  id: string; slug: string; name: string; nameTh: string; city: string; province: string; district: string; lat: number; lng: number; address: string;
  courts: { total: number | null; indoor: number | null; outdoor: number | null; covered: number | null; surface?: string | null };
  hours: string[]; phone: string; phoneLocal: string; tel: string; website: string; instagramUrl: string; facebookUrl: string;
  directionsUrl: string; mapsUrl: string; booking: { platform: string; url: string; label: string; icon?: string } | null; priceNote: string;
  rating: number | null; ratingCount: number; amenities: string[]; openingSoon: boolean; photos: Photo[]; updated: string;
};
type Net = {
  colors: Record<string, string>; shortNames: Record<string, string>;
  regions: Record<string, { name: string; th: string; color: string; view: string | null; x: number; y: number; lp: string; slugs: string[] }>;
  bkk: { id: string; name: string; th: string; x: number; y: number; lp: string; line: string; color: string; clubs: { slug: string; km: number | null }[]; seq: string | null }[];
  off: { id: string; name: string; sub: string; slugs: string[] }[];
  ring: { slug: string; area: string }[]; pha: { slug: string; area: string }[]; phk: { slug: string; area: string }[]; kbi: { slug: string; area: string }[];
};

const clubs: Club[] = JSON.parse(await readFile(ROOT + "data/clubs-full.json", "utf8")).clubs;
const net: Net = JSON.parse(await readFile(ROOT + "data/network.json", "utf8"));
const bySlug = new Map(clubs.map((c) => [c.slug, c]));

// tournaments per club, for the teaser on each club page (data/tournaments.json comes from scripts/build-listings.ts)
type TourLite = { title: string; organizer: string; region: string; clubSlug: string | null; startDate: string | null; endDate: string | null; monthOnly: string | null; regUrl: string | null; instagramUrl: string | null };
const tournamentsAll: TourLite[] = (await readJson<{ tournaments: TourLite[] }>(ROOT, "data/tournaments.json", { tournaments: [] })).tournaments;
const TODAY_BKK = todayBkk();
const MON = MONTHS_SHORT;

// ---------- escaping ----------
const stationLabel = (n: string) => n.replace(" · Sukhumvit", "");

// ---------- colours ----------
const INK = "#2D2A4A";
const fg = (c: string) => (c === "#6CBE45" || c === "#E08A2E" ? INK : "#FFFFFF");
const COL = net.colors; // n e s g suk sil blue arl pur pha

// ---------- network derivation: line, area, stop number, walk ----------
type Where = {
  region: string; line: string; color: string; area: string;
  stop: { n: number; of: number } | null; walkKm: number | null; offNetwork: boolean; peers: { area: string; slugs: string[] }[]; kind: "rail" | "loop" | "line" | "off";
};
const regionOf = (slug: string) => REGION_ORDER.find((r) => r[2].includes(slug))!;

const where = new Map<string, Where>();
const walkMin = (km: number) => Math.max(1, Math.round(km * 13)); // the design's estimate: 13 min per km, straight line
function loop(list: { slug: string; area: string }[], line: string, color: string) {
  const groups: Where["peers"] = [];
  for (const s of list) { const g = groups[groups.length - 1]; if (g && g.area === s.area) g.slugs.push(s.slug); else groups.push({ area: s.area, slugs: [s.slug] }); }
  list.forEach((s, i) => {
    const r = regionOf(s.slug);
    where.set(s.slug, { region: r[0], line, color, area: s.area, stop: { n: i + 1, of: list.length }, walkKm: null, offNetwork: false, peers: groups, kind: "loop" });
  });
}
// Bangkok rail: peers = every station on the same line that has a club
const railLines = new Map<string, typeof net.bkk>();
for (const st of net.bkk) { const key = st.seq ?? st.line; railLines.set(key, [...(railLines.get(key) ?? []), st]); }
for (const [, stops] of railLines) {
  const peers = stops.map((s) => ({ area: stationLabel(s.name), slugs: s.clubs.map((c) => c.slug) }));
  stops.forEach((s, i) => s.clubs.forEach((c) => where.set(c.slug, {
    region: "Bangkok", line: s.line.split(" + ")[0], color: s.color, area: s.name, stop: s.seq ? { n: i + 1, of: stops.length } : null,
    walkKm: c.km, offNetwork: false, peers, kind: "rail",
  })));
}
for (const o of net.off) o.slugs.forEach((slug) => where.set(slug, { region: "Bangkok", line: "Off the Rail Network", color: "#4A5058", area: o.sub, stop: null, walkKm: null, offNetwork: true, peers: [], kind: "off" }));
loop(net.ring, "Samui Loop", COL.g);
loop(net.pha, "Phangan & Tao", COL.pha);
loop(net.phk, "Phuket Loop", COL.s);
loop(net.kbi, "Krabi Line", COL.e);
const simple: [string[], string, string][] = [
  [[...net.regions.pty.slugs, ...net.regions.bs.slugs, ...net.regions.chang.slugs], "Eastern Line", COL.e],
  [net.regions.cm.slugs, "Northern Line", COL.n], [net.regions.hh.slugs, "Southern Line", COL.s],
];
for (const [slugs, line, color] of simple) slugs.forEach((slug, i) => {
  const c = bySlug.get(slug); const r = regionOf(slug);
  where.set(slug, { region: r[0], line, color, area: c?.city ?? r[0], stop: { n: i + 1, of: slugs.length }, walkKm: null, offNetwork: false,
    peers: [{ area: r[0], slugs }], kind: "line" });
});
const missing = clubs.filter((c) => !where.has(c.slug)).map((c) => c.slug);
if (missing.length) { console.error("clubs without a network placement (add them to data/network.json):", missing); process.exit(1); }

const shortName = (c: Club) => net.shortNames[c.slug] ?? c.name;
const initials = (c: Club) => shortName(c).replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "P";

// ---------- icons (Tabler, MIT, outline) ----------
const ICON = {
  indoor: svg('<path d="M3 21v-13l9 -4l9 4v13"/><path d="M13 13h4v8h-10v-6h6"/><path d="M13 21v-9a1 1 0 0 0 -1 -1h-2a1 1 0 0 0 -1 1v3"/>'),
  covered: svg('<path d="M3 3l18 18"/><path d="M16 12a4 4 0 0 0 -4 -4m-2.834 1.177a4 4 0 0 0 5.66 5.66"/><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>'),
  outdoor: svg('<circle cx="12" cy="12" r="4"/><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>'),
  unknown: svg('<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/><path d="M12 16v.01"/><path d="M12 13a2 2 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483"/>'),
  walk: svg('<circle cx="13" cy="4" r="2"/><path d="M10 21l2-6 3 3v3M8 11l3-3 3 2 3 2M11 8l-1 7"/>', 16, 2),
  car: svg('<circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M5 17h-2v-6l2 -5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0h-6m-6 -6h15m-6 0v-5"/>'),
  phone: svg('<path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2"/>', 20),
  ig: svg('<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="3"/><path d="M16.5 7.5v.01"/>', 20),
  web: svg('<circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8"/><path d="M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18"/>', 20),
  chev: svg('<path d="M6 9l6 6l6 -6"/>', 18, 2.2),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 16, 2.2),
  left: svg('<path d="M15 6l-6 6l6 6"/>', 20, 2), right: svg('<path d="M9 6l6 6l-6 6"/>', 20, 2),
  cam: svg('<path d="M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2"/><circle cx="12" cy="13" r="3"/>', 26, 1.6),
};

type CT = { type: "indoor" | "covered" | "outdoor" | "unknown"; n: number | null };
const courtTypes = (c: Club): CT[] => {
  const out: CT[] = [];
  if (c.courts.indoor) out.push({ type: "indoor", n: c.courts.indoor });
  if (c.courts.covered) out.push({ type: "covered", n: c.courts.covered });
  if (c.courts.outdoor) out.push({ type: "outdoor", n: c.courts.outdoor });
  if (!out.length) out.push({ type: "unknown", n: null });
  return out;
};
const ctHtml = (c: Club) => courtTypes(c).map((t) => `<span class="ct" title="${t.type === "unknown" ? "Court Type Not Listed" : t.type}">${ICON[t.type]}<span>${t.n ?? c.courts.total ?? ""}</span><span class="sr"> ${t.type === "unknown" ? "" : t.type}</span></span>`).join("");
const courtsWord = (c: Club) => (c.courts.total ? `${c.courts.total} ${c.courts.total === 1 ? "Court" : "Courts"}` : "Courts Not Listed");
const platformName = (c: Club) => c.booking?.label.replace(/^Book (on |via )?(the )?/, "") ?? "";
/** the booking platform's logo in a small white chip, when we have one */
const platIcon = (c: Club) => c.booking?.icon ? `<span class="plat" aria-hidden="true"><img src="${esc(c.booking.icon)}" alt="" height="20"></span>` : "";
const bookText = (c: Club) => c.booking?.label.replace(/^Book (on|via) the /, "Book on ") ?? "";

// ---------- shared card pieces ----------
function clubCard(c: Club): string {
  const w = where.get(c.slug)!;
  const reg = regionOf(c.slug)[0];
  const flags = [c.courts.indoor ? "indoor" : "", c.courts.covered ? "covered" : "", w.kind === "rail" && w.walkKm != null ? "rail" : "", c.booking ? "book" : ""].filter(Boolean).join(" ");
  return `<a class="pcard" href="/clubs/${esc(c.slug)}/"${trk("club_open", { club_slug: c.slug, place: "clubs_list" })} data-region="${esc(reg)}" data-flags="${flags}">
  <div class="ph">${c.photos[0] ? `<img loading="lazy" decoding="async" ${imgAttrs(c.photos[0], "(max-width: 700px) 100vw, 360px")} alt="${esc(c.name)} photo">` : ICON.cam + "<span>Photo Not Available Yet</span>"}
    <span class="tag" style="background:${w.color};color:${fg(w.color)}">${esc(w.line)}</span>${c.openingSoon ? '<span class="tag soon r">Opening Soon</span>' : ""}</div>
  <div class="band" style="background:${w.color}"></div>
  <div class="info"><span class="area">${esc(w.area)}</span><span class="nm">${esc(shortName(c))}</span>
  <span class="meta"><strong>${esc(courtsWord(c))}</strong>${ctHtml(c)}</span>
  ${c.photos[0]?.author ? `<span class="credit">Photo: ${esc(c.photos[0].author)} · Google Maps</span>` : ""}</div></a>`;
}

// ---------- region hub pages: /regions/<slug>/ ----------
const tourRow = (x: TourLite, place: string) => {
  const d = x.startDate ? `<span class="tdate"><small>${MON[+x.startDate.slice(5, 7) - 1]}</small><b>${+x.startDate.slice(8)}</b></span>` : `<span class="tdate"><small>${x.monthOnly ? MON[+x.monthOnly.slice(5) - 1] : ""}</small><b>TBC</b></span>`;
  const link = x.regUrl ?? x.instagramUrl;
  return `<li>${d}<span class="tt"><strong>${esc(x.title)}</strong><small>${esc(x.organizer)}</small></span>${link ? `<a class="btn${x.regUrl ? " solid" : ""}" href="${esc(link)}" target="_blank" rel="noopener"${trk(x.regUrl ? "register_click" : "details_click", { place })}>${x.regUrl ? "Register" : "View Details"}</a>` : ""}</li>`;
};
function regionPage(name: string, th: string, slugs: string[]): string {
  const list = slugs.map((s) => bySlug.get(s)!).filter(Boolean).sort((a, b) => shortName(a).localeCompare(shortName(b)));
  const n = list.length, courts = list.reduce((a, c) => a + (c.courts.total ?? 0), 0);
  const indoorN = list.filter((c) => c.courts.indoor).length, soonN = list.filter((c) => c.openingSoon).length;
  const bookable = list.filter((c) => c.booking);
  const byPlatform = new Map<string, number>(); for (const c of bookable) byPlatform.set(platformName(c), (byPlatform.get(platformName(c)) ?? 0) + 1);
  const platforms = [...byPlatform].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`).join(", ");
  const rail = list.filter((c) => where.get(c.slug)!.walkKm != null);
  const noRail = !rail.length && !list.some((c) => where.get(c.slug)!.kind === "rail" || where.get(c.slug)!.offNetwork);
  const areas = [...new Set(list.map((c) => where.get(c.slug)!.area))];
  const intro = `${n} padel clubs and ${courts} ${courts === 1 ? "court" : "courts"} in ${name}. ${indoorN} ${indoorN === 1 ? "club has" : "clubs have"} indoor courts and ${bookable.length} list online booking.` + (rail.length ? ` ${rail.length} ${rail.length === 1 ? "club is" : "clubs are"} within walking distance of a BTS or MRT station.` : "") + (soonN ? ` ${soonN} ${soonN === 1 ? "club is" : "clubs are"} opening soon.` : "");
  const ups = tournamentsAll.filter((x) => x.region === listingRegion(name) && tourEnd(x) >= TODAY_BKK).sort((a, b) => (a.startDate ?? a.monthOnly ?? "").localeCompare(b.startDate ?? b.monthOnly ?? "")).slice(0, 4);
  const faq: [string, string][] = [
    [`How Many Padel Clubs Are in ${name}?`, `${n} clubs with ${courts} ${courts === 1 ? "court" : "courts"} are listed on Padel Thailand, and ${indoorN} of them have indoor courts.`],
    [`Can I Book a Padel Court Online in ${name}?`, bookable.length ? `${bookable.length} of ${n} clubs list an online booking link: ${platforms}. The rest take bookings by phone, message or walk-in.` : `None of the ${n} clubs lists an online booking link yet. Use the phone or Instagram link on each club page.`],
    ...(rail.length ? [[`Which Padel Clubs in ${name} Are Near the BTS or MRT?`, `${rail.map((c) => `${shortName(c)} (${where.get(c.slug)!.line}${where.get(c.slug)!.walkKm != null ? `, about ${walkMin(where.get(c.slug)!.walkKm!)} min on foot` : ""})`).join("; ")}. Walk times are straight-line estimates.`] as [string, string]] : []),
    ...(noRail ? [[`How Do I Get to Padel Courts in ${name}?`, `There is no rail here. Clubs are reached by taxi, Grab or scooter, and each club page has directions.`] as [string, string]] : []),
  ];
  const others = hubRegions().filter((r) => r[0] !== name);
  const path = hubPath(name);
  const body = `<main class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Network Map</a> / <a href="/clubs/">Clubs</a> / <span aria-current="page"><strong>${esc(name)}</strong></span></nav>
  <div class="page-head"><span class="badge-ink">Region</span><h1 style="margin-top:14px">Padel Courts in ${esc(name)}</h1>
  <p>${esc(intro)}</p><p class="fine">${esc(th)} · Areas: ${esc(areas.join(", "))}</p>
  <p><a class="btn" href="/#map">View on the Network Map</a></p></div>
  <h2 style="font-size:30px;margin:32px 0 16px">All ${n} Clubs in ${esc(name)}</h2>
  <div class="grid" id="hub-grid">${list.map(clubCard).join("\n")}</div>
  <h2 style="font-size:30px;margin:40px 0 12px">Upcoming Tournaments in ${esc(name)}</h2>
  ${ups.length ? `<ul class="tour-list">${ups.map((x) => tourRow(x, "region_page")).join("")}</ul>` : `<p class="fine" style="margin:0 0 12px">No upcoming tournaments listed in ${esc(name)} right now.</p>`}
  <div class="tour-note"><span>Every tournament in Thailand, with posters.</span><a class="btn" href="/tournaments/?region=${encodeURIComponent(listingRegion(name))}">See Tournaments in ${esc(name)} ${ICON.arrow}</a></div>
  <h2 style="font-size:30px;margin:40px 0 4px">Questions About Padel in ${esc(name)}</h2>
  <dl class="faq">${faq.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("")}</dl>
  <h2 style="font-size:30px;margin:40px 0 12px">Other Regions</h2>
  <p class="fine">${others.map((r) => `<a href="${hubPath(r[0])}">${esc(r[0])} (${r[2].length})</a>`).join(" · ")}</p>
</main>`;
  const desc = `${n} padel clubs and ${courts} courts in ${name}, Thailand: indoor and outdoor courts, booking links, hours and directions.`;
  return shell({ title: `Padel in ${name}: ${n} Clubs and ${courts} ${courts === 1 ? "Court" : "Courts"} | Padel Thailand`, description: desc, path, active: "clubs", body,
    ld: [{ "@context": "https://schema.org", "@type": "CollectionPage", name: `Padel Courts in ${name}`, url: SITE + path, description: desc, isPartOf: { "@type": "WebSite", name: "Padel Thailand", url: SITE + "/" } },
      { "@context": "https://schema.org", "@type": "ItemList", name: `Padel clubs in ${name}`, itemListElement: list.map((c, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/clubs/${c.slug}/`, name: c.name })) },
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
      breadcrumbLd([["Padel Thailand", "/"], ["Clubs", "/clubs/"], [name, path]])] });
}

// ---------- clubs page ----------
function clubsPage(): string {
  const sorted = [...clubs].sort((a, b) => shortName(a).localeCompare(shortName(b)));
  const regionBtns = REGION_ORDER.map(([name, , slugs, color]) => `<button class="chip sq" type="button" data-filter="${esc(name)}" aria-pressed="false"><span class="dot-line" style="background:${color}"></span>${esc(name)} <span class="count">${slugs.length}</span></button>`).join("");
  const body = `<main class="wrap">
  <div class="page-head"><span class="badge-ink">Clubs</span><h1 style="margin-top:14px">Every Stop on the Network</h1>
  <p>${clubs.length} clubs in Thailand. Browse by photo or as a list, then pick a line. Every booking button goes to where the club actually takes bookings.</p>
  <p><a href="/submit/#club" style="font-size:14px">Missing a Club? Add It →</a></p>
  <p class="fine">Browse by Region: ${hubRegions().map((r) => `<a href="${hubPath(r[0])}">${esc(r[0])}</a>`).join(" · ")}</p></div>
  <div class="filters" role="group" aria-label="Filter by region">
    <button class="chip sq" type="button" data-filter="all" aria-pressed="true">All Regions <span class="count">${clubs.length}</span></button>${regionBtns}
    <button class="chip sq" type="button" data-filter="__book" aria-pressed="false" id="book">Book Online <span class="count">${clubs.filter((c) => c.booking).length}</span></button>
  </div>
  <div class="toolbar"><span id="showing" aria-live="polite">Showing ${clubs.length} of ${clubs.length} Clubs</span>
    <div class="seg" role="group" aria-label="View"><button type="button" data-view="photos" aria-pressed="true">Photos</button><button type="button" data-view="list" aria-pressed="false">List</button></div></div>
  <div class="grid" id="club-grid">
${sorted.map(clubCard).join("\n")}
  </div>
  <p class="empty" id="no-match" hidden>No clubs match that filter.</p>
</main>`;
  return shell({ title: "Clubs | Padel Thailand", description: `All ${clubs.length} padel clubs in Thailand with courts, photos and where to book. Bangkok, Phuket, Samui, Pattaya, Chiang Mai and more.`, path: "/clubs/", active: "clubs", body,
    ld: [{ "@context": "https://schema.org", "@type": "ItemList", name: "Padel clubs in Thailand", itemListElement: sorted.map((c, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/clubs/${c.slug}/`, name: c.name })) }, breadcrumbLd([["Padel Thailand", "/"], ["Clubs", "/clubs/"]])] });
}

// ---------- club page ----------
const addrOk = (c: Club) => c.address && c.address.trim().length > 4;
// club logos for the Line strip: slug -> image path (e.g. "/img/logos/vita-padel-ekkamai.png"); clubs without one show their initials
type Logo = { src: string; dark?: boolean };
const logos = await readJson<Record<string, Logo>>(ROOT, "data/club-logos.json", {});
/** the logo slot: the club's logo when we have one, its initials otherwise; light-on-transparent logos sit on a dark tile */
const logoSlot = (k: Club, size: number) => { const l = logos[k.slug]; return `<span class="logo-slot${l ? ` has-logo${l.dark ? " on-dark" : ""}` : ""}" aria-hidden="true">${l ? `<img src="${esc(l.src)}" alt="" loading="lazy" width="${size}" height="${size}">` : esc(initials(k))}</span>`; };
function lineStrip(c: Club, w: Where): string {
  if (!w.peers.length) return "";
  const groups = w.peers.map((g) => {
    const here = g.slugs.includes(c.slug);
    const cl = g.slugs.map((s) => bySlug.get(s)!).filter(Boolean);
    return `<div class="g${here ? " here" : ""}"><span class="area">${esc(g.area)}</span><span class="rail"><i></i></span>
      <div class="clubs${cl.length === 1 ? " one" : ""}">${cl.map((k) => `<a class="c${k.slug === c.slug ? " here" : ""}" href="/clubs/${esc(k.slug)}/"${k.slug === c.slug ? ' aria-current="page"' : ""}>${logoSlot(k, 48)}<span>${esc(shortName(k))}</span></a>`).join("")}</div></div>`;
  }).join("");
  const sub = w.kind === "rail" ? "Stations With Clubs in Walking Distance" : w.kind === "loop" ? `${w.stop?.of} Clubs Along the Line` : `${w.peers[0].slugs.length} ${w.peers[0].slugs.length === 1 ? "Club" : "Clubs"} in This Region`;
  return `<section style="margin-top:36px" aria-labelledby="strip-h"><h2 id="strip-h" style="font-size:30px;margin:0 0 6px">On the ${esc(w.line)}</h2><p class="fine" style="margin:0 0 14px">${esc(sub)}</p>
  <div class="strip-wrap"><div class="strip" style="--lc:${w.color}">${groups}</div></div></section>`;
}


const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** "Monday: 8:00 AM – 10:00 PM" lines -> schema.org OpeningHoursSpecification (closed days skipped, "12:00 AM" closing = 23:59) */
function hoursSpec(hours: string[]): object[] {
  const to24 = (s: string) => { const m = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(s); if (!m) return null; const h = (+m[1] % 12) + (/PM/i.test(m[3] ?? "") ? 12 : 0); return `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`; };
  const out: object[] = [];
  for (const line of hours) {
    const i = line.indexOf(":"); const day = line.slice(0, i).trim();
    if (!WEEKDAYS.includes(day)) continue;
    const txt = line.slice(i + 1).trim();
    if (/closed/i.test(txt)) continue;
    if (/open 24/i.test(txt)) { out.push({ "@type": "OpeningHoursSpecification", dayOfWeek: day, opens: "00:00", closes: "23:59" }); continue; }
    for (const range of txt.split(/,\s*(?=\d)/)) {
      const [a, b] = range.split(/\s*[–-]\s*/); if (!a || !b) continue;
      const per = /(AM|PM)/i.exec(b); const open = to24(per && !/(AM|PM)/i.test(a) ? `${a} ${per[1]}` : a), close = to24(b);
      if (open && close) out.push({ "@type": "OpeningHoursSpecification", dayOfWeek: day, opens: open, closes: close === "00:00" ? "23:59" : close });
    }
  }
  return out;
}

/** analytics attributes read by js/analytics.js: data-track="event" plus data-t-<param> for each parameter */
const trk = (event: string, params: Record<string, string>) => ` data-track="${event}"` + Object.entries(params).map(([k, v]) => ` data-t-${k}="${esc(v)}"`).join("");

function clubPage(c: Club): string {
  const w = where.get(c.slug)!;
  const hubOk = isHub(w.region);
  const ph = c.photos;
  const wMin = w.walkKm != null ? walkMin(w.walkKm) : null;
  const station = w.kind === "rail" ? net.bkk.find((s) => s.clubs.some((k) => k.slug === c.slug))! : null;
  const facts: string[] = [`<strong>${esc(w.area)}</strong>`];
  if (w.kind === "rail" && wMin != null) facts.push(`<span class="ct">${ICON.walk}~${wMin} Min Walk From ${esc(stationLabel(station!.name))}</span>`);
  else if (w.offNetwork) facts.push(`<span class="ct">${ICON.car}Off the Rail Network · Drive or Taxi</span>`);
  facts.push(...courtTypes(c).map((t) => `<span class="ct">${ICON[t.type]}${t.n != null ? `${t.n} ${t.type[0].toUpperCase() + t.type.slice(1)}` : (c.courts.total ?? "")}</span>`));
  const stopTxt = w.stop ? `${w.kind === "rail" ? "Station" : "Stop"} ${String(w.stop.n).padStart(2, "0")} of ${String(w.stop.of).padStart(2, "0")}` : w.offNetwork ? "Off Network" : "";
  const gal = ph.length
    ? `<div class="gal" data-gal data-photos='${esc(JSON.stringify(ph.map((p) => ({ u: p.mid ?? p.url, a: p.author }))))}' data-name="${esc(c.name)}">
        <div class="main"><img ${imgAttrs(ph[0], "(max-width: 900px) 100vw, 800px")} alt="${esc(c.name)} photo 1 of ${ph.length}" fetchpriority="high" data-main>
          ${ph.length > 1 ? `<button class="arrow p" type="button" aria-label="Previous photo" data-prev>${ICON.left}</button><button class="arrow n" type="button" aria-label="Next photo" data-next>${ICON.right}</button>` : ""}
          <div class="cr" data-credit>${ph[0].author ? `Photo: ${esc(ph[0].author)} · Google Maps` : ""}</div></div>
        ${ph.slice(1, 5).map((p, i) => `<button class="th" type="button" data-i="${i + 1}" aria-label="Show photo ${i + 2} of ${ph.length}"><img loading="lazy" decoding="async" src="${esc(p.thumb ?? p.url)}" alt="">${i === 3 && ph.length > 5 ? `<span class="more">+${ph.length - 5} More</span>` : ""}</button>`).join("")}</div>`
    : `<div class="gal empty-gal"><div class="gal-empty">${ICON.cam}<strong>Photos Not Available Yet</strong><span>Photos Are Shown Only With a Credit Line.</span></div></div>`;
  const ts = courtTypes(c).filter((x) => x.type !== "unknown");
  const aboutLine = `${c.name} Is a Padel Club in ${c.city}, Thailand` + (c.courts.total ? ` With ${c.courts.total} ${c.courts.total === 1 ? "Court" : "Courts"}${ts.length ? ` (${ts.map((x) => `${x.n} ${x.type[0].toUpperCase() + x.type.slice(1)}`).join(", ")})` : ""}` : "") + "." + (c.openingSoon ? " Listed as Opening Soon." : "") + (c.rating ? ` Rated ${c.rating} From ${c.ratingCount} Google Ratings.` : "") + (w.walkKm != null ? ` About ${wMin} Minutes on Foot From the Nearest Station (Straight-Line Estimate).` : "");
  // the Book button sits at the right of the header (phones use the sticky bar at the bottom instead)
  const headBook = c.booking ? `<a class="btn solid book-cta" href="${esc(c.booking.url)}" target="_blank" rel="noopener"${trk("book_click", { club_slug: c.slug, platform: c.booking.platform, place: "club_page" })}>${platIcon(c)}${esc(bookText(c))}</a>` : (c.phone ? `<a class="btn solid book-cta" href="tel:${esc(c.tel)}"${trk("contact_click", { club_slug: c.slug, method: "phone", place: "club_header" })}>Call to Book · ${esc(c.phoneLocal || c.phone)}</a>` : "");
  const dirUrl = c.directionsUrl || `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
  const TH = /[\u0E00-\u0E7F]/;
  const thaiAddr = addrOk(c) && TH.test(c.address);
  const hasTh = !!c.nameTh || thaiAddr;
  const addr = `<section class="card" aria-labelledby="addr-h"><h3 id="addr-h">${w.kind === "rail" || w.offNetwork || w.region === "Bangkok" ? "Address" : "Getting Here"}</h3>
    ${w.kind === "loop" || w.kind === "line" ? `<p class="fine" style="margin:0">${w.region.startsWith("Samui") || w.region.startsWith("Phuket") || w.line.startsWith("Phangan") ? "No Rail Here. Taxi, Grab or Scooter." : "Drive, Taxi or Grab."}</p>` : ""}
    <p style="margin:0" id="addr-text">${addrOk(c) ? esc(c.address) : "Street Address Not Listed Yet. Use Directions."}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${hasTh ? `<button class="btn solid" style="flex:1 1 auto" type="button" data-driver data-track="show_to_driver" data-t-club_slug="${esc(c.slug)}">${ICON.car}Show to Driver</button>` : ""}
    <a class="btn${hasTh ? "" : " solid"}" style="flex:1 1 auto" href="${esc(dirUrl)}" target="_blank" rel="noopener"${trk("directions_click", { club_slug: c.slug, place: "address_card" })}>Directions</a>
    ${addrOk(c) ? `<button class="btn" type="button" data-copy="${esc(c.address)}">Copy</button>` : ""}</div></section>
    ${hasTh ? `<div class="driver" id="driver" role="dialog" aria-modal="true" aria-label="Address for driver" hidden><div class="eyebrow" style="color:#fff">Show to Driver</div><div class="big" lang="th">${c.nameTh ? esc(c.nameTh) + "<br>" : ""}${thaiAddr ? esc(c.address) : ""}</div><div class="eng">${esc(c.name)}<br>${esc(c.address)}</div><div class="acts"><button class="btn" type="button" data-copy="${esc(thaiAddr ? c.address : c.nameTh)}">Copy</button><button class="btn" type="button" data-driver-close>Close</button></div></div>` : ""}`;
  const contacts = [
    c.phone ? `<li>${ICON.phone}<span><small>Phone</small><a href="tel:${esc(c.tel)}"${trk("contact_click", { club_slug: c.slug, method: "phone", place: "contact_card" })}>${esc(c.phoneLocal || c.phone)}</a></span></li>` : "",
    c.instagramUrl && !ownIg(c.instagramUrl) ? `<li>${ICON.ig}<span><small>Instagram</small><a href="${esc(c.instagramUrl)}" target="_blank" rel="noopener"${trk("contact_click", { club_slug: c.slug, method: "instagram", place: "contact_card" })}>@${esc(c.instagramUrl.replace(/\/$/, "").split("/").pop())}</a></span></li>` : "",
    c.website ? `<li>${ICON.web}<span><small>Website</small><a href="${esc(c.website)}" target="_blank" rel="noopener"${trk("contact_click", { club_slug: c.slug, method: "website", place: "contact_card" })}>${esc(c.website.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, ""))}</a></span></li>` : "",
  ].filter(Boolean);
  const hours = c.hours.length ? `<ul class="hours" data-hours>${c.hours.map((h) => { const i = h.indexOf(":"); return `<li data-day="${esc(h.slice(0, i))}"><span>${esc(h.slice(0, i))}</span><span>${esc(h.slice(i + 1).trim())}</span></li>`; }).join("")}</ul>` : `<p class="fine">Hours Not Listed.</p>`;
  const barPrice = c.booking ? `<a class="btn solid" href="${esc(c.booking.url)}" target="_blank" rel="noopener"${trk("book_click", { club_slug: c.slug, platform: c.booking.platform, place: "sticky_bar" })}>${platIcon(c)}${esc(bookText(c))}</a>` : (c.phone ? `<a class="btn solid" href="tel:${esc(c.tel)}">Call</a>` : "");
  const body = `<main class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Network Map</a> / <a href="/clubs/">Clubs</a> / <a href="${hubOk ? hubPath(w.region) : `/clubs/#${encodeURIComponent(w.region)}`}">${esc(w.region)}</a> / <span aria-current="page"><strong>${esc(shortName(c))}</strong></span></nav>
  <section class="sign" aria-label="Club header">
    <div class="main"><div class="top">${logoSlot(c, 72)}<h1>${esc(c.name)}</h1>${headBook}</div>
    <div class="facts">${facts.join("")}${c.openingSoon ? '<span class="tag soon">Opening Soon</span>' : '<span class="open-now" data-open hidden></span>'}</div></div></section>
  <div class="club-grid">
    <div class="gal-col">${gal}
      <div class="gal-note"><span>${ph.length ? "Photos are credited to their source." : "Club-supplied photos with a credit line replace this placeholder."}</span><a href="/submit/#photo">+ Add a Photo of This Club</a></div></div>
    <aside class="aside" aria-label="Contact and address">
      ${contacts.length ? `<section class="card" aria-label="Contact"><ul class="contact">${contacts.join("")}</ul></section>` : ""}
      ${addr}
      <p class="fine">Info Last Updated ${esc(c.updated)} · <a href="/submit/#correction">Report a Correction</a> · <a href="/submit/#correction">Own This Club? Claim It</a></p>
    </aside>
    <div class="rest">
      ${c.amenities.length ? `<h2>Amenities</h2><ul class="pills">${c.amenities.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
      <h2>Opening Hours</h2>${hours}
    </div>
  </div>
  ${lineStrip(c, w)}
</main>
<div class="book-bar"><span><span class="price-from">Price</span><br><strong>${c.priceNote ? esc(c.priceNote) : "Not Listed Yet"}</strong></span>${barPrice}</div>`;
  const hs = hoursSpec(c.hours);
  const seoName = c.name.length > 48 ? shortName(c) : c.name;
  const clean = (u: string) => { try { const x = new URL(u); [...x.searchParams.keys()].filter((k) => k.startsWith("utm_")).forEach((k) => x.searchParams.delete(k)); return x.href; } catch { return u; } };
  const ld = [{
    "@context": "https://schema.org", "@type": "SportsActivityLocation", "@id": `${SITE}/clubs/${c.slug}/#club`, name: seoName, url: `${SITE}/clubs/${c.slug}/`, description: aboutLine,
    ...(ph.length ? { image: [...new Set(ph.map((p) => p.url))] } : {}), ...(c.phone ? { telephone: c.phone } : {}),
    address: { "@type": "PostalAddress", ...(addrOk(c) ? { streetAddress: c.address } : {}), addressLocality: c.city, addressCountry: "TH" },
    geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lng }, hasMap: c.mapsUrl || dirUrl, sameAs: [...new Set([c.website, c.instagramUrl, c.facebookUrl].filter(Boolean).map(clean))],
    ...(hs.length ? { openingHoursSpecification: hs } : {}),
    ...(c.amenities.length ? { amenityFeature: c.amenities.map((n) => ({ "@type": "LocationFeatureSpecification", name: n, value: true })) } : {}),
    ...(c.booking ? { potentialAction: { "@type": "ReserveAction", name: bookText(c), target: { "@type": "EntryPoint", urlTemplate: c.booking.url, actionPlatform: ["http://schema.org/DesktopWebPlatform", "http://schema.org/MobileWebPlatform"] } } } : {}),
    isPartOf: { "@type": "WebSite", name: "Padel Thailand", url: `${SITE}/` },
    // deliberately NO aggregateRating or Review: the rating shown on the page is Google's, and rating markup for third-party reviews is against Google's guidelines
  }, breadcrumbLd([["Padel Thailand", "/"], ["Clubs", "/clubs/"], ...(hubOk ? [[w.region, hubPath(w.region)] as [string, string]] : []), [c.name, `/clubs/${c.slug}/`]])];
  // registry names are sometimes Google's full keyword-stuffed listing; search snippets cut titles near 60 and descriptions near 160 characters
  const seoDesc = `${seoName} is a padel club in ${c.city}, Thailand${c.courts.total ? ` with ${c.courts.total} courts` : ""}. ${w.line}${w.stop ? `, ${stopTxt.toLowerCase()}` : ""}. Hours, booking and directions.`;
  return shell({ title: `${seoName}, ${c.city} | Padel Thailand`, description: seoDesc.length > 160 ? seoDesc.slice(0, 157).replace(/\s+\S*$/, "") + "…" : seoDesc,
    path: `/clubs/${c.slug}/`, active: "clubs", body, image: ph[0]?.url, ld, bodyClass: "has-bar" });
}

// ---------- home ----------
function homePage(): string {
  const totalCourts = clubs.reduce((a, c) => a + (c.courts.total ?? 0), 0);
  const index = REGION_ORDER.map(([name, th, slugs, color]) => {
    const list = slugs.map((s) => bySlug.get(s)!).filter(Boolean).sort((a, b) => shortName(a).localeCompare(shortName(b)));
    return `<details class="region" id="${esc(name)}"><summary style="background:${color};color:${fg(color)}"><span>${esc(name)}</span><span class="n">${list.length} ${list.length === 1 ? "Club" : "Clubs"}</span>${ICON.chev}</summary>
    <ul>${list.map((c) => `<li><a href="/clubs/${esc(c.slug)}/"${trk("club_open", { club_slug: c.slug, place: "home_index" })}><span>${esc(shortName(c))}${c.openingSoon ? ' <span class="tag soon">Opening Soon</span>' : ""}</span><small>${ctHtml(c)}</small></a></li>`).join("")}</ul>${isHub(name) ? `<a class="hub-link" href="${hubPath(name)}">View All ${list.length} Clubs in ${esc(name)} →</a>` : ""}</details>`;
  }).join("\n");
  const body = `<main>
<section class="wrap hero"><div class="lead"><div class="stats"><span class="badge-ink">Thailand Padel Network</span><span>${clubs.length} Clubs · ${totalCourts} Courts · ${REGION_ORDER.length} Regions</span></div>
  <h1>Every Padel Court in Thailand, on One Map.</h1></div>
  <form class="finder" role="search" onsubmit="return false"><label for="q">Where Do You Want to Play?</label>
    <div class="row"><input id="q" type="search" placeholder="Club, Island or BTS/MRT Station" autocomplete="off" aria-controls="suggest"><button class="btn solid" type="button" id="near" style="min-height:48px">Near Me</button></div>
    <div class="suggest" id="suggest" role="listbox" hidden></div>
    <div class="chips" role="group" aria-label="Quick filters"><button class="chip" type="button" data-f="indoor" aria-pressed="false">Indoor</button><button class="chip" type="button" data-f="covered" aria-pressed="false">Covered</button><button class="chip" type="button" data-f="rail" aria-pressed="false">Near BTS/MRT</button><button class="chip" type="button" data-f="book" aria-pressed="false">Book Online</button></div></form></section>
<section class="wrap" id="map" aria-labelledby="map-h"><div class="map-head"><h2 id="map-h">Network Map</h2><div class="tabs" id="tabs" role="group" aria-label="Map view"></div></div>
  <div class="map-layout"><div class="map-box" id="map-box" aria-label="Schematic network map. The club list below is the keyboard-friendly alternative."></div><aside class="panel" id="panel" aria-live="polite"></aside></div>
  <div class="map-key"><span class="k">${ICON.indoor} Indoor</span><span class="k">${ICON.covered} Covered</span><span class="k">${ICON.outdoor} Outdoor</span><span class="k">${ICON.unknown} Type Not Listed</span><span>Schematic, not to scale. Walk times are straight-line estimates from the nearest station. Prefer a list? <a href="#index">See All Clubs by Region</a>.</span></div></section>
<section class="wrap section" id="index"><h2>All Clubs</h2><p class="sub">${clubs.length} Clubs · ${totalCourts} Courts · ${REGION_ORDER.length} Regions.</p>
  <div class="regions">${index}</div></section>
</main>`;
  return shell({ title: "Padel Thailand — Every Padel Court in Thailand on One Map", description: `Find a padel club anywhere in Thailand. ${clubs.length} clubs and ${totalCourts} courts on one network map: Bangkok BTS/MRT, Phuket, Samui, Pattaya, Chiang Mai and more.`, path: "/", active: "map", body,
    head: `<link rel="preload" as="fetch" crossorigin href="/data/network.json"><link rel="preload" as="fetch" crossorigin href="/data/clubs.json">`, scripts: `<script src="/js/network-map.js?v=22"></script>`,
    ld: [{ "@context": "https://schema.org", "@type": "Organization", "@id": `${SITE}/#org`, name: "Padel Thailand", url: `${SITE}/`, logo: `${SITE}/img/apple-touch-icon.png`, sameAs: ["https://www.instagram.com/padelthailand/"] },
      { "@context": "https://schema.org", "@type": "WebSite", "@id": `${SITE}/#website`, name: "Padel Thailand", url: `${SITE}/`, inLanguage: "en", publisher: { "@id": `${SITE}/#org` } }] });
}

// ---------- write ----------
const pages: [string, string][] = [["index.html", homePage()], ["clubs/index.html", clubsPage()], ...hubRegions().map(([name, th, slugs]) => [`${hubPath(name).slice(1)}index.html`, regionPage(name, th, slugs)] as [string, string]), ...clubs.map((c) => [`clubs/${c.slug}/index.html`, clubPage(c)] as [string, string])];
if (CHECK) { console.log(`check: ${pages.length} pages, ${clubs.length} clubs placed, 0 missing`); process.exit(0); }
await Promise.all(pages.map(async ([p, html]) => { await mkdir(dirname(ROOT + p), { recursive: true }); await writeFile(ROOT + p, html); }));
console.log(`built ${pages.length} pages (home, clubs, ${hubRegions().length} region pages, ${clubs.length} club pages)`);

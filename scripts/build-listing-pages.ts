#!/usr/bin/env bun
/**
 * Tournaments, Events and About pages (Phase 1b). The listings themselves are rendered in the browser by
 * js/listings.js from data/tournaments.json and data/events.json (built by scripts/build-listings.ts).
 * Usage: bun scripts/build-listing-pages.ts [--check]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { SITE, SITE_IG, esc, shell, breadcrumbLd, CONSENT_REQUIRED } from "./lib/chrome.ts";
import { MONTHS_SHORT, readJson, todayBkk, tourEnd } from "./lib/util.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const CHECK = process.argv.includes("--check");
// ---- listing data, read at build time (nightly) for structured data and the indexing rules ----
type Tour = { monthOnly: string | null; id: string; title: string; organizer: string; clubName: string; city: string; region: string; venueText: string; startDate: string | null; endDate: string | null; poster: { src: string } | null; regUrl: string | null; instagramUrl: string | null };
const tournaments = (await readJson<{ tournaments: Tour[] }>(ROOT, "data/tournaments.json", { tournaments: [] })).tournaments;
const eventCount = (await readJson<{ events: unknown[] }>(ROOT, "data/events.json", { events: [] })).events.length;
const TODAY = todayBkk();
const upcomingTours = tournaments.filter((x) => tourEnd(x) >= TODAY);
/** upcoming tournaments with a real date AND a real place, as schema.org SportsEvent. Google needs name, startDate and a location with an address,
 *  so an event whose venue is unknown is left out of the markup rather than given an invented one. */
const sportsEvents = upcomingTours.filter((x) => x.startDate && (x.clubName || x.venueText || x.city)).map((x) => ({
  "@type": "SportsEvent", name: x.title, sport: "Padel", startDate: x.startDate, ...(x.endDate && x.endDate !== x.startDate ? { endDate: x.endDate } : {}),
  eventStatus: "https://schema.org/EventScheduled", eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  location: { "@type": "Place", name: x.clubName || x.venueText || x.city, address: { "@type": "PostalAddress", ...(x.city ? { addressLocality: x.city } : {}), ...(x.region ? { addressRegion: x.region } : {}), addressCountry: "TH" } },
  ...(x.organizer ? { organizer: { "@type": "Organization", name: x.organizer } } : {}),
  ...(x.regUrl ?? x.instagramUrl ? { url: (x.regUrl ?? x.instagramUrl)! } : {}),
  ...(x.poster ? { image: SITE + x.poster.src } : {}),
}));
const MONS = MONTHS_SHORT;
const day = (s: string) => `${+s.slice(8)} ${MONS[+s.slice(5, 7) - 1]}`;
const when = (x: Tour) => x.startDate ? (x.endDate && x.endDate !== x.startDate ? `${day(x.startDate)} – ${day(x.endDate)} ${x.endDate.slice(0, 4)}` : `${day(x.startDate)} ${x.startDate.slice(0, 4)}`) : x.monthOnly ? `${MONS[+x.monthOnly.slice(5) - 1]} ${x.monthOnly.slice(0, 4)} (Date to Be Confirmed)` : "Date to Be Confirmed";
/** the no-JavaScript view: a plain list of what the page shows by default, for crawlers and visitors that do not run scripts */
const upcomingFallback = upcomingTours.length ? `<h2>Upcoming Tournaments</h2><ul>${upcomingTours.map((x) => { const link = x.regUrl ?? x.instagramUrl; const where = [x.clubName || x.venueText, x.city].filter(Boolean).join(", "); return `<li><strong>${esc(x.title)}</strong>: ${esc(when(x))}${where ? ` · ${esc(where)}` : ""}${x.organizer ? ` · ${esc(x.organizer)}` : ""}${link ? ` · <a href="${esc(link)}" rel="noopener">Details</a>` : ""}</li>`; }).join("")}</ul>` : "";
const HEAD = `<link rel="stylesheet" href="/css/listings.css?v=4">`;
const NOSCRIPT = (what: string, extra = "") => `<noscript><div class="empty-state"><h2>Turn On JavaScript</h2><p>The ${what} List Needs JavaScript. You Can Also Find Us on <a href="${SITE_IG}" rel="noopener">Instagram</a>.</p></div>${extra}</noscript>`;

const tournamentsPage = () => shell({
  title: "Padel Tournaments in Thailand | Padel Thailand", path: "/tournaments/", active: "tournaments", head: HEAD, bodyAttrs: 'data-listing="tournaments"',
  description: "Every padel tournament in Thailand: upcoming draws and past results, with posters. Filter by date, region, gender and club, then register.",
  scripts: `<script src="/js/listings.js?v=2"></script>`,
  ld: [{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Padel Tournaments in Thailand", url: `${SITE}/tournaments/`, isPartOf: { "@type": "WebSite", name: "Padel Thailand", url: `${SITE}/` } },
    ...(sportsEvents.length ? [{ "@context": "https://schema.org", "@type": "ItemList", name: "Upcoming padel tournaments in Thailand", itemListElement: sportsEvents.map((item, i) => ({ "@type": "ListItem", position: i + 1, item })) }] : []),
    breadcrumbLd([["Padel Thailand", "/"], ["Tournaments", "/tournaments/"]])],
  body: `<main class="wrap">
  <div class="listing-head"><div><span class="badge-ink">Tournaments</span><span class="counts" id="t-count"></span>
    <h1>Every Draw in Thailand</h1><p>Every Padel Tournament in Thailand, From Every Club and Organiser — Filter by Date, Region and Club, Then Register.</p></div>
    <div class="cta-box"><a class="btn solid" href="/submit/#tournament">Submit a Tournament — It’s Free</a><p class="fine">Organisers: List It Once With Your Poster. A Person Checks Every Listing Before It Goes Live.</p></div></div>
  <div id="listing-root" class="reserve">${NOSCRIPT("Tournaments", upcomingFallback)}</div>
  <p class="listing-note">Listings From Clubs, Organisers and Our Own Research · Posters Shared With Permission</p>
</main>
<section class="cta-band" aria-labelledby="run-t"><div class="wrap"><div><h2 id="run-t">Running a Tournament?</h2><p>List It Free With Your Poster in Two Minutes. It Appears Here Once a Person Has Checked It.</p></div><a class="btn" href="/submit/#tournament">Submit a Tournament</a></div></section>`,
});

const eventsPage = () => shell({
  title: "Padel Events and Social Play in Thailand | Padel Thailand", path: "/events/", active: "events", head: HEAD, bodyAttrs: 'data-listing="events"',
  noindex: eventCount === 0, // an empty events page is thin content; the nightly build flips this as soon as the first event exists
  ld: [breadcrumbLd([["Padel Thailand", "/"], ["Events", "/events/"]])],
  description: "Weekly Americanos, clinics, socials and league nights at padel clubs across Thailand.",
  scripts: `<script src="/js/listings.js?v=2"></script>`,
  body: `<main class="wrap">
  <div class="listing-head"><div><span class="badge-ink">Events</span><span class="counts" id="e-count"></span>
    <h1>Play Something Tonight</h1><p>Weekly Americanos, Clinics, Socials and Beginner Sessions at Every Club in Thailand. Turn Up Solo — Get Matched In.</p></div>
    <div class="cta-box"><a class="btn solid" href="/submit/#event">Submit an Event — It’s Free</a><p class="fine">List It Once and It Repeats Every Week. Organisers Reconfirm Every 30 Days.</p></div></div>
  <div id="listing-root">${NOSCRIPT("Events")}</div>
  <p class="listing-note">Listings From Clubs and Organisers · Posters Shared With Permission</p>
</main>
<section class="cta-band" aria-labelledby="run-e"><div class="wrap"><div><h2 id="run-e">Run a Weekly Americano?</h2><p>List It Once and It Repeats Every Week. We Hide an Event if It Has Not Been Reconfirmed in 30 Days, So Players Never Turn Up to Nothing.</p></div><a class="btn" href="/submit/#event">Submit an Event</a></div></section>`,
});

const aboutPage = () => shell({
  title: "About | Padel Thailand", path: "/about/", active: "",
  ld: [{ "@context": "https://schema.org", "@type": "AboutPage", name: "About Padel Thailand", url: `${SITE}/about/`, isPartOf: { "@type": "WebSite", name: "Padel Thailand", url: `${SITE}/` } }, breadcrumbLd([["Padel Thailand", "/"], ["About", "/about/"]])], description: "How Padel Thailand works: where the club, tournament and event listings come from, and how bookings work.",
  body: `<main class="wrap"><div class="page-head"><span class="badge-ink">About</span><h1 style="margin-top:14px">How This Site Works</h1></div>
  <div class="prose" style="max-width:70ch;margin-top:12px">
  <h2 style="font-size:28px;margin:28px 0 8px">Every Club Is Listed the Same Way</h2>
  <p>The map, the Clubs page and the filters treat every club equally. Each booking button goes to where the club actually takes bookings.</p>
  <p><strong>The Padel Society (TPS) runs the booking for its own clubs.</strong> When live booking arrives on this site, TPS clubs get an in-page booking button and a live availability board. They get no extra ranking, size or placement.</p>
  <h2 style="font-size:28px;margin:28px 0 8px">Where the Listings Come From</h2>
  <p>Clubs come from a registry that is refreshed weekly from public sources, then checked by hand. Tournaments and events come from organisers, clubs and our own research. Anything sent through the <a href="/submit/">submission forms</a> is reviewed by a person before it goes live.</p>
  <h2 style="font-size:28px;margin:28px 0 8px">Photos and Posters</h2>
  <p>Photos are shown with a credit line. If a photo is yours and you want it changed or removed, <a href="/submit/#correction">tell us</a>. Posters are shared with permission.</p>
  <h2 style="font-size:28px;margin:28px 0 8px">Walk Times and Prices</h2>
  <p>Walk times are straight-line estimates from the nearest BTS or MRT station, not measured routes. Prices are shown only when a club has told us; otherwise we say so.</p>
  <h2 id="privacy" style="font-size:28px;margin:28px 0 8px">Privacy and Analytics</h2>
  <p>We use Google Analytics with anonymous settings to see which pages and buttons help players: page views, clicks on booking and directions links, and which filters get used. We do not collect names or emails through analytics, and Google signals and ad personalisation are turned off.</p>
  ${CONSENT_REQUIRED ? "<p>Analytics cookies stay off until you press Accept. Before you choose, Google may still receive anonymous page views without cookies. You can change your choice any time with Cookie Settings in the footer.</p>" : ""}
  <p>Names and emails sent through the submission forms are used only to check the submission and are deleted 12 months after it is reviewed.</p>
  <h2 style="font-size:28px;margin:28px 0 8px">Spot a Mistake?</h2>
  <p><a href="/submit/#correction">Report a correction</a>, or message <a href="${SITE_IG}" rel="noopener">@padelthailand</a> on Instagram.</p></div></main>`,
});

const notFoundPage = () => shell({
  title: "Page Not Found | Padel Thailand", path: "/404.html", active: "", noindex: true, description: "This page does not exist. Find a padel club, tournament or event in Thailand.",
  body: `<main class="wrap"><div class="page-head"><span class="badge-ink">404</span><h1 style="margin-top:14px">Page Not Found</h1>
  <p>That Page Does Not Exist or Has Moved. Try One of These:</p>
  <p><a class="btn solid" href="/">Network Map</a> <a class="btn" href="/clubs/">All Clubs</a> <a class="btn" href="/tournaments/">Tournaments</a></p></div></main>`,
});
const pages: [string, string][] = [["404.html", notFoundPage()], ["tournaments/index.html", tournamentsPage()], ["events/index.html", eventsPage()], ["about/index.html", aboutPage()]];
if (CHECK) { console.log(`check: ${pages.length} pages`); process.exit(0); }
for (const [p, html] of pages) { await mkdir(dirname(ROOT + p), { recursive: true }); await writeFile(ROOT + p, html); }
console.log(`built ${pages.length} pages (tournaments, events, about)`);

#!/usr/bin/env bun
/**
 * Tournaments, Events and About pages (Phase 1b). The listings themselves are rendered in the browser by
 * js/listings.js from data/tournaments.json and data/events.json (built by scripts/build-listings.ts).
 * Usage: bun scripts/build-listing-pages.ts [--check]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { SITE_IG, shell } from "./lib/chrome.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const CHECK = process.argv.includes("--check");
const HEAD = `<link rel="stylesheet" href="/css/listings.css?v=1">`;
const NOSCRIPT = (what: string) => `<noscript><div class="empty-state"><h2>Turn On JavaScript</h2><p>The ${what} List Needs JavaScript. You Can Also Find Us on <a href="${SITE_IG}" rel="noopener">Instagram</a>.</p></div></noscript>`;

const tournamentsPage = () => shell({
  title: "Tournaments | Padel Thailand", path: "/tournaments/", active: "tournaments", head: HEAD, bodyAttrs: 'data-listing="tournaments"',
  description: "Every padel tournament in Thailand: upcoming draws and past results, with posters. Filter by date, region, gender and club, then register.",
  scripts: `<script src="/js/listings.js?v=1"></script>`,
  body: `<main class="wrap">
  <div class="listing-head"><div><span class="badge-ink">Tournaments</span><span class="counts" id="t-count"></span>
    <h1>Every Draw in Thailand</h1><p>Every Padel Tournament in Thailand, From Every Club and Organiser — Filter by Date, Region and Club, Then Register.</p></div>
    <div class="cta-box"><a class="btn solid" href="/submit/#tournament">Submit a Tournament — It’s Free</a><p class="fine">Organisers: List It Once With Your Poster. A Person Checks Every Listing Before It Goes Live.</p></div></div>
  <div id="listing-root">${NOSCRIPT("Tournaments")}</div>
  <p class="listing-note">Listings From Clubs, Organisers and Our Own Research · Posters Shared With Permission</p>
</main>
<section class="cta-band" aria-labelledby="run-t"><div class="wrap"><div><h2 id="run-t">Running a Tournament?</h2><p>List It Free With Your Poster in Two Minutes. It Appears Here Once a Person Has Checked It.</p></div><a class="btn" href="/submit/#tournament">Submit a Tournament</a></div></section>`,
});

const eventsPage = () => shell({
  title: "Events | Padel Thailand", path: "/events/", active: "events", head: HEAD, bodyAttrs: 'data-listing="events"',
  description: "Weekly Americanos, clinics, socials and league nights at padel clubs across Thailand.",
  scripts: `<script src="/js/listings.js?v=1"></script>`,
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
  title: "About | Padel Thailand", path: "/about/", active: "", description: "How Padel Thailand works: where the club, tournament and event listings come from, and how bookings work.",
  body: `<main class="wrap"><div class="page-head"><span class="badge-ink">About</span><h1 style="margin-top:14px">How This Site Works</h1></div>
  <div class="prose" style="max-width:70ch;margin-top:12px">
  <h2 style="font-size:28px;margin:28px 0 8px">Every Club Is Listed the Same Way</h2>
  <p>The Map, the Clubs Page and the Filters Treat Every Club Equally. Each Booking Button Goes to Where the Club Actually Takes Bookings.</p>
  <p><strong>The Padel Society (TPS) Runs the Booking for Its Own Clubs.</strong> When Live Booking Arrives on This Site, TPS Clubs Get an In-Page Booking Button and a Live Availability Board. They Get No Extra Ranking, Size or Placement.</p>
  <h2 style="font-size:28px;margin:28px 0 8px">Where the Listings Come From</h2>
  <p>Clubs Come From a Registry That Is Refreshed Weekly From Public Sources, Then Checked by Hand. Tournaments and Events Come From Organisers, Clubs and Our Own Research. Anything Sent Through the <a href="/submit/">Submission Forms</a> Is Reviewed by a Person Before It Goes Live.</p>
  <h2 style="font-size:28px;margin:28px 0 8px">Photos and Posters</h2>
  <p>Photos Are Shown With a Credit Line. If a Photo Is Yours and You Want It Changed or Removed, <a href="/submit/#correction">Tell Us</a>. Posters Are Shared With Permission.</p>
  <h2 style="font-size:28px;margin:28px 0 8px">Walk Times and Prices</h2>
  <p>Walk Times Are Straight-Line Estimates From the Nearest BTS or MRT Station, Not Measured Routes. Prices Are Shown Only When a Club Has Told Us; Otherwise We Say So.</p>
  <h2 style="font-size:28px;margin:28px 0 8px">Spot a Mistake?</h2>
  <p><a href="/submit/#correction">Report a Correction</a>, or Message <a href="${SITE_IG}" rel="noopener">@padelthailand</a> on Instagram.</p></div></main>`,
});

const pages: [string, string][] = [["tournaments/index.html", tournamentsPage()], ["events/index.html", eventsPage()], ["about/index.html", aboutPage()]];
if (CHECK) { console.log(`check: ${pages.length} pages`); process.exit(0); }
for (const [p, html] of pages) { await mkdir(dirname(ROOT + p), { recursive: true }); await writeFile(ROOT + p, html); }
console.log(`built ${pages.length} pages (tournaments, events, about)`);

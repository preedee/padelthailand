#!/usr/bin/env bun
/**
 * /submit/ — one page, five forms (Phase 1b): tournament, event, club, photo, correction.
 * The hash picks the form (#tournament #event #club #photo #correction); js/submit.js does the switching,
 * validation, poster checks and the POST to the Apps Script endpoint in data/site-config.json.
 * The page ships in its closed state (submit disabled, Instagram fallback); js/submit.js opens it only
 * when submitEndpoint is set. Server side: scripts/AppsScript-Submissions.gs. Runbook: scripts/MODERATION.md.
 *
 * Usage: bun scripts/build-submit.ts [--check]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { SITE_IG, esc, shell } from "./lib/chrome.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const CHECK = process.argv.includes("--check");
const OUT = "submit/index.html";

const bands: { id: string; label: string }[] = JSON.parse(await readFile(ROOT + "data/levels.json", "utf8")).bands;
const LEVELS = bands.map((b) => b.label);
const GENDERS = ["Men", "Women", "Mixed", "Open"];
const EVENT_TYPES = ["Americano", "Mexicano", "Social", "Clinic", "League Night"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const PDPA = "We Use Your Name and Email Only to Check This Submission. We Delete Them 12 Months After It Is Reviewed.";
const CLOSED = `Submissions Open Soon — For Now Message Us on Instagram: <a href="${SITE_IG}" rel="noopener">@padelthailand</a>.`;
const THANKS = "Thanks — Your Submission Is Waiting for Review. Nothing Goes Live Until a Person Has Checked It.";

// ---------- field builders ----------
// Every control gets a visible <label>, an error slot (<p class="err">) and aria-describedby. No placeholders.
type F = {
  name: string; label: string; type?: string; required?: boolean; max?: number; kind?: string; hint?: string;
  attrs?: string; local?: boolean; wide?: boolean;
};
const opt = (required?: boolean) => (required ? "" : ` <span class="opt">(optional)</span>`);
const describedBy = (id: string, hint?: string, extra?: string) => `aria-describedby="${[hint ? `${id}-hint` : "", extra ?? "", `${id}-err`].filter(Boolean).join(" ")}"`;
const hintP = (id: string, hint?: string) => (hint ? `<p class="hint" id="${id}-hint">${hint}</p>` : "");
const errP = (id: string) => `<p class="err" id="${id}-err" hidden></p>`;

function input(p: string, f: F): string {
  const id = `${p}-${f.name}`;
  const t = f.type ?? "text";
  const tag = t === "textarea"
    ? `<textarea id="${id}" name="${f.name}" rows="5"${f.max ? ` maxlength="${f.max}"` : ""}${f.required ? " required" : ""}${f.kind ? ` data-kind="${f.kind}"` : ""} ${describedBy(id, f.hint)}${f.attrs ? " " + f.attrs : ""}></textarea>`
    : `<input id="${id}" name="${f.name}" type="${t}"${f.max ? ` maxlength="${f.max}"` : ""}${f.required ? " required" : ""}${f.kind ? ` data-kind="${f.kind}"` : ""}${f.local ? " data-local" : ""} ${describedBy(id, f.hint)}${f.attrs ? " " + f.attrs : ""}>`;
  return `<div class="fld${f.wide ? " wide" : ""}"><label for="${id}">${f.label}${opt(f.required)}</label>${hintP(id, f.hint)}${tag}${errP(id)}</div>`;
}

function select(p: string, f: F, options: [string, string][], placeholder?: string): string {
  const id = `${p}-${f.name}`;
  const ph = placeholder !== undefined ? `<option value="">${placeholder}</option>` : "";
  return `<div class="fld"><label for="${id}">${f.label}${opt(f.required)}</label>${hintP(id, f.hint)}<select id="${id}" name="${f.name}"${f.required ? " required" : ""} ${describedBy(id, f.hint)}>${ph}${options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>${errP(id)}</div>`;
}

/** A group of radios or checkboxes as 44px chips inside a fieldset with a legend. */
function choices(p: string, name: string, legend: string, type: "radio" | "checkbox", values: string[], o: { required?: boolean; checked?: string; local?: boolean; hint?: string } = {}): string {
  const id = `${p}-${name}`;
  return `<fieldset class="fld group" id="${id}" ${describedBy(id, o.hint)}${o.required ? ' data-required' : ""}><legend>${legend}${opt(o.required)}</legend>${hintP(id, o.hint)}
    <div class="choices">${values.map((v, i) => `<label class="choice" for="${id}-${i}"><input id="${id}-${i}" type="${type}" name="${name}" value="${esc(v)}"${o.checked === v ? " checked" : ""}${o.local ? " data-local" : ""}><span>${esc(v)}</span></label>`).join("")}</div>${errP(id)}</fieldset>`;
}

/** A single yes/no checkbox (licence, owner). Sends "yes" or "". */
function tick(p: string, name: string, label: string, required?: boolean): string {
  const id = `${p}-${name}`;
  return `<div class="fld"><label class="choice tick" for="${id}"><input id="${id}" type="checkbox" name="${name}" value="yes"${required ? " required" : ""} aria-describedby="${id}-err"><span>${label}</span></label>${errP(id)}</div>`;
}

/** Club select, filled from /data/clubs.json by js/submit.js, with an "Other venue" free-text fallback. */
function clubPicker(p: string, label = "Club or Venue"): string {
  const id = `${p}-club`;
  return `<div class="fld"><label for="${id}">${label}</label><p class="hint" id="${id}-hint">Pick a Club From Our List, or Choose Other Venue at the Bottom.</p>
    <select id="${id}" name="club" required data-clubs ${describedBy(id, "y")}><option value="">Choose a Club</option><option value="__other">Other Venue (Not Listed)</option></select>${errP(id)}</div>
  <div class="fld other-venue" hidden>${input(p, { name: "clubOther", label: "Venue Name", required: true, max: 200, local: true }).replace(/^<div class="fld">|<\/div>$/g, "")}</div>`;
}

function upload(p: string, label: string, required: boolean, hint: string): string {
  const id = `${p}-poster`;
  return `<div class="fld"><label for="${id}">${label}${opt(required)}</label><p class="hint" id="${id}-hint">${hint}</p>
    <input id="${id}" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" data-upload${required ? " required" : ""} ${describedBy(id, "y")}>${errP(id)}</div>`;
}

const contact = (p: string) => `<fieldset class="fld contact"><legend>About You</legend>
  <div class="row2">${input(p, { name: "contactName", label: "Your Name", required: true, max: 100, attrs: 'autocomplete="name"' })}
  <div class="fld"><label for="${p}-contactEmail">Your Email</label><input id="${p}-contactEmail" name="contactEmail" type="email" maxlength="254" required data-kind="email" autocomplete="email" inputmode="email" aria-describedby="${p}-pdpa ${p}-contactEmail-err">
  <p class="hint pdpa" id="${p}-pdpa">${PDPA}</p>${errP(`${p}-contactEmail`)}</div></div></fieldset>`;

const honeypot = (p: string) => `<div class="hp" aria-hidden="true"><label for="${p}-website_url">Leave This Empty</label><input id="${p}-website_url" name="website_url" type="text" tabindex="-1" autocomplete="off"></div>`;

function form(key: string, p: string, title: string, lede: string, button: string, fields: string): string {
  return `<form class="sub-form" id="f-${key}" data-type="${key}" aria-labelledby="${p}-h" novalidate hidden>
  <h2 id="${p}-h">${title}</h2><p class="lede">${lede}</p>
  <p class="closed" role="note">${CLOSED}</p>
  <div class="fields">
    ${fields}
    ${contact(p)}
    ${honeypot(p)}
    <p class="form-err" role="alert" hidden></p>
    <div class="actions"><button class="btn solid" type="submit" disabled>${button}</button><span class="fine">Fields Marked (Optional) Can Be Left Empty.</span></div>
  </div>
  <div class="sent" role="status" hidden><p class="sent-h">Sent</p><p>${THANKS}</p><button class="btn" type="button" data-again>Send Another</button></div>
</form>`;
}

const levelsHint = "Tick Every Level That Can Enter. Leave All Empty if You Are Not Sure.";
const FORMS: [string, string, string][] = [
  ["tournament", "Tournament", form("tournament", "t", "Submit a Tournament", "Running a Tournament in Thailand? Send the Details and We Will Add It to the Calendar.", "Submit Tournament", `
    ${input("t", { name: "title", label: "Tournament Name", required: true, max: 200 })}
    ${input("t", { name: "organizer", label: "Organizer", max: 200 })}
    ${clubPicker("t")}
    ${input("t", { name: "city", label: "City", required: true, max: 100, attrs: 'autocomplete="address-level2"' })}
    <div class="row2">${input("t", { name: "startDate", label: "Start Date", type: "date", required: true, kind: "date" })}${input("t", { name: "endDate", label: "End Date", type: "date", kind: "date", hint: "Leave Empty for a One-Day Tournament." })}</div>
    ${choices("t", "gender", "Gender", "radio", GENDERS, { required: true })}
    ${choices("t", "levels", "Levels", "checkbox", LEVELS, { hint: levelsHint })}
    ${input("t", { name: "format", label: "Format", max: 200, hint: "For Example: Groups Then Knockout, Best of Three Sets." })}
    <div class="row2">${input("t", { name: "entryFee", label: "Entry Fee", max: 100, hint: "For Example: 1,500 THB per Player." })}${input("t", { name: "prize", label: "Prize", max: 200 })}</div>
    ${input("t", { name: "registrationUrl", label: "Registration Link", type: "url", kind: "url", max: 500, hint: "Must Start With https://" })}
    ${input("t", { name: "instagramUrl", label: "Instagram Post", type: "url", kind: "igurl", max: 500, hint: "The Tournament Post, Starting With https://www.instagram.com/" })}
    ${upload("t", "Poster", false, "JPG, PNG or WebP, Up to 5 MB.")}
    ${input("t", { name: "notes", label: "Notes", type: "textarea", max: 2000 })}`)],
  ["event", "Event", form("event", "e", "Submit an Event", "Americanos, Mexicanos, Socials, Clinics and League Nights. One-Off or Every Week.", "Submit Event", `
    ${input("e", { name: "title", label: "Event Name", required: true, max: 200 })}
    ${select("e", { name: "eventType", label: "Event Type", required: true }, EVENT_TYPES.map((t) => [t, t]), "Choose a Type")}
    ${clubPicker("e")}
    ${input("e", { name: "city", label: "City", required: true, max: 100, attrs: 'autocomplete="address-level2"' })}
    ${choices("e", "howOften", "How Often", "radio", ["One Date", "Every Week"], { required: true, checked: "One Date", local: true })}
    <div class="when-once">${input("e", { name: "date", label: "Date", type: "date", required: true, kind: "date" })}</div>
    <div class="when-weekly row2" hidden>${select("e", { name: "weekday", label: "Weekday", required: true }, WEEKDAYS.map((d) => [d, d]), "Choose a Day")}${input("e", { name: "until", label: "Runs Until", type: "date", kind: "date", hint: "The Last Week It Runs, if You Know It." })}</div>
    <div class="row2">${input("e", { name: "startTime", label: "Start Time", type: "time", required: true, kind: "time", hint: "24-Hour Clock." })}${input("e", { name: "endTime", label: "End Time", type: "time", kind: "time" })}</div>
    ${choices("e", "levels", "Levels", "checkbox", LEVELS, { hint: levelsHint })}
    ${select("e", { name: "gender", label: "Gender" }, GENDERS.slice().reverse().map((g) => [g, g]))}
    <div class="row2">${input("e", { name: "capacity", label: "Capacity", type: "number", kind: "int", attrs: 'min="1" max="500" inputmode="numeric" data-min="1" data-max="500"', hint: "Players per Session." })}${input("e", { name: "pricePerPerson", label: "Price Per Person", max: 100, hint: "For Example: 500 THB." })}</div>
    ${input("e", { name: "signupUrl", label: "Sign-Up Link", type: "url", kind: "url", max: 500, hint: "Must Start With https://" })}
    ${upload("e", "Poster", false, "JPG, PNG or WebP, Up to 5 MB.")}
    ${input("e", { name: "notes", label: "Notes", type: "textarea", max: 2000 })}`)],
  ["club", "Club", form("club", "c", "Missing a Club? Add It", "Tell Us About a Padel Club That Is Not on the Map Yet.", "Submit Club", `
    ${input("c", { name: "clubName", label: "Club Name", required: true, max: 200 })}
    ${input("c", { name: "city", label: "City", required: true, max: 100, attrs: 'autocomplete="address-level2"' })}
    ${input("c", { name: "address", label: "Address", type: "textarea", max: 500 })}
    ${input("c", { name: "courts", label: "Courts", type: "number", kind: "int", attrs: 'min="1" max="60" inputmode="numeric" data-min="1" data-max="60"', hint: "How Many Padel Courts." })}
    ${input("c", { name: "bookingUrl", label: "Booking Link", type: "url", kind: "url", max: 500, hint: "Where Players Book, Starting With https://" })}
    <div class="row2">${input("c", { name: "phone", label: "Phone", type: "tel", kind: "phone", max: 30, attrs: 'autocomplete="tel"' })}${input("c", { name: "instagram", label: "Instagram", kind: "instagram", max: 500, hint: "An @handle or an https://instagram.com Link." })}</div>
    ${input("c", { name: "website", label: "Website", type: "url", kind: "url", max: 500, hint: "Must Start With https://" })}
    ${input("c", { name: "notes", label: "Notes", type: "textarea", max: 2000 })}`)],
  ["photo", "Photo", form("photo", "p", "Share a Club Photo", "Good Court Photos Help Players Pick a Club. We Show the Credit Line With the Photo.", "Send Photo", `
    ${clubPicker("p", "Club")}
    ${upload("p", "Photo", true, "JPG, PNG or WebP, Up to 5 MB. Landscape Works Best.")}
    ${input("p", { name: "credit", label: "Photo Credit", required: true, max: 200, hint: "Shown Under the Photo, for Example: Photo by Somchai K." })}
    ${tick("p", "licenceConfirmed", "I Took This Photo, or I Have Permission to Share It, and padelthailand.com May Show It With the Credit Above.", true)}`)],
  ["correction", "Correction", form("correction", "x", "Report a Correction", "Spotted Wrong Hours, a Closed Club or a Bad Link? Tell Us What to Fix.", "Send Correction", `
    ${input("x", { name: "pageUrl", label: "Page Link", type: "url", kind: "url", required: true, max: 500, hint: "The padelthailand.com Page With the Mistake." })}
    ${input("x", { name: "whatIsWrong", label: "What Is Wrong", type: "textarea", required: true, max: 2000 })}
    ${input("x", { name: "correctValue", label: "Correct Information", type: "textarea", max: 2000 })}
    ${tick("x", "isOwner", "I Run or Work at This Club or Event.")}`)],
];

const body = `<main class="wrap sub-page">
<div class="page-head"><span class="badge-ink">Submit</span><h1 style="margin-top:14px">Send Us a Listing</h1>
  <p>Tell Us About a Tournament, a Social Event, a Club We Are Missing, a Court Photo or a Mistake. A Person Reviews Every Submission Before Anything Goes Live.</p></div>
<div class="seg sub-seg" role="group" aria-label="What are you sending?">${FORMS.map(([k, l]) => `<button type="button" data-form="${k}" aria-controls="f-${k}" aria-pressed="false">${l}</button>`).join("")}</div>
<noscript><p class="closed">These Forms Need JavaScript. You Can Send the Details to Us on Instagram Instead: <a href="${SITE_IG}" rel="noopener">${SITE_IG}</a></p></noscript>
${FORMS.map(([, , html]) => html).join("\n")}
</main>`;

const html = shell({
  title: "Submit a Tournament, Event or Club | Padel Thailand",
  description: "Send a padel tournament, social event, missing club, court photo or correction to Padel Thailand. Every submission is reviewed by a person before it goes live.",
  path: "/submit/", active: "", body,
  head: `<link rel="stylesheet" href="/css/forms.css?v=1">`,
  scripts: `<script src="/js/submit.js?v=1"></script>`,
});

// ---------- checks ----------
const problems: string[] = [];
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) problems.push(`duplicate ids: ${[...new Set(dupes)].join(", ")}`);
if (/placeholder=/.test(body)) problems.push("placeholder attribute found; use visible labels");
for (const m of body.matchAll(/<(input|select|textarea)\s[^>]*id="([^"]+)"/g)) {
  if (!body.includes(`for="${m[2]}"`)) problems.push(`no <label for> for #${m[2]}`);
}
// Drift guard: the server's level list must match data/levels.json.
const gs = await readFile(ROOT + "scripts/AppsScript-Submissions.gs", "utf8").catch(() => "");
const gsLevels = /const SUB_LEVELS = \[([^\]]*)\]/.exec(gs)?.[1].match(/'([^']+)'/g)?.map((s) => s.slice(1, -1));
if (gsLevels && gsLevels.join("|") !== LEVELS.join("|")) problems.push(`AppsScript-Submissions.gs SUB_LEVELS (${gsLevels.join(", ")}) differs from data/levels.json (${LEVELS.join(", ")})`);
if (problems.length) { console.error("build-submit: " + problems.join("\n  ")); process.exit(1); }

if (CHECK) { console.log(`check: ${OUT} ok (${FORMS.length} forms, ${ids.length} ids, ${LEVELS.length} level bands)`); process.exit(0); }
await mkdir(dirname(ROOT + OUT), { recursive: true });
await writeFile(ROOT + OUT, html);
console.log(`built ${OUT} (${FORMS.length} forms)`);

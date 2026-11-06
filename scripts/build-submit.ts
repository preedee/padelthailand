#!/usr/bin/env bun
/**
 * /submit/ — one page, five forms (Phase 1b): tournament, event, club, photo, correction.
 * The hash picks the form (#tournament #event #club #photo #correction); js/submit.js does the switching,
 * validation and the POST (club and correction go to the Supabase function clubs.submit_form).
 * The page ships in its closed state (submit disabled, Instagram fallback); js/submit.js opens each form only
 * when its name is in data/site-config.json submitForms. Server side: supabase/0001_submissions.sql. Runbook: scripts/MODERATION.md.
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
const PDPA = "We use your name and email only to check this submission. We delete them 12 months after it is reviewed.";
const CLOSED = `Submissions open soon. For now, message us on Instagram: <a href="${SITE_IG}" rel="noopener">@padelthailand</a>.`;
// the forms that are wired to a server (js/submit.js WIRED): only their tabs show; a direct link such as /submit/#tournament still opens that form with its "opens soon" note
const LIVE = ["club", "correction"];
const THANKS = "Thanks. Your submission is waiting for review. Nothing goes live until a person has checked it.";

// ---------- field builders ----------
// Every control gets a visible <label>, an error slot (<p class="err">) and aria-describedby. No placeholders.
type F = {
  name: string; label: string; type?: string; required?: boolean; max?: number; kind?: string; hint?: string;
  attrs?: string; local?: boolean; wide?: boolean; rows?: number;
};
const opt = (required?: boolean) => (required ? "" : ` <span class="opt">(optional)</span>`);
const describedBy = (id: string, hint?: string, extra?: string) => `aria-describedby="${[hint ? `${id}-hint` : "", extra ?? "", `${id}-err`].filter(Boolean).join(" ")}"`;
const hintP = (id: string, hint?: string) => (hint ? `<p class="hint" id="${id}-hint">${hint}</p>` : "");
const errP = (id: string) => `<p class="err" id="${id}-err" hidden></p>`;

function input(p: string, f: F): string {
  const id = `${p}-${f.name}`;
  const t = f.type ?? "text";
  const tag = t === "textarea"
    ? `<textarea id="${id}" name="${f.name}" rows="${f.rows ?? 5}"${f.max ? ` maxlength="${f.max}"` : ""}${f.required ? " required" : ""}${f.kind ? ` data-kind="${f.kind}"` : ""} ${describedBy(id, f.hint)}${f.attrs ? " " + f.attrs : ""}></textarea>`
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
  return `<div class="fld"><label for="${id}">${label}</label><p class="hint" id="${id}-hint">Pick a club from our list, or choose Other venue at the bottom.</p>
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
    <div class="actions"><button class="btn solid" type="submit" disabled>${button}</button></div>
  </div>
  <div class="sent" role="status" hidden><p class="sent-h">Sent</p><p>${THANKS}</p><button class="btn" type="button" data-again>Send Another</button></div>
</form>`;
}

const levelsHint = "Tick every level that can enter. Leave all empty if you are not sure.";
const FORMS: [string, string, string][] = [
  ["tournament", "Tournament", form("tournament", "t", "Submit a Tournament", "Running a tournament in Thailand? Send the details and we will add it to the calendar.", "Submit Tournament", `
    ${input("t", { name: "title", label: "Tournament Name", required: true, max: 200 })}
    ${input("t", { name: "organizer", label: "Organizer", max: 200 })}
    ${clubPicker("t")}
    ${input("t", { name: "city", label: "City", required: true, max: 100, attrs: 'autocomplete="address-level2"' })}
    <div class="row2">${input("t", { name: "startDate", label: "Start Date", type: "date", required: true, kind: "date" })}${input("t", { name: "endDate", label: "End Date", type: "date", kind: "date", hint: "Leave empty for a one-day tournament." })}</div>
    ${choices("t", "gender", "Gender", "radio", GENDERS, { required: true })}
    ${choices("t", "levels", "Levels", "checkbox", LEVELS, { hint: levelsHint })}
    ${input("t", { name: "format", label: "Format", max: 200, hint: "For example: groups then knockout, best of three sets." })}
    <div class="row2">${input("t", { name: "entryFee", label: "Entry Fee", max: 100, hint: "For example: 1,500 THB per player." })}${input("t", { name: "prize", label: "Prize", max: 200 })}</div>
    ${input("t", { name: "registrationUrl", label: "Registration Link", type: "url", kind: "url", max: 500, hint: "Must start with https://" })}
    ${input("t", { name: "instagramUrl", label: "Instagram Post", type: "url", kind: "igurl", max: 500, hint: "The tournament post, starting with https://www.instagram.com/" })}
    ${upload("t", "Poster", false, "JPG, PNG or WebP, up to 5 MB.")}
    ${input("t", { name: "notes", label: "Notes", type: "textarea", max: 2000 })}`)],
  ["event", "Event", form("event", "e", "Submit an Event", "Americanos, mexicanos, socials, clinics and league nights. One-off or every week.", "Submit Event", `
    ${input("e", { name: "title", label: "Event Name", required: true, max: 200 })}
    ${select("e", { name: "eventType", label: "Event Type", required: true }, EVENT_TYPES.map((t) => [t, t]), "Choose a Type")}
    ${clubPicker("e")}
    ${input("e", { name: "city", label: "City", required: true, max: 100, attrs: 'autocomplete="address-level2"' })}
    ${choices("e", "howOften", "How Often", "radio", ["One Date", "Every Week"], { required: true, checked: "One Date", local: true })}
    <div class="when-once">${input("e", { name: "date", label: "Date", type: "date", required: true, kind: "date" })}</div>
    <div class="when-weekly row2" hidden>${select("e", { name: "weekday", label: "Weekday", required: true }, WEEKDAYS.map((d) => [d, d]), "Choose a Day")}${input("e", { name: "until", label: "Runs Until", type: "date", kind: "date", hint: "The last week it runs, if you know it." })}</div>
    <div class="row2">${input("e", { name: "startTime", label: "Start Time", type: "time", required: true, kind: "time", hint: "24-hour clock." })}${input("e", { name: "endTime", label: "End Time", type: "time", kind: "time" })}</div>
    ${choices("e", "levels", "Levels", "checkbox", LEVELS, { hint: levelsHint })}
    ${select("e", { name: "gender", label: "Gender" }, GENDERS.slice().reverse().map((g) => [g, g]))}
    <div class="row2">${input("e", { name: "capacity", label: "Capacity", type: "number", kind: "int", attrs: 'min="1" max="500" inputmode="numeric" data-min="1" data-max="500"', hint: "Players per session." })}${input("e", { name: "pricePerPerson", label: "Price Per Person", max: 100, hint: "For example: 500 THB." })}</div>
    ${input("e", { name: "signupUrl", label: "Sign-Up Link", type: "url", kind: "url", max: 500, hint: "Must start with https://" })}
    ${upload("e", "Poster", false, "JPG, PNG or WebP, up to 5 MB.")}
    ${input("e", { name: "notes", label: "Notes", type: "textarea", max: 2000 })}`)],
  ["club", "Club", form("club", "c", "Missing a Club? Add It", "Tell us about a padel club that is not on the map yet.", "Submit Club", `
    ${input("c", { name: "clubName", label: "Club Name", required: true, max: 200 })}
    <div class="dup" id="c-dup" role="status" aria-live="polite" hidden></div>
    ${input("c", { name: "city", label: "City", required: true, max: 100, attrs: 'autocomplete="address-level2"' })}
    ${input("c", { name: "address", label: "Address", type: "textarea", max: 500, rows: 3 })}
    ${input("c", { name: "courts", label: "Courts", type: "number", kind: "int", attrs: 'min="1" max="60" inputmode="numeric" data-min="1" data-max="60"', hint: "How many padel courts." })}
    ${input("c", { name: "bookingUrl", label: "Booking Link", type: "url", kind: "url", max: 500, hint: "Where players book, starting with https://" })}
    <div class="row2">${input("c", { name: "phone", label: "Phone", type: "tel", kind: "phone", max: 30, attrs: 'autocomplete="tel"', hint: "With the area code." })}${input("c", { name: "instagram", label: "Instagram", kind: "instagram", max: 500, hint: "An @handle or a link." })}</div>
    ${input("c", { name: "website", label: "Website", type: "url", kind: "url", max: 500, hint: "Must start with https://" })}
    ${input("c", { name: "notes", label: "Notes", type: "textarea", max: 2000 })}`)],
  ["photo", "Photo", form("photo", "p", "Share a Club Photo", "Good court photos help players pick a club. We show the credit line with the photo.", "Send Photo", `
    ${clubPicker("p", "Club")}
    ${upload("p", "Photo", true, "JPG, PNG or WebP, up to 5 MB. Landscape works best.")}
    ${input("p", { name: "credit", label: "Photo Credit", required: true, max: 200, hint: "Shown under the photo, for example: Photo by Somchai K." })}
    ${tick("p", "licenceConfirmed", "I took this photo, or I have permission to share it, and padelthailand.com may show it with the credit above.", true)}`)],
  ["correction", "Correction", form("correction", "x", "Report a Correction", "Spotted wrong hours, a closed club or a bad link? Tell us what to fix.", "Send Correction", `
    ${input("x", { name: "pageUrl", label: "Page Link", type: "url", kind: "url", required: true, max: 500, hint: "The padelthailand.com page with the mistake." })}
    ${input("x", { name: "whatIsWrong", label: "What Is Wrong", type: "textarea", required: true, max: 2000 })}
    ${input("x", { name: "correctValue", label: "Correct Information", type: "textarea", max: 2000 })}
    ${tick("x", "isOwner", "I run or work at this club or event.")}`)],
];

const body = `<main class="wrap sub-page">
<div class="page-head"><span class="badge-ink">Submit</span><h1 style="margin-top:14px">Add a Club or Report a Correction</h1>
  <p>Tell us about a padel club that is missing from the map, or something on the site that needs fixing. A person reviews every submission before anything goes live.</p></div>
<div class="seg sub-seg" role="group" aria-label="What are you sending?">${FORMS.map(([k, l]) => `<button type="button" data-form="${k}" aria-controls="f-${k}" aria-pressed="false"${LIVE.includes(k) ? "" : " hidden"}>${l}</button>`).join("")}</div>
<noscript><p class="closed">These Forms Need JavaScript. You Can Send the Details to Us on Instagram Instead: <a href="${SITE_IG}" rel="noopener">${SITE_IG}</a></p></noscript>
${FORMS.map(([, , html]) => html).join("\n")}
</main>`;

const html = shell({
  title: "Add a Club or Report a Correction | Padel Thailand",
  description: "Tell Padel Thailand about a padel club that is missing from the map, or report a mistake. Every submission is reviewed by a person before it goes live.",
  path: "/submit/", active: "", noindex: true, body,
  head: `<link rel="stylesheet" href="/css/forms.css?v=3">`,
  scripts: `<script src="/js/submit.js?v=4"></script>`,
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

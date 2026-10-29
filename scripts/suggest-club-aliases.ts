#!/usr/bin/env bun
/**
 * Which club names do the tournaments use that no registry club answers to? Prints the unmatched ones with the best
 * registry candidate, so a human can confirm an alias into data/club-aliases.json ({ place_id: ["Name tournaments use"] }).
 * Reads data/clubs.json (run scripts/build-clubs.ts first) and the public tournaments Sheet. Writes nothing.
 * Usage: bun scripts/suggest-club-aliases.ts
 */
const SHEET = "https://docs.google.com/spreadsheets/d/1uEk015Jv8tNGFYlQ7f5Q_DuO4FZbL8ls3cmZLPwsjsk/export?format=csv&gid=0";
const ROOT = new URL("..", import.meta.url).pathname;
// Keep identical to clubKey() in js/app.js, or this tool and the calendar disagree about what matches.
const key = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
const STOP = new Set(["padel", "club", "the", "and", "center", "centre", "thailand", "co", "sport", "sports"]);
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w && !STOP.has(w));

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const { clubs } = JSON.parse(await Bun.file(ROOT + "data/clubs.json").text()) as { clubs: { id: string; name: string; city: string; aliases: string[] }[] };
const known = new Map<string, string>();
for (const c of clubs) for (const n of [c.name, ...c.aliases]) known.set(key(n), c.id);

const [head, ...rows] = parseCsv(await (await fetch(SHEET)).text());
const iClub = head.indexOf("Club"), iCountry = head.indexOf("Country"), iCity = head.indexOf("City");
if (iClub < 0) throw new Error("no Club column in the tournaments sheet");
const count = new Map<string, { n: number; city: string }>();
for (const r of rows) {
  const name = (r[iClub] ?? "").trim();
  if (!name || /^(tbc|tbd|location tbc)$/i.test(name)) continue;
  if (iCountry >= 0 && r[iCountry] && !/thai/i.test(r[iCountry])) continue;
  const cur = count.get(name) ?? { n: 0, city: r[iCity] ?? "" };
  count.set(name, { n: cur.n + 1, city: cur.city });
}
let matched = 0;
const out: string[] = [];
for (const [name, { n, city }] of [...count.entries()].sort((a, b) => b[1].n - a[1].n)) {
  if (known.has(key(name))) { matched++; continue; }
  const t = new Set(tokens(name));
  const best = clubs.map((c) => { const u = new Set(tokens(c.name)); const hit = [...t].filter((w) => u.has(w)).length; return { c, score: t.size ? hit / t.size : 0 }; })
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score)[0];
  out.push(`${String(n).padStart(3)}  ${name.padEnd(34)} ${city.padEnd(12)} ${best ? `-> ${best.c.name} [${best.c.city}] (${best.score.toFixed(2)})  ${best.c.id}` : "no candidate"}`);
}
console.log(`Thai tournament club names: ${count.size}; answered by a registry club: ${matched}; unmatched: ${out.length}\n`);
console.log(out.join("\n"));

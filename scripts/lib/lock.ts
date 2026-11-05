/**
 * Password lock for the owner's Admin pages. The site is static (GitHub Pages), so there is no server to check a
 * password: the real page is encrypted at build time (AES-256-GCM, key from PBKDF2-SHA256, 600,000 rounds) and the
 * file that gets published is a small unlock screen. The browser derives the key from what you type, decrypts, and
 * writes the page. Without the password the published file holds nothing readable.
 *
 * One unlock covers every admin page in that browser tab (the derived key is kept in sessionStorage, never the password).
 * The salt is fixed and public on purpose, so both pages share one key; each page gets its own random IV.
 * The password comes from the ADMIN_PASSWORD environment variable (a GitHub Actions secret on the weekly build).
 */
import { webcrypto as crypto } from "node:crypto";

const SALT = "padelthailand-admin-v1";
const ROUNDS = 600_000;
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

export async function lockPage(html: string, password: string): Promise<string> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: new TextEncoder().encode(SALT), iterations: ROUNDS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(html)));
  return unlockScreen(b64(iv), b64(data));
}

function unlockScreen(iv: string, data: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin | Padel Thailand</title><meta name="robots" content="noindex, nofollow">
<style>
:root{--bg:#fff;--fg:#14181f;--mut:#5a6372;--line:#d5dae2;--acc:#0b6b3a}
@media (prefers-color-scheme:dark){:root{--bg:#0f1319;--fg:#eef1f6;--mut:#a3adbd;--line:#2c3441;--acc:#4cc38a}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,sans-serif}
form{width:min(92vw,360px);padding:0 4px}h1{font-size:22px;margin:0 0 4px}p{color:var(--mut);margin:0 0 16px}
label{display:block;font-weight:600;margin-bottom:6px}
input{width:100%;box-sizing:border-box;font:inherit;padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg)}
button{margin-top:12px;width:100%;font:inherit;font-weight:600;padding:12px;border:0;border-radius:8px;background:var(--acc);color:var(--bg);cursor:pointer}
button:disabled{opacity:.6;cursor:wait}#m{min-height:1.5em;margin-top:10px;color:#c0392b;font-size:15px}
</style></head><body>
<form id="f"><h1>Admin</h1><p>Owner tools for Padel Thailand. Enter the password to continue.</p>
<label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required autofocus>
<button id="b" type="submit">Unlock</button><div id="m" role="alert"></div></form>
<script>
(function () {
  var IV = "${iv}", DATA = "${data}", SALT = "${SALT}", ROUNDS = ${ROUNDS}, KEY = "pt-admin-key";
  var f = document.getElementById("f"), m = document.getElementById("m"), b = document.getElementById("b");
  var bin = function (s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); };
  function open(key) {
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: bin(IV) }, key, bin(DATA)).then(function (buf) {
      document.open(); document.write(new TextDecoder().decode(buf)); document.close();
    });
  }
  function fromRaw(raw) { return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]); }
  var saved = null; try { saved = sessionStorage.getItem(KEY); } catch (e) {}
  if (saved) { fromRaw(bin(saved)).then(open).catch(function () { try { sessionStorage.removeItem(KEY); } catch (e) {} }); }
  f.addEventListener("submit", function (e) {
    e.preventDefault(); m.textContent = ""; b.disabled = true; b.textContent = "Checking…";
    crypto.subtle.importKey("raw", new TextEncoder().encode(document.getElementById("pw").value), "PBKDF2", false, ["deriveBits"])
      .then(function (base) { return crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(SALT), iterations: ROUNDS, hash: "SHA-256" }, base, 256); })
      .then(function (raw) {
        return fromRaw(raw).then(open).then(function () {
          try { sessionStorage.setItem(KEY, btoa(String.fromCharCode.apply(null, new Uint8Array(raw)))); } catch (e) {}
        });
      })
      .catch(function () { m.textContent = "That password didn't work."; b.disabled = false; b.textContent = "Unlock"; });
  });
})();
</script></body></html>`;
}

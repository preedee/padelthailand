// Shared page chrome for the redesigned directory: escaping, icons, logo, header, footer and the HTML shell.
// Imported by scripts/build-directory.ts, build-listing-pages.ts and build-submit.ts.
import { readFileSync } from "node:fs";

export const SITE = "https://padelthailand.com";
export const SITE_IG = "https://www.instagram.com/padelthailand/";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const jsonLd = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");
/** schema.org BreadcrumbList from [name, path] pairs (the last item is the current page) */
export const breadcrumbLd = (items: [string, string][]) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + path })),
});
export const svg = (inner: string, s = 18, sw = 1.8) => `<svg aria-hidden="true" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

// ---------- chrome ----------
const LOGO = (w: number, h: number, bg = "#FFFFFF") => `<svg aria-hidden="true" width="${w}" height="${h}" viewBox="0 0 132 64"><rect x="0" y="17" width="100" height="5" fill="#A51931"/><rect x="0" y="27" width="100" height="10" fill="#2D2A4A"/><rect x="0" y="42" width="100" height="5" fill="#A51931"/><circle cx="100" cy="32" r="23" fill="${bg}" stroke="#2D2A4A" stroke-width="10"/></svg>`;
// data/site-config.json: analyticsConsent "required" (default; Thai PDPA-safe: analytics stay off until a visitor accepts) or "off" (always on, no banner)
const CONFIG = JSON.parse(readFileSync(new URL("../../data/site-config.json", import.meta.url), "utf8")) as { analyticsConsent?: string };
export const CONSENT_REQUIRED = CONFIG.analyticsConsent !== "off";
const GA_ID = "G-HYHPE5BTL7";
// Consent Mode v2: the default is set BEFORE gtag('config'), restored from the visitor's stored choice, and Google signals / ad personalisation stay off.
const GA = `<script>window.PT_ANALYTICS={consent:${JSON.stringify(CONSENT_REQUIRED ? "required" : "off")}};window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
${CONSENT_REQUIRED ? `var c='denied';try{if(localStorage.getItem('pt-consent')==='granted')c='granted';}catch(e){}
gtag('consent','default',{analytics_storage:c,ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});` : `gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});`}
gtag('js',new Date());gtag('config','${GA_ID}',{allow_google_signals:false,allow_ad_personalization_signals:false});</script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>`;
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..125,400..900&family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">`;
const NAV: [string, string, string][] = [["map", "/", "Network Map"], ["clubs", "/clubs/", "Clubs"]];
const header = (active: string) => `<header class="site-head"><div class="wrap">
  <a class="brand" href="/" aria-label="padelthailand home">${LOGO(62, 30)}<span class="word"><b>padel</b><i>thailand</i></span></a>
  <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Menu">${svg('<path d="M4 7h16M4 12h16M4 17h16"/>', 22, 2)}</button>
  <nav class="nav" id="site-nav" aria-label="Main">${NAV.map(([k, h, l]) => `<a href="${h}"${k === active ? ' aria-current="page"' : ""}>${l}</a>`).join("")}<a class="cta" href="/clubs/#book">Book a Court</a></nav>
</div></header>`;
const footer = () => `<footer class="site-foot"><div class="wrap">
  <div><span class="brand" style="min-height:0">${LOGO(46, 22, "#F3F4F2")}<span class="word" style="font-size:20px"><b>padel</b><i>thailand</i></span></span>
  <p>Run a club that is not on the map? Use Submit a Club below and we will add your stop.</p></div>
  <nav aria-label="Footer"><a href="/clubs/">All Clubs</a><a href="/submit/#club">Submit a Club</a><a href="/submit/#correction">Report a Correction</a><a href="/about/">About</a>${CONSENT_REQUIRED ? '<button type="button" class="linklike" data-cookie-settings>Cookie Settings</button>' : ""}<a href="${SITE_IG}" rel="noopener">@padelthailand</a></nav>
</div></footer>`;

export function shell(o: { title: string; description: string; path: string; active: string; body: string; image?: string; ld?: unknown | unknown[]; bodyClass?: string; bodyAttrs?: string; scripts?: string; head?: string; noindex?: boolean; imageAlt?: string }): string {
  const url = `${SITE}${o.path}`;
  const image = o.image ?? `${SITE}/img/og-default.png`;
  const lds = o.ld ? (Array.isArray(o.ld) ? o.ld : [o.ld]) : [];
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${esc(o.title)}</title>
  <meta name="description" content="${esc(o.description)}">
  <link rel="canonical" href="${esc(url)}">
  <meta name="robots" content="${o.noindex ? "noindex,follow" : "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"}">
  <meta name="theme-color" content="#2D2A4A">
  <meta property="og:site_name" content="Padel Thailand"><meta property="og:locale" content="en_US">
  <meta property="og:type" content="website"><meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(o.description)}"><meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${esc(image)}">${o.image ? "" : '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'}<meta property="og:image:alt" content="${esc(o.imageAlt ?? "Padel Thailand: every padel court in Thailand on one map")}">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(o.title)}"><meta name="twitter:description" content="${esc(o.description)}"><meta name="twitter:image" content="${esc(image)}">
  <link rel="icon" type="image/svg+xml" href="/img/favicon.svg"><link rel="icon" type="image/png" sizes="180x180" href="/img/apple-touch-icon.png"><link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
  ${FONTS}
  <link rel="stylesheet" href="/css/directory.css?v=3">
  ${o.head ?? ""}
  ${lds.map((l) => `<script type="application/ld+json">${jsonLd(l)}</script>`).join("\n  ")}
  ${GA}
</head>
<body class="dir${o.bodyClass ? " " + o.bodyClass : ""}"${o.bodyAttrs ? " " + o.bodyAttrs : ""}>
${header(o.active)}
${o.body}
${footer()}
<script src="/js/directory.js?v=1"></script>
<script src="/js/analytics.js?v=1" defer></script>
${o.scripts ?? ""}
</body>
</html>
`;
}


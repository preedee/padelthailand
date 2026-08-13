# Poster pipeline

How Instagram tournament posters get onto padelthailand.com.

Instagram's CDN URLs are signed and expire within days, and instagram.com blocks hotlinking.
So posters are **downloaded and committed** into `posters/`, and `data/posters.json` indexes
them by Instagram shortcode. Nothing on the live page ever points at `cdninstagram.com`.

## Routine run

```bash
bun scripts/fetch-posters.ts          # downloads whatever is missing, skips the rest
git add posters data/posters.json && git commit -m "posters: refresh"
```

| Flag | Effect |
|---|---|
| `--force` | re-download every poster, even ones already on disk |
| `--limit N` | stop after N downloads (useful for a quick check) |

It reads two sources and merges them:

1. **`Tournament Instagram URL`** on the Tournaments tab — the main source.
2. **The `Inbox` tab** — posts you shared from the Instagram app (below).

A post that returns no `og:image` (private, deleted, or login-walled) is logged and skipped;
its tournament falls back to the organizer-logo tile on the wall.

### Why `/media/?size=l` and not `og:image`

Two endpoints can serve a post's image, and only one of them serves the whole thing:

| Endpoint | Result |
|---|---|
| `og:image` from the post page | ~640px, **centre-cropped to a square**. The crop is baked into the signed URL (`stp=c216.0.648.648a_…`) and rewriting that parameter returns `403`, because the signature covers it. A 4:5 poster loses its top and bottom. |
| `/p/<code>/media/?size=l` | The **uncropped original**, typically 1080×1350 for a standard 4:5 post. |

So the script asks for `/media/?size=l` first and only falls back to `og:image` when that
endpoint refuses. Of the 109 posters, 42 come back 1080×1350, 26 are 1080×1080 squares, and the
rest sit between — real Instagram sizes at native aspect, which is what lets the wall show each
poster whole instead of cropping it to a grid cell.

The fallback matters: a login wall answers `200` with HTML, so the code checks the response's
content type rather than its status before trusting the bytes.

### Optimising for the wall

`fetch-posters.ts` runs `optimize-posters.py` automatically after any new download. Instagram's
originals are **progressive** JPEGs at 1080px, but the wall never draws a tile wider than about
380px, so those files are roughly 4× oversized and slow to decode — ten progressive 1080px
decodes at once is enough to stall a renderer.

The step rewrites each poster as a **baseline** JPEG capped at 760px wide (2× the widest tile) and
refreshes its dimensions in the manifest. Aspect ratio is untouched, so nothing is cropped — only
pixel dimensions come down, 15.2 MB → 10.2 MB across 109 posters. The full-resolution image is one
tap away on Instagram, which is where the tile links.

It needs Pillow (`python3 -m pip install --user Pillow`). Without it the download still succeeds
and the posters are simply left at original size, with a warning. Run it standalone any time:

```bash
python3 scripts/optimize-posters.py --width 760 --quality 80
```

### Poster shapes

The posters are not one size, which is why the wall packs them Pinterest-style — each tile takes
its own artwork's proportions, so nothing is cropped or letterboxed:

| Shape | Count |
|---|---|
| 4:5 portrait | 67 (61%) |
| 1:1 square | 34 (31%) |
| 9:16 tall | 7 (6%) |
| landscape | 1 |

## Share a post from your phone

One tap in the Instagram app, and the tournament ends up on the site — you do not touch the
spreadsheet. Two pieces of one-time setup, then two commands whenever you want to publish.

### 1. Deploy the capture endpoint (once)

1. Open the tournaments spreadsheet → **Extensions → Apps Script**
2. Paste `scripts/AppsScript-Inbox.gs`, replacing the default file
3. Change `SHARED_SECRET` to a long random string
4. **Deploy → New deployment → Web app**; *Execute as* **Me**, *Who has access* **Anyone with the link**
5. Copy the `/exec` URL. Open it in a browser — it should print `{"ok":true,...}`

### 2. Build the Shortcut (once)

Shortcuts app → **+** → name it `Add to Padel Thailand`:

1. **Receive** `URLs` from **Share Sheet** (tap the shortcut name → Details → *Show in Share Sheet*, input type URLs)
2. **Get Contents of URL**
   - URL: your `/exec` URL
   - Method: `POST`
   - Request Body: `Form`
   - Fields: `url` → *Shortcut Input*, `secret` → your shared secret
3. **Show Notification** with the result so you get confirmation on-device

Then in Instagram: post → **⋯ / paper-plane → Share to… → Add to Padel Thailand**. The URL lands
on the `Inbox` tab. Sharing the same post twice is a no-op — the endpoint de-dupes by shortcode.

### 3. Publish (two commands on the Mac)

```bash
bun scripts/fetch-posters.ts        # download + optimise the new posters
bun scripts/ingest-inbox.ts         # DRY RUN — shows what it would write
bun scripts/ingest-inbox.ts --apply # write the tournaments to the sheet
git add posters data && git commit -m "posters: refresh" && git push
```

`ingest-inbox.ts` needs the same endpoint and secret, in `scripts/.ingest-config.json`
(gitignored) or as `PADEL_INBOX_ENDPOINT` / `PADEL_INBOX_SECRET`:

```json
{ "endpoint": "https://script.google.com/macros/s/…/exec", "secret": "…" }
```

Useful flags: `--limit N`, and `--url <post>` to ingest a single post without the Inbox tab.

### What ingest does with each shared post

1. Reads the post page for the account handle, publication date and caption.
2. **Reads the poster artwork with Claude** to get the name, dates, city and venue.
3. Resolves the organizer from the handle, reusing that organizer's existing logo, colour,
   website and Instagram from a tournament you already have — so the tile looks right.
4. Then either:
   - **links** the post to a tournament you already have (same organizer, overlapping dates,
     no poster yet), or
   - **appends a new tournament row**.
5. Writes the outcome back to the `Inbox` tab's Status column, so nothing is processed twice.

Why it reads the image rather than the caption: the dates are printed on the artwork. Of seven
organizers sampled, only two put dates in the caption, and Bangkok Padel Tour's caption gives
the *registration* date (9 Dec) for a tournament played on **20 Dec**. Tested against 8 posters
with known answers, reading the artwork got 8/8 dates right — including that one.

Two things make it reliable rather than lucky:

- The post's publication date is passed in as a constraint. A poster branded "BPT SEASON 2026"
  showing "20 DECEMBER" is resolved to Dec **2025** because the post went up on 3 Dec 2025.
  Without that constraint the model reads the branding year and gets it wrong.
- The prompt refuses registration deadlines and "early bird" dates outright.

Anything it cannot read confidently is still written, but with **`Hide` set to `yes`**, so it
stays off the site until you look at it. Posts whose name or dates come back empty are left in
the Inbox and reported as "needs you".

The tournament names come from the artwork, so they read like the poster ("Bangkok Padel Tour
Vol. 1 - Asoke Grand Slam") rather than your house style ("BPT Kross Asoke Open"). Rename in
the sheet whenever you like — the name is not shown on the tile, only in the tooltip.

## Discovery by account (not enabled)

`scripts/instagram-discover.ts` would watch the 18 organizer accounts already listed in the
sheet and surface tournaments not yet on it. **It requires a paid Apify subscription**, because
logged-out Instagram profile pages expose no post links (verified 2026-08-13: 604 KB of HTML,
zero `/p/` hrefs). Individual *post* pages still serve `og:image` to crawlers, which is why the
main pipeline above costs nothing.

The file documents the exact enable steps and keeps the Apify call behind one function, so
turning it on is a token plus a small implementation — not a rewrite.

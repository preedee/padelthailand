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

The posters are not one size, which is why the wall uses a fixed 4:5 cell and contains each image
rather than cropping it:

| Shape | Count |
|---|---|
| 4:5 portrait | 67 (61%) |
| 1:1 square | 34 (31%) |
| 9:16 tall | 7 (6%) |
| landscape | 1 |

## Share a post from your phone

One tap in the Instagram app puts a post in the queue. Two pieces:

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
on the `Inbox` tab, and the next `fetch-posters.ts` run downloads the poster.

Shares from your own account are trusted, so they publish without review. Sharing the same post
twice is a no-op — the endpoint de-dupes by shortcode.

## Discovery by account (not enabled)

`scripts/instagram-discover.ts` would watch the 18 organizer accounts already listed in the
sheet and surface tournaments not yet on it. **It requires a paid Apify subscription**, because
logged-out Instagram profile pages expose no post links (verified 2026-08-13: 604 KB of HTML,
zero `/p/` hrefs). Individual *post* pages still serve `og:image` to crawlers, which is why the
main pipeline above costs nothing.

The file documents the exact enable steps and keeps the Apify call behind one function, so
turning it on is a token plus a small implementation — not a rewrite.

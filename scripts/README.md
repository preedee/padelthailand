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

### Known limitation: og:image is a square centre-crop

Instagram serves `og:image` at ~640px, and for a non-square post it is **centre-cropped to a
square** — the crop is baked into the signed URL as `stp=c216.0.648.648a_…`. Editing that
parameter to request the full frame returns `403`, because the signature covers it. So a wide
poster can lose its left and right edges (verified 2026-08-13).

In practice most posters are square already — of the 109 downloaded, 87 are 640×640 and 7 are
9:16 portrait, which `og:image` preserves. Getting uncropped, full-resolution originals means
the paid Apify route below, which returns `displayUrl` at native aspect.

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

# Submissions and Moderation Runbook

> **Update 2026-11-06:** the **Missing a Club** and **Report a Correction** forms no longer use Google Sheets. They write to the club registry (Supabase project `padelthailand`, table `clubs.submissions`) through `clubs.submit_form()`; the SQL is `supabase/0001_submissions.sql`. Review them in the Supabase dashboard: Table Editor > schema `clubs` > `submissions`. Set `status` to `live` or `rejected` (rows start as `pending`; nothing goes on the site until you act on it). Switch forms on or off with `submitForms` in `data/site-config.json` (for example `["club", "correction"]`; `[]` closes them all). The Apps Script sections below still describe the other three forms, which stay closed.

The forms at padelthailand.com/submit/ let anyone send a tournament, an event, a missing club, a club photo or a correction. Nothing they send goes on the site until a person has read it and marked it `live`.

## How It Fits Together

1. A visitor fills in a form. The browser checks it, then posts it to the Apps Script web app.
2. The Apps Script (`AppsScript-Submissions.gs`) checks it again and adds one row to that form's tab in the tournaments spreadsheet. The row's Status is `pending`.
3. A moderator reads the row and sets Status to `live` or `rejected`.
4. The nightly build publishes rows marked `live`. It ignores `pending` and `rejected` rows.

The script never writes to the live Tournaments tab. It writes only to these five tabs, and it creates any of them that are missing, with their headers:

| Tab | Form |
| --- | --- |
| Tournament Submissions | Submit a Tournament |
| Event Submissions | Submit an Event |
| Club Submissions | Missing a Club? Add It |
| Photo Submissions | Share a Club Photo |
| Correction Submissions | Report a Correction |

Do not rename these tabs, reorder their columns or rename their headers. The nightly build reads them by name.

## Deploying the Script (One Time)

1. Open the tournaments spreadsheet, then **Extensions > Apps Script**.
2. The project already holds `AppsScript-Inbox.gs`. Replace its contents with the current `scripts/AppsScript-Inbox.gs` from the repo. That version passes `action=submit` to the forms code before it checks the shared secret, and every other action still needs the secret.
3. Add a file (**+ > Script**), name it `AppsScript-Submissions`, and paste in `scripts/AppsScript-Submissions.gs`.
4. Leave the `SHARED_SECRET` line as it is. The forms do not use it, and it must never go in the website.
5. Click **Deploy > New deployment**, choose the type **Web app**, and set:
   - **Execute as:** Me
   - **Who has access:** Anyone
6. Click **Deploy** and approve the permissions it asks for (Sheets, Drive, and running when you are not present).
7. Copy the **Web app URL**. It ends in `/exec`.
8. Open the `/exec` URL in a browser. You should see `{"ok":true,"service":"padelthailand inbox"}`.

### Turning the Forms On

Paste the `/exec` URL into `data/site-config.json`:

```json
{ "submitEndpoint": "https://script.google.com/macros/s/AKfy.../exec" }
```

Then commit and publish the site. Until this value is set, every form says "Submissions open soon — for now message us on Instagram" and its submit button is disabled. To switch the forms off again, set the value back to `""`.

### Updating the Script Later

After you edit either `.gs` file, choose **Deploy > Manage deployments**, edit the existing deployment and pick **New version**. This keeps the `/exec` URL the same. If you use **New deployment** instead, you get a new URL, and you must paste it into `site-config.json` again.

## Reviewing Submissions

Check the five tabs at least once a day. Sort or filter each tab by **Status** to see the `pending` rows.

For each `pending` row:

1. **Check it is real.** Open every link: the registration or sign-up link, the Instagram post, the booking link and the website. Make sure the club or venue exists. Contact the sender if you need to.
2. **Check the poster or photo.** The Poster URL or Photo URL opens the image in Google Drive. Make sure it is a real poster or court photo with no personal data, and for photos, that the credit line is sensible.
3. **Fix small mistakes in place,** such as the spelling of a club name or a date written the wrong way round. Dates must stay as `yyyy-mm-dd` and times as `HH:MM` on a 24-hour clock.
4. **Set Status:**
   - `live` means it is correct and should be published. The nightly build adds it to the site.
   - `rejected` means it is spam, a duplicate, wrong, or not about padel in Thailand. It never appears on the site.

Use only these three values: `pending`, `live` and `rejected`, in lower case. Any other value is treated as not live.

Each listing is reviewed once, by a person. Corrections are a to-do list: make the fix on the site or in the club data, then set the row to `live` (fixed) or `rejected` (no change needed).

### Notes on Cell Values

- A cell that starts with `'` was escaped because the sender typed something starting with `=`, `+`, `-` or `@`. This stops Google Sheets from running it as a formula. A phone number like `'+66 81 234 5678` is normal. The nightly build strips one leading apostrophe.
- In the **Club** column, a value that matches a club name on the site exactly was picked from the list. Any other value is an unlisted venue the sender typed in.
- **Last Confirmed At** on events is the submission date. Recurring events are re-checked against it.

## Personal Data (PDPA)

The forms collect a contact name and email so we can check the submission. Each form says: "We use your name and email only to check this submission. We delete them 12 months after it is reviewed."

The retention rule:

- **12 months after a row is reviewed** (set to `live` or `rejected`), clear its **Contact Name** and **Contact Email** cells. Keep the rest of the row.
- Do this on the first working day of each month. Clear contact details on every row whose **Submitted At** date is more than 12 months ago. Submitted At is a safe stand-in because every row is reviewed soon after it arrives.
- Never copy contact names or emails into the site, the public data files or any other sheet.
- If someone asks us to delete their details sooner, clear them straight away, whatever the row's status.
- Uploaded images live in the Drive folder **padelthailand submissions**. Delete the images of `rejected` rows when you clear their contact details.

## Spam and Abuse

The script has three defences built in:

- **Hidden field.** Each form has a field that people cannot see and bots tend to fill in. When it is filled, the script answers "ok" and saves nothing.
- **Rate limit.** The site accepts at most 40 submissions per rolling hour across all forms. Beyond that, the script refuses new rows until the hour has passed.
- **Strict checks.** Links must start with `https://`, dates must be real `yyyy-mm-dd` dates, emails must look like emails, and text has length limits. Uploads must really be JPG, PNG or WebP files (the script checks the file's bytes, not its name), and no bigger than 5 MB.

If spam still gets through:

1. Set the spam rows to `rejected`, or delete them.
2. For a flood, switch the forms off by setting `submitEndpoint` to `""` in `data/site-config.json` and publishing. This takes effect on the next site deploy. For an immediate stop, open **Deploy > Manage deployments** in Apps Script and archive the deployment. The old URL then stops working. Make a new deployment and paste the new URL when you are ready to reopen.
3. If one kind of spam keeps coming, lower `SUB_RATE_LIMIT` in `AppsScript-Submissions.gs` and deploy a new version.

The browser sends forms in `no-cors` mode, so it cannot read the script's reply. A visitor always sees the thank-you message, even when the script turned the row away because of the rate limit or a failed check. The browser runs the same checks first, so real visitors rarely meet a server-side refusal.

# QT Passport

A small attendance and Quiet Time tracker for a children's ministry. Instead
of moving the same information from paper to Google Sheets, then Excel, then a
Word mail merge, you photograph the teacher's sheet, review the result, save
it, and print the cards in one place.

The app assumes two users—a volunteer and the pastor—working from the same
records.

**[Try the live demo →](https://brightfold.fly.dev)** Every name in it is
invented, no sign-in is needed, and you get your own sample data to edit. The
real app is not published anywhere; see
[Privacy and deployment](#the-demo-is-the-only-thing-published) for why.

> **Setting it up for real use? Read [`RUNNING-IT.md`](RUNNING-IT.md).** It
> covers running the app on one church computer that both of you reach, with
> the records never leaving that machine. This file covers the app itself and
> development.

---

## What it does

**Classes** — Records follow Grade → Class → Kid, just like the pastor's master
sheet. The class label can include the teacher (`A 5-2 (Korean)` or
`Ms. Ji Woo Park`), and each child can have both an English and Korean name.

**Log a sheet** — Take a picture of a class sheet. The scanner reads the full
grid, including every date, attendance mark, and QT page count. You can correct
the extracted table before saving; the database is not touched until you press
Save.

**Records** — A spreadsheet-style view with one child per row, an Attendance
and QT pair for each week, and a running total. Fix any cell directly without
uploading the picture again.

**Print cards** — Each child gets a point card with their names, class, weekly
history, total pages, and a passport stamp. The print layout puts two cards on
a page with cut lines and hides the app controls.

You can edit names from Records: click the name, make the correction, and tab
away. This is important because matching uses the English name. If a scanned
misspelling is left in place, a later scan may create a duplicate instead of
finding the original child. If an entire week was saved by mistake, remove it
with the × in that column's header.

---

## Running it

Use **Node 22 or newer**. The database runs on Node's built-in `node:sqlite`,
so it has no native dependency to compile.

```bash
npm install
```

Create `.env.local` from the template:

```bash
cp .env.example .env.local
```

Generate a session secret and paste it in as `QTP_SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Create both accounts. Their passwords appear once, so save them when printed:

```bash
npm run db:seed
```

Or set them yourself:

```bash
QTP_SEED_VOLUNTEER_PW='...' QTP_SEED_PASTOR_PW='...' npm run db:seed
```

Then:

```bash
npm run dev
```

Open http://localhost:3000 and sign in as `volunteer` or `pastor`.

### Using it from a phone on the same wifi

When it starts, `npm run dev` prints a Network address such as
`http://192.168.1.42:3000`. Open that address on the phone. Local-network login
works over plain HTTP. If the app is later served through HTTPS, its session
cookie automatically switches to `Secure`.

---

## Turning on photo scanning

Photo scanning is optional; manual entry remains available at all times. Until
a provider is configured, scanning stays disabled and **photos are not sent
anywhere**.

The providers below are supported and each offers a free tier. API keys stay
on the server and are never exposed to the browser.

**Google Gemini** — the strongest free option for handwriting.
Key: https://aistudio.google.com/apikey

```
VISION_PROVIDER=gemini
GEMINI_API_KEY=your-key
VISION_MODEL=gemini-2.5-flash
```

**Groq** — free, OpenAI-compatible. Key: https://console.groq.com/keys

```
VISION_PROVIDER=openai-compatible
VISION_BASE_URL=https://api.groq.com/openai/v1
VISION_API_KEY=your-key
VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
```

**OpenRouter** — set `VISION_BASE_URL=https://openrouter.ai/api/v1` and pick a
vision model. **Anthropic** — `VISION_PROVIDER=anthropic` with
`ANTHROPIC_API_KEY` (this one is paid).

Restart the dev server after editing `.env.local`.

> **Extraction has not been tried with a live provider.** Parsing, review,
> merging, and totals are tested, but development did not use a real provider
> key. Plan to tune `lib/vision/prompt.ts` for your sheets. **Make a backup
> first** (see below), and inspect the first several scans closely.

### iPhone photos

Before upload, the browser re-encodes the image. This converts HEIC to JPEG and
reduces large photos enough for free-tier limits. A browser that cannot decode
HEIC shows an explanation and asks for a JPEG instead of failing without a
message.

---

## Backups

Saving replaces entries in place. Because there is no undo or history table,
**recovery depends on having a backup.**

```bash
npm run db:backup
```

This writes a timestamped database copy to `data/backups/`. Run it every week
during the ministry year and before any unusual maintenance.

All records live in `data/qt-passport.db`; copying that file somewhere safe is
also a valid backup.

To wipe and start over (takes a backup first, and requires confirmation):

```bash
npm run db:reset -- --yes
```

---

## The re-scan rule — worth understanding

Teachers use **one sheet for the entire term**. A picture taken during week 10
therefore includes weeks 1–9 as well. Saving every visible column on every scan
would replace those earlier records and discard any corrections made by hand.

For that reason, **a date already recorded for the class starts unticked** and
is marked `saved`, with a warning above the table. Select it only when you mean
to replace the stored values; the app asks for confirmation before proceeding.

---

## Where the records live

Everything is one SQLite file. There is no cloud account behind it and no
copy anywhere else, which is deliberate: the records stay on a machine you
control.

**The intended setup** is one church computer running the app, reached by both
of you — over the church wifi, or over a private network for use from
elsewhere. Step-by-step in [`RUNNING-IT.md`](RUNNING-IT.md).

Because that file is the only copy, backups are not optional:

```bash
npm run db:backup
```

Set `QTP_BACKUP_DIR` in `.env.local` to a Google Drive or iCloud folder and
every backup syncs off the machine automatically.

> ⚠️ Back **up** into a synced folder; do not **run** from one. Sync tools copy
> files mid-write, which corrupts a database that is in use.

### The demo is the only thing published

`fly.toml` deploys a **demo** — invented names, no sign-in, throwaway data —
and nothing else. See [`DEMO.md`](DEMO.md). The real app is not deployed
anywhere, on purpose.

---

## Development

```bash
npm run dev          # dev server on :3000
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm test             # unit tests (vitest)
npm run test:e2e     # end-to-end tests (playwright)
```

The end-to-end suite uses port 3100, a separate database, and a build in
`.next-e2e/`, keeping it away from both the dev server and real records. Each
journey runs once in desktop Chromium and once in mobile WebKit.

### How it's put together

| Path | What's there |
| --- | --- |
| `app/(app)/` | The four signed-in pages |
| `app/api/` | Route handlers; every one gated by `withAuth` |
| `lib/repo.ts` | All database access and the business rules |
| `lib/vision/` | Provider adapters, the extraction prompt, output parsing |
| `lib/auth.ts` | scrypt password hashing, signed session cookies |
| `design/` | Design system spec and CSS tokens |

**Data model.** Each *week* belongs to one grade and is available to every
class in that grade, matching the column layout of the master sheet. Points
are page counts with no threshold or weighting.

**Kid matching.** English-name matching is case-insensitive within a class, so
later photos continue the same child's record. A scan may fill an empty Korean
name, but it never replaces one that is already stored; the next scan therefore
cannot undo a manual correction.

---

## Security posture

The deployment is small, but its security still matters because it stores
children's names and attendance.

- Two accounts, scrypt-hashed salted passwords, no default password
- Login throttled: 10 wrong attempts per client, then a 30-minute lockout
- Signed `httpOnly` session cookie; `Secure` whenever the request is HTTPS
- Every page and every API route requires a session
- `noindex` headers throughout
- The vision API key is server-side only and never appears in a response

**Not included:** encryption at rest or an audit trail beyond one `updated_by`
value per cell. That tradeoff fits the current two-user setup and should be
reconsidered if teachers receive their own accounts.

---

## Known limitations

- **Live extraction is unproven** — see the warning above.
- **Last write wins.** If both people edit the same cell at once, the later
  save silently overwrites the earlier one.
- **All grade weeks show for every class**, so a class that joined late shows
  empty columns for the weeks before it existed.

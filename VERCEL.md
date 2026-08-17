# Putting QT Passport on the web

This gives you a real address that works from anywhere, on any phone, with
nothing running on your laptop.

Everything here is free. No card is needed at any step.

> **Read this part first.** Hosting the app means the children's names and
> attendance records live on Vercel's and Turso's servers instead of on one
> computer you own. They sit behind a password and are kept out of search
> engines, but they are no longer only in your hands. That is a normal way to
> run an app like this, and it is a deliberate trade for being able to use it
> from anywhere. If you would rather they never left your machine, don't do
> this — use [`RUNNING-IT.md`](RUNNING-IT.md) instead.

---

## Why a separate database

Vercel runs the app in short-lived containers with a throwaway filesystem.
Anything the app writes to disk is gone within minutes. The local setup keeps
every record in a single SQLite file, so on Vercel that file would vanish
repeatedly — the site would look completely normal and quietly lose data.

So the records move to **Turso**, a hosted database that speaks the same SQLite
dialect. The app talks to whichever one is configured, and picks by itself:

| `TURSO_DATABASE_URL` | What the app uses |
| --- | --- |
| set | the hosted Turso database |
| not set | the local file, exactly as before |

That means the same code runs both ways, and your laptop copy keeps working
untouched.

---

## 1. Create the database

Install the Turso CLI and sign up (it opens a browser; use whichever account
you like):

```bash
brew install tursodatabase/tap/turso
```

```bash
turso auth signup
```

Create the database:

```bash
turso db create qt-passport
```

Now get the two values the app needs. Keep this terminal open — you'll paste
both into Vercel shortly.

```bash
turso db show qt-passport --url
```

```bash
turso db tokens create qt-passport
```

The first prints a `libsql://…` address. The second prints a long token, which
is a **password to your database** — don't put it in a message, a document, or
the repository.

---

## 2. Create the accounts

Do this from your own machine, pointed at the new database. It creates the two
logins and prints their passwords once.

```bash
TURSO_DATABASE_URL='<the libsql:// url>' TURSO_AUTH_TOKEN='<the token>' node scripts/admin.mjs seed
```

**Write both passwords down now.** They are not shown again.

The same command manages the accounts later — changing a password, or checking
who exists:

```bash
TURSO_DATABASE_URL='<url>' TURSO_AUTH_TOKEN='<token>' node scripts/admin.mjs list
```

This is the only way to manage accounts once the app is hosted; Vercel gives
you no shell to log in to.

---

## 3. Generate a session secret

This signs the login cookies. Any long random string works:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Copy the output.

---

## 4. Get a Gemini key, for photo scanning

Go to **https://aistudio.google.com/apikey**, sign in, and press *Create API
key*. Free, no card.

What this turns on: when you upload a sheet photo, the photo is sent to Google
to be read, and the extracted grid comes back for you to correct. Only the
photograph is sent. Leave this out and the app still works — you type the
numbers in by hand instead.

---

## 5. Deploy

Go to **https://vercel.com/new**, sign in **with GitHub**, and import
`LevahTeam/brightfold`. Vercel detects Next.js on its own; don't change the
build settings.

Before pressing Deploy, open **Environment Variables** and add these five:

| Name | Value |
| --- | --- |
| `QTP_SESSION_SECRET` | the random string from step 3 |
| `TURSO_DATABASE_URL` | the `libsql://…` from step 1 |
| `TURSO_AUTH_TOKEN` | the token from step 1 |
| `VISION_PROVIDER` | `gemini` |
| `GEMINI_API_KEY` | the key from step 4 |

Press **Deploy**. It takes a couple of minutes and then gives you an address
like `https://brightfold.vercel.app`.

Open it, sign in as `pastor` with the password from step 2, and add your first
class.

---

## Afterwards

**Changing a password**

```bash
TURSO_DATABASE_URL='<url>' TURSO_AUTH_TOKEN='<token>' node scripts/admin.mjs set-password pastor 'the-new-one'
```

**Backups.** Turso keeps its own point-in-time backups, but a copy you control
is worth having. This writes the whole database to a file:

```bash
turso db shell qt-passport .dump > qt-passport-backup.sql
```

Do it at the end of each term. `npm run db:backup` is for the *local* file and
refuses to run when `TURSO_DATABASE_URL` is set, rather than pretending to have
backed something up.

**Updating the app.** Pushing to `main` on GitHub redeploys automatically.

**Keeping it private.** The app sends `noindex` on every page, so it stays out
of Google. Anyone with the address still meets a login screen, and only the two
accounts you created can get past it.

---

## If something goes wrong

**"QTP_SESSION_SECRET is not set"** — the variable is missing in Vercel, or was
added after the deploy. Add it and redeploy from the Deployments tab.

**Sign-in rejects the right password** — the accounts were created in a
different database than the app is reading. Check that `TURSO_DATABASE_URL` in
Vercel matches the one you seeded in step 2, then run `admin.mjs list` against
it to confirm the accounts are there.

**The site loads but every page is empty** — usually `TURSO_AUTH_TOKEN` is
wrong or expired. Vercel's *Runtime Logs* tab shows the actual database error.

**Scanning says it is turned off** — `VISION_PROVIDER` isn't `gemini`, or
`GEMINI_API_KEY` is missing. Both must be set, and Vercel needs a redeploy
after adding them.

**Locked out after too many wrong passwords** — that is the brute-force guard.
It clears after 30 minutes.

# Running QT Passport without publishing it

You both need the same records, and the children's names should not sit on
someone else's server. Those two things can both be true: run the app on one
computer you control, and reach it over a private network.

The records live in one file, on that one computer. Nothing is published, and
there is no public web address.

---

## Is this the right file?

This file keeps the records **on one computer you own**. If you would rather
have a normal web address that works from anywhere, and are content for the
records to live on hosted servers, use [`VERCEL.md`](VERCEL.md) instead.

---

## Which setup do you need?

**Both of you only use it at church** → Setup A. Simplest, nothing to install.

**Either of you needs it from home or elsewhere** → Setup B. One free tool,
about ten minutes, and the data still never leaves the church computer.

---

## First: pick the computer

One machine is "the one that holds the records". Best choice is whichever
laptop is most often at church and least likely to be wiped or replaced.
Everything below happens on that machine.

### One-time setup

```bash
cd ~/Desktop/Volunteer
npm install
```

Then just double-click **`Start QT Passport.command`** in the project folder.

The first run creates the settings file, generates a session secret, and
creates both accounts. **It prints the two passwords once — write them down
before continuing.** After that it starts the app and opens it in a browser.

Leave that window open while the app is in use. Closing it stops the app.

> macOS may say the file "cannot be opened because it is from an unidentified
> developer". Right-click it → **Open** → **Open**. You only do that once.

To start it any other day: double-click the same file.

---

## Setup A — both of you at church

Once the app is running, the window prints two addresses:

```
On this computer:   http://localhost:3000
On the same wifi:   http://192.168.1.42:3000
```

The second one works from **any phone or laptop on the same wifi**. The pastor
can photograph a sheet on her phone at that address while the records stay on
the church computer.

Two things to know:

- The address can change if the router hands out a different one. If it stops
  working, look at the window again for the current address.
- It only works on that wifi. Off the network, nothing responds — which is
  exactly the point.

That is the whole setup. Skip to **Keeping the records safe**.

---

## Setup B — reaching it from anywhere, still privately

If either of you needs the app away from church, you need a private link
between your devices and the church computer. **Tailscale** does this: it
builds a small private network between only your own devices. Traffic is
encrypted end to end, and the records still only ever exist on the church
computer.

This is not the same as publishing the app. There is no public address, and
nobody without an invited device can reach it.

### 1. Install it on the church computer

```bash
brew install --cask tailscale
```

Open Tailscale and sign in. Use a Google account you control — this signs in to
Tailscale, it does not give Tailscale your records.

### 2. Add the other devices

Install the Tailscale app on the pastor's phone and on your own laptop, sign in
with **the same account**, and they join the same private network.

### 3. Serve the app over the private network

On the church computer, with QT Passport running:

```bash
tailscale serve --bg 3000
```

Tailscale prints an address like `https://church-laptop.tail1234.ts.net`.

That address works from any of your signed-in devices, anywhere, and from
nowhere else. It is real HTTPS, so the app's session cookie hardens
automatically.

To check what is being shared:

```bash
tailscale serve status
```

To stop sharing it:

```bash
tailscale serve --https=443 off
```

> ⚠️ **Do not use `tailscale funnel`.** That command is the one that *does*
> publish to the whole internet. `serve` keeps it private; `funnel` does not.

---

## Keeping the records safe

**The one file on that computer is the only copy.** No server holds a spare.
If the laptop is lost, dropped, or wiped, the records are gone unless you have
a backup.

### Send backups to Google Drive automatically

Open `.env.local` and set the backup folder. On macOS with Google Drive
installed, it looks like this:

```
QTP_BACKUP_DIR=/Users/you/Library/CloudStorage/GoogleDrive-you@gmail.com/My Drive/QT Passport
```

Then whenever you run:

```bash
npm run db:backup
```

a timestamped copy lands in that folder and Drive syncs it off the machine.
Do this **every week during the ministry year**, and before anything unusual.

> ⚠️ **Do not move the live database into a Drive or iCloud folder.** Sync
> tools copy files mid-write, and that corrupts a database that is being used.
> Back *up* into Drive; do not *run* from Drive.

### If the computer dies

Install the project on the replacement, copy the most recent backup to
`data/qt-passport.db`, and start it. Everything is in that one file — accounts,
classes, kids, weeks, totals.

---

## Turning on photo scanning

Optional, and unchanged by any of the above. See the "Turning on photo
scanning" section of `README.md`. The only thing that leaves the machine is the
photograph itself, sent to whichever provider you configure. Leave it off and
nothing is sent anywhere.

---

## Everyday use

1. Double-click **`Start QT Passport.command`**
2. Work in the browser — log sheets, fix records, print cards
3. Close the window when finished
4. Run `npm run db:backup` weekly

---

## If something goes wrong

**Double-clicking does nothing** — right-click → Open → Open, once.

**"QTP_SESSION_SECRET is not set"** — `.env.local` is missing or empty. Delete
it and run the start file again; it rebuilds it.

**Phone can't reach the wifi address** — the phone is on a different network
(guest wifi is a common culprit), or the address changed. Check the window.

**Nobody can sign in** — the accounts were never created, or the database was
replaced. Run `npm run db:seed`.

**Forgotten password:**

```bash
npx tsx scripts/set-password.ts pastor 'the-new-password'
```

**Locked out after wrong passwords** — that is the brute-force guard. It clears
in 30 minutes, or immediately if you restart the app.

---

## What about the public link?

That is the **demo**, and it is a separate thing: invented names, no sign-in,
nothing real in it. See [`DEMO.md`](DEMO.md).

The real app — this one, with the actual records — is not published anywhere,
and `fly.toml` is configured so it cannot be deployed by accident.

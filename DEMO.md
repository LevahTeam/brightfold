# Publishing the demo

The demo is the only thing that gets published. The real records stay on one
church computer — see [`RUNNING-IT.md`](RUNNING-IT.md).

**Why they are separate.** The real app holds real children's names. The demo
holds nothing but invented ones (Amelia Fontaine, Kofi Mensah, Ms. Rivera), in
throwaway databases, with no sign-in. Even if the demo were completely broken,
there is no real data in it to expose.

`fly.toml` sets `DEMO_MODE = "1"`, so `fly deploy` can only ever publish the
demo. A test fails the build if that is ever removed.

---

## What a visitor sees

They open the link and land straight in a working app: two grades, three
classes, eight Sundays of attendance and QT pages. They can add a child, edit
any cell, and print point cards.

Each visitor gets **their own private copy**, so a reviewer never lands in
someone else's half-finished edits. A gold banner across the top says it is a
demo, with a "Start over" button.

---

## Deploying it

You already have the app and its volume, so this is just a deploy.

```bash
fly deploy
```

```bash
fly open
```

That is the link to share: **https://brightfold.fly.dev**

To confirm it is the demo and not something else, check the page shows the gold
demo banner and the invented names.

---

## The five-minute trial limit

Your Fly account is on a trial without a credit card, so **machines stop after
five minutes of running**. For a demo this is survivable:

- A visitor's click wakes it in about **8 seconds**, then it runs for 5 minutes
- An idle demo costs nothing

It is a poor fit for real data entry, which is one of the reasons the real app
runs locally instead. If you want the demo to respond instantly and never
sleep, adding a card to Fly removes the limit — a small machine is normally a
couple of dollars a month. That is a decision for you, not a requirement.

> If you put this link on an application, click it yourself first and wait out
> the cold start, so you know what a reviewer will see.

---

## Running the demo on your own machine

Useful for checking it before you deploy, or for showing it without wifi:

```bash
npm run dev:demo
```

That serves the demo at http://localhost:3007, alongside the real app on 3000.

---

## Troubleshooting

**"app brightfold has no started VMs"** — the machine is asleep. Web requests
wake it; `fly ssh console` does not. Wake it first:

```bash
curl -s -o /dev/null https://brightfold.fly.dev/ && fly ssh console
```

**The demo shows real names** — it should be impossible, but if it ever
happens, take it down immediately and tell me:

```bash
fly apps destroy brightfold
```

**Logs:**

```bash
fly logs
```

# Memories

A simple, Facebook-styled feed where you write your own posts with text and
photos. Everything saves right in your browser — nothing is ever uploaded
anywhere.

## Put it on GitHub

1. Go to [github.com](https://github.com) and create a free account if you
   don't have one.
2. Click the **+** top right → **New repository**. Name it anything (e.g.
   `memories`), Public is fine, **Create repository**.
3. Click **uploading an existing file**.
4. Drag in **all** the files in this folder: `index.html`, `style.css`,
   `app.js`, `manifest.json`, `sw.js`, `share-target.html`, `icon-192.png`,
   `icon-512.png`. (This README isn't needed on the site, but it's fine to
   include it too.)
5. **Commit changes**.
6. Repo's **Settings** tab → **Pages** (left sidebar) → under "Branch" pick
   `main` → **Save**.
7. Wait about a minute, refresh that page — you'll get a link like
   `https://yourname.github.io/memories/`.

## Using it

Open your link. The first time, it'll ask for your name — that's a one-time
setup, not a password, and it's what shows on your posts afterward. Then
just write something, optionally attach photos, optionally backdate it with
the clock icon, and hit **Post**.

- The year dropdown at the top jumps to a specific year.
- Click any photo to see it bigger.
- **Delete** under a post removes it (only from this device).
- The **⋮** menu lets you change your name later, plus backup/restore
  (below).

## Sending photos/messages from WhatsApp

On Android, you can share something straight from WhatsApp into this site:

1. Open the site link on your phone, then your browser menu → **Add to
   Home screen**. This step is required — it only works once installed
   this way, not from a regular browser tab.
2. In WhatsApp, open the photo or message your husband sent.
3. Tap **Share** → choose **Memories** from the apps list.
4. The site opens with that photo/text already sitting in the composer —
   just hit Post (or edit it first).

This only works on **Android with Chrome** (there's no equivalent on
iPhone). The same instructions are also available any time from the **⋮**
menu → "Send from WhatsApp — how?".

## Getting it onto your phone too

Each device keeps its own separate posts — there's no automatic syncing
between your computer and your phone. To carry what you've written from one
to the other:

1. On the device that has your posts, tap **⋮** → **Download a backup**
   (photos included).
2. Open the same site link on the other device, tap **⋮** → **Load a
   backup file**, and pick that file — it adds those posts in without
   erasing what's already there.

## A note on privacy

This repo is public by default (free), but it never contains any of your
actual posts or photos — those only ever live in your browser's storage on
each device. If you'd still rather the code itself not be public, GitHub
Pages for private repos needs a paid plan (~$4/month).

## If something goes wrong

- **Post button does nothing:** make sure you've written something or
  attached a photo — there's a small red reminder if you try to post with
  neither. If it still does nothing, check you're opening the site through
  its real address (the github.io link) rather than by double-clicking the
  file, and that you're not in a private/incognito window — both can block
  the storage this needs.
- **Posts disappeared:** they live in this specific browser's storage on
  this specific device. Clearing browser data, switching browsers, or using
  a private window will not show them. Download a backup occasionally (⋮
  menu) and keep it somewhere safe.

# Sound Check — full setup

Nothing here needs a code editor, a terminal, or git. Everything is done in a
browser, and you can do all of it on a laptop in about half an hour.

You'll end up with three things:

- **A link** you send the team. Works on laptops and phones.
- **A five-character room code** you read out at the start of each session.
- **A shared screen** you present in the meeting that shows progress and
  standings but never spoils the answer.

---

## Part 1 — Firebase (about 10 minutes)

This is the only account you need. It stays on the free tier; fifteen people
for an hour a week uses a rounding error's worth of it.

1. Go to **console.firebase.google.com** and sign in with a Google account.
2. Click **Create a project**. Name it `sound-check`. On the analytics step,
   switch Google Analytics **off** — you don't need it and it adds steps.
3. When the project finishes building, click **Continue**.
4. In the left sidebar under "Product categories", click **Databases & Storage**,
   then choose **Realtime Database** → **Create Database**.
   - Pick the location closest to your team.
   - Choose **Start in locked mode**. You'll open it up deliberately in a second.

   > ⚠️ **Realtime Database, not Cloud Firestore.** They're separate products
   > with separate APIs, and this app only speaks Realtime Database. The console
   > pushes Firestore as the default, and picking it means the app silently
   > never connects.
5. Click the **Rules** tab at the top of the database view. Delete what's there,
   paste this in, and hit **Publish**:

   ```json
   {
     "rules": {
       ".read": false,
       ".write": false,
       "rooms": {
         "$code": {
           ".read": true,
           ".write": true,
           ".validate": "$code.length === 5"
         }
       }
     }
   }
   ```

6. Now register the web app — do this *after* the database exists, so the
   config comes out complete. Click the **gear icon** next to "Project
   Overview" → **Project settings**.
7. Scroll to **Your apps** and click the web icon, the one that looks like
   `</>`. Nickname it `sound-check`, leave Hosting unchecked, click
   **Register app**.
8. Firebase shows you a block of code containing `const firebaseConfig = {...}`.
   **Copy the whole `{...}` part and keep it somewhere** — a note, an open tab.
   You'll paste it in Part 3. If you lose it, it's always back under Project
   settings → Your apps.

> Those keys are safe to publish. They name your project; they don't grant
> access to it. The rules you pasted in step 5 are what actually protects
> things: nobody can list your rooms, they can only open a room if they already
> know its five-character code.

---

## Part 2 — GitHub repository (about 5 minutes)

1. Go to **github.com** and sign in, or create a free account.
2. Click the **+** in the top right → **New repository**.
3. Name it `sound-check`. Set it to **Public** — free GitHub Pages only serves
   public repositories. Don't add a README, you already have one.
4. Click **Create repository**.
5. On the empty repo page, click **uploading an existing file**.
6. Drag in all seven files:

   ```
   index.html   styles.css   app.js
   songs.js     firebase-config.js
   database.rules.json         README.md
   ```

   Keep them flat in the root — no folder around them, or the paths break.
7. Click **Commit changes**.

---

## Part 3 — Paste in your Firebase config

1. In your repo, click **firebase-config.js**.
2. Click the **pencil icon** (top right of the file view) to edit in the browser.
3. Replace the placeholder object with the one you copied in Part 1, step 8.
   Keep the `export const firebaseConfig =` at the front and the `;` at the end.
   It should look like:

   > 🛑 **Do not copy the shape below and fill in the blanks.** Copy the actual
   > object Firebase showed you and paste it whole. The values here are fake —
   > pasting them gets you an app that connects to a project that doesn't
   > exist, sits there retrying forever, and never shows an error.

   ```js
   export const firebaseConfig = {
     apiKey: "‹yours›",
     authDomain: "‹yours›.firebaseapp.com",
     databaseURL: "https://‹yours›-default-rtdb.firebaseio.com",
     projectId: "‹yours›",
     storageBucket: "‹yours›.firebasestorage.app",
     messagingSenderId: "‹yours›",
     appId: "‹yours›"
   };
   ```

   Your real project ID has a random suffix on it — something like
   `sound-check-a4f92`. If what you pasted doesn't have one, you've copied the
   wrong thing.

4. **Commit changes.**

> **If `databaseURL` isn't in what Firebase gave you**, it's because the web app
> was registered before the database existed. Go to the Realtime Database page
> and copy the URL shown at the top of the **Data** tab, then add the line
> yourself. The app won't connect without it.
>
> **The URL isn't always `firebaseio.com`.** Databases outside the US look like
> `https://sound-check-default-rtdb.europe-west1.firebasedatabase.app`. Copy
> exactly what the console shows rather than matching the example above.

---

## Part 4 — Turn on GitHub Pages

1. In the repo, click **Settings** (the tab, not your account settings).
2. Left sidebar → **Pages**.
3. Under "Build and deployment", set Source to **Deploy from a branch**, branch
   to **main**, folder to **/ (root)**. Click **Save**.
4. Wait a minute or two, then reload the page. It'll show your link:

   ```
   https://<your-username>.github.io/sound-check/
   ```

Open it. You should see the SOUND CHECK title screen. That's your link — it's
permanent, so you can send it once and reuse it every week.

---

## Part 5 — Add your team's songs

The song list lives in **songs.csv**, not in any of the code files. Open it in
Google Sheets, fill it in, export as CSV, and upload it to the repo the same
way you uploaded everything else.

```
title,artist,youtubeId,year,genre,pickedBy,start
Never Gonna Give You Up,Rick Astley,dQw4w9WgXcQ,1987,Pop,Sam,0
```

`youtubeId` takes a bare ID or a whole YouTube URL — paste whichever is easier:

```
https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s
                                ^^^^^^^^^^^ this bit is the ID
```

Rows without a usable ID are skipped and reported by row number, so a
half-finished file still runs.

**If your team already shares music somewhere** — a Slack channel, a group
chat, a shared playlist — that's a far better source than asking people to send
you links. **[SONGS.md](SONGS.md)** covers pulling a channel's history into the
CSV, including the part that catches people out: Spotify and Apple links don't
contain YouTube IDs, so there's a translation step in the middle.

**Choosing tracks that actually work.** The game is fun when about half the room
could get it by seven seconds. Too obscure and everyone waits for the reveal;
too obvious and it's over in one second. Aim for "I know this, I know this, what
IS this" — a song that was inescapable for one month eight years ago beats both
an all-time classic and a deep cut.

Build the file much bigger than one session needs — 100 rows or more. The era
and genre vote cuts it down each week, so one big file gives you a different
game every time and nobody has heard the whole list.

---

## Part 6 — Test before the meeting

Some YouTube uploads block embedding. They fail silently, and it's the one
thing that will visibly derail a session.

1. Open your link, enter your name, click **Start a room as host**.
2. Click **Test every track**.
3. Anything marked FAIL, find a different upload of that song and swap the ID in songs.csv. Rows skipped for a missing ID are listed here too.

Then do a five-minute dry run with one other person on their phone. Ten minutes
of rehearsal saves you an awkward debugging session in front of the whole team.

---

## Part 7 — Running a session

**Use both screens. This is the setup I'd recommend:**

| Device | Role |
|---|---|
| Your phone | Host controls — extend clip, reveal, next track |
| Your laptop | The shared screen, presented into the meeting |
| Everyone else's phone | Playing and guessing |
| Everyone else's laptop | The meeting, plus your shared screen |

Phones are the right place to play. People are already on their laptop for the
call, guessing on a second device keeps the game from covering up faces, and
nobody has to alt-tab away from the meeting to type an answer.

The run of show:

1. On your **phone**, open the link, enter your name, **Start a room as host**.
   Read out the five-character code.
2. Tap **Open the screen to share**. That opens a spoiler-free view. Send that
   URL to yourself and open it on your **laptop**, or just open your link on
   the laptop with `?present=CODE` on the end.
3. In the meeting, **share that browser tab**. It shows the room code, the
   waveform, how many people have locked in, and the standings — never the
   answer.
4. Paste the game link and the code into the meeting chat. Everyone opens it on
   their phone and joins.
5. **Let the room pick the flavour.** Everyone sees era and genre chips in the
   lobby and taps what they want to hear. Vote counts appear live on the shared
   screen, so the group can watch the argument resolve itself. When it settles,
   set the number of tracks and hit **Build the set from the vote** — the app
   filters `songs.js` to what won and shuffles it. Tapping nothing means
   anything goes. You can rebuild as many times as you like before starting.
6. Hit **Start the game** on your phone.
6. Everyone taps play, hears one second, and locks in a guess or skips.
7. Watch the "locked in" count on the shared screen. When it stops moving, hit
   **Extend clip**. Repeat up the ladder: 1s, 2s, 4s, 7s, 11s, 16s.
8. **If the room is stuck, drop a hint.** The host console nudges you when
   nobody has solved it by four seconds. Hints appear on every phone and on the
   shared screen, one at a time, in widening order:

   | # | Hint | Looks like |
   |---|---|---|
   | 1 | Release year | `1991` |
   | 2 | Genre | `Rock` |
   | 3 | **Who picked it** | `Dana` |
   | 4 | Title, masked | `S·····   L···   T···   S·····` |
   | 5 | Artist, masked | `N······` |

   Hint 3 is the good one. It narrows the field socially rather than musically,
   it makes the picker squirm pleasantly, and it turns the round into a
   conversation. Hints cost nothing — points already decay as the clip grows.
9. Hit **Reveal answer**. The title lands on the shared screen. Let the room
   talk for a minute — this is the part that's actually team building.
10. **Next track.**

Scoring runs 6 points for solving it on one second down to 1 point at sixteen.
At the end everyone gets an emoji grid to paste in the chat.

**Optional:** the shared screen has a **Play out loud** button. If you'd rather
have one shared listening moment than fifteen phones playing slightly out of
sync, share your tab *with audio* and use it. The tradeoff is that the call
compresses the audio and adds a delay, which makes a one-second clip harder
than intended. Try it once and see which your team prefers.

---

## About ads

Short answer: **Premium Lite will not help.** Music is the one category it
carves out. <cite index="11-1">YouTube's own documentation says ads may still appear on music content, and that this covers official music videos, Art Tracks, children's songs, and user-generated content containing music from their partners — covers, dance videos, even a vlog with a song in the background.</cite> That's every track in your file.

Worse, a subscription only ever helps the account watching. If fifteen people
play on fifteen phones, each one gets whatever ads their own account gets.
There is no plan you can buy that fixes this for the team.

So the app works around it instead. Three things, in order of how much they
help:

**1. The set warms up during the reveal (built in, nothing to do).** While the
room is talking about the track that just ended, every device quietly loads the
*next* one muted and lets it run for nine seconds. Any pre-roll burns off in
that window. When the next round starts, the player is already past the ad and
parked on the first note. This is why the play button disappears during the
reveal — it's working.

**2. Choose your uploads carefully.** Ads cluster on official music videos from
label channels. Auto-generated "topic" channels and plain audio uploads carry
noticeably fewer, and they're also less likely to block embedding. When you
have a choice between the official video and a lyric or audio upload, take the
audio one.

**3. Consider hosting the audio yourself.** The presenter screen has a **Play
out loud** button. If you share your tab with audio and use it, only *your*
device ever touches YouTube — fifteen ad surfaces become one. Full Premium (not
Lite) would then genuinely clear it for everyone. The tradeoff is that the call
compresses the audio and adds a delay, which makes a one-second clip harder than
intended. If ads turn out to be a real problem in your first session, this is
the lever to pull.

If you're weighing the upgrade anyway: full Premium is the tier that covers
music videos, and it's the only one that would do anything here.

---

## Installing it on a phone

The app is set up to install to a home screen, so it opens full screen with no
browser bars.

**iPhone:** open the link in Safari → Share button → **Add to Home Screen**.
Chrome on iOS can't do this; it has to be Safari.

**Android:** open in Chrome → menu → **Install app** or **Add to Home screen**.

Worth telling the team to do this before the first session. It gets rid of the
address bar, which is a surprising amount of screen back on a phone, and it
means nobody loses the game by mis-tapping a browser control.

There's deliberately no offline mode. A service worker would cache the files on
everyone's phone, and then editing `songs.csv` would leave half your team
playing last week's list with no obvious way to fix it.

---

## Troubleshooting

**Nothing happens when you start a room, and no error appears.** Nine times out
of ten `firebase-config.js` has the wrong `databaseURL` — often the example from
this guide rather than your own. Firebase doesn't error on a project that
doesn't exist, it just retries silently forever. Open `check.html` on your Pages
address; it now times out after 12 seconds and tells you.

**Title screen loads but joining does nothing.** The Firebase config didn't
take. Open the browser console (F12) — a "permission denied" message means the
rules from Part 1 step 5 weren't published; anything about an invalid API key
means `firebase-config.js` has a typo or a missing `databaseURL`.

**404 on your Pages link.** The files are in a subfolder instead of the repo
root, or Pages is still building. Check Settings → Pages for a green checkmark.

**A track plays nothing.** That upload blocks embedding. Run **Test every
track** and swap it.

**No sound on an iPhone.** The phone's silent switch mutes web audio in Safari.
Flip it, or use headphones. Also worth telling people up front: headphones make
this much better and stop laptop mics from picking up the clips.

**Someone's stuck on "waiting for host".** They've used their guess for this
clip length. That's the game — they're waiting for you to extend.

**Someone joined late.** They're fine. Levels they missed get marked as skips
automatically and they can still score on the current clip.

---

## Tuning it

- **Clip ladder** — `CLIP_SECONDS` at the top of `app.js`. Shorten it to
  `[1, 3, 7, 16]` if rounds drag.
- **Scoring** — `POINTS`, same block.
- **Harder** — set `start` to a second-verse timestamp so the intro doesn't
  give it away.
- **Themed rounds** — you don't need separate files. Tag `genre` well and let
  the lobby vote do it.

---

## Two honest limits

**Anyone who opens developer tools can see the answer.** There's no server
here, so the current track has to reach every browser in order to play. This is
a trust-based game among colleagues. If someone wins every round on one second,
you've learned something about them either way.

**Rooms are never cleaned up.** Each session uses a few kilobytes against a 1GB
free tier, so this won't be a problem for years. Delete the `rooms` node in the
Firebase console occasionally if it bothers you.

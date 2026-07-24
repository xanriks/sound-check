# Sound Check

A host-paced music guessing game for a team on a video call. One second of a
track, then two, then four, up to sixteen. Everyone plays on their own phone
while the host drives the clock and presents a spoiler-free screen into the
meeting.

Free to run end to end: GitHub Pages for the site, YouTube embeds for the
audio, Firebase Realtime Database free tier for the rooms. No audio files to
source, nothing to trim, no card required.

**→ Start with [SETUP.md](SETUP.md).** Click-by-click, browser only, no
terminal and no git. About half an hour.

## The files

| File | What it is |
|---|---|
| `index.html` | The whole app — join, play, host console, shared screen |
| `app.js` | Game logic, Firebase sync, YouTube clip playback |
| `styles.css` | Styling |
| `songs.js` | **The one file you edit each week.** Your track list |
| `firebase-config.js` | **Paste your Firebase keys here once.** |
| `database.rules.json` | Security rules to paste into the Firebase console |

## How a session runs

Host on a phone, shared screen on a laptop, everyone else playing on their
phones with the meeting on their laptops. The host extends the clip when the
"locked in" count stops moving, reveals, and moves on. Scoring is 6 points for
solving it on one second down to 1 point at sixteen, and everyone gets an emoji
grid at the end to paste in the chat.

Full run of show, troubleshooting, and tuning are all in
[SETUP.md](SETUP.md).

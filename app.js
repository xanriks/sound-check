import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, set, update, get, onValue, onDisconnect
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { loadSongs } from "./songs.js";

/* ============================================================
   CONSTANTS
   ============================================================ */
const CLIP_SECONDS = [1, 2, 4, 7, 11, 16];   // the ladder
const MAX_SECONDS  = 16;
const BAR_COUNT    = 64;
const CODE_LENGTH  = 4;   // numeric room code
const POINTS       = [6, 5, 4, 3, 2, 1];     // by level solved at

const decade = (y) => y ? `${Math.floor(y / 10) * 10}s` : null;

/* Filled in by loadSongs() before the start screen unlocks. */
let SONGS = [], ERAS = [], GENRES = [], songIssues = [];

/* ============================================================
   STATE
   ============================================================ */
let db = null, initError = null;
try {
  db = getDatabase(initializeApp(firebaseConfig));
} catch (err) {
  initError = err;
}

let me = sessionStorage.getItem("sc-id");
if (!me) { me = crypto.randomUUID(); sessionStorage.setItem("sc-id", me); }

let myName = "";
let roomCode = null;
let isHost = false;
let room = null;          // last snapshot
let unsubscribe = null;

let ytReady = false, primed = false, playing = false;
let stopTimer = null, rafId = null, pendingMs = 0, cuedVideo = null;

let presentMode = false;  // read-only screen shared into the meeting
let myVote = { eras: {}, genres: {} };
let chipsBuilt = false;
let warmedFor = -1;
let selectedSong = null;  // song object chosen from autocomplete
let activeSuggestion = -1;
let lastCuedRound = -1;

/* ============================================================
   SHORTHAND
   ============================================================ */
const $  = (id) => document.getElementById(id);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
const show = (el, yes) => { el.hidden = !yes; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* Both the player screen and the presenter screen have a wave and a play
   button. Playback drives whichever one is on screen. */
function setPlayingUI(yes) {
  $$(".js-play").forEach(b => b.classList.toggle("is-playing", yes));
  $$(".js-wave").forEach(w => w.classList.toggle("is-playing", yes));
  if (!yes) $$(".wave__playhead").forEach(p => p.style.left = "0%");
}

function screen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("is-active"));
  $("screen-" + name).classList.add("is-active");
}

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/feat\.?|ft\.?|&/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ============================================================
   YOUTUBE
   ============================================================ */
window.onYouTubeIframeAPIReady = () => {
  new YT.Player("yt-player", {
    height: "200", width: "200",
    playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1 },
    events: {
      onReady: (e) => { window.ytPlayer = e.target; ytReady = true; },
      onStateChange: onPlayerState,
      onError: onPlayerError
    }
  });
};

function onPlayerState(e) {
  if (e.data === YT.PlayerState.PLAYING && pendingMs > 0) {
    const ms = pendingMs; pendingMs = 0;
    clearTimeout(stopTimer);
    stopTimer = setTimeout(stopClip, ms);
    startPlayhead(ms);
    playing = true;
    setPlayingUI(true);
  }
}

function onPlayerError() {
  show($("track-error"), true);
  $("track-error").textContent = isHost
    ? "This track won't play embedded. Skip to the next one and drop it from songs.js."
    : "This track won't play here. The host will move on.";
  stopClip();
}

function cueSong(song) {
  if (!ytReady || !song) return;
  cuedVideo = song.youtubeId;
  window.ytPlayer.cueVideoById({ videoId: song.youtubeId, startSeconds: song.start || 0 });
}

/* Cue each track once per round so the first clip starts without a buffer stall. */
function ensureCued(song) {
  if (lastCuedRound !== roundIdx()) { lastCuedRound = roundIdx(); stopClip(); }
  if (song && cuedVideo !== song.youtubeId) cueSong(song);
}

/* Burn the pre-roll ad during the reveal, while the room is talking about the
   last track. By the time the next round starts the player is past the ad and
   parked on the first note. */
async function warmUpNext() {
  const nextI = roundIdx() + 1;
  if (!ytReady || warmedFor === nextI || nextI >= playlist().length) return;
  const next = SONGS[playlist()[nextI]];
  if (!next) return;
  warmedFor = nextI;
  window.ytPlayer.mute();
  window.ytPlayer.loadVideoById({ videoId: next.youtubeId, startSeconds: 0 });
  await sleep(9000);
  window.ytPlayer.pauseVideo();
  window.ytPlayer.seekTo(next.start || 0, true);
  window.ytPlayer.unMute();
  cuedVideo = next.youtubeId;
}

function playClip(seconds) {
  const song = currentSong();
  if (!ytReady || !song) return;
  show($("track-error"), false);
  clearTimeout(stopTimer);
  if (cuedVideo !== song.youtubeId) cueSong(song);
  pendingMs = seconds * 1000;
  window.ytPlayer.seekTo(song.start || 0, true);
  window.ytPlayer.playVideo();
}

function stopClip() {
  clearTimeout(stopTimer);
  cancelAnimationFrame(rafId);
  if (ytReady) window.ytPlayer.pauseVideo();
  playing = false;
  pendingMs = 0;
  setPlayingUI(false);
}

function startPlayhead(ms) {
  const span = (ms / 1000) / MAX_SECONDS * 100;
  const t0 = performance.now();
  cancelAnimationFrame(rafId);
  const step = (t) => {
    const pct = Math.min((t - t0) / ms, 1) * span;
    $$(".wave__playhead").forEach(p => p.style.left = pct + "%");
    if (pct < span) rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

/* One user gesture unlocks programmatic playback for the rest of the session. */
async function primeAudio() {
  if (primed || !ytReady) return;
  window.ytPlayer.mute();
  window.ytPlayer.playVideo();
  await sleep(350);
  window.ytPlayer.pauseVideo();
  window.ytPlayer.unMute();
  primed = true;
  show($("audio-gate"), false);
}

/* ============================================================
   ROOM LIFECYCLE
   ============================================================ */
function makeCode() {
  // 4-digit code, never starting with 0, so it always reads as 4 digits.
  return String(Math.floor(1000 + Math.random() * 9000));
}

function shuffled(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function createRoom() {
  myName = $("input-name").value.trim();
  if (!myName) return fail("Enter your name first.");
  if (!SONGS.length) return fail("No tracks loaded. Check songs.csv.");

  let code, exists = true, tries = 0;
  while (exists && tries++ < 8) {
    code = makeCode();
    exists = (await get(ref(db, `rooms/${code}/meta`))).exists();
  }

  await set(ref(db, `rooms/${code}`), {
    meta: { host: me, status: "lobby", createdAt: Date.now() },
    playlist: shuffled(SONGS.length),
    round: { i: 0, level: 0, revealed: false },
    players: { [me]: { name: myName, online: true } }
  });

  roomCode = code; isHost = true;
  attach();
}

async function joinRoom() {
  myName = $("input-name").value.trim();
  const code = $("input-code").value.trim();
  if (!myName) return fail("Enter your name first.");
  if (!/^\d{4}$/.test(code)) return fail("Room codes are 4 digits.");

  const snap = await get(ref(db, `rooms/${code}/meta`));
  if (!snap.exists()) return fail("No room with that code. Check with the host.");

  await set(ref(db, `rooms/${code}/players/${me}`), { name: myName, online: true });
  roomCode = code; isHost = snap.val().host === me;
  attach();
}

function fail(msg) {
  const el = $("start-error");
  el.textContent = msg;
  show(el, true);
}

function attach(asPlayer = true) {
  if (asPlayer) onDisconnect(ref(db, `rooms/${roomCode}/players/${me}/online`)).set(false);
  if (unsubscribe) unsubscribe();
  unsubscribe = onValue(ref(db, `rooms/${roomCode}`), (snap) => {
    room = snap.val();
    if (room) render();
  });
}

/* ============================================================
   DERIVED VALUES
   ============================================================ */
const playlist   = () => room?.playlist || [];
const roundIdx   = () => room?.round?.i ?? 0;
const level      = () => room?.round?.level ?? 0;
const revealed   = () => !!room?.round?.revealed;
const clipLen    = () => CLIP_SECONDS[Math.min(level(), CLIP_SECONDS.length - 1)];
const currentSong = () => SONGS[playlist()[roundIdx()]] || null;
const hintCount  = () => room?.round?.hints ?? 0;
const myResult   = () => room?.results?.[roundIdx()]?.[me] || null;
const solvedThisRound = () =>
  Object.values(room?.results?.[roundIdx()] || {}).filter(r => r.solved != null).length;

function scores() {
  const out = {};
  Object.entries(room?.players || {}).forEach(([id, p]) => out[id] = { name: p.name, pts: 0 });
  Object.values(room?.results || {}).forEach(round => {
    Object.entries(round || {}).forEach(([id, r]) => {
      if (out[id] && r.solved !== null && r.solved !== undefined) out[id].pts += POINTS[r.solved] || 0;
    });
  });
  return Object.entries(out).sort((a, b) => b[1].pts - a[1].pts);
}

/* ============================================================
   SET LIST — the room votes, the host builds
   ============================================================ */
function buildChips() {
  if (chipsBuilt) return;
  chipsBuilt = true;
  const chip = (kind, v) =>
    `<button class="chip" type="button" data-kind="${kind}" data-v="${escapeHtml(v)}"
       aria-pressed="false">${escapeHtml(v)}<span class="chip__n"></span></button>`;
  $("chips-era").innerHTML = ERAS.map(v => chip("eras", v)).join("");
  $("chips-genre").innerHTML = GENRES.map(v => chip("genres", v)).join("");
}

function tallyVotes() {
  const t = { eras: {}, genres: {} };
  Object.values(room?.votes || {}).forEach(v => {
    ["eras", "genres"].forEach(k =>
      Object.keys(v?.[k] || {}).forEach(x => t[k][x] = (t[k][x] || 0) + 1));
  });
  return t;
}

function paintChips() {
  const t = tallyVotes();
  $$(".chip").forEach(c => {
    const { kind, v } = c.dataset;
    c.setAttribute("aria-pressed", myVote[kind][v] ? "true" : "false");
    c.querySelector(".chip__n").textContent = t[kind][v] || "";
  });
}

function toggleChip(kind, v) {
  if (myVote[kind][v]) delete myVote[kind][v]; else myVote[kind][v] = true;
  paintChips();
  set(ref(db, `rooms/${roomCode}/votes/${me}`), myVote);
}

const winners = () => {
  const t = tallyVotes();
  return {
    eras:   Object.keys(t.eras).filter(k => t.eras[k] > 0),
    genres: Object.keys(t.genres).filter(k => t.genres[k] > 0)
  };
};

function matching({ eras, genres }) {
  return SONGS.map((s, i) => ({ s, i })).filter(({ s }) =>
    (!eras.length   || eras.includes(decade(s.year))) &&
    (!genres.length || genres.includes(s.genre)));
}

async function buildSetList() {
  const w = winners();
  const pool = matching(w);
  const want = Math.max(3, Math.min(40, parseInt($("input-length").value, 10) || 10));
  const note = $("build-note");

  if (!pool.length) {
    note.textContent = "Nothing in songs.js matches that vote. Loosen it or add tracks.";
    return;
  }

  const picked = pool.sort(() => Math.random() - 0.5).slice(0, want).map(x => x.i);
  await update(ref(db, `rooms/${roomCode}`), {
    playlist: picked,
    setlist: { eras: w.eras, genres: w.genres, count: picked.length }
  });

  const label = [w.eras.join(" · "), w.genres.join(" · ")].filter(Boolean).join(" — ") || "everything";
  note.textContent = picked.length < want
    ? `Set built: ${picked.length} tracks (${label}). That's all that matched — you asked for ${want}.`
    : `Set built: ${picked.length} tracks — ${label}.`;
}

/* ============================================================
   HINTS — widen the spotlight without naming the track
   ============================================================ */
function maskWords(t) {
  return String(t).split(/\s+/).map(w => w[0] + "·".repeat(Math.max(0, w.length - 1))).join("   ");
}

function hintsFor(song) {
  if (!song) return [];
  const out = [];
  if (song.year)     out.push({ label: "released",  value: String(song.year) });
  if (song.genre)    out.push({ label: "genre",     value: song.genre });
  if (song.pickedBy) out.push({ label: "picked by", value: song.pickedBy });
  out.push({ label: "title",  value: maskWords(song.title),  mono: true });
  out.push({ label: "artist", value: maskWords(song.artist), mono: true });
  return out;
}

function drawHints(el, song, n) {
  el.innerHTML = hintsFor(song).slice(0, n).map(h =>
    `<li class="hint">
       <span class="hint__label">${h.label}</span>
       <span class="hint__value${h.mono ? " hint__value--spaced" : ""}">${escapeHtml(h.value)}</span>
     </li>`).join("");
}

const dropHint = () => update(ref(db, `rooms/${roomCode}/round`), { hints: hintCount() + 1 });

/* ============================================================
   RENDER
   ============================================================ */
function render() {
  if (presentMode) { screen("present"); renderPresent(); return; }
  const status = room.meta.status;

  if (status === "lobby")   { screen("lobby"); renderLobby(); return; }
  if (status === "ended")   { screen("end");   renderEnd();   return; }

  screen("game");
  renderGame();
}

function renderLobby() {
  $("lobby-code").textContent = roomCode;
  const people = Object.entries(room.players || {});
  $("lobby-count").textContent = people.length;
  $("lobby-players").innerHTML = people.map(([id, p]) =>
    `<li data-host="${id === room.meta.host ? 1 : 0}">${escapeHtml(p.name)}${id === room.meta.host ? " · host" : ""}</li>`
  ).join("");
  buildChips();
  paintChips();
  show($("lobby-host-tools"), isHost);
  show($("lobby-wait"), !isHost);
}

function renderGame() {
  const song = currentSong();
  const res = myResult();
  const marksLen = res?.marks?.length ?? 0;
  // You're done for this clip if you already solved it, or you've used this level.
  const done = res?.solved != null || marksLen > level();

  $("game-round").textContent = `Track ${roundIdx() + 1} of ${playlist().length}`;
  const mine = scores().find(([id]) => id === me);
  $("game-score").textContent = `${mine ? mine[1].pts : 0} pts`;

  ensureCued(song);

  drawWave($("wave-bars"), song, res?.solved != null);
  drawTicks($("ticks"));
  drawMarks(res);

  drawHints($("hints"), song, hintCount());
  $("play-label").textContent = `Play ${clipLen()}s`;
  show($("btn-play"), !revealed());
  show($("audio-gate"), !primed && !revealed());
  if (revealed()) warmUpNext();

  const locked = done || revealed();
  show($("guess-area"), !locked);
  show($("guess-locked"), locked && !revealed());
  if (locked && !revealed()) {
    $("guess-locked").textContent = res?.solved != null
      ? "Nailed it. Waiting for the host to reveal."
      : "Guess is in. Waiting for the host to extend the clip.";
  }

  show($("reveal"), revealed());
  if (revealed() && song) {
    $("reveal-title").textContent = song.title;
    $("reveal-artist").textContent = song.artist;
  }

  show($("host-console"), isHost);
  if (isHost && song) {
    $("console-answer").textContent = `${song.title} — ${song.artist}`;
    const answered = Object.values(room.results?.[roundIdx()] || {})
      .filter(r => r.marks.length > level() || r.solved != null).length;
    const total = Object.keys(room.players || {}).length;
    $("console-tally").textContent = revealed()
      ? "Answer is on screen for everyone."
      : `${answered} of ${total} locked in · clip is ${clipLen()}s`;
    const stuck = solvedThisRound() === 0 && level() >= 2 && !revealed();
    if (stuck && hintCount() < hintsFor(song).length) {
      $("console-tally").textContent += " · nobody's close, try a hint";
    }
    $("btn-hint").disabled = revealed() || hintCount() >= hintsFor(song).length;
    $("btn-hint").textContent = hintCount() >= hintsFor(song).length
      ? "No hints left" : `Drop a hint (${hintCount()} of ${hintsFor(song).length})`;
    $("btn-extend").disabled = revealed() || level() >= CLIP_SECONDS.length - 1;
    show($("btn-reveal"), !revealed());
    show($("btn-next"), revealed());
    $("btn-next").textContent = roundIdx() + 1 >= playlist().length ? "Finish the set" : "Next track";
  }

  drawBoard($("board"));
}

function drawWave(bars, song, solved) {
  if (bars.dataset.song !== song?.youtubeId) {
    bars.dataset.song = song?.youtubeId || "";
    let seed = [...(song?.youtubeId || "x")].reduce((a, c) => a + c.charCodeAt(0), 0);
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    bars.innerHTML = Array.from({ length: BAR_COUNT }, () => {
      const h = 14 + Math.pow(rand(), 0.7) * 72;
      return `<span class="wave__bar" style="height:${h}%"></span>`;
    }).join("");
  }
  const litTo = clipLen() / MAX_SECONDS * BAR_COUNT;
  [...bars.children].forEach((bar, i) => {
    bar.classList.toggle("is-lit", i < litTo && !solved);
    bar.classList.toggle("is-solved", i < litTo && solved);
  });
}

function drawTicks(el) {
  if (el.childElementCount) {
    [...el.children].forEach((t, i) => t.classList.toggle("is-lit", CLIP_SECONDS[i] <= clipLen()));
    return;
  }
  let prev = 0;
  el.innerHTML = CLIP_SECONDS.map((s) => {
    const grow = s - prev; prev = s;
    return `<span class="tick" style="flex:${grow} 0 0">${s}s</span>`;
  }).join("");
}

function drawMarks(res) {
  const marks = res?.marks || "";
  const labels = { w: "miss", s: "skip", c: "got it" };
  $("marks").innerHTML = CLIP_SECONDS.map((s, i) => {
    const m = marks[i];
    const cls = m === "c" ? "mark--correct" : m === "w" ? "mark--wrong" : m === "s" ? "mark--skip" : "";
    return `<li class="mark ${cls}">${m ? labels[m] : s + "s"}</li>`;
  }).join("");
}

function drawBoard(el, final = false) {
  el.innerHTML = scores().map(([id, s], i) =>
    `<li class="${id === me ? "is-me" : ""}">
       <span class="rank">${i + 1}</span>
       <span class="who">${escapeHtml(s.name)}</span>
       <span class="pts">${s.pts}</span>
     </li>`).join("");
}

/* The shared screen. Shows pressure and progress, never the answer. */
function renderPresent() {
  const status = room.meta.status;
  const song = currentSong();
  const heads = Object.keys(room.players || {}).length;

  $("present-code").textContent = roomCode;
  drawBoard($("present-board"));

  if (status === "lobby") {
    $("present-stage").textContent = "Waiting to start";
    $("present-tally").textContent = heads === 1 ? "1 person here" : `${heads} people here`;
    const t = tallyVotes();
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])
      .slice(0, 4).map(([k, n]) => `${k} ×${n}`).join("   ");
    $("present-setlist").textContent =
      [top(t.eras), top(t.genres)].filter(Boolean).join("      ");
    $("present-hints").innerHTML = "";
    show($("present-deck"), false);
    show($("present-reveal"), false);
    show($("btn-present-play"), false);
    return;
  }

  if (status === "ended") {
    $("present-stage").textContent = "That's the set";
    $("present-tally").textContent = "";
    show($("present-deck"), false);
    show($("present-reveal"), false);
    show($("btn-present-play"), false);
    return;
  }

  ensureCued(song);
  $("present-stage").textContent = `Track ${roundIdx() + 1} of ${playlist().length}`;
  show($("present-deck"), true);
  show($("btn-present-play"), !revealed());
  $("present-play-label").textContent = `Play ${clipLen()}s out loud`;
  drawWave($("present-bars"), song, false);
  drawTicks($("present-ticks"));

  drawHints($("present-hints"), song, hintCount());
  const sl = room.setlist;
  $("present-setlist").textContent = sl
    ? [(sl.eras || []).join(" · "), (sl.genres || []).join(" · ")].filter(Boolean).join("      ")
    : "";
  if (revealed()) warmUpNext();

  const answered = Object.values(room.results?.[roundIdx()] || {})
    .filter(r => (r.marks?.length ?? 0) > level() || r.solved != null).length;
  $("present-tally").textContent = revealed()
    ? "" : `${answered} of ${heads} locked in · ${clipLen()} seconds unlocked`;

  show($("present-reveal"), revealed());
  if (revealed() && song) {
    $("present-title").textContent = song.title;
    $("present-artist").textContent = song.artist;
  }
}

function renderEnd() {
  drawBoard($("board-final"), true);
  $("share-grid").textContent = buildGrid();
}

function buildGrid() {
  const rows = playlist().map((_, r) => {
    const res = room.results?.[r]?.[me];
    const marks = res?.marks || "";
    let row = "";
    for (let i = 0; i < CLIP_SECONDS.length; i++) {
      row += marks[i] === "c" ? "🟩" : marks[i] === "w" ? "🟥" : marks[i] === "s" ? "🟨" : "⬜";
    }
    return `${String(r + 1).padStart(2)} ${row}`;
  });
  const mine = scores().find(([id]) => id === me);
  return `Sound Check · room ${roomCode}\n${rows.join("\n")}\n${mine ? mine[1].pts : 0} points`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ============================================================
   GUESSING
   ============================================================ */
async function submitMark(char) {
  const res = myResult();
  const marks = (res?.marks || "").padEnd(level(), "s").slice(0, level()) + char;
  await set(ref(db, `rooms/${roomCode}/results/${roundIdx()}/${me}`), {
    marks,
    solved: char === "c" ? level() : (res?.solved ?? null)
  });
}

async function lockGuess() {
  if (!selectedSong) return;
  const correct = selectedSong.youtubeId === currentSong()?.youtubeId;
  await submitMark(correct ? "c" : "w");
  clearGuessInput();
}

async function skip() {
  await submitMark("s");
  clearGuessInput();
}

function clearGuessInput() {
  $("input-guess").value = "";
  selectedSong = null;
  $("btn-guess").disabled = true;
  show($("suggestions"), false);
}

function renderSuggestions() {
  const q = normalize($("input-guess").value);
  const list = $("suggestions");
  if (!q) { show(list, false); return; }

  const hits = SONGS
    .filter(s => normalize(s.title).includes(q) || normalize(s.artist).includes(q))
    .slice(0, 8);

  if (!hits.length) { show(list, false); return; }
  activeSuggestion = -1;
  list.innerHTML = hits.map((s, i) =>
    `<li class="suggestion" data-i="${SONGS.indexOf(s)}">
       ${escapeHtml(s.title)}<span class="suggestion__artist">${escapeHtml(s.artist)}</span>
     </li>`).join("");
  show(list, true);
}

function chooseSuggestion(idx) {
  selectedSong = SONGS[idx];
  $("input-guess").value = `${selectedSong.title} — ${selectedSong.artist}`;
  $("btn-guess").disabled = false;
  show($("suggestions"), false);
}

/* ============================================================
   HOST ACTIONS
   ============================================================ */
const startGame = () => update(ref(db, `rooms/${roomCode}/meta`), { status: "playing" });
const extend    = () => update(ref(db, `rooms/${roomCode}/round`), { level: level() + 1 });
const reveal    = () => update(ref(db, `rooms/${roomCode}/round`), { revealed: true });

async function nextTrack() {
  if (roundIdx() + 1 >= playlist().length) {
    await update(ref(db, `rooms/${roomCode}/meta`), { status: "ended" });
  } else {
    await set(ref(db, `rooms/${roomCode}/round`), { i: roundIdx() + 1, level: 0, revealed: false });
  }
}

/* Cue every track and watch for embed failures — run this before the meeting. */
async function testTracks() {
  const log = $("test-results");
  show(log, true);
  log.innerHTML = songIssues.map(i => `<div class="bad">SKIPPED ${escapeHtml(i)}</div>`).join("")
    + `<div>Checking ${SONGS.length} tracks…</div>`;
  let bad = 0;

  for (const song of SONGS) {
    const ok = await new Promise((resolve) => {
      const timer = setTimeout(() => { cleanup(); resolve(true); }, 3500);
      const onErr = () => { clearTimeout(timer); cleanup(); resolve(false); };
      const cleanup = () => window.ytPlayer.removeEventListener("onError", onErr);
      window.ytPlayer.addEventListener("onError", onErr);
      window.ytPlayer.cueVideoById({ videoId: song.youtubeId });
    });
    if (!ok) bad++;
    log.insertAdjacentHTML("beforeend",
      `<div class="${ok ? "ok" : "bad"}">${ok ? "OK  " : "FAIL"} ${escapeHtml(song.title)}</div>`);
  }
  log.insertAdjacentHTML("beforeend",
    `<div>${bad ? `${bad} track(s) can't be embedded — swap them in songs.js.` : "Every track plays. You're set."}</div>`);
  cuedVideo = null;
}

/* ============================================================
   WIRING
   ============================================================ */
/* ============================================================
   STARTUP — read songs.csv before anything can be clicked
   ============================================================ */
function blockStart(msg) {
  $("btn-create").disabled = true;
  $("btn-join").disabled = true;
  const el = $("start-error");
  el.innerHTML = msg;
  show(el, true);
}

(async function boot() {
  $("btn-create").disabled = true;
  $("btn-join").disabled = true;

  /* --- the three things that actually stop people getting started --- */
  if (location.protocol === "file:") {
    return blockStart(
      "This page was opened straight from your computer, so the browser is blocking " +
      "part of it. Open it from your GitHub Pages address instead " +
      "(<code>https://yourname.github.io/sound-check/</code>).");
  }

  const cfg = JSON.stringify(firebaseConfig || {});
  if (!firebaseConfig || cfg.includes("PASTE")) {
    return blockStart(
      "<b>firebase-config.js still has the placeholder values in it.</b> " +
      "Copy the config from Firebase → Project settings → Your apps, paste it in, " +
      "and commit the change. See Part 3 of SETUP.md.");
  }
  if (!firebaseConfig.databaseURL) {
    return blockStart(
      "<b>Your Firebase config has no <code>databaseURL</code>.</b> That happens when the " +
      "web app was registered before the Realtime Database existed. Copy the URL from the top " +
      "of the database's Data tab and add it to firebase-config.js.");
  }
  if (initError) {
    return blockStart("<b>Firebase wouldn't start up.</b> " + escapeHtml(initError.message));
  }

  /* --- can we actually reach the database? ---
     Read a normal room path. Paths beginning with a dot (e.g. .info/...) are
     rejected by Firebase's path validator with "Invalid token in path", so we
     must not use one here. A miss on a non-existent room is a successful read. */
  try {
    await get(ref(db, "rooms/0000/meta"));
  } catch (err) {
    return blockStart(
      "<b>Couldn't reach your database.</b> Usually this means the security rules were " +
      "never published, or the database is Cloud Firestore rather than Realtime Database. " +
      "See Part 1 of SETUP.md.<br><br>" + escapeHtml(err.message));
  }

  const { songs, issues } = await loadSongs();
  SONGS = songs;
  songIssues = issues;
  ERAS   = [...new Set(SONGS.map(s => decade(s.year)).filter(Boolean))].sort();
  GENRES = [...new Set(SONGS.map(s => s.genre).filter(Boolean))].sort();

  $("btn-create").disabled = false;
  $("btn-join").disabled = false;

  if (issues.length) {
    console.warn("[Sound Check] songs.csv:", ...issues);
    const el = $("start-error");
    el.textContent = `${SONGS.length} tracks loaded. ${issues.length} row(s) skipped — see "Test every track" in the lobby.`;
    show(el, true);
  }
})();

on("btn-create", "click", createRoom);
on("btn-join", "click", joinRoom);
// The code boxes act as a toggle for the keypad.
function setKeypad(open) {
  show($("keypad"), open);
  $("code-slots").setAttribute("aria-expanded", open ? "true" : "false");
  $("code-slots").classList.toggle("is-active", open);
}
$("code-slots").addEventListener("click", () => {
  setKeypad($("keypad").hidden);   // tap toggles it
});

// Keypad drives the code field. Digits only, max 4.
document.querySelectorAll("[data-key]").forEach(btn => {
  btn.addEventListener("click", () => {
    const el = $("input-code");
    const k = btn.dataset.key;
    if (k === "del") el.value = el.value.slice(0, -1);
    else if (el.value.length < CODE_LENGTH) el.value += k;
    renderKeypadDisplay();
  });
});
function renderKeypadDisplay() {
  const v = $("input-code").value;
  const slots = $("code-slots");
  if (slots) [...slots.children].forEach((s, i) => {
    s.textContent = v[i] || "";
    s.classList.toggle("is-filled", !!v[i]);
  });
}
on("btn-copy-code", "click", () => navigator.clipboard.writeText(roomCode));
on("btn-start-game", "click", startGame);
on("btn-test-tracks", "click", testTracks);

on("btn-play", "click", async () => {
  await primeAudio();
  if (playing) stopClip(); else playClip(clipLen());
});

on("btn-guess", "click", lockGuess);
on("btn-skip", "click", skip);
on("input-guess", "input", () => { selectedSong = null; $("btn-guess").disabled = true; renderSuggestions(); });

on("input-guess", "keydown", (e) => {
  const items = [...$("suggestions").children];
  if (!items.length || $("suggestions").hidden) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    activeSuggestion = (activeSuggestion + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items.forEach((li, i) => li.classList.toggle("is-active", i === activeSuggestion));
  } else if (e.key === "Enter" && activeSuggestion >= 0) {
    e.preventDefault();
    chooseSuggestion(+items[activeSuggestion].dataset.i);
  } else if (e.key === "Escape") {
    show($("suggestions"), false);
  }
});

$("suggestions").addEventListener("click", (e) => {
  const li = e.target.closest(".suggestion");
  if (li) chooseSuggestion(+li.dataset.i);
});

on("btn-build", "click", buildSetList);
on("btn-hint", "click", dropHint);
document.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (chip) toggleChip(chip.dataset.kind, chip.dataset.v);
});
on("btn-extend", "click", extend);
on("btn-reveal", "click", reveal);
on("btn-next", "click", nextTrack);
on("btn-copy-grid", "click", () => navigator.clipboard.writeText(buildGrid()));

const presentUrl = () => `${location.origin}${location.pathname}?present=${roomCode}`;
const openPresent = () => window.open(presentUrl(), "_blank", "noopener");
on("btn-present", "click", openPresent);
on("btn-present-2", "click", openPresent);
on("btn-present-play", "click", async () => {
  await primeAudio();
  if (playing) stopClip(); else playClip(clipLen());
});

/* Presenter screens open with ?present=CODE and never join as a player. */
const presentParam = (new URLSearchParams(location.search).get("present") || "").trim();
if (/^\d{4}$/.test(presentParam)) {
  presentMode = true;
  roomCode = presentParam;
  attach(false);
}

/* Space bar replays the clip, as long as you're not typing. */
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && e.target.tagName !== "INPUT") {
    e.preventDefault();
    $("btn-play").click();
  }
});

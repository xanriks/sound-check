/* ============================================================
   SONG LOADING

   The real song list lives in songs.csv, next to this file.
   You almost certainly do not need to edit this file at all.

   Why CSV: a JavaScript file is one missing comma away from a
   blank page with no error message. A CSV can't break the app,
   opens in Google Sheets or Excel, and sorts and de-duplicates
   the way you'd expect.

   COLUMNS (the header row must stay exactly as it is)
     title      shown at reveal, and in everyone's autocomplete
     artist     same
     youtubeId  the ID, or paste the whole YouTube URL — either
                works, this file pulls the ID out for you
     year       release year. Drives the era vote and hint 1.
     genre      reuse the same spellings; each distinct value
                becomes a vote chip
     pickedBy   who submitted it. Used as hint 3, and it's the
                best column in the file for team building.
     start      second the clip begins at. 0 is the classic feel.

   Commas inside a title are fine as long as the field is
   wrapped in "double quotes" — spreadsheets do this for you.

   If songs.csv is missing or empty, the app falls back to the
   short list at the bottom of this file so it still runs.
   ============================================================ */

/* Accepts a bare ID, a watch URL, a youtu.be link, or an embed URL. */
export function extractId(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const m = s.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : "";
}

/* Minimal RFC-4180 parser: handles quoted fields, escaped quotes, CRLF. */
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

function fromCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { songs: [], issues: [] };

  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = (name) => head.indexOf(name);
  const iTitle = col("title"), iArtist = col("artist"), iId = col("youtubeid");

  if (iTitle < 0 || iArtist < 0 || iId < 0) {
    return { songs: [], issues: ["The header row needs at least title, artist and youtubeId."] };
  }

  const iYear = col("year"), iGenre = col("genre"),
        iBy = col("pickedby"), iStart = col("start");

  const songs = [], issues = [];
  rows.slice(1).forEach((r, n) => {
    const get = (i) => (i >= 0 ? (r[i] || "").trim() : "");
    const title = get(iTitle), artist = get(iArtist);
    const youtubeId = extractId(get(iId));

    if (!title || !artist) { issues.push(`Row ${n + 2}: missing a title or artist.`); return; }
    if (!youtubeId) { issues.push(`Row ${n + 2}: ${title} — no YouTube ID yet.`); return; }

    songs.push({
      title, artist, youtubeId,
      year:  parseInt(get(iYear), 10) || null,
      genre: get(iGenre) || null,
      pickedBy: get(iBy) || null,
      start: parseInt(get(iStart), 10) || 0
    });
  });

  return { songs, issues };
}

export async function loadSongs() {
  try {
    const res = await fetch("songs.csv", { cache: "no-store" });
    if (res.ok) {
      const out = fromCSV(await res.text());
      if (out.songs.length) return out;
      return { songs: FALLBACK, issues: [...out.issues, "Using the built-in list instead."] };
    }
  } catch (err) {
    /* no CSV published, or the fetch was blocked — fall through */
  }
  return { songs: FALLBACK, issues: ["songs.csv wasn't found. Using the built-in list."] };
}

const FALLBACK = [
  { title: "Never Gonna Give You Up", artist: "Rick Astley",
    youtubeId: "dQw4w9WgXcQ", year: 1987, genre: "Pop", pickedBy: null, start: 0 }
];

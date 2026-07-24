/* ============================================================
   THE SONG LIST — the only file you edit each week.

   FIELDS
     title      shown at reveal, and in everyone's autocomplete
     artist     same
     youtubeId  the characters after "v=" in the watch URL
                https://www.youtube.com/watch?v=dQw4w9WgXcQ
                                                ^^^^^^^^^^^
     year       release year. Drives the era filter and the first hint.
     genre      free text, but REUSE THE SAME SPELLINGS. Every distinct
                value becomes a filter chip, so "Hip-Hop" and "hip hop"
                would appear as two separate options.
     pickedBy   who on the team submitted it. Used as a late hint, and
                it's the single best thing in this file for team building.
     start      which second the clip begins at. 0 is the classic feel.
                Set it to the chorus to make a famous intro less obvious.

   PICKING TRACKS THAT ACTUALLY LAND
     The game is fun when roughly half the room could get it by the 7
     second clip. Too obscure and everyone waits for the reveal; too
     obvious and it's over in one second. Aim for "I know this, I know
     this, what IS this" — a song that was everywhere for one month
     eight years ago beats both an all-time classic and a deep cut.

     Prefer topic channels and audio-only uploads over official music
     videos. Fewer ads, and less likely to block embedding.

   Before the meeting, start a room and hit "Test every track" — some
   uploads block embedding and will otherwise fail silently mid-session.
   ============================================================ */

export const SONGS = [
  {
    title: "Never Gonna Give You Up",
    artist: "Rick Astley",
    youtubeId: "dQw4w9WgXcQ",
    year: 1987,
    genre: "Pop",
    pickedBy: "Sam",
    start: 0
  },

  /* ---- replace everything below with your team's picks ---- */
  {
    title: "PASTE A TITLE",
    artist: "Paste the artist",
    youtubeId: "PASTE_ID_HERE",
    year: 1994,
    genre: "Rock",
    pickedBy: "",
    start: 0
  },
  {
    title: "PASTE A TITLE",
    artist: "Paste the artist",
    youtubeId: "PASTE_ID_HERE",
    year: 2016,
    genre: "Hip-Hop",
    pickedBy: "",
    start: 0
  },
];

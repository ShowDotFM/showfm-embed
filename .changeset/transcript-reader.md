---
'@showfm/embed': minor
---

Add the transcript reader: `transcript="reader"` makes the player's Transcript button open the follow-along transcript full screen, in a modal dialog with the same player pinned on top, search, and each speaker's photo or initials beside their lines (`speaker-photos="off"` shows initials only). `openTranscript()` opens it from a page's own button, and `showfm:transcript-close` says when it has closed. The episode payload's `people` can now carry `photo_url`. `v1.js`'s size budget moves from 30 kB to 31 kB to hold the reader's hooks.

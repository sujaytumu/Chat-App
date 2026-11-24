// Only ONE preview sound at a time. Whatever starts playing (a ringtone check, a message tone check, a status song
// preview, the song trimmer, the playlist) first stops whatever was playing before it, so sounds never pile up.
//
//   takeAudio(owner, stop)  - call right before starting to play; `stop` silences this owner later
//   releaseAudio(owner)     - call when the owner stops by itself / goes away
let current = null; // { owner, stop }

export function takeAudio(owner, stop) {
  const prev = current;
  current = { owner, stop };
  if (prev && prev.owner !== owner) {
    try { prev.stop(); } catch { /* already gone */ }
  }
}

export function releaseAudio(owner) {
  if (current && current.owner === owner) current = null;
}

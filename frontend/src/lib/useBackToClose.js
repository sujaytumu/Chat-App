import { useEffect, useRef } from "react";

// Makes the phone's system Back button (and the browser's Back) close the
// screen you're looking at — an open chat, the Archived folder, in-chat search,
// the image viewer — instead of leaving the whole site/app.
//
// The app is a single page, so opening a chat doesn't add a browser-history
// entry on its own; Back therefore jumped to whatever you had open before
// Talkies. While a "screen" is open we add one history entry for it. Back
// removes that entry, which we turn into "close it". Closing it from the UI
// (the arrow, ✕, archiving...) removes the entry again so history stays tidy.
//
// Several can be open at once (chat → search → image); Back closes the newest.
//
//   useBackToClose(isOpen, () => close());

const trail = []; // every history entry we've added, oldest → newest
let nextToken = 1;
let suppress = 0; // popstate events we caused ourselves and must ignore
let listening = false;
let flushScheduled = false;

function onPop() {
  if (suppress > 0) {
    suppress--;
    return;
  }
  // The browser went back one entry: that was the newest screen still open.
  for (let i = trail.length - 1; i >= 0; i--) {
    const entry = trail[i];
    if (entry.gone) continue;
    trail.splice(i, 1);
    entry.closedByBack = true;
    entry.onClose();
    return;
  }
}

// Screens closed from the UI leave their history entry behind; remove them in
// one step (after the current batch of state updates, so closing a chat that
// has search open doesn't go back twice per screen).
function flush() {
  flushScheduled = false;
  let count = 0;
  let topToken = null;
  while (trail.length && trail[trail.length - 1].gone) {
    const entry = trail.pop();
    if (topToken === null) topToken = entry.token;
    count++;
  }
  // Closed out of order: drop the bookkeeping (their entries are harmless).
  for (let i = trail.length - 1; i >= 0; i--) if (trail[i].gone) trail.splice(i, 1);

  // Only rewind if we're still on that entry — if the person already navigated
  // somewhere else (another tab, another page) going back would be wrong.
  if (count > 0 && window.history.state?.__backClose === topToken) {
    suppress++;
    window.history.go(-count);
  }
}

export function useBackToClose(isOpen, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const entry = { token: nextToken++, gone: false, closedByBack: false, onClose: () => closeRef.current?.() };
    // Keep the router's own state on the entry so React Router sees the same location.
    window.history.pushState({ ...(window.history.state || {}), __backClose: entry.token }, "");
    trail.push(entry);
    if (!listening) {
      window.addEventListener("popstate", onPop);
      listening = true;
    }

    return () => {
      if (entry.closedByBack) return; // Back already removed its entry
      entry.gone = true;
      if (!flushScheduled) {
        flushScheduled = true;
        setTimeout(flush, 0);
      }
    };
  }, [isOpen]);
}

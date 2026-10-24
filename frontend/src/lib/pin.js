// A pin can have a time limit (8 hours / 24 hours / 7 days). Once it runs out the message is simply no longer pinned.
export const isPinned = (m) => !!m?.pinned && (!m.pinUntil || new Date(m.pinUntil).getTime() > Date.now());

// Make call voice clear and steady: give the outgoing voice a fixed, healthy
// bitrate and top priority so it wins over video / other traffic on weak networks.
export async function tuneAudioSenders(pc, maxBitrate = 40000) {
  try {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== "audio") continue;
      const p = sender.getParameters();
      if (!p.encodings?.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = maxBitrate;
      p.encodings[0].priority = "high";
      p.encodings[0].networkPriority = "high";
      await sender.setParameters(p);
    }
  } catch {
    /* not supported — default encoding is fine */
  }
}

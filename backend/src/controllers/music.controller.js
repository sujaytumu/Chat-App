// Song search for status music. Uses Apple's free iTunes Search API (30-second previews, album art);
// the audio is fetched through the server so the browser never hits a CORS wall.
const cache = new Map(); // query -> { at, items }
const CACHE_MS = 10 * 60 * 1000;
const ALLOWED_AUDIO_HOSTS = [/\.mzstatic\.com$/i, /^audio-ssl\.itunes\.apple\.com$/i];

export const searchSongs = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 80);
    if (!q) return res.json([]);
    const key = q.toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return res.json(hit.items);

    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=30&country=IN`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return res.status(502).json({ error: "Song search is unavailable right now" });
    const j = await r.json();
    const items = (j.results || [])
      .filter((s) => s.previewUrl && s.trackName)
      .map((s) => ({
        id: String(s.trackId),
        title: s.trackName,
        artist: s.artistName || "",
        art: (s.artworkUrl100 || "").replace("100x100", "200x200"),
        preview: s.previewUrl,
        seconds: 30,
      }));
    if (cache.size > 200) cache.clear();
    cache.set(key, { at: Date.now(), items });
    res.json(items);
  } catch (error) {
    console.log("Error in searchSongs:", error.message);
    res.status(502).json({ error: "Song search is unavailable right now" });
  }
};

export const songAudio = async (req, res) => {
  try {
    const target = new URL(String(req.query.url || ""));
    if (target.protocol !== "https:" || !ALLOWED_AUDIO_HOSTS.some((re) => re.test(target.hostname))) {
      return res.status(400).json({ error: "Not a supported song link" });
    }
    const r = await fetch(target, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return res.status(502).json({ error: "Couldn't load that song" });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) return res.status(413).json({ error: "That song is too large" });
    res.set("Content-Type", r.headers.get("content-type") || "audio/mp4");
    res.set("Cache-Control", "private, max-age=3600");
    res.send(buf);
  } catch (error) {
    console.log("Error in songAudio:", error.message);
    res.status(502).json({ error: "Couldn't load that song" });
  }
};

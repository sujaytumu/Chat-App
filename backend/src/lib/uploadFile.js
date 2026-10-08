import cloudinary from "./cloudinary.js";

// Rough per-payload cap on the base64 string length (comfortably under the
// 15mb JSON body limit once you account for base64's ~33% overhead).
export const MAX_BASE64_LENGTH = 14 * 1024 * 1024;

export function categorizeMime(mimeType = "") {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

// Uploads a non-image attachment (video/audio/document) to Cloudinary and
// returns the fields we store on the message.
export async function uploadFileAttachment({ data, name, mimeType, size, duration, waveform }) {
  const category = categorizeMime(mimeType);
  const resourceType = category === "document" ? "raw" : "video"; // Cloudinary treats audio under "video"

  const uploadResponse = await cloudinary.uploader.upload(data, {
    folder: "chat-app/files",
    resource_type: resourceType,
    use_filename: true,
    filename_override: name,
  });

  const result = {
    url: uploadResponse.secure_url,
    name: name || "file",
    size: size || uploadResponse.bytes || 0,
    type: category,
  };

  // Voice notes: length (seconds) + a small loudness profile for the waveform.
  // Browser-recorded webm has no reliable length of its own, so prefer what the
  // recorder measured, then what Cloudinary found. Everything is sanitised —
  // it comes from the client.
  if (category === "audio") {
    const secs = Number(duration) || Number(uploadResponse.duration) || 0;
    if (secs > 0 && secs < 4 * 3600) result.duration = Math.round(secs * 10) / 10;
    if (Array.isArray(waveform)) {
      const bars = waveform.slice(0, 64).map((v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0))));
      if (bars.length >= 8) result.waveform = bars;
    }
  }
  return result;
}

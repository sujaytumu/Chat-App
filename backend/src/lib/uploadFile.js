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
export async function uploadFileAttachment({ data, name, mimeType, size }) {
  const category = categorizeMime(mimeType);
  const resourceType = category === "document" ? "raw" : "video"; // Cloudinary treats audio under "video"

  const uploadResponse = await cloudinary.uploader.upload(data, {
    folder: "chat-app/files",
    resource_type: resourceType,
    use_filename: true,
    filename_override: name,
  });

  return {
    url: uploadResponse.secure_url,
    name: name || "file",
    size: size || uploadResponse.bytes || 0,
    type: category,
  };
}

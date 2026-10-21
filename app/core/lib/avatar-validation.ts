export const MAX_AVATAR_BYTES = 1024 * 1024;

const imageSignatures: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/png": (bytes) =>
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (byte, index) => bytes[index] === byte,
    ),
  "image/jpeg": (bytes) =>
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/gif": (bytes) => {
    const header = String.fromCharCode(...bytes.subarray(0, 6));
    return header === "GIF87a" || header === "GIF89a";
  },
  "image/webp": (bytes) =>
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP",
};

/** Reject active image formats and files whose actual bytes disagree with the MIME. */
export async function getAvatarValidationError(
  file: File,
  maxBytes = MAX_AVATAR_BYTES,
): Promise<string | null> {
  // An empty file field means the user is keeping their current avatar.
  if (file.size === 0) return null;
  if (file.size > maxBytes)
    return `Avatar must be ${maxBytes / (1024 * 1024)}MB or smaller`;

  const checkSignature = Object.hasOwn(imageSignatures, file.type)
    ? imageSignatures[file.type]
    : undefined;
  if (!checkSignature) return "Avatar must be a PNG, JPEG, GIF, or WebP image";

  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return checkSignature(bytes)
    ? null
    : "Avatar content does not match its image type";
}

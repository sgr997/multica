/**
 * Pure helpers behind the shared message composer's attachment gate.
 *
 * The composer itself can't be unit-tested here (vitest runs in a Node
 * environment with no RN renderer), so the send/upload rules live in this
 * module and the component only wires them to state.
 */

export type ComposerAttachmentStatus = "uploading" | "completed" | "failed";

export interface ComposerAttachmentLike {
  status: ComposerAttachmentStatus;
  /** Server id, only present once the upload completed. */
  id?: string;
}

export function hasFailedAttachment(
  attachments: readonly ComposerAttachmentLike[],
): boolean {
  return attachments.some((a) => a.status === "failed");
}

export function hasInFlightUpload(
  attachments: readonly ComposerAttachmentLike[],
): boolean {
  return attachments.some((a) => a.status === "uploading");
}

/** Only completed uploads with a non-empty server id may be sent. An empty
 *  id means the server accepted the bytes but the client lost the binding —
 *  sending it would produce a message with no attachment. */
export function completedAttachmentIds(
  attachments: readonly ComposerAttachmentLike[],
): string[] {
  return attachments
    .filter(
      (a): a is ComposerAttachmentLike & { id: string } =>
        a.status === "completed" &&
        typeof a.id === "string" &&
        a.id.trim().length > 0,
    )
    .map((a) => a.id);
}

export interface SendGateInput {
  text: string;
  mentionCount: number;
  attachments: readonly ComposerAttachmentLike[];
  disabled?: boolean;
  isSending?: boolean;
  allowSubmitWhileRunning?: boolean;
  submitting?: boolean;
}

/**
 * Whether the send button may fire.
 *
 * A failed upload blocks the send outright: the previous behaviour let the
 * user post a text-only message after silently dropping the image. Any
 * message must carry text, a mention, or at least one completed attachment.
 */
export function canSendMessage({
  text,
  mentionCount,
  attachments,
  disabled = false,
  isSending = false,
  allowSubmitWhileRunning = false,
  submitting = false,
}: SendGateInput): boolean {
  if (disabled || submitting) return false;
  if (isSending && !allowSubmitWhileRunning) return false;
  if (hasInFlightUpload(attachments) || hasFailedAttachment(attachments)) {
    return false;
  }
  return (
    text.trim().length > 0 ||
    mentionCount > 0 ||
    completedAttachmentIds(attachments).length > 0
  );
}

/**
 * Chat and comment endpoints both reject an empty `content`, even when
 * attachments are present. Send a single space for an attachment-only
 * message so the image can travel; the bubble renders it as blank text next
 * to the attachment card.
 */
export function resolveSubmitContent(
  content: string,
  attachmentIds: readonly string[],
): string {
  if (content.length > 0) return content;
  return attachmentIds.length > 0 ? " " : content;
}

export interface PickedImageMeta {
  name: string;
  type: string;
  /** True when the bytes must be re-encoded to JPEG before upload. */
  needsJpegConversion: boolean;
}

const HEIC_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);
const HEIC_EXTENSIONS = [".heic", ".heif"];
const IMAGE_TYPES_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

function lowerExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function jpegName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.jpg`;
}

/**
 * iOS photo-library picks are commonly HEIC/HEIF, which the server sniffs as
 * `application/octet-stream` (Go's detector doesn't know HEIC) and renders as
 * a broken image. Normalise those to JPEG metadata; the caller re-encodes the
 * bytes with expo-image-manipulator (quality 0.9).
 *
 * Detection is deliberately case-insensitive and checks BOTH the MIME type
 * and the file extension: pickers have returned `.HEIC` names with an empty
 * or generic MIME type, and vice versa.
 */
export function planImageUpload(asset: {
  name: string;
  type?: string | null;
}): PickedImageMeta {
  const type = (asset.type ?? "").trim().toLowerCase();
  const name = asset.name.trim();
  const extension = lowerExtension(name);
  const isHeic =
    HEIC_MIME_TYPES.has(type) || HEIC_EXTENSIONS.includes(extension);

  if (isHeic) {
    return {
      name: jpegName(name || "image"),
      type: "image/jpeg",
      needsJpegConversion: true,
    };
  }

  const inferredType =
    type && type !== "application/octet-stream"
      ? type
      : (IMAGE_TYPES_BY_EXTENSION[extension] ?? "image/jpeg");

  return {
    name,
    type: inferredType,
    needsJpegConversion: false,
  };
}

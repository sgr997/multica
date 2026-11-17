import { describe, expect, it } from "vitest";
import {
  canSendMessage,
  completedAttachmentIds,
  planImageUpload,
  resolveSubmitContent,
  type ComposerAttachmentLike,
} from "./composer-attachments";

function att(
  over: Partial<ComposerAttachmentLike> = {},
): ComposerAttachmentLike {
  return { status: "completed", id: "att-1", ...over };
}

describe("canSendMessage", () => {
  it("blocks a send while an attachment upload failed", () => {
    expect(
      canSendMessage({
        text: "hello",
        mentionCount: 0,
        attachments: [att({ status: "failed" })],
      }),
    ).toBe(false);
  });

  it("blocks a send while an attachment is still uploading", () => {
    expect(
      canSendMessage({
        text: "hello",
        mentionCount: 0,
        attachments: [att({ status: "uploading", id: undefined })],
      }),
    ).toBe(false);
  });

  it("allows an image-only message when the upload completed", () => {
    expect(
      canSendMessage({
        text: "",
        mentionCount: 0,
        attachments: [att()],
      }),
    ).toBe(true);
  });

  it("allows a mention-only message", () => {
    expect(
      canSendMessage({ text: "  ", mentionCount: 1, attachments: [] }),
    ).toBe(true);
  });

  it("refuses a message with no text, mentions or attachments", () => {
    expect(
      canSendMessage({ text: "", mentionCount: 0, attachments: [] }),
    ).toBe(false);
  });

  it("does not count a completed attachment without a server id", () => {
    expect(
      canSendMessage({
        text: "",
        mentionCount: 0,
        attachments: [att({ id: undefined })],
      }),
    ).toBe(false);
  });

  it("honours the disabled / sending / submitting gates", () => {
    const base = { text: "hi", mentionCount: 0, attachments: [] };
    expect(canSendMessage({ ...base, disabled: true })).toBe(false);
    expect(canSendMessage({ ...base, submitting: true })).toBe(false);
    expect(canSendMessage({ ...base, isSending: true })).toBe(false);
    expect(
      canSendMessage({ ...base, isSending: true, allowSubmitWhileRunning: true }),
    ).toBe(true);
  });
});

describe("completedAttachmentIds", () => {
  it("returns only completed ids and drops empty ids", () => {
    expect(
      completedAttachmentIds([
        att({ id: "a" }),
        att({ id: "b", status: "failed" }),
        att({ id: "c", status: "uploading" }),
        att({ id: "" }),
        att({ id: undefined }),
      ]),
    ).toEqual(["a"]);
  });
});

describe("resolveSubmitContent", () => {
  it("keeps typed text unchanged", () => {
    expect(resolveSubmitContent("hi", ["a"])).toBe("hi");
  });

  it("substitutes a space for an attachment-only message", () => {
    expect(resolveSubmitContent("", ["a"])).toBe(" ");
  });

  it("stays empty when there is nothing to send", () => {
    expect(resolveSubmitContent("", [])).toBe("");
  });
});

describe("planImageUpload", () => {
  it("converts image/heic with an uppercase .HEIC name to JPEG", () => {
    expect(
      planImageUpload({ name: "IMG_0001.HEIC", type: "image/heic" }),
    ).toEqual({
      name: "IMG_0001.jpg",
      type: "image/jpeg",
      needsJpegConversion: true,
    });
  });

  it("converts image/heif", () => {
    expect(
      planImageUpload({ name: "photo.heif", type: "image/heif" }),
    ).toEqual({
      name: "photo.jpg",
      type: "image/jpeg",
      needsJpegConversion: true,
    });
  });

  it("detects HEIC from the extension when the MIME type is generic", () => {
    expect(
      planImageUpload({ name: "IMG_42.HeIc", type: "application/octet-stream" }),
    ).toEqual({
      name: "IMG_42.jpg",
      type: "image/jpeg",
      needsJpegConversion: true,
    });
  });

  it("detects HEIC from an uppercase MIME type", () => {
    expect(
      planImageUpload({ name: "image", type: "IMAGE/HEIC" }),
    ).toEqual({
      name: "image.jpg",
      type: "image/jpeg",
      needsJpegConversion: true,
    });
  });

  it("leaves JPEG picks untouched", () => {
    expect(
      planImageUpload({ name: "photo.JPG", type: "image/jpeg" }),
    ).toEqual({
      name: "photo.JPG",
      type: "image/jpeg",
      needsJpegConversion: false,
    });
  });

  it("infers the MIME type from the extension when it is missing", () => {
    expect(planImageUpload({ name: "photo.png" })).toEqual({
      name: "photo.png",
      type: "image/png",
      needsJpegConversion: false,
    });
  });

  it("infers the MIME type when the picker reports application/octet-stream", () => {
    expect(
      planImageUpload({ name: "photo.webp", type: "application/octet-stream" }),
    ).toEqual({
      name: "photo.webp",
      type: "image/webp",
      needsJpegConversion: false,
    });
  });
});

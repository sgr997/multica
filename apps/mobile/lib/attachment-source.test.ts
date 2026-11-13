// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Attachment } from "@multica/core/types";

// The real client throws at module load without EXPO_PUBLIC_API_URL, and the
// native fetch chain has no business in a unit test.
vi.mock("@/data/api", () => ({ api: { getAttachment: vi.fn() } }));

import { api } from "@/data/api";
import {
  ATTACHMENT_CAPABILITY_TTL_MS,
  __clearAttachmentCapabilityCache,
  attachmentAspectRatio,
  authGatedAttachmentId,
  resolveAttachmentFetchUrl,
} from "./attachment-source";

const ID = "123e4567-e89b-12d3-a456-426614174000";
const GATED = `/api/attachments/${ID}/download`;
const CAPABILITY = `/api/attachments/${ID}/signed-download?exp=99&sig=abc`;

const getAttachment = vi.mocked(api.getAttachment);

function attachment(downloadUrl: string): Attachment {
  return { id: ID, download_url: downloadUrl } as Attachment;
}

beforeEach(() => {
  getAttachment.mockReset();
  __clearAttachmentCapabilityCache();
});

describe("authGatedAttachmentId", () => {
  it("recognises the stable download path in every form the server emits", () => {
    expect(authGatedAttachmentId(GATED)).toBe(ID);
    expect(
      authGatedAttachmentId(`https://multica.example.test${GATED}?v=1#top`),
    ).toBe(ID);
  });

  it("ignores capability, CDN and external URLs", () => {
    expect(authGatedAttachmentId(CAPABILITY)).toBeUndefined();
    expect(
      authGatedAttachmentId("https://cdn.example.test/a.png?Signature=x"),
    ).toBeUndefined();
    expect(authGatedAttachmentId(null)).toBeUndefined();
    expect(authGatedAttachmentId("")).toBeUndefined();
  });
});

describe("resolveAttachmentFetchUrl", () => {
  it("passes external URLs through without fetching metadata", async () => {
    await expect(
      resolveAttachmentFetchUrl("https://cdn.example.test/a.png"),
    ).resolves.toBe("https://cdn.example.test/a.png");
    expect(getAttachment).not.toHaveBeenCalled();
  });

  it("mints a capability once and reuses it inside the TTL", async () => {
    getAttachment.mockResolvedValue(attachment(CAPABILITY));

    await expect(resolveAttachmentFetchUrl(GATED, 1_000)).resolves.toBe(
      CAPABILITY,
    );
    await expect(
      resolveAttachmentFetchUrl(GATED, 1_000 + ATTACHMENT_CAPABILITY_TTL_MS - 1),
    ).resolves.toBe(CAPABILITY);
    expect(getAttachment).toHaveBeenCalledTimes(1);
    expect(getAttachment).toHaveBeenCalledWith(ID);
  });

  it("mints again once the capability would be near expiry", async () => {
    getAttachment.mockResolvedValue(attachment(CAPABILITY));

    await resolveAttachmentFetchUrl(GATED, 1_000);
    await resolveAttachmentFetchUrl(GATED, 1_000 + ATTACHMENT_CAPABILITY_TTL_MS);
    expect(getAttachment).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight metadata request between concurrent renders", async () => {
    let settle: ((value: Attachment) => void) | undefined;
    getAttachment.mockReturnValue(
      new Promise<Attachment>((resolve) => {
        settle = resolve;
      }),
    );

    const first = resolveAttachmentFetchUrl(GATED, 1_000);
    const second = resolveAttachmentFetchUrl(GATED, 1_000);
    settle?.(attachment(CAPABILITY));

    await expect(first).resolves.toBe(CAPABILITY);
    await expect(second).resolves.toBe(CAPABILITY);
    expect(getAttachment).toHaveBeenCalledTimes(1);
  });

  it("falls back to the stable path when the server cannot mint one", async () => {
    // Older server: answered with the same gated path. Caching it would only
    // add a round trip to every later render.
    getAttachment.mockResolvedValue(attachment(GATED));

    await expect(resolveAttachmentFetchUrl(GATED, 1_000)).resolves.toBe(GATED);
    await expect(resolveAttachmentFetchUrl(GATED, 1_001)).resolves.toBe(GATED);
    expect(getAttachment).toHaveBeenCalledTimes(2);
  });

  it("never throws when the metadata request fails", async () => {
    getAttachment.mockRejectedValue(new Error("401"));
    await expect(resolveAttachmentFetchUrl(GATED)).resolves.toBe(GATED);
  });
});

describe("attachmentAspectRatio", () => {
  it("uses server-recorded dimensions and rejects missing or zero sizes", () => {
    expect(
      attachmentAspectRatio({ width: 1600, height: 900 } as Attachment),
    ).toBeCloseTo(16 / 9);
    expect(attachmentAspectRatio({ width: 0, height: 900 } as Attachment)).toBeNull();
    expect(attachmentAspectRatio({} as Attachment)).toBeNull();
    expect(attachmentAspectRatio(null)).toBeNull();
  });
});

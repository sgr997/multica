/**
 * Turn an attachment URL into something a native image loader can actually
 * fetch.
 *
 * On a self-hosted deployment with local-disk / proxy storage, list
 * responses carry the *stable, auth-gated* path
 * `/api/attachments/{id}/download`. Web and desktop are fine with it — the
 * browser carries the session cookie, and desktop re-signs through its own
 * client. A native image request carries no credentials at all, so
 * `expo-image` / `react-native-image-viewing` receive a 401 and the bubble
 * collapses to the 16:9 placeholder.
 *
 * The single-attachment endpoint (`GET /api/attachments/{id}`) is the
 * documented way out (MUL-5292): it verifies membership once and returns a
 * 60-second capability URL in `download_url` that needs no credentials.
 * Mint one per render, cache it just short of its TTL, and hand that to the
 * image APIs. Non-attachment URLs (CDN links, external https) pass through
 * untouched.
 */
import type { Attachment } from "@multica/core/types";
import { api } from "@/data/api";
import { resolveAttachmentUrl } from "./attachment-url";

const AUTH_GATED_PATH =
  /^\/api\/attachments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/download$/i;

/** Capabilities live 60s server-side. Stop trusting them early so an image
 *  decoded at the boundary cannot race the expiry. */
export const ATTACHMENT_CAPABILITY_TTL_MS = 45_000;

interface CacheEntry {
  url: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
/** Concurrent renders of the same image share one metadata request. */
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Attachment id when `rawUrl` is the credential-requiring stable download
 * path (relative or absolute, query/fragment tolerated). `undefined` for
 * everything else, including the already-signed `signed-download` route.
 */
export function authGatedAttachmentId(
  rawUrl: string | null | undefined,
): string | undefined {
  if (!rawUrl) return undefined;
  let path = rawUrl.split("?")[0].split("#")[0];
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return undefined;
    }
  }
  return AUTH_GATED_PATH.exec(path)?.[1];
}

/**
 * Absolute URL an image loader (or Safari, for file cards) can open without
 * an Authorization header.
 *
 * Never throws: on any failure the plain resolved URL is returned, which at
 * worst reproduces the previous behaviour for that one render.
 */
export async function resolveAttachmentFetchUrl(
  rawUrl: string | null | undefined,
  now: number = Date.now(),
): Promise<string | null> {
  const fallback = resolveAttachmentUrl(rawUrl) ?? rawUrl ?? null;
  const id = authGatedAttachmentId(rawUrl);
  if (!id || !fallback) return fallback;

  const cached = cache.get(id);
  if (cached && cached.expiresAt > now) return cached.url;

  const pending = inFlight.get(id);
  if (pending) return pending;

  const request = (async () => {
    try {
      const attachment = await api.getAttachment(id);
      const capability =
        resolveAttachmentUrl(attachment.download_url) ?? fallback;
      // A server that cannot mint a capability answers with the same gated
      // path; caching it would only add latency for every later render.
      if (authGatedAttachmentId(capability)) return fallback;
      cache.set(id, {
        url: capability,
        expiresAt: now + ATTACHMENT_CAPABILITY_TTL_MS,
      });
      return capability;
    } catch {
      return fallback;
    } finally {
      inFlight.delete(id);
    }
  })();
  inFlight.set(id, request);
  return request;
}

/** Test seam — the cache is process-wide so tests must reset it. */
export function __clearAttachmentCapabilityCache() {
  cache.clear();
  inFlight.clear();
}

/** Dimensions the server already recorded at upload time, when usable. */
export function attachmentAspectRatio(
  attachment: Attachment | null | undefined,
): number | null {
  if (!attachment?.width || !attachment.height) return null;
  if (attachment.width <= 0 || attachment.height <= 0) return null;
  return attachment.width / attachment.height;
}

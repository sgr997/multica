import { useEffect, useMemo, useState } from "react";
import type { Attachment } from "@multica/core/types";
import { matchAttachmentByURL } from "@multica/core/attachments/image-sequence";
import { resolveAttachmentUrl } from "./attachment-url";
import {
  attachmentAspectRatio,
  authGatedAttachmentId,
  resolveAttachmentFetchUrl,
} from "./attachment-source";

export interface AttachmentImageSource {
  /** Loadable URL, or the best available fallback while a capability mints. */
  uri: string | null;
  /** Server-recorded pixel ratio, when the attachment carries width/height. */
  aspectRatio: number | null;
  /** True until a capability URL replaces the auth-gated stable path. */
  resolving: boolean;
}

/**
 * Resolve a markdown image reference (or a standalone attachment's `url`)
 * into a URL a native image loader can fetch without credentials.
 *
 * Returns synchronously for everything that needs no work — external links,
 * CDN URLs, and the already-signed capability URLs — so only images on a
 * proxy-mode deployment pay for a metadata round trip, and even then it is
 * cached across the screen (see `attachment-source.ts`).
 */
export function useAttachmentImageSource(
  uri: string,
  attachments?: Attachment[],
): AttachmentImageSource {
  const match = useMemo(
    () => matchAttachmentByURL(uri, attachments),
    [uri, attachments],
  );

  const candidate = useMemo(() => {
    // Same precedence as before: this-response load URL first, then the
    // durable markdown URL, then the raw storage URL.
    const raw = match
      ? match.download_url || match.markdown_url || match.url
      : uri;
    return resolveAttachmentUrl(raw) ?? uri;
  }, [match, uri]);

  const [resolvedUri, setResolvedUri] = useState<string>(candidate);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    setResolvedUri(candidate);
    if (!authGatedAttachmentId(candidate)) {
      setResolving(false);
      return;
    }
    let cancelled = false;
    setResolving(true);
    void resolveAttachmentFetchUrl(candidate).then((next) => {
      if (cancelled) return;
      setResolving(false);
      if (next) setResolvedUri(next);
    });
    return () => {
      cancelled = true;
    };
  }, [candidate]);

  return {
    uri: resolvedUri,
    aspectRatio: attachmentAspectRatio(match),
    resolving,
  };
}

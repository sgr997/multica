/**
 * Block-level image with real aspect ratio + tap-to-lightbox.
 *
 *   - Aspect ratio comes from the attachment record's `width`/`height` when
 *     the uploader recorded them; only older uploads fall back to
 *     `Image.getSize`. While dimensions resolve we lay out at 16:9 as a
 *     placeholder — same width-100% so the surrounding flow is stable and
 *     only the height shifts once the real ratio lands.
 *   - Rendering uses `expo-image` for on-disk caching + smooth fade-in
 *     transition.
 *   - Tap dispatches into the global LightboxProvider for fullscreen
 *     viewing with pinch-zoom + swipe-down-to-dismiss.
 *
 * URI resolution: markdown content authored in Multica stores image
 * references using the internal `mc://file/<id>` scheme rather than
 * baking signed HTTPS URLs into the content (signed URLs expire). iOS
 * doesn't understand `mc://`, so we look the URI up in the supplied
 * `attachments` list and swap it for the matching `download_url` before
 * passing to any image API. Unmatched URIs fall through unchanged —
 * external https links and well-known schemes load directly; an
 * unknown reference fails the getSize callback and we fall back to a
 * 16:9 placeholder slot.
 *
 * Credentials: a proxy-mode deployment only lists the auth-gated
 * `/api/attachments/{id}/download` path. Native image loaders do not send
 * the bearer token, so `useAttachmentImageSource` swaps it for a short-lived
 * capability URL before either `getSize` or `expo-image` sees it.
 *
 * Cancellation: a content re-render that swaps the URI must not let the
 * previous getSize callback overwrite state — guard with a `cancelled`
 * flag in the cleanup path.
 */
import { useEffect, useState } from "react";
import { Image as RNImage, Pressable, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import type { Attachment } from "@multica/core/types";
import { authGatedAttachmentId } from "@/lib/attachment-source";
import { useAttachmentImageSource } from "@/lib/use-attachment-image-source";
import { useLightbox } from "./lightbox-provider";
import { useImageSequence } from "./image-sequence";

interface Props {
  uri: string;
  alt?: string;
  attachments?: Attachment[];
}

export function MarkdownImage({ uri, attachments }: Props) {
  const { open } = useLightbox();
  const sequence = useImageSequence();
  const { uri: resolvedUri, aspectRatio } = useAttachmentImageSource(
    uri,
    attachments,
  );
  const [measuredAspect, setMeasuredAspect] = useState<number | null>(null);

  useEffect(() => {
    setMeasuredAspect(null);
    if (!resolvedUri || aspectRatio) return;
    // The gated path answers 401 to a bare native request; the capability
    // resolution re-runs this effect with a loadable URL shortly.
    if (authGatedAttachmentId(resolvedUri)) return;
    let cancelled = false;
    RNImage.getSize(
      resolvedUri,
      (w, h) => {
        if (cancelled || !w || !h) return;
        setMeasuredAspect(w / h);
      },
      () => {
        // Network failure / decode failure / 404 / unknown URI scheme
        // (e.g. unresolved mc://) — keep the 16:9 fallback so the slot
        // still shows the muted background instead of collapsing.
        if (!cancelled) setMeasuredAspect(16 / 9);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [resolvedUri, aspectRatio]);

  const aspect = aspectRatio ?? measuredAspect ?? 16 / 9;

  return (
    <Pressable onPress={() => open(resolvedUri ?? uri, sequence)}>
      <View className="rounded-lg overflow-hidden bg-muted">
        <ExpoImage
          source={resolvedUri ? { uri: resolvedUri } : undefined}
          style={{ width: "100%", aspectRatio: aspect }}
          contentFit="contain"
          transition={150}
        />
      </View>
    </Pressable>
  );
}

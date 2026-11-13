/**
 * Screen-scoped image sequence for the lightbox (MUL-5752).
 *
 * A screen that can show several images (an issue: description + every
 * comment; a chat session: every message) mounts this once with its blocks in
 * render order. Every `MarkdownImage` below it then opens the lightbox
 * positioned inside that sequence instead of on its own, so a swipe walks to
 * the next image and the viewer can say "3 / 7".
 *
 * Mirrors the web/desktop `ImageSequenceProvider`
 * (packages/views/editor/image-sequence-context.tsx) — same product contract,
 * different presentation. The ordering itself is NOT re-derived here: both
 * clients call `collectImageSequence` from @multica/core so an issue's images
 * are counted the same way on every client (mobile parity rule: mirror the
 * shared logic, own the UI).
 *
 * The URIs are resolved the same way `MarkdownImage` resolves the one it
 * renders — same attachment match, same `resolveAttachmentUrl` pass — so the
 * URI a tap reports is the one the sequence holds. Bodies go through the
 * renderer's HTML pass first: mobile shows `<img>` as a Markdown image, whose
 * URL is entity-decoded and normalized, and drops the tags around it. Image
 * file cards are decided by the same rule on both sides (see
 * `preprocessFileCards`), so a card shown as a link is never counted.
 */
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { normalizeUri } from "micromark-util-sanitize-uri";
import {
  collectImageSequence,
  type ImageSequenceBlock,
} from "@multica/core/attachments/image-sequence";
import { resolveAttachmentUrl } from "@/lib/attachment-url";
import {
  authGatedAttachmentId,
  resolveAttachmentFetchUrl,
} from "@/lib/attachment-source";
import { stripHtml } from "./preprocess";

const ImageSequenceContext = createContext<readonly string[]>([]);

/**
 * Resolved image URIs for the surrounding screen, in render order. Empty when
 * no provider is mounted — the lightbox then shows the tapped image alone.
 */
export function useImageSequence(): readonly string[] {
  return use(ImageSequenceContext);
}

export function ImageSequenceProvider({
  blocks,
  children,
}: {
  blocks: readonly (ImageSequenceBlock | null | undefined)[];
  children: ReactNode;
}) {
  const rawUris = useMemo(
    () =>
      collectImageSequence(
        blocks.map((block) =>
          block?.content ? { ...block, content: stripHtml(block.content) } : block,
        ),
      ).map((item) => {
        // An unmatched image file card renders as a Markdown image, whose
        // destination is normalized like any other.
        const url = !item.imageByConstruction && !item.attachment
          ? normalizeUri(item.url)
          : item.url;
        return resolveAttachmentUrl(url) ?? url;
      }),
    [blocks],
  );
  const uris = useResolvedSequence(rawUris);
  return (
    <ImageSequenceContext.Provider value={uris}>
      {children}
    </ImageSequenceContext.Provider>
  );
}

/**
 * The lightbox pages through plain `{ uri }` entries — no headers — so its
 * copy of the sequence needs the same capability URLs `MarkdownImage`
 * renders. Resolution is filled in as soon as the metadata round trip
 * returns; until then the raw URLs keep the order and count intact, and the
 * tap-time lookup in `useLightbox` still finds the image that did resolve.
 */
function useResolvedSequence(uris: readonly string[]): readonly string[] {
  const [resolved, setResolved] = useState(uris);

  useEffect(() => {
    setResolved(uris);
    if (!uris.some((uri) => authGatedAttachmentId(uri))) return;
    let cancelled = false;
    void Promise.all(uris.map((uri) => resolveAttachmentFetchUrl(uri))).then(
      (next) => {
        if (cancelled) return;
        setResolved(next.map((url, index) => url ?? uris[index]));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uris]);

  return resolved;
}

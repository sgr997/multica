/**
 * Turn a Multica markdown string into the plain text a user expects on the
 * clipboard after tapping "Copy".
 *
 * Copy used to put the raw markdown on the clipboard, so a message with a
 * mention or a link pasted as `[MUL-123](mention://issue/<uuid>)` — unusable
 * outside the app. The transform is deliberately best-effort: it removes the
 * syntax that would read as garbage in another app and leaves the prose
 * untouched. It is not a renderer; formatting that has no plain-text meaning
 * (emphasis, headings, rules) collapses to its content.
 */
export function markdownToPlainText(markdown: string): string {
  if (!markdown) return "";

  let text = markdown.replace(/\r\n?/g, "\n");

  // Fenced code blocks: drop the fence lines, keep the code verbatim.
  text = text.replace(/^[ \t]*(```|~~~)[^\n]*$/gm, "");

  // HTML that can show up in legacy rows. `<br>` is a line break; every other
  // tag is noise.
  text = text.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?[a-z][^>]*>/gi, "");

  // Images: keep the alt text when there is one, otherwise the URL, so a
  // pasted message still says what was attached.
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_m, alt, url) =>
    alt ? alt : url,
  );

  // Links (including mention:// and file cards): keep the label. Autolinks
  // written as `<https://…>` keep the URL without the angle brackets.
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  text = text.replace(/<(https?:\/\/[^>\s]+)>/g, "$1");

  // Line-level syntax.
  text = text
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, "")
    .replace(/^([ \t]*)[-*+][ \t]+\[[ xX]\][ \t]+/gm, "$1")
    .replace(/^([ \t]*)[-*+][ \t]+/gm, "$1• ");

  // Inline syntax.
  text = text
    .replace(/`+([^`]+)`+/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1$2")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1$2");

  // Unescape the backslash escapes CommonMark allows for punctuation.
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, "$1");

  return text
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

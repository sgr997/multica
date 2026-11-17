export type ServerUrlErrorCode = "empty" | "invalid" | "insecure" | "credentials" | "query";

export class ServerUrlError extends Error {
  readonly code: ServerUrlErrorCode;

  constructor(code: ServerUrlErrorCode) {
    super(code);
    this.name = "ServerUrlError";
    this.code = code;
  }
}

export interface ServerUrls {
  apiUrl: string;
  webUrl: string;
}

interface NormalizeOptions {
  allowHttp: boolean;
}

function normalizeUrl(raw: string, opts: NormalizeOptions): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new ServerUrlError("empty");

  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new ServerUrlError("invalid");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ServerUrlError("invalid");
  }
  if (parsed.protocol === "http:" && !opts.allowHttp) {
    throw new ServerUrlError("insecure");
  }
  if (parsed.username || parsed.password) {
    throw new ServerUrlError("credentials");
  }
  if (parsed.search || parsed.hash) {
    throw new ServerUrlError("query");
  }

  return parsed;
}

function formatBaseUrl(url: URL): string {
  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname}`;
}

export function normalizeApiUrl(raw: string, opts: NormalizeOptions): string {
  return formatBaseUrl(normalizeUrl(raw, opts));
}

export function normalizeWebUrl(raw: string, opts: NormalizeOptions): string {
  return formatBaseUrl(normalizeUrl(raw, opts));
}

/** The web app lives on the same origin as the API unless the user supplies a
 * separate web address. */
export function deriveWebUrl(apiUrl: string): string {
  return new URL(apiUrl).origin;
}

export function buildServerUrls(
  apiInput: string,
  webInput: string,
  opts: NormalizeOptions,
): ServerUrls {
  const apiUrl = normalizeApiUrl(apiInput, opts);
  const webUrl = webInput.trim()
    ? normalizeWebUrl(webInput, opts)
    : deriveWebUrl(apiUrl);
  return { apiUrl, webUrl };
}

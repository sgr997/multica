import { describe, expect, it } from "vitest";
import {
  buildServerUrls,
  deriveWebUrl,
  normalizeApiUrl,
  ServerUrlError,
} from "./server-url";

describe("normalizeApiUrl", () => {
  it("adds https when the user omits the scheme and trims trailing slashes", () => {
    expect(normalizeApiUrl("api.example.com/", { allowHttp: false })).toBe(
      "https://api.example.com",
    );
  });

  it("keeps a deployment path", () => {
    expect(
      normalizeApiUrl("https://example.com/multica/", { allowHttp: false }),
    ).toBe("https://example.com/multica");
  });

  it("rejects plain http outside development builds", () => {
    expect(() =>
      normalizeApiUrl("http://192.168.1.4:8080", { allowHttp: false }),
    ).toThrowError(
      expect.objectContaining<Partial<ServerUrlError>>({ code: "insecure" }),
    );
  });

  it("allows http when development builds opt in", () => {
    expect(normalizeApiUrl("http://192.168.1.4:8080", { allowHttp: true })).toBe(
      "http://192.168.1.4:8080",
    );
  });

  it.each<[string, ServerUrlError["code"]]>([
    ["", "empty"],
    ["ftp://example.com", "invalid"],
    ["https://user:pass@example.com", "credentials"],
    ["https://example.com?token=x", "query"],
  ])("rejects %s as %s", (input, code) => {
    expect(() => normalizeApiUrl(input, { allowHttp: false })).toThrowError(
      expect.objectContaining<Partial<ServerUrlError>>({ code }),
    );
  });
});

describe("buildServerUrls", () => {
  it("derives the web origin from the API address", () => {
    expect(
      buildServerUrls("https://api.example.com", "", { allowHttp: false }),
    ).toEqual({
      apiUrl: "https://api.example.com",
      webUrl: "https://api.example.com",
    });
  });

  it("keeps a separately configured web address", () => {
    expect(
      buildServerUrls(
        "https://api.example.com",
        "https://app.example.com/",
        { allowHttp: false },
      ),
    ).toEqual({
      apiUrl: "https://api.example.com",
      webUrl: "https://app.example.com",
    });
  });
});

describe("deriveWebUrl", () => {
  it("drops the API path", () => {
    expect(deriveWebUrl("https://example.com/multica")).toBe(
      "https://example.com",
    );
  });
});

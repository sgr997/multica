// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const secureStore = vi.hoisted(() => {
  process.env.EXPO_PUBLIC_API_URL = "https://api.example.test";
  process.env.EXPO_PUBLIC_WEB_URL = "https://web.example.test";
  return new Map<string, string>();
});

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStore.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStore.delete(key);
  }),
}));

import {
  initializeServerConfig,
  probeServer,
  saveServerConfig,
} from "./server-config";
import {
  BUILD_API_URL,
  BUILD_WEB_URL,
  getApiBaseUrl,
  getWebBaseUrl,
  resetRuntimeConfig,
} from "@/lib/runtime-config";

const STORAGE_KEY = "multica_server_config";

describe("server configuration persistence", () => {
  beforeEach(() => {
    secureStore.clear();
    resetRuntimeConfig();
    vi.unstubAllGlobals();
  });

  it("falls back to the build default when nothing was saved", async () => {
    await initializeServerConfig();
    expect(getApiBaseUrl()).toBe(BUILD_API_URL);
    expect(getWebBaseUrl()).toBe(BUILD_WEB_URL);
  });

  it("restores a saved custom backend", async () => {
    secureStore.set(
      STORAGE_KEY,
      JSON.stringify({
        apiUrl: "https://selfhost.example.com",
        webUrl: "https://app.example.com",
      }),
    );

    await initializeServerConfig();

    expect(getApiBaseUrl()).toBe("https://selfhost.example.com");
    expect(getWebBaseUrl()).toBe("https://app.example.com");
  });

  it("ignores corrupt stored config", async () => {
    secureStore.set(STORAGE_KEY, "{not json");
    await initializeServerConfig();
    expect(getApiBaseUrl()).toBe(BUILD_API_URL);
  });

  it("persists and applies a new backend", async () => {
    await saveServerConfig({
      apiUrl: "https://selfhost.example.com",
      webUrl: "https://selfhost.example.com",
    });

    expect(JSON.parse(secureStore.get(STORAGE_KEY) ?? "")).toEqual({
      apiUrl: "https://selfhost.example.com",
      webUrl: "https://selfhost.example.com",
    });
    expect(getApiBaseUrl()).toBe("https://selfhost.example.com");
  });
});

describe("probeServer", () => {
  it("accepts a Multica config response", async () => {
    const fetchMock = vi.fn(async () => Response.json({ allow_signup: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      probeServer("https://selfhost.example.com"),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://selfhost.example.com/api/config",
      expect.any(Object),
    );
  });

  it("rejects a non-Multica response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html></html>", { status: 404 })),
    );

    await expect(
      probeServer("https://not-multica.example.com"),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("reports network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    await expect(
      probeServer("https://selfhost.example.com"),
    ).rejects.toMatchObject({ code: "network" });
  });
});

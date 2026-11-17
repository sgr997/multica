import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.EXPO_PUBLIC_API_URL = "https://api.example.test";
  process.env.EXPO_PUBLIC_WEB_URL = "https://web.example.test";
});

import {
  BUILD_API_URL,
  BUILD_WEB_URL,
  applyRuntimeConfig,
  getApiBaseUrl,
  getWebBaseUrl,
  resetRuntimeConfig,
  useRuntimeConfigStore,
} from "./runtime-config";

describe("runtime server configuration", () => {
  beforeEach(() => {
    resetRuntimeConfig();
  });

  it("starts from the build-time defaults", () => {
    expect(getApiBaseUrl()).toBe(BUILD_API_URL);
    expect(getWebBaseUrl()).toBe(BUILD_WEB_URL);
    expect(useRuntimeConfigStore.getState().custom).toBe(false);
  });

  it("updates every reader from the same source", () => {
    applyRuntimeConfig({
      apiUrl: "https://selfhost.example.com",
      webUrl: "https://selfhost.example.com",
    });

    expect(getApiBaseUrl()).toBe("https://selfhost.example.com");
    expect(getWebBaseUrl()).toBe("https://selfhost.example.com");
    expect(useRuntimeConfigStore.getState().custom).toBe(true);
  });

  it("increments the revision so realtime clients reconnect", () => {
    const before = useRuntimeConfigStore.getState().revision;
    applyRuntimeConfig({
      apiUrl: "https://selfhost.example.com",
      webUrl: "https://selfhost.example.com",
    });
    expect(useRuntimeConfigStore.getState().revision).toBe(before + 1);
  });
});

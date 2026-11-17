import { create } from "zustand";

export const BUILD_API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");
export const BUILD_WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? "").trim().replace(/\/+$/, "");

function defaultWebUrl(): string {
  if (BUILD_WEB_URL) return BUILD_WEB_URL;
  if (!BUILD_API_URL) return "";
  try {
    return new URL(BUILD_API_URL).origin;
  } catch {
    return "";
  }
}

export const DEFAULT_WEB_URL = defaultWebUrl();

export interface RuntimeServerConfig {
  apiUrl: string;
  webUrl: string;
  custom: boolean;
}

interface RuntimeConfigState extends RuntimeServerConfig {
  revision: number;
}

export const useRuntimeConfigStore = create<RuntimeConfigState>(() => ({
  apiUrl: BUILD_API_URL,
  webUrl: DEFAULT_WEB_URL,
  custom: false,
  revision: 0,
}));

export function getApiBaseUrl(): string {
  return useRuntimeConfigStore.getState().apiUrl;
}

export function getWebBaseUrl(): string {
  return useRuntimeConfigStore.getState().webUrl;
}

export function applyRuntimeConfig(config: { apiUrl: string; webUrl: string }): void {
  useRuntimeConfigStore.setState((state) => ({
    apiUrl: config.apiUrl,
    webUrl: config.webUrl,
    custom: config.apiUrl !== BUILD_API_URL || config.webUrl !== DEFAULT_WEB_URL,
    revision: state.revision + 1,
  }));
}

export function resetRuntimeConfig(): void {
  useRuntimeConfigStore.setState((state) => ({
    apiUrl: BUILD_API_URL,
    webUrl: DEFAULT_WEB_URL,
    custom: false,
    revision: state.revision + 1,
  }));
}

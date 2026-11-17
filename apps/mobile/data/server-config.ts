import * as SecureStore from "expo-secure-store";
import { AppConfigSchema } from "@multica/core/api/schemas";
import {
  BUILD_API_URL,
  DEFAULT_WEB_URL,
  applyRuntimeConfig,
  getApiBaseUrl,
  getWebBaseUrl,
  resetRuntimeConfig,
} from "@/lib/runtime-config";
import { buildServerUrls, ServerUrlError, type ServerUrls } from "@/lib/server-url";

const SERVER_CONFIG_KEY = "multica_server_config";
const PROBE_TIMEOUT_MS = 10_000;

interface StoredServerConfig {
  apiUrl: string;
  webUrl: string;
}

export class ServerProbeError extends Error {
  readonly code: "network" | "invalid";

  constructor(code: "network" | "invalid") {
    super(code);
    this.name = "ServerProbeError";
    this.code = code;
  }
}

export function canUseInsecureServer(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

export function getCurrentServerInputs(): StoredServerConfig {
  return { apiUrl: getApiBaseUrl(), webUrl: getWebBaseUrl() };
}

export function getDefaultServerInputs(): StoredServerConfig {
  return { apiUrl: BUILD_API_URL, webUrl: DEFAULT_WEB_URL };
}

function validateStoredConfig(value: unknown): StoredServerConfig | null {
  if (!value || typeof value !== "object") return null;
  const { apiUrl, webUrl } = value as Partial<StoredServerConfig>;
  if (typeof apiUrl !== "string" || typeof webUrl !== "string") return null;
  try {
    return buildServerUrls(apiUrl, webUrl, {
      allowHttp: canUseInsecureServer(),
    });
  } catch {
    return null;
  }
}

/** Load the last selected backend before any API request or auth restore. */
export async function initializeServerConfig(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = await SecureStore.getItemAsync(SERVER_CONFIG_KEY);
  } catch {
    resetRuntimeConfig();
    return;
  }
  if (!raw) {
    resetRuntimeConfig();
    return;
  }

  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    stored = null;
  }
  const config = validateStoredConfig(stored);
  if (!config) {
    resetRuntimeConfig();
    return;
  }
  applyRuntimeConfig(config);
}

export function prepareServerUrls(apiInput: string, webInput: string): ServerUrls {
  return buildServerUrls(apiInput, webInput, {
    allowHttp: canUseInsecureServer(),
  });
}

export async function probeServer(apiUrl: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiUrl}/api/config`, {
      headers: {
        Accept: "application/json",
        "X-Client-Platform": "mobile",
        "X-Client-OS": "ios",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new ServerProbeError("invalid");
    const parsed = AppConfigSchema.safeParse(await response.json());
    if (!parsed.success) throw new ServerProbeError("invalid");
  } catch (err) {
    if (err instanceof ServerProbeError) throw err;
    throw new ServerProbeError("network");
  } finally {
    clearTimeout(timeout);
  }
}

export async function saveServerConfig(config: ServerUrls): Promise<void> {
  const stored: StoredServerConfig = {
    apiUrl: config.apiUrl,
    webUrl: config.webUrl,
  };
  await SecureStore.setItemAsync(SERVER_CONFIG_KEY, JSON.stringify(stored));
  applyRuntimeConfig(stored);
}

export async function resetStoredServerConfig(): Promise<void> {
  await SecureStore.deleteItemAsync(SERVER_CONFIG_KEY);
  resetRuntimeConfig();
}

export function serverUrlErrorKey(err: unknown): string {
  if (err instanceof ServerUrlError) {
    switch (err.code) {
      case "empty":
        return "server.errors.empty";
      case "insecure":
        return "server.errors.insecure";
      case "credentials":
        return "server.errors.credentials";
      case "query":
        return "server.errors.query";
      case "invalid":
        return "server.errors.invalid";
    }
  }
  return "server.errors.invalid";
}

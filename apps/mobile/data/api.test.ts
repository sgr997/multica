// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./api";
import { applyRuntimeConfig, resetRuntimeConfig } from "@/lib/runtime-config";

// api.ts refuses to load without a base URL; set it before the import runs.
vi.hoisted(() => {
  process.env.EXPO_PUBLIC_API_URL = "https://api.example.test";
});

// The real store pulls in expo-secure-store; the client only needs the slug.
vi.mock("@/data/workspace-store", () => ({ getCurrentSlug: () => null }));

describe("api.listAgents", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [undefined, "/api/agents"],
    [{ includeArchived: false }, "/api/agents"],
    [{ includeArchived: true }, "/api/agents?include_archived=true"],
  ])("with %j requests %s", async (opts, path) => {
    const fetchMock = vi.fn(async () => Response.json([]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.listAgents(opts)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`https://api.example.test${path}`, expect.any(Object));
  });
});

describe("batch issue endpoints", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts ids and updates to batch-update", async () => {
    const fetchMock = vi.fn(async () => Response.json({ updated: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api.batchUpdateIssues(["issue-1"], { priority: "high" }),
    ).resolves.toEqual({ updated: 1 });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/issues/batch-update",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          issue_ids: ["issue-1"],
          updates: { priority: "high" },
        }),
      }),
    );
  });

  it("posts ids to batch-delete", async () => {
    const fetchMock = vi.fn(async () => Response.json({ deleted: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.batchDeleteIssues(["a", "b"])).resolves.toEqual({
      deleted: 2,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/issues/batch-delete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ issue_ids: ["a", "b"] }),
      }),
    );
  });
});

describe("api.deleteComment", () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // #8296: servers that keep a deleted comment's replies also route
  // /keep-replies; older servers do not, so a keep-replies delete that reaches
  // one fails instead of deleting the replies too.
  it.each([
    [{ keepReplies: true }, "https://api.example.test/api/comments/comment-1/keep-replies"],
    [{ keepReplies: false }, "https://api.example.test/api/comments/comment-1"],
    [undefined, "https://api.example.test/api/comments/comment-1"],
  ])("with %j sends DELETE %s", async (opts, url) => {
    await api.deleteComment("comment-1", opts);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ method: "DELETE" }));
  });
});

describe("agent detail endpoints", () => {
  const agentPayload = {
    id: "agent-1",
    name: "Builder",
    model: "gpt-5",
    thinking_level: "high",
  };

  afterEach(() => vi.unstubAllGlobals());

  it("parses the detail payload into the extended agent shape", async () => {
    const fetchMock = vi.fn(async () => Response.json(agentPayload));
    vi.stubGlobal("fetch", fetchMock);
    const agent = await api.getAgent("agent-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/agents/agent-1",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(agent.thinking_level).toBe("high");
  });

  it.each([
    ["update", () => api.updateAgent("agent-1", { name: "B" }), "PUT", "/api/agents/agent-1"],
    ["archive", () => api.archiveAgent("agent-1"), "POST", "/api/agents/agent-1/archive"],
    ["restore", () => api.restoreAgent("agent-1"), "POST", "/api/agents/agent-1/restore"],
  ])("sends %s", async (_name, call, method, path) => {
    const fetchMock = vi.fn(async () => Response.json(agentPayload));
    vi.stubGlobal("fetch", fetchMock);
    await call();
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.test${path}`,
      expect.objectContaining({ method }),
    );
  });

  it("lists agent tasks", async () => {
    const fetchMock = vi.fn(async () => Response.json([{ id: "task-1" }]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.listAgentTasks("agent-1", { limit: 20 })).resolves.toEqual([
      expect.objectContaining({ id: "task-1" }),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/agents/agent-1/tasks?limit=20",
      expect.any(Object),
    );
  });
});


describe("api.listIssues requester compatibility", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([false, true])("checks server support before returning Created rows (supported=%s)", async (supported) => {
    const fetchMock = vi.fn(async (_url: string) => Response.json({ issues: [], total: 0, ...(supported ? { created_by_user_id: "me" } : {}) }));
    vi.stubGlobal("fetch", fetchMock);
    await api.listIssues({ created_by_user_id: "me" });
    expect(fetchMock).toHaveBeenCalledTimes(supported ? 1 : 2);
    if (!supported) expect(String(fetchMock.mock.calls[1]?.[0])).toContain("creator_id=me");
  });
});

describe("api runtime backend", () => {
  afterEach(() => resetRuntimeConfig());

  it("uses the newly selected backend for subsequent requests", async () => {
    const fetchMock = vi.fn(async () => Response.json([]));
    vi.stubGlobal("fetch", fetchMock);

    applyRuntimeConfig({
      apiUrl: "https://selfhost.example.test",
      webUrl: "https://selfhost.example.test",
    });

    await api.listAgents();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://selfhost.example.test/api/agents",
      expect.any(Object),
    );
  });
});

class FakeXHR {
  static last: FakeXHR | null = null;

  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown = null;
  timeout = 0;
  status = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body: unknown) {
    this.body = body;
    FakeXHR.last = this;
  }

  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }

  fail() {
    this.onerror?.();
  }
}

describe("api.uploadFile (ZXP-29)", () => {
  const attachment = {
    id: "att-1",
    filename: "photo.jpg",
    url: "https://api.example.test/api/attachments/att-1/download",
    content_type: "image/jpeg",
  };

  afterEach(() => {
    api.setToken(null);
    FakeXHR.last = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the multipart body through XMLHttpRequest, never expo fetch", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "XMLHttpRequest",
      FakeXHR as unknown as typeof XMLHttpRequest,
    );
    api.setToken("token-1");

    const pending = api.uploadFile({
      uri: "file:///tmp/photo.jpg",
      name: "photo.jpg",
      type: "image/jpeg",
    });

    const xhr = FakeXHR.last;
    expect(xhr).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(xhr?.method).toBe("POST");
    expect(xhr?.url).toBe("https://api.example.test/api/upload-file");
    // Auth + client identity survive; Content-Type must stay unset so the
    // native layer writes the multipart boundary itself.
    expect(xhr?.headers.Authorization).toBe("Bearer token-1");
    expect(xhr?.headers["X-Client-Platform"]).toBe("mobile");
    expect(xhr?.headers["Content-Type"]).toBeUndefined();
    expect(xhr?.body).toBeInstanceOf(FormData);

    xhr?.respond(200, attachment);
    await expect(pending).resolves.toMatchObject({ id: "att-1" });
  });

  it("surfaces transport failures so the chip can show error + retry", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal(
      "XMLHttpRequest",
      FakeXHR as unknown as typeof XMLHttpRequest,
    );

    const pending = api.uploadFile({
      uri: "file:///tmp/photo.jpg",
      name: "photo.jpg",
      type: "image/jpeg",
    });
    FakeXHR.last?.fail();

    await expect(pending).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining("Network request failed"),
    });
  });
});

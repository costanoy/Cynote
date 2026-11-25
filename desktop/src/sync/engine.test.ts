import { describe, expect, it } from "vitest";
import { applyToTabs, toLocalNotes } from "./applyToTabs";
import { runCycle, statusFromError, type CycleEnv } from "./engine";
import { SyncError, createHttp, type SyncHttp } from "./http";
import { noteHash } from "./reconcile";
import { emptyState, type SyncState } from "./state";
import type { TabData } from "../types";

const CODE = "4F2A9-C81D0-77B3E-0A1C5";
const ME = "desk";

function tab(id: string, title: string, body: string, updatedAt = 100): TabData {
  return { id, title, body, favorite: false, sketches: [], updatedAt, originDeviceId: ME };
}

/** A tiny in-memory Realtime Database that understands the few paths sync uses. */
class FakeCloud implements SyncHttp {
  stamp: number | null = null;
  notes: Record<string, unknown> = {};
  slots: Record<string, unknown> = {};
  requests: string[] = [];
  patches: { path: string; body: Record<string, unknown> }[] = [];
  failPatch: SyncError | null = null;
  clock = 1000;

  async getJson(path: string): Promise<unknown> {
    this.requests.push("GET " + path);
    if (path === `/sync/${CODE}/v2/stamp.json`) return this.stamp;
    if (path === `/sync/${CODE}/v2/notes.json`) return Object.keys(this.notes).length ? this.notes : null;
    if (path === `/sync/${CODE}.json?shallow=true`) {
      const keys: Record<string, true> = {};
      for (const k of Object.keys(this.slots)) keys[k] = true;
      if (this.stamp !== null || Object.keys(this.notes).length) keys.v2 = true;
      return Object.keys(keys).length ? keys : null;
    }
    const m = path.match(new RegExp(`^/sync/${CODE}/([^/]+)/notes\\.json$`));
    if (m) return (this.slots[m[1]] as { notes?: unknown } | undefined)?.notes ?? null;
    throw new Error("unexpected GET " + path);
  }

  async patchJson(path: string, body: unknown): Promise<unknown> {
    this.requests.push("PATCH " + path);
    if (this.failPatch) throw this.failPatch;
    expect(path).toBe(`/sync/${CODE}/v2.json`);
    const b = body as Record<string, unknown>;
    this.patches.push({ path, body: b });
    for (const [k, v] of Object.entries(b)) {
      if (k === "stamp") this.stamp = ++this.clock;
      else this.notes[k.replace(/^notes\//, "")] = v;
    }
    return b;
  }
}

type Harness = {
  env: CycleEnv;
  tabs: { current: TabData[] };
  state: SyncState;
  saved: string[];
  applyCalls: number;
};

function harness(cloud: FakeCloud, tabs: TabData[], state: SyncState = emptyState(), extra: Partial<CycleEnv> = {}): Harness {
  const h = { tabs: { current: tabs }, state, saved: [] as string[], applyCalls: 0 } as Harness;
  let n = 0;
  h.env = {
    http: cloud,
    code: CODE,
    deviceId: ME,
    state,
    now: () => 5000,
    newId: () => "c" + ++n,
    readLocal: () => toLocalNotes(h.tabs.current),
    apply: (plan) => {
      h.applyCalls++;
      const r = applyToTabs(h.tabs.current, plan, () => tab("blank", "Nova nota", ""));
      h.tabs.current = r.tabs;
      return r.skipped;
    },
    saveState: (s) => {
      h.saved.push(JSON.stringify(s));
    },
    ...extra,
  };
  return h;
}

describe("runCycle", () => {
  it("pushes a new note with one PATCH that also asks for the server timestamp", async () => {
    const cloud = new FakeCloud();
    const h = harness(cloud, [tab("n1", "Compras", "pão\nleite", 111)]);
    const result = await runCycle(h.env);

    expect(result).toMatchObject({ shortCircuit: false, pushed: 1 });
    expect(cloud.patches).toHaveLength(1);
    expect(cloud.patches[0].body).toEqual({
      "notes/n1": { t: "Compras", b: "pão\nleite", u: 111, d: ME, p: "" },
      stamp: { ".sv": "timestamp" },
    });
    expect(h.state.base.n1).toEqual({ h: noteHash("Compras", "pão\nleite", false), m: true });
    expect(h.state.lastStamp).toBe(cloud.stamp);
    expect(h.state.v1Imported).toBe(true);
  });

  it("does nothing but read the stamp when it is unchanged and nothing is local", async () => {
    const cloud = new FakeCloud();
    const h = harness(cloud, [tab("n1", "Compras", "pão", 111)]);
    await runCycle(h.env);
    cloud.requests.length = 0;
    h.applyCalls = 0;

    const again = await runCycle(h.env);
    expect(again).toEqual({ shortCircuit: true, applied: 0, pushed: 0 });
    expect(cloud.requests).toEqual([`GET /sync/${CODE}/v2/stamp.json`]);
    expect(h.applyCalls).toBe(0);
  });

  it("does not short-circuit when a note changed here, or when forced", async () => {
    const cloud = new FakeCloud();
    const h = harness(cloud, [tab("n1", "Compras", "pão", 111)]);
    await runCycle(h.env);

    h.tabs.current = [tab("n1", "Compras", "pão\nleite", 222)];
    const edited = await runCycle(h.env);
    expect(edited).toMatchObject({ shortCircuit: false, pushed: 1 });
    expect(cloud.patches[1].body["notes/n1"]).toMatchObject({ b: "pão\nleite", p: noteHash("Compras", "pão", false) });

    const forced = await runCycle({ ...h.env, force: true });
    expect(forced.shortCircuit).toBe(false);
  });

  it("commits the base for pushed notes only after the PATCH succeeded", async () => {
    const cloud = new FakeCloud();
    cloud.failPatch = new SyncError("error", "HTTP 500");
    const h = harness(cloud, [tab("n1", "Compras", "pão", 111)]);

    await expect(runCycle(h.env)).rejects.toMatchObject({ kind: "error", message: "HTTP 500" });
    expect(h.state.base.n1).toBeUndefined();
    expect(h.state.lastStamp).toBeNull();
    expect(h.saved.every((s) => !JSON.parse(s).base.n1)).toBe(true);

    cloud.failPatch = null;
    await runCycle(h.env);
    expect(h.state.base.n1).toMatchObject({ m: true });
    expect(cloud.notes.n1).toBeDefined();
  });

  it("keeps the previous base of a pushed note when the PATCH fails", async () => {
    const cloud = new FakeCloud();
    const h = harness(cloud, [tab("n1", "Compras", "pão", 111)]);
    await runCycle(h.env);
    const before = { ...h.state.base.n1 };

    h.tabs.current = [tab("n1", "Compras", "pão\nleite", 222)];
    cloud.failPatch = new SyncError("offline", "sem conexão");
    await expect(runCycle(h.env)).rejects.toMatchObject({ kind: "offline" });
    expect(h.state.base.n1).toEqual(before);
  });

  it("takes a note another device wrote, and a deletion", async () => {
    const cloud = new FakeCloud();
    cloud.stamp = 10;
    cloud.notes = { n9: { t: "Ideias", b: "rever sync", u: 200, d: "phone" } };
    const h = harness(cloud, [], emptyState());
    h.state.v1Imported = true;
    await runCycle(h.env);

    const created = h.tabs.current.find((t) => t.id === "n9");
    expect(created).toMatchObject({
      title: "Ideias",
      body: "rever sync",
      updatedAt: 200,
      originDeviceId: "phone",
      favorite: false,
      sketches: [],
      titleIsCustom: true,
    });
    expect(h.tabs.current[h.tabs.current.length - 1].id).toBe("n9");
    expect(h.state.base.n9).toEqual({ h: noteHash("Ideias", "rever sync", false), m: false });

    cloud.stamp = 11;
    cloud.notes.n9 = { t: "", b: "", u: 300, d: "phone", x: true };
    await runCycle(h.env);
    expect(h.tabs.current.find((t) => t.id === "n9")).toBeUndefined();
    expect(h.state.deleted.n9).toBe(300);
  });

  describe("apply guard", () => {
    it("skips a note edited just before the result lands and keeps its previous base", async () => {
      const cloud = new FakeCloud();
      cloud.stamp = 10;
      cloud.notes = { n1: { t: "Compras", b: "pão\nleite", u: 500, d: "phone" } };
      const h = harness(cloud, [tab("n1", "Compras", "pão", 100)]);
      h.state.v1Imported = true;
      const agreed = { h: noteHash("Compras", "pão", false), m: false };
      h.state.base.n1 = agreed;

      // The note changes between what reconcile saw and the moment the result lands.
      const realApply = h.env.apply;
      h.env.apply = (plan) => {
        h.tabs.current = [tab("n1", "Compras", "pão e manteiga", 600)];
        return realApply(plan);
      };

      await runCycle(h.env);
      expect(h.tabs.current[0].body).toBe("pão e manteiga");
      expect(h.state.base.n1).toEqual(agreed);
    });

    it("applyToTabs leaves an edited or closed note alone and replaces the rest", () => {
      const tabs = [tab("a", "A", "um"), tab("b", "B", "dois")];
      const seen = { a: noteHash("A", "um", false), b: noteHash("B", "dois", false) };
      const edited = [tabs[0], { ...tabs[1], body: "dois!" }];
      const out = applyToTabs(
        edited,
        {
          upserts: [
            { id: "a", title: "A", body: "um mais", u: 900, writer: "phone" },
            { id: "b", title: "B", body: "dois do outro", u: 900, writer: "phone" },
            { id: "gone", title: "G", body: "x", u: 900, writer: "phone" },
          ],
          removals: [],
          seen: { ...seen, gone: "zzzz" },
        },
        () => tab("blank", "Nova nota", ""),
      );
      expect(out.skipped.sort()).toEqual(["b", "gone"]);
      expect(out.tabs[0]).toMatchObject({ body: "um mais", updatedAt: 900 });
      expect(out.tabs[1].body).toBe("dois!");
    });

    it("applyToTabs keeps drawings and file links when the text is replaced", () => {
      const sketch = { id: "s", dataUrl: "d", x: 0, y: 0, width: 1, height: 1, anchor: { line: 2, dy: 0 } };
      const t: TabData = { ...tab("a", "A", "l1\nl2\nl3"), sketches: [sketch], favorite: true, filePath: "C:\\a.cyte" };
      const out = applyToTabs(
        [t],
        {
          upserts: [{ id: "a", title: "A", body: "novo\nl1\nl2\nl3", u: 900, writer: "phone" }],
          removals: [],
          seen: { a: noteHash("A", "l1\nl2\nl3", false) },
        },
        () => tab("blank", "Nova nota", ""),
      );
      expect(out.tabs[0]).toMatchObject({ favorite: true, filePath: "C:\\a.cyte" });
      expect(out.tabs[0].sketches[0].anchor?.line).toBe(3);
    });

    it("applyToTabs closes a removed tab, and swaps the only tab for a blank note", () => {
      const seen = { a: noteHash("A", "um", false) };
      const out = applyToTabs([tab("a", "A", "um")], { upserts: [], removals: [{ id: "a", deletedAt: 5 }], seen }, () =>
        tab("blank", "Nova nota", ""),
      );
      expect(out.removed.map((t) => t.id)).toEqual(["a"]);
      expect(out.tabs).toHaveLength(1);
      expect(out.tabs[0]).toMatchObject({ id: "blank", body: "" });
    });
  });

  describe("v1 import", () => {
    function v1Cloud() {
      const cloud = new FakeCloud();
      cloud.slots = {
        phone: {
          deviceName: "Celular",
          updatedAt: 1,
          notes: [
            { id: "old1", title: "Antiga", body: "texto", updatedAt: 50 },
            { id: "old2", title: "Apagada", body: "texto", updatedAt: 50 },
            { id: "old3", title: "Nova nota", body: "", updatedAt: 50 },
            { id: "old4", title: "Cópia", body: "dela", updatedAt: 50, forkedFrom: { deviceId: ME, noteId: "x" } },
            { id: "old5", title: "Já tenho", body: "do outro", updatedAt: 50 },
          ],
        },
        [ME]: { notes: [{ id: "mine", title: "Minha", body: "x", updatedAt: 1 }] },
      };
      return cloud;
    }

    it("imports notes this device lacks, once", async () => {
      const cloud = v1Cloud();
      const state = emptyState();
      state.ignored = ["old2"];
      const h = harness(cloud, [tab("old5", "Já tenho", "meu texto", 10)], state);

      await runCycle(h.env);
      const ids = h.tabs.current.map((t) => t.id).sort();
      expect(ids).toEqual(["old1", "old5"]);
      expect(h.tabs.current.find((t) => t.id === "old1")).toMatchObject({ title: "Antiga", originDeviceId: "phone" });
      expect(h.tabs.current.find((t) => t.id === "old5")?.body).toBe("meu texto");
      expect(cloud.notes.old1).toMatchObject({ t: "Antiga", b: "texto", d: ME });
      expect(cloud.requests).toContain(`GET /sync/${CODE}.json?shallow=true`);
      expect(cloud.requests).toContain(`GET /sync/${CODE}/phone/notes.json`);
      expect(cloud.requests).not.toContain(`GET /sync/${CODE}/${ME}/notes.json`);
      expect(h.state.v1Imported).toBe(true);

      cloud.requests.length = 0;
      h.tabs.current = h.tabs.current.filter((t) => t.id !== "old1"); // user closes it
      h.state.deleted.old1 = 9000;
      await runCycle({ ...h.env, force: true });
      expect(cloud.requests.some((r) => r.includes("shallow=true"))).toBe(false);
      expect(cloud.requests.some((r) => r.includes("/phone/notes.json"))).toBe(false);
    });

    it("does not import a note this device deleted", async () => {
      const cloud = v1Cloud();
      const state = emptyState();
      state.deleted.old1 = 5;
      const h = harness(cloud, [], state);
      await runCycle(h.env);
      expect(h.tabs.current.map((t) => t.id)).not.toContain("old1");
    });

    it("tries again next time when reading the v1 slots failed", async () => {
      const cloud = v1Cloud();
      const h = harness(cloud, []);
      const realGet = cloud.getJson.bind(cloud);
      let fail = true;
      cloud.getJson = async (path: string) => {
        if (fail && path.includes("/phone/notes.json")) throw new SyncError("offline", "sem conexão");
        return realGet(path);
      };
      await expect(runCycle(h.env)).rejects.toMatchObject({ kind: "offline" });
      expect(h.state.v1Imported).toBe(false);
      fail = false;
      await runCycle(h.env);
      expect(h.state.v1Imported).toBe(true);
      expect(h.tabs.current.map((t) => t.id)).toContain("old1");
    });
  });

  it("stops quietly when the code changed meanwhile", async () => {
    const cloud = new FakeCloud();
    const h = harness(cloud, [tab("n1", "Compras", "pão", 111)], emptyState(), { isCancelled: () => true });
    await expect(runCycle(h.env)).rejects.toMatchObject({ name: "CycleCancelled" });
    expect(cloud.patches).toHaveLength(0);
  });
});

describe("createHttp", () => {
  const reply = (status: number, body: string) => async () => new Response(body, { status });

  it("builds URLs for the emulator, with or without a query already in the path", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return new Response("null");
    }) as unknown as typeof fetch;
    const http = createHttp("http://127.0.0.1:9000", "ns=cynote-f5f04", { fetchImpl });
    await http.getJson(`/sync/${CODE}/v2/stamp.json`);
    await http.getJson(`/sync/${CODE}.json?shallow=true`);
    expect(urls).toEqual([
      `http://127.0.0.1:9000/sync/${CODE}/v2/stamp.json?ns=cynote-f5f04`,
      `http://127.0.0.1:9000/sync/${CODE}.json?shallow=true&ns=cynote-f5f04`,
    ]);
  });

  it("sends PATCH with a JSON body", async () => {
    let seen: RequestInit | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      seen = init;
      return new Response("{}");
    }) as unknown as typeof fetch;
    await createHttp("https://x.test", "", { fetchImpl }).patchJson("/a.json", { stamp: { ".sv": "timestamp" } });
    expect(seen?.method).toBe("PATCH");
    expect(seen?.body).toBe('{"stamp":{".sv":"timestamp"}}');
  });

  it("maps failures: offline, denied, other errors", async () => {
    const get = (fetchImpl: unknown) =>
      createHttp("https://x.test", "", { fetchImpl: fetchImpl as typeof fetch }).getJson("/a.json");

    await expect(get(async () => Promise.reject(new TypeError("Failed to fetch")))).rejects.toMatchObject({ kind: "offline" });
    await expect(get(reply(401, '{"error":"Permission denied"}'))).rejects.toMatchObject({ kind: "denied" });
    await expect(get(reply(403, ""))).rejects.toMatchObject({ kind: "denied" });
    await expect(get(reply(500, "oops"))).rejects.toMatchObject({ kind: "error", message: "HTTP 500" });
    await expect(get(reply(200, "<html>"))).rejects.toMatchObject({ kind: "error" });
  });

  it("treats a timeout (abort) as offline", async () => {
    const hang = (_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const http = createHttp("https://x.test", "", { fetchImpl: hang as unknown as typeof fetch, timeoutMs: 20 });
    await expect(http.getJson("/a.json")).rejects.toMatchObject({ kind: "offline" });
  });

  it("returns null for an empty body", async () => {
    const http = createHttp("https://x.test", "", { fetchImpl: reply(200, "") as unknown as typeof fetch });
    expect(await http.getJson("/a.json")).toBeNull();
  });
});

describe("statusFromError", () => {
  it("maps each kind to a phase", () => {
    expect(statusFromError(new SyncError("offline", "x"), 5)).toEqual({ phase: "offline", lastSyncAt: 5 });
    expect(statusFromError(new SyncError("denied", "HTTP 401"))).toMatchObject({ phase: "denied" });
    expect(statusFromError(new SyncError("error", "HTTP 500"))).toMatchObject({ phase: "error", message: "HTTP 500" });
    expect(statusFromError(new TypeError("Failed to fetch"))).toMatchObject({ phase: "offline" });
    expect(statusFromError(new Error("boom"))).toMatchObject({ phase: "error", message: "boom" });
  });
});

// Sync v2 end-to-end interoperability run: the desktop engine (device A, this
// process) and the Flutter SyncController (device B, a `flutter test` process
// driven over HTTP) share one sync code in the Firebase Realtime Database
// emulator, which runs the repo's rules. See README.md.
//
//   node --import ./register.mjs run.mts
//
// Exit code 0 when every check passed.

import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyToTabs, toLocalNotes } from "../../desktop/src/sync/applyToTabs.ts";
import { runCycle, statusFromError, type CycleResult } from "../../desktop/src/sync/engine.ts";
import { createHttp, SyncError, type SyncHttp } from "../../desktop/src/sync/http.ts";
import { noteHash } from "../../desktop/src/sync/reconcile.ts";
import { emptyState } from "../../desktop/src/sync/state.ts";
import type { TabData } from "../../desktop/src/types.ts";

// ------------------------------------------------------------------ config

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileDir = process.env.CYNOTE_E2E_MOBILE_DIR ?? path.resolve(here, "../../mobile");
const EMULATOR = (process.env.CYNOTE_E2E_EMULATOR ?? "http://127.0.0.1:9000").replace(/\/+$/, "");
// The emulator keeps one namespace per `ns` value and loads the rules only into
// the default one, "<project>-default-rtdb". Any other value is a rules-free
// database, which would make this whole run meaningless (preflight checks it).
const NS = process.env.CYNOTE_E2E_NS ?? "cynote-f5f04-default-rtdb";
const FLUTTER = process.env.FLUTTER ?? "flutter";
const verbose = process.argv.includes("--verbose");

// ------------------------------------------------------------------ checks

type Failure = { name: string; detail: string };
const failures: Failure[] = [];
let passed = 0;

function check(name: string, ok: boolean, detail = ""): boolean {
  if (ok) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail.replace(/\n/g, "\n        ") : ""}`);
  }
  return ok;
}

const show = (v: unknown) => JSON.stringify(v);
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, show(actual) === show(expected), `expected ${show(expected)}\n  actual ${show(actual)}`);
}

function step(title: string) {
  console.log(`\n${title}`);
}

// ------------------------------------------------------------ counting proxy

/** Every engine talks to the database through this, so both are counted the same way. */
class CountingProxy {
  log: string[] = [];
  private server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    this.log.push(`${req.method} ${req.url}`);
    try {
      const upstream = await fetch(EMULATOR + req.url, {
        method: req.method,
        headers: req.headers["content-type"] ? { "content-type": String(req.headers["content-type"]) } : undefined,
        body: body.length ? body : undefined,
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json" });
      res.end(text);
    } catch (e) {
      res.writeHead(502);
      res.end(String(e));
    }
  });
  port = 0;

  async start() {
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
    this.port = (this.server.address() as net.AddressInfo).port;
  }
  get url() {
    return `http://127.0.0.1:${this.port}`;
  }
  mark() {
    return this.log.length;
  }
  since(mark: number) {
    return this.log.slice(mark).map((l) => l.replace(/\?.*$/, ""));
  }
  close() {
    this.server.closeAllConnections();
    this.server.close();
  }
}

// ---------------------------------------------------------------- device A

const A_ID = "desk-e2e";

/** The desktop app, reduced to what sync touches: tabs + the sync state, in memory. */
class Desktop {
  state = emptyState();
  tabs: TabData[] = [];
  readonly http: SyncHttp;
  readonly code: string;
  constructor(baseUrl: string, code: string) {
    this.code = code;
    this.http = createHttp(baseUrl, `ns=${NS}`);
  }

  put(id: string, title: string, body: string, u: number) {
    const tab: TabData = { id, title, body, favorite: false, sketches: [], updatedAt: u, originDeviceId: A_ID, titleIsCustom: true };
    const i = this.tabs.findIndex((t) => t.id === id);
    if (i >= 0) this.tabs[i] = { ...this.tabs[i], title, body, updatedAt: u };
    else this.tabs.push(tab);
  }

  /** Closing a tab: what App.tsx + useCloudSync.noteDeleted do. */
  close(id: string) {
    this.tabs = this.tabs.filter((t) => t.id !== id);
    this.state.deleted[id] = Date.now();
  }

  async sync(opts: { code?: string } = {}): Promise<CycleResult> {
    let n = 0;
    return runCycle({
      http: this.http,
      code: opts.code ?? this.code,
      deviceId: A_ID,
      state: this.state,
      readLocal: () => toLocalNotes(this.tabs),
      apply: (plan) => {
        const r = applyToTabs(this.tabs, plan, () => ({
          id: "blank", title: "Nova nota", body: "", favorite: false, sketches: [], updatedAt: 0, originDeviceId: A_ID,
        }));
        this.tabs = r.tabs;
        return r.skipped;
      },
      saveState: () => {},
      newId: () => `a-copy-${++n}-${Math.random().toString(36).slice(2, 7)}`,
    });
  }

  view(): NoteView[] {
    return this.tabs.map((t) => ({ id: t.id, title: t.title, body: t.body })).sort(byId);
  }
}

type NoteView = { id: string; title: string; body: string };
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : 1);

// ---------------------------------------------------------------- device B

type PhoneDump = {
  code: string | null;
  notes: (NoteView & { u: number })[];
  deleted: Record<string, number>;
  ignored: string[];
  base: Record<string, { h: string; m: boolean }>;
  lastStamp: number | null;
  status: { phase: string; message: string | null };
  joined?: boolean;
};

class Phone {
  private child: ChildProcess | null = null;
  private output = "";
  private url = "";

  async start(baseUrl: string) {
    const port = await freePort();
    this.url = `http://127.0.0.1:${port}/cmd`;
    const env = {
      ...process.env,
      CYNOTE_E2E_EMULATOR: baseUrl,
      CYNOTE_E2E_NS: NS,
      CYNOTE_E2E_DEVICE_PORT: String(port),
    };
    this.child = spawn(`${FLUTTER} test test/e2e_emulator_test.dart --reporter expanded`, {
      cwd: mobileDir,
      env,
      shell: true,
    });
    this.child.stdout?.on("data", (d) => {
      this.output += d;
      if (verbose) process.stdout.write(`[flutter] ${d}`);
    });
    this.child.stderr?.on("data", (d) => {
      this.output += d;
      if (verbose) process.stderr.write(`[flutter] ${d}`);
    });
    let exited = false;
    this.child.on("exit", () => (exited = true));
    const deadline = Date.now() + 5 * 60_000;
    for (;;) {
      if (exited) throw new Error("flutter test ended before the phone device came up:\n" + this.output.slice(-3000));
      if (Date.now() > deadline) throw new Error("flutter test did not start in time:\n" + this.output.slice(-3000));
      try {
        const r = await fetch(this.url, { method: "POST", body: JSON.stringify({ op: "ping" }) });
        if (r.ok) return;
      } catch {
        // not listening yet
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  async cmd(body: Record<string, unknown>): Promise<PhoneDump> {
    const r = await fetch(this.url, { method: "POST", body: JSON.stringify(body) });
    const json = (await r.json()) as PhoneDump & { error?: string; stack?: string };
    if (!r.ok) throw new Error(`phone ${show(body.op)} failed: ${json.error}\n${json.stack ?? ""}`);
    return json;
  }

  start_ = () => this.cmd({ op: "start" });
  join = (code: string) => this.cmd({ op: "join", code });
  sync = () => this.cmd({ op: "sync" });
  put = (id: string, title: string, body: string, u: number) => this.cmd({ op: "put", id, title, body, u });
  remove = (id: string) => this.cmd({ op: "remove", id });
  dump = () => this.cmd({ op: "dump" });
  view = async (): Promise<NoteView[]> =>
    (await this.dump()).notes.map(({ id, title, body }) => ({ id, title, body })).sort(byId);

  async stop(): Promise<number | null> {
    if (!this.child) return null;
    try {
      await fetch(this.url, { method: "POST", body: JSON.stringify({ op: "quit" }) });
    } catch {
      // already gone
    }
    const child = this.child;
    const code = await new Promise<number | null>((resolve) => {
      if (child.exitCode !== null) return resolve(child.exitCode);
      const t = setTimeout(() => {
        child.kill();
        resolve(null);
      }, 30_000);
      child.on("exit", (c) => {
        clearTimeout(t);
        resolve(c);
      });
    });
    this.child = null;
    return code;
  }

  get log() {
    return this.output;
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
}

// ------------------------------------------------------------- raw database

const q = (extra = "") => `?${extra ? extra + "&" : ""}ns=${NS}`;
type Raw = { status: number; json: unknown };

async function raw(method: string, p: string, body?: unknown, admin = false): Promise<Raw> {
  const r = await fetch(`${EMULATOR}${p}${p.includes("?") ? "&ns=" + NS : q()}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      // "owner" bypasses the rules: only for reading back and cleaning up.
      ...(admin ? { authorization: "Bearer owner" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: r.status, json };
}

type CloudNote = { t: string; b: string; u: number; d: string; p?: string; x?: boolean };
async function cloudNotes(code: string): Promise<Record<string, CloudNote>> {
  const r = await raw("GET", `/sync/${code}/v2/notes.json`, undefined, true);
  return ((r.json as Record<string, CloudNote> | null) ?? {}) as Record<string, CloudNote>;
}
const liveCloud = (n: Record<string, CloudNote>) => Object.entries(n).filter(([, v]) => !v.x);
const copiesOf = (views: { title: string }[]) => views.filter((n) => n.title.endsWith("(conflito)"));

// ------------------------------------------------------------------ the run

function newCode(): string {
  const hex = () => Math.floor(Math.random() * 0x100000).toString(16).toUpperCase().padStart(5, "0");
  return `${hex()}-${hex()}-${hex()}-${hex()}`;
}

async function main() {
  const proxy = new CountingProxy();
  await proxy.start();
  const phone = new Phone();
  const code = newCode();
  console.log(`emulator ${EMULATOR} (ns=${NS}), code ${code}`);

  try {
    // ---- preflight: is this really the emulator running the repo's rules?
    step("Preflight");
    let reachable = true;
    try {
      await raw("GET", "/.json", undefined, true);
    } catch {
      reachable = false;
    }
    if (!check("emulator answers", reachable, `nothing at ${EMULATOR}; start it, see README.md`)) return;
    const probe = await raw("PATCH", `/sync/abc/v2.json`, { stamp: 1 });
    if (!check("rules are loaded (a write under the code 'abc' is refused)", probe.status === 401, `got HTTP ${probe.status}; wrong ns or rules not loaded?`)) return;

    await phone.start(proxy.url);
    check("phone device (flutter test) is up", true);

    const t0 = Date.now() - 3_600_000; // edit times: fixed offsets from here, no clock races
    const A = new Desktop(proxy.url, code);
    await phone.start_();

    // ---- 1
    step("1. A creates two notes and syncs; B joins the code and syncs");
    A.put("n-alpha", "Alpha", "alpha line 1\nalpha line 2", t0 + 1);
    A.put("n-beta", "Beta", "beta line 1", t0 + 2);
    let m = proxy.mark();
    const r1 = await A.sync();
    eq("A pushed 2 notes", r1.pushed, 2);
    let reqs = proxy.since(m);
    eq("A's first cycle requests (stamp, v1 listing, notes, PATCH, stamp)", reqs, [
      `GET /sync/${code}/v2/stamp.json`,
      `GET /sync/${code}.json`,
      `GET /sync/${code}/v2/notes.json`,
      `PATCH /sync/${code}/v2.json`,
      `GET /sync/${code}/v2/stamp.json`,
    ]);
    let cloud = await cloudNotes(code);
    eq("cloud holds alpha and beta", Object.keys(cloud).sort(), ["n-alpha", "n-beta"]);
    check("cloud note shape {t,b,u,d,p?}", cloud["n-alpha"]?.t === "Alpha" && cloud["n-alpha"]?.b === "alpha line 1\nalpha line 2" && cloud["n-alpha"]?.u === t0 + 1 && cloud["n-alpha"]?.d === A_ID, show(cloud["n-alpha"]));
    const stampRaw = (await raw("GET", `/sync/${code}/v2/stamp.json`, undefined, true)).json;
    check("stamp is a server timestamp", typeof stampRaw === "number" && stampRaw > 1_600_000_000_000, show(stampRaw));
    check("A's state: base m=true for pushed notes, lastStamp saved", A.state.base["n-alpha"]?.m === true && A.state.lastStamp === stampRaw, show(A.state));

    const j = await phone.join(code);
    eq("B accepted the code", j.joined, true);
    eq("B status after join", j.status.phase, "synced");
    eq("B has both notes", await phone.view(), [
      { id: "n-alpha", title: "Alpha", body: "alpha line 1\nalpha line 2" },
      { id: "n-beta", title: "Beta", body: "beta line 1" },
    ]);
    check("B base is m=false (it only imported)", j.base["n-alpha"]?.m === false && j.base["n-alpha"]?.h === noteHash("Alpha", "alpha line 1\nalpha line 2", false), show(j.base));

    // ---- 2
    step("2. B edits one note and creates a third; A syncs");
    await phone.put("n-alpha", "Alpha", "alpha line 1\nalpha line 2\nadded on phone", t0 + 100);
    await phone.put("n-gamma", "Gamma", "gamma line 1", t0 + 101);
    const b2 = await phone.sync();
    eq("B status", b2.status.phase, "synced");
    cloud = await cloudNotes(code);
    eq("cloud has 3 notes", Object.keys(cloud).sort(), ["n-alpha", "n-beta", "n-gamma"]);
    check("alpha in the cloud is B's edit, based on the version A wrote", cloud["n-alpha"]?.b.endsWith("added on phone") && cloud["n-alpha"]?.d === "phone-e2e" && cloud["n-alpha"]?.p === noteHash("Alpha", "alpha line 1\nalpha line 2", false), show(cloud["n-alpha"]));
    await A.sync();
    eq("A sees the edit and the new note", A.view(), [
      { id: "n-alpha", title: "Alpha", body: "alpha line 1\nalpha line 2\nadded on phone" },
      { id: "n-beta", title: "Beta", body: "beta line 1" },
      { id: "n-gamma", title: "Gamma", body: "gamma line 1" },
    ]);

    // ---- 3
    step("3. A deletes a note; B syncs");
    A.close("n-beta");
    const r3 = await A.sync();
    eq("A pushed the tombstone", r3.pushed, 1);
    cloud = await cloudNotes(code);
    check("cloud holds a tombstone {x:true, t:'', b:''}", cloud["n-beta"]?.x === true && cloud["n-beta"]?.t === "" && cloud["n-beta"]?.b === "", show(cloud["n-beta"]));
    const d3 = await phone.sync();
    eq("B no longer has n-beta", d3.notes.map((n) => n.id).sort(), ["n-alpha", "n-gamma"]);
    check("B remembers n-beta as deleted", "n-beta" in d3.deleted, show(d3.deleted));

    // ---- 4
    step("4. Both edit the same note without syncing; A, then B, then A");
    A.put("n-alpha", "Alpha", "alpha line 1\nalpha line 2\nadded on phone\nedit from desktop", t0 + 1000);
    await phone.put("n-alpha", "Alpha", "alpha line 1\nalpha line 2\nadded on phone\nedit from phone", t0 + 2000); // newer
    await A.sync();
    await phone.sync();
    await A.sync();
    const aView = A.view();
    const bView = await phone.view();
    cloud = await cloudNotes(code);
    eq("A has exactly one '(conflito)' copy", copiesOf(aView).length, 1);
    eq("B has exactly one '(conflito)' copy", copiesOf(bView).length, 1);
    eq("cloud has exactly one '(conflito)' copy", liveCloud(cloud).filter(([, v]) => v.t.endsWith("(conflito)")).length, 1);
    for (const [who, v] of [["A", aView], ["B", bView]] as const) {
      eq(`${who}: the newer edit (phone) is the main note`, v.find((n) => n.id === "n-alpha")?.body, "alpha line 1\nalpha line 2\nadded on phone\nedit from phone");
      eq(`${who}: the copy holds the older edit (desktop)`, copiesOf(v)[0]?.body, "alpha line 1\nalpha line 2\nadded on phone\nedit from desktop");
    }
    eq("cloud main note is the newer edit", cloud["n-alpha"]?.b, "alpha line 1\nalpha line 2\nadded on phone\nedit from phone");
    eq("same notes on A and B", aView, bView);
    await phone.sync();
    await A.sync();
    eq("still one copy after another round (converged)", [copiesOf(A.view()).length, copiesOf(await phone.view()).length], [1, 1]);

    step("4b. Same, the other way round (desktop edit is the newer one)");
    await phone.put("n-gamma", "Gamma", "gamma line 1\nphone only line", t0 + 3000);
    A.put("n-gamma", "Gamma", "gamma line 1\ndesktop only line", t0 + 4000); // newer
    await A.sync();
    await phone.sync();
    await A.sync();
    const aV = A.view();
    const bV = await phone.view();
    cloud = await cloudNotes(code);
    const gammaCopies = (v: { title: string }[]) => v.filter((n) => n.title === "Gamma (conflito)");
    eq("A: one Gamma copy", gammaCopies(aV).length, 1);
    eq("B: one Gamma copy", gammaCopies(bV).length, 1);
    eq("cloud: one Gamma copy", liveCloud(cloud).filter(([, v]) => v.t === "Gamma (conflito)").length, 1);
    eq("main gamma is the desktop edit on both", [aV.find((n) => n.id === "n-gamma")?.body, bV.find((n) => n.id === "n-gamma")?.body], ["gamma line 1\ndesktop only line", "gamma line 1\ndesktop only line"]);
    eq("the Gamma copy holds the phone edit", gammaCopies(bV)[0]?.body, "gamma line 1\nphone only line");
    eq("same notes on A and B", aV, bV);
    eq("the first conflict (Alpha) still has exactly one copy", copiesOf(aV).filter((n) => n.title === "Alpha (conflito)").length, 1);

    // ---- 5
    step("5. A cycle with nothing changed makes only the stamp request");
    for (let i = 0; i < 2; i++) {
      await A.sync();
      await phone.sync();
    }
    m = proxy.mark();
    const rA = await A.sync();
    eq("A: requests", proxy.since(m), [`GET /sync/${code}/v2/stamp.json`]);
    eq("A: short circuit", rA.shortCircuit, true);
    m = proxy.mark();
    const bQuiet = await phone.sync();
    eq("B: requests", proxy.since(m), [`GET /sync/${code}/v2/stamp.json`]);
    eq("B: status stays synced", bQuiet.status.phase, "synced");
    eq("A and B still hold the same notes", A.view(), await phone.view());

    // ---- 5b (extra): an edit beats a deletion across engines
    step("5b. Extra: B deletes a note while A edits it; the edit wins on both");
    A.put("n-delta", "Delta", "delta line 1", t0 + 5000);
    await A.sync();
    await phone.sync();
    A.put("n-delta", "Delta", "delta line 1\nedited on desktop meanwhile", t0 + 5100);
    await phone.remove("n-delta"); // B closes it and syncs: the tombstone goes up
    check("cloud has the tombstone before A syncs", (await cloudNotes(code))["n-delta"]?.x === true);
    await A.sync();
    await phone.sync();
    await A.sync();
    const delta = "delta line 1\nedited on desktop meanwhile";
    eq("A keeps the edited note", A.view().find((n) => n.id === "n-delta")?.body, delta);
    eq("B gets the note back", (await phone.view()).find((n) => n.id === "n-delta")?.body, delta);
    check("cloud holds the live edited note", (await cloudNotes(code))["n-delta"]?.x !== true && (await cloudNotes(code))["n-delta"]?.b === delta);
    eq("no conflict copy was made for it", [...A.view(), ...(await phone.view())].filter((n) => n.title === "Delta (conflito)").length, 0);

    // ---- 6
    step("6. The rules reject malformed writes and accept the engines' writes");
    const before = JSON.stringify(await cloudNotes(code));
    const good = { t: "t", b: "b", u: 1, d: "dev" };
    const bad: [string, string, unknown][] = [
      ["note missing b, u and d", `/sync/${code}/v2/notes/bad1.json`, { t: "only a title" }],
      ["note missing t", `/sync/${code}/v2/notes/bad2.json`, { b: "b", u: 1, d: "d" }],
      ["note with an unknown field", `/sync/${code}/v2/notes/bad3.json`, { ...good, z: 1 }],
      ["u is a string", `/sync/${code}/v2/notes/bad4.json`, { ...good, u: "1" }],
      ["x is not a boolean", `/sync/${code}/v2/notes/bad5.json`, { ...good, x: "yes" }],
      ["title over 2000 characters", `/sync/${code}/v2/notes/bad6.json`, { ...good, t: "x".repeat(2001) }],
      ["p over 16 characters", `/sync/${code}/v2/notes/bad7.json`, { ...good, p: "x".repeat(17) }],
      ["note id with a space", `/sync/${code}/v2/notes/has%20space.json`, good],
      ["a note that is a plain string", `/sync/${code}/v2/notes/bad8.json`, "hello"],
      ["stamp is a string", `/sync/${code}/v2/stamp.json`, "yesterday"],
      ["unknown child under v2", `/sync/${code}/v2/other.json`, { a: 1 }],
      ["bad code 'abc'", `/sync/abc/v2/notes/n1.json`, good],
      ["lowercase code", `/sync/${code.toLowerCase()}/v2/notes/n1.json`, good],
      ["code with a missing group", `/sync/${code.slice(0, -6)}/v2/notes/n1.json`, good],
      ["write at the root", `/other.json`, { a: 1 }],
    ];
    for (const [name, p, body] of bad) {
      const r = await raw("PUT", p, body);
      check(`rejected: ${name}`, r.status === 401, `HTTP ${r.status} ${show(r.json)}`);
    }
    const multi = await raw("PATCH", `/sync/${code}/v2.json`, { "notes/good-one": good, "notes/bad-one": { t: "x" }, stamp: { ".sv": "timestamp" } });
    check("rejected: a PATCH with one bad note among good ones", multi.status === 401, `HTTP ${multi.status}`);
    const readBad = await raw("GET", `/sync/abc/v2/stamp.json`);
    check("rejected: reading under the bad code 'abc'", readBad.status === 401, `HTTP ${readBad.status}`);
    eq("nothing from the rejected writes reached the cloud", JSON.stringify(await cloudNotes(code)), before);

    const okWrite = await raw("PATCH", `/sync/${code}/v2.json`, { "notes/rules-check": { ...good, p: "0123abcd", x: false }, stamp: { ".sv": "timestamp" } });
    check("accepted: a well-formed note with p and x plus the server-timestamp stamp", okWrite.status === 200, `HTTP ${okWrite.status} ${show(okWrite.json)}`);
    const okId = await raw("PUT", `/sync/${code}/v2/notes/Id_with~all-the-chars.json`, good);
    check("accepted: a note id using A-Z a-z 0-9 _ ~ -", okId.status === 200, `HTTP ${okId.status}`);
    await raw("DELETE", `/sync/${code}/v2/notes/rules-check.json`);
    await raw("DELETE", `/sync/${code}/v2/notes/Id_with~all-the-chars.json`);
    check("all the engines' writes above were accepted by the rules", liveCloud(await cloudNotes(code)).length >= 4 && Object.keys(await cloudNotes(code)).length >= 5);

    // Engine-side view of a refused code: the desktop engine reports "denied" rather than swallowing it.
    try {
      await A.sync({ code: "abc" });
      check("desktop engine surfaces a refused code", false, "no error thrown");
    } catch (e) {
      check("desktop engine surfaces a refused code as 'denied'", e instanceof SyncError && e.kind === "denied" && statusFromError(e).phase === "denied", String(e));
    }
  } finally {
    // clean up: remove this run's notebook (admin bypasses the rules)
    try {
      await raw("DELETE", `/sync/${code}.json`, undefined, true);
    } catch {
      // emulator gone
    }
    const exit = await phone.stop();
    if (exit !== null && exit !== 0 && failures.length === 0) {
      failures.push({ name: "flutter test exit code", detail: `${exit}\n${phone.log.slice(-2000)}` });
      console.log(`  FAIL  flutter test exit code ${exit}`);
    }
    proxy.close();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log(` - ${f.name}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("\nharness error:", e);
  process.exitCode = 2;
});

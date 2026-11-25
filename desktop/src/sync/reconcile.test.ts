import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TOMBSTONE_HASH, noteHash, reconcile, type ReconcileInput } from "./reconcile";

const here = dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(readFileSync(resolve(here, "../../../sync-spec/vectors.json"), "utf8")) as {
  tombstoneHash: string;
  hashExamples: { title: string; body: string; deleted: boolean; hash: string }[];
  cases: { name: string; why: string; input: Omit<ReconcileInput, "newId">; expected: unknown }[];
};

describe("hash", () => {
  it("matches the tombstone hash in the vectors", () => {
    expect(TOMBSTONE_HASH).toBe(vectors.tombstoneHash);
  });

  for (const ex of vectors.hashExamples) {
    it(`hashes ${JSON.stringify(ex.title)} / ${JSON.stringify(ex.body)} (deleted: ${ex.deleted})`, () => {
      expect(noteHash(ex.title, ex.body, ex.deleted)).toBe(ex.hash);
    });
  }
});

describe("reconcile (shared vectors)", () => {
  it("has the cases the phone also runs", () => {
    expect(vectors.cases.length).toBeGreaterThan(0);
  });

  for (const c of vectors.cases) {
    it(c.name, () => {
      let n = 0;
      const out = reconcile({ ...c.input, newId: () => "c" + ++n });
      expect(out).toEqual(c.expected);
    });
  }
});

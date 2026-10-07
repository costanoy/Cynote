import { describe, expect, it } from "vitest";
import { idForDuplicateFile, planOpen, samePath } from "./noteFiles";
import type { TabData } from "./types";

const tab = (id: string, filePath?: string): TabData => ({
  id,
  title: id,
  body: "",
  favorite: false,
  sketches: [],
  updatedAt: 0,
  originDeviceId: "d",
  filePath,
});

const A = "C:\\Users\\V\\Desktop\\Ordem dos projetos.cyte";
const B = "C:\\Users\\V\\Desktop\\- Ordem dos projetos.cyte";
const exists = (paths: string[]) => async (p: string) => paths.some((x) => samePath(x, p));
const fresh = () => "fresh";

describe("planOpen", () => {
  it("opens a file whose id isn't in use under that id", async () => {
    expect(await planOpen([], A, "n1", exists([A]), fresh)).toEqual({ action: "open", id: "n1" });
  });

  it("focuses the tab when that very file is already open, whatever the path's case or slashes", async () => {
    const tabs = [tab("x"), tab("n1", A)];
    expect(await planOpen(tabs, A.toLowerCase().replace(/\\/g, "/"), "n1", exists([A]), fresh)).toEqual({
      action: "focus",
      index: 1,
    });
  });

  it("opens a second file that shares the id as its own tab, with its own id", async () => {
    const plan = await planOpen([tab("n1", A)], B, "n1", exists([A, B]), fresh);
    expect(plan).toEqual({ action: "open", id: idForDuplicateFile("n1", B) });
    expect(idForDuplicateFile("n1", B)).not.toBe("n1");
  });

  it("gives a duplicate file the same id every time it's reopened", async () => {
    expect(idForDuplicateFile("n1", B)).toBe(idForDuplicateFile("n1", B.toUpperCase()));
    const plan = await planOpen([tab("n1", A), tab(idForDuplicateFile("n1", B), "D:\\moved.cyte")], B, "n1", exists([A, B]), fresh);
    expect(plan).toEqual({ action: "focus", index: 1 });
  });

  it("follows a note renamed or moved on disk instead of opening it twice", async () => {
    expect(await planOpen([tab("n1", A)], B, "n1", exists([B]), fresh)).toEqual({ action: "relink", index: 0 });
  });

  it("attaches the file to a synced copy that has no file yet", async () => {
    expect(await planOpen([tab("n1")], A, "n1", exists([A]), fresh)).toEqual({ action: "link", index: 0 });
  });

  it("gives plain files without a Cynote footer a fresh id", async () => {
    expect(await planOpen([], "C:\\a.txt", null, exists([]), fresh)).toEqual({ action: "open", id: "fresh" });
  });
});

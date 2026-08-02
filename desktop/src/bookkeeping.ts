import type { Bookkeeping } from "./merge";

const KEY = "cynote-sync-bookkeeping";

export function loadBookkeeping(): Bookkeeping {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Bookkeeping) : {};
  } catch {
    return {};
  }
}

export function saveBookkeeping(bookkeeping: Bookkeeping): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(bookkeeping));
  } catch {
    // best-effort
  }
}

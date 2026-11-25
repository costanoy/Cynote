import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/jetbrains-mono/400.css";
import App from "./App";
import Dashboard from "./Dashboard";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function isDashboardWindow(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow().label === "dashboard";
  } catch {
    return false;
  }
}

isDashboardWindow().then((dashboard) => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>{dashboard ? <Dashboard /> : <App />}</React.StrictMode>,
  );
});

import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/marcellus/400.css";
import "@fontsource-variable/literata/opsz.css";
import "@fontsource-variable/literata/opsz-italic.css";
import "@fontsource/jost/400.css";
import "@fontsource/jost/500.css";
import "@fontsource/jost/600.css";
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

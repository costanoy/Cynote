// Node resolves `./reconcile` literally, but the desktop sources import without
// an extension (Vite style). This hook tries `.ts` for those relative imports so
// the harness can run desktop/src/sync/engine.ts exactly as it is.
// Use with: node --import ./register.mjs script.mts
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
      const base = new URL(specifier, context.parentURL);
      for (const ext of [".ts", "/index.ts"]) {
        const candidate = new URL(base.href + ext);
        if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

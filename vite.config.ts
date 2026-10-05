// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const fromRoot = (dir: string) => fileURLToPath(new URL(`./${dir}`, import.meta.url));

export default defineConfig({
  vite: {
    // Code commun (accès à la base, formats, composants d'interface)
    resolve: {
      alias: {
        "@core": fromRoot("src/core"),
        "@ui": fromRoot("src/ui"),
      },
    },
    server: { port: 8081 },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});

// Bundles the API server and the shared package into dist/index.js.
import { build } from "esbuild";

await build({
  entryPoints: { index: "src/index.ts", migrate: "src/migrate.ts", "bot-setup": "src/scripts/bot-setup.ts" },
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  packages: "external",
  alias: { "@unishare/shared": "../shared/src/index.ts" },
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
console.log("server bundled → dist/");

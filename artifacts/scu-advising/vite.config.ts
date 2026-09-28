import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT ?? "5000";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

/**
 * The PDF viewer (Degree Checksheets) loads fonts, character maps and image
 * decoders on demand, by fixed file name, from one folder. They are copied
 * from the installed pdfjs-dist package to `pdfjs/` in the build, and served
 * from the package by the dev server, so they always match the library's
 * version and nothing is fetched from another site.
 *
 * `quickjs-eval.*` is left out on purpose: it is the engine that runs scripts
 * embedded in a PDF, and CampusVal never runs those.
 */
function pdfViewerAssets(): Plugin {
  const folders = ["wasm", "standard_fonts", "cmaps"];
  const skip = /^quickjs-eval\./;
  const types: Record<string, string> = {
    ".wasm": "application/wasm",
    ".js": "text/javascript",
    ".bcmap": "application/octet-stream",
    ".pfb": "application/octet-stream",
    ".ttf": "font/ttf",
  };
  const root = () =>
    path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

  return {
    name: "campusval-pdf-viewer-assets",
    generateBundle() {
      for (const folder of folders) {
        const dir = path.join(root(), folder);
        for (const name of fs.readdirSync(dir).sort()) {
          if (skip.test(name) || !fs.statSync(path.join(dir, name)).isFile()) continue;
          this.emitFile({
            type: "asset",
            fileName: `pdfjs/${folder}/${name}`,
            source: fs.readFileSync(path.join(dir, name)),
          });
        }
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = /\/pdfjs\/(wasm|standard_fonts|cmaps)\/([A-Za-z0-9._-]+)(?:\?.*)?$/.exec(req.url ?? "");
        if (!match || skip.test(match[2]!)) return next();
        const file = path.join(root(), match[1]!, match[2]!);
        if (!fs.existsSync(file)) return next();
        res.setHeader("Content-Type", types[path.extname(file)] ?? "application/octet-stream");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    pdfViewerAssets(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // Silence "Can't resolve original location of error" sourcemap
        // warnings from third-party UI packages (Radix/shadcn) whose source
        // maps reference files not shipped to npm. Harmless, not our code.
        if (
          warning.code === "SOURCEMAP_ERROR" ||
          (typeof warning.message === "string" &&
            warning.message.includes("Can't resolve original location"))
        ) {
          return;
        }
        defaultHandler(warning);
      },
      output: {
        manualChunks: {
          "ui-vendor": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-tabs",
            "@radix-ui/react-progress",
            "@radix-ui/react-label",
            "lucide-react",
          ],
          motion: ["framer-motion"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});

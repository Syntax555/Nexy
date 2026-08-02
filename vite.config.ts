import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import preact from "@preact/preset-vite";
import { defineConfig, type Plugin } from "vite";

import {
  createRobotsTxt,
  createSiteConfig,
  createSitemapXml,
  createWebManifest,
  renderSiteTemplate,
  type SiteConfig
} from "./site.config.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const bundleBudgets = {
  javascriptGzipBytes: 65 * 1024,
  stylesheetGzipBytes: 16 * 1024
} as const;

function assertBudget(label: string, actual: number, limit: number): void {
  if (actual <= limit) return;
  throw new Error(
    `${label} budget exceeded: ${(actual / 1024).toFixed(1)} KiB gzip ` + `(limit ${(limit / 1024).toFixed(1)} KiB).`
  );
}

function siteFiles(config: SiteConfig): Plugin {
  const generatedFiles = new Map([
    [
      "robots.txt",
      {
        type: "text/plain; charset=utf-8",
        source: createRobotsTxt(config)
      }
    ],
    [
      "sitemap.xml",
      {
        type: "application/xml; charset=utf-8",
        source: createSitemapXml(config)
      }
    ],
    [
      "site.webmanifest",
      {
        type: "application/manifest+json; charset=utf-8",
        source: createWebManifest(config)
      }
    ]
  ]);

  return {
    name: "nexy-site-files",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => renderSiteTemplate(html, config)
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url || "/", "http://localhost").pathname;
        const relativePath = pathname.startsWith(config.basePath) ? pathname.slice(config.basePath.length) : "";
        const generated = generatedFiles.get(relativePath);
        if (!generated) {
          next();
          return;
        }
        response.statusCode = 200;
        response.setHeader("Content-Type", generated.type);
        response.end(generated.source);
      });
    },
    generateBundle(_options, bundle) {
      for (const [fileName, file] of generatedFiles) {
        this.emitFile({
          type: "asset",
          fileName,
          source: file.source
        });
      }

      const javascript = Object.values(bundle)
        .filter((output) => output.type === "chunk")
        .map((output) => output.code)
        .join("");
      const stylesheets = Object.values(bundle).flatMap((output) => {
        if (output.type !== "asset" || !output.fileName.endsWith(".css")) {
          return [];
        }
        return [typeof output.source === "string" ? output.source : Buffer.from(output.source)];
      });
      assertBudget("JavaScript", gzipSync(javascript).byteLength, bundleBudgets.javascriptGzipBytes);
      assertBudget(
        "Stylesheet",
        gzipSync(
          Buffer.concat(stylesheets.map((source) => (typeof source === "string" ? Buffer.from(source) : source)))
        ).byteLength,
        bundleBudgets.stylesheetGzipBytes
      );
    }
  };
}

export default defineConfig(() => {
  const site = createSiteConfig();

  return {
    base: site.basePath,
    plugins: [siteFiles(site), preact()],
    build: {
      target: "es2023",
      assetsInlineLimit: 4096,
      cssCodeSplit: true,
      sourcemap: false,
      rollupOptions: {
        input: {
          main: path.join(root, "index.html"),
          legal: path.join(root, "legal.html"),
          "404": path.join(root, "404.html")
        }
      }
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true
    },
    preview: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: true
    }
  };
});

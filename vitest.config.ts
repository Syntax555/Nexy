import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx", "tools/**/*.ts"],
      exclude: ["src/generated/**", "src/vite-env.d.ts"],
      reporter: ["text", "json-summary"],
      reportOnFailure: true,
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 65,
        statements: 78,
        "src/engine/**": {
          lines: 90,
          functions: 88,
          branches: 70,
          statements: 84
        },
        "src/search/**": {
          lines: 95,
          functions: 90,
          branches: 75,
          statements: 90
        },
        "tools/content/build.ts": {
          lines: 80,
          functions: 90,
          branches: 72,
          statements: 80
        },
        "tools/images/publish-policy.ts": {
          lines: 100,
          functions: 100,
          branches: 90,
          statements: 100
        }
      }
    }
  }
});

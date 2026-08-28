import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: { environment: "node", include: ["src/__tests__/**/*.test.ts"] },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `import "server-only"` is a Next.js build-time guard with no runtime
      // module behind it. Stub it so server libs stay unit-testable — without
      // this, adding the guard to a file silently makes it untestable.
      "server-only": path.resolve(__dirname, "src/__tests__/stubs/server-only.ts"),
    },
  },
});

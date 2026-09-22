import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // `import "server-only"` is a Next.js boundary marker; in tests it is
      // just an empty module (the boundary doesn't exist under vitest).
      "server-only": resolve(__dirname, "src/test/stubs/server-only.ts"),
    },
  },
  test: {
    // Pure logic tests run in Node; component tests opt into jsdom with a
    // `// @vitest-environment jsdom` docblock.
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts", "src/lib/supabase/**"],
    },
  },
});

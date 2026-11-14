import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Builds also type-check tests; run their source once, not emitted copies.
    include: ['tests/**/*.test.ts']
  }
});

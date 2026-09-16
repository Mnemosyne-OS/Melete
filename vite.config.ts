import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standard configuration for Mnemosyne OS Cartridges
export default defineConfig({
  plugins: [react()],
  base: './', // Vital for custom protocols (mnemo-plugin://)
  server: {
    host: '127.0.0.1', // Forces IPv4 loopback binding for Electron compatibility
    port: 5217,        // Also declared in mnemo-plugin.json for dev-linking
    strictPort: true,
    cors: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true
  },
  // Vitest reads this straight from the Vite config so the cartridge needs no
  // `vitest/config` import it cannot resolve on its own. jsdom because the
  // surfaces worth asserting here are rendered ones: what a card shows when the
  // model returned nothing, and what the library says when no model is
  // reachable at all, are the honest-degradation paths this app is judged on.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}']
  }
} as UserConfig & { test: Record<string, unknown> });

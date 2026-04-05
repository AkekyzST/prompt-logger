import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    // Force Svelte's browser build for @testing-library/svelte under jsdom.
    // Without this, Vite resolves svelte/internal to the server entry which
    // throws `mount(...) is not available on the server`.
    conditions: ['browser'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
});

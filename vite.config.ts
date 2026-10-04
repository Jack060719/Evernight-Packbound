import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: {
    rolldownOptions: {
      output: { manualChunks: (id: string) => id.includes('node_modules/phaser') ? 'phaser' : undefined },
    },
  },
});

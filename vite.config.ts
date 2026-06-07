import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: false,
    minify: false,
    sourcemap: true,
    lib: {
      entry: 'src/index.ts',
      name: 'CocktailPlus',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: 'style.css',
      },
    },
    outDir: 'dist',
  },
});

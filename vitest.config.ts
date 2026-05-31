// Path: vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  // This tells the engine to handle the "chunks" error by 
  // ensuring the build doesn't try to split tiny node modules
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined, // Forces a flatter structure to bypass the 'de/chunks' crash
      },
    },
    commonjsOptions: {
      transformMixedEsModules: true, // Fixes those pesky node_modules compatibility issues
    },
  },
  // If your Agentic UI is scaling, we need to ensure local modules are optimized
  optimizeDeps: {
    include: ['lucide-react', 'framer-motion'], // Add your main UI libraries here
  }
});

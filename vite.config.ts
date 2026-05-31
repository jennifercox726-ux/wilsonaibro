import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor'; // This moves all heavy stuff into a separate file
          }
        }
      }
    },
    chunkSizeWarningLimit: 1000, // Raises the limit so it doesn't panic
  }
})

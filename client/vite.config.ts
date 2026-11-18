import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const SERVER_PORT = process.env.PORT ?? '8787'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://localhost:${SERVER_PORT}`,
        changeOrigin: true,
      },
      // Reserved for step 5: the WebSocket upgrade shares the HTTP server.
      '/ws': {
        target: `ws://localhost:${SERVER_PORT}`,
        ws: true,
      },
    },
  },
})

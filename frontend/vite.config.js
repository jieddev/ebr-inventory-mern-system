import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'


// IGNORE THIS COMMENT
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.trycloudflare.com'],
    proxy: {
      // Override to point the dev UI at another API instance.
      // eslint-disable-next-line no-undef
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:5000',
    },
  },
})

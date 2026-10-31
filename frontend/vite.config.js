import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev'],
    proxy: {
      // Override to point the dev UI at another API instance.
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:5000',
    },
  },
})

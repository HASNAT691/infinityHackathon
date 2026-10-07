import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Proxy /api to Express so the browser sees one origin (cookie works, no CORS).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:5000' } },
})

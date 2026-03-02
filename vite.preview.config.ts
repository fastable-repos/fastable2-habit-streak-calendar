import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  base: '/preview/',
  server: {
    allowedHosts: true,
    hmr: {
      clientPort: 443,
      // path is relative to base, so just '/' to get /preview/ (not /preview/preview/)
      path: '/',
      overlay: false, // Suppress error overlay — transient errors are normal during code generation
    },
  },
})

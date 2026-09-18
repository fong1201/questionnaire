import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In AWS, CloudFront serves the app and forwards /api/* to the load balancer,
// so the app always calls the API on its own origin. Locally, Vite proxies instead.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/questionnaire': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4001',
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/challenge/', // Debe ser /nombre-de-tu-repositorio/
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});

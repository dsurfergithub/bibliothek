import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Puerto asignado a esta app en el portfolio, para `npm run dev`. Con
  // strictPort falla en vez de saltar a otro puerto si está ocupado. (Las
  // herramientas de preview que pasan --port por CLI mandan sobre esto.)
  server: { port: 5177, strictPort: true },
});

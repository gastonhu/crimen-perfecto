import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base relativa: funciona tanto en local como en https://<usuario>.github.io/crimen-perfecto/
export default defineConfig({
  base: './',
  plugins: [react()],
});

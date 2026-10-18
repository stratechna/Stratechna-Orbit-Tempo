// A interface compila para dentro da app (orbit_tempo/public/frontend) com nomes fixos:
// as páginas www/tempo.html e www/cliente.html carregam tempo.js e tempo.css com ?v=<versão>.
// Compila-se no GitHub (workflow «Interface»), nunca no servidor do Orbit.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/assets/orbit_tempo/frontend/',
  build: {
    outDir: '../orbit_tempo/public/frontend',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: 'src/main.jsx',
      output: {
        entryFileNames: 'tempo.js',
        chunkFileNames: 'tempo-[name].js',
        assetFileNames: 'tempo.[ext]',
      },
    },
  },
})

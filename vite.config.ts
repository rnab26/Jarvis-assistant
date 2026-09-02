import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Base relatif : fonctionne à la fois pour GitHub Pages
  // (rnab26.github.io/Jarvis-assistant/) et pour l'app Android empaquetée
  // par Capacitor, qui sert les fichiers depuis la racine de son propre
  // serveur web interne (un base absolu comme "/Jarvis-assistant/" y
  // casserait tous les chemins).
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})

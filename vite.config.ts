import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Electron loads the packaged renderer from a file:// URL, so assets must
  // resolve relative to dist/index.html instead of the filesystem root.
  base: './',
  plugins: [react()],
})

import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
  server: {
    fs: {
      // Allow serving files from the uploads directory
      allow: ['..', 'uploads']
    }
  },
  publicDir: 'public',
  build: {
    // Ensure uploads directory is copied to build
    copyPublicDir: true
  }
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  // Build optimization: Split large dependencies into separate chunks
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // React core libraries
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "react-vendor";
          }
          // TipTap editor and extensions
          if (id.includes("node_modules/@tiptap/")) {
            return "tiptap";
          }
          // Markdown editor
          if (id.includes("node_modules/@uiw/react-md-editor/")) {
            return "md-editor";
          }
          // Emoji picker
          if (id.includes("node_modules/emoji-picker-react/")) {
            return "emoji-picker";
          }
          // Drag and drop
          if (id.includes("node_modules/@dnd-kit/")) {
            return "dnd-kit";
          }
          // Icons
          if (id.includes("node_modules/lucide-react/")) {
            return "lucide-icons";
          }
          // State management
          if (id.includes("node_modules/zustand/")) {
            return "zustand";
          }
        },
      },
    },
  },
}));

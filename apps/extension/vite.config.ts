import { resolve } from "node:path";
import { build as buildWithEsbuild } from "esbuild";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

function contentScriptPlugin(): Plugin {
  const entryPoint = resolve(__dirname, "src/contentScript.ts");
  const outfile = resolve(__dirname, "dist/contentScript.js");

  return {
    name: "readwebsite-content-script",
    buildStart() {
      this.addWatchFile(entryPoint);
    },
    async closeBundle() {
      await buildWithEsbuild({
        entryPoints: [entryPoint],
        bundle: true,
        format: "iife",
        target: "chrome116",
        outfile
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), contentScriptPlugin()],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        sidepanel: resolve(__dirname, "sidepanel.html"),
        offscreen: resolve(__dirname, "offscreen.html"),
        background: resolve(__dirname, "src/background.ts")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});

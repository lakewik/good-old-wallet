import { cpSync, mkdirSync, watch } from "fs";
import { getEntrypoints, srcDir, publicDir, distDir } from "./utils";

async function build() {
  const entrypoints = getEntrypoints();

  await Bun.build({
    entrypoints,
    outdir: distDir,
    minify: false,
    splitting: false,
    sourcemap: "external",
    target: "browser",
  });

  mkdirSync(distDir, { recursive: true });
  cpSync(publicDir, distDir, { recursive: true });

  console.log("✅ Build complete.");
}

const watching = process.argv.includes("--watch");
await build();

if (watching) {
  console.log("Watching for changes in src and public...");

  const watchDirs = [srcDir, publicDir];
  watchDirs.forEach((dir) => {
    watch(dir, { recursive: true }, async (event, filename) => {
      if (filename) {
        console.log(`File changed: ${filename}, rebuilding...`);
        await build();
      }
    });
  });
}

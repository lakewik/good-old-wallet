import { readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
export const srcDir = join(projectRoot, "src");
export const publicDir = join(projectRoot, "public");
export const distDir = join(projectRoot, "dist");

export function getAllFiles(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir, { withFileTypes: true });

  files.forEach((file) => {
    const filePath = join(dir, file.name);
    if (file.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });

  return fileList;
}

export function getEntrypoints(): string[] {
  const allSrcFiles = getAllFiles(srcDir);
  return allSrcFiles.filter(
    (file) =>
      (file.endsWith(".ts") || file.endsWith(".tsx") || file.endsWith(".js")) &&
      !file.endsWith(".d.ts"),
  );
}

export async function bundleFile(
  filePath: string,
  options: {
    minify?: boolean;
    sourcemap?: "inline" | "external" | "none";
  } = {},
) {
  const result = await Bun.build({
    entrypoints: [filePath],
    target: "browser",
    minify: options.minify ?? false,
    sourcemap: options.sourcemap ?? "inline",
  });

  if (!result.success) {
    throw new Error(
      `Build failed: ${result.logs.map((log) => log.message).join("\n")}`,
    );
  }

  const output = result.outputs[0];
  if (!output) {
    throw new Error("No output from build");
  }

  return output;
}

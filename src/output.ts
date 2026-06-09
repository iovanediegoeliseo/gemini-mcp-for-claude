/**
 * Output path resolution + PNG writing.
 *
 * Default directory is <cwd>/generated/<platform>, where cwd is the project
 * Claude Code was launched in -- so each project gets its own generated/ folder.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "image";
}

/**
 * Resolve (and create) the output directory.
 * - outDir absolute -> used as-is
 * - outDir relative -> joined onto cwd
 * - outDir omitted   -> <cwd>/generated/<platform>
 */
export function resolveOutDir(platform: string, outDir?: string): string {
  let base: string;
  if (outDir) {
    base = isAbsolute(outDir) ? outDir : join(process.cwd(), outDir);
  } else {
    base = join(process.cwd(), "generated", platform);
  }
  mkdirSync(base, { recursive: true });
  return base;
}

/** Write a PNG buffer; returns the absolute path written. */
export function writePng(dir: string, filename: string, data: Buffer): string {
  const name = filename.toLowerCase().endsWith(".png") ? filename : `${filename}.png`;
  const full = join(dir, name);
  writeFileSync(full, data);
  return full;
}

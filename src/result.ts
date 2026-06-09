/**
 * Shared helpers for reading input images and building MCP tool results.
 */

import { readFileSync, existsSync } from "node:fs";
import { extname } from "node:path";
import type { InlineImage } from "./gemini.js";

export function mimeFromPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".png":
    default:
      return "image/png";
  }
}

/** Read an image file from disk into an inlineData part. Throws if missing. */
export function readImageAsInline(path: string): InlineImage {
  if (!existsSync(path)) {
    throw new Error(`Image file not found: ${path}`);
  }
  const data = readFileSync(path);
  return { mimeType: mimeFromPath(path), base64: data.toString("base64") };
}

export interface SavedImage {
  path: string;
  base64: string;
}

/**
 * Build an MCP tool result: a text summary block followed by one image block
 * per saved image (so the client can preview/reason about the result inline).
 */
export function imageResult(textSummary: string, images: SavedImage[]) {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  > = [{ type: "text", text: textSummary }];
  for (const img of images) {
    content.push({ type: "image", data: img.base64, mimeType: "image/png" });
  }
  return { content };
}

/** Build an MCP error result that surfaces a message without crashing the server. */
export function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

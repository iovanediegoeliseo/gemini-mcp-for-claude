#!/usr/bin/env node
/**
 * MCP server: Gemini Social Image Generator.
 *
 * Generates on-brand social-media images via Google Gemini 2.5 Flash Image
 * ("Nano Banana"). Multi-tenant brand profiles, local per-project output.
 *
 * Transport: stdio (Claude Code spawns this process).
 */

import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Load .env from the SERVER directory (not the project cwd Claude launched in).
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, "..", ".env") });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerGeneratePostImage } from "./tools/generate_post_image.js";
import { registerEditPostImage } from "./tools/edit_post_image.js";
import { registerGenerateCarousel } from "./tools/generate_carousel.js";
import { registerComposeWithBrandAssets } from "./tools/compose_with_brand_assets.js";
import { listBrandKeys, brandsSource } from "./brand.js";

const server = new McpServer({
  name: "gemini-social-mcp-server",
  version: "1.0.0",
});

registerGeneratePostImage(server);
registerEditPostImage(server);
registerGenerateCarousel(server);
registerComposeWithBrandAssets(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Diagnostics go to stderr so they don't corrupt the stdio JSON-RPC stream.
  const source = brandsSource();
  const brands = listBrandKeys();
  console.error("gemini-social MCP server running on stdio");
  console.error(`  brands file: ${source ?? "(none — generic mode)"}`);
  console.error(`  brands: ${brands.length ? brands.join(", ") : "(none)"}`);
  if (!process.env.GEMINI_API_KEY) {
    console.error("  WARNING: GEMINI_API_KEY is not set — tool calls will return an error until it is.");
  }
}

main().catch((error) => {
  console.error("Fatal error starting gemini-social MCP server:", error);
  process.exit(1);
});

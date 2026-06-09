import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PLATFORM_KEYS, getPlatform, platformHelp } from "../platforms.js";
import { resolveBrand, brandPromptPrefix, brandNegativeClause } from "../brand.js";
import { callGemini } from "../gemini.js";
import { resolveOutDir, writePng, slugify } from "../output.js";
import { imageResult, errorResult } from "../result.js";

export function registerGeneratePostImage(server: McpServer): void {
  server.registerTool(
    "generate_post_image",
    {
      title: "Generate Social Post Image",
      description: `Generate a single on-brand social-media image with Gemini 2.5 Flash Image.

The platform sets the aspect ratio and resolution. The brand profile (palette, fonts,
voice, tagline, negative prompt) is prepended to your prompt so the result is on-brand.
The PNG is saved under <project>/generated/<platform>/ and also returned inline for preview.

Args:
  - prompt (string): What the image should depict (the creative brief).
  - platform (enum): One of: ${platformHelp()}.
  - brand (string, optional): Brand key (e.g. "onprint"). Omitted -> default brand. Unknown -> error listing valid keys.
  - outDir (string, optional): Output directory. Absolute used as-is; relative joined onto the project cwd. Default: <cwd>/generated/<platform>.
  - filename (string, optional): Output filename. Default: <slug-of-prompt>-<timestamp>.png.

Returns: a text block with the saved absolute path, brand, and platform, plus an image block (PNG).`,
      inputSchema: {
        prompt: z.string().min(1, "prompt is required").describe("Creative brief for the image"),
        platform: z.enum(PLATFORM_KEYS).describe("Target platform/format (sets aspect ratio + size)"),
        brand: z.string().optional().describe("Brand key; omit for the default brand"),
        outDir: z.string().optional().describe("Output directory (absolute or relative to cwd)"),
        filename: z.string().optional().describe("Output filename (.png appended if missing)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ prompt, platform, brand, outDir, filename }) => {
      try {
        const profile = resolveBrand(brand);
        const spec = getPlatform(platform);

        const prefix = brandPromptPrefix(profile);
        const negative = brandNegativeClause(profile);
        const format = `\n\nFormat: ${spec.description}, ${spec.aspectRatio} aspect ratio. Polished, high-quality, social-media ready.`;
        const fullPrompt = [prefix, prompt].filter(Boolean).join("\n\n") + negative + format;

        const { image, text } = await callGemini({
          textPrompt: fullPrompt,
          aspectRatio: spec.aspectRatio,
          imageSize: spec.imageSize,
        });

        const dir = resolveOutDir(platform, outDir);
        const name = filename ?? `${slugify(prompt)}-${Date.now()}.png`;
        const savedPath = writePng(dir, name, image);

        const summary =
          `Saved image to: ${savedPath}\n` +
          `Brand: ${profile?.displayName ?? "(generic — no brand applied)"}\n` +
          `Platform: ${platform} (${spec.aspectRatio}, ${spec.imageSize})` +
          (text ? `\nGemini note: ${text}` : "");

        return imageResult(summary, [{ path: savedPath, base64: image.toString("base64") }]);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

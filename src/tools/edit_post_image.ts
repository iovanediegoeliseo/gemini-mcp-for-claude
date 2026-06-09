import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PLATFORM_KEYS, getPlatform, platformHelp } from "../platforms.js";
import { resolveBrand, brandPromptPrefix, brandNegativeClause } from "../brand.js";
import { callGemini } from "../gemini.js";
import { resolveOutDir, writePng, slugify } from "../output.js";
import { imageResult, errorResult, readImageAsInline } from "../result.js";

export function registerEditPostImage(server: McpServer): void {
  server.registerTool(
    "edit_post_image",
    {
      title: "Edit Social Post Image",
      description: `Edit an existing image with Gemini 2.5 Flash Image, optionally re-framing for a platform.

Reads the source image, sends it alongside your edit instruction, and (if brand is given)
applies brand styling. If platform is omitted the source's aspect ratio is preserved; if
platform is given the image is re-framed to that aspect ratio.

Args:
  - prompt (string): The edit instruction (e.g. "add a bold 50% OFF badge, brighten the background").
  - sourceImagePath (string): Path to the image to edit (png/jpg/webp). Absolute or relative to cwd.
  - platform (enum, optional): Re-frame to this format. Omit to keep the source aspect ratio. One of: ${platformHelp()}.
  - brand (string, optional): Brand key. Omitted -> default brand. Unknown -> error listing valid keys.
  - outDir (string, optional): Output directory. Default: <cwd>/generated/<platform or "edited">.
  - filename (string, optional): Output filename. Default: <slug>-edit-<timestamp>.png.

Returns: a text block with the saved path plus an image block (PNG).`,
      inputSchema: {
        prompt: z.string().min(1, "prompt is required").describe("Edit instruction"),
        sourceImagePath: z.string().min(1).describe("Path to the source image (absolute or relative to cwd)"),
        platform: z.enum(PLATFORM_KEYS).optional().describe("Optional re-frame target; omit to keep source ratio"),
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
    async ({ prompt, sourceImagePath, platform, brand, outDir, filename }) => {
      try {
        const profile = resolveBrand(brand);
        const source = readImageAsInline(sourceImagePath);
        const spec = platform ? getPlatform(platform) : null;

        const prefix = brandPromptPrefix(profile);
        const negative = brandNegativeClause(profile);
        const reframe = spec
          ? `\n\nRe-frame the result to a ${spec.aspectRatio} ${spec.description}.`
          : "";
        const fullPrompt =
          [prefix, `Edit the supplied image: ${prompt}`].filter(Boolean).join("\n\n") + reframe + negative;

        const { image, text } = await callGemini({
          textPrompt: fullPrompt,
          inlineImages: [source],
          aspectRatio: spec?.aspectRatio,
          imageSize: spec?.imageSize ?? "2K",
        });

        const subdir = platform ?? "edited";
        const dir = resolveOutDir(subdir, outDir);
        const name = filename ?? `${slugify(prompt)}-edit-${Date.now()}.png`;
        const savedPath = writePng(dir, name, image);

        const summary =
          `Saved edited image to: ${savedPath}\n` +
          `Source: ${sourceImagePath}\n` +
          `Brand: ${profile?.displayName ?? "(generic — no brand applied)"}\n` +
          `Platform: ${platform ?? "(source aspect ratio preserved)"}` +
          (text ? `\nGemini note: ${text}` : "");

        return imageResult(summary, [{ path: savedPath, base64: image.toString("base64") }]);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

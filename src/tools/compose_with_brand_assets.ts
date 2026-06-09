import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PLATFORM_KEYS, getPlatform, platformHelp } from "../platforms.js";
import { resolveBrand, brandPromptPrefix, brandNegativeClause } from "../brand.js";
import { callGemini, type InlineImage } from "../gemini.js";
import { resolveOutDir, writePng, slugify } from "../output.js";
import { imageResult, errorResult, readImageAsInline } from "../result.js";
import { existsSync } from "node:fs";

export function registerComposeWithBrandAssets(server: McpServer): void {
  server.registerTool(
    "compose_with_brand_assets",
    {
      title: "Compose With Brand Assets",
      description: `Compose a scene that fuses the brand logo and/or supplied product images using Gemini 2.5 Flash Image.

The brand's logoPath (if includeLogo) and any extraAssetPaths are sent as image inputs.
Gemini is instructed to use the logo as-is (not redraw it) and to compose the product
image(s) into the described scene. Great for product announcements where the real logo /
product must appear faithfully.

Args:
  - prompt (string): Scene description (e.g. "a bright retail counter with the product on display").
  - platform (enum): Output format. One of: ${platformHelp()}.
  - brand (string, optional): Brand key. Omitted -> default brand. The logo comes from this brand's logoPath.
  - extraAssetPaths (string[], optional): Extra image paths to compose in (product shots, etc.).
  - includeLogo (boolean): Include the brand logo as an input. Default true. (If the brand has no logoPath or the file is missing, it is skipped with a note.)
  - logoPlacement (string, optional): Where to place the logo. Default "bottom-right".
  - outDir (string, optional): Output directory. Default: <cwd>/generated/<platform>.
  - filename (string, optional): Output filename. Default: <slug>-compose-<timestamp>.png.

Returns: a text block (saved path, assets used) plus an image block (PNG).`,
      inputSchema: {
        prompt: z.string().min(1, "prompt is required").describe("Scene description"),
        platform: z.enum(PLATFORM_KEYS).describe("Output format (sets aspect ratio + size)"),
        brand: z.string().optional().describe("Brand key; omit for the default brand"),
        extraAssetPaths: z
          .array(z.string())
          .optional()
          .describe("Extra image paths to compose in (product shots, etc.)"),
        includeLogo: z.boolean().default(true).describe("Include the brand logo as an input image"),
        logoPlacement: z.string().default("bottom-right").describe("Where to place the logo"),
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
    async ({ prompt, platform, brand, extraAssetPaths, includeLogo, logoPlacement, outDir, filename }) => {
      try {
        const profile = resolveBrand(brand);
        const spec = getPlatform(platform);

        const inlineImages: InlineImage[] = [];
        const usedAssets: string[] = [];
        const notes: string[] = [];

        // Logo
        let logoIncluded = false;
        if (includeLogo) {
          if (profile?.logoPath && existsSync(profile.logoPath)) {
            inlineImages.push(readImageAsInline(profile.logoPath));
            usedAssets.push(`logo: ${profile.logoPath}`);
            logoIncluded = true;
          } else if (profile?.logoPath) {
            notes.push(`Logo skipped — file not found at ${profile.logoPath}.`);
          } else {
            notes.push("Logo skipped — the resolved brand has no logoPath.");
          }
        }

        // Extra assets
        for (const p of extraAssetPaths ?? []) {
          inlineImages.push(readImageAsInline(p)); // throws with a clear message if missing
          usedAssets.push(`asset: ${p}`);
        }

        const prefix = brandPromptPrefix(profile);
        const negative = brandNegativeClause(profile);
        const composeInstr: string[] = [];
        if (logoIncluded) {
          composeInstr.push(
            `Use the supplied logo image exactly as-is — do not redraw, restyle, or distort it. Place it ${logoPlacement}, appropriately sized and legible.`,
          );
        }
        if ((extraAssetPaths?.length ?? 0) > 0) {
          composeInstr.push("Compose the supplied product image(s) naturally into the scene, preserving their real appearance.");
        }

        const fullPrompt =
          [prefix, prompt, composeInstr.join(" ")].filter(Boolean).join("\n\n") +
          negative +
          `\n\nFormat: ${spec.description}, ${spec.aspectRatio} aspect ratio. Polished, social-media ready.`;

        const { image, text } = await callGemini({
          textPrompt: fullPrompt,
          inlineImages,
          aspectRatio: spec.aspectRatio,
          imageSize: spec.imageSize,
        });

        const dir = resolveOutDir(platform, outDir);
        const name = filename ?? `${slugify(prompt)}-compose-${Date.now()}.png`;
        const savedPath = writePng(dir, name, image);

        const summary =
          `Saved composed image to: ${savedPath}\n` +
          `Brand: ${profile?.displayName ?? "(generic — no brand applied)"}\n` +
          `Platform: ${platform} (${spec.aspectRatio}, ${spec.imageSize})\n` +
          `Inputs used: ${usedAssets.length ? usedAssets.join("; ") : "(none — text-only composition)"}` +
          (notes.length ? `\nNotes: ${notes.join(" ")}` : "") +
          (text ? `\nGemini note: ${text}` : "");

        return imageResult(summary, [{ path: savedPath, base64: image.toString("base64") }]);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PLATFORM_KEYS, getPlatform, platformHelp } from "../platforms.js";
import { resolveBrand, brandPromptPrefix, brandNegativeClause } from "../brand.js";
import { callGemini } from "../gemini.js";
import { resolveOutDir, writePng, slugify } from "../output.js";
import { imageResult, errorResult, type SavedImage } from "../result.js";

export function registerGenerateCarousel(server: McpServer): void {
  server.registerTool(
    "generate_carousel",
    {
      title: "Generate Social Carousel",
      description: `Generate a style-consistent multi-slide carousel with Gemini 2.5 Flash Image.

Slide 1 is generated from the brief + brand prefix. Each subsequent slide is generated
with slide 1 passed back in as a style anchor (the standard Nano Banana pattern), so the
palette, layout and typography stay identical across the set. Files are saved as
<slug>-slide-01.png, -slide-02.png, ...

Args:
  - brief (string): The overall topic/story of the carousel.
  - slides (int 2-10): Number of slides.
  - platform (enum): Format for every slide. Default "instagram_portrait". One of: ${platformHelp()}.
  - slideTopics (string[], optional): Per-slide sub-topics/headlines. If provided, item i is used for slide i+1; otherwise generic "point N of the story" prompts are used.
  - brand (string, optional): Brand key. Omitted -> default brand.
  - outDir (string, optional): Output directory. Default: <cwd>/generated/<platform>.

Returns: a text block listing every saved path plus one image block per slide.`,
      inputSchema: {
        brief: z.string().min(1, "brief is required").describe("Overall carousel topic/story"),
        slides: z.number().int().min(2).max(10).describe("Number of slides (2-10)"),
        platform: z.enum(PLATFORM_KEYS).default("instagram_portrait").describe("Format for all slides"),
        slideTopics: z
          .array(z.string())
          .optional()
          .describe("Optional per-slide sub-topics; item i -> slide i+1"),
        brand: z.string().optional().describe("Brand key; omit for the default brand"),
        outDir: z.string().optional().describe("Output directory (absolute or relative to cwd)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ brief, slides, platform, slideTopics, brand, outDir }) => {
      try {
        const profile = resolveBrand(brand);
        const spec = getPlatform(platform);
        const prefix = brandPromptPrefix(profile);
        const negative = brandNegativeClause(profile);
        const slug = slugify(brief);
        const dir = resolveOutDir(platform, outDir);

        const topicFor = (n: number): string => {
          const t = slideTopics?.[n - 1];
          return t ? `Slide ${n} of ${slides} — ${t}.` : `Slide ${n} of ${slides} — present point ${n} of the story.`;
        };

        const saved: SavedImage[] = [];
        const paths: string[] = [];

        // Slide 1: establishes the visual system.
        const firstPrompt =
          [prefix, `Carousel about: ${brief}.`, topicFor(1)].filter(Boolean).join("\n\n") +
          `\n\nThis is the opening slide and sets the visual system (layout, palette, typography) for the whole set.` +
          negative +
          `\n\nFormat: ${spec.description}, ${spec.aspectRatio} aspect ratio. Polished, social-media ready.`;

        const first = await callGemini({
          textPrompt: firstPrompt,
          aspectRatio: spec.aspectRatio,
          imageSize: spec.imageSize,
        });
        const firstPath = writePng(dir, `${slug}-slide-01.png`, first.image);
        const firstBase64 = first.image.toString("base64");
        saved.push({ path: firstPath, base64: firstBase64 });
        paths.push(firstPath);

        // Slides 2..N: anchored to slide 1 for consistency.
        for (let n = 2; n <= slides; n++) {
          const slidePrompt =
            [prefix, `Carousel about: ${brief}.`].filter(Boolean).join("\n\n") +
            `\n\nMaintain an identical visual style, palette, layout system and typography as the supplied reference image (slide 1). ` +
            topicFor(n) +
            negative +
            `\n\nFormat: ${spec.description}, ${spec.aspectRatio} aspect ratio.`;

          const slide = await callGemini({
            textPrompt: slidePrompt,
            inlineImages: [{ mimeType: "image/png", base64: firstBase64 }],
            aspectRatio: spec.aspectRatio,
            imageSize: spec.imageSize,
          });
          const num = String(n).padStart(2, "0");
          const slidePath = writePng(dir, `${slug}-slide-${num}.png`, slide.image);
          saved.push({ path: slidePath, base64: slide.image.toString("base64") });
          paths.push(slidePath);
        }

        const summary =
          `Generated ${slides}-slide carousel (${platform}, ${spec.aspectRatio}).\n` +
          `Brand: ${profile?.displayName ?? "(generic — no brand applied)"}\n` +
          `Saved:\n${paths.map((p) => `  - ${p}`).join("\n")}`;

        return imageResult(summary, saved);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

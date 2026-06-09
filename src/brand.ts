/**
 * Multi-tenant brand profiles.
 *
 * Resolution order for the brands file:
 *   1. process.env.GEMINI_SOCIAL_BRANDS_PATH (if it exists)
 *   2. <repo>/brands.json
 *   3. <repo>/brands.example.json   (so the server works out of the box)
 *   4. none -> generic (no brand) mode
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const BrandSchema = z.object({
  displayName: z.string(),
  palette: z.record(z.string()).optional(),
  fonts: z.record(z.string()).optional(),
  voice: z.string().optional(),
  tagline: z.string().optional(),
  logoPath: z.string().optional(),
  negativePrompt: z.string().optional(),
});

const BrandsFileSchema = z.object({
  defaultBrand: z.string().optional(),
  brands: z.record(BrandSchema),
});

export type Brand = z.infer<typeof BrandSchema> & { key: string };

export class UnknownBrandError extends Error {
  constructor(name: string, available: string[]) {
    const list = available.length ? available.join(", ") : "(none configured)";
    super(`Unknown brand "${name}". Available brands: ${list}.`);
    this.name = "UnknownBrandError";
  }
}

interface LoadedBrands {
  defaultBrand?: string;
  brands: Record<string, Brand>;
  source: string | null;
}

let cache: LoadedBrands | null = null;

function resolveBrandsPath(): string | null {
  const envPath = process.env.GEMINI_SOCIAL_BRANDS_PATH;
  if (envPath) {
    if (existsSync(envPath)) return envPath;
    console.error(`[brand] GEMINI_SOCIAL_BRANDS_PATH set to "${envPath}" but file not found; falling back.`);
  }
  const repoBrands = join(repoRoot, "brands.json");
  if (existsSync(repoBrands)) return repoBrands;
  const example = join(repoRoot, "brands.example.json");
  if (existsSync(example)) return example;
  return null;
}

function loadBrands(): LoadedBrands {
  if (cache) return cache;
  const path = resolveBrandsPath();
  if (!path) {
    cache = { brands: {}, source: null };
    return cache;
  }
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const parsed = BrandsFileSchema.parse(raw);
  const brands: Record<string, Brand> = {};
  for (const [key, b] of Object.entries(parsed.brands)) {
    brands[key] = { ...b, key };
  }
  cache = { defaultBrand: parsed.defaultBrand, brands, source: path };
  return cache;
}

export function listBrandKeys(): string[] {
  return Object.keys(loadBrands().brands);
}

export function brandsSource(): string | null {
  return loadBrands().source;
}

/**
 * Resolve a brand profile.
 * Fallback chain: explicit name -> defaultBrand -> null (generic).
 * Throws UnknownBrandError if an explicit name is given but not found.
 */
export function resolveBrand(name?: string): Brand | null {
  const { defaultBrand, brands } = loadBrands();
  if (name) {
    const found = brands[name];
    if (found) return found;
    throw new UnknownBrandError(name, Object.keys(brands));
  }
  if (defaultBrand && brands[defaultBrand]) return brands[defaultBrand];
  return null;
}

/** Stringify a brand profile into a prompt prefix for Gemini. */
export function brandPromptPrefix(brand: Brand | null): string {
  if (!brand) return "";
  const lines: string[] = [`Brand: ${brand.displayName}.`];
  if (brand.palette && Object.keys(brand.palette).length) {
    const pal = Object.entries(brand.palette)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");
    lines.push(`Brand color palette: ${pal}. Use these colors prominently and consistently.`);
  }
  if (brand.fonts && Object.keys(brand.fonts).length) {
    const fonts = Object.entries(brand.fonts)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");
    lines.push(`Typography style (render any text in these or visually similar fonts): ${fonts}.`);
  }
  if (brand.voice) lines.push(`Visual voice / tone: ${brand.voice}.`);
  if (brand.tagline) lines.push(`Tagline (include only if it fits the composition naturally): "${brand.tagline}".`);
  return lines.join(" ");
}

/** The brand's negative prompt formatted as an "Avoid:" clause, or "". */
export function brandNegativeClause(brand: Brand | null): string {
  if (!brand?.negativePrompt) return "";
  return ` Avoid: ${brand.negativePrompt}.`;
}

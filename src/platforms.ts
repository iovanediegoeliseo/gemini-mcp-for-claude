/**
 * Platform -> aspect ratio / resolution map.
 *
 * Every aspectRatio here is within the set Gemini 2.5 Flash Image supports:
 * 1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9.
 */

export interface PlatformSpec {
  aspectRatio: string;
  imageSize: string;
  description: string;
}

export const PLATFORMS = {
  instagram_square: {
    aspectRatio: "1:1",
    imageSize: "2K",
    description: "Instagram feed post (square)",
  },
  instagram_portrait: {
    aspectRatio: "4:5",
    imageSize: "2K",
    description: "Instagram feed post (portrait, taller, more reach)",
  },
  instagram_story: {
    aspectRatio: "9:16",
    imageSize: "2K",
    description: "Instagram story / Reel cover (full-screen vertical)",
  },
  facebook_feed: {
    aspectRatio: "1:1",
    imageSize: "2K",
    description: "Facebook feed post",
  },
  facebook_cover: {
    aspectRatio: "16:9",
    imageSize: "2K",
    description: "Facebook page cover (wide landscape)",
  },
  linkedin_feed: {
    aspectRatio: "1:1",
    imageSize: "2K",
    description: "LinkedIn feed post",
  },
  linkedin_landscape: {
    aspectRatio: "16:9",
    imageSize: "2K",
    description: "LinkedIn article header / company post (landscape)",
  },
} as const satisfies Record<string, PlatformSpec>;

export type PlatformKey = keyof typeof PLATFORMS;

/** Non-empty tuple of platform keys, suitable for z.enum(...). */
export const PLATFORM_KEYS = Object.keys(PLATFORMS) as [PlatformKey, ...PlatformKey[]];

export function getPlatform(key: PlatformKey): PlatformSpec {
  return PLATFORMS[key];
}

/** Human-readable list used in tool descriptions. */
export function platformHelp(): string {
  return PLATFORM_KEYS.map((k) => `${k} (${PLATFORMS[k].aspectRatio} — ${PLATFORMS[k].description})`).join("; ");
}

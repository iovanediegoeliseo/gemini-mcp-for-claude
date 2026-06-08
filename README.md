# gemini-social MCP server

An [MCP](https://modelcontextprotocol.io) server that generates **on-brand
social-media images** via Google **Gemini 2.5 Flash Image** ("Nano Banana").
Register it once at the user level and call it from any project on the machine.

- Platforms: Instagram (square / portrait / story), Facebook (feed / cover),
  LinkedIn (feed / landscape).
- **Multi-tenant branding** — one server, many brand profiles (`onprint`,
  `smartpos`, `smartcalendar`, …). The right palette / fonts / voice / logo is
  applied per request.
- Images saved **locally, per project** (`<project>/generated/<platform>/`).
- Four tools: `generate_post_image`, `edit_post_image`, `generate_carousel`,
  `compose_with_brand_assets`.

## Requirements

- Node ≥ 20
- A Gemini API key with access to `gemini-2.5-flash-image`.

## Setup

```bash
cd mcp-gemini-social
npm install
npm run build

# Provide your API key (loaded from the server's own directory at startup):
cp .env.example .env
#   then edit .env and set GEMINI_API_KEY=...
```

### Brand profiles

Brand profiles live in a `brands.json`. The server resolves it in this order:

1. `GEMINI_SOCIAL_BRANDS_PATH` (if set and the file exists)
2. `<repo>/brands.json`
3. `<repo>/brands.example.json` (so the server runs out of the box)
4. none → generic mode (no brand styling)

`brands.json` is **gitignored**. To keep brand details out of source control,
copy the example somewhere private and point the env var at it:

```bash
# e.g. C:/Users/smart/.config/gemini-social/brands.json
```

Each brand:

```jsonc
{
  "defaultBrand": "onprint",
  "brands": {
    "onprint": {
      "displayName": "OnPrint",
      "palette": { "primary": "#0B5FFF", "accent": "#FFB400", "neutral": "#0F172A" },
      "fonts": { "headline": "Inter Bold", "body": "Inter Regular" },
      "voice": "Professional, friendly, retail-tech focused",
      "tagline": "Print smart. Sell fast.",
      "logoPath": "C:/path/to/logo.png",
      "negativePrompt": "no stock-photo people, no lens flare, no clip-art"
    }
  }
}
```

Only `displayName` is required; everything else is optional. The profile is
stringified into the prompt prefix; `logoPath` is loaded as an image input by
`compose_with_brand_assets`.

## Register with Claude Code (user-level)

Add to `~/.claude.json` (Windows: `C:/Users/<you>/.claude.json`) under
`mcpServers`:

```json
{
  "mcpServers": {
    "gemini-social": {
      "command": "node",
      "args": ["C:/Users/smart/Desktop/projects/mcp-gemini-social/dist/index.js"],
      "env": {
        "GEMINI_SOCIAL_BRANDS_PATH": "C:/Users/smart/.config/gemini-social/brands.json"
      }
    }
  }
}
```

The `GEMINI_API_KEY` is read from the server's `.env`, so it does **not** need to
go in `~/.claude.json`. (You may put it in the `env` block instead if you
prefer — either works; env vars in `~/.claude.json` take precedence.)

## Tools

| Tool | Purpose |
| ---- | ------- |
| `generate_post_image` | Generate one on-brand image for a platform. |
| `edit_post_image` | Edit an existing image; optionally re-frame to a platform. |
| `generate_carousel` | 2–10 style-consistent slides (slide 1 anchors the style). |
| `compose_with_brand_assets` | Fuse the brand logo / product shots into a scene. |

Every tool accepts an optional `brand` key (defaults to `defaultBrand`). Output
goes to `<cwd>/generated/<platform>/` unless `outDir` is given.

### Platforms

| key | aspect | use |
| --- | ------ | --- |
| `instagram_square` | 1:1 | Feed post |
| `instagram_portrait` | 4:5 | Feed post (more reach) |
| `instagram_story` | 9:16 | Story / Reel cover |
| `facebook_feed` | 1:1 | Feed post |
| `facebook_cover` | 16:9 | Page cover |
| `linkedin_feed` | 1:1 | Feed post |
| `linkedin_landscape` | 16:9 | Article header / company post |

## Verify

```bash
# Build, then inspect with the MCP Inspector:
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

In the Inspector, confirm all four tools appear, then call
`generate_post_image` with:

```json
{ "prompt": "summer sale 50% off retail tech", "platform": "instagram_square", "brand": "onprint" }
```

The PNG lands in `./generated/instagram_square/`.

## Notes / failure modes

- **Missing `GEMINI_API_KEY`** → tools return a clear error; the server still
  starts (it logs a warning to stderr).
- **Unknown brand key** → error lists the available brands.
- **Gemini refuses** (returns text, no image) → that text is surfaced verbatim.

## Out of scope (v1)

Google Drive upload, caption generation, auto-posting to Meta/LinkedIn,
upscaling beyond `imageSize: 2K`, web UI.
# gemini-mcp-for-claude

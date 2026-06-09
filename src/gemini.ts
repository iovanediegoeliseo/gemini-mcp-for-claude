/**
 * Thin wrapper over @google/genai for Gemini 2.5 Flash Image ("Nano Banana").
 *
 * One call handles generation, editing, and multi-image fusion -- the difference
 * is just which inlineImages you pass in.
 */

import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.5-flash-image";

export interface InlineImage {
  mimeType: string;
  base64: string;
}

export interface GeminiCallParams {
  textPrompt: string;
  inlineImages?: InlineImage[];
  /** Omit to let Gemini preserve the source image's aspect ratio (editing). */
  aspectRatio?: string;
  imageSize?: string;
}

export interface GeminiResult {
  image: Buffer;
  /** Any text Gemini returned alongside the image (often null). */
  text: string | null;
}

/** Thrown when Gemini returns no image (e.g. a safety refusal). */
export class GeminiNoImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiNoImageError";
  }
}

interface RequestPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface ResponsePart {
  text?: string;
  inlineData?: { data?: string; mimeType?: string };
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to the .env file in the server directory " +
        "(mcp-gemini-social/.env) or to the MCP server's env config in ~/.claude.json.",
    );
  }
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

export async function callGemini(params: GeminiCallParams): Promise<GeminiResult> {
  const ai = getClient();

  const parts: RequestPart[] = [{ text: params.textPrompt }];
  for (const img of params.inlineImages ?? []) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
  }

  const imageConfig: { aspectRatio?: string; imageSize: string } = {
    imageSize: params.imageSize ?? "2K",
  };
  if (params.aspectRatio) imageConfig.aspectRatio = params.aspectRatio;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig,
    },
  });

  const candidate = response.candidates?.[0];
  const responseParts = (candidate?.content?.parts ?? []) as ResponsePart[];

  let image: Buffer | null = null;
  const texts: string[] = [];
  for (const part of responseParts) {
    if (!image && part.inlineData?.data) {
      image = Buffer.from(part.inlineData.data, "base64");
    } else if (part.text) {
      texts.push(part.text);
    }
  }

  const text = texts.length ? texts.join("\n").trim() : null;

  if (!image) {
    const finishReason = candidate?.finishReason;
    const blockReason = response.promptFeedback?.blockReason;
    const pieces = [
      text,
      blockReason ? `Blocked: ${blockReason}` : null,
      finishReason && finishReason !== "STOP" ? `Finish reason: ${finishReason}` : null,
    ].filter(Boolean);
    const reason = pieces.length
      ? pieces.join(" | ")
      : "Gemini returned no image. The prompt may have been rejected by safety filters.";
    throw new GeminiNoImageError(reason);
  }

  return { image, text };
}

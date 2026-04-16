import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODEL = "claude-sonnet-4-20250514" as const;
export const CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-20251001" as const;

export function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY. Set it in your environment (e.g. .env.local).",
    );
  }
  return new Anthropic({ apiKey });
}


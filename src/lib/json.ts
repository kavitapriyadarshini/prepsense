export function cleanJSON(response: string): string {
  const trimmed = response.trim();
  // Common case: the entire response is wrapped in a JSON code fence.
  const fullFence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fullFence?.[1]) return fullFence[1].trim();

  // Fallback: strip any backtick fences that might be present anywhere.
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
}

function cleanJsonCandidate(input: string): string {
  return input
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function getCandidates(text: string): string[] {
  const trimmed = cleanJSON(text);
  const out: string[] = [trimmed];

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) out.push(fenceMatch[1]);

  const startObj = trimmed.indexOf("{");
  const endObj = trimmed.lastIndexOf("}");
  if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
    out.push(trimmed.slice(startObj, endObj + 1));
  }

  return out;
}

export function extractJsonObject(text: string): unknown {
  const candidates = getCandidates(text).map(cleanJsonCandidate);
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
    }
  }

  throw new Error(
    `Model returned malformed JSON. Parse attempts failed: ${errors.join(" | ")}`,
  );
}


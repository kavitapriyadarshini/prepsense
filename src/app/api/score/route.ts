import { NextResponse } from "next/server";
import { CLAUDE_MODEL, getAnthropicClient } from "@/lib/anthropic";
import { extractJsonObject } from "@/lib/json";

export const runtime = "nodejs";

type ScoreRequest = {
  jobDescription: string;
  questions: Array<{ id: string; question: string; competency?: string }>;
  answers: Record<string, string>;
};

type ScoreResponse = {
  results: Array<{
    id: string;
    star: { score: number; notes: string; missing: string[] };
    metrics: { score: number; notes: string };
    relevance: { score: number; notes: string };
    overall: { score: number; one_liner: string };
    improved_answer_bullets: string[];
  }>;
};

async function parseOrRepairJson<T>(rawText: string): Promise<T> {
  try {
    return extractJsonObject(rawText) as T;
  } catch {
    const anthropic = getAnthropicClient();
    const repair = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2600,
      temperature: 0,
      system:
        "You repair malformed JSON. Return ONLY valid JSON. Do not add explanation.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Repair the malformed JSON below and return only corrected JSON.\n\n" +
                rawText,
            },
          ],
        },
      ],
    });
    const repairedText = repair.content
      .map((c) => ("text" in c ? c.text : ""))
      .join("\n");
    return extractJsonObject(repairedText) as T;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ScoreRequest>;
    const jobDescription = (body.jobDescription ?? "").trim();
    const questions = body.questions ?? [];
    const answers = body.answers ?? {};

    if (!jobDescription) {
      return NextResponse.json(
        { error: "Missing jobDescription" },
        { status: 400 },
      );
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: "Missing questions" }, { status: 400 });
    }

    const scoredInput = questions.map((q) => ({
      id: q.id,
      question: q.question,
      competency: q.competency ?? "",
      answer: (answers[q.id] ?? "").trim(),
    }));

    const anthropic = getAnthropicClient();
    const resp = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1800,
      temperature: 0.2,
      system:
        "You are a strict PM interview coach. Return ONLY valid JSON (no markdown). Be consistent and concise.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Step 3 — Score answers.\n" +
                "Score each answer on three criteria:\n" +
                "- STAR structure: Situation/Task/Action/Result present and clear\n" +
                "- Use of metrics: numbers, impact, measurable outcomes\n" +
                "- Relevance to JD: maps to the role's needs and signals\n\n" +
                "Scoring scale for each criterion: 0 to 5 (integers).\n" +
                "Overall score: 0 to 10 (integers), roughly combining the above.\n\n" +
                "If an answer is empty, score it low and explain what to add.\n\n" +
                "Return JSON with this exact shape:\n" +
                "{\n" +
                '  "results": [{\n' +
                '    "id": string,\n' +
                '    "star": {"score": number, "notes": string, "missing": string[]},\n' +
                '    "metrics": {"score": number, "notes": string},\n' +
                '    "relevance": {"score": number, "notes": string},\n' +
                '    "overall": {"score": number, "one_liner": string},\n' +
                '    "improved_answer_bullets": string[]\n' +
                "  }]\n" +
                "}\n\n" +
                "Job description:\n" +
                jobDescription +
                "\n\nQ&A (JSON):\n" +
                JSON.stringify(scoredInput),
            },
          ],
        },
      ],
    });

    const text = resp.content.map((c) => ("text" in c ? c.text : "")).join("\n");
    const json = await parseOrRepairJson<ScoreResponse>(text);

    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


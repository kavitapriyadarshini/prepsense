import { NextResponse } from "next/server";
import { CLAUDE_HAIKU_MODEL, getAnthropicClient } from "@/lib/anthropic";
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

type ScoreResult = ScoreResponse["results"][number];

async function parseOrRepairJson<T>(rawText: string): Promise<T> {
  try {
    return extractJsonObject(rawText) as T;
  } catch {
    const anthropic = getAnthropicClient();
    const repair = await anthropic.messages.create({
      model: CLAUDE_HAIKU_MODEL,
      max_tokens: 1000,
      temperature: 0,
      system:
        "You repair malformed JSON. Return only valid JSON with no markdown formatting, no code blocks, and no backticks. Do not add explanation.",
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

async function scoreSingleAnswer(input: {
  jobDescription: string;
  id: string;
  question: string;
  competency: string;
  answer: string;
}): Promise<ScoreResult> {
  const anthropic = getAnthropicClient();
  const resp = await anthropic.messages.create({
    model: CLAUDE_HAIKU_MODEL,
    max_tokens: 1000,
    temperature: 0.2,
    system:
      "You are a strict PM interview coach. Return only valid JSON with no markdown formatting, no code blocks, and no backticks. Be consistent and concise.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Step 3 — Score one answer.\n" +
              "Score this answer on three criteria:\n" +
              "- STAR structure: Situation/Task/Action/Result present and clear\n" +
              "- Use of metrics: numbers, impact, measurable outcomes\n" +
              "- Relevance to JD: maps to the role's needs and signals\n\n" +
              "Scoring scale for each criterion: 0 to 5 (integers).\n" +
              "Overall score: 0 to 10 (integer).\n" +
              "If the answer is empty, score it low and explain what to add.\n\n" +
              "Return JSON with this exact shape:\n" +
              "{\n" +
              '  "id": string,\n' +
              '  "star": {"score": number, "notes": string, "missing": string[]},\n' +
              '  "metrics": {"score": number, "notes": string},\n' +
              '  "relevance": {"score": number, "notes": string},\n' +
              '  "overall": {"score": number, "one_liner": string},\n' +
              '  "improved_answer_bullets": string[]\n' +
              "}\n\n" +
              "Job description:\n" +
              input.jobDescription +
              "\n\nQuestion:\n" +
              input.question +
              "\n\nCompetency:\n" +
              input.competency +
              "\n\nAnswer:\n" +
              input.answer +
              "\n\nThe returned id must be exactly: " +
              input.id,
          },
        ],
      },
    ],
  });

  const text = resp.content.map((c) => ("text" in c ? c.text : "")).join("\n");
  const result = await parseOrRepairJson<ScoreResult>(text);
  return { ...result, id: result.id || input.id };
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

    const results = await Promise.all(
      scoredInput.map((item) =>
        scoreSingleAnswer({
          jobDescription,
          id: item.id,
          question: item.question,
          competency: item.competency,
          answer: item.answer,
        }),
      ),
    );

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


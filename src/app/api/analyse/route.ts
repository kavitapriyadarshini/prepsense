import { NextResponse } from "next/server";
import { CLAUDE_MODEL, getAnthropicClient } from "@/lib/anthropic";
import { extractJsonObject } from "@/lib/json";

export const runtime = "nodejs";

type Step1Signals = {
  pm_signals: Array<{
    skill: string;
    evidence_from_jd: string;
    why_it_matters: string;
  }>;
  competencies: string[];
  seniority_guess: "Intern" | "Junior" | "Mid" | "Senior" | "Lead" | "Unknown";
  notes: string;
};

type Step2Questions = {
  questions: Array<{
    id: string;
    question: string;
    competency: string;
    what_good_looks_like: string;
  }>;
};

async function parseOrRepairJson<T>(rawText: string): Promise<T> {
  try {
    return extractJsonObject(rawText) as T;
  } catch {
    const anthropic = getAnthropicClient();
    const repair = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2200,
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
    const body = (await req.json()) as { jobDescription?: string };
    const jobDescription = (body.jobDescription ?? "").trim();
    if (!jobDescription) {
      return NextResponse.json(
        { error: "Missing jobDescription" },
        { status: 400 },
      );
    }

    const anthropic = getAnthropicClient();

    const step1 = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 900,
      temperature: 0.2,
      system:
        "You are an expert Product Management interviewer. Return ONLY valid JSON (no markdown).",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Step 1 — Extract signals.\n" +
                "Given this job description, infer what PM skills and competencies the company is testing for.\n\n" +
                "Return JSON with this exact shape:\n" +
                "{\n" +
                '  "pm_signals": [{"skill": string, "evidence_from_jd": string, "why_it_matters": string}],\n' +
                '  "competencies": string[],\n' +
                '  "seniority_guess": "Intern"|"Junior"|"Mid"|"Senior"|"Lead"|"Unknown",\n' +
                '  "notes": string\n' +
                "}\n\n" +
                "Job description:\n" +
                jobDescription,
            },
          ],
        },
      ],
    });

    const step1Text = step1.content
      .map((c) => ("text" in c ? c.text : ""))
      .join("\n");
    const signals = await parseOrRepairJson<Step1Signals>(step1Text);

    const step2 = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      temperature: 0.4,
      system:
        "You are an expert Product Management interviewer. Return ONLY valid JSON (no markdown).",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Step 2 — Generate questions.\n" +
                "Using the job description and extracted signals, generate 8 tailored PM interview questions.\n" +
                "Questions should probe the competencies, be specific, and avoid generic fluff.\n\n" +
                "Return JSON with this exact shape:\n" +
                "{\n" +
                '  "questions": [{"id": string, "question": string, "competency": string, "what_good_looks_like": string}]\n' +
                "}\n\n" +
                "Job description:\n" +
                jobDescription +
                "\n\nExtracted signals JSON:\n" +
                JSON.stringify(signals),
            },
          ],
        },
      ],
    });

    const step2Text = step2.content
      .map((c) => ("text" in c ? c.text : ""))
      .join("\n");
    const questions = await parseOrRepairJson<Step2Questions>(step2Text);

    return NextResponse.json({ signals, questions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


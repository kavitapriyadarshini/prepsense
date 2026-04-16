import { NextResponse } from "next/server";
import { CLAUDE_MODEL, getAnthropicClient } from "@/lib/anthropic";
import { extractJsonObject } from "@/lib/json";

export const runtime = "nodejs";

type Step1Signals = {
  competencies: string[];
  signals: Array<{ signal: string; coaching_tip: string }>;
  company_name: string;
  role_title: string;
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
      max_tokens: 1500,
      temperature: 0.2,
      system:
        "You are an expert Product Management interviewer. Return only valid JSON with no markdown formatting, no code blocks, and no backticks. You must always return a valid JSON object with these exact fields: competencies (array of strings), signals (array of objects), company_name (string), role_title (string). The signals array items must have fields: signal (string) and coaching_tip (string). Never return an empty response. If the JD is unclear, make your best inference.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Step 1 — Extract signals.\n" +
                "Given this job description, infer what PM skills and competencies the company is testing for.\n" +
                "For each signal, include a unique 1-line coaching_tip that tells the candidate what to emphasize when answering.\n\n" +
                "Return JSON with this exact shape (ONLY this JSON object, no markdown/code fences):\n" +
                "{\n" +
                '  "competencies": string[],\n' +
                '  "signals": [{"signal": string, "coaching_tip": string}],\n' +
                '  "company_name": string,\n' +
                '  "role_title": string\n' +
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
    console.log("PrepSense /api/analyse - Step 1 raw response content:", step1.content);
    console.log("PrepSense /api/analyse - Claude Step 1 raw:", step1Text);
    const signals = await parseOrRepairJson<Step1Signals>(step1Text);
    console.log("PrepSense /api/analyse - Parsed signals:", signals);

    const step2 = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      temperature: 0.4,
      system:
        "You are an expert Product Management interviewer. Return only valid JSON with no markdown formatting, no code blocks, and no backticks.",
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
    console.log("PrepSense /api/analyse - Claude Step 2 raw:", step2Text);
    const questions = await parseOrRepairJson<Step2Questions>(step2Text);
    console.log("PrepSense /api/analyse - Parsed questions:", questions);

    return NextResponse.json({ signals, questions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


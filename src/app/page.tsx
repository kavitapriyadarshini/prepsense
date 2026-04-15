"use client";

import { useMemo, useState } from "react";

type Signals = {
  pm_signals: Array<{
    skill: string;
    evidence_from_jd: string;
    why_it_matters: string;
  }>;
  competencies: string[];
  seniority_guess: "Intern" | "Junior" | "Mid" | "Senior" | "Lead" | "Unknown";
  notes: string;
};

type QuestionsPayload = {
  questions: Array<{
    id: string;
    question: string;
    competency: string;
    what_good_looks_like: string;
  }>;
};

type ScoreResult = {
  id: string;
  star: { score: number; notes: string; missing: string[] };
  metrics: { score: number; notes: string };
  relevance: { score: number; notes: string };
  overall: { score: number; one_liner: string };
  improved_answer_bullets: string[];
};

export default function Home() {
  const [jobDescription, setJobDescription] = useState("");
  const [step, setStep] = useState<"input" | "generated" | "scored">("input");
  const [loading, setLoading] = useState<null | "analyse" | "score">(null);
  const [error, setError] = useState<string | null>(null);

  const [signals, setSignals] = useState<Signals | null>(null);
  const [questions, setQuestions] = useState<QuestionsPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<string, ScoreResult>>({});

  const hasAnyAnswer = useMemo(
    () => Object.values(answers).some((a) => (a ?? "").trim().length > 0),
    [answers],
  );

  async function onAnalyse() {
    setError(null);
    setScores({});
    setStep("input");

    const jd = jobDescription.trim();
    if (!jd) {
      setError("Paste a job description first.");
      return;
    }

    setLoading("analyse");
    try {
      const res = await fetch("/api/analyse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobDescription: jd }),
      });
      const json = (await res.json()) as
        | { signals: Signals; questions: QuestionsPayload }
        | { error: string };
      if (!res.ok) {
        throw new Error("error" in json ? json.error : "Request failed");
      }
      if ("error" in json) {
        throw new Error(json.error);
      }

      setSignals(json.signals);
      setQuestions(json.questions);
      setAnswers(
        Object.fromEntries(json.questions.questions.map((q) => [q.id, ""])),
      );
      setStep("generated");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(null);
    }
  }

  async function onScore() {
    setError(null);
    const jd = jobDescription.trim();
    if (!jd) {
      setError("Paste a job description first.");
      return;
    }
    if (!questions) {
      setError("Generate questions first.");
      return;
    }

    setLoading("score");
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobDescription: jd,
          questions: questions.questions.map((q) => ({
            id: q.id,
            question: q.question,
            competency: q.competency,
          })),
          answers,
        }),
      });
      const json = (await res.json()) as
        | { results: ScoreResult[] }
        | { error: string };
      if (!res.ok) {
        throw new Error("error" in json ? json.error : "Request failed");
      }
      if ("error" in json) {
        throw new Error(json.error);
      }

      const byId = Object.fromEntries(json.results.map((r) => [r.id, r]));
      setScores(byId);
      setStep("scored");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            PM interview practice
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            PrepSense
          </h1>
          <p className="mt-2 text-base text-zinc-600">
            Paste a job description, get tailored PM questions, then score your
            answers on STAR, metrics, and relevance.
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">1) Job description</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Paste the JD you’re targeting.
              </p>
            </div>
            <button
              onClick={onAnalyse}
              disabled={loading === "analyse"}
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading === "analyse" ? "Analysing…" : "Analyse"}
            </button>
          </div>

          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the full job description here…"
            className="mt-4 min-h-44 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-400"
          />

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}
        </section>

        {signals && step !== "input" ? (
          <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-base font-semibold">2) What they’re testing</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {signals.competencies.slice(0, 12).map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700"
                >
                  {c}
                </span>
              ))}
            </div>
            <div className="mt-4 grid gap-3">
              {signals.pm_signals.slice(0, 8).map((s) => (
                <div
                  key={`${s.skill}-${s.evidence_from_jd}`}
                  className="rounded-xl border border-zinc-200 bg-white p-3"
                >
                  <div className="text-sm font-semibold">{s.skill}</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    <span className="font-medium text-zinc-700">Evidence:</span>{" "}
                    {s.evidence_from_jd}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    <span className="font-medium text-zinc-700">Why:</span>{" "}
                    {s.why_it_matters}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-xs text-zinc-600">
              <span className="font-medium text-zinc-700">Seniority:</span>{" "}
              {signals.seniority_guess} · {signals.notes}
            </div>
          </section>
        ) : null}

        {questions && step !== "input" ? (
          <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">3) Questions</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Answer in your own words. Then score all at once.
                </p>
              </div>
              <button
                onClick={onScore}
                disabled={loading === "score" || !hasAnyAnswer}
                className="inline-flex shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading === "score" ? "Scoring…" : "Score answers"}
              </button>
            </div>

            <div className="mt-4 grid gap-4">
              {questions.questions.map((q, idx) => {
                const score = scores[q.id];
                return (
                  <div
                    key={q.id}
                    className="rounded-xl border border-zinc-200 bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-zinc-500">
                          Q{idx + 1} · {q.competency}
                        </div>
                        <div className="mt-1 text-sm font-semibold">
                          {q.question}
                        </div>
                      </div>
                      {score ? (
                        <div className="shrink-0 rounded-lg bg-zinc-900 px-2 py-1 text-xs font-semibold text-white">
                          {score.overall.score}/10
                        </div>
                      ) : null}
                    </div>

                    <textarea
                      value={answers[q.id] ?? ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      placeholder="Your answer… (Try STAR: Situation, Task, Action, Result)"
                      className="mt-3 min-h-28 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
                    />

                    <div className="mt-2 text-xs text-zinc-600">
                      <span className="font-medium text-zinc-700">
                        What good looks like:
                      </span>{" "}
                      {q.what_good_looks_like}
                    </div>

                    {score ? (
                      <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="text-xs font-semibold text-zinc-800">
                          Feedback
                        </div>
                        <div className="mt-2 grid gap-2 text-xs text-zinc-700">
                          <div>
                            <span className="font-medium">STAR</span> ·{" "}
                            {score.star.score}/5 — {score.star.notes}
                          </div>
                          <div>
                            <span className="font-medium">Metrics</span> ·{" "}
                            {score.metrics.score}/5 — {score.metrics.notes}
                          </div>
                          <div>
                            <span className="font-medium">Relevance</span> ·{" "}
                            {score.relevance.score}/5 — {score.relevance.notes}
                          </div>
                          <div className="pt-1 text-zinc-800">
                            <span className="font-medium">Overall</span> —{" "}
                            {score.overall.one_liner}
                          </div>
                        </div>
                        {score.improved_answer_bullets?.length ? (
                          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-zinc-700">
                            {score.improved_answer_bullets.slice(0, 6).map((b) => (
                              <li key={b}>{b}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {step === "scored" ? (
              <div className="mt-4 text-xs text-zinc-500">
                Tip: rewrite one answer using the bullets above, then score again.
              </div>
            ) : null}
          </section>
        ) : null}

        <footer className="mt-10 text-center text-xs text-zinc-500">
          API key stays server-side via <code>ANTHROPIC_API_KEY</code>.
        </footer>
      </div>
    </div>
  );
}

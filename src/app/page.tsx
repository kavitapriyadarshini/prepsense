"use client";

import { useMemo, useState } from "react";
import { jsPDF } from "jspdf";

type Signals = {
  role_title: string;
  company_name: string;
  signals: Array<{ signal: string; coaching_tip: string }>;
  competencies: string[];
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
  const [pdfLoading, setPdfLoading] = useState(false);

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
    setSignals(null);
    setQuestions(null);
    setAnswers({});
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

      console.log("PrepSense /api/analyse response:", json);

      if (
        !json.signals ||
        !Array.isArray(json.signals.competencies) ||
        json.signals.competencies.length === 0
      ) {
        throw new Error(
          `PrepSense couldn’t extract "competencies" from the job description. Received signals: ${JSON.stringify(
            json.signals,
          ).slice(0, 600)}`,
        );
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
    console.log("Score answers clicked");

    try {
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

      const answerSnapshot = questions.questions.map((q) => ({
        id: q.id,
        answer: (answers[q.id] ?? "").slice(0, 400),
      }));
      console.log("Questions ids:", questions.questions.map((q) => q.id));
      console.log("Answer snapshot (up to 400 chars):", answerSnapshot);
      console.log("hasAnyAnswer:", hasAnyAnswer);
      console.log("Full answers object:", answers);

      setLoading("score");

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

  function downloadPrepReport() {
    if (!signals || !questions) return;

    const results = questions.questions
      .map((q) => scores[q.id])
      .filter(Boolean) as ScoreResult[];

    const avg = (vals: number[]) =>
      vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

    const starAvg = avg(results.map((r) => r.star.score));
    const metricsAvg = avg(results.map((r) => r.metrics.score));
    const relevanceAvg = avg(results.map((r) => r.relevance.score));
    const overallAvg = avg(results.map((r) => r.overall.score));
    const readinessScore = Math.round((overallAvg / 10) * 100);

    const focusAreas = [
      { label: "STAR structure (Situation/Task/Action/Result)", avg: starAvg },
      { label: "Use of metrics (impact + measurable outcomes)", avg: metricsAvg },
      { label: "Relevance to the JD", avg: relevanceAvg },
    ]
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 3);

    const finalTopSkills = Array.isArray(signals.signals)
      ? signals.signals.slice(0, 3).map((s) => s.signal)
      : [];

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 42;
    const marginTop = 40;
    let y = marginTop;
    const usableWidth = pageWidth - marginX * 2;
    const lineHeight = 14;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageHeight - marginTop) {
        doc.addPage();
        y = marginTop;
      }
    };

    const writeParagraph = (text: string, fontSize = 10) => {
      const lines = doc.splitTextToSize(text || "—", usableWidth);
      doc.setFontSize(fontSize);
      for (const line of lines) {
        ensureSpace(lineHeight);
        doc.text(line, marginX, y);
        y += lineHeight;
      }
    };

    const writeHeading = (text: string, fontSize = 14) => {
      ensureSpace(22);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(fontSize);
      doc.text(text, marginX, y);
      y += 18;
      doc.setFont("helvetica", "normal");
    };

    const writeSubheading = (text: string) => {
      ensureSpace(18);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(text, marginX, y);
      y += 14;
      doc.setFont("helvetica", "normal");
    };

    const writeKeyValueLine = (key: string, value: string) => {
      const line = `${key}: ${value || "—"}`;
      writeParagraph(line, 10);
    };

    const writeBullets = (items: string[]) => {
      for (const item of items) {
        writeParagraph(`• ${item}`, 10);
      }
    };

    writeHeading("PrepSense Interview Prep Report", 16);

    writeKeyValueLine(
      "Job title",
      signals.role_title?.trim() ? signals.role_title.trim() : "Not detected",
    );
    writeKeyValueLine(
      "Company",
      signals.company_name?.trim()
        ? signals.company_name.trim()
        : "Not detected",
    );

    writeSubheading("Top skills to prepare (from the JD)");
    writeBullets(finalTopSkills);

    y += 6;
    writeSubheading("Your answers & feedback");

    questions.questions.forEach((q, idx) => {
      const r = scores[q.id];

      ensureSpace(16);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`Q${idx + 1} — ${q.competency}`, marginX, y);
      y += 14;
      doc.setFont("helvetica", "normal");

      writeParagraph(`Question: ${q.question}`, 10);
      writeParagraph(`Your answer:\n${answers[q.id] ?? ""}`, 10);

      if (r) {
        y += 2;
        writeSubheading(`Scores (out of 5 / 10)`);
        writeParagraph(
          `STAR: ${r.star.score}/5 — ${r.star.notes || "—"}`,
          10,
        );
        writeParagraph(
          `Metrics: ${r.metrics.score}/5 — ${r.metrics.notes || "—"}`,
          10,
        );
        writeParagraph(
          `Relevance: ${r.relevance.score}/5 — ${r.relevance.notes || "—"}`,
          10,
        );
        writeParagraph(
          `Overall: ${r.overall.score}/10 — ${r.overall.one_liner || "—"}`,
          10,
        );

        const improved = (r.improved_answer_bullets ?? []).slice(0, 5);
        if (improved.length) {
          y += 2;
          writeSubheading("Focus improvements");
          writeBullets(improved);
        }
      } else {
        writeParagraph("No score available for this question.", 10);
      }

      y += 10;
    });

    writeSubheading(`Overall readiness score: ${readinessScore}/100`);

    y += 2;
    writeSubheading("Focus Areas (weakest criteria)");
    writeBullets(
      focusAreas.map((a) => `${a.label} — avg ${a.avg.toFixed(1)}/5`),
    );

    doc.save("PrepSense-Prep-Report.pdf");
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
              {Array.isArray(signals.competencies) &&
              signals.competencies.length ? (
                signals.competencies.slice(0, 12).map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700"
                  >
                    {c}
                  </span>
                ))
              ) : (
                <div className="text-sm text-zinc-600">
                  We couldn’t extract the `competencies` from the JD response.
                </div>
              )}
            </div>
            <div className="mt-4 grid gap-3">
              {Array.isArray(signals.signals) && signals.signals.length ? (
                signals.signals.slice(0, 8).map((s) => (
                  <div
                    key={s.signal}
                    className="rounded-xl border border-zinc-200 bg-white p-3"
                  >
                    <div className="text-sm font-semibold">{s.signal}</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {s.coaching_tip}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-zinc-600">
                  We couldn’t extract the skill signals from the JD response.
                </div>
              )}
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
                disabled={loading === "score"}
                className="inline-flex shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading === "score" ? "Scoring…" : "Score answers"}
              </button>
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            ) : null}

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
              <div className="mt-6">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPdfLoading(true);
                      try {
                        downloadPrepReport();
                      } finally {
                        setPdfLoading(false);
                      }
                    }}
                    disabled={pdfLoading}
                    className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pdfLoading ? "Generating PDF…" : "Download My Prep Report"}
                  </button>
                </div>
                <div className="mt-4 text-xs text-zinc-500">
                  Tip: rewrite one answer using the bullets above, then score again.
                </div>
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

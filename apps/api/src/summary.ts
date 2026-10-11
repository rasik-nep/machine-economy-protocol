import { z } from "zod";
const responseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(
              z.object({ text: z.string().optional(), thought: z.boolean().optional() })
            )
          })
          .optional()
      })
    )
    .optional()
});
export type RulingFacts = {
  provider: string;
  outcome: "provider-breached" | "provider-cleared" | "no-majority";
  recipient: "customer" | "provider";
  amountLamports: number;
  breachVotes: number;
  reveals: number;
};
export async function explainRuling(input: RulingFacts, fetcher: typeof fetch = fetch) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const response = await fetcher(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      signal: AbortSignal.timeout(30000),
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: "Explain this already-finalized demo ruling in two sentences, using only the supplied on-chain facts. The dispute concerns a provider-signed result that failed the deterministic verification policy committed in the contract (task-output checks and sampled canary prompts), which indicates degraded serving; do not name a cause. State the outcome, who received the escrowed lamports, and, if the provider breached, that the agent raises its future risk estimate for that provider. You cannot decide votes, move money, or change protocol state. Do not imply production guarantees."
            }
          ]
        },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
        generationConfig: { maxOutputTokens: 1024 }
      })
    }
  );
  // Never forward upstream error bodies: they may contain credentials or request data.
  if (!response.ok) {
    const hint =
      response.status === 429
        ? ": quota or rate limit exceeded"
        : response.status === 401 || response.status === 403
          ? ": authentication or permission denied"
          : "";
    throw new Error(`Gemini request failed (HTTP ${String(response.status)}${hint})`);
  }
  const data = responseSchema.safeParse(await response.json());
  if (!data.success) throw new Error("Gemini returned a malformed summary response");
  const text = (data.data.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("\n");
  if (!text.trim()) throw new Error("Gemini returned no summary text");
  return { text, model, advisory: true };
}

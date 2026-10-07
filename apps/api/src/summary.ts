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
export async function explainRuling(
  input: { provider: string; refundLamports: number; breachVotes: number },
  fetcher: typeof fetch = fetch
) {
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
              text: "Explain this already-finalized localnet demo ruling in two sentences. It is an objective missed-deadline breach. Mention the refund and that the agent updates its future provider risk. You cannot decide votes, move money, or change protocol state. Do not imply production guarantees."
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

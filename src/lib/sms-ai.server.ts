import { createOpenAI } from "@ai-sdk/openai";
import { NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";

export type SmsExtraction = {
  amount: number | null;
  wallet: "instapay" | "vodaphone" | "cash" | null;
  transferReference: string | null;
};

const schema = z.object({
  amount: z.number().nullable(),
  wallet: z.enum(["instapay", "vodaphone", "cash"]).nullable(),
  transferReference: z.string().nullable(),
});

function runIdFetch() {
  let runId: string | undefined;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (runId) headers.set("X-Lovable-AIG-Run-ID", runId);
    const res = await fetch(input, { ...init, headers });
    runId ??= res.headers.get("X-Lovable-AIG-Run-ID")?.trim() || undefined;
    return res;
  };
}

export async function extractSms(smsText: string): Promise<SmsExtraction> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured");
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch(),
  });
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    system:
      "You read Egyptian bank/wallet payment confirmation SMS messages (Arabic or English). " +
      "Extract: amount (number in EGP, digits only, convert Arabic numerals), " +
      "wallet: 'instapay' if InstaPay/IPN/انستاباي, 'vodaphone' if Vodafone Cash/فودافون كاش, 'cash' only if explicitly cash, else null; " +
      "transferReference: the reference/transaction number (رقم مرجعي / Ref). Use null for anything not present.",
    messages: [{ role: "user", content: smsText.slice(0, 4000) }],
    output: Output.object({ schema }),
    maxRetries: 0,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  try {
    const out = await result.output;
    return out as SmsExtraction;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) throw new Error("لم نتمكن من قراءة الرسالة");
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 402) throw new Error("نفدت أرصدة الذكاء الاصطناعي");
    if (status === 429) throw new Error("طلبات كثيرة، حاول بعد قليل");
    throw e;
  }
}

import { createOpenAI } from "@ai-sdk/openai";
import { NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";

export type SmsExtraction = {
  amount: number | null;
  wallet: "instapay" | "vodaphone" | "cash" | null;
  transferReference: string | null;
  senderName: string | null;
  senderPhone: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
};

const schema = z.object({
  amount: z.number().nullable(),
  wallet: z.enum(["instapay", "vodaphone", "cash"]).nullable(),
  transferReference: z.string().nullable(),
  senderName: z.string().nullable(),
  senderPhone: z.string().nullable(),
  receiverName: z.string().nullable(),
  receiverPhone: z.string().nullable(),
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

const SYSTEM =
  "You read Egyptian bank/wallet payment confirmations (SMS text or app screenshots, Arabic or English). " +
  "Extract: amount (number in EGP, digits only, convert Arabic numerals), " +
  "wallet: 'instapay' if InstaPay/IPN/انستاباي, 'vodaphone' if Vodafone Cash/فودافون كاش, 'cash' only if explicitly cash, else null; " +
  "transferReference: the reference/transaction number (رقم مرجعي / Ref); " +
  "senderName/senderPhone: who sent the money (من / from), receiverName/receiverPhone: who received it (إلى / to). " +
  "Phones as digits. Use null for anything not present.";

export function extractSms(smsText: string): Promise<SmsExtraction> {
  return extract([{ role: "user", content: smsText.slice(0, 4000) }]);
}

export function extractImage(dataBase64: string, mimeType: string): Promise<SmsExtraction> {
  return extract([
    {
      role: "user",
      content: [
        { type: "text", text: "Read this payment confirmation screenshot." },
        { type: "image", image: dataBase64, mediaType: mimeType },
      ],
    },
  ]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extract(messages: any[]): Promise<SmsExtraction> {
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
    system: SYSTEM,
    messages,
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

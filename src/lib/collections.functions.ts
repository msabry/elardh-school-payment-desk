import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MasterData = {
  customers: { id: string; name: string; phone: string }[];
  kids: { id: string; customerId: string; name: string }[];
  programs: { id: string; name: string }[];
  enrollments: { kidId: string; programId: string }[];
};

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims.email as string | undefined)?.toLowerCase();
    if (!email) return { authorized: false as const };

    const gw = await import("./google-gateway");
    const rows = await gw.getValues("Accountants!A2:C100");
    const match = rows.find((r) => (r[0] ?? "").trim().toLowerCase() === email);
    if (!match) return { authorized: false as const, email };
    return {
      authorized: true as const,
      email,
      name: match[1] ?? "",
      role: (match[2] ?? "").trim().toLowerCase(),
    };
  });

export const getMasterData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<MasterData> => {
    const gw = await import("./google-gateway");
    const [customers = [], kids = [], programs = [], enrollments = []] = await gw.batchGetValues([
      "Customers!A2:C1000",
      "Kids!A2:C1000",
      "Programs!A2:B1000",
      "Enrollments!A2:B1000",
    ]);
    return {
      customers: customers
        .filter((r) => r[0])
        .map((r) => ({ id: r[0]!, name: r[1] ?? "", phone: r[2] ?? "" })),
      kids: kids
        .filter((r) => r[0])
        .map((r) => ({ id: r[0]!, customerId: r[1] ?? "", name: r[2] ?? "" })),
      programs: programs.filter((r) => r[0]).map((r) => ({ id: r[0]!, name: r[1] ?? "" })),
      enrollments: enrollments
        .filter((r) => r[0])
        .map((r) => ({ kidId: r[0]!, programId: r[1] ?? "" })),
    };
  });

type SubmitInput = {
  customerId: string;
  customerName: string;
  kidName?: string;
  programName?: string;
  amount: number;
  transferReference?: string;
  smsText?: string;
  receipt?: { name: string; mimeType: string; dataBase64: string };
};

export const submitCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SubmitInput) => {
    if (!input.customerId || !input.customerName) throw new Error("Customer is required");
    if (!input.amount || input.amount <= 0) throw new Error("Amount must be greater than zero");
    if (input.receipt && input.receipt.dataBase64.length > 7_000_000) {
      throw new Error("Receipt file is too large (max ~5 MB)");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const gw = await import("./google-gateway");

    let receiptFileId = "";
    if (data.receipt) {
      const safeName = data.receipt.name.replace(/[^\w.\- ]/g, "_");
      receiptFileId = await gw.uploadReceipt(
        `${Date.now()}-${safeName}`,
        data.receipt.mimeType || "application/octet-stream",
        data.receipt.dataBase64,
      );
    }

    const transactionId = `TXN-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    const date = new Date().toISOString();
    const recordedBy = (context.claims.email as string | undefined) ?? context.userId;

    await gw.appendRow("Transactions!A1:K1", [
      transactionId,
      date,
      data.customerId,
      data.customerName,
      data.kidName ?? "",
      data.programName ?? "",
      data.amount,
      data.transferReference ?? "",
      data.smsText ?? "",
      receiptFileId,
      recordedBy,
    ]);

    return { transactionId, date, receiptFileId };
  });

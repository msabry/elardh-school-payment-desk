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
      // Programs rows may hold only the name (column A) with no separate id;
      // fall back to the id column text as the display name.
      programs: programs.filter((r) => r[0]).map((r) => ({ id: r[0]!, name: (r[1] ?? "").trim() || r[0]! })),
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
  wallet?: string;
  receipt?: { name: string; mimeType: string; dataBase64: string };
};

export const submitCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SubmitInput) => {
    if (!input.customerId || !input.customerName) throw new Error("Customer is required");
    if (!input.amount || input.amount <= 0) throw new Error("Amount must be greater than zero");
    if (!input.wallet || !["instapay", "vodaphone", "cash"].includes(input.wallet)) {
      throw new Error("Wallet is required");
    }
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

    // Column L = wallet, M = review status ("pending" until the other
    // accountant confirms), N = reviewer notes.
    await gw.appendRow("Transactions!A1:N1", [
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
      data.wallet,
      "pending",
    ]);

    return { transactionId, date, receiptFileId };
  });

export type ReviewTransaction = {
  transactionId: string;
  date: string;
  customerId: string;
  customerName: string;
  wallet: string;
  notes: string;
  kidName: string;
  programName: string;
  amount: string;
  transferReference: string;
  smsText: string;
  receiptFileId: string;
  recordedBy: string;
};

export const getTransactionsForReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const myEmail = (context.claims.email as string | undefined)?.toLowerCase() ?? "";
    const gw = await import("./google-gateway");
    // Columns: A transaction_id, B date, C customer_id, D customer_name,
    // E kid_name, F program_name, G amount, H transfer_reference, I sms_text,
    // J receipt_file_id, K recorded_by, L wallet, M status, N notes.
    const rows = await gw.getValues("Transactions!A2:N1000");
    return rows
      .filter((r) => r[0] && (r[10] ?? "").trim().toLowerCase() !== myEmail)
      .filter((r) => ((r[12] ?? "") || "pending").trim().toLowerCase() !== "confirmed")
      .map((r) => ({
        transactionId: r[0]!,
        date: r[1] ?? "",
        customerId: r[2] ?? "",
        customerName: r[3] ?? "",
        wallet: r[11] ?? "",
        notes: r[13] ?? "",
        kidName: r[4] ?? "",
        programName: r[5] ?? "",
        amount: r[6] ?? "",
        transferReference: r[7] ?? "",
        smsText: r[8] ?? "",
        receiptFileId: r[9] ?? "",
        recordedBy: r[10] ?? "",
      }));
  });

export const confirmTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { transactionId: string; kidName?: string; programName?: string; notes?: string }) => {
    if (!input?.transactionId) throw new Error("Transaction is required");
    return input;
  },
  )
  .handler(async ({ data, context }) => {
    const myEmail = (context.claims.email as string | undefined)?.toLowerCase() ?? "";
    const gw = await import("./google-gateway");
    const rows = await gw.getValues("Transactions!A2:N1000");
    const idx = rows.findIndex((r) => r[0] === data.transactionId);
    if (idx < 0) throw new Error("Transaction not found");
    const recordedBy = (rows[idx]?.[10] ?? "").trim().toLowerCase();
    if (recordedBy === myEmail) {
      throw new Error("You can only review transactions submitted by the other accountant");
    }
    const row = idx + 2;
    if (data.kidName !== undefined || data.programName !== undefined) {
      await gw.updateValues(`Transactions!E${row}:F${row}`, [
        [data.kidName ?? rows[idx]?.[4] ?? "", data.programName ?? rows[idx]?.[5] ?? ""],
      ]);
    }
    await gw.updateValues(`Transactions!M${row}:N${row}`, [
      ["confirmed", data.notes ?? rows[idx]?.[13] ?? ""],
    ]);
    return { ok: true as const };
  });

export type Supplier = { id: string; name: string; phone: string };

export const getSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<Supplier[]> => {
    const gw = await import("./google-gateway");
    // The tab name contains a slash, so read it through batchGet (query param)
    // instead of the path-based values endpoint.
    const [rows = []] = await gw.batchGetValues(["'suppliers/employees'!A2:D1000"]);
    return rows
      .filter((r) => r[0] && (r[1] ?? "").trim())
      .map((r) => ({ id: r[0]!, name: (r[1] ?? "").trim(), phone: r[2] ?? "" }));
  });

type SubmitPaymentInput = {
  supplierId: string;
  supplierName: string;
  expenseItem: string;
  amount: number;
  transferReference?: string;
  receipt?: { name: string; mimeType: string; dataBase64: string };
};

export const submitPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SubmitPaymentInput) => {
    if (!input.supplierId || !input.supplierName) throw new Error("Supplier is required");
    if (!input.expenseItem?.trim()) throw new Error("Expense item is required");
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

    const paymentId = `PY-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    const date = new Date().toISOString();
    const recordedBy = (context.claims.email as string | undefined) ?? context.userId;

    await gw.appendRow("Payments!A1:J1", [
      paymentId,
      date,
      data.supplierId,
      data.supplierName,
      data.expenseItem.trim(),
      data.amount,
      data.transferReference ?? "",
      receiptFileId,
      recordedBy,
      "pending",
    ]);

    return { paymentId, date, receiptFileId };
  });

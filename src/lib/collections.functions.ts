import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  canMarkMissing,
  isUsableMasterRow,
  isValidTransactionDate,
  isValidWallet,
  normalizeEnrollments,
  transactionDay,
  type Enrollment,
} from "./filters";



export type MasterData = {
  customers: { id: string; name: string; phone: string }[];
  kids: { id: string; customerId: string; name: string }[];
  programs: { id: string; name: string; status: string }[];
  enrollments: Enrollment[];
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
      // Programs: A program_id, B program_name, C start_date, D end_date, E Status.
      // Only Status decides whether a course is the child's current one.
      "Programs!A2:E1000",
      // Enrollments: A enrollment_id (kidId_programId, the primary key),
      // B kid_id, C program_id, D kid_name, E program_name.
      "Enrollments!A2:E1000",
    ]);
    return {
      customers: customers
        .filter((r) => isUsableMasterRow(r, 1))
        .map((r) => ({ id: r[0]!, name: r[1]!, phone: r[2] ?? "" })),
      kids: kids
        .filter((r) => isUsableMasterRow(r, 2))
        .map((r) => ({ id: r[0]!, customerId: r[1] ?? "", name: r[2]! })),
      // Programs rows may hold only the name (column A) with no separate id;

      // fall back to the id column text as the display name.
      programs: programs.filter((r) => r[0]).map((r) => ({ id: r[0]!, name: (r[1] ?? "").trim() || r[0]!, status: (r[4] ?? "").trim() })),
      enrollments: normalizeEnrollments(enrollments),
    };
  });

type SubmitInput = {
  customerId: string;
  customerName: string;
  kidName?: string;
  programName?: string;
  amount: number;
  transactionDate: string;
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
    if (!isValidTransactionDate(input.transactionDate)) {
      throw new Error("A valid transaction date is required");
    }
    if (!isValidWallet(input.wallet)) {
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
    const recordDate = new Date().toISOString();
    const recordedBy = (context.claims.email as string | undefined) ?? context.userId;

    // B = automatic record_date, C = user-editable transaction_date,
    // D = customer_supplier_id, M = wallet, N = status, O = type, P = notes.
    await gw.appendRow("Transactions!A1:P1", [
      transactionId,
      recordDate,
      data.transactionDate,
      data.customerId,
      data.customerName,
      data.kidName ?? "",
      data.programName ?? "",
      data.amount,
      data.transferReference ?? "",
      data.smsText ?? "",
      receiptFileId,
      recordedBy,
      data.wallet ?? "",
      "pending",
      "customer collection",
      "",
    ]);

    return { transactionId, recordDate, transactionDate: data.transactionDate, receiptFileId };
  });

export type ReviewTransaction = {
  transactionId: string;
  recordDate: string;
  transactionDate: string;
  customerId: string;
  customerName: string;
  wallet: string;
  notes: string;
  status: string;
  kidName: string;
  programName: string;
  amount: string;
  transferReference: string;
  smsText: string;
  receiptFileId: string;
  recordedBy: string;
  transactionType: string;
};

export const getTransactionsForReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const myEmail = (context.claims.email as string | undefined)?.toLowerCase() ?? "";
    const gw = await import("./google-gateway");
    // A transaction_id, B record_date, C transaction_date,
    // D customer_supplier_id, E customer_name, F kid_name, G program_name,
    // H amount, I transfer_reference, J sms_text, K receipt_file_id,
    // L recorded_by, M wallet, N status, O transaction_type, P notes.
    const rows = await gw.getValues("Transactions!A2:P1000");
    return rows
      .filter((r) => r[0] && (r[11] ?? "").trim().toLowerCase() !== myEmail)
      .map((r) => ({
        transactionId: r[0]!,
        recordDate: r[1] ?? "",
        transactionDate: (r[2] ?? "").trim() || transactionDay(r[1] ?? ""),
        customerId: r[3] ?? "",
        customerName: r[4] ?? "",
        wallet: r[12] ?? "",
        notes: r[15] ?? "",
        status: ((r[13] ?? "") || "pending").trim().toLowerCase(),
        kidName: r[5] ?? "",
        programName: r[6] ?? "",
        amount: r[7] ?? "",
        transferReference: r[8] ?? "",
        smsText: r[9] ?? "",
        receiptFileId: r[10] ?? "",
        recordedBy: r[11] ?? "",
        transactionType: (r[14] ?? "").trim().toLowerCase(),
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
    const rows = await gw.getValues("Transactions!A2:P1000");
    const idx = rows.findIndex((r) => r[0] === data.transactionId);
    if (idx < 0) throw new Error("Transaction not found");
    const recordedBy = (rows[idx]?.[11] ?? "").trim().toLowerCase();
    if (recordedBy === myEmail) {
      throw new Error("You can only review transactions submitted by the other accountant");
    }
    const row = idx + 2;
    if (data.kidName !== undefined || data.programName !== undefined) {
      await gw.updateValues(`Transactions!F${row}:G${row}`, [
        [data.kidName ?? rows[idx]?.[5] ?? "", data.programName ?? rows[idx]?.[6] ?? ""],
      ]);
    }
    await gw.updateValues(`Transactions!N${row}:N${row}`, [["confirmed"]]);
    await gw.updateValues(`Transactions!P${row}:P${row}`, [
      [data.notes ?? rows[idx]?.[15] ?? ""],
    ]);
    return { ok: true as const };
  });

export const markTransactionMissing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { transactionId: string }) => {
    if (!input?.transactionId) throw new Error("Transaction is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const myEmail = (context.claims.email as string | undefined)?.toLowerCase() ?? "";
    const gw = await import("./google-gateway");
    const rows = await gw.getValues("Transactions!A2:P1000");
    const idx = rows.findIndex((r) => r[0] === data.transactionId);
    if (idx < 0) throw new Error("Transaction not found");
    const recordedBy = (rows[idx]?.[11] ?? "").trim().toLowerCase();
    if (recordedBy === myEmail) {
      throw new Error("You can only review transactions submitted by the other accountant");
    }
    if (!canMarkMissing(((rows[idx]?.[13] ?? "") || "pending").trim().toLowerCase())) {
      throw new Error("Confirmed transactions cannot be marked missing");
    }
    await gw.updateValues(`Transactions!N${idx + 2}:N${idx + 2}`, [["missing"]]);
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
  transactionDate: string;
  transferReference?: string;
  smsText?: string;
  wallet: string;
  receipt?: { name: string; mimeType: string; dataBase64: string };
};

export const submitPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SubmitPaymentInput) => {
    if (!input.supplierId || !input.supplierName) throw new Error("Supplier is required");
    if (!input.expenseItem?.trim()) throw new Error("Expense item is required");
    if (!input.amount || input.amount <= 0) throw new Error("Amount must be greater than zero");
    if (!isValidTransactionDate(input.transactionDate)) {
      throw new Error("A valid transaction date is required");
    }
    if (!isValidWallet(input.wallet)) {
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

    const paymentId = `PY-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    const recordDate = new Date().toISOString();
    const recordedBy = (context.claims.email as string | undefined) ?? context.userId;

    // Supplier payments live in the Transactions tab as negative amounts.
    // B = record_date, C = transaction_date, D = supplier id,
    // E = supplier name, G = expense item, O = transaction_type.
    await gw.appendRow("Transactions!A1:P1", [
      paymentId,
      recordDate,
      data.transactionDate,
      data.supplierId,
      data.supplierName,
      "",
      data.expenseItem.trim(),
      -Math.abs(data.amount),
      data.transferReference ?? "",
      data.smsText ?? "",
      receiptFileId,
      recordedBy,
      data.wallet,
      "pending",
      "supplier payment",
      "",
    ]);

    return { paymentId, recordDate, transactionDate: data.transactionDate, receiptFileId };
  });

export const analyzeSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { smsText: string }) => {
    if (!input?.smsText?.trim()) throw new Error("SMS text is required");
    return input;
  })
  .handler(async ({ data }) => {
    const { extractSms } = await import("./sms-ai.server");
    return extractSms(data.smsText);
  });

export const analyzeScreenshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { transactionId?: string; image: { name: string; mimeType: string; dataBase64: string } }) => {
      if (!input?.image?.dataBase64) throw new Error("Screenshot is required");
      if (!input.image.mimeType.startsWith("image/")) throw new Error("Upload an image");
      if (input.image.dataBase64.length > 7_000_000) throw new Error("Screenshot is too large (max ~5 MB)");
      return input;
    },
  )
  .handler(async ({ data }) => {
    const { extractImage } = await import("./sms-ai.server");
    const extraction = await extractImage(data.image.dataBase64, data.image.mimeType);
    // Keep the screenshot with the transaction when it has no receipt yet (column K).
    if (data.transactionId) {
      try {
        const gw = await import("./google-gateway");
        const rows = await gw.getValues("Transactions!A2:K1000");
        const idx = rows.findIndex((r) => r[0] === data.transactionId);
        if (idx >= 0 && !(rows[idx]?.[10] ?? "").trim()) {
          const safeName = data.image.name.replace(/[^\w.\- ]/g, "_");
          const fileId = await gw.uploadReceipt(`${Date.now()}-${safeName}`, data.image.mimeType, data.image.dataBase64);
          await gw.updateValues(`Transactions!K${idx + 2}:K${idx + 2}`, [[fileId]]);
        }
      } catch (e) {
        console.error("Saving screenshot failed", e);
      }
    }
    return extraction;
  });

export type TransactionRow = {
  transactionId: string;
  recordDate: string;
  transactionDate: string;
  customerName: string;
  kidName: string;
  programName: string;
  amount: string;
  transferReference: string;
  wallet: string;
  status: string;
  recordedBy: string;
  notes: string;
  transactionType: string;
};

export const getAllTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<TransactionRow[]> => {
    const gw = await import("./google-gateway");
    const rows = await gw.getValues("Transactions!A2:P1000");
    return rows
      .filter((r) => r[0])
      .map((r) => ({
        transactionId: r[0]!,
        recordDate: r[1] ?? "",
        transactionDate: (r[2] ?? "").trim() || transactionDay(r[1] ?? ""),
        customerName: r[4] ?? "",
        kidName: r[5] ?? "",
        programName: r[6] ?? "",
        amount: r[7] ?? "",
        transferReference: r[8] ?? "",
        wallet: r[12] ?? "",
        status: ((r[13] ?? "") || "pending").trim().toLowerCase(),
        recordedBy: r[11] ?? "",
        notes: r[15] ?? "",
        transactionType: (r[14] ?? "").trim().toLowerCase(),
      }))
      .reverse();
  });

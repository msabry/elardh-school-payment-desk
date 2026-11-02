export type TxFilters = { wallet: string; status: string; from: string; to: string };

export const emptyFilters: TxFilters = { wallet: "", status: "", from: "", to: "" };

/** Filter by wallet, status and inclusive date range (YYYY-MM-DD, Cairo-local date). */
export function applyFilters<T extends { wallet: string; status: string; date: string }>(
  items: T[],
  f: TxFilters,
): T[] {
  return items.filter((t) => {
    if (f.wallet && t.wallet.trim().toLowerCase() !== f.wallet) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.from || f.to) {
      const d = new Date(t.date);
      if (Number.isNaN(d.getTime())) return false;
      const day = d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
      if (f.from && day < f.from) return false;
      if (f.to && day > f.to) return false;
    }
    return true;
  });
}

export type Mismatch = { field: "amount" | "wallet"; sms: string; entered: string };

export function findMismatches(
  extracted: { amount: number | null; wallet: string | null },
  entered: { amount: number; wallet: string },
): Mismatch[] {
  const out: Mismatch[] = [];
  if (extracted.amount != null && Math.abs(extracted.amount - entered.amount) > 0.009) {
    out.push({ field: "amount", sms: String(extracted.amount), entered: String(entered.amount) });
  }
  if (extracted.wallet && entered.wallet && extracted.wallet !== entered.wallet) {
    out.push({ field: "wallet", sms: extracted.wallet, entered: entered.wallet });
  }
  return out;
}

/**
 * Column N of Transactions holds the transaction type. Supplier payments carry
 * a supplier id in column C (customer_supplier_id) instead of a customer id.
 */
export const isSupplierPayment = (transactionType: string) =>
  transactionType.trim().toLowerCase().includes("supplier");

/**
 * Master-data rows (Customers, Kids) are only offered in the app when they carry
 * both an id in column A and a display name, so half-filled rows left while
 * re-numbering ids never show up as blank choices.
 */
export const isUsableMasterRow = (row: (string | undefined)[], nameIndex: number) =>
  Boolean(row[0]?.trim() && (row[nameIndex] ?? "").trim());

/** One child's subscription to one course, keyed by the Enrollments primary key. */
export type Enrollment = { id: string; kidId: string; programId: string };

/**
 * enrollment_id is composed as `${kid_id}_${program_id}`. Program ids never
 * contain an underscore, so the id splits at the last one.
 */
export function parseEnrollmentId(id: string): { kidId: string; programId: string } | null {
  const trimmed = id.trim();
  const at = trimmed.lastIndexOf("_");
  if (at <= 0 || at === trimmed.length - 1) return null;
  const kidId = trimmed.slice(0, at);
  const programId = trimmed.slice(at + 1);
  return kidId && programId ? { kidId, programId } : null;
}

/**
 * Turn Enrollments rows into enrollments keyed by their primary key: a row with
 * no enrollment_id is not a record, a repeated id is the same record listed
 * twice, and kid/course fall back to the id when their columns are blank.
 */
export function normalizeEnrollments(rows: (string | undefined)[][]): Enrollment[] {
  const byId = new Map<string, Enrollment>();
  for (const row of rows) {
    const id = (row[0] ?? "").trim();
    if (!id) continue;
    const parsed = parseEnrollmentId(id);
    const kidId = (row[1] ?? "").trim() || parsed?.kidId || "";
    const programId = (row[2] ?? "").trim() || parsed?.programId || "";
    if (!kidId || !programId) continue;
    if (!byId.has(id)) byId.set(id, { id, kidId, programId });
  }
  return [...byId.values()];
}



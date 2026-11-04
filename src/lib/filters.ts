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
export type Enrollment = { id: string; kidId: string; programId: string; startDate: string; endDate: string };

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
    const startDate = parseSheetDate(row[5] ?? "");
    const endDate = parseSheetDate(row[6] ?? "");
    if (!byId.has(id)) byId.set(id, { id, kidId, programId, startDate, endDate });
  }
  return [...byId.values()];
}



/** Sheet date (YYYY-MM-DD, D/M/YYYY or DD-MM-YYYY) as YYYY-MM-DD; "" when unreadable. */
export function parseSheetDate(v: string): string {
  const t = v.trim();
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return "";
}

/** Today as YYYY-MM-DD in Cairo time. */
export const cairoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/**
 * A kid's active enrollment: today falls between its start_date (F) and
 * end_date (G), both inclusive. No dates, or today outside them, = not active.
 */
export function pickActiveEnrollment(
  enrollments: Enrollment[],
  kidId: string,
  today: string = cairoToday(),
): Enrollment | null {
  return (
    enrollments.find(
      (e) => e.kidId === kidId && e.startDate && e.endDate && e.startDate <= today && today <= e.endDate,
    ) ?? null
  );
}

/** Egyptian mobile numbers compared on their last 10 digits (drops +20 / 0 / spaces). */
export function normalizePhone(phone: string): string {
  const ar = "٠١٢٣٤٥٦٧٨٩";
  const digits = phone.replace(/[٠-٩]/g, (d) => String(ar.indexOf(d))).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Suggest customers for a phone/name read from an SMS or screenshot.
 * Phone match wins; otherwise customers sharing at least two name words
 * (or the whole name when it is a single word).
 */
export function suggestCustomers<T extends { id: string; name: string; phone: string }>(
  customers: T[],
  hints: { phones: (string | null | undefined)[]; names: (string | null | undefined)[] },
): T[] {
  const phones = hints.phones.map((p) => normalizePhone(p ?? "")).filter((p) => p.length >= 8);
  if (phones.length) {
    const byPhone = customers.filter((c) => {
      const cp = normalizePhone(c.phone);
      return cp.length >= 8 && phones.includes(cp);
    });
    if (byPhone.length) return byPhone;
  }
  const names = hints.names.map((n) => normalizeName(n ?? "")).filter(Boolean);
  if (!names.length) return [];
  return customers.filter((c) => {
    const cw = normalizeName(c.name).split(" ");
    return names.some((n) => {
      const nw = n.split(" ");
      const shared = nw.filter((w) => w.length > 1 && cw.includes(w)).length;
      return shared >= Math.min(2, nw.length, cw.length) && shared > 0;
    });
  });
}

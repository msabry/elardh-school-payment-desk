export type TxFilters = { wallet: string; status: string; from: string; to: string };

export const emptyFilters: TxFilters = { wallet: "", status: "", from: "", to: "" };

/** Current calendar date in Cairo, in the format used by date inputs and the sheet. */
export function cairoDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Transaction dates are calendar dates, not timestamps. */
export function isValidTransactionDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Normalize a transaction date, falling back to a legacy record timestamp. */
export function transactionDay(value: string): string {
  const trimmed = value.trim();
  if (isValidTransactionDate(trimmed)) return trimmed;
  if (!trimmed) return "";
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? "" : cairoDateString(parsed);
}

/** Wallets the app accepts, saved verbatim in column M of Transactions. */
export const WALLET_VALUES = ["instapay", "vodaphone", "cash"] as const;

/** Every collection and supplier payment must say which wallet it went through. */
export const isValidWallet = (wallet: string | undefined | null) =>
  WALLET_VALUES.includes(((wallet ?? "").trim().toLowerCase()) as (typeof WALLET_VALUES)[number]);

/** Confirmed transactions are final; every other status can be marked missing. */
export const canMarkMissing = (status: string) => status.trim().toLowerCase() !== "confirmed";

/** Filter by wallet, status and inclusive transaction_date range (YYYY-MM-DD). */
export function applyFilters<T extends { wallet: string; status: string; transactionDate: string }>(
  items: T[],
  f: TxFilters,
): T[] {
  return items.filter((t) => {
    if (f.wallet && t.wallet.trim().toLowerCase() !== f.wallet) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.from || f.to) {
      const day = transactionDay(t.transactionDate);
      if (!day) return false;
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
 * Column O of Transactions holds the transaction type. Supplier payments carry
 * a supplier id in column D (customer_supplier_id) instead of a customer id.
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



/**
 * A course is running when the Programs tab's Status column (E) says Active.
 * Anything else — Inactive, blank or a different spelling — counts as not running.
 */
export function isProgramActive(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === "active" || s === "نشط";
}

/** Ids of the courses whose Programs-tab Status says Active. */
export function activeProgramIds<T extends { id: string; status: string }>(programs: T[]): Set<string> {
  return new Set(programs.filter((p) => isProgramActive(p.status)).map((p) => p.id));
}

/**
 * A kid's active enrollment: the course they are enrolled in whose Programs-tab
 * Status says Active. Null when the kid has no enrollment in a running course.
 */
export function pickActiveEnrollment(
  enrollments: Enrollment[],
  kidId: string,
  activePrograms: Set<string>,
): Enrollment | null {
  return enrollments.find((e) => e.kidId === kidId && activePrograms.has(e.programId)) ?? null;
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

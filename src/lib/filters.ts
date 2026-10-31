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

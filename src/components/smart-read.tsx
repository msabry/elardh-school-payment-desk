import { suggestCustomers } from "@/lib/filters";

export type Extraction = {
  amount: number | null;
  wallet: "instapay" | "vodaphone" | "cash" | null;
  transferReference: string | null;
  senderName: string | null;
  senderPhone: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
};

export const WALLET_LABELS: Record<string, string> = {
  instapay: "إنستاباي",
  vodaphone: "فودافون كاش",
  cash: "نقدي",
};

type Customer = { id: string; name: string; phone: string };

export function customerSuggestions(customers: Customer[], ext: Extraction) {
  return suggestCustomers(customers, {
    phones: [ext.senderPhone, ext.receiverPhone],
    names: [ext.senderName, ext.receiverName],
  });
}

/** Shows what the AI read, the suggested customer(s), and any mismatch lines. */
export function SmartReadResult({
  ext,
  customers,
  selectedCustomerId,
  onPickCustomer,
  problems = [],
  suggestionsTitle = "العميل المقترح:",
  noSuggestionsText = "لم نجد عميلاً بنفس الرقم أو الاسم",
}: {
  ext: Extraction;
  customers: Customer[];
  selectedCustomerId?: string | undefined;
  onPickCustomer?: ((c: Customer) => void) | undefined;
  problems?: string[] | undefined;
  suggestionsTitle?: string;
  noSuggestionsText?: string;
}) {
  const suggestions = customerSuggestions(customers, ext);
  const party = (name: string | null, phone: string | null) =>
    [name, phone].filter(Boolean).join(" · ") || "غير موجود";
  return (
    <div
      className={
        "rounded-xl border p-3 text-xs " +
        (problems.length ? "border-destructive bg-destructive/10" : "border-border bg-background")
      }
    >
      <p className="mb-1.5 font-semibold">ما قرأناه:</p>
      <p>المبلغ: {ext.amount ?? "غير موجود"}</p>
      <p>المحفظة: {ext.wallet ? WALLET_LABELS[ext.wallet] : "غير محددة"}</p>
      <p>مرجع التحويل: {ext.transferReference ?? "غير موجود"}</p>
      <p>المُرسِل: {party(ext.senderName, ext.senderPhone)}</p>
      <p>المُستلِم: {party(ext.receiverName, ext.receiverPhone)}</p>

      <div className="mt-2">
        <p className="font-semibold">{suggestionsTitle}</p>
        {suggestions.length === 0 ? (
          <p className="text-muted-foreground">{noSuggestionsText}</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {suggestions.map((c) =>
              onPickCustomer ? (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onPickCustomer(c)}
                  className={
                    "rounded-lg border px-2 py-1 font-medium " +
                    (selectedCustomerId === c.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-card")
                  }
                >
                  {c.name} <span className="opacity-70">{c.id}</span>
                </button>
              ) : (
                <span key={c.id} className="font-medium">
                  {c.name} ({c.id}){selectedCustomerId === c.id ? " ✓" : ""}
                </span>
              ),
            )}
          </div>
        )}
      </div>

      {problems.length > 0 ? (
        <ul className="mt-2 space-y-1 font-medium text-destructive">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 font-medium text-primary">مطابقة للبيانات المدخلة ✓</p>
      )}
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ListChecks, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getAllTransactions, type TransactionRow } from "@/lib/collections.functions";
import { TxFiltersBar } from "@/components/tx-filters";
import { applyFilters, emptyFilters, type TxFilters } from "@/lib/filters";

export const Route = createFileRoute("/transactions")({
  head: () => ({
    meta: [
      { title: "كل التحصيلات" },
      { name: "description", content: "قائمة كل التحصيلات مع التصفية بالمحفظة والحالة والتاريخ." },
      { property: "og:title", content: "كل التحصيلات" },
      { property: "og:description", content: "ابحث في التحصيلات بالمحفظة والحالة والتاريخ." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransactionsPage,
});

const WALLET_LABELS: Record<string, string> = { instapay: "إنستاباي", vodaphone: "فودافون كاش", cash: "نقدي" };

function TransactionsPage() {
  const [items, setItems] = useState<TransactionRow[] | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [filters, setFilters] = useState<TxFilters>(emptyFilters);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return setSignedOut(true);
      try {
        setItems(await getAllTransactions());
      } catch (e) {
        console.error(e);
        setSignedOut(true);
      }
    })();
  }, []);

  const shown = items ? applyFilters(items, filters) : [];
  const total = shown.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-md px-4 pb-10">
        <header className="flex items-center justify-between py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ListChecks className="h-5 w-5" />
            </div>
            <h1 className="text-base font-semibold">كل التحصيلات</h1>
          </div>
          <Link to="/" className="flex items-center gap-1 rounded-lg border border-input px-3 py-1.5 text-xs text-muted-foreground">
            <ArrowRight className="h-3.5 w-3.5" /> الرئيسية
          </Link>
        </header>

        {signedOut && <p className="text-center text-sm text-muted-foreground">سجّل الدخول من الصفحة الرئيسية أولاً.</p>}
        {!signedOut && !items && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {items && (
          <>
            <TxFiltersBar value={filters} onChange={setFilters} />
            <p className="mb-3 text-xs text-muted-foreground">
              {shown.length} تحصيل — الإجمالي {total.toLocaleString("ar-EG")} ج.م
            </p>
            <div className="space-y-2">
              {shown.map((t) => (
                <div key={t.transactionId} className="rounded-2xl border border-border bg-card p-3">
                  <div className="flex justify-between gap-2">
                    <p className="text-sm font-semibold">{t.customerName}</p>
                    <p className="text-sm font-semibold text-primary">
                      {(Number(t.amount) || 0).toLocaleString("ar-EG")} ج.م
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(t.date).toLocaleDateString("ar-EG")} · {WALLET_LABELS[t.wallet] ?? "—"} ·{" "}
                    {t.status === "confirmed" ? "مؤكد" : "في انتظار المراجعة"}
                  </p>
                  {(t.kidName || t.programName) && (
                    <p className="mt-1 text-xs">{[t.kidName, t.programName].filter(Boolean).join(" — ")}</p>
                  )}
                  {t.notes && <p className="mt-1 text-xs text-muted-foreground">ملاحظات: {t.notes}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

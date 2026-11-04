import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  BadgeCheck,
  FileText,
  Loader2,
  SearchCheck,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import {
  confirmTransaction,
  getMasterData,
  getMyRole,
  getTransactionsForReview,
  type MasterData,
  type ReviewTransaction,
} from "@/lib/collections.functions";

import { TxFiltersBar } from "@/components/tx-filters";
import { applyFilters, emptyFilters, isSupplierPayment, pickActiveEnrollment, type TxFilters } from "@/lib/filters";

const WALLET_LABELS: Record<string, string> = {
  instapay: "إنستاباي",
  vodaphone: "فودافون كاش",
  cash: "نقدي",
};
type Edits = { kidName: string; programName: string; notes: string };

/** Column C holds a supplier id for these rows, not a customer id. */
const isPayment = (t: ReviewTransaction) => isSupplierPayment(t.transactionType);

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "تحصيلات للمراجعة" },
      {
        name: "description",
        content: "مراجعة التحصيلات التي سجّلها المحاسب الآخر وتأكيدها.",
      },
      { property: "og:title", content: "تحصيلات للمراجعة" },
      {
        property: "og:description",
        content: "مراجعة وتأكيد التحصيلات المسجلة في الجدول.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewPage,
});

type Load =
  | { state: "loading" }
  | { state: "signedOut" }
  | { state: "ready"; items: ReviewTransaction[]; isAcc1: boolean; master: MasterData | null };

function ReviewPage() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [signingIn, setSigningIn] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function refresh() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setLoad({ state: "signedOut" });
      return;
    }
    try {
      const [items, role] = await Promise.all([getTransactionsForReview(), getMyRole()]);
      const isAcc1 = role.authorized && role.role === "accountant1";
      const master = isAcc1 ? await getMasterData() : null;
      setLoad({ state: "ready", items, isAcc1, master });
    } catch (e) {
      console.error(e);
      setLoad({ state: "signedOut" });
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function initial() {
      if (cancelled) return;
      await refresh();
    }
    initial();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh());
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn() {
    setSigningIn(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("فشل تسجيل الدخول. حاول مرة أخرى.");
      setSigningIn(false);
    }
  }

  const [filters, setFilters] = useState<TxFilters>({ ...emptyFilters, status: "pending" });
  const [edits, setEdits] = useState<Record<string, Edits>>({});
  function editOf(t: ReviewTransaction): Edits {
    return edits[t.transactionId] ?? { kidName: t.kidName, programName: t.programName, notes: t.notes };
  }
  function setEdit(t: ReviewTransaction, patch: Partial<Edits>) {
    setEdits((p) => ({ ...p, [t.transactionId]: { ...editOf(t), ...patch } }));
  }

  async function confirm(t: ReviewTransaction) {
    setConfirming(t.transactionId);
    try {
      const isAcc1 = load.state === "ready" && load.isAcc1;
      const e = editOf(t);
      await confirmTransaction({
        data: isAcc1 && !isPayment(t)
          ? { transactionId: t.transactionId, kidName: e.kidName, programName: e.programName, notes: e.notes.trim() }
          : isAcc1
            ? { transactionId: t.transactionId, notes: e.notes.trim() }
            : { transactionId: t.transactionId },
      });
      toast.success("تم تأكيد التحصيل");
      setLoad((prev) =>
        prev.state === "ready"
          ? {
              ...prev,
              items: prev.items.map((x) =>
                x.transactionId === t.transactionId ? { ...x, status: "confirmed" } : x,
              ),
            }
          : prev,
      );
    } catch (e) {
      console.error(e);
      toast.error(
        e instanceof Error ? e.message : "لم نتمكن من تأكيد التحصيل",
      );
    } finally {
      setConfirming(null);
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-10">
        <header className="flex items-center justify-between py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <SearchCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">
                تحصيلات للمراجعة
              </h1>
              <p className="text-xs text-muted-foreground">فريق المالية</p>
            </div>
          </div>
          <Link
            to="/"
            className="flex items-center gap-1 rounded-lg border border-input px-3 py-1.5 text-xs text-muted-foreground"
          >
            <ArrowRight className="h-3.5 w-3.5" /> الرئيسية
          </Link>
        </header>

        {load.state === "loading" && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {load.state === "signedOut" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="text-sm text-muted-foreground">
              سجّل الدخول بحساب Google لمراجعة التحصيلات.
            </p>
            <button
              onClick={signIn}
              disabled={signingIn}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {signingIn && <Loader2 className="h-4 w-4 animate-spin" />}
              تسجيل الدخول بحساب Google
            </button>
          </div>
        )}

        {load.state === "ready" && <TxFiltersBar value={filters} onChange={setFilters} />}

        {load.state === "ready" && applyFilters(load.items, filters).length === 0 && (
          <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
            لا توجد تحصيلات مطابقة
          </div>
        )}

        {load.state === "ready" && applyFilters(load.items, filters).length > 0 && (
          <div className="space-y-3">
            {applyFilters(load.items, filters).map((t) => (
              <div
                key={t.transactionId}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{t.customerName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {isPayment(t) ? "دفعة لمورّد" : "تحصيل من عميل"} · {formatDate(t.date)}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-sm font-semibold text-primary">
                    {formatAmount(t.amount)} ج.م
                  </p>
                </div>

                <dl className="mt-3 space-y-1.5 text-xs">
                  {!load.isAcc1 && !isPayment(t) && t.kidName && (
                    <Row label="الطفل" value={t.kidName} />
                  )}
                  {!load.isAcc1 && t.programName && (
                    <Row label={isPayment(t) ? "بند الصرف" : "الدورة"} value={t.programName} />
                  )}
                  {t.wallet && (
                    <Row label="المحفظة" value={WALLET_LABELS[t.wallet] ?? t.wallet} />
                  )}
                  {t.transferReference && (
                    <Row label="مرجع التحويل" value={t.transferReference} />
                  )}
                  {t.smsText && (
                    <Row
                      label="رسالة التأكيد"
                      value={t.smsText}
                      preWrap
                    />
                  )}
                  <Row
                    label="سجّلها"
                    value={t.recordedBy || "—"}
                  />
                </dl>

                {t.receiptFileId && (
                  <a
                    href={`https://drive.google.com/file/d/${t.receiptFileId}/view`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" /> عرض الإيصال
                  </a>
                )}

                {t.status === "confirmed" ? (
                  <p className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground">
                    <BadgeCheck className="h-4 w-4" /> مؤكد
                    {t.notes ? ` — ${t.notes}` : ""}
                  </p>
                ) : (
                <>
                {load.isAcc1 && load.master && (
                  <AccountantEdits
                    t={t}
                    master={load.master}
                    value={editOf(t)}
                    onChange={(p) => setEdit(t, p)}
                  />
                )}

                <button
                  onClick={() => confirm(t)}
                  disabled={confirming !== null}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {confirming === t.transactionId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BadgeCheck className="h-4 w-4" />
                  )}
                  تأكيد
                </button>
                </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  preWrap,
}: {
  label: string;
  value: string;
  preWrap?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          "font-medium text-foreground" + (preWrap ? " whitespace-pre-wrap" : "")
        }
      >
        {value}
      </dd>
    </div>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatAmount(amount: string) {
  const n = Number(amount);
  return Number.isFinite(n) ? n.toLocaleString("ar-EG") : amount;
}

const fieldCls =
  "w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

function AccountantEdits({
  t,
  master,
  value,
  onChange,
}: {
  t: ReviewTransaction;
  master: MasterData;
  value: Edits;
  onChange: (p: Partial<Edits>) => void;
}) {
  // For supplier payments column C holds the supplier id, so the child/program
  // pickers only make sense on customer collections.
  const payment = isPayment(t);
  const kids = payment ? [] : master.kids.filter((k) => k.customerId === t.customerId);
  const kidNames = kids.map((k) => k.name);
  if (value.kidName && !kidNames.includes(value.kidName)) kidNames.unshift(value.kidName);
  const kid = kids.find((k) => k.name === value.kidName);
  const enrolled = kid ? master.enrollments.filter((e) => e.kidId === kid.id).map((e) => e.programId) : [];
  const progList = master.programs.filter((p) => enrolled.includes(p.id));
  const activeId = kid ? pickActiveEnrollment(master.enrollments, kid.id)?.programId : undefined;
  const activeName = master.programs.find((p) => p.id === activeId)?.name ?? "";
  const progNames = (progList.length ? progList : master.programs)
    .map((p) => p.name)
    .sort((a, b) => Number(b === activeName) - Number(a === activeName));
  if (value.programName && !progNames.includes(value.programName)) progNames.unshift(value.programName);

  return (
    <div className="mt-3 space-y-2.5 border-t border-border pt-3">
      {!payment && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium">الطفل</label>
            <select value={value.kidName} onChange={(e) => {
              const k = kids.find((x) => x.name === e.target.value);
              const a = k ? pickActiveEnrollment(master.enrollments, k.id)?.programId : undefined;
              const name = master.programs.find((p) => p.id === a)?.name ?? "";
              onChange({ kidName: e.target.value, programName: name });
            }} className={fieldCls}>
              <option value="">اختر الطفل…</option>
              {kidNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">البرنامج / الدورة</label>
            <select value={value.programName} onChange={(e) => onChange({ programName: e.target.value })} className={fieldCls}>
              <option value="">اختر الدورة…</option>
              {progNames.map((n) => (
                <option key={n} value={n}>{n === activeName ? `${n} (الحالية)` : n}</option>
              ))}
            </select>
          </div>
        </>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium">ملاحظات</label>
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={2}
          placeholder="أضف ملاحظة (اختياري)…"
          className={fieldCls + " resize-none"}
        />
      </div>
    </div>
  );
}

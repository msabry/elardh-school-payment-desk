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
  getTransactionsForReview,
  type ReviewTransaction,
} from "@/lib/collections.functions";

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
  | { state: "ready"; items: ReviewTransaction[] };

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
      const items = await getTransactionsForReview();
      setLoad({ state: "ready", items });
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

  async function confirm(t: ReviewTransaction) {
    setConfirming(t.transactionId);
    try {
      await confirmTransaction({ data: { transactionId: t.transactionId } });
      toast.success("تم تأكيد التحصيل");
      setLoad((prev) =>
        prev.state === "ready"
          ? {
              state: "ready",
              items: prev.items.filter(
                (x) => x.transactionId !== t.transactionId,
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

        {load.state === "ready" && load.items.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
            لا توجد تحصيلات في انتظار المراجعة
          </div>
        )}

        {load.state === "ready" && load.items.length > 0 && (
          <div className="space-y-3">
            {load.items.map((t) => (
              <div
                key={t.transactionId}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{t.customerName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(t.date)}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-sm font-semibold text-primary">
                    {formatAmount(t.amount)} ج.م
                  </p>
                </div>

                <dl className="mt-3 space-y-1.5 text-xs">
                  {t.kidName && (
                    <Row label="الطفل" value={t.kidName} />
                  )}
                  {t.programName && (
                    <Row label="الدورة" value={t.programName} />
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

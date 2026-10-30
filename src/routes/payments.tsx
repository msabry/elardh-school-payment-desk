import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2, Paperclip, Banknote } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import {
  getSuppliers,
  submitPayment,
  type Supplier,
} from "@/lib/collections.functions";
import { EntityPicker } from "@/components/entity-picker";

export const Route = createFileRoute("/payments")({
  head: () => ({
    meta: [
      { title: "تسجيل دفعة" },
      {
        name: "description",
        content: "تسجيل الدفعات المقدمة للموردين والموظفين في جدول Google.",
      },
      { property: "og:title", content: "تسجيل دفعة" },
      {
        property: "og:description",
        content: "تسجيل دفعة لمورّد — تُحفظ مباشرة في جدول الفريق.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsPage,
});

const inputCls =
  "w-full rounded-xl border border-input bg-card px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const labelCls = "mb-1 block text-sm font-medium";

function PaymentsPage() {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const [supplier, setSupplier] = useState<{ id: string; name: string } | null>(null);
  const [expenseItem, setExpenseItem] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (!cancelled) setSignedOut(true);
        return;
      }
      try {
        const list = await getSuppliers();
        if (!cancelled) setSuppliers(list);
      } catch (e) {
        console.error(e);
        if (!cancelled) setSignedOut(true);
      }
    }
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
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

  async function submit() {
    if (!supplier) {
      toast.error("اختر المورّد من القائمة");
      return;
    }
    if (!expenseItem.trim()) {
      toast.error("أدخل بند المصروف");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("أدخل مبلغاً صحيحاً");
      return;
    }
    if (!reference.trim()) {
      toast.error("أدخل مرجع التحويل");
      return;
    }

    setBusy(true);
    try {
      let receiptPayload: { name: string; mimeType: string; dataBase64: string } | undefined;
      if (receipt) {
        const buf = await receipt.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        receiptPayload = {
          name: receipt.name,
          mimeType: receipt.type || "application/octet-stream",
          dataBase64: btoa(binary),
        };
      }
      const result = await submitPayment({
        data: {
          supplierId: supplier.id,
          supplierName: supplier.name,
          expenseItem: expenseItem.trim(),
          amount: amt,
          transferReference: reference.trim(),
          ...(receiptPayload ? { receipt: receiptPayload } : {}),
        },
      });
      setDone(result.paymentId);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "لم نتمكن من حفظ الدفعة");
    } finally {
      setBusy(false);
    }
  }

  function resetAll() {
    setSupplier(null);
    setExpenseItem("");
    setAmount("");
    setReference("");
    setReceipt(null);
    setDone(null);
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-10">
        <header className="flex items-center justify-between py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Banknote className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">تسجيل دفعة</h1>
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

        {signedOut && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="text-sm text-muted-foreground">
              سجّل الدخول بحساب Google لتسجيل الدفعات.
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

        {!signedOut && !suppliers && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!signedOut && suppliers && done && (
          <div className="rounded-2xl border border-border bg-card p-5 text-center">
            <p className="text-sm font-medium text-foreground">تم حفظ الدفعة</p>
            <p className="mt-1 break-all text-xs text-muted-foreground">عملية رقم {done}</p>
            <button
              onClick={resetAll}
              className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
            >
              تسجيل دفعة أخرى
            </button>
          </div>
        )}

        {!signedOut && suppliers && !done && (
          <div className="space-y-4">
            <EntityPicker
              label="المورّد"
              items={suppliers}
              value={supplier}
              onChange={setSupplier}
              noMatchLabel="مورّد"
            />

            <div>
              <label className={labelCls}>بند المصروف</label>
              <input
                value={expenseItem}
                onChange={(e) => setExpenseItem(e.target.value)}
                placeholder="اكتب بند المصروف…"
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>المبلغ المدفوع</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>مرجع التحويل</label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="مثال: رقم مرجعية التحويل البنكي"
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>الإيصال (اختياري)</label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-input bg-card px-3 py-3 text-sm text-muted-foreground">
                <Paperclip className="h-4 w-4" />
                {receipt ? receipt.name : "أرفق إيصال التحويل…"}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <button
              onClick={submit}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ الدفعة
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

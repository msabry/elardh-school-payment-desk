import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { findMismatches } from "@/lib/filters";
import { toast } from "sonner";
import { BadgeCheck, Banknote, ListChecks, Loader2, LogOut, Paperclip, Search, Wallet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import {
  getMyRole,
  getMasterData,
  getTransactionsForReview,
  analyzeSms,
  submitCollection,
  type MasterData,
} from "@/lib/collections.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "تحصيل الرسوم المدرسية" },
      {
        name: "description",
        content:
          "أداة سهلة الاستخدام على الهاتف لفريق المالية لتسجيل تحصيلات الرسوم المدرسية في جدول Google.",
      },
      { property: "og:title", content: "تحصيل الرسوم المدرسية" },
      {
        property: "og:description",
        content: "سجّل تحصيلات الرسوم المدرسية من هاتفك — تُحفظ مباشرة في جدول الفريق.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Role =
  | { state: "loading" }
  | { state: "signedOut" }
  | { state: "unauthorized"; email: string | undefined }
  | { state: "ready"; name: string; role: string; email: string };

function Index() {
  const [role, setRole] = useState<Role>({ state: "loading" });
  const [master, setMaster] = useState<MasterData | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (!cancelled) setRole({ state: "signedOut" });
        return;
      }
      try {
        const r = await getMyRole();
        if (cancelled) return;
        if (!r.authorized) {
          setRole({ state: "unauthorized", email: r.email });
        } else {
          setRole({ state: "ready", name: r.name, role: r.role, email: r.email });
          setMaster(await getMasterData());
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setRole({ state: "signedOut" });
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

  async function signOut() {
    await supabase.auth.signOut();
    setRole({ state: "signedOut" });
    setMaster(null);
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-10">
        <header className="flex items-center justify-between py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">
                تحصيل الرسوم المدرسية
              </h1>
              <p className="text-xs text-muted-foreground">فريق المالية</p>
            </div>
          </div>
          {role.state === "ready" && (
            <button
              onClick={signOut}
              className="flex items-center gap-1 rounded-lg border border-input px-3 py-1.5 text-xs text-muted-foreground"
            >
              <LogOut className="h-3.5 w-3.5" /> تسجيل الخروج
            </button>
          )}
        </header>

        {role.state === "loading" && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {role.state === "signedOut" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="text-sm text-muted-foreground">
              سجّل الدخول بحساب Google لتسجيل التحصيل.
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

        {role.state === "unauthorized" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm font-medium">
              هذا الحساب غير مضاف في قائمة المحاسبين.
            </p>
            <p className="text-xs text-muted-foreground">
              {role.email ? `سجّلت الدخول كـ ${role.email}. ` : ""}
              اطلب من مالك الجدول إضافة بريدك إلى تبويب Accountants.
            </p>
            <button
              onClick={signOut}
              className="rounded-xl border border-input px-4 py-2 text-sm"
            >
              تسجيل الخروج
            </button>
          </div>
        )}

        {role.state === "ready" && !master && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {role.state === "ready" && master && (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              أهلاً {role.name || role.email} — تسجّل باسم{" "}
              <span className="font-medium text-foreground">
                {role.role === "accountant2" ? "المحاسب الثاني" : "المحاسب الأول"}
              </span>
              .
            </p>

            <div className="rounded-2xl border border-border bg-card p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                السجلات والمراجعة
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Link to="/review" className={tileCls}>
                  <BadgeCheck className="h-5 w-5 text-primary" />
                  بانتظار المراجعة
                </Link>
                <Link to="/transactions" className={tileCls}>
                  <ListChecks className="h-5 w-5 text-primary" />
                  كل التحصيلات
                </Link>
                <Link to="/payments" className={tileCls}>
                  <Banknote className="h-5 w-5 text-primary" />
                  دفعة لمورّد
                </Link>
              </div>
            </div>

            <div className="my-6 border-t border-dashed border-border" />

            <section className="rounded-2xl border border-border bg-muted p-4">
              <h2 className="mb-4 text-sm font-semibold text-foreground">
                تسجيل تحصيل جديد
              </h2>
              {role.role === "accountant2" ? (
                <Accountant2Form master={master} />
              ) : (
                <Accountant1Form master={master} />
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function CustomerPicker({
  customers,
  value,
  onChange,
}: {
  customers: MasterData["customers"];
  value: { id: string; name: string } | null;
  onChange: (c: { id: string; name: string } | null) => void;
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers.slice(0, 20);
    return customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 20);
  }, [customers, query]);

  return (
    <div ref={boxRef} className="relative">
      <label className="mb-1 block text-sm font-medium">العميل</label>
      <div className="flex items-center gap-2 rounded-xl border border-input bg-background px-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            onChange(null);
          }}
          onFocus={() => setOpen(true)}
          placeholder="اكتب أول حروف الاسم…"
          className="w-full bg-transparent py-3 text-sm outline-none"
        />
      </div>
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-border bg-popover shadow-lg">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onChange({ id: c.id, name: c.name });
                  setQuery(c.name);
                  setOpen(false);
                }}
                className="w-full px-3 py-2.5 text-right text-sm hover:bg-accent"
              >
                <span className="font-medium">{c.name}</span>
                <span className="mr-2 text-xs text-muted-foreground">{c.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && matches.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-popover px-3 py-2.5 text-sm text-muted-foreground shadow-lg">
          لا يوجد عميل مطابق لـ "{query}"
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const labelCls = "mb-1 block text-sm font-medium";
const tileCls =
  "flex flex-col items-center gap-1.5 rounded-xl border border-input bg-background px-1.5 py-3 text-center text-[11px] font-medium leading-tight text-foreground transition-colors hover:border-primary hover:bg-accent";

function SuccessBanner({ transactionId, onReset }: { transactionId: string; onReset: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 text-center">
      <p className="text-sm font-medium text-foreground">تم حفظ التحصيل</p>
      <p className="mt-1 break-all text-xs text-muted-foreground">
        عملية رقم {transactionId}
      </p>
      <button
        onClick={onReset}
        className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
      >
        تسجيل تحصيل آخر
      </button>
    </div>
  );
}

function Accountant1Form({ master }: { master: MasterData }) {
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [kidId, setKidId] = useState("");
  const [programId, setProgramId] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [wallet, setWallet] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const kids = useMemo(
    () => master.kids.filter((k) => k.customerId === customer?.id),
    [master, customer],
  );
  const programs = useMemo(() => {
    const enrolled = master.enrollments
      .filter((e) => e.kidId === kidId)
      .map((e) => e.programId);
    const list = master.programs.filter((p) => enrolled.includes(p.id));
    return list.length > 0 ? list : master.programs;
  }, [master, kidId]);

  if (done) return <SuccessBanner transactionId={done} onReset={() => resetAll()} />;

  function resetAll() {
    setCustomer(null);
    setKidId("");
    setProgramId("");
    setAmount("");
    setReference("");
    setWallet("");
    setReceipt(null);
    setDone(null);
  }

  async function submit() {
    if (!customer) {
      toast.error("اختر العميل من القائمة");
      return;
    }
    if (!kidId) {
      toast.error("اختر الطفل");
      return;
    }
    if (!programId) {
      toast.error("اختر الدورة");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("أدخل مبلغاً صحيحاً");
      return;
    }
    if (!wallet) {
      toast.error("اختر المحفظة");
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
      const kid = master.kids.find((k) => k.id === kidId);
      const program = master.programs.find((p) => p.id === programId);
      const result = await submitCollection({
        data: {
          customerId: customer.id,
          customerName: customer.name,
          kidName: kid?.name ?? "",
          programName: program?.name ?? "",
          amount: amt,
          transferReference: reference.trim(),
          wallet,
          ...(receiptPayload ? { receipt: receiptPayload } : {}),
        },
      });
      setDone(result.transactionId);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "لم نتمكن من حفظ التحصيل");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <CustomerPicker
        customers={master.customers}
        value={customer}
        onChange={(c) => {
          setCustomer(c);
          setKidId("");
          setProgramId("");
        }}
      />

      <div>
        <label className={labelCls}>الطفل</label>
        <select
          value={kidId}
          onChange={(e) => {
            setKidId(e.target.value);
            setProgramId("");
          }}
          disabled={!customer}
          className={inputCls + " disabled:opacity-50"}
        >
          <option value="">{customer ? "اختر الطفل…" : "اختر العميل أولاً"}</option>
          {kids.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>البرنامج / الدورة</label>
        <select
          value={programId}
          onChange={(e) => setProgramId(e.target.value)}
          disabled={!kidId}
          className={inputCls + " disabled:opacity-50"}
        >
          <option value="">{kidId ? "اختر الدورة…" : "اختر الطفل أولاً"}</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>المبلغ المحصل</label>
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

      <WalletPicker value={wallet} onChange={setWallet} />

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
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-input bg-background px-3 py-3 text-sm text-muted-foreground">
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
        حفظ التحصيل
      </button>
    </div>
  );
}

function Accountant2Form({ master }: { master: MasterData }) {
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [sms, setSms] = useState("");
  const [wallet, setWallet] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<{
    amount: number | null;
    wallet: string | null;
    transferReference: string | null;
  } | null>(null);
  const mismatches = check
    ? findMismatches(check, { amount: Number(amount) || 0, wallet })
    : [];

  async function runCheck() {
    if (!sms.trim()) {
      toast.error("الصق نص رسالة التأكيد أولاً");
      return;
    }
    setChecking(true);
    try {
      setCheck(await analyzeSms({ data: { smsText: sms } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحليل الرسالة");
    } finally {
      setChecking(false);
    }
  }

  if (done) {
    return (
      <SuccessBanner
        transactionId={done}
        onReset={() => {
          setCustomer(null);
          setAmount("");
          setSms("");
          setWallet("");
          setCheck(null);
          setDone(null);
        }}
      />
    );
  }

  async function submit() {
    if (!customer) {
      toast.error("اختر العميل من القائمة");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("أدخل مبلغاً صحيحاً");
      return;
    }
    if (!wallet) {
      toast.error("اختر المحفظة");
      return;
    }
    if (!sms.trim()) {
      toast.error("الصق نص رسالة التأكيد");
      return;
    }

    setBusy(true);
    try {
      const result = await submitCollection({
        data: {
          customerId: customer.id,
          customerName: customer.name,
          amount: amt,
          smsText: sms.trim(),
          wallet,
        },
      });
      setDone(result.transactionId);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "لم نتمكن من حفظ التحصيل");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <CustomerPicker customers={master.customers} value={customer} onChange={setCustomer} />

      <div>
        <label className={labelCls}>المبلغ المحصل</label>
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

      <WalletPicker value={wallet} onChange={setWallet} />

      <div>
        <label className={labelCls}>رسالة تأكيد التحويل</label>
        <textarea
          value={sms}
          onChange={(e) => {
            setSms(e.target.value);
            setCheck(null);
          }}
          placeholder="الصق نص رسالة التأكيد كاملة هنا…"
          rows={5}
          className={inputCls + " resize-none"}
        />
      </div>

      <button
        type="button"
        onClick={runCheck}
        disabled={checking}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary px-4 py-2.5 text-sm font-medium text-primary disabled:opacity-60"
      >
        {checking && <Loader2 className="h-4 w-4 animate-spin" />}
        مطابقة الرسالة بالذكاء الاصطناعي
      </button>

      {check && (
        <div
          className={
            "rounded-xl border p-3 text-xs " +
            (mismatches.length ? "border-destructive bg-destructive/10" : "border-border bg-background")
          }
        >
          <p className="mb-1.5 font-semibold">ما قرأناه من الرسالة:</p>
          <p>المبلغ: {check.amount ?? "غير موجود"}</p>
          <p>المحفظة: {WALLETS.find((w) => w.value === check.wallet)?.label ?? "غير محددة"}</p>
          <p>مرجع التحويل: {check.transferReference ?? "غير موجود"}</p>
          {mismatches.length === 0 ? (
            <p className="mt-2 font-medium text-primary">مطابقة للبيانات المدخلة ✓</p>
          ) : (
            <ul className="mt-2 space-y-1 font-medium text-destructive">
              {mismatches.map((m) => (
                <li key={m.field}>
                  {m.field === "amount"
                    ? `المبلغ مختلف: الرسالة ${m.sms} والمُدخل ${m.entered}`
                    : `المحفظة مختلفة: الرسالة ${WALLETS.find((w) => w.value === m.sms)?.label} والمُختار ${WALLETS.find((w) => w.value === m.entered)?.label}`}
                </li>
              ))}
            </ul>
          )}
          {check.wallet && !wallet && (
            <button type="button" onClick={() => setWallet(check.wallet!)} className="mt-2 underline">
              استخدم المحفظة من الرسالة
            </button>
          )}
        </div>
      )}

      <button
        onClick={submit}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        حفظ التحصيل
      </button>
    </div>
  );
}

const WALLETS = [
  { value: "instapay", label: "إنستاباي" },
  { value: "vodaphone", label: "فودافون كاش" },
  { value: "cash", label: "نقدي" },
];

function WalletPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={labelCls}>المحفظة</label>
      <div className="grid grid-cols-3 gap-2">
        {WALLETS.map((w) => (
          <button
            key={w.value}
            type="button"
            onClick={() => onChange(w.value)}
            className={
              "rounded-xl border px-2 py-2.5 text-sm font-medium " +
              (value === w.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-foreground")
            }
          >
            {w.label}
          </button>
        ))}
      </div>
    </div>
  );
}

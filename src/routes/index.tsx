import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, LogOut, Paperclip, Search, Wallet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import {
  getMyRole,
  getMasterData,
  submitCollection,
  type MasterData,
} from "@/lib/collections.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "School Fees Collections" },
      {
        name: "description",
        content:
          "Mobile-friendly tool for the finance team to record school fee collections into Google Sheets and Google Drive.",
      },
      { property: "og:title", content: "School Fees Collections" },
      {
        property: "og:description",
        content: "Record school fee collections on the go — saved straight to the team spreadsheet.",
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
  | { state: "unauthorized"; email?: string }
  | { state: "ready"; name: string; role: string; email: string };

function Index() {
  const [role, setRole] = useState<Role>({ state: "loading" });
  const [master, setMaster] = useState<MasterData | null>(null);
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
      toast.error("Sign-in failed. Please try again.");
      setSigningIn(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setRole({ state: "signedOut" });
    setMaster(null);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-10">
        <header className="flex items-center justify-between py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">Fee Collections</h1>
              <p className="text-xs text-muted-foreground">Finance team</p>
            </div>
          </div>
          {role.state === "ready" && (
            <button
              onClick={signOut}
              className="flex items-center gap-1 rounded-lg border border-input px-3 py-1.5 text-xs text-muted-foreground"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
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
              Sign in with your Google account to record a collection.
            </p>
            <button
              onClick={signIn}
              disabled={signingIn}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {signingIn && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in with Google
            </button>
          </div>
        )}

        {role.state === "unauthorized" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm font-medium">This account isn't on the accountants list.</p>
            <p className="text-xs text-muted-foreground">
              {role.email ? `Signed in as ${role.email}. ` : ""}
              Ask the sheet owner to add your email to the Accountants tab.
            </p>
            <button
              onClick={signOut}
              className="rounded-xl border border-input px-4 py-2 text-sm"
            >
              Sign out
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
              Hello {role.name || role.email} — you're recording as{" "}
              <span className="font-medium text-foreground">
                {role.role === "accountant2" ? "Accountant 2" : "Accountant 1"}
              </span>
              .
            </p>
            {role.role === "accountant2" ? (
              <Accountant2Form master={master} />
            ) : (
              <Accountant1Form master={master} />
            )}
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
      <label className="mb-1 block text-sm font-medium">Customer</label>
      <div className="flex items-center gap-2 rounded-xl border border-input bg-card px-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            onChange(null);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Type the first letters…"
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
                className="w-full px-3 py-2.5 text-left text-sm hover:bg-accent"
              >
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{c.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && matches.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-popover px-3 py-2.5 text-sm text-muted-foreground shadow-lg">
          No customer matches "{query}"
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-input bg-card px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const labelCls = "mb-1 block text-sm font-medium";

function SuccessBanner({ transactionId, onReset }: { transactionId: string; onReset: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 text-center">
      <p className="text-sm font-medium text-foreground">Collection saved</p>
      <p className="mt-1 break-all text-xs text-muted-foreground">Transaction {transactionId}</p>
      <button
        onClick={onReset}
        className="mt-4 w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
      >
        Record another
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
    setReceipt(null);
    setDone(null);
  }

  async function submit() {
    if (!customer) return toast.error("Please pick a customer");
    if (!kidId) return toast.error("Please pick a child");
    if (!programId) return toast.error("Please pick a program");
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (!reference.trim()) return toast.error("Enter the transfer reference");

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
          receipt: receiptPayload,
        },
      });
      setDone(result.transactionId);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not save the collection");
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
        <label className={labelCls}>Child</label>
        <select
          value={kidId}
          onChange={(e) => {
            setKidId(e.target.value);
            setProgramId("");
          }}
          disabled={!customer}
          className={inputCls + " disabled:opacity-50"}
        >
          <option value="">{customer ? "Select child…" : "Pick a customer first"}</option>
          {kids.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>Program / course</label>
        <select
          value={programId}
          onChange={(e) => setProgramId(e.target.value)}
          disabled={!kidId}
          className={inputCls + " disabled:opacity-50"}
        >
          <option value="">{kidId ? "Select program…" : "Pick a child first"}</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>Amount collected</label>
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
        <label className={labelCls}>Transfer reference</label>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. bank transfer reference number"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Receipt (optional)</label>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-input bg-card px-3 py-3 text-sm text-muted-foreground">
          <Paperclip className="h-4 w-4" />
          {receipt ? receipt.name : "Attach transfer receipt…"}
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
        Save collection
      </button>
    </div>
  );
}

function Accountant2Form({ master }: { master: MasterData }) {
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [sms, setSms] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return (
      <SuccessBanner
        transactionId={done}
        onReset={() => {
          setCustomer(null);
          setAmount("");
          setSms("");
          setDone(null);
        }}
      />
    );
  }

  async function submit() {
    if (!customer) return toast.error("Please pick a customer");
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (!sms.trim()) return toast.error("Paste the confirmation SMS text");

    setBusy(true);
    try {
      const result = await submitCollection({
        data: {
          customerId: customer.id,
          customerName: customer.name,
          amount: amt,
          smsText: sms.trim(),
        },
      });
      setDone(result.transactionId);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not save the collection");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <CustomerPicker customers={master.customers} value={customer} onChange={setCustomer} />

      <div>
        <label className={labelCls}>Amount collected</label>
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
        <label className={labelCls}>Confirmation SMS</label>
        <textarea
          value={sms}
          onChange={(e) => setSms(e.target.value)}
          placeholder="Paste the full confirmation SMS text here…"
          rows={5}
          className={inputCls + " resize-none"}
        />
      </div>

      <button
        onClick={submit}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Save collection
      </button>
    </div>
  );
}

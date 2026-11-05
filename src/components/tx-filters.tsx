import type { TxFilters } from "@/lib/filters";

const cls =
  "w-full rounded-lg border border-input bg-card px-2 py-2 text-xs outline-none focus:ring-2 focus:ring-ring";

export function TxFiltersBar({ value, onChange }: { value: TxFilters; onChange: (f: TxFilters) => void }) {
  const set = (p: Partial<TxFilters>) => onChange({ ...value, ...p });
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-3">
      <label className="text-xs">
        <span className="mb-1 block text-muted-foreground">المحفظة</span>
        <select value={value.wallet} onChange={(e) => set({ wallet: e.target.value })} className={cls}>
          <option value="">الكل</option>
          <option value="instapay">إنستاباي</option>
          <option value="vodaphone">فودافون كاش</option>
          <option value="cash">نقدي</option>
        </select>
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-muted-foreground">الحالة</span>
        <select value={value.status} onChange={(e) => set({ status: e.target.value })} className={cls}>
          <option value="">الكل</option>
          <option value="pending">في انتظار المراجعة</option>
          <option value="confirmed">مؤكد</option>
          <option value="missing">مفقود</option>
        </select>
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-muted-foreground">من تاريخ</span>
        <input type="date" value={value.from} onChange={(e) => set({ from: e.target.value })} className={cls} />
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-muted-foreground">إلى تاريخ</span>
        <input type="date" value={value.to} onChange={(e) => set({ to: e.target.value })} className={cls} />
      </label>
    </div>
  );
}

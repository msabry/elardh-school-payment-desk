import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

export type PickerItem = { id: string; name: string };

export function EntityPicker({
  label,
  items,
  value,
  onChange,
  placeholder = "اكتب أول حروف الاسم…",
  noMatchLabel = "عميل",
}: {
  label: string;
  items: PickerItem[];
  value: PickerItem | null;
  onChange: (item: PickerItem | null) => void;
  placeholder?: string;
  noMatchLabel?: string;
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
    if (!q) return items.slice(0, 20);
    return items.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 20);
  }, [items, query]);

  return (
    <div ref={boxRef} className="relative">
      <label className="mb-1 block text-sm font-medium">{label}</label>
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
          placeholder={placeholder}
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
          لا يوجد {noMatchLabel} مطابق لـ "{query}"
        </div>
      )}
    </div>
  );
}

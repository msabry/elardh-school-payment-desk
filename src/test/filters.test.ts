import { describe, expect, it } from "vitest";
import { applyFilters, emptyFilters, findMismatches, isSupplierPayment, isUsableMasterRow } from "@/lib/filters";

const items = [
  { id: 1, wallet: "instapay", status: "pending", date: "2026-10-26T14:35:34.143Z" },
  { id: 2, wallet: "vodaphone", status: "confirmed", date: "2026-10-28T13:56:53.019Z" },
];

describe("transaction filters", () => {
  it("filters by wallet", () => {
    expect(applyFilters(items, { ...emptyFilters, wallet: "vodaphone" }).map((i) => i.id)).toEqual([2]);
  });
  it("filters by status", () => {
    expect(applyFilters(items, { ...emptyFilters, status: "pending" }).map((i) => i.id)).toEqual([1]);
  });
  it("date range is inclusive", () => {
    expect(applyFilters(items, { ...emptyFilters, from: "2026-10-28", to: "2026-10-28" }).map((i) => i.id)).toEqual([2]);
  });
});

describe("SMS mismatch", () => {
  it("flags different amount and wallet", () => {
    expect(findMismatches({ amount: 2000, wallet: "instapay" }, { amount: 1500, wallet: "cash" }).map((m) => m.field)).toEqual(["amount", "wallet"]);
  });
  it("no flags when matching", () => {
    expect(findMismatches({ amount: 2000, wallet: "instapay" }, { amount: 2000, wallet: "instapay" })).toEqual([]);
  });
});

describe("transaction type (column N)", () => {
  it("treats supplier payment rows as payments", () => {
    expect(isSupplierPayment("supplier payment")).toBe(true);
    expect(isSupplierPayment(" Supplier Payment ")).toBe(true);
  });
  it("treats customer collection rows as collections", () => {
    expect(isSupplierPayment("customer collection")).toBe(false);
    expect(isSupplierPayment("")).toBe(false);
  });
});

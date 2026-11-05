import { describe, expect, it } from "vitest";
import {
  activeProgramIds,
  applyFilters,
  emptyFilters,
  findMismatches,
  isProgramActive,
  isSupplierPayment,
  isUsableMasterRow,
  normalizeEnrollments,
  normalizePhone,
  pickActiveEnrollment,
  suggestCustomers,
  parseEnrollmentId,
} from "@/lib/filters";

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

describe("master-data rows need an id and a name", () => {
  it("keeps customer rows that have both", () => {
    expect(isUsableMasterRow(["C001", "رضوى نبيل", "0100"], 1)).toBe(true);
  });
  it("drops customer rows with an id but no name", () => {
    expect(isUsableMasterRow(["C004"], 1)).toBe(false);
    expect(isUsableMasterRow(["C004", "   "], 1)).toBe(false);
  });
  it("drops kid rows with no name in column C", () => {
    expect(isUsableMasterRow(["6", "C001", "حلا"], 2)).toBe(true);
    expect(isUsableMasterRow(["6", "C001"], 2)).toBe(false);
  });
});

describe("enrollment_id is the Enrollments primary key", () => {
  it("splits kid_id_program_id at the last underscore", () => {
    expect(parseEnrollmentId("12_P008")).toEqual({ kidId: "12", programId: "P008" });
  });
  it("rejects ids that are not a kid/course pair", () => {
    expect(parseEnrollmentId("P001")).toBeNull();
    expect(parseEnrollmentId("_P001")).toBeNull();
    expect(parseEnrollmentId("12_")).toBeNull();
    expect(parseEnrollmentId("")).toBeNull();
  });
  it("keeps only rows carrying an enrollment_id", () => {
    const rows = [
      ["1_P001", "1", "P001"],
      ["", "2", "P006"],
      ["3_P008", "3", "P008"],
    ];
    expect(normalizeEnrollments(rows).map((e) => e.id)).toEqual(["1_P001", "3_P008"]);
  });
  it("drops a repeated enrollment_id", () => {
    const rows = [
      ["1_P001", "1", "P001"],
      ["1_P001", "1", "P001"],
      ["2_P006", "2", "P006"],
    ];
    expect(normalizeEnrollments(rows).map((e) => e.id)).toEqual(["1_P001", "2_P006"]);
  });
  it("recovers kid and course from the id when their columns are blank", () => {
    expect(normalizeEnrollments([["7_P008", "", ""]])).toEqual([{ id: "7_P008", kidId: "7", programId: "P008" }]);
  });
});


describe("active enrollment = course whose Programs Status says Active", () => {
  const programs = [
    { id: "P001", name: "مدرسة الكبار 2027", status: "Active" },
    { id: "P006", name: "اليافعات", status: "Active" },
    { id: "P008", name: "مدرسة الصغار 26 الصيد", status: "Inactive" },
    { id: "P009", name: "مدرسة الكبار 2026", status: "" },
  ];
  const en = normalizeEnrollments([
    ["1_P008", "1", "P008"],
    ["1_P006", "1", "P006"],
    ["2_P008", "2", "P008"],
    ["3_P009", "3", "P009"],
  ]);
  const active = activeProgramIds(programs);

  it("only Active counts; Inactive, blank and other spellings do not", () => {
    expect(isProgramActive("Active")).toBe(true);
    expect(isProgramActive(" active ")).toBe(true);
    expect(isProgramActive("Inactive")).toBe(false);
    expect(isProgramActive("")).toBe(false);
    expect([...active]).toEqual(["P001", "P006"]);
  });
  it("skips the kid's inactive course and picks the running one", () => {
    expect(pickActiveEnrollment(en, "1", active)?.id).toBe("1_P006");
  });
  it("is null when every course the kid takes is inactive", () => {
    expect(pickActiveEnrollment(en, "2", active)).toBeNull();
    expect(pickActiveEnrollment(en, "3", active)).toBeNull();
  });
  it("is null for a kid with no enrollment", () => {
    expect(pickActiveEnrollment(en, "99", active)).toBeNull();
  });
});

describe("customer suggestion from SMS", () => {
  const customers = [
    { id: "C001", name: "رضوى نبيل", phone: "01001234567" },
    { id: "C002", name: "محمد صبري", phone: "" },
  ];
  it("normalizes +20 and leading zero", () => {
    expect(normalizePhone("+20 100 123 4567")).toBe("1001234567");
    expect(normalizePhone("01001234567")).toBe("1001234567");
  });
  it("matches by phone first", () => {
    expect(suggestCustomers(customers, { phones: ["+201001234567"], names: ["محمد صبري"] }).map((c) => c.id)).toEqual(["C001"]);
  });
  it("falls back to name, ignoring alef/taa marbuta variants", () => {
    expect(suggestCustomers(customers, { phones: [], names: ["محمد صبري احمد"] }).map((c) => c.id)).toEqual(["C002"]);
  });
  it("suggests nothing for an unknown name", () => {
    expect(suggestCustomers(customers, { phones: [], names: ["علي حسن"] })).toEqual([]);
  });
});

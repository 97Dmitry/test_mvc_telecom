import { describe, expect, it } from "vitest";
import mockData from "../data/mock-payment-queue.json";
import type { IProviderPaymentQueueRow } from "../types/provider-payment-queue";
import { computePaymentPlan } from "./payment-planner-compute";
import { parsePaymentPlannerParams } from "./payment-planner-params";

function bill(overrides: Partial<IProviderPaymentQueueRow> = {}): IProviderPaymentQueueRow {
  return { ...mockData[0], ...overrides };
}

const allSelected = parsePaymentPlannerParams({ selectedCount: 100 });

describe("computePaymentPlan domain rules", () => {
  it.each([
    {
      count: 14,
      invalidCount: 0,
      totals: [
        [643, 1248500, 7],
        [840, 103500, 3],
        [978, 12600, 2],
        [826, 11000, 2],
      ],
    },
    {
      count: 20,
      invalidCount: 2,
      totals: [
        [643, 1622500, 9],
        [840, 125500, 4],
        [978, 22200, 3],
        [826, 11000, 2],
      ],
    },
  ])(
    "matches independently checked fixture totals for N=$count",
    ({ count, invalidCount, totals }) => {
      const result = computePaymentPlan(mockData as IProviderPaymentQueueRow[], {
        ...allSelected,
        selectedCount: count,
      });
      expect(
        result.currencyTotals.map((total) => [
          total.currencyId,
          total.totalAmount,
          total.billCount,
        ]),
      ).toEqual(totals);
      expect(result.invalidSelectedCount).toBe(invalidCount);
    },
  );

  it("keeps currencies separate and computes provider shares within each currency", () => {
    const rows = [
      bill({
        provider_id: 1,
        provider_name: "A",
        provider_currency_id: 1,
        provider_currency_name: "USD",
        provider_total_due: 20,
      }),
      bill({
        provider_id: 2,
        provider_name: "B",
        provider_currency_id: 1,
        provider_currency_name: "USD",
        provider_total_due: "60",
      }),
      bill({
        provider_id: 1,
        provider_name: "A",
        provider_currency_id: 1,
        provider_currency_name: "USD",
        provider_total_due: 20,
      }),
      bill({
        provider_id: 1,
        provider_name: "A",
        provider_currency_id: 2,
        provider_currency_name: "EUR",
        provider_total_due: 200,
      }),
    ];
    const result = computePaymentPlan(rows, allSelected);
    expect(result.currencyTotals).toEqual([
      { currencyId: 1, currencyName: "USD", totalAmount: 100, billCount: 3, providerCount: 2 },
      { currencyId: 2, currencyName: "EUR", totalAmount: 200, billCount: 1, providerCount: 1 },
    ]);
    expect(result.providerBreakdown).toEqual([
      {
        providerId: 1,
        providerName: "A",
        currencyId: 2,
        currencyName: "EUR",
        billCount: 1,
        totalAmount: 200,
        sharePercent: 100,
      },
      {
        providerId: 2,
        providerName: "B",
        currencyId: 1,
        currencyName: "USD",
        billCount: 1,
        totalAmount: 60,
        sharePercent: 60,
      },
      {
        providerId: 1,
        providerName: "A",
        currencyId: 1,
        currencyName: "USD",
        billCount: 2,
        totalAmount: 40,
        sharePercent: 40,
      },
    ]);
    expect(result.selectedProviderCount).toBe(2);
  });

  it("sorts finite numeric ranks before missing ranks and preserves original order for equal ids", () => {
    const rows = [
      bill({ payment_rank: null, provider_bill_id: 1, provider_bill_no: "missing" }),
      bill({ payment_rank: "2", provider_bill_id: 2, provider_bill_no: "second" }),
      bill({ payment_rank: 1, provider_bill_id: 3, provider_bill_no: "tie-first" }),
      bill({ payment_rank: "1", provider_bill_id: 3, provider_bill_no: "tie-second" }),
      bill({ payment_rank: 1, provider_bill_id: 2, provider_bill_no: "first" }),
      bill({ payment_rank: Infinity, provider_bill_id: 0, provider_bill_no: "infinite" }),
      bill({ payment_rank: " ", provider_bill_id: 4, provider_bill_no: "blank" }),
      bill({ payment_rank: "bad", provider_bill_id: 5, provider_bill_no: "invalid" }),
      bill({ payment_rank: NaN, provider_bill_id: 6, provider_bill_no: "nan" }),
    ];
    const result = computePaymentPlan(rows, allSelected);
    expect(result.queueItems.map((item) => item.row.provider_bill_no)).toEqual([
      "first",
      "tie-first",
      "tie-second",
      "second",
      "infinite",
      "missing",
      "blank",
      "invalid",
      "nan",
    ]);
    expect(result.queueItems.map((item) => item.rank)).toEqual([
      1,
      1,
      1,
      2,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(result.queueItems.map((item) => item.queuePosition)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it("keeps invalid amounts in selection while excluding them and their providers from aggregates", () => {
    const amounts = [null, 0, -1, "bad", "", Infinity, NaN, "10.125"];
    const result = computePaymentPlan(
      amounts.map((amount, index) => bill({ provider_id: index, provider_total_due: amount })),
      allSelected,
    );
    expect(result.effectiveSelectedCount).toBe(8);
    expect(result.invalidSelectedCount).toBe(7);
    expect(result.selectedProviderCount).toBe(1);
    expect(result.queueItems.map((item) => item.providerAmount)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      10.125,
    ]);
    expect(result.currencyTotals[0]?.totalAmount).toBe(10.125);
    expect(result.currencyTotals[0]?.billCount).toBe(1);
    expect(result.providerBreakdown).toHaveLength(1);
  });

  it("preserves sub-cent precision and stable provider ordering for equal totals", () => {
    const result = computePaymentPlan(
      [
        bill({ provider_id: 1, provider_total_due: "0.123" }),
        bill({ provider_id: 2, provider_total_due: 0.123 }),
        bill({ provider_id: 3, provider_total_due: 0.1 }),
      ],
      allSelected,
    );
    expect(result.currencyTotals[0]?.totalAmount).toBeCloseTo(0.346, 12);
    expect(result.providerBreakdown.map((item) => item.providerId)).toEqual([1, 2, 3]);
    expect(result.providerBreakdown[0]?.sharePercent).toBeCloseTo(35.54913294797688, 10);
    expect(result.providerBreakdown[2]?.sharePercent).toBeCloseTo(28.90173410404624, 10);
  });

  it("applies all scope filters before selection", () => {
    const result = computePaymentPlan(
      [
        bill({ payment_rank: 1, provider_id: 9, billing_cycle_id: 3, provider_currency_id: 1 }),
        bill({ payment_rank: 2, provider_id: 2, billing_cycle_id: 8, provider_currency_id: 1 }),
        bill({ payment_rank: 3, provider_id: 2, billing_cycle_id: 3, provider_currency_id: 9 }),
        bill({
          payment_rank: 5,
          provider_id: 2,
          billing_cycle_id: 3,
          provider_currency_id: 1,
          provider_bill_id: 50,
        }),
        bill({
          payment_rank: 4,
          provider_id: 2,
          billing_cycle_id: 3,
          provider_currency_id: 2,
          provider_bill_id: 40,
        }),
      ],
      parsePaymentPlannerParams({
        providerId: 2,
        billingCycleId: 3,
        currencyIds: [1, 2],
        selectedCount: 1,
      }),
    );
    expect(result.totalQueueCount).toBe(2);
    expect(result.queueItems.map((item) => [item.row.provider_bill_id, item.selected])).toEqual([
      [40, true],
      [50, false],
    ]);
  });

  it.each([
    [undefined, 2],
    [0, 0],
    [-5, 0],
    [1.6, 2],
    [100, 3],
    [NaN, 2],
    [Infinity, 2],
    [-Infinity, 2],
  ])("normalizes runtime selected count %s to %s", (override, expected) => {
    const result = computePaymentPlan(
      [bill(), bill(), bill()],
      parsePaymentPlannerParams({ selectedCount: 2 }),
      { selectedCountOverride: override },
    );
    expect(result.effectiveSelectedCount).toBe(expected);
    expect(result.queueItems.filter((item) => item.selected)).toHaveLength(expected);
    if (expected === 0) {
      expect(result.currencyTotals).toEqual([]);
      expect(result.providerBreakdown).toEqual([]);
      expect(result.selectedProviderCount).toBe(0);
      expect(result.invalidSelectedCount).toBe(0);
    }
  });

  it("returns the full queue with display-only row limit and does not mutate inputs", () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      Object.freeze(bill({ payment_rank: 12 - index })),
    );
    Object.freeze(rows);
    const config = Object.freeze(parsePaymentPlannerParams({ selectedCount: 12, rowLimit: 10 }));
    Object.freeze(config.currencyIds);
    const runtime = Object.freeze({ selectedCountOverride: 11 });
    const before = structuredClone(rows);
    const result = computePaymentPlan(rows, config, runtime);
    expect(result.queueItems).toHaveLength(12);
    expect(result.visibleQueueItems).toHaveLength(10);
    expect(result.effectiveSelectedCount).toBe(11);
    expect(result.currencyTotals[0]?.billCount).toBe(11);
    expect(result.queueItems[0]?.row).toBe(rows[11]);
    expect(rows).toEqual(before);
    expect(config.selectedCount).toBe(12);
    expect(runtime.selectedCountOverride).toBe(11);
  });

  it("detects customer bills independently of visibility and accepts zero or negative finite amounts", () => {
    const result = computePaymentPlan(
      [
        bill({ customer_bill_no: " C-1 ", customer_total_due: "0" }),
        bill({ customer_bill_no: "C-2", customer_total_due: -2 }),
        bill({ customer_bill_no: " ", customer_total_due: 3 }),
        bill({ customer_bill_no: null, customer_total_due: 3 }),
        bill({ customer_bill_no: "C-3", customer_total_due: "bad" }),
        bill({ customer_bill_no: "C-4", customer_total_due: Infinity }),
      ],
      { ...allSelected, showCustomerBills: false },
    );
    expect(result.queueItems.map((item) => item.hasCustomerBill)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(result.queueItems.map((item) => item.customerAmount)).toEqual([0, -2, 3, 3, null, null]);
  });

  it("returns empty results for an empty scope", () => {
    const result = computePaymentPlan([bill()], { ...allSelected, providerId: -999 });
    expect(result).toEqual({
      totalQueueCount: 0,
      effectiveSelectedCount: 0,
      selectedProviderCount: 0,
      invalidSelectedCount: 0,
      currencyTotals: [],
      providerBreakdown: [],
      queueItems: [],
      visibleQueueItems: [],
    });
  });
});

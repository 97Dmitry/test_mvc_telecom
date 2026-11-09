import { describe, expect, it } from "vitest";
import { parsePaymentPlannerParams } from "./payment-planner-params";

describe("payment planner parameter validation", () => {
  it("deduplicates finite currency ids while preserving their first occurrence", () => {
    expect(
      parsePaymentPlannerParams({
        currencyIds: [2, 1, 2, NaN, Infinity, -Infinity, "3", null, 0, -1, 1.5, 1],
      }).currencyIds,
    ).toEqual([2, 1, 0, -1, 1.5]);
  });

  it.each([10, 25, 50, 100])("reads legacy maxRows=%s when rowLimit is absent", (maxRows) => {
    expect(parsePaymentPlannerParams({ maxRows }).rowLimit).toBe(maxRows);
  });

  it("prefers rowLimit over legacy maxRows", () => {
    expect(parsePaymentPlannerParams({ rowLimit: 25, maxRows: 100 }).rowLimit).toBe(25);
  });

  it.each([null, undefined, 0, 20, "25", NaN, Infinity, false])(
    "defaults explicitly invalid rowLimit=%s even when maxRows is valid",
    (rowLimit) => {
      expect(parsePaymentPlannerParams({ rowLimit, maxRows: 100 }).rowLimit).toBe(10);
    },
  );

  it("returns all defaults for missing parameters", () => {
    expect(parsePaymentPlannerParams(undefined)).toEqual({
      description: "Provider Payment Planner",
      subtitle: "",
      size: "full",
      selectedCount: 10,
      currencyIds: [],
      providerId: "all",
      billingCycleId: "all",
      amountFormat: "grouped",
      rowLimit: 10,
      showCustomerBills: true,
      showProviderBreakdown: true,
      showSummary: true,
    });
  });

  it.each([null, false, 0, "invalid", [], NaN, Infinity])(
    "handles malformed top-level input %s without throwing",
    (params) => {
      expect(parsePaymentPlannerParams(params as unknown as Record<string, unknown>)).toEqual(
        parsePaymentPlannerParams(undefined),
      );
    },
  );

  it("trims the description and subtitle", () => {
    const config = parsePaymentPlannerParams({
      description: "  Planner  ",
      title: "Ignored title",
      subtitle: "  Subtitle \n",
    });
    expect(config.description).toBe("Planner");
    expect(config.subtitle).toBe("Subtitle");
  });

  it.each([undefined, null, 5, " \n "])(
    "falls back from description=%s to title",
    (description) => {
      expect(
        parsePaymentPlannerParams({ description, title: "  Legacy title  " }).description,
      ).toBe("Legacy title");
    },
  );

  it("defaults invalid text fields", () => {
    const config = parsePaymentPlannerParams({ description: {}, title: " ", subtitle: false });
    expect(config.description).toBe("Provider Payment Planner");
    expect(config.subtitle).toBe("");
  });

  it.each([
    [0, 0],
    [-5, 0],
    [-0.5, 0],
    [2.49, 2],
    [2.5, 3],
    [null, 10],
    ["5", 10],
    [NaN, 10],
    [Infinity, 10],
    [-Infinity, 10],
  ])("normalizes selectedCount=%s to %s", (selectedCount, expected) => {
    expect(parsePaymentPlannerParams({ selectedCount }).selectedCount).toBe(expected);
  });

  it.each([null, {}, "1,2", undefined])(
    "defaults malformed currencyIds=%s to all",
    (currencyIds) => {
      expect(parsePaymentPlannerParams({ currencyIds }).currencyIds).toEqual([]);
    },
  );

  it.each(["providerId", "billingCycleId"] as const)("validates the %s filter", (key) => {
    for (const value of [0, -1, 1.5, 1770]) {
      expect(parsePaymentPlannerParams({ [key]: value })[key]).toBe(value);
    }
    for (const value of [undefined, null, "all", "1770", NaN, Infinity, -Infinity, false, {}]) {
      expect(parsePaymentPlannerParams({ [key]: value })[key]).toBe("all");
    }
  });

  it.each(["full", "half", "third", "quarter"])("accepts size=%s", (size) => {
    expect(parsePaymentPlannerParams({ size }).size).toBe(size);
  });

  it.each(["grouped", "plain"])("accepts amountFormat=%s", (amountFormat) => {
    expect(parsePaymentPlannerParams({ amountFormat }).amountFormat).toBe(amountFormat);
  });

  it.each([10, 25, 50, 100])("accepts rowLimit=%s", (rowLimit) => {
    expect(parsePaymentPlannerParams({ rowLimit }).rowLimit).toBe(rowLimit);
  });

  it.each([null, "unknown", {}, 25, true, NaN])("defaults invalid enums %s", (value) => {
    const config = parsePaymentPlannerParams({ size: value, amountFormat: value });
    expect(config.size).toBe("full");
    expect(config.amountFormat).toBe("grouped");
  });

  it.each([null, undefined, 0, 20, "25", NaN, Infinity, false])(
    "defaults invalid legacy maxRows=%s",
    (maxRows) => {
      expect(parsePaymentPlannerParams({ maxRows }).rowLimit).toBe(10);
    },
  );

  it.each(["showCustomerBills", "showProviderBreakdown", "showSummary"] as const)(
    "accepts only strict booleans for %s",
    (key) => {
      expect(parsePaymentPlannerParams({ [key]: false })[key]).toBe(false);
      expect(parsePaymentPlannerParams({ [key]: true })[key]).toBe(true);
      for (const value of [undefined, null, 0, 1, "false", "true", {}, []]) {
        expect(parsePaymentPlannerParams({ [key]: value })[key]).toBe(true);
      }
    },
  );

  it("does not mutate frozen input or share the currency array", () => {
    const currencyIds = Object.freeze([2, 1, 2]);
    const params = Object.freeze({ currencyIds, description: "  Planner  ", maxRows: 25 });
    const config = parsePaymentPlannerParams(params);
    config.currencyIds.push(3);
    expect(currencyIds).toEqual([2, 1, 2]);
    expect(params.description).toBe("  Planner  ");
    expect(parsePaymentPlannerParams(params).currencyIds).toEqual([2, 1]);
  });
});

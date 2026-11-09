import { describe, expect, it } from "vitest";
import { parsePaymentPlannerParams } from "./payment-planner-params";

describe("parsePaymentPlannerParams", () => {
  it("returns default config when params are undefined", () => {
    const config = parsePaymentPlannerParams(undefined);
    expect(config.description).toBe("Provider Payment Planner");
    expect(config.selectedCount).toBe(10);
    expect(config.rowLimit).toBe(10);
    expect(config.amountFormat).toBe("grouped");
    expect(config.currencyIds).toEqual([]);
  });

  it("clamps negative selectedCount to 0", () => {
    const config = parsePaymentPlannerParams({ selectedCount: -5 });
    expect(config.selectedCount).toBe(0);
  });
});

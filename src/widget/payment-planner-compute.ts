import { toFiniteNumber } from "../platform/to-finite-number";
import type { IProviderPaymentQueueRow } from "../types/provider-payment-queue";
import type { IPaymentPlannerConfig } from "./payment-planner-params";

/** Processed invoice row in the sorted queue. */
export interface IQueueBillItem {
  /** 1-based position in the filtered & sorted queue. */
  queuePosition: number;
  row: IProviderPaymentQueueRow;
  /** Numeric `payment_rank` (`null` if missing/invalid). */
  rank: number | null;
  /** Numeric `provider_total_due` (`null` if missing or `<= 0`). */
  providerAmount: number | null;
  /** `true` when `provider_total_due` is `null`, `<= 0`, or non-numeric. */
  hasInvalidAmount: boolean;
  /** `true` when `queuePosition <= effectiveSelectedCount`. */
  selected: boolean;
  /** Numeric `customer_total_due` (`null` if absent or non-numeric). */
  customerAmount: number | null;
  /** `true` when both `customer_bill_no` (non-empty) and a valid `customerAmount` are present. */
  hasCustomerBill: boolean;
}

/** Aggregated payment sum for a single currency across selected valid bills. */
export interface ICurrencyTotal {
  currencyId: number;
  currencyName: string;
  /** Total amount of selected valid bills in this currency. */
  totalAmount: number;
  /** Number of selected valid bills in this currency. */
  billCount: number;
  /** Number of unique providers in this currency among selected valid bills. */
  providerCount: number;
}

/** Per-provider payment share within a specific currency across selected valid bills. */
export interface IProviderCurrencyBreakdownItem {
  providerId: number;
  providerName: string;
  currencyId: number;
  currencyName: string;
  billCount: number;
  totalAmount: number;
  /** Share (`0..100`) of this provider's `totalAmount` within `currencyTotal.totalAmount`. */
  sharePercent: number;
}

/** Interactive UI overrides inside the widget (slider override, quick filter overrides). */
export interface IPaymentPlannerRuntimeState {
  selectedCountOverride?: number;
}

export interface IPaymentPlanResult {
  /** Total bills in the filtered queue. */
  totalQueueCount: number;
  /** Clamped number of selected bills: `Math.min(Math.max(0, selectedCount), totalQueueCount)`. */
  effectiveSelectedCount: number;
  /** Number of unique providers across selected valid bills. */
  selectedProviderCount: number;
  /** Count of selected bills that have `hasInvalidAmount === true` (excluded from sums). */
  invalidSelectedCount: number;
  /** Totals per currency for selected valid bills (never summing across currencies). */
  currencyTotals: ICurrencyTotal[];
  /** Provider breakdown per currency for selected valid bills, sorted by `totalAmount` descending. */
  providerBreakdown: IProviderCurrencyBreakdownItem[];
  /** Full filtered and sorted queue. */
  queueItems: IQueueBillItem[];
  /** Queue sliced to `config.rowLimit` for table display. */
  visibleQueueItems: IQueueBillItem[];
}

/**
 * Pure computation of the provider payment plan from `provider-payment-queue` rows.
 *
 * Must NOT depend on React or DOM APIs.
 *
 * Key domain rules:
 * 1. Scope filters (`providerId`, `billingCycleId`, `currencyIds`) are applied BEFORE sorting and selecting
 *    the first `selectedCount` bills.
 * 2. Sorting order:
 *    - `payment_rank` ascending (valid finite ranks first; missing/invalid ranks last),
 *    - `provider_bill_id` ascending as tie-breaker (since Enigma partitions `payment_rank` by `provider_id`),
 *    - original array index (stable order).
 * 3. Selection: `effectiveSelectedCount = Math.min(Math.max(0, selectedCount), filteredQueue.length)`.
 *    The first `effectiveSelectedCount` items in the sorted queue have `selected = true`.
 * 4. Invalid amounts: if `toFiniteNumber(row.provider_total_due)` is `null` or `<= 0`, mark
 *    `hasInvalidAmount = true`. Never treat invalid amounts as `0` in aggregates — exclude them from
 *    `currencyTotals` and `providerBreakdown` and increment `invalidSelectedCount` when selected.
 * 5. Never sum amounts across different currencies.
 */
export function computePaymentPlan(
  rows: readonly IProviderPaymentQueueRow[],
  config: IPaymentPlannerConfig,
  runtimeState?: IPaymentPlannerRuntimeState,
): IPaymentPlanResult {
  const currencyFilter = new Set(config.currencyIds);
  const sortedRows = rows
    .map((row, originalIndex) => ({ row, originalIndex, rank: toFiniteNumber(row.payment_rank) }))
    .filter(
      ({ row }) =>
        (config.providerId === "all" || row.provider_id === config.providerId) &&
        (config.billingCycleId === "all" || row.billing_cycle_id === config.billingCycleId) &&
        (currencyFilter.size === 0 || currencyFilter.has(row.provider_currency_id)),
    )
    .sort((a, b) => {
      if (a.rank === null && b.rank !== null) return 1;
      if (a.rank !== null && b.rank === null) return -1;
      return (
        (a.rank !== null && b.rank !== null ? a.rank - b.rank : 0) ||
        a.row.provider_bill_id - b.row.provider_bill_id ||
        a.originalIndex - b.originalIndex
      );
    });

  const override = runtimeState?.selectedCountOverride;
  const selectedCount =
    typeof override === "number" && Number.isFinite(override) ? override : config.selectedCount;
  const effectiveSelectedCount = Math.min(
    Math.max(0, Math.round(selectedCount)),
    sortedRows.length,
  );
  const queueItems: IQueueBillItem[] = sortedRows.map(({ row, rank }, index) => {
    const amount = toFiniteNumber(row.provider_total_due);
    const providerAmount = amount !== null && amount > 0 ? amount : null;
    const customerAmount = toFiniteNumber(row.customer_total_due);
    return {
      queuePosition: index + 1,
      row,
      rank,
      providerAmount,
      hasInvalidAmount: providerAmount === null,
      selected: index < effectiveSelectedCount,
      customerAmount,
      hasCustomerBill:
        typeof row.customer_bill_no === "string" &&
        row.customer_bill_no.trim().length > 0 &&
        customerAmount !== null,
    };
  });

  const currencies = new Map<number, { total: ICurrencyTotal; providers: Set<number> }>();
  const providers = new Map<string, IProviderCurrencyBreakdownItem>();
  const selectedProviders = new Set<number>();
  let invalidSelectedCount = 0;

  for (const item of queueItems) {
    if (!item.selected) continue;
    if (item.providerAmount === null) {
      invalidSelectedCount++;
      continue;
    }

    const row = item.row;
    selectedProviders.add(row.provider_id);
    let currency = currencies.get(row.provider_currency_id);
    if (!currency) {
      currency = {
        total: {
          currencyId: row.provider_currency_id,
          currencyName: row.provider_currency_name,
          totalAmount: 0,
          billCount: 0,
          providerCount: 0,
        },
        providers: new Set<number>(),
      };
      currencies.set(row.provider_currency_id, currency);
    }
    currency.total.totalAmount += item.providerAmount;
    currency.total.billCount++;
    currency.providers.add(row.provider_id);
    currency.total.providerCount = currency.providers.size;

    const providerKey = `${row.provider_id}:${row.provider_currency_id}`;
    let provider = providers.get(providerKey);
    if (!provider) {
      provider = {
        providerId: row.provider_id,
        providerName: row.provider_name,
        currencyId: row.provider_currency_id,
        currencyName: row.provider_currency_name,
        billCount: 0,
        totalAmount: 0,
        sharePercent: 0,
      };
      providers.set(providerKey, provider);
    }
    provider.totalAmount += item.providerAmount;
    provider.billCount++;
  }

  const providerBreakdown = Array.from(providers.values());
  for (const provider of providerBreakdown) {
    const currency = currencies.get(provider.currencyId);
    if (currency) {
      provider.sharePercent = (provider.totalAmount / currency.total.totalAmount) * 100;
    }
  }
  providerBreakdown.sort((a, b) => b.totalAmount - a.totalAmount);

  return {
    totalQueueCount: sortedRows.length,
    effectiveSelectedCount,
    selectedProviderCount: selectedProviders.size,
    invalidSelectedCount,
    currencyTotals: Array.from(currencies.values(), ({ total }) => total),
    providerBreakdown,
    queueItems,
    visibleQueueItems: queueItems.slice(0, config.rowLimit),
  };
}

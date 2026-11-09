import { Fragment, useId, useMemo, useRef, useState, type ReactElement } from "react";
import { FreshnessMark } from "../platform/freshness-mark";
import { WidgetHeader } from "../platform/widget-card";
import { widgetCardClass } from "../platform/widget-card-class";
import { formatValue } from "../platform/value-format";
import type { ICollectionDataResult, TWidgetSize } from "../platform/widget-types";
import type { IProviderPaymentQueueRow } from "../types/provider-payment-queue";
import { computePaymentPlan, type IQueueBillItem } from "./payment-planner-compute";
import { parsePaymentPlannerParams } from "./payment-planner-params";
import "./payment-planner.css";

const CLASS = "dash-payment-planner";
const AMOUNT_FORMATTERS = {
  grouped: new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
  plain: new Intl.NumberFormat("en-US", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
};
const COLORS = ["blue", "aqua", "orange", "violet", "magenta", "yellow", "green", "red"];
export interface IPaymentPlannerWidgetProps {
  params?: Record<string, unknown>;
  data: ICollectionDataResult<IProviderPaymentQueueRow>;
  size?: TWidgetSize;
}

export function PaymentPlannerWidget({
  params,
  data,
  size,
}: IPaymentPlannerWidgetProps): ReactElement {
  const config = useMemo(() => parsePaymentPlannerParams(params), [params]);
  const effectiveSize = size ?? config.size;
  const currencyScope = JSON.stringify(config.currencyIds);
  const [selection, setSelection] = useState({
    base: config.selectedCount,
    value: config.selectedCount,
  });
  const [provider, setProvider] = useState<{ base: number | "all"; value: number | "all" }>({
    base: config.providerId,
    value: "all",
  });
  const [cycle, setCycle] = useState<{ base: number | "all"; value: number | "all" }>({
    base: config.billingCycleId,
    value: "all",
  });
  const [currencies, setCurrencies] = useState({ base: currencyScope, value: [] as number[] });
  if (selection.base !== config.selectedCount)
    setSelection({ base: config.selectedCount, value: config.selectedCount });
  if (provider.base !== config.providerId) setProvider({ base: config.providerId, value: "all" });
  if (cycle.base !== config.billingCycleId) setCycle({ base: config.billingCycleId, value: "all" });
  if (currencies.base !== currencyScope) setCurrencies({ base: currencyScope, value: [] });
  const [breakdownCurrency, setBreakdownCurrency] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [allCurrencies, setAllCurrencies] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const id = useId();
  const runtimeRows = data.items.filter(
    (row) =>
      (provider.value === "all" || row.provider_id === provider.value) &&
      (cycle.value === "all" || row.billing_cycle_id === cycle.value) &&
      (!currencies.value.length || currencies.value.includes(row.provider_currency_id)),
  );
  const plan = computePaymentPlan(runtimeRows, config, { selectedCountOverride: selection.value });
  const activeCurrency = plan.currencyTotals.some((total) => total.currencyId === breakdownCurrency)
    ? breakdownCurrency
    : plan.currencyTotals[0]?.currencyId;
  const breakdown = plan.providerBreakdown.filter((item) => item.currencyId === activeCurrency);
  const amount = (value: number) => AMOUNT_FORMATTERS[config.amountFormat].format(value);
  // Occurrences disambiguate duplicate invoices without tying identity to unrelated source rows.
  const keyCounts = new Map<string, number>();
  const rowKeys = new Map<IQueueBillItem, string>();
  for (const item of plan.queueItems) {
    const identity = `${item.row.provider_id}-${item.row.provider_bill_id}`;
    const occurrence = keyCounts.get(identity) ?? 0;
    keyCounts.set(identity, occurrence + 1);
    rowKeys.set(item, `${identity}-${occurrence}`);
  }
  const rowKey = (item: IQueueBillItem) => rowKeys.get(item)!;
  const toggleDetails = (key: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const openQueue = (button: HTMLButtonElement) => {
    opener.current = button;
    setDialogOpen(true);
    dialog.current?.showModal();
  };
  const closeQueue = () => dialog.current?.close();
  const resetFilters = () => {
    setProvider({ base: config.providerId, value: "all" });
    setCycle({ base: config.billingCycleId, value: "all" });
    setCurrencies({ base: currencyScope, value: [] });
  };
  const options = (
    field: "provider_id" | "billing_cycle_id" | "provider_currency_id",
    name: "provider_name" | "billing_cycle_name" | "provider_currency_name",
    retained: (number | "all")[],
  ) => {
    const current = new Map(data.items.map((row) => [row[field], row[name]]));
    for (const value of retained) {
      if (value !== "all" && !current.has(value)) current.set(value, `${value} — нет счетов`);
    }
    return [...current.entries()];
  };
  const providerOptions = options("provider_id", "provider_name", [
    config.providerId,
    provider.value,
  ]);
  const cycleOptions = options("billing_cycle_id", "billing_cycle_name", [
    config.billingCycleId,
    cycle.value,
  ]);
  const currencyOptions = options("provider_currency_id", "provider_currency_name", [
    ...config.currencyIds,
    ...currencies.value,
  ]);
  const renderBody = (viewSize: TWidgetSize, complete = false) => {
    const full = viewSize === "full";
    const tableRows = complete ? plan.queueItems : plan.visibleQueueItems;
    const totals =
      viewSize === "quarter" && !allCurrencies
        ? plan.currencyTotals.slice(0, 2)
        : plan.currencyTotals;
    return (
      <div className={`${CLASS}__body`}>
        <div className={`${CLASS}__overview`}>
          {(!full || !config.showSummary) && (
            <div className={`${CLASS}__selection`}>
              <div>
                <strong className={`${CLASS}__count`}>
                  {plan.effectiveSelectedCount} / {plan.totalQueueCount}
                </strong>
                <span> счетов выбрано</span>
              </div>
              {config.showSummary && <span>{plan.selectedProviderCount} поставщиков</span>}
            </div>
          )}
          {config.showSummary && full && (
            <div className={`${CLASS}__kpis`}>
              <div>
                <strong>{plan.totalQueueCount}</strong>
                <span>счетов в очереди</span>
              </div>
              <div>
                <strong>
                  {plan.effectiveSelectedCount} / {plan.totalQueueCount}
                </strong>
                <span>выбрано к оплате</span>
              </div>
              <div>
                <strong>{plan.selectedProviderCount}</strong>
                <span>поставщиков</span>
              </div>
            </div>
          )}
          {(full || viewSize === "half") && (
            <div className={`${CLASS}__controls`}>
              <label className={`${CLASS}__range`}>
                Первые счета к оплате
                <input
                  aria-label="Количество счетов"
                  type="range"
                  min="0"
                  max={plan.totalQueueCount}
                  step="1"
                  value={plan.effectiveSelectedCount}
                  onChange={(event) =>
                    setSelection({ ...selection, value: Number(event.target.value) })
                  }
                />
              </label>
              {full && (
                <label>
                  Количество
                  <input
                    aria-label="Количество счетов числом"
                    type="number"
                    min="0"
                    max={plan.totalQueueCount}
                    step="1"
                    value={plan.effectiveSelectedCount}
                    onChange={(event) =>
                      setSelection({
                        ...selection,
                        value: Math.min(
                          plan.totalQueueCount,
                          Math.max(0, Math.round(Number(event.target.value))),
                        ),
                      })
                    }
                  />
                </label>
              )}
            </div>
          )}
          {full && (
            <div className={`${CLASS}__filters`}>
              <label>
                Поставщик
                <select
                  value={provider.value === "all" ? config.providerId : provider.value}
                  onChange={(event) =>
                    setProvider({
                      ...provider,
                      value: event.target.value === "all" ? "all" : Number(event.target.value),
                    })
                  }
                >
                  <option value="all" disabled={config.providerId !== "all"}>
                    Все поставщики
                  </option>
                  {providerOptions.map(([value, name]) => (
                    <option
                      key={value}
                      value={value}
                      disabled={config.providerId !== "all" && config.providerId !== value}
                    >
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Биллинговый цикл
                <select
                  value={cycle.value === "all" ? config.billingCycleId : cycle.value}
                  onChange={(event) =>
                    setCycle({
                      ...cycle,
                      value: event.target.value === "all" ? "all" : Number(event.target.value),
                    })
                  }
                >
                  <option value="all" disabled={config.billingCycleId !== "all"}>
                    Все циклы
                  </option>
                  {cycleOptions.map(([value, name]) => (
                    <option
                      key={value}
                      value={value}
                      disabled={config.billingCycleId !== "all" && config.billingCycleId !== value}
                    >
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>Валюты</legend>
                {currencyOptions.map(([value, name]) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      checked={currencies.value.includes(value)}
                      disabled={
                        config.currencyIds.length > 0 && !config.currencyIds.includes(value)
                      }
                      onChange={(event) =>
                        setCurrencies({
                          ...currencies,
                          value: event.target.checked
                            ? [...currencies.value, value]
                            : currencies.value.filter((currency) => currency !== value),
                        })
                      }
                    />
                    {name}
                  </label>
                ))}
                <small>
                  {config.currencyIds.length > 0
                    ? `Ограничение настроек: ${currencyOptions
                        .filter(([value]) => config.currencyIds.includes(value))
                        .map(([, name]) => name)
                        .join(", ")}. Без отметок — все разрешённые валюты`
                    : "Без отметок — все доступные"}
                </small>
              </fieldset>
            </div>
          )}
          {plan.invalidSelectedCount > 0 && (
            <p className={`${CLASS}__warning`}>
              ⚠ Счетов с некорректной суммой: {plan.invalidSelectedCount}. Исключены из сумм,
              занимают место в выборе.
            </p>
          )}
          {plan.totalQueueCount === 0 ? (
            <div className={`${CLASS}__empty`}>
              <p>По заданным фильтрам счетов нет</p>
              <button type="button" onClick={resetFilters}>
                Сбросить локальные фильтры
              </button>
            </div>
          ) : (
            <div className={`${CLASS}__financials${full ? ` ${CLASS}__financials--full` : ""}`}>
              {config.showSummary && (
                <section aria-label="Суммы по валютам" className={`${CLASS}__totals`}>
                  <h5>Суммы по валютам</h5>
                  {plan.effectiveSelectedCount === 0 ? (
                    <p>Выберите счета, чтобы рассчитать суммы</p>
                  ) : plan.currencyTotals.length === 0 ? (
                    <p>У выбранных счетов нет корректных сумм</p>
                  ) : (
                    <dl>
                      {totals.map((total) => (
                        <div key={total.currencyId}>
                          <dt>{total.currencyName}</dt>
                          <dd>{amount(total.totalAmount)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {viewSize === "quarter" && !allCurrencies && plan.currencyTotals.length > 2 && (
                    <button
                      type="button"
                      aria-expanded={false}
                      onClick={() => setAllCurrencies(true)}
                    >
                      + ещё {plan.currencyTotals.length - 2} валюты
                    </button>
                  )}
                  {viewSize === "quarter" && allCurrencies && plan.currencyTotals.length > 2 && (
                    <button
                      type="button"
                      aria-expanded={true}
                      onClick={() => setAllCurrencies(false)}
                    >
                      Свернуть валюты
                    </button>
                  )}
                </section>
              )}
              {config.showProviderBreakdown && (full || viewSize === "third") && (
                <section
                  aria-label="Распределение по поставщикам"
                  className={`${CLASS}__breakdown`}
                >
                  <label>
                    По поставщикам
                    <select
                      aria-label="Валюта распределения"
                      value={activeCurrency ?? ""}
                      disabled={!plan.currencyTotals.length}
                      onChange={(event) => setBreakdownCurrency(Number(event.target.value))}
                    >
                      {plan.currencyTotals.map((total) => (
                        <option key={total.currencyId} value={total.currencyId}>
                          {total.currencyName}
                        </option>
                      ))}
                    </select>
                  </label>
                  {breakdown.length ? (
                    <>
                      <div className={`${CLASS}__shares`} aria-hidden="true">
                        {breakdown.map((item, index) => (
                          <span
                            key={item.providerId}
                            style={{
                              width: `${item.sharePercent}%`,
                              background: `var(--chart-${COLORS[index % COLORS.length]})`,
                            }}
                          />
                        ))}
                      </div>
                      <ul>
                        {breakdown.map((item, index) => (
                          <li key={item.providerId}>
                            <span
                              className={`${CLASS}__dot`}
                              style={{
                                background: `var(--chart-${COLORS[index % COLORS.length]})`,
                              }}
                            />
                            <span>{item.providerName}</span>
                            <strong>{item.sharePercent.toFixed(1)}%</strong>
                            {full && (
                              <span>
                                {amount(item.totalAmount)} {item.currencyName}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p>Нет сумм для распределения</p>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
        {full && plan.totalQueueCount > 0 && (
          <section className={`${CLASS}__queue`} aria-label="Очередь платежей">
            <div className={`${CLASS}__table-scroll`}>
              <table>
                <caption>
                  Показано {tableRows.length} из {plan.totalQueueCount} счетов
                </caption>
                <thead>
                  <tr>
                    <th>Ранг</th>
                    <th>Поставщик / счёт</th>
                    <th>Получен</th>
                    <th className="amount">Сумма</th>
                    <th>Выбор / детали</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((item) => {
                    const key = rowKey(item);
                    const detailsId = `${id}-${complete ? "dialog" : "card"}-${key}`;
                    return (
                      <Fragment key={key}>
                        <tr data-selected={item.selected}>
                          <td>{item.rank ?? "—"}</td>
                          <td>
                            <strong>{item.row.provider_name}</strong>
                            <span>{item.row.provider_bill_no}</span>
                          </td>
                          <td>{formatValue(item.row.provider_recv_date, "date")}</td>
                          <td className="amount">
                            {item.hasInvalidAmount ? (
                              <span className={`${CLASS}__invalid`}>⚠ Некорректная сумма</span>
                            ) : (
                              <>
                                {amount(item.providerAmount!)}
                                <span>{item.row.provider_currency_name}</span>
                              </>
                            )}
                          </td>
                          <td>
                            <span>{item.selected ? "Выбран" : "Не выбран"}</span>
                            <button
                              type="button"
                              aria-label={`Детали ${item.row.provider_bill_no}`}
                              aria-expanded={expanded.has(key)}
                              aria-controls={detailsId}
                              onClick={() => toggleDetails(key)}
                            >
                              Детали
                            </button>
                          </td>
                        </tr>
                        {expanded.has(key) && (
                          <tr id={detailsId} className={`${CLASS}__details`}>
                            <td colSpan={5}>
                              <dl>
                                <div>
                                  <dt>Позиция очереди</dt>
                                  <dd>{item.queuePosition}</dd>
                                </div>
                                <div>
                                  <dt>Биллинговый цикл</dt>
                                  <dd>{item.row.billing_cycle_name}</dd>
                                </div>
                                <div>
                                  <dt>Код счёта поставщика</dt>
                                  <dd>{item.row.provider_bill_code}</dd>
                                </div>
                                {config.showCustomerBills &&
                                  (item.hasCustomerBill ? (
                                    <>
                                      <div>
                                        <dt>Клиентский счёт</dt>
                                        <dd>{item.row.customer_bill_no}</dd>
                                      </div>
                                      <div>
                                        <dt>Клиент</dt>
                                        <dd>{item.row.customer_name ?? "—"}</dd>
                                      </div>
                                      <div>
                                        <dt>Сумма клиентского счёта</dt>
                                        <dd>{amount(item.customerAmount!)}</dd>
                                      </div>
                                      {item.row.customer_comments && (
                                        <div>
                                          <dt>Комментарий</dt>
                                          <dd>{item.row.customer_comments}</dd>
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <div>
                                      <dt>Клиентский счёт</dt>
                                      <dd>Нет связанного счёта</dd>
                                    </div>
                                  ))}
                              </dl>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {!complete && (
          <button
            type="button"
            className={`${CLASS}__open`}
            ref={opener}
            onClick={(event) => openQueue(event.currentTarget)}
          >
            {viewSize === "third" || viewSize === "quarter"
              ? "Открыть детали"
              : "Открыть полную очередь"}
          </button>
        )}
      </div>
    );
  };
  const errorMessage = data.error?.trim() ? data.error : "Неизвестная ошибка";
  const renderData = (viewSize: TWidgetSize, complete = false) =>
    !data.loaded ? (
      data.error !== null ? (
        <div role="alert" className={`${CLASS}__error`}>
          Не удалось загрузить очередь: {errorMessage}
        </div>
      ) : (
        <div role="status" className={`${CLASS}__skeleton`}>
          Загрузка очереди…
          <span />
          <span />
          <span />
        </div>
      )
    ) : (
      <>
        {data.loading && (
          <span role="status" className={`${CLASS}__refresh`}>
            Обновление…
          </span>
        )}
        {data.error !== null && (
          <p role="alert" className={`${CLASS}__warning`}>
            Не удалось обновить данные: {errorMessage}. Показана последняя загруженная очередь.
          </p>
        )}
        {data.items.length === 0 ? (
          <div className={`${CLASS}__empty`}>Очередь платежей пуста</div>
        ) : (
          renderBody(viewSize, complete)
        )}
      </>
    );
  return (
    <article className={`${CLASS} ${widgetCardClass()}`} data-size={effectiveSize}>
      <WidgetHeader
        title={config.description}
        subtitle={config.subtitle}
        aside={
          data.loaded ? (
            <FreshnessMark
              source="rows"
              stale={data.stale}
              lastSuccessAt={data.lastSuccessAt}
              showLabel={effectiveSize === "full" || effectiveSize === "half"}
            />
          ) : null
        }
      />
      {renderData(effectiveSize)}
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-dialog-title`}
        className={`${CLASS}__dialog`}
        onCancel={(event) => {
          event.preventDefault();
          closeQueue();
        }}
        onClose={() => {
          setDialogOpen(false);
          opener.current?.focus();
        }}
      >
        <header>
          <h2 id={`${id}-dialog-title`}>Полная очередь платежей</h2>
          <button type="button" onClick={closeQueue} autoFocus>
            Закрыть
          </button>
        </header>
        <div className={`${CLASS}__dialog-content`}>
          {dialogOpen && data.loaded && data.stale && (
            <p role="status" className={`${CLASS}__warning`}>
              Данные устарели. Показана последняя загруженная очередь.
            </p>
          )}
          {dialogOpen && renderData("full", true)}
        </div>
      </dialog>
    </article>
  );
}

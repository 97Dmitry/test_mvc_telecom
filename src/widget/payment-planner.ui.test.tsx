// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import rows from "../data/mock-payment-queue.json";
import { PaymentPlannerWidget } from "./payment-planner";
import type { ICollectionDataResult } from "../platform/widget-types";
import type { IProviderPaymentQueueRow } from "../types/provider-payment-queue";
const data: ICollectionDataResult<IProviderPaymentQueueRow> = {
  items: rows,
  loaded: true,
  loading: false,
  stale: false,
  error: null,
  lastSuccessAt: null,
};
afterEach(cleanup);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
describe("payment planner interactions", () => {
  it.each([
    ["Поставщик", "1760", "provider_id", 1760],
    ["Биллинговый цикл", "10", "billing_cycle_id", 10],
  ] as const)(
    "keeps a vanished runtime %s visible until explicit reset",
    async (label, value, field, removed) => {
      const user = userEvent.setup();
      const view = render(<PaymentPlannerWidget data={data} />);
      fireEvent.change(screen.getByRole("slider"), { target: { value: "3" } });
      await user.selectOptions(screen.getByLabelText(label), value);
      view.rerender(
        <PaymentPlannerWidget
          data={{ ...data, items: rows.filter((row) => row[field] !== removed) }}
        />,
      );
      const filter = screen.getByLabelText(label) as HTMLSelectElement;
      expect(filter.value).toBe(value);
      expect(filter.selectedOptions[0].textContent).toContain("нет счетов");
      expect(filter.selectedOptions[0].textContent).toContain(value);
      expect(screen.getByText("По заданным фильтрам счетов нет")).toBeTruthy();
      view.rerender(<PaymentPlannerWidget data={data} />);
      expect(filter.value).toBe(value);
      expect(filter.selectedOptions[0].textContent).not.toContain("нет счетов");
      expect(screen.getByRole("table")).toBeTruthy();
      view.rerender(
        <PaymentPlannerWidget
          data={{ ...data, items: rows.filter((row) => row[field] !== removed) }}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Сбросить локальные фильтры" }));
      expect(filter.value).toBe("all");
      expect(within(filter).queryByRole("option", { name: /нет счетов/ })).toBeNull();
      expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("3");
      expect(screen.getByRole("table")).toBeTruthy();
    },
  );

  it("keeps a vanished checked currency visible in the shared dialog and restores its name on return", async () => {
    const user = userEvent.setup();
    const view = render(
      <PaymentPlannerWidget
        data={data}
        size="quarter"
        params={{ showSummary: false, showProviderBreakdown: false }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Открыть детали" }));
    const modal = screen.getByRole("dialog");
    await user.click(within(modal).getByRole("checkbox", { name: "USD" }));
    view.rerender(
      <PaymentPlannerWidget
        data={{ ...data, items: rows.filter((row) => row.provider_currency_id !== 840) }}
        size="quarter"
        params={{ showSummary: false, showProviderBreakdown: false }}
      />,
    );
    const retained = within(modal).getByRole("checkbox", {
      name: /840.*нет счетов/,
    }) as HTMLInputElement;
    expect(retained.checked).toBe(true);
    expect(within(modal).getByText("По заданным фильтрам счетов нет")).toBeTruthy();
    expect(within(modal).queryByRole("region", { name: "Суммы по валютам" })).toBeNull();
    view.rerender(
      <PaymentPlannerWidget
        data={data}
        size="quarter"
        params={{ showSummary: false, showProviderBreakdown: false }}
      />,
    );
    expect((within(modal).getByRole("checkbox", { name: "USD" }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(within(modal).queryByRole("checkbox", { name: /нет счетов/ })).toBeNull();
    view.rerender(
      <PaymentPlannerWidget
        data={{ ...data, items: rows.filter((row) => row.provider_currency_id !== 840) }}
        size="quarter"
        params={{ showSummary: false, showProviderBreakdown: false }}
      />,
    );
    await user.click(within(modal).getByRole("button", { name: "Сбросить локальные фильтры" }));
    expect(within(modal).queryByRole("checkbox", { name: /840/ })).toBeNull();
    expect(within(modal).getByRole("table")).toBeTruthy();
  });

  it.each([
    ["Поставщик", "providerId"],
    ["Биллинговый цикл", "billingCycleId"],
  ] as const)(
    "shows an unavailable configured %s and cannot broaden it with local reset",
    async (label, parameter) => {
      const user = userEvent.setup();
      render(<PaymentPlannerWidget data={data} params={{ [parameter]: 9999 }} />);
      const filter = screen.getByLabelText(label) as HTMLSelectElement;
      expect(filter.value).toBe("9999");
      expect(filter.selectedOptions[0].textContent).toMatch(/9999.*нет счетов/);
      expect(
        (within(filter).getByRole("option", { name: /^Все/ }) as HTMLOptionElement).disabled,
      ).toBe(true);
      await user.click(screen.getByRole("button", { name: "Сбросить локальные фильтры" }));
      expect(filter.value).toBe("9999");
      expect(screen.getByText("По заданным фильтрам счетов нет")).toBeTruthy();
    },
  );

  it("retains zero-valued configured IDs without treating them as all", () => {
    render(
      <PaymentPlannerWidget
        data={data}
        params={{ providerId: 0, billingCycleId: 0, currencyIds: [0] }}
      />,
    );
    expect((screen.getByLabelText("Поставщик") as HTMLSelectElement).value).toBe("0");
    expect((screen.getByLabelText("Биллинговый цикл") as HTMLSelectElement).value).toBe("0");
    expect(screen.getByRole("checkbox", { name: /0.*нет счетов/ })).toBeTruthy();
    expect(screen.getByText(/Ограничение настроек:.*0/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("clears missing runtime scopes when external provider, cycle and currencies change", async () => {
    const user = userEvent.setup();
    const view = render(<PaymentPlannerWidget data={data} />);
    await user.selectOptions(screen.getByLabelText("Поставщик"), "1760");
    await user.selectOptions(screen.getByLabelText("Биллинговый цикл"), "20");
    await user.click(screen.getByRole("checkbox", { name: "USD" }));
    const remaining = {
      ...data,
      items: rows.filter((row) => row.provider_id === 1762 && row.billing_cycle_id === 10),
    };
    view.rerender(<PaymentPlannerWidget data={remaining} />);
    expect(screen.getByText("По заданным фильтрам счетов нет")).toBeTruthy();
    view.rerender(
      <PaymentPlannerWidget
        data={remaining}
        params={{ providerId: 1762, billingCycleId: 10, currencyIds: [643] }}
      />,
    );
    expect((screen.getByLabelText("Поставщик") as HTMLSelectElement).value).toBe("1762");
    expect((screen.getByLabelText("Биллинговый цикл") as HTMLSelectElement).value).toBe("10");
    expect((screen.getByRole("checkbox", { name: "RUB" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole("option", { name: /нет счетов/ })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /840/ })).toBeNull();
    expect(screen.getByText(/Ограничение настроек:.*RUB/)).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("removes missing provider and cycle options after switching to available values", async () => {
    const user = userEvent.setup();
    const view = render(<PaymentPlannerWidget data={data} />);
    await user.selectOptions(screen.getByLabelText("Поставщик"), "1760");
    await user.selectOptions(screen.getByLabelText("Биллинговый цикл"), "20");
    view.rerender(
      <PaymentPlannerWidget
        data={{
          ...data,
          items: rows.filter((row) => row.provider_id === 1762 && row.billing_cycle_id === 10),
        }}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Поставщик"), "1762");
    await user.selectOptions(screen.getByLabelText("Биллинговый цикл"), "10");
    expect(screen.queryByRole("option", { name: /нет счетов/ })).toBeNull();
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("explains an unavailable configured currency even without local checks and keeps its restriction on reset", async () => {
    const user = userEvent.setup();
    render(<PaymentPlannerWidget data={data} params={{ currencyIds: [9999] }} />);
    expect(screen.getByRole("checkbox", { name: /9999.*нет счетов/ })).toBeTruthy();
    expect(screen.getByText(/Ограничение настроек:.*9999/)).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "USD" }) as HTMLInputElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Сбросить локальные фильтры" }));
    expect(screen.getByText("По заданным фильтрам счетов нет")).toBeTruthy();
    expect(screen.getByText(/Ограничение настроек:.*9999/)).toBeTruthy();
  });

  it.each([
    [1.005, "1,01", "1.01"],
    [2.675, "2,68", "2.68"],
  ] as const)("keeps amount rounding consistent when formatting %s", (value, grouped, plain) => {
    const fractionalData = { ...data, items: [{ ...rows[0], provider_total_due: value }] };
    const view = render(
      <PaymentPlannerWidget
        data={fractionalData}
        size="half"
        params={{ amountFormat: "grouped" }}
      />,
    );
    expect(
      within(screen.getByRole("region", { name: "Суммы по валютам" })).getByText(grouped),
    ).toBeTruthy();
    view.rerender(
      <PaymentPlannerWidget data={fractionalData} size="half" params={{ amountFormat: "plain" }} />,
    );
    expect(
      within(screen.getByRole("region", { name: "Суммы по валютам" })).getByText(plain),
    ).toBeTruthy();
    view.rerender(
      <PaymentPlannerWidget
        data={fractionalData}
        size="half"
        params={{ amountFormat: "grouped" }}
      />,
    );
    expect(
      within(screen.getByRole("region", { name: "Суммы по валютам" })).getByText(grouped),
    ).toBeTruthy();
  });

  it("composes runtime currency and cycle filters and offers reset for an empty result", async () => {
    const user = userEvent.setup();
    render(<PaymentPlannerWidget data={data} />);
    await user.selectOptions(screen.getByLabelText("Биллинговый цикл"), "10");
    await user.click(screen.getByRole("checkbox", { name: "GBP" }));
    expect(screen.getByText("По заданным фильтрам счетов нет")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Сбросить локальные фильтры" }));
    expect(screen.getByText(`10 / ${rows.length}`)).toBeTruthy();
  });
  it("falls back from a vanished breakdown currency and keeps retained DOM during refresh", async () => {
    const user = userEvent.setup();
    const view = render(<PaymentPlannerWidget data={data} params={{ selectedCount: 14 }} />);
    await user.selectOptions(screen.getByLabelText("Валюта распределения"), "840");
    const slider = screen.getByRole("slider");
    view.rerender(
      <PaymentPlannerWidget
        data={{
          ...data,
          loading: true,
          stale: true,
          items: data.items.filter((row) => row.provider_currency_id === 643),
        }}
        params={{ selectedCount: 14 }}
      />,
    );
    expect(screen.getByRole("slider")).toBe(slider);
    expect((screen.getByLabelText("Валюта распределения") as HTMLSelectElement).value).toBe("643");
    expect(screen.getByRole("status", { name: "Данные устарели" })).toBeTruthy();
  });
  it("hides all optional summaries and customer information in dialog too", async () => {
    const user = userEvent.setup();
    render(
      <PaymentPlannerWidget
        data={data}
        size="quarter"
        params={{ showSummary: false, showProviderBreakdown: false, showCustomerBills: false }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Открыть детали" }));
    const modal = screen.getByRole("dialog");
    expect(within(modal).queryByRole("region", { name: "Суммы по валютам" })).toBeNull();
    expect(within(modal).queryByLabelText("Валюта распределения")).toBeNull();
    await user.click(within(modal).getByRole("button", { name: "Детали INV-77602" }));
    expect(within(modal).queryByText("CB-2026-402")).toBeNull();
  });

  it("renders empty, loading and error states inside an already opened dialog", async () => {
    const user = userEvent.setup();
    const view = render(<PaymentPlannerWidget data={data} size="half" />);
    await user.click(screen.getByRole("button", { name: "Открыть полную очередь" }));
    const modal = screen.getByRole("dialog", { name: "Полная очередь платежей" });
    view.rerender(<PaymentPlannerWidget data={{ ...data, items: [] }} size="half" />);
    expect(within(modal).getByText("Очередь платежей пуста")).toBeTruthy();
    view.rerender(
      <PaymentPlannerWidget
        data={{ ...data, items: [], loaded: false, loading: true }}
        size="half"
      />,
    );
    expect(within(modal).getByRole("status").textContent).toContain("Загрузка");
    view.rerender(
      <PaymentPlannerWidget
        data={{ ...data, items: [], loaded: false, error: "Offline" }}
        size="half"
      />,
    );
    expect(within(modal).getByRole("alert").textContent).toContain("Offline");
    await user.click(within(modal).getByRole("button", { name: "Закрыть" }));
    expect(modal.hasAttribute("open")).toBe(false);
  });

  it("keeps duplicate invoice rows independently expandable", async () => {
    const user = userEvent.setup();
    render(<PaymentPlannerWidget data={{ ...data, items: [rows[0], rows[0]] }} />);
    await user.click(screen.getAllByRole("button", { name: "Детали INV-77602" })[0]);
    expect(screen.getAllByText("CB-2026-402")).toHaveLength(1);
  });
  it("retains open details when unrelated rows arrive before the invoice", async () => {
    const user = userEvent.setup();
    const view = render(<PaymentPlannerWidget data={data} />);
    await user.click(screen.getByRole("button", { name: "Детали INV-77602" }));
    view.rerender(
      <PaymentPlannerWidget
        data={{
          ...data,
          items: [{ ...rows[0], provider_bill_id: 1, provider_bill_no: "NEW" }, ...rows],
        }}
      />,
    );
    expect(screen.getByText("CB-2026-402")).toBeTruthy();
    view.rerender(
      <PaymentPlannerWidget
        data={{ ...data, items: [...rows].reverse().map((row) => ({ ...row })) }}
      />,
    );
    expect(screen.getByText("CB-2026-402")).toBeTruthy();
  });

  it("selects N, preserves selection and details during refresh and formatting changes, resets for external N", async () => {
    const user = userEvent.setup();
    const view = render(<PaymentPlannerWidget data={data} params={{ selectedCount: 10 }} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "4" } });
    await user.click(screen.getByRole("button", { name: "Детали INV-77602" }));
    expect(screen.getByText("CB-2026-402")).toBeTruthy();
    view.rerender(
      <PaymentPlannerWidget
        data={{ ...data, loading: true, stale: true }}
        params={{ selectedCount: 10, amountFormat: "plain" }}
      />,
    );
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("4");
    expect(screen.getByText("CB-2026-402")).toBeTruthy();
    expect(screen.getByText("Обновление…")).toBeTruthy();
    view.rerender(<PaymentPlannerWidget data={data} params={{ selectedCount: 2 }} />);
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("2");
  });
  it("filters before selecting and clears runtime provider when external provider changes", async () => {
    const user = userEvent.setup();
    const view = render(<PaymentPlannerWidget data={data} />);
    await user.selectOptions(screen.getByLabelText("Поставщик"), "1760");
    expect(screen.getAllByRole("row").length).toBeLessThan(12);
    view.rerender(<PaymentPlannerWidget data={data} params={{ providerId: 1762 }} />);
    expect((screen.getByLabelText("Поставщик") as HTMLSelectElement).value).toBe("1762");
    expect(screen.queryByRole("button", { name: "Детали INV-77602" })).toBeNull();
  });
  it("opens all queue rows in shared dialog, closes with focus restoration", async () => {
    const user = userEvent.setup();
    render(<PaymentPlannerWidget data={data} params={{ selectedCount: 30 }} size="half" />);
    const trigger = screen.getByRole("button", { name: "Открыть полную очередь" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Полная очередь платежей" });
    expect(within(dialog).getAllByRole("row").length).toBe(rows.length + 1);
    fireEvent.change(within(dialog).getByRole("slider"), { target: { value: "3" } });
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByText(`3 / ${rows.length}`)).toBeTruthy();
  });
  it("discloses quarter currency overflow explicitly", async () => {
    const user = userEvent.setup();
    render(<PaymentPlannerWidget data={data} size="quarter" params={{ selectedCount: 30 }} />);
    await user.click(screen.getByRole("button", { name: "+ ещё 2 валюты" }));
    expect(screen.getByText("GBP")).toBeTruthy();
    expect(screen.getByText("EUR")).toBeTruthy();
  });
  it("honors summary, breakdown and customer flags", async () => {
    const user = userEvent.setup();
    render(
      <PaymentPlannerWidget
        data={data}
        params={{ showSummary: false, showProviderBreakdown: false, showCustomerBills: false }}
      />,
    );
    expect(screen.queryByRole("region", { name: "Суммы по валютам" })).toBeNull();
    expect(screen.queryByLabelText("Валюта распределения")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Детали INV-77602" }));
    expect(screen.queryByText("CB-2026-402")).toBeNull();
  });
  it.each(["full", "half", "third", "quarter"] as const)("renders %s with count", (size) => {
    render(<PaymentPlannerWidget data={data} size={size} />);
    expect(screen.getByText(`10 / ${rows.length}`)).toBeTruthy();
  });
  it.each([
    ["", "Неизвестная ошибка"],
    [" \t\n ", "Неизвестная ошибка"],
    ["  Network unavailable  ", "  Network unavailable  "],
  ])("shows an initial error instead of loading for message %j", (error, message) => {
    render(
      <PaymentPlannerWidget data={{ ...data, items: [], loaded: false, loading: false, error }} />,
    );
    expect(screen.getByRole("alert").textContent).toContain(message);
    expect(screen.queryByText("Загрузка очереди…")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it.each([
    ["", "Неизвестная ошибка"],
    [" \t\n ", "Неизвестная ошибка"],
    ["  Offline  ", "  Offline  "],
  ])(
    "warns about refresh error %j while retaining selection and details",
    async (error, message) => {
      const user = userEvent.setup();
      const view = render(<PaymentPlannerWidget data={data} />);
      const slider = screen.getByRole("slider");
      fireEvent.change(slider, { target: { value: "3" } });
      await user.click(screen.getByRole("button", { name: "Детали INV-77602" }));
      view.rerender(<PaymentPlannerWidget data={{ ...data, error }} />);
      expect(screen.getByRole("alert").textContent).toContain(message);
      expect(screen.getByRole("alert").textContent).toContain("последняя загруженная очередь");
      expect(screen.getByRole("table")).toBeTruthy();
      expect(screen.getByRole("slider")).toBe(slider);
      expect((slider as HTMLInputElement).value).toBe("3");
      expect(screen.getByText("CB-2026-402")).toBeTruthy();
    },
  );

  it.each(["", " \t\n "])(
    "handles error %j inside an open dialog without resetting selection or details",
    async (error) => {
      const user = userEvent.setup();
      const view = render(<PaymentPlannerWidget data={data} size="quarter" />);
      await user.click(screen.getByRole("button", { name: "Открыть детали" }));
      const modal = screen.getByRole("dialog");
      const slider = within(modal).getByRole("slider");
      fireEvent.change(slider, { target: { value: "3" } });
      await user.click(within(modal).getByRole("button", { name: "Детали INV-77602" }));
      view.rerender(<PaymentPlannerWidget data={{ ...data, error }} size="quarter" />);
      expect(within(modal).getByRole("alert").textContent).toContain("Неизвестная ошибка");
      expect(within(modal).getByRole("table")).toBeTruthy();
      expect(within(modal).getByRole("slider")).toBe(slider);
      expect((slider as HTMLInputElement).value).toBe("3");
      expect(within(modal).getByText("CB-2026-402")).toBeTruthy();
      view.rerender(
        <PaymentPlannerWidget
          data={{ ...data, items: [], loaded: false, loading: false, error }}
          size="quarter"
        />,
      );
      expect(within(modal).getByRole("alert").textContent).toContain("Неизвестная ошибка");
      expect(within(modal).queryByText("Загрузка очереди…")).toBeNull();
      expect(within(modal).queryByRole("table")).toBeNull();
      view.rerender(<PaymentPlannerWidget data={data} size="quarter" />);
      expect(modal.hasAttribute("open")).toBe(true);
      expect(within(modal).queryByRole("alert")).toBeNull();
      expect((within(modal).getByRole("slider") as HTMLInputElement).value).toBe("3");
      expect(within(modal).getByText("CB-2026-402")).toBeTruthy();
    },
  );

  it("does not treat a null error as failure before or after loading", () => {
    const view = render(
      <PaymentPlannerWidget data={{ ...data, items: [], loaded: false, loading: false }} />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Загрузка очереди…")).toBeTruthy();
    view.rerender(<PaymentPlannerWidget data={data} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("shows skeleton, initial error, empty and retained data error", () => {
    const view = render(
      <PaymentPlannerWidget data={{ ...data, items: [], loaded: false, loading: true }} />,
    );
    expect(screen.getByRole("status").textContent).toContain("Загрузка");
    view.rerender(
      <PaymentPlannerWidget data={{ ...data, loaded: false, error: "Network unavailable" }} />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Network unavailable");
    view.rerender(<PaymentPlannerWidget data={{ ...data, items: [] }} />);
    expect(screen.getByText("Очередь платежей пуста")).toBeTruthy();
    view.rerender(<PaymentPlannerWidget data={{ ...data, error: "Offline" }} />);
    expect(screen.getByRole("alert").textContent).toContain("Offline");
    expect(screen.getByRole("slider")).toBeTruthy();
  });
  it("explains zero and all-invalid selection; clamps on queue shrink", () => {
    const view = render(<PaymentPlannerWidget data={data} params={{ selectedCount: 0 }} />);
    expect(screen.getByText("Выберите счета, чтобы рассчитать суммы")).toBeTruthy();
    view.rerender(
      <PaymentPlannerWidget
        data={{ ...data, items: [{ ...rows[0], provider_total_due: null }] }}
        params={{ selectedCount: 10 }}
      />,
    );
    expect(screen.getByText("У выбранных счетов нет корректных сумм")).toBeTruthy();
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("1");
    expect(screen.getByText(/Некорректная сумма/)).toBeTruthy();
  });
});

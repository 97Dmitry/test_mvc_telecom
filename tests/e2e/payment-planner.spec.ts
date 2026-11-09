import { expect, test, type Page } from "@playwright/test";

const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), "browser console and runtime errors").toEqual([]);
});

async function expectNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
}

for (const theme of ["light", "dark"]) {
  for (const size of ["full", "half", "third", "quarter"]) {
    test(`${size} ${theme} renders at desktop and mobile widths`, async ({ page }, testInfo) => {
      await page.getByRole("button", { name: size, exact: true }).click();
      await page.getByRole("button", { name: theme, exact: true }).click();
      const widget = page.locator("article.dash-payment-planner");
      await expect(widget.getByText("14 / 32", { exact: true })).toBeVisible();
      await expectNoPageOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`${size}-${theme}-desktop.png`),
        fullPage: true,
      });
      await page.setViewportSize({ width: 320, height: 800 });
      await expect(widget.getByText("14 / 32", { exact: true })).toBeVisible();
      await expectNoPageOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`${size}-${theme}-mobile.png`),
        fullPage: true,
      });
    });
  }
}

test("preserves the user's selection and opened details through refreshing and theme changes", async ({
  page,
}) => {
  const widget = page.locator("article.dash-payment-planner");
  const slider = widget.getByRole("slider");
  await slider.focus();
  await slider.press("Home");
  for (let i = 0; i < 4; i++) await slider.press("ArrowRight");
  await expect(slider).toHaveValue("4");
  await widget.getByRole("button", { name: "Детали INV-77602", exact: true }).click();
  await expect(widget.getByText("CB-2026-402", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "refreshing", exact: true }).click();
  await expect(widget.getByText("Обновление…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "dark", exact: true }).click();
  await page.getByLabel("Формат (amountFormat)").selectOption("plain");
  await expect(slider).toHaveValue("4");
  await expect(widget.getByText("CB-2026-402", { exact: true })).toBeVisible();
});

test("opens the complete queue and returns keyboard focus after Escape", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "half", exact: true }).click();
  const widget = page.locator("article.dash-payment-planner");
  const trigger = widget.getByRole("button", { name: "Открыть полную очередь", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Полная очередь платежей" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("row")).toHaveCount(33);
  await page.setViewportSize({ width: 320, height: 800 });
  await expectNoPageOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("queue-dialog-mobile.png"), fullPage: true });
  const slider = dialog.getByRole("slider");
  await slider.focus();
  await slider.press("Home");
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(widget.getByText("3 / 32", { exact: true })).toBeVisible();
});

test("applies display parameters without changing the payment selection", async ({ page }) => {
  const widget = page.locator("article.dash-payment-planner");
  await page.getByLabel("Лимит строк (rowLimit)").selectOption("25");
  await expect(widget.getByRole("table")).toHaveAccessibleName("Показано 25 из 32 счетов");
  await expect(widget.getByText("14 / 32", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "showCustomerBills", exact: true }).uncheck();
  await widget.getByRole("button", { name: "Детали INV-77602", exact: true }).click();
  await expect(widget.getByText("CB-2026-402", { exact: true })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "showCustomerBills", exact: true }).check();
  await expect(widget.getByText("CB-2026-402", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "showProviderBreakdown", exact: true }).uncheck();
  await expect(widget.getByRole("region", { name: "Распределение по поставщикам" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "showSummary", exact: true }).uncheck();
  await expect(widget.getByRole("region", { name: "Суммы по валютам" })).toHaveCount(0);
  await expect(widget.getByText("14 / 32", { exact: true })).toBeVisible();
});

test("makes every currency available in the quarter view", async ({ page }) => {
  await page.getByRole("button", { name: "quarter", exact: true }).click();
  const widget = page.locator("article.dash-payment-planner");
  await widget.getByRole("button", { name: "+ ещё 2 валюты", exact: true }).click();
  for (const currency of ["USD", "RUB", "EUR", "GBP"]) {
    await expect(widget.getByText(currency, { exact: true })).toBeVisible();
  }
});

test("shows distinct loading, error, empty and stale states", async ({ page }) => {
  const widget = page.locator("article.dash-payment-planner");
  await page.getByRole("button", { name: "loading", exact: true }).click();
  await expect(widget.getByRole("status")).toContainText("Загрузка");
  await expect(widget.getByRole("slider")).toHaveCount(0);
  await page.getByRole("button", { name: "error", exact: true }).click();
  await expect(widget.getByRole("alert")).toContainText("Enigma API request timed out");
  await page.getByRole("button", { name: "empty", exact: true }).click();
  await expect(widget.getByText("Очередь платежей пуста", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "stale", exact: true }).click();
  await expect(widget.getByRole("slider")).toBeVisible();
  await expect(widget.getByRole("status")).toHaveText("Stale");
});

test("filters the queue before selection and resets an empty combination", async ({ page }) => {
  const widget = page.locator("article.dash-payment-planner");
  await widget.getByRole("combobox", { name: "Поставщик", exact: true }).selectOption("1770");
  await expect(widget.getByText("4 / 4", { exact: true })).toBeVisible();
  await expect(widget.getByRole("button", { name: "Детали INV-77602", exact: true })).toHaveCount(
    0,
  );
  await widget.getByRole("combobox", { name: "Биллинговый цикл", exact: true }).selectOption("10");
  await expect(widget.getByText("По заданным фильтрам счетов нет", { exact: true })).toBeVisible();
  await widget.getByRole("button", { name: "Сбросить локальные фильтры" }).click();
  await expect(widget.getByText("14 / 32", { exact: true })).toBeVisible();
  await widget.getByRole("checkbox", { name: "USD", exact: true }).check();
  await expect(widget.getByText("7 / 7", { exact: true })).toBeVisible();
  await expect(
    widget.getByRole("region", { name: "Суммы по валютам" }).getByText("RUB", { exact: true }),
  ).toHaveCount(0);
  await widget.getByRole("checkbox", { name: "USD", exact: true }).uncheck();
  await expect(widget.getByText("14 / 32", { exact: true })).toBeVisible();
  await widget.getByLabel("Валюта распределения").selectOption({ label: "EUR" });
  await expect(widget.getByLabel("Валюта распределения")).toHaveValue("978");
});

test("explains zero selection and marks invalid sums in the complete queue", async ({ page }) => {
  const widget = page.locator("article.dash-payment-planner");
  await widget.getByRole("spinbutton", { name: "Количество счетов числом" }).fill("0");
  await expect(
    widget.getByText("Выберите счета, чтобы рассчитать суммы", { exact: true }),
  ).toBeVisible();
  await widget.getByRole("spinbutton", { name: "Количество счетов числом" }).fill("32");
  await expect(widget.getByText("32 / 32", { exact: true })).toBeVisible();
  await widget.getByRole("button", { name: "Открыть полную очередь", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Полная очередь платежей" });
  await expect(dialog.getByText("⚠ Некорректная сумма", { exact: true })).toHaveCount(2);
});

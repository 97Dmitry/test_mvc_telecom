import { expect, test, type Locator, type Page } from "@playwright/test";

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}

async function expectContainedScroll(dialog: Locator) {
  const dimensions = await dialog.evaluate((element) => ({
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect.soft(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.height + 1);
}

async function openQueue(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Открыть полную очередь", exact: true }).click();
  return page.getByRole("dialog", { name: "Полная очередь платежей" });
}

for (const theme of ["light", "dark"]) {
  test(`toolbar stays inside its background in ${theme}`, async ({ page }, testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: theme, exact: true }).click();
    for (const width of [1200, 1100, 1024, 1440, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const header = await box(page.locator(".sandbox-topbar"));
      for (const control of await page.locator(".sandbox-topbar button").all()) {
        const bounds = await box(control);
        expect(bounds.y).toBeGreaterThanOrEqual(header.y);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(header.y + header.height);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      }
      if (width === 1200)
        await page.screenshot({ path: testInfo.outputPath(`header-${theme}-1200.png`) });
    }
  });
}

test("dialog keeps its geometry and only the queue scrolls across selections and filters", async ({
  page,
}, testInfo) => {
  const dialog = await openQueue(page);
  await expect.soft(dialog.locator(".dash-freshness")).toHaveCount(0);
  const original = await box(dialog);
  for (const count of [0, 14, 32]) {
    await dialog.getByRole("spinbutton", { name: "Количество счетов числом" }).fill(String(count));
    expect.soft(await box(dialog)).toEqual(original);
    await expectContainedScroll(dialog);
  }
  const scroll = dialog.locator(".dash-payment-planner__table-scroll");
  expect(await scroll.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const lastDetails = dialog.getByRole("button", { name: /^Детали / }).last();
  await expect(lastDetails).toBeInViewport();
  await lastDetails.focus();
  await page.keyboard.press("Enter");
  await expect(lastDetails).toHaveAttribute("aria-expanded", "true");
  expect.soft(await box(dialog)).toEqual(original);
  await expectContainedScroll(dialog);
  await dialog.getByRole("combobox", { name: "Поставщик", exact: true }).selectOption("1770");
  await expect(dialog.getByRole("button", { name: /^Детали / })).toHaveCount(4);
  expect.soft(await box(dialog)).toEqual(original);
  await dialog.getByRole("combobox", { name: "Биллинговый цикл", exact: true }).selectOption("10");
  await expect(dialog.getByText("По заданным фильтрам счетов нет", { exact: true })).toBeVisible();
  expect.soft(await box(dialog)).toEqual(original);
  await expectContainedScroll(dialog);
  await dialog.getByRole("button", { name: "Сбросить локальные фильтры" }).click();
  await page.screenshot({ path: testInfo.outputPath("modal-desktop-light.png") });
  // Sandbox controls update the fixture behind the native modal; real pointer input is inert there.
  await page
    .getByRole("button", { name: "dark", exact: true, includeHidden: true })
    .evaluate((element) => element.click());
  await page.screenshot({ path: testInfo.outputPath("modal-desktop-dark.png") });
  for (const state of ["empty", "loading", "error", "stale", "ready"]) {
    await page
      .getByRole("button", { name: state, exact: true, includeHidden: true })
      .evaluate((element) => element.click());
    if (state === "empty") {
      await expect(dialog.getByText("Очередь платежей пуста", { exact: true })).toBeVisible();
    } else if (state === "loading") {
      await expect(dialog.getByRole("status")).toContainText("Загрузка очереди");
    } else if (state === "error") {
      await expect(dialog.getByRole("alert")).toContainText("Enigma API request timed out");
    } else if (state === "stale") {
      await expect(dialog.getByRole("status")).toContainText("Данные устарели");
    } else {
      await expect(dialog.getByRole("button", { name: /^Детали / })).toHaveCount(32);
    }
    expect.soft(await box(dialog)).toEqual(original);
    await expectContainedScroll(dialog);
    await expect(dialog.getByRole("button", { name: "Закрыть", exact: true })).toBeInViewport();
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Открыть полную очередь", exact: true }),
  ).toBeFocused();
});

test("narrow dialog keeps closing and all queue rows reachable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const dialog = await openQueue(page);
  await expectContainedScroll(dialog);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const close = dialog.getByRole("button", { name: "Закрыть", exact: true });
  await expect(close).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("modal-mobile-light.png") });
  await page
    .getByRole("button", { name: "dark", exact: true, includeHidden: true })
    .evaluate((element) => element.click());
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: testInfo.outputPath("modal-mobile-dark.png") });
  const scroll = dialog.locator(".dash-payment-planner__table-scroll");
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.scrollLeft = element.scrollWidth;
  });
  const last = dialog.getByRole("button", { name: /^Детали / }).last();
  await expect(last).toBeInViewport();
  await last.focus();
  await page.keyboard.press("Enter");
  await expect(last).toHaveAttribute("aria-expanded", "true");
  await expectContainedScroll(dialog);
  await page.screenshot({ path: testInfo.outputPath("modal-mobile.png") });
  await page.setViewportSize({ width: 320, height: 480 });
  await expectContainedScroll(dialog);
  await expect(close).toBeInViewport();
  await close.click();
  await expect(dialog).not.toBeVisible();
});

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const baseURL = process.env.BASE_URL || "http://127.0.0.1:4175";
const output = new URL("../docs/screenshots/", import.meta.url);
let server;
let browser;
const errors = [];
try {
  if (!process.env.BASE_URL) {
    let listening = false;
    server = spawn(
      process.execPath,
      ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4175", "--strictPort"],
      { cwd: root, stdio: ["ignore", "pipe", "inherit"] },
    );
    server.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      if (chunk.toString().includes(baseURL)) listening = true;
    });
    server.on("error", (error) => errors.push(error.message));
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null || errors.length) throw new Error("Screenshot server failed");
      try {
        if (listening) ready = (await fetch(baseURL)).ok;
      } catch {
        // Vite has not opened its listener yet.
      }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error("Screenshot server did not become ready");
  }
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await mkdir(output, { recursive: true });
  await page.goto(baseURL);
  for (const size of ["full", "half", "third", "quarter"]) {
    await page.getByRole("button", { name: size, exact: true }).click();
    for (const theme of ["light", "dark"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const card = page.locator(".sandbox-stage .dash-card");
      await expect(card).toHaveCount(1);
      await expect(card).toContainText("14 / 32");
      await page.evaluate(() => document.fonts.ready);
      await card.screenshot({
        path: fileURLToPath(new URL(`${size}-${theme}.png`, output)),
        animations: "disabled",
      });
      const bounds = await card.boundingBox();
      console.log(`${size}-${theme}.png: ${bounds.width} x ${bounds.height}`);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Captured eight cards with Chromium ${browser.version()}; no browser errors.`);
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    const closed = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    await closed;
  }
}

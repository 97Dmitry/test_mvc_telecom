# Development guide

## Environment and commands

Recommended: Node.js **24 LTS, version 24.15.0 or later within 24.x**, and npm. The tested version, **24.22.1**, is pinned in [`.node-version`](../.node-version) for reproducibility; that exact patch is not required. The dependency engine range is `^22.22.2 || ^24.15.0 || >=26.0.0`; compatibility with Node.js 22 and 26+ is based on dependency metadata, not runtime testing. Follow the [README](../README.md) to clone the repository. Vite Plus is not a project dependency.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`, or the alternate URL printed by Vite if that port is occupied. The development server binds to IPv4 loopback; this also avoids `localhost` IPv4/IPv6 ambiguity in WSL2.

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

`npm run test:watch` watches unit/component tests under `src/`. `npm run format` writes Oxfmt formatting. Oxlint checks correctness, while TypeScript 5 remains the type checker. The project does not use `any` or suppress checks to make validation pass. `npm ci` reproduces the dependency graph in `package-lock.json`.

`npm run build` generates `dist/`. Inspect it with:

```sh
npx vite preview --host 127.0.0.1 --port 4173
```

## Browser checks

Install Playwright's Chromium once:

```sh
npx playwright install chromium
npm run test:e2e
```

Alternatively, select an installed compatible Chromium explicitly. The verified WSL2/Arch environment uses:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/sbin/chromium npm run test:e2e
```

Playwright starts Vite at `127.0.0.1:4173` with a strict port and stops it after the run. An occupied port fails the run; the configuration does not reuse an unrelated server. Close any preview server on that port before testing.

Ignored `playwright-report/` and `test-results/` contain the HTML report, screenshots, and failure traces. A new run replaces the previous output. Open the report with `npx playwright show-report`.

The verified baseline on 2026-11-10 is Node.js 24.22.1, Playwright 1.65.0, and Chromium in WSL2/Arch: **132 unit/component tests** and **21 E2E tests**. Lint, formatting, type checking, and production build are also part of acceptance. These results do not establish Firefox, Safari, or real INTERA host compatibility.

Unit tests cover configuration defaults and aliases, filtering, rank ordering, first-N selection, currency isolation, provider shares, invalid amounts, customer bills, and input immutability. Component tests exercise interaction and source updates through rerender. Chromium tests cover all four sizes and both themes, 320px layouts, refresh state preservation, the complete-queue dialog, Escape and focus return, currency disclosure, and source states. E2E tests fail on JavaScript errors or `console.error`.

Screenshots are visual-review artifacts, not pixel-comparison baselines. The delivery images in [screenshots/](./screenshots) show all four sizes in light and dark themes. Some combinations, including errors after a successful load and arbitrary malformed amounts, are covered through component/unit tests rather than sandbox controls.

## Architecture and invariants

The public component is `PaymentPlannerWidget` in `src/widget/payment-planner.tsx`. See the [README](../README.md) for its props, source envelope, and all 12 parameters.

- `payment-planner-params.ts` normalizes untrusted configuration. It accepts finite numbers without coercing strings. An existing `rowLimit` takes precedence over `maxRows`, even when invalid; invalid input uses the default.
- `payment-planner-compute.ts` is pure and independent of React and the DOM. It applies configured filters, sorts by `(payment_rank, provider_bill_id, originalIndex)`, and selects the first N invoices. Invalid ranks sort after finite ranks. Invalid amounts occupy a selection position but do not contribute to totals or provider shares. Currencies are always aggregated separately.
- `payment-planner.tsx` manages local selection, filters, expanded details, and the dialog. Local filters intersect with the configured scope; resetting them cannot broaden external restrictions. `rowLimit` affects only the inline table.
- `src/platform/` supplies shared components, formatting helpers, and theme tokens. Set the document's `data-theme` attribute to `light` or `dark`.
- `src/sandbox/` demonstrates the widget against `src/data/mock-payment-queue.json`. It performs no backend requests or payment operations.

Provider amounts are valid only when `toFiniteNumber` returns a positive number. A related customer bill requires a nonblank bill number and a finite customer amount; it is displayed only when `showCustomerBills` is enabled. Provider counts and shares use selected invoices with valid provider amounts.

Amounts use JavaScript `number` and retain their precision during calculation. Display rounds to two places. Both `grouped` and `plain` use `Intl.NumberFormat` with the same rounding, including regression coverage for 1.005 and 2.675. This is analytical arithmetic, not a decimal accounting system; extreme magnitudes and IEEE 754 overflow are outside the demonstrated financial guarantees.

## Source updates and UI state

Pass `ICollectionDataResult<IProviderPaymentQueueRow>` with `items`, `loading`, `loaded`, `error`, `stale`, and `lastSuccessAt`. Treat `loaded` as whether a usable source snapshot exists:

| Envelope state                 | Presentation                                         |
| ------------------------------ | ---------------------------------------------------- |
| `!loaded`, no error            | Initial loading skeleton                             |
| `!loaded`, `error !== null`    | Error placeholder                                    |
| `loaded && loading`            | Current data stays visible with a refresh indicator  |
| `loaded && error !== null`     | Last loaded data stays visible with an error warning |
| `loaded && items.length === 0` | Empty queue                                          |
| `loaded && stale`              | Freshness warning                                    |

Errors are detected by `error !== null`, including an empty string. Empty or whitespace-only messages use a generic fallback. The host must retain its last successful `items` if it wants to show them during a failed refresh.

Background updates preserve N, local filters, and expanded invoice details. Changing the corresponding configured N/filter resets that local override. Details identify an invoice by provider ID, bill ID, and duplicate occurrence, so inserting unrelated rows does not move open details to another invoice. Fully indistinguishable duplicates still depend on occurrence order because the source has no separate unique row ID.

Current configured or locally selected IDs remain in filter options when absent from the latest source, marked `нет счетов` (no invoices). Options otherwise come from the current snapshot; historical dictionaries are not accumulated. Resetting local filters removes only local restrictions.

The sandbox header grows when toolbar controls wrap. The complete queue uses a viewport-constrained native dialog with internal scrolling; it has no redundant Live indicator in its header. Short viewports give the parameter panel its own scrolling area. Closing the dialog restores focus to the current opener, including after its remount. These behaviors have regression coverage in `tests/e2e/layout-regressions.spec.ts`.

## Requirements and interpretation

The supplied assignment repository is the requirements source: [INTERA-Task-2](https://github.com/MVS-Telecom/INTERA-Task-2/tree/57844f5c27700ff171717c96e30d65f9af51f17a), revision `57844f5c27700ff171717c96e30d65f9af51f17a`. Its original README is preserved byte-for-byte in [reference/task-original.md](./reference/task-original.md). The [reference SVG](../reference-layout.svg) and source fixture remain unchanged and are excluded from formatting.

The fixture actually contains **32 records**, despite the original text and test comment saying 30. The implementation retains all records; only the incorrect original test length expectation was corrected. Queue selection is not capped at 30.

The original requirement's domain rules take precedence over illustrative SVG values. The mappings `full`/`half`/`third`/`quarter` to XL/L/M/S describe four presentations; actual host grid-cell dimensions and integration behavior require validation in that host. The supplied local platform primitives do not constitute a verified live INTERA/Enigma integration.

## Repository handover

Share the [GitHub repository](https://github.com/97Dmitry/test_mvc_telecom) with the reviewer. It contains the source, lock file, tests, English instructions, and [screenshots](https://github.com/97Dmitry/test_mvc_telecom/tree/main/docs/screenshots). See the [acceptance checklist](./acceptance.md) for review and verification steps. Personal agreement documents and correspondence are not part of the repository.

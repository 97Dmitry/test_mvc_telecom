# Delivery and acceptance checklist

This delivery implements the supplied [INTERA Task 2](https://github.com/MVS-Telecom/INTERA-Task-2). The original assignment is retained in [reference/task-original.md](reference/task-original.md). The repository supplied by the customer is the agreed assignment and reference material.

## Delivered materials

| Contract item                                     | Material                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accessible Git repository                         | [test_mvc_telecom](https://github.com/97Dmitry/test_mvc_telecom), including source, tests, configuration, lock file, and reference material                                                                                                                                                                                                                                                                                                                                                                                                                 |
| README with installation and startup instructions | [README](https://github.com/97Dmitry/test_mvc_telecom#readme), including Node/npm prerequisites, cloning, `npm ci`, startup, and verification                                                                                                                                                                                                                                                                                                                                                                                                               |
| Implemented functionality and widget parameters   | [README features and configuration](https://github.com/97Dmitry/test_mvc_telecom#configuration); [development guide](https://github.com/97Dmitry/test_mvc_telecom/blob/main/docs/development.md)                                                                                                                                                                                                                                                                                                                                                            |
| Architecture, main decisions and libraries        | [README architecture and libraries](https://github.com/97Dmitry/test_mvc_telecom#architecture-and-libraries) and the development guide                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Screenshots in all four widget sizes              | [XL / full](https://github.com/97Dmitry/test_mvc_telecom/blob/main/docs/screenshots/full-light.png), [L / half](https://github.com/97Dmitry/test_mvc_telecom/blob/main/docs/screenshots/half-light.png), [M / third](https://github.com/97Dmitry/test_mvc_telecom/blob/main/docs/screenshots/third-light.png), [S / quarter](https://github.com/97Dmitry/test_mvc_telecom/blob/main/docs/screenshots/quarter-light.png); matching dark-theme images in the [screenshots directory](https://github.com/97Dmitry/test_mvc_telecom/tree/main/docs/screenshots) |
| Known limitations and outstanding requirements    | Scope and limitations below, [README limitations](https://github.com/97Dmitry/test_mvc_telecom#scope-and-limitations), and the [development guide](https://github.com/97Dmitry/test_mvc_telecom/blob/main/docs/development.md)                                                                                                                                                                                                                                                                                                                              |

The repository is public; the source, instructions and screenshots can be reviewed using the links above. Review this [acceptance checklist](https://github.com/97Dmitry/test_mvc_telecom/blob/main/docs/acceptance.md) alongside the delivered source. Installed dependencies, build output, temporary test reports, and private correspondence are not delivery materials.

## Local verification

Clone the repository using the README instructions, then run from the project root:

```sh
npm ci
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
npm run dev
```

Open the URL printed by Vite; the default address is `http://127.0.0.1:5173/`. Keep the terminal open while using the application. No customer servers, credentials or environment variables are required for local startup.

For browser tests, install the Playwright browser once with `npx playwright install chromium` and run `npm run test:e2e`. Linux environments can instead set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an existing compatible Chromium executable. Browser binaries are not included in the repository.

The optional `scripts/capture-screenshots.mjs` script regenerates the screenshot set; see the README for its command. Clean dependency installation was verified on Node.js 24.22.1 in WSL2/Arch: installation, lint, formatting, type checking, 132 unit/component tests, 21 Chromium E2E tests and production build passed. The development server returned HTTP 200 over IPv4, and the complete-queue dialog was checked in Chromium.

## Scope and limitations

- All mandatory functional blocks in the supplied assignment are implemented: defensive parameter parsing, queue calculation, four display sizes, multi-currency totals, supplier shares, filters, invoice details and required data states.
- The widget is read-only and uses the provided mock data in the sandbox. There is no live payment execution or dependency on an Enigma server. Integration into the customer's host dashboard and live runtime was not tested locally.
- The original fixture contains 32 invoices, although the assignment text and reference illustration mention 30. All original records are retained; the incorrect original total-count assertion was corrected to 32.
- JavaScript `number` is used for analytical sums, preserving input precision until display. Both amount formats use the same `Intl.NumberFormat` rounding to two decimal places. Extreme values can exceed floating-point limits; this is not a decimal accounting engine.
- Invoice identity uses provider ID, invoice ID and occurrence order for otherwise indistinguishable duplicate rows. The source does not provide a unique record identifier for such duplicates.
- Chromium desktop/mobile layouts are tested. Firefox, Safari and the customer's real runtime have not been verified. Screenshots are real browser captures, visually reviewed, rather than automated pixel-difference baselines.

## Handover

Send the handover email with the [repository link](https://github.com/97Dmitry/test_mvc_telecom) and the documentation and screenshot links above. The repository contains the source, English documentation, screenshots, and limitations; publishing changes does not send that email.

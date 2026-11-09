# Widget screenshots

These PNGs are unedited captures of the actual widget card in Chromium, with the supplied fixture, default filters, **14 of 32** bills selected and the default row limit of 10. The table retains its normal internal overflow. The surrounding sandbox controls are outside the capture.

| Size        | Light                                    | Dark                                   | PNG dimensions |
| ----------- | ---------------------------------------- | -------------------------------------- | -------------- |
| XL / full   | [full-light.png](./full-light.png)       | [full-dark.png](./full-dark.png)       | 920 × 1013     |
| L / half    | [half-light.png](./half-light.png)       | [half-dark.png](./half-dark.png)       | 620 × 346      |
| M / third   | [third-light.png](./third-light.png)     | [third-dark.png](./third-dark.png)     | 400 × 497      |
| S / quarter | [quarter-light.png](./quarter-light.png) | [quarter-dark.png](./quarter-dark.png) | 240 × 368      |

Capture environment: Chromium 156.0.8078.79 on Linux x64, Playwright 1.65.0, 1440 × 1000 viewport, device scale factor 1. Card height is captured in full, including content below the viewport; no page-wide screenshot or image transformation is used. The script waits for fonts and the selected theme, verifies the selection counter and fails on browser console errors or uncaught page errors.

After `npm ci`, regenerate using the installed Playwright Chromium:

```sh
npx playwright install chromium
node scripts/capture-screenshots.mjs
```

Or select an existing compatible Chromium installation:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/sbin/chromium node scripts/capture-screenshots.mjs
```

By default the script starts its own Vite server on `127.0.0.1:4175` with `--strictPort` and closes only that child process. The port must be free. To capture from an already running sandbox without starting or stopping a server, set `BASE_URL`, for example `BASE_URL=http://127.0.0.1:5174`. Different browser versions or locally available fonts may change pixel rendering; regeneration is a fresh browser capture, not a promise of identical PNG bytes.

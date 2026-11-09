# INTERA Payment Planner Sandbox

React 19 and TypeScript 5 sandbox for the [original INTERA assignment](https://github.com/MVS-Telecom/INTERA-Task-2). The original requirements are preserved in [docs/reference/task-original.md](docs/reference/task-original.md).

Use Node.js 22.12 or newer (see `.node-version`). Install dependencies and start the sandbox:

```sh
npm ci
npm run dev
```

The initial widget scaffold separates parameter parsing, pure computation, and React rendering under `src/widget/`.

Run the validation tools:

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Use `npm run format` to format source files.

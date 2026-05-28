# Development Runbook

This runbook focuses on the BrowserOS agent and repository foundation. Do not attempt a full Chromium browser build unless the large Chromium checkout and platform toolchain are already available.

## Repository Map

- `packages/browseros-agent`: agent monorepo, Bun workspace, server, extension UI, CLI, evals, and shared packages.
- `packages/browseros`: Chromium fork build tooling, Python package, Chromium patches, resources, signing, and packaging.
- `docs/`: upstream user-facing documentation plus private fork foundation notes.

## Package Managers and Tooling

Agent:

- Package manager: Bun, pinned by `packages/browseros-agent/package.json` as `bun@1.3.6`.
- Lockfiles: `packages/browseros-agent/bun.lock` and `packages/browseros-agent/bun.lockb`.
- Node/npm/yarn/pnpm are explicitly discouraged by the agent package `engines` field.

Browser build tooling:

- Python package: `packages/browseros/pyproject.toml`.
- Python requirement: `>=3.12`.
- Requirements file: `packages/browseros/requirements.txt`.
- Browser build requires roughly 100 GB for Chromium source and build artifacts.

CLI:

- Go CLI source: `packages/browseros-agent/apps/cli`.
- CLI build file: `packages/browseros-agent/apps/cli/Makefile`.
- NPM wrapper package: `packages/browseros-agent/apps/cli/npm/package.json`.

## Agent Setup

From `packages/browseros-agent`:

```bash
cp apps/server/.env.example apps/server/.env.development
cp apps/agent/.env.example apps/agent/.env.development
cp apps/server/.env.production.example apps/server/.env.production
bun install
bun run dev:setup
```

Do not put real API keys, tokens, credentials, or user data in these files. Use local untracked `.env.*` files only.

## Simplest Agent Build Path

For phase 1, prefer the extension build before server production artifacts because it avoids production upload configuration:

```bash
cd packages/browseros-agent
bun install
bun run build:agent
```

The documented full agent build is:

```bash
cd packages/browseros-agent
bun run build
```

`bun run build` runs both `build:server` and `build:agent`. The server production build may require `.env.production` values for BrowserOS config, codegen, telemetry, and Cloudflare R2 artifact settings. Avoid adding real credentials to the repo.

## Start Commands

From `packages/browseros-agent`:

```bash
bun run start:server
bun run start:agent
bun run dev:watch
```

The package scripts call shell scripts such as `tools/dev/run.sh`. On Windows, run those from Git Bash, WSL, or another shell that can execute POSIX shell scripts.

## Local Install

For unpacked extension install steps, see [INSTALL_RUNBOOK.md](INSTALL_RUNBOOK.md). Phase 1 should validate the agent as an unpacked extension before attempting a full BrowserOS/Chromium packaged install.

## Validation Commands

Run the lowest-cost relevant checks first:

```bash
cd packages/browseros-agent
bun run build:agent
bun run typecheck
bun run lint
```

Run tests when the required runtime dependencies are available:

```bash
cd packages/browseros-agent
bun run test
bun run test:main
cd apps/server && bun run test:tools
```

Some server and integration tests require a running BrowserOS instance, CDP connectivity, or BrowserOS-specific local state. Record those requirements instead of forcing a full browser setup during phase 1.

## Browser Build Notes

The Chromium browser path lives in `packages/browseros`. It is out of scope for this phase unless the Chromium source tree already exists locally.

Reference commands from upstream docs:

```bash
cd packages/browseros
pip install -e .
browseros setup
browseros apply
browseros build
browseros package
```

Expected blockers for a fresh machine include missing Python 3.12+, Chromium `depot_tools`, Visual Studio Build Tools on Windows, platform SDKs, and about 100 GB of disk space.

## Troubleshooting

- Missing `bun`: install Bun and verify `bun --version`. The agent package expects `bun@1.3.6`.
- `yarn install` appears in root `CONTRIBUTING.md`: prefer `packages/browseros-agent/README.md` and `package.json`; the current agent workspace is Bun-based.
- Shell script fails on Windows PowerShell: rerun from Git Bash or WSL.
- GraphQL codegen fails: the agent defaults to `apps/agent/schema/schema.graphql`; verify the file exists or set `GRAPHQL_SCHEMA_PATH` in an untracked local env file.
- Browser/CDP tests fail: start BrowserOS or skip integration tests until the browser runtime is available.
- Server production build asks for R2 or telemetry values: do not commit credentials; document the missing variables and continue with extension build/typecheck/lint evidence.

## Codex Workflow

Each private-fork change should end with a short evidence block:

- Files changed.
- Commands run.
- Pass/fail result for build, lint, typecheck, and tests.
- Any missing dependency or environment blocker.
- Confirmation that no secrets were added and no upstream PR or push occurred.

## Baseline Attempt: 2026-05-28

Local environment observed during the initial private-fork foundation pass:

- `node --version`: passed with `v22.11.0`.
- `python --version`: passed with `Python 3.12.3`.
- `bun --version`: initially failed because `bun` was not installed or not on `PATH`.
- Bun was installed locally at `C:\Users\pannam\.bun\bin\bun.exe`; `bun --version` then passed with `1.3.6` when that directory was added to `PATH`.
- `go version`: failed because `go` was not installed or not on `PATH`.
- `zip -v`: initially missing; installed with Scoop, then passed with Info-ZIP `3.0`.

Commands attempted from `packages/browseros-agent`:

- `bun install`: passed after Bun install.
- `bun run build:agent`: initially failed because blank `GRAPHQL_SCHEMA_PATH=` in `apps/agent/.env.development` disabled the bundled schema fallback; passed after `apps/agent/codegen.ts` was updated to treat blank values as unset.
- `bun run typecheck`: passed.
- `bun run lint`: passed after adding Bun's bin directory to `PATH` and normalizing the local working tree to LF line endings. The command still reports existing warnings.
- `bun run build`: failed because production server builds require `CODEGEN_SERVICE_URL`, `POSTHOG_API_KEY`, and `SENTRY_DSN`. Do not invent or commit those values.
- `bun run build:server:ci`: passed and produced server resource zip artifacts for linux-x64, linux-arm64, windows-x64, darwin-arm64, and darwin-x64.
- `bun run test:main`: timed out while running the full server tools/integration wrapper.
- `cd apps/server && bun run test:tools`: timed out on the full tools group because it includes browser-backed tool tests.

Additional targeted tests:

- `bun run ./scripts/run-bun-test.ts ./apps/agent`: passed, 91 tests.
- Server non-browser tools subset (`filesystem`, `acl-scorer`, `keyboard`, `response`): passed, 154 tests.
- `bun run ./scripts/run-bun-test.ts ./scripts/build`: passed, 10 tests.
- Server root group (`cd apps/server && bun run ./tests/__helpers__/run-test-group.ts root`): passed, 58 tests, 4 skipped.
- The skipped root test is a POSIX fake-browser launch fixture that needs a real Windows executable fixture before it can run on Windows.

Static checks:

- `git diff --check`: passed.
- Review of changed files found no real secrets, API keys, tokens, private credentials, or user data.

Browser build status:

- `packages/browseros` contains BrowserOS build tooling, patches, and resources.
- No large Chromium source checkout was present, so no full Chromium browser build was attempted.

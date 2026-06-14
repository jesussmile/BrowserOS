# Private Fork Guide

This repository is a private mirrored copy of BrowserOS, based on the upstream project at https://github.com/browseros-ai/BrowserOS. It is not an upstream contribution branch and should not be treated as a public GitHub fork.

BrowserOS remains an open-source project under AGPL-3.0. Keep upstream copyright notices, license files, attribution, and BrowserOS references intact unless legal review approves a specific change.

For the current implementation and operational history of this private fork, see [PHASE1_STATUS.md](PHASE1_STATUS.md). That file records the active Desktop checkout, patched launcher, local session work, BrowserOS host install history, and unresolved phase 1 blockers.

## Remotes

Use these remote meanings for this private mirror:

- `origin`: our private repository.
- `upstream`: https://github.com/browseros-ai/BrowserOS.git.

If this checkout does not yet have `origin`, add it with the private repository URL before pushing:

```bash
git remote add origin <private-repo-url>
```

To reduce accidental upstream writes, keep `upstream` fetch-only where possible:

```bash
git remote set-url --push upstream DISABLED
```

## Syncing From Upstream

Only sync from upstream into the private mirror. Do not open pull requests upstream from this repository.

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

After each sync, run the agent validation path in [DEV_RUNBOOK.md](DEV_RUNBOOK.md) and record any required private follow-up work.

## Overlay Fork Strategy

PannamOS should remain an overlay fork of BrowserOS. Keep private product changes behind small central surfaces and patch overlays instead of broad search-and-replace edits.

Current central surfaces:

- Browser build identity: `packages/browseros/build/common/product_identity.py`.
- Browser build context/artifact names: `packages/browseros/build/common/context.py`.
- Chromium branding replacements: `packages/browseros/chromium_files/chrome/app/theme/chromium/BRANDING.*`.
- Windows install-static patch values: `packages/browseros/chromium_patches/chrome/install_static/chromium_install_modes.h`.
- Agent branding/update defaults: `packages/browseros-agent/apps/agent/lib/constants/productConfig.ts`.
- Local provider defaults: `packages/browseros-agent/apps/agent/lib/llm-providers/storage.ts` and `providerTemplates.ts`.
- Local Goal Loop state: `packages/browseros-agent/apps/server/src/lib/db/schema/local-sessions.ts`.

Avoid changing upstream code only to rename comments, license headers, historical BrowserOS references, or documentation attribution.

## Feature Porting Checklist

After every upstream merge:

1. Re-run product identity tests and confirm generated installer names resolve as `PannamOS_v<version>_<arch>_installer.exe`.
2. Confirm PannamOS does not install into `%LOCALAPPDATA%\Chromium\Application` and does not reuse BrowserOS Windows GUIDs, protocols, ProgIDs, or profile/runtime paths.
3. Confirm normal provider setup exposes only approved local providers: OpenAI API, ChatGPT Plus/Pro OAuth, and OpenAI-compatible endpoints.
4. Confirm upstream login, upstream cloud sync, managed app auth, GraphQL defaults, and public extension update URLs are not required for normal chat, sessions, Goal Mode, or provider setup.
5. Confirm Goal Loop queue items, checkpoints, evidence, retry counts, and artifact paths still persist in local SQLite and survive restart.
6. Confirm installer side-by-side behavior with official BrowserOS: separate install path, profile path, server data path, uninstall entry, protocol handler, and launch behavior.
7. Record merge conflicts, private patches refreshed, tests run, and any deferred BrowserOS feature ports in `PHASE1_STATUS.md` or a dated implementation note.

If an upstream feature depends on login, cloud sync, public update channels, or managed app auth, port the user-facing behavior only after replacing those dependencies with local-first PannamOS equivalents.

## Public Fork Warning

GitHub public forks of public repositories are public. This project should remain a private mirror, not a GitHub fork, so private product work, planning, and configuration scaffolding are not exposed through GitHub's public fork network.

## Licensing

BrowserOS is licensed under AGPL-3.0. Preserve the root `LICENSE`, `LICENSE.ungoogled_chromium`, CLA files, copyright headers, attribution, and notices.

Get legal review before distributing modified builds externally, offering modified network-accessible services, changing license notices, or publishing binaries derived from this private mirror.

## Upstream Contribution Docs

The upstream tree includes contribution-oriented files such as `CONTRIBUTING.md`, `CLA.md`, `packages/browseros-agent/CLA.md`, and package-level READMEs. Those are useful for understanding upstream practices, but private product work should follow this private fork guide unless the team explicitly decides to contribute a separate clean patch upstream.

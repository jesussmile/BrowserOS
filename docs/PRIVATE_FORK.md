# Private Fork Guide

This repository is a private mirrored copy of BrowserOS, based on the upstream project at https://github.com/browseros-ai/BrowserOS. It is not an upstream contribution branch and should not be treated as a public GitHub fork.

BrowserOS remains an open-source project under AGPL-3.0. Keep upstream copyright notices, license files, attribution, and BrowserOS references intact unless legal review approves a specific change.

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

## Public Fork Warning

GitHub public forks of public repositories are public. This project should remain a private mirror, not a GitHub fork, so private product work, planning, and configuration scaffolding are not exposed through GitHub's public fork network.

## Licensing

BrowserOS is licensed under AGPL-3.0. Preserve the root `LICENSE`, `LICENSE.ungoogled_chromium`, CLA files, copyright headers, attribution, and notices.

Get legal review before distributing modified builds externally, offering modified network-accessible services, changing license notices, or publishing binaries derived from this private mirror.

## Upstream Contribution Docs

The upstream tree includes contribution-oriented files such as `CONTRIBUTING.md`, `CLA.md`, `packages/browseros-agent/CLA.md`, and package-level READMEs. Those are useful for understanding upstream practices, but private product work should follow this private fork guide unless the team explicitly decides to contribute a separate clean patch upstream.

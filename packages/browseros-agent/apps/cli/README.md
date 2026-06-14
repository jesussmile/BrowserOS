# PannamOS CLI

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](../../../../LICENSE)

Command-line interface for controlling a local PannamOS browser from a terminal
or from AI coding agents like Claude Code, Codex, and Gemini CLI.

The current binary and env vars still use the upstream-compatible
`browseros-cli` / `BROWSEROS_*` names. Treat those as compatibility names until
the CLI package identity is renamed end to end.

## Install

Private builds do not use the official BrowserOS CDN. Build from source or set
an internal PannamOS release URL before using installer scripts.

### macOS / Linux

```bash
BROWSEROS_CLI_DOWNLOAD_BASE="https://internal.example/cli" ./scripts/install.sh
```

### Windows

```powershell
$env:BROWSEROS_CLI_DOWNLOAD_BASE="https://internal.example/cli"
.\scripts\install.ps1
```

### Build From Source

Requires Go 1.25+.

```bash
make
make install
```

## Quick Start

```bash
# If PannamOS is not installed yet
BROWSEROS_PRIVATE_DOWNLOAD_URL="https://internal.example/PannamOS_installer.exe" browseros-cli install

# If PannamOS is installed but not running
browseros-cli launch

# Configure the CLI with the local MCP server URL from PannamOS settings
browseros-cli init http://127.0.0.1:9000/mcp

# Verify connection
browseros-cli health
```

Config is saved to `~/.config/browseros-cli/config.yaml`. If
`browseros-cli health` cannot connect, copy the current Server URL from
PannamOS settings and run `browseros-cli init <Server URL>` again.

## CLI Updates

Private builds do not check the BrowserOS CDN for CLI updates. Set
`BROWSEROS_CLI_UPDATE_MANIFEST_URL` to an internal manifest URL to enable
self-update checks.

```bash
browseros-cli update
browseros-cli update --check
browseros-cli update --yes
```

## Usage

```bash
browseros-cli health
browseros-cli status

browseros-cli pages
browseros-cli active
browseros-cli open https://example.com
browseros-cli close 42

browseros-cli nav https://example.com
browseros-cli back
browseros-cli forward
browseros-cli reload

browseros-cli snap
browseros-cli snap -e
browseros-cli text
browseros-cli links
browseros-cli eval "document.title"

browseros-cli click e5
browseros-cli click-at 100 200
browseros-cli fill e12 "hello"
browseros-cli key Enter
browseros-cli hover e3
browseros-cli scroll down 500

browseros-cli ss
browseros-cli ss -o shot.png
browseros-cli pdf -o page.pdf

browseros-cli window list
browseros-cli bookmark search "github"
browseros-cli history recent
browseros-cli group list
```

## Use As MCP Server

PannamOS exposes a local MCP server that AI coding agents can connect to
directly. The CLI is the quickest way to verify the connection and interact with
tools from the terminal.

Use the local Server URL shown in PannamOS settings and run:

```bash
browseros-cli init <Server URL>
```

## Global Flags

| Flag | Env Var | Description |
|------|---------|-------------|
| `--server, -s` | `BROWSEROS_URL` | Server URL, defaulting to config |
| `--page, -p` | `BROWSEROS_PAGE` | Target page ID, defaulting to active page |
| `--json` | `BOS_JSON=1` | JSON output |
| `--debug` | `BOS_DEBUG=1` | Debug output |
| `--timeout, -t` | | Request timeout, default `2m` |

Priority for server URL: `--server` flag, then `BROWSEROS_URL`, then config.

## Testing

Integration tests require a running PannamOS server with the dev build.

```bash
bun run dev:watch:new
./browseros-cli init
BROWSEROS_URL=http://127.0.0.1:9105 go test -tags integration -v ./...
```

Tests skip gracefully if no server is reachable.

## Architecture

```text
apps/cli/
├── main.go
├── Makefile
├── config/
├── cmd/
├── mcp/
└── output/
```

The CLI communicates with PannamOS via two HTTP POST requests per command:

1. `initialize` - MCP handshake
2. `tools/call` - execute the requested tool

## Links

- [Private fork runbook](../../../../docs/DEV_RUNBOOK.md)
- [Changelog](./CHANGELOG.md)

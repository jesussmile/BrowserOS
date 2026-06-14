# PannamOS Provider Runbook

PannamOS supports local provider setup without upstream login or upstream cloud sync. OpenAI API/OpenAI-compatible providers use BYOK API keys, and ChatGPT Plus/Pro can use the local OAuth provider flow when the user wants account-login based access.

## Supported V1 Providers

Exposed setup paths:

- OpenAI API
- ChatGPT Plus/Pro OAuth
- OpenAI-compatible API endpoints

Provider types that may still exist in TypeScript unions for compatibility are not normal v1 setup choices unless they are explicitly re-enabled after review.

## Add ChatGPT Plus/Pro Login

1. Open the PannamOS provider settings UI.
2. Choose `ChatGPT Plus/Pro`.
3. Complete the OpenAI authentication flow in the browser tab that opens.
4. Confirm the provider appears in configured providers.
5. Keep the model at the verified default, `gpt-5.4`.
6. Set it as the default provider if you want Assistant/Goal Mode to use it.

This stores OAuth tokens locally in the PannamOS server database. It is not BrowserOS account login, BrowserOS cloud sync, or a BrowserOS-managed provider.

## Add an OpenAI API Key

1. Open the PannamOS provider settings UI.
2. Choose `OpenAI`.
3. Set the base URL to `https://api.openai.com/v1`.
4. Enter the API key from `https://platform.openai.com/api-keys`.
5. Choose a model such as `gpt-5`.
6. Save the provider and send a small local chat prompt.

Never add API keys to `.env.example`, docs, tests, screenshots, source files, or git commits.

## Add an OpenAI-Compatible Provider

1. Open the PannamOS provider settings UI.
2. Choose `OpenAI Compatible`.
3. Enter the provider base URL, for example `http://localhost:1234/v1` for a compatible local server.
4. Enter the API key only if that endpoint requires one.
5. Enter the exact model ID expected by that endpoint.
6. Save the provider and send a small local chat prompt.

For local-only endpoints, prefer loopback URLs such as `http://localhost:<port>/v1`.

## Verification

Run focused provider tests:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS\packages\browseros-agent
bun test apps/agent/lib/llm-providers/providerTemplates.test.ts
```

Manual checks:

- Provider setup offers OpenAI, ChatGPT Plus/Pro, and OpenAI-compatible options.
- Normal chat works without BrowserOS account login.
- Goal Mode can create local goal records without BrowserOS account login.
- No provider API key appears in `git diff`, logs, docs, screenshots, or local test fixtures.
- No normal provider setup path posts provider configuration to upstream GraphQL or upstream cloud sync.

## Secret Hygiene

Before committing provider-related changes:

```powershell
git diff -- . ':!*.lock' | Select-String -Pattern 'sk-|api[_-]?key|authorization|bearer|token|secret' -CaseSensitive:$false
```

Review every match manually. Test data should use placeholders such as `test-api-key`, never real keys.

## Re-Enabling Additional Providers

Do not expose additional providers by default until the provider has:

- A local-only storage path.
- No BrowserOS cloud dependency.
- Clear BYOK credential handling.
- Tests showing it is exposed only when intended.
- Documentation explaining data flow and secret handling.

Ollama and LM Studio are planned later local-provider candidates, but they are not exposed as default v1 setup paths in the current implementation.

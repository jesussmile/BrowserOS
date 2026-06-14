import type { Hono } from 'hono'

// Keep the exported RPC client type intentionally shallow. Inferring the full
// Hono route tree across the server and extension packages can exceed
// TypeScript's instantiation depth as the private local API grows.
export type AppType = Hono

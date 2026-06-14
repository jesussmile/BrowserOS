import { ZodError, z } from 'zod'

const PRIVATE_BROWSEROS_API_URL = 'https://browseros.invalid'
const UPSTREAM_BROWSEROS_API_HOST = ['api', 'browseros', 'com'].join('.')

const EnvSchema = z.object({
  VITE_BROWSEROS_SERVER_PORT: z.coerce.number().optional(),
  VITE_ALPHA_FEATURES: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  VITE_PUBLIC_POSTHOG_KEY: z.string().optional(),
  VITE_PUBLIC_POSTHOG_HOST: z.string().optional(),
  VITE_PUBLIC_SENTRY_DSN: z.string().optional(),
  VITE_PUBLIC_BROWSEROS_API: z.string().optional(),
  PROD: z.boolean().optional().default(false),
})

try {
  EnvSchema.parse(import.meta.env)
} catch (error) {
  if (error instanceof ZodError) {
    let message = 'Missing required values in .env:\n'
    for (const issue of error.issues) {
      message += `${issue.path.join('.')}\n`
    }
    const e = new Error(message)
    e.stack = ''
    throw e
  }
  // biome-ignore lint/suspicious/noConsole: allowed to display error information
  console.error(error)
  throw error
}

function resolvePrivateBrowserOsApi(value: string | undefined): string {
  const candidate = value?.trim()
  if (!candidate) return PRIVATE_BROWSEROS_API_URL

  try {
    const url = new URL(candidate)
    if (url.hostname === UPSTREAM_BROWSEROS_API_HOST) {
      return PRIVATE_BROWSEROS_API_URL
    }
    return candidate
  } catch {
    return PRIVATE_BROWSEROS_API_URL
  }
}

/**
 * @public
 */
const parsedEnv = EnvSchema.parse(import.meta.env)

export const env = {
  ...parsedEnv,
  VITE_PUBLIC_BROWSEROS_API: resolvePrivateBrowserOsApi(
    parsedEnv.VITE_PUBLIC_BROWSEROS_API,
  ),
}

import { createRequire } from 'node:module'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type WxtViteConfig } from 'wxt'
import { PANNAMOS_EXTENSION_HOST_PERMISSIONS } from './lib/constants/extensionManifest'
import { LEGACY_AGENT_EXTENSION_ID } from './lib/constants/legacyAgentExtensionId'
import { resolveProductConfig } from './lib/constants/productConfig'
import { PRODUCT_WEB_HOST } from './lib/constants/productWebHost'

// biome-ignore lint/style/noProcessEnv: build config file needs env access
const env = process.env
const require = createRequire(import.meta.url)

const PRIVATE_BROWSEROS_API_URL = 'https://browseros.invalid'
const UPSTREAM_BROWSEROS_API_HOST = ['api', 'browseros', 'com'].join('.')

function resolvePrivateApiUrl(value: string | undefined): string {
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

const apiUrl = new URL(resolvePrivateApiUrl(env.VITE_PUBLIC_BROWSEROS_API))
const apiPattern = apiUrl.port
  ? `${apiUrl.hostname}:${apiUrl.port}`
  : apiUrl.hostname
const productConfig = resolveProductConfig(env)
const disableNewTabOverride =
  env.BROWSEROS_PRIVATE_DISABLE_NEWTAB_OVERRIDE === 'true'
const enableSourceMaps =
  env.PANNAMOS_AGENT_SOURCEMAPS === 'true' || Boolean(env.SENTRY_AUTH_TOKEN)

function getVitePlugins(): WxtViteConfig['plugins'] {
  return [
    tailwindcss(),
    ...(env.SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            org: env.SENTRY_ORG,
            project: env.SENTRY_PROJECT,
            authToken: env.SENTRY_AUTH_TOKEN,
            sourcemaps: {
              // Bug with sentry & WXT - refer: https://github.com/wxt-dev/wxt/issues/1735
              // filesToDeleteAfterUpload: ['./dist/**/*.map'],
            },
          }),
        ]
      : []),
  ].flat() as unknown as WxtViteConfig['plugins']
}

// See https://wxt.dev/api/config.html
// Extension ID is derived from the manifest key. Private PannamOS installer
// builds should set PANNAMOS_AGENT_EXTENSION_KEY before building the agent.
export default defineConfig({
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    // Private fork note: this is the central extension manifest surface for
    // future reviewed branding work. Preserve BrowserOS attribution and avoid
    // scattering product-name changes through the UI.
    name: productConfig.extensionName,
    ...(productConfig.extensionManifestKey
      ? { key: productConfig.extensionManifestKey }
      : {}),
    // Private fork packaging should use a reviewed internal update channel or
    // omit update wiring; do not ship BrowserOS CDN updates for private builds.
    ...(productConfig.extensionUpdateUrl
      ? { update_url: productConfig.extensionUpdateUrl }
      : {}),
    externally_connectable: {
      matches: [`https://${apiPattern}/*`, `https://*.${apiPattern}/*`],
    },
    web_accessible_resources: [
      {
        resources: ['app.html'],
        matches: [
          `https://${PRODUCT_WEB_HOST}/*`,
          `https://*.${PRODUCT_WEB_HOST}/*`,
        ],
        extension_ids: [LEGACY_AGENT_EXTENSION_ID],
      },
    ],
    ...(disableNewTabOverride
      ? {}
      : {
          chrome_url_overrides: {
            newtab: 'app.html',
          },
        }),
    options_ui: {
      page: 'app.html#/settings',
      open_in_tab: true,
    },
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
      // Private fork note: keep this as an explicit future branding touchpoint.
      default_title: productConfig.extensionToolbarTitle,
    },
    permissions: [
      'topSites',
      'storage',
      'unlimitedStorage',
      'scripting',
      'tabs',
      'tabGroups',
      'sidePanel',
      'bookmarks',
      'history',
      'browserOS',
      'alarms',
      'webNavigation',
      'downloads',
    ],
    host_permissions: [...PANNAMOS_EXTENSION_HOST_PERMISSIONS],
  },
  vite: () => ({
    resolve: {
      alias: [
        { find: /^react$/, replacement: require.resolve('react') },
        {
          find: /^react\/jsx-runtime$/,
          replacement: require.resolve('react/jsx-runtime'),
        },
        {
          find: /^react\/jsx-dev-runtime$/,
          replacement: require.resolve('react/jsx-dev-runtime'),
        },
        { find: /^react-dom$/, replacement: require.resolve('react-dom') },
        {
          find: /^react-dom\/client$/,
          replacement: require.resolve('react-dom/client'),
        },
        {
          find: /^@tanstack\/react-query$/,
          replacement: require.resolve('@tanstack/react-query'),
        },
        {
          find: /^@tanstack\/react-query-persist-client$/,
          replacement: require.resolve('@tanstack/react-query-persist-client'),
        },
      ],
      dedupe: [
        'react',
        'react-dom',
        '@tanstack/react-query',
        '@tanstack/react-query-persist-client',
      ],
    },
    build: {
      sourcemap: enableSourceMaps ? 'hidden' : false,
    },
    plugins: getVitePlugins(),
  }),
})

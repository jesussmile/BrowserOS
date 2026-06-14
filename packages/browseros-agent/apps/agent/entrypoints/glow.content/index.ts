import confetti from 'canvas-confetti'
import type { GlowMessage } from './GlowMessage'

const GLOW_OVERLAY_ID = 'pannamos-glow-overlay'
const GLOW_STYLES_ID = 'pannamos-glow-styles'
const GLOW_STOP_BTN_ID = 'pannamos-glow-stop-btn'
const WORKING_FAVICON_ID = 'pannamos-working-favicon'
const WORKING_TITLE_PREFIX = '[working] '

const GLOW_THICKNESS = 1.0
const GLOW_OPACITY = 0.6

let activeConversationId: string | null = null
let originalTitle: string | null = null
let originalFaviconHref: string | null = null
let hadOriginalFavicon = false

function injectStyles(): void {
  if (document.getElementById(GLOW_STYLES_ID)) {
    return
  }

  const t = GLOW_THICKNESS

  const style = document.createElement('style')
  style.id = GLOW_STYLES_ID
  style.textContent = `
    @keyframes pannamos-glow-pulse {
      0% {
        box-shadow:
          inset 0 0 ${58 * t}px ${26 * t}px transparent,
          inset 0 0 ${50 * t}px ${22 * t}px rgba(142, 71, 255, 0.06),
          inset 0 0 ${42 * t}px ${18 * t}px rgba(142, 71, 255, 0.12),
          inset 0 0 ${34 * t}px ${14 * t}px rgba(142, 71, 255, 0.18);
      }
      50% {
        box-shadow:
          inset 0 0 ${72 * t}px ${35 * t}px transparent,
          inset 0 0 ${64 * t}px ${32 * t}px rgba(142, 71, 255, 0.10),
          inset 0 0 ${54 * t}px ${26 * t}px rgba(142, 71, 255, 0.18),
          inset 0 0 ${46 * t}px ${22 * t}px rgba(142, 71, 255, 0.24);
      }
      100% {
        box-shadow:
          inset 0 0 ${58 * t}px ${26 * t}px transparent,
          inset 0 0 ${50 * t}px ${22 * t}px rgba(142, 71, 255, 0.06),
          inset 0 0 ${42 * t}px ${18 * t}px rgba(142, 71, 255, 0.12),
          inset 0 0 ${34 * t}px ${14 * t}px rgba(142, 71, 255, 0.18);
      }
    }

    @keyframes pannamos-glow-fade-in {
      from { opacity: 0; }
      to { opacity: ${GLOW_OPACITY}; }
    }

    @keyframes pannamos-glow-btn-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    #${GLOW_OVERLAY_ID} {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
      opacity: 0;
      will-change: opacity;
      animation:
        pannamos-glow-pulse 3s ease-in-out infinite,
        pannamos-glow-fade-in 420ms cubic-bezier(0.22, 1, 0.36, 1) forwards !important;
    }

    #${GLOW_STOP_BTN_ID} {
      position: fixed !important;
      bottom: 24px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      width: 48px !important;
      height: 48px !important;
      border-radius: 50% !important;
      background: rgba(220, 38, 38, 0.95) !important;
      color: white !important;
      border: none !important;
      pointer-events: auto !important;
      cursor: pointer !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      line-height: 1 !important;
      padding: 0 !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
      opacity: 0;
      animation: pannamos-glow-btn-fade-in 420ms cubic-bezier(0.22, 1, 0.36, 1) forwards !important;
    }

    #${GLOW_STOP_BTN_ID}:hover {
      background: rgba(185, 28, 28, 1) !important;
    }
  `
  const appendStyle = () => document.head.appendChild(style)

  if (document.head) {
    appendStyle()
  } else {
    document.addEventListener('DOMContentLoaded', appendStyle, { once: true })
  }
}

function startGlow(): void {
  stopGlow()
  injectStyles()

  const overlay = document.createElement('div')
  overlay.id = GLOW_OVERLAY_ID

  const button = document.createElement('button')
  button.id = GLOW_STOP_BTN_ID
  button.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="white" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="14" height="14" rx="2"/></svg>'
  button.addEventListener('click', () => {
    if (activeConversationId) {
      browser.runtime.sendMessage({
        type: 'stop-agent',
        conversationId: activeConversationId,
      })
    }
  })

  overlay.appendChild(button)

  const appendOverlay = () => document.body.appendChild(overlay)

  if (document.body) {
    appendOverlay()
  } else {
    document.addEventListener('DOMContentLoaded', appendOverlay, { once: true })
  }
}

function fireConfetti(): void {
  const colors = ['#8e47ff', '#a855f7', '#c084fc', '#34d399', '#60a5fa']
  const defaults = { colors, ticks: 200, gravity: 1.2, decay: 0.94 }

  confetti({
    ...defaults,
    particleCount: 80,
    spread: 70,
    origin: { x: 0.3, y: 0.6 },
    angle: 60,
  })
  confetti({
    ...defaults,
    particleCount: 80,
    spread: 70,
    origin: { x: 0.7, y: 0.6 },
    angle: 120,
  })

  setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 60,
      spread: 100,
      origin: { x: 0.5, y: 0.7 },
    })
  }, 150)

  setTimeout(() => {
    confetti({
      ...defaults,
      particleCount: 40,
      spread: 120,
      origin: { x: 0.4, y: 0.65 },
      angle: 75,
    })
    confetti({
      ...defaults,
      particleCount: 40,
      spread: 120,
      origin: { x: 0.6, y: 0.65 },
      angle: 105,
    })
  }, 350)
}

function stopGlow(): void {
  const overlay = document.getElementById(GLOW_OVERLAY_ID)
  if (overlay) {
    overlay.remove()
  }
}

function startTabMarker(): void {
  if (originalTitle === null) {
    originalTitle = document.title
  }
  if (!document.title.startsWith(WORKING_TITLE_PREFIX)) {
    document.title = `${WORKING_TITLE_PREFIX}${document.title}`
  }

  const existingIcon = document.querySelector<HTMLLinkElement>(
    'link[rel~="icon"]:not(#pannamos-working-favicon)',
  )
  if (originalFaviconHref === null) {
    hadOriginalFavicon = Boolean(existingIcon)
    originalFaviconHref = existingIcon?.href ?? ''
  }

  let marker = document.getElementById(
    WORKING_FAVICON_ID,
  ) as HTMLLinkElement | null
  if (!marker) {
    marker = document.createElement('link')
    marker.id = WORKING_FAVICON_ID
    marker.rel = 'icon'
    document.head?.appendChild(marker)
  }
  marker.href = buildWorkingFavicon()
}

function stopTabMarker(): void {
  if (originalTitle !== null) {
    document.title = originalTitle
    originalTitle = null
  }

  document.getElementById(WORKING_FAVICON_ID)?.remove()
  const existingIcon = document.querySelector<HTMLLinkElement>(
    'link[rel~="icon"]:not(#pannamos-working-favicon)',
  )
  if (hadOriginalFavicon && originalFaviconHref && existingIcon) {
    existingIcon.href = originalFaviconHref
  }
  originalFaviconHref = null
  hadOriginalFavicon = false
}

function buildWorkingFavicon(): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <style>
        @keyframes spin { to { transform: rotate(360deg); } }
        .ring { transform-origin: 32px 32px; animation: spin 1.1s linear infinite; }
      </style>
      <circle cx="32" cy="32" r="30" fill="#17131d"/>
      <path class="ring" d="M32 8a24 24 0 1 1-17 7" fill="none" stroke="#a855f7" stroke-width="8" stroke-linecap="round"/>
      <circle cx="32" cy="32" r="9" fill="#ffffff"/>
    </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_start',
  main() {
    browser.runtime.onMessage.addListener(
      (message: GlowMessage, _sender, sendResponse) => {
        if (
          typeof message !== 'object' ||
          !('conversationId' in message) ||
          !('isActive' in message)
        ) {
          return
        }

        if (message.isActive) {
          activeConversationId = message.conversationId
          startGlow()
          if (message.showTabMarker !== false) {
            startTabMarker()
          }
        } else if (message.conversationId === activeConversationId) {
          activeConversationId = null
          stopGlow()
          stopTabMarker()
          if (message.showConfetti) {
            fireConfetti()
          }
        }

        sendResponse({ success: true })
        return true
      },
    )

    window.addEventListener('beforeunload', () => {
      stopGlow()
      stopTabMarker()
    })

    document.addEventListener('visibilitychange', () => {
      // If user navigates away from the tab, remove the glow overlay - no need to re-enable it when they return
      if (document.hidden) {
        stopGlow()
      }
    })
  },
})

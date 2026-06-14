#!/usr/bin/env bun
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
} from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

function parseArgs(argv) {
  const result = { key: '', regenerate: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--key') {
      result.key = argv[++i] ?? ''
    } else if (arg === '--regenerate') {
      result.regenerate = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  if (!result.key) {
    throw new Error('Missing --key <path>')
  }
  result.key = resolve(result.key)
  return result
}

function deriveChromeExtensionId(publicKeyDer) {
  const digest = createHash('sha256').update(publicKeyDer).digest()
  const alphabet = 'abcdefghijklmnop'
  let id = ''
  for (const byte of digest.subarray(0, 16)) {
    id += alphabet[byte >> 4]
    id += alphabet[byte & 0x0f]
  }
  return id
}

const args = parseArgs(process.argv.slice(2))
let generated = false

if (args.regenerate || !existsSync(args.key)) {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  mkdirSync(dirname(args.key), { recursive: true })
  writeFileSync(args.key, privateKey, { encoding: 'utf8', mode: 0o600 })
  generated = true
}

const privateKey = createPrivateKey(readFileSync(args.key, 'utf8'))
const publicKey = createPublicKey(privateKey)
const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' })
const publicKeyBase64 = Buffer.from(publicKeyDer).toString('base64')
const extensionId = deriveChromeExtensionId(publicKeyDer)

process.stdout.write(
  JSON.stringify({
    generated,
    keyPath: args.key,
    publicKeyBase64,
    extensionId,
  }),
)

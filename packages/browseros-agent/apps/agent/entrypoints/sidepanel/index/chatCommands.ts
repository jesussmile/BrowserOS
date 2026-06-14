const COMPACT_COMMANDS = new Set(['/compact', '/c'])

export function isCompactCommand(input: string): boolean {
  return COMPACT_COMMANDS.has(input.trim().toLowerCase())
}

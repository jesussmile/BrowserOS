/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Centralized file system paths.
 */

export const PATHS = {
  DEFAULT_EXECUTION_DIR: process.cwd(),
  WINDOWS_STORAGE_ROOT: 'E:\\PannamOS',
  SERVER_STATE_DIR_NAME: 'ServerState',
  OUTPUTS_DIR_NAME: 'Outputs',
  GOAL_LOOP_OUTPUT_DIR_NAME: 'GoalLoop',
  MANUAL_OUTPUT_DIR_NAME: 'Manual',
  TOOL_CALL_OUTPUT_DIR_NAME: 'ToolCalls',
  LOGS_DIR_NAME: 'Logs',
  BROWSER_PROFILE_DIR_NAME: 'BrowserProfile',
  BACKUPS_DIR_NAME: 'Backups',
  BROWSEROS_DIR_NAME: '.pannamos',
  DEV_BROWSEROS_DIR_NAME: '.pannamos-dev',
  CACHE_DIR_NAME: 'cache',
  DB_DIR_NAME: 'db',
  DB_FILE_NAME: 'pannamos.sqlite',
  LEGACY_DB_FILE_NAME: 'browseros.sqlite',
  SESSIONS_DIR_NAME: 'sessions',
  TOOL_OUTPUT_DIR_NAME: 'tool-output',
  SOUL_FILE_NAME: 'SOUL.md',
  SERVER_CONFIG_FILE_NAME: 'server.json',
  SESSION_RETENTION_DAYS: 30,
} as const

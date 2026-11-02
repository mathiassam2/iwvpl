/**
 * League system settings (e.g. manager passcode, registration controls).
 */

import { execute, queryAll, queryOne } from '../db.js'

export interface ManagerPasscodeSettings {
  enabled: boolean
  passcode: string
}

const DEFAULT_SETTINGS: ManagerPasscodeSettings = {
  enabled: true,
  passcode: 'IWVPL2026',
}

async function ensureSettingsTable(): Promise<void> {
  try {
    await execute(`CREATE TABLE IF NOT EXISTS system_settings (
      setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at DATETIME NOT NULL
    ) DEFAULT CHARSET=utf8mb4`)
  } catch (err) {
    console.error('Could not ensure system_settings table:', err)
  }
}

export async function getManagerPasscodeSettings(): Promise<ManagerPasscodeSettings> {
  try {
    await ensureSettingsTable()
    const rows = await queryAll<{ setting_key: string; setting_value: string }>(
      `SELECT setting_key, setting_value FROM system_settings
        WHERE setting_key IN ('manager_passcode', 'manager_passcode_enabled')`
    )
    if (!rows || rows.length === 0) {
      return { ...DEFAULT_SETTINGS }
    }
    const map = new Map(rows.map((r) => [r.setting_key, r.setting_value]))
    const enabledRaw = map.get('manager_passcode_enabled')
    const passcodeRaw = map.get('manager_passcode')

    return {
      enabled: enabledRaw !== undefined ? enabledRaw === 'true' : DEFAULT_SETTINGS.enabled,
      passcode: passcodeRaw?.trim() ? passcodeRaw.trim() : DEFAULT_SETTINGS.passcode,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function updateManagerPasscodeSettings(
  settings: Partial<ManagerPasscodeSettings>
): Promise<ManagerPasscodeSettings> {
  await ensureSettingsTable()
  const current = await getManagerPasscodeSettings()
  const nextEnabled = settings.enabled !== undefined ? Boolean(settings.enabled) : current.enabled
  const nextPasscode = settings.passcode !== undefined ? settings.passcode.trim() : current.passcode

  await execute(
    `INSERT INTO system_settings (setting_key, setting_value, updated_at)
     VALUES ('manager_passcode', ?, NOW())
     ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()`,
    [nextPasscode, nextPasscode]
  )

  await execute(
    `INSERT INTO system_settings (setting_key, setting_value, updated_at)
     VALUES ('manager_passcode_enabled', ?, NOW())
     ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()`,
    [nextEnabled ? 'true' : 'false', nextEnabled ? 'true' : 'false']
  )

  return {
    enabled: nextEnabled,
    passcode: nextPasscode,
  }
}

export interface TransferWindowSettings {
  open: boolean
  maxSquadSize: number
}

const DEFAULT_MAX_SQUAD_SIZE = 23

export async function getTransferWindowSettings(): Promise<TransferWindowSettings> {
  try {
    await ensureSettingsTable()
    const rows = await queryAll<{ setting_key: string; setting_value: string }>(
      `SELECT setting_key, setting_value FROM system_settings
        WHERE setting_key IN ('transfer_window_open', 'max_squad_size')`,
    )
    if (!rows || rows.length === 0) {
      return { open: true, maxSquadSize: DEFAULT_MAX_SQUAD_SIZE }
    }
    const map = new Map(rows.map((r) => [r.setting_key, r.setting_value]))
    const rawOpen = map.get('transfer_window_open')
    const rawMax = map.get('max_squad_size')
    const parsedMax = rawMax !== undefined ? Number.parseInt(rawMax, 10) : DEFAULT_MAX_SQUAD_SIZE
    const maxSquadSize =
      Number.isInteger(parsedMax) && parsedMax >= 5 && parsedMax <= 99
        ? parsedMax
        : DEFAULT_MAX_SQUAD_SIZE
    return {
      open: rawOpen !== undefined ? rawOpen !== 'false' && rawOpen !== '0' : true,
      maxSquadSize,
    }
  } catch {
    return { open: true, maxSquadSize: DEFAULT_MAX_SQUAD_SIZE }
  }
}

export async function updateTransferWindowSettings(
  open?: boolean,
  maxSquadSize?: number,
): Promise<TransferWindowSettings> {
  await ensureSettingsTable()
  const current = await getTransferWindowSettings()
  const nextOpen = open !== undefined ? Boolean(open) : current.open
  const nextMax =
    maxSquadSize !== undefined && Number.isInteger(maxSquadSize) && maxSquadSize >= 5 && maxSquadSize <= 99
      ? maxSquadSize
      : current.maxSquadSize

  const val = nextOpen ? 'true' : 'false'
  await execute(
    `INSERT INTO system_settings (setting_key, setting_value, updated_at)
     VALUES ('transfer_window_open', ?, NOW())
     ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()`,
    [val, val],
  )

  const maxStr = String(nextMax)
  await execute(
    `INSERT INTO system_settings (setting_key, setting_value, updated_at)
     VALUES ('max_squad_size', ?, NOW())
     ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()`,
    [maxStr, maxStr],
  )

  return { open: nextOpen, maxSquadSize: nextMax }
}

export async function requireClubSquadCapacity(
  clubId: number,
  excludePlayerId?: number,
  clubLabel = 'This club',
): Promise<void> {
  const { maxSquadSize } = await getTransferWindowSettings()
  const row = await queryOne<{ cnt: number }>(
    excludePlayerId
      ? 'SELECT COUNT(*) AS cnt FROM players WHERE club_id = ? AND id <> ?'
      : 'SELECT COUNT(*) AS cnt FROM players WHERE club_id = ?',
    excludePlayerId ? [clubId, excludePlayerId] : [clubId],
  )
  const currentCount = Number(row?.cnt ?? 0)
  if (currentCount >= maxSquadSize) {
    throw Object.assign(
      new Error(
        `${clubLabel} has reached the maximum squad limit of ${maxSquadSize} players (${currentCount}/${maxSquadSize}).`,
      ),
      { status: 400 },
    )
  }
}


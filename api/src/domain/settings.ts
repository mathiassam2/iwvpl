/**
 * League system settings (e.g. manager passcode, registration controls).
 */

import { execute, queryAll } from '../db.js'

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

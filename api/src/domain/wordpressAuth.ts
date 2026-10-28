/**
 * WordPress Legacy User Authentication and Auto-Migration.
 *
 * Allows users registered on the original WordPress website (iwvpl.asia)
 * to seamlessly log into the Beta platform (beta.iwvpl.asia).
 * Upon first successful login, the user account is auto-migrated into the v2
 * users table and their password hash is upgraded from phpass to secure bcrypt.
 */

import { config } from '../config.js'
import { clubSlug } from './slug.js'
import { execute, queryAll, queryOne } from '../db.js'
import {
  type AccountUser,
  type Role,
  hashPassword,
  verifyPassword,
} from './auth.js'

interface WpUserRow {
  ID: number
  user_login: string
  user_pass: string
  user_nicename: string
  user_email: string
  display_name: string
}

interface WpMetaRow {
  meta_key: string
  meta_value: string
}

export async function findAndMigrateWordPressUser(
  identifier: string,
  secret: string
): Promise<AccountUser | null> {
  if (!config.wordpress.enabled) return null

  const wpDb = config.wordpress.dbName
  const wpPrefix = config.wordpress.tablePrefix
  const lower = identifier.trim().toLowerCase()

  try {
    // 1. Look up user in WordPress users table
    const wpUser = await queryOne<WpUserRow>(
      `SELECT ID, user_login, user_pass, user_nicename, user_email, display_name
         FROM \`${wpDb}\`.\`${wpPrefix}users\`
        WHERE LOWER(user_email) = ? OR LOWER(user_login) = ?
        LIMIT 1`,
      [lower, lower]
    )

    if (!wpUser) return null

    // 2. Verify password against WordPress stored hash (supports phpass $P$/$H$, $wp, or bcrypt)
    const valid = await verifyPassword(secret, wpUser.user_pass)
    if (!valid) return null

    // 3. Password matched! Retrieve user metadata
    const metaRows = await queryAll<WpMetaRow>(
      `SELECT meta_key, meta_value
         FROM \`${wpDb}\`.\`${wpPrefix}usermeta\`
        WHERE user_id = ?
          AND meta_key IN (
            '${wpPrefix}capabilities',
            'nickname',
            'first_name',
            'last_name',
            'gamertag',
            'ea_gamertag'
          )`,
      [wpUser.ID]
    )

    const meta = new Map(metaRows.map((r) => [r.meta_key, r.meta_value]))

    // Determine Role
    let role: Role = 'player'
    const caps = meta.get(`${wpPrefix}capabilities`) || ''
    if (caps.includes('administrator') || caps.includes('owner')) {
      role = 'admin'
    } else if (caps.includes('club_manager') || caps.includes('sp_team_manager') || caps.includes('manager')) {
      role = 'club_manager'
    }

    const email = wpUser.user_email.trim().toLowerCase()
    const username = wpUser.user_login.trim()
    const gamertag =
      meta.get('gamertag')?.trim() ||
      meta.get('ea_gamertag')?.trim() ||
      meta.get('nickname')?.trim() ||
      wpUser.user_nicename?.trim() ||
      username

    const displayName =
      wpUser.display_name?.trim() ||
      meta.get('nickname')?.trim() ||
      username

    // 4. Generate modern bcrypt hash
    const bcryptHash = await hashPassword(secret)

    // 5. Check if user already exists in v2 users table
    const existing = await queryOne<{ id: number; role: Role; club_id: number | null }>(
      'SELECT id, role, club_id FROM users WHERE LOWER(email) = ? OR LOWER(username) = ? LIMIT 1',
      [email, username.toLowerCase()]
    )

    let userId: number

    if (existing) {
      userId = existing.id
      // Upgrade password hash and ensure username/display_name are filled
      await execute(
        `UPDATE users
            SET password_hash = ?,
                username = COALESCE(username, ?),
                display_name = COALESCE(display_name, ?),
                is_active = TRUE,
                updated_at = NOW()
          WHERE id = ?`,
        [bcryptHash, username, displayName, userId]
      )
    } else {
      // Insert new migrated user into v2
      await execute(
        `INSERT INTO users
           (username, email, password_hash, display_name, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
        [username, email, bcryptHash, displayName, role]
      )

      const created = await queryOne<{ id: number }>(
        'SELECT id FROM users WHERE LOWER(email) = ?',
        [email]
      )
      if (!created) throw new Error('Could not retrieve migrated user.')
      userId = created.id
    }

    // 6. If player, ensure player row exists and is linked
    if (role === 'player') {
      const existingPlayer = await queryOne<{ id: number }>(
        'SELECT id FROM players WHERE user_id = ? LIMIT 1',
        [userId]
      )
      if (!existingPlayer) {
        // Check if there is an unlinked player row with matching gamertag
        const matchByName = await queryOne<{ id: number }>(
          'SELECT id FROM players WHERE gamertag_key = LOWER(?) AND user_id IS NULL LIMIT 1',
          [gamertag]
        )
        if (matchByName) {
          await execute('UPDATE players SET user_id = ?, updated_at = NOW() WHERE id = ?', [
            userId,
            matchByName.id,
          ])
        } else {
          await execute(
            `INSERT INTO players (gamertag, gamertag_key, slug, is_free_agent, user_id, created_at, updated_at)
             VALUES (?, LOWER(?), ?, TRUE, ?, NOW(), NOW())`,
            [gamertag, gamertag, clubSlug(gamertag), userId]
          )
        }
      }
    }

    // 7. Fetch full AccountUser row
    const userRow = await queryOne<AccountUser>(
      `SELECT u.id, u.email, u.display_name, u.role, u.club_id,
              p.id AS player_id, p.gamertag
         FROM users u
         LEFT JOIN players p ON p.user_id = u.id
        WHERE u.id = ?`,
      [userId]
    )

    return userRow || null
  } catch (err) {
    // If WordPress database is not accessible (e.g. in local development), log and continue
    console.warn('WordPress user auto-migration check skipped:', err instanceof Error ? err.message : err)
    return null
  }
}

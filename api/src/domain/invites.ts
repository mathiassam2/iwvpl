/**
 * Manager Invite Tokens & Verification.
 *
 * Provides single-use invite codes that can optionally be bound to a specific
 * captain email and/or club name, preventing passcode leaks and unauthorized sign-ups.
 */

import { execute, queryAll, queryOne } from '../db.js'

export interface ManagerInvite {
  id: number
  code: string
  target_email: string | null
  target_club_name: string | null
  notes: string | null
  created_by_user_id: number | null
  is_used: boolean
  used_by_user_id: number | null
  used_at: string | null
  created_at: string
  updated_at: string
  used_by_name?: string | null
  used_by_email?: string | null
}

async function ensureInvitesTable(): Promise<void> {
  try {
    await execute(`CREATE TABLE IF NOT EXISTS manager_invites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(64) NOT NULL UNIQUE,
      target_email VARCHAR(190) NULL,
      target_club_name VARCHAR(120) NULL,
      notes VARCHAR(255) NULL,
      created_by_user_id INT NULL,
      is_used BOOLEAN NOT NULL DEFAULT FALSE,
      used_by_user_id INT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_invites_code (code),
      INDEX idx_invites_used (is_used),
      INDEX idx_invites_email (target_email)
    ) DEFAULT CHARSET=utf8mb4`)
  } catch (err) {
    console.error('Could not ensure manager_invites table:', err)
  }
}

export function generateRandomInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = 'MGR-'
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  result += '-'
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export async function listManagerInvites(): Promise<ManagerInvite[]> {
  try {
    await ensureInvitesTable()
    const rows = await queryAll<any>(
      `SELECT i.*, u.display_name AS used_by_name, u.email AS used_by_email
         FROM manager_invites i
         LEFT JOIN users u ON u.id = i.used_by_user_id
        ORDER BY i.is_used ASC, i.created_at DESC`
    )
    return rows.map((r) => ({
      ...r,
      is_used: Boolean(r.is_used),
    }))
  } catch {
    return []
  }
}

export async function createManagerInvite(params: {
  code?: string
  targetEmail?: string | null
  targetClubName?: string | null
  notes?: string | null
  createdByUserId?: number | null
}): Promise<ManagerInvite> {
  await ensureInvitesTable()
  const code = (params.code?.trim() || generateRandomInviteCode()).toUpperCase()
  const targetEmail = params.targetEmail?.trim().toLowerCase() || null
  const targetClubName = params.targetClubName?.trim() || null
  const notes = params.notes?.trim() || null

  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM manager_invites WHERE code = ?',
    [code]
  )
  if (existing) {
    throw Object.assign(new Error(`Invite code "${code}" already exists.`), { status: 400 })
  }

  await execute(
    `INSERT INTO manager_invites
       (code, target_email, target_club_name, notes, created_by_user_id, is_used, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, FALSE, NOW(), NOW())`,
    [code, targetEmail, targetClubName, notes, params.createdByUserId ?? null]
  )

  const row = await queryOne<ManagerInvite>(
    'SELECT * FROM manager_invites WHERE code = ?',
    [code]
  )
  if (!row) throw new Error('Could not retrieve created invite.')
  return row
}

export async function deleteManagerInvite(id: number): Promise<boolean> {
  await ensureInvitesTable()
  const affected = await execute('DELETE FROM manager_invites WHERE id = ?', [id])
  return affected > 0
}

export interface VerificationResult {
  valid: boolean
  error?: string
  invite?: {
    id: number
    code: string
    targetEmail: string | null
    targetClubName: string | null
  }
}

export async function verifyManagerInvite(
  code: string,
  candidateEmail?: string,
  candidateClubName?: string
): Promise<VerificationResult> {
  await ensureInvitesTable()
  const cleanCode = code.trim().toUpperCase()
  if (!cleanCode) {
    return { valid: false, error: 'Invite code is required.' }
  }

  const invite = await queryOne<ManagerInvite>(
    'SELECT * FROM manager_invites WHERE code = ?',
    [cleanCode]
  )

  if (!invite) {
    return { valid: false, error: 'That invite code is not recognized.' }
  }

  if (Boolean(invite.is_used)) {
    return { valid: false, error: 'That invite code has already been used.' }
  }

  if (candidateEmail && invite.target_email) {
    if (candidateEmail.trim().toLowerCase() !== invite.target_email.toLowerCase()) {
      return {
        valid: false,
        error: `This invite code is restricted to email: ${invite.target_email}`,
      }
    }
  }

  if (candidateClubName && invite.target_club_name) {
    if (candidateClubName.trim().toLowerCase() !== invite.target_club_name.toLowerCase()) {
      return {
        valid: false,
        error: `This invite code is restricted to club: ${invite.target_club_name}`,
      }
    }
  }

  return {
    valid: true,
    invite: {
      id: invite.id,
      code: invite.code,
      targetEmail: invite.target_email,
      targetClubName: invite.target_club_name,
    },
  }
}

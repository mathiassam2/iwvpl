#!/usr/bin/env node
/**
 * Deploy the built public SPA (`dist/`), admin SPA (`admin/dist/`), and API
 * (`api/dist/` + `api/migrations/`) to the production `iwvpl.asia` Node.js app on
 * Rumahweb cPanel.
 *
 * Usage:
 *   CPANEL_USER=iwvq7995 CPANEL_PASS='...' node scripts/deploy-cpanel.mjs
 */

import { mkdirSync, writeFileSync, cpSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const user = process.env.CPANEL_USER || 'iwvq7995'
const pass = process.env.CPANEL_PASS || 'Z^hi7%p#s!h033iG'
if (!pass) {
  console.error('Missing CPANEL_PASS environment variable.')
  process.exit(1)
}

const repoRoot = resolve(import.meta.dirname, '..')
const stageDir = join(tmpdir(), 'iwvpl_v2_cpanel_stage')
const archivePath = join(tmpdir(), 'iwvpl_v2_bundle.tar.gz')

async function loginCpanel() {
  const loginRes = await fetch('https://iwvpl.asia:2083/login/?login_only=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ user, pass }).toString(),
  })
  const loginJson = await loginRes.json()
  if (!loginJson?.security_token) {
    throw new Error('Could not authenticate with cPanel.')
  }
  const cookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : []
  const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ')
  return { cookieHeader, token: loginJson.security_token }
}

async function callApi2(session, mod, func, params = {}) {
  const qs = new URLSearchParams({
    cpanel_jsonapi_apiversion: '2',
    cpanel_jsonapi_module: mod,
    cpanel_jsonapi_func: func,
    ...params,
  }).toString()
  const url = `https://iwvpl.asia:2083${session.token}/json-api/cpanel?${qs}`
  const r = await fetch(url, { headers: { Cookie: session.cookieHeader } })
  return r.json()
}

async function callCloudlinux(session, method, params = {}) {
  const url = `https://iwvpl.asia:2083${session.token}/3rdparty/cloudlinux/cloudlinux-selector.cgi?cgiaction=sendRequest`
  const body = new URLSearchParams({
    command: 'cloudlinux-selector',
    method,
    'params[interpreter]': 'nodejs',
  })
  for (const [k, v] of Object.entries(params)) {
    body.set(`params[${k}]`, v)
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Cookie: session.cookieHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
  return r.json()
}

async function main() {
  console.log('1. Building api, admin, and public web bundles...')
  execSync('npm --prefix api run build', { cwd: repoRoot, stdio: 'inherit' })
  execSync('npm --prefix admin run build', { cwd: repoRoot, stdio: 'inherit' })
  execSync('npm run build', {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, BASE_PATH: '/' },
  })

  console.log('2. Packaging deployment archive...')
  rmSync(stageDir, { recursive: true, force: true })
  rmSync(archivePath, { force: true })
  mkdirSync(stageDir, { recursive: true })

  cpSync(join(repoRoot, 'dist'), join(stageDir, 'dist'), { recursive: true })

  mkdirSync(join(stageDir, 'admin'), { recursive: true })
  cpSync(join(repoRoot, 'admin', 'dist'), join(stageDir, 'admin', 'dist'), { recursive: true })

  // Stamp cache-buster on HTML script and stylesheet tags
  const v = Date.now()
  for (const htmlFile of [join(stageDir, 'dist', 'index.html'), join(stageDir, 'admin', 'dist', 'index.html')]) {
    if (existsSync(htmlFile)) {
      let html = readFileSync(htmlFile, 'utf8')
      html = html.replace(/(src|href)="(\/assets\/[^"]+\.(?:js|css))"/g, `$1="$2?v=${v}"`)
      writeFileSync(htmlFile, html)
    }
  }
  mkdirSync(join(stageDir, 'src', 'data'), { recursive: true })
  cpSync(
    join(repoRoot, 'src', 'data', 'site_data.json'),
    join(stageDir, 'src', 'data', 'site_data.json'),
  )
  mkdirSync(join(stageDir, 'api'), { recursive: true })
  cpSync(join(repoRoot, 'api', 'dist'), join(stageDir, 'api', 'dist'), { recursive: true })
  cpSync(join(repoRoot, 'api', 'migrations'), join(stageDir, 'api', 'migrations'), {
    recursive: true,
  })
  if (existsSync(join(repoRoot, 'api', '.env.production'))) {
    cpSync(join(repoRoot, 'api', '.env.production'), join(stageDir, '.env'))
    cpSync(join(repoRoot, 'api', '.env.production'), join(stageDir, 'api', '.env'))
  }

  const apiPkg = JSON.parse(readFileSync(join(repoRoot, 'api', 'package.json'), 'utf8'))
  writeFileSync(
    join(stageDir, 'package.json'),
    JSON.stringify(
      {
        name: 'iwvpl-v2-cpanel',
        version: '2.0.0',
        private: true,
        type: 'module',
        main: 'app.cjs',
        scripts: { start: 'node app.cjs' },
        dependencies: apiPkg.dependencies,
      },
      null,
      2,
    ),
  )
  writeFileSync(
    join(stageDir, 'app.cjs'),
    `import('./api/dist/server.js').catch((err) => {\n  console.error('Failed to boot IWVPL server:', err);\n  process.exit(1);\n});\n`,
  )

  execSync(`tar -czf "${archivePath}" -C "${stageDir}" .`, { stdio: 'inherit' })

  console.log('3. Uploading and extracting on cPanel...')
  const session = await loginCpanel()
  const fileBuffer = readFileSync(archivePath)
  const form = new FormData()
  form.append('dir', '/home/iwvq7995/iwvpl_v2_app')
  form.append('overwrite', '1')
  form.append(
    'file-1',
    new Blob([fileBuffer], { type: 'application/gzip' }),
    'iwvpl_v2_bundle.tar.gz',
  )

  const upRes = await fetch(
    `https://iwvpl.asia:2083${session.token}/execute/Fileman/upload_files`,
    {
      method: 'POST',
      headers: { Cookie: session.cookieHeader },
      body: form,
    },
  )
  if (!upRes.ok) throw new Error(`Upload failed (${upRes.status})`)

  await callApi2(session, 'Fileman', 'fileop', {
    op: 'extract',
    sourcefiles: '/home/iwvq7995/iwvpl_v2_app/iwvpl_v2_bundle.tar.gz',
    destfiles: '/home/iwvq7995/iwvpl_v2_app',
    doubledecode: '0',
  })
  await callApi2(session, 'Fileman', 'fileop', {
    op: 'unlink',
    sourcefiles: '/home/iwvq7995/iwvpl_v2_app/iwvpl_v2_bundle.tar.gz',
  })

  console.log('4. Restarting Passenger Node.js app...')
  const restart = await callCloudlinux(session, 'restart', { 'app-root': 'iwvpl_v2_app' })
  console.log('Restart result:', restart)

  rmSync(stageDir, { recursive: true, force: true })
  rmSync(archivePath, { force: true })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

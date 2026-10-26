# Deployment Guide: beta.iwvpl.asia (cPanel / Passenger)

This guide documents the full deployment process for **IWVPL v2** to the live beta environment at [https://beta.iwvpl.asia](https://beta.iwvpl.asia).

---

## 1. Architecture Overview

* **Host**: Rumahweb cPanel (`https://iwvpl.asia:2083`)
* **Live Beta URL**: [https://beta.iwvpl.asia](https://beta.iwvpl.asia)
* **cPanel Username**: `iwvq7995`
* **App Directory on Server**: `/home/iwvq7995/iwvpl_v2_app`
* **Runtime**: Node.js 20+ managed via **CloudLinux / Phusion Passenger**
* **Entry point**: `app.cjs` in `/home/iwvq7995/iwvpl_v2_app`, which imports `./api/dist/server.js`

### What is served:
1. **Public SPA**: `/*` served from `dist/` (built with `BASE_PATH=/`).
2. **Admin SPA**: `/admin/*` served from `admin/dist/` (guarded by HTTP basic auth).
3. **Backend API**: `/api/*` handled by the Express server compiled from `api/src/`.
4. **Database & Migrations**: TiDB Cloud MySQL. `api/migrations/` are applied automatically on boot (`MIGRATE_ON_BOOT=true`).

> [!NOTE]
> The server's persistent configuration lives in `/home/iwvq7995/iwvpl_v2_app/api/.env` on cPanel. The deploy script deliberately never overwrites `.env`.

---

## 2. Prerequisites on Any Machine

Ensure the machine (or agent environment) has:
1. **Node.js 20+** and **npm**
2. **`tar` utility** in `%PATH%` / `$PATH` (built-in on Windows 10/11, macOS, and Linux)
3. Installed dependencies across all workspaces:
   ```bash
   npm install
   npm --prefix admin install
   npm --prefix api install
   ```

---

## 3. How to Deploy (One-Command Deployment)

The deployment script [`scripts/deploy-cpanel.mjs`](file:///d:/IWVPL_v2/scripts/deploy-cpanel.mjs) handles the entire pipeline:
1. Runs `npm --prefix api run build` (builds TypeScript API into `api/dist/`).
2. Runs `npm --prefix admin run build` (builds Vite admin SPA into `admin/dist/`).
3. Runs `npm run build` with `BASE_PATH=/` (builds Vite public SPA into `dist/`).
4. Stages `dist/`, `admin/dist/`, `api/dist/`, `api/migrations/`, `site_data.json`, and `app.cjs` into a staging folder.
5. Archives into `iwvpl_v2_bundle.tar.gz`.
6. Authenticates with cPanel API (`https://iwvpl.asia:2083`).
7. Uploads and extracts the bundle into `/home/iwvq7995/iwvpl_v2_app`.
8. Calls CloudLinux selector to **restart the Passenger Node.js application**.

### Execution Commands by Shell

Provide your cPanel password via the `CPANEL_PASS` environment variable:

#### Windows PowerShell:
```powershell
$env:CPANEL_USER = "iwvq7995"
$env:CPANEL_PASS = "<YOUR_CPANEL_PASSWORD>"
npm run deploy:beta
```

#### Linux / macOS / Bash:
```bash
CPANEL_USER=iwvq7995 CPANEL_PASS='<YOUR_CPANEL_PASSWORD>' npm run deploy:beta
```

#### Windows Command Prompt (cmd.exe):
```cmd
set CPANEL_USER=iwvq7995
set CPANEL_PASS=<YOUR_CPANEL_PASSWORD>
npm run deploy:beta
```

---

## 4. Verification Checklist After Deploy

After the script finishes with `Restart result: { result: 'success' ... }`:

1. **Public Site**: Open [https://beta.iwvpl.asia](https://beta.iwvpl.asia)
   - Verify layout, hero carousel, and assets load without 404s.
2. **API Status**: Open [https://beta.iwvpl.asia/api/divisions](https://beta.iwvpl.asia/api/divisions)
   - Verify it returns the active divisions as JSON.
3. **Admin Dashboard**: Open [https://beta.iwvpl.asia/admin](https://beta.iwvpl.asia/admin)
   - Log in using admin credentials to confirm admin SPA is responsive.

---

## 5. Instructions for Future AI Agents

When instructed to *"deploy changes to beta"* or *"deploy to cPanel"*:
1. Ask the user for `CPANEL_PASS` if it is not already set in the environment.
2. Verify that all TypeScript checks and builds pass:
   ```bash
   npm run build
   npm --prefix api run build
   npm --prefix admin run build
   ```
3. Execute the deploy script using Node:
   ```bash
   CPANEL_USER=iwvq7995 CPANEL_PASS='<PROVIDED_PASSWORD>' npm run deploy:beta
   ```
4. Confirm that the script exits with code 0 and reports `Restart result: success`.

Purpose
This document describes how to deploy and rollback the Google Apps Script web app that accepts archive syncs from the Roulette Dashboard.

Files
- google-apps-script/Code.gs — current Apps Script source (also mirrored in Apps Script editor).
- google-apps-script/Code.gs.backup-<timestamp> — local backup created before edits.
- google-apps-script/Code.gs.updated-<timestamp> — ready-to-paste updated script.

Deploy steps (safe)
1. In the Apps Script editor (bound to the project/spreadsheet) save the current state as a version:
   File → Manage versions → Save New Version — label it “pre-freddy-tables” (or similar).
2. Paste the updated Code.gs (if not already present) and Save.
3. Run the function upgradeSchema() from the editor:
   - This will create or update the new sheets and headers without rotating the sync token.
   - Check View → Executions/Logs for success ("Roulette Sheets schema upgraded...").
4. Deploy:
   - Manage deployments → choose the existing Web App → Edit → select the newly saved version → Update.
5. Verify:
   - From the dashboard, trigger “Sync pending sessions” or run the provided test POST (example below).
   - Confirm the _Sync Log contains the requestId and that "Freddy Sessions" and "Freddy Steps" contain the rows.

Test (PowerShell example — replace <URL> and <TOKEN>)
$payload = @{ token = '<TOKEN>'; requestId = 'test-123'; sessionId = 'sess-123'; tables = @{ 'Freddy Sessions' = @([array of values]); 'Freddy Steps' = @([array of values]) } } | ConvertTo-Json -Depth 10
Invoke-RestMethod -Uri '<URL>' -Method Post -Body $payload -ContentType 'application/json'

Rollback (fast)
- In the Apps Script editor: Manage deployments → Edit deployment → pick the previous version (pre-freddy-tables) → Update. Or paste the local backup google-apps-script/Code.gs.backup-<timestamp> back into the editor and redeploy as a new version.
- If anything else is wrong, use the local backup file to restore.

Security notes
- Never store ROULETTE_SYNC_TOKEN in repo. The token must live only in Script Properties.
- Do not paste full spreadsheets into public commits.

Suggested commit/PR text
- Commit subject (≤72 chars): fix: add Freddy Sessions & Freddy Steps support to Apps Script
- Commit body:
Added TABLES entries for "Freddy Sessions" and "Freddy Steps" to google-apps-script/Code.gs so the Apps Script web app accepts archives produced by the dashboard. Included local backups:
- google-apps-script/Code.gs.backup-<timestamp>
- google-apps-script/Code.gs.updated-<timestamp>

Also updated README with deployment & testing notes. Running upgradeSchema() and updating the deployment required to apply the change. No tokens were added to the repo.


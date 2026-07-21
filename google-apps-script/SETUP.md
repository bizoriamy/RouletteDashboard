# Google Apps Script bridge setup

Target Sheet: https://docs.google.com/spreadsheets/d/1HxkVoNdUIAP0TE2E_RBvw1Sg6aARbgypbUNRAyMJSdw/edit

1. Open the Sheet and choose **Extensions > Apps Script**.
2. Replace the editor contents with `Code.gs` from this folder and save.
3. Select `setup` and press **Run** once. Approve access to this Sheet.
4. Open the execution log and securely copy the value after `ROULETTE_SYNC_TOKEN=`.
5. Choose **Deploy > New deployment > Web app**.
6. Set **Execute as** to **Me** and access to **Anyone**. The token still protects writes.
7. Deploy, approve the prompt, and copy the `/exec` URL.
8. Do not share the sync token. It permits writes to the five history tabs.

The dashboard connection needs the `/exec` URL and token. It will send `text/plain` JSON to avoid browser preflight problems. Every payload carries a unique request ID; `_Sync Log` prevents the same request from being appended twice.

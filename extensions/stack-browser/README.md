# Stack browser extension

Minimal Chrome extension (Manifest V3) to sign in with **Google** (via Supabase), pick a **workspace**, create workspaces, and **import the current tab as a PDF** into Stack (same upload API as the web app).

## Setup

1. **Environment**

   ```bash
   cd extensions/stack-browser
   cp .env.example .env
   ```

   Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL` (same values as the Stack frontend).

2. **Supabase Auth**

   - Enable **Google** provider in Supabase → Authentication → Providers.
   - Under **URL configuration → Redirect URLs**, add the URL from Chrome’s identity API:

     ```js
     // In extension DevTools console (after loading unpacked build once):
     chrome.identity.getRedirectURL()
     ```

     It looks like `https://<something>.chromiumapp.org/`. Add that exact URL to Redirect URLs.

3. **CORS (production API)**

   If the API uses `CORS_ORIGIN`, add your extension origin:

   `chrome-extension://<EXTENSION_ID>`

   (Load the unpacked extension once to see the ID in `chrome://extensions`.)

   In local dev, the Stack API usually allows any origin when `CORS_ORIGIN` is unset.

4. **Build & load**

   ```bash
   npm install
   npm run build
   ```

   In Chrome: **Extensions → Load unpacked** → choose `extensions/stack-browser/dist`.

## Permissions

- **identity** — Google OAuth via `chrome.identity.launchWebAuthFlow`.
- **activeTab** + **debugger** — `Page.printToPDF` on the active tab (Chrome’s print-to-PDF pipeline).
- **host_permissions** — call your Stack API and Supabase over HTTPS/localhost.

## UX notes

- First **Import this page as PDF** may prompt for **debugger** access (Chrome security).
- Some internal `chrome://` pages cannot be captured; use a normal web tab.
- Upload uses multipart field `file` and optional `?workspaceId=` — same as the main app.

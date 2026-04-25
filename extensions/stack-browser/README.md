# Stack browser extension

Chrome extension (Manifest V3) to sign in with **Google** (via Supabase), pick or create a **workspace**, and **import the current tab as a PDF** into Stack (same upload API as the web app). The popup uses Tailwind v4 + Radix Themes + Mona Sans so it matches the SPA visually — same cloud / Google brand assets, same neutral palette, same button shapes.

| Tech | Badge |
|------|--------|
| Runtime | ![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black) ![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white) |
| Build | ![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white) |
| UI | ![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white) ![Radix Themes](https://img.shields.io/badge/Radix_Themes-3-161618) |
| Auth / API | ![Supabase](https://img.shields.io/badge/Supabase-js-3ECF8E?logo=supabase&logoColor=black) |

## Setup

1. **Environment**

   ```bash
   cd extensions/stack-browser
   cp .env.example .env
   ```

   Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL` (same values as the Stack frontend).

2. **Supabase Auth**

   - Enable **Google** provider in Supabase → Authentication → Providers.
   - Under **URL configuration → Redirect URLs**, add the URL from Chrome's identity API:

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
   npm run build       # one-shot Vite build → dist/
   npm run dev         # Vite build --watch for active development
   npm run typecheck
   ```

   In Chrome: **Extensions → Load unpacked** → choose `extensions/stack-browser/dist`.

## Permissions

- **identity** — Google OAuth via `chrome.identity.launchWebAuthFlow`.
- **activeTab** + **debugger** — `Page.printToPDF` on the active tab (Chrome's print-to-PDF pipeline).
- **host_permissions** — call your Stack API and Supabase over HTTPS/localhost.

## UX notes

- First **Import this page as PDF** may prompt for **debugger** access (Chrome security).
- Some internal `chrome://` pages cannot be captured; use a normal web tab.
- Upload uses multipart field `file` and optional `?workspaceId=` — same as the main app.
- The popup is fixed at 360px and lays out vertically: brand header → workspace picker → inline "new workspace" form → "import this page" action → status banner. Sign-out lives in the header once you are signed in.

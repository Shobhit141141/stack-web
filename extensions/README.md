# Stack — Extensions

Companion clients that live outside the web app. They sign in to the same Supabase project and call the same Stack API as the SPA, so anything they save shows up in your normal workspaces.

| Tech | Badge |
|------|--------|
| Runtime | ![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white) ![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black) ![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white) |
| Build | ![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white) |
| UI | ![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white) ![Radix Themes](https://img.shields.io/badge/Radix_Themes-3-161618) ![Mona Sans](https://img.shields.io/badge/Mona_Sans-variable-111111) |
| Auth | ![Supabase](https://img.shields.io/badge/Supabase-Auth-3ECF8E?logo=supabase&logoColor=black) |

## What ships

| Folder | Purpose |
|--------|---------|
| [`stack-browser/`](./stack-browser) | Chrome MV3 popup. Sign in with Google, pick or create a workspace, **save the current tab as a PDF** into Stack via the same upload API as the web app. Shares the frontend's design language (Tailwind v4, Radix Themes "gray" theme, Mano Sans, cloud / Google brand assets). |

## Major behaviors

- **Sign in** — Google OAuth via `chrome.identity.launchWebAuthFlow`; the resulting Supabase session is reused for every API call.
- **Workspace picker** — Lists your workspaces, lets you create one inline, and remembers the last selection while the popup is open.
- **Save tab as PDF** — Uses Chrome's `Page.printToPDF` (debugger pipeline) on the active tab and uploads to `/file?workspaceId=…`, the same endpoint the web Uppy dashboard uses.
- **Status banners** — Inline success / error banners for sign-in, workspace creation and upload, matching the SPA's tone (no toast popovers — the popup is too small).

## Setup at a glance

See the per-extension README for full instructions:

- [stack-browser/README.md](./stack-browser/README.md) — env vars, Supabase redirect URL, CORS, build & load-unpacked steps.

## Future plans

- Right-click → "Save link as PDF in Stack" context menu.
- A second extension target (Firefox / Edge) sharing the same source.
- Quick-search popup that hits `/search` against your library.

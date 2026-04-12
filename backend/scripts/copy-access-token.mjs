#!/usr/bin/env node
/**
 * Google OAuth via Supabase → copies session access_token to clipboard.
 * .env: SUPABASE_URL, SUPABASE_ANON_KEY
 * Supabase Redirect URL: http://127.0.0.1:8765/callback (or match OAUTH_LOCAL_PORT)
 */

import "dotenv/config";
import http from "node:http";
import { spawnSync, execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function createMemoryStorage() {
  const m = new Map();
  return {
    getItem: (key) => (m.has(key) ? m.get(key) : null),
    setItem: (key, value) => {
      m.set(key, value);
    },
    removeItem: (key) => {
      m.delete(key);
    },
  };
}

function copyToClipboard(text) {
  if (process.platform === "darwin") {
    const r = spawnSync("pbcopy", { input: text, encoding: "utf8" });
    if (r.status !== 0)
      throw new Error(r.stderr?.toString() || `pbcopy exit ${r.status}`);
    return;
  }
  if (process.platform === "win32") {
    const bom = Buffer.from([0xff, 0xfe]);
    execSync("clip", {
      input: Buffer.concat([bom, Buffer.from(text, "utf16le")]),
    });
    return;
  }
  if (spawnSync("xclip", ["-selection", "clipboard"], { input: text }).status === 0)
    return;
  if (spawnSync("wl-copy", [], { input: text }).status === 0) return;
  throw new Error("Install xclip or wl-clipboard, or use macOS/Windows");
}

function openBrowser(url) {
  if (process.platform === "darwin") {
    spawnSync("open", [url], { stdio: "ignore" });
  } else if (process.platform === "win32") {
    spawnSync("cmd", ["/c", "start", "", url], { stdio: "ignore", shell: false });
  } else {
    spawnSync("xdg-open", [url], { stdio: "ignore" });
  }
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
const callbackPort = Number(process.env.OAUTH_LOCAL_PORT?.trim() || "8765");

if (!supabaseUrl || !anonKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const redirectTo = `http://127.0.0.1:${callbackPort}/callback`;

const supabase = createClient(supabaseUrl, anonKey, {
  auth: {
    storage: createMemoryStorage(),
    flowType: "pkce",
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const TIMEOUT_MS = 10 * 60 * 1000;
let finished = false;
let timeoutId;

function finishOk(server, token) {
  if (finished) return;
  finished = true;
  clearTimeout(timeoutId);
  try {
    copyToClipboard(token);
    console.log(`Copied access token (${token.length} chars).`);
  } catch (e) {
    console.error(e);
    console.log(token);
    process.exitCode = 1;
  }
  server.close(() => process.exit(process.exitCode ?? 0));
}

function finishErr(server, message) {
  if (finished) return;
  finished = true;
  clearTimeout(timeoutId);
  console.error(message);
  server.close(() => process.exit(1));
}

const server = http.createServer(async (req, res) => {
  const base = `http://127.0.0.1:${callbackPort}`;
  let pathname;
  try {
    pathname = new URL(req.url ?? "/", base).pathname;
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  if (pathname !== "/callback") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const u = new URL(req.url ?? "/", base);
  const oauthError = u.searchParams.get("error");
  if (oauthError) {
    const msg =
      u.searchParams.get("error_description") || oauthError;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      `<!DOCTYPE html><meta charset="utf-8"><p>${escapeHtml(msg)}</p>`
    );
    finishErr(server, `OAuth error: ${msg}`);
    return;
  }

  const code = u.searchParams.get("code");
  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<p>Missing code</p>");
    finishErr(server, "Missing ?code=");
    return;
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session?.access_token) {
    const msg = error?.message ?? "No session";
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<p>${escapeHtml(msg)}</p>`);
    finishErr(server, msg);
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<p>OK — token copied. Close this tab.</p>");
  finishOk(server, data.session.access_token);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${callbackPort} in use — set OAUTH_LOCAL_PORT`);
  } else console.error(err);
  process.exit(1);
});

timeoutId = setTimeout(() => {
  if (!finished) {
    finished = true;
    console.error("Timeout (10 min)");
    server.close(() => process.exit(1));
  }
}, TIMEOUT_MS);

server.listen(callbackPort, "127.0.0.1", async () => {
  console.log(redirectTo, "— add to Supabase Redirect URLs");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) {
    console.error(error?.message ?? "No OAuth URL");
    server.close(() => process.exit(1));
    return;
  }
  openBrowser(data.url);
});
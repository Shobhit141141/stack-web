import dns from "node:dns/promises";
import net from "node:net";

import { HttpError } from "../http-error.js";

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === undefined || b === undefined) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1] && net.isIPv4(mapped[1])) {
    return isPrivateIpv4(mapped[1]);
  }
  return false;
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIpv4(ip);
  if (net.isIPv6(ip)) return isPrivateIpv6(ip);
  return true;
}

// Purpose: Validate and sanitize a URL string for safe HTTP fetch (no credentials, only http/https, no localhost/private IPs).
// Ex input: 'https://example.com/doc.pdf'
// Ex output: URL object (throws HttpError for invalid/unsafe inputs)
// it removes credentials and only allows http and https
// it removes localhost and private IPs
// it removes [::1]
// it removes [::]
// it removes [::ffff:127.0.0.1]
// it removes [::ffff:127.0.0.1]
export async function assertUrlSafeForFetch(urlString: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    throw new HttpError(400, "Invalid URL");
  }
  if (u.username || u.password) {
    throw new HttpError(400, "URL must not include credentials");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new HttpError(400, "Only http and https URLs are allowed");
  }
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "[::1]"
  ) {
    throw new HttpError(400, "URL host not allowed");
  }
  if (net.isIPv4(host) || net.isIPv6(host.replace(/^\[|\]$/g, ""))) {
    const raw = host.startsWith("[") ? host.slice(1, -1) : host;
    if (isPrivateIp(raw)) {
      throw new HttpError(400, "URL host not allowed");
    }
    return u;
  }
  const lookup = await dns.lookup(host, { all: false, verbatim: true });
  if (isPrivateIp(lookup.address)) {
    throw new HttpError(400, "URL resolves to a disallowed address");
  }
  return u;
}

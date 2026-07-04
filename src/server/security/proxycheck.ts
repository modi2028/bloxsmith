import "server-only";

/**
 * VPN/proxy detection via proxycheck.io, gated at sign-in. Results are cached
 * per IP for an hour, and every failure path fails OPEN (a broken detection
 * service must never lock real users out).
 *
 * Works keyless at a small free quota; set PROXYCHECK_API_KEY in the env for
 * the bigger free tier (optional, so it isn't part of the validated env).
 */

const cache = new Map<string, { proxy: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function isPrivateIp(ip: string): boolean {
  return (
    ip === "unknown" ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.")
  );
}

export async function isProxyIp(ip: string): Promise<boolean> {
  if (!ip || isPrivateIp(ip)) return false;

  const cached = cache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.proxy;
  if (cache.size > 5000) cache.clear(); // crude bound; entries rebuild cheap

  try {
    const key = process.env.PROXYCHECK_API_KEY;
    const url =
      `https://proxycheck.io/v2/${encodeURIComponent(ip)}?vpn=1&risk=1` +
      (key ? `&key=${encodeURIComponent(key)}` : "");
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return false;
    const data = (await res.json()) as Record<
      string,
      { proxy?: string; risk?: number | string } | string
    >;
    const entry = data[ip];
    const proxy =
      typeof entry === "object" &&
      entry !== null &&
      (entry.proxy === "yes" || Number(entry.risk ?? 0) >= 80);
    cache.set(ip, { proxy, expiresAt: Date.now() + CACHE_TTL_MS });
    return proxy;
  } catch {
    return false;
  }
}

import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { env } from "./env.js";

const blockedV4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^224\./, /^23[2-9]\./, /^24\d\./, /^25\d\./,
];

function isBlockedIp(ip: string) {
  if (isIP(ip) === 4) return blockedV4.some(rule => rule.test(ip));
  const normalized = ip.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isBlockedIp(normalized.slice(7));
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd");
}

export function normalizeDomain(input: string) {
  const domain = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!/^(?=.{4,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(domain)) throw new Error("INVALID_DOMAIN");
  return domain;
}

async function assertPublicDomain(domain: string) {
  const addresses = await dns.lookup(domain, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isBlockedIp(address))) throw new Error("BLOCKED_DESTINATION");
}

async function txt(name: string) {
  return (await dns.resolveTxt(name).catch(() => [])).map(parts => parts.join(""));
}

async function safeFetch(domain: string) {
  let url = new URL(`https://${domain}/`);
  for (let i = 0; i <= env.SCAN_MAX_REDIRECTS; i++) {
    await assertPublicDomain(url.hostname);
    if (url.protocol !== "https:" || url.port) throw new Error("BLOCKED_DESTINATION");
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(env.SCAN_TIMEOUT_MS), headers: { "user-agent": "EjecutyxCyber-Scanner/1.0" } });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    url = new URL(location, url);
  }
  throw new Error("TOO_MANY_REDIRECTS");
}

export async function verifyDomain(domain: string, token: string) {
  const records = await txt(`_ejecutyx.${domain}`);
  return records.includes(`ejecutyx-verification=${token}`);
}

export async function scanDomain(domain: string) {
  const [rootTxt, dmarcTxt, website] = await Promise.all([
    txt(domain), txt(`_dmarc.${domain}`), safeFetch(domain).catch(() => null),
  ]);
  const https = Boolean(website && website.status < 500);
  const spf = rootTxt.some(value => value.toLowerCase().startsWith("v=spf1"));
  const dmarc = dmarcTxt.some(value => value.toLowerCase().startsWith("v=dmarc1"));
  const securityHeaders = website ? ["strict-transport-security", "content-security-policy", "x-content-type-options"].filter(name => website.headers.has(name)).length : 0;
  const score = 40 + (https ? 20 : 0) + (spf ? 15 : 0) + (dmarc ? 15 : 0) + Math.min(securityHeaders * 3, 10);
  return { score, checks: { https, spf, dmarc, securityHeaders }, scannedAt: new Date().toISOString() };
}

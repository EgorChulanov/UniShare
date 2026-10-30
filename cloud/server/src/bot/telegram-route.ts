// Some hosting networks (e.g. Yandex Cloud) block the address that DNS returns
// for api.telegram.org while other Telegram front-ends still answer with a
// valid api.telegram.org certificate. This agent can pin such an address;
// TLS still verifies the certificate against the real host name.
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import https from "node:https";
import { config } from "../config";
import { probeAddresses, probeHost } from "../lib/netprobe";

const API_HOST = "api.telegram.org";
const FALLBACK_IPS = (process.env.TELEGRAM_API_FALLBACK_IPS ?? "149.154.167.220,149.154.167.99,149.154.175.50,149.154.175.100,91.108.56.130")
  .split(",")
  .map((ip) => ip.trim())
  .filter(Boolean);

let pinnedAddress: string | null = process.env.TELEGRAM_API_IP?.trim() || null;

export function telegramRoute(): string {
  if (config.telegram.apiRoot) return "relay";
  return pinnedAddress ? `pinned ${pinnedAddress}` : "dns";
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function pinnedLookup(hostname: string, options: { all?: boolean }, callback: LookupCallback): void {
  if (pinnedAddress && hostname === API_HOST) {
    if (options.all) callback(null, [{ address: pinnedAddress, family: 4 }]);
    else callback(null, pinnedAddress, 4);
    return;
  }
  dnsLookup(hostname, options as never, callback as never);
}

export const telegramAgent = new https.Agent({
  keepAlive: true,
  lookup: pinnedLookup as unknown as https.AgentOptions["lookup"],
});

/**
 * Chooses how to reach the Bot API: DNS when it works, otherwise the first
 * reachable fallback Telegram address. Returns the pinned address, if any.
 */
export async function selectTelegramRoute(log: (message: string) => void): Promise<string | null> {
  if (config.telegram.apiRoot || process.env.TELEGRAM_API_IP) return pinnedAddress;
  const direct = await probeHost(API_HOST);
  if (direct.addresses.some((address) => address.ok)) {
    pinnedAddress = null;
    return null;
  }
  return pinFallbackRoute(log);
}

/** Pins the first fallback Telegram address that completes a TLS handshake. */
export async function pinFallbackRoute(log: (message: string) => void): Promise<string | null> {
  if (config.telegram.apiRoot || process.env.TELEGRAM_API_IP) return null;
  const alternatives = await probeAddresses(API_HOST, FALLBACK_IPS.filter((ip) => ip !== pinnedAddress));
  const working = alternatives.addresses.find((address) => address.ok);
  if (!working) return null;
  pinnedAddress = working.address;
  log(`api.telegram.org unreachable via DNS; using ${pinnedAddress}`);
  return pinnedAddress;
}

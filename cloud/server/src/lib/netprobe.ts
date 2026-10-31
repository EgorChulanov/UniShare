// Connectivity probe for operators: resolves a host and tries a TLS handshake
// with every address, so /health can tell DNS, IPv6 and blocking issues apart.
import { lookup } from "node:dns/promises";
import { connect } from "node:tls";

export interface ProbeResult {
  host: string;
  addresses: { address: string; family: number; ok: boolean; ms: number; error?: string }[];
  dnsError?: string;
}

function tryTls(host: string, address: string, timeoutMs: number): Promise<{ ok: boolean; ms: number; error?: string }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = connect({ host: address, port: 443, servername: host, timeout: timeoutMs });
    const done = (ok: boolean, error?: string) => {
      socket.destroy();
      resolve({ ok, ms: Date.now() - started, error });
    };
    socket.once("secureConnect", () => done(true));
    socket.once("timeout", () => done(false, "timeout"));
    socket.once("error", (error: NodeJS.ErrnoException) => done(false, error.code ?? error.message));
  });
}

export async function probeHost(host: string, timeoutMs = 5000): Promise<ProbeResult> {
  try {
    const records = await lookup(host, { all: true });
    const addresses = await Promise.all(
      records.map(async (record) => ({ address: record.address, family: record.family, ...(await tryTls(host, record.address, timeoutMs)) })),
    );
    return { host, addresses };
  } catch (error) {
    return { host, addresses: [], dnsError: (error as NodeJS.ErrnoException).code ?? (error as Error).message };
  }
}

/** Telegram-owned ranges only, so the operator probe cannot be used to scan other hosts. */
export function isTelegramAddress(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return (parts[0] === 149 && parts[1] === 154 && parts[2] >= 160 && parts[2] <= 175) || (parts[0] === 91 && parts[1] === 108);
}

/** TLS handshake with explicit Telegram addresses using the given SNI host. */
export async function probeAddresses(host: string, ips: string[], timeoutMs = 5000): Promise<ProbeResult> {
  const addresses = await Promise.all(
    ips.filter(isTelegramAddress).slice(0, 12).map(async (address) => ({ address, family: 4, ...(await tryTls(host, address, timeoutMs)) })),
  );
  return { host, addresses };
}

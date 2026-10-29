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

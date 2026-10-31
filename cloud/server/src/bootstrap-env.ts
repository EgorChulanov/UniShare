// Optional configuration delivered through Yandex Cloud instance metadata
// (attribute "unishare-env", KEY=VALUE lines). Lets operators change settings
// such as RAWG_API_KEY without shell access to the VM. Must not import config.

const METADATA_URL = "http://169.254.169.254/computeMetadata/v1/instance/attributes/unishare-env";

export function parseEnvLines(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

export async function loadRemoteEnv(timeoutMs = 800): Promise<string[]> {
  if (process.env.REMOTE_ENV === "0") return [];
  try {
    const response = await fetch(METADATA_URL, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return [];
    const values = parseEnvLines(await response.text());
    for (const [key, value] of Object.entries(values)) process.env[key] = value;
    const keys = Object.keys(values);
    if (keys.length) console.log(`remote env applied: ${keys.join(", ")}`);
    return keys;
  } catch {
    return [];
  }
}

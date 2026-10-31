// File storage for avatars and chat photos: local disk (single VM) or any
// S3-compatible bucket (Yandex Object Storage, Selectel, VK Cloud, MinIO).
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";
import { config } from "../config";

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  remove(keys: string[]): Promise<void>;
  /** Direct public URL for public objects, or null to serve through the API. */
  publicUrl(key: string): string | null;
}

const CONTENT_TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

function safeKey(key: string): string {
  const cleaned = normalize(key).replace(/^([/\\])+/, "");
  if (cleaned.includes("..") || !/^[A-Za-z0-9/_.-]+$/.test(cleaned)) throw new Error("Invalid storage key");
  return cleaned;
}

class LocalStorage implements Storage {
  private readonly root = resolve(config.storage.localDir);

  async put(key: string, body: Buffer): Promise<void> {
    const path = join(this.root, safeKey(key));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const safe = safeKey(key);
      const body = await readFile(join(this.root, safe));
      const extension = safe.split(".").pop() ?? "";
      return { body, contentType: CONTENT_TYPES[extension] ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }

  async remove(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => rm(join(this.root, safeKey(key)), { force: true, recursive: true })));
  }

  publicUrl(): string | null {
    return null;
  }
}

class S3Storage implements Storage {
  private clientPromise = import("@aws-sdk/client-s3").then((sdk) => ({
    sdk,
    client: new sdk.S3Client({
      endpoint: config.storage.s3Endpoint,
      region: config.storage.s3Region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.storage.s3AccessKey ?? "",
        secretAccessKey: config.storage.s3SecretKey ?? "",
      },
    }),
  }));

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const { sdk, client } = await this.clientPromise;
    await client.send(new sdk.PutObjectCommand({
      Bucket: config.storage.s3Bucket!,
      Key: safeKey(key),
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }));
  }

  async get(key: string): Promise<StoredObject | null> {
    const { sdk, client } = await this.clientPromise;
    try {
      const result = await client.send(new sdk.GetObjectCommand({ Bucket: config.storage.s3Bucket!, Key: safeKey(key) }));
      const bytes = await result.Body?.transformToByteArray();
      if (!bytes) return null;
      return { body: Buffer.from(bytes), contentType: result.ContentType ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }

  async remove(keys: string[]): Promise<void> {
    if (!keys.length) return;
    const { sdk, client } = await this.clientPromise;
    const objects: string[] = [];
    for (const key of keys.map(safeKey)) {
      if (/\.[a-z0-9]+$/i.test(key)) {
        objects.push(key);
        continue;
      }
      // A key without an extension is a folder (e.g. chats/<chatId>).
      let token: string | undefined;
      do {
        const page = await client.send(new sdk.ListObjectsV2Command({
          Bucket: config.storage.s3Bucket!,
          Prefix: `${key}/`,
          ContinuationToken: token,
        }));
        objects.push(...(page.Contents ?? []).map((item) => item.Key!).filter(Boolean));
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    }
    for (let index = 0; index < objects.length; index += 1000) {
      await client.send(new sdk.DeleteObjectsCommand({
        Bucket: config.storage.s3Bucket!,
        Delete: { Objects: objects.slice(index, index + 1000).map((Key) => ({ Key })) },
      }));
    }
  }

  publicUrl(key: string): string | null {
    // Only avatars are public; chat photos are always served through the API.
    if (!config.storage.s3PublicUrl || !key.startsWith("avatars/")) return null;
    return `${config.storage.s3PublicUrl.replace(/\/$/, "")}/${safeKey(key)}`;
  }
}

export const storage: Storage = config.storage.driver === "s3" ? new S3Storage() : new LocalStorage();

/** Detects JPEG/PNG/WebP by magic bytes; anything else is rejected. */
export function detectImage(body: Buffer): { extension: string; contentType: string } | null {
  if (body.length > 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return { extension: "jpg", contentType: "image/jpeg" };
  if (body.length > 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: "png", contentType: "image/png" };
  }
  if (body.length > 12 && body.subarray(0, 4).toString("ascii") === "RIFF" && body.subarray(8, 12).toString("ascii") === "WEBP") {
    return { extension: "webp", contentType: "image/webp" };
  }
  return null;
}

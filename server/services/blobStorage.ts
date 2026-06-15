// Durable blob storage for original uploaded files (Phase 2b — see
// docs/cbo-platform-architecture.md). Wraps Replit Object Storage (GCS-backed),
// so originals survive container recycle and can be re-opened / re-processed.
//
// Graceful degradation: if the package or bucket isn't available (e.g. a local
// dev box without Object Storage), every call no-ops with a logged warning and
// returns null — uploads still work, they just don't get a durable original.

// Bucket created for the COUGAR pilot. Overridable via env for other deploys.
const BUCKET_ID = process.env.BLOB_BUCKET_ID || 'replit-objstore-44719f3e-1340-49bf-979c-cc34ba8316c4';

let clientPromise: Promise<any | null> | null = null;

async function getClient(): Promise<any | null> {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    try {
      const mod: any = await import('@replit/object-storage');
      const Client = mod.Client;
      return new Client({ bucketId: BUCKET_ID });
    } catch (e: any) {
      console.warn(`[blob] Object Storage unavailable (${e?.message || e}). Originals will not be persisted.`);
      return null;
    }
  })();
  return clientPromise;
}

export function blobEnabled(): boolean {
  return clientPromise !== null; // best-effort hint; getClient resolves the real state
}

/** Org-scoped object key. Groups every original under the owning org. */
export function blobKey(orgId: string | null, docId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return `orgs/${orgId || 'unscoped'}/documents/${docId}-${safe}`;
}

/** Store an original file. Returns the key on success, null on failure/disabled. */
export async function putObject(key: string, contents: Buffer): Promise<string | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const res = await client.uploadFromBytes(key, contents);
    if (res && res.ok === false) {
      console.error(`[blob] upload failed for ${key}:`, res.error);
      return null;
    }
    return key;
  } catch (e: any) {
    console.error(`[blob] upload threw for ${key}:`, e?.message || e);
    return null;
  }
}

/** Fetch an original by key. Returns the Buffer, or null on miss/failure. */
export async function getObject(key: string): Promise<Buffer | null> {
  const client = await getClient();
  if (!client) return null;
  try {
    const res = await client.downloadAsBytes(key);
    if (res && res.ok === false) {
      console.error(`[blob] download failed for ${key}:`, res.error);
      return null;
    }
    // The SDK returns { ok, value }, where value is a Buffer or a single-element
    // Buffer[] depending on version — normalize to one Buffer.
    const value = res?.value ?? res;
    if (Array.isArray(value)) return value[0] ?? null;
    return Buffer.isBuffer(value) ? value : null;
  } catch (e: any) {
    console.error(`[blob] download threw for ${key}:`, e?.message || e);
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    await client.delete(key);
  } catch (e: any) {
    console.error(`[blob] delete threw for ${key}:`, e?.message || e);
  }
}

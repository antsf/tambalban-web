import type { Env } from "./env";
import { SITE_URL } from "./site";

/**
 * R2 migration (Phase 4b, specs/d1-migration-plan.md) — replaces Supabase Storage.
 *
 * Public URLs are served through this Worker (`GET /images/:bucket/:key`, routes.ts),
 * NOT R2's own `pub-*.r2.dev` domain. Discovered while testing: that domain got
 * intercepted by an Indonesian carrier's ("Internet Baik" / Telkomsel) content filter,
 * which MITMs the connection with an unrelated expired cert instead of serving the object.
 * Since this app is Indonesia-only, that's not a one-off local-network fluke to shrug off —
 * routing through `tambalban-web.antsf.workers.dev` (a domain already proven reachable)
 * avoids depending on r2.dev being unblocked for every user's carrier.
 *
 * Object key convention mirrors what supabase.ts's uploadImage used: `<uuid>.<ext>`, no
 * directory nesting needed since each bucket is single-purpose (workshops vs avatars).
 */
async function uploadToR2(bucket: R2Bucket, key: string, file: ArrayBuffer, contentType: string): Promise<void> {
  await bucket.put(key, file, { httpMetadata: { contentType } });
}

export async function uploadWorkshopImage(
  env: Env,
  file: ArrayBuffer,
  contentType: string,
  ext: string,
): Promise<string> {
  const key = `${crypto.randomUUID()}.${ext}`;
  await uploadToR2(env.WORKSHOPS_BUCKET, key, file, contentType);
  return `${SITE_URL}/images/workshops/${key}`;
}

export async function uploadAvatarImage(
  env: Env,
  file: ArrayBuffer,
  contentType: string,
  ext: string,
): Promise<string> {
  const key = `${crypto.randomUUID()}.${ext}`;
  await uploadToR2(env.AVATARS_BUCKET, key, file, contentType);
  return `${SITE_URL}/images/avatars/${key}`;
}

import { describe, expect, it, vi } from "vitest";
import { uploadWorkshopImage, uploadAvatarImage } from "./r2";
import type { Env } from "./env";

function fakeBucket() {
  return { put: vi.fn().mockResolvedValue(undefined) } as unknown as R2Bucket;
}

describe("uploadWorkshopImage / uploadAvatarImage", () => {
  it("uploads to the workshops bucket and returns a same-origin /images/workshops/:key URL", async () => {
    const bucket = fakeBucket();
    const env = { WORKSHOPS_BUCKET: bucket } as unknown as Env;
    const file = new Uint8Array([1, 2, 3]).buffer;
    const url = await uploadWorkshopImage(env, file, "image/webp", "webp");
    expect(url).toMatch(/^https:\/\/tambalban-web\.antsf\.workers\.dev\/images\/workshops\/[0-9a-f-]+\.webp$/);
    const [key, body, opts] = vi.mocked(bucket.put).mock.calls[0];
    expect(key).toMatch(/^[0-9a-f-]+\.webp$/);
    expect(body).toBe(file);
    expect(opts).toEqual({ httpMetadata: { contentType: "image/webp" } });
  });

  it("uploads to the avatars bucket, not the workshops bucket", async () => {
    const workshopsBucket = fakeBucket();
    const avatarsBucket = fakeBucket();
    const env = { WORKSHOPS_BUCKET: workshopsBucket, AVATARS_BUCKET: avatarsBucket } as unknown as Env;
    const url = await uploadAvatarImage(env, new Uint8Array([1]).buffer, "image/webp", "webp");
    expect(url).toMatch(/^https:\/\/tambalban-web\.antsf\.workers\.dev\/images\/avatars\/[0-9a-f-]+\.webp$/);
    expect(avatarsBucket.put).toHaveBeenCalled();
    expect(workshopsBucket.put).not.toHaveBeenCalled();
  });
});

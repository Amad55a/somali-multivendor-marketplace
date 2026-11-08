import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { removeVendorFile, saveVendorFile } from "@/lib/media/vendor-files";

function webpChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(8 + data.length + (data.length % 2));
  chunk.set(new TextEncoder().encode(type), 0);
  new DataView(chunk.buffer).setUint32(4, data.length, true);
  chunk.set(data, 8);
  return chunk;
}

function webpFile(chunks: Uint8Array[]): File {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 12);
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, size - 8, true);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  let offset = 12;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new File([bytes], "vendor-logo.webp", { type: "image/webp" });
}

describe("vendor file image validation", () => {
  it("accepts WebP images when metadata chunks precede the dimensions chunk", async () => {
    const dimensions = new Uint8Array(10);
    dimensions[4] = 127;
    dimensions[7] = 127;
    const file = webpFile([
      webpChunk("EXIF", new Uint8Array([1, 2, 3])),
      webpChunk("VP8X", dimensions),
    ]);

    const saved = await saveVendorFile(file, "STORE_LOGO");
    try {
      expect(saved.mimeType).toBe("image/webp");
    } finally {
      await removeVendorFile(saved.storageKey);
    }
  });

  it("reports the supported size bounds for an undersized image", async () => {
    const dimensions = new Uint8Array(10);
    dimensions[4] = 31;
    dimensions[7] = 127;
    const file = webpFile([webpChunk("VP8X", dimensions)]);

    await expect(saveVendorFile(file, "STORE_LOGO")).rejects.toMatchObject({
      code: "INVALID_IMAGE_DIMENSIONS",
      message: expect.stringContaining("at least 64x64"),
    });
  });
});

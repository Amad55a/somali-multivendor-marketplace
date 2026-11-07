import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { AppError } from "@/lib/errors/app-error";

const ROOT = path.join(process.cwd(), ".data", "vendor-files");
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_LICENSE_BYTES = 10 * 1024 * 1024;
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

const allowed = {
  STORE_LOGO: new Set(["image/jpeg", "image/png", "image/webp"]),
  BUSINESS_LICENSE: new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
} as const;

function extension(mimeType: string): string {
  return mimeType === "application/pdf"
    ? ".pdf"
    : mimeType === "image/png"
      ? ".png"
      : mimeType === "image/webp"
        ? ".webp"
        : ".jpg";
}

function contentMatches(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === "application/pdf") return new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/webp") return new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP";
  return false;
}

function imageDimensions(mimeType: string, bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mimeType === "image/png" && bytes.length >= 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mimeType === "image/jpeg") {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1] ?? 0;
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const segmentLength = view.getUint16(offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
      }
      offset += segmentLength;
    }
    return null;
  }
  if (mimeType === "image/webp" && bytes.length >= 30) {
    const chunk = new TextDecoder().decode(bytes.subarray(12, 16));
    if (chunk === "VP8X") {
      const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
      const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
      return { width, height };
    }
    if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f && bytes.length >= 25) {
      const width = 1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8);
      const height = 1 + ((bytes[22]! >> 6) | (bytes[23]! << 2) | ((bytes[24]! & 0x0f) << 10));
      return { width, height };
    }
  }
  return null;
}

function assertImageDimensions(mimeType: string, bytes: Uint8Array) {
  const dimensions = imageDimensions(mimeType, bytes);
  if (
    !dimensions ||
    dimensions.width < 64 ||
    dimensions.height < 64 ||
    dimensions.width > 6000 ||
    dimensions.height > 6000 ||
    dimensions.width * dimensions.height > 25_000_000
  ) {
    throw new AppError("INVALID_IMAGE_DIMENSIONS", 400, "The image dimensions are not supported.");
  }
}

export async function saveVendorFile(
  file: File,
  fileType: "STORE_LOGO" | "BUSINESS_LICENSE",
) {
  const maxBytes = fileType === "STORE_LOGO" ? MAX_LOGO_BYTES : MAX_LICENSE_BYTES;
  if (!allowed[fileType].has(file.type as never) || file.size === 0 || file.size > maxBytes) {
    throw new AppError("INVALID_FILE", 400, "The uploaded file type or size is not allowed.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!contentMatches(file.type, bytes)) {
    throw new AppError("INVALID_FILE_CONTENT", 400, "The uploaded file content does not match its type.");
  }
  if (file.type !== "application/pdf") assertImageDimensions(file.type, bytes);
  const storageKey = `${randomUUID()}${extension(file.type)}`;
  await mkdir(ROOT, { recursive: true });
  await writeFile(path.join(ROOT, storageKey), bytes, { flag: "wx" });
  return {
    storageKey,
    originalName: file.name.slice(0, 255),
    mimeType: file.type,
    sizeBytes: file.size,
  };
}

export async function saveProductImage(file: File) {
  if (
    !new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type) ||
    file.size === 0 ||
    file.size > MAX_PRODUCT_IMAGE_BYTES
  ) {
    throw new AppError("INVALID_FILE", 400, "The uploaded product image type or size is not allowed.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!contentMatches(file.type, bytes)) {
    throw new AppError("INVALID_FILE_CONTENT", 400, "The uploaded file content does not match its type.");
  }
  assertImageDimensions(file.type, bytes);
  const storageKey = `${randomUUID()}${extension(file.type)}`;
  await mkdir(ROOT, { recursive: true });
  await writeFile(path.join(ROOT, storageKey), bytes, { flag: "wx" });
  return {
    storageKey,
    originalName: file.name.slice(0, 255),
    mimeType: file.type,
    sizeBytes: file.size,
  };
}

export async function readVendorFile(storageKey: string) {
  if (!/^[\da-f-]{36}\.(?:jpg|png|webp|pdf)$/i.test(storageKey)) {
    throw new AppError("FILE_NOT_FOUND", 404, "File not found.");
  }
  try {
    return await readFile(path.join(ROOT, storageKey));
  } catch {
    throw new AppError("FILE_NOT_FOUND", 404, "File not found.");
  }
}

export async function removeVendorFile(storageKey: string) {
  try {
    await unlink(path.join(ROOT, storageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

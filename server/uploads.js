import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AppError } from "./errors.js";

export const processImage = async (buffer, uploadDir) => {
  let metadata;
  try {
    metadata = await sharp(buffer, { failOn: "warning" }).metadata();
  } catch {
    throw new AppError(400, "INVALID_IMAGE", "文件不是有效图片");
  }
  if (!new Set(["jpeg", "png", "webp"]).has(metadata.format)) {
    throw new AppError(400, "INVALID_IMAGE", "仅支持 JPEG、PNG 或 WebP 图片");
  }
  if ((metadata.width || 0) * (metadata.height || 0) > 40_000_000) {
    throw new AppError(400, "INVALID_IMAGE", "图片像素尺寸过大");
  }
  await fs.mkdir(uploadDir, { recursive: true });
  const id = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
  const imageName = `${id}.webp`;
  const thumbName = `${id}-thumb.webp`;
  await sharp(buffer).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toFile(path.join(uploadDir, imageName));
  await sharp(buffer).rotate().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(uploadDir, thumbName));
  return { url: `/uploads/${imageName}`, thumbnailUrl: `/uploads/${thumbName}` };
};

const uploadFilename = (url) => {
  if (!url || !String(url).startsWith("/uploads/")) return null;
  const name = path.basename(String(url));
  return name === String(url).slice("/uploads/".length) ? name : null;
};

export const deleteUploadPair = async (url, uploadDir) => {
  const name = uploadFilename(url);
  if (!name) return;
  const stem = name.replace(/-thumb\.webp$|\.webp$/g, "");
  await Promise.allSettled([
    fs.unlink(path.join(uploadDir, `${stem}.webp`)),
    fs.unlink(path.join(uploadDir, `${stem}-thumb.webp`))
  ]);
};

export const cleanupOrphanUploads = async (db, uploadDir) => {
  await fs.mkdir(uploadDir, { recursive: true });
  const referenced = new Set();
  for (const row of await db.all("SELECT imagePath FROM devices WHERE imagePath LIKE '/uploads/%'")) {
    const name = uploadFilename(row.imagePath);
    if (!name) continue;
    const stem = name.replace(/-thumb\.webp$|\.webp$/g, "");
    referenced.add(`${stem}.webp`);
    referenced.add(`${stem}-thumb.webp`);
  }
  const removed = [];
  for (const entry of await fs.readdir(uploadDir, { withFileTypes: true })) {
    if (!entry.isFile() || referenced.has(entry.name)) continue;
    await fs.unlink(path.join(uploadDir, entry.name));
    removed.push(entry.name);
  }
  return removed;
};

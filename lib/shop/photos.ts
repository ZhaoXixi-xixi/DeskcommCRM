import "server-only";

import { BUCKET_DAS_FOTOS } from "@/lib/catalogo/fotos";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * 展示页产品图的链接：同一张图签两个尺寸——列表用的小图、点开看的大图。
 *
 * 桶里存的是 JPG/PNG 原图（WhatsApp 发图要用这个格式）。展示时不直接给原图，
 * 而是让 Storage 自带的图片服务按宽度缩小；浏览器支持 WebP 时它会自动输出
 * WebP。实测一张 283 KB 的 JPG 原图，480 宽的 WebP 只有 54 KB。
 *
 * 带尺寸的链接只能一张一张签，所以签过的链接在内存里留着复用：链接有效 24 小时，
 * 缓存 12 小时，任何时候发出去的链接都至少还能用 12 小时。
 */

export interface ShopPhoto {
  /** 列表和缩略图用。 */
  thumb: string;
  /** 点开后看的大图。 */
  full: string;
}

const WIDTHS = { thumb: 600, full: 1600 } as const;
const QUALITY = 80;
const LINK_TTL_SECONDS = 24 * 60 * 60;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
/** 同时签多少张：产品多的店第一次打开时不至于一口气压上几千个请求。 */
const BATCH = 20;

type Size = keyof typeof WIDTHS;
type Admin = ReturnType<typeof createAdminClient>;

const cache = new Map<string, { url: string; expires: number }>();

// ------------------------------------------------------------------ 内部

async function sign(admin: Admin, path: string, size: Size): Promise<string | null> {
  const key = `${size}:${path}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.url;

  const { data } = await admin.storage
    .from(BUCKET_DAS_FOTOS)
    .createSignedUrl(path, LINK_TTL_SECONDS, { transform: { width: WIDTHS[size], quality: QUALITY, resize: "contain" } });
  if (!data?.signedUrl) return null;
  cache.set(key, { url: data.signedUrl, expires: Date.now() + CACHE_TTL_MS });
  return data.signedUrl;
}

async function signBoth(admin: Admin, path: string): Promise<[string, ShopPhoto] | null> {
  const [thumb, full] = await Promise.all([sign(admin, path, "thumb"), sign(admin, path, "full")]);
  return thumb && full ? [path, { thumb, full }] : null;
}

// ------------------------------------------------------------------ 对外

/** 桶里的路径 → 两个尺寸的链接。签不出来的路径不在结果里。 */
export async function signShopPhotos(admin: Admin, paths: readonly string[]): Promise<Map<string, ShopPhoto>> {
  const signed = new Map<string, ShopPhoto>();
  for (let i = 0; i < paths.length; i += BATCH) {
    const batch = await Promise.all(paths.slice(i, i + BATCH).map((path) => signBoth(admin, path)));
    for (const entry of batch) if (entry) signed.set(...entry);
  }
  return signed;
}

/** 外部链接的图（导入时填的图片网址）没法缩小，两个尺寸都用原链接。 */
export function externalPhoto(url: string): ShopPhoto {
  return { thumb: url, full: url };
}

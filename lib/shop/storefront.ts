import "server-only";

import { fotoPertenceAoProduto } from "@/lib/catalogo/fotos";
import { createAdminClient } from "@/lib/supabase/admin";

import { externalPhoto, signShopPhotos, type ShopPhoto } from "./photos";

/**
 * 公开产品展示页（/shop/<组织 slug>）的数据层。
 *
 * 展示页不登录，所以这里用 service role 读库、绕过 RLS —— 因此只取可以公开的列：
 * 成本价、库存一律不出现在 select 里。图片桶是私有的，限时链接由 ./photos 签发。
 *
 * 产品编码（codigo）是公开的：它是产品页链接 ?p=<编码> 的一部分，AI 查产品库
 * 拿到的也是它，这样 AI 和客服发出去的链接都能直接打开对应的产品。
 */

// ------------------------------------------------------------------ 类型

export interface ShopProduct {
  id: string;
  code: string;
  name: string;
  description: string | null;
  brand: string | null;
  category: string;
  priceCents: number | null;
  currency: string;
  photos: ShopPhoto[];
}

export interface Shop {
  slug: string;
  name: string;
  whatsapp: string | null;
  categories: string[];
  products: ShopProduct[];
}

interface ProductRow {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  marca: string | null;
  categoria: string | null;
  preco_cents: number | null;
  moeda: string | null;
  fotos: string[] | null;
  imagem_url: string | null;
}

// ------------------------------------------------------------------ 常量

export const UNCATEGORIZED = "Other";
const MAX_PRODUCTS = 500;
const PUBLIC_COLUMNS = "id, codigo, nome, descricao, marca, categoria, preco_cents, moeda, fotos, imagem_url";

// ------------------------------------------------------------------ 读取

type Admin = ReturnType<typeof createAdminClient>;

function toProduct(row: ProductRow, own: string[], signed: Map<string, ShopPhoto>, currency: string): ShopProduct {
  const uploaded = own.map((path) => signed.get(path)).filter((photo): photo is ShopPhoto => !!photo);
  return {
    id: row.id,
    code: row.codigo,
    name: row.nome,
    description: row.descricao,
    brand: row.marca,
    category: row.categoria?.trim() || UNCATEGORIZED,
    priceCents: row.preco_cents,
    currency: row.moeda ?? currency,
    photos: uploaded.length > 0 || !row.imagem_url ? uploaded : [externalPhoto(row.imagem_url)],
  };
}

async function connectedWhatsapp(admin: Admin, orgId: string): Promise<string | null> {
  const { data } = await admin
    .from("channel_sessions")
    .select("phone_number")
    .eq("organization_id", orgId)
    .eq("status", "WORKING")
    .is("archived_at", null)
    .not("phone_number", "is", null)
    .limit(1)
    .maybeSingle();
  return (data?.phone_number as string | undefined)?.replace(/\D/g, "") || null;
}

/** 展示页按 slug 找店；后台（发产品）按登录人的组织 id 找同一家店。 */
export type ShopKey = { slug: string } | { id: string };

/** 这个产品自己上传的第一张图在图片桶里的路径；没有上传过图就是 null。 */
export async function firstPhotoPath(orgId: string, productId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("catalog_products")
    .select("fotos")
    .eq("organization_id", orgId)
    .eq("id", productId)
    .eq("ativo", true)
    .maybeSingle();
  const paths = ((data as { fotos: string[] | null } | null)?.fotos ?? []) as string[];
  return paths.find((path) => fotoPertenceAoProduto(path, orgId, productId)) ?? null;
}

export async function loadShop(key: ShopKey): Promise<Shop | null> {
  const admin = createAdminClient();
  const orgs = admin.from("organizations").select("id, slug, display_name, currency");
  const { data: org } = await ("slug" in key ? orgs.eq("slug", key.slug) : orgs.eq("id", key.id)).maybeSingle();
  if (!org) return null;

  const [{ data: rows }, whatsapp] = await Promise.all([
    admin
      .from("catalog_products")
      .select(PUBLIC_COLUMNS)
      .eq("organization_id", org.id)
      .eq("ativo", true)
      .order("categoria", { ascending: true, nullsFirst: false })
      .order("nome", { ascending: true })
      .limit(MAX_PRODUCTS),
    connectedWhatsapp(admin, org.id),
  ]);

  const list = (rows ?? []) as unknown as ProductRow[];
  const ownPhotos = new Map(
    list.map((row) => [row.id, (row.fotos ?? []).filter((path) => fotoPertenceAoProduto(path, org.id, row.id))]),
  );
  const signed = await signShopPhotos(admin, [...ownPhotos.values()].flat());
  const products = list.map((row) => toProduct(row, ownPhotos.get(row.id) ?? [], signed, org.currency ?? "USD"));

  return {
    slug: org.slug,
    name: org.display_name,
    whatsapp,
    categories: [...new Set(products.map((product) => product.category))],
    products,
  };
}

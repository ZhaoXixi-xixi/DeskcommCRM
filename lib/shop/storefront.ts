import "server-only";

import { BUCKET_DAS_FOTOS, fotoPertenceAoProduto } from "@/lib/catalogo/fotos";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 公开产品展示页（/shop/<组织 slug>）的数据层。
 *
 * 展示页不登录，所以这里用 service role 读库、绕过 RLS —— 因此只取可以公开的列：
 * 成本价、库存、内部编码一律不出现在 select 里。图片桶是私有的，这里签发限时链接。
 */

// ------------------------------------------------------------------ 类型

export interface ShopProduct {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  category: string;
  priceCents: number | null;
  currency: string;
  photos: string[];
}

export interface Shop {
  name: string;
  whatsapp: string | null;
  categories: string[];
  products: ShopProduct[];
}

interface ProductRow {
  id: string;
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
const PHOTO_TTL_SECONDS = 24 * 60 * 60;
const MAX_PRODUCTS = 500;
const PUBLIC_COLUMNS = "id, nome, descricao, marca, categoria, preco_cents, moeda, fotos, imagem_url";

// ------------------------------------------------------------------ 读取

type Admin = ReturnType<typeof createAdminClient>;

async function signPhotos(admin: Admin, paths: string[]): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  if (paths.length === 0) return signed;
  const { data } = await admin.storage.from(BUCKET_DAS_FOTOS).createSignedUrls(paths, PHOTO_TTL_SECONDS);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) signed.set(item.path, item.signedUrl);
  }
  return signed;
}

function toProduct(row: ProductRow, own: string[], signed: Map<string, string>, currency: string): ShopProduct {
  const uploaded = own.map((path) => signed.get(path)).filter((url): url is string => !!url);
  return {
    id: row.id,
    name: row.nome,
    description: row.descricao,
    brand: row.marca,
    category: row.categoria?.trim() || UNCATEGORIZED,
    priceCents: row.preco_cents,
    currency: row.moeda ?? currency,
    photos: uploaded.length > 0 || !row.imagem_url ? uploaded : [row.imagem_url],
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

export async function loadShop(slug: string): Promise<Shop | null> {
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, display_name, currency")
    .eq("slug", slug)
    .maybeSingle();
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
  const signed = await signPhotos(admin, [...ownPhotos.values()].flat());
  const products = list.map((row) => toProduct(row, ownPhotos.get(row.id) ?? [], signed, org.currency ?? "USD"));

  return {
    name: org.display_name,
    whatsapp,
    categories: [...new Set(products.map((product) => product.category))],
    products,
  };
}

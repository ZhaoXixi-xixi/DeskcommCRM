/**
 * GET /api/v1/shop/products —— 收件箱「发产品」选择框用的产品清单。
 *
 * 返回的就是公开展示页上那批产品（只有上架的、只有可公开的列），外加店铺 slug，
 * 前端用它拼出产品页链接。客服（agent）及以上角色可读。
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { loadShop } from "@/lib/shop/storefront";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "catalog_products" });
  if (!authz.ok) return authz.response;

  const shop = await loadShop({ id: authz.org.orgId });
  if (!shop) return fail("not_found", traduzir("Loja não encontrada.", authz.user.idioma), 404, { requestId });
  return ok({ slug: shop.slug, products: shop.products }, { requestId });
}

/**
 * GET /api/v1/shop/products/<id>/photo —— 产品第一张图的原始字节。
 *
 * 「发产品」要把图当附件发给客户，浏览器得先拿到图片本身。图片桶是私有的，
 * 所以由服务器取出来、从本站同源返回，不依赖图片桶的跨域设置。
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { comIdDaRequisicao, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { BUCKET_DAS_FOTOS, mimeDaFoto } from "@/lib/catalogo/fotos";
import { traduzir } from "@/lib/i18n/dicionario";
import { firstPhotoPath } from "@/lib/shop/storefront";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "catalog_products" });
  if (!authz.ok) return authz.response;
  const semFoto = () => fail("not_found", traduzir("Imagem não encontrada.", authz.user.idioma), 404, { requestId });

  // firstPhotoPath 只认「本组织、本产品」自己的图，别的组织的产品 id 查不到任何东西。
  const path = await firstPhotoPath(authz.org.orgId, (await params).id);
  if (!path) return semFoto();

  const { data: objeto, error } = await createAdminClient().storage.from(BUCKET_DAS_FOTOS).download(path);
  if (error || !objeto) return semFoto();

  const corpo = await objeto.arrayBuffer();
  return comIdDaRequisicao(
    new Response(corpo, {
      status: 200,
      headers: {
        "Content-Type": mimeDaFoto(path),
        "Content-Length": String(corpo.byteLength),
        "Cache-Control": "private, no-store",
      },
    }),
    requestId,
  );
}

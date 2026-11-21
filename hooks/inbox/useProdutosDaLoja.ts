"use client";
/**
 * 收件箱「发产品」：读产品清单，把选中的产品变成「一张图 + 一段文字」。
 */
import { useEffect, useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { productCaption, productUrl } from "@/lib/shop/product-message";
import type { ShopProduct } from "@/lib/shop/storefront";

export interface ProdutosDaLoja {
  slug: string;
  products: ShopProduct[];
}

/** 要发给客户的内容：有图时图是附件、文字是图片说明；没图时只有文字。 */
export interface ProdutoParaEnvio {
  foto: File | null;
  texto: string;
}

/** 选择框每次打开时读一遍产品清单：刚在后台上架的产品马上就能选到。读到之前是 null。 */
export function useProdutosDaLoja(ativo: boolean): ProdutosDaLoja | null {
  const [loja, setLoja] = useState<ProdutosDaLoja | null>(null);
  useEffect(() => {
    if (!ativo) return;
    let vigente = true;
    apiClient
      .get<{ data: ProdutosDaLoja }>("/api/v1/shop/products")
      .then(({ data }) => vigente && setLoja(data))
      .catch(showApiError);
    return () => {
      vigente = false;
    };
  }, [ativo]);
  return loja;
}

/** 名称、品牌、编码里包含搜索词的产品；搜索词为空时返回全部。 */
export function filtrarProdutos(products: readonly ShopProduct[], busca: string): ShopProduct[] {
  const termo = busca.trim().toLowerCase();
  return products.filter((product) =>
    [product.name, product.brand ?? "", product.code, product.category].some((campo) => campo.toLowerCase().includes(termo)),
  );
}

async function fotoDoProduto(product: ShopProduct): Promise<File | null> {
  if (product.photos.length === 0) return null;
  const res = await fetch(`/api/v1/shop/products/${product.id}/photo`);
  // 404 = 这个产品的图是外部链接，不在我们的图片桶里：照常发文字和链接。
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, "midia_indisponivel", undefined, "", "");
  const blob = await res.blob();
  const extensao = blob.type === "image/png" ? "png" : "jpg";
  return new File([blob], `${product.code}.${extensao}`, { type: blob.type });
}

export async function prepararProdutoParaEnvio(product: ShopProduct, slug: string): Promise<ProdutoParaEnvio> {
  const url = productUrl(window.location.origin, slug, product.code);
  return { foto: await fotoDoProduto(product), texto: productCaption(product, url) };
}

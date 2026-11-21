/**
 * 把一个产品写成发给客户的一条消息：名称、品牌、价格、产品页链接。
 *
 * 前后端共用的纯函数。消息里只有产品自己的信息和链接，没有任何客套话，
 * 所以不分语言——客服可以在发送前的预览里自己加一句。
 */
import type { ShopProduct } from "./storefront";

type Priced = Pick<ShopProduct, "priceCents" | "currency">;

/** 价格文字；没填价格的产品返回 null，由调用方决定显示什么。 */
export function priceLabel(product: Priced): string | null {
  if (product.priceCents === null) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: product.currency }).format(
    product.priceCents / 100,
  );
}

/** 产品页地址：<站点>/shop/<店铺 slug>?p=<产品编码>。 */
export function productUrl(origin: string, slug: string, code: string): string {
  return `${origin}/shop/${slug}?p=${encodeURIComponent(code)}`;
}

/** WhatsApp 里 *星号* 包住的文字显示为粗体。没有的项目（品牌、价格）整行不出现。 */
export function productCaption(product: Pick<ShopProduct, "name" | "brand"> & Priced, url: string): string {
  return [`*${product.name}*`, product.brand, priceLabel(product), url].filter(Boolean).join("\n");
}

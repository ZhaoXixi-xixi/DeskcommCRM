import { describe, expect, it } from "vitest";

import { productCaption, productUrl } from "./product-message";

const url = productUrl("https://crm.cicy.vip", "jianwai", "10001");

describe("发产品：消息文字", () => {
  it("名称、品牌、价格、链接写成一行，链接前后有空格", () => {
    const texto = productCaption({ name: "Seamaster 300", brand: "Omega", priceCents: 45000, currency: "USD" }, url);
    expect(texto).toBe("*Seamaster 300* · Omega · $450.00 · https://crm.cicy.vip/shop/jianwai?p=10001");
  });

  it("不含换行：附件预览框的说明是单行输入框，换行会让价格和链接粘在一起", () => {
    expect(productCaption({ name: "A", brand: "B", priceCents: 100, currency: "USD" }, url)).not.toMatch(/\n/);
  });

  it("没填品牌和价格的产品只有名称和链接", () => {
    expect(productCaption({ name: "Tote", brand: null, priceCents: null, currency: "USD" }, url)).toBe(
      "*Tote* · https://crm.cicy.vip/shop/jianwai?p=10001",
    );
  });
});

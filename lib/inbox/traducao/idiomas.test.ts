import { describe, expect, it } from "vitest";

import { precisaTraduzir } from "./idiomas";

describe("聊天翻译：哪句话需要翻", () => {
  it("中文界面看英文消息要翻", () => {
    expect(precisaTraduzir("Hi, do you have any Omega watches?", "zh-CN")).toBe(true);
  });

  it("中文界面看中文消息不用翻", () => {
    expect(precisaTraduzir("你好，请问有什么款式的手表？", "zh-CN")).toBe(false);
  });

  it("夹了几个中文字的外语消息仍然要翻", () => {
    expect(precisaTraduzir("Hello 赵, thanks for reaching out — how can I help you today?", "zh-CN")).toBe(true);
  });

  it("纯表情、纯数字、纯链接不用翻", () => {
    expect(precisaTraduzir("👍🙏", "zh-CN")).toBe(false);
    expect(precisaTraduzir("450", "zh-CN")).toBe(false);
    expect(precisaTraduzir("https://crm.cicy.vip/shop/jianwai?p=10001", "zh-CN")).toBe(false);
  });

  it("拉丁字母的界面语言互相分不出来，不自动翻", () => {
    expect(precisaTraduzir("Hi, how much is it?", "pt-BR")).toBe(false);
  });
});

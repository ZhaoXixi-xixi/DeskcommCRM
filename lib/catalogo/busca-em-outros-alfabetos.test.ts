import { describe, expect, it } from "vitest";

import { ordenarPorRelevancia } from "./busca";

/**
 * 用中文（以及任何非拉丁文字）登记的产品必须搜得到。
 *
 * 原来的归一化只留 a-z 和数字，中文产品名被整段删空：AI 查「欧米茄」时产品库里
 * 明明有，却回答「我去跟团队确认一下」。
 */

const produto = (codigo: string, nome: string, marca: string, categoria: string) => ({ codigo, nome, marca, categoria });

const CATALOGO = [
  produto("10001", "海马 300", "欧米茄", "手表"),
  produto("10002", "Speedmaster", "Omega", "Watches"),
  produto("20001", "经典款托特包", "蔻驰", "包包"),
];

const codigos = (consulta: string) => ordenarPorRelevancia(CATALOGO, consulta).map((achado) => achado.produto.codigo);

describe("产品搜索：非拉丁文字", () => {
  it("中文品牌搜得到", () => {
    expect(codigos("欧米茄")).toEqual(["10001"]);
  });

  it("客户把品牌和品类连着写也搜得到", () => {
    expect(codigos("欧米茄手表")).toContain("10001");
  });

  it("客户的一整句话（没有空格）也搜得到", () => {
    expect(codigos("你们有欧米茄的手表吗？多少钱？")).toEqual(["10001"]);
  });

  it("只说品类时，这个品类的产品都出来", () => {
    expect(codigos("有什么包包")).toEqual(["20001"]);
  });

  it("单个字不算匹配，免得「表」把所有带「表」字的都带出来", () => {
    expect(codigos("表")).toEqual([]);
  });

  it("中文搜索不会把无关的产品带出来", () => {
    expect(codigos("蔻驰")).toEqual(["20001"]);
  });

  it("拉丁字母的搜索照旧：带重音和大小写都不影响", () => {
    expect(codigos("ómega")).toEqual(["10002"]);
  });
});

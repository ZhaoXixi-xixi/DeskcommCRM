import { describe, expect, it } from "vitest";

import { traduzir } from "@/lib/i18n/dicionario";

import { tituloNoIdioma } from "./TituloDaAba";

const zh = (texto: string) => traduzir(texto, "zh-CN");

describe("tituloNoIdioma — a aba no idioma de quem lê (fork 见外)", () => {
  it("traduz o nome da página e mantém a marca", () => {
    expect(tituloNoIdioma("Produtos · 见外跨境", zh)).toBe("产品 · 见外跨境");
    expect(tituloNoIdioma("Contatos · 见外跨境", zh)).toBe("联系人 · 见外跨境");
  });

  it("o título-padrão fica só com a marca", () => {
    expect(tituloNoIdioma("见外跨境 — atendimento e vendas por WhatsApp com agentes de IA", zh)).toBe("见外跨境");
  });

  it("sem tradução, ou sem separador, devolve o que veio", () => {
    expect(tituloNoIdioma("Algo que ninguém traduziu · 见外跨境", zh)).toBe("Algo que ninguém traduziu · 见外跨境");
    expect(tituloNoIdioma("见外跨境", zh)).toBe("见外跨境");
  });

  it("aplicar duas vezes não muda nada (o observador não entra em laço)", () => {
    const uma = tituloNoIdioma("Produtos · 见外跨境", zh);
    expect(tituloNoIdioma(uma, zh)).toBe(uma);
  });
});

"use client";

/**
 * Fork 见外 — o TÍTULO DA ABA no idioma de quem lê.
 *
 * As páginas declaram o título em português (`export const metadata = { title:
 * "Produtos" }`, umas cem telas) e o layout raiz põe o sufixo da marca
 * (`%s · <marca>`). Metadata é resolvida no servidor sem saber o idioma da
 * pessoa, então a aba ficava em português para quem usa chinês.
 *
 * Aqui, no cliente e dentro do `IdiomaProvider`: a parte antes do último " · "
 * passa pelo dicionário (`traduzir`, o mesmo do `t()`); o título-padrão (sem
 * nome de página) fica só com a marca. O Next reescreve o `<title>` a cada
 * navegação, então um `MutationObserver` no `<head>` traduz de novo — e só
 * escreve quando o texto muda, para não entrar em laço com ele mesmo.
 */
import { useEffect } from "react";

import { traduzir } from "@/lib/i18n/dicionario";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";

const SEPARADOR = " · ";
const SUFIXO_PADRAO = " — atendimento e vendas por WhatsApp com agentes de IA";

export function tituloNoIdioma(titulo: string, traduzirTexto: (texto: string) => string): string {
  if (titulo.endsWith(SUFIXO_PADRAO)) return titulo.slice(0, -SUFIXO_PADRAO.length);
  const corte = titulo.lastIndexOf(SEPARADOR);
  if (corte <= 0) return titulo;
  const pagina = titulo.slice(0, corte);
  return traduzirTexto(pagina) + titulo.slice(corte);
}

export function TituloDaAba() {
  const idioma = useIdioma();

  useEffect(() => {
    if (idioma === "pt-BR") return;
    const aplicar = () => {
      const novo = tituloNoIdioma(document.title, (texto) => traduzir(texto, idioma));
      if (novo !== document.title) document.title = novo;
    };
    aplicar();
    const observador = new MutationObserver(aplicar);
    observador.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observador.disconnect();
  }, [idioma]);

  return null;
}

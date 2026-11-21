"use client";
/**
 * 聊天翻译的前端入口。
 *
 * 一屏消息里每个气泡都想要自己的译文。各发各的会是几十个请求，所以这里先把
 * 同一个会话、同一瞬间的句子攒成一批，一次请求翻完，译文放进本页面共用的一张
 * 表里，气泡订阅这张表。同一句话在别的气泡、别的会话里再出现时直接读表。
 */
import { useEffect, useState, useSyncExternalStore } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import { MAXIMO_DE_TEXTOS, precisaTraduzir } from "@/lib/inbox/traducao/idiomas";

/** 翻译要等模型回话，比普通写请求的 30 秒宽一些。 */
const ESPERA_DA_TRADUCAO_MS = 60_000;
/** 攒批的时间：一屏气泡在同一帧挂载，这点时间足够它们都排进来。 */
const JANELA_DO_LOTE_MS = 60;

/** 已经翻好的句子：键是「界面语言 + 原文」。 */
const traducoes = new Map<string, string>();
/** 正在路上的句子，避免同一句被重复请求。 */
const aCaminho = new Set<string>();
/** 每个会话攒着还没发出去的句子。 */
const filas = new Map<string, Set<string>>();
const ouvintes = new Set<() => void>();

const rota = (conversationId: string) => `/api/v1/conversations/${conversationId}/translate`;
const chaveDe = (idioma: string, texto: string) => `${idioma}\n${texto}`;

// ------------------------------------------------------------------ 攒批

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** 失败的句子不记进表里：气泡照常显示原文，下次进入会话时会再试。 */
async function enviarParte(conversationId: string, idioma: string, textos: string[]): Promise<void> {
  try {
    const { data } = await apiClient.post<{ data: { traducoes: string[] } }>(
      rota(conversationId),
      { direcao: "leitor", textos },
      { timeoutMs: ESPERA_DA_TRADUCAO_MS },
    );
    textos.forEach((texto, i) => traducoes.set(chaveDe(idioma, texto), data.traducoes[i] ?? ""));
    ouvintes.forEach((ouvinte) => ouvinte());
  } catch {
    // 一屏消息失败会刷出一屏提示，所以这里不弹提示。
  } finally {
    textos.forEach((texto) => aCaminho.delete(chaveDe(idioma, texto)));
  }
}

function despachar(conversationId: string, idioma: string): void {
  const textos = [...(filas.get(conversationId) ?? [])];
  filas.delete(conversationId);
  for (let i = 0; i < textos.length; i += MAXIMO_DE_TEXTOS) {
    void enviarParte(conversationId, idioma, textos.slice(i, i + MAXIMO_DE_TEXTOS));
  }
}

function pedirTraducao(conversationId: string, idioma: string, texto: string): void {
  const chave = chaveDe(idioma, texto);
  if (traducoes.has(chave) || aCaminho.has(chave)) return;
  aCaminho.add(chave);
  if (!filas.has(conversationId)) {
    filas.set(conversationId, new Set());
    setTimeout(() => despachar(conversationId, idioma), JANELA_DO_LOTE_MS);
  }
  filas.get(conversationId)!.add(texto);
}

// ------------------------------------------------------------------ hooks

/** 这句话翻成当前界面语言后的译文；不需要翻、还没翻好、翻出来和原文一样时都是 null。 */
export function useTraducaoParaLeitura(conversationId: string, texto: string): string | null {
  const idioma = useIdioma();
  const limpo = texto.trim();
  const precisa = precisaTraduzir(limpo, idioma);
  const traducao = useSyncExternalStore(
    assinar,
    () => traducoes.get(chaveDe(idioma, limpo)) ?? null,
    () => null,
  );
  useEffect(() => {
    if (precisa) pedirTraducao(conversationId, idioma, limpo);
  }, [precisa, conversationId, idioma, limpo]);
  return precisa && traducao && traducao !== limpo ? traducao : null;
}

/**
 * 把客服写的话翻成客户的语言。只把译文交给 `aoTraduzir`，发不发由人决定；
 * 失败时弹出提示，输入框里的原话原样保留。
 */
export function useTraduzirParaOCliente(conversationId: string) {
  const idioma = useIdioma();
  const [traduzindo, setTraduzindo] = useState(false);

  async function traduzir(texto: string, aoTraduzir: (traducao: string) => void): Promise<void> {
    setTraduzindo(true);
    try {
      const { data } = await apiClient.post<{ data: { texto: string } }>(
        rota(conversationId),
        { direcao: "cliente", texto },
        { timeoutMs: ESPERA_DA_TRADUCAO_MS },
      );
      // 这句发出去以后，气泡下方显示的就是自己写的原话，不用再去问服务器。
      traducoes.set(chaveDe(idioma, data.texto.trim()), texto);
      aoTraduzir(data.texto);
    } catch (erro) {
      showApiError(erro);
    } finally {
      setTraduzindo(false);
    }
  }

  return { traduzindo, traduzir };
}

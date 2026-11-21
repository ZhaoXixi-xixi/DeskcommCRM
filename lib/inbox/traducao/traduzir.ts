/**
 * 聊天翻译：调用组织自己配置的模型，一次请求翻完一批句子。
 *
 * 走 `runModelCall` 这一条路，所以用的是组织在「AI 提供商」里登记的密钥和默认
 * 模型，费用和失败也记在同一张 `llm_calls` 里，不需要另配密钥。
 */
import "server-only";

import { z } from "zod";

import { requestTurnDeps } from "@/lib/agent-engine/agent/request-deps";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { runModelCall } from "@/lib/agent-engine/edge/llm/run-model-call";

import { nomeDoIdioma } from "./idiomas";

/** 登记在 `lib/ai/pontos/registro.ts` 里的用途名。 */
export const PROPOSITO_DA_TRADUCAO = "chat_translation";

/** 翻成读者的界面语言，或者翻成客户在用的语言（由客户最近说的话判断）。 */
export type DestinoDaTraducao =
  | { tipo: "idioma"; idioma: string }
  | { tipo: "cliente"; amostras: readonly string[] };

const respostaSchema = z.object({ translations: z.array(z.string()) });

const REGRAS = [
  "You are a translation engine for a WhatsApp sales chat. Translate every numbered item.",
  "Keep the tone natural and conversational, the way a real person texts.",
  "Copy these verbatim, never translate them: URLs, emoji, product codes,",
  "placeholders in double braces like {{primeiro_nome}}, and anything inside [square brackets].",
  "Keep every number exactly as written, but do translate the words around it, currency names included.",
  "A placeholder is a name: put it where a name naturally goes in the target language.",
  "If an item is already in the target language, return it unchanged.",
  'Answer with JSON only: {"translations": ["...", "..."]} — same count and order as the input.',
].join("\n");

// ------------------------------------------------------------------ 提示词

const INSTRUCAO_DO_DESTINO = {
  idioma: (d: Extract<DestinoDaTraducao, { tipo: "idioma" }>) => `Target language: ${nomeDoIdioma(d.idioma)}.`,
  cliente: (d: Extract<DestinoDaTraducao, { tipo: "cliente" }>) =>
    [
      "Target language: the language the customer writes in. Their latest messages:",
      ...d.amostras.map((amostra) => `> ${amostra.slice(0, 300)}`),
      "If there are no messages or the language is unclear, translate into English.",
    ].join("\n"),
} as const;

function instrucaoDoDestino(destino: DestinoDaTraducao): string {
  return (INSTRUCAO_DO_DESTINO[destino.tipo] as (d: DestinoDaTraducao) => string)(destino);
}

function numerar(textos: readonly string[]): string {
  return textos.map((texto, i) => `[${i + 1}]\n${texto}`).join("\n\n");
}

/** 模型有时会把 JSON 包在 ```json 代码块里，取第一个 { 到最后一个 } 之间的内容。 */
function extrairJson(bruto: string): unknown {
  const inicio = bruto.indexOf("{");
  const fim = bruto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) throw new Error("traducao_sem_json");
  return JSON.parse(bruto.slice(inicio, fim + 1));
}

// ------------------------------------------------------------------ 对外

/** 按输入顺序返回译文。数量对不上就抛错，绝不把译文错位贴到别的句子上。 */
export async function traduzirTextos(
  organizationId: string,
  textos: readonly string[],
  destino: DestinoDaTraducao,
): Promise<string[]> {
  if (textos.length === 0) return [];
  const { result } = await runModelCall(getRequestPool(), requestTurnDeps().llmCfg, {
    tenantId: organizationId,
    purpose: PROPOSITO_DA_TRADUCAO,
    system: `${REGRAS}\n\n${instrucaoDoDestino(destino)}`,
    messages: [{ role: "user", content: numerar(textos) }],
    temperature: 0,
  });
  const { translations } = respostaSchema.parse(extrairJson(result.text ?? ""));
  if (translations.length !== textos.length) throw new Error("traducao_com_contagem_errada");
  return translations.map((traducao) => traducao.trim());
}

/**
 * 聊天翻译接口：POST /api/v1/conversations/<id>/translate
 *
 * 两个方向共用一个入口：
 *   leitor  → 把聊天里的句子翻成当前登录人的界面语言（气泡下方的译文、AI 草稿的译文）
 *   cliente → 把客服写的一句话翻成客户在用的语言（输入框的「翻译」按钮）
 *
 * 只翻译，不发送：译文回到输入框，由人看过再点发送。
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { guardarTraducoes, lerTraducoes } from "@/lib/inbox/traducao/cache";
import { MAXIMO_DE_CARACTERES, MAXIMO_DE_TEXTOS } from "@/lib/inbox/traducao/idiomas";
import { traduzirTextos } from "@/lib/inbox/traducao/traduzir";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const texto = z.string().trim().min(1).max(MAXIMO_DE_CARACTERES);
const corpoSchema = z.discriminatedUnion("direcao", [
  z.object({ direcao: z.literal("leitor"), textos: z.array(texto).min(1).max(MAXIMO_DE_TEXTOS) }),
  z.object({ direcao: z.literal("cliente"), texto }),
]);
type Corpo = z.infer<typeof corpoSchema>;

/** 判断客户语言时看最近几条客户消息。 */
const AMOSTRAS_DO_CLIENTE = 6;

interface Pedido {
  organizationId: string;
  conversationId: string;
  idiomaDoLeitor: string;
}

// ------------------------------------------------------------------ 两个方向

/** 先查缓存，只把没翻过的句子送去模型。 */
async function traduzirParaOLeitor(pedido: Pedido, textos: readonly string[]): Promise<string[]> {
  const emCache = await lerTraducoes(pedido.idiomaDoLeitor, textos);
  const faltam = textos.filter((_, i) => emCache[i] === null);
  const novas = await traduzirTextos(pedido.organizationId, faltam, { tipo: "idioma", idioma: pedido.idiomaDoLeitor });
  await guardarTraducoes(pedido.idiomaDoLeitor, faltam.map((t, i) => [t, novas[i] ?? ""] as const));
  const fila = [...novas];
  return emCache.map((traducao) => traducao ?? fila.shift() ?? "");
}

async function amostrasDoCliente(pedido: Pedido): Promise<string[]> {
  const db = await createClient();
  const { data } = await db
    .from("messages")
    .select("body")
    .eq("organization_id", pedido.organizationId)
    .eq("conversation_id", pedido.conversationId)
    .eq("direction", "inbound")
    .eq("type", "text")
    .not("body", "is", null)
    .order("created_at", { ascending: false })
    .limit(AMOSTRAS_DO_CLIENTE);
  return (data ?? []).map((linha) => linha.body ?? "").filter((body) => body.trim() !== "");
}

/**
 * 翻成客户的语言，并把「译文 → 原文」记进缓存：这条消息发出去以后，气泡下方
 * 显示的就是客服自己写的那句原话，而不是机器再翻回来的版本。
 */
async function traduzirParaOCliente(pedido: Pedido, original: string): Promise<string> {
  const amostras = await amostrasDoCliente(pedido);
  const [traducao = ""] = await traduzirTextos(pedido.organizationId, [original], { tipo: "cliente", amostras });
  await guardarTraducoes(pedido.idiomaDoLeitor, [[traducao, original]]);
  return traducao;
}

const RESPONDER: { [D in Corpo["direcao"]]: (pedido: Pedido, corpo: Extract<Corpo, { direcao: D }>) => Promise<object> } = {
  leitor: async (pedido, corpo) => ({ traducoes: await traduzirParaOLeitor(pedido, corpo.textos) }),
  cliente: async (pedido, corpo) => ({ texto: await traduzirParaOCliente(pedido, corpo.texto) }),
};

// ------------------------------------------------------------------ 入口

export async function POST(req: NextRequest, ctx: Ctx) {
  const requestId = randomUUID();
  const auth = await requireRole("agent", { requestId, resource: "conversations" });
  if (!auth.ok) return auth.response;
  const t = (frase: string) => traduzir(frase, auth.user.idioma);

  const corpo = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!corpo.success) return fail("validation_error", t("Texto inválido para tradução."), 422, { requestId });

  // 通过登录人自己的数据库会话读会话：看不到这个会话的人（RLS）也翻译不了它。
  const { id } = await ctx.params;
  const db = await createClient();
  const { data: conversa } = await db
    .from("conversations")
    .select("id")
    .eq("organization_id", auth.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!conversa) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });

  const pedido: Pedido = { organizationId: auth.org.orgId, conversationId: conversa.id, idiomaDoLeitor: auth.user.idioma };
  try {
    const responder = RESPONDER[corpo.data.direcao] as (p: Pedido, c: Corpo) => Promise<object>;
    return ok(await responder(pedido, corpo.data), { requestId });
  } catch (erro) {
    logger.error("[translate] a tradução falhou", {
      requestId,
      organizationId: pedido.organizationId,
      conversationId: pedido.conversationId,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return fail("translation_failed", t("Não foi possível traduzir agora. Tente de novo."), 502, { requestId });
  }
}

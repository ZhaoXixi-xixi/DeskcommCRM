"use client";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

// 一次起草要串行调用 5–6 次模型（分类、安全检查、生成、核对），实测 25–35 秒，
// 超过写请求默认的 30 秒；等不到就会把已经生成好的草稿报成「查询超时」。
export const DRAFT_REPLY_TIMEOUT_MS = 120_000;

/** Onda 5.1: rascunho sob demanda gerado pelo agente publicado da org (sem enviar). */
export function useDraftReply() {
  return useMutation({
    mutationFn: async (conversationId: string) =>
      apiClient.post<{ data: { draft: string } }>(`/api/v1/conversations/${conversationId}/draft-reply`, {}, {
        timeoutMs: DRAFT_REPLY_TIMEOUT_MS,
      }),
    onError: showApiError,
  });
}

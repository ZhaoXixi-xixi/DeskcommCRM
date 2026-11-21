"use client";
import { useTraducaoParaLeitura } from "@/hooks/inbox/useTraducao";
import { cn } from "@/lib/utils";

interface Props {
  conversationId: string;
  texto: string;
  className?: string;
}

/**
 * 原文下方的一行译文，翻成当前登录人的界面语言。
 *
 * 不需要翻译（已经是读者的语言、纯表情、纯链接）或译文还没回来时什么都不画，
 * 气泡保持原样，不留空行。
 */
export function TraducaoDoTexto({ conversationId, texto, className }: Props) {
  const traducao = useTraducaoParaLeitura(conversationId, texto);
  if (!traducao) return null;
  return (
    <p
      data-testid="traducao-do-texto"
      className={cn("mt-1 border-t border-current/20 pt-1 text-[0.92em] leading-snug whitespace-pre-wrap wrap-anywhere opacity-75", className)}
    >
      {traducao}
    </p>
  );
}

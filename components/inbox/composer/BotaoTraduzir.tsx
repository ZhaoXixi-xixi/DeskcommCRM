"use client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/hooks/i18n/useT";
import { useTraduzirParaOCliente } from "@/hooks/inbox/useTraducao";
import { Translate } from "@/lib/ui/icons";

interface Props {
  conversationId: string;
  /** 输入框里现在的文字。 */
  texto: string;
  /** 译文回来后放回输入框；发不发由人决定。 */
  onTraduzido: (traducao: string) => void;
  disabled?: boolean;
}

/**
 * 输入框的「翻译」按钮：把写好的话翻成客户的语言，替换输入框里的文字。
 *
 * 只替换、不发送——人看过译文再点发送。Tooltip 的 Provider 放在本地，和旁边的
 * 加号、表情、AI 起草按钮一样：收件箱面板没有上层 Provider，缺了 Radix 会抛错。
 */
export function BotaoTraduzir({ conversationId, texto, onTraduzido, disabled }: Props) {
  const t = useT();
  const { traduzindo, traduzir } = useTraduzirParaOCliente(conversationId);
  const rotulo = t("Traduzir para o idioma do cliente");

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9 shrink-0"
            aria-label={rotulo}
            aria-busy={traduzindo}
            disabled={disabled || traduzindo || texto.trim() === ""}
            onClick={() => void traduzir(texto.trim(), onTraduzido)}
          >
            <Translate size={18} weight={traduzindo ? "duotone" : "regular"} aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{rotulo}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

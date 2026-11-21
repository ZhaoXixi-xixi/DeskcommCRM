"use client";
import { useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import {
  filtrarProdutos,
  prepararProdutoParaEnvio,
  useProdutosDaLoja,
  type ProdutoParaEnvio,
} from "@/hooks/inbox/useProdutosDaLoja";
import { priceLabel } from "@/lib/shop/product-message";
import type { ShopProduct } from "@/lib/shop/storefront";
import { Package } from "@/lib/ui/icons";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 选好的产品已经变成「图 + 文字」，交给输入框走平时发附件的那条路。 */
  onPick: (produto: ProdutoParaEnvio) => void;
}

function Miniatura({ product }: { product: ShopProduct }) {
  const src = product.photos[0];
  if (!src) {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted">
        <Package size={22} weight="duotone" className="text-primary" aria-hidden />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- 限时签名链接，不经过 next/image 的域名白名单
  return <img src={src} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-md bg-muted object-cover" />;
}

/**
 * 加号菜单的「产品」：从产品库里挑一个发给客户。
 *
 * 这里只负责挑。挑完以后产品图进入平时的附件预览框，名称、价格和产品页链接是
 * 图片说明——人看过、改过再点发送，和发一张普通图片完全一样。
 */
export function ProductPickerDialog({ open, onOpenChange, onPick }: Props) {
  const t = useT();
  const loja = useProdutosDaLoja(open);
  const [busca, setBusca] = useState("");
  const [preparando, setPreparando] = useState<string | null>(null);
  const produtos = filtrarProdutos(loja?.products ?? [], busca);

  async function escolher(product: ShopProduct, slug: string) {
    setPreparando(product.id);
    try {
      onPick(await prepararProdutoParaEnvio(product, slug));
      onOpenChange(false);
    } catch (erro) {
      showApiError(erro);
    } finally {
      setPreparando(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Enviar produto")}</DialogTitle>
          <DialogDescription>{t("Escolha um produto. Você revisa a foto e o texto antes de enviar.")}</DialogDescription>
        </DialogHeader>
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={t("Buscar produto no catálogo…")}
          aria-label={t("Buscar produto no catálogo…")}
        />
        <div className="max-h-80 overflow-y-auto rounded-md border border-border">
          {produtos.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t(loja ? "Nenhum produto encontrado para essa busca" : "Carregando…")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {produtos.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    disabled={preparando !== null}
                    aria-busy={preparando === product.id}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                    onClick={() => void escolher(product, loja?.slug ?? "")}
                  >
                    <Miniatura product={product} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{product.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[product.brand, product.category, priceLabel(product)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

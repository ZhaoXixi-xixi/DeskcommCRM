"use client";

import { paraFormatoAceito } from "@/lib/imagens/para-jpeg";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { queryDaTela } from "@/lib/catalogo/busca-da-tela";
import { MAXIMO_DE_FOTOS } from "@/lib/catalogo/fotos";
import { formatCents } from "@/lib/money";
import { productUrl } from "@/lib/shop/product-message";
import { precoParaCentavos, type Produto } from "@/lib/schemas/produtos";

import { EdicaoDoProduto } from "./_edicao";

interface Textos {
  titulo: string;
  subtitulo: string;
  vazio: string;
  vazioDica: string;
}

/** Fork 见外 — os números do catálogo inteiro, contados no servidor. */
export interface ResumoDoCatalogo {
  noCatalogo: number;
  aVenda: number;
  semFoto: number;
  semDescricao: number;
  semEstoque: number;
}

// O aviso do ERP da casa (amarelo claro, texto âmbar escuro). O `warning-bg` do
// produto é um âmbar a 12% que, sobre branco, sai bege — e bege está fora.
const AVISO_FUNDO = "bg-[#fff1c2] dark:bg-warning-bg";
const AVISO_TEXTO = "text-[#7a5a0c] dark:text-warning-fg";

function Bloco({ rotulo, valor, alerta = false, testid }: { rotulo: string; valor: number; alerta?: boolean; testid: string }) {
  return (
    <div
      className={`rounded-xl p-4 shadow-sm ring-1 ring-border/60 ${alerta && valor > 0 ? AVISO_FUNDO : "bg-card"}`}
      data-testid={testid}
    >
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${alerta && valor > 0 ? AVISO_TEXTO : ""}`}>{valor}</p>
    </div>
  );
}

function Etiqueta({ children, tom }: { children: React.ReactNode; tom: "ok" | "alerta" | "neutro" }) {
  const cor =
    tom === "ok" ? "bg-success-bg text-success-fg" : tom === "alerta" ? `${AVISO_FUNDO} ${AVISO_TEXTO}` : "bg-muted text-muted-foreground";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cor}`}>{children}</span>;
}

interface ResumoDaImportacao {
  total_linhas: number;
  criados: number;
  atualizados: number;
  /** Quantos produtos tiveram a descrição escrita pela planilha. */
  descricoes?: number;
  erros: Array<{ linha: number; motivo: string }>;
  colunas_ignoradas: string[];
}

interface Rascunho {
  codigo: string;
  nome: string;
  marca: string;
  categoria: string;
  capacidade: string;
  preco: string;
  custo: string;
  quantidade: string;
  controla_estoque: boolean;
  descricao: string;
}

const VAZIO: Rascunho = {
  codigo: "",
  nome: "",
  marca: "",
  categoria: "",
  capacidade: "",
  preco: "",
  custo: "",
  quantidade: "0",
  controla_estoque: true,
  descricao: "",
};

function doRascunho(
  r: Rascunho,
  t: (s: string) => string,
): Record<string, unknown> | { erro: string } {
  const preco_cents = precoParaCentavos(r.preco);
  if (preco_cents === null) return { erro: t("Preço inválido. Escreva assim: 5.499,00") };
  const custo_cents = r.custo.trim() === "" ? null : precoParaCentavos(r.custo);
  if (r.custo.trim() !== "" && custo_cents === null) return { erro: t("Custo inválido.") };

  return {
    codigo: r.codigo.trim(),
    nome: r.nome.trim(),
    ...(r.marca.trim() ? { marca: r.marca.trim() } : {}),
    ...(r.categoria.trim() ? { categoria: r.categoria.trim() } : {}),
    ...(r.capacidade.trim() ? { capacidade: r.capacidade.trim() } : {}),
    preco_cents,
    custo_cents,
    controla_estoque: r.controla_estoque,
    quantidade: Number(r.quantidade) || 0,
    ...(r.descricao.trim() ? { descricao: r.descricao.trim() } : {}),
  };
}

/**
 * As fotos de UM produto: pôr, tirar e trocar a ordem. A primeira é a capa, e é
 * na ordem daqui que o atendente de IA as manda ao cliente.
 *
 * Toda mudança vai ao servidor e volta pelo `router.refresh()`: as URLs são
 * assinadas pela página, e a lista que vale é a do banco.
 */
function FotosDoProduto({ produto, urls }: { produto: Produto; urls: Record<string, string> }) {
  const t = useT();
  const router = useRouter();
  const [ocupado, setOcupado] = React.useState(false);
  const entradaRef = React.useRef<HTMLInputElement>(null);
  const fotos = produto.fotos ?? [];

  async function subir(arquivo: File) {
    setOcupado(true);
    try {
      const form = new FormData();
      // WebP 等格式先在浏览器里转成 JPG：系统只存 JPG/PNG（WhatsApp 不把 WebP 当照片）。
      form.append("file", await paraFormatoAceito(arquivo));
      const res = await fetch(`/api/v1/products/${produto.id}/fotos`, { method: "POST", body: form });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(json?.error?.message ?? t("Não consegui enviar a foto."));
        return;
      }
      toast.success(t("Foto adicionada"));
      router.refresh();
    } catch {
      toast.error(t("Não consegui enviar a foto."));
    } finally {
      setOcupado(false);
      if (entradaRef.current) entradaRef.current.value = "";
    }
  }

  async function gravarOrdem(nova: string[], aviso: string) {
    setOcupado(true);
    try {
      await apiClient.put(`/api/v1/products/${produto.id}/fotos`, { fotos: nova });
      toast.success(aviso);
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setOcupado(false);
    }
  }

  function mover(i: number, delta: -1 | 1) {
    const nova = [...fotos];
    [nova[i], nova[i + delta]] = [nova[i + delta]!, nova[i]!];
    void gravarOrdem(nova, t("Ordem das fotos salva"));
  }

  return (
    <div className="border-t bg-muted/30 p-3" data-testid={`fotos-${produto.codigo}`}>
      <p className="mb-2 text-xs text-muted-foreground">
        {t("A primeira foto é a capa. O atendente de IA manda as fotos nesta ordem quando apresenta o produto.")}
      </p>
      <ul className="flex flex-wrap gap-3">
        {fotos.map((caminho, i) => (
          <li key={caminho} className="w-28" data-testid="foto-do-produto">
            {urls[caminho] ? (
              // URL assinada e curta, de outro host: `next/image` exigiria allowlist no build.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urls[caminho]}
                alt={`${produto.nome} — ${t("foto")} ${i + 1}`}
                className="h-28 w-28 rounded-md border object-cover"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-md border text-xs text-muted-foreground">
                {t("Sem prévia")}
              </div>
            )}
            <div className="mt-1 flex justify-between">
              <Button
                variant="ghost"
                size="sm"
                disabled={ocupado || i === 0}
                onClick={() => mover(i, -1)}
                aria-label={t("Mover a foto para a esquerda")}
              >
                ←
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={ocupado}
                onClick={() => void gravarOrdem(fotos.filter((c) => c !== caminho), t("Foto removida"))}
                aria-label={t("Remover a foto")}
                data-testid="remover-foto"
              >
                ✕
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={ocupado || i === fotos.length - 1}
                onClick={() => mover(i, 1)}
                aria-label={t("Mover a foto para a direita")}
              >
                →
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <input
        ref={entradaRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="arquivo-foto"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void subir(f);
        }}
      />
      <div className="mt-3 flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={ocupado || fotos.length >= MAXIMO_DE_FOTOS}
          onClick={() => entradaRef.current?.click()}
          data-testid="adicionar-foto"
        >
          {t(ocupado ? "Salvando…" : "Adicionar foto")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("JPG, PNG ou WebP, até 5 MB. No máximo 6 fotos. WebP é convertido para JPG.")}
        </span>
      </div>
    </div>
  );
}

export function ProdutosClient({
  inicial,
  total,
  pagina,
  porPagina,
  buscaInicial,
  urlsDasFotos,
  podeEditar,
  capacidadeLigada = false,
  apresentacaoLigada = false,
  fonteDoFeed = null,
  resumo: resumoDoCatalogo,
  slugDaLoja = null,
  textos,
}: {
  /** A página atual, já filtrada no servidor (ver `lib/catalogo/busca-da-tela.ts`). */
  inicial: Produto[];
  /** Quantos produtos casam com a busca no catálogo INTEIRO, não só nesta página. */
  total: number;
  pagina: number;
  porPagina: number;
  buscaInicial: string;
  urlsDasFotos: Record<string, string>;
  podeEditar: boolean;
  /** A chave da empresa (`capacidade_do_produto`). Desligada, o campo não aparece. */
  capacidadeLigada?: boolean;
  apresentacaoLigada?: boolean;
  /** A seção do módulo `catalogo_por_feed`; `null` com o módulo desligado. */
  fonteDoFeed?: React.ReactNode;
  /** Fork 见外 — os blocos do topo; sem ele (testes antigos) os blocos não aparecem. */
  resumo?: ResumoDoCatalogo;
  /** O slug da vitrine pública (`/shop/<slug>`), para copiar e abrir o link do produto. */
  slugDaLoja?: string | null;
  textos: Textos;
}) {
  const t = useT();
  const router = useRouter();
  const [busca, setBusca] = React.useState(buscaInicial);
  const [carregando, iniciarNavegacao] = React.useTransition();

  // A URL pode mudar sem passar pela caixa: Voltar/Avançar do navegador, ou um
  // link. A página não remonta quando só as searchParams mudam, então a caixa
  // precisa acompanhar — senão o debounce abaixo via a caixa diferente da URL e
  // mandava de volta para a busca antiga. Quando a URL muda POR CAUSA da caixa
  // (o termo já é o mesmo, sem os espaços das pontas), nada a fazer: reescrever
  // a caixa tiraria o espaço que a pessoa acabou de digitar.
  const [buscaDaUrl, setBuscaDaUrl] = React.useState(buscaInicial);
  if (buscaInicial !== buscaDaUrl) {
    setBuscaDaUrl(buscaInicial);
    if (busca.trim() !== buscaInicial) setBusca(buscaInicial);
  }
  const [criando, setCriando] = React.useState(false);
  const [rascunho, setRascunho] = React.useState<Rascunho>(VAZIO);
  const [salvando, setSalvando] = React.useState(false);
  const [importando, setImportando] = React.useState(false);
  const [resumo, setResumo] = React.useState<ResumoDaImportacao | null>(null);
  const arquivoRef = React.useRef<HTMLInputElement>(null);
  const [fotosAbertas, setFotosAbertas] = React.useState<string | null>(null);
  const [editando, setEditando] = React.useState<string | null>(null);

  // A busca vai à URL — e a URL, ao servidor, que procura no catálogo INTEIRO.
  // Antes ela filtrava no navegador só os 500 que a página tinha trazido.
  const irPara = React.useCallback(
    (termo: string, novaPagina: number) => {
      const destino = queryDaTela(termo, novaPagina) || "?";
      iniciarNavegacao(() => router.replace(destino, { scroll: false }));
    },
    [router],
  );

  React.useEffect(() => {
    if (busca.trim() === buscaInicial) return;
    // Espera a pessoa parar de digitar: cada consulta conta o catálogo inteiro.
    const timer = window.setTimeout(() => irPara(busca, 1), 350);
    return () => window.clearTimeout(timer);
  }, [busca, buscaInicial, irPara]);

  const primeiro = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const ultimo = Math.min(pagina * porPagina, total);

  async function salvar() {
    const corpo = doRascunho(rascunho, t);
    if ("erro" in corpo) {
      toast.error(corpo.erro as string);
      return;
    }
    setSalvando(true);
    try {
      await apiClient.post("/api/v1/products", corpo);
      toast.success(t("Produto cadastrado"));
      setRascunho(VAZIO);
      setCriando(false);
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  async function importar(arquivo: File) {
    setImportando(true);
    setResumo(null);
    try {
      const form = new FormData();
      form.append("file", arquivo);
      const res = await fetch("/api/v1/products/import", { method: "POST", body: form });
      const json = (await res.json()) as
        | { data: ResumoDaImportacao }
        | { error?: { message?: string } };
      if (!res.ok || !("data" in json)) {
        const msg = "error" in json ? json.error?.message : undefined;
        toast.error(msg ?? t("Não consegui ler essa planilha."));
        return;
      }
      // O resumo fica NA TELA, não num toast que some em 4 segundos: quem
      // importou 300 produtos precisa ler quais linhas foram recusadas e por quê.
      setResumo(json.data);
      router.refresh();
    } catch {
      toast.error(t("Não consegui enviar o arquivo."));
    } finally {
      setImportando(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  }

  function linkDoProduto(p: Produto): string | null {
    if (!slugDaLoja || typeof window === "undefined") return null;
    return productUrl(window.location.origin, slugDaLoja, p.codigo);
  }

  async function copiarLink(p: Produto) {
    const link = linkDoProduto(p);
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t("Link copiado"));
    } catch {
      toast.error(link);
    }
  }

  async function alternarAtivo(p: Produto) {
    try {
      await apiClient.patch(`/api/v1/products/${p.id}`, { ativo: !p.ativo });
      toast.success(t(p.ativo ? "Produto desativado" : "Produto reativado"));
      router.refresh();
    } catch (e) {
      showApiError(e);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-6" data-testid="tela-produtos">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{textos.titulo}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{textos.subtitulo}</p>
      </header>

      {resumoDoCatalogo ? (
        <section className="mb-6" data-testid="resumo-do-catalogo">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Bloco rotulo={t("No catálogo")} valor={resumoDoCatalogo.noCatalogo} testid="bloco-no-catalogo" />
            <Bloco rotulo={t("À venda")} valor={resumoDoCatalogo.aVenda} testid="bloco-a-venda" />
            <Bloco rotulo={t("Faltando foto")} valor={resumoDoCatalogo.semFoto} alerta testid="bloco-sem-foto" />
            <Bloco rotulo={t("Faltando descrição")} valor={resumoDoCatalogo.semDescricao} alerta testid="bloco-sem-descricao" />
            <Bloco rotulo={t("Estoque zerado")} valor={resumoDoCatalogo.semEstoque} alerta testid="bloco-sem-estoque" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Faltas contadas só entre os produtos à venda: sem foto ou descrição, o atendente de IA tem menos o que mostrar ao cliente.")}
          </p>
        </section>
      ) : null}

      {fonteDoFeed}

      <div className="mb-4 flex items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={t("Buscar por nome, código ou marca")}
          className="h-9 w-full max-w-sm rounded-md border bg-card px-3 text-sm"
          data-testid="busca-produto"
        />
        {podeEditar ? (
          <>
            <Button onClick={() => setCriando((v) => !v)} data-testid="novo-produto">
              {t(criando ? "Cancelar" : "Novo produto")}
            </Button>
            <input
              ref={arquivoRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              data-testid="arquivo-planilha"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importar(f);
              }}
            />
            <Button
              variant="outline"
              disabled={importando}
              onClick={() => arquivoRef.current?.click()}
              data-testid="importar-planilha"
            >
              {t(importando ? "Importando…" : "Importar planilha")}
            </Button>
          </>
        ) : null}
      </div>

      {podeEditar ? (
        // Rota de API que devolve o arquivo com `content-disposition:
        // attachment` — é download, não navegação de página, e `<Link>` do Next
        // faria navegação de cliente para algo que não é tela.
        <div className="mb-4">
          <a
            href="/api/v1/products/import"
            download="modelo-catalogo.csv"
            className="inline-block text-xs text-muted-foreground underline"
            data-testid="modelo-planilha"
          >
            {t("Baixar planilha modelo")}
          </a>
          <p className="mt-1 break-words text-xs text-muted-foreground" data-testid="formato-da-foto">
            {t(
              "Na coluna foto, cole o link da imagem (JPG ou PNG, até 5 MB). Para até 6 fotos, separe os links com | — a primeira é a capa.",
            )}
          </p>
        </div>
      ) : null}

      {resumo ? (
        <div className="mb-6 rounded-lg border p-4 text-sm" data-testid="resumo-importacao">
          <p className="font-medium">
            {resumo.criados} {t("novos")} · {resumo.atualizados} {t("atualizados")} ·{" "}
            {resumo.total_linhas} {t("linhas na planilha")}
          </p>
          {resumo.descricoes ? (
            <p className="mt-1 text-muted-foreground" data-testid="resumo-descricoes">
              {t("Descrição escrita pela planilha em {quantidade} produto(s).").replace(
                "{quantidade}",
                String(resumo.descricoes),
              )}
            </p>
          ) : null}
          {resumo.colunas_ignoradas.length > 0 ? (
            <p className="mt-2 text-muted-foreground">
              {t("Não usei estas colunas:")} {resumo.colunas_ignoradas.join(", ")}.
            </p>
          ) : null}
          {resumo.erros.length > 0 ? (
            <div className="mt-3">
              <p className="font-medium">{t("Linhas que não entraram:")}</p>
              <ul className="mt-1 space-y-0.5 wrap-anywhere text-muted-foreground">
                {resumo.erros.slice(0, 20).map((e) => (
                  <li key={`${e.linha}-${e.motivo}`}>
                    {t("Linha")} {e.linha}: {e.motivo}
                  </li>
                ))}
              </ul>
              {resumo.erros.length > 20 ? (
                <p className="mt-1 text-muted-foreground">
                  {t("…e mais")} {resumo.erros.length - 20}.
                </p>
              ) : null}
            </div>
          ) : null}
          <button className="mt-3 text-xs underline" onClick={() => setResumo(null)}>
            {t("Fechar")}
          </button>
        </div>
      ) : null}

      {criando && podeEditar ? (
        <div className="mb-6 rounded-lg border p-4" data-testid="form-produto">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              {t("Código")}
              <input
                value={rascunho.codigo}
                onChange={(e) => setRascunho({ ...rascunho, codigo: e.target.value })}
                className="mt-1 h-9 w-full rounded-md border px-3"
                data-testid="produto-codigo"
              />
            </label>
            <label className="text-sm">
              {t("Nome")}
              <input
                value={rascunho.nome}
                onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
                className="mt-1 h-9 w-full rounded-md border px-3"
                data-testid="produto-nome"
              />
            </label>
            <label className="text-sm">
              {t("Marca")}
              <input
                value={rascunho.marca}
                onChange={(e) => setRascunho({ ...rascunho, marca: e.target.value })}
                className="mt-1 h-9 w-full rounded-md border px-3"
              />
            </label>
            <label className="text-sm">
              {t("Categoria")}
              <input
                value={rascunho.categoria}
                onChange={(e) => setRascunho({ ...rascunho, categoria: e.target.value })}
                className="mt-1 h-9 w-full rounded-md border px-3"
              />
            </label>
            {capacidadeLigada ? (
              <label className="text-sm">
                {t("Capacidade")} <span className="text-muted-foreground">{t("(opcional)")}</span>
                <input
                  value={rascunho.capacidade}
                  onChange={(e) => setRascunho({ ...rascunho, capacidade: e.target.value })}
                  placeholder={t("Ex.: 128GB")}
                  maxLength={60}
                  className="mt-1 h-9 w-full rounded-md border px-3"
                  data-testid="produto-capacidade"
                />
              </label>
            ) : null}
            <label className="text-sm">
              {t("Preço de venda")}
              <input
                value={rascunho.preco}
                onChange={(e) => setRascunho({ ...rascunho, preco: e.target.value })}
                placeholder="450.00"
                className="mt-1 h-9 w-full rounded-md border px-3"
                data-testid="produto-preco"
              />
            </label>
            <label className="text-sm">
              {t("Custo")} <span className="text-muted-foreground">{t("(opcional)")}</span>
              <input
                value={rascunho.custo}
                onChange={(e) => setRascunho({ ...rascunho, custo: e.target.value })}
                placeholder="300.00"
                className="mt-1 h-9 w-full rounded-md border px-3"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {t("Serve para o atendente saber até onde pode negociar. Não aparece para o cliente.")}
              </span>
            </label>
          </div>

          <label className="mt-3 block text-sm">
            {t("Descrição")} <span className="text-muted-foreground">{t("(opcional)")}</span>
            <textarea
              value={rascunho.descricao}
              onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
              maxLength={2000}
              rows={3}
              className="mt-1 w-full rounded-md border px-3 py-2"
              data-testid="produto-descricao"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("É o que o atendente de IA conta ao cliente: para que serve, medidas, materiais, diferenciais. Ele repete o que estiver aqui — e não inventa o que faltar.")}
            </span>
          </label>

          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rascunho.controla_estoque}
              onChange={(e) => setRascunho({ ...rascunho, controla_estoque: e.target.checked })}
              data-testid="produto-controla-estoque"
            />
            {t("Controlar estoque deste produto")}
          </label>
          {rascunho.controla_estoque ? (
            <label className="mt-2 block text-sm">
              {t("Quantidade")}
              <input
                value={rascunho.quantidade}
                onChange={(e) => setRascunho({ ...rascunho, quantidade: e.target.value })}
                className="mt-1 h-9 w-32 rounded-md border px-3"
              />
            </label>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                "Sem controle de estoque, este produto sempre aparece como disponível para o atendente — é o certo para item sob encomenda ou fracionado.",
              )}
            </p>
          )}

          <div className="mt-4">
            <Button onClick={salvar} disabled={salvando} data-testid="salvar-produto">
              {t(salvando ? "Salvando…" : "Salvar produto")}
            </Button>
          </div>
        </div>
      ) : null}

      {inicial.length === 0 && buscaInicial !== "" ? (
        <div className="rounded-lg border border-dashed p-8 text-center" data-testid="produtos-busca-vazia">
          <p className="font-medium">{t("Nenhum produto encontrado para essa busca")}</p>
        </div>
      ) : inicial.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center" data-testid="produtos-vazio">
          <p className="font-medium">{textos.vazio}</p>
          <p className="mt-1 text-sm text-muted-foreground">{textos.vazioDica}</p>
        </div>
      ) : (
        <ul
          className={`divide-y overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border/60 ${carregando ? "opacity-60" : ""}`}
          aria-busy={carregando}
          data-testid="lista-produtos"
        >
          {inicial.map((p) => {
            const capa = p.fotos?.[0] ? urlsDasFotos[p.fotos[0]] : undefined;
            return (
            <li key={p.id} data-testid={`produto-${p.codigo}`}>
            {/*
              A linha não cabia em 375 px: preço (shrink-0) + os três botões de
              ação somam mais que a largura útil, e a coluna do nome — `flex-1`
              com `min-w-0` — encolhia até 0 px, levando o nome junto. Abaixo de
              `md` a linha passa a quebrar: nome e preço em cima, ações embaixo,
              ancoradas à direita e com `flex-wrap` próprio se ainda faltar
              espaço. Tudo em `max-md:` — de `md` para cima a lista é a de sempre.
            */}
            <div
              className="flex items-center gap-4 p-3 max-md:flex-wrap max-md:gap-x-3 max-md:gap-y-1"
            >
              {capa ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={capa} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] text-muted-foreground">
                  {t("Sem foto")}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className={`truncate font-medium ${p.ativo ? "" : "text-muted-foreground line-through"}`}>
                  {p.nome}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {p.codigo}
                  {p.marca ? ` · ${p.marca}` : ""}
                  {capacidadeLigada && p.capacidade ? ` · ${p.capacidade}` : ""}
                  {p.controla_estoque
                    ? ` · ${p.quantidade} ${t("em estoque")}`
                    : ` · ${t("sem controle de estoque")}`}
                </p>
                {/* Sem foto ou descrição, o atendente de IA só sabe nome e preço: a lista diz onde falta. */}
                <p className="mt-1 flex flex-wrap gap-1">
                  {p.ativo ? <Etiqueta tom="ok">{t("À venda")}</Etiqueta> : <Etiqueta tom="neutro">{t("Fora de venda")}</Etiqueta>}
                  {p.ativo ? (
                    <>
                    {!p.fotos?.length ? <Etiqueta tom="alerta">{t("Faltando foto")}</Etiqueta> : null}
                    {!p.descricao?.trim() ? <Etiqueta tom="alerta">{t("Faltando descrição")}</Etiqueta> : null}
                    {p.controla_estoque && p.quantidade <= 0 ? <Etiqueta tom="alerta">{t("Estoque zerado")}</Etiqueta> : null}
                    </>
                  ) : null}
                </p>
              </div>
              <span className="shrink-0 text-base font-semibold tabular-nums">
                {formatCents(p.preco_cents, p.moeda)}
              </span>
              {podeEditar ? (
                // Grupo próprio para as ações: sozinhas elas não cabem ao lado do
                // preço em 375 px, e como itens soltos da linha quebravam em
                // qualquer lugar. Aqui elas descem juntas (w-full abaixo de `md`)
                // e, se nem assim couberem, quebram entre si em vez de vazar.
                <div
                  className="flex items-center gap-4 max-md:w-full max-md:flex-wrap max-md:justify-end max-md:gap-x-2 max-md:gap-y-1"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditando((v) => (v === p.id ? null : p.id))}
                    aria-expanded={editando === p.id}
                    data-testid={`editar-${p.codigo}`}
                  >
                    {t("Editar")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFotosAbertas((v) => (v === p.id ? null : p.id))}
                    aria-expanded={fotosAbertas === p.id}
                    data-testid={`abrir-fotos-${p.codigo}`}
                  >
                    {t("Fotos")} ({p.fotos?.length ?? 0})
                  </Button>
                  {p.ativo && slugDaLoja ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => void copiarLink(p)} data-testid={`copiar-link-${p.codigo}`}>
                        {t("Copiar link")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const link = linkDoProduto(p);
                          if (link) window.open(link, "_blank", "noopener");
                        }}
                        data-testid={`vitrine-${p.codigo}`}
                      >
                        {t("Ver na vitrine")}
                      </Button>
                    </>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void alternarAtivo(p)}
                    data-testid={`alternar-${p.codigo}`}
                  >
                    {t(p.ativo ? "Desativar" : "Reativar")}
                  </Button>
                </div>
              ) : null}
            </div>
            {podeEditar && fotosAbertas === p.id ? (
              <FotosDoProduto produto={p} urls={urlsDasFotos} />
            ) : null}
            {podeEditar && editando === p.id ? (
              // `key` porque o painel fica na MESMA posição do DOM ao trocar de
              // produto: sem ela o React reaproveita o estado e o formulário
              // abriria preenchido com o produto anterior.
              <EdicaoDoProduto
                key={p.id}
                produto={p}
                capacidadeLigada={capacidadeLigada}
                urlsDasFotos={urlsDasFotos}
                apresentacaoLigada={apresentacaoLigada}
                aoFechar={() => setEditando(null)}
              />
            ) : null}
            </li>
            );
          })}
        </ul>
      )}

      {total > 0 ? (
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground" data-testid="paginacao-produtos">
          <span className="tabular-nums" data-testid="contagem-produtos">
            {primeiro}–{ultimo} {t("de")} {total}
          </span>
          {total > porPagina ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina <= 1 || carregando}
                onClick={() => irPara(busca, pagina - 1)}
                data-testid="pagina-anterior"
              >
                {t("Página anterior")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={ultimo >= total || carregando}
                onClick={() => irPara(busca, pagina + 1)}
                data-testid="proxima-pagina"
              >
                {t("Próxima página")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

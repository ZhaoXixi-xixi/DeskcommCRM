import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { priceLabel } from "@/lib/shop/product-message";
import type { ShopPhoto } from "@/lib/shop/photos";
import { loadShop, type Shop, type ShopProduct } from "@/lib/shop/storefront";

/**
 * 公开产品展示页：/shop/<组织 slug>
 *
 * 给海外客户看的，所以页面文字是英文、不走后台的界面词典。纯服务端渲染、不带客户端脚本：
 * 分类（?c=）和产品详情（?p=）都是普通链接，聊天里发出去的链接点开就是对应的那一屏。
 */

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;
type Query = Promise<{ c?: string; p?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const shop = await loadShop({ slug: (await params).slug });
  return { title: { absolute: shop ? `${shop.name} — Products` : "Products" }, robots: { index: false } };
}

// ------------------------------------------------------------------ 小工具

function formatPrice(product: ShopProduct): string {
  return priceLabel(product) ?? "Ask for price";
}

function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function shopHref(slug: string, query: { c?: string; p?: string }): string {
  const search = new URLSearchParams(Object.entries(query).filter(([, value]) => !!value) as [string, string][]);
  const suffix = search.toString();
  return `/shop/${slug}${suffix ? `?${suffix}` : ""}`;
}

// ------------------------------------------------------------------ 组件

function Photo({ src, alt, className }: { src: string | undefined; alt: string; className: string }) {
  if (!src) {
    return <div className={`${className} grid place-items-center bg-neutral-100 text-sm text-neutral-400`}>No photo</div>;
  }
  // eslint-disable-next-line @next/next/no-img-element -- 限时签名链接，不经过 next/image 的域名白名单
  return <img src={src} alt={alt} loading="lazy" className={`${className} bg-neutral-100 object-cover`} />;
}

function WhatsappButton({ phone, text, label }: { phone: string | null; text: string; label: string }) {
  if (!phone) return null;
  return (
    <a
      href={whatsappLink(phone, text)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-11 items-center justify-center rounded-full bg-[#111817] px-6 text-sm font-semibold text-white transition hover:bg-neutral-700"
    >
      {label}
    </a>
  );
}

function Header({ slug, shop }: { slug: string; shop: Shop }) {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href={shopHref(slug, {})} className="text-lg font-bold tracking-wide text-neutral-900">
          {shop.name}
        </Link>
        <WhatsappButton phone={shop.whatsapp} text="Hi! I have a question about your products." label="Chat on WhatsApp" />
      </div>
    </header>
  );
}

function CategoryChips({ slug, shop, active }: { slug: string; shop: Shop; active: string | undefined }) {
  const chips = [{ label: "All", value: undefined as string | undefined }, ...shop.categories.map((c) => ({ label: c, value: c }))];
  return (
    <nav aria-label="Categories" className="flex gap-2 overflow-x-auto pb-1">
      {chips.map((chip) => (
        <Link
          key={chip.label}
          href={shopHref(slug, { c: chip.value })}
          aria-current={chip.value === active ? "page" : undefined}
          className={`shrink-0 rounded-full border px-4 py-1.5 text-sm transition ${
            chip.value === active
              ? "border-[#111817] bg-[#111817] text-white"
              : "border-neutral-300 text-neutral-700 hover:border-neutral-500"
          }`}
        >
          {chip.label}
        </Link>
      ))}
    </nav>
  );
}

function ProductCard({ slug, product, category }: { slug: string; product: ShopProduct; category: string | undefined }) {
  return (
    <Link href={shopHref(slug, { c: category, p: product.code })} className="group block">
      <Photo src={product.photos[0]?.thumb} alt={product.name} className="aspect-square w-full rounded-2xl transition group-hover:opacity-90" />
      <h2 className="mt-3 line-clamp-2 text-sm font-medium text-neutral-900">{product.name}</h2>
      <p className="mt-1 text-sm font-semibold text-neutral-900">{formatPrice(product)}</p>
    </Link>
  );
}

function ProductGrid({ slug, products, category }: { slug: string; products: ShopProduct[]; category: string | undefined }) {
  if (products.length === 0) {
    return <p className="py-24 text-center text-neutral-500">No products here yet. Please check back soon.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} slug={slug} product={product} category={category} />
      ))}
    </div>
  );
}

/** 一排几张：一张独占一行，两张并排，三张及以上一排三张（五张图正好两排）。 */
const GALLERY_COLUMNS = ["grid-cols-1", "grid-cols-2", "grid-cols-3"] as const;
const GALLERY_ID = "photos";

/**
 * 点开的大图：不用脚本，靠链接的 #锚点 显示（CSS 的 :target）。
 * 整个黑色遮罩就是「关闭」链接，点任何地方都回到图片区；浏览器的返回键也能关。
 * 大图平时是隐藏的，浏览器不会提前下载，点开才加载。
 */
function Lightbox({ id, photo, alt }: { id: string; photo: ShopPhoto; alt: string }) {
  return (
    <a
      id={id}
      href={`#${GALLERY_ID}`}
      aria-label="Close photo"
      className="fixed inset-0 z-50 hidden cursor-zoom-out items-center justify-center bg-black/90 p-4 target:flex"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 限时签名链接，不经过 next/image 的域名白名单 */}
      <img src={photo.full} alt={alt} loading="lazy" className="max-h-full max-w-full rounded-lg object-contain" />
    </a>
  );
}

function Gallery({ product }: { product: ShopProduct }) {
  if (product.photos.length === 0) {
    return <Photo src={undefined} alt={product.name} className="aspect-square w-full rounded-2xl" />;
  }
  const columns = GALLERY_COLUMNS[Math.min(product.photos.length, GALLERY_COLUMNS.length) - 1];
  return (
    <div id={GALLERY_ID} className={`grid scroll-mt-20 content-start gap-2 ${columns}`}>
      {product.photos.map((photo, index) => {
        const alt = `${product.name} photo ${index + 1}`;
        return (
          <div key={photo.thumb}>
            <a href={`#photo-${index + 1}`} aria-label={`Open ${alt}`} className="block cursor-zoom-in">
              <Photo src={photo.thumb} alt={alt} className="aspect-square w-full rounded-xl transition hover:opacity-90" />
            </a>
            <Lightbox id={`photo-${index + 1}`} photo={photo} alt={alt} />
          </div>
        );
      })}
    </div>
  );
}

function ProductDetail({ slug, shop, product, category }: { slug: string; shop: Shop; product: ShopProduct; category: string | undefined }) {
  return (
    <article className="grid gap-8 md:grid-cols-2">
      <Gallery product={product} />
      <div>
        <Link href={shopHref(slug, { c: category })} className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Back to products
        </Link>
        <p className="mt-6 text-xs font-semibold tracking-widest text-neutral-500 uppercase">{product.brand ?? product.category}</p>
        <h1 className="mt-2 text-2xl font-bold text-neutral-900">{product.name}</h1>
        <p className="mt-3 text-xl font-semibold text-neutral-900">{formatPrice(product)}</p>
        {product.description && <p className="mt-5 leading-relaxed whitespace-pre-line text-neutral-700">{product.description}</p>}
        <div className="mt-8">
          <WhatsappButton phone={shop.whatsapp} text={`Hi! I'm interested in "${product.name}".`} label="Ask about this item" />
        </div>
      </div>
    </article>
  );
}

// ------------------------------------------------------------------ 页面

export default async function ShopPage({ params, searchParams }: { params: Params; searchParams: Query }) {
  const { slug } = await params;
  const { c: category, p: productId } = await searchParams;
  const shop = await loadShop({ slug });
  if (!shop) notFound();

  // ?p= 认产品编码，也认内部 id：AI 和客服发的链接用编码，旧链接用 id。
  const selected = shop.products.find((product) => product.code === productId || product.id === productId);
  const visible = category ? shop.products.filter((product) => product.category === category) : shop.products;

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <Header slug={slug} shop={shop} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {selected ? (
          <ProductDetail slug={slug} shop={shop} product={selected} category={category} />
        ) : (
          <>
            <CategoryChips slug={slug} shop={shop} active={category} />
            <ProductGrid slug={slug} products={visible} category={category} />
          </>
        )}
      </main>
    </div>
  );
}

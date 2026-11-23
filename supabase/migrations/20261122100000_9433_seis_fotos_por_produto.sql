-- manifest: O produto passa a guardar até 6 fotos (eram 5): a vitrine mostra 3 por fileira, e 6 fecham duas fileiras inteiras. O CHECK é recriado com nome sem número (`catalog_products_fotos_no_maximo`), para o próximo ajuste não deixar um nome que mente.
--
-- 9433 — 每个产品最多 6 张图（原来 5 张）。
--
-- 展示页的产品详情一排放 3 张图，5 张的上限让第二排永远缺一张。上限和
-- `lib/catalogo/fotos.ts` 里的 `MAXIMO_DE_FOTOS` 必须是同一个数。
-- 可重复执行：两个名字的约束都先删再建。

alter table public.catalog_products
  drop constraint if exists catalog_products_fotos_no_maximo_5;
alter table public.catalog_products
  drop constraint if exists catalog_products_fotos_no_maximo;
alter table public.catalog_products
  add constraint catalog_products_fotos_no_maximo check (cardinality(fotos) <= 6);

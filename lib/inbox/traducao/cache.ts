/**
 * 译文缓存：同一句话翻成同一种语言只花一次钱。
 *
 * 放在 Redis（安装自带），不动 messages 表：译文是「给这位读者看的」，不是消息
 * 本身的属性，写进消息会触发实时推送和一连串触发器。Redis 不通时退回进程内存，
 * 翻译照常工作，只是重启后要重翻。
 */
import "server-only";

import { createHash } from "node:crypto";

import { Redis } from "@upstash/redis";

import { env } from "@/lib/env";
import { validarConfigRedisRest } from "@/lib/redis-config";

const VALIDADE_EM_SEGUNDOS = 90 * 24 * 60 * 60;
const ESPERA_MAXIMA_MS = 2_000;
const MAXIMO_NA_MEMORIA = 5_000;

const memoria = new Map<string, string>();
let cliente: Redis | null | undefined;

// ------------------------------------------------------------------ 内部

function redis(): Redis | null {
  if (cliente !== undefined) return cliente;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  cliente = validarConfigRedisRest(url, token).ok ? new Redis({ url, token, automaticDeserialization: false }) : null;
  return cliente;
}

/** Redis 挂住时不让整个翻译请求跟着挂：超时或出错都当作「没拿到」。 */
async function semTravar<T>(operacao: Promise<T>): Promise<T | null> {
  const limite = new Promise<null>((resolve) => setTimeout(() => resolve(null), ESPERA_MAXIMA_MS));
  return Promise.race([operacao.catch(() => null), limite]);
}

function chave(idioma: string, texto: string): string {
  return `traducao:v1:${createHash("sha256").update(`${idioma}\n${texto}`).digest("hex")}`;
}

function guardarNaMemoria(k: string, traducao: string): void {
  if (memoria.size >= MAXIMO_NA_MEMORIA) memoria.clear();
  memoria.set(k, traducao);
}

// ------------------------------------------------------------------ 对外

/** 按顺序返回每句的译文；没缓存过的位置是 null。 */
export async function lerTraducoes(idioma: string, textos: readonly string[]): Promise<(string | null)[]> {
  const chaves = textos.map((texto) => chave(idioma, texto));
  const r = redis();
  const doRedis = r && chaves.length > 0 ? await semTravar(r.mget<(string | null)[]>(...chaves)) : null;
  return chaves.map((k, i) => {
    const valor = doRedis?.[i] ?? memoria.get(k) ?? null;
    return typeof valor === "string" ? valor : null;
  });
}

export async function guardarTraducoes(idioma: string, pares: readonly (readonly [texto: string, traducao: string])[]): Promise<void> {
  const r = redis();
  await Promise.all(
    pares.map(([texto, traducao]) => {
      const k = chave(idioma, texto);
      guardarNaMemoria(k, traducao);
      return r ? semTravar(r.set(k, traducao, { ex: VALIDADE_EM_SEGUNDOS })) : null;
    }),
  );
}

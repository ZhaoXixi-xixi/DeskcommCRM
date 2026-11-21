/**
 * 聊天翻译：哪句话需要翻、翻成什么语言。
 *
 * 这个文件前后端共用，所以只放纯函数，不碰网络和数据库。
 */

// ------------------------------------------------------------------ 语言表

/**
 * 每种界面语言自己的文字。
 *
 * 只登记「光看文字就能认出这句已经是我的语言」的语言：中文靠汉字就能认。
 * 葡语、英语、西语共用拉丁字母，光看字母分不出来，所以不登记、不自动翻译，
 * 免得把本来就看得懂的话再翻一遍。
 */
const ESCRITA_DO_IDIOMA: Readonly<Record<string, RegExp>> = {
  "zh-CN": /\p{Script=Han}/gu,
};

/** 写进提示词的语言名。没登记的语言直接用代码，模型也认得。 */
const NOME_DO_IDIOMA: Readonly<Record<string, string>> = {
  "zh-CN": "Simplified Chinese",
  "pt-BR": "Brazilian Portuguese",
  en: "English",
  es: "Spanish",
  tr: "Turkish",
};

/** 一句话里自己文字占到这个比例，就算「已经是这门语言」。 */
const PROPORCAO_MINIMA = 0.3;

/** 单次请求最多带多少句、每句最长多少字。前后端用同一组数字。 */
export const MAXIMO_DE_TEXTOS = 20;
export const MAXIMO_DE_CARACTERES = 4000;

// ------------------------------------------------------------------ 判断

export function nomeDoIdioma(idioma: string): string {
  return NOME_DO_IDIOMA[idioma] ?? idioma;
}

function contar(texto: string, padrao: RegExp): number {
  return texto.match(padrao)?.length ?? 0;
}

/**
 * 这句话要不要翻译给使用 `idioma` 界面的人看。
 *
 * 纯表情、纯数字、纯链接没有字母，不用翻；已经大半是读者文字的也不用翻。
 */
export function precisaTraduzir(texto: string, idioma: string): boolean {
  const escrita = ESCRITA_DO_IDIOMA[idioma];
  const letras = contar(texto.replace(/https?:\/\/\S+/g, ""), /\p{L}/gu);
  if (!escrita || letras === 0 || texto.length > MAXIMO_DE_CARACTERES) return false;
  return contar(texto, escrita) / letras < PROPORCAO_MINIMA;
}

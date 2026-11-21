/**
 * 上传前把浏览器能打开、但系统不收的图片（WebP、AVIF、GIF、BMP……）转成 JPG。
 *
 * 系统只存 JPG 和 PNG，这不是随手定的：产品图会原样发到客户的 WhatsApp，而
 * WhatsApp 把 WebP 当成贴纸、不当成照片。所以不放宽存储格式，而是在上传这一步
 * 替人转好——从网上保存下来的产品图大多是 WebP，不该让人自己去找工具转。
 *
 * 只在浏览器里运行（用到 canvas）。
 */

const FORMATOS_ACEITOS: ReadonlySet<string> = new Set(["image/jpeg", "image/png"]);

/** 最长边超过这个值就等比缩小：手机上看产品图足够清晰，文件也不会超过 5 MB 的上限。 */
const LADO_MAXIMO = 2400;
const QUALIDADE_DO_JPEG = 0.9;

/** 透明的地方铺成白色：JPG 没有透明，不铺的话透明背景会变成黑色。 */
function desenharSobreBranco(imagem: ImageBitmap): HTMLCanvasElement {
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height));
  const tela = document.createElement("canvas");
  tela.width = Math.round(imagem.width * escala);
  tela.height = Math.round(imagem.height * escala);
  const pincel = tela.getContext("2d");
  if (!pincel) throw new Error("canvas_indisponivel");
  pincel.fillStyle = "#ffffff";
  pincel.fillRect(0, 0, tela.width, tela.height);
  pincel.drawImage(imagem, 0, 0, tela.width, tela.height);
  return tela;
}

function exportarJpeg(tela: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolver, rejeitar) => {
    tela.toBlob((blob) => (blob ? resolver(blob) : rejeitar(new Error("jpeg_nao_gerado"))), "image/jpeg", QUALIDADE_DO_JPEG);
  });
}

/**
 * JPG 和 PNG 原样返回；其他图片转成 JPG。
 *
 * 浏览器打不开的文件（不是图片，或文件已损坏）会抛错，由调用方提示。
 */
export async function paraFormatoAceito(arquivo: File): Promise<File> {
  if (FORMATOS_ACEITOS.has(arquivo.type)) return arquivo;
  const imagem = await createImageBitmap(arquivo);
  try {
    const jpeg = await exportarJpeg(desenharSobreBranco(imagem));
    return new File([jpeg], arquivo.name.replace(/\.[^.]*$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    imagem.close();
  }
}

import type { DocFormat } from "../types";

/** Open-license fonts with the same metrics as the fonts the .docx names. */
export const FONT_FILES: Record<DocFormat["font"], { regular: string; bold: string; name: string }> = {
  sans: { regular: "LiberationSans-Regular.ttf", bold: "LiberationSans-Bold.ttf", name: "Liberation Sans" },
  serif: { regular: "LiberationSerif-Regular.ttf", bold: "LiberationSerif-Bold.ttf", name: "Liberation Serif" },
  calibri: { regular: "Carlito-Regular.ttf", bold: "Carlito-Bold.ttf", name: "Carlito" },
};

export interface FontBytes {
  regular: Uint8Array;
  bold: Uint8Array;
}

const cache = new Map<string, Promise<FontBytes>>();

/** Browser loader: fonts are served from /public/fonts. */
export function loadFonts(font: DocFormat["font"]): Promise<FontBytes> {
  let p = cache.get(font);
  if (!p) {
    const get = async (file: string) => {
      const res = await fetch(`/fonts/${file}`);
      if (!res.ok) throw new Error(`Could not load the font file ${file}.`);
      return new Uint8Array(await res.arrayBuffer());
    };
    p = Promise.all([get(FONT_FILES[font].regular), get(FONT_FILES[font].bold)]).then(([regular, bold]) => ({ regular, bold }));
    p.catch(() => cache.delete(font));
    cache.set(font, p);
  }
  return p;
}

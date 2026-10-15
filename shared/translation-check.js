// Contrôle d'une traduction rendue par le modèle de langage : il lui arrive de glisser des caractères
// d'une autre écriture (« Laurent Mekies将继续… ») ou de recopier un texte japonais sans le traduire.
// Pour une langue en alphabet latin, tout caractère chinois, japonais, coréen, cyrillique, arabe,
// hébreu, thaï ou devanagari rend la traduction suspecte : elle est refaite autrement.
const LATIN = new Set(['fr', 'en', 'es', 'de', 'it', 'nl', 'pt']);
const FOREIGN = /[Ѐ-ӿ֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ㐀-䶿一-鿿가-힯ｦ-ﾟ]/;

export const badScript = (out, to) => LATIN.has(to) && FOREIGN.test(String(out || ''));

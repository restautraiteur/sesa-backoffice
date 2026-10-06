/**
 * Cellule CSV sûre : guillemets doublés, et texte qui commence par = + - @ (ou tabulation) précédé
 * d'une apostrophe, pour qu'Excel ne l'exécute pas comme une formule (« injection de formule ») :
 * les noms et les plats sont saisis par des visiteurs.
 */
export function csvCell(value: unknown) {
  let str = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(str) && !/^-?\d+([.,]\d+)?$/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
}

/** Texte inséré dans un tableau HTML (export .xls) : échappé et neutralisé comme en CSV. */
export function htmlCell(value: unknown) {
  let str = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(str) && !/^-?\d+([.,]\d+)?$/.test(str)) str = `'${str}`;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

import { downloadFile } from "@/features/admin/orders/export-orders";

/** Employé reconnu dans un fichier d'import. */
export type ImportedEmployee = { full_name: string; phone: string; email: string };

/**
 * Lecture des listes d'employés : CSV, copier-coller Excel / Google Sheets, fichier Excel (.xlsx)
 * ou lien Google Sheets partagé. Colonnes acceptées : « Nom ; Prénom ; Téléphone ; Email »
 * (modèle téléchargeable) ou « Nom complet ; Téléphone ; Email ».
 */

const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Tableau de cellules → employés (détecte la ligne d'en-tête si elle existe). */
export function rowsToEmployees(rows: string[][]): ImportedEmployee[] {
  const clean = rows
    .map((r) => r.map((c) => (c ?? "").toString().trim()))
    .filter((r) => r.some(Boolean));
  if (clean.length === 0) return [];
  const header = clean[0]!.map(norm);
  const find = (...keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)));
  const hasHeader = header.some((h) => /(nom|prenom|tel|phone|mail)/.test(h));
  let idx: { last: number; first: number; phone: number; email: number };
  if (hasHeader) {
    const first = find("prenom", "first");
    const phone = find("tel", "phone", "mobile");
    const email = find("mail");
    const last = header.findIndex((h, i) => i !== first && /(^nom|name|nom complet)/.test(h));
    idx = { last, first, phone, email };
  } else {
    // Sans en-tête : 4 colonnes = nom, prénom, téléphone, email ; 3 colonnes = nom complet, téléphone, email.
    const width = Math.max(...clean.map((r) => r.length));
    idx =
      width >= 4
        ? { last: 0, first: 1, phone: 2, email: 3 }
        : { last: 0, first: -1, phone: 1, email: 2 };
  }
  return (hasHeader ? clean.slice(1) : clean)
    .map((r) => {
      const last = idx.last >= 0 ? (r[idx.last] ?? "") : "";
      const first = idx.first >= 0 ? (r[idx.first] ?? "") : "";
      return {
        full_name: [first, last].filter(Boolean).join(" ").trim(),
        phone: (idx.phone >= 0 ? (r[idx.phone] ?? "") : "").replace(/\D/g, ""),
        email: (idx.email >= 0 ? (r[idx.email] ?? "") : "").trim(),
      };
    })
    .filter((e) => e.full_name.length >= 2 && e.phone.length >= 7);
}

/** Texte CSV / copier-coller (séparateur ; , ou tabulation) → lignes. */
export function parseDelimited(text: string): string[][] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length === 0) return [];
  const sample = lines[0]!;
  const sep = sample.includes("\t")
    ? "\t"
    : sample.split(";").length >= sample.split(",").length
      ? ";"
      : ",";
  return lines.map((line) => {
    const cells: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === sep && !quoted) {
        cells.push(cur);
        cur = "";
      } else cur += ch;
    }
    cells.push(cur);
    return cells;
  });
}

/* ------------------------------ Fichier .xlsx ----------------------------- */

async function inflate(data: Uint8Array) {
  const stream = new Blob([data.slice()])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Fichiers d'une archive zip (format des .xlsx), lus via le répertoire central. */
async function unzip(buffer: ArrayBuffer, wanted: (name: string) => boolean) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Fichier Excel illisible.");
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const files = new Map<string, string>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    const method = view.getUint16(ptr + 10, true);
    const size = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const local = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    if (wanted(name)) {
      const start =
        local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = bytes.subarray(start, start + size);
      files.set(name, decoder.decode(method === 8 ? await inflate(raw) : raw));
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/** Première feuille d'un classeur Excel (.xlsx) → lignes. */
export async function parseXlsx(file: File): Promise<string[][]> {
  const files = await unzip(await file.arrayBuffer(), (n) =>
    /^xl\/(sharedStrings\.xml|worksheets\/sheet1\.xml)$/.test(n),
  );
  const sheet = files.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("Aucune feuille trouvée dans ce fichier Excel.");
  const parser = new DOMParser();
  const shared = [
    ...parser
      .parseFromString(files.get("xl/sharedStrings.xml") ?? "<sst/>", "application/xml")
      .getElementsByTagName("si"),
  ].map((si) => [...si.getElementsByTagName("t")].map((t) => t.textContent ?? "").join(""));
  const doc = parser.parseFromString(sheet, "application/xml");
  return [...doc.getElementsByTagName("row")].map((row) => {
    const out: string[] = [];
    for (const c of row.getElementsByTagName("c")) {
      const ref = c.getAttribute("r") ?? "";
      const col =
        [...ref.replace(/\d/g, "")].reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const type = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      const inline = c.getElementsByTagName("t")[0]?.textContent ?? "";
      out[col >= 0 ? col : out.length] =
        type === "s" ? (shared[Number(v)] ?? "") : type === "inlineStr" ? inline : v;
    }
    return Array.from(out, (x) => x ?? "");
  });
}

/* ------------------------------ Google Sheets ----------------------------- */

/** Lien de partage Google Sheets (« tous les utilisateurs disposant du lien ») → lignes. */
export async function fetchGoogleSheet(url: string): Promise<string[][]> {
  const id = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1];
  if (!id) throw new Error("Lien Google Sheets non reconnu.");
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1] ?? "0";
  const res = await fetch(
    `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`,
  );
  if (!res.ok)
    throw new Error(
      "Feuille inaccessible : partagez-la en « Tous les utilisateurs disposant du lien ».",
    );
  const text = await res.text();
  if (text.trim().startsWith("<"))
    throw new Error("Feuille privée : partagez-la en lecture avec le lien.");
  return parseDelimited(text);
}

/** Modèle à remplir par l'entreprise (s'ouvre dans Excel ou Google Sheets). */
export function downloadEmployeesTemplate(partnerName?: string) {
  const rows = [
    ["Nom", "Prénom", "Téléphone", "Email"],
    ["Diop", "Awa", "77 123 45 67", "awa.diop@entreprise.sn"],
    ["Fall", "Moussa", "76 987 65 43", "moussa.fall@entreprise.sn"],
  ];
  const slug = (partnerName ?? "entreprise").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  downloadFile(
    `modele-employes-${slug}.csv`,
    rows.map((r) => r.join(";")).join("\n"),
    "text/csv;charset=utf-8",
  );
}

import logo from "@core/assets/logo.png";
import {
  formatDay,
  formatPrice,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@core/lib/format";
import type { Order, OrderItem } from "@/features/admin/orders/api";
import { CLIENT } from "@/config/client";

/**
 * Impressions de l'espace gérant. Chaque fonction ouvre une fenêtre prête à imprimer ;
 * depuis la boîte d'impression, « Enregistrer en PDF » permet aussi de télécharger le document.
 */

/** Format des tickets de livraison. */
export type TicketFormat = "a4" | "thermal";

/** Échappe le texte saisi par les clients avant de l'insérer dans la page d'impression. */
export function esc(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BASE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { background: #fff; font-family: "IBM Plex Sans", Arial, sans-serif; color: #18202e; font-size: 12px; line-height: 1.4;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .toolbar { position: sticky; top: 0; display: flex; align-items: center; gap: 12px; padding: 10px 16px;
    background: #18202e; color: #fff; font-size: 13px; z-index: 1; }
  .toolbar button { font: inherit; font-weight: 600; border: 0; border-radius: 6px; padding: 8px 14px; cursor: pointer; }
  .toolbar .primary { background: #fff; color: #18202e; }
  .toolbar .ghost { background: transparent; color: #fff; border: 1px solid rgb(255 255 255 / .35); }
  .toolbar span { opacity: .75; margin-right: auto; }
  .muted { color: #5f6b7a; }
  .num { font-variant-numeric: tabular-nums; }
  @media print { .toolbar { display: none; } }
`;

/** Document HTML complet (barre d'outils + contenu), lancé automatiquement à l'impression. */
function buildPrintDocument(title: string, body: string, css: string, autoPrint = true) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" />
<style>${BASE_CSS}${css}</style></head><body>
<div class="toolbar"><span>${esc(title)} · « Enregistrer en PDF » dans la fenêtre d'impression pour télécharger</span>
<button class="ghost" onclick="window.close()">Fermer</button>
<button class="primary" onclick="window.print()">Imprimer</button></div>
${body}
${
  autoPrint
    ? `<script>
  window.addEventListener("load", function () {
    var ready = document.fonts ? document.fonts.ready : Promise.resolve();
    ready.then(function () { setTimeout(function () { window.print(); }, 200); });
  });
${"<"}/script>`
    : ""
}</body></html>`;
}

export function openPrintWindow(title: string, body: string, css: string) {
  const win = window.open("", "_blank", "width=1000,height=1100");
  if (!win) {
    alert("Autorisez les fenêtres pop-up pour ce site afin de pouvoir imprimer.");
    return;
  }
  win.document.write(buildPrintDocument(title, body, css));
  win.document.close();
}

const logoUrl = () => new URL(logo, window.location.origin).href;

function printedAt() {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Dakar",
  }).format(new Date());
}

/* -------------------------------------------------------------------------- */
/* En-tête commun des documents A4                                            */
/* -------------------------------------------------------------------------- */

export const DOC_CSS = `
  @page { size: A4; margin: 14mm; }
  .doc { padding: 24px; max-width: 900px; margin: 0 auto; }
  @media print { .doc { padding: 0; max-width: none; } }
  .doc-head { display: flex; align-items: center; gap: 14px; padding-bottom: 14px; border-bottom: 2px solid #18202e; }
  .doc-head img { width: 46px; height: 46px; border-radius: 50%; border: 1px solid #e3e6eb; object-fit: cover; }
  .doc-head .brand { font-weight: 700; font-size: 15px; }
  .doc-head .title { margin-left: auto; text-align: right; }
  .doc-head h1 { font-size: 20px; margin: 0; }
  .summary { display: flex; gap: 10px; margin: 16px 0; }
  .summary div { flex: 1; border: 1px solid #e3e6eb; border-radius: 8px; padding: 10px 12px; }
  .summary b { display: block; font-size: 20px; }
  h2 { font-size: 14px; margin: 22px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; font-weight: 600; color: #5f6b7a; background: #f5f6f8;
    padding: 8px 10px; border-bottom: 1px solid #d5dae1; }
  td { padding: 9px 10px; border-bottom: 1px solid #e3e6eb; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .right { text-align: right; }
  .strong { font-weight: 600; }
  .write { border-bottom: 1px solid #9aa3af; min-width: 60px; display: inline-block; height: 16px; }
  .alert { color: #b45309; font-weight: 600; }
  .doc-foot { margin-top: 18px; font-size: 11px; color: #5f6b7a; }
`;

export function docHead(title: string, subtitle: string) {
  return `<div class="doc-head">
    <img src="${logoUrl()}" alt="" />
    <div><div class="brand">${esc(CLIENT.name)}</div><div class="muted">Imprimé le ${esc(printedAt())}</div></div>
    <div class="title"><h1>${esc(title)}</h1><div class="muted">${esc(subtitle)}</div></div>
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* Liste des précommandes du jour (pour la cuisine)                           */
/* -------------------------------------------------------------------------- */

export type PreorderRow = {
  name: string;
  category: string;
  /** Portions ou bouteilles précommandées. */
  quantity: number;
  /** Portions prévues par la cuisine (plats du menu). */
  planned?: number;
  /** Portions encore libres. */
  left?: number;
};

export function printProduction(
  title: string,
  rows: PreorderRow[],
  meta: { day: string; orders: number },
) {
  const plats = rows.filter((r) => r.category !== "jus");
  const jus = rows.filter((r) => r.category === "jus");
  const reserved = plats.reduce((s, r) => s + r.quantity, 0);
  const planned = plats.reduce((s, r) => s + (r.planned ?? 0), 0);

  const platRows = plats
    .map((r) => {
      const low = r.left !== undefined && r.left <= 3;
      return `<tr>
        <td class="strong">${esc(r.name)}</td>
        <td class="right num">${r.planned ?? "—"}</td>
        <td class="right num strong">${r.quantity}</td>
        <td class="right num ${low ? "alert" : ""}">${r.left ?? "—"}${low ? " · à renforcer" : ""}</td>
        <td class="right"><span class="write"></span></td>
      </tr>`;
    })
    .join("");
  const jusRows = jus
    .map(
      (r) =>
        `<tr><td class="strong">${esc(r.name)}</td><td class="right num strong">${r.quantity}</td></tr>`,
    )
    .join("");

  openPrintWindow(
    title,
    `<div class="doc">
      ${docHead("Précommandes", formatDay(meta.day))}
      <div class="summary">
        <div><span class="muted">Précommandes</span><b class="num">${meta.orders}</b></div>
        <div><span class="muted">Portions réservées</span><b class="num">${reserved}${planned ? ` / ${planned}` : ""}</b></div>
        <div><span class="muted">Jus réservés</span><b class="num">${jus.reduce((s, r) => s + r.quantity, 0)}</b></div>
      </div>
      <h2>Plats</h2>
      ${
        plats.length
          ? `<table><thead><tr><th>Plat</th><th class="right">Prévu</th><th class="right">Précommandé</th><th class="right">Restant</th><th class="right">À ajouter</th></tr></thead><tbody>${platRows}</tbody></table>`
          : `<p class="muted">Aucun plat au menu ce jour-là.</p>`
      }
      ${
        jus.length
          ? `<h2>Jus</h2><table><thead><tr><th>Jus</th><th class="right">Précommandé</th></tr></thead><tbody>${jusRows}</tbody></table>`
          : ""
      }
      <p class="doc-foot">La colonne « À ajouter » sert à noter en cuisine les portions à préparer en plus.</p>
    </div>`,
    DOC_CSS,
  );
}

/* -------------------------------------------------------------------------- */
/* Liste des commandes                                                        */
/* -------------------------------------------------------------------------- */

export function printOrders(orders: Order[], items: OrderItem[], title: string) {
  const rows = orders
    .map((order) => {
      const lines = items.filter((i) => i.order_id === order.id);
      return `<tr>
        <td><span class="strong">${esc(order.reference)}</span><br /><span class="muted">${esc(
          new Date(order.created_at).toLocaleString("fr-FR", { timeZone: "Africa/Dakar" }),
        )}</span></td>
        <td><span class="strong">${esc(order.first_name)} ${esc(order.last_name)}</span><br />${esc(order.phone)}</td>
        <td>${esc(order.address)}${order.address_extra ? `, ${esc(order.address_extra)}` : ""}${
          order.landmark ? `<br /><span class="muted">Repère : ${esc(order.landmark)}</span>` : ""
        }</td>
        <td>${lines
          .map(
            (l) =>
              `${l.quantity} × ${esc(l.product_name)} <span class="muted">(${esc(formatDay(l.day_date))})</span>`,
          )
          .join("<br />")}</td>
        <td class="right num strong">${esc(formatPrice(order.total))}</td>
        <td>${esc(ORDER_STATUS_LABELS[order.status] ?? order.status)}<br /><span class="muted">${esc(
          PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status,
        )}</span></td>
      </tr>`;
    })
    .join("");
  const total = orders.filter((o) => o.status !== "annulee").reduce((s, o) => s + o.total, 0);

  openPrintWindow(
    title,
    `<div class="doc">
      ${docHead("Commandes", title)}
      <div class="summary">
        <div><span class="muted">Commandes</span><b class="num">${orders.length}</b></div>
        <div><span class="muted">Total hors annulations</span><b class="num">${esc(formatPrice(total))}</b></div>
      </div>
      <table><thead><tr><th>Référence</th><th>Client</th><th>Adresse</th><th>Articles</th><th class="right">Total</th><th>Statut</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>`,
    DOC_CSS,
  );
}

/* -------------------------------------------------------------------------- */
/* Tickets de livraison                                                       */
/* -------------------------------------------------------------------------- */

const MAX_TICKET_LINES = 6;

/** Un ticket par commande et par jour de livraison. */
function ticketsOf(orders: Order[], items: OrderItem[], day?: string) {
  return orders.flatMap((order) => {
    const byDay = new Map<string, OrderItem[]>();
    for (const line of items) {
      if (line.order_id !== order.id || (day && line.day_date !== day)) continue;
      byDay.set(line.day_date, [...(byDay.get(line.day_date) ?? []), line]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, lines]) => ({ order, date, lines }));
  });
}

function ticketHtml(order: Order, date: string, lines: OrderItem[]) {
  const amount = lines.reduce((s, l) => s + l.amount, 0);
  // Commande d'abonné entièrement prise en charge : rien à encaisser à la livraison.
  const paid = order.payment_status === "paye" || order.payment_status === "abonnement";
  const shown = lines.slice(0, MAX_TICKET_LINES);
  const hidden = lines.length - shown.length;
  return `<article class="ticket">
    <header><img src="${logoUrl()}" alt="" /><span class="brand">${esc(CLIENT.name)}</span><span class="ref">${esc(order.reference)}</span></header>
    <div class="client">${esc(order.first_name)} ${esc(order.last_name)}</div>
    <div class="phone num">${esc(order.phone)}</div>
    <div class="addr">${esc(order.address)}${order.address_extra ? `, ${esc(order.address_extra)}` : ""}</div>
    ${order.landmark ? `<div class="addr muted">Repère : ${esc(order.landmark)}</div>` : ""}
    ${order.instructions ? `<div class="note">${esc(order.instructions)}</div>` : ""}
    <div class="day">Livraison ${esc(formatDay(date).toLowerCase())}</div>
    <ul>${shown.map((l) => `<li><b class="num">${l.quantity} ×</b> ${esc(l.product_name)}</li>`).join("")}${
      hidden > 0 ? `<li class="muted">+ ${hidden} autre(s) article(s)</li>` : ""
    }</ul>
    <footer><span class="num">${esc(formatPrice(amount))}</span><span class="pay ${paid ? "paid" : ""}">${
      order.payment_status === "abonnement"
        ? "Abonnement"
        : paid
          ? "Payé"
          : esc(PAYMENT_STATUS_LABELS[order.payment_status] ?? "À encaisser")
    }</span></footer>
  </article>`;
}

/** Tickets A4 : 8 par page (2 × 4), séparés par des pointillés de découpe. */
const A4_TICKET_CSS = `
  @page { size: A4; margin: 6mm; }
  .sheet { display: grid; grid-template-columns: repeat(2, 99mm); grid-auto-rows: 71mm;
    justify-content: center; padding: 16px 0; }
  @media print { .sheet { padding: 0; } }
  .ticket { position: relative; padding: 5mm 6mm; border: 1px dashed #9aa3af; margin: -0.5px;
    overflow: hidden; display: flex; flex-direction: column; break-inside: avoid; background: #fff; }
  .ticket::before { content: "✂"; position: absolute; top: -1px; left: 3mm; font-size: 10px; color: #9aa3af;
    line-height: 1; background: #fff; padding: 0 2px; transform: translateY(-50%); }
  header { display: flex; align-items: center; gap: 6px; padding-bottom: 2mm; border-bottom: 1px solid #e3e6eb; }
  header img { width: 18px; height: 18px; border-radius: 50%; object-fit: cover; }
  .brand { font-weight: 600; font-size: 10px; }
  .ref { margin-left: auto; font-size: 10px; font-weight: 600; color: #5f6b7a; }
  .client { margin-top: 2.5mm; font-size: 17px; font-weight: 700; line-height: 1.15; }
  .phone { font-size: 15px; font-weight: 600; }
  .addr { font-size: 11px; }
  .note { margin-top: 1mm; font-size: 10px; font-style: italic; }
  .day { margin-top: 2mm; font-size: 10px; font-weight: 700; color: #6b4428; }
  ul { margin: 1mm 0 0; padding: 0; list-style: none; font-size: 11px; flex: 1; }
  footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e3e6eb;
    padding-top: 1.5mm; font-weight: 700; font-size: 12px; }
  .pay { font-size: 10px; padding: 1px 6px; border-radius: 99px; border: 1px solid #d97706; color: #b45309; }
  .pay.paid { border-color: #059669; color: #047857; }
`;

/** Tickets 80 mm pour imprimante thermique : un ticket par coupe. */
const THERMAL_TICKET_CSS = `
  @page { size: 80mm auto; margin: 3mm; }
  body { background: #e5e7eb; }
  .roll { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px 0; }
  @media print { body { background: #fff; } .roll { display: block; padding: 0; } }
  .ticket { width: 74mm; background: #fff; padding: 3mm; color: #000; font-size: 12px; break-after: page; }
  .ticket:last-child { break-after: auto; }
  header { display: flex; align-items: center; gap: 6px; padding-bottom: 2mm; border-bottom: 1px dashed #000; }
  header img { width: 22px; height: 22px; border-radius: 50%; filter: grayscale(1); }
  .brand { font-weight: 700; font-size: 12px; }
  .ref { margin-left: auto; font-size: 11px; font-weight: 700; }
  .client { margin-top: 3mm; font-size: 18px; font-weight: 700; line-height: 1.15; }
  .phone { font-size: 17px; font-weight: 700; }
  .addr { font-size: 12px; }
  .muted { color: #000; }
  .note { margin-top: 1mm; font-size: 11px; font-style: italic; }
  .day { margin-top: 2mm; padding: 1mm 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000;
    font-weight: 700; text-transform: uppercase; font-size: 11px; }
  ul { margin: 2mm 0; padding: 0; list-style: none; font-size: 13px; }
  footer { display: flex; justify-content: space-between; border-top: 1px dashed #000; padding-top: 2mm;
    font-weight: 700; font-size: 14px; }
  .pay { font-size: 12px; text-transform: uppercase; }
`;

export function printTickets(
  orders: Order[],
  items: OrderItem[],
  title: string,
  format: TicketFormat,
  day?: string,
) {
  const tickets = ticketsOf(
    orders.filter((o) => o.status !== "annulee"),
    items,
    day,
  );
  if (tickets.length === 0) {
    alert("Aucun ticket à imprimer pour cette sélection.");
    return;
  }
  const html = tickets.map((t) => ticketHtml(t.order, t.date, t.lines)).join("");
  openPrintWindow(
    `${title} (${tickets.length} ticket${tickets.length > 1 ? "s" : ""})`,
    format === "a4" ? `<div class="sheet">${html}</div>` : `<div class="roll">${html}</div>`,
    format === "a4" ? A4_TICKET_CSS : THERMAL_TICKET_CSS,
  );
}

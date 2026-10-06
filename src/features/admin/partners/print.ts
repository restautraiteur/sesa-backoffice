import { DOC_CSS, docHead, esc, openPrintWindow } from "@/features/admin/orders/print";
import { downloadFile } from "@/features/admin/orders/export-orders";
import { formatDay, formatPrice } from "@core/lib/format";
import {
  formatHour,
  monthLabel,
  type Partner,
  type PartnerLine,
} from "@/features/admin/partners/api";
import { csvCell } from "@/features/admin/csv";

const NOTE_CSS = `
  .sign { display: flex; gap: 24px; margin-top: 36px; }
  .sign div { flex: 1; border-top: 1px solid #9aa3af; padding-top: 6px; font-size: 11px; color: #5f6b7a; }
  .total-row td { font-weight: 700; font-size: 14px; border-top: 2px solid #18202e; }
`;

function partnerBlock(partner: Partner) {
  return `<div class="summary">
    <div>${partner.logo_url ? `<img src="${esc(partner.logo_url)}" alt="" style="height:36px;max-width:120px;object-fit:contain;float:right" />` : ""}<span class="muted">Entreprise</span><b>${esc(partner.name)}</b>${esc(partner.delivery_address ?? "")}</div>
    <div><span class="muted">Contact</span><b>${esc(partner.contact_name ?? "—")}</b>${esc(
      [partner.contact_phone, partner.contact_email].filter(Boolean).join(" · "),
    )}</div>
  </div>`;
}

/** Bon de commande d'un jour : un repas par ligne, total à facturer, signatures. */
export function printDeliveryNote(
  partner: Partner,
  date: string,
  lines: PartnerLine[],
  number: string,
) {
  const sorted = [...lines].sort((a, b) => a.employee.localeCompare(b.employee));
  const total = sorted.reduce((s, l) => s + l.amount, 0);
  const meals = sorted.reduce((s, l) => s + l.quantity, 0);
  const dishes = new Map<string, number>();
  sorted.forEach((l) => dishes.set(l.product_name, (dishes.get(l.product_name) ?? 0) + l.quantity));
  const body = `<div class="doc">
    ${docHead(`Bon de commande ${number}`, `Livraison du ${formatDay(date)} · ${formatHour(partner.delivery_time)}`)}
    ${partnerBlock(partner)}
    <div class="summary">
      <div><span class="muted">Repas</span><b>${meals}</b></div>
      <div><span class="muted">Plats</span><b>${dishes.size}</b>${esc(
        [...dishes].map(([n, q]) => `${q} × ${n}`).join(" · "),
      )}</div>
      <div><span class="muted">Montant</span><b>${esc(formatPrice(total))}</b></div>
    </div>
    <table><thead><tr><th>#</th><th>Employé</th><th>Téléphone</th><th>Plat</th><th class="right">Qté</th><th class="right">Prix</th><th class="right">Montant</th><th>Reçu</th></tr></thead><tbody>
    ${sorted
      .map(
        (l, i) =>
          `<tr><td>${i + 1}</td><td class="strong">${esc(l.employee)}</td><td>${esc(l.phone)}</td><td>${esc(
            l.product_name,
          )}</td><td class="right num">${l.quantity}</td><td class="right num">${esc(formatPrice(l.unit_price))}</td><td class="right num">${esc(
            formatPrice(l.amount),
          )}</td><td><span class="write"></span></td></tr>`,
      )
      .join("")}
    <tr class="total-row"><td colspan="6">Total à facturer à ${esc(partner.name)}</td><td class="right num">${esc(
      formatPrice(total),
    )}</td><td></td></tr>
    </tbody></table>
    <div class="sign"><div>Livré par (nom et signature)</div><div>Reçu pour ${esc(partner.name)} (nom, signature, cachet)</div></div>
    <p class="doc-foot">Ce bon sera regroupé avec les autres bons du mois sur la facture mensuelle.</p>
  </div>`;
  openPrintWindow(`Bon de commande ${number}`, body, DOC_CSS + NOTE_CSS);
}

function invoiceDays(lines: PartnerLine[]) {
  const days = new Map<string, { meals: number; amount: number }>();
  lines.forEach((l) => {
    const d = days.get(l.day_date) ?? { meals: 0, amount: 0 };
    d.meals += l.quantity;
    d.amount += l.amount;
    days.set(l.day_date, d);
  });
  return [...days].sort(([a], [b]) => a.localeCompare(b));
}

/** Facture du mois : un bon par jour de livraison, puis le détail par employé. */
export function printInvoice(
  partner: Partner,
  month: string,
  lines: PartnerLine[],
  reference: string,
) {
  const days = invoiceDays(lines);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const meals = lines.reduce((s, l) => s + l.quantity, 0);
  const employees = new Map<string, { meals: number; amount: number }>();
  lines.forEach((l) => {
    const e = employees.get(l.employee) ?? { meals: 0, amount: 0 };
    e.meals += l.quantity;
    e.amount += l.amount;
    employees.set(l.employee, e);
  });
  const body = `<div class="doc">
    ${docHead(`Facture ${reference}`, `Repas de ${monthLabel(month)}`)}
    ${partnerBlock(partner)}
    <div class="summary">
      <div><span class="muted">Bons de commande</span><b>${days.length}</b></div>
      <div><span class="muted">Repas livrés</span><b>${meals}</b></div>
      <div><span class="muted">Total à payer</span><b>${esc(formatPrice(total))}</b></div>
    </div>
    <h2>Récapitulatif des bons de commande</h2>
    <table><thead><tr><th>Bon</th><th>Jour de livraison</th><th class="right">Repas</th><th class="right">Montant</th></tr></thead><tbody>
    ${days
      .map(
        ([day, d]) =>
          `<tr><td>BC-${day.replaceAll("-", "")}</td><td>${esc(formatDay(day))}</td><td class="right num">${d.meals}</td><td class="right num">${esc(
            formatPrice(d.amount),
          )}</td></tr>`,
      )
      .join("")}
    <tr class="total-row"><td colspan="3">Total du mois</td><td class="right num">${esc(formatPrice(total))}</td></tr>
    </tbody></table>
    <h2>Détail par employé</h2>
    <table><thead><tr><th>Employé</th><th class="right">Repas</th><th class="right">Montant</th></tr></thead><tbody>
    ${[...employees]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([name, e]) =>
          `<tr><td>${esc(name)}</td><td class="right num">${e.meals}</td><td class="right num">${esc(
            formatPrice(e.amount),
          )}</td></tr>`,
      )
      .join("")}
    </tbody></table>
  </div>`;
  openPrintWindow(`Facture ${reference}`, body, DOC_CSS + NOTE_CSS);
}

/** Détail de la facture en Excel (CSV) : une ligne par repas. */
export function exportInvoiceCsv(partner: Partner, month: string, lines: PartnerLine[]) {
  const q = csvCell;
  const rows = [
    [
      "Entreprise",
      "Jour",
      "Employé",
      "Téléphone",
      "Plat",
      "Quantité",
      "Prix",
      "Montant",
      "Commande",
    ],
    ...[...lines]
      .sort((a, b) => a.day_date.localeCompare(b.day_date) || a.employee.localeCompare(b.employee))
      .map((l) => [
        partner.name,
        l.day_date,
        l.employee,
        l.phone,
        l.product_name,
        l.quantity,
        l.unit_price,
        l.amount,
        l.reference,
      ]),
  ];
  downloadFile(
    `facture-${partner.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${month}.csv`,
    rows.map((r) => r.map(q).join(";")).join("\n"),
    "text/csv;charset=utf-8",
  );
}

const LABEL_CSS = `
  @page { size: A4; margin: 8mm; }
  .labels-doc { padding: 16px; }
  .company { page-break-after: always; }
  .company:last-child { page-break-after: auto; }
  .company-head { display: flex; align-items: center; gap: 10px; margin: 0 0 8px; padding-bottom: 6px; border-bottom: 2px solid #18202e; }
  .company-head img { height: 30px; max-width: 110px; object-fit: contain; }
  .company-head h2 { margin: 0; font-size: 16px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); }
  .label { border: 1px dashed #9aa3af; padding: 10px 12px; min-height: 120px; page-break-inside: avoid; }
  .label .co { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #5f6b7a; display: flex; justify-content: space-between; }
  .label .name { font-size: 15px; font-weight: 700; margin: 4px 0 2px; }
  .label .ref { font-weight: 700; }
  .label ul { margin: 6px 0 0; padding-left: 16px; }
`;

/** Une étiquette par commande d'employé, regroupées par entreprise, à découper et coller. */
export type LabelGroup = {
  partner: Partner;
  orders: {
    reference: string;
    employee: string;
    phone: string;
    items: { name: string; quantity: number }[];
  }[];
};

export function printPartnerLabels(groups: LabelGroup[], day: string) {
  const body = `<div class="labels-doc">${groups
    .map(
      (g) => `<section class="company">
      <div class="company-head">${g.partner.logo_url ? `<img src="${esc(g.partner.logo_url)}" alt="" />` : ""}<h2>${esc(
        g.partner.name,
      )}</h2><span class="muted">${esc(formatDay(day))} · ${g.orders.length} commande(s) · livraison ${esc(
        formatHour(g.partner.delivery_time),
      )}</span></div>
      <div class="grid">${[...g.orders]
        .sort((a, b) => a.employee.localeCompare(b.employee))
        .map(
          (o) => `<div class="label">
          <div class="co"><span>${esc(g.partner.name)}</span><span class="ref">${esc(o.reference)}</span></div>
          <div class="name">${esc(o.employee)}</div>
          <div class="muted">${esc(o.phone)}</div>
          <ul>${o.items.map((i) => `<li>${i.quantity} × ${esc(i.name)}</li>`).join("")}</ul>
        </div>`,
        )
        .join("")}</div>
    </section>`,
    )
    .join("")}</div>`;
  openPrintWindow(`Étiquettes entreprises · ${formatDay(day)}`, body, LABEL_CSS);
}

/** Lignes d'une entreprise → une étiquette par commande. */
export function labelGroup(partner: Partner, lines: PartnerLine[]): LabelGroup {
  const orders = new Map<string, LabelGroup["orders"][number]>();
  for (const l of lines) {
    const o = orders.get(l.order_id) ?? {
      reference: l.reference,
      employee: l.employee,
      phone: l.phone,
      items: [],
    };
    o.items.push({ name: l.product_name, quantity: l.quantity });
    orders.set(l.order_id, o);
  }
  return { partner, orders: [...orders.values()] };
}

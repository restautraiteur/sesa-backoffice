import type { Order, OrderItem } from "@/features/admin/orders/api";
import { ORDER_STATUS_LABELS, weekdayLabel } from "@core/lib/format";
import { csvCell, htmlCell } from "@/features/admin/csv";

function ordersToRows(orders: Order[], items: OrderItem[]) {
  const header = [
    "Référence",
    "Date de commande",
    "Jour",
    "Nom",
    "Prénom",
    "Téléphone",
    "Adresse",
    "Produit",
    "Catégorie",
    "Quantité",
    "Prix",
    "Total ligne",
    "Total commande",
    "Statut",
  ];
  const rows: string[][] = [];
  orders.forEach((order) => {
    items
      .filter((i) => i.order_id === order.id)
      .forEach((item) => {
        rows.push([
          order.reference,
          new Date(order.created_at).toLocaleString("fr-FR"),
          `${weekdayLabel(item.day_date)} ${item.day_date}`,
          order.last_name,
          order.first_name,
          order.phone,
          [order.address, order.address_extra, order.landmark].filter(Boolean).join(" - "),
          item.product_name,
          item.category,
          String(item.quantity),
          String(item.unit_price),
          String(item.amount),
          String(order.total),
          ORDER_STATUS_LABELS[order.status] ?? order.status,
        ]);
      });
  });
  return [header, ...rows];
}

export function ordersToCsv(orders: Order[], items: OrderItem[]) {
  return ordersToRows(orders, items)
    .map((row) => row.map(csvCell).join(";"))
    .join("\r\n");
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob(["\uFEFF" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportOrdersCsv(orders: Order[], items: OrderItem[], filename: string) {
  downloadFile(`${filename}.csv`, ordersToCsv(orders, items), "text/csv;charset=utf-8");
}

export function exportOrdersExcel(orders: Order[], items: OrderItem[], filename: string) {
  // Tableau HTML ouvert par Excel (.xls) ; chaque cellule est échappée et neutralisée.
  const rows = ordersToRows(orders, items);
  const html = `<html><head><meta charset="utf-8" /></head><body><table border="1">${rows
    .map(
      (row, index) =>
        `<tr>${row.map((cell) => `<${index === 0 ? "th" : "td"}>${htmlCell(cell)}</${index === 0 ? "th" : "td"}>`).join("")}</tr>`,
    )
    .join("")}</table></body></html>`;
  downloadFile(`${filename}.xls`, html, "application/vnd.ms-excel");
}

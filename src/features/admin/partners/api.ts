import { queryOptions } from "@tanstack/react-query";
import { db, run } from "@core/lib/db";

export type Partner = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  delivery_address: string | null;
  delivery_time: string;
  cutoff_time: string;
  cutoff_day_offset: number;
  active: boolean;
  notes: string | null;
};

export type PartnerEmployee = {
  id: string;
  partner_id: string;
  full_name: string;
  phone: string;
  email: string;
  pin: string;
  pin_failures: number;
  active: boolean;
};

export type DeliveryNote = {
  id: string;
  partner_id: string;
  delivery_date: string;
  status: "a_livrer" | "livre";
  signed_by: string | null;
  delivered_at: string | null;
};

export type PartnerInvoice = {
  id: string;
  partner_id: string;
  month: string;
  reference: string;
  total: number;
  status: "envoyee" | "payee";
  sent_at: string;
  paid_at: string | null;
};

/** Ligne de commande d'un employé (pour les bons et les factures). */
export type PartnerLine = {
  order_id: string;
  reference: string;
  partner_id: string;
  employee: string;
  phone: string;
  day_date: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  amount: number;
};

export const partnersQuery = () =>
  queryOptions({
    queryKey: ["partners"],
    queryFn: () => run<Partner[]>(db.from("partners").select("*").order("name")),
  });

export const employeesQuery = () =>
  queryOptions({
    queryKey: ["partner_employees"],
    queryFn: () =>
      run<PartnerEmployee[]>(db.from("partner_employees").select("*").order("full_name")),
  });

export const deliveryNotesQuery = () =>
  queryOptions({
    queryKey: ["partner_delivery_notes"],
    queryFn: () => run<DeliveryNote[]>(db.from("partner_delivery_notes").select("*")),
  });

export const invoicesQuery = () =>
  queryOptions({
    queryKey: ["partner_invoices"],
    queryFn: () =>
      run<PartnerInvoice[]>(
        db.from("partner_invoices").select("*").order("month", { ascending: false }),
      ),
  });

/** Lignes des commandes d'entreprises (hors commandes annulées) entre deux dates de livraison. */
export const partnerLinesQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["partner_lines", from, to],
    queryFn: async () => {
      const rows = await run<
        {
          order_id: string;
          day_date: string;
          product_name: string;
          quantity: number;
          unit_price: number;
          amount: number;
          orders: {
            reference: string;
            partner_id: string;
            first_name: string;
            phone: string;
            status: string;
          };
        }[]
      >(
        db
          .from("order_items")
          .select(
            "order_id, day_date, product_name, quantity, unit_price, amount, orders!inner(reference, partner_id, first_name, phone, status)",
          )
          .gte("day_date", from)
          .lte("day_date", to)
          .not("orders.partner_id", "is", null)
          .neq("orders.status", "annulee"),
      );
      return rows.map<PartnerLine>((r) => ({
        order_id: r.order_id,
        reference: r.orders.reference,
        partner_id: r.orders.partner_id,
        employee: r.orders.first_name,
        phone: r.orders.phone,
        day_date: r.day_date,
        product_name: r.product_name,
        quantity: r.quantity,
        unit_price: r.unit_price,
        amount: r.amount,
      }));
    },
  });

/** « 06:00:00 » → « 6 h 00 ». */
export function formatHour(time: string) {
  const [h, m] = time.split(":");
  return `${Number(h)} h ${m}`;
}

/** Heure limite lisible : « 6 h 00 le jour même » ou « 20 h 00 la veille ». */
export function cutoffLabel(partner: Pick<Partner, "cutoff_time" | "cutoff_day_offset">) {
  const when =
    partner.cutoff_day_offset === 0
      ? "le jour même"
      : partner.cutoff_day_offset === 1
        ? "la veille"
        : `${partner.cutoff_day_offset} jours avant`;
  return `${formatHour(partner.cutoff_time)} ${when}`;
}

/** Premier et dernier jour d'un mois « 2026-10 ». */
export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y!, m! - 1, 1)));
}

import { queryOptions } from "@tanstack/react-query";
import { db, run, runAll } from "@core/lib/db";

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
  logo_url: string | null;
  /** Délai de paiement des factures, en jours. */
  payment_terms_days: number;
  /** Jour d'envoi automatique de la facture par email (null = manuel, mois civil). */
  billing_day: number | null;
  /** true : tout employé (nom + téléphone) peut commander ; false : liste des employés uniquement. */
  open_enrollment: boolean;
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
  status: "envoyee" | "partielle" | "payee";
  /** Somme des paiements rattachés à la facture. */
  amount_paid: number;
  sent_at: string;
  paid_at: string | null;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  emailed_at: string | null;
  email_to: string | null;
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
      runAll<PartnerEmployee>(() =>
        db.from("partner_employees").select("*").order("full_name").order("id"),
      ),
  });

export const deliveryNotesQuery = () =>
  queryOptions({
    queryKey: ["partner_delivery_notes"],
    queryFn: () =>
      runAll<DeliveryNote>(() => db.from("partner_delivery_notes").select("*").order("id")),
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
      const rows = await runAll<{
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
      }>(() =>
        db
          .from("order_items")
          .select(
            "order_id, day_date, product_name, quantity, unit_price, amount, orders!inner(reference, partner_id, first_name, phone, status)",
          )
          .gte("day_date", from)
          .lte("day_date", to)
          .not("orders.partner_id", "is", null)
          .neq("orders.status", "annulee")
          .order("day_date")
          .order("id"),
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

/** Facture envoyée, non payée, dont l'échéance est passée. */
export function isOverdue(invoice: Pick<PartnerInvoice, "status" | "due_date">, today: string) {
  return invoice.status !== "payee" && !!invoice.due_date && invoice.due_date < today;
}

/** Reste à payer sur une facture. */
export function invoiceRemaining(invoice: Pick<PartnerInvoice, "total" | "amount_paid">) {
  return Math.max(0, invoice.total - invoice.amount_paid);
}

/** Paiement reçu d'une entreprise (en une ou plusieurs fois, rattaché ou non à une facture). */
export type PartnerPayment = {
  id: string;
  partner_id: string;
  invoice_id: string | null;
  amount: number;
  paid_on: string;
  method: "virement" | "cheque" | "wave" | "orange_money" | "especes" | "autre";
  reference: string | null;
  note: string | null;
  created_at: string;
};

export const PAYMENT_METHODS: Record<PartnerPayment["method"], string> = {
  virement: "Virement",
  cheque: "Chèque",
  wave: "Wave",
  orange_money: "Orange Money",
  especes: "Espèces",
  autre: "Autre",
};

export const paymentsQuery = () =>
  queryOptions({
    queryKey: ["partner_payments"],
    queryFn: () =>
      runAll<PartnerPayment>(() =>
        db.from("partner_payments").select("*").order("paid_on", { ascending: false }).order("id"),
      ),
  });

/** Échéance d'une facture envoyée aujourd'hui. */
export function dueDateFrom(today: string, days: number) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Période facturée pour le mois « AAAA-MM » : mois civil, ou, avec un jour d'envoi (ex. 24),
 * du 25 du mois précédent au 24 du mois.
 */
export function billingPeriod(partner: Pick<Partner, "billing_day">, month: string) {
  const [y, m] = month.split("-").map(Number);
  const day = partner.billing_day;
  if (!day) return monthBounds(month);
  const end = new Date(Date.UTC(y!, m! - 1, day));
  const start = new Date(Date.UTC(y!, m! - 2, day + 1));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

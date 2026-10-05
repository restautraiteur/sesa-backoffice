import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2 } from "lucide-react";
import {
  invoiceRemaining,
  invoicesQuery,
  isOverdue,
  paymentsQuery,
  monthBounds,
  partnerLinesQuery,
  partnersQuery,
} from "@/features/admin/partners/api";
import { formatPrice } from "@core/lib/format";

/** Tableau de bord : repas d'entreprises du jour (par entreprise) et argent dû par les entreprises. */
export function PartnersTodayPanel({ day }: { day: string }) {
  const { data: partners = [] } = useQuery(partnersQuery());
  const { data: dayLines = [] } = useQuery(partnerLinesQuery(day, day));
  const { from, to } = monthBounds(day.slice(0, 7));
  const { data: monthLines = [] } = useQuery(partnerLinesQuery(from, to));
  const { data: invoices = [] } = useQuery(invoicesQuery());
  const { data: payments = [] } = useQuery(paymentsQuery());
  const received = payments
    .filter((p) => p.paid_on.startsWith(day.slice(0, 7)))
    .reduce((s, p) => s + p.amount, 0);
  const byPartner = partners
    .map((p) => ({
      partner: p,
      meals: dayLines.filter((l) => l.partner_id === p.id).reduce((s, l) => s + l.quantity, 0),
    }))
    .filter((r) => r.meals > 0)
    .sort((a, b) => b.meals - a.meals);
  const owed = invoices.filter((i) => i.status !== "payee");
  const overdue = owed.filter((i) => isOverdue(i, day));
  const monthRevenue = monthLines.reduce((s, l) => s + l.amount, 0);

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Building2 className="size-5 text-primary" /> Entreprises partenaires
        </h2>
        <Link
          to="/admin/entreprises"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Détails <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">Repas entreprises ce jour</p>
          <p className="text-xl font-bold">{byPartner.reduce((s, r) => s + r.meals, 0)}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">Chiffre d'affaires du mois</p>
          <p className="text-xl font-bold">{formatPrice(monthRevenue)}</p>
          <p className="text-xs text-emerald-700">encaissé : {formatPrice(received)}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">À encaisser</p>
          <p className="text-xl font-bold">
            {formatPrice(owed.reduce((s, i) => s + invoiceRemaining(i), 0))}
          </p>
          {overdue.length > 0 && (
            <p className="text-xs font-semibold text-rose-600">
              {overdue.length} facture{overdue.length > 1 ? "s" : ""} en retard
            </p>
          )}
        </div>
      </div>
      {byPartner.length > 0 && (
        <ul className="mt-3 divide-y divide-border text-sm">
          {byPartner.map((r) => (
            <li key={r.partner.id} className="flex justify-between gap-3 py-1.5">
              <span>{r.partner.name}</span>
              <span className="font-semibold">{r.meals} repas</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  Building2,
  CheckCircle2,
  Download,
  Mail,
  Tags,
  Trash2,
  FileSpreadsheet,
  FileText,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Upload,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Switch } from "@ui/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/components/ui/dialog";
import { ConfirmDialog, EmptyState, PageHeader } from "@/features/admin/components/admin-ui";
import { CLIENT } from "@/config/client";
import { formatPhone } from "@/features/admin/subscriptions/api";
import { SendMessageButton } from "@/features/admin/subscriptions/send-message-button";
import {
  cutoffLabel,
  deliveryNotesQuery,
  billingPeriod,
  dueDateFrom,
  invoiceRemaining,
  isOverdue,
  paymentsQuery,
  PAYMENT_METHODS,
  employeesQuery,
  formatHour,
  invoicesQuery,
  monthBounds,
  monthLabel,
  partnerLinesQuery,
  partnersQuery,
  type Partner,
  type PartnerEmployee,
  type PartnerLine,
} from "@/features/admin/partners/api";
import { csvCell } from "@/features/admin/csv";
import {
  exportInvoiceCsv,
  printDeliveryNote,
  printInvoice,
  labelGroup,
  printPartnerLabels,
  type LabelGroup,
} from "@/features/admin/partners/print";
import { downloadFile } from "@/features/admin/orders/export-orders";
import { PaymentDialog } from "@/features/admin/partners/payment-dialog";
import { TraceabilityTab } from "@/features/admin/partners/traceability-tab";
import { emailPartnerInvoice } from "@/features/admin/partners/invoice-email.functions";
import { useServerFn } from "@tanstack/react-start";
import { Checkbox } from "@ui/components/ui/checkbox";
import {
  downloadEmployeesTemplate,
  fetchGoogleSheet,
  parseDelimited,
  parseXlsx,
  rowsToEmployees,
  type ImportedEmployee,
} from "@/features/admin/partners/import-employees";
import { uploadPhoto } from "@/features/admin/products/upload-photo";
import { db } from "@core/lib/db";
import { formatDay, formatPrice, todayISO } from "@core/lib/format";
import { cn } from "@core/lib/utils";

const TABS = [
  ["kpi", "Tableau de bord"],
  ["entreprises", "Entreprises et employés"],
  ["bons", "Bons de commande"],
  ["factures", "Facturation"],
  ["tracabilite", "Traçabilité des repas"],
] as const;
type Tab = (typeof TABS)[number][0];

/** Entreprises partenaires : enrôlement des employés, bons de commande du jour, facture du mois. */
export function PartnersPage() {
  const [tab, setTab] = useState<Tab>("kpi");
  const { data: partners = [] } = useQuery(partnersQuery());
  // Le bouton du haut ouvre la fiche « Nouvelle entreprise » de l'onglet Entreprises.
  const [createSignal, setCreateSignal] = useState(0);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Entreprises partenaires"
        actions={
          <Button
            onClick={() => {
              setTab("entreprises");
              setCreateSignal((n) => n + 1);
            }}
          >
            <Plus className="size-4" /> Ajouter une entreprise
          </Button>
        }
        description="Les employés enrôlés commandent sans payer ; chaque livraison donne un bon de commande, regroupés en facture à la fin du mois."
      />
      <div role="tablist" className="flex w-fit flex-wrap rounded-lg bg-muted p-1">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "h-9 rounded-md px-4 text-sm font-medium transition-colors",
              tab === value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "kpi" && <KpiTab partners={partners} />}
      {tab === "entreprises" && <PartnersTab partners={partners} createSignal={createSignal} />}
      {tab === "bons" && <NotesTab partners={partners} />}
      {tab === "factures" && <InvoicesTab partners={partners} />}
      {tab === "tracabilite" && <TraceabilityTab partners={partners} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tableau de bord                                                            */
/* -------------------------------------------------------------------------- */

function KpiTab({ partners }: { partners: Partner[] }) {
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const { from, to } = monthBounds(month);
  const prev = (() => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y!, m! - 2, 1));
    return d.toISOString().slice(0, 7);
  })();
  const prevBounds = monthBounds(prev);
  const { data: lines = [] } = useQuery(partnerLinesQuery(from, to));
  const { data: prevLines = [] } = useQuery(partnerLinesQuery(prevBounds.from, prevBounds.to));
  const { data: employees = [] } = useQuery(employeesQuery());
  const { data: invoices = [] } = useQuery(invoicesQuery());
  const { data: payments = [] } = useQuery(paymentsQuery());
  const received = payments
    .filter((p) => p.paid_on.startsWith(month))
    .reduce((s, p) => s + p.amount, 0);

  const meals = lines.reduce((s, l) => s + l.quantity, 0);
  const revenue = lines.reduce((s, l) => s + l.amount, 0);
  const prevRevenue = prevLines.reduce((s, l) => s + l.amount, 0);
  const activeEmployees = employees.filter((e) => e.active);
  const orderingPhones = new Set(lines.map((l) => `${l.partner_id}:${l.phone}`));
  const days = new Set(lines.map((l) => l.day_date)).size;
  const unpaid = invoices.filter((i) => i.status !== "payee");
  const unpaidTotal = unpaid.reduce((s, i) => s + invoiceRemaining(i), 0);

  const ranking = partners
    .map((p) => {
      const pl = lines.filter((l) => l.partner_id === p.id);
      const enrolled = activeEmployees.filter((e) => e.partner_id === p.id).length;
      const ordering = new Set(pl.map((l) => l.phone)).size;
      return {
        partner: p,
        meals: pl.reduce((s, l) => s + l.quantity, 0),
        revenue: pl.reduce((s, l) => s + l.amount, 0),
        enrolled,
        ordering,
        rate: enrolled ? Math.round((ordering / enrolled) * 100) : 0,
      };
    })
    .filter((r) => r.meals > 0 || r.enrolled > 0)
    .sort((a, b) => b.revenue - a.revenue);
  const maxRevenue = Math.max(1, ...ranking.map((r) => r.revenue));

  const topEmployees = [
    ...lines.reduce((map, l) => {
      const key = `${l.partner_id}:${l.phone}`;
      const cur = map.get(key) ?? { name: l.employee, partner: l.partner_id, meals: 0 };
      cur.meals += l.quantity;
      map.set(key, cur);
      return map;
    }, new Map<string, { name: string; partner: string; meals: number }>()),
  ]
    .map(([, v]) => v)
    .sort((a, b) => b.meals - a.meals)
    .slice(0, 5);

  const dishes = [
    ...lines.reduce(
      (map, l) => map.set(l.product_name, (map.get(l.product_name) ?? 0) + l.quantity),
      new Map<string, number>(),
    ),
  ]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const trend = prevRevenue ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Indicateurs de {monthLabel(month)}</p>
        <Input
          type="month"
          className="w-44"
          value={month}
          onChange={(e) => setMonth(e.target.value || todayISO().slice(0, 7))}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          label="Repas livrés aux entreprises"
          value={String(meals)}
          hint={`${days} jour${days > 1 ? "s" : ""} de livraison`}
        />
        <Kpi
          label="Chiffre d'affaires entreprises"
          value={formatPrice(revenue)}
          hint={trend === null ? "—" : `${trend >= 0 ? "+" : ""}${trend} % vs ${monthLabel(prev)}`}
          tone={trend !== null && trend < 0 ? "bad" : "good"}
        />
        <Kpi
          label="Encaissé ce mois-ci"
          value={formatPrice(received)}
          hint="Argent réellement reçu des entreprises"
          tone="good"
        />
        <Kpi
          label="Employés qui commandent"
          value={`${orderingPhones.size} / ${activeEmployees.length}`}
          hint={`${activeEmployees.length ? Math.round((orderingPhones.size / activeEmployees.length) * 100) : 0} % des employés enrôlés`}
        />
        <Kpi
          label="Factures à encaisser"
          value={formatPrice(unpaidTotal)}
          hint={`${unpaid.length} facture${unpaid.length > 1 ? "s" : ""} non soldée${unpaid.length > 1 ? "s" : ""}`}
          tone={unpaid.length ? "warn" : "good"}
        />
      </div>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-semibold">Top entreprises</h2>
        <p className="text-sm text-muted-foreground">Classées par chiffre d'affaires du mois</p>
        {ranking.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Aucune commande d'entreprise ce mois-ci.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {ranking.map((r, i) => (
              <li key={r.partner.id} className="flex items-center gap-3">
                <span className="w-5 text-right text-sm font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <PartnerLogo partner={r.partner} size="size-9" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{r.partner.name}</span>
                    <span className="shrink-0 font-semibold">{formatPrice(r.revenue)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(r.revenue / maxRevenue) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.meals} repas · {r.ordering}/{r.enrolled} employés ont commandé ({r.rate} %)
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Employés les plus fidèles</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {topEmployees.length === 0 && <li className="py-2 text-muted-foreground">—</li>}
            {topEmployees.map((e) => (
              <li key={`${e.partner}-${e.name}`} className="flex justify-between gap-3 py-2">
                <span>
                  {e.name}
                  <span className="text-muted-foreground">
                    {" "}
                    · {partners.find((p) => p.id === e.partner)?.name}
                  </span>
                </span>
                <span className="font-semibold">{e.meals} repas</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Plats les plus commandés par les entreprises</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {dishes.length === 0 && <li className="py-2 text-muted-foreground">—</li>}
            {dishes.map(([name, q]) => (
              <li key={name} className="flex justify-between gap-3 py-2">
                <span>{name}</span>
                <span className="font-semibold">{q}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "good" | "bad" | "warn";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p
        className={cn(
          "mt-1 text-xs",
          tone === "bad" && "text-rose-600",
          tone === "warn" && "text-amber-700",
          (!tone || tone === "good") && "text-muted-foreground",
        )}
      >
        {hint}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Entreprises et employés                                                    */
/* -------------------------------------------------------------------------- */

type PartnerDraft = {
  id?: string;
  name: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  delivery_address: string;
  delivery_time: string;
  cutoff_time: string;
  cutoff_day_offset: string;
  active: boolean;
  logo_url: string;
  payment_terms_days: string;
  billing_day: string;
  open_enrollment: boolean;
  max_meals_per_day: string;
};

const EMPTY_PARTNER: PartnerDraft = {
  name: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  delivery_address: "",
  delivery_time: "13:00",
  cutoff_time: "07:00",
  cutoff_day_offset: "1",
  active: true,
  logo_url: "",
  payment_terms_days: "30",
  billing_day: "",
  open_enrollment: false,
  max_meals_per_day: "2",
};

function PartnersTab({ partners, createSignal }: { partners: Partner[]; createSignal: number }) {
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<Partner | null>(null);
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("partners").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      queryClient.invalidateQueries({ queryKey: ["partner_employees"] });
      setSelected(null);
      toast.success("Entreprise supprimée");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const { data: employees = [] } = useQuery(employeesQuery());
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<PartnerDraft | null>(null);
  useEffect(() => {
    if (createSignal > 0) setDraft(EMPTY_PARTNER);
  }, [createSignal]);
  const current = partners.find((p) => p.id === selected) ?? partners[0] ?? null;

  const save = useMutation({
    mutationFn: async (value: PartnerDraft) => {
      const payload = {
        name: value.name.trim(),
        contact_name: value.contact_name.trim() || null,
        contact_phone: value.contact_phone.trim() || null,
        contact_email: value.contact_email.trim() || null,
        delivery_address: value.delivery_address.trim() || null,
        delivery_time: value.delivery_time,
        cutoff_time: value.cutoff_time,
        cutoff_day_offset: Number(value.cutoff_day_offset),
        active: value.active,
        logo_url: value.logo_url || null,
        payment_terms_days: Number(value.payment_terms_days) || 0,
        billing_day: value.billing_day ? Number(value.billing_day) : null,
        open_enrollment: value.open_enrollment,
        max_meals_per_day: Math.min(20, Math.max(1, Number(value.max_meals_per_day) || 2)),
      };
      const { data, error } = value.id
        ? await db.from("partners").update(payload).eq("id", value.id).select("id").single()
        : await db.from("partners").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      setSelected(id);
      setDraft(null);
      toast.success("Entreprise enregistrée");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (partners.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <EmptyState title="Aucune entreprise partenaire">
          Ajoutez une entreprise, puis enrôlez ses employés : ils pourront commander depuis le site.
        </EmptyState>
        <div className="flex justify-center pb-8">
          <Button onClick={() => setDraft(EMPTY_PARTNER)}>
            <Plus className="size-4" /> Ajouter une entreprise
          </Button>
        </div>
        <PartnerDialog
          draft={draft}
          setDraft={setDraft}
          onSave={save.mutate}
          saving={save.isPending}
        />
      </section>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <aside className="space-y-2">
        {partners.map((p) => {
          const count = employees.filter((e) => e.partner_id === p.id && e.active).length;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition-colors",
                current?.id === p.id ? "border-primary" : "border-border hover:border-primary/40",
                !p.active && "opacity-60",
              )}
            >
              <PartnerLogo partner={p} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {count} employé{count > 1 ? "s" : ""}
                  {p.active ? "" : " · inactive"}
                </span>
              </span>
            </button>
          );
        })}
        <Button variant="outline" className="w-full" onClick={() => setDraft(EMPTY_PARTNER)}>
          <Plus className="size-4" /> Ajouter une entreprise
        </Button>
      </aside>

      {current && (
        <section className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{current.name}</h2>
              <p className="text-sm text-muted-foreground">
                Livraison {formatHour(current.delivery_time)}
                {current.delivery_address ? ` · ${current.delivery_address}` : ""} · commandes
                jusqu'à {cutoffLabel(current)}
              </p>
              {(current.contact_name || current.contact_phone || current.contact_email) && (
                <p className="text-xs text-muted-foreground">
                  Contact :{" "}
                  {[current.contact_name, current.contact_phone, current.contact_email]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setDraft({
                  id: current.id,
                  name: current.name,
                  contact_name: current.contact_name ?? "",
                  contact_phone: current.contact_phone ?? "",
                  contact_email: current.contact_email ?? "",
                  delivery_address: current.delivery_address ?? "",
                  delivery_time: current.delivery_time.slice(0, 5),
                  cutoff_time: current.cutoff_time.slice(0, 5),
                  cutoff_day_offset: String(current.cutoff_day_offset),
                  active: current.active,
                  logo_url: current.logo_url ?? "",
                  payment_terms_days: String(current.payment_terms_days),
                  billing_day: current.billing_day ? String(current.billing_day) : "",
                  open_enrollment: current.open_enrollment,
                  max_meals_per_day: String(current.max_meals_per_day ?? 2),
                })
              }
            >
              <Pencil className="size-4" /> Modifier
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setToDelete(current)}
            >
              <Trash2 className="size-4" /> Supprimer
            </Button>
          </div>
          <PartnerFinance partner={current} />
          <EmployeesPanel
            partner={current}
            employees={employees.filter((e) => e.partner_id === current.id)}
          />
        </section>
      )}
      <PartnerDialog
        draft={draft}
        setDraft={setDraft}
        onSave={save.mutate}
        saving={save.isPending}
      />
      <ConfirmDialog
        open={toDelete !== null}
        title={`Supprimer ${toDelete?.name ?? ""} ?`}
        description="Ses employés et ses factures seront supprimés. Les commandes déjà passées restent dans Commandes. Pour garder l'historique, décochez plutôt « Entreprise active »."
        confirmLabel="Supprimer l'entreprise"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete.id);
          setToDelete(null);
        }}
      />
    </div>
  );
}

function PartnerDialog({
  draft,
  setDraft,
  onSave,
  saving,
}: {
  draft: PartnerDraft | null;
  setDraft: (d: PartnerDraft | null) => void;
  onSave: (d: PartnerDraft) => void;
  saving: boolean;
}) {
  const field = (key: keyof PartnerDraft, label: string, props: Record<string, unknown> = {}) =>
    draft && (
      <div className="space-y-2">
        <Label htmlFor={`pa-${key}`}>{label}</Label>
        <Input
          id={`pa-${key}`}
          value={String(draft[key])}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          {...props}
        />
      </div>
    );
  return (
    <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {draft?.id ? "Modifier l'entreprise" : "Nouvelle entreprise partenaire"}
          </DialogTitle>
        </DialogHeader>
        {draft && (
          <div className="space-y-4">
            {field("name", "Nom de l'entreprise", { placeholder: "RTS" })}
            <LogoField
              value={draft.logo_url}
              onChange={(logo_url) => setDraft({ ...draft, logo_url })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {field("contact_name", "Contact (nom)")}
              {field("contact_phone", "Contact (téléphone)", { inputMode: "tel" })}
            </div>
            {field("contact_email", "Email du responsable (reçoit les factures)", {
              type: "email",
            })}
            {field("delivery_address", "Adresse de livraison")}
            <div className="grid gap-4 sm:grid-cols-2">
              {field("payment_terms_days", "Délai de paiement (jours)", {
                type: "number",
                min: 0,
                max: 120,
              })}
              <div className="space-y-2">
                <Label htmlFor="pa-billing">Envoi automatique de la facture</Label>
                <select
                  id="pa-billing"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={draft.billing_day}
                  onChange={(e) => setDraft({ ...draft, billing_day: e.target.value })}
                >
                  <option value="">Non (j'envoie moi-même)</option>
                  {Array.from({ length: 28 }, (_, i) => (
                    <option key={i + 1} value={String(i + 1)}>
                      Le {i + 1} de chaque mois
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {draft.billing_day && (
              <p className="text-xs text-muted-foreground">
                Le {draft.billing_day} de chaque mois, la facture (du{" "}
                {Number(draft.billing_day) + 1} du mois précédent au {draft.billing_day}) part par
                email au responsable : {draft.contact_email || "ajoutez son email ci-dessus"}.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              {field("delivery_time", "Heure de livraison", { type: "time" })}
              {field("cutoff_time", "Heure limite", { type: "time" })}
              <div className="space-y-2">
                <Label htmlFor="pa-offset">Limite</Label>
                <select
                  id="pa-offset"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={draft.cutoff_day_offset}
                  onChange={(e) => setDraft({ ...draft, cutoff_day_offset: e.target.value })}
                >
                  <option value="0">le jour même</option>
                  <option value="1">la veille</option>
                  <option value="2">2 jours avant</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {(() => {
                const time = (draft.cutoff_time || "07:00").replace(":", " h ");
                const when =
                  draft.cutoff_day_offset === "0"
                    ? "mercredi"
                    : draft.cutoff_day_offset === "1"
                      ? "mardi"
                      : "lundi";
                return `Pour un repas livré mercredi : commandes et modifications jusqu'à ${when} ${time}. Ensuite le jour est clos.`;
              })()}
              {draft.cutoff_day_offset === "0" &&
                " Attention : les employés pourront commander le jour même."}
            </p>
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Qui peut commander au panier ?</p>
              <p className="text-xs text-muted-foreground">
                L'employé choisit l'entreprise et donne son nom et son téléphone, sans code.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    [
                      false,
                      "Liste des employés uniquement",
                      "Seuls les numéros de la liste sont acceptés.",
                    ],
                    [
                      true,
                      "Tout employé",
                      "Un nouveau numéro est ajouté automatiquement à la liste.",
                    ],
                  ] as const
                ).map(([value, title, text]) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => setDraft({ ...draft, open_enrollment: value })}
                    className={cn(
                      "rounded-lg border p-3 text-left text-sm",
                      draft.open_enrollment === value
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/50",
                    )}
                  >
                    <span className="block font-medium">{title}</span>
                    <span className="block text-xs text-muted-foreground">{text}</span>
                  </button>
                ))}
              </div>
            </div>
            {field("max_meals_per_day", "Plats maximum par employé et par jour", {
              type: "number",
              min: 1,
              max: 20,
            })}
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={draft.active}
                onCheckedChange={(checked) => setDraft({ ...draft, active: checked })}
              />
              Entreprise active (visible au panier)
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setDraft(null)}>
            Annuler
          </Button>
          <Button disabled={!draft?.name.trim() || saving} onClick={() => draft && onSave(draft)}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PartnerLogo({
  partner,
  size = "size-10",
}: {
  partner: Pick<Partner, "name" | "logo_url">;
  size?: string;
}) {
  return partner.logo_url ? (
    <img
      src={partner.logo_url}
      alt={partner.name}
      className={cn(size, "shrink-0 rounded-lg border border-border bg-white object-contain p-1")}
    />
  ) : (
    <span
      className={cn(
        size,
        "flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
      )}
    >
      <Building2 className="size-5" />
    </span>
  );
}

/** Logo de l'entreprise : envoyé dans le stockage des photos, aperçu et retrait. */
function LogoField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <Label>Logo</Label>
      <div className="flex items-center gap-3">
        {value ? (
          <img
            src={value}
            alt="Logo"
            className="size-16 rounded-lg border border-border bg-white object-contain p-1"
          />
        ) : (
          <span className="flex size-16 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
            <Building2 className="size-6" />
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" /> {busy ? "Envoi…" : value ? "Changer" : "Ajouter le logo"}
          </Button>
          {value && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
              Retirer
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            try {
              onChange(await uploadPhoto(file));
            } catch (error) {
              toast.error((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    </div>
  );
}

/** Situation financière : ce qu'elle doit, échéances, retards, non facturé du mois. */
function PartnerFinance({ partner }: { partner: Partner }) {
  const today = todayISO();
  const month = today.slice(0, 7);
  const { from, to } = monthBounds(month);
  const { data: lines = [] } = useQuery(partnerLinesQuery(from, to));
  const { data: invoices = [] } = useQuery(invoicesQuery());
  const { data: payments = [] } = useQuery(paymentsQuery());
  const [paying, setPaying] = useState(false);
  const mine = invoices.filter((i) => i.partner_id === partner.id);
  const myPayments = payments.filter((p) => p.partner_id === partner.id);
  const receivedThisMonth = myPayments
    .filter((p) => p.paid_on.startsWith(month))
    .reduce((s, p) => s + p.amount, 0);
  const unbilled = mine.some((i) => i.month === from)
    ? 0
    : lines.filter((l) => l.partner_id === partner.id).reduce((s, l) => s + l.amount, 0);
  const open = mine
    .filter((i) => i.status !== "payee")
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  const owed = open.reduce((s, i) => s + invoiceRemaining(i), 0);
  const overdue = open.filter((i) => isOverdue(i, today));
  const lastPaid = mine
    .filter((i) => i.status === "payee" && i.paid_at)
    .sort((a, b) => (b.paid_at ?? "").localeCompare(a.paid_at ?? ""))[0];
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Situation financière</h3>
        <Button size="sm" onClick={() => setPaying(true)}>
          <Banknote className="size-4" /> Enregistrer un paiement
        </Button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">Doit (factures envoyées)</p>
          <p className="text-lg font-bold">{formatPrice(owed)}</p>
          {overdue.length > 0 && (
            <p className="text-xs font-semibold text-rose-600">
              dont {formatPrice(overdue.reduce((s, i) => s + invoiceRemaining(i), 0))} en retard
            </p>
          )}
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">Ce mois-ci, pas encore facturé</p>
          <p className="text-lg font-bold">{formatPrice(unbilled)}</p>
          <p className="text-xs text-muted-foreground">{monthLabel(month)}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">Encaissé ce mois-ci</p>
          <p className="text-lg font-bold text-emerald-700">{formatPrice(receivedThisMonth)}</p>
          <p className="text-xs text-muted-foreground">
            Délai de paiement : {partner.payment_terms_days} jours
          </p>
          <p className="text-xs text-muted-foreground">
            {lastPaid?.paid_at
              ? `Dernier paiement le ${new Date(lastPaid.paid_at).toLocaleDateString("fr-FR")}`
              : "Aucun paiement enregistré"}
          </p>
        </div>
      </div>
      {open.length > 0 && (
        <ul className="mt-3 divide-y divide-border text-sm">
          {open.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{i.reference}</span>
                <span className="text-muted-foreground"> · {monthLabel(i.month.slice(0, 7))}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-semibold">
                  {i.amount_paid > 0
                    ? `${formatPrice(invoiceRemaining(i))} restants sur ${formatPrice(i.total)}`
                    : formatPrice(i.total)}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    isOverdue(i, today)
                      ? "bg-rose-100 text-rose-700"
                      : "bg-amber-100 text-amber-800",
                  )}
                >
                  {i.due_date
                    ? `${isOverdue(i, today) ? "En retard · échéance" : "Échéance"} ${formatDay(i.due_date).toLowerCase()}`
                    : "Sans échéance"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {myPayments.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Derniers paiements reçus
          </p>
          <ul className="mt-1 divide-y divide-border text-sm">
            {myPayments.slice(0, 6).map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  {new Date(`${p.paid_on}T00:00:00Z`).toLocaleDateString("fr-FR", {
                    timeZone: "UTC",
                  })}{" "}
                  · {PAYMENT_METHODS[p.method]}
                  {p.reference ? ` · ${p.reference}` : ""}
                  <span className="text-muted-foreground">
                    {" "}
                    · {mine.find((i) => i.id === p.invoice_id)?.reference ?? "sans facture"}
                  </span>
                </span>
                <span className="font-semibold text-emerald-700">+{formatPrice(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <PaymentDialog
        open={paying}
        partner={partner}
        invoices={open}
        onClose={() => setPaying(false)}
      />
    </div>
  );
}

type EmployeeDraft = { id?: string; full_name: string; phone: string; email: string };

function EmployeesPanel({
  partner,
  employees,
}: {
  partner: Partner;
  employees: PartnerEmployee[];
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<EmployeeDraft | null>(null);
  // Import : lignes lues depuis un fichier, un lien Google Sheets ou un copier-coller.
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<string[][]>([]);
  const [importText, setImportText] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [loadingSource, setLoadingSource] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  async function loadSource(load: () => Promise<string[][]>) {
    setLoadingSource(true);
    try {
      const rows = await load();
      setImportRows(rows);
      setImportText("");
      if (rowsToEmployees(rows).length === 0)
        toast.error("Aucun employé reconnu : vérifiez les colonnes (voir le modèle).");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoadingSource(false);
    }
  }
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["partner_employees"] });
  const shown = employees.filter((e) =>
    `${e.full_name} ${e.phone} ${e.email}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const save = useMutation({
    mutationFn: async (value: EmployeeDraft) => {
      const payload = {
        partner_id: partner.id,
        full_name: value.full_name.trim(),
        phone: value.phone.replace(/\D/g, ""),
        email: value.email.trim(),
      };
      const { error } = value.id
        ? await db.from("partner_employees").update(payload).eq("id", value.id)
        : await db.from("partner_employees").insert(payload);
      if (error)
        throw new Error(
          error.message.includes("duplicate")
            ? "Ce numéro est déjà enregistré pour cette entreprise."
            : error.message,
        );
    },
    onSuccess: () => {
      invalidate();
      setDraft(null);
      toast.success("Employé enregistré");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const importMany = useMutation({
    mutationFn: async (rows: ImportedEmployee[]) => {
      const { error } = await db.from("partner_employees").upsert(
        rows.map((r) => ({ ...r, partner_id: partner.id })),
        { onConflict: "partner_id,phone" },
      );
      if (error) throw new Error(error.message);
      return rows.length;
    },
    onSuccess: (n) => {
      invalidate();
      setImportOpen(false);
      setImportRows([]);
      setImportText("");
      toast.success(`${n} employé(s) importé(s)`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bulk = useMutation({
    mutationFn: async (input: {
      ids: string[];
      action: "desactiver" | "reactiver" | "codes" | "supprimer";
    }) => {
      if (input.action === "supprimer") {
        const { error } = await db.from("partner_employees").delete().in("id", input.ids);
        if (error) throw new Error(error.message);
        return;
      }
      if (input.action === "codes") {
        for (const id of input.ids) {
          const { error } = await db
            .from("partner_employees")
            .update({
              pin: String(Math.floor(Math.random() * 10000)).padStart(4, "0"),
              pin_failures: 0,
            })
            .eq("id", id);
          if (error) throw new Error(error.message);
        }
        return;
      }
      const { error } = await db
        .from("partner_employees")
        .update({ active: input.action === "reactiver" })
        .in("id", input.ids);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, input) => {
      invalidate();
      setPicked(new Set());
      toast.success(
        {
          desactiver: "Employés désactivés",
          reactiver: "Employés réactivés",
          codes: "Nouveaux codes créés",
          supprimer: "Employés supprimés",
        }[input.action],
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** Liste des employés avec leurs codes, à transmettre au responsable de l'entreprise. */
  function exportEmployees(list: PartnerEmployee[]) {
    const q = csvCell;
    const rows = [
      ["Nom complet", "Téléphone", "Email", "Code", "Actif"],
      ...list.map((e) => [e.full_name, e.phone, e.email, e.pin, e.active ? "oui" : "non"]),
    ];
    downloadFile(
      `employes-${partner.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`,
      rows.map((r) => r.map(q).join(";")).join("\n"),
      "text/csv;charset=utf-8",
    );
  }

  const patch = useMutation({
    mutationFn: async (input: { id: string; values: Partial<PartnerEmployee> }) => {
      const { error } = await db.from("partner_employees").update(input.values).eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const parsed = rowsToEmployees(importText.trim() ? parseDelimited(importText) : importRows);
  const valid =
    !!draft &&
    draft.full_name.trim().length >= 2 &&
    draft.phone.replace(/\D/g, "").length >= 7 &&
    /.+@.+\..+/.test(draft.email);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">
          Employés ({employees.filter((e) => e.active).length} actifs)
        </h3>
        <div className="flex flex-wrap gap-2">
          <Input
            className="h-9 w-48"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadEmployeesTemplate(partner.name)}
          >
            <Download className="size-4" /> Modèle à remplir
          </Button>
          {employees.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => exportEmployees(employees)}>
              <FileSpreadsheet className="size-4" /> Exporter
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" /> Importer
          </Button>
          <Button size="sm" onClick={() => setDraft({ full_name: "", phone: "", email: "" })}>
            <Plus className="size-4" /> Ajouter
          </Button>
        </div>
      </div>

      {employees.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Ajoutez les employés un par un, ou importez la liste de l'entreprise : fichier Excel ou
          CSV, lien Google Sheets ou copier-coller. Téléchargez le{" "}
          <button
            type="button"
            className="font-medium text-primary underline"
            onClick={() => downloadEmployeesTemplate(partner.name)}
          >
            modèle à remplir
          </button>{" "}
          (Nom, Prénom, Téléphone, Email) et envoyez-le à l'entreprise.
        </p>
      ) : (
        <>
          {picked.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-sm">
              <span className="px-2 font-medium">
                {picked.size} sélectionné{picked.size > 1 ? "s" : ""}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulk.mutate({ ids: [...picked], action: "desactiver" })}
              >
                <UserX className="size-4" /> Désactiver
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulk.mutate({ ids: [...picked], action: "reactiver" })}
              >
                <CheckCircle2 className="size-4" /> Réactiver
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulk.mutate({ ids: [...picked], action: "codes" })}
              >
                <RefreshCw className="size-4" /> Nouveaux codes
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportEmployees(employees.filter((e) => picked.has(e.id)))}
              >
                <FileSpreadsheet className="size-4" /> Exporter (avec codes)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDelete([...picked])}
              >
                <Trash2 className="size-4" /> Supprimer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
                Annuler
              </Button>
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      aria-label="Tout sélectionner"
                      checked={shown.length > 0 && shown.every((e) => picked.has(e.id))}
                      onCheckedChange={(checked) =>
                        setPicked(checked === true ? new Set(shown.map((e) => e.id)) : new Set())
                      }
                    />
                  </th>
                  <th className="px-3 py-2">Employé</th>
                  <th className="px-3 py-2">Téléphone</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((e) => {
                  const message = `Bonjour ${e.full_name}, vous pouvez commander vos repas chez ${CLIENT.name} pour ${partner.name}. Au panier, choisissez « ${partner.name} », puis entrez votre nom et votre numéro de téléphone. Commandes jusqu'à ${cutoffLabel(partner)}.`;
                  return (
                    <tr
                      key={e.id}
                      className={cn(!e.active && "text-muted-foreground line-through")}
                    >
                      <td className="px-3 py-2">
                        <Checkbox
                          aria-label={`Sélectionner ${e.full_name}`}
                          checked={picked.has(e.id)}
                          onCheckedChange={(checked) => {
                            const next = new Set(picked);
                            if (checked === true) next.add(e.id);
                            else next.delete(e.id);
                            setPicked(next);
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {e.full_name}
                        {e.auto_enrolled && (
                          <span
                            className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900"
                            title="Ajouté automatiquement à sa première commande (accès libre) : à vérifier"
                          >
                            inscrit seul
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{formatPhone(e.phone)}</td>
                      <td className="px-3 py-2">{e.email}</td>
                      <td className="px-3 py-2 font-mono">
                        {e.pin}
                        {e.pin_failures >= 5 && (
                          <span className="ml-1 text-xs font-semibold text-destructive">
                            bloqué
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <SendMessageButton
                          phone={e.phone}
                          text={message}
                          iconOnly
                          title={`Envoyer les instructions à ${e.full_name}`}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Nouveau code"
                          aria-label={`Nouveau code pour ${e.full_name}`}
                          onClick={() =>
                            patch.mutate({
                              id: e.id,
                              values: {
                                pin: String(Math.floor(Math.random() * 10000)).padStart(4, "0"),
                                pin_failures: 0,
                              },
                            })
                          }
                        >
                          <RefreshCw className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Modifier"
                          aria-label={`Modifier ${e.full_name}`}
                          onClick={() =>
                            setDraft({
                              id: e.id,
                              full_name: e.full_name,
                              phone: e.phone,
                              email: e.email,
                            })
                          }
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title={e.active ? "Désactiver (a quitté l'entreprise)" : "Réactiver"}
                          aria-label={
                            e.active ? `Désactiver ${e.full_name}` : `Réactiver ${e.full_name}`
                          }
                          onClick={() => patch.mutate({ id: e.id, values: { active: !e.active } })}
                        >
                          {e.active ? (
                            <UserX className="size-4" />
                          ) : (
                            <CheckCircle2 className="size-4" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Supprimer"
                          aria-label={`Supprimer ${e.full_name}`}
                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setConfirmDelete([e.id])}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? "Modifier l'employé" : `Nouvel employé · ${partner.name}`}
            </DialogTitle>
            <DialogDescription>Un code à 4 chiffres est créé automatiquement.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              {(
                [
                  ["full_name", "Nom et prénom", "text"],
                  ["phone", "Téléphone", "tel"],
                  ["email", "Email", "email"],
                ] as const
              ).map(([key, label, type]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`em-${key}`}>{label}</Label>
                  <Input
                    id={`em-${key}`}
                    type={type}
                    value={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Annuler
            </Button>
            <Button disabled={!valid || save.isPending} onClick={() => draft && save.mutate(draft)}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Supprimer ${confirmDelete?.length ?? 0} employé${(confirmDelete?.length ?? 0) > 1 ? "s" : ""} ?`}
        description="Ils ne pourront plus commander. Leurs commandes passées restent dans l'historique. Pour un départ temporaire, préférez « Désactiver »."
        confirmLabel="Supprimer"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) bulk.mutate({ ids: confirmDelete, action: "supprimer" });
          setConfirmDelete(null);
        }}
      />

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importer des employés · {partner.name}</DialogTitle>
            <DialogDescription>
              Colonnes : Nom, Prénom, Téléphone, Email (ou Nom complet, Téléphone, Email). Un numéro
              déjà enregistré est mis à jour ; chaque nouvel employé reçoit un code.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadEmployeesTemplate(partner.name)}
              >
                <Download className="size-4" /> Télécharger le modèle
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={loadingSource}
                onClick={() => fileRef.current?.click()}
              >
                <FileSpreadsheet className="size-4" /> Fichier Excel ou CSV
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  void loadSource(async () =>
                    /\.xlsx$/i.test(file.name)
                      ? parseXlsx(file)
                      : parseDelimited(await file.text()),
                  );
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sheet-url">Ou un lien Google Sheets</Label>
              <div className="flex gap-2">
                <Input
                  id="sheet-url"
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={!sheetUrl.trim() || loadingSource}
                  onClick={() => void loadSource(() => fetchGoogleSheet(sheetUrl.trim()))}
                >
                  Charger
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                La feuille doit être partagée en « Tous les utilisateurs disposant du lien ».
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paste">Ou collez les lignes (depuis Excel ou Google Sheets)</Label>
              <textarea
                id="paste"
                className="h-28 w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
                placeholder={"Diop\tAwa\t77 123 45 67\tawa.diop@rts.sn"}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
            </div>
            {parsed.length > 0 && (
              <div className="rounded-lg border border-border">
                <p className="border-b border-border bg-muted/50 px-3 py-2 text-sm font-medium">
                  {parsed.length} employé{parsed.length > 1 ? "s" : ""} reconnu
                  {parsed.length > 1 ? "s" : ""}
                </p>
                <ul className="max-h-40 divide-y divide-border overflow-y-auto text-sm">
                  {parsed.slice(0, 50).map((e) => (
                    <li key={e.phone} className="flex justify-between gap-3 px-3 py-1.5">
                      <span className="truncate">{e.full_name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatPhone(e.phone)} · {e.email || "sans email"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Annuler
            </Button>
            <Button
              disabled={parsed.length === 0 || importMany.isPending}
              onClick={() => importMany.mutate(parsed)}
            >
              Importer {parsed.length || ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bons de commande du jour                                                   */
/* -------------------------------------------------------------------------- */

function groupByPartner(lines: PartnerLine[]) {
  const map = new Map<string, PartnerLine[]>();
  lines.forEach((l) => map.set(l.partner_id, [...(map.get(l.partner_id) ?? []), l]));
  return map;
}

function NotesTab({ partners }: { partners: Partner[] }) {
  const queryClient = useQueryClient();
  const [day, setDay] = useState(todayISO());
  const { data: lines = [], isLoading } = useQuery(partnerLinesQuery(day, day));
  const { data: notes = [] } = useQuery(deliveryNotesQuery());
  const byPartner = useMemo(() => groupByPartner(lines), [lines]);
  const totals = new Map<string, number>();
  lines.forEach((l) => totals.set(l.product_name, (totals.get(l.product_name) ?? 0) + l.quantity));

  const deliver = useMutation({
    mutationFn: async (input: { partnerId: string; delivered: boolean }) => {
      const { error } = await db.from("partner_delivery_notes").upsert(
        {
          partner_id: input.partnerId,
          delivery_date: day,
          status: input.delivered ? "livre" : "a_livrer",
          delivered_at: input.delivered ? new Date().toISOString() : null,
        },
        { onConflict: "partner_id,delivery_date" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["partner_delivery_notes"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div>
          <h2 className="font-semibold">Bons de commande · {formatDay(day)}</h2>
          <p className="text-sm text-muted-foreground">
            {lines.reduce((s, l) => s + l.quantity, 0)} repas pour {byPartner.size} entreprise
            {byPartner.size > 1 ? "s" : ""}
            {totals.size > 0 && ` · ${[...totals].map(([name, q]) => `${q} × ${name}`).join(", ")}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {byPartner.size > 0 && (
            <Button
              variant="outline"
              onClick={() =>
                printPartnerLabels(
                  [...byPartner]
                    .map(([id, l]) => {
                      const partner = partners.find((p) => p.id === id);
                      return partner ? labelGroup(partner, l) : null;
                    })
                    .filter((g): g is LabelGroup => g !== null),
                  day,
                )
              }
            >
              <Tags className="size-4" /> Toutes les étiquettes
            </Button>
          )}
          <Input
            type="date"
            className="w-44"
            value={day}
            onChange={(e) => setDay(e.target.value || todayISO())}
          />
        </div>
      </div>

      {!isLoading && byPartner.size === 0 && (
        <section className="rounded-xl border border-border bg-card shadow-sm">
          <EmptyState title="Aucune commande d'entreprise ce jour-là" />
        </section>
      )}

      {[...byPartner].map(([partnerId, partnerLines]) => {
        const partner = partners.find((p) => p.id === partnerId);
        if (!partner) return null;
        const note = notes.find((n) => n.partner_id === partnerId && n.delivery_date === day);
        const number = `BC-${day.replaceAll("-", "")}-${partner.name.slice(0, 3).toUpperCase()}`;
        const total = partnerLines.reduce((s, l) => s + l.amount, 0);
        return (
          <article
            key={partnerId}
            className="rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <PartnerLogo partner={partner} />
                <div>
                  <p className="font-semibold">{partner.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {number} · livraison {formatHour(partner.delivery_time)} ·{" "}
                    {partnerLines.reduce((s, l) => s + l.quantity, 0)} repas ·{" "}
                    <span className="font-semibold text-foreground">{formatPrice(total)}</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => printDeliveryNote(partner, day, partnerLines, number)}
                >
                  <Printer className="size-4" /> Bon de commande (PDF)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => printPartnerLabels([labelGroup(partner, partnerLines)], day)}
                >
                  <Tags className="size-4" /> Étiquettes à découper
                </Button>
                <Button
                  size="sm"
                  variant={note?.status === "livre" ? "secondary" : "default"}
                  onClick={() => deliver.mutate({ partnerId, delivered: note?.status !== "livre" })}
                >
                  <CheckCircle2 className="size-4" />
                  {note?.status === "livre" ? "Livré et signé ✓" : "Marquer livré et signé"}
                </Button>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-border text-sm">
              {[...partnerLines]
                .sort((a, b) => a.employee.localeCompare(b.employee))
                .map((l, i) => (
                  <li key={`${l.order_id}-${i}`} className="flex justify-between gap-3 py-1.5">
                    <span>
                      <span className="font-medium">{l.employee}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {l.quantity} × {l.product_name}
                      </span>
                    </span>
                    <span>{formatPrice(l.amount)}</span>
                  </li>
                ))}
            </ul>
          </article>
        );
      })}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Facturation mensuelle                                                      */
/* -------------------------------------------------------------------------- */

function InvoicesTab({ partners }: { partners: Partner[] }) {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const { from, to } = monthBounds(month);
  // Large plage (mois précédent inclus) : une entreprise avec un jour d'envoi (ex. le 24) est
  // facturée du 25 du mois précédent au 24.
  const wideFrom = (() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(Date.UTC(y!, m! - 2, 1)).toISOString().slice(0, 10);
  })();
  const { data: allLines = [] } = useQuery(partnerLinesQuery(wideFrom, to));
  const { data: invoices = [] } = useQuery(invoicesQuery());
  const lines = useMemo(
    () =>
      allLines.filter((l) => {
        const partner = partners.find((p) => p.id === l.partner_id);
        if (!partner) return false;
        const period = billingPeriod(partner, month);
        return l.day_date >= period.from && l.day_date <= period.to;
      }),
    [allLines, partners, month],
  );
  const byPartner = useMemo(() => groupByPartner(lines), [lines]);
  const emailInvoice = useServerFn(emailPartnerInvoice);
  const sendEmail = useMutation({
    mutationFn: (partner: Partner) => {
      const period = billingPeriod(partner, month);
      return emailInvoice({ data: { partnerId: partner.id, from: period.from, to: period.to } });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["partner_invoices"] });
      if ("sent" in result && result.sent) toast.success(`Facture envoyée à ${result.to}`);
      else toast.info("reason" in result ? String(result.reason) : "Rien à envoyer");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createInvoice = useMutation({
    mutationFn: async (input: { partner: Partner; total: number }) => {
      const reference = `FAC-${month.replace("-", "")}-${input.partner.name.slice(0, 3).toUpperCase()}`;
      const { error } = await db.from("partner_invoices").upsert(
        {
          partner_id: input.partner.id,
          month: from,
          reference,
          total: input.total,
          status: "envoyee",
          sent_at: new Date().toISOString(),
          due_date: dueDateFrom(todayISO(), input.partner.payment_terms_days),
          period_start: billingPeriod(input.partner, month).from,
          period_end: billingPeriod(input.partner, month).to,
        },
        { onConflict: "partner_id,month" },
      );
      if (error) throw new Error(error.message);
      return reference;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner_invoices"] });
      toast.success("Facture enregistrée comme envoyée");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const [paying, setPaying] = useState<{ partner: Partner; invoiceId: string } | null>(null);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div>
          <h2 className="font-semibold">Facturation · {monthLabel(month)}</h2>
          <p className="text-sm text-muted-foreground">
            Total du mois :{" "}
            <span className="font-semibold text-foreground">
              {formatPrice(lines.reduce((s, l) => s + l.amount, 0))}
            </span>{" "}
            pour {byPartner.size} entreprise{byPartner.size > 1 ? "s" : ""}
          </p>
        </div>
        <Input
          type="month"
          className="w-44"
          value={month}
          onChange={(e) => setMonth(e.target.value || todayISO().slice(0, 7))}
        />
      </div>

      {byPartner.size === 0 && (
        <section className="rounded-xl border border-border bg-card shadow-sm">
          <EmptyState title="Aucune commande d'entreprise ce mois-ci" />
        </section>
      )}

      {[...byPartner].map(([partnerId, partnerLines]) => {
        const partner = partners.find((p) => p.id === partnerId);
        if (!partner) return null;
        const total = partnerLines.reduce((s, l) => s + l.amount, 0);
        const notesCount = new Set(partnerLines.map((l) => l.day_date)).size;
        const invoice = invoices.find((i) => i.partner_id === partnerId && i.month === from);
        const reference =
          invoice?.reference ??
          `FAC-${month.replace("-", "")}-${partner.name.slice(0, 3).toUpperCase()}`;
        return (
          <article
            key={partnerId}
            className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <PartnerLogo partner={partner} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{partner.name}</p>
              <p className="text-sm text-muted-foreground">
                {(() => {
                  const period = billingPeriod(partner, month);
                  return `Du ${formatDay(period.from).toLowerCase()} au ${formatDay(period.to).toLowerCase()} · `;
                })()}
                {notesCount} bon{notesCount > 1 ? "s" : ""} de commande ·{" "}
                {partnerLines.reduce((s, l) => s + l.quantity, 0)} repas
              </p>
            </div>
            <p className="text-xl font-bold">{formatPrice(total)}</p>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                !invoice && "bg-muted text-muted-foreground",
                invoice?.status === "envoyee" && "bg-amber-100 text-amber-800",
                invoice?.status === "partielle" && "bg-sky-100 text-sky-800",
                invoice?.status === "payee" && "bg-emerald-100 text-emerald-800",
              )}
            >
              {!invoice
                ? "À facturer"
                : invoice.status === "payee"
                  ? "Payée"
                  : invoice.status === "partielle"
                    ? `Réglée ${formatPrice(invoice.amount_paid)} · reste ${formatPrice(invoiceRemaining(invoice))}`
                    : "Envoyée"}
            </span>
            {invoice && invoice.status !== "payee" && invoice.due_date && (
              <span
                className={cn(
                  "text-xs font-medium",
                  isOverdue(invoice, todayISO()) ? "text-rose-600" : "text-muted-foreground",
                )}
              >
                {isOverdue(invoice, todayISO()) ? "En retard · " : ""}échéance{" "}
                {formatDay(invoice.due_date).toLowerCase()}
              </span>
            )}
            {invoice?.emailed_at && (
              <span className="text-xs text-muted-foreground">
                Envoyée par email le {new Date(invoice.emailed_at).toLocaleDateString("fr-FR")}
                {invoice.email_to ? ` à ${invoice.email_to}` : ""}
              </span>
            )}
            {partner.billing_day && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                Envoi automatique le {partner.billing_day}
              </span>
            )}
            {invoice && invoice.total !== total && (
              <span className="text-xs text-amber-700">
                Montant changé depuis l'envoi ({formatPrice(invoice.total)})
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => printInvoice(partner, month, partnerLines, reference)}
              >
                <FileText className="size-4" /> Facture (PDF)
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportInvoiceCsv(partner, month, partnerLines)}
              >
                <FileSpreadsheet className="size-4" /> Excel
              </Button>
              {invoice?.status !== "payee" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sendEmail.isPending || !partner.contact_email}
                  title={
                    partner.contact_email
                      ? `Envoyer à ${partner.contact_email}`
                      : "Ajoutez l'email du responsable dans la fiche de l'entreprise"
                  }
                  onClick={() => sendEmail.mutate(partner)}
                >
                  <Mail className="size-4" />{" "}
                  {invoice?.emailed_at ? "Renvoyer par email" : "Envoyer par email"}
                </Button>
              )}
              {invoice?.status !== "payee" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => createInvoice.mutate({ partner, total })}
                >
                  {invoice ? "Mettre à jour" : "Marquer envoyée"}
                </Button>
              )}
              {invoice && invoice.status !== "payee" && (
                <Button size="sm" onClick={() => setPaying({ partner, invoiceId: invoice.id })}>
                  <Banknote className="size-4" /> Encaisser
                </Button>
              )}
            </div>
          </article>
        );
      })}
      <PaymentDialog
        open={paying !== null}
        partner={paying?.partner ?? null}
        invoiceId={paying?.invoiceId}
        invoices={invoices.filter(
          (i) => i.partner_id === paying?.partner.id && i.status !== "payee",
        )}
        onClose={() => setPaying(null)}
      />
    </section>
  );
}

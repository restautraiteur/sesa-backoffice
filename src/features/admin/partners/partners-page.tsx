import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
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
import { EmptyState, PageHeader } from "@/features/admin/components/admin-ui";
import { CLIENT } from "@/config/client";
import { formatPhone } from "@/features/admin/subscriptions/api";
import { SendMessageButton } from "@/features/admin/subscriptions/send-message-button";
import {
  cutoffLabel,
  deliveryNotesQuery,
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
import { exportInvoiceCsv, printDeliveryNote, printInvoice } from "@/features/admin/partners/print";
import { db } from "@core/lib/db";
import { formatDay, formatPrice, todayISO } from "@core/lib/format";
import { cn } from "@core/lib/utils";

const TABS = [
  ["entreprises", "Entreprises et employés"],
  ["bons", "Bons de commande"],
  ["factures", "Facturation"],
] as const;
type Tab = (typeof TABS)[number][0];

/** Entreprises partenaires : enrôlement des employés, bons de commande du jour, facture du mois. */
export function PartnersPage() {
  const [tab, setTab] = useState<Tab>("entreprises");
  const { data: partners = [] } = useQuery(partnersQuery());
  return (
    <div className="space-y-6">
      <PageHeader
        title="Entreprises partenaires"
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
      {tab === "entreprises" && <PartnersTab partners={partners} />}
      {tab === "bons" && <NotesTab partners={partners} />}
      {tab === "factures" && <InvoicesTab partners={partners} />}
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
};

const EMPTY_PARTNER: PartnerDraft = {
  name: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  delivery_address: "",
  delivery_time: "13:00",
  cutoff_time: "06:00",
  cutoff_day_offset: "0",
  active: true,
};

function PartnersTab({ partners }: { partners: Partner[] }) {
  const queryClient = useQueryClient();
  const { data: employees = [] } = useQuery(employeesQuery());
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<PartnerDraft | null>(null);
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
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="size-5" />
              </span>
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
                })
              }
            >
              <Pencil className="size-4" /> Modifier
            </Button>
          </div>
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
            <div className="grid gap-4 sm:grid-cols-2">
              {field("contact_name", "Contact (nom)")}
              {field("contact_phone", "Contact (téléphone)", { inputMode: "tel" })}
            </div>
            {field("contact_email", "Contact (email)", { type: "email" })}
            {field("delivery_address", "Adresse de livraison")}
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
              Exemple : 06:00 « le jour même » = pour un repas livré mardi, commandes jusqu'à mardi
              6 h ; ensuite, l'employé commande pour le jour suivant.
            </p>
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

type EmployeeDraft = { id?: string; full_name: string; phone: string; email: string };

/** Découpe un CSV / copier-coller Excel : nom ; téléphone ; email (séparateur ; , ou tabulation). */
function parseEmployees(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(/[;\t,]/).map((c) => c.trim().replace(/^"|"$/g, "")))
    .filter((cols) => cols.length >= 3 && cols[0] && /\d{7,}/.test(cols[1]!.replace(/\D/g, "")))
    .map((cols) => ({
      full_name: cols[0]!,
      phone: cols[1]!.replace(/\D/g, ""),
      email: cols[2]!,
    }));
}

function EmployeesPanel({
  partner,
  employees,
}: {
  partner: Partner;
  employees: PartnerEmployee[];
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<EmployeeDraft | null>(null);
  const [importText, setImportText] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
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
    mutationFn: async (rows: ReturnType<typeof parseEmployees>) => {
      const { error } = await db.from("partner_employees").upsert(
        rows.map((r) => ({ ...r, partner_id: partner.id })),
        { onConflict: "partner_id,phone" },
      );
      if (error) throw new Error(error.message);
      return rows.length;
    },
    onSuccess: (n) => {
      invalidate();
      setImportText(null);
      toast.success(`${n} employé(s) importé(s)`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const patch = useMutation({
    mutationFn: async (input: { id: string; values: Partial<PartnerEmployee> }) => {
      const { error } = await db.from("partner_employees").update(input.values).eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const parsed = importText ? parseEmployees(importText) : [];
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
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> Importer (Excel / CSV)
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setImportText(await file.text());
              e.target.value = "";
            }}
          />
          <Button size="sm" onClick={() => setDraft({ full_name: "", phone: "", email: "" })}>
            <Plus className="size-4" /> Ajouter
          </Button>
        </div>
      </div>

      {employees.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Ajoutez les employés un par un, ou importez la liste : une ligne par employé, « nom ;
          téléphone ; email » (enregistrez votre fichier Excel au format CSV), ou collez-la
          directement depuis Excel.{" "}
          <button
            type="button"
            className="font-medium text-primary underline"
            onClick={() => setImportText("")}
          >
            Coller une liste
          </button>
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                <th className="px-3 py-2">Employé</th>
                <th className="px-3 py-2">Téléphone</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((e) => {
                const message = `Bonjour ${e.full_name}, vous pouvez commander vos repas chez ${CLIENT.name} pour ${partner.name}. Au panier, choisissez « ${partner.name} », puis entrez votre numéro et votre code : ${e.pin}. Commandes jusqu'à ${cutoffLabel(partner)}.`;
                return (
                  <tr key={e.id} className={cn(!e.active && "text-muted-foreground line-through")}>
                    <td className="px-3 py-2 font-medium">{e.full_name}</td>
                    <td className="px-3 py-2">{formatPhone(e.phone)}</td>
                    <td className="px-3 py-2">{e.email}</td>
                    <td className="px-3 py-2 font-mono">
                      {e.pin}
                      {e.pin_failures >= 5 && (
                        <span className="ml-1 text-xs font-semibold text-destructive">bloqué</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <SendMessageButton
                        phone={e.phone}
                        text={message}
                        iconOnly
                        title={`Envoyer le code à ${e.full_name}`}
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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

      <Dialog open={importText !== null} onOpenChange={(open) => !open && setImportText(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importer des employés · {partner.name}</DialogTitle>
            <DialogDescription>
              Une ligne par employé : nom ; téléphone ; email. Un numéro déjà enregistré est mis à
              jour.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="h-48 w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
            placeholder={
              "Awa Diop;77 123 45 67;awa.diop@rts.sn\nMoussa Fall;76 987 65 43;m.fall@rts.sn"
            }
            value={importText ?? ""}
            onChange={(e) => setImportText(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            {parsed.length} employé{parsed.length > 1 ? "s" : ""} reconnu
            {parsed.length > 1 ? "s" : ""}.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportText(null)}>
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
        <Input
          type="date"
          className="w-44"
          value={day}
          onChange={(e) => setDay(e.target.value || todayISO())}
        />
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
              <div>
                <p className="font-semibold">{partner.name}</p>
                <p className="text-sm text-muted-foreground">
                  {number} · livraison {formatHour(partner.delivery_time)} ·{" "}
                  {partnerLines.reduce((s, l) => s + l.quantity, 0)} repas ·{" "}
                  <span className="font-semibold text-foreground">{formatPrice(total)}</span>
                </p>
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
  const { data: lines = [] } = useQuery(partnerLinesQuery(from, to));
  const { data: invoices = [] } = useQuery(invoicesQuery());
  const byPartner = useMemo(() => groupByPartner(lines), [lines]);

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
  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("partner_invoices")
        .update({ status: "payee", paid_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner_invoices"] });
      toast.success("Facture marquée payée");
    },
    onError: (error: Error) => toast.error(error.message),
  });

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
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{partner.name}</p>
              <p className="text-sm text-muted-foreground">
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
                invoice?.status === "payee" && "bg-emerald-100 text-emerald-800",
              )}
            >
              {!invoice ? "À facturer" : invoice.status === "payee" ? "Payée" : "Envoyée"}
            </span>
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
                  onClick={() => createInvoice.mutate({ partner, total })}
                >
                  {invoice ? "Mettre à jour" : "Marquer envoyée"}
                </Button>
              )}
              {invoice?.status === "envoyee" && (
                <Button size="sm" onClick={() => markPaid.mutate(invoice.id)}>
                  <CheckCircle2 className="size-4" /> Payée
                </Button>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

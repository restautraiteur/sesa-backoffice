import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, KeyRound, Pencil, Phone, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Switch } from "@ui/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/components/ui/dialog";
import { ConfirmDialog, EmptyState, PageHeader } from "@/features/admin/components/admin-ui";
import {
  SUBSCRIPTION_STATUS_LABELS,
  deliveredMessage,
  formatPhone,
  mealDish,
  plansAdminQuery,
  remainingMeals,
  subscriptionsQuery,
  type Plan,
  type Subscription,
} from "@/features/admin/subscriptions/api";
import { CLIENT } from "@/config/client";
import { SendMessageButton } from "@/features/admin/subscriptions/send-message-button";
import { db } from "@core/lib/db";
import { formatDay, formatPrice, todayISO } from "@core/lib/format";
import { cn } from "@core/lib/utils";

const TABS = [
  ["jour", "Repas du jour"],
  ["abonnes", "Abonnés"],
  ["formules", "Formules"],
] as const;
type Tab = (typeof TABS)[number][0];

/** Abonnements : repas à servir, abonnés à confirmer et encaisser, formules proposées sur le site. */
export function SubscriptionsPage() {
  const [tab, setTab] = useState<Tab>("jour");
  const { data: subs = [] } = useQuery(subscriptionsQuery());
  const { data: plans = [] } = useQuery(plansAdminQuery());
  const toConfirm = subs.filter((s) => s.status === "en_attente").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Abonnements"
        description="Repas achetés d'avance : les abonnés les utilisent en commandant sur le site avec leur code."
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
            {value === "abonnes" && toConfirm > 0 && (
              <span className="ml-2 rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">
                {toConfirm}
              </span>
            )}
          </button>
        ))}
      </div>
      {tab === "jour" && <TodayMeals subs={subs} />}
      {tab === "abonnes" && <Subscribers subs={subs} />}
      {tab === "formules" && <Plans plans={plans} />}
    </div>
  );
}

function useMarkDelivered() {
  const queryClient = useQueryClient();
  return useMutation({
    // Le repas passe à « pris » automatiquement quand la commande est livrée.
    mutationFn: async (orderId: string) => {
      const { error } = await db.from("orders").update({ status: "livree" }).eq("id", orderId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

function TodayMeals({ subs }: { subs: Subscription[] }) {
  const [day, setDay] = useState(todayISO());
  const markDelivered = useMarkDelivered();
  const rows = subs.flatMap((s) =>
    s.meals.filter((m) => m.meal_date === day && m.status !== "annule").map((m) => ({ s, m })),
  );
  const delivered = rows.filter((r) => r.m.status === "pris").length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-semibold">Repas des abonnés · {formatDay(day)}</h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} repas commandé{rows.length > 1 ? "s" : ""} · {delivered} livré
            {delivered > 1 ? "s" : ""}. Ils figurent aussi dans Commandes (badge « Abonné »).
          </p>
        </div>
        <Input
          type="date"
          className="w-44"
          aria-label="Jour"
          value={day}
          onChange={(e) => setDay(e.target.value || todayISO())}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Aucun repas d'abonné ce jour-là">
          Les abonnés utilisent leurs repas en commandant sur le site avec leur code.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map(({ s, m }) => {
            const remaining = remainingMeals(s);
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {s.customer_name}
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {mealDish(m) || "—"}
                    </span>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatPhone(s.phone)} · {m.orders?.reference ?? "commande supprimée"} · reste{" "}
                    {remaining} repas
                  </span>
                </span>
                {s.amount_paid < s.price && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                    reste {formatPrice(s.price - s.amount_paid)}
                  </span>
                )}
                {m.status === "pris" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                    <Check className="size-3.5" /> Livré
                  </span>
                ) : (
                  m.order_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={markDelivered.isPending}
                      onClick={() => markDelivered.mutate(m.order_id!)}
                    >
                      <Check className="size-4" /> Marquer livré
                    </Button>
                  )
                )}
                <SendMessageButton
                  phone={s.phone}
                  text={deliveredMessage(s, remaining, CLIENT.name)}
                  label="Prévenir"
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Subscribers({ subs }: { subs: Subscription[] }) {
  const queryClient = useQueryClient();
  const [toCancel, setToCancel] = useState<Subscription | null>(null);
  const [toCash, setToCash] = useState<Subscription | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["subscriptions"] });

  const update = useMutation({
    mutationFn: async (input: { sub: Subscription; patch: Partial<Subscription> }) => {
      const { error } = await db.from("subscriptions").update(input.patch).eq("id", input.sub.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Abonnement mis à jour");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const newPin = useMutation({
    mutationFn: async (sub: Subscription) => {
      const pin = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
      const { error } = await db
        .from("subscriptions")
        .update({ pin, pin_failures: 0 })
        .eq("id", sub.id);
      if (error) throw new Error(error.message);
      return pin;
    },
    onSuccess: (pin) => {
      invalidate();
      toast.success(`Nouveau code : ${pin}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (subs.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <EmptyState title="Aucun abonné pour le moment">
          Les clients s'abonnent depuis la page « Abonnement » du site.
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
              <th className="px-5 py-2.5">Abonné</th>
              <th className="px-3 py-2.5">Formule</th>
              <th className="px-3 py-2.5 text-right">Repas restants</th>
              <th className="px-3 py-2.5">Règlement</th>
              <th className="px-3 py-2.5">Statut</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {subs.map((s) => {
              const remaining = remainingMeals(s);
              const balance = s.price - s.amount_paid;
              const codeMessage = `Bonjour ${s.customer_name}, votre code abonné ${CLIENT.name} est ${s.pin}. Pour utiliser un repas : choisissez votre plat sur le site, puis entrez votre numéro et ce code au moment de valider.`;
              return (
                <tr key={s.id} className={cn(s.status === "annulee" && "text-muted-foreground")}>
                  <td className="px-5 py-3">
                    <span className="block font-medium">{s.customer_name}</span>
                    <a
                      href={`tel:+${s.phone.startsWith("221") ? s.phone : `221${s.phone}`}`}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Phone className="size-3" /> {formatPhone(s.phone)}
                    </a>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <KeyRound className="size-3" /> Code {s.pin}
                      {s.pin_failures >= 5 && (
                        <span className="font-semibold text-destructive"> · bloqué</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {s.plan_name}
                    <span className="block text-xs text-muted-foreground">
                      {s.meals_count} repas · depuis le {formatDay(s.start_date).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="text-lg font-bold">{remaining}</span>
                    <span className="text-muted-foreground"> / {s.meals_count}</span>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <span className="block text-sm font-medium">
                      {formatPrice(s.amount_paid)}{" "}
                      <span className="font-normal text-muted-foreground">
                        / {formatPrice(s.price)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {s.payment_choice === "moitie" ? "En deux fois" : "En une fois"} ·{" "}
                      {s.payment_mode === "en_ligne" ? "en ligne" : "au téléphone"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "mr-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        s.status === "en_attente" && "bg-amber-100 text-amber-800",
                        s.status === "active" && "bg-emerald-100 text-emerald-800",
                        s.status === "annulee" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {SUBSCRIPTION_STATUS_LABELS[s.status]}
                    </span>
                    <span
                      className={cn(
                        "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        s.payment_status === "paye" && "bg-emerald-100 text-emerald-800",
                        s.payment_status === "acompte" && "bg-sky-100 text-sky-800",
                        s.payment_status === "non_paye" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {PAYMENT_LABELS[s.payment_status]}
                    </span>
                    {balance > 0 && remaining <= 1 && s.status === "active" && (
                      <span className="mt-1 block text-xs font-medium text-amber-700">
                        Dernier repas bloqué jusqu'au solde
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    {s.status === "en_attente" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => update.mutate({ sub: s, patch: { status: "active" } })}
                      >
                        Confirmer
                      </Button>
                    )}
                    {s.status !== "annulee" && balance > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-1"
                        onClick={() => setToCash(s)}
                      >
                        <Banknote className="size-4" /> Encaisser
                      </Button>
                    )}
                    {s.status !== "annulee" && (
                      <>
                        <SendMessageButton
                          phone={s.phone}
                          text={codeMessage}
                          iconOnly
                          className="ml-1"
                          title={`Envoyer le code à ${s.customer_name} (SMS ou WhatsApp)`}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Nouveau code pour ${s.customer_name}`}
                          title="Nouveau code (débloque après trop d'essais)"
                          onClick={() => newPin.mutate(s)}
                        >
                          <RefreshCw className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Annuler l'abonnement de ${s.customer_name}`}
                          onClick={() => setToCancel(s)}
                        >
                          <X className="size-4" />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <CashDialog sub={toCash} onClose={() => setToCash(null)} />
      <ConfirmDialog
        open={toCancel !== null}
        title={`Annuler l'abonnement de ${toCancel?.customer_name ?? ""} ?`}
        description="Les repas restants ne pourront plus être utilisés. Les commandes déjà passées ne changent pas."
        confirmLabel="Annuler l'abonnement"
        onCancel={() => setToCancel(null)}
        onConfirm={() => {
          if (toCancel) update.mutate({ sub: toCancel, patch: { status: "annulee" } });
          setToCancel(null);
        }}
      />
    </section>
  );
}

const PAYMENT_LABELS: Record<Subscription["payment_status"], string> = {
  non_paye: "Non payé",
  acompte: "Acompte",
  paye: "Payé",
};

/** Paiement reçu par le gérant (Wave, espèces…) : acompte ou solde. Confirme l'abonnement. */
function CashDialog({ sub, onClose }: { sub: Subscription | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const balance = sub ? sub.price - sub.amount_paid : 0;
  const suggested =
    sub && sub.amount_paid === 0 && sub.payment_choice === "moitie"
      ? Math.ceil(sub.price / 2)
      : balance;
  const value = Number(amount || suggested);
  const valid = Number.isInteger(value) && value > 0 && value <= balance;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("subscription_payments").insert({
        subscription_id: sub!.id,
        amount: value,
        method: "manuel",
        status: "paye",
        note: note.trim() || null,
      });
      if (error) throw new Error(error.message);
      if (sub!.status === "en_attente") {
        const { error: statusError } = await db
          .from("subscriptions")
          .update({ status: "active" })
          .eq("id", sub!.id);
        if (statusError) throw new Error(statusError.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success("Paiement enregistré");
      setAmount("");
      setNote("");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={sub !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Encaisser · {sub?.customer_name}</DialogTitle>
        </DialogHeader>
        {sub && (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Déjà réglé : {formatPrice(sub.amount_paid)} sur {formatPrice(sub.price)}. Reste{" "}
              {formatPrice(balance)}.
            </p>
            {sub.payments.length > 0 && (
              <ul className="rounded-lg border border-border text-xs">
                {sub.payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 px-3 py-1.5">
                    <span>
                      {new Date(p.created_at).toLocaleDateString("fr-FR")} ·{" "}
                      {p.method === "paydunya" ? "en ligne" : "manuel"}
                      {p.note ? ` · ${p.note}` : ""}
                    </span>
                    <span
                      className={cn(p.status !== "paye" && "text-muted-foreground line-through")}
                    >
                      {formatPrice(p.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-2">
              <Label htmlFor="cash-amount">Montant reçu (FCFA)</Label>
              <Input
                id="cash-amount"
                type="number"
                min={1}
                max={balance}
                placeholder={String(suggested)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cash-note">Note (facultatif)</Label>
              <Input
                id="cash-note"
                placeholder="Wave, espèces, référence…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {!valid && (
              <p className="text-xs text-destructive">
                Le montant doit être compris entre 1 et {formatPrice(balance)}.
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            Enregistrer {valid ? formatPrice(value) : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PlanDraft = {
  id?: string;
  name: string;
  meals: string;
  price: string;
  delivery: boolean;
  active: boolean;
};

function Plans({ plans }: { plans: Plan[] }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const meals = Number(draft?.meals);
  const price = Number(draft?.price);
  const valid =
    !!draft?.name.trim() &&
    Number.isInteger(meals) &&
    meals >= 1 &&
    meals <= 60 &&
    Number.isInteger(price) &&
    price >= 0;

  const save = useMutation({
    mutationFn: async (value: PlanDraft) => {
      const payload = {
        name: value.name.trim(),
        meals_count: Number(value.meals),
        price: Number(value.price),
        delivery_included: value.delivery,
        active: value.active,
      };
      const { error } = value.id
        ? await db.from("subscription_plans").update(payload).eq("id", value.id)
        : await db.from("subscription_plans").insert(payload);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription_plans"] });
      setDraft(null);
      toast.success("Formule enregistrée");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-semibold">Formules</h2>
          <p className="text-sm text-muted-foreground">
            Proposées sur le site. Une formule inactive n'est plus visible mais les abonnements
            existants continuent.
          </p>
        </div>
        <Button
          onClick={() => setDraft({ name: "", meals: "", price: "", delivery: true, active: true })}
        >
          <Plus className="size-4" /> Nouvelle formule
        </Button>
      </div>
      {plans.length === 0 ? (
        <EmptyState title="Aucune formule">
          Créez vos formules (ex. « Semaine complète » : 5 repas, ou « Le Mois complet » : 22 repas)
          pour que l'abonnement apparaisse sur le site.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {plans.map((p) => (
            <li
              key={p.id}
              className={cn("flex items-center gap-4 px-5 py-3", !p.active && "opacity-60")}
            >
              <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-muted">
                <span className="font-bold leading-none">{p.meals_count}</span>
                <span className="text-[10px] uppercase">repas</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{p.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {p.delivery_included ? "Livraison incluse" : "Sans livraison"}
                  {p.active ? "" : " · inactive"}
                </span>
              </span>
              <span className="font-semibold">{formatPrice(p.price)}</span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Modifier ${p.name}`}
                onClick={() =>
                  setDraft({
                    id: p.id,
                    name: p.name,
                    meals: String(p.meals_count),
                    price: String(p.price),
                    delivery: p.delivery_included,
                    active: p.active,
                  })
                }
              >
                <Pencil className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Modifier la formule" : "Nouvelle formule"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pl-name">Nom</Label>
                <Input
                  id="pl-name"
                  placeholder="Le Mois complet"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pl-meals">Nombre de repas</Label>
                  <Input
                    id="pl-meals"
                    type="number"
                    min={1}
                    max={60}
                    value={draft.meals}
                    onChange={(e) => setDraft({ ...draft, meals: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pl-price">Prix (FCFA)</Label>
                  <Input
                    id="pl-price"
                    type="number"
                    min={0}
                    value={draft.price}
                    onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                  />
                </div>
              </div>
              <label className="flex items-center gap-3 text-sm">
                <Switch
                  checked={draft.delivery}
                  onCheckedChange={(checked) => setDraft({ ...draft, delivery: checked })}
                />
                Livraison incluse
              </label>
              <label className="flex items-center gap-3 text-sm">
                <Switch
                  checked={draft.active}
                  onCheckedChange={(checked) => setDraft({ ...draft, active: checked })}
                />
                Visible sur le site
              </label>
              {!valid && (draft.name || draft.meals || draft.price) && (
                <p className="text-xs text-destructive">
                  Indiquez un nom, un nombre de repas entre 1 et 60 et un prix.
                </p>
              )}
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
    </section>
  );
}

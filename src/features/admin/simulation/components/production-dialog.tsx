import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/components/ui/dialog";
import { productsQuery } from "@/features/admin/products/api";
import {
  ENTRY_UNITS,
  formatAmount,
  ingredientsQuery,
  referencePrice,
  type Ingredient,
  type ProductionLog,
} from "@/features/admin/simulation/api";
import { adminMenuQuery } from "@core/domain/menu/api";
import { db } from "@core/lib/db";
import { formatDay, formatPrice, todayISO } from "@core/lib/format";

const SELECT = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Unité d'une ligne : une unité libre (kg, g, L, ml, pièce) ou un format d'achat (« f:<id> »). */
type Line = { ingredientId: string; unit: string; amount: string; paid: string };
type Draft = {
  id?: string;
  productId: string;
  cookedOn: string;
  plates: string;
  /** Mode référence : plats vendus ce jour-là. */
  sold: string;
  notes: string;
  lines: Line[];
};

export type ProductionPreset = { productId: string; cookedOn: string };

/** Clôture de journée : plats vendus (commandes, repas d'abonnés compris) et prix de vente. */
export type ReferencePreset = { sold: number; price: number };

function defaultUnit(ingredient: Ingredient | undefined) {
  if (!ingredient) return "";
  return ENTRY_UNITS[ingredient.unit]?.[0]?.value ?? "piece";
}

/** Convertit une ligne saisie en quantité dans l'unité de base de l'ingrédient. */
function toBase(ingredient: Ingredient, unit: string, amount: number) {
  if (unit.startsWith("f:")) {
    const format = ingredient.formats.find((f) => f.id === unit.slice(2));
    return format ? { quantity: amount * format.size, label: format.label } : null;
  }
  const entry = (ENTRY_UNITS[ingredient.unit] ?? []).find((u) => u.value === unit);
  return entry ? { quantity: amount * entry.factor, label: entry.label } : null;
}

/**
 * Fiche de cuisson : ce que la cuisinière a utilisé (prix payé facultatif) et les plats obtenus.
 * À l'enregistrement : le stock du plat du jour prend le nombre de plats obtenus, et les prix payés
 * deviennent les nouveaux prix de référence des ingrédients.
 */
export function ProductionDialog({
  open,
  onClose,
  preset,
  log,
  reference,
}: {
  open: boolean;
  onClose: () => void;
  preset?: ProductionPreset | null;
  log?: ProductionLog | null;
  /** Ouvre la fiche en mode « Ajouter comme référence pour la simulation ». */
  reference?: ReferencePreset | null;
}) {
  const queryClient = useQueryClient();
  const { data: ingredients = [] } = useQuery(ingredientsQuery());
  const { data: products = [] } = useQuery(productsQuery());
  const { data: menu = [] } = useQuery(adminMenuQuery());
  const dishes = products.filter((p) => p.category === "plat");
  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const [draft, setDraft] = useState<Draft | null>(null);

  // Initialise la fiche à l'ouverture : une fiche existante, ou une nouvelle (plat et date pré-remplis).
  useEffect(() => {
    if (!open) {
      setDraft(null);
      return;
    }
    if (log) {
      setDraft({
        id: log.id,
        productId: log.product_id,
        cookedOn: log.cooked_on,
        plates: String(log.plates_obtained),
        sold: String(reference?.sold ?? log.plates_sold ?? ""),
        notes: log.notes ?? "",
        lines: log.items.map((item) => {
          const ingredient = ingredientById.get(item.ingredient_id);
          const format = ingredient?.formats.find((f) => f.label === item.format_label);
          const entry = ingredient
            ? (ENTRY_UNITS[ingredient.unit] ?? []).find((u) => u.label === item.format_label)
            : undefined;
          return {
            ingredientId: item.ingredient_id,
            unit: format ? `f:${format.id}` : (entry?.value ?? defaultUnit(ingredient)),
            amount: String(item.format_count),
            paid: String(item.cost),
          };
        }),
      });
      return;
    }
    const todayDish = menu.find((m) => m.day_date === todayISO() && m.category === "plat");
    setDraft({
      productId: preset?.productId ?? todayDish?.product_id ?? dishes[0]?.id ?? "",
      cookedOn: preset?.cookedOn ?? todayISO(),
      plates: "",
      sold: reference ? String(reference.sold) : "",
      notes: "",
      lines: [],
    });
    // On ne réinitialise qu'à l'ouverture, pas à chaque rafraîchissement des données.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, log?.id]);

  const computed = (draft?.lines ?? []).map((line) => {
    const ingredient = ingredientById.get(line.ingredientId);
    const amount = Number(line.amount);
    const base = ingredient && amount > 0 ? toBase(ingredient, line.unit, amount) : null;
    const paidText = line.paid.trim();
    const paid = paidText === "" ? null : Number(paidText);
    const paidValid = paid === null || (Number.isFinite(paid) && paid >= 0);
    const cost =
      base && ingredient
        ? paid !== null && paidValid
          ? Math.round(paid)
          : Math.round(base.quantity * referencePrice(ingredient))
        : 0;
    return { line, ingredient, base, paid, ok: !!base && paidValid, cost };
  });

  const plates = Number(draft?.plates);
  const menuRow = draft
    ? menu.find((m) => m.product_id === draft.productId && m.day_date === draft.cookedOn)
    : undefined;
  const sold = Number(draft?.sold);
  const soldValid =
    !reference || (Number.isInteger(sold) && sold >= 0 && (!(plates > 0) || sold <= plates));
  const revenue = reference && soldValid ? sold * reference.price : 0;
  const minPlates = Math.max(1, menuRow?.stock_reserved ?? 0);
  const valid =
    !!draft?.productId &&
    !!draft.cookedOn &&
    Number.isInteger(plates) &&
    plates >= minPlates &&
    computed.length > 0 &&
    computed.every((c) => c.ok) &&
    soldValid;
  const total = computed.reduce((s, c) => s + c.cost, 0);

  const save = useMutation({
    mutationFn: async (value: Draft) => {
      const payload = {
        product_id: value.productId,
        day_product_id: menuRow?.day_product_id ?? null,
        cooked_on: value.cookedOn,
        plates_obtained: plates,
        notes: value.notes.trim() || null,
        ...(reference
          ? {
              is_reference: true,
              plates_sold: sold,
              revenue,
              sold_out: sold >= plates,
              closed_at: new Date().toISOString(),
            }
          : {}),
      };
      let id = value.id;
      if (id) {
        const { error } = await db.from("production_logs").update(payload).eq("id", id);
        if (error) throw new Error(error.message);
        const { error: delError } = await db.from("production_log_items").delete().eq("log_id", id);
        if (delError) throw new Error(delError.message);
      } else {
        const { data, error } = await db
          .from("production_logs")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        id = data.id as string;
      }
      const { error: itemsError } = await db.from("production_log_items").insert(
        computed.map((c) => ({
          log_id: id,
          ingredient_id: c.ingredient!.id,
          format_label: c.base!.label,
          format_count: Number(c.line.amount),
          quantity: c.base!.quantity,
          cost: c.cost,
        })),
      );
      if (itemsError) throw new Error(itemsError.message);

      // Prix du marché : le prix payé devient le prix de référence de l'ingrédient.
      for (const c of computed) {
        if (c.paid !== null && c.paid > 0 && c.base && c.base.quantity > 0) {
          await db
            .from("ingredients")
            .update({ price_per_unit: c.paid / c.base.quantity })
            .eq("id", c.ingredient!.id);
        }
      }
      // Stock du plat du jour = plats obtenus (les clients peuvent commander).
      if (menuRow) {
        const { error: stockError } = await db
          .from("day_products")
          .update({ stock_initial: plates })
          .eq("id", menuRow.day_product_id);
        if (stockError) throw new Error(stockError.message);
      }
      return !!menuRow;
    },
    onSuccess: (stockUpdated) => {
      queryClient.invalidateQueries({ queryKey: ["production_logs"] });
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      queryClient.invalidateQueries({ queryKey: ["menu"] });
      toast.success(
        reference
          ? "Journée ajoutée comme référence pour la simulation"
          : stockUpdated
            ? `Cuisson enregistrée : stock du plat mis à ${plates}`
            : "Cuisson enregistrée",
      );
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function patchLine(index: number, patch: Partial<Line>) {
    if (!draft) return;
    setDraft({
      ...draft,
      lines: draft.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {reference
              ? "Ajouter comme référence pour la simulation"
              : draft?.id
                ? "Modifier la cuisson"
                : "Enregistrer la cuisson"}
          </DialogTitle>
          <DialogDescription>
            {reference
              ? "Ce que vous avez acheté pour ce plat, les plats préparés et vendus : la simulation repartira de cette journée pour calculer les quantités et le chiffre d'affaires."
              : "Ce que vous avez utilisé et le nombre de plats obtenus. Le prix payé est facultatif : sans prix, le dernier prix connu est utilisé."}
          </DialogDescription>
        </DialogHeader>
        {draft && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="pd-dish">Plat</Label>
                <select
                  id="pd-dish"
                  className={SELECT}
                  value={draft.productId}
                  onChange={(e) => setDraft({ ...draft, productId: e.target.value })}
                >
                  {dishes.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pd-date">Date de cuisson</Label>
                <Input
                  id="pd-date"
                  type="date"
                  max={todayISO()}
                  value={draft.cookedOn}
                  onChange={(e) => setDraft({ ...draft, cookedOn: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pd-plates">{reference ? "Plats préparés" : "Plats obtenus"}</Label>
                <Input
                  id="pd-plates"
                  type="number"
                  min={minPlates}
                  placeholder="52"
                  value={draft.plates}
                  onChange={(e) => setDraft({ ...draft, plates: e.target.value })}
                />
              </div>
            </div>
            {reference && (
              <div className="grid gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="pd-sold">Plats vendus</Label>
                  <Input
                    id="pd-sold"
                    type="number"
                    min={0}
                    value={draft.sold}
                    onChange={(e) => setDraft({ ...draft, sold: e.target.value })}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Invendus</p>
                  <p className="mt-2 text-lg font-semibold">
                    {plates > 0 && soldValid ? Math.max(0, plates - sold) : "—"}
                    {plates > 0 && soldValid && sold >= plates && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        épuisé
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Chiffre d'affaires ({formatPrice(reference.price)} le plat)
                  </p>
                  <p className="mt-2 text-lg font-semibold">{formatPrice(revenue)}</p>
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-3">
                  Rempli à partir des commandes du jour, repas d'abonnés compris. Corrigez si besoin
                  (ventes sur place, plats offerts…).
                </p>
                {!soldValid && (
                  <p className="text-xs text-destructive sm:col-span-3">
                    Les plats vendus ne peuvent pas dépasser les plats préparés.
                  </p>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {menuRow
                ? `Au menu du ${formatDay(draft.cookedOn)} : le stock du plat passera à ${
                    Number.isInteger(plates) && plates > 0 ? plates : "…"
                  } (${menuRow.stock_reserved} déjà commandé${menuRow.stock_reserved > 1 ? "s" : ""}).`
                : "Ce plat n'est pas au menu de ce jour : la cuisson sera enregistrée sans changer de stock."}
            </p>

            <div className="space-y-2">
              <p className="text-sm font-medium">Ingrédients utilisés</p>
              {computed.length === 0 && (
                <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  Ajoutez chaque ingrédient : quantité (ex. 5 kg) et, si vous le souhaitez, le prix
                  payé au marché.
                </p>
              )}
              {computed.map((c, index) => {
                const units = c.ingredient ? (ENTRY_UNITS[c.ingredient.unit] ?? []) : [];
                return (
                  <div
                    key={index}
                    className="grid grid-cols-[1fr_2rem] items-center gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_5rem_6rem_7rem_2rem] sm:border-0 sm:p-0"
                  >
                    <select
                      aria-label="Ingrédient"
                      className={SELECT}
                      value={c.line.ingredientId}
                      onChange={(e) => {
                        const ingredient = ingredientById.get(e.target.value);
                        patchLine(index, {
                          ingredientId: e.target.value,
                          unit: defaultUnit(ingredient),
                        });
                      }}
                    >
                      <option value="">Ingrédient…</option>
                      {ingredients.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="sm:order-last"
                      aria-label="Retirer la ligne"
                      onClick={() =>
                        setDraft({ ...draft, lines: draft.lines.filter((_, i) => i !== index) })
                      }
                    >
                      <X className="size-4" />
                    </Button>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      aria-label="Quantité"
                      placeholder="5"
                      value={c.line.amount}
                      onChange={(e) => patchLine(index, { amount: e.target.value })}
                    />
                    <select
                      aria-label="Unité"
                      className={SELECT}
                      value={c.line.unit}
                      disabled={!c.ingredient}
                      onChange={(e) => patchLine(index, { unit: e.target.value })}
                    >
                      {units.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                      {(c.ingredient?.formats ?? []).map((f) => (
                        <option key={f.id} value={`f:${f.id}`}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min={0}
                      aria-label="Prix payé (facultatif)"
                      placeholder={
                        c.base && c.ingredient
                          ? `≈ ${Math.round(c.base.quantity * referencePrice(c.ingredient))}`
                          : "Prix payé"
                      }
                      value={c.line.paid}
                      onChange={(e) => patchLine(index, { paid: e.target.value })}
                    />
                    {c.base && c.ingredient && (
                      <p className="col-span-2 text-xs text-muted-foreground sm:col-span-5">
                        {formatAmount(c.base.quantity, c.ingredient.unit)} ·{" "}
                        {c.paid !== null ? "prix payé" : "dernier prix connu"} :{" "}
                        <span className="font-semibold text-foreground">{formatPrice(c.cost)}</span>
                      </p>
                    )}
                  </div>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                disabled={ingredients.length === 0}
                onClick={() =>
                  setDraft({
                    ...draft,
                    lines: [...draft.lines, { ingredientId: "", unit: "", amount: "", paid: "" }],
                  })
                }
              >
                <Plus className="size-4" /> Ajouter un ingrédient
              </Button>
              {ingredients.length === 0 && (
                <p className="text-xs text-destructive">
                  Créez d'abord vos ingrédients dans Simulation › Ingrédients.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pd-notes">Notes (facultatif)</Label>
              <Input
                id="pd-notes"
                value={draft.notes}
                placeholder="Ex. riz un peu trop cuit, portions plus généreuses"
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>

            <div className="grid gap-3 rounded-lg bg-muted/50 p-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Dépense de la cuisson</p>
                <p className="text-lg font-semibold">{formatPrice(total)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Coût par plat</p>
                <p className="text-lg font-semibold">
                  {plates > 0 ? formatPrice(Math.round(total / plates)) : "—"}
                </p>
              </div>
            </div>
            {Number.isInteger(plates) && plates > 0 && plates < minPlates && (
              <p className="text-xs text-destructive">
                {minPlates} plat(s) déjà commandé(s) : indiquez au moins ce nombre.
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!valid || save.isPending} onClick={() => draft && save.mutate(draft)}>
            {save.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

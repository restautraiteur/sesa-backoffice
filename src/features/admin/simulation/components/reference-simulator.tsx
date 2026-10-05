import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Copy, FlaskConical, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { EmptyState } from "@/features/admin/components/admin-ui";
import { addDays, mondayOf } from "@/features/admin/menu-planning/calendar";
import type { Product } from "@/features/admin/products/api";
import {
  dishReferences,
  formatAmount,
  formatQty,
  referencePrice,
  shoppingList,
  type Ingredient,
  type ProductionLog,
} from "@/features/admin/simulation/api";
import type { MenuRow } from "@core/domain/menu/api";
import { db } from "@core/lib/db";
import { formatDay, formatPrice, todayISO } from "@core/lib/format";
import { cn } from "@core/lib/utils";

const SELECT = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

type Mode = "plat" | "jour" | "semaine";

/** Un plat à simuler : seul, ou au menu d'un jour (on peut alors appliquer le résultat au stock). */
type Line = {
  key: string;
  productId: string;
  name: string;
  price: number;
  date: string | null;
  dayProductId: string | null;
  reserved: number;
};

/** Unité de saisie pour ajuster un ingrédient : kg pour les grammes, L pour les millilitres. */
function displayUnit(unit: string) {
  if (unit === "g") return { label: "kg", factor: 1000 };
  if (unit === "ml") return { label: "L", factor: 1000 };
  return { label: "pièce(s)", factor: 1 };
}

const PRESETS = [
  { label: "÷ 2", factor: 0.5 },
  { label: "Même quantité", factor: 1 },
  { label: "× 1,5", factor: 1.5 },
  { label: "× 2", factor: 2 },
];

/**
 * Simulation à partir d'une journée de référence : on choisit un plat, le menu d'un jour ou la
 * semaine, une référence par plat (la plus récente par défaut), puis on agrandit ou réduit.
 * Résultat : plats prévus, chiffre d'affaires estimé, liste de courses, bénéfice.
 */
export function ReferenceSimulator({
  menu,
  products,
  ingredients,
  logs,
}: {
  menu: MenuRow[];
  products: Product[];
  ingredients: Ingredient[];
  logs: ProductionLog[];
}) {
  const queryClient = useQueryClient();
  const today = todayISO();
  const dishes = products.filter((p) => p.category === "plat");
  const dishRows = useMemo(() => menu.filter((m) => m.category === "plat"), [menu]);
  const days = useMemo(() => [...new Set(dishRows.map((m) => m.day_date))].sort(), [dishRows]);
  const weeks = useMemo(() => [...new Set(days.map(mondayOf))].sort(), [days]);
  const defaultDay = days.find((d) => d >= today) ?? days[days.length - 1] ?? today;
  const withReference = dishes.filter((d) => dishReferences(d.id, logs).length > 0);

  const [mode, setMode] = useState<Mode>("plat");
  const [dishId, setDishId] = useState(withReference[0]?.id ?? dishes[0]?.id ?? "");
  const [day, setDay] = useState(defaultDay);
  const [week, setWeek] = useState(mondayOf(defaultDay));
  const [globalFactor, setGlobalFactor] = useState(1);
  const [factors, setFactors] = useState<Record<string, number>>({});
  const [chosenRefs, setChosenRefs] = useState<Record<string, string>>({});

  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  const lines: Line[] = useMemo(() => {
    if (mode === "plat") {
      const dish = dishes.find((d) => d.id === dishId);
      return dish
        ? [
            {
              key: dish.id,
              productId: dish.id,
              name: dish.name,
              price: dish.base_price,
              date: null,
              dayProductId: null,
              reserved: 0,
            },
          ]
        : [];
    }
    const start = mode === "jour" ? day : week;
    const end = mode === "jour" ? day : addDays(week, 6);
    return dishRows
      .filter((m) => m.day_date >= start && m.day_date <= end && m.is_active)
      .sort((a, b) => a.day_date.localeCompare(b.day_date))
      .map((m) => ({
        key: m.day_product_id,
        productId: m.product_id,
        name: m.name,
        price: m.price,
        date: m.day_date,
        dayProductId: m.day_product_id,
        reserved: m.stock_reserved,
      }));
  }, [mode, dishId, day, week, dishes, dishRows]);

  const results = lines.map((line) => {
    const refs = dishReferences(line.productId, logs);
    const ref = refs.find((r) => r.id === chosenRefs[line.key]) ?? refs[0] ?? null;
    const factor = factors[line.key] ?? globalFactor;
    if (!ref) return { line, refs, ref: null, factor };
    const plates = Math.max(0, Math.round(ref.plates_obtained * factor));
    const sellRate =
      ref.plates_sold !== null && ref.plates_obtained > 0
        ? Math.min(1, ref.plates_sold / ref.plates_obtained)
        : 1;
    const soldEstimate = Math.round(plates * sellRate);
    const needs = ref.items.map((i) => ({
      ingredientId: i.ingredient_id,
      quantity: i.quantity * factor,
    }));
    const cost = Math.round(
      needs.reduce((s, n) => {
        const ingredient = ingredientById.get(n.ingredientId);
        return s + (ingredient ? n.quantity * referencePrice(ingredient) : 0);
      }, 0),
    );
    return {
      line,
      refs,
      ref,
      factor,
      plates,
      sellRate,
      soldEstimate,
      revenue: soldEstimate * line.price,
      needs,
      cost,
    };
  });

  const simulated = results.filter((r) => r.ref);
  const missing = results.filter((r) => !r.ref);
  const shopping = shoppingList(
    simulated.flatMap((r) => r.needs ?? []),
    ingredientById,
  );
  const totalPlates = simulated.reduce((s, r) => s + (r.plates ?? 0), 0);
  const totalSold = simulated.reduce((s, r) => s + (r.soldEstimate ?? 0), 0);
  const totalRevenue = simulated.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const totalCost = shopping.reduce((s, l) => s + l.cost, 0);
  const applicable = simulated.filter(
    (r) => r.line.dayProductId && r.line.date && r.line.date >= today,
  );

  const periodLabel =
    mode === "plat"
      ? (lines[0]?.name ?? "")
      : mode === "jour"
        ? formatDay(day)
        : `semaine du ${formatDay(week).toLowerCase()}`;
  const shoppingText = [
    `Liste de courses — ${periodLabel}`,
    ...shopping.map(
      (l) =>
        `- ${l.ingredient.name} : ${
          l.format
            ? `${formatQty(l.count)} × ${l.format.label}`
            : formatAmount(l.quantity, l.ingredient.unit)
        } (≈ ${formatPrice(l.cost)})`,
    ),
    `Total ≈ ${formatPrice(totalCost)}`,
  ].join("\n");

  const apply = useMutation({
    mutationFn: async () => {
      for (const r of applicable) {
        const { error } = await db
          .from("day_products")
          .update({ stock_initial: Math.max(r.plates ?? 0, r.line.reserved) })
          .eq("id", r.line.dayProductId!);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu"] });
      toast.success("Quantités appliquées au menu");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function copyShopping() {
    try {
      await navigator.clipboard.writeText(shoppingText);
      toast.success("Liste de courses copiée");
    } catch {
      toast.error("Copie impossible : sélectionnez le texte manuellement.");
    }
  }

  function setAll(factor: number) {
    setGlobalFactor(factor);
    setFactors({});
  }

  if (withReference.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <EmptyState title="Pas encore de référence">
          En fin de journée, dans le tableau de bord, cliquez sur « Ajouter comme référence » à côté
          d'un plat : vous notez ce que vous avez acheté, préparé et vendu. La simulation repartira
          de ces journées.
        </EmptyState>
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-end">
        <div className="space-y-2">
          <Label>Simuler</Label>
          <div role="radiogroup" className="flex w-fit rounded-lg bg-muted p-1">
            {(
              [
                ["plat", "Un plat"],
                ["jour", "Le menu d'un jour"],
                ["semaine", "La semaine"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => {
                  setMode(value);
                  setFactors({});
                }}
                className={cn(
                  "h-9 rounded-md px-3 text-sm font-medium",
                  mode === value ? "bg-card shadow-sm" : "text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="max-w-sm space-y-2">
          {mode === "plat" && (
            <>
              <Label htmlFor="rs-dish">Plat</Label>
              <select
                id="rs-dish"
                className={SELECT}
                value={dishId}
                onChange={(e) => setDishId(e.target.value)}
              >
                {dishes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {dishReferences(d.id, logs).length === 0 ? " (pas de référence)" : ""}
                  </option>
                ))}
              </select>
            </>
          )}
          {mode === "jour" && (
            <>
              <Label htmlFor="rs-day">Jour du menu</Label>
              <select
                id="rs-day"
                className={SELECT}
                value={day}
                onChange={(e) => setDay(e.target.value)}
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {formatDay(d)}
                  </option>
                ))}
              </select>
            </>
          )}
          {mode === "semaine" && (
            <>
              <Label htmlFor="rs-week">Semaine</Label>
              <select
                id="rs-week"
                className={SELECT}
                value={week}
                onChange={(e) => setWeek(e.target.value)}
              >
                {weeks.map((w) => (
                  <option key={w} value={w}>
                    Semaine du {formatDay(w).toLowerCase()}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {lines.length > 1 ? "Pour tous les plats :" : "Quantité :"}
        </span>
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            size="sm"
            variant={
              globalFactor === p.factor && Object.keys(factors).length === 0 ? "default" : "outline"
            }
            onClick={() => setAll(p.factor)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {lines.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun plat au menu pour cette période.</p>
      )}

      <div className="space-y-4">
        {results.map((r) => (
          <article key={r.line.key} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{r.line.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.line.date ? `${formatDay(r.line.date)} · ` : ""}
                  {formatPrice(r.line.price)} le plat
                </p>
              </div>
              {r.refs.length > 0 && (
                <div className="w-full max-w-xs space-y-1">
                  <Label htmlFor={`ref-${r.line.key}`} className="text-xs">
                    Journée de référence
                  </Label>
                  <select
                    id={`ref-${r.line.key}`}
                    className={SELECT}
                    value={r.ref?.id ?? ""}
                    onChange={(e) => setChosenRefs({ ...chosenRefs, [r.line.key]: e.target.value })}
                  >
                    {r.refs.map((ref) => (
                      <option key={ref.id} value={ref.id}>
                        {formatDay(ref.cooked_on)} · {ref.plates_obtained} préparés ·{" "}
                        {ref.plates_sold ?? "?"} vendus{ref.sold_out ? " · épuisé" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {!r.ref ? (
              <p className="mt-3 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                Pas encore de référence pour ce plat : en fin de journée, cliquez sur « Ajouter
                comme référence » dans le tableau de bord.
              </p>
            ) : (
              <>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor={`target-${r.line.key}`} className="text-xs">
                      Plats à préparer
                    </Label>
                    <Input
                      id={`target-${r.line.key}`}
                      type="number"
                      min={1}
                      className="w-28"
                      value={r.plates}
                      onChange={(e) => {
                        const target = Number(e.target.value);
                        if (target > 0 && r.ref)
                          setFactors({ ...factors, [r.line.key]: target / r.ref.plates_obtained });
                      }}
                    />
                  </div>
                  <p className="pb-2 text-sm text-muted-foreground">
                    contre {r.ref.plates_obtained} le {formatDay(r.ref.cooked_on).toLowerCase()} (×
                    {formatQty(r.factor)})
                  </p>
                </div>

                <details className="mt-3 rounded-lg bg-muted/40 p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Ingrédients ({r.ref.items.length}) — modifiez une quantité, le reste suit
                  </summary>
                  <ul className="mt-3 space-y-2">
                    {r.ref.items.map((item) => {
                      const ingredient = ingredientById.get(item.ingredient_id);
                      if (!ingredient) return null;
                      const unit = displayUnit(ingredient.unit);
                      const current = (item.quantity * r.factor) / unit.factor;
                      return (
                        <li
                          key={item.id}
                          className="grid grid-cols-[1fr_7rem_auto] items-center gap-2 text-sm"
                        >
                          <span>
                            {ingredient.name}
                            <span className="block text-xs text-muted-foreground">
                              référence : {formatAmount(item.quantity, ingredient.unit)}
                            </span>
                          </span>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            aria-label={`Quantité de ${ingredient.name}`}
                            value={Number(current.toFixed(2))}
                            onChange={(e) => {
                              const value = Number(e.target.value);
                              if (value > 0)
                                setFactors({
                                  ...factors,
                                  [r.line.key]: (value * unit.factor) / item.quantity,
                                });
                            }}
                          />
                          <span className="text-muted-foreground">{unit.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                </details>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Stat label="Plats préparés" value={String(r.plates)} />
                  <Stat
                    label="Ventes estimées"
                    value={`${r.soldEstimate}`}
                    hint={`${Math.round((r.sellRate ?? 1) * 100)} % vendus à la référence`}
                  />
                  <Stat label="Chiffre d'affaires" value={formatPrice(r.revenue ?? 0)} />
                  <Stat label="Coût des ingrédients" value={formatPrice(r.cost ?? 0)} />
                </dl>
                {r.ref.sold_out && r.factor <= 1 && (
                  <p className="mt-2 text-xs text-amber-700">
                    Ce plat était épuisé à la référence : la demande était peut-être plus forte.
                  </p>
                )}
              </>
            )}
          </article>
        ))}
      </div>

      {simulated.length > 0 && (
        <div className="space-y-4 rounded-xl bg-muted/50 p-4">
          <p className="text-sm font-semibold">
            Total {mode === "plat" ? "" : `· ${periodLabel}`}
            {missing.length > 0 &&
              ` (sans ${missing.length} plat${missing.length > 1 ? "s" : ""} sans référence)`}
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Plats préparés" value={String(totalPlates)} />
            <Stat label="Ventes estimées" value={String(totalSold)} />
            <Stat label="Chiffre d'affaires estimé" value={formatPrice(totalRevenue)} />
            <Stat
              label="Bénéfice estimé"
              value={formatPrice(totalRevenue - totalCost)}
              hint={`après ${formatPrice(totalCost)} de courses`}
              tone={totalRevenue - totalCost >= 0 ? "good" : "bad"}
            />
          </dl>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Liste de courses</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyShopping}>
                  <Copy className="size-4" /> Copier
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(shoppingText)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="size-4" /> WhatsApp
                  </a>
                </Button>
              </div>
            </div>
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-card text-sm">
              {shopping.map((l) => (
                <li key={l.ingredient.id} className="flex justify-between gap-3 px-3 py-2">
                  <span>
                    {l.ingredient.name}
                    <span className="block text-xs text-muted-foreground">
                      {l.format
                        ? `${formatQty(l.count)} × ${l.format.label} (${formatAmount(l.quantity, l.ingredient.unit)} nécessaires)`
                        : formatAmount(l.quantity, l.ingredient.unit)}
                    </span>
                  </span>
                  <span className="font-medium">{formatPrice(l.cost)}</span>
                </li>
              ))}
            </ul>
          </div>

          {applicable.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">
                Mettre ces quantités comme stock des plats au menu (jamais moins que les plats déjà
                commandés).
              </p>
              <Button disabled={apply.isPending} onClick={() => apply.mutate()}>
                <CalendarCheck className="size-4" /> Appliquer au menu
              </Button>
            </div>
          )}
        </div>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <FlaskConical className="mt-0.5 size-3.5 shrink-0" />
        Les quantités suivent la journée de référence en proportion ; les ventes gardent le même
        taux de vente ; le chiffre d'affaires utilise le prix actuel du plat et les courses les
        derniers prix connus.
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-lg bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-lg font-semibold",
          tone === "good" && "text-emerald-700",
          tone === "bad" && "text-rose-700",
        )}
      >
        {value}
      </dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

import { queryOptions } from "@tanstack/react-query";
import { db, run } from "@core/lib/db";

/** Unités de base d'un ingrédient : tout est converti dans cette unité. */
export const BASE_UNITS = [
  { value: "g", label: "grammes (g)", short: "g" },
  { value: "ml", label: "millilitres (ml)", short: "ml" },
  { value: "piece", label: "pièces", short: "pièce(s)" },
] as const;

/** Nombre de cuissons récentes utilisées pour calculer les quantités par plat. */
export const HISTORY_SIZE = 3;

export type IngredientFormat = {
  id: string;
  ingredient_id: string;
  label: string;
  size: number;
  price: number;
  is_default: boolean;
};

export type Ingredient = {
  id: string;
  name: string;
  unit: string;
  /** Prix de référence par unité de base (F/g, F/ml ou F/pièce) : le dernier prix payé au marché. */
  price_per_unit: number;
  formats: IngredientFormat[];
};

/**
 * Unités de saisie proposées pour chaque unité de base, avec leur facteur de conversion.
 * La cuisinière saisit « 5 kg de riz » sans passer par un format d'achat.
 */
export const ENTRY_UNITS: Record<string, { value: string; label: string; factor: number }[]> = {
  g: [
    { value: "kg", label: "kg", factor: 1000 },
    { value: "g", label: "g", factor: 1 },
  ],
  ml: [
    { value: "L", label: "L", factor: 1000 },
    { value: "ml", label: "ml", factor: 1 },
  ],
  piece: [{ value: "piece", label: "pièce(s)", factor: 1 }],
};

/** Unité d'affichage des prix : au kilo, au litre ou à la pièce. */
export function priceUnit(unit: string) {
  if (unit === "g") return { label: "kg", factor: 1000 };
  if (unit === "ml") return { label: "L", factor: 1000 };
  return { label: "pièce", factor: 1 };
}

/** Prix d'une unité de base : prix de référence, sinon prix du format habituel. */
export function referencePrice(ingredient: Ingredient) {
  if (ingredient.price_per_unit > 0) return ingredient.price_per_unit;
  const format = defaultFormat(ingredient);
  return format ? format.price / format.size : 0;
}

export type ProductionItem = {
  id: string;
  log_id: string;
  ingredient_id: string;
  format_label: string;
  format_count: number;
  quantity: number;
  cost: number;
};

export type ProductionLog = {
  id: string;
  product_id: string;
  day_product_id: string | null;
  cooked_on: string;
  plates_obtained: number;
  excluded: boolean;
  notes: string | null;
  /** Journée clôturée et gardée comme base de simulation. */
  is_reference: boolean;
  plates_sold: number | null;
  revenue: number | null;
  sold_out: boolean | null;
  items: ProductionItem[];
};

/** Références d'un plat, la plus récente d'abord. */
export function dishReferences(productId: string, logs: ProductionLog[]) {
  return logs
    .filter((l) => l.product_id === productId && l.is_reference && l.items.length > 0)
    .sort((a, b) => b.cooked_on.localeCompare(a.cooked_on));
}

export const ingredientsQuery = () =>
  queryOptions({
    queryKey: ["ingredients"],
    queryFn: async () => {
      const [ingredients, formats] = await Promise.all([
        run<Omit<Ingredient, "formats">[]>(
          db.from("ingredients").select("id, name, unit, price_per_unit").order("name"),
        ),
        run<IngredientFormat[]>(db.from("ingredient_formats").select("*").order("size")),
      ]);
      return ingredients.map((i) => ({
        ...i,
        price_per_unit: Number(i.price_per_unit) || 0,
        formats: formats
          .filter((f) => f.ingredient_id === i.id)
          .map((f) => ({ ...f, size: Number(f.size) })),
      }));
    },
  });

export const productionLogsQuery = () =>
  queryOptions({
    queryKey: ["production_logs"],
    queryFn: async () => {
      const [logs, items] = await Promise.all([
        run<Omit<ProductionLog, "items">[]>(
          db.from("production_logs").select("*").order("cooked_on", { ascending: false }),
        ),
        run<ProductionItem[]>(db.from("production_log_items").select("*")),
      ]);
      return logs.map((log) => ({
        ...log,
        items: items
          .filter((i) => i.log_id === log.id)
          .map((i) => ({
            ...i,
            format_count: Number(i.format_count),
            quantity: Number(i.quantity),
          })),
      }));
    },
  });

export function unitShort(unit: string) {
  return BASE_UNITS.find((u) => u.value === unit)?.short ?? unit;
}

export function formatQty(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
}

/** Quantité lisible : 1 500 g → « 1,5 kg », 750 ml → « 750 ml », 12 pièces. */
export function formatAmount(quantity: number, unit: string) {
  if (unit === "g" && quantity >= 1000) return `${formatQty(quantity / 1000)} kg`;
  if (unit === "ml" && quantity >= 1000) return `${formatQty(quantity / 1000)} L`;
  return `${formatQty(quantity)} ${unitShort(unit)}`;
}

/** Format habituel de l'ingrédient (sinon le moins cher à l'unité de base). */
export function defaultFormat(ingredient: Ingredient): IngredientFormat | null {
  if (ingredient.formats.length === 0) return null;
  return (
    ingredient.formats.find((f) => f.is_default) ??
    [...ingredient.formats].sort((a, b) => a.price / a.size - b.price / b.size)[0]!
  );
}

/** Quantité par plat de chaque ingrédient, déduite des dernières cuissons non écartées. */
export type DishRatio = {
  logsUsed: ProductionLog[];
  /** ingredient_id → quantité par plat (unité de base) */
  perPlate: Map<string, number>;
};

export function dishRatio(productId: string, logs: ProductionLog[]): DishRatio | null {
  const recent = logs
    .filter((l) => l.product_id === productId && !l.excluded && l.items.length > 0)
    .sort((a, b) => b.cooked_on.localeCompare(a.cooked_on))
    .slice(0, HISTORY_SIZE);
  if (recent.length === 0) return null;
  const plates = recent.reduce((s, l) => s + l.plates_obtained, 0);
  const totals = new Map<string, number>();
  for (const item of recent.flatMap((l) => l.items)) {
    totals.set(item.ingredient_id, (totals.get(item.ingredient_id) ?? 0) + item.quantity);
  }
  return {
    logsUsed: recent,
    perPlate: new Map([...totals].map(([id, total]) => [id, total / plates])),
  };
}

export type ShoppingLine = {
  ingredient: Ingredient;
  quantity: number;
  format: IngredientFormat | null;
  /** Nombre de formats à acheter (arrondi au-dessus). */
  count: number;
  cost: number;
};

/** Liste de courses : additionne les besoins et les convertit dans le format habituel. */
export function shoppingList(
  needs: { ingredientId: string; quantity: number }[],
  ingredients: Map<string, Ingredient>,
): ShoppingLine[] {
  const totals = new Map<string, number>();
  for (const n of needs) totals.set(n.ingredientId, (totals.get(n.ingredientId) ?? 0) + n.quantity);
  return [...totals]
    .flatMap(([id, quantity]) => {
      const ingredient = ingredients.get(id);
      if (!ingredient || quantity <= 0) return [];
      const format = defaultFormat(ingredient);
      // Avec un format : des unités entières. Sans format : la quantité exacte au prix de référence.
      const count = format ? Math.ceil(quantity / format.size - 1e-9) : 0;
      const cost = format
        ? count * format.price
        : Math.round(quantity * referencePrice(ingredient));
      return [{ ingredient, quantity, format, count, cost }];
    })
    .sort((a, b) => b.cost - a.cost);
}

export function logCost(log: ProductionLog) {
  return log.items.reduce((s, i) => s + i.cost, 0);
}

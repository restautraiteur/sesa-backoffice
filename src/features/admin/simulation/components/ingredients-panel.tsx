import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Star, Trash2, X } from "lucide-react";
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
import { ConfirmDialog, EmptyState } from "@/features/admin/components/admin-ui";
import {
  BASE_UNITS,
  defaultFormat,
  priceUnit,
  referencePrice,
  formatAmount,
  unitShort,
  type Ingredient,
} from "@/features/admin/simulation/api";
import { db } from "@core/lib/db";
import { formatPrice } from "@core/lib/format";
import { cn } from "@core/lib/utils";

const SELECT = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

type FormatDraft = { label: string; size: string; price: string };
type Draft = {
  id?: string;
  name: string;
  unit: string;
  /** Prix de référence au kilo, au litre ou à la pièce (facultatif). */
  refPrice: string;
  formats: FormatDraft[];
  defaultIndex: number;
};

const EMPTY_FORMAT: FormatDraft = { label: "", size: "", price: "" };

export function IngredientsPanel({ ingredients }: { ingredients: Ingredient[] }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<Ingredient | null>(null);

  // Les formats d'achat sont facultatifs : la cuisinière peut tout saisir en kg, L ou pièces.
  const formatsValid =
    !!draft &&
    draft.formats.every(
      (f) => f.label.trim() && Number(f.size) > 0 && f.price.trim() !== "" && Number(f.price) >= 0,
    );
  const refPriceValid =
    !draft ||
    draft.refPrice.trim() === "" ||
    (Number(draft.refPrice) >= 0 && !isNaN(Number(draft.refPrice)));
  const valid = !!draft?.name.trim() && formatsValid && refPriceValid;

  const save = useMutation({
    mutationFn: async (value: Draft) => {
      const factor = priceUnit(value.unit).factor;
      const payload = {
        name: value.name.trim(),
        unit: value.unit,
        price_per_unit: value.refPrice.trim() === "" ? 0 : Number(value.refPrice) / factor,
      };
      let id = value.id;
      if (id) {
        const { error } = await db.from("ingredients").update(payload).eq("id", id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await db.from("ingredients").insert(payload).select("id").single();
        if (error) {
          throw new Error(
            error.message.includes("duplicate")
              ? "Un ingrédient porte déjà ce nom."
              : error.message,
          );
        }
        id = data.id as string;
      }
      // Les fiches de production gardent une copie du libellé : on peut remplacer les formats.
      const { error: deleteError } = await db
        .from("ingredient_formats")
        .delete()
        .eq("ingredient_id", id);
      if (deleteError) throw new Error(deleteError.message);
      if (value.formats.length === 0) return;
      const { error: insertError } = await db.from("ingredient_formats").insert(
        value.formats.map((f, index) => ({
          ingredient_id: id,
          label: f.label.trim(),
          size: Number(f.size),
          price: Math.round(Number(f.price)),
          is_default: index === value.defaultIndex,
        })),
      );
      if (insertError) throw new Error(insertError.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      setDraft(null);
      toast.success("Ingrédient enregistré");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("ingredients").delete().eq("id", id);
      if (error) {
        throw new Error(
          error.message.includes("foreign key")
            ? "Cet ingrédient est utilisé dans des fiches de production : impossible de le supprimer."
            : error.message,
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      toast.success("Ingrédient supprimé");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function edit(ingredient: Ingredient) {
    const fallback = defaultFormat(ingredient);
    setDraft({
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      refPrice:
        ingredient.price_per_unit > 0
          ? String(Math.round(ingredient.price_per_unit * priceUnit(ingredient.unit).factor))
          : "",
      formats: ingredient.formats.map((f) => ({
        label: f.label,
        size: String(f.size),
        price: String(f.price),
      })),
      defaultIndex: Math.max(
        0,
        ingredient.formats.findIndex((f) => f.id === fallback?.id),
      ),
    });
  }

  function patchFormat(index: number, patch: Partial<FormatDraft>) {
    if (!draft) return;
    setDraft({
      ...draft,
      formats: draft.formats.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    });
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-semibold">Ingrédients</h2>
          <p className="text-sm text-muted-foreground">
            Chaque ingrédient, son prix au kilo, au litre ou à la pièce (mis à jour avec le dernier
            prix payé au marché) et, si besoin, ses formats d'achat (boîte 500 g…).
          </p>
        </div>
        <Button
          onClick={() =>
            setDraft({ name: "", unit: "g", refPrice: "", formats: [], defaultIndex: 0 })
          }
        >
          <Plus className="size-4" /> Nouvel ingrédient
        </Button>
      </div>

      {ingredients.length === 0 ? (
        <EmptyState title="Aucun ingrédient">
          Ajoutez le riz, le poulet, la tomate concentrée, les barquettes… avec leurs formats et
          leurs prix.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {ingredients.map((ingredient) => {
            const habit = defaultFormat(ingredient);
            return (
              <li key={ingredient.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-40 flex-1">
                  <p className="font-medium">{ingredient.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Mesuré en {unitShort(ingredient.unit)}
                    {referencePrice(ingredient) > 0 &&
                      ` · ${formatPrice(
                        Math.round(referencePrice(ingredient) * priceUnit(ingredient.unit).factor),
                      )} / ${priceUnit(ingredient.unit).label}`}
                  </p>
                </div>
                <div className="flex flex-[2] flex-wrap gap-1.5">
                  {ingredient.formats.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      Sans format : saisie en {priceUnit(ingredient.unit).label}
                    </span>
                  )}
                  {ingredient.formats.map((f) => (
                    <span
                      key={f.id}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
                        f.id === habit?.id
                          ? "bg-[var(--brand-tint)] font-semibold text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {f.id === habit?.id && <Star className="size-3 fill-current" />}
                      {f.label} · {formatAmount(f.size, ingredient.unit)} · {formatPrice(f.price)}
                    </span>
                  ))}
                </div>
                <div className="ml-auto whitespace-nowrap">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Modifier ${ingredient.name}`}
                    onClick={() => edit(ingredient)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Supprimer ${ingredient.name}`}
                    onClick={() => setToDelete(ingredient)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Modifier l'ingrédient" : "Nouvel ingrédient"}</DialogTitle>
            <DialogDescription>
              L'étoile désigne le format habituel, utilisé pour la liste de courses.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
                <div className="space-y-2">
                  <Label htmlFor="ing-name">Nom</Label>
                  <Input
                    id="ing-name"
                    value={draft.name}
                    placeholder="Tomate concentrée"
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ing-unit">Mesuré en</Label>
                  <select
                    id="ing-unit"
                    className={SELECT}
                    value={draft.unit}
                    onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                  >
                    {BASE_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ing-price">
                  Prix {draft.unit === "piece" ? "à la pièce" : `au ${priceUnit(draft.unit).label}`}{" "}
                  (FCFA, facultatif)
                </Label>
                <Input
                  id="ing-price"
                  type="number"
                  min={0}
                  placeholder="Ex. 900"
                  value={draft.refPrice}
                  onChange={(e) => setDraft({ ...draft, refPrice: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Mis à jour automatiquement avec le prix payé lors de chaque cuisson.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Formats d'achat (facultatif)</p>
                <div className="hidden grid-cols-[2rem_1fr_7rem_7rem_2rem] gap-2 px-1 text-xs text-muted-foreground sm:grid">
                  <span />
                  <span>Libellé</span>
                  <span>Contenance ({unitShort(draft.unit)})</span>
                  <span>Prix (FCFA)</span>
                  <span />
                </div>
                {draft.formats.map((f, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[2rem_1fr_2rem] items-center gap-2 sm:grid-cols-[2rem_1fr_7rem_7rem_2rem]"
                  >
                    <button
                      type="button"
                      aria-label="Format habituel"
                      aria-pressed={draft.defaultIndex === index}
                      onClick={() => setDraft({ ...draft, defaultIndex: index })}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-md",
                        draft.defaultIndex === index
                          ? "text-amber-500"
                          : "text-muted-foreground/40",
                      )}
                    >
                      <Star
                        className={cn("size-4", draft.defaultIndex === index && "fill-current")}
                      />
                    </button>
                    <Input
                      aria-label="Libellé du format"
                      placeholder="Boîte 500 g"
                      value={f.label}
                      onChange={(e) => patchFormat(index, { label: e.target.value })}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="sm:order-last"
                      aria-label="Retirer ce format"

                      onClick={() =>
                        setDraft({
                          ...draft,
                          formats: draft.formats.filter((_, i) => i !== index),
                          defaultIndex:
                            draft.defaultIndex >= index && draft.defaultIndex > 0
                              ? draft.defaultIndex - 1
                              : draft.defaultIndex,
                        })
                      }
                    >
                      <X className="size-4" />
                    </Button>
                    <Input
                      className="col-start-2 sm:col-start-auto"
                      type="number"
                      min={0}
                      step="any"
                      aria-label="Contenance"
                      placeholder="500"
                      value={f.size}
                      onChange={(e) => patchFormat(index, { size: e.target.value })}
                    />
                    <Input
                      className="col-start-2 sm:col-start-auto"
                      type="number"
                      min={0}
                      aria-label="Prix"
                      placeholder="700"
                      value={f.price}
                      onChange={(e) => patchFormat(index, { price: e.target.value })}
                    />
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft({ ...draft, formats: [...draft.formats, { ...EMPTY_FORMAT }] })
                  }
                >
                  <Plus className="size-4" /> Ajouter un format
                </Button>
                <p className="text-xs text-muted-foreground">
                  Exemples : « Boîte 500 g » = 500 g · « Sac 5 kg » = 5000 g · « Au kilo » = 1000 g
                  · « Plateau 30 œufs » = 30 pièces.
                </p>
              </div>

              {!valid && draft.name.trim() && (
                <p className="text-xs text-destructive">
                  Chaque format doit avoir un libellé, une contenance supérieure à 0 et un prix.
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

      <ConfirmDialog
        open={toDelete !== null}
        title={`Supprimer « ${toDelete?.name ?? ""} » ?`}
        description="Ses formats seront supprimés. Impossible s'il apparaît dans une fiche de production."
        confirmLabel="Supprimer"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete.id);
          setToDelete(null);
        }}
      />
    </section>
  );
}

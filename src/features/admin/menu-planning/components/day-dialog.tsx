import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChefHat, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Switch } from "@ui/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/components/ui/dialog";
import type { MenuRow } from "@core/domain/menu/api";
import type { Day, Week } from "@/features/admin/menu-planning/api";
import type { Product } from "@/features/admin/products/api";
import { formatDay } from "@core/lib/format";
import { AddProductForm } from "@/features/admin/menu-planning/components/add-product-form";
import { MenuItemDialog } from "@/features/admin/menu-planning/components/menu-item-dialog";
import { productionLogsQuery, type ProductionLog } from "@/features/admin/simulation/api";
import {
  ProductionDialog,
  type ProductionPreset,
} from "@/features/admin/simulation/components/production-dialog";
import { ConfirmDialog, ProductThumb } from "@/features/admin/components/admin-ui";
import { cn } from "@core/lib/utils";

export function DayDialog({
  day,
  week,
  rows,
  products,
  onClose,
  onUpdateDay,
  onUpdateDayProduct,
  onRemove,
  onAdd,
  pending,
}: {
  day: Day | null;
  week: Week | null;
  rows: MenuRow[];
  products: Product[];
  onClose: () => void;
  onUpdateDay: (patch: Record<string, unknown>) => void;
  onUpdateDayProduct: (id: string, patch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  onAdd: (input: {
    day_id: string;
    product_id: string;
    price: number;
    stock_initial: number;
  }) => void;
  pending: boolean;
}) {
  const [toRemove, setToRemove] = useState<MenuRow | null>(null);
  const [editing, setEditing] = useState<MenuRow | null>(null);
  const [cooking, setCooking] = useState<{
    preset: ProductionPreset;
    log: ProductionLog | null;
  } | null>(null);
  const { data: logs = [] } = useQuery(productionLogsQuery());

  return (
    <Dialog open={day !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold first-letter:uppercase">
            {day ? formatDay(day.date) : ""}
          </DialogTitle>
          {week && week.status !== "published" && (
            <DialogDescription>
              Semaine en brouillon : publiez-la depuis le calendrier pour que les clients voient ce
              menu.
            </DialogDescription>
          )}
        </DialogHeader>

        {day && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg bg-muted/50 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Switch
                  checked={day.is_open}
                  onCheckedChange={(checked) => onUpdateDay({ is_open: checked })}
                />
                {day.is_open ? "Ouvert aux commandes" : "Fermé ce jour-là"}
              </label>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Commandes de</span>
                <Input
                  type="time"
                  className="h-9 w-28 bg-card"
                  aria-label="Heure d'ouverture des commandes"
                  defaultValue={day.open_time?.slice(0, 5)}
                  onBlur={(e) => onUpdateDay({ open_time: e.target.value })}
                />
                <span className="text-muted-foreground">à</span>
                <Input
                  type="time"
                  className="h-9 w-28 bg-card"
                  aria-label="Heure de fermeture des commandes"
                  defaultValue={day.close_time?.slice(0, 5)}
                  onBlur={(e) => onUpdateDay({ close_time: e.target.value })}
                />
              </div>
            </div>

            <section className="space-y-2">
              <h3 className="font-semibold">Au menu ce jour</h3>
              {rows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Aucun plat pour l'instant. Ajoutez-en un ci-dessous.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="hidden grid-cols-[minmax(0,1fr)_7rem_6rem_4.5rem_5.5rem] gap-3 bg-muted/50 px-3 py-2 text-xs font-semibold text-muted-foreground sm:grid">
                    <span>Plat</span>
                    <span>Prix (FCFA)</span>
                    <span>Portions</span>
                    <span>En vente</span>
                    <span />
                  </div>
                  <ul className="divide-y divide-border">
                    {rows.map((row) => (
                      <li
                        key={row.day_product_id}
                        className={cn(
                          "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_4.5rem_5.5rem]",
                          !row.is_active && "bg-muted/40",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setEditing(row)}
                          title="Voir et modifier le détail du plat"
                          className="col-span-2 flex min-w-0 items-center gap-3 rounded-md text-left transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-accent sm:col-span-1"
                        >
                          <ProductThumb
                            name={row.name}
                            photoUrl={row.photo_url}
                            className="size-10"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium underline-offset-2 hover:underline">
                              {row.name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {row.stock_reserved} commandée{row.stock_reserved > 1 ? "s" : ""} ·{" "}
                              {row.stock_left} restante{row.stock_left > 1 ? "s" : ""}
                            </span>
                          </span>
                        </button>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground sm:block">
                          <span className="sm:sr-only">Prix</span>
                          <SavedNumberInput
                            label={`Prix de ${row.name}`}
                            value={row.price}
                            min={1}
                            minMessage="Le prix doit être supérieur à 0 FCFA."
                            onSave={(price) => onUpdateDayProduct(row.day_product_id, { price })}
                          />
                        </label>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground sm:block">
                          <span className="sm:sr-only">Portions</span>
                          <SavedNumberInput
                            label={`Portions prévues de ${row.name}`}
                            value={row.stock_initial}
                            min={row.stock_reserved}
                            minMessage={`${row.stock_reserved} portion(s) déjà commandée(s) : impossible de prévoir moins.`}
                            onSave={(stock_initial) =>
                              onUpdateDayProduct(row.day_product_id, { stock_initial })
                            }
                          />
                        </label>
                        <Switch
                          checked={row.is_active}
                          aria-label={`${row.name} en vente`}
                          onCheckedChange={(checked) =>
                            onUpdateDayProduct(row.day_product_id, { is_active: checked })
                          }
                        />
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Enregistrer la cuisson (ingrédients utilisés, plats obtenus)"
                            aria-label={`Enregistrer la cuisson de ${row.name}`}
                            onClick={() =>
                              setCooking({
                                preset: { productId: row.product_id, cookedOn: row.day_date },
                                log:
                                  logs.find(
                                    (l) =>
                                      l.day_product_id === row.day_product_id ||
                                      (l.product_id === row.product_id &&
                                        l.cooked_on === row.day_date),
                                  ) ?? null,
                              })
                            }
                          >
                            <ChefHat />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`Retirer ${row.name} du menu`}
                            onClick={() => setToRemove(row)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {rows.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Cliquez sur un plat pour voir et modifier son détail, et sur la toque pour
                  enregistrer la cuisson. Les prix et portions sont enregistrés dès que vous quittez
                  le champ ou appuyez sur Entrée.
                </p>
              )}
            </section>

            <AddProductForm day={day} products={products} onAdd={onAdd} pending={pending} />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </DialogFooter>

        <MenuItemDialog row={editing} onClose={() => setEditing(null)} />
        <ProductionDialog
          open={cooking !== null}
          preset={cooking?.preset ?? null}
          log={cooking?.log ?? null}
          onClose={() => setCooking(null)}
        />

        <ConfirmDialog
          open={toRemove !== null}
          title={`Retirer « ${toRemove?.name ?? ""} » du menu ?`}
          description="Le plat reste dans le catalogue. Si des clients l'ont déjà commandé, masquez-le plutôt avec l'interrupteur « En vente »."
          confirmLabel="Retirer"
          onCancel={() => setToRemove(null)}
          onConfirm={() => {
            if (toRemove) onRemove(toRemove.day_product_id);
            setToRemove(null);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Champ numérique enregistré à la sortie du champ (ou sur Entrée).
 * Une valeur vide, non entière ou sous le minimum est refusée et le champ revient à la valeur enregistrée.
 */
function SavedNumberInput({
  label,
  value,
  min,
  minMessage,
  onSave,
}: {
  label: string;
  value: number;
  min: number;
  minMessage: string;
  onSave: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  function commit() {
    const trimmed = text.trim();
    const next = Number(trimmed);
    if (trimmed === "" || !Number.isInteger(next)) {
      toast.error("Saisissez un nombre entier.");
      setText(String(value));
      return;
    }
    if (next < min) {
      toast.error(minMessage);
      setText(String(value));
      return;
    }
    if (next !== value) onSave(next);
  }

  return (
    <Input
      type="number"
      inputMode="numeric"
      min={min}
      step={1}
      className="h-9"
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

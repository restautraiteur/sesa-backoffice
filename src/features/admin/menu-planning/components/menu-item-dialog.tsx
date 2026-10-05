import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import type { MenuRow } from "@core/domain/menu/api";
import { uploadPhoto } from "@/features/admin/products/upload-photo";
import { db } from "@core/lib/db";

/** Détail d'un plat du menu du jour : mêmes champs que « Ajouter un plat », pré-remplis et modifiables. */
export function MenuItemDialog({ row, onClose }: { row: MenuRow | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoLink, setPhotoLink] = useState("");
  const [price, setPrice] = useState(0);
  const [stock, setStock] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    setName(row.name);
    setDescription(row.description ?? "");
    setFile(null);
    setPreview(null);
    setPhotoLink(row.photo_url ?? "");
    setPrice(row.price);
    setStock(row.stock_initial);
  }, [row]);

  const reserved = row?.stock_reserved ?? 0;
  const priceValid = Number.isInteger(price) && price > 0;
  const stockValid = Number.isInteger(stock) && stock >= Math.max(1, reserved);
  const photo = preview ?? (photoLink.trim() || null);

  async function save() {
    if (!row || !name.trim() || !priceValid || !stockValid) return;
    setSaving(true);
    try {
      let photoUrl: string | null = photoLink.trim() || null;
      if (file) photoUrl = await uploadPhoto(file);
      const { error: productError } = await db
        .from("products")
        .update({ name: name.trim(), description: description.trim() || null, photo_url: photoUrl })
        .eq("id", row.product_id);
      if (productError) throw new Error(productError.message);
      const { error: dayError } = await db
        .from("day_products")
        .update({ price, stock_initial: stock })
        .eq("id", row.day_product_id);
      if (dayError) throw new Error(dayError.message);
      queryClient.invalidateQueries({ queryKey: ["menu"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Plat mis à jour");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Détail du plat</DialogTitle>
          <DialogDescription>
            Le nom, la description et la photo sont aussi modifiés dans le catalogue. Le prix et les
            portions ne concernent que ce jour.
          </DialogDescription>
        </DialogHeader>

        {row && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mi-name">Nom du plat</Label>
              <Input id="mi-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mi-desc">Description (facultatif)</Label>
              <Input
                id="mi-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Riz au poisson, légumes"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mi-photo">Photo du plat</Label>
              <Input
                id="mi-photo"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const picked = e.target.files?.[0] ?? null;
                  setFile(picked);
                  setPreview(picked ? URL.createObjectURL(picked) : null);
                }}
              />
              <p className="text-xs text-muted-foreground">ou collez un lien d'image ci-dessous</p>
              <Input
                id="mi-photo-url"
                type="url"
                value={photoLink}
                onChange={(e) => setPhotoLink(e.target.value)}
                placeholder="https://…/photo.jpg"
                disabled={!!file}
              />
              {photo && (
                <img
                  src={photo}
                  alt={`Photo de ${name || row.name}`}
                  className="h-40 w-full rounded-md object-cover"
                />
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mi-price">Prix du jour (FCFA)</Label>
                <Input
                  id="mi-price"
                  type="number"
                  min={1}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mi-stock">Portions prévues</Label>
                <Input
                  id="mi-stock"
                  type="number"
                  min={Math.max(1, reserved)}
                  value={stock}
                  onChange={(e) => setStock(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  {reserved} déjà commandée{reserved > 1 ? "s" : ""} · {row.stock_left} restante
                  {row.stock_left > 1 ? "s" : ""}
                </p>
              </div>
            </div>
            {!priceValid && (
              <p className="text-xs text-destructive">Le prix doit être supérieur à 0 FCFA.</p>
            )}
            {!stockValid && (
              <p className="text-xs text-destructive">
                Prévoyez au moins {Math.max(1, reserved)} portion(s)
                {reserved > 0 ? " : des clients ont déjà commandé ce plat." : "."}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!name.trim() || !priceValid || !stockValid || saving} onClick={save}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

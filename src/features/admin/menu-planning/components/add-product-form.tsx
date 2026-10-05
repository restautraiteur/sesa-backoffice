import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import type { Day } from "@/features/admin/menu-planning/api";
import { db } from "@core/lib/db";
import type { Product } from "@/features/admin/products/api";
import { formatPrice } from "@core/lib/format";
import { uploadPhoto } from "@/features/admin/products/upload-photo";
import { cn } from "@core/lib/utils";

export function AddProductForm({
  day,
  products,
  onAdd,
  pending,
}: {
  day: Day;
  products: Product[];
  onAdd: (input: {
    day_id: string;
    product_id: string;
    price: number;
    stock_initial: number;
  }) => void;
  pending: boolean;
}) {
  // Les jus ont leur propre catalogue (formats et stock dans « Produits ») : seuls les plats se planifient.
  const available = products.filter((p) => p.active && p.category === "plat");
  const [mode, setMode] = useState<"new" | "existing">(available.length > 0 ? "existing" : "new");
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState(0);
  const [stock, setStock] = useState(20);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoLink, setPhotoLink] = useState("");
  const [creating, setCreating] = useState(false);

  const selected = available.find((p) => p.id === productId) ?? null;
  const amountsValid = Number.isInteger(price) && price > 0 && Number.isInteger(stock) && stock > 0;

  function reset() {
    setProductId("");
    setName("");
    setDescription("");
    setFile(null);
    setPreview(null);
    setPhotoLink("");
    setPrice(0);
    setStock(20);
  }

  async function createAndAdd() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      let photoUrl: string | null = photoLink.trim() || null;
      if (file) photoUrl = await uploadPhoto(file);
      const { data, error } = await db
        .from("products")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          category: "plat",
          base_price: price,
          photo_url: photoUrl,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      onAdd({ day_id: day.id, product_id: data.id, price, stock_initial: stock });
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ajout impossible");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Ajouter un plat</h3>
        <div role="group" aria-label="Origine du plat" className="flex rounded-lg bg-muted p-1">
          {(
            [
              ["existing", "Du catalogue"],
              ["new", "Nouveau plat"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "h-8 rounded-md px-3 text-sm font-medium transition-colors",
                mode === value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      {mode === "new" ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="np-name">Nom du plat</Label>
            <Input
              id="np-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Thiéboudienne"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="np-desc">Description (facultatif)</Label>
            <Input
              id="np-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Riz au poisson, légumes"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="np-photo">Photo du plat</Label>
            <Input
              id="np-photo"
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
              id="np-photo-url"
              type="url"
              value={photoLink}
              onChange={(e) => setPhotoLink(e.target.value)}
              placeholder="https://…/photo.jpg"
              disabled={!!file}
            />
            {(preview ?? (photoLink.trim() || null)) && (
              <img
                src={preview ?? photoLink.trim()}
                alt="Aperçu du plat"
                className="h-32 w-full rounded-md object-cover"
              />
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Le catalogue est vide. Créez un nouveau plat.
            </p>
          ) : (
            <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
              {available.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => {
                    setProductId(product.id);
                    setPrice(product.base_price);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-2 text-left transition-colors",
                    productId === product.id
                      ? "border-primary bg-secondary"
                      : "border-border hover:bg-secondary/60",
                  )}
                >
                  {product.photo_url ? (
                    <img
                      src={product.photo_url}
                      alt={product.name}
                      className="size-14 rounded-md object-cover"
                    />
                  ) : (
                    <span className="flex size-14 items-center justify-center rounded-md bg-secondary text-sm font-bold">
                      {product.name.slice(0, 1)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{product.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatPrice(product.base_price)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {selected && !selected.photo_url && (
            <p className="text-xs text-muted-foreground">
              Ce produit du catalogue n'a pas de photo. Ajoutez-la dans le catalogue produits.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dp-price">Prix du jour (FCFA)</Label>
          <Input
            id="dp-price"
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dp-stock">Portions prévues</Label>
          <Input
            id="dp-stock"
            type="number"
            min={0}
            value={stock}
            onChange={(e) => setStock(Number(e.target.value))}
          />
        </div>
      </div>

      {!amountsValid && (
        <p className="text-xs text-destructive">
          Indiquez un prix et un nombre de portions supérieurs à 0.
        </p>
      )}

      {mode === "new" ? (
        <Button
          className="w-full"
          disabled={!name.trim() || !amountsValid || creating || pending}
          onClick={createAndAdd}
        >
          <Plus className="size-4" /> {creating ? "Ajout…" : "Ajouter au menu"}
        </Button>
      ) : (
        <Button
          className="w-full"
          disabled={!productId || !amountsValid || pending}
          onClick={() => {
            onAdd({ day_id: day.id, product_id: productId, price, stock_initial: stock });
            reset();
          }}
        >
          <Plus className="size-4" /> Ajouter au menu
        </Button>
      )}
    </section>
  );
}

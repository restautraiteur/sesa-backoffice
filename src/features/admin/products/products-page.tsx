import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ImagePlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Textarea } from "@ui/components/ui/textarea";
import { Switch } from "@ui/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/components/ui/dialog";
import { db } from "@core/lib/db";
import {
  productsQuery,
  productVariantsQuery,
  type Product,
  type ProductVariant,
} from "@/features/admin/products/api";
import { JUICE_SIZES, type JuiceSize } from "@core/domain/juices/api";
import { CATEGORY_LABELS, formatPrice } from "@core/lib/format";
import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  ProductThumb,
  TonePill,
} from "@/features/admin/components/admin-ui";
import { cn } from "@core/lib/utils";
import { uploadPhoto } from "@/features/admin/products/upload-photo";

type VariantDraft = { price: number; stock: number; is_active: boolean };

type Draft = {
  id?: string;
  name: string;
  description: string;
  photo_url: string;
  category: string;
  base_price: number;
  active: boolean;
  /** Formats du jus (utilisés seulement si `category === "jus"`). */
  variants: Record<JuiceSize, VariantDraft>;
};

const EMPTY_VARIANTS: Record<JuiceSize, VariantDraft> = {
  petit: { price: 0, stock: 0, is_active: true },
  grand: { price: 0, stock: 0, is_active: true },
};

const CATEGORY_FILTERS = [
  { value: "all", label: "Tout" },
  { value: "plat", label: "Plats" },
  { value: "jus", label: "Jus" },
];

const EMPTY: Draft = {
  name: "",
  description: "",
  photo_url: "",
  category: "plat",
  base_price: 0,
  active: true,
  variants: EMPTY_VARIANTS,
};

export function ProductsPage() {
  const queryClient = useQueryClient();
  const { data: products = [] } = useQuery(productsQuery());
  const { data: variants = [] } = useQuery(productVariantsQuery());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [toDelete, setToDelete] = useState<Product | null>(null);

  async function pickPhoto(file: File) {
    if (!draft) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(file);
      setDraft((current) => (current ? { ...current, photo_url: url } : current));
      toast.success("Photo importée");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import impossible");
    } finally {
      setUploading(false);
    }
  }

  const save = useMutation({
    mutationFn: async (value: Draft) => {
      const payload = {
        name: value.name.trim(),
        description: value.description.trim() || null,
        photo_url: value.photo_url.trim() || null,
        category: value.category,
        base_price: value.base_price,
        active: value.active,
      };
      const query = value.id
        ? db.from("products").update(payload).eq("id", value.id).select("id").single()
        : db.from("products").insert(payload).select("id").single();
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (value.category === "jus") {
        const rows = JUICE_SIZES.map(({ size }) => ({
          product_id: data.id,
          size,
          price: value.variants[size].price,
          stock: value.variants[size].stock,
          is_active: value.variants[size].is_active,
        }));
        const { error: variantError } = await db
          .from("product_variants")
          .upsert(rows, { onConflict: "product_id,size" });
        if (variantError) throw new Error(variantError.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product_variants"] });
      queryClient.invalidateQueries({ queryKey: ["juices"] });
      setDraft(null);
      toast.success("Produit enregistré");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("products").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produit supprimé");
    },
    onError: () =>
      toast.error("Impossible de supprimer ce produit (il est peut-être utilisé dans un menu)."),
  });

  const toggleActive = useMutation({
    mutationFn: async (input: { id: string; active: boolean }) => {
      const { error } = await db
        .from("products")
        .update({ active: input.active })
        .eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(input.active ? "Produit remis en vente" : "Produit masqué");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function variantsOf(productId: string) {
    return variants.filter((v) => v.product_id === productId);
  }

  function edit(product: Product) {
    const existing = variantsOf(product.id);
    const draftVariants = { ...EMPTY_VARIANTS };
    for (const v of existing) {
      draftVariants[v.size] = { price: v.price, stock: v.stock, is_active: v.is_active };
    }
    setDraft({
      variants: draftVariants,
      id: product.id,
      name: product.name,
      description: product.description ?? "",
      photo_url: product.photo_url ?? "",
      category: product.category,
      base_price: product.base_price,
      active: product.active,
    });
  }

  const filtered = products.filter((product) => {
    if (category !== "all" && product.category !== category) return false;
    const term = search.trim().toLowerCase();
    return !term || product.name.toLowerCase().includes(term);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalogue"
        description="Les plats et jus que vous pouvez mettre au menu."
        actions={
          <Button onClick={() => setDraft({ ...EMPTY })}>
            <Plus /> Ajouter un produit
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Rechercher un produit"
            placeholder="Rechercher un produit"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 bg-card pl-9"
          />
        </div>
        <div
          role="group"
          aria-label="Filtrer par catégorie"
          className="flex rounded-lg border border-border bg-card p-1"
        >
          {CATEGORY_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={category === option.value}
              onClick={() => setCategory(option.value)}
              className={cn(
                "h-8 rounded-md px-3 text-sm font-medium transition-colors",
                category === option.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {filtered.length === 0 ? (
          <EmptyState
            title={products.length === 0 ? "Votre catalogue est vide" : "Aucun produit trouvé"}
            action={
              products.length === 0 ? (
                <Button onClick={() => setDraft({ ...EMPTY })}>
                  <Plus /> Ajouter un produit
                </Button>
              ) : undefined
            }
          >
            {products.length === 0
              ? "Ajoutez vos plats et vos jus pour pouvoir composer les menus de la semaine."
              : "Essayez un autre nom ou une autre catégorie."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((product) => (
              <li
                key={product.id}
                className={cn(
                  "flex flex-wrap items-center gap-4 px-4 py-3 sm:flex-nowrap",
                  !product.active && "bg-muted/40",
                )}
              >
                <ProductThumb
                  name={product.name}
                  photoUrl={product.photo_url}
                  className={cn("size-14", !product.active && "opacity-50 grayscale")}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    <span className="truncate">{product.name}</span>
                    <TonePill>{CATEGORY_LABELS[product.category] ?? product.category}</TonePill>
                  </p>
                  {product.description && (
                    <p className="line-clamp-1 text-sm text-muted-foreground">
                      {product.description}
                    </p>
                  )}
                </div>
                <div className="text-sm tabular-nums sm:w-44 sm:text-right">
                  {product.category === "jus" ? (
                    <JuiceVariantsSummary variants={variantsOf(product.id)} />
                  ) : (
                    <span className="font-semibold">{formatPrice(product.base_price)}</span>
                  )}
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Switch
                    checked={product.active}
                    aria-label={`${product.name} en vente`}
                    onCheckedChange={(checked) =>
                      toggleActive.mutate({ id: product.id, active: checked })
                    }
                  />
                  <span className="w-16">{product.active ? "En vente" : "Masqué"}</span>
                </label>
                <div className="flex">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Modifier ${product.name}`}
                    onClick={() => edit(product)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Supprimer ${product.name}`}
                    onClick={() => setToDelete(product)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title={`Supprimer « ${toDelete?.name ?? ""} » ?`}
        description="Le produit disparaît du catalogue. S'il figure déjà dans un menu, masquez-le plutôt avec l'interrupteur « En vente »."
        confirmLabel="Supprimer"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete.id);
          setToDelete(null);
        }}
      />

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              {draft?.id ? "Modifier le produit" : "Nouveau produit"}
            </DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nom</Label>
                <Input
                  id="name"
                  maxLength={120}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  maxLength={500}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="photo-file">Photo</Label>
                <label
                  htmlFor="photo-file"
                  className={cn(
                    "relative flex h-36 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/40 text-sm text-muted-foreground transition-colors focus-within:outline-2 focus-within:outline-primary hover:border-primary hover:text-foreground",
                    uploading && "pointer-events-none opacity-60",
                  )}
                >
                  {draft.photo_url.trim() ? (
                    <>
                      <img
                        src={draft.photo_url.trim()}
                        alt="Aperçu du produit"
                        className="absolute inset-0 size-full object-cover"
                      />
                      <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
                        {uploading ? "Import en cours…" : "Changer la photo"}
                      </span>
                    </>
                  ) : (
                    <span className="flex flex-col items-center gap-1">
                      <ImagePlus className="size-6" />
                      {uploading ? "Import en cours…" : "Choisir une photo"}
                    </span>
                  )}
                  <input
                    id="photo-file"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => {
                      const picked = e.target.files?.[0];
                      if (picked) void pickPhoto(picked);
                    }}
                  />
                </label>
                <Input
                  id="photo"
                  aria-label="Ou lien vers une image"
                  maxLength={500}
                  placeholder="Ou collez le lien d'une image : https://…"
                  value={draft.photo_url}
                  onChange={(e) => setDraft({ ...draft, photo_url: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="category">Catégorie</Label>
                  <select
                    id="category"
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="plat">Plat</option>
                    <option value="jus">Jus</option>
                  </select>
                </div>
                {draft.category !== "jus" && (
                  <div className="space-y-2">
                    <Label htmlFor="price">Prix de base (FCFA)</Label>
                    <Input
                      id="price"
                      type="number"
                      min={0}
                      value={draft.base_price}
                      onChange={(e) => setDraft({ ...draft, base_price: Number(e.target.value) })}
                    />
                  </div>
                )}
              </div>
              {draft.category === "jus" && (
                <fieldset className="space-y-3 rounded-lg border border-border p-3">
                  <legend className="px-1 text-sm font-semibold">Formats, prix et stock</legend>
                  {JUICE_SIZES.map(({ size, label, volume }) => {
                    const variant = draft.variants[size];
                    const setVariant = (patch: Partial<VariantDraft>) =>
                      setDraft({
                        ...draft,
                        variants: { ...draft.variants, [size]: { ...variant, ...patch } },
                      });
                    return (
                      <div key={size} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr]">
                        <p className="text-sm font-medium sm:pb-2">
                          {label} · {volume}
                        </p>
                        <div className="space-y-1">
                          <Label htmlFor={`price-${size}`} className="text-xs">
                            Prix (FCFA)
                          </Label>
                          <Input
                            id={`price-${size}`}
                            type="number"
                            min={0}
                            value={variant.price}
                            onChange={(e) => setVariant({ price: Number(e.target.value) })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`stock-${size}`} className="text-xs">
                            Bouteilles en stock
                          </Label>
                          <Input
                            id={`stock-${size}`}
                            type="number"
                            min={0}
                            value={variant.stock}
                            onChange={(e) => setVariant({ stock: Number(e.target.value) })}
                          />
                        </div>
                        <label className="flex items-center gap-2 text-xs sm:col-span-3">
                          <Switch
                            checked={variant.is_active}
                            onCheckedChange={(checked) => setVariant({ is_active: checked })}
                          />
                          Format proposé à la vente
                        </label>
                      </div>
                    );
                  })}
                  <p className="text-xs text-muted-foreground">
                    Le stock diminue à chaque commande ; à 0, le format s'affiche « Épuisé ».
                  </p>
                </fieldset>
              )}
              <label className="flex items-center gap-3 text-sm">
                <Switch
                  checked={draft.active}
                  onCheckedChange={(checked) => setDraft({ ...draft, active: checked })}
                />
                <span>
                  En vente
                  <span className="block text-xs text-muted-foreground">
                    Décochez pour masquer le produit sans le supprimer.
                  </span>
                </span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Annuler
            </Button>
            <Button
              disabled={!draft?.name.trim() || save.isPending}
              onClick={() => draft && save.mutate(draft)}
            >
              {save.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function JuiceVariantsSummary({ variants }: { variants: ProductVariant[] }) {
  if (variants.length === 0) {
    return <span className="text-muted-foreground">Formats à définir</span>;
  }
  return (
    <ul className="space-y-0.5 text-xs sm:text-right">
      {JUICE_SIZES.map(({ size, volume }) => {
        const v = variants.find((x) => x.size === size);
        if (!v) return null;
        return (
          <li key={size} className={v.is_active ? undefined : "text-muted-foreground line-through"}>
            {volume} : {formatPrice(v.price)} ·{" "}
            <span className={v.stock === 0 ? "font-semibold text-destructive" : undefined}>
              {v.stock === 0 ? "épuisé" : `${v.stock} en stock`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

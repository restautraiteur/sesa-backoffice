import { queryOptions } from "@tanstack/react-query";
import { db, run } from "@core/lib/db";
import type { JuiceSize } from "@core/domain/juices/api";

export type Product = {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  category: string;
  base_price: number;
  active: boolean;
  /** Type de cuisine du plat (sénégalaise, marocaine…). */
  dish_category_id: string | null;
};

export type DishCategory = { id: string; name: string; sort_order: number };

export const dishCategoriesQuery = () =>
  queryOptions({
    queryKey: ["dish_categories"],
    queryFn: () =>
      run<DishCategory[]>(db.from("dish_categories").select("*").order("sort_order").order("name")),
  });

export const productsQuery = () =>
  queryOptions({
    queryKey: ["products"],
    queryFn: () => run<Product[]>(db.from("products").select("*").order("name")),
  });

/** Format d'un jus du catalogue (petit 250 ml / grand 1,5 L), avec son prix et son stock. */
export type ProductVariant = {
  id: string;
  product_id: string;
  size: JuiceSize;
  price: number;
  stock: number;
  is_active: boolean;
};

export const productVariantsQuery = () =>
  queryOptions({
    queryKey: ["product_variants"],
    queryFn: () => run<ProductVariant[]>(db.from("product_variants").select("*")),
  });

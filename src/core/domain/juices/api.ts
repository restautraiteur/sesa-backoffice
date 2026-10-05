import { queryOptions } from "@tanstack/react-query";
import { db, run } from "@core/lib/db";

export type JuiceSize = "petit" | "grand";
export type JuiceState = "disponible" | "epuise" | "desactive";

export const JUICE_SIZES: { size: JuiceSize; label: string; volume: string }[] = [
  { size: "petit", label: "Petit", volume: "250 ml" },
  { size: "grand", label: "Grand", volume: "1,5 L" },
];

export function juiceVolume(size: string) {
  return JUICE_SIZES.find((s) => s.size === size)?.volume ?? size;
}

/** Une ligne par format de jus (vue `juice_catalog_view`). */
export type JuiceRow = {
  variant_id: string;
  product_id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  size: JuiceSize;
  price: number;
  stock: number;
  state: JuiceState;
};

export const juiceCatalogQuery = () =>
  queryOptions({
    queryKey: ["juices", "catalog"],
    queryFn: () => run<JuiceRow[]>(db.from("juice_catalog_view").select("*").order("name")),
    refetchInterval: 60_000,
  });

import { queryOptions } from "@tanstack/react-query";
import { db, run, runAll } from "@core/lib/db";
import { todayISO } from "@core/lib/format";

export type ProductState = "disponible" | "epuise" | "ferme" | "desactive" | "jour_ferme";

export type MenuRow = {
  day_product_id: string;
  day_id: string;
  day_date: string;
  day_open: boolean;
  week_id: string;
  start_date: string;
  end_date: string;
  product_id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  category: string;
  price: number;
  stock_initial: number;
  stock_reserved: number;
  stock_left: number;
  open_time: string;
  close_time: string;
  is_active: boolean;
  state: ProductState;
  /** Type de cuisine du plat (sénégalaise, marocaine…), s'il est renseigné. */
  dish_category: string | null;
};

export const publicMenuQuery = () =>
  queryOptions({
    queryKey: ["menu", "public"],
    queryFn: () =>
      run<MenuRow[]>(
        db.from("menu_view").select("*").gte("day_date", todayISO()).order("day_date"),
      ),
    refetchInterval: 60_000,
  });

export const adminMenuQuery = () =>
  queryOptions({
    queryKey: ["menu", "admin"],
    queryFn: () =>
      runAll<MenuRow>(() =>
        db.from("menu_view").select("*").order("day_date").order("day_product_id"),
      ),
  });

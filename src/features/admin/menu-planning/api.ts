import { queryOptions } from "@tanstack/react-query";
import { db, run, runAll } from "@core/lib/db";

export type Week = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  published_at: string | null;
};

export type Day = {
  id: string;
  week_id: string;
  date: string;
  is_open: boolean;
  open_time: string;
  close_time: string;
};

export const weeksQuery = () =>
  queryOptions({
    queryKey: ["weeks"],
    queryFn: () =>
      run<Week[]>(db.from("weeks").select("*").order("start_date", { ascending: false })),
  });

export const daysQuery = () =>
  queryOptions({
    queryKey: ["days"],
    queryFn: () => runAll<Day>(() => db.from("days").select("*").order("date").order("id")),
  });

import { supabase } from "@core/integrations/supabase/client";

type AnyClient = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export const db = supabase as unknown as AnyClient;

export async function run<T>(builder: any): Promise<T> {
  const { data, error } = await builder;
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

/**
 * Comme `run`, mais lit toutes les lignes page par page : Supabase n'en renvoie que 1 000 par requête.
 * `make` doit recréer la requête (triée de façon stable, ex. `.order("id")`) à chaque appel.
 */
export async function runAll<T>(make: () => any, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await run<T[]>(make().range(from, from + pageSize - 1));
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

/** True when the failure is just an aborted/cancelled request (navigation, retry),
 * not a real server error the user should see. */
export function isCancelledError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cancelled|canceled|aborted|abort/i.test(message);
}

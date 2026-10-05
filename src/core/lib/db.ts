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

/** True when the failure is just an aborted/cancelled request (navigation, retry),
 * not a real server error the user should see. */
export function isCancelledError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cancelled|canceled|aborted|abort/i.test(message);
}

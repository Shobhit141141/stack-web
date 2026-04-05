import type { User as SupabaseAuthUser } from "@supabase/supabase-js";

declare global {
  namespace Express {
    interface Request {
      supabaseAuthUser?: SupabaseAuthUser;
    }
  }
}

export {};

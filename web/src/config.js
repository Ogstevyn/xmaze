// Supabase connection. The anon (publishable) key is meant to live in the
// browser — it is safe to ship because Row Level Security (see
// supabase/schema.sql) governs what it can actually do. Fill these in from your
// Supabase project: Settings -> API.
//
// For Vercel: set VERCEL_* build injection or just paste the public values here;
// the anon key is not a secret.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://qtlmbhrjhwlnegrwdonw.supabase.co";
// Modern publishable key (safe in the browser; guarded by RLS).
export const SUPABASE_ANON_KEY = "sb_publishable_LEWrTb8Bp8CkoBHVzAlCpQ_z_s4x8gM";

export const supabase =
  SUPABASE_ANON_KEY.includes("YOUR-ANON-KEY")
    ? null // not configured yet; app runs in local-only mode
    : createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const configured = supabase !== null;

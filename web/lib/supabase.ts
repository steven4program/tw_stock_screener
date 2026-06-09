// web/lib/supabase.ts — server-only service-role 客戶端
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient | null = null;

/** 取得服務端 Supabase 客戶端（service role，繞過 RLS；切勿用於前端）。 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
      auth: { persistSession: false },
    });
  }
  return client;
}

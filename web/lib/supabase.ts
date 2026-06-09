// web/lib/supabase.ts — server-only service-role 客戶端
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient | null = null;

/** 正規化成專案 origin（client 會自行接 /rest/v1）；容錯使用者誤填路徑或結尾斜線。 */
function normalizeUrl(raw: string): string {
  try {
    return new URL(raw).origin;
  } catch {
    return raw;
  }
}

/** 取得服務端 Supabase 客戶端（service role，繞過 RLS；切勿用於前端）。 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(normalizeUrl(env.supabaseUrl()), env.supabaseServiceKey(), {
      auth: { persistSession: false },
    });
  }
  return client;
}

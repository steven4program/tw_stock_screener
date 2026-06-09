// web/lib/env.ts — 僅在伺服器端 import；缺值即丟錯（fail fast）
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  supabaseUrl: () => required('SUPABASE_URL'),
  supabaseServiceKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),
  finmindToken: () => required('FINMIND_TOKEN'),
  cronSecret: () => required('CRON_SECRET'),
};

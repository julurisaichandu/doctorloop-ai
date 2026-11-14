// Deterministic test environment: isolated in-memory local DB and mock providers only.
process.env.DOCTORLOOP_LOCAL_DB_PATH = ":memory:";

for (const key of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_AGENT_ID",
  "VEXO_MODE",
  "VEXO_BAND_NUMBER",
  "VEXO_BAND_SECRET",
  "VEXO_BAND_WEARER",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "BILLING_PRICE_PER_1K_TOKENS_USD",
]) {
  delete process.env[key];
}

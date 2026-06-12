const DEFAULT_BUCKET = "proposal-docx";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function supabaseProjectUrl() {
  try {
    return new URL(requiredEnv("SUPABASE_URL")).origin;
  } catch {
    throw new Error("SUPABASE_URL must be a valid project URL.");
  }
}

function getConfig() {
  return {
    supabaseUrl: supabaseProjectUrl(),
    supabaseAnonKey: requiredEnv("SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    docxBucket: process.env.SUPABASE_DOCX_BUCKET || DEFAULT_BUCKET,
    appUrl: (process.env.APP_URL || "https://plataforma-saesp.vercel.app").replace(/\/+$/, ""),
    accessCookie: process.env.ACCESS_COOKIE_NAME || "proposal_access_token",
    refreshCookie: process.env.REFRESH_COOKIE_NAME || "proposal_refresh_token",
    isProduction: process.env.NODE_ENV === "production"
  };
}

module.exports = {
  getConfig
};

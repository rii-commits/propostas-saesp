const { createClient } = require("@supabase/supabase-js");
const { getConfig } = require("./config");

let anonClient;
let serviceClient;

function createBaseClient(key) {
  const config = getConfig();
  return createClient(config.supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}

function getAnonClient() {
  if (!anonClient) {
    anonClient = createBaseClient(getConfig().supabaseAnonKey);
  }
  return anonClient;
}

function createAnonClient() {
  return createBaseClient(getConfig().supabaseAnonKey);
}

function getServiceClient() {
  if (!serviceClient) {
    serviceClient = createBaseClient(getConfig().supabaseServiceRoleKey);
  }
  return serviceClient;
}

module.exports = {
  createAnonClient,
  getAnonClient,
  getServiceClient
};

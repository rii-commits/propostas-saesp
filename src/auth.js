const { getConfig } = require("./config");
const { appendSetCookie, parseCookies, serializeCookie } = require("./http");
const { createAnonClient, getServiceClient } = require("./supabase");

function publicUser(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    createdAt: profile.created_at || profile.createdAt || "",
    updatedAt: profile.updated_at || profile.updatedAt || ""
  };
}

function canWrite(user) {
  return user && ["Admin", "Editor"].includes(user.role);
}

function canAdmin(user) {
  return user && user.role === "Admin";
}

function setSessionCookies(res, session) {
  const config = getConfig();
  const secure = config.isProduction;
  const maxAge = session.expires_in || 3600;
  appendSetCookie(res, serializeCookie(config.accessCookie, session.access_token, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge
  }));
  appendSetCookie(res, serializeCookie(config.refreshCookie, session.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  }));
}

function clearSessionCookies(res) {
  const config = getConfig();
  const secure = config.isProduction;
  for (const name of [config.accessCookie, config.refreshCookie]) {
    appendSetCookie(res, serializeCookie(name, "", {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/",
      maxAge: 0
    }));
  }
}

async function getProfile(userId) {
  const { data, error } = await getServiceClient()
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function diagnoseConfiguredUser() {
  const targetEmail = "juuuh2003@gmail.com";
  const { data, error } = await getServiceClient().auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });
  if (error) throw error;

  const authUser = data.users.find(user => user.email?.toLowerCase() === targetEmail);
  let profile = authUser ? await getProfile(authUser.id) : null;
  if (authUser && !profile) {
    const { data: createdProfile, error: profileError } = await getServiceClient()
      .from("profiles")
      .upsert({
        id: authUser.id,
        name: "Juarau",
        email: targetEmail,
        role: "Admin",
        updated_at: new Date().toISOString()
      })
      .select("*")
      .single();
    if (profileError) throw profileError;
    profile = createdProfile;
  }
  return {
    project: new URL(getConfig().supabaseUrl).hostname,
    authUserExists: Boolean(authUser),
    emailConfirmed: Boolean(authUser?.email_confirmed_at),
    profileExists: Boolean(profile),
    profileRole: profile?.role || null
  };
}

async function login(email, password, res) {
  const { data, error } = await createAnonClient().auth.signInWithPassword({
    email: String(email || "").trim().toLowerCase(),
    password: String(password || "")
  });
  if (error || !data.session || !data.user) {
    throw new Error("Email ou senha invalidos.");
  }

  const profile = await getProfile(data.user.id);
  if (!profile) {
    throw new Error("Usuario autenticado sem perfil autorizado.");
  }

  setSessionCookies(res, data.session);
  return publicUser(profile);
}

async function requestPasswordReset(email, redirectTo, codeChallenge) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Informe o email cadastrado.");

  const config = getConfig();
  const endpoint = new URL("/auth/v1/recover", config.supabaseUrl);
  endpoint.searchParams.set("redirect_to", redirectTo);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: normalizedEmail,
      code_challenge: codeChallenge || undefined,
      code_challenge_method: codeChallenge ? "s256" : undefined
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload.msg || payload.message || payload.error_description || payload.error || "";
    if (response.status === 429 || /rate limit/i.test(message)) {
      throw new Error("Limite de emails atingido. Aguarde cerca de uma hora e tente novamente.");
    }
    throw new Error(message || "Nao foi possivel enviar o email de recuperacao.");
  }
}

async function resetPassword({ accessToken, refreshToken, code, codeVerifier, password }) {
  if (!code && !accessToken) {
    throw new Error("Link de recuperacao incompleto ou expirado.");
  }
  if (String(password || "").length < 8) {
    throw new Error("A nova senha deve ter pelo menos 8 caracteres.");
  }

  const client = createAnonClient();
  let user;
  if (accessToken) {
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data.user) {
      throw new Error("Link de recuperacao invalido ou expirado.");
    }
    user = data.user;
  } else {
    if (!codeVerifier) {
      throw new Error("Abra o link no mesmo navegador em que solicitou a recuperacao.");
    }
    const config = getConfig();
    const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=pkce`, {
      method: "POST",
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        auth_code: code,
        code_verifier: codeVerifier
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.user) {
      throw new Error("Link de recuperacao invalido ou expirado.");
    }
    user = data.user;
  }

  const { error } = await getServiceClient().auth.admin.updateUserById(user.id, {
    password
  });
  if (error) throw error;
}

async function currentUser(req, res) {
  const config = getConfig();
  const cookies = parseCookies(req);
  let accessToken = cookies[config.accessCookie];
  const refreshToken = cookies[config.refreshCookie];

  if (!accessToken && !refreshToken) return null;

  let authUser = null;
  if (accessToken) {
    const { data, error } = await createAnonClient().auth.getUser(accessToken);
    if (!error) authUser = data.user;
  }

  if (!authUser && refreshToken) {
    const { data, error } = await createAnonClient().auth.refreshSession({ refresh_token: refreshToken });
    if (!error && data.session && data.user) {
      setSessionCookies(res, data.session);
      accessToken = data.session.access_token;
      authUser = data.user;
    }
  }

  if (!authUser) return null;
  const profile = await getProfile(authUser.id);
  return publicUser(profile);
}

module.exports = {
  canAdmin,
  canWrite,
  clearSessionCookies,
  currentUser,
  diagnoseConfiguredUser,
  login,
  publicUser,
  requestPasswordReset,
  resetPassword
};

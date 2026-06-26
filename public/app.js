const state = {
  user: null,
  data: null,
  route: location.pathname,
  toastTimer: null
};

const routes = [
  { path: "/dashboard", label: "Dashboard", icon: "⌂" },
  { path: "/kanban", label: "Kanban", icon: "▦" },
  { path: "/empresas", label: "Empresas", icon: "□" },
  { path: "/eventos", label: "Eventos externos", icon: "◇" },
  { path: "/modelos", label: "Modelos", icon: "T" },
  { path: "/contrapartidas", label: "Contrapartidas", icon: "+" },
  { path: "/propostas", label: "Propostas", icon: "✎" },
  { path: "/controle", label: "Controle", icon: "#" },
  { path: "/historico", label: "Histórico", icon: "◷" },
  { path: "/usuarios", label: "Usuarios", icon: "@" }
];

const variables = ["empresa", "endereco", "evento", "data", "data_evento", "local", "valor", "responsavel", "responsavel_interno", "contrapartidas", "codigo", "conteudo"];
const proposalStatuses = ["Rascunho", "Enviada", "Aprovada", "Recusada", "Cancelada", "Final"];
const workflowStages = ["Em confeccao", "Proposta enviada", "Em formalizacao", "Em realizacao", "Finalizado", "Declinios"];
const workflowLabels = {
  "Em confeccao": "Em confecção",
  "Proposta enviada": "Proposta enviada",
  "Em formalizacao": "Em formalização",
  "Em realizacao": "Em realização",
  "Finalizado": "Finalizado",
  "Declinios": "Declínios"
};

function canWrite() {
  return state.user && ["Admin", "Editor"].includes(state.user.role);
}

function canAdmin() {
  return state.user && state.user.role === "Admin";
}

function app() {
  return document.getElementById("app");
}

function toast(message) {
  clearTimeout(state.toastTimer);
  let node = document.querySelector(".toast");
  if (!node) {
    node = document.createElement("div");
    node.className = "toast";
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.remove("hidden");
  state.toastTimer = setTimeout(() => node.classList.add("hidden"), 3500);
}

function fmtDate(value) {
  if (!value) return "Sem data";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function fmtDateTime(value) {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function fmtLongDate(value = new Date()) {
  const source = value instanceof Date ? value : new Date(value);
  const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${String(source.getDate()).padStart(2, "0")} de ${months[source.getMonth()]} de ${source.getFullYear()}`;
}

function localProposalCode(payload) {
  if (payload.controlCode) return payload.controlCode;
  const existing = byId("proposals", payload.id);
  if (existing?.controlCode) return existing.controlCode;
  const year = String(new Date().getFullYear());
  return `C pendente/${year}`;
}

function parseMoneyValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value || "").replace(/[^\d,.-]/g, "");
  if (!cleaned) return 0;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  if (value === "" || value === null || value === undefined) return "";
  const parsed = parseMoneyValue(value);
  return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function byId(collection, id) {
  return (state.data?.[collection] || []).find(item => item.id === id);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    let message = "Erro na requisicao.";
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {}
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) return response.json();
  return response.blob();
}

async function bootstrap() {
  const recovery = recoverySession();
  if (recovery) {
    renderPasswordReset(recovery);
    return;
  }
  try {
    state.data = await api("/api/bootstrap");
    state.user = state.data.currentUser;
    if (location.pathname === "/" || location.pathname === "/login") navigate("/dashboard", true);
    renderApp();
  } catch (error) {
    state.user = null;
    const showError = error.status !== 401 || (location.pathname !== "/" && location.pathname !== "/login");
    renderLogin(showError ? error.message : "");
  }
}

function recoverySession() {
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(location.search);
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  const code = queryParams.get("code");
  const codeVerifier = localStorage.getItem("proposal_recovery_code_verifier");
  const type = hashParams.get("type") || queryParams.get("type");
  const recoveryPath = location.pathname === "/reset-password";

  if (accessToken && refreshToken && (type === "recovery" || recoveryPath)) {
    return { accessToken, refreshToken };
  }
  if (code && (type === "recovery" || recoveryPath)) {
    return codeVerifier
      ? { code, codeVerifier }
      : { error: "Abra este link no mesmo navegador em que voce solicitou a recuperacao." };
  }
  if (recoveryPath) {
    return { error: "Este link de recuperacao esta incompleto ou expirou. Solicite um novo email." };
  }
  return null;
}

function renderPasswordReset(recovery) {
  const linkError = recovery.error || "";
  app().innerHTML = `
    <main class="login-shell">
      <section class="login-card">
        <img class="login-logo" src="/saesp-logo.png" alt="SAESP">
        <h1>Definir nova senha</h1>
        <p>Escolha uma senha com pelo menos 8 caracteres.</p>
        <form id="passwordResetForm" class="panel" style="box-shadow:none;border:0;padding:18px 0 0;margin:0">
          <label class="field">
            <span>Nova senha</span>
            <input name="password" type="password" minlength="8" autocomplete="new-password" required>
          </label>
          <label class="field" style="margin-top:12px">
            <span>Confirmar senha</span>
            <input name="passwordConfirmation" type="password" minlength="8" autocomplete="new-password" required>
          </label>
          <button class="btn primary" style="width:100%;margin-top:16px" type="submit" ${linkError ? "disabled" : ""}>Salvar senha</button>
          <p id="passwordResetError" class="muted" style="color:#b42318">${escapeHtml(linkError)}</p>
          ${linkError ? '<p><a href="/login">Voltar ao login</a></p>' : ""}
        </form>
      </section>
    </main>
  `;

  document.getElementById("passwordResetForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("passwordConfirmation") || "");
    const errorNode = document.getElementById("passwordResetError");
    if (password !== confirmation) {
      errorNode.textContent = "As senhas informadas nao coincidem.";
      return;
    }
    try {
      await api("/api/reset-password", {
        method: "POST",
        body: JSON.stringify({
          accessToken: recovery.accessToken,
          refreshToken: recovery.refreshToken,
          code: recovery.code,
          codeVerifier: recovery.codeVerifier,
          password
        })
      });
      localStorage.removeItem("proposal_recovery_code_verifier");
      history.replaceState({}, "", "/login");
      location.hash = "";
      renderLogin("Senha atualizada. Entre com a nova senha.");
    } catch (error) {
      errorNode.textContent = error.message;
    }
  });
}

function navigate(path, replace = false) {
  state.route = path;
  if (replace) history.replaceState({}, "", path);
  else history.pushState({}, "", path);
  renderApp();
}

window.addEventListener("popstate", () => {
  state.route = location.pathname;
  if (state.user) renderApp();
});

function renderLogin(error = "") {
  app().innerHTML = `
    <main class="login-shell">
      <section class="login-card">
        <img class="login-logo" src="/saesp-logo.png" alt="SAESP">
        <h1>Propostas Comerciais</h1>
        <p>Entre para gerenciar empresas, eventos, modelos e cartas editaveis.</p>
        <form id="loginForm" class="panel" style="box-shadow:none;border:0;padding:18px 0 0;margin:0">
          <label class="field">
            <span>Email</span>
            <input name="email" type="email" autocomplete="email" required>
          </label>
          <label class="field" style="margin-top:12px">
            <span>Senha</span>
            <input name="password" type="password" autocomplete="current-password" required>
          </label>
          <button class="btn primary" style="width:100%;margin-top:16px" type="submit">Entrar</button>
          <button id="forgotPasswordButton" class="btn" style="width:100%;margin-top:10px" type="button">Esqueci minha senha</button>
          ${error ? `<p class="muted" style="color:#b42318">${escapeHtml(error)}</p>` : ""}
        </form>
      </section>
    </main>
  `;

  document.getElementById("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const payload = await api("/api/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form))
      });
      state.user = payload.user;
      await bootstrap();
    } catch (err) {
      renderLogin(err.message);
    }
  });

  document.getElementById("forgotPasswordButton").addEventListener("click", renderForgotPassword);
}

function renderForgotPassword() {
  app().innerHTML = `
    <main class="login-shell">
      <section class="login-card">
        <img class="login-logo" src="/saesp-logo.png" alt="SAESP">
        <h1>Recuperar senha</h1>
        <p>Informe o email cadastrado para receber um novo link.</p>
        <form id="forgotPasswordForm" class="panel" style="box-shadow:none;border:0;padding:18px 0 0;margin:0">
          <label class="field">
            <span>Email</span>
            <input name="email" type="email" autocomplete="email" required>
          </label>
          <button class="btn primary" style="width:100%;margin-top:16px" type="submit">Enviar link</button>
          <button id="backToLoginButton" class="btn" style="width:100%;margin-top:10px" type="button">Voltar ao login</button>
          <p id="forgotPasswordMessage" class="muted"></p>
        </form>
      </section>
    </main>
  `;

  document.getElementById("backToLoginButton").addEventListener("click", () => renderLogin());
  document.getElementById("forgotPasswordForm").addEventListener("submit", async event => {
    event.preventDefault();
    const messageNode = document.getElementById("forgotPasswordMessage");
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    messageNode.style.color = "";
    messageNode.textContent = "Enviando...";
    try {
      const form = new FormData(event.currentTarget);
      const codeVerifier = createRecoveryCodeVerifier();
      const codeChallenge = await createRecoveryCodeChallenge(codeVerifier);
      const result = await api("/api/request-password-reset", {
        method: "POST",
        body: JSON.stringify({
          ...Object.fromEntries(form),
          codeChallenge
        })
      });
      localStorage.setItem("proposal_recovery_code_verifier", codeVerifier);
      messageNode.textContent = result.message;
    } catch (error) {
      messageNode.style.color = "#b42318";
      messageNode.textContent = error.message;
      submitButton.disabled = false;
    }
  });
}

function createRecoveryCodeVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function createRecoveryCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function renderApp() {
  const active = normalizeRoute(state.route);
  app().innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <img class="brand-logo" src="/saesp-logo.png" alt="SAESP">
          <div><strong>Propostas</strong><span>Gestão comercial</span></div>
        </div>
        <nav class="nav">
          ${routes.map(route => `
            <button class="${active === route.path ? "active" : ""}" data-route="${route.path}" ${route.path === "/usuarios" && !canAdmin() ? "disabled" : ""}>
              <span class="icon">${route.icon}</span><span>${route.label}</span>
            </button>
          `).join("")}
        </nav>
        <div class="user-box">
          <strong>${escapeHtml(state.user.name)}</strong>
          <span>${escapeHtml(state.user.role)} · ${escapeHtml(state.user.email)}</span>
          <button class="btn ghost" id="logoutBtn" style="width:100%;margin-top:12px">Sair</button>
        </div>
      </aside>
      <main class="main" id="main"></main>
    </div>
  `;

  document.querySelectorAll("[data-route]").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.route));
  });
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => {});
    state.user = null;
    history.replaceState({}, "", "/login");
    renderLogin();
  });

  const main = document.getElementById("main");
  if (active === "/dashboard") renderDashboardV2(main);
  else if (active === "/kanban") renderKanban(main);
  else if (active === "/empresas") renderCompanies(main);
  else if (active === "/eventos") renderEvents(main);
  else if (active === "/modelos") renderCrud(main, templateConfig());
  else if (active === "/contrapartidas") renderCrud(main, counterpartConfig());
  else if (active === "/propostas/nova") renderProposalForm(main);
  else if (active.startsWith("/propostas/") && active.endsWith("/editar")) renderProposalForm(main, active.split("/")[2]);
  else if (active === "/propostas") renderProposals(main);
  else if (active === "/controle") renderControl(main);
  else if (active === "/historico") renderHistory(main);
  else if (active === "/usuarios" && canAdmin()) renderCrud(main, userConfig());
  else renderDashboard(main);
}

function normalizeRoute(route) {
  if (!route || route === "/" || route === "/login") return "/dashboard";
  return route;
}

function pageHeader(title, subtitle, action = "") {
  return `
    <div class="topbar">
      <div class="page-title"><h1>${title}</h1><p>${subtitle}</p></div>
      <div class="actions">${action}</div>
    </div>
  `;
}

function renderDashboard(main) {
  const proposals = enrichedProposals();
  const filtered = filterProposals(proposals);
  const sentStages = workflowStages.filter(stage => stage !== "Em confeccao");
  const convertedStages = ["Em formalizacao", "Em realizacao", "Finalizado"];
  const sentItems = proposals.filter(item => sentStages.includes(item.workflowStage));
  const convertedItems = proposals.filter(item => convertedStages.includes(item.workflowStage));
  const acceptedItems = proposals.filter(item => ["Aprovada", "Final"].includes(item.status) || convertedStages.includes(item.workflowStage));
  const sentValue = proposals
    .filter(item => sentStages.includes(item.workflowStage))
    .reduce((total, item) => total + parseMoneyValue(item.value), 0);
  const convertedValue = proposals
    .filter(item => convertedStages.includes(item.workflowStage))
    .reduce((total, item) => total + parseMoneyValue(item.value), 0);
  const acceptedValue = acceptedItems.reduce((total, item) => total + parseMoneyValue(item.value), 0);
  const conversionRate = sentItems.length ? Math.round((acceptedItems.length / sentItems.length) * 100) : 0;
  const recentItems = [...proposals]
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .slice(0, 5);
  main.innerHTML = `
    ${pageHeader("Dashboard", "Busca e acompanhamento das propostas comerciais.")}
    <section class="metric-grid">
      <div class="metric"><span>Empresas</span><strong>${state.data.companies.length}</strong></div>
      <div class="metric"><span>Eventos</span><strong>${state.data.events.length}</strong></div>
      <div class="metric financial" title="Propostas que já saíram da etapa Em confecção"><span>Valor em propostas enviadas</span><strong>${money(sentValue)}</strong></div>
      <div class="metric financial converted" title="Propostas em formalização, realização ou finalizadas"><span>Valor em propostas convertidas</span><strong>${money(convertedValue)}</strong></div>
    </section>
    ${proposalFilters()}
    ${proposalReportTools(filtered)}
    ${proposalTable(filtered)}
  `;
  bindProposalFilters(main);
  bindDashboardReportActions(main);
  bindProposalActions(main);
}

function renderDashboardV2(main) {
  const proposals = enrichedProposals();
  const sentStages = workflowStages.filter(stage => stage !== "Em confeccao");
  const convertedStages = ["Em formalizacao", "Em realizacao", "Finalizado"];
  const sentItems = proposals.filter(item => sentStages.includes(item.workflowStage));
  const convertedItems = proposals.filter(item => convertedStages.includes(item.workflowStage));
  const acceptedItems = proposals.filter(item => ["Aprovada", "Final"].includes(item.status) || convertedStages.includes(item.workflowStage));
  const sentValue = sentItems.reduce((total, item) => total + parseMoneyValue(item.value), 0);
  const convertedValue = convertedItems.reduce((total, item) => total + parseMoneyValue(item.value), 0);
  const acceptedValue = acceptedItems.reduce((total, item) => total + parseMoneyValue(item.value), 0);
  const conversionRate = sentItems.length ? Math.round((acceptedItems.length / sentItems.length) * 100) : 0;
  const recentItems = [...proposals]
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .slice(0, 5);

  main.innerHTML = `
    ${pageHeader("Dashboard", "Indicadores comerciais e conversao das propostas.")}
    <section class="dashboard-kpis">
      <div class="dashboard-kpi sent">
        <span>Propostas enviadas</span>
        <strong>${sentItems.length}</strong>
        <small>${money(sentValue)} em negociacao</small>
      </div>
      <div class="dashboard-kpi accepted">
        <span>Propostas aceitas</span>
        <strong>${acceptedItems.length}</strong>
        <small>${money(acceptedValue)} convertidos</small>
      </div>
      <div class="dashboard-kpi rate">
        <span>Taxa de conversao</span>
        <strong>${conversionRate}%</strong>
        <small>${convertedItems.length} em formalizacao ou alem</small>
      </div>
      <div class="dashboard-kpi neutral">
        <span>Base ativa</span>
        <strong>${state.data.companies.length}</strong>
        <small>${state.data.events.length} eventos cadastrados</small>
      </div>
    </section>
    <section class="dashboard-grid">
      ${dashboardValueChart(sentValue, convertedValue)}
      ${dashboardStageChart(proposals)}
      ${dashboardStatusChart(proposals)}
      ${dashboardRecentList(recentItems)}
    </section>
    <section class="dashboard-actions panel">
      <div>
        <strong>${proposals.length} propostas no total</strong>
        <span>Use a tela Propostas para filtros detalhados, CSV e relatorios.</span>
      </div>
      <div class="report-actions">
        <button class="btn" type="button" id="exportProposalCsv">Excel / CSV</button>
        <button class="btn primary" type="button" id="printProposalReport">Imprimir / PDF</button>
      </div>
    </section>
  `;
  bindDashboardReportActions(main);
  bindProposalActions(main);
}

function dashboardValueChart(sentValue, convertedValue) {
  const maxValue = Math.max(sentValue, convertedValue, 1);
  const sentWidth = Math.max(4, Math.round((sentValue / maxValue) * 100));
  const convertedWidth = Math.max(4, Math.round((convertedValue / maxValue) * 100));
  return `
    <article class="dashboard-card wide">
      <div class="dashboard-card-header">
        <div>
          <span>Volume financeiro</span>
          <h2>Enviadas x convertidas</h2>
        </div>
      </div>
      <div class="horizontal-chart">
        <div class="chart-row">
          <div><strong>Enviadas</strong><span>${escapeHtml(money(sentValue))}</span></div>
          <i style="--bar-width:${sentWidth}%"></i>
        </div>
        <div class="chart-row converted">
          <div><strong>Convertidas</strong><span>${escapeHtml(money(convertedValue))}</span></div>
          <i style="--bar-width:${convertedWidth}%"></i>
        </div>
      </div>
    </article>
  `;
}

function dashboardStageChart(proposals) {
  const maxCount = Math.max(...workflowStages.map(stage => proposals.filter(item => item.workflowStage === stage).length), 1);
  return `
    <article class="dashboard-card">
      <div class="dashboard-card-header">
        <div>
          <span>Pipeline</span>
          <h2>Propostas por etapa</h2>
        </div>
      </div>
      <div class="stage-bars">
        ${workflowStages.map(stage => {
          const count = proposals.filter(item => item.workflowStage === stage).length;
          const width = Math.max(4, Math.round((count / maxCount) * 100));
          return `
            <div class="stage-bar">
              <div><strong>${escapeHtml(workflowLabels[stage] || stage)}</strong><span>${count}</span></div>
              <i style="--bar-width:${width}%"></i>
            </div>
          `;
        }).join("")}
      </div>
    </article>
  `;
}

function dashboardStatusChart(proposals) {
  const statusCounts = proposalStatuses.map(status => ({
    status,
    count: proposals.filter(item => item.status === status).length
  })).filter(item => item.count);
  const total = Math.max(proposals.length, 1);
  let cursor = 0;
  const colors = ["#14427d", "#78c2c8", "#2f855a", "#b42318", "#7a5af8", "#e3541e"];
  const gradient = statusCounts.length
    ? statusCounts.map((item, index) => {
      const start = cursor;
      cursor += (item.count / total) * 100;
      return `${colors[index % colors.length]} ${start}% ${cursor}%`;
    }).join(", ")
    : "#dfe3ea 0% 100%";

  return `
    <article class="dashboard-card">
      <div class="dashboard-card-header">
        <div>
          <span>Status</span>
          <h2>Distribuicao geral</h2>
        </div>
      </div>
      <div class="status-chart">
        <div class="donut" style="--donut: conic-gradient(${gradient})"><strong>${proposals.length}</strong><span>propostas</span></div>
        <div class="status-legend">
          ${statusCounts.map((item, index) => `
            <span><i style="--legend-color:${colors[index % colors.length]}"></i>${escapeHtml(item.status)} <strong>${item.count}</strong></span>
          `).join("") || `<span><i></i>Sem propostas <strong>0</strong></span>`}
        </div>
      </div>
    </article>
  `;
}

function dashboardRecentList(items) {
  return `
    <article class="dashboard-card wide">
      <div class="dashboard-card-header">
        <div>
          <span>Atualizacoes</span>
          <h2>Propostas recentes</h2>
        </div>
        <button class="btn" type="button" onclick="navigate('/propostas')">Ver propostas</button>
      </div>
      <div class="dashboard-recent-list">
        ${items.length ? items.map(item => `
          <button type="button" class="dashboard-recent-item" data-edit-proposal="${escapeAttr(item.id)}">
            <span><strong>${escapeHtml(item.controlCode || "Pendente")}</strong>${escapeHtml(item.title)}</span>
            <span>${escapeHtml(item.companyName || "Sem empresa")}</span>
            <span><i class="badge workflow">${escapeHtml(workflowLabels[item.workflowStage] || item.workflowStage)}</i></span>
            <span>${escapeHtml(money(item.value) || item.value || "Sem valor")}</span>
          </button>
        `).join("") : `<div class="empty">Nenhuma proposta cadastrada.</div>`}
      </div>
    </article>
  `;
}

function proposalFilters() {
  const companies = state.data.companies;
  const events = state.data.events;
  const users = state.data.users;
  return `
    <section class="panel">
      <div class="filter-grid">
        <label class="field"><span>Busca</span><input id="filterSearch" placeholder="Código, empresa, evento ou título"></label>
        <label class="field"><span>Empresa</span><select id="filterCompany"><option value="">Todas</option>${options(companies)}</select></label>
        <label class="field"><span>Evento</span><select id="filterEvent"><option value="">Todos</option>${options(events)}</select></label>
        <label class="field"><span>Status</span><select id="filterStatus"><option value="">Todos</option>${proposalStatuses.map(status => `<option>${status}</option>`).join("")}</select></label>
        <label class="field"><span>Responsável</span><select id="filterOwner"><option value="">Todos</option>${options(users)}</select></label>
      </div>
    </section>
  `;
}

function bindProposalFilters(main) {
  ["filterSearch", "filterCompany", "filterEvent", "filterStatus", "filterOwner"].forEach(id => {
    const input = main.querySelector(`#${id}`);
    if (input) input.addEventListener("input", () => {
      const wrap = main.querySelector("#proposalTableWrap");
      const filtered = filterProposals(enrichedProposals());
      wrap.outerHTML = proposalTable(filtered);
      updateProposalReportTools(main, filtered);
      bindProposalActions(main);
    });
  });
}

function proposalReportTools(items) {
  const total = items.reduce((sum, item) => sum + parseMoneyValue(item.value), 0);
  return `
    <section class="report-toolbar" id="proposalReportTools">
      <div class="report-summary">
        <strong id="proposalReportCount">${items.length} ${items.length === 1 ? "proposta" : "propostas"}</strong>
        <span id="proposalReportTotal">Total filtrado: ${money(total)}</span>
      </div>
      <div class="report-actions">
        <button class="btn" type="button" id="exportProposalCsv">Excel / CSV</button>
        <button class="btn primary" type="button" id="printProposalReport">Imprimir / PDF</button>
      </div>
    </section>
  `;
}

function updateProposalReportTools(scope, items) {
  const count = scope.querySelector("#proposalReportCount");
  const total = scope.querySelector("#proposalReportTotal");
  if (!count || !total) return;
  count.textContent = `${items.length} ${items.length === 1 ? "proposta" : "propostas"}`;
  total.textContent = `Total filtrado: ${money(items.reduce((sum, item) => sum + parseMoneyValue(item.value), 0))}`;
}

function bindDashboardReportActions(scope) {
  scope.querySelector("#exportProposalCsv")?.addEventListener("click", exportProposalCsv);
  scope.querySelector("#printProposalReport")?.addEventListener("click", printProposalReport);
}

function proposalReportRows() {
  return filterProposals(enrichedProposals());
}

function activeProposalFilters() {
  const values = [
    ["Busca", document.getElementById("filterSearch")?.value],
    ["Empresa", document.getElementById("filterCompany")?.selectedOptions?.[0]?.text],
    ["Evento", document.getElementById("filterEvent")?.selectedOptions?.[0]?.text],
    ["Status", document.getElementById("filterStatus")?.value],
    ["Responsável", document.getElementById("filterOwner")?.selectedOptions?.[0]?.text]
  ];
  return values.filter(([, value]) => value && !["Todas", "Todos"].includes(value));
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportProposalCsv() {
  const items = proposalReportRows();
  if (!items.length) {
    toast("Não há propostas para exportar com os filtros atuais.");
    return;
  }

  const headings = ["Código", "Título", "Empresa", "Evento", "Status", "Etapa", "Responsável", "Valor (R$)", "Atualização"];
  const rows = items.map(item => [
    item.controlCode || "Pendente",
    item.title,
    item.companyName,
    item.eventName,
    item.status,
    workflowLabels[item.workflowStage] || item.workflowStage,
    item.ownerName,
    parseMoneyValue(item.value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    fmtDate(item.updatedAt?.slice(0, 10))
  ]);
  const csv = `sep=;\r\n${[headings, ...rows].map(row => row.map(csvCell).join(";")).join("\r\n")}`;
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-propostas-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast("Relatório para Excel gerado.");
}

function printProposalReport() {
  const items = proposalReportRows();
  if (!items.length) {
    toast("Não há propostas para gerar o relatório.");
    return;
  }

  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    toast("Permita pop-ups para abrir o relatório em PDF.");
    return;
  }

  const total = items.reduce((sum, item) => sum + parseMoneyValue(item.value), 0);
  const filters = activeProposalFilters();
  const generatedAt = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const filterText = filters.length
    ? filters.map(([label, value]) => `<span><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</span>`).join("")
    : "<span>Todos os registros</span>";

  reportWindow.addEventListener("load", () => {
    reportWindow.focus();
    reportWindow.print();
  }, { once: true });
  reportWindow.document.write(`<!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Relatório de propostas</title>
        <style>
          @page { size: landscape; margin: 12mm; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #172033; font: 12px Arial, sans-serif; }
          header { display: flex; align-items: center; justify-content: space-between; gap: 24px; border-bottom: 3px solid #194a83; padding-bottom: 12px; }
          header img { width: 100px; height: auto; }
          h1 { margin: 0 0 4px; font-size: 22px; color: #194a83; }
          p { margin: 0; color: #667085; }
          .summary { display: flex; gap: 12px; margin: 16px 0; }
          .summary div { min-width: 180px; border: 1px solid #d9e0ea; border-radius: 6px; padding: 10px 12px; }
          .summary span { display: block; color: #667085; font-size: 10px; text-transform: uppercase; }
          .summary strong { display: block; margin-top: 5px; font-size: 17px; }
          .filters { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-bottom: 14px; color: #475467; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #d9e0ea; padding: 7px; text-align: left; vertical-align: top; }
          th { background: #78c2c8; color: #123f70; font-size: 10px; text-transform: uppercase; }
          tbody tr:nth-child(even) { background: #f8fafc; }
          .value { white-space: nowrap; }
          footer { margin-top: 12px; color: #667085; font-size: 10px; }
          @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <header>
          <div>
            <h1>Relatório de propostas comerciais</h1>
            <p>Gerado em ${escapeHtml(generatedAt)}</p>
          </div>
          <img src="${escapeAttr(`${location.origin}/saesp-logo.png`)}" alt="SAESP">
        </header>
        <section class="summary">
          <div><span>Propostas</span><strong>${items.length}</strong></div>
          <div><span>Valor total filtrado</span><strong>${escapeHtml(money(total))}</strong></div>
        </section>
        <section class="filters">${filterText}</section>
        <table>
          <thead>
            <tr><th>Código</th><th>Título</th><th>Empresa</th><th>Evento</th><th>Status</th><th>Etapa</th><th>Responsável</th><th>Valor</th><th>Atualização</th></tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td>${escapeHtml(item.controlCode || "Pendente")}</td>
                <td>${escapeHtml(item.title)}</td>
                <td>${escapeHtml(item.companyName)}</td>
                <td>${escapeHtml(item.eventName)}</td>
                <td>${escapeHtml(item.status)}</td>
                <td>${escapeHtml(workflowLabels[item.workflowStage] || item.workflowStage)}</td>
                <td>${escapeHtml(item.ownerName)}</td>
                <td class="value">${escapeHtml(money(item.value))}</td>
                <td>${escapeHtml(fmtDate(item.updatedAt?.slice(0, 10)))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <footer>Plataforma de Propostas SAESP</footer>
      </body>
    </html>`);
  reportWindow.document.close();
}

function filterProposals(items) {
  const search = document.getElementById("filterSearch")?.value.toLowerCase() || "";
  const company = document.getElementById("filterCompany")?.value || "";
  const event = document.getElementById("filterEvent")?.value || "";
  const status = document.getElementById("filterStatus")?.value || "";
  const owner = document.getElementById("filterOwner")?.value || "";

  return items.filter(item => {
    const haystack = `${item.controlCode} ${item.title} ${item.companyName} ${item.eventName}`.toLowerCase();
    return (!search || haystack.includes(search))
      && (!company || item.companyId === company)
      && (!event || item.eventId === event)
      && (!status || item.status === status)
      && (!owner || item.ownerId === owner);
  });
}

function noteAgeInDays(createdAt) {
  if (!createdAt) return null;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const createdStart = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  return Math.max(0, Math.floor((todayStart - createdStart) / 86400000));
}

function enrichedProposals() {
  return state.data.proposals.map(item => {
    const notes = (state.data.proposalNotes || [])
      .filter(note => note.proposalId === item.id)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const followUpDays = noteAgeInDays(notes[0]?.createdAt);
    const workflowStage = workflowStages.includes(item.workflowStage) ? item.workflowStage : "Em confeccao";
    return {
      ...item,
      workflowStage,
      controlCode: item.controlCode || "Pendente",
      controlYear: item.controlYear || String(item.issuedAt || item.createdAt || "").slice(0, 4),
      noteCount: notes.length,
      latestNoteAt: notes[0]?.createdAt || "",
      followUpDays,
      followUpOverdue: followUpDays !== null
        && followUpDays >= 5
        && !["Finalizado", "Declinios"].includes(workflowStage),
      companyName: byId("companies", item.companyId)?.name || "Sem empresa",
      eventName: byId("events", item.eventId)?.name || "Sem evento",
      ownerName: byId("users", item.ownerId)?.name || "Sem responsável"
    };
  });
}

function renderKanban(main) {
  const proposals = enrichedProposals();
  main.innerHTML = `
    ${pageHeader("Kanban", "Acompanhe o andamento operacional das propostas.", canWrite() ? `<button class="btn primary" id="newProposalBtn">Nova proposta</button>` : "")}
    <section class="kanban-board">
      ${workflowStages.map(stage => {
        const items = proposals.filter(item => item.workflowStage === stage);
        return `
          <div class="kanban-column" data-kanban-stage="${escapeAttr(stage)}">
            <div class="kanban-header">
              <strong>${workflowLabels[stage]}</strong>
              <span>${items.length}</span>
            </div>
            <div class="kanban-cards" data-kanban-dropzone="${escapeAttr(stage)}">
              ${items.length ? items.map(item => kanbanCard(item)).join("") : `<div class="kanban-empty">Sem propostas nesta etapa.</div>`}
            </div>
          </div>
        `;
      }).join("")}
    </section>
  `;
  main.querySelector("#newProposalBtn")?.addEventListener("click", () => navigate("/propostas/nova"));
  bindKanbanActions(main);
}

function kanbanCard(item) {
  return `
    <article class="kanban-card ${item.followUpOverdue ? "follow-up-overdue" : ""}" data-planner-proposal="${item.id}" draggable="${canWrite()}" role="button" tabindex="0" title="${canWrite() ? "Arraste para mover ou clique para abrir" : "Clique para abrir"}">
      <div class="kanban-card-title">
        <strong>${escapeHtml(item.title)}</strong>
      </div>
      <p class="kanban-company">${escapeHtml(item.companyName)}</p>
      <p class="muted">${escapeHtml(item.eventName)}</p>
      <div class="kanban-meta">
        <span>${escapeHtml(money(item.value) || item.value || "Sem valor")}</span>
      </div>
      <div class="kanban-follow-up-row">
        <div class="kanban-note-count">${item.noteCount ? `${item.noteCount} observações` : "Sem observações"}</div>
        ${item.followUpOverdue ? `<span class="follow-up-alert">Follow-up há ${item.followUpDays} dias</span>` : ""}
      </div>
    </article>
  `;
}

function bindKanbanActions(scope) {
  bindProposalActions(scope);
  let draggedProposalId = null;
  let dragCompleted = false;

  scope.querySelectorAll("[data-planner-proposal]").forEach(card => {
    const open = event => {
      if (event.target.closest("button") || dragCompleted) return;
      openKanbanPlanner(card.dataset.plannerProposal);
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", event => {
      if (canWrite() && event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        const proposal = byId("proposals", card.dataset.plannerProposal);
        const currentIndex = workflowStages.indexOf(proposal?.workflowStage);
        const nextIndex = currentIndex + (event.key === "ArrowRight" ? 1 : -1);
        const nextStage = workflowStages[nextIndex];
        if (nextStage) moveProposalToStage(card.dataset.plannerProposal, nextStage);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open(event);
      }
    });

    if (!canWrite()) return;
    card.addEventListener("dragstart", event => {
      draggedProposalId = card.dataset.plannerProposal;
      dragCompleted = false;
      card.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedProposalId);
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
      scope.querySelectorAll(".is-drop-target").forEach(item => item.classList.remove("is-drop-target"));
      draggedProposalId = null;
      window.setTimeout(() => {
        dragCompleted = false;
      }, 0);
    });
  });

  scope.querySelectorAll("[data-kanban-dropzone]").forEach(dropzone => {
    if (!canWrite()) return;
    dropzone.addEventListener("dragover", event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      dropzone.closest(".kanban-column")?.classList.add("is-drop-target");
    });
    dropzone.addEventListener("dragleave", event => {
      if (!dropzone.contains(event.relatedTarget)) {
        dropzone.closest(".kanban-column")?.classList.remove("is-drop-target");
      }
    });
    dropzone.addEventListener("drop", async event => {
      event.preventDefault();
      dragCompleted = true;
      const proposalId = draggedProposalId || event.dataTransfer.getData("text/plain");
      const nextStage = dropzone.dataset.kanbanDropzone;
      scope.querySelectorAll(".is-drop-target").forEach(item => item.classList.remove("is-drop-target"));
      await moveProposalToStage(proposalId, nextStage);
    });
  });
}

async function moveProposalToStage(proposalId, nextStage) {
  const proposal = byId("proposals", proposalId);
  if (!proposal || !workflowStages.includes(nextStage) || proposal.workflowStage === nextStage) return;
  const nextStatus = nextStage === "Declinios"
    ? "Recusada"
    : proposal.workflowStage === "Declinios" && proposal.status === "Recusada"
      ? "Enviada"
      : proposal.status;
  try {
    await api(`/api/proposals/${proposal.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...proposal, workflowStage: nextStage, status: nextStatus })
    });
    toast(`Proposta movida para ${workflowLabels[nextStage]}.`);
    await reload();
    navigate("/kanban", true);
  } catch (error) {
    toast(error.message);
  }
}

function openKanbanPlanner(proposalId) {
  const proposal = enrichedProposals().find(item => item.id === proposalId);
  if (!proposal) return;
  const notes = (state.data.proposalNotes || [])
    .filter(note => note.proposalId === proposalId)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  document.querySelector(".planner-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "planner-overlay";
  overlay.innerHTML = `
    <section class="planner-panel" role="dialog" aria-modal="true" aria-label="Acompanhamento da proposta">
      <div class="planner-header">
        <div>
          <span class="muted">${escapeHtml(proposal.controlCode || "Sem código")}</span>
          <h2>${escapeHtml(proposal.title)}</h2>
          <p>${escapeHtml(proposal.companyName)} · ${escapeHtml(proposal.eventName)}</p>
        </div>
        <button class="btn" type="button" data-close-planner>Fechar</button>
      </div>
      <div class="planner-summary">
        <div><span>Status</span><strong>${escapeHtml(proposal.status)}</strong></div>
        <div><span>Etapa</span><strong>${escapeHtml(workflowLabels[proposal.workflowStage] || proposal.workflowStage)}</strong></div>
        <div><span>Valor</span><strong>${escapeHtml(money(proposal.value) || proposal.value || "Sem valor")}</strong></div>
        <div><span>Responsável</span><strong>${escapeHtml(proposal.ownerName)}</strong></div>
      </div>
      <form class="planner-note-form">
        <label class="field full">
          <span>Observações e acompanhamentos</span>
          <textarea name="content" placeholder="Registre follow-ups, pendências, alinhamentos ou comentários desta proposta." ${!canWrite() ? "disabled" : ""}></textarea>
        </label>
        <div class="actions">
          <button class="btn primary" type="submit" ${!canWrite() ? "disabled" : ""}>Adicionar observação</button>
        </div>
      </form>
      <div class="planner-notes">
        <h3>Histórico de observações</h3>
        ${notes.length ? notes.map(note => `
          <article class="planner-note" data-note-id="${note.id}">
            <div class="planner-note-header"><strong>${escapeHtml(note.createdByName || "Sistema")}</strong><span>${escapeHtml(fmtDateTime(note.createdAt))}</span></div>
            <p>${escapeHtml(note.content)}</p>
            ${canWrite() ? `
              <div class="planner-note-actions">
                <button class="note-action" type="button" data-edit-note="${note.id}">Editar</button>
                <button class="note-action danger-text" type="button" data-delete-note="${note.id}">Excluir</button>
              </div>
            ` : ""}
          </article>
        `).join("") : `<div class="empty">Nenhuma observação registrada para esta proposta.</div>`}
      </div>
    </section>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });
  overlay.querySelector("[data-close-planner]").addEventListener("click", close);
  overlay.querySelector(".planner-note-form").addEventListener("submit", async event => {
    event.preventDefault();
    const content = new FormData(event.currentTarget).get("content");
    try {
      await api(`/api/proposals/${proposalId}/notes`, {
        method: "POST",
        body: JSON.stringify({ content })
      });
      toast("Observação registrada.");
      close();
      await reload();
      openKanbanPlanner(proposalId);
    } catch (error) {
      toast(error.message);
    }
  });
  overlay.querySelectorAll("[data-edit-note]").forEach(button => {
    button.addEventListener("click", () => {
      const note = notes.find(item => item.id === button.dataset.editNote);
      const article = button.closest(".planner-note");
      if (!note || !article) return;
      article.classList.add("is-editing");
      article.innerHTML = `
        <textarea class="note-edit-textarea">${escapeHtml(note.content)}</textarea>
        <div class="planner-note-actions">
          <button class="note-action" type="button" data-cancel-note>Cancelar</button>
          <button class="btn primary" type="button" data-save-note>Salvar alteração</button>
        </div>
      `;
      article.querySelector("[data-cancel-note]").addEventListener("click", () => {
        close();
        openKanbanPlanner(proposalId);
      });
      article.querySelector("[data-save-note]").addEventListener("click", async () => {
        const content = article.querySelector(".note-edit-textarea").value;
        try {
          await api(`/api/proposals/${proposalId}/notes/${note.id}`, {
            method: "PUT",
            body: JSON.stringify({ content })
          });
          toast("Observação atualizada.");
          close();
          await reload();
          openKanbanPlanner(proposalId);
        } catch (error) {
          toast(error.message);
        }
      });
      article.querySelector(".note-edit-textarea").focus();
    });
  });
  overlay.querySelectorAll("[data-delete-note]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!confirm("Excluir esta observação?")) return;
      try {
        await api(`/api/proposals/${proposalId}/notes/${button.dataset.deleteNote}`, {
          method: "DELETE"
        });
        toast("Observação excluída.");
        close();
        await reload();
        openKanbanPlanner(proposalId);
      } catch (error) {
        toast(error.message);
      }
    });
  });
  overlay.querySelector("textarea")?.focus();
}

window.openKanbanPlanner = openKanbanPlanner;
globalThis.openKanbanPlanner = openKanbanPlanner;

function renderProposals(main) {
  main.innerHTML = `
    ${pageHeader("Propostas", "Cartas em rascunho e versoes finais.", canWrite() ? `<button class="btn primary" id="newProposalBtn">Nova proposta</button>` : "")}
    ${proposalFilters()}
    ${proposalTable(filterProposals(enrichedProposals()))}
  `;
  main.querySelector("#newProposalBtn")?.addEventListener("click", () => navigate("/propostas/nova"));
  bindProposalFilters(main);
  bindProposalActions(main);
}

function renderControl(main) {
  const proposals = enrichedProposals().sort((a, b) => String(b.issuedAt || b.createdAt || "").localeCompare(String(a.issuedAt || a.createdAt || "")));
  const years = Array.from(new Set(proposals.map(item => item.controlYear).filter(Boolean))).sort((a, b) => b.localeCompare(a));
  main.innerHTML = `
    ${pageHeader("Controle interno", "Códigos automáticos, emissão, status, valores e rastreabilidade das propostas.")}
    <section class="panel">
      <div class="filter-grid control-filter-grid">
        <label class="field"><span>Buscar</span><input id="controlSearch" placeholder="Código, empresa, proposta ou responsável"></label>
        <label class="field"><span>Ano</span><select id="controlYear"><option value="">Todos</option>${years.map(year => `<option>${escapeHtml(year)}</option>`).join("")}</select></label>
        <label class="field"><span>Empresa</span><select id="controlCompany"><option value="">Todas</option>${options(state.data.companies)}</select></label>
        <label class="field"><span>Status</span><select id="controlStatus"><option value="">Todos</option>${proposalStatuses.map(status => `<option>${status}</option>`).join("")}</select></label>
        <div class="counterpart-count" id="controlCount"></div>
      </div>
    </section>
    <div class="table-wrap">${controlTable(proposals)}</div>
  `;
  bindControlFilters(main);
}

function controlTable(proposals) {
  if (!proposals.length) return `<div class="empty">Nenhuma proposta cadastrada.</div>`;
  return `
    <table>
      <thead><tr><th>Código</th><th>Data de emissão</th><th>Responsável</th><th>Empresa</th><th>Valor</th><th>Status</th><th>Histórico</th><th></th></tr></thead>
      <tbody>
        ${proposals.map(item => {
          const changes = (state.data.proposalChangeLogs || []).filter(log => log.proposalId === item.id).length;
          const versions = (state.data.proposalVersions || []).filter(version => version.proposalId === item.id).length;
          const searchText = `${item.controlCode} ${item.title} ${item.companyName} ${item.eventName} ${item.ownerName} ${item.status}`.toLowerCase();
          return `
            <tr data-control-row data-year="${escapeAttr(item.controlYear || "")}" data-company-id="${escapeAttr(item.companyId || "")}" data-status="${escapeAttr(item.status || "")}" data-search="${escapeAttr(searchText)}">
              <td><strong>${escapeHtml(item.controlCode || "Pendente")}</strong><br><span class="muted">${escapeHtml(item.title)}</span></td>
              <td>${escapeHtml(fmtDate(item.issuedAt?.slice(0, 10) || item.createdAt?.slice(0, 10)))}</td>
              <td>${escapeHtml(item.ownerName)}</td>
              <td>${escapeHtml(item.companyName)}</td>
              <td>${escapeHtml(money(item.value) || item.value || "Sem valor")}</td>
              <td><span class="badge ${item.status === "Final" || item.status === "Aprovada" ? "final" : "draft"}">${escapeHtml(item.status)}</span></td>
              <td>${changes} alterações<br><span class="muted">${versions} versões</span></td>
              <td><div class="row-actions"><button class="btn" data-edit-proposal="${item.id}">Editar</button><button class="btn" data-route-history="${item.id}">Histórico</button></div></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function bindControlFilters(scope) {
  bindProposalActions(scope);
  scope.querySelectorAll("[data-route-history]").forEach(button => {
    button.addEventListener("click", () => navigate("/historico"));
  });

  const searchInput = scope.querySelector("#controlSearch");
  const yearSelect = scope.querySelector("#controlYear");
  const companySelect = scope.querySelector("#controlCompany");
  const statusSelect = scope.querySelector("#controlStatus");
  const count = scope.querySelector("#controlCount");
  const rows = Array.from(scope.querySelectorAll("[data-control-row]"));

  const applyFilters = () => {
    const search = (searchInput?.value || "").toLowerCase().trim();
    const year = yearSelect?.value || "";
    const companyId = companySelect?.value || "";
    const status = statusSelect?.value || "";
    let visible = 0;
    rows.forEach(row => {
      const matches = (!search || (row.dataset.search || "").includes(search))
        && (!year || row.dataset.year === year)
        && (!companyId || row.dataset.companyId === companyId)
        && (!status || row.dataset.status === status);
      row.hidden = !matches;
      if (matches) visible += 1;
    });
    if (count) count.textContent = `${visible} propostas`;
  };

  [searchInput, yearSelect, companySelect, statusSelect].forEach(control => {
    control?.addEventListener("input", applyFilters);
    control?.addEventListener("change", applyFilters);
  });
  applyFilters();
}

function renderHistory(main) {
  const logs = historyEntries();
  main.innerHTML = `
    ${pageHeader("Histórico", "Registro de versões, alterações de valores, contrapartidas e exclusões de propostas.")}
    <section class="panel">
      <div class="filter-grid history-filter-grid">
        <label class="field"><span>Buscar</span><input id="historySearch" placeholder="Proposta, empresa, evento, usuário ou alteração"></label>
        <label class="field"><span>Evento</span><select id="historyEvent"><option value="">Todos</option>${options(state.data.events)}</select></label>
        <label class="field"><span>Usuário</span><select id="historyUser"><option value="">Todos</option>${options(state.data.users)}</select></label>
        <div class="counterpart-count" id="historyCount"></div>
      </div>
    </section>
    <div class="table-wrap">${historyTable(logs)}</div>
  `;
  bindHistoryFilters(main);
}

function historyEntries() {
  const changeLogs = (state.data.proposalChangeLogs || []).map(log => ({ ...log, source: "Alteração" }));
  const versionLogs = (state.data.proposalVersions || []).map(version => {
    const proposal = byId("proposals", version.proposalId) || {};
    const reason = displayHistoryText(version.reason || "Versão salva");
    return {
      id: version.id,
      source: "Versão",
      proposalId: version.proposalId,
      controlCode: version.controlCode || proposal.controlCode || "",
      proposalTitle: proposal.title || "Proposta removida",
      companyId: proposal.companyId || "",
      companyName: byId("companies", proposal.companyId)?.name || "Sem empresa",
      eventId: proposal.eventId || "",
      eventName: byId("events", proposal.eventId)?.name || "Sem evento",
      action: reason,
      changedById: version.changedById || "",
      changedByName: version.changedByName || "Sistema",
      changes: [
        { label: "Versão", from: "", to: reason },
        { label: "Status", from: "", to: version.status || "Sem status" }
      ],
      createdAt: version.createdAt
    };
  });
  return [...changeLogs, ...versionLogs].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function displayHistoryText(value) {
  return String(value || "")
    .replaceAll("Exportacao", "Exportação")
    .replaceAll("Criacao", "Criação");
}

function historyTable(logs) {
  if (!logs.length) return `<div class="empty">Nenhuma alteração registrada ainda.</div>`;
  return `
    <table>
      <thead><tr><th>Data</th><th>Proposta</th><th>Empresa</th><th>Evento</th><th>Alteração</th><th>Usuário</th></tr></thead>
      <tbody>
        ${logs.map(log => {
          const changesText = (log.changes || []).map(change => `${change.label}: ${change.from || "-"} → ${change.to || "-"}`).join(" | ");
          const searchText = `${log.controlCode || ""} ${log.proposalTitle} ${log.companyName} ${log.eventName} ${log.changedByName} ${log.action} ${changesText}`.toLowerCase();
          return `
            <tr data-history-row data-event-id="${escapeAttr(log.eventId || "")}" data-user-id="${escapeAttr(log.changedById || "")}" data-search="${escapeAttr(searchText)}">
              <td>${escapeHtml(fmtDateTime(log.createdAt))}</td>
              <td><strong>${escapeHtml(log.proposalTitle || "Proposta removida")}</strong><br><span class="muted">${escapeHtml(log.controlCode || "Sem código")} · ${escapeHtml(log.action || "Atualização")}</span></td>
              <td>${escapeHtml(log.companyName || "Sem empresa")}</td>
              <td>${escapeHtml(log.eventName || "Sem evento")}</td>
              <td><div class="history-changes">${(log.changes || []).map(change => `
                <div class="history-change">
                  <strong>${escapeHtml(change.label)}</strong>
                  <span><small>Antes:</small>${escapeHtml(change.from || "-")}</span>
                  <span><small>Depois:</small>${escapeHtml(change.to || "-")}</span>
                </div>
              `).join("")}</div></td>
              <td>${escapeHtml(log.changedByName || "Sistema")}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function bindHistoryFilters(scope) {
  const searchInput = scope.querySelector("#historySearch");
  const eventSelect = scope.querySelector("#historyEvent");
  const userSelect = scope.querySelector("#historyUser");
  const count = scope.querySelector("#historyCount");
  const rows = Array.from(scope.querySelectorAll("[data-history-row]"));

  const applyFilters = () => {
    const search = (searchInput?.value || "").toLowerCase().trim();
    const eventId = eventSelect?.value || "";
    const userId = userSelect?.value || "";
    let visible = 0;

    rows.forEach(row => {
      const matches = (!search || (row.dataset.search || "").includes(search))
        && (!eventId || row.dataset.eventId === eventId)
        && (!userId || row.dataset.userId === userId);
      row.hidden = !matches;
      if (matches) visible += 1;
    });

    if (count) count.textContent = `${visible} registros`;
  };

  [searchInput, eventSelect, userSelect].forEach(control => {
    control?.addEventListener("input", applyFilters);
    control?.addEventListener("change", applyFilters);
  });
  applyFilters();
}

function proposalTable(items) {
  if (!items.length) return `<div id="proposalTableWrap" class="table-wrap"><div class="empty">Nenhuma proposta encontrada.</div></div>`;
  return `
    <div id="proposalTableWrap" class="table-wrap">
      <table>
        <thead><tr><th>Código</th><th>Título</th><th>Empresa</th><th>Evento</th><th>Status</th><th>Etapa</th><th>Responsável</th><th>Atualização</th><th></th></tr></thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td><strong>${escapeHtml(item.controlCode || "Pendente")}</strong></td>
              <td><strong>${escapeHtml(item.title)}</strong><br><span class="muted">${escapeHtml(money(item.value) || item.value || "Sem valor")}</span></td>
              <td>${escapeHtml(item.companyName)}</td>
              <td>${escapeHtml(item.eventName)}</td>
              <td><span class="badge ${item.status === "Final" ? "final" : "draft"}">${item.status}</span></td>
              <td><span class="badge workflow">${escapeHtml(workflowLabels[item.workflowStage] || item.workflowStage)}</span></td>
              <td>${escapeHtml(item.ownerName)}</td>
              <td>${fmtDate(item.updatedAt?.slice(0, 10))}</td>
              <td>
                <div class="row-actions">
                  <button class="btn" data-edit-proposal="${item.id}">Editar</button>
                  <button class="btn primary" data-docx="${item.id}" ${!canWrite() ? "disabled" : ""}>Word</button>
                  <button class="btn danger" data-delete-proposal="${item.id}" ${!canWrite() ? "disabled" : ""}>Excluir</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function bindProposalActions(scope = document) {
  scope.querySelectorAll("[data-edit-proposal]").forEach(button => {
    button.addEventListener("click", () => navigate(`/propostas/${button.dataset.editProposal}/editar`));
  });
  scope.querySelectorAll("[data-docx]").forEach(button => {
    button.addEventListener("click", () => downloadDocx(button.dataset.docx));
  });
  scope.querySelectorAll("[data-delete-proposal]").forEach(button => {
    button.addEventListener("click", async () => {
      const proposal = byId("proposals", button.dataset.deleteProposal);
      if (!proposal || !confirm(`Excluir a proposta "${proposal.title}"?`)) return;
      try {
        await api(`/api/proposals/${proposal.id}`, { method: "DELETE" });
        toast("Proposta excluída.");
        await reload();
        if (normalizeRoute(location.pathname) !== "/propostas") navigate("/propostas", true);
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

async function downloadDocx(id) {
  try {
    const blob = await api(`/api/proposals/${id}/generate-docx`, { method: "POST" });
    const proposal = byId("proposals", id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug(proposal?.title || "proposta")}.docx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast("Documento Word gerado.");
    await reload();
  } catch (error) {
    toast(error.message);
  }
}

function renderCompanies(main) {
  const config = companyConfig();
  const rows = [...state.data.companies].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
  const companiesWithContact = rows.filter(company => company.contactPerson || company.contacts).length;
  const linkedProposals = new Set(state.data.proposals.map(proposal => proposal.companyId).filter(Boolean)).size;
  main.innerHTML = `
    ${pageHeader("Empresas", "Galeria de contas comerciais, contatos e historico de propostas.", canWrite() ? `<button class="btn primary" id="newCompanyBtn">Nova empresa</button>` : "")}
    <section class="company-overview">
      <div><span>Empresas cadastradas</span><strong>${rows.length}</strong></div>
      <div><span>Com contato</span><strong>${companiesWithContact}</strong></div>
      <div><span>Com propostas</span><strong>${linkedProposals}</strong></div>
    </section>
    <section class="company-toolbar panel">
      <label class="field"><span>Buscar empresa</span><input id="companyGallerySearch" placeholder="Nome, responsavel, contato, endereco ou observacao"></label>
      <div class="company-count" id="companyGalleryCount"></div>
    </section>
    <section class="panel hidden company-editor" id="formPanel">${config.form()}</section>
    <section class="company-gallery" id="companyGallery">
      ${companyGallery(rows)}
    </section>
  `;

  const panel = main.querySelector("#formPanel");
  main.querySelector("#newCompanyBtn")?.addEventListener("click", () => {
    openCompanyEditor(panel, config);
  });
  bindCompanyCards(main, rows, config, panel);
  bindCompanyGallerySearch(main);
}

function companyGallery(rows) {
  if (!rows.length) return `<div class="empty">Nenhuma empresa cadastrada.</div>`;
  return rows.map(company => companyCard(company)).join("");
}

function companyCard(company) {
  const proposals = state.data.proposals.filter(proposal => proposal.companyId === company.id);
  const events = state.data.events.filter(event => event.companyId === company.id);
  const initials = String(company.name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
  const searchText = [
    company.name,
    company.cnpj,
    company.address,
    company.contactPerson,
    company.contacts,
    company.notes
  ].join(" ").toLowerCase();

  return `
    <button class="company-card" type="button" data-edit-company="${escapeAttr(company.id)}" data-search="${escapeAttr(searchText)}">
      <span class="company-avatar">${escapeHtml(initials || "?")}</span>
      <span class="company-card-main">
        <strong>${escapeHtml(company.name || "Sem nome")}</strong>
        <small>${escapeHtml(company.contactPerson || "Responsavel nao informado")}</small>
      </span>
      <span class="company-card-details">
        <span>${escapeHtml(company.contacts || "Sem contato registrado")}</span>
        <span>${escapeHtml(company.address || "Endereco nao informado")}</span>
      </span>
      <span class="company-card-footer">
        <i>${proposals.length} ${proposals.length === 1 ? "proposta" : "propostas"}</i>
        <i>${events.length} ${events.length === 1 ? "evento" : "eventos"}</i>
      </span>
    </button>
  `;
}

function openCompanyEditor(panel, config, item = null) {
  panel.innerHTML = `
    <div class="company-editor-header">
      <div>
        <span>${item ? "Editar empresa" : "Nova empresa"}</span>
        <h2>${escapeHtml(item?.name || "Cadastro de empresa")}</h2>
      </div>
    </div>
    ${config.form(item)}
  `;
  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  bindCrudForm(config, panel, item);
}

function bindCompanyCards(scope, rows, config, panel) {
  scope.querySelectorAll("[data-edit-company]").forEach(card => {
    card.addEventListener("click", () => {
      const item = rows.find(row => row.id === card.dataset.editCompany);
      if (item) openCompanyEditor(panel, config, item);
    });
  });
}

function bindCompanyGallerySearch(scope) {
  const input = scope.querySelector("#companyGallerySearch");
  const count = scope.querySelector("#companyGalleryCount");
  const cards = Array.from(scope.querySelectorAll("[data-edit-company]"));
  const applySearch = () => {
    const query = (input?.value || "").toLowerCase().trim();
    let visible = 0;
    cards.forEach(card => {
      const matches = !query || card.dataset.search.includes(query);
      card.classList.toggle("hidden", !matches);
      if (matches) visible += 1;
    });
    if (count) count.textContent = `${visible} ${visible === 1 ? "empresa" : "empresas"}`;
  };
  input?.addEventListener("input", applySearch);
  applySearch();
}

function renderEvents(main) {
  const config = eventConfig();
  const rows = [...state.data.events].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
  const linkedProposals = state.data.proposals.filter(proposal => proposal.eventId).length;
  main.innerHTML = `
    ${pageHeader("Eventos externos", "Cursos e atividades externas usados na criacao das propostas.", canWrite() ? `<button class="btn primary" id="newEventBtn">Novo evento externo</button>` : "")}
    <section class="company-toolbar panel">
      <label class="field"><span>Buscar evento externo</span><input id="eventGallerySearch" placeholder="Nome do curso ou atividade"></label>
      <div class="company-count" id="eventGalleryCount"></div>
    </section>
    <section class="panel hidden company-editor event-editor" id="formPanel">${config.form()}</section>
    <section class="event-gallery" id="eventGallery">
      ${eventGallery(rows)}
    </section>
    <section class="company-overview event-overview event-overview-bottom">
      <div><span>Eventos externos cadastrados</span><strong>${rows.length}</strong></div>
      <div><span>Propostas vinculadas</span><strong>${linkedProposals}</strong></div>
    </section>
  `;

  const panel = main.querySelector("#formPanel");
  main.querySelector("#newEventBtn")?.addEventListener("click", () => {
    openEventEditor(panel, config);
  });
  bindEventCards(main, rows, config, panel);
  bindEventGallerySearch(main);
}

function eventGallery(rows) {
  if (!rows.length) return `<div class="empty">Nenhum evento cadastrado.</div>`;
  return rows.map(event => eventCard(event)).join("");
}

function eventCard(event) {
  const proposals = state.data.proposals.filter(proposal => proposal.eventId === event.id);
  const searchText = [
    event.name,
    event.description
  ].join(" ").toLowerCase();

  return `
    <article class="event-card" data-event-card data-search="${escapeAttr(searchText)}">
      <button class="event-card-main" type="button" data-edit-event="${escapeAttr(event.id)}">
        <strong>${escapeHtml(event.name || "Curso sem nome")}</strong>
      </button>
      <span class="event-proposal-count">
        <i>${proposals.length} ${proposals.length === 1 ? "proposta" : "propostas"}</i>
        <button class="event-model-link" type="button" data-event-model="${escapeAttr(event.id)}" data-event-name="${escapeAttr(event.name || "")}">T Modelo</button>
      </span>
    </article>
  `;
}

function openEventEditor(panel, config, item = null) {
  panel.innerHTML = `
    <div class="company-editor-header">
      <div>
        <span>${item ? "Editar evento" : "Novo evento"}</span>
        <h2>${escapeHtml(item?.name || "Cadastro de evento")}</h2>
      </div>
      ${item && canWrite() ? `<button class="btn danger" type="button" data-delete-event="${escapeAttr(item.id)}">Excluir</button>` : ""}
    </div>
    ${config.form(item)}
  `;
  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  bindCrudForm(config, panel, item);
  bindEventDeleteActions(panel);
}

function bindEventCards(scope, rows, config, panel) {
  scope.querySelectorAll("[data-edit-event]").forEach(card => {
    card.addEventListener("click", () => {
      const item = rows.find(row => row.id === card.dataset.editEvent);
      if (item) openEventEditor(panel, config, item);
    });
  });
  scope.querySelectorAll("[data-event-model]").forEach(button => {
    button.addEventListener("click", () => {
      sessionStorage.setItem("openCrud:templates", "true");
      sessionStorage.setItem("templateDraftName", button.dataset.eventName || "");
      navigate("/modelos");
    });
  });
  bindEventDeleteActions(scope);
}

function bindEventDeleteActions(scope) {
  scope.querySelectorAll("[data-delete-event]").forEach(button => {
    button.addEventListener("click", async event => {
      event.stopPropagation();
      const item = byId("events", button.dataset.deleteEvent);
      if (!item) return;
      const proposals = state.data.proposals.filter(proposal => proposal.eventId === item.id).length;
      const message = proposals
        ? `Excluir o evento externo "${item.name}"? ${proposals} proposta(s) vinculada(s) ficarao sem evento.`
        : `Excluir o evento externo "${item.name}"?`;
      if (!confirm(message)) return;
      try {
        await api(`/api/events/${item.id}`, { method: "DELETE" });
        toast("Evento externo excluido.");
        await reload();
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

function bindEventGallerySearch(scope) {
  const input = scope.querySelector("#eventGallerySearch");
  const count = scope.querySelector("#eventGalleryCount");
  const cards = Array.from(scope.querySelectorAll("[data-event-card]"));
  const applySearch = () => {
    const query = (input?.value || "").toLowerCase().trim();
    let visible = 0;
    cards.forEach(card => {
      const matches = !query || card.dataset.search.includes(query);
      card.classList.toggle("hidden", !matches);
      if (matches) visible += 1;
    });
    if (count) count.textContent = `${visible} ${visible === 1 ? "evento" : "eventos"}`;
  };
  input?.addEventListener("input", applySearch);
  applySearch();
}

function renderCrud(main, config) {
  const rows = state.data[config.collection];
  main.innerHTML = `
    ${pageHeader(config.title, config.subtitle, config.canCreate === false ? "" : `<button class="btn primary" id="newItemBtn" ${!canWrite() && config.collection !== "users" ? "disabled" : ""}>Novo</button>`)}
    ${config.importPanel ? config.importPanel() : ""}
    ${config.filterPanel ? config.filterPanel() : ""}
    <section class="panel hidden" id="formPanel">${config.form()}</section>
    <div class="table-wrap">${config.table(rows)}</div>
  `;

  const panel = main.querySelector("#formPanel");
  const openNewItemForm = () => {
    panel.innerHTML = config.form();
    panel.classList.remove("hidden");
    bindCrudForm(config, panel);
  };
  main.querySelector("#newItemBtn")?.addEventListener("click", openNewItemForm);
  main.querySelectorAll("[data-edit]").forEach(button => {
    button.addEventListener("click", () => {
      const item = rows.find(row => row.id === button.dataset.edit);
      panel.innerHTML = config.form(item);
      panel.classList.remove("hidden");
      bindCrudForm(config, panel, item);
    });
  });
  main.querySelectorAll("[data-delete]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!confirm("Remover este registro?")) return;
      try {
        await api(`/api/${config.collection}/${button.dataset.delete}`, { method: "DELETE" });
        toast("Registro removido.");
        await reload();
      } catch (error) {
        toast(error.message);
      }
    });
  });
  bindImportButtons(main);
  bindCounterpartImport(main);
  bindCounterpartFilters(main);

  if (sessionStorage.getItem(`openCrud:${config.collection}`) === "true") {
    sessionStorage.removeItem(`openCrud:${config.collection}`);
    openNewItemForm();
    if (config.collection === "templates") {
      const draftName = sessionStorage.getItem("templateDraftName") || "";
      sessionStorage.removeItem("templateDraftName");
      const nameInput = panel.querySelector("[name='name']");
      const typeInput = panel.querySelector("[name='type']");
      if (nameInput && draftName) nameInput.value = `Modelo - ${draftName}`;
      if (typeInput && !typeInput.value) typeInput.value = "Carta proposta";
    }
  }
}

function bindCrudForm(config, panel, item = null) {
  const form = panel.querySelector("form");
  bindVariableButtons(panel);
  bindImportButtons(panel);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const payload = config.serialize(new FormData(form), form);
    try {
      await api(`/api/${config.collection}${item ? `/${item.id}` : ""}`, {
        method: item ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      toast("Registro salvo.");
      await reload();
    } catch (error) {
      toast(error.message);
    }
  });
  panel.querySelector("[data-cancel]")?.addEventListener("click", () => panel.classList.add("hidden"));
}

function companyConfig() {
  return {
    title: "Empresas",
    subtitle: "Contas comerciais e contatos relacionados.",
    collection: "companies",
    form: item => `
      <form class="form-grid">
        ${input("name", "Nome", item?.name, true)}
        ${input("cnpj", "CNPJ", item?.cnpj)}
        ${input("address", "Endereço", item?.address)}
        ${input("contactPerson", "Responsável na empresa", item?.contactPerson)}
        ${textarea("contacts", "Contatos", item?.contacts)}
        ${textarea("notes", "Observações", item?.notes, "full")}
        ${formActions()}
      </form>
    `,
    serialize: form => Object.fromEntries(form),
    table: rows => simpleTable(rows, ["Nome", "CNPJ", "Endereço", "Responsável", "Contatos"], row => [row.name, row.cnpj, row.address, row.contactPerson, row.contacts])
  };
}

function eventConfig() {
  return {
    title: "Eventos externos",
    subtitle: "Cursos e atividades externas usados nas propostas.",
    collection: "events",
    form: item => `
      <form class="form-grid">
        ${input("name", "Nome", item?.name, true)}
        <input type="hidden" name="date" value="${escapeAttr(item?.date || "")}">
        <input type="hidden" name="location" value="${escapeAttr(item?.location || "")}">
        <input type="hidden" name="companyId" value="${escapeAttr(item?.companyId || "")}">
        <input type="hidden" name="description" value="${escapeAttr(item?.description || "")}">
        ${formActions()}
      </form>
    `,
    serialize: form => Object.fromEntries(form),
    table: rows => simpleTable(rows, ["Nome", "Data", "Local", "Empresa"], row => [row.name, fmtDate(row.date), row.location, byId("companies", row.companyId)?.name || ""])
  };
}

function templateConfig() {
  return {
    title: "Modelos",
    subtitle: "Cartas base com variáveis e texto editável.",
    collection: "templates",
    form: item => `
      <form class="form-grid">
        ${input("name", "Nome", item?.name, true)}
        ${input("type", "Tipo", item?.type || "Patrocinio")}
        <div class="field full">
          <label>Importar Word</label>
          <input type="file" id="docxImport" accept=".docx">
          <input type="hidden" name="importedFileName" value="${escapeAttr(item?.importedFileName || "")}">
          <input type="hidden" name="importedFilePath" value="${escapeAttr(item?.importedFilePath || "")}">
          <input type="hidden" name="storagePath" value="${escapeAttr(item?.storagePath || item?.importedFilePath || "")}">
        </div>
        <div class="field full">
          <label>Variáveis</label>
          <div class="variables">${variables.map(key => `<button type="button" data-insert-var="{{${key}}}">{{${key}}}</button>`).join("")}</div>
          <p class="muted">Ao baixar uma proposta criada com Word importado, o sistema preserva o arquivo original e substitui essas variáveis no próprio .docx.</p>
        </div>
        ${textarea("content", "Conteúdo", item?.content, "full editor", true)}
        ${formActions()}
      </form>
    `,
    serialize: (form, node) => ({
      ...Object.fromEntries(form),
      variables: variables.filter(key => node.querySelector("[name='content']").value.includes(`{{${key}}}`))
    }),
    table: rows => simpleTable(rows, ["Nome", "Tipo", "Variáveis", "Arquivo"], row => [row.name, row.type, (row.variables || []).join(", "), row.importedFileName || ""])
  };
}

function counterpartConfig() {
  const years = Array.from(new Set(state.data.counterparts.map(row => row.year).filter(Boolean))).sort((a, b) => b.localeCompare(a));
  return {
    title: "Contrapartidas",
    subtitle: "Itens reutilizáveis para composição de propostas, segmentados por ano, evento e ação.",
    collection: "counterparts",
    importPanel: () => `
      <section class="panel import-panel">
        <div>
          <h2>Importar documento de patrocínios</h2>
          <p class="muted">Suba um Word com cotas, ações, valores e contrapartidas para criar a biblioteca do ano e evento.</p>
        </div>
        <div class="inline-fields">
          <label class="field"><span>Ano</span><input id="counterpartImportYear" value="2026" ${!canWrite() ? "disabled" : ""}></label>
          <label class="field"><span>Evento</span><select id="counterpartImportEventId" ${!canWrite() ? "disabled" : ""}><option value="">Sem evento específico</option>${options(state.data.events)}</select></label>
          <label class="field file-field"><span>Arquivo Word</span><input type="file" id="counterpartImportFile" accept=".docx" ${!canWrite() ? "disabled" : ""}></label>
          <button class="btn primary" id="counterpartImportBtn" ${!canWrite() ? "disabled" : ""}>Importar</button>
        </div>
      </section>
    `,
    filterPanel: () => `
      <section class="panel counterpart-filter-panel" id="counterpartFilters">
        <div class="filter-grid counterpart-filter-grid">
          <label class="field"><span>Buscar</span><input id="counterpartListSearch" placeholder="Título, categoria, valor ou descrição"></label>
          <label class="field"><span>Ano</span><select id="counterpartListYear"><option value="">Todos os anos</option>${years.map(year => `<option value="${escapeAttr(year)}">${escapeHtml(year)}</option>`).join("")}</select></label>
          <label class="field"><span>Evento</span><select id="counterpartListEvent"><option value="">Todos os eventos</option><option value="__none">Sem evento</option>${options(state.data.events)}</select></label>
          <div class="counterpart-count" id="counterpartListCount"></div>
        </div>
      </section>
    `,
    form: item => `
      <form class="form-grid">
        ${input("title", "Título", item?.title, true)}
        ${input("category", "Categoria", item?.category)}
        ${input("year", "Ano", item?.year || "2026")}
        ${select("eventId", "Evento", state.data.events, item?.eventId, "Sem evento específico")}
        ${input("estimatedValue", "Valor estimado", item?.estimatedValue)}
        <label class="field"><span>Status</span><select name="active"><option value="true" ${item?.active !== false ? "selected" : ""}>Ativo</option><option value="false" ${item?.active === false ? "selected" : ""}>Inativo</option></select></label>
        ${input("sourceFileName", "Arquivo de origem", item?.sourceFileName)}
        ${textarea("description", "Descrição", item?.description, "full")}
        ${formActions()}
      </form>
    `,
    serialize: form => ({ ...Object.fromEntries(form), active: form.get("active") === "true" }),
    table: rows => counterpartTable(rows)
  };
}

function userConfig() {
  return {
    title: "Usuarios",
    subtitle: "Acessos internos e papeis de permissao.",
    collection: "users",
    form: item => `
      <form class="form-grid">
        ${input("name", "Nome", item?.name, true)}
        ${input("email", "Email", item?.email, true, "email")}
        ${input("password", "Senha", "", !item, "password")}
        <label class="field"><span>Papel</span><select name="role"><option ${item?.role === "Admin" ? "selected" : ""}>Admin</option><option ${item?.role === "Editor" ? "selected" : ""}>Editor</option><option ${item?.role === "Leitor" ? "selected" : ""}>Leitor</option></select></label>
        ${formActions()}
      </form>
    `,
    serialize: form => {
      const payload = Object.fromEntries(form);
      if (!payload.password) delete payload.password;
      return payload;
    },
    table: rows => simpleTable(rows, ["Nome", "Email", "Papel"], row => [row.name, row.email, row.role])
  };
}

function simpleTable(rows, headings, cells) {
  if (!rows.length) return `<div class="empty">Nenhum registro encontrado.</div>`;
  return `
    <table>
      <thead><tr>${headings.map(item => `<th>${item}</th>`).join("")}<th></th></tr></thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            ${cells(row).map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}
            <td>
              <div class="row-actions">
                <button class="btn" data-edit="${row.id}" ${!canWrite() ? "disabled" : ""}>Editar</button>
                <button class="btn danger" data-delete="${row.id}" ${!canWrite() ? "disabled" : ""}>Excluir</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function counterpartTable(rows) {
  if (!rows.length) return `<div class="empty">Nenhuma contrapartida encontrada.</div>`;
  return `
    <table>
      <thead><tr><th>Título</th><th>Categoria</th><th>Ano</th><th>Evento</th><th>Valor</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${rows.map(row => {
          const eventName = row.eventId ? (byId("events", row.eventId)?.name || "Evento removido") : "Sem evento";
          const searchText = `${row.title} ${row.category} ${row.description} ${row.estimatedValue} ${row.year} ${eventName}`.toLowerCase();
          return `
            <tr data-counterpart-row data-year="${escapeAttr(row.year || "")}" data-event-id="${escapeAttr(row.eventId || "")}" data-search="${escapeAttr(searchText)}">
              <td>${escapeHtml(row.title)}</td>
              <td>${escapeHtml(row.category)}</td>
              <td>${escapeHtml(row.year || "")}</td>
              <td>${escapeHtml(eventName)}</td>
              <td>${escapeHtml(money(row.estimatedValue) || row.estimatedValue)}</td>
              <td>${escapeHtml(row.active ? "Ativo" : "Inativo")}</td>
              <td>
                <div class="row-actions">
                  <button class="btn" data-edit="${row.id}" ${!canWrite() ? "disabled" : ""}>Editar</button>
                  <button class="btn danger" data-delete="${row.id}" ${!canWrite() ? "disabled" : ""}>Excluir</button>
                </div>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderProposalForm(main, id = null) {
  const item = id ? byId("proposals", id) : null;
  if (id && !item) {
    main.innerHTML = `
      ${pageHeader("Proposta nao encontrada", "O registro pode ter sido removido ou nao esta mais disponivel.", `<button class="btn" id="backBtn">Voltar</button>`)}
      <section class="panel"><div class="empty">Abra a lista de propostas para continuar.</div></section>
    `;
    main.querySelector("#backBtn").addEventListener("click", () => navigate("/propostas"));
    return;
  }
  const selectedCounterparts = new Set(item?.counterpartIds || []);
  const years = Array.from(new Set(state.data.counterparts.map(row => row.year).filter(Boolean))).sort((a, b) => b.localeCompare(a));
  const defaultYear = item
    ? ""
    : (years.includes(String(new Date().getFullYear())) ? String(new Date().getFullYear()) : (years[0] || ""));
  const history = state.data.proposalVersions.filter(version => version.proposalId === id);
  main.innerHTML = `
    ${pageHeader(item ? "Editar proposta" : "Nova proposta", "Monte a carta a partir de modelo, empresa, evento e contrapartidas.", `<button class="btn" id="backBtn">Voltar</button>`)}
    <form class="panel" id="proposalForm">
      <input type="hidden" name="id" value="${escapeAttr(item?.id || "")}">
      <div class="form-grid three">
        <label class="field"><span>Código de controle</span><input name="controlCode" value="${escapeAttr(item?.controlCode || "")}" placeholder="Ex.: C 070/2026" inputmode="numeric" autocomplete="off" required ${!canWrite() ? "disabled" : ""}></label>
        ${input("title", "Título", item?.title, true)}
        ${select("companyId", "Empresa", state.data.companies, item?.companyId, "Selecione", true)}
        ${select("eventId", "Evento", state.data.events, item?.eventId, "Selecione", true)}
        ${select("templateId", "Modelo", state.data.templates, item?.templateId, "Selecione", true)}
        ${select("ownerId", "Responsável interno", state.data.users, item?.ownerId || state.user.id, "Selecione", true)}
        ${input("recipientName", "Responsável na empresa", item?.recipientName || byId("companies", item?.companyId)?.contactPerson || "")}
        ${input("value", "Valor", item?.value)}
        <label class="field"><span>Status</span><select name="status">${proposalStatuses.map(status => `<option ${item?.status === status || (!item && status === "Rascunho") ? "selected" : ""}>${status}</option>`).join("")}</select></label>
        <label class="field"><span>Etapa operacional</span><select name="workflowStage" ${!canWrite() ? "disabled" : ""}>${workflowStages.map(stage => `<option value="${stage}" ${(item?.workflowStage || "Em confeccao") === stage ? "selected" : ""}>${workflowLabels[stage]}</option>`).join("")}</select></label>
      </div>
      <div class="field full" style="margin-top:16px">
        <label>Contrapartidas</label>
        <div class="counterpart-tools">
          <label class="field"><span>Buscar</span><input id="counterpartSearch" placeholder="Digite cota, ação, valor ou descrição"></label>
          <label class="field"><span>Ano</span><select id="counterpartYear"><option value="">Todos os anos</option>${years.map(year => `<option value="${escapeAttr(year)}" ${year === defaultYear ? "selected" : ""}>${escapeHtml(year)}</option>`).join("")}</select></label>
          <label class="field"><span>Evento</span><select id="counterpartEvent"><option value="">Todos os eventos</option><option value="__none">Sem evento</option>${state.data.events.map(event => `<option value="${event.id}" ${event.id === item?.eventId ? "selected" : ""}>${escapeHtml(event.name)}</option>`).join("")}</select></label>
          <div class="counterpart-count" id="counterpartCount"></div>
        </div>
        <div class="check-grid" id="counterpartGrid"></div>
      </div>
      <div class="field full" style="margin-top:16px">
        <label>Conteúdo editável</label>
        <textarea class="editor" name="content">${escapeHtml(item?.content || "")}</textarea>
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="btn warn" type="button" id="regenerateBtn" ${!canWrite() ? "disabled" : ""}>Preencher pelo modelo</button>
        <button class="btn primary" type="submit" ${!canWrite() ? "disabled" : ""}>Salvar</button>
        ${item ? `<button class="btn" type="button" id="downloadBtn" ${!canWrite() ? "disabled" : ""}>Baixar Word</button>` : ""}
      </div>
    </form>
    ${history.length ? `
      <section class="panel">
        <h2 style="margin:0 0 12px;font-size:18px">Historico de versoes</h2>
        <div class="table-wrap">
          <table><thead><tr><th>Motivo</th><th>Status</th><th>Data</th></tr></thead><tbody>
            ${history.map(version => `<tr><td>${escapeHtml(version.reason)}</td><td>${escapeHtml(version.status)}</td><td>${fmtDate(version.createdAt.slice(0, 10))}</td></tr>`).join("")}
          </tbody></table>
        </div>
      </section>
    ` : ""}
  `;

  main.querySelector("#backBtn").addEventListener("click", () => navigate("/propostas"));
  main.querySelector("#downloadBtn")?.addEventListener("click", () => downloadDocx(item.id));
  main.querySelector("[name='companyId']")?.addEventListener("change", event => {
    const company = byId("companies", event.currentTarget.value);
    const recipientInput = main.querySelector("[name='recipientName']");
    if (recipientInput && company?.contactPerson) recipientInput.value = company.contactPerson;
  });
  renderCounterpartPicker(main, selectedCounterparts);
  main.querySelector("#counterpartSearch")?.addEventListener("input", () => renderCounterpartPicker(main, selectedCounterparts));
  main.querySelector("#counterpartYear")?.addEventListener("input", () => renderCounterpartPicker(main, selectedCounterparts));
  main.querySelector("#counterpartEvent")?.addEventListener("input", () => renderCounterpartPicker(main, selectedCounterparts));
  main.querySelector("[name='eventId']")?.addEventListener("change", event => {
    const counterpartEvent = main.querySelector("#counterpartEvent");
    if (counterpartEvent && event.currentTarget.value) {
      counterpartEvent.value = event.currentTarget.value;
      renderCounterpartPicker(main, selectedCounterparts);
    }
  });
  main.querySelector("#regenerateBtn").addEventListener("click", async () => {
    const form = main.querySelector("#proposalForm");
    try {
      const payload = readProposalForm(form, true);
      const preview = localFillTemplate(payload);
      form.elements.content.value = preview;
      toast("Conteúdo preenchido pelo modelo.");
    } catch (error) {
      toast(error.message);
    }
  });

  main.querySelector("#proposalForm").addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const payload = readProposalForm(event.currentTarget, false);
      const saved = await api(`/api/proposals${id ? `/${id}` : ""}`, {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      toast("Proposta salva.");
      await reload();
      navigate(`/propostas/${saved.id}/editar`, true);
    } catch (error) {
      toast(error.message);
    }
  });
}

function renderCounterpartPicker(scope, selectedCounterparts) {
  const grid = scope.querySelector("#counterpartGrid");
  if (!grid) return;
  scope.querySelectorAll("[name='counterpartIds']").forEach(input => {
    if (input.checked) selectedCounterparts.add(input.value);
    else selectedCounterparts.delete(input.value);
  });

  const search = (scope.querySelector("#counterpartSearch")?.value || "").toLowerCase().trim();
  const year = scope.querySelector("#counterpartYear")?.value || "";
  const eventId = scope.querySelector("#counterpartEvent")?.value || "";
  const rows = state.data.counterparts.filter(row => {
    const isSelected = selectedCounterparts.has(row.id);
    const rowEventName = row.eventId ? (byId("events", row.eventId)?.name || "") : "Sem evento";
    const matchesEvent = !eventId || (eventId === "__none" ? !row.eventId : row.eventId === eventId) || isSelected;
    const haystack = `${row.title} ${row.category} ${row.description} ${row.estimatedValue} ${row.year} ${rowEventName}`.toLowerCase();
    return (row.active || isSelected)
      && (!year || row.year === year || isSelected)
      && matchesEvent
      && (!search || haystack.includes(search) || isSelected);
  });

  grid.innerHTML = rows.length ? rows.map(row => `
    <label class="check-card ${selectedCounterparts.has(row.id) ? "selected" : ""}">
      <input type="checkbox" name="counterpartIds" value="${row.id}" ${selectedCounterparts.has(row.id) ? "checked" : ""}>
      <span><strong>${escapeHtml(row.title)}</strong><span class="muted">${escapeHtml(row.year || "Sem ano")} · ${escapeHtml(row.eventId ? (byId("events", row.eventId)?.name || "Evento removido") : "Sem evento")} · ${escapeHtml(row.category || "Sem categoria")} · ${escapeHtml(money(row.estimatedValue) || row.estimatedValue || "Sem valor")}</span></span>
    </label>
  `).join("") : `<div class="empty">Nenhuma contrapartida encontrada para esse filtro.</div>`;

  grid.querySelectorAll("[name='counterpartIds']").forEach(input => {
    input.addEventListener("change", () => {
      if (input.checked) selectedCounterparts.add(input.value);
      else selectedCounterparts.delete(input.value);
      input.closest(".check-card")?.classList.toggle("selected", input.checked);
      updateCounterpartCount(scope, rows.length, selectedCounterparts.size);
    });
  });
  updateCounterpartCount(scope, rows.length, selectedCounterparts.size);
}

function updateCounterpartCount(scope, visible, selected) {
  const node = scope.querySelector("#counterpartCount");
  if (node) node.textContent = `${visible} visíveis · ${selected} selecionadas`;
}

function readProposalForm(form, regenerateContent) {
  const data = new FormData(form);
  return {
    id: data.get("id"),
    controlCode: data.get("controlCode"),
    title: data.get("title"),
    companyId: data.get("companyId"),
    eventId: data.get("eventId"),
    templateId: data.get("templateId"),
    ownerId: data.get("ownerId"),
    recipientName: data.get("recipientName"),
    value: data.get("value"),
    status: data.get("status"),
    workflowStage: data.get("workflowStage") || "Em confeccao",
    content: data.get("content"),
    counterpartIds: data.getAll("counterpartIds"),
    regenerateContent
  };
}

function localFillTemplate(payload) {
  const template = byId("templates", payload.templateId);
  if (!template) throw new Error("Selecione um modelo.");
  const company = byId("companies", payload.companyId);
  const event = byId("events", payload.eventId);
  const owner = byId("users", payload.ownerId);
  const counterparts = state.data.counterparts.filter(item => payload.counterpartIds.includes(item.id));
  const recipientName = payload.recipientName || company?.contactPerson || owner?.name || "";
  const replacements = {
    empresa: company?.name || "",
    endereco: company?.address || "",
    evento: event?.name || "",
    data: fmtLongDate(),
    data_evento: fmtDate(event?.date),
    local: event?.location || "",
    valor: payload.value || "",
    responsavel: recipientName,
    responsavel_interno: owner?.name || "",
    contrapartidas: counterparts.length ? counterparts.map(item => `- ${item.title}: ${item.description}`).join("\n") : "- A definir",
    codigo: localProposalCode(payload)
  };
  let content = template.content || "";
  Object.entries(replacements).forEach(([key, value]) => {
    content = content.replaceAll(`{{${key}}}`, value);
  });
  return content;
}

function bindVariableButtons(scope) {
  scope.querySelectorAll("[data-insert-var]").forEach(button => {
    button.addEventListener("click", () => {
      const textarea = scope.querySelector("textarea[name='content']");
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = `${textarea.value.slice(0, start)}${button.dataset.insertVar}${textarea.value.slice(end)}`;
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + button.dataset.insertVar.length;
    });
  });
}

function bindImportButtons(scope) {
  const input = scope.querySelector("#docxImport");
  if (!input) return;
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const base64 = await fileToBase64(file);
      const imported = await api("/api/templates/import-docx", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, base64 })
      });
      scope.querySelector("[name='content']").value = imported.content;
      scope.querySelector("[name='importedFileName']").value = imported.fileName;
      scope.querySelector("[name='importedFilePath']").value = imported.storedPath;
      scope.querySelector("[name='storagePath']").value = imported.storagePath || imported.storedPath;
      toast("Modelo Word importado.");
    } catch (error) {
      toast(error.message);
    }
  });
}

function bindCounterpartImport(scope) {
  const button = scope.querySelector("#counterpartImportBtn");
  if (!button) return;
  button.addEventListener("click", async () => {
    const file = scope.querySelector("#counterpartImportFile")?.files?.[0];
    const year = scope.querySelector("#counterpartImportYear")?.value || new Date().getFullYear();
    const eventId = scope.querySelector("#counterpartImportEventId")?.value || "";
    if (!file) {
      toast("Selecione um arquivo Word para importar.");
      return;
    }
    try {
      button.disabled = true;
      button.textContent = "Importando...";
      const base64 = await fileToBase64(file);
      const result = await api("/api/counterparts/import-docx", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, base64, year, eventId })
      });
      toast(`${result.createdCount} contrapartidas importadas de ${result.parsedCount} encontradas.`);
      await reload();
      navigate("/contrapartidas", true);
    } catch (error) {
      toast(error.message);
      button.disabled = false;
      button.textContent = "Importar";
    }
  });
}

function bindCounterpartFilters(scope) {
  const filters = scope.querySelector("#counterpartFilters");
  if (!filters) return;

  const searchInput = filters.querySelector("#counterpartListSearch");
  const yearSelect = filters.querySelector("#counterpartListYear");
  const eventSelect = filters.querySelector("#counterpartListEvent");
  const count = filters.querySelector("#counterpartListCount");
  const rows = Array.from(scope.querySelectorAll("[data-counterpart-row]"));

  const applyFilters = () => {
    const search = (searchInput?.value || "").toLowerCase().trim();
    const year = yearSelect?.value || "";
    const eventId = eventSelect?.value || "";
    let visible = 0;

    rows.forEach(row => {
      const rowEventId = row.dataset.eventId || "";
      const matchesEvent = !eventId || (eventId === "__none" ? !rowEventId : rowEventId === eventId);
      const matches = (!search || (row.dataset.search || "").includes(search))
        && (!year || row.dataset.year === year)
        && matchesEvent;
      row.hidden = !matches;
      if (matches) visible += 1;
    });

    if (count) count.textContent = `${visible} visíveis`;
  };

  [searchInput, yearSelect, eventSelect].forEach(control => {
    control?.addEventListener("input", applyFilters);
    control?.addEventListener("change", applyFilters);
  });
  applyFilters();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function reload() {
  state.data = await api("/api/bootstrap");
  state.user = state.data.currentUser || state.user;
  renderApp();
}

function input(name, label, value = "", required = false, type = "text") {
  return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeAttr(value || "")}" ${required ? "required" : ""} ${!canWrite() ? "disabled" : ""}></label>`;
}

function textarea(name, label, value = "", extraClass = "", required = false) {
  return `<label class="field ${extraClass.includes("full") ? "full" : ""}"><span>${label}</span><textarea class="${extraClass}" name="${name}" ${required ? "required" : ""} ${!canWrite() ? "disabled" : ""}>${escapeHtml(value || "")}</textarea></label>`;
}

function select(name, label, rows, value = "", placeholder = "Selecione", required = false) {
  return `<label class="field"><span>${label}</span><select name="${name}" ${required ? "required" : ""} ${!canWrite() ? "disabled" : ""}><option value="">${placeholder}</option>${options(rows, value)}</select></label>`;
}

function options(rows, selected = "") {
  return rows.map(row => `<option value="${row.id}" ${row.id === selected ? "selected" : ""}>${escapeHtml(row.name || row.title || row.email)}</option>`).join("");
}

function formActions() {
  return `
    <div class="field full">
      <div class="actions">
        <button class="btn" type="button" data-cancel>Cancelar</button>
        <button class="btn primary" type="submit" ${!canWrite() ? "disabled" : ""}>Salvar</button>
      </div>
    </div>
  `;
}

function slug(value) {
  return String(value || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("\n", "&#10;");
}

bootstrap();

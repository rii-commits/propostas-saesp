const {
  addProposalChangeLog,
  addProposalNote,
  addVersion,
  createResource,
  deleteResource,
  loadAll,
  reserveProposalCode,
  resourceCollection,
  updateResource
} = require("./repository");
const {
  canAdmin,
  canWrite,
  clearSessionCookies,
  currentUser,
  login,
  requestPasswordReset,
  resetPassword
} = require("./auth");
const { getConfig } = require("./config");
const { parseBody, sendBuffer, sendJson } = require("./http");
const { buildProposalReplacements, fillTemplate, proposalYear, sanitizeEntity } = require("./validation");
const { generateFromTemplateBuffer, generateGenericDocx, importCounterpartsDocx, importTemplateDocx } = require("./docx");
const { downloadDocx, uploadDocx } = require("./storage");

function notFound(res) {
  return sendJson(res, 404, { error: "Rota nao encontrada." });
}

function forbidden(res) {
  return sendJson(res, 403, { error: "Permissao insuficiente." });
}

function parseUrl(req) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const rewrittenRoute = url.searchParams.get("route");
  if (rewrittenRoute) {
    url.pathname = `/api/${rewrittenRoute.replace(/^\/+/, "")}`;
    url.searchParams.delete("route");
  }
  return url;
}

function fileBufferFromBody(body) {
  const base64 = String(body.base64 || "");
  if (!base64) throw new Error("Arquivo em base64 nao informado.");
  return Buffer.from(base64, "base64");
}

async function handleLogin(req, res) {
  const body = await parseBody(req);
  const user = await login(body.email, body.password, res);
  return sendJson(res, 200, { user });
}

async function handleResetPassword(req, res) {
  const body = await parseBody(req);
  await resetPassword({
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    code: body.code,
    codeVerifier: body.codeVerifier,
    password: body.password
  });
  clearSessionCookies(res);
  return sendJson(res, 200, { ok: true });
}

async function handleRequestPasswordReset(req, res) {
  const body = await parseBody(req);
  await requestPasswordReset(
    body.email,
    `${getConfig().appUrl}/reset-password`,
    body.codeChallenge
  );
  return sendJson(res, 200, {
    ok: true,
    message: "Se o email estiver cadastrado, voce recebera um link para definir a nova senha."
  });
}

async function handleImportTemplate(req, res) {
  const body = await parseBody(req);
  const buffer = fileBufferFromBody(body);
  const uploaded = await uploadDocx(buffer, body.fileName, "templates");
  const imported = await importTemplateDocx(buffer, uploaded.fileName);
  return sendJson(res, 200, {
    fileName: imported.fileName,
    storedPath: uploaded.storagePath,
    storagePath: uploaded.storagePath,
    content: imported.content
  });
}

async function handleImportCounterparts(req, res) {
  const body = await parseBody(req);
  const buffer = fileBufferFromBody(body);
  const items = await importCounterpartsDocx(buffer, body.fileName, body.year, body.eventId || null);
  const created = [];
  for (const item of items) {
    created.push(await createResource("counterparts", sanitizeEntity("counterparts", item)));
  }
  return sendJson(res, 200, { imported: created.length, items: created });
}

async function handleGenerateDocx(req, res, db, proposalId, user) {
  const proposal = db.proposals.find(item => item.id === proposalId);
  if (!proposal) return notFound(res);
  const template = db.templates.find(item => item.id === proposal.templateId);
  const replacements = buildProposalReplacements(db, proposal);
  let buffer = null;

  if (template?.storagePath) {
    const templateBuffer = await downloadDocx(template.storagePath);
    if (templateBuffer) buffer = await generateFromTemplateBuffer(templateBuffer, replacements);
  }
  if (!buffer) buffer = await generateGenericDocx(proposal, replacements);

  await addVersion(proposal, "Exportacao DOCX", user);
  const fileCode = String(proposal.controlCode || proposal.id).replace(/[\\/:*?"<>|]/g, "-");
  return sendBuffer(res, 200, buffer, {
    "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Content-Disposition": `attachment; filename="proposta-${fileCode}.docx"`
  });
}

async function handleCreate(resource, body, db, user) {
  const payload = sanitizeEntity(resource, body);
  if (resource === "proposals") {
    const year = proposalYear(db, payload);
    const code = await reserveProposalCode(year);
    Object.assign(payload, code);
    if (!payload.ownerId) payload.ownerId = user.id;
    if (!payload.content || payload.regenerateContent) payload.content = fillTemplate(db, payload);
  }
  const item = await createResource(resource, payload);
  if (resource === "proposals") {
    const nextDb = { ...db, proposals: [...db.proposals, item] };
    await addProposalChangeLog(nextDb, null, item, user, "Criacao");
    if (item.status === "Final") await addVersion(item, "Criacao finalizada", user);
  }
  return item;
}

async function handleUpdate(resource, id, body, db, user) {
  const previous = db[resourceCollection(resource)].find(item => item.id === id);
  if (!previous) return null;
  const payload = sanitizeEntity(resource, body);
  if (resource === "proposals" && body.regenerateContent) {
    payload.content = fillTemplate(db, { ...previous, ...payload });
  }
  const item = await updateResource(resource, id, payload);
  if (resource === "proposals") {
    await addProposalChangeLog(db, previous, item, user, "Atualizacao");
    if (previous.status !== "Final" && item.status === "Final") await addVersion(item, "Marcada como Final", user);
  }
  return item;
}

async function handleDelete(resource, id, db, user) {
  const previous = db[resourceCollection(resource)].find(item => item.id === id);
  if (!previous) return null;
  const item = await deleteResource(resource, id);
  if (resource === "proposals") {
    await addProposalChangeLog(db, previous, previous, user, "Exclusao");
  }
  return item;
}

async function handleApi(req, res) {
  try {
    const url = parseUrl(req);
    const segments = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/" && req.method === "GET") {
      res.statusCode = 302;
      res.setHeader("Location", "/login");
      return res.end();
    }

    if (url.pathname === "/api/health" && req.method === "GET") {
      return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === "/api/login" && req.method === "POST") {
      return handleLogin(req, res);
    }

    if (url.pathname === "/api/reset-password" && req.method === "POST") {
      return handleResetPassword(req, res);
    }

    if (url.pathname === "/api/request-password-reset" && req.method === "POST") {
      return handleRequestPasswordReset(req, res);
    }

    if (url.pathname === "/api/logout" && req.method === "POST") {
      clearSessionCookies(res);
      return sendJson(res, 200, { ok: true });
    }

    const user = await currentUser(req, res);
    if (!user) {
      const acceptsHtml = String(req.headers.accept || "").includes("text/html");
      if (url.pathname === "/api/bootstrap" && req.method === "GET" && acceptsHtml) {
        res.statusCode = 302;
        res.setHeader("Location", `/reset-password${url.search}`);
        return res.end();
      }
      return sendJson(res, 401, { error: "Login necessario." });
    }

    const db = await loadAll();
    if (url.pathname === "/api/bootstrap" && req.method === "GET") {
      return sendJson(res, 200, { ...db, currentUser: user });
    }

    if (url.pathname === "/api/templates/import-docx" && req.method === "POST") {
      if (!canWrite(user)) return forbidden(res);
      return handleImportTemplate(req, res);
    }

    if (url.pathname === "/api/counterparts/import-docx" && req.method === "POST") {
      if (!canWrite(user)) return forbidden(res);
      return handleImportCounterparts(req, res);
    }

    if (segments[0] === "api" && segments[1] === "proposals" && segments[3] === "generate-docx" && req.method === "POST") {
      if (!canWrite(user)) return forbidden(res);
      return handleGenerateDocx(req, res, db, segments[2], user);
    }

    if (segments[0] === "api" && segments[1] === "proposals" && segments[3] === "notes" && req.method === "POST") {
      if (!canWrite(user)) return forbidden(res);
      const proposal = db.proposals.find(item => item.id === segments[2]);
      if (!proposal) return notFound(res);
      const body = await parseBody(req);
      const note = await addProposalNote(proposal, body.content, user);
      if (!note) return sendJson(res, 400, { error: "Informe uma observacao para salvar." });
      return sendJson(res, 201, note);
    }

    if (segments[0] !== "api") return notFound(res);
    const resource = segments[1];
    const collection = resourceCollection(resource);
    if (!collection) return notFound(res);

    if (resource === "users" && !canAdmin(user)) {
      if (req.method !== "GET") return forbidden(res);
    }

    if (req.method === "GET") {
      return sendJson(res, 200, db[collection]);
    }

    if (!canWrite(user)) return forbidden(res);
    if (resource === "users" && !canAdmin(user)) return forbidden(res);

    if (req.method === "POST") {
      const body = await parseBody(req);
      const item = await handleCreate(resource, body, db, user);
      return sendJson(res, 201, item);
    }

    if (req.method === "PUT" && segments[2]) {
      const body = await parseBody(req);
      const item = await handleUpdate(resource, segments[2], body, db, user);
      if (!item) return notFound(res);
      return sendJson(res, 200, item);
    }

    if (req.method === "DELETE" && segments[2]) {
      const item = await handleDelete(resource, segments[2], db, user);
      if (!item) return notFound(res);
      return sendJson(res, 200, { deleted: item });
    }

    return notFound(res);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: error.message || "Erro interno." });
  }
}

module.exports = handleApi;
module.exports.handleApi = handleApi;

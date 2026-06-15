const workflowStages = [
  "Em confeccao",
  "Proposta enviada",
  "Em formalizacao",
  "Em realizacao",
  "Finalizado",
  "Declinios"
];

const proposalStatuses = [
  "Rascunho",
  "Enviada",
  "Aprovada",
  "Recusada",
  "Cancelada",
  "Final"
];

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeControlCode(value) {
  const text = normalizeText(value).toUpperCase();
  const match = text.match(/^(?:C\s*)?(\d+)\s*[/-]\s*(\d{4})$/);
  if (!match) {
    throw new Error("Informe o codigo no formato C 070/2026.");
  }
  return {
    controlCode: `C ${String(Number(match[1])).padStart(3, "0")}/${match[2]}`,
    controlSequence: Number(match[1]),
    controlYear: match[2]
  };
}

function extractVariables(content) {
  return Array.from(String(content || "").matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)).map(match => match[1]);
}

function sanitizeEntity(resource, body) {
  const base = { ...body };
  delete base.id;
  delete base.createdAt;
  delete base.updatedAt;

  if (resource === "users") {
    base.name = normalizeText(base.name);
    base.email = normalizeText(base.email).toLowerCase();
    base.role = ["Admin", "Editor", "Leitor"].includes(base.role) ? base.role : "Leitor";
    base.password = base.password || "";
  }

  if (resource === "companies") {
    base.name = normalizeText(base.name);
    base.cnpj = normalizeText(base.cnpj);
    base.address = normalizeText(base.address);
    base.contactPerson = normalizeText(base.contactPerson);
    base.contacts = normalizeText(base.contacts);
    base.notes = normalizeText(base.notes);
  }

  if (resource === "events") {
    base.name = normalizeText(base.name);
    base.date = normalizeText(base.date);
    base.location = normalizeText(base.location);
    base.description = normalizeText(base.description);
    base.companyId = base.companyId || null;
  }

  if (resource === "templates") {
    base.name = normalizeText(base.name);
    base.type = normalizeText(base.type) || "Patrocinio";
    base.content = String(base.content || "");
    base.variables = Array.isArray(base.variables) ? base.variables : extractVariables(base.content);
    base.importedFileName = base.importedFileName || "";
    base.storagePath = base.storagePath || base.importedFilePath || "";
  }

  if (resource === "counterparts") {
    base.title = normalizeText(base.title);
    base.category = normalizeText(base.category);
    base.description = normalizeText(base.description);
    base.estimatedValue = normalizeText(base.estimatedValue);
    base.year = normalizeText(base.year);
    base.eventId = base.eventId || null;
    base.sourceFileName = normalizeText(base.sourceFileName);
    base.active = Boolean(base.active);
  }

  if (resource === "proposals") {
    delete base.issuedAt;
    Object.assign(base, normalizeControlCode(base.controlCode));
    base.title = normalizeText(base.title);
    base.companyId = base.companyId || null;
    base.eventId = base.eventId || null;
    base.templateId = base.templateId || null;
    base.ownerId = base.ownerId || null;
    base.recipientName = normalizeText(base.recipientName);
    base.status = proposalStatuses.includes(base.status) ? base.status : "Rascunho";
    base.workflowStage = workflowStages.includes(base.workflowStage) ? base.workflowStage : "Em confeccao";
    base.value = normalizeText(base.value);
    base.counterpartIds = Array.isArray(base.counterpartIds) ? base.counterpartIds : [];
    base.content = String(base.content || "");
    base.regenerateContent = Boolean(base.regenerateContent);
  }

  return base;
}

function formatLongDate(value = new Date()) {
  const source = value instanceof Date ? value : new Date(value);
  const months = [
    "janeiro",
    "fevereiro",
    "marco",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro"
  ];
  return `${String(source.getDate()).padStart(2, "0")} de ${months[source.getMonth()]} de ${source.getFullYear()}`;
}

function formatControlCode(sequence, year) {
  return `C ${String(sequence).padStart(3, "0")}/${year}`;
}

function proposalYear(db, payload) {
  const event = db.events.find(item => item.id === payload.eventId);
  const eventYear = String(event?.date || "").slice(0, 4);
  return /^\d{4}$/.test(eventYear) ? eventYear : String(new Date().getFullYear());
}

function buildCounterpartsText(counterparts) {
  if (!counterparts.length) return "Nenhuma contrapartida selecionada.";
  return counterparts.map(item => `- ${item.title}: ${item.description || item.category || ""}`.trim()).join("\n");
}

function buildProposalReplacements(db, payload) {
  const company = db.companies.find(item => item.id === payload.companyId);
  const event = db.events.find(item => item.id === payload.eventId);
  const owner = db.users.find(item => item.id === payload.ownerId);
  const counterparts = db.counterparts.filter(item => (payload.counterpartIds || []).includes(item.id));
  const recipientName = payload.recipientName || company?.contactPerson || owner?.name || "";

  return {
    empresa: company?.name || "",
    endereco: company?.address || "",
    evento: event?.name || "",
    data: formatLongDate(payload.issuedAt || payload.createdAt || new Date()),
    data_evento: event?.date ? formatLongDate(event.date) : "",
    local: event?.location || "",
    valor: payload.value || "",
    responsavel: recipientName,
    responsavel_interno: owner?.name || "",
    contrapartidas: buildCounterpartsText(counterparts),
    codigo: payload.controlCode || "",
    conteudo: payload.content || ""
  };
}

function fillTemplate(db, payload) {
  const template = db.templates.find(item => item.id === payload.templateId);
  if (!template) return payload.content || "";
  const replacements = buildProposalReplacements(db, payload);
  return String(template.content || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => replacements[key] ?? "");
}

module.exports = {
  buildProposalReplacements,
  fillTemplate,
  formatControlCode,
  normalizeControlCode,
  proposalStatuses,
  proposalYear,
  sanitizeEntity,
  workflowStages
};

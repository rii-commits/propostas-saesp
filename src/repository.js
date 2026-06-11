const { randomUUID } = require("crypto");
const { getServiceClient } = require("./supabase");
const { collectionConfig, toClient, toDb } = require("./mappers");
const { formatControlCode } = require("./validation");

const orderedCollections = [
  "users",
  "companies",
  "events",
  "templates",
  "counterparts",
  "proposals",
  "proposalVersions",
  "proposalChangeLogs",
  "proposalNotes"
];

function nowStamp() {
  return new Date().toISOString();
}

function resourceCollection(resource) {
  return {
    users: "users",
    companies: "companies",
    events: "events",
    templates: "templates",
    counterparts: "counterparts",
    proposals: "proposals"
  }[resource];
}

async function checked(result) {
  const { data, error } = await result;
  if (error) throw error;
  return data;
}

async function listCollection(collection) {
  const supabase = getServiceClient();
  const { table } = collectionConfig(collection);
  let query = supabase.from(table).select("*");
  if (collection === "proposals") query = query.order("created_at", { ascending: true });
  else if (collection !== "users") query = query.order("created_at", { ascending: true });
  const data = await checked(query);
  return (data || []).map(row => toClient(collection, row));
}

async function loadAll() {
  const entries = await Promise.all(orderedCollections.map(async collection => [collection, await listCollection(collection)]));
  return Object.fromEntries(entries);
}

async function createAuthUser(payload) {
  const supabase = getServiceClient();
  const password = payload.password || randomUUID();
  const { data, error } = await supabase.auth.admin.createUser({
    email: payload.email,
    password,
    email_confirm: true,
    user_metadata: { name: payload.name, role: payload.role }
  });
  if (error) throw error;

  const profile = {
    id: data.user.id,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    created_at: nowStamp(),
    updated_at: nowStamp()
  };
  const row = await checked(supabase.from("profiles").insert(profile).select("*").single());
  return toClient("users", row);
}

async function updateAuthUser(id, payload) {
  const supabase = getServiceClient();
  const updates = {};
  if (payload.email) updates.email = payload.email;
  if (payload.password) updates.password = payload.password;
  if (payload.name || payload.role) updates.user_metadata = { name: payload.name, role: payload.role };
  if (Object.keys(updates).length) {
    const { error } = await supabase.auth.admin.updateUserById(id, updates);
    if (error) throw error;
  }

  const row = await checked(
    supabase
      .from("profiles")
      .update({ name: payload.name, email: payload.email, role: payload.role, updated_at: nowStamp() })
      .eq("id", id)
      .select("*")
      .single()
  );
  return toClient("users", row);
}

async function deleteAuthUser(id) {
  const supabase = getServiceClient();
  const profile = await checked(supabase.from("profiles").delete().eq("id", id).select("*").single());
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) throw error;
  return toClient("users", profile);
}

async function createResource(resource, payload) {
  if (resource === "users") return createAuthUser(payload);
  const collection = resourceCollection(resource);
  const { table } = collectionConfig(collection);
  const insertPayload = toDb(collection, payload);
  const row = await checked(getServiceClient().from(table).insert(insertPayload).select("*").single());
  return toClient(collection, row);
}

async function updateResource(resource, id, payload) {
  if (resource === "users") return updateAuthUser(id, payload);
  const collection = resourceCollection(resource);
  const { table } = collectionConfig(collection);
  const updatePayload = { ...toDb(collection, payload), updated_at: nowStamp() };
  delete updatePayload.regenerate_content;
  const row = await checked(getServiceClient().from(table).update(updatePayload).eq("id", id).select("*").single());
  return toClient(collection, row);
}

async function deleteResource(resource, id) {
  if (resource === "users") return deleteAuthUser(id);
  const collection = resourceCollection(resource);
  const { table } = collectionConfig(collection);
  const row = await checked(getServiceClient().from(table).delete().eq("id", id).select("*").single());
  return toClient(collection, row);
}

async function reserveProposalCode(year) {
  const { data, error } = await getServiceClient().rpc("reserve_proposal_code", { target_year: String(year) });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Nao foi possivel reservar codigo da proposta.");
  return {
    controlYear: row.control_year || String(year),
    controlSequence: row.control_sequence,
    controlCode: row.control_code || formatControlCode(row.control_sequence, row.control_year || year),
    issuedAt: row.issued_at || nowStamp()
  };
}

function counterpartSummary(db, ids = []) {
  const names = ids
    .map(id => db.counterparts.find(item => item.id === id)?.title)
    .filter(Boolean);
  return names.length ? names.join("; ") : "Nenhuma";
}

function sameIdList(left = [], right = []) {
  return [...left].sort().join("|") === [...right].sort().join("|");
}

function proposalSnapshot(db, proposal) {
  const company = db.companies.find(item => item.id === proposal.companyId);
  const event = db.events.find(item => item.id === proposal.eventId);
  return {
    proposalId: proposal.id,
    controlCode: proposal.controlCode || "",
    proposalTitle: proposal.title,
    companyId: proposal.companyId,
    companyName: company?.name || "",
    eventId: proposal.eventId,
    eventName: event?.name || ""
  };
}

async function addProposalChangeLog(db, previous, current, user, action = "Atualizacao") {
  const changes = [];
  if (!previous) {
    changes.push({ field: "created", label: "Proposta", from: "", to: "Criada" });
    if (current.controlCode) changes.push({ field: "controlCode", label: "Codigo", from: "", to: current.controlCode });
  } else if (action === "Exclusao") {
    changes.push({ field: "deleted", label: "Proposta", from: previous.title, to: "Excluida" });
  } else {
    const fields = [
      ["title", "Titulo"],
      ["companyId", "Empresa"],
      ["eventId", "Evento"],
      ["templateId", "Modelo"],
      ["ownerId", "Responsavel interno"],
      ["recipientName", "Contato"],
      ["value", "Valor"],
      ["status", "Status"],
      ["workflowStage", "Etapa"]
    ];
    for (const [field, label] of fields) {
      if ((previous[field] || "") !== (current[field] || "")) {
        changes.push({ field, label, from: previous[field] || "", to: current[field] || "" });
      }
    }
    if (!sameIdList(previous.counterpartIds || [], current.counterpartIds || [])) {
      changes.push({
        field: "counterpartIds",
        label: "Contrapartidas",
        from: counterpartSummary(db, previous.counterpartIds || []),
        to: counterpartSummary(db, current.counterpartIds || [])
      });
    }
  }

  if (!changes.length) return null;
  const snapshot = proposalSnapshot(db, current || previous);
  const payload = {
    ...snapshot,
    action,
    changedById: user?.id || "",
    changedByName: user?.name || "Sistema",
    changes
  };
  const row = await checked(getServiceClient().from("proposal_change_logs").insert(toDb("proposalChangeLogs", payload)).select("*").single());
  return toClient("proposalChangeLogs", row);
}

async function addVersion(proposal, reason, user) {
  const payload = {
    proposalId: proposal.id,
    controlCode: proposal.controlCode || "",
    reason,
    status: proposal.status,
    content: proposal.content,
    changedById: user?.id || "",
    changedByName: user?.name || "Sistema"
  };
  const row = await checked(getServiceClient().from("proposal_versions").insert(toDb("proposalVersions", payload)).select("*").single());
  return toClient("proposalVersions", row);
}

async function addProposalNote(proposal, content, user) {
  const note = String(content || "").trim();
  if (!proposal || !note) return null;
  const payload = {
    proposalId: proposal.id,
    content: note,
    createdById: user?.id || "",
    createdByName: user?.name || "Sistema"
  };
  const row = await checked(getServiceClient().from("proposal_notes").insert(toDb("proposalNotes", payload)).select("*").single());
  await checked(getServiceClient().from("proposal_change_logs").insert(toDb("proposalChangeLogs", {
    proposalId: proposal.id,
    controlCode: proposal.controlCode || "",
    proposalTitle: proposal.title || "",
    companyId: proposal.companyId || "",
    companyName: "",
    eventId: proposal.eventId || "",
    eventName: "",
    action: "Observacao",
    changedById: user?.id || "",
    changedByName: user?.name || "Sistema",
    changes: [{ field: "note", label: "Observacao", from: "", to: note }]
  })).select("*").single());
  return toClient("proposalNotes", row);
}

module.exports = {
  addProposalChangeLog,
  addProposalNote,
  addVersion,
  createResource,
  deleteResource,
  listCollection,
  loadAll,
  reserveProposalCode,
  resourceCollection,
  updateResource
};

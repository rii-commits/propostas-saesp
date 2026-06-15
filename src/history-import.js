const { createHash, randomUUID, timingSafeEqual } = require("crypto");
const { getServiceClient } = require("./supabase");

const MIGRATION_TOKEN_HASH = "b205b5629a2928146bfdbc5256d1611b778c893a400369d3e3ab64e63d38348d";
const ADMIN_EMAIL = "juuuh2003@gmail.com";

function authorized(req) {
  const token = String(req.headers["x-migration-token"] || "");
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"));
  const expected = Buffer.from(MIGRATION_TOKEN_HASH);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function requiredText(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`Campo obrigatorio ausente: ${field}.`);
  return text;
}

async function profileForImport(supabase) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("email", ADMIN_EMAIL)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Perfil Admin nao encontrado para a importacao.");
  return data;
}

async function findOrCreateCompany(supabase, name) {
  const { data: existing, error } = await supabase
    .from("companies")
    .select("*")
    .eq("name", name)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing;

  const { data, error: insertError } = await supabase
    .from("companies")
    .insert({ name })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return data;
}

async function findOrCreateEvent(supabase, name, companyId) {
  const { data: existing, error } = await supabase
    .from("events")
    .select("*")
    .eq("name", name)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing;

  const { data, error: insertError } = await supabase
    .from("events")
    .insert({ name, company_id: companyId })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return data;
}

function validateProposal(item) {
  return {
    controlCode: requiredText(item.controlCode, "controlCode"),
    title: requiredText(item.title, "title"),
    companyName: requiredText(item.companyName, "companyName"),
    eventName: requiredText(item.eventName, "eventName"),
    value: requiredText(item.value, "value"),
    status: requiredText(item.status, "status"),
    workflowStage: requiredText(item.workflowStage, "workflowStage"),
    issuedAt: requiredText(item.issuedAt, "issuedAt"),
    content: String(item.content || ""),
    notes: String(item.notes || ""),
    sourceFileName: String(item.sourceFileName || "")
  };
}

async function updateCounters(supabase, proposals) {
  const maxima = new Map();
  for (const item of proposals) {
    const match = item.controlCode.match(/^C\s+(\d+)\/(\d{4})$/);
    if (!match) continue;
    const sequence = Number(match[1]);
    const year = match[2];
    maxima.set(year, Math.max(maxima.get(year) || 0, sequence));
  }

  for (const [year, sequence] of maxima) {
    const counterKey = `proposal:${year}`;
    const { data: current, error } = await supabase
      .from("app_counters")
      .select("*")
      .eq("counter_key", counterKey)
      .maybeSingle();
    if (error) throw error;
    const nextValue = Math.max(Number(current?.counter_value || 0), sequence);
    const { error: upsertError } = await supabase
      .from("app_counters")
      .upsert({
        counter_key: counterKey,
        counter_value: nextValue,
        updated_at: new Date().toISOString()
      });
    if (upsertError) throw upsertError;
  }
}

async function importHistory(req, body) {
  if (!authorized(req)) {
    const error = new Error("Importacao nao autorizada.");
    error.statusCode = 403;
    throw error;
  }

  const supabase = getServiceClient();
  const proposals = (body.proposals || []).map(validateProposal);
  if (!proposals.length) throw new Error("Nenhuma proposta recebida.");

  const codes = proposals.map(item => item.controlCode);
  const { data: existing, error } = await supabase
    .from("proposals")
    .select("id, control_code, title")
    .in("control_code", codes);
  if (error) throw error;
  const duplicateCodes = (existing || []).map(item => item.control_code);

  if (body.mode !== "apply") {
    return {
      mode: "dry-run",
      received: proposals.length,
      ready: proposals.length - duplicateCodes.length,
      duplicateCodes
    };
  }

  const admin = await profileForImport(supabase);
  const imported = [];
  const skipped = [];

  for (const item of proposals) {
    if (duplicateCodes.includes(item.controlCode)) {
      skipped.push(item.controlCode);
      continue;
    }

    const company = await findOrCreateCompany(supabase, item.companyName);
    const event = await findOrCreateEvent(supabase, item.eventName, company.id);
    const match = item.controlCode.match(/^C\s+(\d+)\/(\d{4})$/);
    if (!match) throw new Error(`Codigo invalido: ${item.controlCode}.`);

    const proposalId = randomUUID();
    const timestamp = `${item.issuedAt}T12:00:00.000Z`;
    const proposalRow = {
      id: proposalId,
      title: item.title,
      company_id: company.id,
      event_id: event.id,
      owner_id: admin.id,
      recipient_name: "",
      proposal_value: item.value,
      status: item.status,
      workflow_stage: item.workflowStage,
      content: item.content,
      counterpart_ids: [],
      control_year: match[2],
      control_sequence: Number(match[1]),
      control_code: item.controlCode,
      issued_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp
    };

    const { error: proposalError } = await supabase.from("proposals").insert(proposalRow);
    if (proposalError) throw proposalError;

    const { error: versionError } = await supabase.from("proposal_versions").insert({
      id: randomUUID(),
      proposal_id: proposalId,
      control_code: item.controlCode,
      reason: "Importacao historica",
      status: item.status,
      content: item.content,
      changed_by_id: admin.id,
      changed_by_name: admin.name,
      created_at: timestamp
    });
    if (versionError) throw versionError;

    const { error: logError } = await supabase.from("proposal_change_logs").insert({
      id: randomUUID(),
      proposal_id: proposalId,
      control_code: item.controlCode,
      proposal_title: item.title,
      company_id: company.id,
      company_name: company.name,
      event_id: event.id,
      event_name: event.name,
      action: "Importacao historica",
      changed_by_id: admin.id,
      changed_by_name: admin.name,
      changes: [{
        field: "imported",
        label: "Proposta",
        from: "",
        to: `Importada de ${item.sourceFileName || "arquivo historico"}`
      }],
      created_at: timestamp
    });
    if (logError) throw logError;

    if (item.notes) {
      const { error: noteError } = await supabase.from("proposal_notes").insert({
        id: randomUUID(),
        proposal_id: proposalId,
        content: item.notes,
        created_by_id: admin.id,
        created_by_name: admin.name,
        created_at: timestamp
      });
      if (noteError) throw noteError;
    }

    imported.push(item.controlCode);
  }

  await updateCounters(supabase, proposals);
  return { mode: "apply", imported, skipped };
}

module.exports = {
  importHistory
};

const fieldMaps = {
  users: {
    table: "profiles",
    fields: {
      id: "id",
      name: "name",
      email: "email",
      role: "role",
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  },
  companies: {
    table: "companies",
    fields: {
      id: "id",
      name: "name",
      cnpj: "cnpj",
      address: "address",
      contactPerson: "contact_person",
      contacts: "contacts",
      notes: "notes",
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  },
  events: {
    table: "events",
    fields: {
      id: "id",
      name: "name",
      date: "event_date",
      location: "location",
      description: "description",
      companyId: "company_id",
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  },
  templates: {
    table: "templates",
    fields: {
      id: "id",
      name: "name",
      type: "template_type",
      variables: "variables",
      importedFileName: "imported_file_name",
      storagePath: "storage_path",
      importedFilePath: "storage_path",
      content: "content",
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  },
  counterparts: {
    table: "counterparts",
    fields: {
      id: "id",
      title: "title",
      category: "category",
      description: "description",
      estimatedValue: "estimated_value",
      year: "year",
      sourceFileName: "source_file_name",
      eventId: "event_id",
      active: "active",
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  },
  proposals: {
    table: "proposals",
    fields: {
      id: "id",
      title: "title",
      companyId: "company_id",
      eventId: "event_id",
      templateId: "template_id",
      ownerId: "owner_id",
      recipientName: "recipient_name",
      value: "proposal_value",
      status: "status",
      workflowStage: "workflow_stage",
      content: "content",
      counterpartIds: "counterpart_ids",
      controlYear: "control_year",
      controlSequence: "control_sequence",
      controlCode: "control_code",
      issuedAt: "issued_at",
      createdAt: "created_at",
      updatedAt: "updated_at"
    }
  },
  proposalVersions: {
    table: "proposal_versions",
    fields: {
      id: "id",
      proposalId: "proposal_id",
      controlCode: "control_code",
      reason: "reason",
      status: "status",
      content: "content",
      changedById: "changed_by_id",
      changedByName: "changed_by_name",
      createdAt: "created_at"
    }
  },
  proposalChangeLogs: {
    table: "proposal_change_logs",
    fields: {
      id: "id",
      proposalId: "proposal_id",
      controlCode: "control_code",
      proposalTitle: "proposal_title",
      companyId: "company_id",
      companyName: "company_name",
      eventId: "event_id",
      eventName: "event_name",
      action: "action",
      changedById: "changed_by_id",
      changedByName: "changed_by_name",
      changes: "changes",
      createdAt: "created_at"
    }
  },
  proposalNotes: {
    table: "proposal_notes",
    fields: {
      id: "id",
      proposalId: "proposal_id",
      content: "content",
      createdById: "created_by_id",
      createdByName: "created_by_name",
      createdAt: "created_at"
    }
  }
};

function collectionConfig(collection) {
  const config = fieldMaps[collection];
  if (!config) throw new Error(`Unknown collection: ${collection}`);
  return config;
}

function toClient(collection, row) {
  if (!row) return row;
  const { fields } = collectionConfig(collection);
  const output = {};
  for (const [clientKey, dbKey] of Object.entries(fields)) {
    if (clientKey === "importedFilePath") continue;
    if (Object.prototype.hasOwnProperty.call(row, dbKey)) output[clientKey] = row[dbKey] ?? "";
  }
  if (collection === "templates") output.importedFilePath = output.storagePath || "";
  return output;
}

function toDb(collection, payload) {
  const { fields } = collectionConfig(collection);
  const output = {};
  for (const [clientKey, dbKey] of Object.entries(fields)) {
    if (clientKey === "id" || clientKey === "createdAt" || clientKey === "updatedAt") continue;
    if (clientKey === "importedFilePath") continue;
    if (Object.prototype.hasOwnProperty.call(payload, clientKey)) {
      const value = payload[clientKey];
      output[dbKey] = value === "" && /_id$/.test(dbKey) ? null : value;
    }
  }
  return output;
}

module.exports = {
  collectionConfig,
  toClient,
  toDb
};

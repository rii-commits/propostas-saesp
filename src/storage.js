const { randomUUID } = require("crypto");
const { getConfig } = require("./config");
const { getServiceClient } = require("./supabase");
const { safeFileName } = require("./docx");

function storageSafeFileName(fileName) {
  const displayName = safeFileName(fileName);
  const extension = displayName.toLowerCase().endsWith(".docx") ? ".docx" : "";
  const baseName = extension ? displayName.slice(0, -extension.length) : displayName;
  const asciiBase = baseName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 120);
  return `${asciiBase || "arquivo"}${extension || ".docx"}`;
}

async function uploadDocx(buffer, fileName, folder = "templates") {
  const config = getConfig();
  const displayName = safeFileName(fileName);
  const storagePath = `${folder}/${randomUUID()}-${storageSafeFileName(displayName)}`;
  const { error } = await getServiceClient()
    .storage
    .from(config.docxBucket)
    .upload(storagePath, buffer, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: false
    });
  if (error) throw error;
  return { fileName: displayName, storagePath };
}

async function downloadDocx(storagePath) {
  if (!storagePath) return null;
  const config = getConfig();
  const { data, error } = await getServiceClient().storage.from(config.docxBucket).download(storagePath);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

module.exports = {
  downloadDocx,
  storageSafeFileName,
  uploadDocx
};

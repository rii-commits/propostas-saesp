const { randomUUID } = require("crypto");
const { getConfig } = require("./config");
const { getServiceClient } = require("./supabase");
const { safeFileName } = require("./docx");

async function uploadDocx(buffer, fileName, folder = "templates") {
  const config = getConfig();
  const cleanName = safeFileName(fileName);
  const storagePath = `${folder}/${randomUUID()}-${cleanName}`;
  const { error } = await getServiceClient()
    .storage
    .from(config.docxBucket)
    .upload(storagePath, buffer, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: false
    });
  if (error) throw error;
  return { fileName: cleanName, storagePath };
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
  uploadDocx
};

const path = require("path");
const os = require("os");
const { createRequire } = require("module");

function loadPackage(name) {
  try {
    return require(name);
  } catch (error) {
    const bundledRoot = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules");
    const candidates = [
      path.join(bundledRoot, name, "package.json"),
      path.join(bundledRoot, ".pnpm", "node_modules", name, "package.json")
    ];
    for (const candidate of candidates) {
      try {
        return createRequire(candidate)(name);
      } catch {}
    }
    throw error;
  }
}

const { Document, Packer, Paragraph, TextRun, AlignmentType } = loadPackage("docx");
const JSZip = loadPackage("jszip");

function safeFileName(fileName, fallback = "modelo.docx") {
  return String(fileName || fallback).replace(/[\\/:*?"<>|]/g, "-").trim() || fallback;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function xmlTextWithBreaks(value) {
  const lines = String(value ?? "").split(/\r?\n/);
  return lines.map((line, index) => `${index ? "<w:br/>" : ""}${escapeXml(line)}`).join("");
}

function placeholderXmlPattern(variable) {
  const chars = `{{${variable}}}`.split("").map(escapeRegex);
  return new RegExp(chars.join("(?:<[^>]+>)*"), "g");
}

function replacePlaceholdersInXml(xml, replacements) {
  let next = xml;
  let changed = false;
  for (const [key, value] of Object.entries(replacements)) {
    const pattern = placeholderXmlPattern(key);
    next = next.replace(pattern, () => {
      changed = true;
      return xmlTextWithBreaks(value);
    });
  }
  return { xml: next, changed };
}

function extractXmlParagraphs(documentXml) {
  return documentXml
    .split(/<\/w:p>/)
    .map(paragraph => paragraph
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/\s+/g, " ")
      .trim())
    .filter(Boolean);
}

async function readDocxParagraphs(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) throw new Error("Nao foi possivel ler word/document.xml do arquivo.");
  return extractXmlParagraphs(documentXml);
}

async function importTemplateDocx(buffer, fileName) {
  return {
    fileName: safeFileName(fileName),
    content: (await readDocxParagraphs(buffer)).join("\n\n")
  };
}

function parseMoney(value) {
  const match = String(value || "").match(/R\$\s*[\d.,]+/i);
  return match ? match[0].replace(/\s+/g, " ").trim() : "";
}

function stripMoney(value) {
  return String(value || "").replace(/[-\u2013\u2014]?\s*R\$\s*[\d.,]+/i, "").trim();
}

function isMoneyLine(value) {
  return /^R\$\s*[\d.,]+$/i.test(String(value || "").trim());
}

function isBulletLine(value) {
  return /^[\u2022\-*]\s*/.test(String(value || "").trim());
}

function cleanBullet(value) {
  return String(value || "").replace(/^[\u2022\-*]\s*/, "").trim();
}

function isSectionHeading(value, nextValue) {
  const text = String(value || "").trim();
  if (!text || parseMoney(text) || isBulletLine(text)) return false;
  if (/^Patroc[i\u00ed]nios?/i.test(text)) return true;
  if (/^(COPA SAESP Experience|Destaque sua marca|Materiais dos|Atividades sociais)/i.test(text) && !isMoneyLine(nextValue)) return true;
  if (/^Workshops$/i.test(text)) return true;
  return false;
}

function parseCounterpartItems(paragraphs, year, eventId, sourceFileName) {
  const items = [];
  let section = "Geral";
  let current = null;

  function flush() {
    if (!current || !current.title || !current.estimatedValue) return;
    items.push({
      title: current.title,
      category: current.category || section,
      description: current.description.length ? current.description.join("\n") : current.title,
      estimatedValue: current.estimatedValue,
      year,
      eventId: eventId || null,
      sourceFileName,
      active: true
    });
  }

  for (let index = 0; index < paragraphs.length; index += 1) {
    const line = paragraphs[index];
    const next = paragraphs[index + 1] || "";
    if (/^\d+\s*Patroc[i\u00ed]nios/i.test(line)) {
      section = line.replace(/^\d+\s*/, "").trim();
      continue;
    }
    if (isSectionHeading(line, next)) {
      flush();
      current = null;
      section = line;
      continue;
    }
    const inlineValue = parseMoney(line);
    if (inlineValue && !isMoneyLine(line)) {
      flush();
      current = { title: stripMoney(line), category: section, estimatedValue: inlineValue, description: [] };
      continue;
    }
    if (!parseMoney(line) && isMoneyLine(next)) {
      flush();
      current = { title: line, category: section, estimatedValue: parseMoney(next), description: [] };
      index += 1;
      continue;
    }
    if (current && !isMoneyLine(line)) current.description.push(cleanBullet(line));
  }
  flush();

  const seen = new Set();
  return items.filter(item => {
    const key = `${item.year}|${item.eventId}|${item.category}|${item.title}|${item.estimatedValue}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function importCounterpartsDocx(buffer, fileName, year, eventId) {
  const sourceFileName = safeFileName(fileName, "contrapartidas.docx");
  const paragraphs = await readDocxParagraphs(buffer);
  return parseCounterpartItems(paragraphs, String(year || new Date().getFullYear()), eventId, sourceFileName);
}

function textParagraph(text) {
  return new Paragraph({
    children: [new TextRun({ text })],
    spacing: { after: 120 }
  });
}

function paragraphXml(text) {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function documentXmlFromContent(documentXml, content) {
  const bodyMatch = documentXml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!bodyMatch) return null;
  const sectPrMatch = bodyMatch[1].match(/<w:sectPr[\s\S]*<\/w:sectPr>/);
  const sectPr = sectPrMatch ? sectPrMatch[0] : "";
  const paragraphs = String(content || "")
    .split(/\n{2,}/)
    .flatMap(block => block.split(/\n/))
    .map(paragraphXml)
    .join("");
  return documentXml.replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${paragraphs}${sectPr}</w:body>`);
}

async function generateGenericDocx(proposal, replacements) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun({ text: "Proposta Comercial", bold: true, size: 32 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 260 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `Codigo: ${replacements.codigo || ""}`, bold: true }),
            new TextRun({ text: `\nEmpresa: ${replacements.empresa || ""}` }),
            new TextRun({ text: `\nEvento: ${replacements.evento || ""}` }),
            new TextRun({ text: `\nStatus: ${proposal.status || ""}` })
          ],
          spacing: { after: 260 }
        }),
        ...String(proposal.content || "")
          .split(/\n{2,}/)
          .flatMap(block => block.split(/\n/).map(textParagraph)),
        new Paragraph({
          children: [new TextRun({ text: `Gerado em ${new Date().toLocaleDateString("pt-BR")}`, italics: true, size: 18 })],
          spacing: { before: 360 }
        })
      ]
    }]
  });
  return Packer.toBuffer(doc);
}

async function generateFromTemplateBuffer(buffer, replacements) {
  const zip = await JSZip.loadAsync(buffer);
  const xmlFiles = Object.keys(zip.files).filter(name => name.startsWith("word/") && name.endsWith(".xml"));
  let changed = false;

  await Promise.all(xmlFiles.map(async fileName => {
    const file = zip.file(fileName);
    if (!file) return;
    const xml = await file.async("string");
    const replaced = replacePlaceholdersInXml(xml, replacements);
    if (replaced.changed) changed = true;
    zip.file(fileName, replaced.xml);
  }));

  if (!changed) {
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) return null;
    const documentXml = await documentFile.async("string");
    const nextDocumentXml = documentXmlFromContent(documentXml, replacements.conteudo);
    if (!nextDocumentXml) return null;
    zip.file("word/document.xml", nextDocumentXml);
  }

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
}

module.exports = {
  generateFromTemplateBuffer,
  generateGenericDocx,
  importCounterpartsDocx,
  importTemplateDocx,
  safeFileName
};

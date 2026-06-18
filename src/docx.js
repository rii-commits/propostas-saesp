const path = require("path");
const os = require("os");
const { createRequire } = require("module");

function loadDocxPackage() {
  try {
    return require("docx");
  } catch (error) {
    const bundledRoot = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules");
    const candidates = [
      path.join(bundledRoot, "docx", "package.json"),
      path.join(bundledRoot, ".pnpm", "node_modules", "docx", "package.json")
    ];
    for (const candidate of candidates) {
      try {
        return createRequire(candidate)("docx");
      } catch {}
    }
    throw error;
  }
}

function loadJsZipPackage() {
  try {
    return require("jszip");
  } catch (error) {
    const bundledRoot = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules");
    const candidates = [
      path.join(bundledRoot, "jszip", "package.json"),
      path.join(bundledRoot, ".pnpm", "node_modules", "jszip", "package.json")
    ];
    for (const candidate of candidates) {
      try {
        return createRequire(candidate)("jszip");
      } catch {}
    }
    throw error;
  }
}

const { Document, Packer, Paragraph, TextRun, AlignmentType } = loadDocxPackage();
const JSZip = loadJsZipPackage();

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

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function textElements(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map(line => `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`)
    .join("<w:br/>");
}

function replaceTextPlaceholders(text, replacements) {
  let next = text;
  let changed = false;
  for (const [key, value] of Object.entries(replacements)) {
    const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    if (!pattern.test(next)) continue;
    pattern.lastIndex = 0;
    next = next.replace(pattern, String(value ?? ""));
    changed = true;
  }
  return { text: next, changed };
}

function replacePlaceholdersInParagraph(paragraphXml, replacements) {
  const textPattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  const matches = Array.from(paragraphXml.matchAll(textPattern));
  if (!matches.length) return { xml: paragraphXml, changed: false };

  const fullText = matches.map(match => decodeXml(match[1])).join("");
  const replaced = replaceTextPlaceholders(fullText, replacements);
  if (!replaced.changed) return { xml: paragraphXml, changed: false };

  let textIndex = 0;
  const next = paragraphXml.replace(textPattern, () => {
    textIndex += 1;
    return textIndex === 1 ? textElements(replaced.text) : "<w:t></w:t>";
  });
  return { xml: next, changed: true };
}

function replacePlaceholdersInXml(xml, replacements) {
  let changed = false;
  const next = xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, paragraph => {
    const replaced = replacePlaceholdersInParagraph(paragraph, replacements);
    if (replaced.changed) changed = true;
    return replaced.xml;
  });
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

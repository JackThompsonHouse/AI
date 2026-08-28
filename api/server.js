"use strict";

const express = require("express");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const Anthropic = require("@anthropic-ai/sdk");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const { SOW_SCHEMA, SOW_SYSTEM_PROMPT } = require("./sow-schema");

const PORT = process.env.PORT || 3001;
const DB_PATH = process.env.DB_PATH || "/data/quotes.db";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const SOW_DOCS_DIR = process.env.SOW_DOCS_DIR || "/data/sow-documents";
const SOW_TEMPLATE_PATH = path.join(__dirname, "templates", "sow-template.docx");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(SOW_DOCS_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    customer TEXT NOT NULL DEFAULT '',
    opportunity TEXT NOT NULL DEFAULT '',
    prepared_by TEXT NOT NULL DEFAULT '',
    quote_date TEXT NOT NULL DEFAULT '',
    total_days REAL NOT NULL DEFAULT 0,
    total_cost REAL NOT NULL DEFAULT 0,
    total_sell REAL NOT NULL DEFAULT 0,
    total_margin REAL NOT NULL DEFAULT 0,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

const listStmt = db.prepare(`
  SELECT id, customer, opportunity, prepared_by AS preparedBy, quote_date AS quoteDate,
         total_days AS totalDays, total_cost AS totalCost, total_sell AS totalSell,
         total_margin AS totalMargin, created_at AS createdAt, updated_at AS updatedAt
  FROM quotes ORDER BY updated_at DESC
`);
const getStmt = db.prepare("SELECT * FROM quotes WHERE id = ?");
const insertStmt = db.prepare(`
  INSERT INTO quotes (
    id, customer, opportunity, prepared_by, quote_date,
    total_days, total_cost, total_sell, total_margin,
    data, created_at, updated_at
  ) VALUES (
    @id, @customer, @opportunity, @preparedBy, @quoteDate,
    @totalDays, @totalCost, @totalSell, @totalMargin,
    @data, @createdAt, @updatedAt
  )
`);
const updateStmt = db.prepare(`
  UPDATE quotes SET
    customer = @customer, opportunity = @opportunity, prepared_by = @preparedBy,
    quote_date = @quoteDate, total_days = @totalDays, total_cost = @totalCost,
    total_sell = @totalSell, total_margin = @totalMargin, data = @data, updated_at = @updatedAt
  WHERE id = @id
`);
const deleteStmt = db.prepare("DELETE FROM quotes WHERE id = ?");

db.exec(`
  CREATE TABLE IF NOT EXISTS sow_documents (
    id TEXT PRIMARY KEY,
    client_name TEXT NOT NULL DEFAULT '',
    project_name TEXT NOT NULL DEFAULT '',
    proposal_title TEXT NOT NULL DEFAULT '',
    transcript TEXT NOT NULL DEFAULT '',
    extracted_data TEXT NOT NULL,
    docx_filename TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

const sowListStmt = db.prepare(`
  SELECT id, client_name AS clientName, project_name AS projectName,
         proposal_title AS proposalTitle, created_at AS createdAt, updated_at AS updatedAt
  FROM sow_documents ORDER BY updated_at DESC
`);
const sowGetStmt = db.prepare("SELECT * FROM sow_documents WHERE id = ?");
const sowInsertStmt = db.prepare(`
  INSERT INTO sow_documents (
    id, client_name, project_name, proposal_title, transcript,
    extracted_data, docx_filename, created_at, updated_at
  ) VALUES (
    @id, @clientName, @projectName, @proposalTitle, @transcript,
    @extractedData, @docxFilename, @createdAt, @updatedAt
  )
`);
const sowDeleteStmt = db.prepare("DELETE FROM sow_documents WHERE id = ?");

function nowISO() {
  return new Date().toISOString();
}

function rowToQuote(row) {
  var parsed = JSON.parse(row.data);
  return {
    id: row.id,
    meta: parsed.meta,
    lines: parsed.lines,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function paramsFromBody(id, body) {
  var meta = body.meta || {};
  var totals = body.totals || {};
  return {
    id: id,
    customer: meta.customer || "",
    opportunity: meta.opportunity || "",
    preparedBy: meta.preparedBy || "",
    quoteDate: meta.date || "",
    totalDays: Number(totals.days) || 0,
    totalCost: Number(totals.cost) || 0,
    totalSell: Number(totals.sell) || 0,
    totalMargin: Number(totals.margin) || 0,
    data: JSON.stringify({ meta: meta, lines: body.lines || [] })
  };
}

const app = express();
app.use(express.json({ limit: "5mb" })); // long transcripts + review-form payloads

app.get("/healthz", function (req, res) {
  res.status(200).send("ok");
});

app.get("/psquote/api/quotes", function (req, res) {
  res.json(listStmt.all());
});

app.get("/psquote/api/quotes/:id", function (req, res) {
  var row = getStmt.get(req.params.id);
  if (!row) return res.status(404).json({ error: "not_found" });
  res.json(rowToQuote(row));
});

app.post("/psquote/api/quotes", function (req, res) {
  var body = req.body || {};
  if (!body.meta || !Array.isArray(body.lines)) {
    return res.status(400).json({ error: "invalid_body" });
  }
  var id = crypto.randomUUID();
  var ts = nowISO();
  var params = paramsFromBody(id, body);
  params.createdAt = ts;
  params.updatedAt = ts;
  insertStmt.run(params);
  res.status(201).json({ id: id, createdAt: ts, updatedAt: ts });
});

app.put("/psquote/api/quotes/:id", function (req, res) {
  var body = req.body || {};
  if (!body.meta || !Array.isArray(body.lines)) {
    return res.status(400).json({ error: "invalid_body" });
  }
  var existing = getStmt.get(req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  var ts = nowISO();
  var params = paramsFromBody(req.params.id, body);
  params.updatedAt = ts;
  updateStmt.run(params);
  res.json({ id: req.params.id, updatedAt: ts });
});

app.delete("/psquote/api/quotes/:id", function (req, res) {
  deleteStmt.run(req.params.id);
  res.status(204).end();
});

// --- SOW generator -------------------------------------------------------

// docxtemplater does not resolve dotted tag text like {a.b} against nested
// objects by default - it does a flat literal-key lookup. This custom
// parser walks the dotted path against whatever scope it's called with
// (root data for top-level tags, the current loop item once inside a
// {#loop}). Must match the parser used by templates/build_template.py's
// comments/design - see that file for how the tags were authored.
function dottedPathParser(tag) {
  return {
    get: function (scope) {
      if (tag === ".") return scope;
      return tag.split(".").reduce(function (obj, key) {
        return obj == null ? undefined : obj[key];
      }, scope);
    },
  };
}

function formatGBP(n) {
  var num = Number(n);
  if (!isFinite(num)) num = 0;
  return "£" + num.toLocaleString("en-GB", {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

var anthropicClient = null;
function getAnthropicClient() {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured on the server");
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

// Adds the fields the docx template needs but that aren't part of what the
// LLM/reviewer author directly (computed totals, boolean flags derived from
// arrays/enums for the template's conditional sections), and formats
// numeric fields as display currency strings. Mutates and returns `data`.
function prepareDataForTemplate(data) {
  var rs = data.rocServices || (data.rocServices = {});
  rs.milestoneBased = rs.pricingBasis === "milestone";
  rs.customerAssumptions = Array.isArray(rs.customerAssumptions) ? rs.customerAssumptions : [];
  rs.milestones = Array.isArray(rs.milestones) ? rs.milestones : [];

  var cs = data.commercialSummary || (data.commercialSummary = {});
  var items = Array.isArray(cs.serviceLineItems) ? cs.serviceLineItems : [];
  var total = items.reduce(function (sum, item) { return sum + (Number(item.total) || 0); }, 0);
  cs.computedServicesTotal = formatGBP(total);
  cs.serviceLineItems = items.map(function (item) {
    return { label: item.label || "", rate: formatGBP(item.rate), quantity: item.quantity != null ? item.quantity : "", total: formatGBP(item.total) };
  });

  var uplift = cs.managedServiceUplift;
  cs.hasManagedServiceUplift = !!(uplift && (uplift.description || uplift.total != null));
  cs.managedServiceUplift = {
    description: (uplift && uplift.description) || "",
    total: formatGBP(uplift && uplift.total),
  };

  var azure = Array.isArray(cs.azureCostEstimate) ? cs.azureCostEstimate : [];
  cs.hasAzureCosts = azure.length > 0;
  cs.azureCostEstimate = azure.map(function (row) {
    return {
      description: row.description || "", quantity: row.quantity != null ? row.quantity : "",
      each: formatGBP(row.each), monthly: formatGBP(row.monthly), annual: formatGBP(row.annual),
    };
  });

  var ongoing = Array.isArray(cs.ongoingAnnualCosts) ? cs.ongoingAnnualCosts : [];
  cs.hasOngoingAnnualCosts = ongoing.length > 0;
  cs.ongoingAnnualCosts = ongoing.map(function (row) {
    return {
      description: row.description || "", quantity: row.quantity != null ? row.quantity : "",
      each: formatGBP(row.each), annual: formatGBP(row.annual),
    };
  });

  data.serviceOverview = data.serviceOverview || { include: false };
  data.serviceOverview.include = !!data.serviceOverview.include;

  return data;
}

function buildDocxBuffer(data) {
  var content = fs.readFileSync(SOW_TEMPLATE_PATH, "binary");
  var zip = new PizZip(content);
  var doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, parser: dottedPathParser });
  doc.render(prepareDataForTemplate(data));
  return doc.getZip().generate({ type: "nodebuffer" });
}

app.post("/sow-generator/api/extract", function (req, res) {
  var transcript = (req.body || {}).transcript;
  if (!transcript || !String(transcript).trim()) {
    return res.status(400).json({ error: "transcript is required" });
  }
  var client;
  try {
    client = getAnthropicClient();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    system: SOW_SYSTEM_PROMPT,
    tools: [{
      name: "extract_sow_data",
      description: "Extract structured Statement of Work data from the transcript.",
      input_schema: SOW_SCHEMA,
    }],
    tool_choice: { type: "tool", name: "extract_sow_data" },
    messages: [{ role: "user", content: String(transcript) }],
  }).then(function (message) {
    var toolUse = message.content.find(function (block) { return block.type === "tool_use"; });
    if (!toolUse) {
      return res.status(502).json({ error: "model_did_not_return_structured_output" });
    }
    res.json({ data: toolUse.input });
  }).catch(function (err) {
    console.error(err);
    res.status(502).json({ error: "extraction_failed: " + err.message });
  });
});

app.post("/sow-generator/api/generate", function (req, res) {
  try {
    var body = req.body || {};
    var data = body.data;
    if (!data || !data.documentInfo) {
      return res.status(400).json({ error: "invalid_body" });
    }
    var buffer = buildDocxBuffer(JSON.parse(JSON.stringify(data)));
    var id = crypto.randomUUID();
    var filename = id + ".docx";
    fs.writeFileSync(path.join(SOW_DOCS_DIR, filename), buffer);
    var ts = nowISO();
    sowInsertStmt.run({
      id: id,
      clientName: data.documentInfo.clientName || "",
      projectName: data.documentInfo.projectName || "",
      proposalTitle: data.documentInfo.proposalTitle || "",
      transcript: body.transcript || "",
      extractedData: JSON.stringify(data),
      docxFilename: filename,
      createdAt: ts,
      updatedAt: ts,
    });
    res.status(201).json({ id: id, filename: filename, createdAt: ts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "generate_failed" });
  }
});

app.get("/sow-generator/api/documents", function (req, res) {
  res.json(sowListStmt.all());
});

app.get("/sow-generator/api/documents/:id", function (req, res) {
  var row = sowGetStmt.get(req.params.id);
  if (!row) return res.status(404).json({ error: "not_found" });
  res.json({
    id: row.id,
    clientName: row.client_name,
    projectName: row.project_name,
    proposalTitle: row.proposal_title,
    transcript: row.transcript,
    data: JSON.parse(row.extracted_data),
    docxFilename: row.docx_filename,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
});

app.get("/sow-generator/api/documents/:id/download", function (req, res) {
  var row = sowGetStmt.get(req.params.id);
  if (!row) return res.status(404).json({ error: "not_found" });
  var filePath = path.join(SOW_DOCS_DIR, row.docx_filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "file_missing" });
  var base = (row.project_name || row.client_name || "sow").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  res.download(filePath, "sow-" + base + ".docx");
});

app.delete("/sow-generator/api/documents/:id", function (req, res) {
  var row = sowGetStmt.get(req.params.id);
  if (row) {
    fs.rm(path.join(SOW_DOCS_DIR, row.docx_filename), { force: true }, function () {});
  }
  sowDeleteStmt.run(req.params.id);
  res.status(204).end();
});

app.use(function (err, req, res, next) {
  console.error(err);
  res.status(500).json({ error: "server_error" });
});

app.listen(PORT, function () {
  console.log("PS quote API listening on :" + PORT + " (db: " + DB_PATH + ")");
});

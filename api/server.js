"use strict";

const express = require("express");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const PORT = process.env.PORT || 3001;
const DB_PATH = process.env.DB_PATH || "/data/quotes.db";

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
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
app.use(express.json({ limit: "2mb" }));

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

app.use(function (err, req, res, next) {
  console.error(err);
  res.status(500).json({ error: "server_error" });
});

app.listen(PORT, function () {
  console.log("PS quote API listening on :" + PORT + " (db: " + DB_PATH + ")");
});

(function () {
  "use strict";

  // Role name -> [dayCost, dayCost] cost and sell rates for each coverage type.
  // cost/sell arrays are [Standard 9am-5pm, Evening/Saturday, Sunday/Holiday]
  // NOTE: flattened to placeholder values (cost 123 / sell 456 across the
  // board) at request - these are no longer the real day rates.
  var ROLES = [
    { name: "Enterprise Architect", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Automation Architect", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Programme Manager", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Service Architect", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Automation Consultant", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Process Consultant", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Solution Architect", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Principal Service Delivery Manager", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Senior Project Manager", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Network Consultant", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Microsoft/Platforms Consultant", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Project Manager", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Service Delivery Manager", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Network Engineer", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Wireless Survey Consultant", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Field Service Engineer (Centrex)", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "PMO/Project Co ordinator", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Cyber Security Architect", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Cyber Security Analyst", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "SDE Consultant", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Service Delivery Executive", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Service Operations Manager", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Field Service Engineer (Non-Centrex)", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Monitoring Specialist", cost: [123, 123, 123], sell: [456, 456, 456] },
    { name: "Third-Party (manual pricing)", cost: [123, 123, 123], sell: [456, 456, 456] }
  ];

  var PHASES = ["Assess", "Design", "Transform", "Operate", "Supplementary"];
  var COVERAGE = ["Standard (9am-5pm)", "Evening / Saturday", "Sunday / Holiday"];
  var SERVICE_TYPES = [
    "Hardware", "Modern Work", "Network Services", "Cloud Services",
    "Connected Networking", "Infrastructure Services", "Secure Enterprise",
    "Service Delivery", "Other"
  ];

  // v3: split the single "description" field into "title" + "description".
  var STORAGE_KEY = "ps-quote-builder-v3";

  var nextLineId = 1;

  function todayISO() {
    var d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function newLine() {
    return {
      id: nextLineId++,
      phase: PHASES[0],
      title: "",
      description: "",
      roleIndex: 0,
      serviceType: SERVICE_TYPES[0],
      coverageIndex: 0,
      days: 0
    };
  }

  function blankQuote() {
    return {
      id: null,
      viewMode: "edit",
      meta: { customer: "", manager: "", opportunity: "", preparedBy: "", verifiedBy: "", date: todayISO() },
      lines: [newLine()]
    };
  }

  var state = loadState() || blankQuote();

  // Make sure freshly-added lines never collide with IDs already present in
  // a quote restored from localStorage.
  nextLineId = state.lines.reduce(function (max, l) { return Math.max(max, l.id); }, 0) + 1;

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* storage unavailable, ignore */ }
  }

  function money(n) {
    return "£" + (Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function pct(n) {
    if (!isFinite(n)) return "-";
    return (Math.round(n * 1000) / 10) + "%";
  }

  function lineFigures(line) {
    var role = ROLES[line.roleIndex] || ROLES[0];
    var days = Number(line.days) || 0;
    var costDay = role.cost[line.coverageIndex] || 0;
    var sellDay = role.sell[line.coverageIndex] || 0;
    var costTotal = days * costDay;
    var sellTotal = days * sellDay;
    return { costDay: costDay, sellDay: sellDay, costTotal: costTotal, sellTotal: sellTotal, margin: sellTotal - costTotal };
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "text") e.textContent = attrs[k];
        else e.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }

  // For fields keyed by array index (role, coverage) - option value is the index.
  function optionList(items, selectedIndex) {
    return items.map(function (label, i) {
      var o = document.createElement("option");
      o.value = i;
      o.textContent = label;
      if (i === selectedIndex) o.selected = true;
      return o;
    });
  }

  // For fields keyed by their own text (phase, service type) - option value
  // is the label itself, so the stored state is a plain, self-describing
  // string rather than an index that only makes sense against this list.
  function optionListByValue(items, selectedValue) {
    return items.map(function (label) {
      var o = document.createElement("option");
      o.value = label;
      o.textContent = label;
      if (label === selectedValue) o.selected = true;
      return o;
    });
  }

  function renderMeta() {
    document.getElementById("metaCustomer").value = state.meta.customer;
    document.getElementById("metaManager").value = state.meta.manager;
    document.getElementById("metaOpportunity").value = state.meta.opportunity;
    document.getElementById("metaPreparedBy").value = state.meta.preparedBy;
    document.getElementById("metaVerifiedBy").value = state.meta.verifiedBy;
    document.getElementById("metaDate").value = state.meta.date;
  }

  function field(labelText, className, inputEl) {
    return el("label", { class: "line-field" + (className ? " " + className : "") }, [
      el("span", { text: labelText }),
      inputEl
    ]);
  }

  function statChip(labelText, className) {
    var valueEl = el("b", { class: className, text: money(0) });
    var chip = el("div", { class: "stat-chip" }, [
      el("span", { text: labelText }),
      valueEl
    ]);
    return { chip: chip, valueEl: valueEl };
  }

  function renderLines() {
    var body = document.getElementById("linesBody");
    var addBtn = document.getElementById("addLineBtn");
    var editBtn = document.getElementById("editBtn");
    body.innerHTML = "";

    var isSummary = state.viewMode === "summary";
    addBtn.style.display = isSummary ? "none" : "";
    editBtn.style.display = isSummary ? "" : "none";

    if (isSummary) {
      renderLinesSummaryTable(body);
      return;
    }

    state.lines.forEach(function (line, index) {
      var fig = lineFigures(line);
      var card = document.createElement("div");
      card.className = "line-card";
      card.dataset.id = line.id;

      var phaseSel = el("select", { "data-field": "phase" }, optionListByValue(PHASES, line.phase));
      var roleSel = el("select", { "data-field": "roleIndex" }, optionList(ROLES.map(function (r) { return r.name; }), line.roleIndex));
      var serviceTypeSel = el("select", { "data-field": "serviceType" }, optionListByValue(SERVICE_TYPES, line.serviceType));
      var coverageSel = el("select", { "data-field": "coverageIndex" }, optionList(COVERAGE, line.coverageIndex));
      var daysInput = el("input", { type: "number", min: "0", step: "0.5", "data-field": "days", value: line.days });
      var titleInput = el("input", { type: "text", "data-field": "title", placeholder: "e.g. Discovery workshop", value: line.title });
      var descInput = el("input", { type: "text", "data-field": "description", placeholder: "Optional notes / rationale", value: line.description });

      var removeBtn = el("button", { type: "button", class: "btn-remove", "aria-label": "Remove line" });
      removeBtn.textContent = "×";

      var top = el("div", { class: "line-card-top" }, [
        el("span", { class: "line-card-index", text: "Line " + (index + 1) }),
        removeBtn
      ]);

      // Role names can run long (e.g. "Field Service Engineer (Non-Centrex)"),
      // so it gets its own full-width row rather than competing for space
      // in the fields grid below.
      var roleField = field("Service grade", "line-field-role", roleSel);

      // Days is just a small number, so it sits outside the responsive grid
      // (which would otherwise stretch it to match the widest text field)
      // in its own fixed-width slot alongside it.
      var fieldsGrid = el("div", { class: "line-fields-row" }, [
        el("div", { class: "line-fields" }, [
          field("Phase", "line-field-phase", phaseSel),
          field("Service type", "line-field-servicetype", serviceTypeSel),
          field("Coverage", "line-field-coverage", coverageSel)
        ]),
        field("Days", "line-field-days", daysInput)
      ]);

      var titleField = field("Title", "line-field-title", titleInput);
      var descField = field("Description", "line-field-desc", descInput);

      var costDay = statChip("Cost / day", "cell-costday");
      var costTotal = statChip("Cost total", "cell-costtotal");
      var sellDay = statChip("Sell / day", "cell-sellday");
      var sellTotal = statChip("Sell total", "cell-selltotal");
      var margin = statChip("Margin", "cell-margin");
      costDay.valueEl.textContent = money(fig.costDay);
      costTotal.valueEl.textContent = money(fig.costTotal);
      sellDay.valueEl.textContent = money(fig.sellDay);
      sellTotal.valueEl.textContent = money(fig.sellTotal);
      margin.valueEl.textContent = money(fig.margin);
      margin.valueEl.classList.toggle("margin-negative", fig.margin < 0);

      var computed = el("div", { class: "line-computed" }, [
        costDay.chip, costTotal.chip, sellDay.chip, sellTotal.chip, margin.chip
      ]);

      card.appendChild(top);
      card.appendChild(roleField);
      card.appendChild(fieldsGrid);
      card.appendChild(titleField);
      card.appendChild(descField);
      card.appendChild(computed);

      body.appendChild(card);
    });
  }

  // Compact read-only view shown once a quote has been saved, so reviewing
  // a multi-line quote doesn't mean scrolling past a wall of edit cards.
  function renderLinesSummaryTable(container) {
    var table = el("table", { class: "summary-table line-summary-table" });
    var thead = el("tr", null, [
      el("th", { text: "Phase" }),
      el("th", { text: "Title" }),
      el("th", { text: "Service grade" }),
      el("th", { text: "Coverage" }),
      el("th", { text: "Days" }),
      el("th", { text: "Sell total" })
    ]);
    table.appendChild(el("thead", null, [thead]));

    var tbody = el("tbody");
    state.lines.forEach(function (line) {
      var role = ROLES[line.roleIndex] || ROLES[0];
      var fig = lineFigures(line);
      tbody.appendChild(el("tr", null, [
        el("td", { text: line.phase }),
        el("td", { text: line.title || "—" }),
        el("td", { text: role.name }),
        el("td", { text: COVERAGE[line.coverageIndex] || COVERAGE[0] }),
        el("td", { text: String(Number(line.days) || 0) }),
        el("td", { text: money(fig.sellTotal) })
      ]));
    });
    table.appendChild(tbody);

    container.appendChild(el("div", { class: "table-scroll" }, [table]));
  }

  // Updates only the computed stat values for one card, without touching the
  // input elements, so an in-progress edit (e.g. typing in the days field)
  // doesn't lose focus/cursor position on every keystroke.
  function updateRowComputed(card, line) {
    var fig = lineFigures(line);
    card.querySelector(".cell-costday").textContent = money(fig.costDay);
    card.querySelector(".cell-costtotal").textContent = money(fig.costTotal);
    card.querySelector(".cell-sellday").textContent = money(fig.sellDay);
    card.querySelector(".cell-selltotal").textContent = money(fig.sellTotal);
    var marginEl = card.querySelector(".cell-margin");
    marginEl.textContent = money(fig.margin);
    marginEl.classList.toggle("margin-negative", fig.margin < 0);
  }

  // Shared by the summary stat tiles and the payload sent to the save API,
  // so the two never drift out of sync.
  function computeTotals() {
    var totals = { days: 0, cost: 0, sell: 0, margin: 0 };
    state.lines.forEach(function (line) {
      var fig = lineFigures(line);
      totals.days += Number(line.days) || 0;
      totals.cost += fig.costTotal;
      totals.sell += fig.sellTotal;
    });
    totals.margin = totals.sell - totals.cost;
    return totals;
  }

  function renderSummary() {
    var totals = computeTotals();
    var byRole = {};

    state.lines.forEach(function (line) {
      var fig = lineFigures(line);
      var days = Number(line.days) || 0;
      var role = ROLES[line.roleIndex] || ROLES[0];
      if (!byRole[role.name]) byRole[role.name] = { days: 0, cost: 0, sell: 0 };
      byRole[role.name].days += days;
      byRole[role.name].cost += fig.costTotal;
      byRole[role.name].sell += fig.sellTotal;
    });

    var margin = totals.margin;
    var marginPct = totals.sell ? margin / totals.sell : 0;

    var grand = document.getElementById("grandStats");
    grand.innerHTML = "";
    [
      ["Total days", totals.days.toLocaleString("en-GB"), ""],
      ["Total cost", money(totals.cost), ""],
      ["Total sell", money(totals.sell), " stat-sell"],
      ["Total margin", money(margin), ""],
      ["% Margin", pct(marginPct), ""]
    ].forEach(function (row) {
      grand.appendChild(el("div", { class: "stat-tile" + row[2] }, [
        el("div", { class: "stat-label", text: row[0] }),
        el("div", { class: "stat-value", text: row[1] })
      ]));
    });

    var body = document.getElementById("roleSummaryBody");
    body.innerHTML = "";
    Object.keys(byRole).sort().forEach(function (name) {
      var r = byRole[name];
      if (!r.days && !r.cost && !r.sell) return;
      var m = r.sell - r.cost;
      var mp = r.sell ? m / r.sell : 0;
      var tr = document.createElement("tr");
      tr.appendChild(el("td", { text: name }));
      tr.appendChild(el("td", { text: r.days.toLocaleString("en-GB") }));
      tr.appendChild(el("td", { text: money(r.cost) }));
      tr.appendChild(el("td", { text: money(r.sell) }));
      tr.appendChild(el("td", { text: money(m) }));
      tr.appendChild(el("td", { text: pct(mp) }));
      body.appendChild(tr);
    });
  }

  function render() {
    renderMeta();
    renderLines();
    renderSummary();
  }

  function bindMeta() {
    var map = {
      metaCustomer: "customer",
      metaManager: "manager",
      metaOpportunity: "opportunity",
      metaPreparedBy: "preparedBy",
      metaVerifiedBy: "verifiedBy",
      metaDate: "date"
    };
    Object.keys(map).forEach(function (id) {
      document.getElementById(id).addEventListener("input", function (e) {
        state.meta[map[id]] = e.target.value;
        saveState();
      });
    });
  }

  function bindLines() {
    var body = document.getElementById("linesBody");

    body.addEventListener("input", function (e) {
      var fieldName = e.target.getAttribute("data-field");
      if (!fieldName) return;
      var card = e.target.closest(".line-card");
      var line = state.lines.find(function (l) { return String(l.id) === card.dataset.id; });
      if (!line) return;

      if (fieldName === "roleIndex" || fieldName === "coverageIndex") {
        line[fieldName] = Number(e.target.value);
      } else if (fieldName === "days") {
        line.days = Math.max(0, Number(e.target.value) || 0);
      } else {
        line[fieldName] = e.target.value;
      }

      saveState();
      if (fieldName === "roleIndex" || fieldName === "coverageIndex" || fieldName === "days") {
        updateRowComputed(card, line);
      }
      renderSummary();
    });

    body.addEventListener("click", function (e) {
      if (!e.target.classList.contains("btn-remove")) return;
      var card = e.target.closest(".line-card");
      state.lines = state.lines.filter(function (l) { return String(l.id) !== card.dataset.id; });
      if (state.lines.length === 0) state.lines.push(newLine());
      saveState();
      render();
    });

    document.getElementById("addLineBtn").addEventListener("click", function () {
      state.lines.push(newLine());
      saveState();
      render();
    });
  }

  function csvField(value) {
    var s = String(value == null ? "" : value);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function csvRow(values) {
    return values.map(csvField).join(",") + "\r\n";
  }

  function buildCsv() {
    var csv = "";
    csv += csvRow(["Customer", state.meta.customer]);
    csv += csvRow(["Client / account manager", state.meta.manager]);
    csv += csvRow(["Opportunity reference", state.meta.opportunity]);
    csv += csvRow(["Prepared by", state.meta.preparedBy]);
    csv += csvRow(["Verified by", state.meta.verifiedBy]);
    csv += csvRow(["Date", state.meta.date]);
    csv += "\r\n";

    csv += csvRow(["Phase", "Title", "Description", "Service grade", "Service type", "Coverage", "Days", "Cost/day", "Cost total", "Sell/day", "Sell total", "Margin"]);
    state.lines.forEach(function (line) {
      var role = ROLES[line.roleIndex] || ROLES[0];
      var fig = lineFigures(line);
      csv += csvRow([
        line.phase,
        line.title,
        line.description,
        role.name,
        line.serviceType,
        COVERAGE[line.coverageIndex] || COVERAGE[0],
        line.days,
        fig.costDay.toFixed(2),
        fig.costTotal.toFixed(2),
        fig.sellDay.toFixed(2),
        fig.sellTotal.toFixed(2),
        fig.margin.toFixed(2)
      ]);
    });

    var totals = computeTotals();

    csv += "\r\n";
    csv += csvRow(["Total", "", "", "", "", "", totals.days, "", totals.cost.toFixed(2), "", totals.sell.toFixed(2), totals.margin.toFixed(2)]);
    return csv;
  }

  function exportCsv() {
    var csv = buildCsv();
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var namePart = (state.meta.customer || "quote").trim().replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.href = url;
    a.download = "ps-quote-" + (namePart || "untitled") + "-" + state.meta.date + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- Server persistence (save/load across devices) --------------------
  // All requests go through nginx's /quote/api/ proxy, which sits behind
  // the same basic auth as the rest of the tool.
  var API_BASE = "api";

  function apiRequest(method, path, body) {
    var opts = { method: method, headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    // Backstop against the request just hanging (e.g. the api container is
    // down and something upstream isn't enforcing its own timeout) - without
    // this a broken backend leaves "Loading..." on screen indefinitely
    // instead of surfacing a clear error.
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 12000);
    opts.signal = controller.signal;

    return fetch(API_BASE + path, opts).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (err) {
          throw new Error(err.error || ("request failed (" + res.status + ")"));
        });
      }
      if (res.status === 204) return null;
      return res.json();
    }).catch(function (err) {
      if (err.name === "AbortError") {
        throw new Error("no response from the server - it may be down");
      }
      throw err;
    }).finally(function () {
      clearTimeout(timeout);
    });
  }

  function saveQuote() {
    var saveBtn = document.getElementById("saveBtn");
    var payload = { meta: state.meta, lines: state.lines, totals: computeTotals() };
    var request = state.id
      ? apiRequest("PUT", "/quotes/" + state.id, payload)
      : apiRequest("POST", "/quotes", payload);

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    request.then(function (result) {
      state.id = result.id;
      state.viewMode = "summary";
      saveState();
      render();
    }).catch(function (err) {
      alert("Couldn't save this quote - " + err.message);
    }).finally(function () {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    });
  }

  function formatDateTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
      " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  function openLoadModal() {
    var modal = document.getElementById("loadModal");
    var body = document.getElementById("loadModalBody");
    modal.hidden = false;
    body.innerHTML = "";
    body.appendChild(el("p", { class: "modal-status", text: "Loading saved quotes…" }));

    apiRequest("GET", "/quotes").then(function (rows) {
      body.innerHTML = "";
      if (!rows.length) {
        body.appendChild(el("p", { class: "modal-status", text: "No saved quotes yet." }));
        return;
      }
      rows.forEach(function (row) {
        var openBtn = el("button", { type: "button", class: "btn btn-primary btn-small" });
        openBtn.textContent = "Open";
        openBtn.addEventListener("click", function () { openQuoteById(row.id); });

        var deleteBtn = el("button", { type: "button", class: "btn btn-ghost btn-small" });
        deleteBtn.textContent = "Delete";

        var item = el("div", { class: "quote-list-item" }, [
          el("div", { class: "quote-list-main" }, [
            el("div", { class: "quote-list-title", text: row.customer || "(no customer name)" }),
            el("div", {
              class: "quote-list-sub",
              text: (row.opportunity ? row.opportunity + " · " : "") + "Updated " + formatDateTime(row.updatedAt)
            })
          ]),
          el("div", { class: "quote-list-figures" }, [
            el("div", { class: "quote-list-sell", text: money(row.totalSell) }),
            el("div", { class: "quote-list-days", text: row.totalDays + " days" })
          ]),
          el("div", { class: "quote-list-actions" }, [openBtn, deleteBtn])
        ]);
        deleteBtn.addEventListener("click", function () { deleteQuoteById(row.id, item); });

        body.appendChild(item);
      });
    }).catch(function (err) {
      body.innerHTML = "";
      body.appendChild(el("p", { class: "modal-status", text: "Couldn't load saved quotes - " + err.message }));
    });
  }

  function closeLoadModal() {
    document.getElementById("loadModal").hidden = true;
  }

  function openQuoteById(id) {
    apiRequest("GET", "/quotes/" + id).then(function (quote) {
      state = {
        id: quote.id,
        viewMode: "summary",
        meta: quote.meta,
        lines: quote.lines
      };
      nextLineId = state.lines.reduce(function (max, l) { return Math.max(max, l.id); }, 0) + 1;
      saveState();
      closeLoadModal();
      render();
    }).catch(function (err) {
      alert("Couldn't open that quote - " + err.message);
    });
  }

  function deleteQuoteById(id, itemEl) {
    if (!confirm("Delete this saved quote? This can't be undone.")) return;
    apiRequest("DELETE", "/quotes/" + id).then(function () {
      itemEl.remove();
      if (state.id === id) {
        // The open quote was just deleted server-side - drop its id so a
        // future Save creates a new record instead of PUTting to nothing.
        state.id = null;
        saveState();
      }
    }).catch(function (err) {
      alert("Couldn't delete that quote - " + err.message);
    });
  }

  function bindTopbar() {
    document.getElementById("printBtn").addEventListener("click", function () {
      window.print();
    });

    document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
    document.getElementById("saveBtn").addEventListener("click", saveQuote);
    document.getElementById("editBtn").addEventListener("click", function () {
      state.viewMode = "edit";
      saveState();
      render();
    });

    document.getElementById("loadQuotesBtn").addEventListener("click", openLoadModal);
    document.getElementById("loadModalClose").addEventListener("click", closeLoadModal);
    document.getElementById("loadModal").addEventListener("click", function (e) {
      if (e.target.id === "loadModal") closeLoadModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeLoadModal();
    });

    document.getElementById("newQuoteBtn").addEventListener("click", function () {
      if (!confirm("Start a new quote? This clears the current quote details and line items.")) return;
      state = blankQuote();
      saveState();
      render();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindMeta();
    bindLines();
    bindTopbar();
    render();
  });
})();

(function () {
  "use strict";

  // Role name -> [dayCost, dayCost] cost and sell rates for each coverage type.
  // Sourced from the "Variables" tab of the FY27 PS Quote workbook.
  // cost/sell arrays are [Standard 9am-5pm, Evening/Saturday, Sunday/Holiday]
  var ROLES = [
    { name: "Enterprise Architect", cost: [791, 988.75, 1186.5], sell: [1550, 1937.5, 2325] },
    { name: "Automation Architect", cost: [749, 936.25, 1123.5], sell: [1550, 2325, 3100] },
    { name: "Programme Manager", cost: [881, 1101.25, 1321.5], sell: [1250, 1875, 2500] },
    { name: "Service Architect", cost: [817, 1021.25, 1225.5], sell: [1250, 1875, 2500] },
    { name: "Automation Consultant", cost: [523, 653.75, 784.5], sell: [1100, 1650, 2200] },
    { name: "Process Consultant", cost: [463, 578.75, 694.5], sell: [1100, 1650, 2200] },
    { name: "Solution Architect", cost: [729, 911.25, 1093.5], sell: [1250, 1875, 2500] },
    { name: "Principal Service Delivery Manager", cost: [696, 870, 1044], sell: [750, 1125, 1500] },
    { name: "Senior Project Manager", cost: [638, 797.5, 957], sell: [950, 1425, 1900] },
    { name: "Network Consultant", cost: [664, 830, 996], sell: [950, 1425, 1900] },
    { name: "Microsoft/Platforms Consultant", cost: [554, 692.5, 831], sell: [950, 1425, 1900] },
    { name: "Project Manager", cost: [494, 617.5, 741], sell: [850, 1275, 1700] },
    { name: "Service Delivery Manager", cost: [477, 596.25, 715.5], sell: [1000, 1500, 2000] },
    { name: "Network Engineer", cost: [420, 525, 630], sell: [850, 1275, 1700] },
    { name: "Wireless Survey Consultant", cost: [455, 568.75, 682.5], sell: [850, 1275, 1700] },
    { name: "Field Service Engineer (Centrex)", cost: [343, 428.75, 514.5], sell: [750, 1125, 1500] },
    { name: "PMO/Project Co ordinator", cost: [349, 436.25, 523.5], sell: [450, 675, 900] },
    { name: "Cyber Security Architect", cost: [862, 1077.5, 1293], sell: [450, 675, 900] },
    { name: "Cyber Security Analyst", cost: [603, 753.75, 904.5], sell: [1500, 2250, 3000] },
    { name: "SDE Consultant", cost: [467, 583.75, 700.5], sell: [1250, 1875, 2500] },
    { name: "Service Delivery Executive", cost: [300, 375, 450], sell: [450, 675, 900] },
    { name: "Service Operations Manager", cost: [428, 535, 642], sell: [600, 900, 1200] },
    { name: "Field Service Engineer (Non-Centrex)", cost: [288, 360, 432], sell: [450, 675, 900] },
    { name: "Monitoring Specialist", cost: [586, 732.5, 879], sell: [850, 1275, 1700] },
    { name: "Third-Party (manual pricing)", cost: [0, 0, 0], sell: [0, 0, 0] }
  ];

  var PHASES = ["Assess", "Design", "Transform", "Operate", "Supplementary"];
  var COVERAGE = ["Standard (9am-5pm)", "Evening / Saturday", "Sunday / Holiday"];
  var SERVICE_TYPES = [
    "Hardware", "Modern Work", "Network Services", "Cloud Services",
    "Connected Networking", "Infrastructure Services", "Secure Enterprise",
    "Service Delivery", "Other"
  ];

  // v2: fixes a bug where the phase dropdown stored its numeric option index
  // instead of the phase name, corrupting saved quotes. Bumped so anyone who
  // hit that bug starts from a clean slate rather than re-loading bad data.
  var STORAGE_KEY = "ps-quote-builder-v2";

  var nextLineId = 1;

  function todayISO() {
    var d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function newLine() {
    return {
      id: nextLineId++,
      phase: PHASES[0],
      description: "",
      roleIndex: 0,
      serviceType: SERVICE_TYPES[0],
      coverageIndex: 0,
      days: 0
    };
  }

  var state = loadState() || {
    meta: { customer: "", manager: "", opportunity: "", preparedBy: "", verifiedBy: "", date: todayISO() },
    lines: [newLine()]
  };

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

  function renderLines() {
    var body = document.getElementById("linesBody");
    body.innerHTML = "";

    state.lines.forEach(function (line) {
      var fig = lineFigures(line);
      var tr = document.createElement("tr");
      tr.dataset.id = line.id;

      var phaseSel = el("select", { "data-field": "phase" }, optionListByValue(PHASES, line.phase));
      var descInput = el("input", { type: "text", "data-field": "description", placeholder: "e.g. Discovery workshop", value: line.description });
      var roleSel = el("select", { "data-field": "roleIndex" }, optionList(ROLES.map(function (r) { return r.name; }), line.roleIndex));
      var serviceTypeSel = el("select", { "data-field": "serviceType" }, optionListByValue(SERVICE_TYPES, line.serviceType));
      var coverageSel = el("select", { "data-field": "coverageIndex" }, optionList(COVERAGE, line.coverageIndex));
      var daysInput = el("input", { type: "number", min: "0", step: "0.5", "data-field": "days", value: line.days });

      tr.appendChild(el("td", { class: "col-phase" }, [phaseSel]));
      tr.appendChild(el("td", { class: "col-desc" }, [descInput]));
      tr.appendChild(el("td", { class: "col-role" }, [roleSel]));
      tr.appendChild(el("td", { class: "col-servicetype" }, [serviceTypeSel]));
      tr.appendChild(el("td", { class: "col-daytype" }, [coverageSel]));
      tr.appendChild(el("td", { class: "col-days" }, [daysInput]));
      tr.appendChild(el("td", { class: "col-money computed cell-costday", text: money(fig.costDay) }));
      tr.appendChild(el("td", { class: "col-money computed cell-costtotal", text: money(fig.costTotal) }));
      tr.appendChild(el("td", { class: "col-money computed cell-sellday", text: money(fig.sellDay) }));
      tr.appendChild(el("td", { class: "col-money computed cell-selltotal", text: money(fig.sellTotal) }));

      var marginCell = el("td", { class: "col-money computed cell-margin" + (fig.margin < 0 ? " margin-negative" : ""), text: money(fig.margin) });
      tr.appendChild(marginCell);

      var removeBtn = el("button", { type: "button", class: "btn-remove", "aria-label": "Remove line" });
      removeBtn.textContent = "×";
      tr.appendChild(el("td", { class: "col-remove" }, [removeBtn]));

      body.appendChild(tr);
    });
  }

  // Updates only the computed money cells for one row, without touching the
  // input elements, so an in-progress edit (e.g. typing in the days field)
  // doesn't lose focus/cursor position on every keystroke.
  function updateRowComputed(tr, line) {
    var fig = lineFigures(line);
    tr.querySelector(".cell-costday").textContent = money(fig.costDay);
    tr.querySelector(".cell-costtotal").textContent = money(fig.costTotal);
    tr.querySelector(".cell-sellday").textContent = money(fig.sellDay);
    tr.querySelector(".cell-selltotal").textContent = money(fig.sellTotal);
    var marginCell = tr.querySelector(".cell-margin");
    marginCell.textContent = money(fig.margin);
    marginCell.classList.toggle("margin-negative", fig.margin < 0);
  }

  function renderSummary() {
    var totals = { days: 0, cost: 0, sell: 0 };
    var byRole = {};

    state.lines.forEach(function (line) {
      var fig = lineFigures(line);
      var days = Number(line.days) || 0;
      totals.days += days;
      totals.cost += fig.costTotal;
      totals.sell += fig.sellTotal;

      var role = ROLES[line.roleIndex] || ROLES[0];
      if (!byRole[role.name]) byRole[role.name] = { days: 0, cost: 0, sell: 0 };
      byRole[role.name].days += days;
      byRole[role.name].cost += fig.costTotal;
      byRole[role.name].sell += fig.sellTotal;
    });

    var margin = totals.sell - totals.cost;
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
      var field = e.target.getAttribute("data-field");
      if (!field) return;
      var tr = e.target.closest("tr");
      var line = state.lines.find(function (l) { return String(l.id) === tr.dataset.id; });
      if (!line) return;

      if (field === "roleIndex" || field === "coverageIndex") {
        line[field] = Number(e.target.value);
      } else if (field === "days") {
        line.days = Math.max(0, Number(e.target.value) || 0);
      } else {
        line[field] = e.target.value;
      }

      saveState();
      if (field === "roleIndex" || field === "coverageIndex" || field === "days") {
        updateRowComputed(tr, line);
      }
      renderSummary();
    });

    body.addEventListener("click", function (e) {
      if (!e.target.classList.contains("btn-remove")) return;
      var tr = e.target.closest("tr");
      state.lines = state.lines.filter(function (l) { return String(l.id) !== tr.dataset.id; });
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

    csv += csvRow(["Phase", "Work package description", "Service grade", "Service type", "Coverage", "Days", "Cost/day", "Cost total", "Sell/day", "Sell total", "Margin"]);
    state.lines.forEach(function (line) {
      var role = ROLES[line.roleIndex] || ROLES[0];
      var fig = lineFigures(line);
      csv += csvRow([
        line.phase,
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

    var totals = state.lines.reduce(function (acc, line) {
      var fig = lineFigures(line);
      acc.days += Number(line.days) || 0;
      acc.cost += fig.costTotal;
      acc.sell += fig.sellTotal;
      return acc;
    }, { days: 0, cost: 0, sell: 0 });
    var margin = totals.sell - totals.cost;

    csv += "\r\n";
    csv += csvRow(["Total", "", "", "", "", totals.days, "", totals.cost.toFixed(2), "", totals.sell.toFixed(2), margin.toFixed(2)]);
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

  function bindTopbar() {
    document.getElementById("printBtn").addEventListener("click", function () {
      window.print();
    });

    document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);

    document.getElementById("newQuoteBtn").addEventListener("click", function () {
      if (!confirm("Start a new quote? This clears the current quote details and line items.")) return;
      state = {
        meta: { customer: "", manager: "", opportunity: "", preparedBy: "", verifiedBy: "", date: todayISO() },
        lines: [newLine()]
      };
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

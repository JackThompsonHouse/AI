(function () {
  "use strict";

  var API_BASE = "api";
  var state = { transcript: "", data: null, sowId: null, docxFilename: null };

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

  function apiRequest(method, path, body) {
    var opts = { method: method, headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 60000); // extraction can take a while
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
      if (err.name === "AbortError") throw new Error("no response from the server - it may be down");
      throw err;
    }).finally(function () { clearTimeout(timeout); });
  }

  // ---- panel switching ----
  function showPanel(name) {
    document.getElementById("inputPanel").hidden = name !== "input";
    document.getElementById("reviewPanel").hidden = name !== "review";
    document.getElementById("resultPanel").hidden = name !== "result";
  }

  // ---- field builders (bind directly into the given object, no separate
  // "collect form" step needed at submit time) ----
  function isTBC(v) { return v === "TBC" || v === "" || v == null; }

  function textField(labelText, obj, key, multiline) {
    var value = obj[key] == null ? "" : obj[key];
    var input = el(multiline ? "textarea" : "input", { "data-bind": key });
    if (!multiline) input.setAttribute("type", "text");
    input.value = value;
    var wrap = el("label", { class: "field" + (isTBC(value) ? " field-tbc" : "") }, [
      el("span", { text: labelText + (isTBC(value) ? " (TBC)" : "") }),
      input,
    ]);
    input.addEventListener("input", function () {
      obj[key] = input.value;
      wrap.classList.toggle("field-tbc", isTBC(input.value));
      wrap.querySelector("span").textContent = labelText + (isTBC(input.value) ? " (TBC)" : "");
    });
    return wrap;
  }

  function numberField(labelText, obj, key) {
    var input = el("input", { type: "number", step: "any", "data-bind": key });
    input.value = obj[key] == null ? "" : obj[key];
    input.addEventListener("input", function () {
      obj[key] = input.value === "" ? 0 : Number(input.value);
    });
    return el("label", { class: "field" }, [el("span", { text: labelText }), input]);
  }

  function selectField(labelText, obj, key, options) {
    var select = el("select", { "data-bind": key });
    options.forEach(function (opt) {
      var o = el("option", { value: opt.value, text: opt.label });
      if (obj[key] === opt.value) o.setAttribute("selected", "selected");
      select.appendChild(o);
    });
    select.addEventListener("change", function () { obj[key] = select.value; });
    return el("label", { class: "field" }, [el("span", { text: labelText }), select]);
  }

  function checkboxField(labelText, obj, key) {
    var input = el("input", { type: "checkbox" });
    input.checked = !!obj[key];
    input.style.width = "auto";
    input.addEventListener("change", function () { obj[key] = input.checked; });
    return el("label", { class: "toggle-row" }, [input, el("span", { text: labelText })]);
  }

  function section(titleText, contentEls) {
    return el("div", {}, [el("h3", { class: "subhead", text: titleText })].concat(contentEls));
  }

  // ---- repeatable list of plain strings (customerAssumptions) ----
  function stringListField(titleText, arr, onChange) {
    var container = el("div", { class: "repeat-list" });
    function renderRows() {
      container.innerHTML = "";
      arr.forEach(function (val, i) {
        var input = el("input", { type: "text", value: val });
        input.addEventListener("input", function () { arr[i] = input.value; });
        var removeBtn = el("button", { type: "button", class: "btn-remove-row", "aria-label": "Remove" });
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", function () {
          arr.splice(i, 1);
          renderRows();
        });
        container.appendChild(el("div", { class: "repeat-row" }, [
          el("div", { class: "repeat-row-top" }, [
            el("span", { class: "repeat-row-index", text: "Item " + (i + 1) }),
            removeBtn,
          ]),
          input,
        ]));
      });
    }
    renderRows();
    var addBtn = el("button", { type: "button", class: "btn btn-ghost btn-small" });
    addBtn.textContent = "+ Add";
    addBtn.addEventListener("click", function () {
      arr.push("");
      renderRows();
    });
    return el("div", {}, [el("h3", { class: "subhead", text: titleText }), container, addBtn]);
  }

  // ---- repeatable list of objects (milestones, pricing lines, cost lines) ----
  function repeatableObjectField(titleText, arr, fieldDefs, makeBlank) {
    var container = el("div", { class: "repeat-list" });
    function renderRows() {
      container.innerHTML = "";
      arr.forEach(function (item, i) {
        var removeBtn = el("button", { type: "button", class: "btn-remove-row", "aria-label": "Remove" });
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", function () {
          arr.splice(i, 1);
          renderRows();
        });
        var fieldsGrid = el("div", { class: "repeat-row-fields" });
        fieldDefs.forEach(function (def) {
          fieldsGrid.appendChild(def.type === "number" ? numberField(def.label, item, def.key) : textField(def.label, item, def.key, false));
        });
        container.appendChild(el("div", { class: "repeat-row" }, [
          el("div", { class: "repeat-row-top" }, [
            el("span", { class: "repeat-row-index", text: "Row " + (i + 1) }),
            removeBtn,
          ]),
          fieldsGrid,
        ]));
      });
    }
    renderRows();
    var addBtn = el("button", { type: "button", class: "btn btn-ghost btn-small" });
    addBtn.textContent = "+ Add row";
    addBtn.addEventListener("click", function () {
      arr.push(makeBlank());
      renderRows();
    });
    return el("div", {}, [el("h3", { class: "subhead", text: titleText }), container, addBtn]);
  }

  // ---- full review form ----
  function renderReviewForm(data) {
    var container = document.getElementById("reviewForm");
    container.innerHTML = "";

    data.rocServices = data.rocServices || {};
    data.rocServices.milestones = Array.isArray(data.rocServices.milestones) ? data.rocServices.milestones : [];
    data.rocServices.customerAssumptions = Array.isArray(data.rocServices.customerAssumptions) ? data.rocServices.customerAssumptions : [];
    data.serviceOverview = data.serviceOverview || { include: false };
    data.commercialSummary = data.commercialSummary || {};
    data.commercialSummary.serviceLineItems = Array.isArray(data.commercialSummary.serviceLineItems) ? data.commercialSummary.serviceLineItems : [];
    data.commercialSummary.managedServiceUplift = data.commercialSummary.managedServiceUplift || {};
    data.commercialSummary.azureCostEstimate = Array.isArray(data.commercialSummary.azureCostEstimate) ? data.commercialSummary.azureCostEstimate : [];
    data.commercialSummary.ongoingAnnualCosts = Array.isArray(data.commercialSummary.ongoingAnnualCosts) ? data.commercialSummary.ongoingAnnualCosts : [];

    container.appendChild(section("Document details", [
      el("div", { class: "field-grid" }, [
        textField("Proposal title", data.documentInfo, "proposalTitle", false),
        textField("Client name", data.documentInfo, "clientName", false),
        textField("Project name", data.documentInfo, "projectName", false),
        textField("Document author", data.documentInfo, "documentAuthor", false),
        textField("Proposal reference", data.documentInfo, "proposalReference", false),
        textField("Contact name", data.documentInfo, "contactName", false),
        textField("Contact phone", data.documentInfo, "contactPhone", false),
        textField("Contact email", data.documentInfo, "contactEmail", false),
      ]),
    ]));

    container.appendChild(section("Executive summary", [
      textField("Background & context", data.executiveSummary, "backgroundAndContext", true),
      textField("Next steps", data.executiveSummary, "nextSteps", true),
    ]));

    container.appendChild(section("Current environment & requirements", [
      textField("Current environment overview", data.currentEnvironment, "overview", true),
      textField("Current services overview", data.currentEnvironment, "currentServicesOverview", true),
      textField("Requirements summary", data.currentEnvironment, "requirementsSummary", true),
    ]));

    container.appendChild(section("Solution summary", [
      textField("Solution overview", data.solutionSummary, "overview", true),
      textField("Solution components", data.solutionSummary, "components", true),
    ]));

    container.appendChild(section("Roc services", [
      textField("Engagement approach", data.rocServices, "engagementApproach", true),
      textField("Service transition", data.rocServices, "serviceTransition", true),
      selectField("Pricing basis", data.rocServices, "pricingBasis", [
        { value: "milestone", label: "Milestone-based" },
        { value: "time_and_materials", label: "Time & materials" },
      ]),
    ]));
    container.appendChild(repeatableObjectField(
      "Milestones (only used if pricing basis is milestone-based)",
      data.rocServices.milestones,
      [{ label: "Name", key: "name" }, { label: "Completion date", key: "completionDate" }, { label: "% charge", key: "percentCharge" }],
      function () { return { name: "", completionDate: "TBD", percentCharge: "" }; }
    ));
    container.appendChild(stringListField(
      "Deal-specific assumptions (added to the standard list)",
      data.rocServices.customerAssumptions
    ));

    container.appendChild(section("Service overview (optional section)", [
      checkboxField("Include a Service Overview section in the document", data.serviceOverview, "include"),
      textField("Service quality", data.serviceOverview, "serviceQuality", true),
      textField("ITIL services", data.serviceOverview, "itilServices", true),
      textField("Technology management", data.serviceOverview, "technologyManagement", true),
    ]));

    container.appendChild(section("Commercial summary", [
      textField("Quote reference", data.commercialSummary, "quoteReference", false),
    ]));
    container.appendChild(repeatableObjectField(
      "Service line items (resource/milestone, rate, quantity, total - numbers only, no £ sign)",
      data.commercialSummary.serviceLineItems,
      [
        { label: "Label", key: "label" }, { label: "Rate", key: "rate", type: "number" },
        { label: "Quantity", key: "quantity", type: "number" }, { label: "Total", key: "total", type: "number" },
      ],
      function () { return { label: "", rate: 0, quantity: 1, total: 0 }; }
    ));
    container.appendChild(section("Managed service uplift (leave blank if not applicable)", [
      el("div", { class: "field-grid" }, [
        textField("Description", data.commercialSummary.managedServiceUplift, "description", false),
        numberField("Total", data.commercialSummary.managedServiceUplift, "total"),
      ]),
    ]));
    container.appendChild(repeatableObjectField(
      "Azure cost estimate (leave empty if not applicable)",
      data.commercialSummary.azureCostEstimate,
      [
        { label: "Description", key: "description" }, { label: "Each", key: "each", type: "number" },
        { label: "Quantity", key: "quantity", type: "number" }, { label: "Monthly", key: "monthly", type: "number" },
        { label: "Annual", key: "annual", type: "number" },
      ],
      function () { return { description: "", each: 0, quantity: 1, monthly: 0, annual: 0 }; }
    ));
    container.appendChild(repeatableObjectField(
      "Ongoing annual costs (leave empty if not applicable)",
      data.commercialSummary.ongoingAnnualCosts,
      [
        { label: "Description", key: "description" }, { label: "Each", key: "each", type: "number" },
        { label: "Quantity", key: "quantity", type: "number" }, { label: "Annual", key: "annual", type: "number" },
      ],
      function () { return { description: "", each: 0, quantity: 1, annual: 0 }; }
    ));
  }

  // ---- Step 1: extract ----
  function setExtractLoading(loading) {
    document.getElementById("extractStatus").hidden = !loading;
    document.getElementById("generateBtn").disabled = loading;
  }

  function onGenerate() {
    var textarea = document.getElementById("transcriptInput");
    var transcript = textarea.value.trim();
    var errorBox = document.getElementById("extractError");
    errorBox.hidden = true;
    if (!transcript) {
      errorBox.textContent = "Please paste a transcript or requirements first.";
      errorBox.hidden = false;
      return;
    }
    state.transcript = transcript;
    setExtractLoading(true);
    apiRequest("POST", "/extract", { transcript: transcript }).then(function (result) {
      state.data = result.data;
      state.sowId = null;
      renderReviewForm(state.data);
      showPanel("review");
    }).catch(function (err) {
      errorBox.textContent = "Couldn't extract details - " + err.message;
      errorBox.hidden = false;
    }).finally(function () {
      setExtractLoading(false);
    });
  }

  // ---- Step 2 -> 3: generate document ----
  function setAssembleLoading(loading) {
    document.getElementById("assembleStatus").hidden = !loading;
    document.getElementById("generateDocBtn").disabled = loading;
  }

  function onGenerateDocument() {
    var errorBox = document.getElementById("assembleError");
    errorBox.hidden = true;
    setAssembleLoading(true);
    apiRequest("POST", "/generate", { transcript: state.transcript, data: state.data }).then(function (result) {
      state.sowId = result.id;
      state.docxFilename = result.filename;
      document.getElementById("resultTitle").textContent =
        (state.data.documentInfo.proposalTitle || "Proposal") + " — ready to download";
      document.getElementById("resultSub").textContent =
        (state.data.documentInfo.clientName || "") + " · generated " + new Date(result.createdAt).toLocaleString("en-GB");
      document.getElementById("downloadLink").href = API_BASE + "/documents/" + result.id + "/download";
      showPanel("result");
    }).catch(function (err) {
      errorBox.textContent = "Couldn't generate the document - " + err.message;
      errorBox.hidden = false;
    }).finally(function () {
      setAssembleLoading(false);
    });
  }

  // ---- My SOWs modal ----
  function formatDateTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
      " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  function openListModal() {
    var modal = document.getElementById("listModal");
    var body = document.getElementById("listModalBody");
    modal.hidden = false;
    body.innerHTML = "";
    body.appendChild(el("p", { class: "modal-status", text: "Loading saved SOWs…" }));

    apiRequest("GET", "/documents").then(function (rows) {
      body.innerHTML = "";
      if (!rows.length) {
        body.appendChild(el("p", { class: "modal-status", text: "No SOWs generated yet." }));
        return;
      }
      rows.forEach(function (row) {
        var downloadBtn = el("a", { class: "btn btn-primary btn-small", href: API_BASE + "/documents/" + row.id + "/download" });
        downloadBtn.textContent = "Download";

        var deleteBtn = el("button", { type: "button", class: "btn btn-ghost btn-small" });
        deleteBtn.textContent = "Delete";

        var item = el("div", { class: "sow-list-item" }, [
          el("div", { class: "sow-list-main" }, [
            el("div", { class: "sow-list-title", text: row.proposalTitle || row.clientName || "(untitled)" }),
            el("div", { class: "sow-list-sub", text: (row.clientName ? row.clientName + " · " : "") + "Generated " + formatDateTime(row.createdAt) }),
          ]),
          el("div", { class: "sow-list-actions" }, [downloadBtn, deleteBtn]),
        ]);
        deleteBtn.addEventListener("click", function () {
          if (!confirm("Delete this generated SOW? This can't be undone.")) return;
          apiRequest("DELETE", "/documents/" + row.id).then(function () {
            item.remove();
          }).catch(function (err) {
            alert("Couldn't delete - " + err.message);
          });
        });
        body.appendChild(item);
      });
    }).catch(function (err) {
      body.innerHTML = "";
      body.appendChild(el("p", { class: "modal-status", text: "Couldn't load saved SOWs - " + err.message }));
    });
  }

  function closeListModal() {
    document.getElementById("listModal").hidden = true;
  }

  function startOver() {
    state = { transcript: "", data: null, sowId: null, docxFilename: null };
    document.getElementById("transcriptInput").value = "";
    document.getElementById("extractError").hidden = true;
    document.getElementById("assembleError").hidden = true;
    showPanel("input");
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("generateBtn").addEventListener("click", onGenerate);
    document.getElementById("backToInputBtn").addEventListener("click", function () { showPanel("input"); });
    document.getElementById("generateDocBtn").addEventListener("click", onGenerateDocument);
    document.getElementById("startOverBtn").addEventListener("click", startOver);
    document.getElementById("startOverTopBtn").addEventListener("click", startOver);

    document.getElementById("listBtn").addEventListener("click", openListModal);
    document.getElementById("listModalClose").addEventListener("click", closeListModal);
    document.getElementById("listModal").addEventListener("click", function (e) {
      if (e.target.id === "listModal") closeListModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeListModal();
    });

    showPanel("input");
  });
})();

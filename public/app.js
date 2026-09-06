(function () {
  "use strict";

  var PALETTE = ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"];
  var IDENTITY_KEY = "roommateLedger_identities_v1";
  var RECENTS_KEY = "roommateLedger_recentGroups_v1";

  var app = document.getElementById("app");

  // ---------- storage ----------
  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }
  function getIdentity(groupId) {
    return loadJSON(IDENTITY_KEY, {})[groupId] || null;
  }
  function setIdentity(groupId, person) {
    var all = loadJSON(IDENTITY_KEY, {});
    all[groupId] = person;
    saveJSON(IDENTITY_KEY, all);
  }
  function clearIdentity(groupId) {
    var all = loadJSON(IDENTITY_KEY, {});
    delete all[groupId];
    saveJSON(IDENTITY_KEY, all);
  }
  function rememberGroup(groupId, name) {
    var recents = loadJSON(RECENTS_KEY, []);
    recents = recents.filter(function (g) { return g.id !== groupId; });
    recents.unshift({ id: groupId, name: name });
    saveJSON(RECENTS_KEY, recents.slice(0, 10));
  }
  function forgetGroup(groupId) {
    var recents = loadJSON(RECENTS_KEY, []).filter(function (g) { return g.id !== groupId; });
    saveJSON(RECENTS_KEY, recents);
    clearIdentity(groupId);
  }

  // ---------- api ----------
  function api(path, opts) {
    opts = opts || {};
    var fetchOpts = { method: opts.method || "GET", headers: {} };
    if (opts.body) {
      fetchOpts.headers["Content-Type"] = "application/json";
      fetchOpts.body = JSON.stringify(opts.body);
    }
    return fetch("/api" + path, fetchOpts).then(function (res) {
      if (res.status === 204) return null;
      return res.json().then(
        function (data) {
          if (!res.ok) throw new Error((data && data.error) || res.statusText);
          return data;
        },
        function () {
          if (!res.ok) throw new Error(res.statusText);
          return null;
        }
      );
    });
  }

  function colorFor(personId, members) {
    var idx = members.findIndex(function (m) { return m.id === personId; });
    return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length];
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmt(cents, currency) {
    var neg = cents < 0;
    var v = Math.abs(cents) / 100;
    return (neg ? "-" : "") + currency + v.toFixed(2);
  }

  // ---------- routing ----------
  function currentGroupId() {
    var params = new URLSearchParams(location.search);
    return params.get("group");
  }
  function goToGroup(groupId) {
    location.search = "?group=" + encodeURIComponent(groupId);
  }
  function goHome() {
    location.search = "";
  }

  // ---------- boot ----------
  function boot() {
    var groupId = currentGroupId();
    if (!groupId) return renderHome();
    fetchGroupAndRender(groupId);
  }

  function fetchGroupAndRender(groupId) {
    app.innerHTML = '<p class="empty-note" style="padding-top:3rem;text-align:center;">Loading...</p>';
    api("/groups/" + groupId)
      .then(function (group) {
        rememberGroup(group.id, group.name);
        var identity = getIdentity(group.id);
        if (identity && group.members.some(function (m) { return m.id === identity.personId; })) {
          renderDashboard(group, identity);
        } else {
          renderJoinPrompt(group);
        }
      })
      .catch(function (err) {
        renderNotFound(err);
      });
  }

  // ---------- home view ----------
  function renderHome() {
    var recents = loadJSON(RECENTS_KEY, []);
    app.innerHTML =
      '<header class="page"><h1>Roommate Ledger</h1></header>' +
      '<section class="card">' +
      '<div class="section-label">Create a group</div>' +
      '<div class="field"><label>Group name</label><input id="createName" placeholder="Apartment 4B"></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>Currency</label><select id="createCurrency">' +
      '<option value="$">$ - Dollar</option>' +
      '<option value="&euro;">&euro; - Euro</option>' +
      '<option value="&pound;">&pound; - Pound</option>' +
      '<option value="&#8377;">&#8377; - Rupee</option>' +
      '<option value="&yen;">&yen; - Yen</option>' +
      '<option value="&#8361;">&#8361; - Won</option>' +
      '<option value="Fr">Fr - Franc</option>' +
      "</select></div>" +
      '<div class="field"><label>PIN (optional)</label><input id="createPin" placeholder="Leave blank for none"></div>' +
      "</div>" +
      '<button class="btn primary" id="createBtn">Create group</button>' +
      '<div class="error-text" id="createError"></div>' +
      "</section>" +
      '<section class="card">' +
      '<div class="section-label">Join a group</div>' +
      '<div class="field"><label>Group link or ID</label><input id="joinId" placeholder="Paste the link a roommate sent you"></div>' +
      '<button class="btn" id="joinBtn">Open group</button>' +
      "</section>" +
      (recents.length
        ? '<section class="card"><div class="section-label">Recent groups</div><div class="settle-list">' +
          recents
            .map(function (g) {
              return (
                '<div class="settle-row"><span class="who">' +
                escapeHtml(g.name) +
                '</span><button class="btn small" data-open="' +
                g.id +
                '">Open</button></div>'
              );
            })
            .join("") +
          "</div></section>"
        : "") +
      '<footer class="note">Self-hosted, no cloud account. Data lives on this server only.</footer>';

    document.getElementById("createBtn").addEventListener("click", function () {
      var name = document.getElementById("createName").value.trim();
      var currency = document.getElementById("createCurrency").value.trim() || "$";
      var pin = document.getElementById("createPin").value.trim();
      if (!name) {
        document.getElementById("createError").textContent = "Group name is required.";
        return;
      }
      api("/groups", { method: "POST", body: { name: name, currency: currency, pin: pin || undefined } })
        .then(function (group) {
          goToGroup(group.id);
        })
        .catch(function (err) {
          document.getElementById("createError").textContent = err.message;
        });
    });

    document.getElementById("joinBtn").addEventListener("click", function () {
      var input = document.getElementById("joinId").value.trim();
      if (!input) return;
      var match = input.match(/[?&]group=([^&]+)/);
      var groupId = match ? decodeURIComponent(match[1]) : input;
      goToGroup(groupId);
    });

    app.querySelectorAll("[data-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        goToGroup(btn.dataset.open);
      });
    });
  }

  function renderNotFound() {
    app.innerHTML =
      '<header class="page"><h1>Roommate Ledger</h1></header>' +
      '<section class="card"><div class="section-label">Group not found</div>' +
      '<p class="empty-note">That link doesn\'t match a group on this server.</p>' +
      '<button class="btn" id="backHome">Back home</button></section>';
    document.getElementById("backHome").addEventListener("click", goHome);
  }

  // ---------- join / identity prompt ----------
  function renderJoinPrompt(group) {
    app.innerHTML =
      '<header class="page"><h1>' +
      escapeHtml(group.name) +
      "</h1></header>" +
      '<section class="card">' +
      '<div class="section-label">Who are you?</div>' +
      '<div class="member-picker">' +
      group.members
        .map(function (m) {
          return '<button data-pick="' + m.id + '" data-name="' + escapeHtml(m.name) + '">' + escapeHtml(m.name) + "</button>";
        })
        .join("") +
      "</div>" +
      '<div class="field"><label>Or type your name</label><input id="joinName" placeholder="Your name"></div>' +
      (group.has_pin ? '<div class="field"><label>Group PIN</label><input id="joinPin" type="password"></div>' : "") +
      '<button class="btn primary" id="joinConfirm">Continue</button>' +
      '<div class="error-text" id="joinError"></div>' +
      "</section>";

    function doJoin(name) {
      if (!name) return;
      var pin = group.has_pin ? document.getElementById("joinPin").value : undefined;
      api("/groups/" + group.id + "/join", { method: "POST", body: { name: name, pin: pin } })
        .then(function (res) {
          setIdentity(group.id, { personId: res.person.id, name: res.person.name });
          fetchGroupAndRender(group.id);
        })
        .catch(function (err) {
          document.getElementById("joinError").textContent = err.message;
        });
    }

    app.querySelectorAll("[data-pick]").forEach(function (btn) {
      btn.addEventListener("click", function () { doJoin(btn.dataset.name); });
    });
    document.getElementById("joinConfirm").addEventListener("click", function () {
      doJoin(document.getElementById("joinName").value.trim());
    });
  }

  // ---------- dashboard ----------
  function renderDashboard(group, identity) {
    var shareUrl = location.origin + location.pathname + "?group=" + group.id;

    app.innerHTML =
      '<header class="page">' +
      "<h1>" +
      escapeHtml(group.name) +
      "</h1>" +
      '<div class="who">' +
      escapeHtml(identity.name) +
      ' &middot; <button class="btn ghost" id="switchPerson">switch</button>' +
      ' &middot; <button class="btn ghost" id="leaveGroup">forget group</button>' +
      "</div>" +
      "</header>" +
      '<section class="card"><div class="section-label">Invite</div>' +
      '<div class="share-link" id="shareLink">' +
      escapeHtml(shareUrl) +
      '</div><button class="btn small" id="copyLink" style="margin-top:.5rem;">Copy link</button> ' +
      '<button class="btn small" id="exportBtn" style="margin-top:.5rem;">Export data</button></section>' +
      '<section class="card"><div class="section-label">Balances</div><div class="summary-row" id="balancePills"></div></section>' +
      '<section class="card"><div class="section-label">Settle up</div><div id="settleBody"></div></section>' +
      '<section class="card"><div class="ledger-head" style="display:flex;justify-content:space-between;align-items:center;">' +
      '<div class="section-label" style="margin-bottom:0;">Expenses</div>' +
      '<div class="toolbar" style="display:flex;gap:.4rem;">' +
      '<button class="btn small" id="importCostcoBtn">Import shopping receipt</button>' +
      '<button class="btn primary small" id="addExpenseBtn">+ Add expense</button>' +
      '</div></div><div id="importForm"></div><div id="expenseForm"></div><div class="expense-list" id="expenseList" style="margin-top:.75rem;"></div></section>' +
      '<section class="card"><div class="ledger-head" style="display:flex;justify-content:space-between;align-items:center;">' +
      '<div class="section-label" style="margin-bottom:0;">Payments</div>' +
      '<button class="btn small" id="addPaymentBtn">+ Record payment</button>' +
      '</div><div id="paymentForm"></div><div class="payment-list" id="paymentList" style="margin-top:.75rem;"></div></section>';

    document.getElementById("switchPerson").addEventListener("click", function () {
      clearIdentity(group.id);
      renderJoinPrompt(group);
    });
    document.getElementById("leaveGroup").addEventListener("click", function () {
      forgetGroup(group.id);
      goHome();
    });
    document.getElementById("copyLink").addEventListener("click", function () {
      var btn = document.getElementById("copyLink");
      var done = function () {
        var orig = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(function () { btn.textContent = orig; }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(done).catch(function () { window.prompt("Copy this link:", shareUrl); });
      } else {
        window.prompt("Copy this link:", shareUrl);
      }
    });

    document.getElementById("exportBtn").addEventListener("click", function () {
      exportGroupData(group);
    });

    document.getElementById("addExpenseBtn").addEventListener("click", function () {
      toggleExpenseForm(group);
    });
    document.getElementById("addPaymentBtn").addEventListener("click", function () {
      togglePaymentForm(group, identity);
    });
    document.getElementById("importCostcoBtn").addEventListener("click", function () {
      toggleImportForm(group);
    });

    refreshBalances(group);
    refreshExpenses(group);
    refreshPayments(group);
  }

  function refreshBalances(group) {
    api("/groups/" + group.id + "/balances").then(function (data) {
      var pills = document.getElementById("balancePills");
      if (!pills) return;
      pills.innerHTML = data.balances
        .map(function (b) {
          var cls = b.net_cents > 0 ? "owed" : b.net_cents < 0 ? "owes" : "";
          return (
            '<div class="pill" style="--pc:var(--' +
            colorFor(b.person_id, data.balances) +
            ')"><div class="who"><span class="dot"></span>' +
            escapeHtml(b.name) +
            '</div><div class="amt ' +
            cls +
            '">' +
            fmt(b.net_cents, data.currency) +
            "</div></div>"
          );
        })
        .join("");

      var settleBody = document.getElementById("settleBody");
      if (!settleBody) return;
      if (data.settlements.length === 0) {
        settleBody.innerHTML = '<p class="empty-note">Everyone\'s settled up.</p>';
      } else {
        settleBody.innerHTML =
          '<div class="settle-list">' +
          data.settlements
            .map(function (s, i) {
              return (
                '<div class="settle-row"><span class="who">' +
                escapeHtml(s.from_name) +
                " owes " +
                escapeHtml(s.to_name) +
                '</span><span class="amt">' +
                fmt(s.amount_cents, data.currency) +
                '</span><button class="btn small" data-record-settlement="' +
                i +
                '">Record payment</button></div>'
              );
            })
            .join("") +
          "</div>";
        settleBody.querySelectorAll("[data-record-settlement]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var s = data.settlements[Number(btn.dataset.recordSettlement)];
            btn.disabled = true;
            api("/groups/" + group.id + "/payments", {
              method: "POST",
              body: { from_person: s.from_person_id, to_person: s.to_person_id, amount: s.amount_cents / 100 },
            }).then(function () {
              refreshBalances(group);
              refreshPayments(group);
            });
          });
        });
      }
    });
  }

  function refreshExpenses(group) {
    api("/groups/" + group.id + "/expenses").then(function (expenses) {
      var list = document.getElementById("expenseList");
      if (!list) return;
      if (expenses.length === 0) {
        list.innerHTML = '<p class="empty-note">No expenses yet.</p>';
        return;
      }
      var nameById = {};
      group.members.forEach(function (m) { nameById[m.id] = m.name; });
      list.innerHTML = expenses
        .map(function (e) {
          return (
            '<div class="expense-row"><div><div class="desc">' +
            escapeHtml(e.description) +
            '</div><div class="meta">paid by ' +
            escapeHtml(nameById[e.paid_by] || "?") +
            " &middot; " +
            escapeHtml(e.split_type) +
            " split &middot; " +
            escapeHtml(e.created_at) +
            "</div></div><div class=\"amt money\">" +
            fmt(e.amount_cents, group.currency) +
            '</div><div class="actions"><button class="btn ghost" data-del-expense="' +
            e.id +
            '">delete</button></div></div>'
          );
        })
        .join("");
      list.querySelectorAll("[data-del-expense]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!confirm("Delete this expense?")) return;
          api("/groups/" + group.id + "/expenses/" + btn.dataset.delExpense, { method: "DELETE" }).then(function () {
            refreshExpenses(group);
            refreshBalances(group);
          });
        });
      });
    });
  }

  function refreshPayments(group) {
    api("/groups/" + group.id + "/payments").then(function (payments) {
      var list = document.getElementById("paymentList");
      if (!list) return;
      if (payments.length === 0) {
        list.innerHTML = '<p class="empty-note">No payments recorded yet.</p>';
        return;
      }
      var nameById = {};
      group.members.forEach(function (m) { nameById[m.id] = m.name; });
      list.innerHTML = payments
        .map(function (p) {
          return (
            '<div class="payment-row"><span class="who">' +
            escapeHtml(nameById[p.from_person] || "?") +
            " paid " +
            escapeHtml(nameById[p.to_person] || "?") +
            (p.note ? " (" + escapeHtml(p.note) + ")" : "") +
            '</span><span class="amt money">' +
            fmt(p.amount_cents, group.currency) +
            '</span><button class="btn ghost" data-del-payment="' +
            p.id +
            '">undo</button></div>'
          );
        })
        .join("");
      list.querySelectorAll("[data-del-payment]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          api("/groups/" + group.id + "/payments/" + btn.dataset.delPayment, { method: "DELETE" }).then(function () {
            refreshPayments(group);
            refreshBalances(group);
          });
        });
      });
    });
  }

  // ---------- export ----------
  function exportGroupData(group) {
    Promise.all([
      api("/groups/" + group.id + "/expenses"),
      api("/groups/" + group.id + "/payments"),
      api("/groups/" + group.id + "/balances"),
    ]).then(function (results) {
      var payload = {
        exported_at: new Date().toISOString(),
        group: { id: group.id, name: group.name, currency: group.currency, members: group.members },
        expenses: results[0],
        payments: results[1],
        balances: results[2],
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = group.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-export.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // ---------- import from Costco Split ----------
  var COSTCO_SPLIT_URL = "https://mohanavenkatan-ux.github.io/Costco-split/";

  function toggleImportForm(group) {
    var container = document.getElementById("importForm");
    if (container.dataset.open === "1") {
      container.innerHTML = "";
      container.dataset.open = "";
      return;
    }
    container.dataset.open = "1";
    renderImportPasteStep(container, group);

    var peopleParam = group.members.map(function (m) { return encodeURIComponent(m.name); }).join(",");
    window.open(COSTCO_SPLIT_URL + "?people=" + peopleParam, "_blank");
  }

  function renderImportPasteStep(container, group) {
    container.innerHTML =
      '<div class="card" style="margin-top:.75rem;background:var(--paper-sunken);">' +
      '<div class="hint" style="margin-bottom:.6rem;">Costco Split opened in a new tab, pre-filled with this group. ' +
      "Assign the items there, click <strong>Copy summary</strong>, then paste it below.</div>" +
      '<div class="field"><label>Pasted summary</label><textarea id="importText" rows="6" placeholder="Paste the copied summary here"></textarea></div>' +
      '<button class="btn primary" id="importParseBtn">Parse</button> ' +
      '<button class="btn ghost" id="importCancelBtn">Cancel</button>' +
      '<div class="error-text" id="importError"></div>' +
      "</div>";

    document.getElementById("importCancelBtn").addEventListener("click", function () {
      container.innerHTML = "";
      container.dataset.open = "";
    });
    document.getElementById("importParseBtn").addEventListener("click", function () {
      var text = document.getElementById("importText").value;
      var errorEl = document.getElementById("importError");
      try {
        var parsed = window.CostcoSummary.parseCostcoSplitSummary(text);
      } catch (err) {
        errorEl.textContent = err.message;
        return;
      }
      renderImportPreview(container, group, parsed);
    });
  }

  function renderImportPreview(container, group, parsed) {
    var byLowerName = {};
    group.members.forEach(function (m) { byLowerName[m.name.toLowerCase()] = m.id; });

    var sumCents = parsed.people.reduce(function (s, p) { return s + p.amount_cents; }, 0);
    var mismatchWarning = "";
    if (sumCents !== parsed.total_cents) {
      mismatchWarning =
        '<div class="hint" style="color:var(--warn);">Heads up: this receipt\'s full total was ' +
        fmt(parsed.total_cents, parsed.currency_symbol || group.currency) +
        ", but only " +
        fmt(sumCents, parsed.currency_symbol || group.currency) +
        " across these people is being imported - looks like some items weren't assigned to anyone in Costco Split yet." +
        "</div>";
    }
    var currencyWarning = "";
    if (parsed.currency_symbol && parsed.currency_symbol !== group.currency) {
      currencyWarning =
        '<div class="hint" style="color:var(--warn);">This summary used "' +
        escapeHtml(parsed.currency_symbol) +
        '" but this group\'s currency is "' +
        escapeHtml(group.currency) +
        '" - the amounts below are taken as-is, with no conversion.</div>';
    }

    var rows = parsed.people
      .map(function (p, i) {
        var matchedId = byLowerName[p.name.toLowerCase()] || "";
        var options = group.members
          .map(function (m) {
            return '<option value="' + m.id + '"' + (m.id === matchedId ? " selected" : "") + ">" + escapeHtml(m.name) + "</option>";
          })
          .join("");
        return (
          '<div class="participant-row"><label style="flex:2;">' +
          escapeHtml(p.name) +
          " &rarr; <select class=\"import-match\" data-idx=\"" +
          i +
          '">' +
          '<option value="">(no match - won\'t be imported)</option>' +
          options +
          "</select></label><span class=\"amt money\">" +
          fmt(p.amount_cents, parsed.currency_symbol || group.currency) +
          "</span></div>"
        );
      })
      .join("");

    var payerMatchId = parsed.payerName ? byLowerName[parsed.payerName.toLowerCase()] || "" : "";
    var payerOptions = group.members.map(function (m) { return '<option value="' + m.id + '"' + (m.id === payerMatchId ? " selected" : "") + ">" + escapeHtml(m.name) + "</option>"; }).join("");

    container.innerHTML =
      '<div class="card" style="margin-top:.75rem;background:var(--paper-sunken);">' +
      '<div class="field"><label>Description</label><input id="importDesc" value="' +
      escapeHtml(parsed.description) +
      '"></div>' +
      mismatchWarning +
      currencyWarning +
      '<div class="section-label" style="margin-top:.8rem;">Match people</div>' +
      rows +
      '<div class="field" style="margin-top:.6rem;"><label>Paid by</label><select id="importPaidBy"><option value="">(pick who paid)</option>' +
      payerOptions +
      "</select></div>" +
      '<button class="btn primary" id="importConfirmBtn">Add this expense</button> ' +
      '<button class="btn ghost" id="importBackBtn">Start over</button>' +
      '<div class="error-text" id="importConfirmError"></div>' +
      "</div>";

    document.getElementById("importBackBtn").addEventListener("click", function () {
      renderImportPasteStep(container, group);
    });

    document.getElementById("importConfirmBtn").addEventListener("click", function () {
      var errorEl = document.getElementById("importConfirmError");
      var description = document.getElementById("importDesc").value.trim();
      var paidBy = document.getElementById("importPaidBy").value;
      if (!description) {
        errorEl.textContent = "Description is required.";
        return;
      }
      if (!paidBy) {
        errorEl.textContent = "Pick who paid.";
        return;
      }

      var participants = [];
      var ok = true;
      container.querySelectorAll(".import-match").forEach(function (sel) {
        var personId = sel.value;
        var idx = Number(sel.dataset.idx);
        if (!personId) return; // unmatched people are simply excluded
        participants.push({ person_id: personId, amount_cents: parsed.people[idx].amount_cents });
      });
      var seen = {};
      participants.forEach(function (p) {
        if (seen[p.person_id]) ok = false;
        seen[p.person_id] = true;
      });
      if (!ok) {
        errorEl.textContent = "Two rows are matched to the same person - fix that first.";
        return;
      }
      if (participants.length === 0) {
        errorEl.textContent = "At least one person needs to be matched.";
        return;
      }

      var amount = participants.reduce(function (s, p) { return s + p.amount_cents; }, 0) / 100;

      api("/groups/" + group.id + "/expenses", {
        method: "POST",
        body: {
          description: description,
          amount: amount,
          paid_by: paidBy,
          split_type: "exact",
          participants: participants,
          category: "shopping",
          source: "costco-split",
        },
      })
        .then(function () {
          container.innerHTML = "";
          container.dataset.open = "";
          refreshExpenses(group);
          refreshBalances(group);
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
        });
    });
  }

  // ---------- add expense form ----------
  function toggleExpenseForm(group) {
    var container = document.getElementById("expenseForm");
    if (container.dataset.open === "1") {
      container.innerHTML = "";
      container.dataset.open = "";
      return;
    }
    container.dataset.open = "1";
    renderExpenseForm(container, group);
  }

  function participantsFieldsHtml(group, splitType) {
    return group.members
      .map(function (m) {
        if (splitType === "equal") {
          return (
            '<div class="participant-row"><label><input type="checkbox" class="p-equal" value="' +
            m.id +
            '" checked>' +
            escapeHtml(m.name) +
            "</label></div>"
          );
        }
        if (splitType === "exact") {
          return (
            '<div class="participant-row"><label>' +
            escapeHtml(m.name) +
            '</label><input type="number" step="0.01" min="0" class="p-exact" data-person="' +
            m.id +
            '" placeholder="0.00"></div>'
          );
        }
        if (splitType === "percentage") {
          return (
            '<div class="participant-row"><label>' +
            escapeHtml(m.name) +
            '</label><input type="number" step="0.01" min="0" class="p-pct" data-person="' +
            m.id +
            '" placeholder="0"></div>'
          );
        }
        // shares
        return (
          '<div class="participant-row"><label>' +
          escapeHtml(m.name) +
          '</label><input type="number" step="1" min="0" class="p-shares" data-person="' +
          m.id +
          '" placeholder="0"></div>'
        );
      })
      .join("");
  }

  function renderExpenseForm(container, group) {
    container.innerHTML =
      '<div class="card" style="margin-top:.75rem;background:var(--paper-sunken);">' +
      '<div class="field"><label>Description</label><input id="expDesc" placeholder="Dinner, rent, utilities..."></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>Amount</label><input id="expAmount" type="number" step="0.01" min="0"></div>' +
      '<div class="field"><label>Paid by</label><select id="expPaidBy">' +
      group.members.map(function (m) { return '<option value="' + m.id + '">' + escapeHtml(m.name) + "</option>"; }).join("") +
      "</select></div>" +
      '<div class="field"><label>Split</label><select id="expSplitType">' +
      '<option value="equal">Equally</option><option value="exact">Exact amounts</option>' +
      '<option value="percentage">Percentage</option><option value="shares">Shares</option>' +
      "</select></div>" +
      "</div>" +
      '<div id="expParticipants">' +
      participantsFieldsHtml(group, "equal") +
      "</div>" +
      '<button class="btn primary" id="expSubmit">Add expense</button>' +
      '<div class="error-text" id="expError"></div>' +
      "</div>";

    document.getElementById("expSplitType").addEventListener("change", function (e) {
      document.getElementById("expParticipants").innerHTML = participantsFieldsHtml(group, e.target.value);
    });

    document.getElementById("expSubmit").addEventListener("click", function () {
      var description = document.getElementById("expDesc").value.trim();
      var amount = parseFloat(document.getElementById("expAmount").value);
      var paidBy = document.getElementById("expPaidBy").value;
      var splitType = document.getElementById("expSplitType").value;
      var errorEl = document.getElementById("expError");
      errorEl.textContent = "";

      if (!description || !(amount > 0)) {
        errorEl.textContent = "Description and a positive amount are required.";
        return;
      }

      var participants;
      if (splitType === "equal") {
        participants = Array.from(document.querySelectorAll(".p-equal:checked")).map(function (el) { return el.value; });
        if (participants.length === 0) {
          errorEl.textContent = "Pick at least one person to split with.";
          return;
        }
      } else if (splitType === "exact") {
        participants = Array.from(document.querySelectorAll(".p-exact"))
          .map(function (el) { return { person_id: el.dataset.person, amount_cents: Math.round((parseFloat(el.value) || 0) * 100) }; })
          .filter(function (p) { return p.amount_cents > 0; });
      } else if (splitType === "percentage") {
        participants = Array.from(document.querySelectorAll(".p-pct"))
          .map(function (el) { return { person_id: el.dataset.person, percentage: parseFloat(el.value) || 0 }; })
          .filter(function (p) { return p.percentage > 0; });
      } else {
        participants = Array.from(document.querySelectorAll(".p-shares"))
          .map(function (el) { return { person_id: el.dataset.person, shares: parseFloat(el.value) || 0 }; })
          .filter(function (p) { return p.shares > 0; });
      }

      api("/groups/" + group.id + "/expenses", {
        method: "POST",
        body: { description: description, amount: amount, paid_by: paidBy, split_type: splitType, participants: participants },
      })
        .then(function () {
          container.innerHTML = "";
          container.dataset.open = "";
          refreshExpenses(group);
          refreshBalances(group);
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
        });
    });
  }

  // ---------- record payment form ----------
  function togglePaymentForm(group, identity) {
    var container = document.getElementById("paymentForm");
    if (container.dataset.open === "1") {
      container.innerHTML = "";
      container.dataset.open = "";
      return;
    }
    container.dataset.open = "1";
    var options = group.members.map(function (m) { return '<option value="' + m.id + '">' + escapeHtml(m.name) + "</option>"; }).join("");
    container.innerHTML =
      '<div class="card" style="margin-top:.75rem;background:var(--paper-sunken);">' +
      '<div class="field-row">' +
      '<div class="field"><label>From</label><select id="payFrom">' + options + "</select></div>" +
      '<div class="field"><label>To</label><select id="payTo">' + options + "</select></div>" +
      '<div class="field"><label>Amount</label><input id="payAmount" type="number" step="0.01" min="0"></div>' +
      "</div>" +
      '<div class="field"><label>Note (optional)</label><input id="payNote" placeholder="Venmo, cash..."></div>' +
      '<button class="btn primary" id="paySubmit">Record payment</button>' +
      '<div class="error-text" id="payError"></div>' +
      "</div>";
    document.getElementById("payFrom").value = identity.personId;

    document.getElementById("paySubmit").addEventListener("click", function () {
      var from = document.getElementById("payFrom").value;
      var to = document.getElementById("payTo").value;
      var amount = parseFloat(document.getElementById("payAmount").value);
      var note = document.getElementById("payNote").value.trim();
      var errorEl = document.getElementById("payError");
      if (from === to || !(amount > 0)) {
        errorEl.textContent = "Pick two different people and a positive amount.";
        return;
      }
      api("/groups/" + group.id + "/payments", { method: "POST", body: { from_person: from, to_person: to, amount: amount, note: note || undefined } })
        .then(function () {
          container.innerHTML = "";
          container.dataset.open = "";
          refreshPayments(group);
          refreshBalances(group);
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
        });
    });
  }

  boot();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();

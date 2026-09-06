(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CostcoSummary = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function parseMoney(str) {
    var m = String(str == null ? "" : str).match(/-?[\d.]+/);
    return m ? parseFloat(m[0]) : NaN;
  }

  function currencySymbolOf(str) {
    var m = String(str == null ? "" : str).match(/^([^\d-]*)/);
    return m ? m[1].trim() : "";
  }

  /**
   * Parses the plain-text output of Costco Split's "Copy summary" button:
   *
   *   <description>
   *   Total: $152.82
   *
   *   Name: $7.33
   *   Name2: $7.33
   *
   *   Paid by Name - settle up:
   *   Name2 owes Name $7.33
   *
   * The trailing section is optional (absent if no payer was picked in
   * Costco Split) and may instead read "Nobody owes Name anything." if
   * the group was already settled - both forms still identify the payer.
   */
  function parseCostcoSplitSummary(text) {
    var lines = String(text == null ? "" : text)
      .split(/\r?\n/)
      .map(function (l) { return l.trim(); });
    while (lines.length && lines[0] === "") lines.shift();
    while (lines.length && lines[lines.length - 1] === "") lines.pop();

    if (lines.length < 3) {
      throw new Error("That doesn't look like a Costco Split summary - paste the exact text from its Copy Summary button.");
    }

    var description = lines[0];
    var totalMatch = lines[1].match(/^Total:\s*(.+)$/i);
    if (!totalMatch) {
      throw new Error("Couldn't find a \"Total:\" line on the second row.");
    }
    var total = parseMoney(totalMatch[1]);
    if (!(total > 0)) {
      throw new Error("Couldn't parse the total amount.");
    }
    var currencySymbol = currencySymbolOf(totalMatch[1]);

    var idx = 2;
    if (lines[idx] === "") idx++;

    var people = [];
    while (idx < lines.length && lines[idx] !== "") {
      var line = lines[idx];
      var sep = line.indexOf(":");
      if (sep === -1) break;
      var name = line.slice(0, sep).trim();
      var amount = parseMoney(line.slice(sep + 1));
      if (!name || isNaN(amount)) break;
      people.push({ name: name, amount_cents: Math.round(amount * 100) });
      idx++;
    }
    if (people.length === 0) {
      throw new Error("Couldn't find any per-person amounts to import.");
    }

    var payerName = null;
    for (; idx < lines.length; idx++) {
      var m1 = lines[idx].match(/^Paid by (.+) - settle up:$/i);
      if (m1) { payerName = m1[1].trim(); break; }
      var m2 = lines[idx].match(/^Nobody owes (.+) anything\.$/i);
      if (m2) { payerName = m2[1].trim(); break; }
    }

    return {
      description: description,
      total_cents: Math.round(total * 100),
      currency_symbol: currencySymbol,
      people: people,
      payerName: payerName,
    };
  }

  return { parseCostcoSplitSummary: parseCostcoSplitSummary, parseMoney: parseMoney };
});

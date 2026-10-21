// Estimates: what the job takes, counted from the plan, with a unit price
// on each line. Quantities fill themselves in (cable footage from the
// paths, splices from the splice sheets, hardware from each location's
// equipment); any of them can be typed over. Prices are kept with the
// plan, and the last prices used on this device fill in new plans.
// Prints on its own page or saves as a CSV for a spreadsheet.

const PRICE_KEY = "splicePlanner.prices";

function devicePrices() {
  try {
    return JSON.parse(localStorage.getItem(PRICE_KEY)) || {};
  } catch {
    return {};
  }
}

function rememberPrices(prices) {
  try {
    localStorage.setItem(PRICE_KEY, JSON.stringify({ ...devicePrices(), ...prices }));
  } catch {
    // Not remembered on this device; the plan still keeps them.
  }
}

function estimateData() {
  plan.estimate = plan.estimate || {};
  const e = plan.estimate;
  e.prices = e.prices || {};
  e.qty = e.qty || {};
  e.extra = e.extra || [];
  return e;
}

// Every line the plan gives: [{ group, key, label, qty, unit, note }].
function estimateLines() {
  const lines = new Map();
  const add = (group, key, label, unit, n = 1, note) => {
    const line = lines.get(key) || { group, key, label, unit, qty: 0, spans: 0, missing: 0 };
    line.qty += n;
    if (note) line.note = note;
    lines.set(key, line);
    return line;
  };

  // Cable by kind and size, in feet from the footage on its paths.
  let placed = 0;
  let unmeasured = 0;
  for (const path of plan.paths) {
    const c = pathCable(path);
    const ft = (path.conduit && Number(path.conduit.footage)) || 0;
    if (path.conduit && path.conduit.size) {
      const ducts = Number(path.conduit.ducts) || 1;
      const label = `${path.conduit.size} conduit${ducts > 1 ? `, ${ducts} ducts` : ""}`;
      const line = add("Conduit", `conduit:${path.conduit.size}:${ducts}`, label, "ft", ft);
      line.spans++;
      if (!ft) line.missing++;
    }
    if (!c) continue;
    if (isDrop(c)) {
      add("Drops", `drop:${c.fibers}`, `${c.fibers}F drop`, "ea");
      continue;
    }
    const kind = cableKind(c);
    const what = kind === "cable" ? "cable" : CABLE_KINDS[kind].toLowerCase();
    const line = add("Cable", `cable:${kind}:${c.fibers}`, `${c.fibers}F ${what}`, "ft", ft);
    line.spans++;
    if (!ft) {
      line.missing++;
      unmeasured++;
    }
    placed += ft;
  }

  // Locations placed (not the homes), then the hardware in them.
  for (const p of plan.points) {
    if (p.type === "nid") continue;
    const label = p.type === "other" ? p.name : typeLabel(p.type);
    add("Locations", `loc:${p.type === "other" ? "other:" + p.name : p.type}`, label, "ea");
    for (const eq of p.equipment || []) {
      if (eq.type === "splitter") add("Equipment", `eq:splitter:${eq.ratio}`, `${eq.ratio} splitter`, "ea");
      else if (eq.type === "closure") add("Equipment", `eq:closure:${eq.model || eq.name}`, `Splice case, ${eq.model || eq.name}`, "ea");
      else if (eq.type === "terminal") add("Equipment", `eq:terminal:${eq.model || eq.name}`, `Terminal, ${eq.model || eq.name}`, "ea");
      else add("Equipment", `eq:${eq.type}:${eq.model || eq.name}`, eq.model || eq.name || (EQ_KINDS[eq.type] || EQ_KINDS.other).label, "ea");
    }
  }

  // Labor: splices and patches off the splice sheets, drops, placing cable.
  const model = buildSpliceModel();
  let splices = 0;
  let patches = 0;
  for (const p of plan.points) {
    if (p.type === "nid") continue;
    for (const c of connectionsAt(model, p.id)) {
      if (c.kind === "patch") patches++;
      else splices++;
    }
  }
  const drops = plan.cables.filter(isDrop).length;
  if (splices) add("Labor", "labor:splice", "Fusion splices", "ea", splices);
  if (patches) add("Labor", "labor:patch", "Patches / cross-connects", "ea", patches);
  if (drops) add("Labor", "labor:drop", "Drop installs", "ea", drops);
  if (placed || unmeasured) {
    add("Labor", "labor:place", "Place cable", "ft", placed,
      unmeasured ? `${unmeasured} cable span${unmeasured === 1 ? " has" : "s have"} no footage yet` : "");
  }

  for (const line of lines.values()) {
    if (line.missing && !line.note) line.note = `${line.missing} of ${line.spans} span${line.spans === 1 ? "" : "s"} have no footage yet`;
  }
  const order = ["Cable", "Drops", "Conduit", "Locations", "Equipment", "Labor"];
  return [...lines.values()].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.label.localeCompare(b.label, undefined, { numeric: true }));
}

// Lines with the plan's typed-over quantities and prices applied, plus
// the lines added by hand.
function estimateRows() {
  const e = estimateData();
  const saved = devicePrices();
  const rows = estimateLines().map((l) => {
    const qty = e.qty[l.key] !== undefined ? e.qty[l.key] : l.qty;
    const price = e.prices[l.key] !== undefined ? e.prices[l.key] : saved[l.key];
    return { ...l, auto: l.qty, qty, price: price === undefined ? null : price };
  });
  for (const x of e.extra) rows.push({ group: "Other", key: `extra:${x.id}`, extra: x, label: x.label, unit: x.unit || "ea", qty: Number(x.qty) || 0, price: x.price ?? null });
  return rows;
}

function rowTotal(r) {
  return r.price === null ? 0 : (Number(r.qty) || 0) * (Number(r.price) || 0);
}

function homesInPlan() {
  return plan.points.filter((p) => p.type === "nid").length;
}

const money = (n) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });

document.getElementById("open-estimate").addEventListener("click", (e) => {
  e.stopPropagation();
  openEstimate();
});

function openEstimate() {
  selectedId = null;
  const view = isGuest();
  openForm(`Estimate: ${plan.title || plan.points[0].name}`, (body, foot) => {
    body.append(el("p", "hint", "Quantities come from the plan; type over any of them. Cable footage comes from the footage on each path. Prices stay with the plan, and the last ones used here fill in new plans."));
    const wrap = el("div", "estimate-wrap");
    const totals = el("div", "estimate-totals");
    body.append(wrap, totals);

    const draw = () => {
      wrap.innerHTML = "";
      const rows = estimateRows();
      const table = el("table", "sheet-table estimate-table");
      table.innerHTML = "<thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Unit price</th><th>Total</th><th></th></tr></thead>";
      const tb = el("tbody");
      let group = null;
      for (const r of rows) {
        if (r.group !== group) {
          group = r.group;
          const g = el("tr", "group-row");
          const td = el("td", "", group);
          td.colSpan = 6;
          g.append(td);
          tb.append(g);
        }
        const tr = el("tr");
        const item = el("td");
        if (r.extra) {
          const name = inputEl("text", r.label, { "aria-label": "Item" });
          name.disabled = view;
          name.addEventListener("change", () => {
            r.extra.label = name.value.trim() || "Other";
            savePlan();
          });
          item.append(name);
        } else {
          item.append(el("span", "", r.label));
          if (r.note) item.append(el("span", "estimate-note", r.note));
        }
        const qty = inputEl("number", r.qty, { min: 0, step: "any", "aria-label": `Quantity, ${r.label}` });
        qty.disabled = view;
        const typed = !r.extra && r.qty !== r.auto;
        if (typed) qty.classList.add("typed");
        qty.title = r.extra ? "" : typed ? `Typed over. The plan counts ${r.auto}; clear the box to go back to it.` : "Counted from the plan";
        qty.addEventListener("change", () => {
          const e = estimateData();
          const v = qty.value.trim();
          if (r.extra) r.extra.qty = Number(v) || 0;
          else if (v === "" || Number(v) === r.auto) delete e.qty[r.key];
          else e.qty[r.key] = Number(v);
          savePlan();
          draw();
        });
        const price = inputEl("number", r.price ?? "", { min: 0, step: "0.01", placeholder: "$", "aria-label": `Unit price, ${r.label}` });
        price.disabled = view;
        price.addEventListener("change", () => {
          const e = estimateData();
          const v = price.value.trim();
          if (r.extra) r.extra.price = v === "" ? null : Number(v);
          else if (v === "") delete e.prices[r.key];
          else {
            e.prices[r.key] = Number(v);
            rememberPrices({ [r.key]: Number(v) });
          }
          savePlan();
          draw();
        });
        const unit = el("td", "mono");
        if (r.extra) {
          const u = inputEl("text", r.unit, { "aria-label": "Unit", size: 3 });
          u.disabled = view;
          u.addEventListener("change", () => {
            r.extra.unit = u.value.trim() || "ea";
            savePlan();
          });
          unit.append(u);
        } else unit.textContent = r.unit;
        const qtyTd = el("td");
        qtyTd.append(qty);
        const priceTd = el("td");
        priceTd.append(price);
        const rm = el("td");
        if (r.extra && !view) {
          rm.append(btnEl("×", () => {
            const e = estimateData();
            e.extra = e.extra.filter((x) => x !== r.extra);
            savePlan();
            draw();
          }, "btn ghost tiny"));
          rm.firstChild.title = "Remove this line";
        }
        tr.append(item, qtyTd, unit, priceTd, el("td", "mono num", r.price === null ? "" : money(rowTotal(r))), rm);
        tb.append(tr);
      }
      table.append(tb);
      wrap.append(table);
      const sum = rows.reduce((t, r) => t + rowTotal(r), 0);
      const homes = homesInPlan();
      const unpriced = rows.filter((r) => r.price === null && Number(r.qty)).length;
      totals.innerHTML = "";
      totals.append(el("div", "estimate-total", `Total ${money(sum)}`));
      if (homes) totals.append(el("div", "hint", `${homes} home${homes === 1 ? "" : "s"} · ${money(sum / homes)} per home`));
      if (unpriced) totals.append(el("div", "hint", `${unpriced} line${unpriced === 1 ? " has" : "s have"} no price yet.`));
    };
    draw();

    if (!view) {
      foot.append(btnEl("Add a line", () => {
        estimateData().extra.push({ id: makeId(), label: "Other", qty: 1, unit: "ea", price: null });
        savePlan();
        draw();
        const last = wrap.querySelectorAll("tbody input[type=text]");
        if (last.length) last[last.length - 2]?.select();
      }, "btn ghost push-left"));
    }
    foot.append(btnEl("Save CSV", saveEstimateCsv, "btn ghost"));
    foot.append(btnEl("Print estimate", () => {
      if (printBlocked()) return showNote("Printing doesn't work inside this preview. Open the plan on bkirsche.github.io/splice-planner to print.");
      printJust(() => estimatePage());
    }, "btn ghost"));
    foot.append(btnEl("Close", () => {
      closeForm();
      renderRoute();
    }, "btn big"));
  }, true);
}

function estimateCsv() {
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = [["Group", "Item", "Qty", "Unit", "Unit price", "Total"].join(",")];
  const rows = estimateRows();
  for (const r of rows) lines.push([r.group, r.label, r.qty, r.unit, r.price ?? "", r.price === null ? "" : rowTotal(r).toFixed(2)].map(q).join(","));
  lines.push(["", "Total", "", "", "", rows.reduce((t, r) => t + rowTotal(r), 0).toFixed(2)].map(q).join(","));
  return lines.join("\n") + "\n";
}

function saveEstimateCsv() {
  const name = planFileName().replace(/_[^_]*_(\d{4}-\d{2}-\d{2})\.ffhspl$/, "_estimate_$1.csv");
  downloadFile(name, new Blob([estimateCsv()], { type: "text/csv" }));
}

// The estimate as a printed page, in the same title block as the sheets.
function estimatePage() {
  const page = el("section", "print-page estimate-page");
  const head = el("header", "sheet-head small");
  head.append(brandEl("small"), el("h2", "", `${plan.title || plan.points[0].name}: estimate`), el("div", "sheet-printed", printedLine()));
  const rows = estimateRows();
  const table = el("table", "sheet-table estimate-table");
  table.innerHTML = "<thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Unit price</th><th>Total</th></tr></thead>";
  const tb = el("tbody");
  let group = null;
  for (const r of rows) {
    if (r.group !== group) {
      group = r.group;
      const g = el("tr", "group-row");
      const td = el("td", "", group);
      td.colSpan = 5;
      g.append(td);
      tb.append(g);
    }
    const tr = el("tr");
    tr.append(el("td", "", r.label + (r.note ? ` (${r.note})` : "")), el("td", "mono num", String(r.qty)), el("td", "mono", r.unit),
      el("td", "mono num", r.price === null ? "" : money(Number(r.price))), el("td", "mono num", r.price === null ? "" : money(rowTotal(r))));
    tb.append(tr);
  }
  const sum = rows.reduce((t, r) => t + rowTotal(r), 0);
  const homes = homesInPlan();
  const tf = el("tr", "total-row");
  const label = el("td", "", homes ? `Total · ${homes} homes · ${money(sum / homes)} per home` : "Total");
  label.colSpan = 4;
  tf.append(label, el("td", "mono num", money(sum)));
  tb.append(tf);
  table.append(tb);
  page.append(head, table);
  return page;
}

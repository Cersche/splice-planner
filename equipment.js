// Equipment at a location: splitters (added several at a time, each with
// its F2 count), shelves started from a template and then cut down or
// renamed, and anything else. Also each location's details and the
// cross-connects (patches) at a cabinet.

// Starting points only: port counts are from datasheets and press, not
// from any one crew's gear. Rename, add or remove cards and ports after.
const SHELF_TEMPLATES = [
  { id: "e7-gpon8", group: "Calix OLT", label: "Calix E7-2, GPON-8 cards", model: "Calix E7-2", cards: 2, card: "GPON-8", ports: 8, port: "PON" },
  { id: "e7-gpon8r2", group: "Calix OLT", label: "Calix E7-2, GPON-8 r2 cards", model: "Calix E7-2", cards: 2, card: "GPON-8 r2", ports: 8, port: "PON" },
  { id: "e7-xg801", group: "Calix OLT", label: "Calix E7-2, XG801 cards", model: "Calix E7-2", cards: 2, card: "XG801", ports: 8, port: "PON" },
  { id: "e9-ng1601", group: "Calix OLT", label: "Calix E9-2, NG1601 cards", model: "Calix E9-2", cards: 2, card: "NG1601", ports: 16, port: "PON" },
  { id: "e9-gp1611", group: "Calix OLT", label: "Calix E9-2, GP1611 cards", model: "Calix E9-2", cards: 2, card: "GP1611", ports: 16, port: "PON" },
  { id: "clearfield-144", group: "FDH / splitter cabinet", label: "Clearfield FieldSmart FDH, 144 ports", model: "Clearfield FieldSmart FDH", cards: 12, card: "Cassette", ports: 12 },
  { id: "commscope-288", group: "FDH / splitter cabinet", label: "CommScope FDH 3000, 288F", model: "CommScope FDH 3000", cards: 24, card: "Panel", ports: 12 },
  { id: "commscope-432", group: "FDH / splitter cabinet", label: "CommScope FDH 3000, 432F", model: "CommScope FDH 3000", cards: 36, card: "Panel", ports: 12 },
  { id: "optitect-288", group: "FDH / splitter cabinet", label: "Corning OptiTect, 288F", model: "Corning OptiTect", cards: 24, card: "Panel", ports: 12 },
  { id: "blank", group: "Other", label: "Blank shelf (1 card, 12 ports)", model: "", cards: 1, card: "Card", ports: 12 },
];

function shelfFromTemplate(t, name) {
  const cards = [];
  for (let i = 1; i <= t.cards; i++) {
    const ports = [];
    for (let n = 1; n <= t.ports; n++) ports.push({ id: makeId(), name: t.port ? `${t.port} ${n}` : String(n) });
    cards.push({ id: makeId(), name: t.cards > 1 ? `${t.card} ${i}` : t.card, ports });
  }
  return { id: makeId(), type: "shelf", name, model: t.model, cards };
}

function shelfPorts(eq) {
  return eq.cards.reduce((n, c) => n + c.ports.length, 0);
}

function equipmentLabel(eq) {
  if (eq.type === "splitter") return eq.f2 ? `${eq.name} · F2 ${eq.f2}` : eq.name;
  if (eq.type === "shelf") {
    return `${eq.name} · ${eq.cards.length} card${eq.cards.length === 1 ? "" : "s"}, ${shelfPorts(eq)} ports`;
  }
  return eq.name;
}

// --- Equipment dialog ---

function openEquipment(locId) {
  const p = point(locId);
  p.equipment = p.equipment || [];
  openForm(`Equipment at ${p.name}`, (body, foot) => {
    const list = el("div", "eq-list");
    body.append(list);
    renderList();

    function renderList() {
      list.innerHTML = "";
      if (!p.equipment.length) list.append(el("p", "hint", "Nothing here yet. Add equipment below."));
      for (const eq of p.equipment) list.append(eqRow(eq));
    }

    function eqRow(eq) {
      const row = el("div", "eq-row");
      const title = el("div", "eq-name", eq.type === "splitter" ? `${eq.name}` : equipmentLabel(eq));
      row.append(title);
      if (eq.type === "splitter") {
        const f2 = inputEl("number", eq.f2 || "", { min: 1, placeholder: "not set" });
        const note = el("span", "field-hint");
        const check = () => {
          const n = Number(f2.value);
          const problem = f2.value === "" ? "" : f2Problem(p, eq, n);
          note.className = "field-hint" + (problem ? " error" : "");
          note.textContent = f2.value === "" ? "F2 not set" : problem || f2Hint(p, n);
          return problem;
        };
        f2.addEventListener("input", () => {
          if (check()) return;
          eq.f2 = f2.value === "" ? null : Number(f2.value);
          savePlan();
          renderRoute();
        });
        const f2Row = el("label", "inline-field");
        f2Row.append(el("span", "", "F2"), f2);
        row.append(f2Row, el("span", "eq-meta", `DS used ${usedPorts(eq).size} of ${splitterPorts(eq)}`), note);
        check();
      }
      const actions = el("div", "eq-actions");
      if (eq.type === "shelf") actions.append(btnEl("Edit cards and ports", () => openShelf(locId, eq.id), "btn ghost"));
      actions.append(btnEl("Remove", () => {
        const onIt = plan.points.filter((h) => h.ds && h.ds.splitterId === eq.id);
        const msg = onIt.length
          ? `Remove ${eq.name}? ${onIt.length} home(s) have DS counts on it, and those DS counts will be cleared.`
          : `Remove ${eq.name}?`;
        if (!confirm(msg)) return;
        p.equipment = p.equipment.filter((x) => x.id !== eq.id);
        for (const h of onIt) delete h.ds;
        plan.xconnects = plan.xconnects.filter((x) => !endpointOn(x.a, eq.id) && !endpointOn(x.b, eq.id));
        savePlan();
        renderList();
        renderRoute();
      }, "btn ghost danger"));
      row.append(actions);
      return row;
    }

    // Add form: one dropdown for the kind, then just its own fields.
    body.append(el("h4", "form-section", "Add equipment"));
    const kind = selectEl([
      { value: "splitter", label: "Splitter" },
      { value: "shelf", label: "Shelf / chassis (from a template)" },
      { value: "other", label: "Other" },
    ], "splitter");
    body.append(fieldEl("Kind", kind));

    const splitBox = el("div", "form-grid");
    const ratio = selectEl(SPLITTER_RATIOS.map((r) => ({ value: r, label: r })), "1x32");
    const qty = inputEl("number", 1, { min: 1, max: 48 });
    const first = inputEl("number", nextFreeF2(p, { id: null }) || "", { min: 1 });
    splitBox.append(fieldEl("Size", ratio), fieldEl("How many", qty), fieldEl("First F2", first, "Each splitter gets the next free fiber."));
    const splitNote = el("p", "hint");

    const shelfBox = el("div", "form-grid");
    const template = selectEl(SHELF_TEMPLATES.map((t) => ({ value: t.id, label: t.label, group: t.group })), SHELF_TEMPLATES[0].id);
    const shelfName = inputEl("text", SHELF_TEMPLATES[0].model);
    template.addEventListener("change", () => {
      const t = SHELF_TEMPLATES.find((x) => x.id === template.value);
      shelfName.value = t.model || "Shelf";
    });
    shelfBox.append(fieldEl("Template", template), fieldEl("Name", shelfName));
    const shelfNote = el("p", "hint", "Templates are a starting point. Check the cards and ports against your gear, then edit them.");

    const otherBox = el("div", "form-grid");
    const otherName = inputEl("text", "", { placeholder: "e.g. Patch panel" });
    otherBox.append(fieldEl("Name", otherName));

    const addError = el("p", "error");
    addError.hidden = true;
    const add = btnEl("Add", addEquipment, "btn");
    body.append(splitBox, splitNote, shelfBox, shelfNote, otherBox, addError, add);

    function plannedF2() {
      const n = Math.max(1, Math.min(48, Number(qty.value) || 1));
      if (first.value === "") return { list: [], n };
      const c = incomingCable(p.id);
      const max = c ? cableStart(c).fibers : Infinity;
      const list = [];
      for (let f = Number(first.value); list.length < n; f++) {
        if (f > max) return { error: `${c.name} only has ${max} fibers: room for ${list.length} from F2 ${first.value}.` };
        if (!f2Problem(p, { id: null }, f)) list.push(f);
      }
      return { list, n };
    }

    function refresh() {
      splitBox.hidden = splitNote.hidden = kind.value !== "splitter";
      shelfBox.hidden = shelfNote.hidden = kind.value !== "shelf";
      otherBox.hidden = kind.value !== "other";
      addError.hidden = true;
      if (kind.value === "splitter") {
        const plan2 = plannedF2();
        splitNote.className = plan2.error ? "error" : "hint";
        splitNote.textContent = plan2.error ? plan2.error : plan2.list.length
          ? `Adds ${plan2.n} x ${ratio.value} on F2 ${plan2.list.join(", ")}.`
          : `Adds ${plan2.n} x ${ratio.value} with no F2 yet.`;
      }
    }
    [kind, ratio, qty, first].forEach((x) => x.addEventListener("input", refresh));
    refresh();

    function addEquipment() {
      if (kind.value === "splitter") {
        const planned = plannedF2();
        if (planned.error) return;
        let k = splittersAt(p).length;
        for (let i = 0; i < planned.n; i++) {
          p.equipment.push({ id: makeId(), type: "splitter", ratio: ratio.value, name: `Splitter ${++k} (${ratio.value})`, f2: planned.list[i] || null });
        }
        first.value = nextFreeF2(p, { id: null }) || "";
      } else if (kind.value === "shelf") {
        const t = SHELF_TEMPLATES.find((x) => x.id === template.value);
        const shelf = shelfFromTemplate(t, shelfName.value.trim() || t.model || "Shelf");
        p.equipment.push(shelf);
        savePlan();
        return openShelf(locId, shelf.id);
      } else {
        if (!otherName.value.trim()) {
          addError.textContent = "Name the equipment.";
          addError.hidden = false;
          return;
        }
        p.equipment.push({ id: makeId(), type: "other", name: otherName.value.trim() });
        otherName.value = "";
      }
      savePlan();
      renderList();
      refresh();
      renderRoute();
    }

    foot.append(btnEl("Done", finish, "btn big"));
  }, true);
  selectedId = locId;
  renderRoute();
}

// "Fiber 5 on Cable 1: Blue tube, Slate fiber."
function f2Hint(loc, n) {
  const c = incomingCable(loc.id);
  if (!c) return `No cable arrives at ${loc.name}, so F2 is just a number here.`;
  const f = colorCode(c.fibers)[n - 1];
  return f ? `${c.name} #${n}: ${f.tubeColor.name} tube, ${f.fiberColor.name} fiber.` : "";
}

// --- Shelf editor ---

function openShelf(locId, eqId) {
  const p = point(locId);
  const eq = p.equipment.find((x) => x.id === eqId);
  const changed = () => {
    savePlan();
    renderRoute();
  };
  openForm(`${eq.name} at ${p.name}`, (body, foot) => {
    const name = inputEl("text", eq.name);
    const model = inputEl("text", eq.model || "");
    name.addEventListener("change", () => {
      eq.name = name.value.trim() || eq.name;
      changed();
    });
    model.addEventListener("change", () => {
      eq.model = model.value.trim();
      changed();
    });
    const grid = el("div", "form-grid");
    grid.append(fieldEl("Name", name), fieldEl("Model", model));
    body.append(grid);
    const cardsEl = el("div", "cards");
    body.append(cardsEl);
    renderCards();

    function renderCards() {
      cardsEl.innerHTML = "";
      eq.cards.forEach((card, ci) => {
        const box = el("details", "card-box");
        box.open = eq.cards.length <= 4;
        const sum = el("summary", "", `${card.name} · ${card.ports.length} port${card.ports.length === 1 ? "" : "s"}`);
        box.append(sum);
        const cardName = inputEl("text", card.name);
        cardName.addEventListener("change", () => {
          card.name = cardName.value.trim() || card.name;
          sum.textContent = `${card.name} · ${card.ports.length} ports`;
          changed();
        });
        const top = el("div", "card-top");
        top.append(fieldEl("Card name", cardName), btnEl("Remove card", () => {
          if (!confirm(`Remove ${card.name} and its ${card.ports.length} ports?`)) return;
          const ids = new Set(card.ports.map((x) => x.id));
          dropPortPatches(eq.id, ids);
          eq.cards.splice(ci, 1);
          changed();
          renderCards();
        }, "btn ghost danger"));
        const ports = el("div", "port-grid");
        card.ports.forEach((port, pi) => {
          const cell = el("div", "port-cell");
          const pn = inputEl("text", port.name);
          pn.title = "Port name";
          pn.addEventListener("change", () => {
            port.name = pn.value.trim() || port.name;
            changed();
          });
          cell.append(pn, btnEl("×", () => {
            dropPortPatches(eq.id, new Set([port.id]));
            card.ports.splice(pi, 1);
            changed();
            renderCards();
          }, "btn ghost small"));
          ports.append(cell);
        });
        ports.append(btnEl("+ Port", () => {
          card.ports.push({ id: makeId(), name: String(card.ports.length + 1) });
          changed();
          renderCards();
          cardsEl.children[ci].open = true;
        }, "btn ghost small"));
        box.append(top, ports);
        cardsEl.append(box);
      });
      cardsEl.append(btnEl("+ Add card", () => {
        const n = eq.cards.length + 1;
        eq.cards.push({ id: makeId(), name: `Card ${n}`, ports: Array.from({ length: 8 }, (_, i) => ({ id: makeId(), name: String(i + 1) })) });
        changed();
        renderCards();
        cardsEl.children[eq.cards.length - 1].open = true;
      }, "btn ghost"));
    }

    foot.append(btnEl("Back to equipment", () => openEquipment(locId), "btn ghost"), btnEl("Done", finish, "btn big"));
  }, true);
}

// Patches on ports that are going away go with them.
function dropPortPatches(eqId, portIds) {
  const gone = (k) => k.startsWith(`port:${eqId}:`) && portIds.has(k.split(":")[2]);
  plan.xconnects = plan.xconnects.filter((x) => !gone(x.a) && !gone(x.b));
}

// --- Location details ---
// Address or GPS, incoming (feeder) counts, model and notes, plus any
// other fields the user wants. Printed on the field sheet.

const DETAIL_FIELDS = [
  { key: "address", label: "Address" },
  { key: "gps", label: "GPS", placeholder: "e.g. 35.1234, -97.5678" },
  { key: "model", label: "Model" },
  { key: "incoming", label: "Incoming counts", placeholder: "e.g. F1 1-144 from CO" },
];

function detailLines(p) {
  const d = p.details;
  if (!d) return [];
  const lines = DETAIL_FIELDS.filter((f) => d[f.key]).map((f) => `${f.label}: ${d[f.key]}`);
  for (const x of d.extra || []) lines.push(`${x.label}: ${x.value}`);
  if (d.notes) lines.push(`Notes: ${d.notes}`);
  return lines;
}

function openDetails(locId) {
  const p = point(locId);
  const d = p.details || {};
  openForm(`${p.type === "cabinet" ? "Cabinet" : "Location"} details: ${p.name}`, (body, foot) => {
    const inputs = {};
    const grid = el("div", "form-grid");
    for (const f of DETAIL_FIELDS) {
      inputs[f.key] = inputEl("text", d[f.key] || "", f.placeholder ? { placeholder: f.placeholder } : {});
      grid.append(fieldEl(f.label, inputs[f.key]));
    }
    body.append(grid);
    const notes = inputEl("textarea", d.notes || "", { rows: 3 });
    body.append(fieldEl("Notes", notes));

    body.append(el("h4", "form-section", "More fields"));
    const extra = (d.extra || []).map((x) => ({ ...x }));
    const extraEl = el("div", "extra-list");
    body.append(extraEl);
    renderExtra();
    function renderExtra() {
      extraEl.innerHTML = "";
      extra.forEach((x, i) => {
        const row = el("div", "extra-row");
        const label = inputEl("text", x.label, { placeholder: "Field name" });
        const value = inputEl("text", x.value, { placeholder: "Value" });
        label.addEventListener("input", () => (x.label = label.value));
        value.addEventListener("input", () => (x.value = value.value));
        row.append(label, value, btnEl("×", () => {
          extra.splice(i, 1);
          renderExtra();
        }, "btn ghost small"));
        extraEl.append(row);
      });
      extraEl.append(btnEl("+ Add a field", () => {
        extra.push({ label: "", value: "" });
        renderExtra();
        extraEl.querySelector(".extra-row:last-of-type input").focus();
      }, "btn ghost"));
    }

    formButtons(foot, () => {
      const next = {};
      for (const f of DETAIL_FIELDS) if (inputs[f.key].value.trim()) next[f.key] = inputs[f.key].value.trim();
      if (notes.value.trim()) next.notes = notes.value.trim();
      const kept = extra.map((x) => ({ label: x.label.trim(), value: x.value.trim() })).filter((x) => x.label || x.value);
      if (kept.some((x) => !x.label)) return "Give every extra field a name.";
      if (kept.length) next.extra = kept;
      if (Object.keys(next).length) p.details = next;
      else delete p.details;
      finish();
    });
  }, true);
  selectedId = locId;
  renderRoute();
}

// --- Cross-connects ---
// A patch joins two endpoints at one location:
//   port:<shelf>:<port>     a port on a shelf
//   split:<splitter>:in     a splitter input, split:<splitter>:<n> an output
//   fiber:<cable>:<n>       a fiber on a cable starting or ending here

function showsCrossConnects(p) {
  return p.type === "cabinet" || (p.equipment || []).some((e) => e.type === "shelf") || crossConnectsAt(p.id).length > 0;
}

function crossConnectsAt(locId) {
  return plan.xconnects.filter((x) => x.at === locId);
}

function crossConnectFor(key) {
  const x = plan.xconnects.find((y) => y.a === key || y.b === key);
  return x ? { x, other: x.a === key ? x.b : x.a } : null;
}

function endpointOn(key, eqId) {
  return key.startsWith(`port:${eqId}:`) || key.startsWith(`split:${eqId}:`);
}

function findEquipment(eqId) {
  for (const p of plan.points) for (const e of p.equipment || []) if (e.id === eqId) return e;
  return null;
}

// Endpoints at a location, for the dropdowns.
function endpointsAt(locId) {
  const p = point(locId);
  const out = [];
  for (const eq of p.equipment || []) {
    if (eq.type === "shelf") {
      for (const card of eq.cards) for (const port of card.ports) {
        out.push({ value: `port:${eq.id}:${port.id}`, label: `${card.name}, port ${port.name}`, group: eq.name });
      }
    }
    if (eq.type === "splitter") {
      out.push({ value: `split:${eq.id}:in`, label: "Input", group: eq.name });
      for (let n = 1; n <= splitterPorts(eq); n++) out.push({ value: `split:${eq.id}:${n}`, label: `Output ${n}`, group: eq.name });
    }
  }
  const fibersOf = (c, where) => {
    const code = colorCode(c.fibers);
    for (const f of code) {
      out.push({ value: `fiber:${c.id}:${f.number}`, label: `#${f.number} ${tubeCount(c.fibers) > 1 ? f.tubeColor.name + " tube, " : ""}${f.fiberColor.name}`,
        group: `${c.name} (${where})` });
    }
  };
  const arriving = incomingCable(locId);
  if (arriving) fibersOf(cableStart(arriving), "incoming");
  for (const d of childCables(locId).filter((x) => !x.through)) fibersOf(d, "outgoing");
  return out;
}

function endpointLabel(key) {
  const [kind, id, sub] = key.split(":");
  if (kind === "fiber") {
    const c = plan.cables.find((x) => x.id === id);
    if (!c || Number(sub) > c.fibers) return "(removed fiber)";
    const f = colorCode(c.fibers)[Number(sub) - 1];
    return `${c.name} #${sub} (${tubeCount(c.fibers) > 1 ? f.tubeColor.name + " tube, " : ""}${f.fiberColor.name})`;
  }
  const eq = findEquipment(id);
  if (!eq) return "(removed equipment)";
  if (kind === "split") return `${eq.name} ${sub === "in" ? "input" : `output ${sub}`}`;
  for (const card of eq.cards || []) {
    const port = card.ports.find((x) => x.id === sub);
    if (port) return `${eq.name}, ${card.name}, port ${port.name}`;
  }
  return "(removed port)";
}

function endpointMissing(key) {
  return endpointLabel(key).startsWith("(removed");
}

function openCrossConnects(locId) {
  const p = point(locId);
  openForm(`Cross-connects at ${p.name}`, (body, foot) => {
    body.append(el("p", "hint", "Patch equipment ports, splitters and fibers to each other. They print with this location's splice sheet."));
    const listEl = el("div");
    body.append(listEl);
    renderList();

    function renderList() {
      listEl.innerHTML = "";
      const list = crossConnectsAt(locId);
      if (!list.length) {
        listEl.append(el("p", "hint", "No cross-connects yet."));
        return;
      }
      const table = el("table", "sheet-table");
      const head = el("tr");
      for (const h of ["From", "To", "Note", ""]) head.append(el("th", "", h));
      table.append(head);
      for (const x of list) {
        const tr = el("tr");
        const del = el("td");
        del.append(btnEl("Remove", () => {
          plan.xconnects = plan.xconnects.filter((y) => y !== x);
          savePlan();
          renderList();
          refresh();
        }, "btn ghost small danger"));
        tr.append(el("td", "", endpointLabel(x.a)), el("td", "", endpointLabel(x.b)), el("td", "", x.note || ""), del);
        table.append(tr);
      }
      listEl.append(table);
    }

    body.append(el("h4", "form-section", "Add a cross-connect"));
    const ends = endpointsAt(locId);
    if (!ends.length) {
      body.append(el("p", "hint", "Add a shelf or splitter, or a cable to or from here, to have something to patch."));
    }
    const a = selectEl([]);
    const b = selectEl([]);
    const note = inputEl("text", "", { placeholder: "optional" });
    const grid = el("div", "form-grid");
    grid.append(fieldEl("From", a), fieldEl("To", b), fieldEl("Note", note));
    const addError = el("p", "error");
    addError.hidden = true;
    body.append(grid, addError, btnEl("Add cross-connect", add, "btn"));
    refresh();

    // Endpoints already patched are shown but can't be picked again.
    function refresh() {
      const used = new Set(plan.xconnects.flatMap((x) => [x.a, x.b]));
      const opts = ends.map((o) => ({ ...o, disabled: used.has(o.value), label: used.has(o.value) ? `${o.label} (patched)` : o.label }));
      for (const s of [a, b]) {
        const keep = s.value;
        s.replaceChildren(...selectEl(opts).childNodes);
        const first = opts.find((o) => !o.disabled && (s === a || o.value !== a.value));
        s.value = keep && !used.has(keep) ? keep : first ? first.value : "";
      }
      if (b.value === a.value) {
        const next = opts.find((o) => !o.disabled && o.value !== a.value);
        if (next) b.value = next.value;
      }
    }

    function add() {
      addError.hidden = true;
      if (!a.value || !b.value) return;
      if (a.value === b.value) {
        addError.textContent = "From and To are the same.";
        addError.hidden = false;
        return;
      }
      plan.xconnects.push({ id: makeId(), at: locId, a: a.value, b: b.value, note: note.value.trim() });
      note.value = "";
      savePlan();
      renderList();
      refresh();
    }

    foot.append(btnEl("Done", finish, "btn big"));
  }, true);
  selectedId = locId;
  renderRoute();
}

// The cross-connects at a location as a table, for splice sheets.
function crossConnectTable(locId) {
  const list = crossConnectsAt(locId);
  if (!list.length) return null;
  const wrap = el("div", "xc-block");
  wrap.append(el("h4", "", "Cross-connects"));
  const table = el("table", "sheet-table splice-table");
  const head = el("tr");
  for (const h of ["From", "", "To", "Note", "Done"]) head.append(el("th", "", h));
  const thead = el("thead");
  thead.append(head);
  table.append(thead);
  for (const x of list) {
    const tr = el("tr");
    if (endpointMissing(x.a) || endpointMissing(x.b)) tr.className = "problem";
    tr.append(el("td", "strong", endpointLabel(x.a)), el("td", "", "⇄"), el("td", "strong", endpointLabel(x.b)),
      el("td", "", x.note || ""), el("td", "checkbox-cell", "☐"));
    table.append(tr);
  }
  wrap.append(table);
  return wrap;
}

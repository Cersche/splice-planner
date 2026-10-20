// Equipment at a location, from the stock templates in catalog.js:
// OLT shelves, patch panels, splice cases, terminals and splitters
// (several at a time, each on its own F2), plus anything else. Which
// kinds are offered depends on the location type. Also each location's
// details.

// Ports on a card-based item (shelf, panel, terminal).
function cardPorts(eq) {
  return (eq.cards || []).reduce((n, c) => n + c.ports.length, 0);
}

function hasCards(eq) {
  return Array.isArray(eq.cards);
}

function equipmentLabel(eq) {
  if (eq.type === "splitter") return eq.f2 ? `${eq.name} · ${f2Label(eq)}` : eq.name;
  if (hasCards(eq)) {
    return `${eq.name} · ${eq.cards.length} ${eq.cards.length === 1 ? "card" : "cards"}, ${cardPorts(eq)} ports`;
  }
  if (eq.type === "closure") return `${eq.name} · ${eq.trays} trays x ${eq.slots}`;
  return eq.name;
}

// Short form for the chips on a location card.
function equipmentChip(eq) {
  if (eq.type === "splitter") return `${eq.ratio}${eq.f2 ? ` · ${f2Label(eq)}` : ""}`;
  if (hasCards(eq)) return `${eq.name} · ${cardPorts(eq)}p`;
  if (eq.type === "closure") return `${eq.name} · ${eq.trays * eq.slots}sp`;
  return eq.name;
}

// --- Equipment dialog ---

function openEquipment(locId, startKind) {
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
      const pic = el("span", "eq-icon");
      pic.append(iconEl((EQ_KINDS[eq.type] || EQ_KINDS.other).icon));
      const title = el("div", "eq-name", eq.name);
      const sub = el("div", "eq-meta", [eq.model, eq.style, eq.type === "splitter" ? eq.ratio : ""].filter(Boolean).join(" · "));
      const text = el("div", "eq-text");
      text.append(title, sub);
      row.append(pic, text);
      const ph = phaseSelect(eq);
      if (ph) {
        ph.addEventListener("change", () => {
          eq.phase = ph.value;
          savePlan();
          renderRoute();
        });
        const phRow = el("label", "inline-field");
        phRow.append(el("span", "", "Phase"), ph);
        row.append(phRow);
      }
      if (eq.type === "splitter") {
        // F2: the app's next free fiber (locked), or a fiber picked by hand.
        const c = incomingCable(p.id);
        const max = c ? c.fibers : 432;
        const opts = [{ value: "", label: "Not set" }];
        for (let n = 1; n <= max; n++) {
          const problem = n === eq.f2 ? "" : f2Problem(p, eq, n);
          opts.push({ value: n, label: f2Text(n) + (problem ? " (in use)" : ""), disabled: !!problem });
        }
        const sel = selectEl(opts, eq.f2 || "");
        sel.addEventListener("change", () => {
          eq.f2 = sel.value ? Number(sel.value) : null;
          eq.f2Manual = true;
          savePlan();
          renderRoute();
          renderList();
        });
        const view = el("span", "auto-val mono", eq.f2 ? f2Label(eq) : "no free fiber");
        const f2Row = el("span", "inline-field");
        f2Row.append(el("span", "", "F2"), lockField(!eq.f2Manual, view, sel, (lock) => {
          eq.f2Manual = !lock;
          savePlan();
          renderRoute();
          renderList();
        }, "the F2 count"));
        const note = el("span", "field-hint", eq.f2 ? f2Hint(p, eq) : "F2 not set");
        row.append(f2Row, el("span", "eq-meta mono", `DS ${usedPorts(eq).size}/${splitterPorts(eq)}`), note);
      }
      if (eq.type === "closure") {
        const trays = inputEl("number", eq.trays, { min: 1, max: 48 });
        const slots = inputEl("number", eq.slots, { min: 1, max: 48 });
        const save = () => {
          eq.trays = Math.max(1, Number(trays.value) || 1);
          eq.slots = Math.max(1, Number(slots.value) || 1);
          savePlan();
          renderRoute();
        };
        trays.addEventListener("change", save);
        slots.addEventListener("change", save);
        const a = el("label", "inline-field");
        a.append(el("span", "", "Trays"), trays);
        const b = el("label", "inline-field");
        b.append(el("span", "", "Splices / tray"), slots);
        row.append(a, b);
      }
      const actions = el("div", "eq-actions");
      if (hasCards(eq)) actions.append(btnEl("Edit cards and ports", () => openCards(locId, eq.id), "btn ghost"));
      if (eq.type === "closure") actions.append(btnEl("Open splice case", () => openConnections(locId), "btn ghost"));
      actions.append(btnEl("Remove", () => {
        const onIt = plan.points.filter((h) => h.ds && h.ds.splitterId === eq.id);
        withUndo(`Removed ${eq.name}` + (onIt.length ? `. ${onIt.length} home${onIt.length === 1 ? " is" : "s are"} back on automatic counts.` : "."), () => {
          p.equipment = p.equipment.filter((x) => x.id !== eq.id);
          for (const h of onIt) {
            delete h.ds;
            h.dsManual = false;
          }
          for (const h of plan.points) if (h.tport && h.tport.eqId === eq.id) delete h.tport;
          dropEquipmentLinks(eq.id);
        });
        renderList();
      }, "btn ghost danger"));
      row.append(actions);
      return row;
    }

    // Add form: the kind, then a template (with a picture) or splitter size.
    body.append(el("h4", "form-section", "Add equipment"));
    const kinds = kindsFor(p);
    const kind = selectEl(kinds.map((k) => ({ value: k, label: EQ_KINDS[k].label })), kinds.includes(startKind) ? startKind : kinds[0]);
    const addGrid = el("div", "add-grid");
    const fields = el("div");
    const picBox = el("div", "pic-box");
    addGrid.append(fields, picBox);
    body.append(fieldEl("Equipment type", kind), addGrid);

    const template = selectEl([]);
    const name = inputEl("text", "");
    let nameTouched = false;
    name.addEventListener("input", () => (nameTouched = true));
    const ratio = selectEl(SPLITTER_RATIOS.map((r) => ({ value: r, label: r })), "1x32");
    const qty = inputEl("number", 1, { min: 1, max: 48 });
    const first = inputEl("number", nextFreeF2(p, { id: null }) || "", { min: 1 });
    // New splitters take the next free F2 fibers unless unlocked.
    let firstManual = false;
    const firstBox = el("div");
    const note = el("p", "hint");
    const addError = el("p", "error");
    addError.hidden = true;
    const add = btnEl("Add", addEquipment, "btn");

    function tmpl() {
      return templateById(template.value);
    }

    function renderFields() {
      fields.innerHTML = "";
      const k = kind.value;
      const list = templatesFor(k);
      if (list.length) {
        template.replaceChildren(...selectEl(list.map((t) => ({ value: t.id, label: t.label, group: t.group }))).childNodes);
        template.value = list[0].id;
        fields.append(fieldEl(k === "splitter" ? "Style" : "Template", template));
      }
      if (k === "splitter") {
        const g = el("div", "form-grid");
        g.append(fieldEl("Size", ratio), fieldEl("How many", qty), fieldEl("First F2", firstBox));
        fields.append(g);
        renderFirst();
      } else {
        fields.append(fieldEl("Name", name));
        nameTouched = false;
      }
      fields.append(note, addError, add);
      refresh();
    }

    function renderFirst() {
      firstBox.replaceChildren(lockField(!firstManual, el("span", "auto-val", "Next free fibers"), first, (lock) => {
        firstManual = !lock;
        renderFirst();
        refresh();
      }, "the first F2"));
    }

    function plannedF2() {
      const n = Math.max(1, Math.min(48, Number(qty.value) || 1));
      if (!firstManual || first.value === "") return { list: [], n };
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
      addError.hidden = true;
      const k = kind.value;
      const t = tmpl();
      picBox.replaceChildren(hardwarePicture(k, t));
      if (t && t.kind === k && !nameTouched && k !== "splitter") name.value = t.model || EQ_KINDS[k].label;
      if (k === "other" && !nameTouched) name.value = "";
      if (k === "splitter") {
        const planned = plannedF2();
        note.className = planned.error ? "error" : "hint";
        note.textContent = planned.error ? planned.error : planned.list.length
          ? `Adds ${planned.n} x ${ratio.value} on ${planned.list.map(f2Text).join(", ")}.`
          : firstManual ? `Adds ${planned.n} x ${ratio.value} with no F2 yet.`
            : `Adds ${planned.n} x ${ratio.value}. Their F2 counts fill in by themselves.`;
      } else if (k === "other") {
        note.textContent = "";
      } else {
        note.className = "hint";
        note.textContent = "Templates are a starting point. Check them against your gear, then edit.";
      }
    }
    kind.addEventListener("change", renderFields);
    [template, ratio, qty, first].forEach((x) => x.addEventListener("input", refresh));
    renderFields();

    function addEquipment() {
      const k = kind.value;
      if (k === "splitter") {
        const planned = plannedF2();
        if (planned.error) return;
        const t = tmpl();
        let n = splittersAt(p).length;
        for (let i = 0; i < planned.n; i++) {
          p.equipment.push({ id: makeId(), type: "splitter", ratio: ratio.value, style: t.style,
            name: `Splitter ${++n} (${ratio.value})`, f2: planned.list[i] || null, f2Manual: firstManual });
        }
        first.value = nextFreeF2(p, { id: null }) || "";
      } else if (k === "other") {
        if (!name.value.trim()) {
          addError.textContent = "Name the equipment.";
          addError.hidden = false;
          return;
        }
        p.equipment.push({ id: makeId(), type: "other", name: name.value.trim() });
      } else {
        const t = tmpl();
        const item = fromTemplate(t, name.value.trim() || t.model || EQ_KINDS[k].label);
        p.equipment.push(item);
        if (hasCards(item)) {
          savePlan();
          return openCards(locId, item.id);
        }
      }
      nameTouched = false;
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
function f2Hint(loc, eq) {
  const c = incomingCable(loc.id);
  if (!c) return `No cable arrives at ${loc.name}, so F2 is just a number here.`;
  const f = colorCode(c.fibers)[eq.f2 - 1];
  if (!f) return "";
  const here = `${c.name} #${eq.f2}: ${f.tubeColor.name} tube, ${f.fiberColor.name} fiber.`;
  // A terminal tail: say where it's spliced on the way back.
  const src = f2Source(eq);
  return src && src.traced ? `${here} Spliced to ${src.cable.name} #${src.n} upstream.` : here;
}

// --- Card and port editor (shelves, panels, terminals) ---

function openCards(locId, eqId) {
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
          const ids = new Set(card.ports.map((x) => x.id));
          withUndo(`Removed ${card.name} and its ${card.ports.length} port${card.ports.length === 1 ? "" : "s"}.`, () => {
            dropPortPatches(eq.id, ids);
            eq.cards.splice(eq.cards.indexOf(card), 1);
          });
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

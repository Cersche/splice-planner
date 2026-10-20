// Splice sheets: which fiber is spliced to which at every location,
// worked out from the route, splitters and counts.
//
// Everything a fiber carries is an "item": a home's own fiber
// (home:<id>), a splitter input (split-in:<id>) or a splitter output
// port (port:<splitter>:<n>). Starting at the far ends, each cable
// collects the items it must carry. A splitter output is made where the
// splitter is; anything else runs back to the start. Then each cable's
// fibers are numbered: splitter F2 fibers stay at their F2 number and
// everything else fills the free fibers in order.

function homeItem(h) {
  const s = homeSplitter(h);
  if (s && h.ds) return `port:${s.id}:${h.ds.port}`;
  if (s) return `port:${s.id}:auto-${h.id}`;
  return `home:${h.id}`;
}

function buildSpliceModel() {
  const needsCache = new Map();
  const assignCache = new Map();

  // What one physical cable must carry: { fixed: Map(fiber -> item), items: [] }.
  function needs(start) {
    if (needsCache.has(start.id)) return needsCache.get(start.id);
    const fixed = new Map();
    const items = [];
    for (const span of cableSpans(start)) {
      const m = point(span.to);
      if (m.type === "nid") items.push(homeItem(m));
      const here = splittersAt(m);
      for (const s of here) {
        if (s.f2 && s.f2 <= start.fibers && !fixed.has(s.f2)) fixed.set(s.f2, `split-in:${s.id}`);
        else items.push(`split-in:${s.id}`);
      }
      for (const d of childCables(m.id).filter((c) => !c.through)) {
        const sub = needs(d);
        for (const it of [...sub.fixed.values(), ...sub.items]) {
          // Splitter outputs come from the splitter, not this cable.
          if (here.some((s) => it.startsWith(`port:${s.id}:`))) continue;
          items.push(it);
        }
      }
    }
    const result = { fixed, items };
    needsCache.set(start.id, result);
    return result;
  }

  // Fiber number -> item for a physical cable, plus anything that didn't fit.
  function assign(start) {
    if (assignCache.has(start.id)) return assignCache.get(start.id);
    const { fixed, items } = needs(start);
    const map = new Map(fixed);
    const overflow = [];
    let pos = 1;
    for (const it of items) {
      while (map.has(pos)) pos++;
      if (pos > start.fibers) overflow.push(it);
      else map.set(pos, it);
    }
    const result = { map, overflow };
    assignCache.set(start.id, result);
    return result;
  }

  function fiberLabel(cable, n) {
    const f = colorCode(cable.fibers)[n - 1];
    const tube = tubeCount(cable.fibers) > 1 ? `${f.tubeColor.name} tube, ` : "";
    return { text: `${cable.name} #${n}`, colors: `${tube}${f.fiberColor.name}`, fiber: f.fiberColor, tube: f.tubeColor };
  }

  function splitterById(id) {
    for (const p of plan.points) for (const s of splittersAt(p)) if (s.id === id) return { s, p };
    return null;
  }

  // Who or what an item is for, in words.
  function describe(item) {
    const [kind, id] = item.split(":");
    if (kind === "home") return point(id) ? point(id).name : "home";
    if (kind === "split-in") {
      const hit = splitterById(id);
      return hit ? `Feeds ${hit.s.name} at ${hit.p.name}` : "splitter";
    }
    const home = plan.points.find((h) => h.type === "nid" && homeItem(h) === item);
    return home ? home.name : "spare port";
  }

  // Where an item comes from at location L.
  function source(L, item) {
    if (item.startsWith("port:")) {
      const [, sid, port] = item.split(":");
      const s = splittersAt(L).find((x) => x.id === sid);
      if (s) return { text: `${s.name} output ${port.startsWith("auto") ? "(no DS set)" : port}`, colors: "" };
    }
    const c = incomingCable(L.id);
    if (!c) return { text: `${L.name} (start)`, colors: "" };
    const start = cableStart(c);
    for (const [n, it] of assign(start).map) if (it === item) return fiberLabel(start, n);
    return { text: "Not on the incoming cable", colors: "", missing: true };
  }

  // Splice rows at one location.
  function rowsAt(locId) {
    const L = point(locId);
    const rows = [];
    const c = incomingCable(locId);
    for (const s of splittersAt(L)) {
      const from = s.f2 && c && s.f2 <= c.fibers ? fiberLabel(cableStart(c), s.f2) : source(L, `split-in:${s.id}`);
      rows.push({ from, to: { text: `${s.name} input`, colors: "" }, note: s.f2 ? `F2 ${s.f2}` : "F2 not set" });
    }
    for (const d of childCables(locId).filter((x) => !x.through)) {
      const { map } = assign(d);
      for (const n of [...map.keys()].sort((a, b) => a - b)) {
        const item = map.get(n);
        rows.push({ from: source(L, item), to: fiberLabel(d, n), note: describe(item) });
      }
    }
    const through = childCables(locId).filter((x) => x.through)
      .map((x) => `${x.name} ${THROUGH_LABELS[x.through]} here.`);
    return { rows, through };
  }

  return { needs, assign, rowsAt, describe };
}

// Locations that get a splice sheet: anything but a home with work on it.
function spliceLocations(model) {
  return plan.points.filter((p) => {
    if (p.type === "nid") return false;
    const { rows, through } = model.rowsAt(p.id);
    return rows.length || through.length;
  });
}

// One location's splice table, for the screen or the printed sheet.
function spliceTable(model, locId) {
  const { rows, through } = model.rowsAt(locId);
  const wrap = document.createElement("div");
  for (const t of through) {
    const p = document.createElement("p");
    p.className = "through-note";
    p.textContent = t;
    wrap.append(p);
  }
  if (!rows.length) return wrap;
  const table = document.createElement("table");
  table.className = "sheet-table splice-table";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>From</th><th>Color</th><th></th><th>To</th><th>Color</th><th>For</th><th>Done</th></tr>";
  table.append(thead);
  for (const r of rows) {
    const tr = document.createElement("tr");
    if (r.from.missing) tr.className = "problem";
    const cell = (text, cls) => {
      const td = document.createElement("td");
      if (cls) td.className = cls;
      td.textContent = text;
      return td;
    };
    const colorCell = (f) => {
      const td = cell("");
      if (f.tube && f.colors.includes("tube")) td.append(swatch(f.tube, true), document.createTextNode(" "));
      if (f.fiber) td.append(swatch(f.fiber, true), document.createTextNode(" "));
      td.append(document.createTextNode(f.colors));
      return td;
    };
    tr.append(cell(r.from.text, "strong"), colorCell(r.from), cell("→"), cell(r.to.text, "strong"),
      colorCell(r.to), cell(r.note), cell("☐", "checkbox-cell"));
    table.append(tr);
  }
  wrap.append(table);
  return wrap;
}

// --- On screen ---

const splicePanel = document.getElementById("splice-panel");

function openSpliceSheet(locId) {
  closeWizard();
  closeCable();
  closeImport();
  closeCounts();
  const model = buildSpliceModel();
  document.getElementById("splice-title").textContent = `Splice sheet: ${point(locId).name}`;
  const body = document.getElementById("splice-body");
  body.innerHTML = "";
  const t = spliceTable(model, locId);
  if (!t.childNodes.length) body.textContent = "Nothing is spliced here yet.";
  else body.append(t);
  splicePanel.hidden = false;
  splicePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeSplice() {
  splicePanel.hidden = true;
}

document.getElementById("splice-close").addEventListener("click", () => {
  closeSplice();
  selectedId = null;
  renderRoute();
});

// Field sheet: an 11x17 landscape page with a title block, the route
// diagram, every cable with its run and tube colors, and the homes.
// The browser's print dialog saves it as a PDF.

const sheet = document.getElementById("print-sheet");

// Printable width of 17in minus margins, in CSS pixels.
const PRINT_WIDTH_PX = 16.2 * 96;
const PRINT_HEIGHT_PX = 10.2 * 96;
// Below this the map gets too small to read, so homes collapse to counts.
const MIN_MAP_SCALE = 0.6;

// Height left for the map on each extra map sheet, under its label.
const TILE_HEIGHT_PX = 9.6 * 96;

const printPanel = document.getElementById("print-panel");

function printMode() {
  return plan.printMode === "tiles" ? "tiles" : "fit";
}

document.getElementById("print-plan").addEventListener("click", () => {
  closeMenu();
  closeWizard();
  closeCable();
  closeImport();
  closeCounts();
  closeSplice();
  closeCheck();
  selectedId = null;
  renderRoute();
  renderPrintModes();
  printPanel.hidden = false;
  printPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

function renderPrintModes() {
  document.querySelectorAll("[data-print-mode]").forEach((b) =>
    b.classList.toggle("secondary", b.dataset.printMode !== printMode()));
  buildSheet();
  const tiles = sheet.querySelectorAll(".map-tile").length;
  document.getElementById("print-mode-note").textContent = printMode() === "tiles"
    ? `This job's map takes ${tiles} extra sheet${tiles === 1 ? "" : "s"} at full size.`
    : "";
}

document.querySelectorAll("[data-print-mode]").forEach((b) =>
  b.addEventListener("click", () => {
    plan.printMode = b.dataset.printMode;
    savePlan();
    renderPrintModes();
  }));

function closePrint() {
  printPanel.hidden = true;
}

document.getElementById("print-cancel").addEventListener("click", closePrint);
document.getElementById("print-go").addEventListener("click", () => {
  buildSheet();
  window.print();
});

// Ctrl+P should give the same sheet.
window.addEventListener("beforeprint", () => {
  if (plan) buildSheet();
});

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function buildSheet() {
  sheet.innerHTML = "";

  // Title block, with blanks the crew fills in by hand.
  const head = el("header", "sheet-head");
  const title = el("div", "sheet-title");
  title.append(el("h1", "", "Splice Plan"), el("div", "sheet-sub", `Starts at ${plan.points[0].name}`));
  const fields = el("div", "sheet-fields");
  for (const f of ["Job #", "Tech", "Date"]) {
    const field = el("div", "field");
    field.append(el("span", "", f), el("span", "blank"));
    fields.append(field);
  }
  const printed = el("div", "sheet-printed", `Printed ${new Date().toLocaleDateString()}`);
  head.append(title, fields, printed);

  // Route diagram. Homes are grouped into one box per location so a big
  // job stays readable; if it still won't fit, the boxes show counts only.
  const diagram = el("div", "sheet-diagram");
  const tiles = el("div", "map-tiles");
  sheet.append(head, problemsBlock(), diagram, tiles, cableTable(), splitterTable(), homesTable(), legend(), spliceSheets());

  for (const compact of [false, true]) {
    const tree = el("div", "route-tree");
    tree.append(printBranch(plan.points[0], compact));
    diagram.innerHTML = "";
    diagram.append(tree);
    if (compact) diagram.append(el("p", "map-note", "Each home is listed in the Homes table."));

    // Measure off-screen at print size, then scale to fit page 1.
    sheet.classList.add("measuring");
    const room = PRINT_HEIGHT_PX - head.offsetHeight - sheet.querySelector(".sheet-problems").offsetHeight - 100;
    const scale = Math.min(1, PRINT_WIDTH_PX / tree.scrollWidth, room / tree.scrollHeight);
    sheet.classList.remove("measuring");
    tree.style.zoom = scale < 1 ? String(scale) : "";
    if (scale >= MIN_MAP_SCALE) break;
  }

  if (printMode() === "tiles") buildTiles(tiles, diagram);
}

// The full-size map cut into page-sized pieces, each labeled with where
// it sits, with a little overlap so the pieces line up.
function buildTiles(tiles, diagram) {
  const full = el("div", "route-tree");
  full.append(printBranch(plan.points[0], false));
  const holder = el("div", "tile-measure");
  holder.append(full);
  tiles.append(holder);
  sheet.classList.add("measuring");
  const W = full.scrollWidth;
  const H = full.scrollHeight;
  sheet.classList.remove("measuring");
  holder.remove();

  const overlap = 0.4 * 96;
  const stepX = PRINT_WIDTH_PX - overlap;
  const stepY = TILE_HEIGHT_PX - overlap;
  const cols = Math.max(1, Math.ceil((W - overlap) / stepX));
  const rows = Math.max(1, Math.ceil((H - overlap) / stepY));
  const total = cols * rows;
  diagram.append(el("p", "map-note", `Full-size map follows on ${total} sheet${total === 1 ? "" : "s"} ` +
    `(${rows} row${rows === 1 ? "" : "s"} by ${cols} column${cols === 1 ? "" : "s"}, left to right).`));

  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      n++;
      const tile = el("section", "map-tile");
      tile.append(el("div", "tile-label",
        `Map sheet ${n} of ${total}: row ${r + 1}, column ${c + 1}` +
        (c > 0 ? " · continues from the left" : "") + (c < cols - 1 ? " · continues right" : "") +
        (r < rows - 1 ? " · continues below" : "")));
      const view = el("div", "tile-view");
      const piece = full.cloneNode(true);
      piece.style.left = `${-c * stepX}px`;
      piece.style.top = `${-r * stepY}px`;
      view.append(piece);
      tile.append(view);
      tiles.append(tile);
    }
  }
}

// Like the on-screen route, but a location's homes share one box.
function printBranch(p, compact) {
  const branch = el("div", "branch");
  const stop = stopEl(p);
  stop.classList.remove("selected");
  branch.append(stop);
  const cables = childCables(p.id);
  const homeCables = cables.filter((c) => !c.through && point(c.to).type === "nid" && !childCables(c.to).length);
  const others = cables.filter((c) => !homeCables.includes(c));
  const rows = others.map((c) => [cableEl(c), printBranch(point(c.to), compact)]);
  if (homeCables.length === 1) rows.push([cableEl(homeCables[0]), stopEl(point(homeCables[0].to))]);
  else if (homeCables.length > 1) rows.push([dropsEl(homeCables), homeGroup(homeCables, compact)]);
  if (rows.length) {
    const kids = el("div", "children");
    for (const r of rows) {
      const child = el("div", "child");
      child.append(...r);
      kids.append(child);
    }
    branch.append(kids);
  }
  return branch;
}

function dropsEl(drops) {
  const wrap = el("div", "cable");
  const sizes = [...new Set(drops.map((c) => c.fibers))].map((n) => `${n}F`).join("/");
  wrap.append(el("div", "cable-name", `${drops.length} drops`), el("div", "cable-size", sizes), el("div", "line"));
  return wrap;
}

function homeGroup(drops, compact) {
  const box = el("div", "stop nid home-group");
  box.append(el("div", "type", "Customer NIDs"), el("div", "name", `${drops.length} homes`));
  const homes = drops.map((c) => point(c.to));
  if (compact) {
    const ds = homes.filter((h) => h.ds && homeSplitter(h)).map((h) => h.ds.port).sort((a, b) => a - b);
    const f2 = [...new Set(homes.map((h) => homeF2(h)).filter(Boolean).map((s) => s.f2))];
    if (f2.length) box.append(el("div", "group-line", `F2 ${f2.join(", ")}`));
    if (ds.length) box.append(el("div", "group-line", `DS ${ds[0]}-${ds[ds.length - 1]}`));
    return box;
  }
  const table = el("table", "group-table");
  for (const h of homes) {
    const tr = el("tr");
    const f2 = homeF2(h);
    tr.append(
      el("td", "addr", hasAddress(h) ? h.name + (h.lot ? ` (Lot ${h.lot})` : "") : lotName(h.lot)),
      el("td", "", f2 ? `F2 ${f2.f2}` : ""),
      el("td", "", h.ds && homeSplitter(h) ? `DS ${h.ds.port}` : ""),
    );
    table.append(tr);
  }
  box.append(table);
  return box;
}

// Troubleshooter results, so a crew never gets a sheet with known problems
// without being told.
function problemsBlock() {
  const found = checkPlan().filter((f) => f.level === "problem");
  const wrap = el("section", "sheet-problems");
  if (!found.length) return wrap;
  wrap.append(el("h2", "", `Open problems (${found.length}): check with the planner before working`));
  const ul = el("ul");
  for (const f of found) ul.append(el("li", "", f.text));
  wrap.append(ul);
  return wrap;
}

// A splice sheet for every location that has splicing, each kept whole.
function spliceSheets() {
  const model = buildSpliceModel();
  const wrap = el("section", "sheet-splices");
  const locs = spliceLocations(model);
  if (!locs.length) return wrap;
  wrap.append(el("h2", "sheet-splices-title", "Splice sheets"));
  for (const loc of locs) {
    const block = el("div", "splice-block");
    block.append(el("h3", "", `${loc.name} (${typeLabel(loc.type)})`), spliceTable(model, loc.id));
    wrap.append(block);
  }
  return wrap;
}

// One row per physical cable, not per span.
function cableTable() {
  const wrap = el("section", "sheet-block");
  wrap.append(el("h2", "", "Cables"));
  const table = el("table", "sheet-table");
  const head = el("tr");
  for (const h of ["Cable", "Size", "From", "To", "Via", "Buffer tubes"]) head.append(el("th", "", h));
  const thead = el("thead");
  thead.append(head);
  table.append(thead);

  const starts = plan.cables.filter((c) => !c.through && !isDrop(c));
  for (const c of starts) {
    const spans = cableSpans(c);
    const tr = el("tr");
    const via = spans.slice(1).map((s) => `${point(s.from).name} (${THROUGH_LABELS[s.through]})`).join(", ");
    const tubes = el("td", "tube-cell");
    for (let t = 0; t < tubeCount(c.fibers); t++) {
      const color = colorAt(t);
      const tube = el("span", "tube-tag");
      tube.append(swatch(color, true), document.createTextNode(` ${t + 1} ${color.name}`));
      tubes.append(tube);
    }
    tr.append(
      el("td", "strong", c.name),
      el("td", "", `${c.fibers}F`),
      el("td", "", point(spans[0].from).name),
      el("td", "", point(spans[spans.length - 1].to).name),
      el("td", "", via || "—"),
      tubes,
    );
    table.append(tr);
  }
  if (!starts.length) wrap.append(el("p", "", "No cables yet."));
  else wrap.append(table);
  return wrap;
}

function splitterTable() {
  const rows = [];
  for (const p of plan.points) for (const s of splittersAt(p)) rows.push({ p, s });
  const wrap = el("section", "sheet-block");
  if (!rows.length) return wrap;
  wrap.append(el("h2", "", "Splitters"));
  const table = el("table", "sheet-table");
  const thead = el("thead");
  const head = el("tr");
  for (const h of ["Location", "Splitter", "F2", "F2 fiber color", "DS ports used"]) head.append(el("th", "", h));
  thead.append(head);
  table.append(thead);
  for (const { p, s } of rows) {
    const tr = el("tr");
    tr.append(
      el("td", "", p.name),
      el("td", "strong", s.name),
      el("td", "strong", s.f2 ? String(s.f2) : "not set"),
      el("td", "", f2Colors(s) || "—"),
      el("td", "", `${usedPorts(s).size} of ${splitterPorts(s)}`),
    );
    table.append(tr);
  }
  wrap.append(table);
  return wrap;
}

// Drops to homes go in the homes table instead.
function isDrop(c) {
  const to = point(c.to);
  return to && to.type === "nid" && !c.through;
}

function homesTable() {
  const homes = plan.points.filter((p) => p.type === "nid");
  const wrap = el("section", "sheet-block");
  wrap.append(el("h2", "", `Homes (${homes.length})`));
  if (!homes.length) {
    wrap.append(el("p", "", "No homes yet."));
    return wrap;
  }
  const table = el("table", "sheet-table homes");
  const head = el("tr");
  for (const h of ["#", "Address", "Lot", "Fed from", "Drop", "Fibers", "F2", "DS", "Done"]) head.append(el("th", "", h));
  const thead = el("thead");
  thead.append(head);
  table.append(thead);
  homes.forEach((h, i) => {
    const c = incomingCable(h.id);
    const tr = el("tr");
    tr.append(
      el("td", "", String(i + 1)),
      el("td", "strong", hasAddress(h) ? h.name : "No address yet"),
      el("td", "strong", h.lot || "—"),
      el("td", "", c ? point(c.from).name : "—"),
      el("td", "", c ? c.name : "—"),
      el("td", "", c ? `${c.fibers}F` : "—"),
      el("td", "strong", homeF2(h) ? String(homeF2(h).f2) : "—"),
      el("td", "strong", h.ds && homeSplitter(h) ? String(h.ds.port) : "—"),
      el("td", "checkbox-cell", "☐"),
    );
    table.append(tr);
  });
  wrap.append(table);
  return wrap;
}

// Color order key for fibers and tubes.
function legend() {
  const wrap = el("section", "sheet-block legend");
  wrap.append(el("h2", "", "Color code (TIA-598): fibers 1-12 in each tube, tubes in the same order"));
  const row = el("div", "legend-row");
  TIA_COLORS.forEach((c, i) => {
    const item = el("span", "legend-item");
    item.append(el("b", "", String(i + 1)), swatch(colorAt(i)), document.createTextNode(c.name));
    row.append(item);
  });
  wrap.append(row, el("p", "legend-note", "Tubes 13-24 repeat the order with a black stripe (white stripe on the black tube)."));
  return wrap;
}

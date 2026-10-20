// Field sheets, 11x17 landscape, printed or saved as a PDF from the
// browser's print dialog:
//   1. the route overview (title block, open problems, the whole route)
//   2. one "Big Picture" page per splice location: a large drawing of the
//      stop with every splice as a numbered orange bubble, a checklist
//      keyed to the bubbles, and the homes it feeds
//   3. summary tables (cables, splitters, conduit, homes, color code)
// plus, if wanted, the route map full size across several sheets.

const sheet = document.getElementById("print-sheet");

// Printable width of 17in minus margins, in CSS pixels.
const PRINT_WIDTH_PX = 16.2 * 96;
const PRINT_HEIGHT_PX = 10.2 * 96;
// Below this the map gets too small to read, so homes collapse to counts.
const MIN_MAP_SCALE = 0.6;

// Height left for the map on each extra map sheet, under its label.
const TILE_HEIGHT_PX = 9.6 * 96;

const printPanel = document.getElementById("print-panel");
const PRINT_PARTS = ["overview", "locations", "summary", "tiles"];

function printParts() {
  const saved = plan.print || {};
  return { overview: true, locations: true, summary: true, tiles: plan.printMode === "tiles", ...saved };
}

document.getElementById("print-plan").addEventListener("click", (e) => {
  e.stopPropagation();
  closeMenu();
  closePanels();
  selectedId = null;
  renderRoute();
  renderPrintParts();
  document.getElementById("print-blocked").hidden = !printBlocked();
  printPanel.hidden = false;
});

const partBoxes = document.querySelectorAll("[data-print-part]");

function renderPrintParts() {
  const parts = printParts();
  for (const b of partBoxes) b.checked = !!parts[b.dataset.printPart];
  buildSheet();
  const locs = sheet.querySelectorAll(".loc-page").length;
  const tiles = sheet.querySelectorAll(".map-tile").length;
  const bits = [];
  if (parts.locations) bits.push(`${locs} splice location page${locs === 1 ? "" : "s"}`);
  if (parts.tiles) bits.push(`${tiles} map sheet${tiles === 1 ? "" : "s"}`);
  document.getElementById("print-mode-note").textContent = bits.length ? `This job prints ${bits.join(" and ")}.` : "";
}

for (const b of partBoxes) {
  b.addEventListener("change", () => {
    const parts = printParts();
    parts[b.dataset.printPart] = b.checked;
    if (!PRINT_PARTS.some((k) => parts[k])) parts.overview = true;
    plan.print = parts;
    delete plan.printMode;
    savePlan();
    renderPrintParts();
  });
}

function closePrint() {
  printPanel.hidden = true;
}

registerPanel(printPanel, closePrint);
document.getElementById("print-cancel").addEventListener("click", closePrint);
// Inside a preview frame (like the Claude app) the browser won't print.
const SITE_URL = "https://bkirsche.github.io/splice-planner/";
function printBlocked() {
  try {
    return window.self !== window.top && !location.href.startsWith(SITE_URL);
  } catch {
    return true;
  }
}

document.getElementById("print-go").addEventListener("click", () => {
  if (printBlocked()) {
    document.getElementById("print-blocked").hidden = false;
    return;
  }
  buildSheet();
  window.print();
});

// Ctrl+P should give the same sheets.
window.addEventListener("beforeprint", () => {
  if (plan) buildSheet();
});

// Job #, Tech and Date blanks the crew fills in by hand.
function blanks() {
  const fields = el("div", "sheet-fields");
  for (const f of ["Job #", "Tech", "Date"]) {
    const field = el("div", "field");
    field.append(el("span", "", f), el("span", "blank"));
    fields.append(field);
  }
  return fields;
}

// Fiber Fast Homes logo for the title block on every sheet (the
// original, dark-text version: prints are white).
function brandEl(cls = "") {
  const img = document.createElement("img");
  img.className = "sheet-logo" + (cls ? " " + cls : "");
  img.src = "assets/logo.png";
  img.alt = "Fiber Fast Homes";
  return img;
}

function printedLine() {
  return `Printed ${new Date().toLocaleDateString()}${isGuest() ? "" : ` by ${currentUser()}`}`;
}

function buildSheet() {
  sheet.innerHTML = "";
  const parts = printParts();
  const model = buildSpliceModel();
  // Places where a cable only passes through show on the overview, not
  // on a page of their own.
  const locs = parts.locations ? spliceLocations(model).filter((p) =>
    model.rowsAt(p.id).rows.some(rowPhaseShown) || crossConnectsAt(p.id).some(phaseShown)) : [];
  // Location pages follow the overview and any map sheets.
  const pageOf = new Map(locs.map((p, i) => [p.id, i + 1]));

  if (parts.overview || parts.tiles) {
    const page = el("section", "print-page overview-page");
    const head = el("header", "sheet-head");
    const title = el("div", "sheet-title");
    const start = plan.points[0];
    const v = viewIdx();
    const sub = [plan.title ? "Splice plan" : "", v !== null ? `${phaseName(v)} (earlier phases marked existing)` : hasPhases() ? "All phases" : "",
      `Starts at ${start.name}`].filter(Boolean).join(" · ");
    title.append(el("h1", "", plan.title || "Splice Plan"), el("div", "sheet-sub", sub));
    const who = authorLine();
    if (who) title.append(el("div", "sheet-detail", who));
    for (const line of detailLines(start)) title.append(el("div", "sheet-detail", line));
    head.append(brandEl(), title, blanks(), el("div", "sheet-printed", printedLine()));
    const diagram = el("div", "sheet-diagram");
    page.append(head, problemsBlock(), diagram);
    if (locs.length) title.append(el("div", "sheet-detail", `${locs.length} splice location page${locs.length === 1 ? "" : "s"} follow: the black "Page" tag on each card.`));
    sheet.append(page);
    for (const compact of [false, true]) {
      const tree = el("div", "route-tree");
      tree.append(printBranch(plan.points[0], compact, model, pageOf));
      diagram.innerHTML = "";
      diagram.append(tree);
      if (compact) diagram.append(el("p", "map-note", "Each location's homes are listed on its page and in the Homes table."));
      // Measure off-screen at print size, then scale to fit the page.
      sheet.classList.add("measuring");
      const used = head.offsetHeight + page.querySelector(".sheet-problems").offsetHeight;
      const room = PRINT_HEIGHT_PX - used - 90;
      const scale = Math.min(1, PRINT_WIDTH_PX / tree.scrollWidth, room / tree.scrollHeight);
      drawWires(tree);
      sheet.classList.remove("measuring");
      tree.style.zoom = scale < 1 ? String(scale) : "";
      if (scale >= MIN_MAP_SCALE) break;
    }
    if (!parts.overview) page.hidden = true;
    if (parts.tiles) {
      const tiles = el("div", "map-tiles");
      sheet.append(tiles);
      buildTiles(tiles, diagram, model);
    }
  }

  locs.forEach((loc, i) => sheet.append(locationPage(model, loc, i + 1, locs.length)));

  if (parts.summary) {
    const page = el("section", "print-page summary-page");
    const head = el("header", "sheet-head small");
    head.append(brandEl("small"), el("h2", "", `${plan.title || "Splice plan"}: summary`), el("div", "sheet-printed", printedLine()));
    page.append(head, detailsTable(), cableTable(model), pathTable(), splitterTable(), homesTable(), legend());
    sheet.append(page);
  }
}

// The full-size map cut into page-sized pieces, each labeled with where
// it sits, with a little overlap so the pieces line up.
function buildTiles(tiles, diagram, model) {
  const full = el("div", "route-tree");
  full.append(printBranch(plan.points[0], false, model));
  const holder = el("div", "tile-measure");
  holder.append(full);
  tiles.append(holder);
  sheet.classList.add("measuring");
  const W = full.scrollWidth;
  const H = full.scrollHeight;
  drawWires(full);
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
      const label = el("div", "tile-label");
      label.append(brandEl("tiny"));
      tile.append(label);
      label.append(el("span", "",
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
function printBranch(p, compact, model, pageOf) {
  const branch = el("div", "branch");
  const stop = stopEl(p);
  stop.classList.remove("selected");
  // Which location page to turn to.
  if (pageOf && pageOf.has(p.id)) {
    let chips = stop.querySelector(".chips");
    if (!chips) {
      chips = el("span", "chips");
      stop.append(chips);
    }
    chips.prepend(el("span", "chip page-chip", `Page ${pageOf.get(p.id)}`));
  }
  branch.append(stop);
  const paths = shownPaths(p.id);
  const homePaths = paths.filter((x) => {
    const c = pathCable(x);
    return point(x.to).type === "nid" && !childPaths(x.to).length && !(c && c.through);
  });
  const others = paths.filter((x) => !homePaths.includes(x));
  const rows = others.map((x) => [pathEl(x, model), printBranch(point(x.to), compact, model, pageOf)]);
  if (homePaths.length === 1) rows.push([pathEl(homePaths[0], model), stopEl(point(homePaths[0].to))]);
  else if (homePaths.length > 1) rows.push([dropsEl(homePaths), homeGroup(homePaths, compact)]);
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

function dropsEl(paths) {
  const wrap = el("div", "cable drop" + (paths.some(pathCable) ? "" : " empty"));
  const cables = paths.map(pathCable).filter(Boolean);
  wrap.style.setProperty("--wire", wireColor(cables[0]));
  const sizes = [...new Set(cables.map((c) => c.fibers))].map((n) => `${n}F`).join("/");
  wrap.append(el("div", "cable-name", `${cables.length} drops`), el("div", "cable-size", sizes || "no drops yet"), el("div", "line"));
  return wrap;
}

function homeGroup(paths, compact) {
  const box = el("div", "stop nid home-group");
  box.append(el("div", "type", "Customer NIDs"), el("div", "name", `${paths.length} homes`));
  const homes = paths.map((x) => point(x.to));
  if (compact) {
    const ds = homes.filter((h) => homeDs(h)).map((h) => dsNumber(h)).sort((a, b) => a - b);
    const f2 = [...new Set(homes.map((h) => homeF2(h)).filter(Boolean).map(f2Label))];
    if (f2.length) box.append(el("div", "group-line", f2.join(", ")));
    if (ds.length) box.append(el("div", "group-line", `${countScheme().dsPrefix}${ds[0]}-${ds[ds.length - 1]}`));
    return box;
  }
  const table = el("table", "group-table");
  for (const h of homes) {
    const tr = el("tr");
    const f2 = homeF2(h);
    tr.append(
      el("td", "addr", hasAddress(h) ? h.name + (h.lot ? ` (Lot ${h.lot})` : "") : lotName(h.lot)),
      el("td", "", f2 ? f2Label(f2) : ""),
      el("td", "", homeDs(h)),
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

// One row per physical cable, not per span.
function cableTable(model) {
  const wrap = el("section", "sheet-block");
  wrap.append(el("h2", "", "Cables"));
  const table = el("table", "sheet-table");
  const head = el("tr");
  for (const h of ["Cable", "Type", "Size", "From", "To", "Via", "Fibers used", "Buffer tubes"]) head.append(el("th", "", h));
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
      el("td", "", CABLE_KINDS[cableKind(c)]),
      el("td", "", `${c.fibers}F`),
      el("td", "", point(spans[0].from).name),
      el("td", "", point(spans[spans.length - 1].to).name),
      el("td", "", via || "—"),
      el("td", "wrap", cableNote(model, c) || "—"),
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
      el("td", "strong", s.f2 ? f2CellFor(s) : "not set"),
      el("td", "", f2Colors(s) || "—"),
      el("td", "", `${usedPorts(s).size} of ${splitterPorts(s)}`),
    );
    table.append(tr);
  }
  wrap.append(table);
  return wrap;
}

// Paths with conduit or footage.
function pathTable() {
  const rows = plan.paths.filter((x) => conduitLabel(x.conduit));
  const wrap = el("section", "sheet-block");
  if (!rows.length) return wrap;
  wrap.append(el("h2", "", "Paths and conduit"));
  const table = el("table", "sheet-table");
  const thead = el("thead");
  const head = el("tr");
  for (const h of ["From", "To", "Conduit", "Ducts", "Color", "Footage", "Cable"]) head.append(el("th", "", h));
  thead.append(head);
  table.append(thead);
  for (const x of rows) {
    const cd = x.conduit;
    const c = pathCable(x);
    const tr = el("tr");
    tr.append(el("td", "", point(x.from).name), el("td", "", point(x.to).name), el("td", "strong", cd.size || "—"),
      el("td", "", cd.size ? String(cd.ducts || 1) : "—"), el("td", "", cd.color || "—"),
      el("td", "", cd.footage ? `${cd.footage} ft` : "—"), el("td", "", c ? `${c.name} (${c.fibers}F)` : "none"));
    table.append(tr);
  }
  wrap.append(table);
  return wrap;
}

// Cabinet and location details.
function detailsTable() {
  const rows = plan.points.filter((p) => detailLines(p).length);
  const wrap = el("section", "sheet-block");
  if (!rows.length) return wrap;
  wrap.append(el("h2", "", "Location details"));
  const table = el("table", "sheet-table");
  const thead = el("thead");
  const head = el("tr");
  for (const h of ["Location", "Type", "Details"]) head.append(el("th", "", h));
  thead.append(head);
  table.append(thead);
  for (const p of rows) {
    const tr = el("tr");
    tr.append(el("td", "strong", p.name), el("td", "", typeLabel(p.type)), el("td", "wrap", detailLines(p).join(" · ")));
    table.append(tr);
  }
  wrap.append(table);
  return wrap;
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
  for (const h of ["#", "Address", "Lot", "Fed from", "Drop", "Fibers", "F2", "DS", "Terminal port", "Done"]) head.append(el("th", "", h));
  const thead = el("thead");
  thead.append(head);
  table.append(thead);
  homes.forEach((h, i) => {
    const c = incomingCable(h.id);
    const path = incomingPath(h.id);
    const tr = el("tr");
    tr.append(
      el("td", "", String(i + 1)),
      el("td", "strong", hasAddress(h) ? h.name : "No address yet"),
      el("td", "strong", h.lot || "—"),
      el("td", "", path ? point(path.from).name : "—"),
      el("td", "", c ? c.name : "—"),
      el("td", "", c ? `${c.fibers}F` : "—"),
      el("td", "strong", homeF2(h) ? f2CellFor(homeF2(h)) : "—"),
      el("td", "strong", homeDs(h) ? dsCell(h) : "—"),
      el("td", "", homeTerminalPort(h) ? homeTerminalPort(h).text : "—"),
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

// --- One page per splice location: "Big Picture" ---
// A large drawing of the stop: the cable coming in as a bundle with its
// buffer tubes, the splice case, splitters, cables leaving and the drops
// to homes. Every splice is counted, and each group of splices gets an
// orange bubble with its numbers. Under the drawing, a checklist keyed
// to the bubbles and the homes fed from here.

const PIC_W = 1540;
const INK = "#1b1f24";
const INK_2 = "#4d5560";
const BUBBLE = "#f08a00";
const SPLIT_INK = "#2e7d4f";
const FONT = "IBM Plex Sans, Arial, sans-serif";

function svgEl(tag, attrs = {}, text) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

// A line color that shows on white paper.
function inkFor(color) {
  const base = color.name.split("/")[0];
  if (base === "White") return "#b9b9b9";
  if (base === "Yellow") return "#d8b800";
  return color.hex;
}

// "5–12", or "1, 3, 7"
function numText(nums) {
  const runs = [];
  for (const n of [...nums].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  }
  return runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ");
}

function locationPage(model, L, n, total) {
  const page = el("section", "print-page loc-page");
  const top = el("header", "loc-top");
  const badge = el("div", "loc-badge");
  badge.style.setProperty("--c", locMeta(L).color);
  badge.append(iconEl(locMeta(L).icon));
  const names = el("div", "loc-names");
  const closure = closureAt(L);
  const sub = [typeLabel(L.type), plan.title || "", closure ? closure.name + (closure.model && closure.model !== closure.name ? ` (${closure.model})` : "") : "",
    hasPhases() ? phaseName(phaseIdx(L)) : ""].filter(Boolean).join(" · ");
  names.append(el("h2", "", L.name), el("div", "loc-sub", sub));
  const lines = detailLines(L);
  if (lines.length) names.append(el("div", "loc-sub", lines.join(" · ")));
  const meta = el("div", "loc-meta");
  meta.append(blanks(), el("b", "", `Location ${n} of ${total}`));
  top.append(badge, names, meta, brandEl("small"));

  const all = model.rowsAt(L.id);
  const rows = all.rows.filter(rowPhaseShown);
  rows.forEach((r, i) => (r.num = i + 1));
  const pic = el("div", "loc-pic");
  pic.append(bigPicture(L, rows));
  const bottom = el("div", "loc-bottom");
  bottom.append(checklist(L, rows), homesHereTable(L));
  page.append(top, pic, bottom);
  return page;
}

function bigPicture(L, rows) {
  const arriving = incomingCable(L.id);
  const inCable = arriving && cableStart(arriving);
  const outs = childCables(L.id).filter((c) => !c.through && !isDrop(c) && phaseShown(point(c.to)));
  const throughs = childCables(L.id).filter((c) => c.through && phaseShown(point(c.to)));
  const drops = childCables(L.id).filter((c) => isDrop(c) && phaseShown(point(c.to)));
  const splitters = splittersAt(L).filter(phaseShown);

  // --- Sizes ---
  const bundleH = (fibers) => Math.max(34, Math.min(150, tubeCount(fibers) * 10 + 14));
  const rightItems = [...outs.map((c) => ({ c, kind: "out" })), ...throughs.map((c) => ({ c, kind: "through" }))];
  const dropCols = drops.length > 14 ? 2 : 1;
  const dropRows = Math.ceil(drops.length / dropCols);
  const rightH = rightItems.reduce((h, it) => h + bundleH(it.c.fibers) + 44, 0) + (drops.length ? 34 + dropRows * 22 : 0);
  const inH = inCable ? Math.max(50, Math.min(230, tubeCount(inCable.fibers) * 13 + 16)) : 60;
  const splitH = splitters.length * 78;
  const H = Math.max(340, rightH + 50, splitH + 140, inH + 150);

  const svg = svgEl("svg", { viewBox: `0 0 ${PIC_W} ${H}`, class: "big-pic", role: "img" });
  svg.style.height = `${(H / PIC_W) * 16.2}in`;
  const lines = svgEl("g");
  const marks = svgEl("g");
  const text = (x, y, t, attrs = {}) => svgEl("text", { x, y, "font-family": FONT, "font-size": 16, fill: INK, ...attrs }, t);

  // --- The case ---
  const CX0 = 540;
  const CX1 = 1010;
  svg.append(svgEl("rect", { x: CX0, y: 14, width: CX1 - CX0, height: H - 28, rx: 26, fill: "#fff", stroke: INK, "stroke-width": 4 }));
  const caseTitle = isCabinet(L) ? `${L.name} cabinet` : closureAt(L) ? closureAt(L).name : `Splices at ${L.name}`;
  svg.append(text((CX0 + CX1) / 2, 48, caseTitle, { "text-anchor": "middle", "font-weight": 800, "font-size": 21 }));

  // --- Cable in ---
  const inTop = Math.max(84, H * 0.42 - inH / 2);
  const usedIn = new Set(rows.filter((r) => r.src && r.src.kind === "fiber").map((r) => Math.ceil(r.src.n / 12)));
  let stripeY = () => inTop + inH / 2;
  if (inCable) {
    const T = tubeCount(inCable.fibers);
    const step = (inH - 16) / T;
    stripeY = (t) => inTop + 8 + (t - 1) * step + step / 2;
    svg.append(svgEl("rect", { x: 24, y: inTop, width: CX0 - 24 + 6, height: inH, rx: Math.min(inH / 2, 40), fill: "#e9e5dc", stroke: INK, "stroke-width": 3 }));
    for (let t = 1; t <= T; t++) {
      const c = colorAt(t - 1);
      svg.append(svgEl("rect", { x: 48, y: stripeY(t) - Math.min(5, step * 0.38), width: CX0 - 62, height: Math.min(10, step * 0.76),
        rx: 4, fill: inkFor(c), opacity: usedIn.has(t) || T === 1 ? 1 : 0.28 }));
    }
    svg.append(text(40, inTop - 14, `${arriving.name} · ${inCable.fibers}F`, { "font-weight": 800, "font-size": 20 }));
    const pathIn = incomingPath(L.id);
    const cd = pathIn && conduitLabel(pathIn.conduit);
    svg.append(text(40, inTop + inH + 24, `from ${point(arriving.from).name}${cd ? ` · ${cd}` : ""}`, { fill: INK_2, "font-size": 15 }));
    if (T > 1 && usedIn.size < T) svg.append(text(40, inTop + inH + 44, "Faded tubes: not opened here", { fill: INK_2, "font-size": 13 }));
  } else {
    svg.append(svgEl("rect", { x: 24, y: inTop, width: CX0 - 60, height: inH, rx: 12, fill: "#f3f3f1", stroke: INK, "stroke-width": 2, "stroke-dasharray": "8 6" }));
    svg.append(text(40, inTop + inH / 2 + 6, L.id === plan.points[0].id ? "Start of the route: feeder and equipment here" : "No cable arrives here",
      { fill: INK_2, "font-size": 16 }));
  }

  // --- Splitters ---
  const SX0 = 700;
  const SX1 = 830;
  const splitY = new Map();
  let sy = Math.max(90, H / 2 - splitH / 2 + 30);
  for (const s of splitters) {
    splitY.set(s.id, sy + 30);
    svg.append(svgEl("rect", { x: SX0, y: sy, width: SX1 - SX0, height: 60, rx: 10, fill: "#eef6f0", stroke: SPLIT_INK, "stroke-width": 3 }));
    svg.append(text((SX0 + SX1) / 2, sy + 26, s.ratio, { "text-anchor": "middle", "font-weight": 800, "font-size": 18, fill: SPLIT_INK }));
    svg.append(text((SX0 + SX1) / 2, sy + 46, f2Label(s), { "text-anchor": "middle", "font-size": 13, fill: SPLIT_INK }));
    sy += 78;
  }

  // --- Right side: cables out, cables passing through, drops ---
  const RX0 = CX1 - 6;
  const RX1 = PIC_W - 20;
  const outStripe = new Map(); // cable id -> (tube) -> y
  let ry = 52;
  const usedOut = new Map();
  for (const r of rows) {
    if (r.dst.kind !== "cable") continue;
    if (!usedOut.has(r.dst.id)) usedOut.set(r.dst.id, new Set());
    usedOut.get(r.dst.id).add(Math.ceil(r.dst.n / 12));
  }
  for (const it of rightItems) {
    const c = it.c;
    const h = bundleH(c.fibers);
    const spans = cableSpans(c);
    const end = point(spans[spans.length - 1].to);
    const label = it.kind === "through" ? `${c.name} · ${c.fibers}F ${THROUGH_LABELS[c.through]} → ${end.name}` : `${c.name} · ${c.fibers}F → ${end.name}`;
    svg.append(text(RX0 + 26, ry + 6, label, { "font-weight": 800, "font-size": 18 }));
    const y0 = ry + 16;
    svg.append(svgEl("rect", { x: RX0, y: y0, width: RX1 - RX0, height: h, rx: Math.min(h / 2, 30), fill: "#e9e5dc", stroke: INK, "stroke-width": 3 }));
    const T = tubeCount(c.fibers);
    const step = (h - 12) / T;
    const ys = new Map();
    for (let t = 1; t <= T; t++) {
      const y = y0 + 6 + (t - 1) * step + step / 2;
      ys.set(t, y);
      const used = it.kind === "through" || (usedOut.get(c.id) || new Set()).has(t);
      svg.append(svgEl("rect", { x: RX0 + 22, y: y - Math.min(4, step * 0.36), width: RX1 - RX0 - 44, height: Math.min(8, step * 0.72), rx: 4,
        fill: inkFor(colorAt(t - 1)), opacity: used || T === 1 ? 1 : 0.28 }));
    }
    outStripe.set(c.id, ys);
    // A cable passing through: one wide band straight across the case.
    if (it.kind === "through" && inCable) {
      const a = { x: CX0, y: inTop + inH / 2 };
      const b = { x: RX0, y: y0 + h / 2 };
      lines.append(svgEl("path", { d: curve(a, b), fill: "none", stroke: "#cfc9bc", "stroke-width": Math.min(h, inH) * 0.6, opacity: 0.8 }));
    }
    ry = y0 + h + 28;
  }
  const homeY = new Map();
  if (drops.length) {
    svg.append(text(RX0 + 26, ry + 8, `${drops.length} drop${drops.length === 1 ? "" : "s"} to homes`, { "font-weight": 800, "font-size": 18 }));
    const colW = (RX1 - RX0 - 40) / dropCols;
    drops.forEach((d, i) => {
      const col = Math.floor(i / dropRows);
      const y = ry + 34 + (i % dropRows) * 22;
      const x = RX0 + 30 + col * colW;
      const h = point(d.to);
      homeY.set(d.id, { x, y });
      marks.append(svgEl("line", { x1: x, y1: y, x2: x + 26, y2: y, stroke: INK, "stroke-width": 2.5 }));
      const t = text(x + 32, y + 5, "", { "font-size": 14.5 });
      t.append(svgEl("tspan", { "font-weight": 700 }, h.name), svgEl("tspan", { fill: INK_2 }, [homeDs(h), d.name].filter(Boolean).map((s) => `  ·  ${s}`).join("")));
      marks.append(t);
    });
  }

  // --- Splices: one line per group, with its bubble ---
  const groups = new Map();
  for (const r of rows) {
    const s = r.src;
    const srcKey = !s ? "x" : s.kind === "split" ? `s:${s.id}` : `t:${Math.ceil(s.n / 12)}`;
    const drop = r.dst.kind === "cable" && homeY.has(r.dst.id);
    const dstKey = r.dst.kind === "split" ? `s:${r.dst.id}` : drop ? "drops" : `c:${r.dst.id}:${Math.ceil(r.dst.n / 12)}`;
    const key = `${srcKey}|${dstKey}`;
    if (!groups.has(key)) groups.set(key, { rows: [], src: s, dst: r.dst, drop });
    groups.get(key).rows.push(r);
  }
  const start = (s) => {
    if (!s) return { x: CX0, y: inTop + inH / 2 };
    if (s.kind === "split") return { x: SX1, y: splitY.get(s.id) || H / 2 };
    return { x: CX0, y: stripeY(Math.ceil(s.n / 12)) };
  };
  const end = (d) => {
    if (d.kind === "split") return { x: SX0, y: splitY.get(d.id) || H / 2 };
    const ys = outStripe.get(d.id);
    return { x: RX0, y: ys ? ys.get(Math.ceil(d.n / 12)) || ys.get(1) : H / 2 };
  };
  const stroke = (s) => {
    if (!s) return INK_2;
    if (s.kind === "split") return SPLIT_INK;
    return inkFor(colorAt(Math.ceil(s.n / 12) - 1));
  };
  const spots = [0.5, 0.36, 0.64, 0.28, 0.72, 0.44, 0.56];
  let gi = 0;
  for (const g of groups.values()) {
    const a = start(g.src);
    const color = stroke(g.src);
    let b;
    if (g.drop) {
      // Thin lines to each home, the bubble on the middle one.
      for (const r of g.rows) {
        const hy = homeY.get(r.dst.id);
        lines.append(svgEl("path", { d: curve(a, { x: hy.x, y: hy.y }), fill: "none", stroke: color, "stroke-width": 1.8, opacity: 0.85 }));
      }
      const mid = homeY.get(g.rows[Math.floor(g.rows.length / 2)].dst.id);
      b = { x: mid.x, y: mid.y };
    } else {
      b = end(g.dst);
      lines.append(svgEl("path", { d: curve(a, b), fill: "none", stroke: color, "stroke-width": Math.min(9, 3 + g.rows.length * 0.5) }));
    }
    const t = g.drop ? 0.3 : spots[gi % spots.length];
    marks.append(bubble(bezierAt(a, b, t), numText(g.rows.map((r) => r.num))));
    gi++;
  }
  svg.append(lines, marks);
  if (!rows.length) svg.append(text((CX0 + CX1) / 2, H / 2, "Nothing spliced here", { "text-anchor": "middle", fill: INK_2 }));
  return svg;
}

function curve(a, b) {
  const dx = (b.x - a.x) * 0.45;
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
}

function bezierAt(a, b, t) {
  const dx = (b.x - a.x) * 0.45;
  const p = [a, { x: a.x + dx, y: a.y }, { x: b.x - dx, y: b.y }, b];
  const u = 1 - t;
  return {
    x: u * u * u * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t * t * t * p[3].x,
    y: u * u * u * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t * t * t * p[3].y,
  };
}

// An orange bubble (a pill when it holds a range) with the splice numbers.
function bubble(at, label) {
  const g = svgEl("g", { class: "bubble" });
  const w = Math.max(30, label.length * 9 + 14);
  g.append(svgEl("rect", { x: at.x - w / 2, y: at.y - 15, width: w, height: 30, rx: 15, fill: BUBBLE, stroke: INK, "stroke-width": 2.5 }),
    svgEl("text", { x: at.x, y: at.y + 5.5, "text-anchor": "middle", "font-family": FONT, "font-weight": 800, "font-size": 15, fill: INK }, label));
  return g;
}

// The checklist under the drawing: one line per splice, keyed to the
// bubbles, with colors, tray and slot, and a box to tick.
function checklist(L, rows) {
  const wrap = el("div", "loc-check");
  wrap.append(el("h3", "", "Splices"));
  const xcs = crossConnectsAt(L.id).filter(phaseShown);
  if (!rows.length && !xcs.length) {
    wrap.append(el("p", "", "Nothing is spliced here."));
    return wrap;
  }
  const trays = closureAt(L) || Object.keys(L.trays || {}).length ? traySlots(L, rows.map((r) => r.key)) : null;
  const v = viewIdx();
  const table = el("table", "sheet-table check-table");
  const head = el("tr");
  for (const h of ["#", "From", "", "To", "For", ...(trays ? ["Tray-slot"] : []), "Done"]) head.append(el("th", "", h));
  const thead = el("thead");
  thead.append(head);
  table.append(thead);
  const colorCell = (f, cls) => {
    const td = el("td", cls);
    if (f.tube && f.colors.includes("tube")) td.append(swatch(f.tube, true), document.createTextNode(" "));
    if (f.fiber) td.append(swatch(f.fiber, true), document.createTextNode(" "));
    td.append(el("b", "", f.text));
    if (f.colors) td.append(el("span", "check-colors", f.colors));
    return td;
  };
  for (const r of rows) {
    const tr = el("tr");
    if (r.from.missing) tr.className = "problem";
    const existing = v !== null && r.phase < v;
    if (existing) tr.classList.add("existing");
    const num = el("td", "num-cell");
    num.append(el("span", "bub", String(r.num)));
    const ts = trays && trays.get(r.key);
    tr.append(num, colorCell(r.from), el("td", "", "→"), colorCell(r.to), el("td", "wrap", (existing ? `Existing · ${phaseName(r.phase)} · ` : "") + r.note),
      ...(trays ? [el("td", "mono", ts ? `${ts.tray}-${ts.slot}` : "")] : []), el("td", "checkbox-cell", "☐"));
    table.append(tr);
  }
  for (const x of xcs) {
    const tr = el("tr");
    if (endpointMissing(x.a) || endpointMissing(x.b)) tr.className = "problem";
    tr.append(el("td", "num-cell", "patch"), el("td", "", endpointLabel(x.a)), el("td", "", "→"), el("td", "", endpointLabel(x.b)),
      el("td", "wrap", x.note || ""), ...(trays ? [el("td", "")] : []), el("td", "checkbox-cell", "☐"));
    table.append(tr);
  }
  wrap.append(table);
  return wrap;
}

// The homes that hang off this location.
function homesHereTable(L) {
  const wrap = el("div", "loc-homes");
  const homes = childPaths(L.id).map((x) => point(x.to)).filter((h) => h.type === "nid" && phaseShown(h));
  wrap.append(el("h3", "", homes.length ? `Homes (${homes.length})` : "Homes"));
  if (!homes.length) {
    wrap.append(el("p", "", "No homes connect here."));
    return wrap;
  }
  const terms = homes.some((h) => homeTerminalPort(h));
  const table = el("table", "sheet-table");
  const head = el("tr");
  for (const h of ["Home", "Lot", "Drop", "F2", "DS", ...(terms ? ["Terminal port"] : []), "Done"]) head.append(el("th", "", h));
  const thead = el("thead");
  thead.append(head);
  table.append(thead);
  for (const h of homes) {
    const c = incomingCable(h.id);
    const f2 = homeF2(h);
    const tr = el("tr");
    tr.append(el("td", "strong", hasAddress(h) ? h.name : "No address yet"), el("td", "mono", h.lot || "—"),
      el("td", "", c ? `${c.name} (${c.fibers}F)` : "—"), el("td", "mono strong", f2 ? f2CellFor(f2) : "—"),
      el("td", "mono strong", homeDs(h) ? dsCell(h) : "—"),
      ...(terms ? [el("td", "", homeTerminalPort(h) ? homeTerminalPort(h).port.name + " · " + homeTerminalPort(h).eq.name : "—")] : []),
      el("td", "checkbox-cell", "☐"));
    table.append(tr);
  }
  wrap.append(table);
  return wrap;
}

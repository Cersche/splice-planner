// Splice Planner: plain JS, no build step.
// The whole plan lives in `plan` so later steps (cables, closures,
// fiber colors, print sheet) can add to it and save/load it as JSON.

const STORAGE_KEY = "splicePlanner.plan";

let plan = migratePlan(loadPlan());

function newPlan(startPoint) {
  return {
    createdAt: new Date().toISOString(),
    // Every location on the route; the first is the start.
    points: [startPoint],
    // Paths join each location to the one feeding it: the lines on the
    // route. A path can hold conduit details.
    paths: [],
    // Cable spans riding the paths, at most one per path.
    cables: [],
    // Imported homes not yet fed from a location.
    unassigned: [],
    // Patches between equipment ports and fibers at a location.
    xconnects: [],
  };
}

// Plans saved before paths existed: each cable span was its own path.
function migratePlan(p) {
  if (!p) return p;
  if (!Array.isArray(p.paths)) p.paths = (p.cables || []).map((c) => ({ id: makeId(), from: c.from, to: c.to }));
  p.unassigned = p.unassigned || [];
  p.xconnects = p.xconnects || [];
  return p;
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadPlan() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePlan() {
  try {
    if (plan) localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private window, etc.); the app still works in memory.
  }
}

// --- Screens ---

const screens = {
  splash: document.getElementById("screen-splash"),
  route: document.getElementById("screen-route"),
};

function show(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
  if (name === "route") renderRoute();
}

// --- Splash ---

const otherForm = document.getElementById("other-form");
const otherName = document.getElementById("other-name");
const otherKind = document.getElementById("other-kind");
const otherNameRow = document.getElementById("other-name-row");

// The text box is only needed when the dropdown says Other.
otherKind.addEventListener("change", () => {
  otherNameRow.hidden = otherKind.value !== "other";
  if (!otherNameRow.hidden) otherName.focus();
});

const cabinetForm = document.getElementById("cabinet-form");
const cabinetKind = document.getElementById("cabinet-kind");

// Each start button opens its own short form; only one shows at a time.
document.querySelectorAll("[data-start]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const other = btn.dataset.start === "other";
    otherForm.hidden = !other;
    cabinetForm.hidden = other;
    (other ? otherKind : cabinetKind).focus();
  });
});

cabinetForm.addEventListener("submit", (e) => {
  e.preventDefault();
  startRoute({ type: cabinetKind.value, label: typeLabel(cabinetKind.value) });
});

function cancelCabinet() {
  cabinetForm.hidden = true;
}

document.getElementById("cabinet-cancel").addEventListener("click", cancelCabinet);
cabinetForm.prepend(xButton(cancelCabinet));

otherForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const type = otherKind.value;
  if (type !== "other") return startRoute({ type, label: typeLabel(type) });
  const label = otherName.value.trim();
  if (!label) return otherName.focus();
  startRoute({ type: "other", label });
});

function cancelOther() {
  otherForm.hidden = true;
  otherName.value = "";
  otherKind.value = "handhole";
  otherNameRow.hidden = true;
}

document.getElementById("other-cancel").addEventListener("click", cancelOther);
otherForm.prepend(xButton(cancelOther));

function startRoute({ type, label }) {
  plan = newPlan({ id: makeId(), type, label, name: label, equipment: [] });
  savePlan();
  show("route");
}

// --- Fiber color code (TIA-598) ---
// Fibers come 12 to a buffer tube, in the standard color order. Tubes
// use the same order; tubes 13-24 repeat it with a black stripe, 25-36
// with a double stripe (written "Blue/2 Blk").

const TIA_COLORS = [
  { name: "Blue", hex: "#1f5fd6" },
  { name: "Orange", hex: "#f28a1a" },
  { name: "Green", hex: "#1e9b45" },
  { name: "Brown", hex: "#8a5a2b" },
  { name: "Slate", hex: "#7d8791" },
  { name: "White", hex: "#ffffff" },
  { name: "Red", hex: "#d62828" },
  { name: "Black", hex: "#1b1b1b" },
  { name: "Yellow", hex: "#f2d21b" },
  { name: "Violet", hex: "#8a3fc7" },
  { name: "Rose", hex: "#f2a7c3" },
  { name: "Aqua", hex: "#27c4d6" },
];

function colorAt(i) {
  const base = TIA_COLORS[i % 12];
  const stripes = Math.floor(i / 12);
  // A black tube or fiber gets a white stripe instead, so it can be seen.
  const stripe = base.name === "Black" ? "Wht" : "Blk";
  const suffix = stripes === 0 ? "" : stripes === 1 ? `/${stripe}` : `/${stripes} ${stripe}`;
  return { name: base.name + suffix, hex: base.hex, striped: stripes > 0, stripeHex: stripe === "Wht" ? "#ffffff" : "#1b1b1b" };
}

// Every fiber in a cable: [{ number, tube, tubeColor, fiberColor }].
function colorCode(fibers) {
  const out = [];
  for (let n = 0; n < fibers; n++) {
    const tube = Math.floor(n / 12);
    out.push({
      number: n + 1,
      tube: tube + 1,
      tubeColor: colorAt(tube),
      fiberColor: colorAt(n % 12),
    });
  }
  return out;
}

function tubeCount(fibers) {
  return Math.ceil(fibers / 12);
}

function swatch(color, small) {
  const el = document.createElement("span");
  el.className = "swatch" + (small ? " small" : "") + (color.striped ? " striped" : "");
  el.style.background = color.hex;
  if (color.striped) el.style.setProperty("--stripe", color.stripeHex);
  el.title = color.name;
  return el;
}

// --- Route ---
// The route is point to point: every location is fed from one other
// location along a path, and any location can feed more than one
// (branching). Customer NIDs are end points.
//
// A path may carry a cable span (plan.cables, matched to the path by
// from/to). A span with `through` set ("pass" or "storage") is the same
// physical cable as the span arriving at its `from` location, so one
// cable can run from Handhole A through Handhole B to Handhole C.

const STOP_TYPES = {
  headend: "Head end",
  fdh: "FDH",
  splice: "Splice",
  handhole: "Handhole",
  pedestal: "Pedestal",
  vault: "Vault",
  manhole: "Manhole",
  cabinet: "Cabinet",
  nid: "Customer NID",
  other: "Other",
};

// Locations offered by the + button, in menu order.
const ADD_TYPES = ["handhole", "pedestal", "vault", "manhole", "splice", "fdh", "headend"];

// Standard loose-tube cable counts, and smaller counts for drops to a NID.
const FIBER_COUNTS = [12, 24, 48, 72, 96, 144, 216, 288, 432];
const DROP_COUNTS = [1, 2, 4, 6, 12];
const CABLE_SIZES = [1, 2, 4, 6, 12, 24, 48, 72, 96, 144, 216, 288, 432];
const SPLITTER_RATIOS = ["1x2", "1x4", "1x8", "1x16", "1x32", "1x64"];

// Tails come pre-attached to a splitter or terminal; otherwise they are
// entered like any other cable.
const CABLE_KINDS = { cable: "Cable", "splitter-tail": "Splitter tail", "terminal-tail": "Terminal tail" };

const tree = document.getElementById("route-tree");
const menu = document.getElementById("context-menu");

// The location the menu or a dialog is working on.
let selectedId = null;

document.getElementById("back-to-splash").addEventListener("click", () => {
  if (!confirm("Start over? This clears the current plan.")) return;
  plan = null;
  savePlan();
  closeMenu();
  closePanels();
  otherForm.hidden = true;
  otherName.value = "";
  show("splash");
});

function point(id) {
  return plan.points.find((p) => p.id === id);
}

function childPaths(id) {
  return plan.paths.filter((x) => x.from === id);
}

function incomingPath(id) {
  return plan.paths.find((x) => x.to === id);
}

// The cable span on a path, if one has been placed.
function pathCable(path) {
  return plan.cables.find((c) => c.to === path.to);
}

function childCables(id) {
  return plan.cables.filter((c) => c.from === id);
}

function incomingCable(id) {
  return plan.cables.find((c) => c.to === id);
}

const THROUGH_LABELS = { pass: "passes through", storage: "slack stored" };

// The first span of the physical cable this span belongs to.
function cableStart(c) {
  while (c.through) c = incomingCable(c.from);
  return c;
}

// All spans of one physical cable, start to end.
function cableSpans(c) {
  const spans = [cableStart(c)];
  for (;;) {
    const next = childCables(spans[spans.length - 1].to).find((x) => x.through);
    if (!next) return spans;
    spans.push(next);
  }
}

function cableKind(c) {
  return cableStart(c).kind || "cable";
}

// Drops to homes are listed with the homes, not with the cables.
function isDrop(c) {
  const to = point(c.to);
  return to && to.type === "nid" && !c.through;
}

// Next free "Cable n", "Drop n", "Splitter tail n" ... name.
function nextCableName(kind, toHome) {
  const prefix = toHome && kind === "cable" ? "Drop" : CABLE_KINDS[kind];
  const re = new RegExp(`^${prefix} (\\d+)$`);
  let n = 0;
  for (const c of plan.cables) {
    const m = re.exec(c.name || "");
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `${prefix} ${n + 1}`;
}

function typeLabel(type) {
  return STOP_TYPES[type] || "Other";
}

// Auto-name stops "Splice 1", "Handhole 2", ... so nobody has to type.
function autoName(type) {
  const short = type === "nid" ? "NID" : typeLabel(type);
  const n = plan.points.filter((p) => p.type === type).length + 1;
  return `${short} ${n}`;
}

// The splice model for the current render, so cable labels are worked
// out once per draw.
let routeModel = null;

function renderRoute() {
  routeModel = buildSpliceModel();
  tree.innerHTML = "";
  tree.append(branchEl(plan.points[0]));
  updateUnassignedButton();
}

function branchEl(p) {
  const branch = el("div", "branch");
  const wrap = el("div", "stop-wrap");
  wrap.append(stopEl(p));
  if (p.type !== "nid") wrap.append(plusEl(p));
  branch.append(wrap);
  const paths = childPaths(p.id);
  if (paths.length) {
    const kids = el("div", "children");
    for (const path of paths) {
      const child = el("div", "child");
      child.append(pathEl(path, routeModel), branchEl(point(path.to)));
      kids.append(child);
    }
    branch.append(kids);
  }
  return branch;
}

// A location card: colored icon tile, type, name, then chips for its
// equipment and counts.
function stopEl(p) {
  const isStart = p.id === plan.points[0].id;
  const meta = locMeta(p);
  const card = el("button", "stop" + (isStart ? " start" : "") + (p.type === "nid" ? " nid" : "") +
    (p.id === selectedId ? " selected" : ""));
  card.type = "button";
  card.style.setProperty("--c", meta.color);
  const badge = el("span", "badge");
  badge.append(iconEl(meta.icon));
  const label = typeLabel(p.type);
  // "Start · Cabinet" over "Cabinet" says it twice.
  const kind = el("span", "type", isStart ? (p.name === label ? "Start" : `Start · ${label}`) : label);
  card.append(badge, kind, el("span", "name", p.name));
  if (p.type === "nid" && p.lot && hasAddress(p)) card.append(el("span", "lot", lotName(p.lot)));
  const chips = el("span", "chips");
  for (const eq of p.equipment || []) chips.append(el("span", "chip", equipmentChip(eq)));
  if (p.type === "nid") {
    const f2 = homeF2(p);
    if (f2) chips.append(countChip(`F2 ${f2.f2}`));
    if (p.ds && homeSplitter(p)) chips.append(countChip(`DS ${p.ds.port}`));
  }
  for (const c of childCables(p.id).filter((x) => x.through)) {
    chips.append(el("span", "chip through", `${c.name} ${THROUGH_LABELS[c.through]}`));
  }
  if (chips.childNodes.length) card.append(chips);
  card.addEventListener("click", (e) => openMenu(p.id, e));
  card.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openMenu(p.id, e);
  });
  return card;
}

function plusEl(p) {
  const b = btnEl("+", (e) => openAddMenu(p.id, e), "add-next");
  b.title = `Add a location after ${p.name}`;
  b.setAttribute("aria-label", b.title);
  return b;
}

// --- Popup menus ---

function openPopup(title, items, e, caption) {
  menu.innerHTML = "";
  const head = el("div", "menu-head");
  const titles = el("div");
  if (caption) titles.append(el("div", "menu-cap", caption));
  titles.append(el("div", "menu-title", title));
  head.append(titles, xButton(() => {
    closeMenu();
    selectedId = null;
    renderRoute();
  }));
  menu.append(head);
  for (const item of items) {
    const b = btnEl("", (ev) => {
      ev.stopPropagation();
      closeMenu();
      item.run();
    });
    b.className = "mi" + (item.danger ? " danger" : "");
    b.append(iconEl(item.icon || "info"), document.createTextNode(item.label));
    menu.append(b);
  }
  menu.hidden = false;
  // Place the menu at the tap, kept inside the window.
  const x = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 8);
  const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8);
  menu.style.left = Math.max(8, x) + "px";
  menu.style.top = Math.max(8, y) + "px";
}

function closeMenu() {
  menu.hidden = true;
}

// The menu on a location: everything but adding the next location,
// which is on its + button. What's offered depends on the type.
function openMenu(id, e) {
  e.stopPropagation();
  closePanels();
  selectedId = id;
  const p = point(id);
  const isStart = id === plan.points[0].id;
  const items = [];
  const homesHere = () => feedsHomes(p);
  if (p.type === "nid") {
    items.push({ icon: "counts", label: "Counts (F2 / DS)", run: () => openCounts(id) });
    items.push({ icon: "edit", label: "Address / lot", run: () => renameStop(id) });
  } else if (isCabinet(p)) {
    const eqLabel = p.type === "headend" ? "OLT shelves and panels" : p.type === "fdh" ? "Splitter modules and panels" : "Equipment";
    items.push({ icon: p.type === "fdh" ? "splitter" : "shelf", label: eqLabel, run: () => openEquipment(id) });
    items.push({ icon: "xconnect", label: "Connections and patching", run: () => openConnections(id) });
    if (homesHere()) items.push({ icon: "homes", label: "Home counts (F2 / DS)", run: () => openBatchCounts(id) });
    items.push({ icon: "info", label: "Cabinet details", run: () => openDetails(id) });
    items.push({ icon: "sheet", label: "Splice sheet", run: () => openSpliceSheet(id) });
    items.push({ icon: "edit", label: "Rename", run: () => renameStop(id) });
  } else {
    items.push({ icon: "closure", label: "Open splice case", run: () => openConnections(id) });
    items.push({ icon: "splitter", label: "Equipment (case, splitters, terminals)", run: () => openEquipment(id) });
    if (homesHere()) items.push({ icon: "homes", label: "Home counts (F2 / DS)", run: () => openBatchCounts(id) });
    items.push({ icon: "info", label: "Details", run: () => openDetails(id) });
    items.push({ icon: "sheet", label: "Splice sheet", run: () => openSpliceSheet(id) });
    items.push({ icon: "edit", label: "Rename", run: () => renameStop(id) });
  }
  if (!isStart) {
    items.push({ icon: "move", label: "Move (feed from somewhere else)", run: () => openMove(id) });
    items.push({ icon: "remove", label: "Remove", danger: true, run: () => removeStop(id) });
  }
  openPopup(p.name, items, e, typeLabel(p.type));
  renderRoute();
}

// The + menu: add the next location after this one.
function openAddMenu(fromId, e) {
  e.stopPropagation();
  closePanels();
  selectedId = fromId;
  const items = ADD_TYPES.map((t) => ({ icon: LOC_META[t].icon, label: typeLabel(t), run: () => {
    addLocation(fromId, t, autoName(t));
    finish();
  } }));
  items.push({ icon: "home", label: "Home (Customer NID)…", run: () => addHomeForm(fromId) });
  if (plan.unassigned.length) {
    items.push({ icon: "homes", label: `Homes from the unassigned list (${plan.unassigned.length})…`, run: () => openAssign(fromId) });
  }
  items.push({ icon: "pin", label: "Other…", run: () => addOtherForm(fromId) });
  openPopup(point(fromId).name, items, e, "Add the next location");
  renderRoute();
}

document.addEventListener("click", (e) => {
  if (!menu.hidden && !menu.contains(e.target)) {
    closeMenu();
    if (formPanel.hidden) {
      selectedId = null;
      if (plan) renderRoute();
    }
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeMenu();
    closePanels();
    selectedId = null;
    if (plan) renderRoute();
  }
});

function finish() {
  closePanels();
  closeMenu();
  selectedId = null;
  savePlan();
  renderRoute();
}

// --- Adding locations ---
// A new location gets a path from the one before it. A cable can be
// placed on that path later, or not at all.

function addLocation(fromId, type, name, extra) {
  const stop = { id: makeId(), type, label: typeLabel(type), name, equipment: [], ...extra };
  plan.points.push(stop);
  plan.paths.push({ id: makeId(), from: fromId, to: stop.id });
  return stop;
}

function addOtherForm(fromId) {
  openForm(`Add a location after ${point(fromId).name}`, (body, foot) => {
    const name = inputEl("text", "", { placeholder: "e.g. Building MPOE" });
    body.append(fieldEl("What is it?", name));
    formButtons(foot, () => {
      if (!name.value.trim()) return "Type what the location is.";
      addLocation(fromId, "other", name.value.trim());
      finish();
    }, "Add");
  });
}

// Drop sizes for a home, with "none" for when the drop isn't known yet.
function dropSelect(value) {
  return selectEl([...DROP_COUNTS.map((n) => ({ value: n, label: `${n}F drop` })),
    { value: 0, label: "No drop cable yet" }], value);
}

function addHomeForm(fromId) {
  openForm(`Add a home after ${point(fromId).name}`, (body, foot) => {
    const address = inputEl("text", "", { placeholder: "e.g. 123 Main St" });
    const lot = inputEl("text", "", { placeholder: "e.g. 12" });
    const drop = dropSelect(1);
    body.append(fieldEl("Address", address, "Leave blank if it doesn't have one yet."),
      fieldEl("Lot number", lot), fieldEl("Drop cable", drop));
    formButtons(foot, () => {
      const a = address.value.trim();
      const l = cleanLot(lot.value);
      if (!a && !l) return "Enter an address, a lot number, or both.";
      const stop = addLocation(fromId, "nid", a || lotName(l), l ? { lot: l } : {});
      const fibers = Number(drop.value);
      if (fibers) plan.cables.push({ id: makeId(), name: nextCableName("cable", true), from: fromId, to: stop.id, fibers });
      finish();
    }, "Add");
  });
}

// --- Homes: address or lot ---
// Homes are often placed on lots before they have an address. A home
// then goes by "Lot 12" until the address is known; the lot is kept.

function lotName(lot) {
  return /^lot\b/i.test(lot) ? lot : `Lot ${lot}`;
}

function cleanLot(lot) {
  return lot.trim().replace(/^lot\s*#?\s*/i, "");
}

function hasAddress(p) {
  return !p.lot || p.name !== lotName(p.lot);
}

function renameStop(id) {
  const p = point(id);
  if (p.type === "nid") {
    return openForm(`Address / lot for ${p.name}`, (body, foot) => {
      const address = inputEl("text", hasAddress(p) ? p.name : "");
      const lot = inputEl("text", p.lot || "");
      body.append(fieldEl("Address", address), fieldEl("Lot number", lot));
      formButtons(foot, () => {
        const a = address.value.trim();
        const l = cleanLot(lot.value);
        if (!a && !l) return "Enter an address, a lot number, or both.";
        p.name = a || lotName(l);
        if (l) p.lot = l;
        else delete p.lot;
        finish();
      });
    });
  }
  openForm(`Rename ${p.name}`, (body, foot) => {
    const name = inputEl("text", p.name);
    body.append(fieldEl("Name", name));
    formButtons(foot, () => {
      if (!name.value.trim()) return "Enter a name.";
      p.name = name.value.trim();
      finish();
    });
    name.select();
  });
}

function removeStop(id) {
  const p = point(id);
  // Everything fed from this location goes with it.
  const doomed = new Set();
  (function collect(pid) {
    doomed.add(pid);
    childPaths(pid).forEach((x) => collect(x.to));
  })(id);
  const extra = doomed.size - 1;
  const msg = extra ? `Remove ${p.name} and the ${extra} location(s) fed from it?` : `Remove ${p.name}?`;
  if (!confirm(msg)) {
    selectedId = null;
    renderRoute();
    return;
  }
  plan.points = plan.points.filter((x) => !doomed.has(x.id));
  plan.paths = plan.paths.filter((x) => !doomed.has(x.to));
  plan.cables = plan.cables.filter((c) => !doomed.has(c.to));
  plan.xconnects = plan.xconnects.filter((x) => !doomed.has(x.at));
  finish();
}

// Resume an in-progress plan, otherwise show the splash. Waits for the
// other scripts, which the route drawing uses.
document.addEventListener("DOMContentLoaded", () => show(plan ? "route" : "splash"));

// Splice Planner: plain JS, no build step.
// The whole plan lives in `plan` so later steps (cables, closures,
// fiber colors, print sheet) can add to it and save/load it as JSON.

const STORAGE_KEY = "splicePlanner.plan";

const START_TYPES = {
  cabinet: "Cabinet",
  splice: "Splice",
};

let plan = loadPlan();

function newPlan(startPoint) {
  return {
    createdAt: new Date().toISOString(),
    // Ordered list of points along the route; the first is the start.
    points: [startPoint],
    // Cables between points, filled in by the route-building step.
    cables: [],
  };
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

document.querySelectorAll("[data-start]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.start;
    if (type === "other") {
      otherForm.hidden = false;
      otherName.focus();
      return;
    }
    startRoute({ type, label: START_TYPES[type] });
  });
});

otherForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const label = otherName.value.trim();
  if (!label) return;
  startRoute({ type: "other", label });
});

document.getElementById("other-cancel").addEventListener("click", () => {
  otherForm.hidden = true;
  otherName.value = "";
});

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
// The route is point to point: every cable runs from one location to a
// destination, and any location can feed more than one (branching).
// Customer NIDs are end points.
//
// Each entry in plan.cables is one span between two locations. A span
// with `through` set ("pass" or "storage") is the same physical cable as
// the span arriving at its `from` location, so one cable can run from
// Handhole A through Handhole B to Handhole C.

const STOP_TYPES = {
  splice: "Splice",
  handhole: "Handhole",
  cabinet: "Cabinet",
  nid: "Customer NID",
  other: "Other",
};

// Standard loose-tube cable counts, and smaller counts for drops to a NID.
const FIBER_COUNTS = [12, 24, 48, 72, 96, 144, 216, 288, 432];
const DROP_COUNTS = [1, 2, 4, 6, 12];
const SPLITTER_RATIOS = ["1x2", "1x4", "1x8", "1x16", "1x32"];

const tree = document.getElementById("route-tree");
const menu = document.getElementById("context-menu");
const wizard = document.getElementById("wizard");

// The location the menu or wizard is working on.
let selectedId = null;

document.getElementById("back-to-splash").addEventListener("click", () => {
  if (!confirm("Start over? This clears the current plan.")) return;
  plan = null;
  savePlan();
  closeMenu();
  closeWizard();
  otherForm.hidden = true;
  otherName.value = "";
  show("splash");
});

function point(id) {
  return plan.points.find((p) => p.id === id);
}

function childCables(id) {
  return plan.cables.filter((c) => c.from === id);
}

function incomingCable(id) {
  return plan.cables.find((c) => c.to === id);
}

const THROUGH_LABELS = { pass: "passes through", storage: "slack stored" };

// Next "Cable n" name, counting whole cables, not spans.
function nextCableName() {
  return `Cable ${plan.cables.filter((c) => !c.through).length + 1}`;
}

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

function typeLabel(type) {
  return STOP_TYPES[type] || "Other";
}

// Auto-name stops "Splice 1", "Handhole 2", ... so nobody has to type.
function autoName(type) {
  const short = type === "nid" ? "NID" : typeLabel(type);
  const n = plan.points.filter((p) => p.type === type).length + 1;
  return `${short} ${n}`;
}

function renderRoute() {
  tree.innerHTML = "";
  tree.append(branchEl(plan.points[0]));
}

function branchEl(p) {
  const branch = document.createElement("div");
  branch.className = "branch";
  branch.append(stopEl(p));
  const cables = childCables(p.id);
  if (cables.length) {
    const kids = document.createElement("div");
    kids.className = "children";
    for (const c of cables) {
      const child = document.createElement("div");
      child.className = "child";
      child.append(cableEl(c), branchEl(point(c.to)));
      kids.append(child);
    }
    branch.append(kids);
  }
  return branch;
}

function stopEl(p) {
  const isStart = p.id === plan.points[0].id;
  const el = document.createElement("button");
  el.className = "stop" + (isStart ? " start" : "") + (p.type === "nid" ? " nid" : "") +
    (p.id === selectedId ? " selected" : "");
  const type = document.createElement("div");
  type.className = "type";
  type.textContent = isStart ? `Start · ${typeLabel(p.type)}` : typeLabel(p.type);
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = p.name;
  el.append(type, name);
  if (p.type === "nid" && p.lot && hasAddress(p)) {
    const lot = document.createElement("div");
    lot.className = "lot";
    lot.textContent = lotName(p.lot);
    el.append(lot);
  }
  for (const eq of p.equipment || []) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = equipmentLabel(eq);
    el.append(chip);
  }
  if (p.type === "nid") {
    const f2 = homeF2(p);
    if (f2) el.append(countChip(`F2 ${f2.f2}`));
    if (p.ds && homeSplitter(p)) el.append(countChip(`DS ${p.ds.port}`));
  }
  for (const c of childCables(p.id).filter((x) => x.through)) {
    const chip = document.createElement("div");
    chip.className = "chip through";
    chip.textContent = `${c.name} ${THROUGH_LABELS[c.through]}`;
    el.append(chip);
  }
  el.addEventListener("click", (e) => openMenu(p.id, e));
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openMenu(p.id, e);
  });
  return el;
}

function cableEl(c) {
  const el = document.createElement("button");
  el.className = "cable" + (c.through ? " through" : "") + (c.id === openCableId ? " selected" : "");
  const name = document.createElement("div");
  name.className = "cable-name";
  name.textContent = c.name || "Cable";
  const size = document.createElement("div");
  size.className = "cable-size";
  size.textContent = c.fibers + "F" + (c.through ? " · continued" : "");
  const line = document.createElement("div");
  line.className = "line";
  const tubes = document.createElement("div");
  tubes.className = "tubes";
  for (let t = 0; t < tubeCount(c.fibers); t++) tubes.append(swatch(colorAt(t), true));
  el.append(name, size, line, tubes);
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    openCable(c.id);
  });
  return el;
}

// --- Cable details ---

const cablePanel = document.getElementById("cable-panel");
let openCableId = null;

function openCable(id) {
  closeMenu();
  closeWizard();
  selectedId = null;
  openCableId = id;
  const c = plan.cables.find((x) => x.id === id);
  document.getElementById("cable-title").textContent = c.name || "Cable";
  const tubes = tubeCount(c.fibers);
  const spans = cableSpans(c);
  const via = spans.slice(1).map((s) => `${point(s.from).name} (${THROUGH_LABELS[s.through]})`);
  document.getElementById("cable-summary").textContent =
    `${c.fibers} fibers, ${tubes} tube${tubes > 1 ? "s" : ""}. Runs from ${point(spans[0].from).name} to ` +
    `${point(spans[spans.length - 1].to).name}` + (via.length ? `, via ${via.join(", ")}.` : ".");

  const list = document.getElementById("cable-colors");
  list.innerHTML = "";
  const fibers = colorCode(c.fibers);
  for (let t = 1; t <= tubes; t++) {
    const row = document.createElement("div");
    row.className = "tube-row";
    const head = document.createElement("div");
    head.className = "tube-head";
    const tc = colorAt(t - 1);
    head.append(swatch(tc), document.createTextNode(` Tube ${t} · ${tc.name}`));
    const fiberWrap = document.createElement("div");
    fiberWrap.className = "fibers";
    for (const f of fibers.filter((x) => x.tube === t)) {
      const cell = document.createElement("div");
      cell.className = "fiber";
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = f.number;
      cell.append(num, swatch(f.fiberColor), document.createTextNode(f.fiberColor.name));
      fiberWrap.append(cell);
    }
    row.append(head, fiberWrap);
    list.append(row);
  }
  cablePanel.hidden = false;
  renderRoute();
  cablePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeCable() {
  cablePanel.hidden = true;
  openCableId = null;
}

document.getElementById("cable-close").addEventListener("click", () => {
  closeCable();
  renderRoute();
});

document.getElementById("cable-rename").addEventListener("click", () => {
  const c = plan.cables.find((x) => x.id === openCableId);
  const id = c.id;
  closeCable();
  askName("Rename cable", c.name || "", (name) => {
    for (const s of cableSpans(c)) s.name = name;
    finish();
    openCable(id);
  });
});

document.getElementById("cable-insert").addEventListener("click", () => {
  const c = plan.cables.find((x) => x.id === openCableId);
  closeCable();
  insertStop(c);
});

// --- Context menu ---

function openMenu(id, e) {
  // While moving a location, a tap picks where it's fed from instead.
  if (moving) {
    e.stopPropagation();
    return finishMove(id);
  }
  closeWizard();
  closeImport();
  closeCounts();
  closeSplice();
  closeCheck();
  closePrint();
  closeCable();
  selectedId = id;
  const p = point(id);
  document.getElementById("menu-title").textContent = p.name;
  menu.querySelector('[data-action="destination"]').hidden = p.type === "nid";
  menu.querySelector('[data-action="import"]').hidden = p.type === "nid";
  menu.querySelector('[data-action="splices"]').hidden = p.type === "nid";
  menu.querySelector('[data-action="remove-equipment"]').hidden = !(p.equipment || []).length;
  menu.querySelector('[data-action="move"]').hidden = id === plan.points[0].id;
  menu.querySelector('[data-action="rename"]').innerHTML = p.type === "nid" ? "&#9998; Address / lot" : "&#9998; Rename";
  menu.querySelector('[data-action="counts"]').hidden = p.type !== "nid" && !splittersAt(p).length;
  menu.querySelector('[data-action="remove"]').hidden = id === plan.points[0].id;
  menu.hidden = false;
  // Place the menu at the tap, kept inside the window.
  const x = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 8);
  const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8);
  menu.style.left = Math.max(8, x) + "px";
  menu.style.top = Math.max(8, y) + "px";
  renderRoute();
  e.stopPropagation();
}

function closeMenu() {
  menu.hidden = true;
}

document.addEventListener("click", (e) => {
  if (!menu.hidden && !menu.contains(e.target)) {
    closeMenu();
    if (wizard.hidden) {
      selectedId = null;
      if (plan) renderRoute();
    }
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeMenu();
    closeWizard();
  }
});

menu.querySelectorAll("[data-action]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeMenu();
    const action = btn.dataset.action;
    if (action === "destination") addDestination(selectedId);
    if (action === "import") importHomes(selectedId);
    if (action === "equipment") addEquipment(selectedId);
    if (action === "counts") openCounts(selectedId);
    if (action === "splices") openSpliceSheet(selectedId);
    if (action === "remove-equipment") removeEquipment(selectedId);
    if (action === "move") startMove(selectedId);
    if (action === "rename") renameStop(selectedId);
    if (action === "remove") removeStop(selectedId);
  });
});

// --- Wizard ---
// ask() shows one question with big buttons (or a name box) and
// calls back with the answer.

const wizardQuestion = document.getElementById("wizard-question");
const wizardChoices = document.getElementById("wizard-choices");
const wizardNameForm = document.getElementById("wizard-name-form");
const wizardName = document.getElementById("wizard-name");
let wizardOnName = null;

function ask(question, choices, onChoose) {
  wizard.hidden = false;
  wizardQuestion.textContent = question;
  wizardChoices.hidden = false;
  wizardChoices.innerHTML = "";
  wizardNameForm.hidden = true;
  for (const c of choices) {
    const b = document.createElement("button");
    b.className = "big-btn" + (c.secondary ? " secondary" : "");
    b.textContent = c.label;
    b.addEventListener("click", () => onChoose(c.value));
    wizardChoices.append(b);
  }
  wizard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function askName(question, defaultName, onName) {
  wizard.hidden = false;
  wizardQuestion.textContent = question;
  wizardChoices.hidden = true;
  wizardNameForm.hidden = false;
  document.getElementById("wizard-name-label").textContent = "Name";
  wizardName.value = defaultName;
  wizardOnName = onName;
  wizardName.focus();
  wizardName.select();
}

wizardNameForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = wizardName.value.trim();
  if (name && wizardOnName) wizardOnName(name);
});

function closeWizard() {
  wizard.hidden = true;
  wizardOnName = null;
}

function finish() {
  closeWizard();
  selectedId = null;
  savePlan();
  renderRoute();
}

document.getElementById("wizard-cancel").addEventListener("click", () => {
  closeWizard();
  selectedId = null;
  renderRoute();
});

// --- Actions ---

function addDestination(fromId) {
  const from = point(fromId);
  const arriving = incomingCable(fromId);
  // A cable can only carry on in one direction out of a location.
  const canContinue = arriving && !childCables(fromId).some((c) => c.through);
  let through = null;

  if (canContinue) {
    ask(`Which cable goes on from ${from.name}?`, [
      { label: `${arriving.name} passes through`, value: "pass" },
      { label: `${arriving.name} with slack stored here`, value: "storage" },
      { label: "New cable (splice here)", value: "new", secondary: true },
    ], (choice) => {
      through = choice === "new" ? null : choice;
      askType();
    });
  } else {
    askType();
  }

  let homeLot = null;

  function askType() {
    const types = ["splice", "handhole", "cabinet", "nid", "other"];
    ask(`Where does the cable from ${from.name} go?`,
      types.map((t) => ({ label: typeLabel(t), value: t, secondary: t === "other" })),
      (type) => {
        // Other must be named; a home gets an address, or a lot number
        // when the address isn't out yet.
        if (type === "other") askName("Name this location", "", (name) => next(type, name));
        else if (type === "nid") askHome((name, lot) => {
          homeLot = lot;
          next(type, name);
        });
        else next(type, autoName(type));
      });
  }

  function next(type, name) {
    if (!through) return askFibers(type, name);
    const stop = { id: makeId(), type, label: typeLabel(type), name, equipment: [] };
    if (homeLot) stop.lot = homeLot;
    plan.points.push(stop);
    plan.cables.push({ id: makeId(), name: arriving.name, from: fromId, to: stop.id, fibers: arriving.fibers, through });
    finish();
  }

  function askFibers(type, name) {
    const counts = type === "nid" ? DROP_COUNTS : FIBER_COUNTS;
    ask(`How many fibers in the cable to ${name}?`,
      counts.map((n) => ({ label: String(n), value: n })),
      (fibers) => askName("Name this cable", nextCableName(), (cableName) => {
        const stop = { id: makeId(), type, label: typeLabel(type), name, equipment: [] };
        if (homeLot) stop.lot = homeLot;
        plan.points.push(stop);
        plan.cables.push({ id: makeId(), name: cableName, from: fromId, to: stop.id, fibers });
        finish();
      }));
  }
}

function addEquipment(id) {
  const p = point(id);
  ask(`What equipment goes at ${p.name}?`,
    [{ label: "Splitter", value: "splitter" }, { label: "Other", value: "other", secondary: true }],
    (kind) => {
      if (kind === "other") askName("Name the equipment", "", (name) => save({ type: "other", name }));
      else ask("What size splitter?",
        SPLITTER_RATIOS.map((r) => ({ label: r, value: r })),
        (ratio) => {
          const eq = { id: makeId(), type: "splitter", ratio, name: `Splitter ${ratio}`, f2: null };
          askF2(p, eq, () => save(eq));
        });
    });

  function save(eq) {
    p.equipment = p.equipment || [];
    p.equipment.push({ id: makeId(), ...eq });
    finish();
  }
}

// Drop a new location in the middle of a span: A -> C becomes A -> B -> C.
function insertStop(span) {
  const types = ["splice", "handhole", "cabinet", "other"];
  ask(`What is the new stop on ${span.name}?`,
    types.map((t) => ({ label: typeLabel(t), value: t, secondary: t === "other" })),
    (type) => {
      if (type === "other") askName("Name this location", "", (name) => askWhat(type, name));
      else askWhat(type, autoName(type));
    });

  function askWhat(type, name) {
    ask(`What happens to ${span.name} at ${name}?`, [
      { label: "Passes through", value: "pass" },
      { label: "Slack stored", value: "storage" },
      { label: "Spliced here", value: "splice" },
    ], (what) => {
      if (what === "splice") askName("Name the cable leaving the splice", nextCableName(), (cableName) => save(type, name, null, cableName));
      else save(type, name, what, span.name);
    });
  }

  function save(type, name, through, cableName) {
    const stop = { id: makeId(), type, label: typeLabel(type), name, equipment: [] };
    const after = { id: makeId(), name: cableName, from: stop.id, to: span.to, fibers: span.fibers };
    if (through) after.through = through;
    plan.points.push(stop);
    plan.cables.push(after);
    span.to = stop.id;
    // A splice starts a new cable, so the rest of the old run takes its name.
    for (const s of cableSpans(after)) s.name = cableName;
    finish();
  }
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

function askHome(onDone) {
  ask("What do you have for this home?", [
    { label: "Address", value: "address" },
    { label: "Lot number", value: "lot" },
    { label: "Both", value: "both", secondary: true },
  ], (v) => {
    if (v === "address") askName("Customer address", "", (name) => onDone(name, null));
    else askName("Lot number", "", (lot) => {
      if (v === "lot") onDone(lotName(cleanLot(lot)), cleanLot(lot));
      else askName("Customer address", "", (name) => onDone(name, cleanLot(lot)));
    });
  });
}

function editHome(p) {
  ask(`What do you want to change for ${p.name}?`, [
    { label: hasAddress(p) ? "Address" : "Add the address", value: "address" },
    { label: p.lot ? "Lot number" : "Add a lot number", value: "lot", secondary: true },
  ], (v) => {
    if (v === "address") {
      askName("Customer address", hasAddress(p) ? p.name : "", (name) => {
        p.name = name;
        finish();
      });
    } else {
      askName("Lot number", p.lot || "", (lot) => {
        const addressed = hasAddress(p);
        p.lot = cleanLot(lot);
        if (!addressed) p.name = lotName(p.lot);
        finish();
      });
    }
  });
}

function renameStop(id) {
  const p = point(id);
  if (p.type === "nid") return editHome(p);
  askName(`Rename ${p.name}`, p.name, (name) => {
    p.name = name;
    finish();
  });
}

function removeStop(id) {
  const p = point(id);
  // Everything fed from this location goes with it.
  const doomed = new Set();
  (function collect(pid) {
    doomed.add(pid);
    childCables(pid).forEach((c) => collect(c.to));
  })(id);
  const extra = doomed.size - 1;
  const msg = extra ? `Remove ${p.name} and the ${extra} location(s) fed from it?` : `Remove ${p.name}?`;
  if (!confirm(msg)) {
    selectedId = null;
    renderRoute();
    return;
  }
  plan.points = plan.points.filter((x) => !doomed.has(x.id));
  plan.cables = plan.cables.filter((c) => !doomed.has(c.to));
  finish();
}

// Resume an in-progress plan, otherwise show the splash.
show(plan ? "route" : "splash");

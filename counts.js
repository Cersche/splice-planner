// F2 and DS counts.
// A splitter gets an F2 count: the fiber on the cable arriving at its
// location that feeds it. Each home shows the F2 of the splitter that
// feeds it and, when "Distributed split" is ticked, a DS count: the
// splitter port it is on. Bad counts are blocked as they are entered.

function splittersAt(p) {
  return (p.equipment || []).filter((e) => e.type === "splitter");
}

function splitterPorts(eq) {
  return parseInt(eq.ratio.split("x")[1], 10);
}

function countChip(text) {
  const chip = document.createElement("div");
  chip.className = "chip count";
  chip.textContent = text;
  return chip;
}

// Where an equipment item sits.
function equipmentLocation(eqId) {
  return plan.points.find((p) => (p.equipment || []).some((e) => e.id === eqId));
}

// Nearest location at or upstream of `locId` that has a splitter.
function feedingLocation(locId) {
  let id = locId;
  while (id) {
    const p = point(id);
    if (p && splittersAt(p).length) return p;
    const path = incomingPath(id);
    id = path ? path.from : null;
  }
  return null;
}

// The splitter feeding a home: the one its DS is on, else the first
// splitter at the nearest upstream location that has one.
function homeSplitter(home) {
  const path = incomingPath(home.id);
  const loc = path && feedingLocation(path.from);
  if (!loc) return null;
  const list = splittersAt(loc);
  return (home.ds && list.find((s) => s.id === home.ds.splitterId)) || list[0];
}

function homeF2(home) {
  const s = homeSplitter(home);
  return s && s.f2 ? s : null;
}

// The F2 fiber's tube and color, when the location has a cable arriving.
function f2Colors(eq) {
  const loc = equipmentLocation(eq.id);
  const c = loc && incomingCable(loc.id);
  if (!c || !eq.f2 || eq.f2 > c.fibers) return "";
  const f = colorCode(c.fibers)[eq.f2 - 1];
  return `${f.tubeColor.name} tube, ${f.fiberColor.name} fiber, on ${c.name}`;
}

// Ports on a splitter already taken: port -> home.
function usedPorts(eq, exceptHomeId) {
  const used = new Map();
  for (const h of plan.points) {
    if (h.type === "nid" && h.id !== exceptHomeId && h.ds && h.ds.splitterId === eq.id) used.set(h.ds.port, h);
  }
  return used;
}

function nextFreePort(eq, exceptHomeId) {
  const used = usedPorts(eq, exceptHomeId);
  for (let n = 1; n <= splitterPorts(eq); n++) if (!used.has(n)) return n;
  return null;
}

// --- F2 for a splitter ---

// Splitters fed from the same physical cable share its fiber numbers,
// and can't take a fiber that's picked for another cable.
function f2Problem(loc, eq, n) {
  if (!Number.isInteger(n) || n < 1) return "Enter a fiber number.";
  const c = incomingCable(loc.id);
  if (!c) {
    const clash = splittersAt(loc).find((s) => s.id !== eq.id && s.f2 === n);
    return clash ? `F2 ${n} already feeds ${clash.name}.` : "";
  }
  if (n > c.fibers) return `${c.name} only has ${c.fibers} fibers.`;
  const used = fixedInUse(cableStart(c).id, eq.id).get(n);
  return used ? `${c.name} #${n} already ${used}.` : "";
}

function nextFreeF2(loc, eq) {
  const c = incomingCable(loc.id);
  const max = c ? c.fibers : 999;
  for (let n = 1; n <= max; n++) if (!f2Problem(loc, eq, n)) return n;
  return null;
}

// --- Counts panel ---

const countsPanel = document.getElementById("counts-panel");
const dsOn = document.getElementById("counts-ds-on");
let countsHomeId = null;

function closeCounts() {
  countsPanel.hidden = true;
  countsHomeId = null;
}

function openCounts(id) {
  closePanels();
  selectedId = id;
  countsHomeId = id;
  countsPanel.hidden = false;
  renderCounts();
  renderRoute();
}

registerPanel(countsPanel, closeCounts);

const countsSplitter = document.getElementById("counts-splitter");
const countsPort = document.getElementById("counts-port");

function renderCounts() {
  const home = point(countsHomeId);
  document.getElementById("counts-title").textContent = `Counts for ${home.name}`;
  const f2Box = document.getElementById("counts-f2");
  const path = incomingPath(home.id);
  const loc = path && feedingLocation(path.from);
  const splitter = homeSplitter(home);

  f2Box.innerHTML = "";
  if (!splitter) {
    f2Box.textContent = "No splitter feeds this home yet. Add a splitter upstream to give it F2 and DS counts.";
    dsOn.checked = false;
    dsOn.disabled = true;
    document.getElementById("counts-ds").hidden = true;
    return;
  }
  const big = document.createElement("div");
  big.className = "f2-big";
  big.textContent = splitter.f2 ? `F2 ${splitter.f2}` : "F2 not set";
  const detail = document.createElement("div");
  detail.textContent = `From ${splitter.name} at ${loc.name}` +
    (splitter.f2 ? (f2Colors(splitter) ? ` · ${f2Colors(splitter)}` : "") : ". Set it in that location's Equipment.");
  f2Box.append(big, detail);

  dsOn.disabled = false;
  dsOn.checked = !!home.ds;
  document.getElementById("counts-ds").hidden = !home.ds;
  if (!home.ds) return;

  // More than one splitter at that location: pick which one.
  const list = splittersAt(loc);
  document.getElementById("counts-splitter-row").hidden = list.length < 2;
  countsSplitter.replaceChildren(...selectEl(list.map((s) => {
    const full = nextFreePort(s, home.id) === null;
    return { value: s.id, label: equipmentLabel(s) + (full ? " (full)" : ""), disabled: full && s.id !== splitter.id };
  }), splitter.id).childNodes);
  countsSplitter.value = splitter.id;

  const used = usedPorts(splitter, home.id);
  const ports = [];
  for (let n = 1; n <= splitterPorts(splitter); n++) {
    const taken = used.get(n);
    ports.push({ value: n, label: taken ? `${n} (taken: ${taken.name})` : String(n), disabled: !!taken });
  }
  countsPort.replaceChildren(...selectEl(ports).childNodes);
  countsPort.value = String(home.ds.port);
}

countsSplitter.addEventListener("change", () => {
  const home = point(countsHomeId);
  const s = splittersAt(equipmentLocation(countsSplitter.value)).find((x) => x.id === countsSplitter.value);
  const port = nextFreePort(s, home.id);
  if (port === null) return renderCounts();
  home.ds = { splitterId: s.id, port };
  saveCounts();
});

countsPort.addEventListener("change", () => {
  const home = point(countsHomeId);
  if (usedPorts(homeSplitter(home), home.id).has(Number(countsPort.value))) return renderCounts();
  home.ds.port = Number(countsPort.value);
  saveCounts();
});

function saveCounts() {
  savePlan();
  renderCounts();
  renderRoute();
}

dsOn.addEventListener("change", () => {
  const home = point(countsHomeId);
  if (!dsOn.checked) {
    delete home.ds;
    return saveCounts();
  }
  const splitter = homeSplitter(home);
  const port = nextFreePort(splitter, home.id);
  if (port === null) {
    dsOn.checked = false;
    return alert(`Every port on ${splitter.name} is taken. Add a bigger splitter or free a port first.`);
  }
  home.ds = { splitterId: splitter.id, port };
  saveCounts();
});

document.getElementById("counts-done").addEventListener("click", () => {
  closeCounts();
  selectedId = null;
  renderRoute();
});

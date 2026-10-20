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

function equipmentLabel(eq) {
  return eq.type === "splitter" && eq.f2 ? `${eq.name} · F2 ${eq.f2}` : eq.name;
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
    const c = incomingCable(id);
    id = c ? c.from : null;
  }
  return null;
}

// The splitter feeding a home: the one its DS is on, else the first
// splitter at the nearest upstream location that has one.
function homeSplitter(home) {
  const c = incomingCable(home.id);
  const loc = c && feedingLocation(c.from);
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

// Splitters fed from the same physical cable share its fiber numbers.
function f2Problem(loc, eq, n) {
  if (!Number.isInteger(n) || n < 1) return "Enter a fiber number.";
  const c = incomingCable(loc.id);
  if (!c) return "";
  if (n > c.fibers) return `${c.name} only has ${c.fibers} fibers.`;
  const cable = cableStart(c).id;
  for (const p of plan.points) {
    const pc = incomingCable(p.id);
    if (!pc || cableStart(pc).id !== cable) continue;
    const clash = splittersAt(p).find((s) => s.id !== eq.id && s.f2 === n);
    if (clash) return `F2 ${n} already feeds ${clash.name} at ${p.name}.`;
  }
  return "";
}

function nextFreeF2(loc, eq) {
  const c = incomingCable(loc.id);
  const max = c ? c.fibers : 999;
  for (let n = 1; n <= max; n++) if (!f2Problem(loc, eq, n)) return n;
  return null;
}

// Ask which F2 fiber feeds a splitter. Saves on eq.f2, then calls done.
function askF2(loc, eq, done) {
  const c = incomingCable(loc.id);
  ask(`Which F2 fiber feeds ${eq.name} at ${loc.name}?`, [], () => {});
  const box = document.createElement("div");
  box.className = "f2-form";
  const input = document.createElement("input");
  input.type = "number";
  input.min = 1;
  if (c) input.max = c.fibers;
  input.value = eq.f2 || nextFreeF2(loc, eq) || "";
  const note = document.createElement("p");
  const save = document.createElement("button");
  save.type = "button";
  save.className = "btn big";
  save.textContent = "Save F2";
  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "btn ghost";
  skip.textContent = "Skip for now";
  const row = document.createElement("div");
  row.className = "row";
  row.append(skip, save);

  function check() {
    const n = Number(input.value);
    const problem = f2Problem(loc, eq, n);
    note.className = problem ? "error" : "hint";
    if (problem) note.textContent = problem;
    else if (c) {
      const f = colorCode(c.fibers)[n - 1];
      note.textContent = `Fiber ${n} on ${c.name}: ${f.tubeColor.name} tube, ${f.fiberColor.name} fiber.`;
    } else note.textContent = `No cable arrives at ${loc.name}, so F2 is just a number here.`;
    save.disabled = !!problem;
  }
  input.addEventListener("input", check);
  save.addEventListener("click", () => {
    eq.f2 = Number(input.value);
    done();
  });
  skip.addEventListener("click", () => done());
  box.append(input, note, row);
  wizardChoices.append(box);
  check();
  input.focus();
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
  const p = point(id);
  if (p.type !== "nid") return editSplitterF2(p);
  closeWizard();
  closeCable();
  closeImport();
  countsHomeId = id;
  countsPanel.hidden = false;
  renderCounts();
  countsPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function editSplitterF2(loc) {
  const list = splittersAt(loc);
  const go = (eq) => askF2(loc, eq, finish);
  if (list.length === 1) return go(list[0]);
  ask(`Which splitter at ${loc.name}?`,
    list.map((s) => ({ label: equipmentLabel(s), value: s.id })),
    (sid) => go(list.find((s) => s.id === sid)));
}

function renderCounts() {
  const home = point(countsHomeId);
  document.getElementById("counts-title").textContent = `Counts for ${home.name}`;
  const f2Box = document.getElementById("counts-f2");
  const c = incomingCable(home.id);
  const loc = c && feedingLocation(c.from);
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
    (splitter.f2 ? (f2Colors(splitter) ? ` · ${f2Colors(splitter)}` : "") : ". Set it from the splitter's location.");
  f2Box.append(big, detail);

  dsOn.disabled = false;
  dsOn.checked = !!home.ds;
  document.getElementById("counts-ds").hidden = !home.ds;
  if (!home.ds) return;

  // More than one splitter at that location: pick which one.
  const list = splittersAt(loc);
  const pick = document.getElementById("counts-splitters");
  pick.innerHTML = "";
  pick.hidden = list.length < 2;
  for (const s of list) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "big-btn" + (s.id === home.ds.splitterId ? "" : " secondary");
    b.textContent = equipmentLabel(s);
    b.addEventListener("click", () => {
      const port = nextFreePort(s, home.id);
      if (port === null) return alert(`Every port on ${s.name} is taken.`);
      home.ds = { splitterId: s.id, port };
      saveCounts();
    });
    pick.append(b);
  }

  document.getElementById("counts-ds-question").textContent = `DS port on ${splitter.name}`;
  const ports = document.getElementById("counts-ports");
  ports.innerHTML = "";
  const used = usedPorts(splitter, home.id);
  for (let n = 1; n <= splitterPorts(splitter); n++) {
    const b = document.createElement("button");
    b.type = "button";
    const taken = used.get(n);
    b.className = "big-btn port" + (home.ds.port === n ? "" : " secondary");
    b.disabled = !!taken;
    b.textContent = n;
    if (taken) {
      b.title = `Taken by ${taken.name}`;
      const who = document.createElement("small");
      who.textContent = taken.name;
      b.append(who);
    }
    b.addEventListener("click", () => {
      home.ds.port = n;
      saveCounts();
    });
    ports.append(b);
  }
}

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

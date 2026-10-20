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
    return showNote(`Every port on ${splitter.name} is taken. Add a bigger splitter or free a port first.`);
  }
  home.ds = { splitterId: splitter.id, port };
  saveCounts();
});

document.getElementById("counts-done").addEventListener("click", () => {
  closeCounts();
  selectedId = null;
  renderRoute();
});

// --- Counts for many homes at once ---

// Homes fed by the splitters at a location, in route order.
function homesFedBy(p) {
  const order = [];
  const walk = (id) => {
    for (const path of plan.paths.filter((x) => x.from === id)) {
      const m = point(path.to);
      if (!m) continue;
      if (m.type === "nid") {
        if (feedingLocation(id) === p) order.push(m);
      } else if (!splittersAt(m).length) walk(m.id);
    }
  };
  walk(p.id);
  return order;
}

function feedsHomes(p) {
  return splittersAt(p).length > 0 && homesFedBy(p).length > 0;
}

// Tick homes, pick a splitter and a first port, and give each ticked home
// the next free port in order.
function openBatchCounts(locId) {
  const L = point(locId);
  const ticked = new Set();
  openForm(`Home counts at ${L.name}`, (body, foot) => {
    const list = splittersAt(L);
    const sSel = selectEl(list.map((s) => ({ value: s.id, label: equipmentLabel(s) })));
    const start = inputEl("number", 1, { min: 1 });
    const skip = inputEl("checkbox");
    skip.checked = true;
    const table = el("div", "batch-list");
    const tools = el("div", "batch-tools");
    body.append(el("p", "hint", "Tick the homes to number, choose the splitter and its first port, then fill. Homes get ports in the order shown."),
      fieldEl("Splitter", sSel), fieldEl("Start at port", start));
    const skipRow = el("label", "check-row");
    skipRow.append(skip, el("span", "", "Skip ports already taken by other homes"));
    body.append(skipRow, tools, table);

    const homes = () => homesFedBy(L);
    function render() {
      const s = list.find((x) => x.id === sSel.value);
      start.max = splitterPorts(s);
      table.innerHTML = "";
      const head = el("div", "batch-row head");
      const all = inputEl("checkbox");
      all.checked = homes().length > 0 && homes().every((h) => ticked.has(h.id));
      all.addEventListener("change", () => {
        for (const h of homes()) all.checked ? ticked.add(h.id) : ticked.delete(h.id);
        render();
      });
      head.append(all, el("span", "", "Home"), el("span", "", "Lot"), el("span", "mono", "F2"), el("span", "mono", "DS"));
      table.append(head);
      for (const h of homes()) {
        const row = el("label", "batch-row" + (ticked.has(h.id) ? " on" : ""));
        const box = inputEl("checkbox");
        box.checked = ticked.has(h.id);
        box.addEventListener("change", () => {
          box.checked ? ticked.add(h.id) : ticked.delete(h.id);
          row.classList.toggle("on", box.checked);
        });
        const hs = homeSplitter(h);
        const f2 = hs && hs.f2 ? String(hs.f2) : "–";
        const ds = h.ds ? `${list.length > 1 ? findEquipment(h.ds.splitterId).name + " " : ""}${h.ds.port}` : "–";
        row.append(box, el("span", "", h.name), el("span", "", h.lot || ""), el("span", "mono", f2), el("span", "mono", ds));
        table.append(row);
      }
    }

    function fill() {
      const s = list.find((x) => x.id === sSel.value);
      const chosen = homes().filter((h) => ticked.has(h.id));
      if (!chosen.length) return "Tick at least one home.";
      const max = splitterPorts(s);
      let n = Number(start.value);
      if (!Number.isInteger(n) || n < 1 || n > max) return `${s.name} has ports 1 to ${max}.`;
      const chosenIds = new Set(chosen.map((h) => h.id));
      const taken = new Set([...usedPorts(s)].filter(([, h]) => !chosenIds.has(h.id)).map(([p]) => p));
      const plan2 = [];
      for (const h of chosen) {
        while (n <= max && skip.checked && taken.has(n)) n++;
        if (n > max) return `${s.name} runs out of ports after ${plan2.length} home${plan2.length === 1 ? "" : "s"}. Start lower, untick some homes, or add a bigger splitter.`;
        if (!skip.checked && taken.has(n)) return `Port ${n} is already taken by ${usedPorts(s).get(n).name}.`;
        plan2.push([h, n++]);
      }
      for (const [h, port] of plan2) h.ds = { splitterId: s.id, port };
      savePlan();
      renderRoute();
      render();
      formError.hidden = true;
      return "";
    }

    tools.append(btnEl("Tick all", () => {
      for (const h of homes()) ticked.add(h.id);
      render();
    }, "btn ghost"), btnEl("Tick homes without DS", () => {
      for (const h of homes()) if (!h.ds) ticked.add(h.id);
      render();
    }, "btn ghost"), btnEl("Clear DS on ticked", () => {
      const chosen = homes().filter((h) => ticked.has(h.id));
      if (!chosen.length) return;
      withUndo(`Cleared the DS count on ${chosen.length} home${chosen.length === 1 ? "" : "s"}.`, () => {
        for (const h of chosen) delete h.ds;
      });
      render();
    }, "btn ghost danger"));
    sSel.addEventListener("change", render);
    render();

    foot.append(btnEl("Done", finish, "btn ghost"), btnEl("Fill DS in order", () => {
      const problem = fill();
      formError.hidden = !problem;
      if (problem) formError.textContent = problem;
    }, "btn big"));
  });
  selectedId = locId;
  renderRoute();
}

// Paths, conduit and cables. Tapping the line between two locations
// opens one form for the path: its conduit, the cable placed on it (if
// any), and which incoming fibers that cable is spliced to.

const CONDUIT_SIZES = ["0.75in", "1in", "1.25in", "1.5in", "2in", "3in", "4in"];
const CONDUIT_COLORS = ["Orange", "Black", "Blue", "Green", "Red", "White", "Yellow", "Purple", "Gray", "Brown"];

// "2x 1.25in · Orange · 350 ft"
function conduitLabel(cd) {
  if (!cd) return "";
  const parts = [];
  if (cd.size) parts.push(`${cd.ducts || 1}x ${cd.size}`);
  if (cd.color) parts.push(cd.color);
  if (cd.footage) parts.push(`${cd.footage} ft`);
  return parts.join(" · ");
}

// --- Fiber picks ---
// A cable's `picks` say which fibers of the cable arriving at its start
// are spliced onto it: [{ inFrom, inTo, outFrom }]. No picks means the
// app chooses (automatic).

function expandPicks(picks) {
  const pairs = [];
  for (const r of picks || []) {
    for (let n = r.inFrom; n <= r.inTo; n++) pairs.push({ in: n, out: r.outFrom + (n - r.inFrom) });
  }
  return pairs;
}

// Pairs back into ranges, joining runs that go up together.
function toRanges(pairs) {
  const sorted = [...pairs].sort((a, b) => a.out - b.out);
  const ranges = [];
  for (const p of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && p.in === last.inTo + 1 && p.out === last.outFrom + (last.inTo - last.inFrom) + 1) last.inTo = p.in;
    else ranges.push({ inFrom: p.in, inTo: p.in, outFrom: p.out });
  }
  return ranges;
}

// Fibers of a physical cable that are spoken for no matter what the app
// picks: splitter F2 counts and fiber picks. n -> what uses it.
function fixedInUse(cableId, exceptId) {
  const used = new Map();
  for (const p of plan.points) {
    const pc = incomingCable(p.id);
    if (!pc || cableStart(pc).id !== cableId) continue;
    for (const s of splittersAt(p)) {
      if (s.id !== exceptId && s.f2) used.set(s.f2, `feeds ${s.name} at ${p.name}`);
    }
    for (const d of childCables(p.id)) {
      if (d.id === exceptId || d.through || !d.picks) continue;
      for (const pr of expandPicks(d.picks)) used.set(pr.in, `is spliced to ${d.name} #${pr.out} at ${p.name}`);
    }
  }
  return used;
}

// "Orange tube, Blue-Aqua" for fibers a..b of a cable.
function rangeColors(fibers, a, b) {
  const code = colorCode(fibers);
  const fa = code[a - 1];
  const fb = code[b - 1];
  if (!fa || !fb) return "";
  const many = tubeCount(fibers) > 1;
  const one = (f) => (many ? `${f.tubeColor.name} tube ` : "") + f.fiberColor.name;
  if (a === b) return one(fa);
  if (fa.tube === fb.tube) return (many ? `${fa.tubeColor.name} tube, ` : "") + `${fa.fiberColor.name}-${fb.fiberColor.name}`;
  return `${one(fa)} to ${one(fb)}`;
}

function rangeText(a, b) {
  return a === b ? `${a}` : `${a}-${b}`;
}

// --- Cable labels ---
// "1-12 to Handhole 2, 13-48 spare": which fibers are used and where
// they leave the cable.
function cableNote(model, c) {
  const start = cableStart(c);
  const { map } = model.assign(start);
  const exits = model.exits(start);
  const runs = [];
  for (let n = 1; n <= start.fibers; n++) {
    const it = map.get(n);
    const where = it ? exits.get(it) || "?" : null;
    const last = runs[runs.length - 1];
    if (last && last.where === where) last.to = n;
    else runs.push({ from: n, to: n, where });
  }
  if (runs.length === 1 && !runs[0].where) return "";
  return runs.map((r) => `${rangeText(r.from, r.to)} ${r.where ? `to ${r.where}` : "spare"}`).join(", ");
}

// "Dist 1 · 48F · 1-12 to HH2, 13-48 spare"
function cableAnnotation(model, c) {
  const note = isDrop(c) ? "" : cableNote(model, c);
  return [c.name, `${c.fibers}F`, note].filter(Boolean).join(" · ");
}

// --- The path on the route ---

let openPathId = null;

function pathEl(path, model) {
  const c = pathCable(path);
  const cd = conduitLabel(path.conduit);
  const b = el("button", "cable" + (c ? "" : " empty") + (c && c.through ? " through" : "") +
    (path.conduit && path.conduit.size ? " conduit" : "") + (path.to === openPathId ? " selected" : "") +
    (point(path.to).type === "nid" ? " drop" : "") + (c && phasePast(c) ? " past" : ""));
  b.type = "button";
  if (c) {
    const kind = cableKind(c);
    b.append(el("div", "cable-name", c.name || "Cable"),
      el("div", "cable-size", `${c.fibers}F` + (c.through ? " · continued" : "") +
        (kind !== "cable" ? ` · ${CABLE_KINDS[kind]}` : "") + (hasPhases() ? ` · P${phaseIdx(c) + 1}` : "")));
    if (!c.through && !isDrop(c) && model) {
      const note = cableNote(model, c);
      if (note) {
        const n = el("div", "cable-note", note);
        n.title = note;
        b.append(n);
      }
    }
  } else {
    b.append(el("div", "cable-name muted", "No cable"));
  }
  b.append(el("div", "line"));
  if (cd) b.append(el("div", "conduit-label", cd));
  if (c) {
    const tubes = el("div", "tubes");
    for (let t = 0; t < tubeCount(c.fibers); t++) tubes.append(swatch(colorAt(t), true));
    b.append(tubes);
  }
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    openPath(path.to);
  });
  return b;
}

// --- Path form ---

function openPath(toId) {
  const path = incomingPath(toId);
  const from = point(path.from);
  const to = point(path.to);
  const c = pathCable(path);
  const arriving = incomingCable(from.id);
  const inCable = arriving && cableStart(arriving);
  // The arriving cable can carry on along only one path out of a location.
  const continuesElsewhere = arriving && childCables(from.id).some((x) => x.through && x !== c);
  const toHome = to.type === "nid";
  const model = buildSpliceModel();

  openForm(`${from.name} → ${to.name}`, (body, foot) => {
    // Conduit
    body.append(el("h4", "form-section", "Path / conduit"));
    const cd = path.conduit || {};
    const size = selectEl([{ value: "", label: "No conduit" }, ...CONDUIT_SIZES.map((s) => ({ value: s, label: s }))], cd.size || "");
    const ducts = inputEl("number", cd.ducts || 1, { min: 1, max: 24 });
    const color = selectEl([{ value: "", label: "-" }, ...CONDUIT_COLORS.map((s) => ({ value: s, label: s }))], cd.color || "");
    const footage = inputEl("number", cd.footage || "", { min: 0, placeholder: "ft" });
    const grid = el("div", "form-grid");
    grid.append(fieldEl("Conduit size", size), fieldEl("Ducts", ducts), fieldEl("Color", color), fieldEl("Footage (ft)", footage));
    body.append(grid);

    // Cable
    body.append(el("h4", "form-section", "Cable"));
    const modes = [{ value: "none", label: "No cable" }, { value: "new", label: `Cable starting at ${from.name}` }];
    if (arriving && !continuesElsewhere) {
      modes.push({ value: "pass", label: `${arriving.name} passes through ${from.name}` },
        { value: "storage", label: `${arriving.name}, slack stored at ${from.name}` });
    }
    const mode = selectEl(modes, c ? c.through || "new" : "none");
    body.append(fieldEl("On this path", mode));

    const newBox = el("div", "form-grid");
    const startKind = c && !c.through ? c.kind || "cable" : "cable";
    const kind = selectEl(Object.entries(CABLE_KINDS).map(([value, label]) => ({ value, label })), startKind);
    const defaultName = () => nextCableName(kind.value, toHome);
    const name = inputEl("text", c && !c.through ? c.name : defaultName());
    let nameTouched = !!(c && !c.through);
    name.addEventListener("input", () => (nameTouched = true));
    kind.addEventListener("change", () => {
      if (!nameTouched) name.value = defaultName();
    });
    const fibers = selectEl(CABLE_SIZES.map((n) => ({ value: n, label: `${n}F` })),
      c && !c.through ? c.fibers : toHome ? 1 : 12);
    newBox.append(fieldEl("Type", kind), fieldEl("Name", name), fieldEl("Size", fibers));
    const phaseSel = phaseSelect(c);
    if (phaseSel) newBox.append(fieldEl("Phase", phaseSel));
    body.append(newBox);

    const contNote = el("p", "hint");
    body.append(contNote);

    // Fiber picker: which incoming fibers go onto this cable.
    const pickBox = el("div", "pick-box");
    body.append(pickBox);
    const pickMode = selectEl([{ value: "auto", label: "Automatic (suggested)" }, { value: "pick", label: "Choose fibers" }],
      c && !c.through && c.picks ? "pick" : "auto");
    let ranges = c && !c.through && c.picks ? c.picks.map((r) => ({ ...r })) : null;
    const rangesEl = el("div", "ranges");
    if (inCable) {
      pickBox.append(el("h4", "form-section", `Fibers spliced from ${inCable.name} at ${from.name}`),
        fieldEl("Fibers", pickMode), rangesEl);
      pickMode.addEventListener("change", renderRanges);
      fibers.addEventListener("change", () => {
        if (pickMode.value === "pick" && !rangesTouched) {
          ranges = suggestPicks(model, c, inCable, Number(fibers.value));
          renderRanges();
        }
      });
    }
    let rangesTouched = !!ranges;

    function renderRanges() {
      rangesEl.innerHTML = "";
      if (pickMode.value !== "pick") {
        rangesEl.append(el("p", "hint", "The app picks fibers as homes and splitters are added further on. " +
          "The splice sheet shows what it picked."));
        return;
      }
      if (!ranges) ranges = suggestPicks(model, c, inCable, Number(fibers.value));
      const outName = name.value.trim() || "this cable";
      ranges.forEach((r, i) => {
        const row = el("div", "range-row");
        const a = inputEl("number", r.inFrom, { min: 1, max: inCable.fibers });
        const b = inputEl("number", r.inTo, { min: 1, max: inCable.fibers });
        const o = inputEl("number", r.outFrom, { min: 1 });
        const info = el("span", "range-info");
        const update = () => {
          r.inFrom = Number(a.value);
          r.inTo = Number(b.value);
          r.outFrom = Number(o.value);
          const len = r.inTo - r.inFrom;
          const outTo = r.outFrom + len;
          info.textContent = len < 0 ? "" :
            `${rangeColors(inCable.fibers, r.inFrom, r.inTo)} → ${outName} #${rangeText(r.outFrom, outTo)}` +
            ` (${rangeColors(Number(fibers.value), r.outFrom, outTo)})`;
        };
        [a, b, o].forEach((x) => x.addEventListener("input", () => {
          rangesTouched = true;
          update();
        }));
        row.append(el("span", "", `${inCable.name} #`), a, el("span", "", "to"), b,
          el("span", "", `→ ${outName} from #`), o,
          btnEl("×", () => {
            ranges.splice(i, 1);
            rangesTouched = true;
            renderRanges();
          }, "btn ghost small"), info);
        rangesEl.append(row);
        update();
      });
      // Splitter outputs made here win over a pick on the same fiber.
      if (c && !c.through) {
        const here = splittersAt(from);
        const skipped = model.childFibers(c).filter((f) => f.in && here.some((sp) => f.item.startsWith(`port:${sp.id}:`)));
        if (skipped.length) {
          rangesEl.append(el("p", "hint", `Skipped: ${skipped.map((f) => `#${f.out}`).join(", ")} on ${c.name} ` +
            `carry splitter outputs from ${from.name}, so those picks aren't spliced.`));
        }
      }
      rangesEl.append(btnEl("+ Add a range", () => {
        const pairs = expandPicks(ranges);
        const lastIn = Math.max(0, ...pairs.map((p) => p.in));
        const lastOut = Math.max(0, ...pairs.map((p) => p.out));
        ranges.push({ inFrom: lastIn + 1, inTo: lastIn + 1, outFrom: lastOut + 1 });
        renderRanges();
      }, "btn ghost"));
    }

    function refresh() {
      const m = mode.value;
      newBox.hidden = m !== "new";
      pickBox.hidden = m !== "new" || !inCable;
      contNote.hidden = m !== "pass" && m !== "storage";
      if (!contNote.hidden) contNote.textContent = `Same cable as ${arriving.name}: ${arriving.fibers}F, no splicing at ${from.name}.`;
      if (m === "new" && inCable) renderRanges();
    }
    mode.addEventListener("change", refresh);
    name.addEventListener("change", () => pickMode.value === "pick" && renderRanges());
    refresh();

    // Color code and label for a cable that's already placed.
    if (c) {
      const info = el("details", "color-details");
      info.append(el("summary", "", `Color code and label for ${c.name}`),
        el("p", "cable-annotation", cableAnnotation(model, cableStart(c))), colorCodeList(c.fibers));
      body.append(info);
    }

    foot.append(btnEl("+ Add a stop on this path", () => insertStopForm(path), "btn ghost push-left"));
    if (c) foot.append(btnEl("Remove cable", () => {
      const text = removeCableText(c);
      finish();
      withUndo(text, () => removeCableFrom(c));
    }, "btn ghost danger"));
    formButtons(foot, () => {
      // Taking the cable off is the one change here worth an Undo.
      const before = JSON.stringify(plan);
      const removing = c && mode.value === "none" ? removeCableText(c) : null;
      const problem = saveCable();
      if (problem) return problem;
      const placed = pathCable(path);
      if (phaseSel && placed) placed.phase = phaseSel.value;
      saveConduit();
      finish();
      if (removing) offerUndo(removing, before);
    });

    function saveConduit() {
      const next = {};
      if (size.value) {
        next.size = size.value;
        next.ducts = Math.max(1, Number(ducts.value) || 1);
      }
      if (color.value) next.color = color.value;
      if (Number(footage.value) > 0) next.footage = Number(footage.value);
      if (Object.keys(next).length) path.conduit = next;
      else delete path.conduit;
    }

    function saveCable() {
      const m = mode.value;
      if (m === "none") {
        if (c) removeCableFrom(c);
        return "";
      }
      if (m === "pass" || m === "storage") {
        if (c && c.through) {
          c.through = m;
          return "";
        }
        const span = c || { id: makeId(), from: from.id, to: to.id };
        // Everything this cable ran on to now belongs to the arriving cable.
        const spans = c ? cableSpans(c) : [span];
        const stuck = f2Stuck(spans, arriving.fibers);
        if (stuck) return stuck;
        span.through = m;
        delete span.picks;
        delete span.kind;
        if (!c) plan.cables.push(span);
        for (const s of spans) {
          s.name = arriving.name;
          s.fibers = arriving.fibers;
        }
        return "";
      }
      // A cable starting here.
      const cableName = name.value.trim();
      if (!cableName) return "Name the cable.";
      const n = Number(fibers.value);
      let picks = null;
      if (inCable && pickMode.value === "pick") {
        const problem = checkPicks(ranges || [], inCable, n, cableName, c);
        if (problem) return problem;
        picks = ranges.map((r) => ({ ...r }));
      }
      const span = c || { id: makeId(), from: from.id, to: to.id };
      const wasThrough = span.through;
      delete span.through;
      const spans = c ? cableSpans(span) : [span];
      const stuck = f2Stuck(spans, n);
      if (stuck) {
        if (wasThrough) span.through = wasThrough;
        return stuck;
      }
      if (!c) plan.cables.push(span);
      for (const s of spans) {
        s.name = cableName;
        s.fibers = n;
      }
      if (kind.value === "cable") delete span.kind;
      else span.kind = kind.value;
      if (picks) span.picks = picks;
      else delete span.picks;
      return "";
    }
  });
  openPathId = toId;
  selectedId = null;
  renderRoute();
}

// Splitters fed from these spans must still have their F2 fiber.
function f2Stuck(spans, fibers) {
  const stuck = [];
  for (const s of spans) {
    for (const sp of splittersAt(point(s.to))) {
      if (sp.f2 > fibers) stuck.push(`${sp.name} at ${point(s.to).name} is on F2 ${sp.f2}`);
    }
  }
  return stuck.length ? `The cable can't be ${fibers}F: ${stuck.join("; ")}. Change those F2 counts first.` : "";
}

function checkPicks(ranges, inCable, outFibers, outName, c) {
  if (!ranges.length) return "Add at least one range of fibers, or set Fibers to Automatic.";
  const ins = new Set();
  const outs = new Set();
  const others = fixedInUse(inCable.id, c && c.id);
  for (const r of ranges) {
    if (![r.inFrom, r.inTo, r.outFrom].every((x) => Number.isInteger(x) && x >= 1)) return "Every range needs fiber numbers.";
    if (r.inTo < r.inFrom) return `${inCable.name} #${r.inFrom} to #${r.inTo} runs backwards.`;
    if (r.inTo > inCable.fibers) return `${inCable.name} only has ${inCable.fibers} fibers.`;
    if (r.outFrom + (r.inTo - r.inFrom) > outFibers) return `${outName} only has ${outFibers} fibers.`;
  }
  for (const p of expandPicks(ranges)) {
    if (ins.has(p.in)) return `${inCable.name} #${p.in} is picked twice.`;
    if (outs.has(p.out)) return `${outName} #${p.out} is picked twice.`;
    if (others.has(p.in)) return `${inCable.name} #${p.in} already ${others.get(p.in)}.`;
    ins.add(p.in);
    outs.add(p.out);
  }
  return "";
}

// A starting point for the picker: what the app picked for this cable,
// or else the next free fibers on the incoming cable, in order.
function suggestPicks(model, c, inCable, outFibers) {
  if (c && !c.through) {
    const pairs = model.autoPairs(c);
    if (pairs.length) return toRanges(pairs);
  }
  // Leave the fibers already carrying splitter outputs made here.
  const local = new Set();
  if (c && !c.through) {
    const here = splittersAt(point(c.from));
    for (const [n, it] of model.assign(c).map) if (here.some((sp) => it.startsWith(`port:${sp.id}:`))) local.add(n);
  }
  const used = new Set([...model.assign(inCable).map.keys(), ...fixedInUse(inCable.id, c && c.id).keys()]);
  if (c && !c.through) for (const p of model.autoPairs(c)) used.delete(p.in);
  const free = [];
  for (let n = 1; n <= inCable.fibers && free.length < outFibers; n++) if (!used.has(n)) free.push(n);
  const outs = [];
  for (let n = 1; n <= outFibers; n++) if (!local.has(n)) outs.push(n);
  return toRanges(free.slice(0, outs.length).map((n, i) => ({ in: n, out: outs[i] })));
}

// Take a cable off its path, along with the rest of its run past here.
function cableRunFrom(c) {
  const spans = cableSpans(c);
  return spans.slice(spans.indexOf(c));
}

function removeCableText(c) {
  const further = cableRunFrom(c).slice(1).map((s) => point(s.to).name);
  return further.length ? `Removed ${c.name} here and on to ${further.join(", ")}.` : `Removed ${c.name}.`;
}

function removeCableFrom(c) {
  const doomed = cableRunFrom(c);
  plan.cables = plan.cables.filter((x) => !doomed.includes(x));
}

// Every fiber of a cable with its tube and color.
function colorCodeList(n) {
  const list = el("div", "tube-list");
  const fibers = colorCode(n);
  for (let t = 1; t <= tubeCount(n); t++) {
    const row = el("div", "tube-row");
    const head = el("div", "tube-head");
    const tc = colorAt(t - 1);
    head.append(swatch(tc), document.createTextNode(` Tube ${t} · ${tc.name}`));
    const wrap = el("div", "fibers");
    for (const f of fibers.filter((x) => x.tube === t)) {
      const cell = el("div", "fiber");
      cell.append(el("span", "num", String(f.number)), swatch(f.fiberColor), document.createTextNode(f.fiberColor.name));
      wrap.append(cell);
    }
    row.append(head, wrap);
    list.append(row);
  }
  return list;
}

// --- Add a stop on a path: A -> C becomes A -> B -> C ---

function insertStopForm(path) {
  const c = pathCable(path);
  openForm(`Add a stop between ${point(path.from).name} and ${point(path.to).name}`, (body, foot) => {
    const types = [...ADD_TYPES, "other"];
    const type = selectEl(types.map((t) => ({ value: t, label: typeLabel(t) })), "handhole");
    const name = inputEl("text", autoName("handhole"));
    let touched = false;
    name.addEventListener("input", () => (touched = true));
    type.addEventListener("change", () => {
      if (!touched) name.value = type.value === "other" ? "" : autoName(type.value);
    });
    body.append(fieldEl("Type", type), fieldEl("Name", name));
    let what = null;
    let cableName = null;
    if (c) {
      what = selectEl([
        { value: "pass", label: `${c.name} passes through` },
        { value: "storage", label: `${c.name}, slack stored` },
        { value: "splice", label: `${c.name} is spliced (a new cable starts)` },
      ], "pass");
      cableName = inputEl("text", nextCableName("cable", false));
      const nameRow = fieldEl("Name of the cable leaving the splice", cableName);
      const sync = () => (nameRow.hidden = what.value !== "splice");
      what.addEventListener("change", sync);
      body.append(fieldEl("At the new stop", what), nameRow);
      sync();
    }
    formButtons(foot, () => {
      if (!name.value.trim()) return "Name the new stop.";
      if (c && what.value === "splice" && !cableName.value.trim()) return "Name the cable leaving the splice.";
      const stop = { id: makeId(), type: type.value, label: typeLabel(type.value), name: name.value.trim(), equipment: [] };
      plan.points.push(stop);
      // Both halves keep the conduit; the footage stays with the first.
      const after = { id: makeId(), from: stop.id, to: path.to };
      if (path.conduit) {
        after.conduit = { ...path.conduit };
        delete after.conduit.footage;
      }
      plan.paths.push(after);
      if (c) {
        const span = { id: makeId(), name: c.name, from: stop.id, to: c.to, fibers: c.fibers };
        if (what.value === "splice") span.name = cableName.value.trim();
        else span.through = what.value;
        plan.cables.push(span);
        c.to = stop.id;
        // A splice starts a new cable, so the rest of the old run takes its name.
        for (const s of cableSpans(span)) s.name = span.name;
      }
      path.to = stop.id;
      finish();
    }, "Add stop");
  });
}

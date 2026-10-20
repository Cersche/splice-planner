// The Grid layout, for people who want to arrange the route themselves.
// Every location sits in a cell of a grid. Hovering a location shows a +
// on each side, so the route can grow up, down, left or right, not just
// to the right. "Unlock" lets you drag locations to other cells; they
// snap into place, can't sit on top of each other, and can't be dragged
// far from the locations they connect to.
//
// Where each location sits is part of the plan (point.cell), so the
// arrangement is saved with the plan file and everyone sees the same one.
// Locations added in the other layouts get a cell next to the location
// that feeds them the first time the grid is drawn.

const CELL_W = 340;
const CELL_H = 170;
// How far (in cells) a location can be from what it connects to.
const GRID_REACH = 4;
const DIRS = {
  right: { dc: 1, dr: 0, label: "to the right of" },
  down: { dc: 0, dr: 1, label: "below" },
  left: { dc: -1, dr: 0, label: "to the left of" },
  up: { dc: 0, dr: -1, label: "above" },
};

let gridUnlocked = false;
// The side of the location whose + was pressed, for where the new one goes.
let gridAdd = null;

const cellKey = (c, r) => `${c},${r}`;

function hasCell(p) {
  return p && p.cell && Number.isFinite(p.cell.c) && Number.isFinite(p.cell.r);
}

function takenCells(exceptId) {
  const taken = new Set();
  for (const p of plan.points) if (p.id !== exceptId && hasCell(p)) taken.add(cellKey(p.cell.c, p.cell.r));
  return taken;
}

// The first free cell going one way from a cell: straight out first, then
// a little to either side, then further out.
function freeToward(cell, dir, taken = takenCells()) {
  const d = DIRS[dir] || DIRS.right;
  for (let k = 1; k <= GRID_REACH; k++) {
    for (const s of [0, 1, -1, 2, -2, 3, -3]) {
      const c = cell.c + d.dc * k + (d.dc ? 0 : s);
      const r = cell.r + d.dr * k + (d.dr ? 0 : s);
      if (!taken.has(cellKey(c, r))) return { c, r };
    }
  }
  return null;
}

// Any free cell, nearest first, leaning right.
function freeNear(cell, taken = takenCells()) {
  for (const dir of ["right", "down", "up", "left"]) {
    const hit = freeToward(cell, dir, taken);
    if (hit) return hit;
  }
  for (let k = GRID_REACH + 1; ; k++) {
    for (let r = -k; r <= k; r++) if (!taken.has(cellKey(cell.c + k, cell.r + r))) return { c: cell.c + k, r: cell.r + r };
  }
}

// The left-to-right route laid on the grid: a column per step, a row per
// branch, each location in line with its middle branch.
function tidyCells() {
  let row = 0;
  const walk = (id, col) => {
    const p = point(id);
    const kids = childPaths(id);
    if (!kids.length) {
      p.cell = { c: col, r: row++ };
      return p.cell.r;
    }
    const rows = kids.map((x) => walk(x.to, col + 1));
    p.cell = { c: col, r: rows[Math.floor((rows.length - 1) / 2)] };
    return p.cell.r;
  };
  walk(plan.points[0].id, 0);
}

// Give a cell to every location that doesn't have one yet.
function placeMissing() {
  if (!plan.points.some(hasCell)) return tidyCells();
  const taken = takenCells();
  for (const p of routeOrder()) {
    if (hasCell(p)) continue;
    const from = incomingPath(p.id);
    const parent = from && point(from.from);
    p.cell = freeNear(hasCell(parent) ? parent.cell : { c: -1, r: 0 }, taken);
    taken.add(cellKey(p.cell.c, p.cell.r));
  }
}

// A location just added (app.js addLocation) goes on the side whose + was
// pressed, or to the right.
function gridPlace(stop, fromId) {
  const parent = point(fromId);
  if (!hasCell(parent)) return;
  const dir = layoutNow() === "grid" && gridAdd && gridAdd.from === fromId ? gridAdd.dir : "right";
  stop.cell = freeToward(parent.cell, dir) || freeNear(parent.cell);
}

// Where a location may go: a free cell, close to what feeds it and to
// what it feeds.
function moveProblem(p, cell) {
  if (takenCells(p.id).has(cellKey(cell.c, cell.r))) return "That spot is taken.";
  const from = incomingPath(p.id);
  const near = [...(from ? [point(from.from)] : []), ...childPaths(p.id).map((x) => point(x.to))];
  for (const m of near) {
    if (!hasCell(m)) continue;
    if (Math.max(Math.abs(m.cell.c - cell.c), Math.abs(m.cell.r - cell.r)) > GRID_REACH) return `Too far from ${m.name}.`;
  }
  return null;
}

// --- Drawing ---

let gridBox = null; // the shown area: first column and row, size

function gridBoard() {
  placeMissing();
  const shown = plan.points.filter((p) => phaseShown(p));
  const cs = shown.map((p) => p.cell.c);
  const rs = shown.map((p) => p.cell.r);
  gridBox = { c0: Math.min(...cs), r0: Math.min(...rs) };
  gridBox.cols = Math.max(...cs) - gridBox.c0 + 1;
  gridBox.rows = Math.max(...rs) - gridBox.r0 + 1;
  const board = el("div", "grid-board" + (gridUnlocked ? " unlocked" : ""));
  board.style.width = gridBox.cols * CELL_W + "px";
  board.style.height = gridBox.rows * CELL_H + "px";
  board.style.setProperty("--cell-w", CELL_W + "px");
  board.style.setProperty("--cell-h", CELL_H + "px");
  const taken = takenCells();
  for (const p of shown) {
    const cell = el("div", "grid-cell");
    cell.dataset.id = p.id;
    cell.style.left = (p.cell.c - gridBox.c0) * CELL_W + "px";
    cell.style.top = (p.cell.r - gridBox.r0) * CELL_H + "px";
    const card = el("div", "grid-card");
    card.append(stopEl(p));
    if (p.type !== "nid" && !gridUnlocked) {
      for (const dir of Object.keys(DIRS)) {
        if (!freeToward(p.cell, dir, taken)) continue;
        const b = btnEl("+", (e) => {
          gridAdd = { from: p.id, dir };
          openAddMenu(p.id, e);
          const cap = menu.querySelector(".menu-cap");
          if (cap) cap.textContent = `Add a location ${DIRS[dir].label} ${p.name}`;
        }, `add-dir add-${dir}`);
        b.title = `Add a location ${DIRS[dir].label} ${p.name}`;
        b.setAttribute("aria-label", b.title);
        card.append(b);
      }
    }
    cell.append(card);
    board.append(cell);
  }
  return board;
}

// The lines between locations: out of the side facing the next one, a
// short way along, across, and into it, with the cable's name on the
// last stretch. Measured once the cards are laid out.
function drawGridLines() {
  const board = tree.querySelector(".grid-board");
  if (!board) return;
  for (const old of board.querySelectorAll(":scope > .grid-lines, :scope > .grid-label")) old.remove();
  const z = routeZoom();
  const base = board.getBoundingClientRect();
  if (!base.width) return;
  const box = (id) => {
    const s = board.querySelector(`.grid-cell[data-id="${CSS.escape(id)}"] .stop`);
    if (!s) return null;
    const r = s.getBoundingClientRect();
    const x = (r.left - base.left) / z;
    const y = (r.top - base.top) / z;
    const w = r.width / z;
    const h = r.height / z;
    return { l: x, r: x + w, t: y, b: y + h, cx: x + w / 2, cy: y + h / 2 };
  };
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "grid-lines");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", board.offsetWidth);
  svg.setAttribute("height", board.offsetHeight);
  const R = (v) => Math.round(v * 10) / 10;
  const labels = [];
  for (const path of plan.paths) {
    const a = point(path.from);
    const b = point(path.to);
    if (!a || !b || !phaseShown(b) || !hasCell(a) || !hasCell(b)) continue;
    const A = box(a.id);
    const B = box(b.id);
    if (!A || !B) continue;
    const dc = b.cell.c - a.cell.c;
    const dr = b.cell.r - a.cell.r;
    // Out the side whenever it's in another column; straight up or down
    // only within a column, so lines run in the gaps between cards.
    const side = dc !== 0;
    let d, lx, ly, arrow, along;
    if (side) {
      const s = Math.sign(dc);
      const x0 = s > 0 ? A.r : A.l;
      const x1 = s > 0 ? B.l - 9 : B.r + 9;
      const xm = x0 + s * WIRE_IN;
      d = Math.abs(B.cy - A.cy) < 1 ? `M${R(x0)},${R(A.cy)} H${R(x1)}` : `M${R(x0)},${R(A.cy)} H${R(xm)} V${R(B.cy)} H${R(x1)}`;
      arrow = `M${R(x1)},${R(B.cy - 7)} L${R(x1 + s * 9)},${R(B.cy)} L${R(x1)},${R(B.cy + 7)} Z`;
      lx = Math.abs(B.cy - A.cy) < 1 ? (x0 + x1) / 2 : (xm + x1) / 2;
      ly = B.cy;
      along = "h";
    } else {
      const s = Math.sign(dr) || 1;
      const y0 = s > 0 ? A.b : A.t;
      const y1 = s > 0 ? B.t - 9 : B.b + 9;
      const ym = y0 + s * WIRE_IN;
      d = Math.abs(B.cx - A.cx) < 1 ? `M${R(A.cx)},${R(y0)} V${R(y1)}` : `M${R(A.cx)},${R(y0)} V${R(ym)} H${R(B.cx)} V${R(y1)}`;
      arrow = `M${R(B.cx - 7)},${R(y1)} L${R(B.cx)},${R(y1 + s * 9)} L${R(B.cx + 7)},${R(y1)} Z`;
      lx = B.cx;
      ly = Math.abs(B.cx - A.cx) < 1 ? (y0 + y1) / 2 : (ym + y1) / 2;
      along = "v";
    }
    const c = pathCable(path);
    const color = wireColor(c);
    const cls = "grid-wire" + (c ? "" : " empty") + (c && phasePast(c) ? " past" : "") + (path.to === openPathId ? " selected" : "");
    const line = document.createElementNS(SVG_NS, "path");
    line.setAttribute("d", d);
    line.setAttribute("class", cls);
    line.style.stroke = color;
    const head = document.createElementNS(SVG_NS, "path");
    head.setAttribute("d", arrow);
    head.setAttribute("class", "grid-arrow" + (c ? "" : " empty"));
    head.style.fill = color;
    svg.append(line, head);

    const label = btnEl("", (e) => {
      e.stopPropagation();
      openPath(path.to);
    }, `grid-label ${along}` + (c ? "" : " empty") + (path.to === openPathId ? " selected" : ""));
    label.style.left = R(lx) + "px";
    label.style.top = R(ly) + "px";
    label.title = `${a.name} → ${b.name}`;
    if (c) {
      label.append(el("span", "cable-name", c.name || "Cable"),
        el("span", "cable-size", `${c.fibers}F` + (c.through ? " · continued" : "") + (hasPhases() ? ` · P${phaseIdx(c) + 1}` : "")));
    } else label.append(el("span", "cable-name muted", b.type === "nid" ? "No drop" : "No cable"));
    labels.push(label);
  }
  board.prepend(svg);
  board.append(...labels);
}

// --- Lock, unlock and tidy (zoom bar) ---

const gridLockBtn = document.getElementById("grid-lock");
const gridTidyBtn = document.getElementById("grid-tidy");
const routeHint = document.querySelector(".route-hint");
const HINT_ROUTE = routeHint.innerHTML;

function renderGridButtons() {
  const on = layoutNow() === "grid" && !isGuest();
  if (!on) gridUnlocked = false;
  gridLockBtn.hidden = !on;
  gridTidyBtn.hidden = !on;
  gridLockBtn.classList.toggle("on", gridUnlocked);
  gridLockBtn.replaceChildren(iconEl(gridUnlocked ? "unlock" : "lock"), document.createTextNode(gridUnlocked ? " Lock" : " Unlock"));
  gridLockBtn.title = gridUnlocked ? "Lock the locations in place" : "Unlock to drag locations around the grid";
  routeHint.innerHTML = layoutNow() !== "grid" ? HINT_ROUTE : gridUnlocked
    ? "Unlocked: drag a location to another spot on the grid. It snaps into place. Tap <b>Lock</b> when you're done."
    : "Point at a location for a <b>+</b> on each side: the next location goes that way. Tap a location for its options, or a line for its cable. <b>Unlock</b> to move locations around.";
}

gridLockBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (guestBlocked()) return;
  gridUnlocked = !gridUnlocked;
  closeMenu();
  selectedId = null;
  renderRoute();
  if (gridUnlocked) showNote("Drag a location to move it. It snaps to the grid. Tap Lock when you're done.");
});

gridTidyBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (guestBlocked()) return;
  withUndo("Laid the route out left to right again.", () => {
    for (const p of plan.points) delete p.cell;
    tidyCells();
  });
  fitAll();
});

// --- Dragging a location (unlocked) ---
// Starts before the canvas sees the press, so the canvas doesn't pan.

let gridDrag = null;

routeView.addEventListener("pointerdown", (e) => {
  if (layoutNow() !== "grid" || !gridUnlocked || e.button !== 0) return;
  const cellEl = e.target.closest(".grid-cell");
  if (!cellEl || !e.target.closest(".stop")) return;
  e.stopImmediatePropagation();
  const p = point(cellEl.dataset.id);
  gridDrag = { p, cellEl, x0: e.clientX, y0: e.clientY, moved: false, target: null, ghost: null };
  routeView.setPointerCapture(e.pointerId);
}, true);

routeView.addEventListener("pointermove", (e) => {
  if (!gridDrag) return;
  e.stopImmediatePropagation();
  const z = routeZoom();
  const dx = (e.clientX - gridDrag.x0) / z;
  const dy = (e.clientY - gridDrag.y0) / z;
  if (!gridDrag.moved && Math.hypot(dx * z, dy * z) < 6) return;
  if (!gridDrag.moved) {
    gridDrag.moved = true;
    gridDrag.cellEl.classList.add("dragging");
    gridDrag.ghost = el("div", "grid-ghost");
    gridDrag.cellEl.parentElement.append(gridDrag.ghost);
  }
  gridDrag.cellEl.style.transform = `translate(${dx}px, ${dy}px)`;
  const p = gridDrag.p;
  const target = { c: p.cell.c + Math.round(dx / CELL_W), r: p.cell.r + Math.round(dy / CELL_H) };
  const same = target.c === p.cell.c && target.r === p.cell.r;
  gridDrag.target = target;
  gridDrag.problem = same ? null : moveProblem(p, target);
  const g = gridDrag.ghost;
  g.style.left = (target.c - gridBox.c0) * CELL_W + "px";
  g.style.top = (target.r - gridBox.r0) * CELL_H + "px";
  g.classList.toggle("bad", !!gridDrag.problem);
  g.textContent = gridDrag.problem || "";
}, true);

function endGridDrag(e) {
  if (!gridDrag) return;
  e.stopImmediatePropagation();
  const { p, moved, target, problem } = gridDrag;
  gridDrag = null;
  if (!moved) return;
  // The press was a drag, not a tap on the card (pan.js).
  swallowClick = true;
  const same = !target || (target.c === p.cell.c && target.r === p.cell.r);
  if (same || problem || e.type === "pointercancel") {
    renderRoute();
    if (problem) showNote(problem);
    return;
  }
  withUndo(`Moved ${p.name}.`, () => {
    p.cell = target;
  });
}

routeView.addEventListener("pointerup", endGridDrag, true);
routeView.addEventListener("pointercancel", endGridDrag, true);

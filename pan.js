// The route sits on a canvas: drag the background (one finger on a
// phone) to move around, pinch or use +/- to zoom, "Fit all" to see the
// whole job. No scrollbars. The small overview in the corner shows where
// you are; tap it to jump.

const routeView = document.getElementById("route-view");
const minimap = document.getElementById("minimap");
const zoomLabel = document.getElementById("zoom-reset");

const ZOOM_MIN = 0.15;
const ZOOM_MAX = 2;
const view = { z: 1, x: 24, y: 24 };

function routeZoom() {
  return view.z;
}

function applyView() {
  tree.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
  zoomLabel.textContent = `${Math.round(view.z * 100)}%`;
  scheduleMinimap();
}

// The route's own size, before zooming.
function treeSize() {
  return { w: tree.scrollWidth, h: tree.scrollHeight };
}

// Keep at least a corner of the route on screen.
function clampView() {
  const { w, h } = treeSize();
  const vw = routeView.clientWidth;
  const vh = routeView.clientHeight;
  const keep = 80;
  view.x = Math.min(vw - keep, Math.max(keep - w * view.z, view.x));
  view.y = Math.min(vh - keep, Math.max(keep - h * view.z, view.y));
}

// Zoom keeping the point under (cx, cy) still (view coordinates).
function zoomAt(factor, cx, cy) {
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.z * factor));
  view.x = cx - ((cx - view.x) * z) / view.z;
  view.y = cy - ((cy - view.y) * z) / view.z;
  view.z = z;
  clampView();
  applyView();
}

function zoomCenter(factor) {
  zoomAt(factor, routeView.clientWidth / 2, routeView.clientHeight / 2);
}

// Adding or removing locations moves cards around inside the route;
// the canvas follows so the card in hand (or the start) stays put.
function rememberAnchor() {
  if (screens.route.hidden) return null;
  const card = tree.querySelector(".stop.selected") || tree.querySelector(".stop.start");
  if (!card) return null;
  const r = card.getBoundingClientRect();
  return { id: card.dataset.id, x: r.left, y: r.top };
}

function restoreAnchor(a) {
  if (!a) return;
  const card = tree.querySelector(`.stop[data-id="${CSS.escape(a.id)}"]`) || tree.querySelector(".stop.start");
  if (!card) return;
  const r = card.getBoundingClientRect();
  view.x += a.x - r.left;
  view.y += a.y - r.top;
  applyView();
}

function fitAll() {
  const { w, h } = treeSize();
  const vw = routeView.clientWidth;
  const vh = routeView.clientHeight;
  if (!w || !h || !vw || !vh) return;
  view.z = Math.min(1, Math.max(ZOOM_MIN, Math.min((vw - 40) / w, (vh - 40) / h)));
  // A small route sits on the left, where it grows from.
  view.x = view.z === 1 ? 24 : (vw - w * view.z) / 2;
  view.y = (vh - h * view.z) / 2;
  applyView();
}

// Where a new screen opens: the whole route if it's still readable,
// otherwise the start at a comfortable size.
function startView() {
  sizeView();
  fitAll();
  if (view.z >= 0.6) return;
  const start = tree.querySelector(".stop.start");
  const pos = start && treePos(start);
  view.z = 0.8;
  if (!pos) return applyView();
  view.x = 24;
  view.y = routeView.clientHeight / 2 - (pos.y + pos.h / 2) * view.z;
  clampView();
  applyView();
}

// An element's box in the route's own units.
function treePos(e) {
  const t = tree.getBoundingClientRect();
  const r = e.getBoundingClientRect();
  return { x: (r.left - t.left) / view.z, y: (r.top - t.top) / view.z, w: r.width / view.z, h: r.height / view.z };
}

// Bring something on the route to the middle of the screen.
function centerOn(e) {
  const pos = treePos(e);
  if (view.z < 0.6) view.z = 0.8;
  view.x = routeView.clientWidth / 2 - (pos.x + pos.w / 2) * view.z;
  view.y = routeView.clientHeight / 2 - (pos.y + pos.h / 2) * view.z;
  clampView();
  applyView();
}

// The canvas fills the window below the top bar.
function sizeView() {
  if (screens.route.hidden) return;
  const top = routeView.getBoundingClientRect().top + window.scrollY;
  routeView.style.height = Math.max(260, window.innerHeight - top - 12) + "px";
}

window.addEventListener("resize", () => {
  sizeView();
  scheduleMinimap();
});

document.getElementById("zoom-in").addEventListener("click", () => zoomCenter(1.25));
document.getElementById("zoom-out").addEventListener("click", () => zoomCenter(0.8));
document.getElementById("zoom-fit").addEventListener("click", fitAll);
zoomLabel.addEventListener("click", () => zoomCenter(1 / view.z));

// --- Dragging and pinching ---
// A drag that starts on a card still moves the canvas; it just doesn't
// count as a tap on the card.

const pointers = new Map();
let gesture = null;
let swallowClick = false;

function isControl(t) {
  return t.closest("input, select, textarea, .zoom-bar, .minimap");
}

routeView.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || isControl(e.target)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  swallowClick = false;
  if (pointers.size === 1) gesture = { kind: "pan", x0: e.clientX, y0: e.clientY, vx: view.x, vy: view.y, moved: false, id: e.pointerId };
  else if (pointers.size === 2) startPinch();
});

function startPinch() {
  const [a, b] = [...pointers.values()];
  const box = routeView.getBoundingClientRect();
  gesture = { kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: view.z, vx: view.x, vy: view.y,
    cx: (a.x + b.x) / 2 - box.left, cy: (a.y + b.y) / 2 - box.top, moved: true };
}

routeView.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId) || !gesture) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture.kind === "pan") {
    const dx = e.clientX - gesture.x0;
    const dy = e.clientY - gesture.y0;
    if (!gesture.moved && Math.hypot(dx, dy) < 6) return;
    if (!gesture.moved) {
      gesture.moved = true;
      routeView.setPointerCapture(e.pointerId);
      routeView.classList.add("panning");
    }
    view.x = gesture.vx + dx;
    view.y = gesture.vy + dy;
    clampView();
    applyView();
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const box = routeView.getBoundingClientRect();
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const cx = (a.x + b.x) / 2 - box.left;
    const cy = (a.y + b.y) / 2 - box.top;
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (gesture.z0 * d) / gesture.d0));
    // Zoom about the starting midpoint, then follow the fingers.
    view.x = gesture.cx - ((gesture.cx - gesture.vx) * z) / gesture.z0 + (cx - gesture.cx);
    view.y = gesture.cy - ((gesture.cy - gesture.vy) * z) / gesture.z0 + (cy - gesture.cy);
    view.z = z;
    clampView();
    applyView();
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (gesture && gesture.moved) swallowClick = true;
  if (pointers.size === 1 && gesture && gesture.kind === "pinch") {
    // One finger left after a pinch: carry on panning with it.
    const [id, p] = [...pointers.entries()][0];
    gesture = { kind: "pan", x0: p.x, y0: p.y, vx: view.x, vy: view.y, moved: true, id };
  } else if (!pointers.size) {
    gesture = null;
    routeView.classList.remove("panning");
    if (swallowClick) drawFans();
  }
}

routeView.addEventListener("pointerup", endPointer);
routeView.addEventListener("pointercancel", endPointer);

// A drag isn't a tap: keep it from opening a menu.
routeView.addEventListener("click", (e) => {
  if (!swallowClick) return;
  swallowClick = false;
  e.stopPropagation();
  e.preventDefault();
}, true);

// Mouse wheel and trackpad: scroll moves, pinch (or Ctrl + wheel) zooms.
routeView.addEventListener("wheel", (e) => {
  if (isControl(e.target)) return;
  e.preventDefault();
  const box = routeView.getBoundingClientRect();
  if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - box.left, e.clientY - box.top);
  else {
    view.x -= e.shiftKey ? e.deltaY : e.deltaX;
    view.y -= e.shiftKey ? 0 : e.deltaY;
    clampView();
    applyView();
  }
}, { passive: false });

// --- Overview map ---

let minimapQueued = false;

function scheduleMinimap() {
  if (minimapQueued) return;
  minimapQueued = true;
  requestAnimationFrame(() => {
    minimapQueued = false;
    drawMinimap();
  });
}

let minimapScale = 1;

function drawMinimap() {
  const { w, h } = treeSize();
  const vw = routeView.clientWidth;
  const vh = routeView.clientHeight;
  // Nothing to find when the whole route is on screen.
  const fits = w * view.z <= vw && h * view.z <= vh && view.x >= 0 && view.y >= 0 &&
    view.x + w * view.z <= vw && view.y + h * view.z <= vh;
  minimap.hidden = !w || fits;
  if (minimap.hidden) return;
  const W = minimap.width;
  const H = minimap.height;
  minimapScale = Math.min((W - 8) / w, (H - 8) / h);
  const ctx = minimap.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  const ox = 4;
  const oy = 4;
  const t = tree.getBoundingClientRect();
  ctx.fillStyle = "#3f8be0";
  for (const s of tree.querySelectorAll(".stop")) {
    const r = s.getBoundingClientRect();
    ctx.fillStyle = getComputedStyle(s).getPropertyValue("--c") || "#8796a6";
    ctx.fillRect(ox + ((r.left - t.left) / view.z) * minimapScale, oy + ((r.top - t.top) / view.z) * minimapScale,
      Math.max(2, (r.width / view.z) * minimapScale), Math.max(2, (r.height / view.z) * minimapScale));
  }
  // What's on screen now.
  ctx.strokeStyle = "#dfe6ee";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ox + (-view.x / view.z) * minimapScale, oy + (-view.y / view.z) * minimapScale,
    (vw / view.z) * minimapScale, (vh / view.z) * minimapScale);
}

function minimapJump(e) {
  const box = minimap.getBoundingClientRect();
  const sx = minimap.width / box.width;
  const mx = ((e.clientX - box.left) * sx - 4) / minimapScale;
  const my = ((e.clientY - box.top) * sx - 4) / minimapScale;
  view.x = routeView.clientWidth / 2 - mx * view.z;
  view.y = routeView.clientHeight / 2 - my * view.z;
  clampView();
  applyView();
}

let minimapDrag = false;
minimap.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  minimapDrag = true;
  minimap.setPointerCapture(e.pointerId);
  minimapJump(e);
});
minimap.addEventListener("pointermove", (e) => minimapDrag && minimapJump(e));
minimap.addEventListener("pointerup", () => (minimapDrag = false));
minimap.addEventListener("click", (e) => e.stopPropagation());

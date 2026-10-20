// Fixing mistakes without starting over: change a cable's size, remove
// equipment, and move a location so it's fed from somewhere else.

// --- Change a cable's size ---

document.getElementById("cable-resize").addEventListener("click", () => {
  const c = plan.cables.find((x) => x.id === openCableId);
  const spans = cableSpans(c);
  const start = spans[0];
  const toHome = spans.some((s) => point(s.to).type === "nid");
  closeCable();
  ask(`New size for ${start.name}? (now ${start.fibers}F)`,
    (toHome ? DROP_COUNTS : FIBER_COUNTS).map((n) => ({ label: String(n), value: n })),
    (fibers) => {
      // Splitters fed from this cable must still have their F2 fiber.
      const stuck = [];
      for (const s of spans) {
        for (const sp of splittersAt(point(s.to))) {
          if (sp.f2 > fibers) stuck.push(`${sp.name} at ${point(s.to).name} is on F2 ${sp.f2}`);
        }
      }
      if (stuck.length) {
        alert(`${start.name} can't go down to ${fibers}F: ${stuck.join("; ")}. Change those F2 counts first.`);
        return openCable(c.id);
      }
      for (const s of spans) s.fibers = fibers;
      finish();
      openCable(c.id);
    });
});

// --- Remove equipment ---

function removeEquipment(locId) {
  const p = point(locId);
  const list = p.equipment || [];
  ask(`Which equipment do you want to remove from ${p.name}?`,
    list.map((eq) => ({ label: equipmentLabel(eq), value: eq.id })),
    (eqId) => {
      const eq = list.find((x) => x.id === eqId);
      const onIt = plan.points.filter((h) => h.ds && h.ds.splitterId === eqId);
      const msg = onIt.length
        ? `Remove ${eq.name}? ${onIt.length} home(s) have DS counts on it, and those DS counts will be cleared.`
        : `Remove ${eq.name}?`;
      if (!confirm(msg)) return finish();
      p.equipment = list.filter((x) => x.id !== eqId);
      for (const h of onIt) delete h.ds;
      finish();
    });
}

// --- Move a location ---
// The location keeps everything fed from it; only where it's fed from
// changes. The cable into it moves with it.

let moving = null;
const moveBanner = document.getElementById("move-banner");

function startMove(id) {
  moving = id;
  document.getElementById("move-text").textContent =
    `Tap the location ${point(id).name} should be fed from.`;
  moveBanner.hidden = false;
  selectedId = id;
  renderRoute();
  moveBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function endMove() {
  moving = null;
  moveBanner.hidden = true;
  selectedId = null;
  renderRoute();
}

document.getElementById("move-cancel").addEventListener("click", endMove);

// Everything downstream of a location, including itself.
function downstream(id) {
  const ids = new Set([id]);
  for (const c of childCables(id)) for (const x of downstream(c.to)) ids.add(x);
  return ids;
}

function finishMove(targetId) {
  const id = moving;
  const p = point(id);
  const target = point(targetId);
  if (targetId === id) return;
  if (downstream(id).has(targetId)) {
    return alert(`${p.name} can't be fed from ${target.name}, because ${target.name} is fed from ${p.name}.`);
  }
  if (target.type === "nid") return alert("A home can't feed anything. Tap a splice, handhole, cabinet or other location.");
  const c = incomingCable(id);
  if (c.from === targetId) return endMove();
  if (!confirm(`Feed ${p.name} from ${target.name} instead of ${point(c.from).name}?`)) return;
  // A cable that passed through its old spot now starts at the new one.
  if (c.through) {
    delete c.through;
    const name = nextCableName();
    for (const s of cableSpans(c)) s.name = name;
  }
  c.from = targetId;
  savePlan();
  endMove();
}

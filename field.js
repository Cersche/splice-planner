// Field mode: a crew picks "Field crew" at the top. They can't change the
// plan, but on each location's sheet they leave notes and as-builts
// (built or not, the footage they really pulled, where it really is).
// It all goes in the plan file, so Save sends it back to the office.

const FIELD_STATUS = {
  "": "Not built yet",
  built: "Built as planned",
  changed: "Built with changes",
  problem: "Problem",
};
const FIELD_NAME_KEY = "splicePlanner.fieldName";

// Who's writing: a planner's name, or the crew member's own.
function fieldWho(input) {
  if (!isGuest()) return currentUser();
  const n = input.value.trim();
  if (n) writeStore(FIELD_NAME_KEY, n);
  return n;
}

// Chips on the location's card: how it was built and how many notes.
function fieldChips(p) {
  const f = p.field;
  if (!f) return [];
  const out = [];
  if (f.status) out.push(el("span", `chip field-${f.status}`, FIELD_STATUS[f.status]));
  if (f.notes && f.notes.length) out.push(el("span", "chip field-note", plural(f.notes.length, "note")));
  return out;
}

// The notes and as-built box on a location's splice sheet. Everyone can
// fill it in; for a crew it's the only thing they can change.
function renderFieldBox(locId) {
  let box = document.getElementById("field-box");
  if (!box) {
    box = el("div", "field-box");
    box.id = "field-box";
    document.getElementById("splice-views").before(box);
  }
  const p = point(locId);
  const f = p.field || {};
  box.replaceChildren(el("h4", "form-section", "Field notes and as-built"));

  const status = selectEl(Object.entries(FIELD_STATUS).map(([value, label]) => ({ value, label })), f.status || "");
  const inPath = incomingPath(p.id);
  const footage = inputEl("number", f.footage || "", { min: 0, placeholder: "ft" });
  const gps = inputEl("text", f.gps || "", { placeholder: "lat, long" });
  const here = btnEl("Use my location", () => {
    if (!navigator.geolocation) return showNote("This device can't share its location.");
    navigator.geolocation.getCurrentPosition(
      (pos) => (gps.value = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
      () => showNote("Couldn't get the location."));
  }, "btn ghost small");
  const grid = el("div", "form-grid");
  grid.append(fieldEl("Status", status));
  if (inPath) grid.append(fieldEl(`Footage pulled from ${point(inPath.from).name} (ft)`, footage));
  const gpsRow = el("div", "inline-fields");
  gpsRow.append(gps, here);
  grid.append(fieldEl("GPS as built", gpsRow));
  box.append(grid);

  // Notes, newest last, each with who and when.
  const list = el("ul", "field-notes");
  for (const n of f.notes || []) {
    list.append(el("li", "", `${n.text} (${n.by || "crew"}, ${new Date(n.at).toLocaleString()})`));
  }
  if (list.childNodes.length) box.append(list);
  const note = inputEl("textarea", "", { rows: 2, placeholder: "Add a note: what you found, what changed" });
  box.append(fieldEl("New note", note));
  const name = inputEl("text", readStore(FIELD_NAME_KEY) || "", { placeholder: "Your name" });
  if (isGuest()) box.append(fieldEl("Your name", name));
  const err = el("p", "error");
  err.hidden = true;

  box.append(err, btnEl("Save field notes", () => {
    const by = fieldWho(name);
    if (isGuest() && !by) {
      err.textContent = "Enter your name.";
      err.hidden = false;
      return;
    }
    const next = { ...f, notes: [...(f.notes || [])] };
    next.status = status.value;
    if (Number(footage.value) > 0) next.footage = Number(footage.value);
    else delete next.footage;
    if (gps.value.trim()) next.gps = gps.value.trim();
    else delete next.gps;
    if (note.value.trim()) next.notes.push({ id: makeId(), by, at: Date.now(), text: note.value.trim() });
    next.by = by;
    next.at = Date.now();
    p.field = next;
    savePlan();
    renderRoute();
    renderFieldBox(locId);
    showNote(isGuest() ? "Saved. Use Save at the top to send the plan file back to the office." : "Field notes saved.");
  }, "btn"));
}

// Lines for the printed sheet.
function fieldLines(p) {
  const f = p.field;
  if (!f) return [];
  const lines = [];
  if (f.status) lines.push(`As-built: ${FIELD_STATUS[f.status]}${f.by ? ` (${f.by})` : ""}`);
  if (f.footage) lines.push(`Footage pulled: ${f.footage} ft`);
  if (f.gps) lines.push(`GPS: ${f.gps}`);
  for (const n of f.notes || []) lines.push(`Note: ${n.text} (${n.by || "crew"}, ${new Date(n.at).toLocaleDateString()})`);
  return lines;
}

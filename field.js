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
// Photos are shrunk to this many pixels on the long side and saved as
// JPEG, about 100 KB each, so a plan file stays easy to send.
const PHOTO_PX = 1024;
const PHOTO_QUALITY = 0.6;
const PHOTOS_MAX = 12;

// A picked photo, shrunk, as a data URL.
function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, PHOTO_PX / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", PHOTO_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("not an image"));
    };
    img.src = url;
  });
}

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
  if (f.photos && f.photos.length) out.push(el("span", "chip field-note", plural(f.photos.length, "photo")));
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
  // Photos: tap one to see it full size; planners can take one off.
  const shots = el("div", "field-photos");
  for (const ph of (f.photos || []).filter((x) => /^data:image\//.test(x.src))) {
    const fig = el("figure", "");
    const img = document.createElement("img");
    img.src = ph.src;
    img.alt = `Photo by ${ph.by || "crew"}`;
    img.title = `${ph.by || "crew"}, ${new Date(ph.at).toLocaleString()}`;
    img.addEventListener("click", () => {
      const w = window.open();
      if (!w) return;
      const big = w.document.createElement("img");
      big.src = ph.src;
      big.style.maxWidth = "100%";
      w.document.body.append(big);
    });
    fig.append(img);
    if (!isGuest()) fig.append(btnEl("×", () => {
      p.field = { ...f, photos: f.photos.filter((x) => x.id !== ph.id) };
      savePlan();
      renderRoute();
      renderFieldBox(locId);
    }, "photo-x"));
    shots.append(fig);
  }
  if (shots.childNodes.length) box.append(shots);
  const pick = inputEl("file", "", { accept: "image/*", multiple: true });
  pick.addEventListener("change", async () => {
    const by = fieldWho(name);
    if (isGuest() && !by) {
      pick.value = "";
      err.textContent = "Enter your name, then add the photos.";
      err.hidden = false;
      return;
    }
    const have = (p.field && p.field.photos) || [];
    const files = [...pick.files].slice(0, PHOTOS_MAX - have.length);
    if (files.length < pick.files.length) showNote(`A location holds up to ${PHOTOS_MAX} photos.`);
    const added = [];
    for (const file of files) {
      try {
        added.push({ id: makeId(), by, at: Date.now(), src: await shrinkPhoto(file) });
      } catch {
        showNote(`${file.name} isn't a photo this browser can read.`);
      }
    }
    if (!added.length) return;
    p.field = { ...(p.field || {}), photos: [...have, ...added] };
    savePlan();
    renderRoute();
    renderFieldBox(locId);
    showNote(`Added ${plural(added.length, "photo")}.`);
  });
  box.append(fieldEl("Add photos", pick));

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
  if (f.photos && f.photos.length) lines.push(`${plural(f.photos.length, "photo")} in the plan file`);
  for (const n of f.notes || []) lines.push(`Note: ${n.text} (${n.by || "crew"}, ${new Date(n.at).toLocaleDateString()})`);
  return lines;
}

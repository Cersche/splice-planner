// Small helpers for building forms and dialogs, shared by every screen.

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// options: [{ value, label, disabled, group }]. Options with the same
// group sit together under a heading in the dropdown.
function selectEl(options, value) {
  const s = document.createElement("select");
  let group = null;
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = String(o.value);
    opt.textContent = o.label;
    if (o.disabled) opt.disabled = true;
    if (o.group) {
      if (!group || group.label !== o.group) {
        group = document.createElement("optgroup");
        group.label = o.group;
        s.append(group);
      }
      group.append(opt);
    } else {
      group = null;
      s.append(opt);
    }
  }
  if (value !== undefined && value !== null) s.value = String(value);
  return s;
}

function inputEl(type, value, attrs = {}) {
  const i = document.createElement(type === "textarea" ? "textarea" : "input");
  if (type !== "textarea") i.type = type;
  if (value !== undefined && value !== null) i.value = value;
  for (const [k, v] of Object.entries(attrs)) i.setAttribute(k, v);
  if (type === "text") i.autocomplete = "off";
  return i;
}

// A labeled row in a form.
function fieldEl(label, control, hint) {
  const row = el("label", "field-row");
  row.append(el("span", "field-label", label), control);
  if (hint) row.append(el("span", "field-hint", hint));
  return row;
}

function btnEl(label, onClick, className = "btn") {
  const b = el("button", className, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function xButton(onClick) {
  const x = btnEl("×", (e) => {
    e.stopPropagation();
    onClick();
  }, "dialog-x");
  x.title = "Close";
  x.setAttribute("aria-label", "Close");
  return x;
}

// --- Dialogs ---
// Only one dialog is open at a time. Each one is registered with the
// function that hides it and clears its state; the X in its corner also
// clears the selected location.

const panels = [];

function registerPanel(panel, reset) {
  panel.prepend(xButton(() => {
    reset();
    selectedId = null;
    renderRoute();
  }));
  panels.push({ panel, reset });
}

function closePanels() {
  for (const p of panels) if (!p.panel.hidden) p.reset();
}

// The general-purpose form dialog: a title, a body built by the caller
// and a row of buttons.
const formPanel = document.getElementById("form-panel");
const formTitle = document.getElementById("form-title");
const formBody = document.getElementById("form-body");
const formFoot = document.getElementById("form-foot");
const formError = document.getElementById("form-error");

function openForm(title, build, wide) {
  closePanels();
  closeMenu();
  formPanel.classList.toggle("wide", !!wide);
  formPanel.classList.remove("cx-panel");
  formTitle.textContent = title;
  formBody.innerHTML = "";
  formFoot.innerHTML = "";
  formError.hidden = true;
  build(formBody, formFoot);
  formPanel.hidden = false;
  formPanel.scrollTop = 0;
  // Only jump to a box you type in; lists of equipment or ports stay put.
  const first = formBody.querySelector(".field-row input[type=text], .field-row textarea");
  if (first) first.focus();
}

function closeForm() {
  formPanel.hidden = true;
  openPathId = null;
  formBody.innerHTML = "";
  formFoot.innerHTML = "";
}

registerPanel(formPanel, closeForm);

// Cancel and Save buttons for the bottom of a form. onSave returns an
// error message to keep the form open, or nothing when it's done.
function formButtons(foot, onSave, saveLabel = "Save") {
  const save = btnEl(saveLabel, () => {
    const problem = onSave();
    formError.hidden = !problem;
    if (problem) formError.textContent = problem;
  }, "btn big");
  foot.append(btnEl("Cancel", () => {
    closeForm();
    selectedId = null;
    renderRoute();
  }, "btn ghost"), save);
  return save;
}

// --- Undo bar ---
// No Yes/No popups: things happen right away, and a bar at the bottom
// offers to take them back for a few seconds.

const undoBar = el("div", "undo-bar");
undoBar.hidden = true;
undoBar.setAttribute("role", "status");
document.body.append(undoBar);
let undoTimer = null;

function showNote(text, undo) {
  clearTimeout(undoTimer);
  undoBar.innerHTML = "";
  undoBar.append(el("span", "undo-text", text));
  if (undo) {
    undoBar.append(btnEl("Undo", () => {
      undoBar.hidden = true;
      undo();
    }, "undo-btn"));
  }
  const x = btnEl("×", () => (undoBar.hidden = true), "undo-x");
  x.setAttribute("aria-label", "Dismiss");
  undoBar.append(x);
  undoBar.hidden = false;
  undoTimer = setTimeout(() => (undoBar.hidden = true), undo ? 10000 : 6000);
}

// Snapshot the plan, do `act`, and offer Undo. Undo puts the whole plan
// back and closes any open dialog, since it showed the old state.
function withUndo(text, act) {
  const before = JSON.stringify(plan);
  const result = act();
  savePlan();
  renderRoute();
  offerUndo(text, before);
  return result;
}

function offerUndo(text, before) {
  showNote(text, () => {
    plan = migratePlan(JSON.parse(before));
    savePlan();
    closePanels();
    closeMenu();
    selectedId = null;
    if (typeof show === "function") show("route");
    showNote("Undone.");
  });
}

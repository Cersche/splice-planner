// Who is working. There's no server, so this is a name picker, not a
// login: anyone can pick any name. The name goes on what they add, on
// the plan's "made by" and "last edited by", on shared files and on
// prints. Guest (the default) can look and print but not change things.

const USER_KEY = "splicePlanner.user";
const USERS_KEY = "splicePlanner.users";
const GUEST = "Guest";
const DEFAULT_USERS = ["Dave", "Brian"];

// Storage can be off (private windows); keep a copy in memory too.
let userNow = null;

function readStore(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The choice still holds until the page is closed.
  }
}

function userList() {
  try {
    const list = JSON.parse(readStore(USERS_KEY));
    if (Array.isArray(list) && list.length) return list;
  } catch {
    // Fall back to the starting names.
  }
  return [...DEFAULT_USERS];
}

function currentUser() {
  if (userNow) return userNow;
  const saved = readStore(USER_KEY);
  return saved && (saved === GUEST || userList().includes(saved)) ? saved : GUEST;
}

function isGuest() {
  return currentUser() === GUEST;
}

function setUser(name) {
  userNow = name;
  writeStore(USER_KEY, name);
  applyUser();
}

// --- Stamps ---
// Every save compares the plan with the last one; a real change (not
// just which phase is on screen) records who made it and when. Anything
// new gets the name of who added it.

let lastBody = null;

function planBody() {
  const { phase, print, printMode, editedBy, editedAt, ...rest } = plan;
  return JSON.stringify(rest);
}

function eachStampable(fn) {
  for (const p of plan.points) {
    fn(p);
    for (const e of p.equipment || []) fn(e);
  }
  for (const c of plan.cables) fn(c);
  for (const x of plan.paths) fn(x);
  for (const x of plan.xconnects) fn(x);
}

// After a plan is opened or started: what's there now is the baseline.
// Things from before names existed are marked as the plan's maker's.
function resetEditBaseline() {
  lastBody = null;
}

function stampEdit() {
  if (lastBody === null) {
    eachStampable((o) => {
      if (o.addedBy === undefined) o.addedBy = plan.createdBy && plan.createdBy !== GUEST ? plan.createdBy : "";
    });
    lastBody = planBody();
    return;
  }
  if (isGuest()) return;
  const user = currentUser();
  eachStampable((o) => {
    if (o.addedBy === undefined) o.addedBy = user;
  });
  const body = planBody();
  if (body === lastBody) return;
  plan.editedBy = user;
  plan.editedAt = new Date().toISOString();
  if (!plan.createdBy || plan.createdBy === GUEST) plan.createdBy = user;
  lastBody = body;
}

function shortDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// "Drafted by Brian · last edited by Dave, Oct 20"
function authorLine(p = plan) {
  const parts = [];
  if (p.createdBy && p.createdBy !== GUEST) parts.push(`Drafted by ${p.createdBy}`);
  if (p.editedBy && (p.editedBy !== p.createdBy || p.editedAt)) {
    parts.push(`last edited by ${p.editedBy}${p.editedAt ? `, ${shortDate(p.editedAt)}` : ""}`);
  }
  return parts.join(" · ");
}

// --- Picker ---
// The same dropdown on the splash and in the top bar.

const userPicks = document.querySelectorAll("[data-user-pick]");

function renderUserPicks() {
  const opts = [...userList().map((n) => ({ value: n, label: n })), { value: GUEST, label: "Field crew (view, notes, as-builts)" },
    { value: "+", label: "+ Add a name…" }];
  for (const s of userPicks) {
    s.replaceChildren(...selectEl(opts).childNodes);
    s.value = currentUser();
  }
}

for (const s of userPicks) {
  s.addEventListener("change", () => {
    if (s.value === "+") {
      s.value = currentUser();
      return addUserForm();
    }
    setUser(s.value);
    welcome(s.value);
  });
}

function addUserForm() {
  openForm("Add a name", (body, foot) => {
    const name = inputEl("text", "", { placeholder: "e.g. Maria" });
    body.append(fieldEl("Name", name, "Shows on what this person adds, on shared files and on prints."));
    formButtons(foot, () => {
      const n = name.value.trim();
      if (!n) return "Type a name.";
      if (n.toLowerCase() === GUEST.toLowerCase()) return "Guest is already on the list.";
      const list = userList();
      if (!list.includes(n)) list.push(n);
      writeStore(USERS_KEY, JSON.stringify(list));
      closeForm();
      setUser(n);
      welcome(n);
    }, "Add");
  });
}

// --- Welcome ---
// Picking your name is "logging in": a short greeting with the logo that
// fades on its own (tap to close it sooner). First time on this device
// it's "Welcome", after that "Welcome back".

const SEEN_KEY = "splicePlanner.seen";
const welcomeToast = document.getElementById("welcome-toast");
let welcomeTimer = null;

function welcome(name) {
  let seen = [];
  try {
    seen = JSON.parse(readStore(SEEN_KEY)) || [];
  } catch {
    // Treat as a first visit.
  }
  const back = seen.includes(name);
  if (!back && name !== GUEST) writeStore(SEEN_KEY, JSON.stringify([...seen, name]));
  const title = name === GUEST ? "Welcome!" : `Welcome${back ? " back" : ""}, ${name}`;
  const sub = name === GUEST ? "You're browsing as a guest: open and print plans." : "Fiber Fast Homes · Splice Planner";
  const img = document.createElement("img");
  img.src = "assets/mark.png";
  img.alt = "";
  const words = el("div", "welcome-words");
  words.append(el("div", "welcome-title", title), el("div", "welcome-sub", sub));
  welcomeToast.replaceChildren(img, words);
  welcomeToast.hidden = false;
  welcomeToast.classList.remove("leaving");
  // Restart the entrance animation.
  void welcomeToast.offsetWidth;
  welcomeToast.classList.add("show");
  clearTimeout(welcomeTimer);
  welcomeTimer = setTimeout(hideWelcome, 3600);
}

function hideWelcome() {
  clearTimeout(welcomeTimer);
  welcomeToast.classList.add("leaving");
  welcomeTimer = setTimeout(() => {
    welcomeToast.hidden = true;
    welcomeToast.classList.remove("show", "leaving");
  }, 400);
}

welcomeToast.addEventListener("click", hideWelcome);

// Guests see the plan but none of the ways to change it.
function applyUser() {
  document.body.classList.toggle("guest", isGuest());
  renderUserPicks();
  const title = document.getElementById("welcome-title");
  if (title) title.textContent = isGuest() ? "Welcome!" : `Welcome, ${currentUser()}!`;
  if (typeof plan !== "undefined" && plan && !screens.route.hidden) {
    closePanels();
    closeMenu();
    renderRoute();
  }
}

// A short reply for something a guest tried to change.
function guestBlocked() {
  if (!isGuest()) return false;
  showNote("Field crews can look, print and leave notes on a location's sheet. Pick your name at the top to change the plan.");
  return true;
}

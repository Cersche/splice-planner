// Plan files (.ffhspl, JSON inside), so a plan can be backed up, sent
// to someone else or handed to a crew. Sharing is by file only: "Share
// plan" saves a file named with the job, who saved it and the date, and
// the file remembers who made the plan and who last changed it. Old
// .json plan files still open.

const PLAN_FILE_VERSION = 3;
const PLAN_EXT = ".ffhspl";

function planFileName() {
  const date = new Date().toISOString().slice(0, 10);
  const job = (plan.title || plan.points[0].name).replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "");
  const who = currentUser().replace(/[^\w-]+/g, "-");
  return `${job}_${who}_${date}${PLAN_EXT}`;
}

function planFileText() {
  return JSON.stringify({ app: "splice-planner", version: PLAN_FILE_VERSION, savedBy: currentUser(), savedAt: new Date().toISOString(), plan }, null, 2);
}

function downloadFile(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// On a phone this opens the share sheet (Messages, Mail, Files ...);
// elsewhere, or if that isn't allowed, the file downloads.
document.getElementById("share-plan").addEventListener("click", async () => {
  if (guestBlocked()) return;
  savePlan();
  const name = planFileName();
  const blob = new Blob([planFileText()], { type: "application/json" });
  const touch = matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare) {
    try {
      const file = new File([blob], name, { type: "application/json" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: plan.title || "Splice plan" });
        return showNote(`Shared ${name}.`);
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }
  downloadFile(name, blob);
  showNote(`Saved ${name}. Send that file to share the plan.`);
});

// --- Opening ---

const openInput = document.getElementById("open-plan-file");
// iPhones grey out file types they don't know (like .ffhspl) when the
// picker is limited to them, so there it accepts anything and the file
// is checked once it's read.
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
if (isIOS) openInput.removeAttribute("accept");

document.querySelectorAll("[data-open-plan]").forEach((b) =>
  b.addEventListener("click", () => {
    openInput.value = "";
    openInput.click();
  }));

openInput.addEventListener("change", () => {
  const file = openInput.files[0];
  if (file) openPlanFile(file);
});

function openPlanFile(file) {
  const reader = new FileReader();
  reader.onload = () => loadPlanText(String(reader.result), file.name);
  reader.readAsText(file);
}

function loadPlanText(text, fileName) {
  const notPlan = `${fileName} isn't a splice plan. Pick a ${PLAN_EXT} (or older .json) file saved from this app.`;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return showNote(notPlan);
  }
  const loaded = data && (data.plan || data);
  if (!loaded || !Array.isArray(loaded.points) || !loaded.points.length || !Array.isArray(loaded.cables)) return showNote(notPlan);
  const before = plan && JSON.stringify(plan);
  plan = migratePlan(loaded);
  resetEditBaseline();
  savePlan();
  closeMenu();
  closePanels();
  selectedId = null;
  show("route");
  // "From Dave, Oct 20"
  const who = data.savedBy && data.savedBy !== GUEST ? data.savedBy : plan.editedBy || plan.createdBy;
  const when = data.savedAt || plan.editedAt;
  const from = who ? `From ${who}${when ? `, ${shortDate(when)}` : ""}. ` : "";
  plan.receivedFrom = who ? { by: who, at: when || null } : undefined;
  if (before) offerUndo(`${from}Opened ${fileName}. The plan that was on screen is replaced.`, before);
  else showNote(`${from}Opened ${fileName}.`);
  renderHeader();
}

// Installed on a computer (Chrome or Edge), the app can be the program
// that opens .ffhspl files: a double-click lands here.
if ("launchQueue" in window) {
  window.launchQueue.setConsumer(async (params) => {
    for (const handle of params.files || []) {
      const file = await handle.getFile();
      return openPlanFile(file);
    }
  });
}

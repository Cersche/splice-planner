// Save and open plan files, so a plan can be backed up, emailed or
// handed to a crew instead of living only in one browser.

const PLAN_FILE_VERSION = 2;

document.getElementById("save-plan").addEventListener("click", () => {
  const data = JSON.stringify({ app: "splice-planner", version: PLAN_FILE_VERSION, plan }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  a.download = `${(plan.title || plan.points[0].name).replace(/[^\w-]+/g, "-")}-splice-plan-${date}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

const openInput = document.getElementById("open-plan-file");
document.querySelectorAll("[data-open-plan]").forEach((b) =>
  b.addEventListener("click", () => {
    openInput.value = "";
    openInput.click();
  }));

openInput.addEventListener("change", () => {
  const file = openInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let loaded;
    try {
      const data = JSON.parse(String(reader.result));
      loaded = data.plan || data;
    } catch {
      return showNote("That file isn't a splice plan. Pick a .json file saved from this app.");
    }
    if (!Array.isArray(loaded.points) || !loaded.points.length || !Array.isArray(loaded.cables)) {
      return showNote("That file isn't a splice plan. Pick a .json file saved from this app.");
    }
    const before = plan && JSON.stringify(plan);
    plan = migratePlan(loaded);
    savePlan();
    closeMenu();
    closePanels();
    selectedId = null;
    show("route");
    if (before) offerUndo(`Opened ${file.name}. The plan that was on screen is replaced.`, before);
  };
  reader.readAsText(file);
});

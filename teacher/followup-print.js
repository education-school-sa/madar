const followupKinds = [
  ["attendance", "سجل الحضور"],
  ["assignments", "سجل الواجبات"],
  ["participation", "سجل المشاركة"],
  ["tasks", "سجل المهام"],
];

function addFollowupPrintControls() {
  if (location.hash !== "#reports") return;
  const card = document.querySelector("#content .card");
  if (!card || card.querySelector(".followup-print-section")) return;
  const section = document.createElement("section");
  section.className = "followup-print-section";
  section.innerHTML = `<h3 class="section-title" style="margin-top:26px">ملفات المتابعة</h3><p style="font-size:.82rem;color:var(--muted)">تستخدم بيانات المدرسة المحفوظة وتفتح معاينة A4 قبل الطباعة.</p><div class="followup-print-grid">${followupKinds.map(([kind, label]) => `<button class="btn btn-outline" data-followup-kind="${kind}" data-followup-title="${label}">${label}</button>`).join("")}</div>`;
  card.appendChild(section);
  section.querySelectorAll("[data-followup-kind]").forEach((button) => {
    button.onclick = () => {
      const classId = document.getElementById("repClass")?.value || "";
      if (typeof printSettingsModal === "function") {
        printSettingsModal(`/api/teacher/reports/followup/${button.dataset.followupKind}/print?classId=${encodeURIComponent(classId)}`, button.dataset.followupTitle);
      } else {
        window.open(`/api/teacher/reports/followup/${button.dataset.followupKind}/print?classId=${encodeURIComponent(classId)}`, "_blank");
      }
    };
  });
}

const followupObserver = new MutationObserver(addFollowupPrintControls);
followupObserver.observe(document.body, { childList: true, subtree: true });
window.addEventListener("hashchange", addFollowupPrintControls);
addFollowupPrintControls();

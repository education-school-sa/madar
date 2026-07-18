const followupKinds = [
  ["attendance", "سجل الحضور"],
  ["assignments", "سجل الواجبات"],
  ["participation", "سجل المشاركة"],
  ["tasks", "سجل المهام"],
];

async function followupSettings() {
  const response = await fetch("/api/teacher/preferences/reports");
  return response.json();
}

async function openFollowupPrint(kind, title) {
  const settings = await followupSettings();
  const root = document.getElementById("modalRoot");
  if (!settings.complete) {
    root.innerHTML = `<div class="modal-overlay"><div class="modal-box"><h3>بيانات المدرسة غير مكتملة</h3><div class="form-error">يرجى استكمال بيانات المدرسة لإعداد ملف رسمي</div><div class="modal-actions"><button class="btn btn-outline" id="cancelFollowupWarning">إلغاء</button><button class="btn btn-primary" id="followupGoSettings">الانتقال إلى الإعدادات</button></div></div></div>`;
    document.getElementById("cancelFollowupWarning").onclick = () => { root.innerHTML = ""; };
    document.getElementById("followupGoSettings").onclick = () => { root.innerHTML = ""; location.hash = "settings"; };
    return;
  }
  root.innerHTML = `<div class="modal-overlay"><div class="modal-box"><h3>إعدادات الطباعة</h3><p class="school-summary"><b>${settings.schoolName}</b><br>${settings.educationDepartment} · ${settings.teacherName}</p><div class="check-grid"><label><input type="checkbox" id="followupShowSchool" checked> إظهار بيانات المدرسة</label><label><input type="checkbox" id="followupShowMadar" checked> إظهار شعار مدار</label></div><p style="font-size:.8rem;color:var(--muted)">تُستخدم البيانات المحفوظة تلقائيًا ولا يمكن تعديلها من نافذة الطباعة.</p><div class="modal-actions"><button class="btn btn-outline" id="cancelFollowupPrint">إلغاء</button><button class="btn btn-primary" id="previewFollowupPrint">معاينة السجل</button></div></div></div>`;
  document.getElementById("cancelFollowupPrint").onclick = () => { root.innerHTML = ""; };
  document.getElementById("previewFollowupPrint").onclick = () => {
    const classId = document.getElementById("repClass")?.value || "";
    const params = new URLSearchParams({ classId, title, showSchool: document.getElementById("followupShowSchool").checked ? "1" : "0", showMadar: document.getElementById("followupShowMadar").checked ? "1" : "0" });
    window.open(`/api/teacher/reports/followup/${kind}/print?${params}`, "_blank");
    root.innerHTML = "";
  };
}

function addFollowupPrintControls() {
  if (location.hash !== "#reports") return;
  const card = document.querySelector("#content .card");
  if (!card || card.querySelector(".followup-print-section")) return;
  const section = document.createElement("section");
  section.className = "followup-print-section";
  section.innerHTML = `<h3 class="section-title" style="margin-top:26px">ملفات المتابعة</h3><p style="font-size:.82rem;color:var(--muted)">تستخدم بيانات المدرسة المحفوظة وتفتح معاينة A4 قبل الطباعة.</p><div class="followup-print-grid">${followupKinds.map(([kind, label]) => `<button class="btn btn-outline" data-followup-kind="${kind}" data-followup-title="${label}">${label}</button>`).join("")}</div>`;
  card.appendChild(section);
  section.querySelectorAll("[data-followup-kind]").forEach((button) => {
    button.onclick = () => openFollowupPrint(button.dataset.followupKind, button.dataset.followupTitle);
  });
}

const followupObserver = new MutationObserver(addFollowupPrintControls);
followupObserver.observe(document.body, { childList: true, subtree: true });
window.addEventListener("hashchange", addFollowupPrintControls);
addFollowupPrintControls();

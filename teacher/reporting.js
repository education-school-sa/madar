const reportApi = async (path, options = {}) => {
  const response = await fetch(`/api/teacher${path}`, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "حدث خطأ غير متوقع.");
  return data;
};

const htmlEscape = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let schoolSettings = null;
let importedRows = [];
let importedType = "quiz";

async function loadSchoolSettings(force = false) {
  if (!schoolSettings || force) schoolSettings = await reportApi("/preferences/reports");
  return schoolSettings;
}

function schoolFields(settings) {
  return `<div class="form-grid">
    <div class="field">اسم المدرسة<input id="schoolName" value="${htmlEscape(settings.schoolName)}"></div>
    <div class="field">إدارة التعليم<input id="educationDepartment" value="${htmlEscape(settings.educationDepartment)}"></div>
    <div class="field">مكتب التعليم (اختياري)<input id="educationOffice" value="${htmlEscape(settings.educationOffice)}"></div>
    <div class="field">اسم المعلمة<input id="schoolTeacherName" value="${htmlEscape(settings.teacherName)}"></div>
    <div class="field">اسم مديرة المدرسة (اختياري)<input id="principalName" value="${htmlEscape(settings.principalName)}"></div>
    <div class="field">العام الدراسي<input id="academicYear" value="${htmlEscape(settings.academicYear)}" placeholder="1448هـ"></div>
    <div class="field">الفصل الدراسي<select id="semester"><option value="الأول" ${settings.semester === "الأول" ? "selected" : ""}>الفصل الدراسي الأول</option><option value="الثاني" ${settings.semester === "الثاني" ? "selected" : ""}>الفصل الدراسي الثاني</option></select></div>
    <div class="field">نوع الشعار<select id="logoType"><option value="ksa" ${settings.logoType === "ksa" ? "selected" : ""}>شعار المملكة</option><option value="ministry" ${settings.logoType === "ministry" ? "selected" : ""}>شعار وزارة التعليم</option><option value="custom" ${settings.logoType === "custom" ? "selected" : ""}>شعار مرفوع</option></select></div>
  </div>
  <div class="field" style="margin-top:12px">رفع شعار المملكة أو وزارة التعليم المعتمد<input type="file" id="schoolLogoFile" accept="image/png,image/jpeg,image/svg+xml"></div>
  ${settings.logoData ? `<div class="logo-preview"><img src="${settings.logoData}" alt="الشعار المرفوع"><button class="btn btn-outline btn-sm" id="removeSchoolLogo">حذف الشعار المرفوع</button></div>` : ""}`;
}

function readSchoolFields() {
  return {
    schoolName: document.getElementById("schoolName")?.value.trim() || "",
    educationDepartment: document.getElementById("educationDepartment")?.value.trim() || "",
    educationOffice: document.getElementById("educationOffice")?.value.trim() || "",
    teacherName: document.getElementById("schoolTeacherName")?.value.trim() || "",
    principalName: document.getElementById("principalName")?.value.trim() || "",
    academicYear: document.getElementById("academicYear")?.value.trim() || "",
    semester: document.getElementById("semester")?.value || "الأول",
    logoType: document.getElementById("logoType")?.value || "ksa",
    logoData: schoolSettings?.logoData || "",
  };
}

async function renderSchoolSettings() {
  const content = document.getElementById("content");
  if (location.hash !== "#settings" || !content) return;
  const settings = await loadSchoolSettings();
  content.innerHTML = `<div class="card" style="max-width:820px"><h3 class="section-title">بيانات المدرسة</h3><p style="font-size:.85rem;color:var(--muted)">تُحفظ مرة واحدة وتظهر تلقائيًا في جميع ملفات الاختبارات والمتابعة.</p><div id="schoolSettingsMessage"></div>${schoolFields(settings)}<button class="btn btn-primary" id="saveSchoolSettings" style="margin-top:16px">حفظ بيانات المدرسة</button></div>`;

  document.getElementById("schoolLogoFile").onchange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1000000) return showSchoolMessage("حجم الشعار يجب ألا يتجاوز 1 ميجابايت.", false);
    const reader = new FileReader();
    reader.onload = () => { schoolSettings.logoData = String(reader.result || ""); document.getElementById("logoType").value = "custom"; };
    reader.readAsDataURL(file);
  };
  document.getElementById("removeSchoolLogo")?.addEventListener("click", () => { schoolSettings.logoData = ""; renderSchoolSettings(); });
  document.getElementById("saveSchoolSettings").onclick = async () => {
    try {
      schoolSettings = await reportApi("/preferences/reports", { method: "PUT", body: JSON.stringify(readSchoolFields()) });
      showSchoolMessage("تم حفظ بيانات المدرسة بنجاح.", true);
      sessionStorage.setItem("madarReturnToPrint", "1");
    } catch (error) { showSchoolMessage(error.message, false); }
  };
}

function showSchoolMessage(message, ok) {
  const box = document.getElementById("schoolSettingsMessage");
  if (box) box.innerHTML = `<div class="${ok ? "form-success" : "form-error"}" style="margin-bottom:14px">${htmlEscape(message)}</div>`;
}

async function ensureSchoolSettings(next) {
  const settings = await loadSchoolSettings(true);
  if (settings.complete) return next(settings);
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-overlay"><div class="modal-box"><h3>بيانات المدرسة غير مكتملة</h3><div class="form-error">يرجى استكمال بيانات المدرسة لإعداد ملف رسمي</div><div class="modal-actions"><button class="btn btn-outline" id="cancelSchoolWarning">إلغاء</button><button class="btn btn-primary" id="goSchoolSettings">الانتقال إلى الإعدادات</button></div></div></div>`;
  document.getElementById("cancelSchoolWarning").onclick = () => { root.innerHTML = ""; };
  document.getElementById("goSchoolSettings").onclick = () => { root.innerHTML = ""; location.hash = "settings"; };
}

function printSettingsModal(url, title, options = {}) {
  ensureSchoolSettings(() => {
    const root = document.getElementById("modalRoot");
    root.innerHTML = `<div class="modal-overlay" id="printSettingsOverlay"><div class="modal-box"><h3>إعدادات الطباعة</h3><p class="school-summary"><b>${htmlEscape(schoolSettings.schoolName)}</b><br>${htmlEscape(schoolSettings.educationDepartment)} · ${htmlEscape(schoolSettings.teacherName)}</p>
      <div class="check-grid">
        <label><input type="checkbox" id="showSchool" checked> إظهار بيانات المدرسة</label>
        <label><input type="checkbox" id="showMadar" checked> إظهار شعار مدار</label>
        <label><input type="checkbox" id="showScore" checked> إظهار الدرجة</label>
        <label><input type="checkbox" id="showDuration" checked> إظهار الزمن</label>
        <label><input type="checkbox" id="showDate" checked> إظهار التاريخ</label>
        <label><input type="checkbox" id="shuffleQuestions"> خلط الأسئلة</label>
      </div>
      <div class="form-grid"><div class="field">النموذج<select id="printModel"><option value="أ">نموذج أ</option><option value="ب">نموذج ب</option></select></div>${options.modeSelect || ""}</div>
      <p style="font-size:.8rem;color:var(--muted)">تُستخدم بيانات المدرسة المحفوظة تلقائيًا. لا يتم تعديلها من هذه النافذة.</p>
      <div class="modal-actions"><button class="btn btn-outline" id="cancelPrintSettings">إلغاء</button><button class="btn btn-primary" id="previewPrint">معاينة الورقة</button></div></div></div>`;
    document.getElementById("cancelPrintSettings").onclick = () => { root.innerHTML = ""; };
    document.getElementById("previewPrint").onclick = () => {
      const params = new URLSearchParams({
        title,
        showSchool: document.getElementById("showSchool").checked ? "1" : "0",
        showMadar: document.getElementById("showMadar").checked ? "1" : "0",
        showScore: document.getElementById("showScore").checked ? "1" : "0",
        showDuration: document.getElementById("showDuration").checked ? "1" : "0",
        showDate: document.getElementById("showDate").checked ? "1" : "0",
        shuffle: document.getElementById("shuffleQuestions").checked ? "1" : "0",
        model: document.getElementById("printModel").value,
      });
      const mode = document.getElementById("printMode")?.value;
      if (mode) params.set("mode", mode);
      window.open(`${url}${url.includes("?") ? "&" : "?"}${params}`, "_blank");
      root.innerHTML = "";
    };
  });
}

function currentTestType() {
  if (location.hash === "#tests-pre") return "pre_diagnostic";
  if (location.hash === "#tests-post") return "post_diagnostic";
  return "quiz";
}

function addTestToolbar() {
  const toolbar = document.querySelector("#testsWrap")?.previousElementSibling || document.querySelector(".card .toolbar");
  if (!toolbar || !location.hash.startsWith("#tests-") || toolbar.querySelector(".excel-import-btn")) return;
  const importButton = document.createElement("button"); importButton.className = "btn btn-secondary btn-sm excel-import-btn"; importButton.textContent = "استيراد من Excel";
  const exportButton = document.createElement("button"); exportButton.className = "btn btn-outline btn-sm"; exportButton.textContent = "تصدير إلى Excel";
  const printButton = document.createElement("button"); printButton.className = "btn btn-outline btn-sm"; printButton.textContent = "طباعة PDF";
  toolbar.append(importButton, exportButton, printButton);
  importButton.onclick = openExcelImport;
  exportButton.onclick = () => chooseTestAndAction("تصدير إلى Excel", "export");
  printButton.onclick = () => chooseTestAndAction("طباعة PDF", "print");
}

async function chooseTestAndAction(title, action) {
  const tests = await reportApi(`/tests?type=${currentTestType()}`);
  if (!tests.length) return alert("لا توجد اختبارات في هذا القسم.");
  const root = document.getElementById("modalRoot");
  const actionOptions = action === "export"
    ? `<select id="testActionType"><option value="questions">الأسئلة</option><option value="results">النتائج</option><option value="analysis">تحليل الاختبار</option></select>`
    : `<select id="testActionType"><option value="paper">ورقة الاختبار دون الإجابات</option><option value="answers">نموذج الإجابة</option><option value="results">نتائج الطالبات</option><option value="analysis">تحليل الاختبار</option></select>`;
  root.innerHTML = `<div class="modal-overlay"><div class="modal-box"><h3>${title}</h3><div class="form-grid"><div class="field">الاختبار<select id="selectedTest">${tests.map((t) => `<option value="${t.id}" data-title="${htmlEscape(t.title)}">${htmlEscape(t.title)}</option>`).join("")}</select></div><div class="field">نوع الملف${actionOptions}</div></div><div class="modal-actions"><button class="btn btn-outline" id="cancelTestAction">إلغاء</button><button class="btn btn-primary" id="runTestAction">متابعة</button></div></div></div>`;
  document.getElementById("cancelTestAction").onclick = () => { root.innerHTML = ""; };
  document.getElementById("runTestAction").onclick = () => {
    const testSelect = document.getElementById("selectedTest");
    const id = testSelect.value;
    const testTitle = testSelect.selectedOptions[0].dataset.title;
    const kind = document.getElementById("testActionType").value;
    root.innerHTML = "";
    if (action === "export") return window.open(`/api/teacher/test-files/${id}/${kind}.xlsx`, "_blank");
    if (kind === "paper") return printSettingsModal(`/api/teacher/reports/test/${id}/print`, testTitle);
    if (kind === "answers") return printSettingsModal(`/api/teacher/reports/test/${id}/print`, `${testTitle} — نموذج الإجابة`, { modeSelect: `<input type="hidden" id="printMode" value="answers">` });
    if (kind === "results") return printSettingsModal(`/api/teacher/reports/test/${id}/results/print`, `${testTitle} — نتائج الطالبات`);
    printSettingsModal(`/api/teacher/reports/test/${id}/analysis/print`, `${testTitle} — تحليل الاختبار`);
  };
}

function openExcelImport() {
  importedRows = [];
  importedType = currentTestType();
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-overlay"><div class="modal-box modal-wide"><h3>استيراد أسئلة الاختبار من Excel</h3><p><a href="/api/teacher/test-files/template.xlsx" target="_blank">تحميل نموذج Excel الجاهز</a></p><div class="form-grid"><div class="field">عنوان الاختبار<input id="importTestTitle"></div><div class="field">مدة الاختبار بالدقائق<input type="number" id="importDuration" value="20"></div><div class="field">ملف Excel<input type="file" id="importExcelFile" accept=".xlsx"></div></div><div id="excelPreview"></div><div class="modal-actions"><button class="btn btn-outline" id="cancelExcelImport">إلغاء</button><button class="btn btn-secondary" id="previewExcel">معاينة الأسئلة</button><button class="btn btn-primary" id="adoptExcel" disabled>اعتماد الأسئلة السليمة</button></div></div></div>`;
  document.getElementById("cancelExcelImport").onclick = () => { root.innerHTML = ""; };
  document.getElementById("previewExcel").onclick = previewExcelFile;
  document.getElementById("adoptExcel").onclick = adoptExcelRows;
}

async function previewExcelFile() {
  const file = document.getElementById("importExcelFile").files?.[0];
  if (!file) return alert("اختاري ملف Excel أولًا.");
  const formData = new FormData(); formData.append("file", file);
  const response = await fetch("/api/teacher/test-files/preview", { method: "POST", body: formData });
  const data = await response.json();
  if (!response.ok) return alert(data.error || "تعذّرت المعاينة.");
  importedRows = data.rows;
  document.getElementById("excelPreview").innerHTML = `<div class="import-summary"><span>سليمة: ${data.validCount}</span><span>تحتاج مراجعة: ${data.invalidCount}</span><span>مكررة: ${data.duplicateCount}</span></div><div class="table-scroll"><table><thead><tr><th>السطر</th><th>السؤال</th><th>النوع</th><th>الدرجة</th><th>المهارة</th><th>الوحدة</th><th>الدرس</th><th>التنبيهات</th></tr></thead><tbody>${data.rows.map((row) => `<tr class="${row.issues.length ? "invalid-row" : ""}"><td>${row.rowNumber}</td><td>${htmlEscape(row.questionText)}</td><td>${htmlEscape(row.type)}</td><td>${row.points}</td><td>${htmlEscape(row.skill)}</td><td>${htmlEscape(row.unit)}</td><td>${htmlEscape(row.lesson)}</td><td>${row.issues.map(htmlEscape).join("، ") || "سليم"}</td></tr>`).join("")}</tbody></table></div>`;
  document.getElementById("adoptExcel").disabled = !data.validCount;
}

async function adoptExcelRows() {
  const title = document.getElementById("importTestTitle").value.trim();
  if (!title) return alert("اكتبي عنوان الاختبار.");
  try {
    const result = await reportApi("/test-files/adopt", { method: "POST", body: JSON.stringify({ title, type: importedType, durationMinutes: Number(document.getElementById("importDuration").value) || 20, rows: importedRows }) });
    document.getElementById("modalRoot").innerHTML = "";
    alert(`تم استيراد ${result.imported} سؤالًا وحفظ الاختبار كمسودة.`);
    location.reload();
  } catch (error) { alert(error.message); }
}

function enhanceStudentAndClassPrint() {
  document.querySelectorAll('a[href*="/reports/student/"][href$=".pdf"]').forEach((link) => {
    if (link.dataset.reportReady) return;
    link.dataset.reportReady = "1"; link.textContent = "معاينة وطباعة PDF";
    link.onclick = (event) => { event.preventDefault(); printSettingsModal(link.getAttribute("href").replace(".pdf", "/print"), "سجل متابعة الطالبة"); };
  });
  document.querySelectorAll("#repClassLink").forEach((link) => {
    if (link.dataset.reportReady) return;
    link.dataset.reportReady = "1"; link.textContent = "معاينة وطباعة تقرير الفصل"; link.removeAttribute("target");
    link.onclick = (event) => { event.preventDefault(); const classId = document.getElementById("repClass")?.value || ""; printSettingsModal(`/api/teacher/reports/class/print?classId=${encodeURIComponent(classId)}`, "كشف متابعة الفصل"); };
  });
}

function enhance() {
  if (location.hash === "#settings") setTimeout(renderSchoolSettings, 80);
  addTestToolbar();
  enhanceStudentAndClassPrint();
}

const observer = new MutationObserver(enhance);
observer.observe(document.body, { subtree: true, childList: true });
window.addEventListener("hashchange", enhance);
enhance();

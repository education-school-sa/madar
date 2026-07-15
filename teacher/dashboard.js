// لوحة تحكم المعلمة - منطق العرض والتنقل بين الأقسام (SPA بسيطة بدون مكتبات خارجية)

const contentEl = document.getElementById("content");
const pageTitleEl = document.getElementById("pageTitle");
const modalRoot = document.getElementById("modalRoot");
const toastRoot = document.getElementById("toastRoot");

const ROUTE_TITLES = {
  home: "الرئيسية",
  profile: "معلوماتي",
  students: "أسماء الطالبات",
  "students-manage": "إدارة الطالبات",
  "tests-pre": "الاختبارات التشخيصية القبلية",
  "tests-post": "الاختبارات التشخيصية البعدية",
  "tests-quiz": "الاختبارات القصيرة",
  "analysis-student": "تحليل لكل طالبة",
  "analysis-class": "تحليل الفصل العام",
  "analysis-skill": "تحليل كل مهارة",
  reports: "التقارير",
  notifications: "الإشعارات",
  classes: "الفصول والمجموعات",
  activity: "سجل الأنشطة",
  settings: "الإعدادات",
};

let currentTeacher = null;
let allClasses = [];
let allSkills = [];

// ---------- Helpers ----------
async function api(path, options = {}) {
  const res = await fetch(`/api/teacher${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = "login.html";
    throw new Error("unauthorized");
  }
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || "حدث خطأ غير متوقع.");
  return data;
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  toastRoot.innerHTML = "";
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function openModal(html) {
  modalRoot.innerHTML = `<div class="modal-overlay" id="modalOverlay"><div class="modal-box">${html}</div></div>`;
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  });
}
function closeModal() {
  modalRoot.innerHTML = "";
}

function confirmAction(message, onConfirm) {
  openModal(`
    <div class="confirm-box">
      <div class="ic">⚠️</div>
      <p>${escapeHtml(message)}</p>
      <div class="modal-actions" style="justify-content:center">
        <button class="btn btn-outline" id="cancelConfirm">إلغاء</button>
        <button class="btn btn-danger" id="okConfirm">تأكيد</button>
      </div>
    </div>
  `);
  document.getElementById("cancelConfirm").onclick = closeModal;
  document.getElementById("okConfirm").onclick = async () => {
    closeModal();
    await onConfirm();
  };
}

function formatDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
}

function progressColorBadge(p) {
  if (p >= 70) return "badge-green";
  if (p >= 45) return "badge-orange";
  return "badge-red";
}

// ---------- Bootstrapping ----------
async function boot() {
  try {
    currentTeacher = await api("/me");
  } catch {
    return;
  }
  document.getElementById("teacherNameLabel").textContent = currentTeacher.name;
  document.getElementById("avatarCircle").textContent = currentTeacher.name.trim()[0] || "م";

  try {
    allClasses = await api("/students/classes");
  } catch {}
  try {
    allSkills = await api("/data/skills");
  } catch {}

  refreshNotifBell();

  document.querySelectorAll(".nav-item[data-route]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.route));
  });
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await api("/logout", { method: "POST" });
    window.location.href = "login.html";
  });
  document.getElementById("menuToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });
  document.getElementById("bellBtn").addEventListener("click", () => navigate("notifications"));

  window.addEventListener("hashchange", () => {
    const route = location.hash.replace("#", "");
    if (ROUTES[route]) navigate(route);
  });

  const initialRoute = location.hash.replace("#", "");
  navigate(ROUTES[initialRoute] ? initialRoute : "home");
}

async function refreshNotifBell() {
  try {
    const notifs = await api("/data/notifications");
    document.getElementById("bellDot").hidden = !notifs.some((n) => !n.is_read);
  } catch {}
}

function navigate(route) {
  document.querySelectorAll(".nav-item[data-route]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.route === route);
  });
  document.getElementById("sidebar").classList.remove("open");
  if (location.hash.replace("#", "") !== route) location.hash = route;
  pageTitleEl.textContent = ROUTE_TITLES[route] || "";
  contentEl.innerHTML = `<div class="empty-state">جارٍ التحميل...</div>`;
  const renderer = ROUTES[route];
  if (renderer) renderer();
}

// ==========================================================================
// الرئيسية
// ==========================================================================
async function renderHome() {
  const data = await api("/dashboard/summary");
  const maxClassAvg = Math.max(1, ...data.classLevels.map((c) => c.avg_progress));
  contentEl.innerHTML = `
    <div class="stat-grid">
      ${statCard("🎓", data.studentCount, "عدد الطالبات")}
      ${statCard("📋", data.publishedTests, "الاختبارات المنشورة")}
      ${statCard("✅", data.completedResults, "الاختبارات المكتملة")}
      ${statCard("📈", data.averageProgress + "%", "متوسط الفصل")}
      ${statCard("🆘", data.needSupportCount, "بحاجة إلى دعم")}
    </div>
    <div class="grid-2">
      <div class="card">
        <h3 class="section-title">مستوى الفصول</h3>
        ${data.classLevels
          .map(
            (c) => `
          <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:6px">
              <span>${escapeHtml(c.name)} (${c.student_count} طالبة)</span>
              <strong>${c.avg_progress}%</strong>
            </div>
            <div class="progress-bar"><span style="width:${(c.avg_progress / maxClassAvg) * 100}%"></span></div>
          </div>`
          )
          .join("") || `<div class="empty-state">لا توجد بيانات فصول بعد.</div>`}

        <h3 class="section-title" style="margin-top:22px">اختصارات سريعة</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="quickTest">+ اختبار جديد</button>
          <button class="btn btn-secondary btn-sm" id="quickStudent">+ طالبة جديدة</button>
          <button class="btn btn-outline btn-sm" id="quickNote">+ ملاحظة</button>
        </div>
      </div>
      <div class="card">
        <h3 class="section-title">آخر الأنشطة</h3>
        ${
          data.recentActivity.length
            ? `<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:12px">
              ${data.recentActivity
                .map(
                  (a) => `<li style="font-size:.85rem"><strong>${escapeHtml(a.action)}</strong><br><span style="color:var(--muted)">${escapeHtml(a.details || "")} · ${formatDate(a.created_at)}</span></li>`
                )
                .join("")}
            </ul>`
            : `<div class="empty-state">لا توجد أنشطة مسجّلة بعد.</div>`
        }
        <h3 class="section-title" style="margin-top:20px">تنبيهات</h3>
        ${
          data.notifications.length
            ? data.notifications
                .map((n) => `<div class="skill-pill"><span>${escapeHtml(n.title)}</span>${n.is_read ? "" : '<span class="badge badge-orange">جديد</span>'}</div>`)
                .join("")
            : `<div class="empty-state">لا توجد تنبيهات.</div>`
        }
      </div>
    </div>
  `;
  document.getElementById("quickTest").onclick = () => navigate("tests-quiz");
  document.getElementById("quickStudent").onclick = () => navigate("students-manage");
  document.getElementById("quickNote").onclick = () => navigate("students");
}

function statCard(icon, value, label) {
  return `<div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
}

// ==========================================================================
// معلوماتي
// ==========================================================================
async function renderProfile() {
  contentEl.innerHTML = `
    <div class="card" style="max-width:560px">
      <h3 class="section-title">البيانات الشخصية</h3>
      <div id="profileMsg"></div>
      <div class="form-grid" style="margin-bottom:16px">
        <div class="field">الاسم<input id="pName" value="${escapeHtml(currentTeacher.name)}" /></div>
        <div class="field">البريد الإلكتروني<input id="pEmail" value="${escapeHtml(currentTeacher.email)}" /></div>
      </div>
      <button class="btn btn-secondary btn-sm" id="saveProfileBtn">حفظ البيانات</button>

      <h3 class="section-title" style="margin-top:28px">تغيير كلمة المرور</h3>
      <div class="form-grid full">
        <div class="field">كلمة المرور الحالية<input type="password" id="pCurrent" /></div>
        <div class="field">كلمة المرور الجديدة<input type="password" id="pNew" /></div>
        <div class="field">تأكيد كلمة المرور الجديدة<input type="password" id="pConfirm" /></div>
      </div>
      <button class="btn btn-primary btn-sm" id="savePasswordBtn" style="margin-top:14px">تغيير كلمة المرور</button>
    </div>
  `;

  function showMsg(text, ok) {
    const box = document.getElementById("profileMsg");
    box.innerHTML = `<div class="${ok ? "form-success" : "form-error"}" style="margin-bottom:14px">${escapeHtml(text)}</div>`;
  }

  document.getElementById("saveProfileBtn").onclick = async () => {
    try {
      const updated = await api("/me", {
        method: "PUT",
        body: JSON.stringify({ name: document.getElementById("pName").value, email: document.getElementById("pEmail").value }),
      });
      currentTeacher = { ...currentTeacher, ...updated };
      document.getElementById("teacherNameLabel").textContent = currentTeacher.name;
      showMsg("تم حفظ البيانات بنجاح.", true);
    } catch (err) {
      showMsg(err.message, false);
    }
  };

  document.getElementById("savePasswordBtn").onclick = async () => {
    try {
      await api("/me", {
        method: "PUT",
        body: JSON.stringify({
          currentPassword: document.getElementById("pCurrent").value,
          newPassword: document.getElementById("pNew").value,
          confirmPassword: document.getElementById("pConfirm").value,
        }),
      });
      showMsg("تم تغيير كلمة المرور بنجاح.", true);
      ["pCurrent", "pNew", "pConfirm"].forEach((id) => (document.getElementById(id).value = ""));
    } catch (err) {
      showMsg(err.message, false);
    }
  };
}

// ==========================================================================
// أسماء الطالبات
// ==========================================================================
let studentsState = { search: "", classId: "", level: "", page: 1 };

async function renderStudentsList() {
  contentEl.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <input id="stSearch" placeholder="بحث بالاسم أو البريد..." value="${escapeHtml(studentsState.search)}" />
        <select id="stClass"><option value="">كل الفصول</option>${allClasses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>
        <select id="stLevel"><option value="">كل المستويات</option><option value="ابتدائي">ابتدائي</option><option value="متوسط">متوسط</option><option value="ثانوي">ثانوي</option></select>
        <div class="spacer"></div>
        <a class="btn btn-outline btn-sm" href="/api/teacher/reports/students.xlsx">تصدير Excel</a>
      </div>
      <div id="studentsTableWrap"></div>
    </div>
  `;
  document.getElementById("stSearch").addEventListener("input", (e) => { studentsState.search = e.target.value; studentsState.page = 1; loadStudentsTable(); });
  document.getElementById("stClass").addEventListener("change", (e) => { studentsState.classId = e.target.value; studentsState.page = 1; loadStudentsTable(); });
  document.getElementById("stLevel").addEventListener("change", (e) => { studentsState.level = e.target.value; studentsState.page = 1; loadStudentsTable(); });
  await loadStudentsTable();
}

async function loadStudentsTable() {
  const wrap = document.getElementById("studentsTableWrap");
  const qs = new URLSearchParams({
    search: studentsState.search,
    classId: studentsState.classId,
    level: studentsState.level,
    page: studentsState.page,
    pageSize: 8,
  });
  const data = await api(`/students?${qs}`);
  if (!data.items.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="ic">🔍</div>لا توجد نتائج مطابقة.</div>`;
    return;
  }
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  wrap.innerHTML = `
    <table>
      <thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الفصل</th><th>نسبة التقدم</th><th>آخر نشاط</th></tr></thead>
      <tbody>
        ${data.items
          .map(
            (s) => `<tr>
              <td><a href="#" class="student-link" data-id="${s.id}" style="color:var(--purple-700);font-weight:700">${escapeHtml(s.name)}</a></td>
              <td>${escapeHtml(s.email)}</td>
              <td>${escapeHtml(s.class_name || "—")}</td>
              <td><span class="badge ${progressColorBadge(s.progress_percent)}">${s.progress_percent}%</span></td>
              <td>${s.last_active ? formatDate(s.last_active) : "—"}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <div class="pagination">
      ${Array.from({ length: totalPages }, (_, i) => i + 1)
        .map((p) => `<button data-page="${p}" class="${p === studentsState.page ? "active" : ""}">${p}</button>`)
        .join("")}
    </div>
  `;
  wrap.querySelectorAll(".student-link").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      openStudentProfile(a.dataset.id);
    })
  );
  wrap.querySelectorAll(".pagination button").forEach((btn) =>
    btn.addEventListener("click", () => {
      studentsState.page = Number(btn.dataset.page);
      loadStudentsTable();
    })
  );
}

async function openStudentProfile(id) {
  const data = await api(`/students/${id}/profile`);
  const { student, results, skills, notes, attendance, assignments } = data;
  openModal(`
    <h3>ملف المتابعة: ${escapeHtml(student.name)}</h3>
    <p style="color:var(--muted);font-size:.85rem;margin-top:-8px">${escapeHtml(student.email)} · ${escapeHtml(student.class_name || "—")} · ${escapeHtml(student.level)}</p>

    <h4 style="margin:16px 0 8px;font-size:.9rem">نسبة التقدم العامة</h4>
    <div class="progress-bar" style="margin-bottom:6px"><span style="width:${student.progress_percent}%"></span></div>
    <p style="font-size:.8rem;color:var(--muted)">${student.progress_percent}%</p>

    <h4 style="margin:16px 0 8px;font-size:.9rem">الدرجات</h4>
    ${
      results.length
        ? results.map((r) => `<div class="skill-pill"><span>${escapeHtml(r.title)}</span><span>${r.status === "completed" ? `${r.score}/${r.total_points}` : "لم تُنجز"}</span></div>`).join("")
        : `<p style="font-size:.82rem;color:var(--muted)">لا توجد نتائج اختبارات بعد.</p>`
    }

    <h4 style="margin:16px 0 8px;font-size:.9rem">مستوى المهارات</h4>
    ${
      skills.length
        ? skills.map((s) => `<div class="skill-pill"><span>${escapeHtml(s.name)}</span><span class="badge ${progressColorBadge(s.mastery_percent)}">${s.mastery_percent}%</span></div>`).join("")
        : `<p style="font-size:.82rem;color:var(--muted)">لا توجد بيانات مهارات بعد.</p>`
    }

    <h4 style="margin:16px 0 8px;font-size:.9rem">الحضور (آخر 30 يوم)</h4>
    <p style="font-size:.82rem">حاضرة: ${attendance.filter((a) => a.status === "present").length} · غائبة: ${attendance.filter((a) => a.status === "absent").length} · متأخرة: ${attendance.filter((a) => a.status === "late").length}</p>

    <h4 style="margin:16px 0 8px;font-size:.9rem">الواجبات</h4>
    ${
      assignments.length
        ? assignments.map((a) => `<div class="skill-pill"><span>${escapeHtml(a.title)}</span><span class="badge ${a.status === "graded" ? "badge-green" : a.status === "submitted" ? "badge-orange" : "badge-gray"}">${a.status === "graded" ? "مصحّح" : a.status === "submitted" ? "مُسلّم" : "قيد الانتظار"}</span></div>`).join("")
        : `<p style="font-size:.82rem;color:var(--muted)">لا توجد واجبات مسجّلة.</p>`
    }

    <h4 style="margin:16px 0 8px;font-size:.9rem">الملاحظات</h4>
    <div id="notesList">
      ${
        notes.length
          ? notes.map((n) => `<div class="skill-pill" style="display:block"><div>${escapeHtml(n.content)}</div><div style="color:var(--muted);font-size:.75rem;margin-top:4px">${formatDate(n.created_at)}</div></div>`).join("")
          : `<p style="font-size:.82rem;color:var(--muted)">لا توجد ملاحظات بعد.</p>`
      }
    </div>
    <div class="field" style="margin-top:12px">
      <textarea id="newNoteText" placeholder="أضيفي ملاحظة جديدة..."></textarea>
    </div>
    <div class="modal-actions">
      <a class="btn btn-outline btn-sm" href="/api/teacher/reports/student/${student.id}.pdf" target="_blank">تصدير PDF</a>
      <button class="btn btn-outline" id="closeProfileModal">إغلاق</button>
      <button class="btn btn-primary" id="addNoteBtn">إضافة ملاحظة</button>
    </div>
  `);
  document.getElementById("closeProfileModal").onclick = closeModal;
  document.getElementById("addNoteBtn").onclick = async () => {
    const text = document.getElementById("newNoteText").value.trim();
    if (!text) return;
    try {
      await api(`/students/${id}/notes`, { method: "POST", body: JSON.stringify({ content: text }) });
      toast("تمت إضافة الملاحظة.");
      openStudentProfile(id);
    } catch (err) {
      toast(err.message);
    }
  };
}

// ==========================================================================
// إدارة الطالبات
// ==========================================================================
async function renderStudentsManage() {
  contentEl.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <button class="btn btn-primary btn-sm" id="addStudentBtn">+ إضافة طالبة</button>
        <label class="btn btn-secondary btn-sm" style="cursor:pointer">
          استيراد CSV<input type="file" id="csvInput" accept=".csv" hidden />
        </label>
        <span style="font-size:.78rem;color:var(--muted)">الأعمدة المطلوبة: name, email, level, class_name</span>
      </div>
      <div id="manageTableWrap"></div>
    </div>
  `;
  document.getElementById("addStudentBtn").onclick = () => openStudentForm();
  document.getElementById("csvInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/teacher/students/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`تم استيراد ${data.created} طالبة${data.errors?.length ? ` (${data.errors.length} أخطاء)` : ""}.`);
      loadManageTable();
    } catch (err) {
      toast(err.message || "تعذّر استيراد الملف.");
    }
    e.target.value = "";
  });
  await loadManageTable();
}

async function loadManageTable() {
  const wrap = document.getElementById("manageTableWrap");
  const data = await api("/students?pageSize=100");
  if (!data.items.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="ic">🎓</div>لا توجد طالبات مسجّلات حتى الآن. أضيفي أول طالبة.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الفصل</th><th>المستوى</th><th>التقدم</th><th>إجراءات</th></tr></thead>
      <tbody>
        ${data.items
          .map(
            (s) => `<tr>
              <td>${escapeHtml(s.name)}</td>
              <td>${escapeHtml(s.email)}</td>
              <td>${escapeHtml(s.class_name || "—")}</td>
              <td>${escapeHtml(s.level)}</td>
              <td>${s.progress_percent}%</td>
              <td>
                <button class="btn btn-outline btn-sm" data-edit="${s.id}">تعديل</button>
                <button class="btn btn-danger btn-sm" data-del="${s.id}" data-name="${escapeHtml(s.name)}">حذف</button>
              </td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const s = data.items.find((x) => x.id == btn.dataset.edit);
      openStudentForm(s);
    })
  );
  wrap.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", () => {
      confirmAction(`هل تأكيد حذف الطالبة "${btn.dataset.name}"؟ لا يمكن التراجع عن هذا الإجراء.`, async () => {
        await api(`/students/${btn.dataset.del}`, { method: "DELETE" });
        toast("تم حذف الطالبة.");
        loadManageTable();
      });
    })
  );
}

function openStudentForm(student) {
  openModal(`
    <h3>${student ? "تعديل بيانات الطالبة" : "إضافة طالبة جديدة"}</h3>
    <div id="studentFormMsg"></div>
    <div class="form-grid">
      <div class="field">الاسم<input id="sfName" value="${escapeHtml(student?.name || "")}" /></div>
      <div class="field">البريد الإلكتروني<input id="sfEmail" value="${escapeHtml(student?.email || "")}" /></div>
      <div class="field">المستوى
        <select id="sfLevel">
          ${["ابتدائي", "متوسط", "ثانوي"].map((l) => `<option value="${l}" ${student?.level === l ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </div>
      <div class="field">الفصل
        <select id="sfClass">
          <option value="">بدون فصل</option>
          ${allClasses.map((c) => `<option value="${c.id}" ${student?.class_id == c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" id="cancelStudentForm">إلغاء</button>
      <button class="btn btn-primary" id="saveStudentForm">حفظ</button>
    </div>
  `);
  document.getElementById("cancelStudentForm").onclick = closeModal;
  document.getElementById("saveStudentForm").onclick = async () => {
    const payload = {
      name: document.getElementById("sfName").value.trim(),
      email: document.getElementById("sfEmail").value.trim(),
      level: document.getElementById("sfLevel").value,
      classId: document.getElementById("sfClass").value || null,
    };
    try {
      if (student) {
        await api(`/students/${student.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/students", { method: "POST", body: JSON.stringify(payload) });
      }
      closeModal();
      toast("تم حفظ بيانات الطالبة.");
      loadManageTable();
    } catch (err) {
      document.getElementById("studentFormMsg").innerHTML = `<div class="form-error" style="margin-bottom:10px">${escapeHtml(err.message)}</div>`;
    }
  };
}

// ==========================================================================
// الاختبارات (قبلي / بعدي / قصيرة)
// ==========================================================================
const TEST_TYPE_LABELS = { pre_diagnostic: "تشخيصي قبلي", post_diagnostic: "تشخيصي بعدي", quiz: "اختبار قصير" };

function renderTestsSection(type) {
  return async () => {
    contentEl.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <button class="btn btn-primary btn-sm" id="newTestBtn">+ إنشاء اختبار</button>
        </div>
        <div id="testsWrap"></div>
      </div>
    `;
    document.getElementById("newTestBtn").onclick = () => openTestForm(type);
    await loadTestsList(type);
  };
}

async function loadTestsList(type) {
  const wrap = document.getElementById("testsWrap");
  const tests = await api(`/tests?type=${type}`);
  if (!tests.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="ic">📝</div>لا توجد اختبارات من هذا النوع بعد.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>العنوان</th><th>المهارة</th><th>الحالة</th><th>عدد الأسئلة</th><th>الإجابات</th><th>إجراءات</th></tr></thead>
      <tbody>
        ${tests
          .map(
            (t) => `<tr>
              <td>${escapeHtml(t.title)}</td>
              <td>${escapeHtml(t.skill_name || "—")}</td>
              <td><span class="badge ${t.status === "published" ? "badge-green" : "badge-gray"}">${t.status === "published" ? "منشور" : "مسودة"}</span></td>
              <td>${t.question_count}</td>
              <td>${t.completed_count}/${t.assigned_count}</td>
              <td style="white-space:nowrap">
                <button class="btn btn-outline btn-sm" data-edit="${t.id}">تعديل</button>
                <button class="btn btn-secondary btn-sm" data-dup="${t.id}">نسخ</button>
                <button class="btn ${t.status === "published" ? "btn-outline" : "btn-primary"} btn-sm" data-toggle="${t.id}" data-status="${t.status}">${t.status === "published" ? "إلغاء النشر" : "نشر"}</button>
                <button class="btn btn-outline btn-sm" data-results="${t.id}">النتائج</button>
                <button class="btn btn-danger btn-sm" data-del="${t.id}" data-title="${escapeHtml(t.title)}">حذف</button>
              </td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", async () => openTestForm(type, await api(`/tests/${b.dataset.edit}`))));
  wrap.querySelectorAll("[data-dup]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/tests/${b.dataset.dup}/duplicate`, { method: "POST" });
      toast("تم نسخ الاختبار كمسودة.");
      loadTestsList(type);
    })
  );
  wrap.querySelectorAll("[data-toggle]").forEach((b) =>
    b.addEventListener("click", async () => {
      const action = b.dataset.status === "published" ? "unpublish" : "publish";
      await api(`/tests/${b.dataset.toggle}/${action}`, { method: "POST" });
      toast(action === "publish" ? "تم نشر الاختبار." : "تم إلغاء نشر الاختبار.");
      loadTestsList(type);
    })
  );
  wrap.querySelectorAll("[data-results]").forEach((b) => b.addEventListener("click", () => openTestResults(b.dataset.results)));
  wrap.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () =>
      confirmAction(`هل تأكيد حذف الاختبار "${b.dataset.title}"؟`, async () => {
        await api(`/tests/${b.dataset.del}`, { method: "DELETE" });
        toast("تم حذف الاختبار.");
        loadTestsList(type);
      })
    )
  );
}

let questionDraft = [];

function openTestForm(type, test) {
  questionDraft = test?.questions?.map((q) => ({
    type: q.type,
    questionText: q.question_text,
    options: q.options || ["", "", "", ""],
    correctAnswer: q.correct_answer,
    points: q.points,
  })) || [];

  openModal(`
    <h3>${test ? "تعديل الاختبار" : "إنشاء اختبار — " + TEST_TYPE_LABELS[type]}</h3>
    <div id="testFormMsg"></div>
    <div class="form-grid">
      <div class="field">عنوان الاختبار<input id="tfTitle" value="${escapeHtml(test?.title || "")}" /></div>
      <div class="field">المهارة
        <select id="tfSkill"><option value="">بدون مهارة</option>${allSkills.map((s) => `<option value="${s.id}" ${test?.skill_id == s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}</select>
      </div>
      <div class="field">الفصل
        <select id="tfClass"><option value="">كل الفصول</option>${allClasses.map((c) => `<option value="${c.id}" ${test?.class_id == c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}</select>
      </div>
      <div class="field">مدة الاختبار (دقيقة)<input type="number" id="tfDuration" value="${test?.duration_minutes || 20}" /></div>
      <div class="field">تاريخ البداية<input type="datetime-local" id="tfStart" value="${test?.start_at ? test.start_at.slice(0, 16) : ""}" /></div>
      <div class="field">تاريخ النهاية<input type="datetime-local" id="tfEnd" value="${test?.end_at ? test.end_at.slice(0, 16) : ""}" /></div>
    </div>

    <h4 style="margin:18px 0 10px">الأسئلة</h4>
    <div id="questionsWrap"></div>
    <button class="btn btn-secondary btn-sm" id="addQuestionBtn">+ إضافة سؤال</button>

    <div class="modal-actions">
      <button class="btn btn-outline" id="cancelTestForm">إلغاء</button>
      <button class="btn btn-secondary" id="saveDraftBtn">حفظ كمسودة</button>
      <button class="btn btn-primary" id="savePublishBtn">${test?.status === "published" ? "حفظ" : "حفظ ونشر"}</button>
    </div>
  `);
  renderQuestionsEditor();

  document.getElementById("addQuestionBtn").onclick = () => {
    questionDraft.push({ type: "mcq", questionText: "", options: ["", "", "", ""], correctAnswer: "", points: 1 });
    renderQuestionsEditor();
  };
  document.getElementById("cancelTestForm").onclick = closeModal;
  document.getElementById("saveDraftBtn").onclick = () => submitTestForm(type, test, false);
  document.getElementById("savePublishBtn").onclick = () => submitTestForm(type, test, true);
}

function renderQuestionsEditor() {
  const wrap = document.getElementById("questionsWrap");
  if (!questionDraft.length) {
    wrap.innerHTML = `<p style="font-size:.82rem;color:var(--muted)">لا توجد أسئلة بعد. أضيفي سؤالًا واحدًا على الأقل قبل النشر.</p>`;
    return;
  }
  wrap.innerHTML = questionDraft
    .map(
      (q, idx) => `
    <div class="question-card">
      <div class="qhead">
        <strong>سؤال ${idx + 1}</strong>
        <button class="btn btn-danger btn-sm" data-remove-q="${idx}">حذف</button>
      </div>
      <div class="form-grid">
        <div class="field">نوع السؤال
          <select data-q="${idx}" data-field="type">
            <option value="mcq" ${q.type === "mcq" ? "selected" : ""}>اختيار من متعدد</option>
            <option value="true_false" ${q.type === "true_false" ? "selected" : ""}>صح أو خطأ</option>
            <option value="short_answer" ${q.type === "short_answer" ? "selected" : ""}>إجابة قصيرة</option>
          </select>
        </div>
        <div class="field">الدرجة<input type="number" min="1" data-q="${idx}" data-field="points" value="${q.points}" /></div>
      </div>
      <div class="field" style="margin-top:10px">نص السؤال<textarea data-q="${idx}" data-field="questionText">${escapeHtml(q.questionText)}</textarea></div>
      ${
        q.type === "mcq"
          ? `<div class="field" style="margin-top:10px">الخيارات (اكتبي الإجابة الصحيحة بالضبط في حقل "الإجابة الصحيحة" أدناه)</div>
             ${[0, 1, 2, 3]
               .map(
                 (i) => `<div class="option-row"><input type="text" placeholder="خيار ${i + 1}" data-q="${idx}" data-field="opt${i}" value="${escapeHtml(q.options?.[i] || "")}" /></div>`
               )
               .join("")}
             <div class="field">الإجابة الصحيحة (نفس نص أحد الخيارات)<input data-q="${idx}" data-field="correctAnswer" value="${escapeHtml(q.correctAnswer || "")}" /></div>`
          : q.type === "true_false"
          ? `<div class="field" style="margin-top:10px">الإجابة الصحيحة
              <select data-q="${idx}" data-field="correctAnswer">
                <option value="true" ${q.correctAnswer === "true" ? "selected" : ""}>صح</option>
                <option value="false" ${q.correctAnswer === "false" ? "selected" : ""}>خطأ</option>
              </select>
            </div>`
          : `<div class="field" style="margin-top:10px">الإجابة الصحيحة النموذجية<input data-q="${idx}" data-field="correctAnswer" value="${escapeHtml(q.correctAnswer || "")}" /></div>`
      }
    </div>
  `
    )
    .join("");

  wrap.querySelectorAll("[data-remove-q]").forEach((btn) =>
    btn.addEventListener("click", () => {
      questionDraft.splice(Number(btn.dataset.removeQ), 1);
      renderQuestionsEditor();
    })
  );
  wrap.querySelectorAll("[data-q]").forEach((input) => {
    input.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.q);
      const field = e.target.dataset.field;
      if (field.startsWith("opt")) {
        const optIdx = Number(field.replace("opt", ""));
        questionDraft[idx].options[optIdx] = e.target.value;
      } else if (field === "type") {
        questionDraft[idx].type = e.target.value;
        questionDraft[idx].options = questionDraft[idx].options || ["", "", "", ""];
        renderQuestionsEditor();
      } else {
        questionDraft[idx][field] = e.target.value;
      }
    });
  });
}

async function submitTestForm(type, existingTest, publish) {
  const title = document.getElementById("tfTitle").value.trim();
  if (!title) {
    document.getElementById("testFormMsg").innerHTML = `<div class="form-error" style="margin-bottom:10px">يرجى إدخال عنوان الاختبار.</div>`;
    return;
  }
  if (publish && !questionDraft.length) {
    document.getElementById("testFormMsg").innerHTML = `<div class="form-error" style="margin-bottom:10px">لا يمكن نشر اختبار بدون أسئلة.</div>`;
    return;
  }
  const payload = {
    title,
    type,
    skillId: document.getElementById("tfSkill").value || null,
    classId: document.getElementById("tfClass").value || null,
    durationMinutes: Number(document.getElementById("tfDuration").value) || 20,
    startAt: document.getElementById("tfStart").value || null,
    endAt: document.getElementById("tfEnd").value || null,
    questions: questionDraft.map((q) => ({
      type: q.type,
      questionText: q.questionText,
      options: q.type === "mcq" ? q.options.filter(Boolean) : null,
      correctAnswer: q.correctAnswer,
      points: Number(q.points) || 1,
    })),
  };
  try {
    let saved;
    if (existingTest) {
      saved = await api(`/tests/${existingTest.id}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      saved = await api("/tests", { method: "POST", body: JSON.stringify(payload) });
    }
    if (publish) await api(`/tests/${saved.id}/publish`, { method: "POST" });
    closeModal();
    toast(publish ? "تم حفظ ونشر الاختبار." : "تم حفظ الاختبار كمسودة.");
    loadTestsList(type);
  } catch (err) {
    document.getElementById("testFormMsg").innerHTML = `<div class="form-error" style="margin-bottom:10px">${escapeHtml(err.message)}</div>`;
  }
}

async function openTestResults(testId) {
  const results = await api(`/tests/${testId}/results`);
  openModal(`
    <h3>نتائج الاختبار</h3>
    ${
      results.length
        ? `<table><thead><tr><th>الطالبة</th><th>الحالة</th><th>الدرجة</th></tr></thead><tbody>
        ${results
          .map(
            (r) => `<tr><td>${escapeHtml(r.student_name)}</td><td><span class="badge ${r.status === "completed" ? "badge-green" : "badge-gray"}">${r.status === "completed" ? "مكتمل" : r.status === "in_progress" ? "قيد التنفيذ" : "لم يبدأ"}</span></td><td>${r.status === "completed" ? r.score : "—"}</td></tr>`
          )
          .join("")}
      </tbody></table>`
        : `<div class="empty-state">لم تبدأ أي طالبة هذا الاختبار بعد.</div>`
    }
    <div class="modal-actions"><button class="btn btn-outline" id="closeResultsModal">إغلاق</button></div>
  `);
  document.getElementById("closeResultsModal").onclick = closeModal;
}

// ==========================================================================
// تحليل النتائج
// ==========================================================================
async function renderAnalysisStudent() {
  const studentsData = await api("/students?pageSize=100");
  contentEl.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <select id="anStudent"><option value="">اختاري طالبة</option>${studentsData.items.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")}</select>
      </div>
      <div id="anStudentWrap"><div class="empty-state">اختاري طالبة لعرض تحليلها.</div></div>
    </div>
  `;
  document.getElementById("anStudent").addEventListener("change", async (e) => {
    if (!e.target.value) return;
    const data = await api(`/analysis/student/${e.target.value}`);
    const wrap = document.getElementById("anStudentWrap");
    wrap.innerHTML = `
      <h4 class="section-title">الدرجات والتطور</h4>
      ${
        data.results.length
          ? data.results.map((r) => `<div class="skill-pill"><span>${escapeHtml(r.title)}</span><span>${r.score}/${r.total_points} (${Math.round((r.score / r.total_points) * 100)}%)</span></div>`).join("")
          : `<p style="font-size:.82rem;color:var(--muted)">لا توجد نتائج مكتملة بعد.</p>`
      }
      <div class="grid-2" style="margin-top:18px">
        <div>
          <h4 class="section-title">مهارات متقنة</h4>
          ${data.mastered.length ? data.mastered.map((s) => `<div class="skill-pill"><span>${escapeHtml(s.name)}</span><span class="badge badge-green">${s.mastery_percent}%</span></div>`).join("") : `<p style="font-size:.82rem;color:var(--muted)">لا يوجد بعد.</p>`}
        </div>
        <div>
          <h4 class="section-title">تحتاج دعمًا</h4>
          ${data.needsSupport.length ? data.needsSupport.map((s) => `<div class="skill-pill"><span>${escapeHtml(s.name)}</span><span class="badge badge-red">${s.mastery_percent}%</span></div>`).join("") : `<p style="font-size:.82rem;color:var(--muted)">لا يوجد.</p>`}
        </div>
      </div>
    `;
  });
}

async function renderAnalysisClass() {
  contentEl.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <select id="anClass"><option value="">كل الفصول</option>${allClasses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>
      </div>
      <div id="anClassWrap"></div>
    </div>
  `;
  async function load() {
    const classId = document.getElementById("anClass").value;
    const data = await api(`/analysis/class?classId=${classId}`);
    document.getElementById("anClassWrap").innerHTML = `
      <div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">
        ${statCard("📊", data.average + "%", "متوسط الفصل")}
        ${statCard("⬆️", data.highest + "%", "أعلى درجة")}
        ${statCard("⬇️", data.lowest + "%", "أقل درجة")}
        ${statCard("✅", data.passRate + "%", "نسبة النجاح")}
      </div>
      <h4 class="section-title">توزيع الدرجات</h4>
      ${data.distribution
        .map(
          (d) => `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:4px"><span>${d.label}</span><strong>${d.count} طالبة</strong></div><div class="progress-bar"><span style="width:${data.studentCount ? (d.count / data.studentCount) * 100 : 0}%"></span></div></div>`
        )
        .join("")}
      <h4 class="section-title" style="margin-top:18px">مقارنة التشخيص القبلي والبعدي</h4>
      ${
        data.prePostComparison.length
          ? data.prePostComparison.map((c) => `<div class="skill-pill"><span>${c.type === "pre_diagnostic" ? "تشخيصي قبلي" : "تشخيصي بعدي"}</span><span>${Math.round(c.avg_percent ?? 0)}%</span></div>`).join("")
          : `<p style="font-size:.82rem;color:var(--muted)">لا توجد بيانات كافية للمقارنة.</p>`
      }
    `;
  }
  document.getElementById("anClass").addEventListener("change", load);
  await load();
}

async function renderAnalysisSkill() {
  const data = await api("/analysis/skills");
  contentEl.innerHTML = `
    <div class="card">
      ${data
        .map(
          (s) => `
        <div style="margin-bottom:20px;border-bottom:1px solid var(--border);padding-bottom:16px">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <strong>${escapeHtml(s.name)}</strong>
            <span class="badge ${progressColorBadge(s.averageMastery)}">متوسط الإتقان: ${s.averageMastery}%</span>
          </div>
          <p style="font-size:.82rem;color:var(--muted);margin:4px 0">متقنات: ${s.masteredCount} · بحاجة إلى تدخل علاجي: ${s.needsSupportCount}</p>
          ${
            s.needsSupportStudents.length
              ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${s.needsSupportStudents.map((st) => `<span class="badge badge-red">${escapeHtml(st.name)}</span>`).join("")}</div>`
              : ""
          }
        </div>`
        )
        .join("") || `<div class="empty-state">لا توجد مهارات مسجّلة بعد.</div>`}
    </div>
  `;
}

// ==========================================================================
// التقارير
// ==========================================================================
async function renderReports() {
  contentEl.innerHTML = `
    <div class="card">
      <h3 class="section-title">تصدير التقارير</h3>
      <div style="display:flex;flex-direction:column;gap:14px;max-width:420px">
        <a class="btn btn-secondary btn-block" href="/api/teacher/reports/students.xlsx">تصدير قائمة الطالبات (Excel)</a>
        <div class="field">
          تقرير فصل (PDF)
          <select id="repClass">${allClasses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>
        </div>
        <a class="btn btn-secondary btn-block" id="repClassLink" href="#" target="_blank">تنزيل تقرير الفصل</a>
      </div>
      <p style="font-size:.8rem;color:var(--muted);margin-top:16px">لتصدير تقرير طالبة محددة (PDF)، افتحي ملف متابعتها من قسم «أسماء الطالبات».</p>
    </div>
  `;
  function updateLink() {
    document.getElementById("repClassLink").href = `/api/teacher/reports/class.pdf?classId=${document.getElementById("repClass").value}`;
  }
  document.getElementById("repClass").addEventListener("change", updateLink);
  updateLink();
}

// ==========================================================================
// الإشعارات
// ==========================================================================
async function renderNotifications() {
  const notifs = await api("/data/notifications");
  contentEl.innerHTML = `
    <div class="card">
      ${
        notifs.length
          ? notifs
              .map(
                (n) => `<div class="skill-pill" style="display:flex;align-items:center">
            <div><strong>${escapeHtml(n.title)}</strong><br><span style="color:var(--muted);font-size:.8rem">${escapeHtml(n.message || "")} · ${formatDate(n.created_at)}</span></div>
            <div style="display:flex;gap:6px">
              ${n.is_read ? "" : `<button class="btn btn-outline btn-sm" data-read="${n.id}">تمييز كمقروء</button>`}
              <button class="btn btn-danger btn-sm" data-delnotif="${n.id}">حذف</button>
            </div>
          </div>`
              )
              .join("")
          : `<div class="empty-state"><div class="ic">🔔</div>لا توجد إشعارات حاليًا.</div>`
      }
    </div>
  `;
  contentEl.querySelectorAll("[data-read]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/data/notifications/${b.dataset.read}/read`, { method: "PUT" });
      renderNotifications();
      refreshNotifBell();
    })
  );
  contentEl.querySelectorAll("[data-delnotif]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/data/notifications/${b.dataset.delnotif}`, { method: "DELETE" });
      renderNotifications();
      refreshNotifBell();
    })
  );
}

// ==========================================================================
// الفصول والمجموعات
// ==========================================================================
async function renderClasses() {
  contentEl.innerHTML = `
    <div class="card">
      <div class="toolbar"><button class="btn btn-primary btn-sm" id="addClassBtn">+ إضافة فصل</button></div>
      <div id="classesWrap"></div>
    </div>
  `;
  document.getElementById("addClassBtn").onclick = () => openClassForm();
  await loadClassesTable();
}

async function loadClassesTable() {
  const classes = await api("/data/classes");
  allClasses = classes;
  const wrap = document.getElementById("classesWrap");
  wrap.innerHTML = classes.length
    ? `<table><thead><tr><th>اسم الفصل</th><th>المستوى</th><th>عدد الطالبات</th><th>إجراءات</th></tr></thead><tbody>
      ${classes
        .map(
          (c) => `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.level)}</td><td>${c.student_count}</td>
          <td><button class="btn btn-outline btn-sm" data-editc="${c.id}">تعديل</button> <button class="btn btn-danger btn-sm" data-delc="${c.id}" data-name="${escapeHtml(c.name)}">حذف</button></td></tr>`
        )
        .join("")}
    </tbody></table>`
    : `<div class="empty-state">لا توجد فصول بعد.</div>`;

  wrap.querySelectorAll("[data-editc]").forEach((b) =>
    b.addEventListener("click", () => openClassForm(classes.find((c) => c.id == b.dataset.editc)))
  );
  wrap.querySelectorAll("[data-delc]").forEach((b) =>
    b.addEventListener("click", () =>
      confirmAction(`هل تأكيد حذف الفصل "${b.dataset.name}"؟`, async () => {
        await api(`/data/classes/${b.dataset.delc}`, { method: "DELETE" });
        toast("تم حذف الفصل.");
        loadClassesTable();
      })
    )
  );
}

function openClassForm(cls) {
  openModal(`
    <h3>${cls ? "تعديل الفصل" : "إضافة فصل جديد"}</h3>
    <div class="form-grid full">
      <div class="field">اسم الفصل<input id="cfName" value="${escapeHtml(cls?.name || "")}" /></div>
      <div class="field">المستوى
        <select id="cfLevel">${["ابتدائي", "متوسط", "ثانوي"].map((l) => `<option value="${l}" ${cls?.level === l ? "selected" : ""}>${l}</option>`).join("")}</select>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" id="cancelClassForm">إلغاء</button>
      <button class="btn btn-primary" id="saveClassForm">حفظ</button>
    </div>
  `);
  document.getElementById("cancelClassForm").onclick = closeModal;
  document.getElementById("saveClassForm").onclick = async () => {
    const payload = { name: document.getElementById("cfName").value.trim(), level: document.getElementById("cfLevel").value };
    if (cls) await api(`/data/classes/${cls.id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/data/classes", { method: "POST", body: JSON.stringify(payload) });
    closeModal();
    toast("تم حفظ الفصل.");
    loadClassesTable();
  };
}

// ==========================================================================
// سجل الأنشطة
// ==========================================================================
async function renderActivity() {
  const logs = await api("/data/activity-log");
  contentEl.innerHTML = `
    <div class="card">
      ${
        logs.length
          ? `<table><thead><tr><th>الإجراء</th><th>التفاصيل</th><th>التاريخ</th></tr></thead><tbody>
            ${logs.map((l) => `<tr><td>${escapeHtml(l.action)}</td><td>${escapeHtml(l.details || "—")}</td><td>${formatDate(l.created_at)}</td></tr>`).join("")}
          </tbody></table>`
          : `<div class="empty-state">لا توجد أنشطة مسجّلة بعد.</div>`
      }
    </div>
  `;
}

// ==========================================================================
// الإعدادات
// ==========================================================================
async function renderSettings() {
  contentEl.innerHTML = `
    <div class="card" style="max-width:480px">
      <h3 class="section-title">إعدادات الحساب</h3>
      <p style="font-size:.85rem;color:var(--muted)">لتعديل اسمك أو بريدك أو كلمة مرورك، انتقلي إلى قسم «معلوماتي».</p>
      <button class="btn btn-outline" id="goProfileBtn" style="margin-top:10px">فتح معلوماتي</button>
    </div>
  `;
  document.getElementById("goProfileBtn").onclick = () => navigate("profile");
}

// ==========================================================================
const ROUTES = {
  home: renderHome,
  profile: renderProfile,
  students: renderStudentsList,
  "students-manage": renderStudentsManage,
  "tests-pre": renderTestsSection("pre_diagnostic"),
  "tests-post": renderTestsSection("post_diagnostic"),
  "tests-quiz": renderTestsSection("quiz"),
  "analysis-student": renderAnalysisStudent,
  "analysis-class": renderAnalysisClass,
  "analysis-skill": renderAnalysisSkill,
  reports: renderReports,
  notifications: renderNotifications,
  classes: renderClasses,
  activity: renderActivity,
  settings: renderSettings,
};

boot();

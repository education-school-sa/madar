// SPA logic for the owner ("مالكة الموقع") dashboard. Every write action here calls a
// /api/owner/* endpoint that is independently enforced server-side by requireOwnerAuth —
// this file only controls what is *shown*, never what is *allowed*.
const content = document.getElementById("content");
const pageTitle = document.getElementById("pageTitle");
const toastRoot = document.getElementById("toastRoot");
const modalRoot = document.getElementById("modalRoot");
const sidebar = document.getElementById("sidebar");

const TITLES = {
  home: "نظرة عامة",
  teachers: "حسابات المعلمات",
  students: "حسابات الطالبات",
  tests: "الاختبارات والنتائج",
  activity: "سجل الأنشطة",
  settings: "الإعدادات",
};

async function api(path, options = {}) {
  const res = await fetch(`/api/owner${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 401 || res.status === 403) {
    window.location.href = "/owner/login.html";
    throw new Error("unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "حدث خطأ");
  return data;
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function closeModal() {
  modalRoot.innerHTML = "";
}

function openModal(html) {
  modalRoot.innerHTML = `<div class="modal-overlay" id="modalOverlay"><div class="modal-box">${html}</div></div>`;
  modalRoot.querySelector("#modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  });
}

function confirmAction(message, onConfirm) {
  openModal(`
    <div class="confirm-box">
      <div class="ic">⚠️</div>
      <p>${message}</p>
      <div class="modal-actions" style="justify-content:center">
        <button class="btn btn-outline" id="cancelConfirm">إلغاء</button>
        <button class="btn btn-danger" id="okConfirm">تأكيد</button>
      </div>
    </div>
  `);
  modalRoot.querySelector("#cancelConfirm").addEventListener("click", closeModal);
  modalRoot.querySelector("#okConfirm").addEventListener("click", async () => {
    closeModal();
    await onConfirm();
  });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------- Routes ----------------
async function renderHome() {
  content.innerHTML = `<div class="stat-grid" id="statGrid"><div class="empty-state">جارٍ التحميل...</div></div>`;
  const s = await api("/summary");
  content.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-icon">👩‍🏫</div><div class="stat-value">${s.teachers}</div><div class="stat-label">حسابات المعلمات (${s.teachersDisabled} معطّلة)</div></div>
      <div class="stat-card"><div class="stat-icon">🎓</div><div class="stat-value">${s.students}</div><div class="stat-label">حسابات الطالبات (${s.studentsDisabled} معطّلة)</div></div>
      <div class="stat-card"><div class="stat-icon">📝</div><div class="stat-value">${s.tests}</div><div class="stat-label">إجمالي الاختبارات</div></div>
      <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-value">${s.results}</div><div class="stat-label">إجمالي نتائج الاختبارات</div></div>
    </div>
    <div class="card">
      <p class="section-title">مرحبًا بكِ في لوحة مالكة الموقع</p>
      <p style="color:var(--muted); font-size:.9rem">من هنا يمكنكِ إدارة حسابات المعلمات والطالبات، مراقبة الاختبارات والنتائج، متابعة سجل الأنشطة، وضبط إعدادات المنصة العامة.</p>
    </div>
  `;
}

async function renderTeachers() {
  content.innerHTML = `<div class="empty-state">جارٍ التحميل...</div>`;
  const teachers = await api("/teachers");
  content.innerHTML = `
    <div class="toolbar">
      <div class="spacer"></div>
      <button class="btn btn-primary btn-sm" id="addTeacherBtn">+ إنشاء حساب معلمة</button>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الحالة</th><th>تاريخ الإنشاء</th><th>إجراءات</th></tr></thead>
        <tbody>
          ${teachers
            .map(
              (t) => `
            <tr>
              <td>${esc(t.name)}</td>
              <td>${esc(t.email)}</td>
              <td>${t.disabled ? '<span class="badge badge-red">معطّل</span>' : '<span class="badge badge-green">نشط</span>'}</td>
              <td>${new Date(t.created_at).toLocaleDateString("ar-SA")}</td>
              <td style="display:flex; gap:6px; flex-wrap:wrap">
                <button class="btn btn-outline btn-sm" data-reset="${t.id}">إعادة تعيين كلمة المرور</button>
                <button class="btn btn-secondary btn-sm" data-toggle="${t.id}" data-disabled="${t.disabled}">${t.disabled ? "تفعيل" : "تعطيل"}</button>
                <button class="btn btn-danger btn-sm" data-delete="${t.id}">حذف</button>
              </td>
            </tr>`
            )
            .join("") || `<tr><td colspan="5" class="empty-state">لا توجد حسابات معلمات بعد</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  content.querySelector("#addTeacherBtn").addEventListener("click", () => {
    openModal(`
      <h3>إنشاء حساب معلمة جديد</h3>
      <form id="teacherForm">
        <div class="form-grid full">
          <div class="field"><label>اسم المعلمة</label><input type="text" id="tName" required /></div>
          <div class="field"><label>البريد الإلكتروني</label><input type="email" id="tEmail" required /></div>
          <div class="field"><label>كلمة المرور المبدئية</label><input type="password" id="tPass" required minlength="8" /></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="cancelTeacher">إلغاء</button>
          <button type="submit" class="btn btn-primary">إنشاء الحساب</button>
        </div>
      </form>
    `);
    modalRoot.querySelector("#cancelTeacher").addEventListener("click", closeModal);
    modalRoot.querySelector("#teacherForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api("/teachers", {
          method: "POST",
          body: JSON.stringify({
            name: modalRoot.querySelector("#tName").value,
            email: modalRoot.querySelector("#tEmail").value,
            password: modalRoot.querySelector("#tPass").value,
          }),
        });
        closeModal();
        toast("تم إنشاء حساب المعلمة");
        renderTeachers();
      } catch (err) {
        toast(err.message);
      }
    });
  });

  content.querySelectorAll("[data-toggle]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const disabled = btn.dataset.disabled !== "true";
      await api(`/teachers/${btn.dataset.toggle}/status`, { method: "PUT", body: JSON.stringify({ disabled }) });
      toast(disabled ? "تم تعطيل الحساب" : "تم تفعيل الحساب");
      renderTeachers();
    })
  );

  content.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener("click", () =>
      confirmAction("هل تريدين حذف حساب هذه المعلمة نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.", async () => {
        await api(`/teachers/${btn.dataset.delete}`, { method: "DELETE" });
        toast("تم حذف الحساب");
        renderTeachers();
      })
    )
  );

  content.querySelectorAll("[data-reset]").forEach((btn) =>
    btn.addEventListener("click", () => {
      openModal(`
        <h3>إعادة تعيين كلمة المرور</h3>
        <form id="resetForm">
          <div class="field"><label>كلمة المرور الجديدة</label><input type="password" id="newPass" required minlength="8" /></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" id="cancelReset">إلغاء</button>
            <button type="submit" class="btn btn-primary">حفظ</button>
          </div>
        </form>
      `);
      modalRoot.querySelector("#cancelReset").addEventListener("click", closeModal);
      modalRoot.querySelector("#resetForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          await api(`/teachers/${btn.dataset.reset}/reset-password`, {
            method: "PUT",
            body: JSON.stringify({ newPassword: modalRoot.querySelector("#newPass").value }),
          });
          closeModal();
          toast("تم تحديث كلمة المرور");
        } catch (err) {
          toast(err.message);
        }
      });
    })
  );
}

async function renderStudents() {
  content.innerHTML = `<div class="empty-state">جارٍ التحميل...</div>`;
  const students = await api("/students");
  content.innerHTML = `
    <div class="card" style="margin-bottom:16px; background:var(--purple-100); border:none">
      <p style="font-size:.85rem; color:var(--purple-900); margin:0">ملاحظة: حسابات تسجيل دخول الطالبات لم يتم تفعيلها بعد في الموقع، لذلك الإدارة هنا تشمل تفعيل/تعطيل/حذف سجل الطالبة فقط.</p>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الفصل</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody>
          ${students
            .map(
              (s) => `
            <tr>
              <td>${esc(s.name)}</td>
              <td>${esc(s.email)}</td>
              <td>${esc(s.class_name || "—")}</td>
              <td>${s.disabled ? '<span class="badge badge-red">معطّل</span>' : '<span class="badge badge-green">نشط</span>'}</td>
              <td style="display:flex; gap:6px; flex-wrap:wrap">
                <button class="btn btn-secondary btn-sm" data-toggle="${s.id}" data-disabled="${s.disabled}">${s.disabled ? "تفعيل" : "تعطيل"}</button>
                <button class="btn btn-danger btn-sm" data-delete="${s.id}">حذف</button>
              </td>
            </tr>`
            )
            .join("") || `<tr><td colspan="5" class="empty-state">لا توجد طالبات بعد</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  content.querySelectorAll("[data-toggle]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const disabled = btn.dataset.disabled !== "true";
      await api(`/students/${btn.dataset.toggle}/status`, { method: "PUT", body: JSON.stringify({ disabled }) });
      toast(disabled ? "تم تعطيل الحساب" : "تم تفعيل الحساب");
      renderStudents();
    })
  );

  content.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener("click", () =>
      confirmAction("هل تريدين حذف سجل هذه الطالبة نهائيًا؟", async () => {
        await api(`/students/${btn.dataset.delete}`, { method: "DELETE" });
        toast("تم الحذف");
        renderStudents();
      })
    )
  );
}

async function renderTests() {
  content.innerHTML = `<div class="empty-state">جارٍ التحميل...</div>`;
  const tests = await api("/tests");
  content.innerHTML = `
    <div class="card">
      <table>
        <thead><tr><th>العنوان</th><th>المعلمة</th><th>النوع</th><th>الحالة</th><th>عدد النتائج</th><th></th></tr></thead>
        <tbody>
          ${tests
            .map(
              (t) => `
            <tr>
              <td>${esc(t.title)}</td>
              <td>${esc(t.teacher_name)}</td>
              <td>${esc(t.category)}</td>
              <td><span class="badge badge-purple">${esc(t.status)}</span></td>
              <td>${t.results_count}</td>
              <td><button class="btn btn-danger btn-sm" data-delete="${t.id}">حذف</button></td>
            </tr>`
            )
            .join("") || `<tr><td colspan="6" class="empty-state">لا توجد اختبارات بعد</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  content.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener("click", () =>
      confirmAction("هل تريدين حذف هذا الاختبار وجميع نتائجه؟", async () => {
        await api(`/tests/${btn.dataset.delete}`, { method: "DELETE" });
        toast("تم الحذف");
        renderTests();
      })
    )
  );
}

async function renderActivity() {
  content.innerHTML = `<div class="empty-state">جارٍ التحميل...</div>`;
  const logs = await api("/activity-log");
  content.innerHTML = `
    <div class="card">
      <table>
        <thead><tr><th>الجهة</th><th>الإجراء</th><th>التفاصيل</th><th>التاريخ</th></tr></thead>
        <tbody>
          ${logs
            .map(
              (l) => `
            <tr>
              <td>${l.actor_role === "owner" ? `<span class="badge badge-purple">مالكة</span> ${esc(l.owner_name || "")}` : `<span class="badge badge-gray">معلمة</span> ${esc(l.teacher_name || "")}`}</td>
              <td>${esc(l.action)}</td>
              <td>${esc(l.details || "")}</td>
              <td>${new Date(l.created_at).toLocaleString("ar-SA")}</td>
            </tr>`
            )
            .join("") || `<tr><td colspan="4" class="empty-state">لا يوجد نشاط بعد</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

async function renderSettings() {
  content.innerHTML = `<div class="empty-state">جارٍ التحميل...</div>`;
  const settings = await api("/settings");
  const registrationEnabled = settings.teacher_registration_enabled !== "false";
  content.innerHTML = `
    <div class="card">
      <p class="section-title">إعدادات المنصة العامة</p>
      <div class="skill-pill">
        <span>السماح للمعلمات بإنشاء حساب جديد من صفحة الدخول</span>
        <button class="btn btn-sm ${registrationEnabled ? "btn-danger" : "btn-primary"}" id="toggleRegistration">
          ${registrationEnabled ? "تعطيل الإنشاء" : "تفعيل الإنشاء"}
        </button>
      </div>
    </div>
  `;
  content.querySelector("#toggleRegistration").addEventListener("click", async () => {
    await api("/settings", {
      method: "PUT",
      body: JSON.stringify({ key: "teacher_registration_enabled", value: !registrationEnabled }),
    });
    toast("تم تحديث الإعداد");
    renderSettings();
  });
}

const routes = {
  home: renderHome,
  teachers: renderTeachers,
  students: renderStudents,
  tests: renderTests,
  activity: renderActivity,
  settings: renderSettings,
};

function navigate(route) {
  if (!routes[route]) route = "home";
  document.querySelectorAll(".nav-item[data-route]").forEach((el) => el.classList.toggle("active", el.dataset.route === route));
  pageTitle.textContent = TITLES[route];
  sidebar.classList.remove("open");
  routes[route]().catch((err) => {
    if (err.message !== "unauthorized") {
      content.innerHTML = `<div class="empty-state">حدث خطأ: ${esc(err.message)}</div>`;
    }
  });
}

document.querySelectorAll(".nav-item[data-route]").forEach((el) =>
  el.addEventListener("click", () => navigate(el.dataset.route))
);

document.getElementById("menuToggle").addEventListener("click", () => sidebar.classList.toggle("open"));

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await api("/logout", { method: "POST" });
  window.location.href = "/owner/login.html";
});

(async function init() {
  try {
    const owner = await api("/me");
    document.getElementById("ownerNameLabel").textContent = owner.name;
    document.getElementById("avatarCircle").textContent = owner.name.trim()[0] || "م";
    navigate("home");
  } catch (err) {
    // api() already redirects to login on 401/403
  }
})();

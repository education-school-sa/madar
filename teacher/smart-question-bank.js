const gradesByStage = {
  "ابتدائي": ["رابع ابتدائي", "خامس ابتدائي", "سادس ابتدائي"],
  "متوسط": ["أول متوسط", "ثاني متوسط", "ثالث متوسط"],
  "ثانوي": ["أول ثانوي", "ثاني ثانوي", "ثالث ثانوي"],
};

const defaults = {
  term: "الأول",
  stage: "متوسط",
  grade: "أول متوسط",
  unit: "",
  lesson: "",
  questionType: "اختيار من متعدد",
  difficulty: "متوسط",
  count: 10,
  scope: "المنهج كامل",
  remember: true,
};

let state = { ...defaults };

async function prefApi(method = "GET", body) {
  const res = await fetch("/api/teacher/preferences/question-bank", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "حدث خطأ غير متوقع.");
  return data;
}

function option(value, selected) {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`;
}

function renderQuestionBank() {
  const content = document.getElementById("content");
  const title = document.getElementById("pageTitle");
  if (!content || !title) return;
  title.textContent = "بنك الأسئلة الذكي";

  const grades = gradesByStage[state.stage] || [];
  if (!grades.includes(state.grade)) state.grade = grades[0] || "";

  content.innerHTML = `
    <div class="smart-bank-card">
      <div class="smart-bank-head">
        <div>
          <span class="smart-bank-kicker">بحث ذكي محفوظ في حسابك</span>
          <h3>بنك الأسئلة الذكي</h3>
          <p>ابدئي بالفصل الدراسي، ثم المرحلة والصف. سيحفظ النظام اختياراتك لتجديها كما تركتها عند العودة.</p>
        </div>
        <div class="smart-bank-icon">✨</div>
      </div>

      <div class="smart-filter-grid">
        <label class="smart-field smart-field-primary">1. الفصل الدراسي
          <select id="qbTerm">${["الأول", "الثاني"].map(v => option(v, state.term)).join("")}</select>
        </label>
        <label class="smart-field">2. المرحلة
          <select id="qbStage">${Object.keys(gradesByStage).map(v => option(v, state.stage)).join("")}</select>
        </label>
        <label class="smart-field">3. الصف
          <select id="qbGrade">${grades.map(v => option(v, state.grade)).join("")}</select>
        </label>
        <label class="smart-field">4. الوحدة
          <input id="qbUnit" value="${state.unit || ""}" placeholder="مثال: الوحدة الأولى" />
        </label>
        <label class="smart-field">5. الدرس
          <input id="qbLesson" value="${state.lesson || ""}" placeholder="اختياري" />
        </label>
        <label class="smart-field">نوع السؤال
          <select id="qbType">${["اختيار من متعدد", "صح أو خطأ", "إجابة قصيرة", "مسألة رياضية", "متنوع"].map(v => option(v, state.questionType)).join("")}</select>
        </label>
        <label class="smart-field">مستوى الصعوبة
          <select id="qbDifficulty">${["سهل", "متوسط", "متقدم", "متدرج"].map(v => option(v, state.difficulty)).join("")}</select>
        </label>
        <label class="smart-field">عدد الأسئلة
          <input id="qbCount" type="number" min="1" max="100" value="${state.count}" />
        </label>
      </div>

      <div class="smart-scope">
        <strong>التوليد السريع</strong>
        <div class="smart-scope-options">
          ${["درس محدد", "الوحدة كاملة", "المنهج كامل", "سؤال من كل درس"].map(v => `<label><input type="radio" name="qbScope" value="${v}" ${state.scope === v ? "checked" : ""}> ${v}</label>`).join("")}
        </div>
      </div>

      <label class="smart-remember">
        <input id="qbRemember" type="checkbox" ${state.remember ? "checked" : ""}>
        <span><strong>تذكّر اختياراتي في المرة القادمة</strong><small>تُحفظ داخل حساب المعلمة وتظهر حتى عند الدخول من جهاز آخر.</small></span>
      </label>

      <div class="smart-actions">
        <button class="btn btn-outline" id="qbReset">إعادة ضبط الاختيارات</button>
        <button class="btn btn-secondary" id="qbSave">حفظ الإعدادات</button>
        <button class="btn btn-primary" id="qbGenerate">✨ توليد أسئلة تلقائيًا</button>
      </div>
      <div id="qbMessage" class="smart-message"></div>
    </div>`;

  const collect = () => ({
    term: document.getElementById("qbTerm").value,
    stage: document.getElementById("qbStage").value,
    grade: document.getElementById("qbGrade").value,
    unit: document.getElementById("qbUnit").value.trim(),
    lesson: document.getElementById("qbLesson").value.trim(),
    questionType: document.getElementById("qbType").value,
    difficulty: document.getElementById("qbDifficulty").value,
    count: Number(document.getElementById("qbCount").value) || 10,
    scope: document.querySelector('input[name="qbScope"]:checked')?.value || "المنهج كامل",
    remember: document.getElementById("qbRemember").checked,
  });

  document.getElementById("qbStage").addEventListener("change", (e) => {
    state = { ...collect(), stage: e.target.value, grade: gradesByStage[e.target.value][0] };
    renderQuestionBank();
  });

  document.getElementById("qbSave").onclick = async () => {
    const msg = document.getElementById("qbMessage");
    try {
      state = collect();
      if (state.remember) await prefApi("PUT", state);
      else await prefApi("DELETE");
      msg.textContent = state.remember ? "تم حفظ اختياراتك داخل حسابك بنجاح." : "تم إيقاف التذكّر وحذف الإعدادات المحفوظة.";
      msg.className = "smart-message success";
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "smart-message error";
    }
  };

  document.getElementById("qbReset").onclick = async () => {
    state = { ...defaults };
    try { await prefApi("DELETE"); } catch {}
    renderQuestionBank();
  };

  document.getElementById("qbGenerate").onclick = async () => {
    state = collect();
    if (state.remember) {
      try { await prefApi("PUT", state); } catch {}
    }
    const msg = document.getElementById("qbMessage");
    msg.textContent = `تم تجهيز إعدادات توليد ${state.count} سؤالًا لـ ${state.grade} — الفصل الدراسي ${state.term} — ${state.scope}.`;
    msg.className = "smart-message success";
  };
}

async function openQuestionBank() {
  try {
    const saved = await prefApi();
    state = { ...defaults, ...saved };
  } catch {
    state = { ...defaults };
  }
  location.hash = "question-bank";
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.remove("active"));
  document.querySelector('[data-smart-question-bank]')?.classList.add("active");
  renderQuestionBank();
}

function installQuestionBank() {
  const testsLabel = [...document.querySelectorAll(".nav-group-label")].find(el => el.textContent.trim() === "الاختبارات");
  if (!testsLabel || document.querySelector("[data-smart-question-bank]")) return;
  const btn = document.createElement("button");
  btn.className = "nav-item";
  btn.dataset.smartQuestionBank = "1";
  btn.innerHTML = '<span class="ic">🧠</span> بنك الأسئلة الذكي';
  testsLabel.insertAdjacentElement("afterend", btn);
  btn.addEventListener("click", openQuestionBank);

  window.addEventListener("hashchange", () => {
    if (location.hash === "#question-bank") openQuestionBank();
  });
  if (location.hash === "#question-bank") openQuestionBank();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installQuestionBank);
else installQuestionBank();

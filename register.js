const registrationRoles = {
  student: {
    title: "إنشاء حساب الطالبة",
    intro: "أدخلي بياناتك لإرسال طلب الانضمام إلى منصة مدار.",
    nameFields: [
      { id: "firstName", label: "الاسم الأول" },
      { id: "fatherName", label: "اسم الأب" },
      { id: "lastName", label: "الاسم الأخير" },
    ],
    needsEmail: true,
  },
  teacher: {
    title: "إنشاء حساب المعلم",
    intro: "أدخل بياناتك لإرسال طلب الانضمام إلى منصة مدار.",
    nameFields: [
      { id: "firstName", label: "الاسم الأول" },
      { id: "fatherName", label: "اسم الأب" },
      { id: "lastName", label: "الاسم الأخير" },
    ],
    needsEmail: true,
  },
  staff: {
    title: "إنشاء حساب الكادر الإداري",
    intro: "أدخل الاسم الثنائي وكلمة المرور لإرسال طلب الانضمام.",
    nameFields: [
      { id: "firstName", label: "الاسم الأول" },
      { id: "lastName", label: "الاسم الأخير" },
    ],
    needsEmail: false,
  },
  parent: {
    title: "إنشاء حساب ولي الأمر",
    intro: "أدخل بياناتك ثم أضف إيميل منصة مدرستي لكل ابنة.",
    nameFields: [
      { id: "firstName", label: "الاسم الأول" },
      { id: "lastName", label: "الاسم الأخير" },
    ],
    isParent: true,
  },
};

const params = new URLSearchParams(window.location.search);
const requestedRole = params.get("role");
const role = registrationRoles[requestedRole] ? requestedRole : "student";
const settings = registrationRoles[role];

const registerTitle = document.getElementById("registerTitle");
const registerIntro = document.getElementById("registerIntro");
const dynamicFields = document.getElementById("dynamicFields");
const registerForm = document.getElementById("registerForm");
const registerMessage = document.getElementById("registerMessage");
const registerPassword = document.getElementById("registerPassword");
const passwordToggle = document.getElementById("registerPasswordToggle");
const backToLogin = document.getElementById("backToLogin");
const successLoginLink = document.getElementById("successLoginLink");

registerTitle.textContent = settings.title;
registerIntro.textContent = settings.intro;
document.title = `${settings.title} | مدار`;
backToLogin.href = `login.html?role=${encodeURIComponent(role)}`;
successLoginLink.href = `login.html?role=${encodeURIComponent(role)}`;

function fieldTemplate({ id, label, placeholder, type = "text", direction = "rtl" }) {
  return `
    <label class="field register-field">
      <span class="field-label">${label}</span>
      <input id="${id}" name="${id}" type="${type}" placeholder="${placeholder}" dir="${direction}" required />
    </label>
  `;
}

const nameGridClass = settings.nameFields.length === 3 ? "name-grid-three" : "name-grid-two";
dynamicFields.insertAdjacentHTML(
  "beforeend",
  `<div class="name-grid ${nameGridClass}">
    ${settings.nameFields
      .map((field) =>
        fieldTemplate({
          id: field.id,
          label: field.label,
          placeholder: field.label,
        })
      )
      .join("")}
  </div>`
);

if (settings.needsEmail) {
  dynamicFields.insertAdjacentHTML(
    "beforeend",
    fieldTemplate({
      id: "madrasatiEmail",
      label: "إيميل منصة مدرستي",
      placeholder: "example@moe.gov.sa",
      type: "email",
      direction: "ltr",
    })
  );
}

if (settings.isParent) {
  dynamicFields.insertAdjacentHTML(
    "beforeend",
    `
      <div class="daughter-emails">
        <p class="daughter-emails-title">إيميلات منصة مدرستي للطالبات</p>
        <div id="daughterEmailList"></div>
        <button class="add-daughter" id="addDaughterEmail" type="button">+ إضافة إيميل طالبة أخرى</button>
      </div>
    `
  );
}

function addDaughterEmail() {
  const list = document.getElementById("daughterEmailList");
  const row = document.createElement("div");
  row.className = "daughter-email-row";
  row.innerHTML = `
    <input type="email" name="daughterEmails" placeholder="إيميل منصة مدرستي للطالبة" aria-label="إيميل منصة مدرستي للطالبة" required />
    <button class="remove-daughter" type="button" aria-label="حذف هذا الإيميل">×</button>
  `;
  row.querySelector(".remove-daughter").addEventListener("click", () => {
    if (list.children.length > 1) row.remove();
  });
  list.appendChild(row);
}

if (settings.isParent) {
  addDaughterEmail();
  document.getElementById("addDaughterEmail").addEventListener("click", addDaughterEmail);
}

passwordToggle.addEventListener("click", () => {
  const shouldShow = registerPassword.type === "password";
  registerPassword.type = shouldShow ? "text" : "password";
  passwordToggle.classList.toggle("is-visible", shouldShow);
  passwordToggle.setAttribute("aria-label", shouldShow ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
});

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

registerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  registerMessage.textContent = "";

  const missingNameField = settings.nameFields.find((field) => {
    return !document.getElementById(field.id).value.trim();
  });
  if (missingNameField) {
    registerMessage.textContent = `فضلاً أدخل ${missingNameField.label}.`;
    document.getElementById(missingNameField.id).focus();
    return;
  }

  if (settings.needsEmail) {
    const email = document.getElementById("madrasatiEmail").value.trim();
    if (!validEmail(email)) {
      registerMessage.textContent = "فضلاً أدخل إيميل منصة مدرستي بشكل صحيح.";
      document.getElementById("madrasatiEmail").focus();
      return;
    }
  }

  if (settings.isParent) {
    const daughterEmails = [...document.querySelectorAll('[name="daughterEmails"]')];
    const invalidEmail = daughterEmails.find((input) => !validEmail(input.value.trim()));
    if (invalidEmail) {
      registerMessage.textContent = "فضلاً أدخل إيميلات منصة مدرستي للطالبات بشكل صحيح.";
      invalidEmail.focus();
      return;
    }
  }

  if (registerPassword.value.length < 8) {
    registerMessage.textContent = "كلمة المرور يجب أن تكون 8 أحرف على الأقل.";
    registerPassword.focus();
    return;
  }

  registerMessage.textContent = "الصفحة جاهزة، وسيتم تفعيل إرسال الطلب بعد ربطها بقاعدة البيانات ولوحة الموافقات.";
});

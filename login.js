const roleData = {
  student: {
    title: "دخول الطالبة",
    question: "لا تملكين حسابًا؟",
  },
  parent: {
    title: "دخول ولي الأمر",
    question: "ليس لديك حساب؟",
  },
  teacher: {
    title: "دخول المعلم",
    question: "ليس لديك حساب؟",
  },
  staff: {
    title: "دخول الكادر الإداري",
    question: "ليس لديك حساب؟",
  },
};

const params = new URLSearchParams(window.location.search);
const requestedRole = params.get("role");
const role = roleData[requestedRole] ? requestedRole : "student";
const currentRole = roleData[role];

const roleTitle = document.getElementById("roleTitle");
const accountQuestion = document.getElementById("accountQuestion");
const loginForm = document.getElementById("loginForm");
const username = document.getElementById("username");
const password = document.getElementById("password");
const passwordToggle = document.getElementById("passwordToggle");
const formMessage = document.getElementById("formMessage");

roleTitle.textContent = currentRole.title;
accountQuestion.textContent = currentRole.question;
document.title = `${currentRole.title} | مدار`;
document.body.dataset.role = role;
localStorage.setItem("madar-login-role", role);

passwordToggle.addEventListener("click", () => {
  const shouldShow = password.type === "password";
  password.type = shouldShow ? "text" : "password";
  passwordToggle.classList.toggle("is-visible", shouldShow);
  passwordToggle.setAttribute("aria-label", shouldShow ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  formMessage.textContent = "";

  if (!username.value.trim() || !password.value.trim()) {
    formMessage.textContent = "فضلاً أدخلي اسم المستخدم وكلمة المرور.";
    (!username.value.trim() ? username : password).focus();
    return;
  }

  formMessage.style.color = "#e9ddff";
  formMessage.textContent = "واجهة الدخول جاهزة، وسيتم ربطها بقاعدة البيانات في الخطوة التالية.";
});

document.getElementById("createAccount").addEventListener("click", (event) => {
  event.preventDefault();
  formMessage.style.color = "#e9ddff";
  formMessage.textContent = "سيتم إضافة نموذج إنشاء الحساب وربطه بقاعدة البيانات في الخطوة التالية.";
});

document.getElementById("helpButton").addEventListener("click", () => {
  formMessage.style.color = "#e9ddff";
  formMessage.textContent = "للمساعدة، تواصلي مع إدارة منصة مدار.";
  formMessage.scrollIntoView({ behavior: "smooth", block: "center" });
});

const tabsWrap = document.getElementById("authTabs");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginError = document.getElementById("loginError");
const registerError = document.getElementById("registerError");
const loginHint = document.getElementById("loginHint");

// If already logged in, go straight to the dashboard.
fetch("/api/teacher/me")
  .then((r) => (r.ok ? (window.location.href = "index.html") : null))
  .catch(() => {});

tabsWrap.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  tabsWrap.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
  const isLogin = btn.dataset.tab === "login";
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  loginHint.hidden = !isLogin;
  loginError.hidden = true;
  registerError.hidden = true;
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const submitBtn = loginForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "جارٍ تسجيل الدخول...";

  try {
    const res = await fetch("/api/teacher/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      loginError.textContent = data.error || "تعذّر تسجيل الدخول.";
      loginError.hidden = false;
      return;
    }
    window.location.href = "index.html";
  } catch (err) {
    loginError.textContent = "تعذّر الاتصال بالخادم، حاولي مرة أخرى.";
    loginError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "تسجيل الدخول";
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  registerError.hidden = true;
  const name = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const confirmPassword = document.getElementById("regConfirm").value;
  const agreeTerms = document.getElementById("regTerms").checked;

  if (password !== confirmPassword) {
    registerError.textContent = "كلمة المرور وتأكيدها غير متطابقين.";
    registerError.hidden = false;
    return;
  }
  if (!agreeTerms) {
    registerError.textContent = "يجب الموافقة على الشروط والأحكام لإنشاء الحساب.";
    registerError.hidden = false;
    return;
  }

  const submitBtn = registerForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "جارٍ إنشاء الحساب...";

  try {
    const res = await fetch("/api/teacher/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, confirmPassword, agreeTerms }),
    });
    const data = await res.json();
    if (!res.ok) {
      registerError.textContent = data.error || "تعذّر إنشاء الحساب.";
      registerError.hidden = false;
      return;
    }
    window.location.href = "index.html";
  } catch (err) {
    registerError.textContent = "تعذّر الاتصال بالخادم، حاولي مرة أخرى.";
    registerError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "إنشاء الحساب";
  }
});

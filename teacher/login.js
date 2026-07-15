const form = document.getElementById("loginForm");
const errorBox = document.getElementById("loginError");

// If already logged in, go straight to the dashboard.
fetch("/api/teacher/me")
  .then((r) => (r.ok ? (window.location.href = "index.html") : null))
  .catch(() => {});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const submitBtn = form.querySelector("button[type=submit]");
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
      errorBox.textContent = data.error || "تعذّر تسجيل الدخول.";
      errorBox.hidden = false;
      return;
    }
    window.location.href = "index.html";
  } catch (err) {
    errorBox.textContent = "تعذّر الاتصال بالخادم، حاولي مرة أخرى.";
    errorBox.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "تسجيل الدخول";
  }
});

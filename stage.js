const stageData = {
  primary: {
    label: "المرحلة الابتدائية",
    shortLabel: "الابتدائية",
  },
  middle: {
    label: "المرحلة المتوسطة",
    shortLabel: "المتوسطة",
  },
  secondary: {
    label: "المرحلة الثانوية",
    shortLabel: "الثانوية",
  },
};

const params = new URLSearchParams(window.location.search);
const requestedStage = params.get("stage");
const stage = stageData[requestedStage] ? requestedStage : "primary";
const currentStage = stageData[stage];

const savedName = (localStorage.getItem("madar-user-name") || "").trim();
const displayName = savedName || "طالبة مدار";

document.getElementById("welcomeName").textContent = `أهلًا بدخولكِ يا ${displayName}`;
document.getElementById("stageBadge").textContent = currentStage.label;
document.getElementById("stageKicker").textContent = `مساركِ في ${currentStage.label}`;
document.title = `مداري التعليمي - ${currentStage.shortLabel} | مدار`;

const toast = document.getElementById("stageToast");
const toastText = document.getElementById("toastText");

function showToast(message) {
  toastText.textContent = message;
  toast.hidden = false;
}

document.querySelectorAll("[data-section]").forEach((button) => {
  button.addEventListener("click", () => {
    showToast(`قسم ${button.dataset.section} جاهز للربط بمحتوى ${currentStage.label}.`);
  });
});

document.getElementById("profileButton").addEventListener("click", () => {
  showToast("سيعرض ملفكِ الدراسي درجاتكِ وتقدّمكِ وشاراتكِ بعد ربط قاعدة البيانات.");
});

document.getElementById("closeToast").addEventListener("click", () => {
  toast.hidden = true;
});

# مدار (Madar) — منصة الرياضيات التفاعلية

## نظرة عامة
موقع تعليمي باللغة العربية (RTL) لعرض منصة تعليم رياضيات تفاعلية، مبني على واجهة ثابتة (Static HTML/CSS/JS) للموقع العام، بالإضافة إلى لوحة تحكم كاملة للمعلمة مبنية بـ Node.js/Express وقاعدة بيانات PostgreSQL.

## البنية

### الموقع العام (ثابت، غير مطلوب لمسه)
- `index.html` / `styles.css` / `script.js` — الصفحة الرئيسية
- `login.html` / `login.css` / `login.js` — تسجيل دخول الطالبة/ولي الأمر
- `register.html` / `register.css` / `register.js` — إنشاء حساب
- `stage.html` / `stage.css` / `stage.js` — صفحة المراحل
- `analytics.html`, `neon-clock.html` — صفحات إضافية
- زر «دخول المعلم» في الصفحة الرئيسية يوجّه إلى `teacher/login.html`

### لوحة تحكم المعلمة (جديد)
- `server.js`: خادم Express يخدم الموقع الثابت + واجهات API الخاصة بلوحة المعلمة.
- `backend/db.js`: اتصال قاعدة بيانات PostgreSQL (Replit built-in Postgres، متغيّر `DATABASE_URL`).
- `backend/auth.js`: تجزئة كلمات المرور (bcrypt) + middleware للمصادقة بالجلسات.
- `backend/routes/*.js`: مسارات API لكل قسم (auth, dashboard, students, tests, analysis, misc, reports).
- `teacher/`: واجهة لوحة المعلمة (SPA بدون مكتبات خارجية) — `login.html`, `index.html`, `dashboard.css`, `dashboard.js`, `login.js`.
  - تنقّل داخلي عبر hash routing (`#home`, `#students`, ...).
  - أقسام: الرئيسية، معلوماتي، أسماء/إدارة الطالبات (+ استيراد CSV)، اختبارات (تشخيصي قبلي/بعدي/قصيرة) مع بناء أسئلة وتصحيح تلقائي، تحليل النتائج (طالبة/فصل/مهارة)، تقارير (Excel/PDF)، إشعارات، فصول، سجل الأنشطة، إعدادات.
- الجلسات مخزّنة في PostgreSQL عبر `connect-pg-simple`، باستخدام السر `SESSION_SECRET`.

كل صفحة من الموقع العام مستقلة (لا يوجد نظام بناء / bundler)، والملفات تُقرأ مباشرة كملفات ثابتة. لوحة المعلمة هي تطبيق JS من جهة العميل يستهلك REST API.

## التشغيل على Replit
- Workflow: `Start application` يشغّل `node server.js` على المنفذ 5000.
- قاعدة بيانات PostgreSQL مُفعّلة (Replit built-in) — 14 جدولاً (`teachers`, `students`, `classes`, `tests`, `questions`, `test_results`, إلخ) مع بيانات تجريبية.
- بيانات تجريبية لتسجيل دخول المعلمة: `teacher@madar.sa` / `Teacher@2026`.

## ملاحظات
- المشروع مستورد من GitHub أصلاً، وتمت إضافة خادم الملفات الثابتة دون تغييرات على الموقع العام.
- تفضيلات المستخدم: عدم لمس/حذف صفحات الموقع الحالية عند إضافة الميزات الجديدة، استخدام خدمات مجانية فقط، وعدم النشر (publish) أو الدفع إلى GitHub دون موافقة صريحة.
- تم تنفيذ لوحة المعلمة على مراحل بموافقة المستخدم في كل مرحلة قبل الانتقال للتالية.

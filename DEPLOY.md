# 🕌 خطوات رفع تطبيق تعلُّم التجويد على Netlify

## المتطلبات
- حساب Netlify (مجاني) — netlify.com
- حساب OpenAI — platform.openai.com  (للـ Whisper)
- حساب Anthropic — console.anthropic.com  (للـ Claude)

---

## الخطوة الأولى: رفع الملفات

### الطريقة الأسهل — GitHub:
1. اعمل repo جديد على GitHub
2. ارفع الملفات كلها (حافظ على نفس الهيكل)
3. في Netlify: **Add new site** ← **Import from Git** ← اختار الـ repo

### أو مباشرة بدون GitHub:
1. افتح Netlify
2. **Add new site** ← **Deploy manually**
3. اسحب مجلد المشروع كله على الصفحة

---

## الخطوة الثانية: إضافة API Keys (مهم جداً)

في Netlify بعد ما ترفع الـ site:

**Site configuration** ← **Environment variables** ← **Add variable**

أضف متغيرين:

| Key | Value |
|-----|-------|
| `OPENAI_API_KEY` | مفتاحك من platform.openai.com |
| `ANTHROPIC_API_KEY` | مفتاحك من console.anthropic.com |

---

## الخطوة الثالثة: Deploy

اضغط **Deploy site** — خلال دقيقة التطبيق هيبقى شغال.

---

## هيكل الملفات

```
quran-tajweed/
├── netlify/
│   └── functions/
│       └── analyze.js      ← Backend (Whisper + Claude)
├── public/
│   └── index.html          ← Frontend
├── netlify.toml            ← إعدادات Netlify
└── package.json
```

---

## ملاحظات

- الـ API keys **لا تظهر للمستخدم أبداً** — محفوظة على السيرفر فقط
- تكلفة كل تلاوة: أقل من $0.01
- يشتغل على Chrome وEdge وSafari (iOS 14.5+)

<div align="center" dir="rtl">

# Notika

### خزنة ملاحظات مشاريع مستضافة ذاتياً ومتوافقة مع Obsidian و MCP

*تخزين محلي على نظام الملفات (`.md` و `.txt`) · محرر عادي و Markdown · روابط مشاركة قصيرة ودعوات · خادم MCP مدمج · متجاوب 100% مع الجوال · 10 لغات*

[![رخصة MIT](https://img.shields.io/badge/License-MIT-34D399.svg?style=for-the-badge)](../../LICENSE)

</div>

---

### 🌐 اللغات / Languages

[🏠 README الرئيسي](../../README.md) · [🇹🇷 Türkçe](./README.tr.md) · [🇺🇸 English](./README.en.md) · [🇩🇪 Deutsch](./README.de.md) · [🇫🇷 Français](./README.fr.md) · [🇪🇸 Español](./README.es.md) · [🇵🇹 Português](./README.pt.md) · [🇷🇺 Русский](./README.ru.md) · **🇸🇦 العربية** · [🇯🇵 日本語](./README.ja.md) · [🇨🇳 中文](./README.zh.md)

---

<p align="center">
  <img src="../images/hero-banner.jpg" alt="مساحة عمل Notika" width="100%" />
</p>

<div dir="rtl">

## لماذا Notika؟

يعمل **Notika** بدون قاعدة بيانات؛ حيث يمثل كل مشروع مجلداً حقيقياً على القرص وتمثل كل ملاحظة ملف `.md` أو `.txt` داخل `DATA_DIR` (`./data`) مع توافق تام مع Obsidian.

- **الوضع العادي و Markdown:** محرر نص منسق بصري (**عادي**)، دعم ملفات `.txt`، وضع **Markdown**، **العرض المقسم**، و**المعاينة المباشرة**.
- **روابط مشاركة قصيرة ودعوات (`/s/:code`):** شارك الملاحظات بصلاحية القراءة فقط أو التعديل، وادعُ متعاونين محددين مع إمكانية إلغاء الوصول فوراً.
- **دعم MCP المدمج (`/api/mcp`):** اربط Claude Desktop أو Cursor مباشرة بخزنتك المحلية عبر رمز Bearer.
- **متجاوب 100% مع الجوال ويدعم العربية RTL:** واجهة متكاملة تدعم 10 لغات وتعمل بسلاسة على الهواتف والأجهزة اللوحية.

</div>

<p align="center">
  <img src="../images/mcp-architecture.jpg" alt="معمارية Notika MCP" width="100%" />
</p>

<p align="center">
  <img src="../images/responsive-showcase.jpg" alt="تجاوب Notika مع الجوال" width="100%" />
</p>

## 🚀 التشغيل السريع عبر Docker

```bash
git clone https://github.com/your-org/notika.git
cd notika
cp .env.example .env
docker compose up -d --build
```

## 📄 الرخصة

مرخص بموجب **[رخصة MIT](../../LICENSE)**.

<div align="center">

# Notika

### Selbstgehostetes, Obsidian-kompatibles Projektnotizen- &amp; MCP-Wissensarchiv

*Lokale Dateisystem-Speicherung (`.md` &amp; `.txt`) · Normal- &amp; Markdown-Editor · Kurzlinks &amp; Einladungen · Integrierter MCP-Server · 100 % Mobilfähig · 10 Sprachen*

[![MIT-Lizenz](https://img.shields.io/badge/Lizenz-MIT-34D399.svg?style=for-the-badge)](../../LICENSE)

</div>

---

### 🌐 Sprachen / Languages

[🏠 Haupt-README](../../README.md) · [🇹🇷 Türkçe](./README.tr.md) · [🇺🇸 English](./README.en.md) · **🇩🇪 Deutsch** · [🇫🇷 Français](./README.fr.md) · [🇪🇸 Español](./README.es.md) · [🇵🇹 Português](./README.pt.md) · [🇷🇺 Русский](./README.ru.md) · [🇸🇦 العربية](./README.ar.md) · [🇯🇵 日本語](./README.ja.md) · [🇨🇳 中文](./README.zh.md)

---

<p align="center">
  <img src="../images/hero-banner.jpg" alt="Notika Arbeitsbereich" width="100%" />
</p>

## Warum Notika?

**Notika** speichert jedes Projekt als echten Ordner und jede Notiz als echte `.md`- oder `.txt`-Datei unter `DATA_DIR` (`./data`) — ohne Datenbank und vollständig kompatibel mit Obsidian.

- **4 Editor-Modi:** Visueller **Normal**-Rich-Text-Editor, reiner `.txt`-Modus, **Markdown**, **Geteilte Ansicht** und **Live-Vorschau**.
- **Kurzlinks & Kollaborator-Einladungen (`/s/:code`):** Notizen mit Lese- oder Bearbeitungsrechten sicher teilen und jederzeit widerrufen.
- **MCP-Server (`/api/mcp`):** Verbinden Sie Claude Desktop oder Cursor per Bearer-Token direkt mit Ihrem lokalen Vault.
- **100 % Mobilfähig & 10 Sprachen:** Optimiert für Smartphones, Tablets und Desktop inklusive RTL-Unterstützung.

<p align="center">
  <img src="../images/mcp-architecture.jpg" alt="Notika MCP-Architektur" width="100%" />
</p>

<p align="center">
  <img src="../images/responsive-showcase.jpg" alt="Notika Responsive Design" width="100%" />
</p>

## 🚀 Schnellstart mit Docker

```bash
git clone https://github.com/your-org/notika.git
cd notika
cp .env.example .env
docker compose up -d --build
```

## 📄 Lizenz

Veröffentlicht unter der **[MIT-Lizenz](../../LICENSE)**.

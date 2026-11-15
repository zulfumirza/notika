<div align="center">

# Notika

### Coffre-fort de Notes Projet Auto-Hébergé, Compatible Obsidian &amp; MCP

*Stockage local sur fichiers (`.md` &amp; `.txt`) · Éditeur Normal &amp; Markdown · Liens Courts &amp; Invitations · Serveur MCP Intégré · 100 % Responsive · 10 Langues*

[![Licence MIT](https://img.shields.io/badge/Licence-MIT-34D399.svg?style=for-the-badge)](../../LICENSE)

</div>

> [!IMPORTANT]
> 🦀 **Réécrit en Rust.** Le backend de Notika a été réécrit de TypeScript/Express vers **Rust (Axum + Tokio)**. Le nouveau serveur se trouve dans `src-server/` et se compile en un binaire unique embarquant le frontend React (`cargo build --release`). L'ancien serveur TypeScript (`server/`, `server.ts`) est conservé uniquement comme référence pendant la migration.

---

### 🌐 Langues / Languages

[🏠 README Principal](../../README.md) · [🇹🇷 Türkçe](./README.tr.md) · [🇺🇸 English](./README.en.md) · [🇩🇪 Deutsch](./README.de.md) · **🇫🇷 Français** · [🇪🇸 Español](./README.es.md) · [🇵🇹 Português](./README.pt.md) · [🇷🇺 Русский](./README.ru.md) · [🇸🇦 العربية](./README.ar.md) · [🇯🇵 日本語](./README.ja.md) · [🇨🇳 中文](./README.zh.md)

---

<p align="center">
  <img src="../images/hero-banner.jpg" alt="Espace de travail Notika" width="100%" />
</p>

## Pourquoi Notika ?

**Notika** fonctionne sans base de données : chaque projet est un dossier réel et chaque note est un fichier `.md` ou `.txt` stocké dans `DATA_DIR` (`./data`), entièrement compatible avec Obsidian.

- **Modes Normal & Markdown :** Éditeur visuel enrichi (**Normal**), texte brut `.txt`, **Markdown**, **Côte à côte** et **Aperçu**.
- **Liens Courts & Invitations (`/s/:code`) :** Partagez vos notes en lecture seule ou en édition et invitez des collaborateurs nommés avec révocation instantanée.
- **Serveur MCP Intégré (`/api/mcp`) :** Connectez Claude Desktop ou Cursor directement à votre coffre local via jeton Bearer.
- **100 % Mobile & 10 Langues :** Interface responsive avec tiroir coulissant et 10 langues dont l'arabe RTL.

<p align="center">
  <img src="../images/mcp-architecture.jpg" alt="Architecture MCP Notika" width="100%" />
</p>

<p align="center">
  <img src="../images/responsive-showcase.jpg" alt="Interface Mobile Notika" width="100%" />
</p>

## 🚀 Démarrage Rapide (Docker)

```bash
git clone https://github.com/your-org/notika.git
cd notika
cp .env.example .env
docker compose up -d --build
```

## 📄 Licence

Distribué sous **[Licence MIT](../../LICENSE)**.

<div align="center">

# Notika

### Bóveda de Notas de Proyecto Autoalojada, Compatible con Obsidian y MCP

*Almacenamiento local en disco (`.md` y `.txt`) · Editor Normal y Markdown · Enlaces Cortos e Invitaciones · Servidor MCP Integrado · 100 % Móvil · 10 Idiomas*

[![Licencia MIT](https://img.shields.io/badge/Licencia-MIT-34D399.svg?style=for-the-badge)](../../LICENSE)

</div>

> [!IMPORTANT]
> 🦀 **Reescrito en Rust.** El backend de Notika se ha reescrito de TypeScript/Express a **Rust (Axum + Tokio)**. El nuevo servidor está en `src-server/` y se compila en un único binario con el frontend React integrado (`cargo build --release`). El antiguo servidor TypeScript (`server/`, `server.ts`) se conserva solo como referencia durante la migración.

---

### 🌐 Idiomas / Languages

[🏠 README Principal](../../README.md) · [🇹🇷 Türkçe](./README.tr.md) · [🇺🇸 English](./README.en.md) · [🇩🇪 Deutsch](./README.de.md) · [🇫🇷 Français](./README.fr.md) · **🇪🇸 Español** · [🇵🇹 Português](./README.pt.md) · [🇷🇺 Русский](./README.ru.md) · [🇸🇦 العربية](./README.ar.md) · [🇯🇵 日本語](./README.ja.md) · [🇨🇳 中文](./README.zh.md)

---

<p align="center">
  <img src="../images/hero-banner.jpg" alt="Espacio de trabajo Notika" width="100%" />
</p>

## ¿Por qué Notika?

**Notika** almacena cada proyecto como una carpeta real y cada nota como un archivo `.md` o `.txt` en `DATA_DIR` (`./data`), sin base de datos y totalmente compatible con Obsidian.

- **Escritura Normal y Markdown:** Modo visual **Normal**, archivos planos `.txt`, **Markdown**, **Vista dividida** y **Vista previa**.
- **Enlaces Cortos e Invitaciones (`/s/:code`):** Comparte notas en modo lectura o edición e invita colaboradores con control total de revocación.
- **Servidor MCP (`/api/mcp`):** Conecta Claude Desktop o Cursor directamente a tu bóveda mediante token Bearer.
- **100 % Móvil y 10 Idiomas:** Diseño adaptable para teléfonos, tabletas y escritorio.

<p align="center">
  <img src="../images/mcp-architecture.jpg" alt="Arquitectura MCP de Notika" width="100%" />
</p>

<p align="center">
  <img src="../images/responsive-showcase.jpg" alt="Notika Móvil" width="100%" />
</p>

## 🚀 Inicio Rápido con Docker

```bash
git clone https://github.com/your-org/notika.git
cd notika
cp .env.example .env
docker compose up -d --build
```

## 📄 Licencia

Distribuido bajo la **[Licencia MIT](../../LICENSE)**.

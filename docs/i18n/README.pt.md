<div align="center">

# Notika

### Cofre de Notas de Projeto Auto-Hospedado, Compatível com Obsidian &amp; MCP

*Armazenamento local em arquivos (`.md` &amp; `.txt`) · Editor Normal &amp; Markdown · Links Curtos &amp; Convites · Servidor MCP Integrado · 100% Responsivo · 10 Idiomas*

[![Licença MIT](https://img.shields.io/badge/Licen%C3%A7a-MIT-34D399.svg?style=for-the-badge)](../../LICENSE)

</div>

---

### 🌐 Idiomas / Languages

[🏠 README Principal](../../README.md) · [🇹🇷 Türkçe](./README.tr.md) · [🇺🇸 English](./README.en.md) · [🇩🇪 Deutsch](./README.de.md) · [🇫🇷 Français](./README.fr.md) · [🇪🇸 Español](./README.es.md) · **🇵🇹 Português** · [🇷🇺 Русский](./README.ru.md) · [🇸🇦 العربية](./README.ar.md) · [🇯🇵 日本語](./README.ja.md) · [🇨🇳 中文](./README.zh.md)

---

<p align="center">
  <img src="../images/hero-banner.jpg" alt="Espaço de trabalho Notika" width="100%" />
</p>

## Por que o Notika?

O **Notika** armazena cada projeto como uma pasta real e cada nota como um arquivo `.md` ou `.txt` dentro de `DATA_DIR` (`./data`), sem banco de dados e 100% compatível com o Obsidian.

- **Modos Normal e Markdown:** Editor visual rico (**Normal**), arquivos `.txt`, **Markdown**, **Lado a Lado** e **Prévia** ao vivo.
- **Links Curtos e Convites (`/s/:code`):** Compartilhe notas com permissão de leitura ou edição e convide colaboradores com revogação imediata.
- **Servidor MCP (`/api/mcp`):** Conecte o Claude Desktop ou o Cursor diretamente ao seu cofre local via token Bearer.
- **100% Mobile e 10 Idiomas:** Navegação responsiva em gaveta e suporte completo a 10 idiomas.

<p align="center">
  <img src="../images/mcp-architecture.jpg" alt="Arquitetura MCP do Notika" width="100%" />
</p>

<p align="center">
  <img src="../images/responsive-showcase.jpg" alt="Notika Responsivo" width="100%" />
</p>

## 🚀 Início Rápido com Docker

```bash
git clone https://github.com/your-org/notika.git
cd notika
cp .env.example .env
docker compose up -d --build
```

## 📄 Licença

Licenciado sob a **[Licença MIT](../../LICENSE)**.

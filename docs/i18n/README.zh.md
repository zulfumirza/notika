<div align="center">

# Notika

### 可自托管、兼容 Obsidian 的项目笔记与 MCP 知识库

*本地文件系统存储 (`.md` &amp; `.txt`) · 普通富文本与 Markdown 编辑器 · 短链接分享与协作者邀请 · 内置 MCP 服务器 · 100% 移动端适配 · 10 种语言*

[![MIT 许可证](https://img.shields.io/badge/License-MIT-34D399.svg?style=for-the-badge)](../../LICENSE)

</div>

> [!IMPORTANT]
> 🦀 **已使用 Rust 重写。** Notika 的后端已从 TypeScript/Express 重写为 **Rust (Axum + Tokio)**。新服务器位于 `src-server/`，编译为内嵌 React 前端的单一可执行文件（`cargo build --release`）。旧的 TypeScript 服务器（`server/`、`server.ts`）仅在迁移期间作为参考保留。

---

### 🌐 语言 / Languages

[🏠 主 README](../../README.md) · [🇹🇷 Türkçe](./README.tr.md) · [🇺🇸 English](./README.en.md) · [🇩🇪 Deutsch](./README.de.md) · [🇫🇷 Français](./README.fr.md) · [🇪🇸 Español](./README.es.md) · [🇵🇹 Português](./README.pt.md) · [🇷🇺 Русский](./README.ru.md) · [🇸🇦 العربية](./README.ar.md) · [🇯🇵 日本語](./README.ja.md) · **🇨🇳 中文**

---

<p align="center">
  <img src="../images/hero-banner.jpg" alt="Notika 工作区概览" width="100%" />
</p>

## 为什么选择 Notika？

**Notika** 无需外部数据库，每个项目对应 `DATA_DIR`（默认 `./data`）中的真实文件夹，每篇笔记对应真实的 `.md` 或 `.txt` 文件，完全兼容 Obsidian。

- **普通模式 & Markdown：** 支持带格式工具栏的所见即所得**普通**模式、纯文本 `.txt`、**Markdown** 源码、**分屏**和**实时预览**。
- **短链接分享与邀请 (`/s/:code`)：** 一键生成只读或可编辑短链接，或按姓名/邮箱邀请协作者并随时撤销权限。
- **内置 MCP 服务器 (`/api/mcp`)：** 通过 Bearer 令牌将 Claude Desktop 或 Cursor 直接连接到本地笔记库。
- **100% 移动端适配 & 10 种语言：** 抽屉式侧边栏、移动端自适应分屏布局以及包含阿拉伯语 RTL 在内的 10 种语言支持。

<p align="center">
  <img src="../images/mcp-architecture.jpg" alt="Notika MCP 架构" width="100%" />
</p>

<p align="center">
  <img src="../images/responsive-showcase.jpg" alt="Notika 移动端适配展示" width="100%" />
</p>

## 🚀 快速开始 (Docker Compose)

```bash
git clone https://github.com/your-org/notika.git
cd notika
cp .env.example .env
docker compose up -d --build
```

## 📄 开源协议

基于 **[MIT 协议](../../LICENSE)** 开源。

<div align="center">

# Notika

### セルフホスト可能な Obsidian 互換プロジェクトノート &amp; MCP ナレッジ保管庫

*ローカルファイル保存 (`.md` &amp; `.txt`) · リッチ標準 &amp; Markdown エディタ · 短縮共有リンク &amp; メンバー招待 · 内蔵 MCP サーバー · 100% モバイル対応 · 10言語*

[![MIT ライセンス](https://img.shields.io/badge/License-MIT-34D399.svg?style=for-the-badge)](../../LICENSE)

</div>

---

### 🌐 言語 / Languages

[🏠 メイン README](../../README.md) · [🇹🇷 Türkçe](./README.tr.md) · [🇺🇸 English](./README.en.md) · [🇩🇪 Deutsch](./README.de.md) · [🇫🇷 Français](./README.fr.md) · [🇪🇸 Español](./README.es.md) · [🇵🇹 Português](./README.pt.md) · [🇷🇺 Русский](./README.ru.md) · [🇸🇦 العربية](./README.ar.md) · **🇯🇵 日本語** · [🇨🇳 中文](./README.zh.md)

---

<p align="center">
  <img src="../images/hero-banner.jpg" alt="Notika ワークスペース" width="100%" />
</p>

## Notika の特徴

**Notika** はデータベース不要で動作し、各プロジェクトをディスク上の実フォルダ、各ノートを実 `.md` または `.txt` ファイルとして `DATA_DIR` (`./data`) に保存する Obsidian 互換の知識管理アプリです。

- **標準 & Markdown モード:** ツールバー付きのリッチテキスト（標準）、プレーン `.txt`、**Markdown**、**分割表示**、**ライブプレビュー**に対応。
- **短縮共有リンク & メンバー招待 (`/s/:code`):** 閲覧専用または編集可能リンクの発行、特定の相手への招待とアクセス取り消しが可能です。
- **内蔵 MCP サーバー (`/api/mcp`):** Claude Desktop や Cursor を Bearer トークンで直接ローカル保管庫に接続できます。
- **100% モバイル対応 & 10言語:** スライドドロワーや縦分割プレビューを備え、10言語をシームレスに切り替え可能。

<p align="center">
  <img src="../images/mcp-architecture.jpg" alt="Notika MCP アーキテクチャ" width="100%" />
</p>

<p align="center">
  <img src="../images/responsive-showcase.jpg" alt="Notika レスポンシブデザイン" width="100%" />
</p>

## 🚀 クイックスタート (Docker)

```bash
git clone https://github.com/your-org/notika.git
cd notika
cp .env.example .env
docker compose up -d --build
```

## 📄 ライセンス

**[MIT ライセンス](../../LICENSE)** のもとで公開されています。

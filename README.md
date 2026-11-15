<div align="center">

# Notika

### Self-Hosted, Obsidian-Compatible Project Notes &amp; MCP Knowledge Vault

*Local-first filesystem storage (`.md` &amp; `.txt`) · Rich Normal &amp; Markdown Editor · Short Share Links &amp; Collaborator Invites · Built-in MCP Server · 100% Mobile Responsive · 10 Languages*

[![License: MIT](https://img.shields.io/badge/License-MIT-34D399.svg?style=for-the-badge)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](./tsconfig.json)
[![Rust](https://img.shields.io/badge/Rust-Axum-DEA584?style=for-the-badge&logo=rust&logoColor=white)](./Cargo.toml)
[![MCP Ready](https://img.shields.io/badge/MCP-JSON--RPC%202.0-10B981?style=for-the-badge)](./server/mcp.ts)
[![Docker Ready](https://img.shields.io/badge/Docker-Self--Host-2496ED?style=for-the-badge&logo=docker&logoColor=white)](./docker-compose.yml)
[![Languages](https://img.shields.io/badge/i18n-10%20Languages-F59E0B?style=for-the-badge)](#-translations--multi-language-docs)

</div>

> [!IMPORTANT]
> 🦀 **Rewritten in Rust.** Notika's backend has been rewritten from TypeScript/Express to **Rust (Axum + Tokio)**. The new server lives in `src-server/` and builds into a single binary with the React frontend embedded (`cargo build --release`). The old TypeScript server (`server/`, `server.ts`) is kept only as a reference during the migration.

---

### 🌐 Translations / Multi-Language Docs

[🇹🇷 Türkçe](./docs/i18n/README.tr.md) · [🇺🇸 English](./docs/i18n/README.en.md) · [🇩🇪 Deutsch](./docs/i18n/README.de.md) · [🇫🇷 Français](./docs/i18n/README.fr.md) · [🇪🇸 Español](./docs/i18n/README.es.md) · [🇵🇹 Português](./docs/i18n/README.pt.md) · [🇷🇺 Русский](./docs/i18n/README.ru.md) · [🇸🇦 العربية](./docs/i18n/README.ar.md) · [🇯🇵 日本語](./docs/i18n/README.ja.md) · [🇨🇳 中文](./docs/i18n/README.zh.md)

---

<p align="center">
  <img src="./docs/images/hero-banner.jpg" alt="Notika Workspace Overview & Obsidian-Compatible Editor" width="100%" />
</p>

## Why Notika?

Most note-taking tools force you into proprietary cloud databases or lack fast web collaboration. **Notika** brings the best of **Obsidian's local-first folder philosophy**, a **rich Normal/WYSIWYG + Markdown editor**, **instant short share links**, and a **native Model Context Protocol (MCP) server** in a single lightweight Rust binary.

- **Zero Database Lock-in:** Every project is a real folder inside `DATA_DIR` (default `./data`). Every note is a real `.md` or `.txt` file on disk—100% compatible with Obsidian, Git, or any text editor.
- **Write Your Way (`Normal` + `Markdown` + `Split` + `Preview`):** Write visually with headings, checklists, quotes, and formatting toolbars in **Normal** mode, edit raw `.txt` files, or switch seamlessly to monospace **Markdown**, **Split View**, and **GFM Live Preview** with syntax highlighting.
- **Short Share Links & Collaborator Invites (`/s/:code`):** Generate compact share URLs (`read` or `edit`) or send named collaborator invites with granular per-link revoke and permission toggles—even when vault authentication is enabled.
- **Built-in MCP Server (`/api/mcp`):** Connect **Claude Desktop**, **Cursor**, **Windsurf**, or any MCP-compatible AI agent directly to your personal vault using Bearer token authentication.
- **100% Mobile Responsive + 10 Languages:** Slide-over navigation drawer, stacked split view on phones, touch-sized controls, and instant switching across **10 languages** including full RTL support for Arabic.
- **Hardened Single-User Security:** Path traversal protection, symlink escape prevention, optional `APP_PASSWORD` gate with HMAC-SHA256 HTTP-only cookies, and constant-time verification.

---

## ✨ Feature Matrix

| Capability | Description |
| :--- | :--- |
| **Filesystem Vault** | Projects = Folders, Notes = `.md` & `.txt` files under `DATA_DIR`. Auto-seeds starter `Notika/` onboarding folder. |
| **4 Editor Modes** | **Normal** (WYSIWYG rich editor & plain `.txt`), **Markdown** (monospace + `Tab` indent), **Split**, **Preview** (GFM + `highlight.js`). |
| **Autosave & Shortcuts** | `800ms` debounced autosave, `Ctrl/Cmd + S` instant save, `Ctrl/Cmd + K` global search across titles & content. |
| **Short Share & Invites** | Create `/s/<code>` short links or named collaborator invites (`read` / `edit`), toggle access, or revoke anytime. |
| **MCP Integration** | JSON-RPC 2.0 endpoint at `/api/mcp` exposing tools (`list_projects`, `list_notes`, `read_note`, `create_note`, `update_note`, `search_notes`) & `notika://` resources. |
| **10-Language UI** | Turkish, English, German, French, Spanish, Portuguese, Russian, Arabic (RTL), Japanese, Simplified Chinese. |
| **Self-Host Ready** | Multi-stage Alpine `Dockerfile` & `docker-compose.yml` with persistent `./data:/app/data` volume. |

---

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended for Self-Hosting)

```bash
git clone https://github.com/your-org/notika.git
cd notika
cp .env.example .env
# Edit .env to set APP_PASSWORD and AUTH_SECRET
docker compose up -d --build
```

Notika will be running on **`http://localhost:3000`** with all notes persisted in `./data`.

### Option 2: Local Build (Rust server)

**Requirements:** Rust stable (`rustup`), Node.js `>= 22` + npm (only to build the frontend)

```bash
npm install
npm run build          # builds the React frontend into dist/
cp .env.example .env
cargo run --release    # starts the Rust server with dist/ embedded
```

The release binary (`target/release/notika`) is fully self-contained — copy it anywhere and run it.

---

## ⚙️ Environment Variables (`.env`)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP server port |
| `DATA_DIR` | `./data` | Root directory for project folders and notes |
| `APP_PASSWORD` | `""` | Optional vault password. Leave empty to disable login screen |
| `AUTH_SECRET` | `""` | Secret key used to sign HTTP-only HMAC-SHA256 session cookies |

---

## 🤖 MCP Server Setup (Claude Desktop & Cursor)

Open **Settings** at the bottom of the Notika sidebar to enable/disable MCP, copy your Bearer token, or copy the ready-to-use JSON snippet:

```json
{
  "mcpServers": {
    "notika": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_TOKEN"
      }
    }
  }
}
```

### Exposed MCP Tools
- `list_projects` — List all project folders and note counts
- `list_notes` — List `.md` and `.txt` notes inside a project
- `read_note` — Read full content and metadata of a note
- `create_note` — Create a new note inside a project
- `update_note` — Update/save a note directly to disk
- `search_notes` — Full-text search across all projects and notes

---

## 🔌 REST API & Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl / Cmd + K` | Open global quick search modal |
| `Ctrl / Cmd + S` | Save active note immediately |
| `Tab` | Insert 2-space indent in Markdown editor |
| `Esc` | Close active modal or inline rename |

<details>
<summary><strong>View REST API Endpoints</strong></summary>

- `GET /api/health` — Health status
- `GET /api/auth/status`, `POST /api/auth/login`, `POST /api/auth/logout` — Session auth
- `GET /api/tree` — Full project & note tree
- `POST /api/projects`, `PATCH /api/projects/:name`, `DELETE /api/projects/:name` — Project CRUD
- `GET /api/notes`, `POST /api/notes`, `PUT /api/notes`, `PATCH /api/notes/rename`, `DELETE /api/notes` — Note CRUD
- `GET /api/search?q=...` — Full-text vault search
- `GET /api/shares`, `POST /api/shares`, `PATCH /api/shares/:code`, `DELETE /api/shares/:code` — Share & invite management
- `GET /api/public/share/:code`, `PUT /api/public/share/:code` — Public shared note access
- `GET /api/settings`, `PATCH /api/settings`, `POST /api/settings/regenerate-mcp-token` — MCP & app settings
- `POST /api/mcp`, `GET /api/mcp` — JSON-RPC 2.0 MCP server

</details>

---

## 📁 Project Structure

```text
notika/
├── src-server/        # 🦀 Rust backend (Axum + Tokio)
│   ├── main.rs        # Entrypoint: env config, router, embedded SPA
│   ├── auth.rs        # HMAC-SHA256 cookie auth & timing-safe password check
│   ├── mcp.rs         # JSON-RPC 2.0 Model Context Protocol endpoint
│   ├── routes/        # Axum REST endpoints
│   ├── shares.rs      # Short share links, collaborator invites & MCP settings
│   ├── vault.rs       # Filesystem CRUD, path-traversal guard & starter Notika seed
│   └── models/        # Serde data contracts & frontmatter parsing
├── server/            # Legacy TypeScript server (reference only)
├── client/
│   ├── components/    # Sidebar, VaultOverview, EditorWorkspace, NormalRichEditor, ShareInviteModal, SettingsModal, SharedNoteView
│   ├── i18n/          # 10-language translation dictionary (TR, EN, DE, FR, ES, PT, RU, AR, JA, ZH)
│   ├── lib/           # Typed API client & bidirectional Markdown <-> HTML converter
│   └── types/         # Strict TypeScript frontend types
├── docs/
│   ├── i18n/          # 10 localized README files
│   └── images/        # Documentation screenshots & diagrams
├── Cargo.toml         # Rust crate manifest
├── server.ts          # Legacy Express entrypoint (reference only)
├── Dockerfile         # Multi-stage production container
├── docker-compose.yml # Persistent volume self-host configuration
└── LICENSE            # MIT License
```

---

## 🤝 Contributing

Contributions, bug reports, and feature requests are welcome! Feel free to open an issue or submit a pull request. Please ensure `cargo build`, `npm run lint` and `npm run build` pass.

## 📄 License

Licensed under the **[MIT License](./LICENSE)** — Copyright (c) 2026 Notika Contributors.

---

<sub>**Keywords:** `obsidian-alternative` · `self-hosted-notes` · `local-first` · `markdown-editor` · `rich-text-editor` · `model-context-protocol` · `mcp-server` · `claude-desktop` · `cursor-mcp` · `filesystem-vault` · `open-source` · `rust` · `axum` · `typescript` · `react` · `docker` · `short-share-links` · `mit-license`</sub>

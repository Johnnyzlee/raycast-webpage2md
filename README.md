# Capture webpage as .md

A Raycast extension that saves the active browser page as a Markdown file with images stored locally, then copies the file to your clipboard.

## Why

AI agents often fail to read web pages because of anti-scraping measures — WeChat articles especially. Instead of printing a page to PDF and uploading it, this command captures the page open in your browser and hands it to any agent as a Markdown file, in one key press.

## Features

- One key press: capture the active browser page → Markdown file lands on your clipboard
- Article-aware extraction with a dedicated path for WeChat articles, falling back to Readability, `<article>`, then the whole page
- Keeps title, author, publish time, and canonical URL in YAML front matter
- Downloads images locally into an `assets/` folder (25 MB per image, 150 MB total, up to 4 parallel downloads; failures keep their remote URLs)
- Saves a cleaned `source.html` next to the Markdown for reference
- `no-view` command: runs in the background and confirms with a HUD toast

## Requirements

- macOS with Raycast installed and signed in
- Node.js 18 or later
- [Raycast Browser Extension](https://raycast.com/browser-extension) installed in your browser — the command reads the page through it; without it the command fails

## Installation

The extension is not published to the Raycast Store yet, so install it locally:

```bash
git clone https://github.com/Johnnyzlee/raycast-webpage2md.git
cd raycast-webpage2md
npm install
npm run dev
```

Raycast imports the extension and it appears at the top of root search. Press `Ctrl+C` to stop the dev server — the extension stays installed.

## Usage

1. Open the page you want to capture in your browser.
2. Run **Capture webpage as .md for lzengan** from Raycast.
3. Paste the copied Markdown wherever you need it — an AI agent, your notes, anywhere.

## Output

Files are saved under `~/Raycast/Raycast WebClips/YYYY-MM-DD/<url-hash>/`:

```
Raycast WebClips/
└── 2026-08-16/
    └── a1b2c3d4e5/            # first 10 chars of the page URL's SHA-256
        ├── 深入浅出讲清网络编码.md
        ├── assets/
        │   ├── 001.png
        │   ├── 002.jpg
        │   └── 003.webp
        └── source.html
```

The Markdown file starts with YAML front matter and a header:

```markdown
---
title: "深入浅出讲清网络编码"
source: "https://mp.weixin.qq.com/s/xxxx"
author: "某技术公众号"
published: "2026-08-15"
captured: "2026-08-16T03:12:45.000Z"
extraction: wechat
local_images: 3
remote_images: 0
---

# 深入浅出讲清网络编码

原文：<https://mp.weixin.qq.com/s/xxxx>

作者：某技术公众号

发布时间：2026-08-15

正文…
```

- `extraction` records which method was used: `wechat`, `readability`, `article`, or `body`
- Images that fail to download keep their original remote URLs in the Markdown

## Development

- `npm run dev` — start the extension in development mode in Raycast (hot reload, error overlays, terminal logs); press `Ctrl+C` to stop, the extension stays installed
- `npm run build` — validate the extension for distribution; only needed when submitting to the Raycast Store
- `npm run lint` — run lint checks

## Customizing the name

The command ships with a personal suffix so it is easy to find in Raycast. To rename it for your own use:

1. In `package.json`, change the command `name` (the extension-level `title` is only the display name) to your preferred identifier, e.g. `capture-webpage-as-md-for-you`, and update the two `title` fields accordingly.
2. Rename `src/capture-webpage-as-md-for-lzengan.ts` to match the new command `name`.
3. Update the `raycast-env.d.ts` type names and comments, or run `npm run build` once to regenerate it from the manifest.

## License

MIT

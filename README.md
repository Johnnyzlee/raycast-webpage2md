<div align="center">

<h1>Webpage to Markdown</h1>
<p>Capture browser articles as Markdown with local images.</p>
<p><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>
<p><a href="#installation">Installation</a> · <a href="#usage">Usage</a> · <a href="#architecture">Architecture</a> · <a href="#data-handling">Data handling</a> · <a href="#development">Development</a></p>
<sub>macOS · Raycast · Local processing · MIT License</sub>

</div>

---

Raycast command: **Capture webpage as .md for lzengan**. This is an on-demand macOS Raycast extension, not an AI Command or a background crawling service. **No API key or model call is needed. It does not automatically upload pages to an AI service.**

## Why this project

A webpage that is readable in a browser may still be inaccessible to an AI tool or automated fetcher. Authentication, client-side rendering, and access restrictions make a URL alone an unreliable way to share reading material, particularly for WeChat articles.

This command obtains the HTML exposed by Raycast Browser Extension, extracts the article locally, converts it to Markdown, downloads images, and places the resulting file on the clipboard. It avoids manually copying text, saving images individually, or printing the page to PDF first.

The goal is a **readable, reusable local document**. It does not summarize with AI or promise a complete offline website archive. It cannot replace login, paid access, or content that has not loaded.

## Features

| Need | Result |
| --- | --- |
| Save an article | Markdown preserving supported headings, lists, links, code blocks, and tables |
| Keep illustrations | Downloadable images in `assets/`, referenced from the document |
| Retain provenance | Title, author, publication information, source URL, capture time, and extraction method |
| Hand it to another app | A `.md` **file** on the clipboard, for apps accepting file pastes |
| Retain the source | The original browser-supplied HTML in `source.html`, alongside the processed Markdown |

Best suited to articles, blogs, tutorials, and WeChat article bodies. Read the output in an editor, add it to a personal library, or deliberately share it with an AI after reviewing its contents.

## Architecture

```text
Open browser page
  → Browser Extension returns HTML and tab information
  → Extract article content and metadata
  → Clean elements, normalize links, try to save images
  → Generate Markdown and retain the original browser HTML
  → Write local files and copy the Markdown file to the clipboard
```

1. **Read the page.** Select the first active tab reported by `getTabs()`, validate its HTTP(S) URL, and request HTML with `getContent({ format: "html", tabId })`. The selected tab supplies both content and source URL; URL fragments are removed. With multiple browser windows, the first active tab is not guaranteed to be the frontmost window.
2. **Select the article.** Try WeChat's `#js_content` / `.rich_media_content`, Mozilla Readability, `<article>`, then `<body>`. If Readability throws, continue with the fallbacks. Author and publication metadata can come from visible elements, meta tags, `datetime`, or JSON-LD.
3. **Prepare content.** Resolve links, handle lazy images and `srcset` fallbacks, and convert supported background images once. Remove scripts, forms, media, hidden elements, event handlers, and JavaScript links from extracted content. Body fallback also removes common navigation and advertising elements. This processing applies to the Markdown source, not the preserved raw HTML.
4. **Localize images.** Deduplicate sources and use up to four workers. Download HTTP(S) images and decode supported inline `data:image` inputs into `assets/`, then write relative image references. Failed images retain their source references. All workers share a size budget, checked as chunks are read or inline data is decoded.
5. **Convert and save.** Use Turndown with its GFM plugin. Reserve a fresh directory atomically, save Markdown and the original `source.html`, and call `Clipboard.copy({ file: ... })`. Repeated or concurrent captures use separate directories. No automatic delivery to another application follows.

## Installation

Requirements: macOS, Raycast, a connected [Raycast Browser Extension](https://www.raycast.com/browser-extension) with page access, and **Node.js 22.22.2 or newer**. The project pins Raycast API 1.104.25. A compatible Node.js LTS version is recommended.

```sh
git clone https://github.com/Johnnyzlee/raycast-webpage2md.git
cd raycast-webpage2md
node --version
npm ci
npm run dev
```

Alternatively, choose **Code → Download ZIP** on GitHub, extract it, and run the npm commands in the directory containing `package.json`. Git is not required for the ZIP route.

Keep Raycast open until the development build succeeds and the command appears in search. Then press **Control-C** to stop the watcher. Normal use does not require a terminal or development process to remain running. This is a source installation, not a Raycast Store installation.

## Usage

1. Open the article in a supported browser and let it load. Scroll through relevant lazy-loaded content first if necessary.
2. Run **Capture webpage as .md for lzengan** in Raycast.
3. Wait for the success HUD; the Markdown file is now on the clipboard.
4. Paste it into an application accepting files, or open it from the output directory. For plain text, open the Markdown in an editor and copy its contents.

The default path uses the current user's home directory, not the author's machine:

```text
~/Raycast/Raycast WebClips/
└── 2026-11-19/                 # Local capture date
    └── a1b2c3d4e5f67890/      # First 16 characters of the source URL's SHA-256
        ├── Article title.md
        ├── source.html         # Original HTML returned by the browser
        └── assets/
            ├── 001.png
            └── 002.jpg
```

When a URL has already been captured that day, a time suffix and, if needed, a counter distinguish subsequent captures. Existing clips are never reused or overwritten. `source.html` is the original HTML returned by the browser; its links, scripts, and remote assets are not rewritten. It is a source snapshot, not a complete offline website archive.

YAML front matter records `title`, `source`, `author`, `published`, `captured`, `extraction`, `local_images`, and `remote_images`. Author and publication information come from the page; they may be absent or inaccurate and are not independently verified.

**Saved images use relative paths such as `assets/001.png`.** Move or share the complete article folder to retain those references. Pasting only the `.md` file does not include its images, and a cloud AI may not resolve companion files automatically. The command does not create an archive or upload attachments.

## Data handling

| Operation | Destination |
| --- | --- |
| Obtain content | Current HTML and tab metadata through Raycast Browser Extension |
| Extract and convert | Local extension process; no model or author-operated server |
| Download images | Original image hosts/CDNs, with a User-Agent and page `Referer`; the code does not read or copy browser cookies |
| Save results | Local WebClips directory; a Markdown file reference on the clipboard |
| Send to AI or sync storage | Your later sharing actions or another app, not this extension automatically |

Private page content, source-URL query parameters, text, and images may enter output files. The raw `source.html` also retains the original scripts and hidden markup; it is not sanitized. HTML cleanup is not sensitive-data removal. Image hosts receive ordinary network request information and the `Referer`. Review output before sharing, especially for authenticated pages.

Clips remain after the command exits. Delete an article folder when no longer needed; doing so can invalidate clipboard references and image paths.

## Scope and limitations

- Limited to HTML actually supplied by the browser extension. No automatic scrolling, pagination, expanding hidden content, or CAPTCHA solving. Browser PDF viewers, canvas content, video, and complex interactive pages are not the primary target.
- Conversion needs no AI subscription or DeepSeek key, but Raycast and its browser integration must be available.
- With multiple windows, check that the selected active tab is the intended page. HTML is pinned to that tab, but tab ordering does not guarantee the frontmost window.
- Per-image checks allow up to 25 MiB; HTTP requests time out after 30 seconds. Authentication, hotlink protection, temporary URLs, or unsupported formats can prevent localization.
- The 150 MiB shared budget counts accepted HTTP chunks and decoded inline images, including data from downloads that later fail. Oversized images are rejected before writing. Network/runtime buffering can receive additional bytes before cancellation; this is not a strict network traffic cap.
- Valid short notes are supported; an empty extracted document is rejected. Path/permission errors or interrupted writes can still leave partial output directories.
- Extraction, tables, formulas, and metadata can lose details. Compare important material with the page. Automated tests cover representative extraction and failure paths, not every website.

## Development

```sh
git pull --ff-only             # Git clones only
npm ci
npm run typecheck
npm test
npm audit
npm run build                 # Current script exports to dist/ for build checks
npm run test:bundle
npm run dev                   # Sync the update into Raycast
```

Stop the watcher after a successful development build. To change the display name, edit `commands[0].title` in `package.json`. Changing `commands[0].name` also requires renaming the source entry file. Regenerate `raycast-env.d.ts` with Raycast tooling rather than editing generated types manually.

Implementation is in [src/capture-webpage-as-md-for-lzengan.ts](src/capture-webpage-as-md-for-lzengan.ts): `extractMetadata` reads provenance, `extractPage` selects content, `normalizeDocumentUrls` prepares links and images, `localizeImages` saves assets, `buildMarkdown` converts the article, and `capture` coordinates the workflow. `OUTPUT_ROOT` controls storage.

The regression suite runs the actual command and parsing libraries against synthetic pages, with a temporary home directory and mocked Raycast/network interfaces. It covers extraction and error fallbacks, metadata, relative image paths, inline images, one-time background conversion, stream limits, same-second/concurrent captures, filename limits, and clipboard behavior. It does not access your browser or clipboard. Real browser permissions and site-specific rendering still require a manual check.

### Upgrading an earlier installation

The extension identifier is now `webpage-capture-for-lzengan`, matching the maintained local implementation. The command name and displayed title remain unchanged. If you installed the earlier public identifier `wechat-article-capture`, `npm run dev` installs the unified identifier separately. Verify the new command, then remove the older entry through Raycast Settings if both are listed. Existing WebClips are not migrated or deleted; the new version uses local-date folders and 16-character URL hashes.

Keep the Git checkout as the source of truth. Edit and build from that directory; files under `~/.config/raycast/extensions/` are generated installation output.

The lockfile contains the security updates. Scoped overrides keep `esbuild` at `0.28.2` under the Raycast SDK and `minimatch` at `11.0.9` under `@oclif/core`, while retaining Raycast SDK 1.x. See [dependency maintenance](docs/dependencies.md) for the rationale and verification record. Use `npm ci` to reproduce the reviewed dependency tree.

## License

[MIT License](LICENSE). A personal project, not affiliated with Raycast or the content providers. Access permissions and copyright of captured material still apply.

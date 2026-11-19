# Webpage to Markdown for Raycast

**Save the webpage you are reading as a Markdown file with local images, ready for your own notes or an AI reading workflow.**

[简体中文 — primary documentation](README.md) · English

Raycast command: **Capture webpage as .md for lzengan**. This is an on-demand macOS Raycast extension, not an AI Command or a background crawling service. **No API key or model call is needed. It does not automatically upload pages to an AI service.**

## Why I built it

I often give webpages to AI agents for reading and discussion, but a URL alone may not work. Sites can restrict automated access; WeChat articles are a frequent example. The content is already open in my browser, yet the agent cannot retrieve it.

This command obtains the HTML exposed by Raycast Browser Extension, extracts the article locally, converts it to Markdown, downloads images, and places the resulting file on the clipboard. It avoids manually copying text, saving images individually, or printing the page to PDF first.

The goal is a **readable, reusable local document**. It does not summarize with AI or promise a complete offline website archive. It cannot replace login, paid access, or content that has not loaded.

## What you get

| Need | Result |
| --- | --- |
| Save an article | Markdown preserving supported headings, lists, links, code blocks, and tables |
| Keep illustrations | Downloadable images in `assets/`, referenced from the document |
| Retain provenance | Title, author, publication information, source URL, capture time, and extraction method |
| Hand it to another app | A `.md` **file** on the clipboard, for apps accepting file pastes |
| Inspect extracted content | A cleaned article `source.html` alongside the Markdown |

Best suited to articles, blogs, tutorials, and WeChat article bodies. Read the output in an editor, add it to a personal library, or deliberately share it with an AI after reviewing its contents.

## What the program actually does

```text
Open browser page
  → Browser Extension returns HTML and tab information
  → Extract article content and metadata
  → Clean elements, normalize links, try to save images
  → Generate Markdown and article HTML
  → Write local files and copy the Markdown file to the clipboard
```

1. **Read the page.** Call `BrowserExtension.getContent({ format: "html" })` and `getTabs()`. Prefer the page's canonical/`og:url` metadata for the source URL, otherwise use an active tab. Multiple windows or matching titles can make this ambiguous.
2. **Select the article.** Try WeChat's `#js_content` / `.rich_media_content`, Mozilla Readability, `<article>`, then `<body>`. Record the method in the Markdown.
3. **Prepare content.** Remove scripts, forms, navigation, audio/video, and other elements; handle common lazy-image attributes and some background images; resolve relative links; strip most unrelated attributes. This is article cleanup, not complete security sanitization or website reconstruction.
4. **Localize images.** Deduplicate sources, handle HTTP(S) and decodable `data:` images, and use up to four workers. Keep the original source when localization fails.
5. **Convert and save.** Use Turndown with its GFM plugin, write files, and call `Clipboard.copy({ file: ... })`. Display image counts in a HUD. No automatic delivery to another application follows.

## Installation

Requirements: macOS, Raycast, a connected [Raycast Browser Extension](https://www.raycast.com/browser-extension) with page access, and **Node.js 22.22.2 or newer**. The lockfile uses Raycast API 1.104.24. A compatible Node.js LTS version is recommended.

```sh
git clone https://github.com/Johnnyzlee/raycast-webpage2md.git
cd raycast-webpage2md
node --version
npm ci
npm run dev
```

Alternatively, choose **Code → Download ZIP** on GitHub, extract it, and run the npm commands in the directory containing `package.json`. Git is not required for the ZIP route.

Keep Raycast open until the development build succeeds and the command appears in search. Then press **Control-C** to stop the watcher. Normal use does not require a terminal or development process to remain running. This is a source installation, not a Raycast Store installation.

## Usage and output

1. Open the article in a supported browser and let it load. Scroll through relevant lazy-loaded content first if necessary.
2. Run **Capture webpage as .md for lzengan** in Raycast.
3. Wait for the success HUD; the Markdown file is now on the clipboard.
4. Paste it into an application accepting files, or open it from the output directory. For plain text, open the Markdown in an editor and copy its contents.

The default path uses the current user's home directory, not the author's machine:

```text
~/Raycast/Raycast WebClips/
└── 2026-11-19/                 # UTC capture date
    └── a1b2c3d4e5/            # First 10 characters of the source URL's SHA-256
        ├── Article title.md
        ├── source.html         # Cleaned article, not the entire original page
        └── assets/
            ├── 001.png
            └── 002.jpg
```

When a directory for the URL already exists that day, the command tries a local-time suffix. Both Markdown and `source.html` contain processed article content and image references, not the page's complete interactive behavior.

YAML front matter records `title`, `source`, `author`, `published`, `captured`, `extraction`, `local_images`, and `remote_images`. Author and publication information come from the page; they may be absent or inaccurate and are not independently verified.

**The current public version uses absolute local paths for saved images.** This is convenient on the same Mac, but moving the folder, sharing only the `.md`, or uploading it to a cloud AI does not guarantee that images remain accessible. Share `assets/` too and rewrite image references to relative or recipient-accessible paths when needed. The command does not package attachments or embed every image automatically.

## Where data goes

| Operation | Destination |
| --- | --- |
| Obtain content | Current HTML and tab metadata through Raycast Browser Extension |
| Extract and convert | Local extension process; no model or author-operated server |
| Download images | Original image hosts/CDNs, with a User-Agent and page `Referer`; the code does not read or copy browser cookies |
| Save results | Local WebClips directory; a Markdown file reference on the clipboard |
| Send to AI or sync storage | Your later sharing actions or another app, not this extension automatically |

Private page content, source-URL query parameters, text, and images may enter output files. HTML cleanup is not sensitive-data removal. Image hosts receive ordinary network request information and the `Referer`. Review output before sharing, especially for authenticated pages.

Clips remain after the command exits. Delete an article folder when no longer needed; doing so can invalidate clipboard references and image paths.

## Scope and limitations

- Limited to HTML actually supplied by the browser extension. No automatic scrolling, pagination, expanding hidden content, or CAPTCHA solving. Browser PDF viewers, canvas content, video, and complex interactive pages are not the primary target.
- Conversion needs no AI subscription or DeepSeek key, but Raycast and its browser integration must be available.
- Multi-window content/metadata matching is not guaranteed. Check the resulting title and source URL.
- Per-image checks allow up to 25 MiB; HTTP requests time out after 20 seconds. Authentication, hotlink protection, temporary URLs, or unsupported formats can prevent localization.
- The 150 MiB cumulative budget applies to images **accepted into local references**. It is checked after downloading and writing, so it is not a strict network/disk cap; unreferenced files may remain in `assets/`.
- Second-level naming collisions, path/permission problems, or very short extracted content can cause failure. Partial output directories may remain.
- Extraction, tables, formulas, and metadata can lose details. Compare important material with the page. There is no automated test suite covering all websites.

## Maintenance

```sh
git pull --ff-only             # Git clones only
npm ci
npm exec tsc -- --noEmit
npm run build                 # Current script exports to dist/ for build checks
npm run dev                   # Sync the update into Raycast
```

Stop the watcher after a successful development build. To change the display name, edit `commands[0].title` in `package.json`. Changing `commands[0].name` also requires renaming the source entry file. Regenerate `raycast-env.d.ts` with Raycast tooling rather than editing generated types manually.

Implementation is in [src/capture-webpage-as-md-for-lzengan.ts](src/capture-webpage-as-md-for-lzengan.ts): `pageMetadata` collects metadata, `selectContent` chooses the body, `prepareContent` cleans it, `localizeImages` saves images, `toMarkdown` converts it, and `capture` coordinates the workflow. `OUTPUT_ROOT` controls storage.

Dependency, type, and build checks do not amount to live verification of every browser and website.

## A small Raycast reading toolkit

These projects work independently:

| Project | Purpose |
| --- | --- |
| **This project** | Turn an open webpage into local Markdown and images without AI |
| [DeepSeek PDF Summary](https://github.com/Johnnyzlee/raycast-deepseek-pdf-summary) | Generate a Chinese summary from PDF text and figures, then hand off to AI Chat |
| [DeepSeek Raycast Adapter](https://github.com/Johnnyzlee/raycast-deepseek-adapter) | Combine client tools, native web access, and visual file Q&A in one AI Chat |

The [personal Raycast workflow](https://johnnyzlee.github.io/blogs/arsenal/raycast-workflow.html) describes the wider setup.

## License

[MIT License](LICENSE). A personal project, not affiliated with Raycast or the content providers. Access permissions and copyright of captured material still apply.

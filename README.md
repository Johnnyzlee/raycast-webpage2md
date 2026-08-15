# Capture webpage as .md for lzengan

A Raycast extension that saves the active browser page as a Markdown file with local images, and copies the file to the clipboard.

## Why

AI agents often fail to read web pages because of anti-scraping measures (WeChat articles especially). This command turns the page open in your browser into a Markdown file in one key press, ready to hand straight to an agent.

## Requirements

- [Raycast Browser Extension](https://raycast.com/browser-extension) installed in your browser

## Usage

1. Open the page you want to capture in your browser.
2. Run **Capture webpage as .md for lzengan** from Raycast.
3. The generated Markdown file is copied to the clipboard; a HUD toast shows the result and image counts.

## Output

Files are saved under `~/Raycast/Raycast WebClips/YYYY-MM-DD/<url-hash>/`:

- `<title>.md` — Markdown with YAML front matter (title, source, author, published, captured, extraction method, image counts)
- `assets/` — locally downloaded images
- `source.html` — the cleaned page HTML

Content extraction prefers the article body (with a dedicated path for WeChat articles), falling back to Readability, then `<article>`, then the whole page.

## Development

```bash
npm install
npm run build
npm run dev
```

## License

MIT

# Capture webpage as .md for lzengan

A Raycast extension that saves the active browser page as a Markdown file with local images, and copies the file to the clipboard.

## Why

AI agents often fail to read web pages because of anti-scraping measures (WeChat articles especially). This command turns the page open in your browser into a Markdown file in one key press, ready to hand straight to an agent.

## Requirements

- macOS with Raycast installed and signed in
- Node.js 18 or later
- [Raycast Browser Extension](https://raycast.com/browser-extension) installed in your browser (the command reads the page through it; without it the command fails)

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

## Installation

The extension is not published to the Raycast Store yet; install it locally:

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/Johnnyzlee/raycast-webpage2md.git
   cd raycast-webpage2md
   npm install
   ```

2. Start it in development mode:

   ```bash
   npm run dev
   ```

   Raycast imports the extension and it appears at the top of root search. Press `Ctrl+C` in the terminal to stop the dev server; the extension stays installed.

3. Make sure the [Raycast Browser Extension](https://raycast.com/browser-extension) is installed in your browser, then run **Capture webpage as .md for lzengan**.

## Development

- `npm run dev` -- start the extension in development mode in Raycast (hot reload, error overlays, terminal logs). Press `Ctrl+C` to stop; the extension stays installed.
- `npm run build` -- validate the extension for distribution; only needed when submitting to the Raycast Store.
- `npm run lint` -- run lint checks.

## Customizing the name

The command ships with a personal suffix so it is easy to find in Raycast. To rename it for your own use:

1. In `package.json`, change the command `name` (the folder-level `title` is only the display name) to your preferred identifier, e.g. `capture-webpage-as-md-for-you` and the two `title` fields accordingly.
2. Rename `src/capture-webpage-as-md-for-lzengan.ts` to match the new command `name`.
3. Update the `raycast-env.d.ts` type names and comments, or run `npm run build` once to regenerate it from the manifest.

## License

MIT

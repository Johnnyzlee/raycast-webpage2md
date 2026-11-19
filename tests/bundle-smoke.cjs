// Verify the built artifact, or an explicitly supplied installed bundle, without
// touching the real browser, clipboard, or WebClips directory.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");

(async () => {
  const bundle = process.argv[2] || path.join(__dirname, "../dist/capture-webpage-as-md-for-lzengan.js");
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "webpage2md-bundle-"));
  try {
    const html =
      '<!doctype html><html><head><title>Bundle check</title></head><body><div id="js_content"><h2>Example</h2><p>A synthetic article to validate the installed command without accessing real user content.</p><div style="background-image:url(\'/figure.png\')">Figure</div><img src="data:image/png;base64,aGVsbG8=" alt="Inline"></div></body></html>';
    const copies = [],
      hud = [];
    const module = { exports: {} };
    vm.runInNewContext(
      await fs.readFile(bundle, "utf8"),
      {
        module,
        exports: module.exports,
        require: (name) =>
          name === "@raycast/api"
            ? {
                BrowserExtension: {
                  getTabs: async () => [
                    { id: 7, active: true, title: "Bundle check", url: "https://example.test/page" },
                  ],
                  getContent: async (options) => {
                    assert.equal(options.tabId, 7);
                    return html;
                  },
                },
                Clipboard: { copy: async (value) => copies.push(value.file) },
                showHUD: async (value) => hud.push(value),
              }
            : name === "node:os"
              ? { ...os, homedir: () => home }
              : require(name),
        Buffer,
        URL,
        AbortController,
        AbortSignal,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        setImmediate,
        clearImmediate,
        performance,
        TextEncoder,
        TextDecoder,
        console,
        fetch: async (url) => {
          assert.equal(url, "https://example.test/figure.png");
          return new Response("figure", { headers: { "Content-Type": "image/png" } });
        },
      },
      { filename: bundle },
    );
    await module.exports.default();
    assert.equal(copies.length, 1);
    assert.ok(copies[0].startsWith(home + path.sep));
    const markdown = await fs.readFile(copies[0], "utf8");
    assert.match(markdown, /local_images: 2\nremote_images: 0/);
    assert.equal((markdown.match(/!\[/g) || []).length, 2);
    assert.match(markdown, /\(assets\/001.png\)/);
    assert.match(markdown, /\(assets\/002.png\)/);
    assert.equal(await fs.readFile(path.join(path.dirname(copies[0]), "source.html"), "utf8"), html);
    assert.equal(await fs.readFile(path.join(path.dirname(copies[0]), "assets/002.png"), "utf8"), "hello");
    assert.match(hud.at(-1), /local 2.*remote 0/);
    console.log("Built command smoke test: PASS (mocked browser/network/clipboard; temporary home)");
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

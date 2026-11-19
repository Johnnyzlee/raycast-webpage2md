const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Execute the real command and real parsing libraries. Only the Raycast host,
// home directory, clock, and network are replaced; outputs go to a temporary home.
async function harness(t, { html, tabs, fetcher, readability, date = "2026-11-19T08:00:00Z" } = {}) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "webpage2md-test-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const state = {
    html: html ?? "",
    tabs: tabs ?? [
      {
        id: 1,
        active: true,
        title: "Test article",
        url: "https://example.test/articles/page",
      },
    ],
    contentOptions: [],
    copies: [],
    hud: [],
    requests: [],
    errors: [],
  };
  const source = await fs.readFile(
    path.join(__dirname, "../src/capture-webpage-as-md-for-lzengan.ts"),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const api = {
    BrowserExtension: {
      getContent: async (options) => {
        assert.equal(options.format, "html");
        state.contentOptions.push(options);
        return state.html;
      },
      getTabs: async () => state.tabs,
    },
    Clipboard: { copy: async (value) => state.copies.push(value) },
    showHUD: async (message) => state.hud.push(message),
  };
  class Clock extends Date {
    constructor(...args) {
      super(...(args.length ? args : [date]));
    }
    static now() {
      return new Date(date).getTime();
    }
  }
  const module = { exports: {} };
  vm.runInNewContext(
    compiled + "\nmodule.exports.testing = { downloadImage, createCaptureDirectory };",
    {
      module,
      exports: module.exports,
      require: (name) =>
        name === "@raycast/api"
          ? api
          : name === "node:os"
            ? { ...os, homedir: () => home }
            : name === "@mozilla/readability" && readability
              ? {
                  Readability: class {
                    parse() {
                      if (readability === "throw") throw new Error("fixture parse failure");
                      return null;
                    }
                  },
                }
              : require(name),
      Buffer,
      URL,
      AbortSignal,
      AbortController,
      setTimeout,
      clearTimeout,
      Date: Clock,
      console: {
        warn: (...args) => state.errors.push(args),
        error: (...args) => state.errors.push(args),
      },
      fetch: async (url, options) => {
        state.requests.push({ url, options });
        if (!fetcher) throw new Error(`Unexpected network access: ${url}`);
        return fetcher(url, options);
      },
    },
    { filename: "capture-command.cjs" },
  );
  return {
    state,
    home,
    run: () => module.exports.default(),
    testing: module.exports.testing,
    async output(index = state.copies.length - 1) {
      const file = state.copies[index]?.file;
      assert.ok(file, `Expected a copied file; HUD: ${state.hud.join("; ")}`);
      assert.ok(file.startsWith(home + path.sep));
      return {
        file,
        markdown: await fs.readFile(file, "utf8"),
        html: await fs.readFile(path.join(path.dirname(file), "source.html"), "utf8"),
        assets: path.join(path.dirname(file), "assets"),
      };
    },
  };
}

const wrap = (body, head = "") =>
  `<!doctype html><html><head><title>Test article</title>${head}</head><body>${body}</body></html>`;
const prose =
  "This article explains a practical workflow, its assumptions, and the evidence needed to understand the result. ";

test("WeChat capture preserves article structure, provenance, image bytes and file clipboard semantics", async (t) => {
  const png = Buffer.from("fixture-image-bytes");
  const h = await harness(t, {
    html: wrap(
      `<h1 id="activity-name">A practical guide</h1><span id="js_name">Example Author</span><span id="publish_time">2026-11-18</span>
      <div id="js_content"><h2>Overview</h2><p>${prose}<a href="../reference">Reference</a></p>
      <ul><li>First point</li><li>Second point</li></ul><pre><code>const answer = 42;</code></pre>
      <table><thead><tr><th>Item</th><th>Value</th></tr></thead><tbody><tr><td>Result</td><td>42</td></tr></tbody></table>
      <img data-src="/figure.png" alt="Figure"><img src="/figure.png" alt="Repeated figure">
      <img src="data:image/png;base64,${png.toString("base64")}" alt="Inline figure">
      <img src="/missing.png" alt="Missing figure"><nav>Navigation noise</nav><script>UNWANTED_SCRIPT</script><p hidden>Hidden noise</p></div>`,
      '<link rel="canonical" href="/articles/canonical">',
    ),
    fetcher: async (url, options) => {
      assert.equal(options.headers.Referer, "https://example.test/articles/page");
      assert.equal(options.headers.Cookie, undefined);
      assert.equal(options.headers.Authorization, undefined);
      return url.endsWith("/figure.png")
        ? new Response(png, { headers: { "Content-Type": "image/png" } })
        : new Response("missing", { status: 404 });
    },
  });
  await h.run();
  const out = await h.output();
  assert.equal(path.basename(out.file), "A practical guide.md");
  assert.match(out.markdown, /source: "https:\/\/example.test\/articles\/page"/);
  assert.match(out.markdown, /author: "Example Author"/);
  assert.match(out.markdown, /published: "2026-11-18"/);
  assert.match(out.markdown, /extraction: wechat/);
  assert.match(out.markdown, /local_images: 2\nremote_images: 1/);
  assert.match(out.markdown, /## Overview/);
  assert.match(out.markdown, /\[Reference\]\(https:\/\/example.test\/reference\)/);
  assert.match(out.markdown, /- +First point/);
  assert.match(out.markdown, /```[\s\S]*const answer = 42;[\s\S]*```/);
  assert.match(out.markdown, /\| Item \| Value \|/);
  assert.match(out.markdown, /https:\/\/example.test\/missing.png/);
  assert.equal(h.state.requests.length, 2, "duplicate image URLs are fetched once");
  assert.deepEqual(await fs.readFile(path.join(out.assets, "001.png")), png);
  assert.deepEqual(await fs.readFile(path.join(out.assets, "002.png")), png);
  assert.ok(out.markdown.includes("(assets/001.png)"));
  assert.equal(out.html, h.state.html, "source.html retains the original browser HTML");
  assert.doesNotMatch(out.markdown, /UNWANTED_SCRIPT|Hidden noise|data-src/);
  assert.equal(Object.keys(h.state.copies[0]).join(), "file");
  assert.match(h.state.hud.at(-1), /local 2.*remote 1/);
});

test("Readability extracts long articles and retains links without navigation", async (t) => {
  const h = await harness(t, {
    html: wrap(
      `<nav>Menu noise</nav><main><article><h1>Research notes</h1>${Array.from({ length: 5 }, (_, i) => `<p>${prose.repeat(4)} Section ${i}. <a href="/evidence">Evidence</a></p>`).join("")}</article></main><footer>Footer noise</footer>`,
    ),
  });
  await h.run();
  const out = await h.output();
  assert.match(out.markdown, /extraction: readability/);
  assert.match(out.markdown, /Research notes/);
  assert.match(out.markdown, /Section 4/);
  assert.match(out.markdown, /https:\/\/example.test\/evidence/);
  assert.doesNotMatch(out.markdown, /Menu noise|Footer noise/);
  assert.equal(h.state.requests.length, 0);
});

for (const tag of ["article", "section"]) {
  test(`short content uses ${tag === "article" ? "article" : "body"} fallback`, async (t) => {
    const h = await harness(t, {
      readability: "empty",
      html: wrap(`<${tag}><p>A concise page with enough content to be saved as a useful note.</p></${tag}>`),
    });
    await h.run();
    const out = await h.output();
    assert.match(out.markdown, new RegExp(`extraction: ${tag === "article" ? "article" : "body"}`));
    assert.match(out.markdown, /A concise page/);
  });
}

test("image failures keep source references and do not abort the article", async (t) => {
  const h = await harness(t, {
    html: wrap(
      `<div id="js_content"><p>${prose}</p><img src="/large.png"><img src="/login.png"><img src="file:///private/image.png"><img src="/network.png"><div style="background-image:url('/background.png')">Background</div></div>`,
    ),
    fetcher: async (url) => {
      if (url.endsWith("large.png"))
        return new Response("", {
          headers: {
            "Content-Length": String(26 * 1024 * 1024),
            "Content-Type": "image/png",
          },
        });
      if (url.endsWith("login.png"))
        return new Response("login", {
          headers: { "Content-Type": "text/html" },
        });
      if (url.endsWith("background.png"))
        return new Response("image", {
          headers: { "Content-Type": "image/png" },
        });
      throw new Error("network unavailable");
    },
  });
  await h.run();
  const out = await h.output();
  assert.match(out.markdown, /local_images: 1\nremote_images: 4/);
  assert.match(out.markdown, /https:\/\/example.test\/large.png/);
  assert.match(out.markdown, /https:\/\/example.test\/login.png/);
  assert.equal((await fs.readdir(out.assets)).length, 1);
  assert.equal(h.state.requests.length, 4, "file: image is never fetched");
});

test("repeat captures preserve the existing article and use a separate directory", async (t) => {
  const h = await harness(t, {
    html: wrap(`<div id="js_content"><p>${prose}First revision.</p></div>`),
  });
  await h.run();
  const first = await h.output();
  h.state.html = wrap(`<div id="js_content"><p>${prose}Second revision.</p></div>`);
  await h.run();
  const second = await h.output();
  assert.notEqual(path.dirname(first.file), path.dirname(second.file));
  assert.equal(await fs.readFile(first.file, "utf8"), first.markdown);
  assert.match(second.markdown, /Second revision/);
});

for (const [label, html, tabs] of [
  ["empty browser HTML", "", undefined],
  ["missing source URL", wrap(`<p>${prose}</p>`), []],
  ["empty extracted content", wrap("<script>unreadable()</script>"), undefined],
]) {
  test(`${label} reports failure without replacing clipboard contents`, async (t) => {
    const h = await harness(t, { html, tabs });
    await assert.rejects(h.run());
    assert.equal(h.state.copies.length, 0);
    assert.match(h.state.hud.at(-1), /^❌/);
  });
}

test("browser HTML is pinned to the selected tab and uses its actual URL", async (t) => {
  const h = await harness(t, {
    html: wrap(
      `<div id="js_content"><p>${prose}</p></div>`,
      '<link rel="canonical" href="https://unrelated.test/">',
    ),
    tabs: [
      { id: 7, active: true, title: "Selected tab", url: "https://example.test/selected#section" },
      { id: 8, active: true, title: "Test article", url: "https://other.test/" },
    ],
  });
  await h.run();
  assert.equal(h.state.contentOptions[0].tabId, 7);
  assert.match((await h.output()).markdown, /source: "https:\/\/example.test\/selected"/);
});

test("a background image appears once after the full extraction pipeline", async (t) => {
  const h = await harness(t, {
    html: wrap(
      `<div id="js_content"><p>${prose}</p><div style="background-image:url('/background.png')">Illustration</div></div>`,
    ),
    fetcher: async () => new Response("image", { headers: { "Content-Type": "image/png" } }),
  });
  await h.run();
  const out = await h.output();
  assert.equal((out.markdown.match(/!\[/g) || []).length, 1);
  assert.equal(h.state.requests.length, 1);
  assert.equal((await fs.readdir(out.assets)).length, 1);
});

test("same-second and concurrent captures claim distinct directories without overwriting", async (t) => {
  const h = await harness(t, { html: wrap(`<div id="js_content"><p>${prose}</p></div>`) });
  await Promise.all(Array.from({ length: 5 }, () => h.run()));
  assert.equal(h.state.copies.length, 5);
  assert.equal(new Set(h.state.copies.map((v) => v.file)).size, 5);
  for (let i = 0; i < 5; i++) assert.match((await h.output(i)).markdown, /practical workflow/);
  const first = await h.output(0);
  h.state.html = wrap(`<div id="js_content"><p>${prose}New revision.</p></div>`);
  await h.run();
  assert.equal(await fs.readFile(first.file, "utf8"), first.markdown);
  assert.match((await h.output()).markdown, /New revision/);
});

test("JSON-LD authors and machine-readable publication dates are retained", async (t) => {
  const h = await harness(t, {
    html: wrap(
      `<time datetime="2026-11-17">Yesterday</time><div id="js_content"><p>${prose}</p></div>`,
      '<script type="application/ld+json">{"@graph":[{"author":[{"name":"First Author"},{"name":"Second Author"}],"datePublished":"2026-11-16"}]}</script>',
    ),
  });
  await h.run();
  const out = await h.output();
  assert.match(out.markdown, /author: "First Author, Second Author"/);
  assert.match(out.markdown, /published: "2026-11-17"/);
});

test("srcset-only images and percent-encoded inline images become portable local assets", async (t) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>';
  const h = await harness(t, {
    html: wrap(
      `<div id="js_content"><p>${prose}</p><img data-srcset="/small.png 1x, /large.png 2x"><img src="data:image/svg+xml,${encodeURIComponent(svg)}"></div>`,
    ),
    fetcher: async () => new Response("image", { headers: { "Content-Type": "image/png" } }),
  });
  await h.run();
  const out = await h.output();
  assert.equal(h.state.requests[0].url, "https://example.test/large.png");
  assert.match(out.markdown, /local_images: 2\nremote_images: 0/);
  assert.match(out.markdown, /\(assets\/001.png\)/);
  assert.match(out.markdown, /\(assets\/002.svg\)/);
  assert.equal(await fs.readFile(path.join(out.assets, "002.svg"), "utf8"), svg);
  // Verify the references still resolve after moving the complete clip folder.
  const moved = path.join(h.home, "moved-clip");
  await fs.rename(path.dirname(out.file), moved);
  for (const match of out.markdown.matchAll(/!\[[^\]]*\]\((assets\/[^)]+)\)/g))
    assert.ok((await fs.stat(path.join(moved, match[1]))).isFile());
});

for (const tag of ["article", "section"]) {
  test(`Readability exceptions fall back to ${tag === "article" ? "article" : "body"}`, async (t) => {
    const h = await harness(t, { readability: "throw", html: wrap(`<${tag}><p>${prose}</p></${tag}>`) });
    await h.run();
    assert.match(
      (await h.output()).markdown,
      new RegExp(`extraction: ${tag === "article" ? "article" : "body"}`),
    );
  });
}

test("valid short notes are saved and unsafe link schemes are removed from Markdown", async (t) => {
  const h = await harness(t, {
    html: wrap('<article><p>Short note. <a href="javascript:alert(1)">Label</a></p></article>'),
  });
  await h.run();
  const out = await h.output();
  assert.match(out.markdown, /Short note/);
  assert.doesNotMatch(out.markdown, /javascript:/);
  assert.equal(out.html, h.state.html);
});

test("filenames remain within the byte limit for long Chinese titles", async (t) => {
  const h = await harness(t, {
    html: wrap(
      `<h1 id="activity-name">${"中文标题".repeat(50)}</h1><div id="js_content"><p>${prose}</p></div>`,
    ),
  });
  await h.run();
  const name = path.basename((await h.output()).file);
  assert.ok(Buffer.byteLength(name) <= 184);
  assert.ok(!name.includes("�"));
});

test("capture directory follows the local calendar date and uses a 16-character URL hash", async (t) => {
  const h = await harness(t, {
    date: "2026-11-18T17:00:00Z",
    html: wrap(`<div id="js_content"><p>${prose}</p></div>`),
  });
  await h.run();
  const out = await h.output();
  const instant = new Date("2026-11-18T17:00:00Z");
  const expected = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  assert.equal(path.basename(path.dirname(path.dirname(out.file))), expected);
  assert.match(path.basename(path.dirname(out.file)), /^[a-f0-9]{16}$/);
});

async function imageDirectory(h) {
  const directory = path.join(h.home, "images");
  await fs.mkdir(directory);
  return directory;
}

test("streaming rejects a chunk crossing the per-image limit before writing a file", async (t) => {
  let reads = 0,
    cancelled = false;
  const chunk = new Uint8Array(13 * 1024 * 1024);
  const h = await harness(t, {
    fetcher: async () =>
      new Response(
        new ReadableStream(
          {
            pull(c) {
              reads++;
              c.enqueue(chunk);
            },
            cancel() {
              cancelled = true;
            },
          },
          { highWaterMark: 0 },
        ),
        { headers: { "Content-Type": "image/png" } },
      ),
  });
  const directory = await imageDirectory(h),
    budget = { used: 0 };
  const result = await h.testing.downloadImage(
    "https://example.test/large.png",
    "https://example.test",
    directory,
    0,
    budget,
  );
  assert.match(result.error, /size limit/);
  assert.equal(reads, 2);
  assert.equal(cancelled, true);
  assert.equal(budget.used, chunk.length);
  assert.deepEqual(await fs.readdir(directory), []);
});

test("HTTP and inline images share the cumulative budget and fail without partial assets", async (t) => {
  let cancelled = false;
  const h = await harness(t, {
    fetcher: async () =>
      new Response(
        new ReadableStream(
          {
            pull(c) {
              c.enqueue(new Uint8Array(4));
            },
            cancel() {
              cancelled = true;
            },
          },
          { highWaterMark: 0 },
        ),
        { headers: { "Content-Type": "image/png" } },
      ),
  });
  const directory = await imageDirectory(h),
    budget = { used: 150 * 1024 * 1024 - 3 };
  const initial = budget.used;
  const remote = await h.testing.downloadImage(
    "https://example.test/image.png",
    "https://example.test",
    directory,
    0,
    budget,
  );
  const inline = await h.testing.downloadImage(
    "data:image/png;base64,YWJjZA==",
    "https://example.test",
    directory,
    1,
    budget,
  );
  assert.ok(remote.error);
  assert.ok(inline.error);
  assert.equal(cancelled, true);
  assert.equal(budget.used, initial);
  assert.deepEqual(await fs.readdir(directory), []);
});

test("invalid inline data and unsupported page protocols fail without network requests", async (t) => {
  const h = await harness(t, {
    html: wrap(`<div id="js_content"><p>${prose}</p><img src="data:image/png;base64,!!!"></div>`),
  });
  await h.run();
  assert.match((await h.output()).markdown, /local_images: 0\nremote_images: 1/);
  h.state.tabs = [{ id: 1, active: true, title: "File", url: "file:///private/page.html" }];
  await assert.rejects(h.run(), /Unsupported page/);
  assert.equal(h.state.requests.length, 0);
});

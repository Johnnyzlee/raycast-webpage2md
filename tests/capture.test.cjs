const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Execute the real command and real parsing libraries. Only the Raycast host,
// home directory, clock, and network are replaced; outputs go to a temporary home.
async function harness(t, { html, tabs, fetcher } = {}) {
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
        return state.html;
      },
      getTabs: async () => state.tabs,
    },
    Clipboard: { copy: async (value) => state.copies.push(value) },
    showHUD: async (message) => state.hud.push(message),
  };
  class Clock extends Date {
    constructor(...args) {
      super(...(args.length ? args : ["2026-11-19T08:00:00Z"]));
    }
    static now() {
      return new Date("2026-11-19T08:00:00Z").getTime();
    }
  }
  const module = { exports: {} };
  vm.runInNewContext(
    compiled,
    {
      module,
      exports: module.exports,
      require: (name) =>
        name === "@raycast/api"
          ? api
          : name === "node:os"
            ? { ...os, homedir: () => home }
            : require(name),
      Buffer,
      URL,
      AbortSignal,
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
    async output(index = state.copies.length - 1) {
      const file = state.copies[index]?.file;
      assert.ok(file, `Expected a copied file; HUD: ${state.hud.join("; ")}`);
      assert.ok(file.startsWith(home + path.sep));
      return {
        file,
        markdown: await fs.readFile(file, "utf8"),
        html: await fs.readFile(
          path.join(path.dirname(file), "source.html"),
          "utf8",
        ),
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
      assert.equal(
        options.headers.Referer,
        "https://example.test/articles/canonical",
      );
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
  assert.match(
    out.markdown,
    /source: "https:\/\/example.test\/articles\/canonical"/,
  );
  assert.match(out.markdown, /author: "Example Author"/);
  assert.match(out.markdown, /published: "2026-11-18"/);
  assert.match(out.markdown, /extraction: wechat/);
  assert.match(out.markdown, /local_images: 2\nremote_images: 1/);
  assert.match(out.markdown, /## Overview/);
  assert.match(
    out.markdown,
    /\[Reference\]\(https:\/\/example.test\/reference\)/,
  );
  assert.match(out.markdown, /- +First point/);
  assert.match(out.markdown, /```[\s\S]*const answer = 42;[\s\S]*```/);
  assert.match(out.markdown, /\| Item \| Value \|/);
  assert.match(out.markdown, /https:\/\/example.test\/missing.png/);
  assert.equal(
    h.state.requests.length,
    2,
    "duplicate image URLs are fetched once",
  );
  assert.deepEqual(await fs.readFile(path.join(out.assets, "001.png")), png);
  assert.deepEqual(await fs.readFile(path.join(out.assets, "002.png")), png);
  assert.ok(out.markdown.includes(path.join(out.assets, "001.png")));
  assert.doesNotMatch(
    out.html,
    /UNWANTED_SCRIPT|Navigation noise|Hidden noise|data-src/,
  );
  assert.equal(Object.keys(h.state.copies[0]).join(), "file");
  assert.match(h.state.hud.at(-1), /本地图片 2 张.*远程图片 1 张/);
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
      html: wrap(
        `<${tag}><p>A concise page with enough content to be saved as a useful note.</p></${tag}>`,
      ),
    });
    await h.run();
    const out = await h.output();
    assert.match(
      out.markdown,
      new RegExp(`extraction: ${tag === "article" ? "article" : "body"}`),
    );
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
  h.state.html = wrap(
    `<div id="js_content"><p>${prose}Second revision.</p></div>`,
  );
  await h.run();
  const second = await h.output();
  assert.notEqual(path.dirname(first.file), path.dirname(second.file));
  assert.equal(await fs.readFile(first.file, "utf8"), first.markdown);
  assert.match(second.markdown, /Second revision/);
});

for (const [label, html, tabs] of [
  ["empty browser HTML", "", undefined],
  ["missing source URL", wrap(`<p>${prose}</p>`), []],
  ["insufficient content", wrap("<p>Short.</p>"), undefined],
]) {
  test(`${label} reports failure without replacing clipboard contents`, async (t) => {
    const h = await harness(t, { html, tabs });
    await h.run();
    assert.equal(h.state.copies.length, 0);
    assert.match(h.state.hud.at(-1), /^❌/);
  });
}

test("matching active tab supplies source when no canonical URL exists", async (t) => {
  const h = await harness(t, {
    html: wrap(`<div id="js_content"><p>${prose}</p></div>`),
    tabs: [
      { id: 1, active: true, title: "Other page", url: "https://other.test/" },
      {
        id: 2,
        active: true,
        title: "Test article",
        url: "https://example.test/matching",
      },
    ],
  });
  await h.run();
  assert.match(
    (await h.output()).markdown,
    /source: "https:\/\/example.test\/matching"/,
  );
});

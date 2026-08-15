import { BrowserExtension, Clipboard, showHUD } from "@raycast/api";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const OUTPUT_ROOT = path.join(homedir(), "Raycast", "Raycast WebClips");
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 150 * 1024 * 1024;

type PageMetadata = {
  title: string;
  author: string;
  published: string;
  url: string;
};

type DownloadResult = {
  localPath?: string;
  byteLength: number;
};

type ExtractionMethod = "wechat" | "readability" | "article" | "body";

type ContentSelection = {
  root: Element;
  method: ExtractionMethod;
  title?: string;
  author?: string;
};

function compactText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function safeFilename(value: string, limit = 100): string {
  const withoutControlCharacters = Array.from(
    compactText(value),
    (character) => (character.charCodeAt(0) < 32 ? "-" : character),
  ).join("");
  const cleaned = withoutControlCharacters
    .replace(/[/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[ .-]+|[ .-]+$/g, "");

  return (cleaned || "网页").slice(0, limit).replace(/[ .-]+$/g, "");
}

function selectorText(document: Document, selectors: string[]): string {
  for (const selector of selectors) {
    const value = compactText(document.querySelector(selector)?.textContent);
    if (value) return value;
  }
  return "";
}

function metaContent(document: Document, selectors: string[]): string {
  for (const selector of selectors) {
    const value = compactText(
      document.querySelector<HTMLMetaElement>(selector)?.content,
    );
    if (value) return value;
  }
  return "";
}

function absoluteUrl(value: string, pageUrl: string): string {
  try {
    return new URL(value, pageUrl).href;
  } catch {
    return value;
  }
}

function pageMetadata(
  document: Document,
  tabs: BrowserExtension.Tab[],
): PageMetadata {
  const title =
    selectorText(document, [
      "#activity-name",
      "h1.rich_media_title",
      "article h1",
      "main h1",
    ]) ||
    metaContent(document, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
    ]) ||
    compactText(document.title) ||
    "网页";

  const canonical =
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ||
    document.querySelector<HTMLMetaElement>('meta[property="og:url"]')
      ?.content ||
    "";

  const activeTabs = tabs.filter((tab) => tab.active);
  const matchingTab =
    activeTabs.find(
      (tab) => compactText(tab.title) === compactText(document.title),
    ) || activeTabs[0];

  const pageUrl = matchingTab?.url || "";

  return {
    title,
    author:
      selectorText(document, [
        "#js_name",
        ".rich_media_meta_nickname",
        "#profileBt .profile_nickname",
        '[data-role="author"]',
        '[rel="author"]',
      ]) ||
      metaContent(document, [
        'meta[name="author"]',
        'meta[property="article:author"]',
        'meta[name="byl"]',
      ]),
    published:
      selectorText(document, [
        "#publish_time",
        ".rich_media_meta_text",
        "time[datetime]",
        "time",
      ]) ||
      metaContent(document, [
        'meta[property="article:published_time"]',
        'meta[name="datePublished"]',
        'meta[name="date"]',
        'meta[name="pubdate"]',
      ]),
    url: canonical ? absoluteUrl(canonical, pageUrl) : pageUrl,
  };
}

function selectContent(
  html: string,
  document: Document,
  pageUrl: string,
): ContentSelection | null {
  const wechatRoot =
    document.querySelector("#js_content") ||
    document.querySelector(".rich_media_content");
  if (wechatRoot) return { root: wechatRoot, method: "wechat" };

  try {
    const { document: readabilityDocument } = parseHTML(html);
    if (pageUrl) {
      const base = readabilityDocument.createElement("base");
      base.setAttribute("href", pageUrl);
      readabilityDocument.head?.prepend(base);
    }

    const article = new Readability(
      readabilityDocument as unknown as Document,
    ).parse();
    if (article?.content && compactText(article.textContent).length >= 80) {
      const { document: articleDocument } = parseHTML(
        '<!doctype html><html><body><article id="captured-content"></article></body></html>',
      );
      const root = articleDocument.querySelector("#captured-content");
      if (root) {
        root.innerHTML = article.content;
        return {
          root,
          method: "readability",
          title: compactText(article.title),
          author: compactText(article.byline),
        };
      }
    }
  } catch (error) {
    console.warn("Readability extraction failed; using page fallback", error);
  }

  const articleRoot = document.querySelector("article");
  if (articleRoot) return { root: articleRoot, method: "article" };

  if (document.body) return { root: document.body, method: "body" };
  return null;
}

function prepareContent(root: Element, pageUrl: string): HTMLImageElement[] {
  root
    .querySelectorAll(
      'script, style, noscript, iframe, form, button, input, textarea, select, video, audio, nav, footer, aside, dialog, [hidden], [aria-hidden="true"]',
    )
    .forEach((element) => element.remove());

  root.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    const style = element.getAttribute("style") ?? "";
    const match = style.match(
      /(?:background-image|background)\s*:[^;]*url\(["']?([^"')]+)["']?\)/i,
    );

    if (match?.[1] && !element.querySelector("img")) {
      const image = root.ownerDocument.createElement("img");
      image.src = absoluteUrl(match[1], pageUrl);
      image.alt = compactText(element.textContent) || "网页图片";
      element.insertBefore(image, element.firstChild);
    }
  });

  const images = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
  images.forEach((image, index) => {
    const source =
      image.getAttribute("data-src") ||
      image.getAttribute("data-lazy-src") ||
      image.getAttribute("data-original") ||
      image.getAttribute("data-original-src") ||
      image.getAttribute("data-backsrc") ||
      image.getAttribute("src") ||
      "";

    if (source) image.setAttribute("src", absoluteUrl(source, pageUrl));
    if (!image.getAttribute("alt"))
      image.setAttribute("alt", `网页图片 ${index + 1}`);
  });

  root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => {
    const href = link.getAttribute("href") ?? "";
    if (!href || /^javascript:/i.test(href)) {
      link.removeAttribute("href");
    } else {
      link.setAttribute("href", absoluteUrl(href, pageUrl));
    }
  });

  return images;
}

function extensionFor(contentType: string, sourceUrl: string): string {
  const mime = contentType.split(";", 1)[0].trim().toLowerCase();
  const byMime: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff",
  };

  if (byMime[mime]) return byMime[mime];

  try {
    const suffix = path.extname(new URL(sourceUrl).pathname).toLowerCase();
    if (
      [
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".webp",
        ".avif",
        ".svg",
        ".bmp",
        ".tif",
        ".tiff",
      ].includes(suffix)
    ) {
      return suffix === ".jpeg" ? ".jpg" : suffix;
    }
  } catch {
    // Fall through to a generic extension.
  }

  return ".img";
}

async function downloadImage(
  source: string,
  destinationStem: string,
  referer: string,
): Promise<DownloadResult> {
  if (source.startsWith("data:")) {
    const match = source.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) throw new Error("Invalid data image");

    const contentType = match[1] || "application/octet-stream";
    const payload = match[2]
      ? Buffer.from(match[3], "base64")
      : Buffer.from(decodeURIComponent(match[3]), "utf8");

    if (payload.byteLength > MAX_IMAGE_BYTES)
      throw new Error("Image is too large");

    const localPath = `${destinationStem}${extensionFor(contentType, source)}`;
    await writeFile(localPath, payload);
    return { localPath, byteLength: payload.byteLength };
  }

  if (!/^https?:/i.test(source)) throw new Error("Unsupported image URL");

  const response = await fetch(source, {
    headers: {
      Accept:
        "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      Referer: referer,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138 Safari/537.36",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) throw new Error(`Image HTTP ${response.status}`);

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_IMAGE_BYTES) throw new Error("Image is too large");

  const payload = Buffer.from(await response.arrayBuffer());
  if (payload.byteLength > MAX_IMAGE_BYTES)
    throw new Error("Image is too large");

  const contentType = response.headers.get("content-type") || "";
  if (contentType && !contentType.toLowerCase().startsWith("image/")) {
    throw new Error("Downloaded resource is not an image");
  }

  const localPath = `${destinationStem}${extensionFor(contentType, source)}`;
  await writeFile(localPath, payload);
  return { localPath, byteLength: payload.byteLength };
}

async function localizeImages(
  images: HTMLImageElement[],
  assetsDirectory: string,
  pageUrl: string,
): Promise<{ downloaded: number; remote: number }> {
  const uniqueSources = Array.from(
    new Set(
      images.map((image) => image.getAttribute("src") || "").filter(Boolean),
    ),
  );
  const localized = new Map<string, string>();
  let totalBytes = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < uniqueSources.length) {
      const index = cursor++;
      const source = uniqueSources[index];

      try {
        const result = await downloadImage(
          source,
          path.join(assetsDirectory, String(index + 1).padStart(3, "0")),
          pageUrl,
        );

        if (
          !result.localPath ||
          totalBytes + result.byteLength > MAX_TOTAL_IMAGE_BYTES
        ) {
          continue;
        }

        totalBytes += result.byteLength;
        localized.set(source, result.localPath);
      } catch {
        // Keep the original remote URL when local download fails.
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(4, uniqueSources.length) }, () => worker()),
  );

  images.forEach((image) => {
    const source = image.getAttribute("src") || "";
    const localPath = localized.get(source);
    if (localPath) image.setAttribute("src", localPath);
  });

  return {
    downloaded: localized.size,
    remote: uniqueSources.length - localized.size,
  };
}

function stripAttributes(root: Element): void {
  root.querySelectorAll("*").forEach((element) => {
    const tagName = element.tagName.toLowerCase();
    const allowed = new Set<string>();

    if (tagName === "a") {
      allowed.add("href");
      allowed.add("title");
    } else if (tagName === "img") {
      allowed.add("src");
      allowed.add("alt");
      allowed.add("title");
    } else if (tagName === "td" || tagName === "th") {
      allowed.add("colspan");
      allowed.add("rowspan");
    }

    for (const attribute of Array.from(element.attributes)) {
      if (!allowed.has(attribute.name.toLowerCase()))
        element.removeAttribute(attribute.name);
    }
  });
}

function toMarkdown(root: Element): string {
  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });
  turndown.use(gfm);
  turndown.remove(["script", "style", "noscript", "iframe", "form", "button"]);
  return turndown.turndown(root.outerHTML).trim();
}

function yamlString(value: string): string {
  return JSON.stringify(compactText(value));
}

function markdownDocument(
  metadata: PageMetadata,
  body: string,
  extraction: ExtractionMethod,
  downloaded: number,
  remote: number,
): string {
  const captured = new Date().toISOString();
  const lines = [
    "---",
    `title: ${yamlString(metadata.title)}`,
    `source: ${yamlString(metadata.url)}`,
    `author: ${yamlString(metadata.author)}`,
    `published: ${yamlString(metadata.published)}`,
    `captured: ${yamlString(captured)}`,
    `extraction: ${extraction}`,
    `local_images: ${downloaded}`,
    `remote_images: ${remote}`,
    "---",
    "",
    `# ${metadata.title}`,
    "",
    `原文：<${metadata.url}>`,
    "",
  ];

  if (metadata.author) lines.push(`作者：${metadata.author}`, "");
  if (metadata.published) lines.push(`发布时间：${metadata.published}`, "");

  return `${lines.join("\n")}${body}\n`;
}

async function capture(): Promise<{
  markdownPath: string;
  downloaded: number;
  remote: number;
}> {
  const [html, tabs] = await Promise.all([
    BrowserExtension.getContent({ format: "html" }),
    BrowserExtension.getTabs(),
  ]);

  if (!html) throw new Error("浏览器扩展没有返回当前页面内容");

  const { document } = parseHTML(html);
  const metadata = pageMetadata(document as unknown as Document, tabs);

  if (!metadata.url) throw new Error("无法确定当前页面网址");

  const selection = selectContent(
    html,
    document as unknown as Document,
    metadata.url,
  );
  if (!selection) throw new Error("当前页面没有可提取的内容");

  const documentTitle = compactText((document as unknown as Document).title);
  if (
    selection.title &&
    (metadata.title === "网页" || metadata.title === documentTitle)
  ) {
    metadata.title = selection.title;
  }
  if (!metadata.author && selection.author) metadata.author = selection.author;

  const root = selection.root.cloneNode(true) as Element;
  const hash = createHash("sha256")
    .update(metadata.url)
    .digest("hex")
    .slice(0, 10);
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const dateDirectory = path.join(OUTPUT_ROOT, date);
  await mkdir(dateDirectory, { recursive: true });
  const baseDirectory = path.join(dateDirectory, hash);
  let articleDirectory = baseDirectory;

  try {
    await mkdir(articleDirectory, { recursive: false });
  } catch {
    articleDirectory = `${baseDirectory}-${now.toTimeString().slice(0, 8).replaceAll(":", "")}`;
    await mkdir(articleDirectory, { recursive: false });
  }

  const assetsDirectory = path.join(articleDirectory, "assets");
  await mkdir(assetsDirectory, { recursive: false });

  const images = prepareContent(root, metadata.url);
  const imageResult = await localizeImages(
    images,
    assetsDirectory,
    metadata.url,
  );
  stripAttributes(root);

  const body = toMarkdown(root);
  if (body.length < 30)
    throw new Error("提取到的页面内容过短，请确认网页已经完整加载");

  const markdownPath = path.join(
    articleDirectory,
    `${safeFilename(metadata.title)}.md`,
  );
  await writeFile(
    path.join(articleDirectory, "source.html"),
    root.outerHTML,
    "utf8",
  );
  await writeFile(
    markdownPath,
    markdownDocument(
      metadata,
      body,
      selection.method,
      imageResult.downloaded,
      imageResult.remote,
    ),
    "utf8",
  );

  return { markdownPath, ...imageResult };
}

export default async function captureWebpageAsMarkdown() {
  try {
    const result = await capture();
    await Clipboard.copy({ file: result.markdownPath });
    await showHUD(
      `✅ Markdown 已复制｜本地图片 ${result.downloaded} 张${result.remote ? `｜远程图片 ${result.remote} 张` : ""}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(error);
    await showHUD(`❌ ${message}`);
  }
}

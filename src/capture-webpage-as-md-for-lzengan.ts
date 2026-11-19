import { BrowserExtension, Clipboard, showHUD } from "@raycast/api";
import { Readability } from "@mozilla/readability";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const OUTPUT_ROOT = path.join(homedir(), "Raycast", "Raycast WebClips");
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_ALL_IMAGES_BYTES = 150 * 1024 * 1024;
const IMAGE_CONCURRENCY = 4;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:141.0) Gecko/20100101 Firefox/141.0";

const LAZY_IMAGE_ATTRIBUTES = [
  "data-src",
  "data-lazy-src",
  "data-original",
  "data-original-src",
  "data-backsrc",
  "src",
] as const;

const ALWAYS_REMOVE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "form",
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "iframe",
  "audio",
  "video",
  "source",
  "track",
  "canvas",
  "svg",
  "object",
  "embed",
  "dialog",
  "[hidden]",
  '[aria-hidden="true"]',
].join(",");

const FALLBACK_REMOVE_SELECTORS = [
  "nav",
  "footer",
  "aside",
  "body > header",
  "[role='navigation']",
  "[role='banner']",
  "[role='contentinfo']",
  "[role='complementary']",
  ".nav",
  ".navbar",
  ".navigation",
  ".menu",
  ".sidebar",
  ".side-bar",
  ".footer",
  ".site-footer",
  ".advertisement",
  ".advert",
  ".ads",
  ".cookie-banner",
  ".newsletter",
  ".social-share",
  ".share-buttons",
].join(",");

interface Metadata {
  title: string;
  author: string;
  published: string;
}

type ExtractionMethod = "wechat" | "readability" | "article" | "body";

interface ExtractedPage {
  html: string;
  metadata: Metadata;
  extraction: ExtractionMethod;
}

interface DownloadResult {
  sourceUrl: string;
  localPath?: string;
  relativePath?: string;
  bytes?: number;
  error?: string;
}

interface DownloadBudget {
  used: number;
}

function compactText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function firstText(root: ParentNode, selectors: string[]): string {
  for (const selector of selectors) {
    const value = compactText(root.querySelector(selector)?.textContent);
    if (value) return value;
  }
  return "";
}

function firstAttribute(root: ParentNode, selectors: Array<[string, string]>): string {
  for (const [selector, attribute] of selectors) {
    const value = compactText(root.querySelector(selector)?.getAttribute(attribute));
    if (value) return value;
  }
  return "";
}

function parseJsonLdValue(document: Document, key: "author" | "datePublished"): string {
  const findValue = (input: unknown): string => {
    if (Array.isArray(input)) {
      for (const item of input) {
        const value = findValue(item);
        if (value) return value;
      }
      return "";
    }

    if (!input || typeof input !== "object") return "";
    const record = input as Record<string, unknown>;
    const direct = record[key];

    if (typeof direct === "string") return compactText(direct);
    if (Array.isArray(direct)) {
      const values = direct.map((value) => findAuthorName(value)).filter(Boolean);
      if (values.length) return values.join(", ");
    }
    if (direct && typeof direct === "object") {
      const value = findAuthorName(direct);
      if (value) return value;
    }

    if (record["@graph"]) {
      const value = findValue(record["@graph"]);
      if (value) return value;
    }

    return "";
  };

  for (const script of Array.from(document.querySelectorAll("script[type='application/ld+json']"))) {
    try {
      const value = findValue(JSON.parse(script.textContent ?? ""));
      if (value) return value;
    } catch {
      // Ignore invalid JSON-LD blocks and continue with other metadata sources.
    }
  }
  return "";
}

function findAuthorName(input: unknown): string {
  if (typeof input === "string") return compactText(input);
  if (!input || typeof input !== "object") return "";
  const record = input as Record<string, unknown>;
  if (typeof record.name === "string") return compactText(record.name);
  return "";
}

function isWeChatPage(document: Document, pageUrl: string): boolean {
  return (
    pageUrl.includes("mp.weixin.qq.com/") ||
    Boolean(document.querySelector("#js_content")) ||
    Boolean(document.querySelector(".rich_media_content"))
  );
}

function findWeChatPublished(document: Document): string {
  const direct = firstText(document, ["#publish_time", "#js_publish_time", ".rich_media_meta_text"]);
  if (/\d{4}[年/.-]\d{1,2}[月/.-]\d{1,2}/.test(direct)) return direct;

  for (const element of Array.from(document.querySelectorAll(".rich_media_meta_text"))) {
    const value = compactText(element.textContent);
    if (/\d{4}[年/.-]\d{1,2}[月/.-]\d{1,2}/.test(value)) return value;
  }
  return "";
}

function extractMetadata(document: Document, pageUrl: string, tabTitle?: string): Metadata {
  const weChat = isWeChatPage(document, pageUrl);
  const weChatTitle = weChat
    ? firstText(document, ["#activity-name", "h1.rich_media_title", ".rich_media_title"])
    : "";
  const title =
    weChatTitle ||
    firstText(document, ["article h1", "main h1"]) ||
    firstAttribute(document, [
      ["meta[property='og:title']", "content"],
      ["meta[name='twitter:title']", "content"],
      ["meta[property='twitter:title']", "content"],
    ]) ||
    compactText(document.title) ||
    compactText(tabTitle) ||
    "Untitled webpage";

  const weChatAuthor = weChat
    ? firstText(document, [
        "#js_name",
        ".rich_media_meta_nickname",
        "a#js_name",
        ".rich_media_meta.rich_media_meta_text",
      ])
    : "";
  const author =
    weChatAuthor ||
    firstText(document, [
      "a[rel~='author']",
      "[rel~='author']",
      "[data-role='author']",
      "#profileBt .profile_nickname",
    ]) ||
    firstAttribute(document, [
      ["meta[name='author']", "content"],
      ["meta[property='article:author']", "content"],
      ["meta[name='byl']", "content"],
    ]) ||
    parseJsonLdValue(document, "author");

  const weChatPublished = weChat ? findWeChatPublished(document) : "";
  const published =
    weChatPublished ||
    firstAttribute(document, [
      ["time[datetime]", "datetime"],
      ["meta[property='article:published_time']", "content"],
      ["meta[itemprop='datePublished']", "content"],
      ["meta[name='datePublished']", "content"],
      ["meta[name='date']", "content"],
      ["meta[name='pubdate']", "content"],
    ]) ||
    firstText(document, ["time", "[itemprop='datePublished']", "[pubdate]"]) ||
    firstAttribute(document, [["[pubdate]", "datetime"]]) ||
    parseJsonLdValue(document, "datePublished");

  return { title, author, published };
}

function toAbsoluteUrl(value: string, pageUrl: string): string {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed || trimmed.startsWith("#")) return trimmed;
  if (/^(data|blob|mailto|tel|javascript):/i.test(trimmed)) return trimmed;

  try {
    return new URL(trimmed, pageUrl).href;
  } catch {
    return trimmed;
  }
}

function chooseImageSource(image: Element): string {
  for (const attribute of LAZY_IMAGE_ATTRIBUTES) {
    const value = compactText(image.getAttribute(attribute));
    if (!value) continue;
    if (value.startsWith("data:image/") && attribute !== "src") continue;
    return value;
  }

  const srcset = compactText(image.getAttribute("data-srcset") || image.getAttribute("srcset"));
  if (!srcset) return "";
  const candidates = srcset
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter(Boolean);
  return candidates.at(-1) ?? "";
}

function normalizeDocumentUrls(document: Document, pageUrl: string): void {
  for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
    const href = anchor.getAttribute("href");
    if (href && !/^\s*javascript:/i.test(href)) {
      anchor.setAttribute("href", toAbsoluteUrl(href, pageUrl));
    } else {
      anchor.removeAttribute("href");
    }
  }

  for (const image of Array.from(document.querySelectorAll("img"))) {
    const source = chooseImageSource(image);
    if (source) image.setAttribute("src", toAbsoluteUrl(source, pageUrl));
    image.removeAttribute("srcset");
    image.removeAttribute("data-srcset");
  }

  for (const element of Array.from(document.querySelectorAll("[style*='background'], [background]"))) {
    const style = element.getAttribute("style") ?? "";
    const backgroundAttribute = element.getAttribute("background") ?? "";
    const urls: string[] = [];
    const pattern = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
    for (const match of style.matchAll(pattern)) {
      if (match[2]) urls.push(match[2]);
    }
    if (backgroundAttribute) urls.push(backgroundAttribute);

    for (const rawUrl of urls) {
      const absolute = toAbsoluteUrl(rawUrl, pageUrl);
      if (!/^https?:/i.test(absolute)) continue;
      const image = document.createElement("img");
      image.setAttribute("src", absolute);
      image.setAttribute(
        "alt",
        compactText(element.getAttribute("aria-label") || element.getAttribute("title")),
      );
      image.setAttribute("data-raycast-background-image", "true");
      element.insertBefore(image, element.firstChild);
    }
  }
}

function cleanContent(document: Document, bodyFallback: boolean): void {
  for (const element of Array.from(document.querySelectorAll(ALWAYS_REMOVE_SELECTORS))) element.remove();
  if (bodyFallback) {
    for (const element of Array.from(document.querySelectorAll(FALLBACK_REMOVE_SELECTORS))) element.remove();
  }

  for (const element of Array.from(document.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") element.removeAttribute(attribute.name);
    }
  }
}

function documentFromHtml(html: string): Document {
  return parseHTML(html).document as unknown as Document;
}

function contentDocument(contentHtml: string, pageUrl: string, bodyFallback: boolean): Document {
  const document = documentFromHtml(
    `<!doctype html><html><head><base href="${escapeHtml(pageUrl)}"></head><body>${contentHtml}</body></html>`,
  );
  cleanContent(document, bodyFallback);
  return document;
}

function extractPage(html: string, pageUrl: string, tabTitle?: string): ExtractedPage {
  const document = documentFromHtml(html);
  const metadata = extractMetadata(document, pageUrl, tabTitle);
  normalizeDocumentUrls(document, pageUrl);

  const weChatContent =
    document.querySelector("#js_content") ?? document.querySelector(".rich_media_content");
  if (weChatContent) {
    const content = contentDocument(weChatContent.outerHTML, pageUrl, false);
    return { html: content.body.innerHTML, metadata, extraction: "wechat" };
  }

  try {
    const readabilityDocument = documentFromHtml(`<!doctype html>${document.documentElement.outerHTML}`);
    const readable = new Readability(readabilityDocument).parse();
    if (readable?.content && compactText(readable.textContent)) {
      const content = contentDocument(readable.content, pageUrl, false);
      if (!metadata.author && readable.byline) metadata.author = compactText(readable.byline);
      return { html: content.body.innerHTML, metadata, extraction: "readability" };
    }
  } catch {
    // Preserve article/body fallbacks if a page cannot be parsed by Readability.
    console.warn("Readability extraction failed; using page fallback");
  }

  const article = document.querySelector("article");
  if (article && compactText(article.textContent)) {
    const content = contentDocument(article.outerHTML, pageUrl, false);
    return { html: content.body.innerHTML, metadata, extraction: "article" };
  }

  const content = contentDocument(document.body.innerHTML, pageUrl, true);
  return { html: content.body.innerHTML, metadata, extraction: "body" };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanitizeFilename(value: string, fallback: string): string {
  const cleaned = value
    .normalize("NFC")
    .replace(/\p{Cc}/gu, " ")
    .replace(/[/:\\]/g, "-")
    .replace(/[<>"|?*]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .replace(/[. ]+$/g, "")
    .trim();
  const source = cleaned || fallback;
  let result = "";
  for (const character of Array.from(source)) {
    if (Buffer.byteLength(result + character, "utf8") > 180) break;
    result += character;
  }
  return result || fallback;
}

function localDateFolder(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timestampSuffix(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}${minutes}${seconds}`;
}

async function createCaptureDirectory(pageUrl: string, captured: Date): Promise<string> {
  const urlHash = createHash("sha256").update(pageUrl).digest("hex").slice(0, 16);
  const dateDirectory = path.join(OUTPUT_ROOT, localDateFolder(captured));
  await mkdir(dateDirectory, { recursive: true });
  const baseDirectory = path.join(dateDirectory, urlHash);
  // Claim a fresh directory atomically: concurrent captures must never reuse it.
  for (let attempt = 0; ; attempt++) {
    const suffix = attempt === 0 ? "" : `-${timestampSuffix(captured)}${attempt > 1 ? `-${attempt}` : ""}`;
    const captureDirectory = `${baseDirectory}${suffix}`;
    try {
      await mkdir(captureDirectory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    await mkdir(path.join(captureDirectory, "assets"));
    return captureDirectory;
  }
}

function imageExtension(contentType: string, responseUrl: string, sourceUrl: string, data: Buffer): string {
  const mime = contentType.split(";", 1)[0].trim().toLowerCase();
  const mimeMap: Record<string, string> = {
    "image/avif": "avif",
    "image/bmp": "bmp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/tiff": "tiff",
    "image/webp": "webp",
    "image/x-icon": "ico",
  };
  if (mimeMap[mime]) return mimeMap[mime];

  for (const candidate of [responseUrl, sourceUrl]) {
    try {
      const extension = path.extname(new URL(candidate).pathname).slice(1).toLowerCase();
      if (/^(avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|tiff?|webp)$/.test(extension)) {
        return extension === "jpeg" ? "jpg" : extension === "tif" ? "tiff" : extension;
      }
    } catch {
      // Continue to binary signature detection.
    }
  }

  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "jpg";
  if (data.subarray(0, 6).toString("ascii").startsWith("GIF8")) return "gif";
  if (data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") {
    return "webp";
  }
  return "img";
}

async function downloadImage(
  sourceUrl: string,
  pageUrl: string,
  assetsDirectory: string,
  index: number,
  budget: DownloadBudget,
): Promise<DownloadResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    let data: Buffer;
    let contentType: string;
    let responseUrl = sourceUrl;
    if (/^data:/i.test(sourceUrl)) {
      const match = sourceUrl.match(/^data:(image\/[^;,]+)(;base64)?,([\s\S]*)$/i);
      if (!match) throw new Error("unsupported inline image");
      contentType = match[1];
      const encoded = match[3];
      if (match[2]) {
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1)
          throw new Error("invalid base64 image");
        if (Buffer.byteLength(encoded, "base64") > MAX_IMAGE_BYTES)
          throw new Error("image exceeds 25 MiB limit");
        data = Buffer.from(encoded, "base64");
      } else {
        if (Buffer.byteLength(encoded) > MAX_IMAGE_BYTES * 3) throw new Error("image exceeds 25 MiB limit");
        data = Buffer.from(decodeURIComponent(encoded), "utf8");
      }
      if (data.length > MAX_IMAGE_BYTES) throw new Error("image exceeds 25 MiB limit");
      if (budget.used + data.length > MAX_ALL_IMAGES_BYTES)
        throw new Error("all images exceed 150 MiB limit");
      budget.used += data.length;
    } else {
      if (!/^https?:\/\//i.test(sourceUrl)) throw new Error("unsupported image URL");
      if (budget.used >= MAX_ALL_IMAGES_BYTES) throw new Error("all images exceed 150 MiB limit");
      const response = await fetch(sourceUrl, {
        headers: {
          Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5",
          Referer: pageUrl,
          "User-Agent": USER_AGENT,
        },
        redirect: "follow",
        signal: controller.signal,
      });
      contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
      const contentLength = Number(response.headers.get("content-length") ?? "0");
      const headerError = !response.ok
        ? `HTTP ${response.status}`
        : contentLength > MAX_IMAGE_BYTES
          ? "image exceeds 25 MiB limit"
          : contentLength && budget.used + contentLength > MAX_ALL_IMAGES_BYTES
            ? "all images exceed 150 MiB limit"
            : contentType && !contentType.startsWith("image/") && contentType !== "application/octet-stream"
              ? `unexpected ${contentType}`
              : "";
      if (headerError) {
        await response.body?.cancel();
        throw new Error(headerError);
      }
      if (!response.body) throw new Error("empty response body");
      const reader = response.body.getReader();
      const chunks: Buffer[] = [];
      let imageBytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (
            imageBytes + value.byteLength > MAX_IMAGE_BYTES ||
            budget.used + value.byteLength > MAX_ALL_IMAGES_BYTES
          ) {
            await reader.cancel();
            throw new Error("image download exceeds size limit");
          }
          // Count accepted chunks immediately so all concurrent workers share the limit.
          budget.used += value.byteLength;
          imageBytes += value.byteLength;
          chunks.push(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
      data = Buffer.concat(chunks, imageBytes);
      responseUrl = response.url;
    }
    const extension = imageExtension(contentType, responseUrl, sourceUrl, data);
    const filename = `${String(index + 1).padStart(3, "0")}.${extension}`;
    const localPath = path.join(assetsDirectory, filename);
    await writeFile(localPath, data, { flag: "wx" });
    return { sourceUrl, localPath, relativePath: `assets/${filename}`, bytes: data.length };
  } catch (error) {
    return { sourceUrl, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  const run = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= values.length) return;
      results[index] = await worker(values[index], index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => run()));
  return results;
}

async function localizeImages(
  extractedHtml: string,
  pageUrl: string,
  assetsDirectory: string,
): Promise<{ html: string; localImages: number; remoteImages: number }> {
  const document = contentDocument(extractedHtml, pageUrl, false);
  const imageElements = Array.from(document.querySelectorAll("img[src]"));
  const imageSources = Array.from(
    new Set(imageElements.map((image) => image.getAttribute("src") ?? "").filter(Boolean)),
  );
  const budget: DownloadBudget = { used: 0 };
  const downloads = await mapWithConcurrency(imageSources, IMAGE_CONCURRENCY, (sourceUrl, index) =>
    downloadImage(sourceUrl, pageUrl, assetsDirectory, index, budget),
  );

  const bySource = new Map(downloads.map((download) => [download.sourceUrl, download]));
  for (const image of imageElements) {
    const source = image.getAttribute("src") ?? "";
    const download = bySource.get(source);
    if (download?.relativePath) image.setAttribute("src", download.relativePath);
  }

  return {
    html: document.body.innerHTML,
    localImages: downloads.filter((download) => download.relativePath).length,
    remoteImages: downloads.filter((download) => !download.relativePath).length,
  };
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function buildMarkdown(
  html: string,
  pageUrl: string,
  metadata: Metadata,
  extraction: ExtractionMethod,
  captured: Date,
  localImages: number,
  remoteImages: number,
): string {
  const turndown = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    headingStyle: "atx",
    strongDelimiter: "**",
  });
  turndown.use(gfm);
  const body = turndown.turndown(html).trim();
  if (!body) throw new Error("The page has no readable article content.");
  const headerLines = [`# ${metadata.title}`, "", `原文：<${pageUrl}>`];
  if (metadata.author) headerLines.push("", `作者：${metadata.author}`);
  if (metadata.published) headerLines.push("", `发布时间：${metadata.published}`);

  return [
    "---",
    `title: ${yamlString(metadata.title)}`,
    `source: ${yamlString(pageUrl)}`,
    `author: ${yamlString(metadata.author)}`,
    `published: ${yamlString(metadata.published)}`,
    `captured: ${yamlString(captured.toISOString())}`,
    `extraction: ${extraction}`,
    `local_images: ${localImages}`,
    `remote_images: ${remoteImages}`,
    "---",
    "",
    ...headerLines,
    "",
    body,
    "",
  ].join("\n");
}

function safePageUrl(url: string): string {
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error(`Unsupported page: ${parsed.protocol}`);
  parsed.hash = "";
  return parsed.href;
}

async function capture(): Promise<void> {
  const tabs = await BrowserExtension.getTabs();
  const tab = tabs.find((candidate) => candidate.active);
  if (!tab)
    throw new Error("No active browser tab found. Open a normal webpage in a supported browser first.");
  const pageUrl = safePageUrl(tab.url);
  const html = await BrowserExtension.getContent({ format: "html", tabId: tab.id });
  if (!html.trim())
    throw new Error("The browser returned an empty page. Check Raycast Companion permissions.");

  const captured = new Date();
  const extracted = extractPage(html, pageUrl, tab.title);
  const captureDirectory = await createCaptureDirectory(pageUrl, captured);
  const assetsDirectory = path.join(captureDirectory, "assets");
  const localized = await localizeImages(extracted.html, pageUrl, assetsDirectory);
  const markdown = buildMarkdown(
    localized.html,
    pageUrl,
    extracted.metadata,
    extracted.extraction,
    captured,
    localized.localImages,
    localized.remoteImages,
  );
  const markdownFilename = `${sanitizeFilename(extracted.metadata.title, "Untitled webpage")}.md`;
  const markdownPath = path.join(captureDirectory, markdownFilename);

  await writeFile(path.join(captureDirectory, "source.html"), html, "utf8");
  await writeFile(markdownPath, markdown, "utf8");
  await Clipboard.copy({ file: markdownPath });
  await showHUD(`✅ Saved Markdown · local ${localized.localImages} · remote ${localized.remoteImages}`);
}

export default async function Command() {
  try {
    await capture();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await showHUD(`❌ Capture failed: ${message.slice(0, 140)}`);
    throw error;
  }
}

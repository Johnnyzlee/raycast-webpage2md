<div align="center">

<h1>Webpage to Markdown</h1>
<p>将浏览器文章保存为带本地图片的 Markdown 文档。</p>
<p><a href="README.md">English</a> · <strong>简体中文</strong></p>
<p><a href="#安装">安装</a> · <a href="#使用方法">使用方法</a> · <a href="#工作原理">工作原理</a> · <a href="#数据处理">数据处理</a> · <a href="#开发与维护">开发与维护</a></p>
<sub>macOS · Raycast · 本地处理 · MIT License</sub>

</div>

---

Raycast 命令：**Capture webpage as .md for lzengan**。这是按需运行的 macOS Raycast Extension，不是 AI Command，也不是常驻抓取服务。**不需要 API Key，不调用大模型，不会自动把网页上传给 AI。**

## 为什么做这个项目

浏览器中能够阅读的网页，不一定能被 AI 工具或自动抓取程序访问。登录状态、动态渲染和访问限制，使得仅提供链接往往不足以传递完整材料，微信公众号文章就是常见场景。

这个命令利用 Raycast Browser Extension 取得浏览器当前提供的 HTML，在本机提取正文、转换 Markdown、下载图片，再把生成的文件放到剪贴板。它省去了手动复制正文、逐张保存图片或把网页打印成 PDF 的步骤。

目标是获得一份**便于阅读、保存和继续处理的材料**。它不是 AI 摘要工具，也不保证得到网页的完整离线副本；无法替代登录、付费访问或尚未加载的内容。

## 功能概览

| 需求 | 得到的结果 |
| --- | --- |
| 保存文章 | Markdown 正文，尽量保留标题、列表、链接、代码块和表格 |
| 保存配图 | 可下载的图片写入同目录的 `assets/`，正文指向本地图片 |
| 记录来源 | 标题、作者、发布时间、来源 URL、抓取时间和提取方式 |
| 交给其他应用 | 剪贴板里是一份 `.md` **文件**，可粘贴到支持文件粘贴的应用 |
| 保留页面来源 | 同时保存浏览器返回的原始 `source.html`，便于与整理后的 Markdown 对照 |

适合文章、博客、教程和微信公众号正文。你可以用 Markdown 编辑器阅读、纳入自己的资料库，或在检查内容后主动交给 AI。

## 工作原理

```text
已打开的浏览器网页
  → Raycast Browser Extension 返回 HTML 与标签页信息
  → 提取正文和来源信息
  → 清理无关元素、规范链接、尝试保存图片
  → 生成 Markdown，保留浏览器原始 HTML
  → 写入本地目录，把 Markdown 文件复制到剪贴板
```

1. **取得页面。** 从 `getTabs()` 返回结果中选择第一个活动标签页，校验 HTTP(S) 地址，再用 `getContent({ format: "html", tabId })` 读取对应 HTML。正文与来源地址来自同一个标签页，地址中的片段标记会移除。多窗口时，第一个活动标签页不一定是最前面的窗口。
2. **选择正文。** 依次尝试微信公众号的 `#js_content` / `.rich_media_content`、Mozilla Readability、`<article>` 和 `<body>`。Readability 抛出异常时仍可继续回退。作者与日期可以从页面元素、meta 标签、`datetime` 或 JSON-LD 提取。
3. **整理内容。** 规范链接，处理懒加载图片和 `srcset` 回退，将支持的背景图转换一次。提取内容会移除脚本、表单、媒体、隐藏元素、事件属性与 JavaScript 链接；body 回退还会清理常见导航与广告。这些处理用于生成 Markdown，不改变保留的原始 HTML。
4. **本地化图片。** 对来源去重，最多并行处理 4 张图片。HTTP(S) 图片和支持的内嵌 `data:image` 图片保存到 `assets/`，正文使用相对路径。失败时保留来源引用；所有任务共享大小预算，在读取数据块或解码内嵌图片时检查。
5. **转换和保存。** 用 Turndown 与 GFM 插件生成 Markdown，通过原子创建操作分配新目录，保存 Markdown 和原始 `source.html`，再调用 `Clipboard.copy({ file: ... })`。重复或并发抓取分别保存，不覆盖已有文件；不会自动发送到其他应用。

## 安装

需要 macOS、Raycast、已连接并授予页面访问权限的 [Raycast Browser Extension](https://www.raycast.com/browser-extension)，以及 **Node.js 22.22.2 或更新版本**。当前固定的 Raycast API 版本为 1.104.25；建议使用满足要求的 Node.js LTS。

```sh
git clone https://github.com/Johnnyzlee/raycast-webpage2md.git
cd raycast-webpage2md
node --version
npm ci
npm run dev
```

也可以在 GitHub 选择 **Code → Download ZIP**，解压后进入包含 `package.json` 的目录，执行同样的 npm 命令；ZIP 安装不需要 Git。

保持 Raycast 打开，等待开发构建成功，确认命令能在 Raycast 中搜索到，再按 **Control-C** 停止开发监听。日常使用不需要保持终端或开发进程运行。本项目从源码安装，不通过 Raycast Store 安装。

## 使用方法

1. 在支持的浏览器中打开文章，等待内容加载完成。懒加载页面可先滚动到需要的内容。
2. 唤出 Raycast，运行 **Capture webpage as .md for lzengan**。
3. 等待成功提示；生成的 Markdown 文件已经复制到剪贴板。
4. 在支持文件粘贴的应用中粘贴，或从下面的目录打开文件。若要纯文字，先用编辑器打开 Markdown，再复制正文。

默认目录来自当前用户的 home，不依赖作者的电脑：

```text
~/Raycast/Raycast WebClips/
└── 2026-11-19/                 # 抓取日期，按本地日期分组
    └── a1b2c3d4e5f67890/      # 来源 URL 的 SHA-256 前 16 位
        ├── 文章标题.md
        ├── source.html         # 浏览器返回的原始 HTML
        └── assets/
            ├── 001.png
            └── 002.jpg
```

同日重复抓取同一 URL 时，使用时间后缀，必要时再追加序号，避免复用或覆盖已有目录。`source.html` 保留浏览器返回的原始 HTML，其中的链接、脚本和远程资源不作改写；它是页面来源快照，不是完整的离线网站副本。

Markdown 开头的 YAML 保存 `title`、`source`、`author`、`published`、`captured`、`extraction`、`local_images` 和 `remote_images`。作者和发布时间来自页面，可能缺失或不准确，不代表已经外部核实。

**保存的图片使用 `assets/001.png` 这样的相对路径。** 移动或分享完整文章文件夹即可保留引用关系。只粘贴 `.md` 文件不会同时包含图片，云端 AI 也不一定能自动读取配套文件；本命令不会自动打包或上传附件。

## 数据处理

| 操作 | 数据去向 |
| --- | --- |
| 取得正文 | 通过 Raycast 浏览器扩展读取当前 HTML，并取得标签页元信息 |
| 提取、清理、转换 | 在本机扩展进程内完成，不发送给大模型或作者服务器 |
| 下载图片 | 请求图片原站/CDN，附带 User-Agent 和页面来源 `Referer`；代码不读取或复制浏览器 Cookie |
| 保存结果 | 写入本机 WebClips 目录；剪贴板保存 Markdown 文件引用 |
| 交给 AI 或同步网盘 | 由你之后的分享操作或其他应用决定，不由本扩展自动完成 |

页面中的私人内容、来源 URL 查询参数、正文和图片可能进入输出文件。原始 `source.html` 还会保留页面脚本和隐藏内容，并未做安全清理；整理 Markdown 也不等于删除敏感信息。图片站点会看到正常的网络请求信息及 `Referer`。分享前应检查输出，尤其是登录后才能看到的页面。

退出命令不会删除剪藏。无需保留时可以删除对应文章文件夹；删除后，旧剪贴板文件引用和图片路径也可能失效。

## 范围与限制

- 以浏览器扩展实际提供的 HTML 为准；不会自动滚动、翻页、展开折叠内容或解决验证码。浏览器内置 PDF 阅读器、画布、视频和复杂交互页面不是主要目标。
- 不需要 AI 订阅或 DeepSeek Key 来做转换，但仍需能使用 Raycast 及其浏览器扩展。
- 多窗口时需确认选择的是目标活动标签页。HTML 会锁定该标签页，但标签页排列顺序不保证对应最前面的窗口。
- 图片单文件检查上限为 25 MiB；HTTP 请求超时为 30 秒。登录态、防盗链、临时 URL 或不支持的格式都可能导致图片未本地化。
- 150 MiB 共享预算统计已接收的 HTTP 数据块和已解码的内嵌图片，包括随后失败的下载所消耗的数据。超限图片不会写入文件；取消前网络或运行时可能已有额外缓冲，因此不等于严格的网络流量上限。
- 支持有内容的短笔记，提取结果为空时会报错。路径、权限异常或写入中断仍可能留下部分输出文件。
- 正文提取、表格、数学公式和元信息都可能损失细节，重要材料需要对照网页。自动测试覆盖典型提取流程和失败场景，不能覆盖所有网站。

## 开发与维护

```sh
git pull --ff-only             # 仅适用于 Git 克隆
npm ci
npm run typecheck
npm test
npm audit
npm run build                 # 当前脚本导出至 dist/，用于构建检查
npm run test:bundle
npm run dev                   # 将更新同步到本机 Raycast
```

构建成功后可停止开发监听。修改显示名称只需调整 `package.json` 的 `commands[0].title`；若改 `commands[0].name`，还必须同步修改源码入口文件名。自动生成的 `raycast-env.d.ts` 应由 Raycast 工具重新生成。

主要实现集中在 [src/capture-webpage-as-md-for-lzengan.ts](src/capture-webpage-as-md-for-lzengan.ts)：`extractMetadata` 提取元信息，`extractPage` 选择正文，`normalizeDocumentUrls` 整理链接和图片，`localizeImages` 保存配图，`buildMarkdown` 转换正文，`capture` 组织流程。`OUTPUT_ROOT` 控制保存目录。

回归测试使用合成网页、临时用户目录和模拟 Raycast／网络接口，执行真实命令与解析库，覆盖正文提取与异常回退、元信息、相对图片路径、内嵌图片、背景图单次转换、流式限额、同秒／并发抓取、文件名限制和剪贴板行为。测试不会访问真实浏览器或剪贴板；浏览器权限和具体网站效果仍需实际确认。

### 从旧版安装升级

扩展标识现统一为 `webpage-capture-for-lzengan`，与维护中的本地实现一致；命令入口和显示名称保持不变。如果安装过旧公开版 `wechat-article-capture`，运行 `npm run dev` 会安装新的扩展标识。确认新命令可用后，如 Raycast 中出现重复条目，可在 Settings 中移除旧条目。已有 WebClips 不会迁移或删除；新版本按本地日期和 16 位 URL 哈希创建目录。

以 Git 仓库目录作为唯一源码来源，在该目录修改和构建。`~/.config/raycast/extensions/` 中的文件属于生成的安装产物。

依赖修复记录在锁文件中。项目保留 Raycast SDK 1.x，通过限定范围的 overrides，将 SDK 下的 `esbuild` 固定为 `0.28.2`，将 `@oclif/core` 下的 `minimatch` 固定为 `11.0.9`。修复依据与验证记录见 [依赖维护说明](docs/dependencies.md)。使用 `npm ci` 复现已检查的依赖树。

## 许可

[MIT License](LICENSE)。个人项目，与 Raycast 或网站内容提供方无隶属关系。保存和分享网页内容时，仍应遵守原内容的访问权限和版权要求。

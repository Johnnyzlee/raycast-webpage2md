# Webpage to Markdown for Raycast

**把浏览器里正在阅读的网页，保存成带本地图片的 Markdown 文件，供自己整理或交给 AI 阅读。**

简体中文（主文档） · [English](README.en.md)

Raycast 命令：**Capture webpage as .md for lzengan**。这是按需运行的 macOS Raycast Extension，不是 AI Command，也不是常驻抓取服务。**不需要 API Key，不调用大模型，不会自动把网页上传给 AI。**

## 为什么做它

我经常把网页交给 AI 阅读和讨论，但直接发链接不一定有效：网站可能限制自动抓取，微信公众号文章尤其常见。网页明明已经在浏览器里打开，另一端却仍然拿不到正文。

这个命令利用 Raycast Browser Extension 取得浏览器当前提供的 HTML，在本机提取正文、转换 Markdown、下载图片，再把生成的文件放到剪贴板。它省去了手动复制正文、逐张保存图片或把网页打印成 PDF 的步骤。

目标是获得一份**便于阅读、保存和继续处理的材料**。它不是 AI 摘要工具，也不保证得到网页的完整离线副本；无法替代登录、付费访问或尚未加载的内容。

## 下载之后能做什么

| 需求 | 得到的结果 |
| --- | --- |
| 保存文章 | Markdown 正文，尽量保留标题、列表、链接、代码块和表格 |
| 保存配图 | 可下载的图片写入同目录的 `assets/`，正文指向本地图片 |
| 记录来源 | 标题、作者、发布时间、来源 URL、抓取时间和提取方式 |
| 交给其他应用 | 剪贴板里是一份 `.md` **文件**，可粘贴到支持文件粘贴的应用 |
| 回看提取结果 | 同时保存清理后的正文 `source.html`，便于排查正文提取情况 |

适合文章、博客、教程和微信公众号正文。你可以用 Markdown 编辑器阅读、纳入自己的资料库，或在检查内容后主动交给 AI。

## 程序实际上在做什么

```text
已打开的浏览器网页
  → Raycast Browser Extension 返回 HTML 与标签页信息
  → 提取正文和来源信息
  → 清理无关元素、规范链接、尝试保存图片
  → 生成 Markdown 与正文 HTML
  → 写入本地目录，把 Markdown 文件复制到剪贴板
```

1. **取得页面。** 调用 `BrowserExtension.getContent({ format: "html" })` 和 `getTabs()`。来源 URL 优先采用页面的 canonical/`og:url`，否则参考活动标签页；多个窗口或同名标签页时可能存在歧义。
2. **选择正文。** 依次尝试微信公众号的 `#js_content` / `.rich_media_content`、Mozilla Readability、`<article>`，最后回退到 `<body>`。提取方法写入 Markdown，方便判断结果。
3. **整理内容。** 删除脚本、表单、导航、音视频等元素，处理常见懒加载图片和部分背景图，把相对链接转换成完整地址，再移除多数无关属性。这是正文整理，不是完整的安全脱敏或网页重建。
4. **本地化图片。** 相同来源只尝试一次；支持 HTTP(S) 和可解码的 `data:` 图片，最多 4 个并行任务。下载失败时保留原始来源，不会把缺图说成成功保存。
5. **转换和保存。** 使用 Turndown 和 GFM 插件生成 Markdown，写入文件，再调用 `Clipboard.copy({ file: ... })`。最后显示本地化与未本地化的图片数量；不会自动把文件发送给别的应用。

## 安装

需要 macOS、Raycast、已连接并授予页面访问权限的 [Raycast Browser Extension](https://www.raycast.com/browser-extension)，以及 **Node.js 22.22.2 或更新版本**。当前锁定的 Raycast API 版本为 1.104.24；建议使用满足要求的 Node.js LTS。

```sh
git clone https://github.com/Johnnyzlee/raycast-webpage2md.git
cd raycast-webpage2md
node --version
npm ci
npm run dev
```

也可以在 GitHub 选择 **Code → Download ZIP**，解压后进入包含 `package.json` 的目录，执行同样的 npm 命令；ZIP 安装不需要 Git。

保持 Raycast 打开，等待开发构建成功，确认命令能在 Raycast 中搜索到，再按 **Control-C** 停止开发监听。日常使用不需要保持终端或开发进程运行。本项目从源码安装，不通过 Raycast Store 安装。

## 使用与输出

1. 在支持的浏览器中打开文章，等待内容加载完成。懒加载页面可先滚动到需要的内容。
2. 唤出 Raycast，运行 **Capture webpage as .md for lzengan**。
3. 等待成功提示；生成的 Markdown 文件已经复制到剪贴板。
4. 在支持文件粘贴的应用中粘贴，或从下面的目录打开文件。若要纯文字，先用编辑器打开 Markdown，再复制正文。

默认目录来自当前用户的 home，不依赖作者的电脑：

```text
~/Raycast/Raycast WebClips/
└── 2026-11-19/                 # 抓取日期，按 UTC 分组
    └── a1b2c3d4e5/            # 来源 URL 的 SHA-256 前 10 位
        ├── 文章标题.md
        ├── source.html         # 清理后的正文，不是完整原始网页
        └── assets/
            ├── 001.png
            └── 002.jpg
```

同日重复抓取已有 URL 时，会尝试追加本地时间后缀。`source.html` 与 Markdown 使用整理后的正文和图片引用，不包含网页的完整交互行为。

Markdown 开头的 YAML 保存 `title`、`source`、`author`、`published`、`captured`、`extraction`、`local_images` 和 `remote_images`。作者和发布时间来自页面，可能缺失或不准确，不代表已经外部核实。

**当前公开版的本地图片引用是绝对路径。** 在这台 Mac 上读取通常方便，但把 `.md` 单独发给别人、移动目录或上传到云端 AI 后，图片不一定可访问。需要分享带图材料时，应一起提供 `assets/`，并把 Markdown 中的图片路径改成相对路径或接收端可访问的路径；本命令不会自动打包附件或嵌入全部图片。

## 数据会去哪里

| 操作 | 数据去向 |
| --- | --- |
| 取得正文 | 通过 Raycast 浏览器扩展读取当前 HTML，并取得标签页元信息 |
| 提取、清理、转换 | 在本机扩展进程内完成，不发送给大模型或作者服务器 |
| 下载图片 | 请求图片原站/CDN，附带 User-Agent 和页面来源 `Referer`；代码不读取或复制浏览器 Cookie |
| 保存结果 | 写入本机 WebClips 目录；剪贴板保存 Markdown 文件引用 |
| 交给 AI 或同步网盘 | 由你之后的分享操作或其他应用决定，不由本扩展自动完成 |

页面中的私人内容、来源 URL 查询参数、正文和图片可能进入输出文件；清理 HTML 不等于删除敏感信息。图片站点会看到正常的网络请求信息及 `Referer`。分享前应检查输出，尤其是登录后才能看到的页面。

退出命令不会删除剪藏。无需保留时可以删除对应文章文件夹；删除后，旧剪贴板文件引用和图片路径也可能失效。

## 范围与限制

- 以浏览器扩展实际提供的 HTML 为准；不会自动滚动、翻页、展开折叠内容或解决验证码。浏览器内置 PDF 阅读器、画布、视频和复杂交互页面不是主要目标。
- 不需要 AI 订阅或 DeepSeek Key 来做转换，但仍需能使用 Raycast 及其浏览器扩展。
- 多窗口的页面和元信息匹配不保证始终正确；运行后可检查 Markdown 的标题和来源 URL。
- 图片单文件检查上限为 25 MiB；HTTP 请求超时为 20 秒。登录态、防盗链、临时 URL 或不支持的格式都可能导致图片未本地化。
- 150 MiB 是累计**纳入本地引用的图片预算**。当前代码在下载落盘后检查累计预算，因此它不是严格的网络流量或磁盘上限，`assets/` 中可能留下未被正文引用的文件。
- 已有目录发生秒级命名冲突、路径/权限异常或正文过短时，命令可能失败；失败后也可能留下部分文件，可到输出目录检查。
- 正文提取、表格、数学公式和元信息都可能损失细节，重要材料需要对照网页。本项目没有覆盖所有网站的自动化测试套件。

## 修改和维护

```sh
git pull --ff-only             # 仅适用于 Git 克隆
npm ci
npm exec tsc -- --noEmit
npm run build                 # 当前脚本导出至 dist/，用于构建检查
npm run dev                   # 将更新同步到本机 Raycast
```

构建成功后可停止开发监听。修改显示名称只需调整 `package.json` 的 `commands[0].title`；若改 `commands[0].name`，还必须同步修改源码入口文件名。自动生成的 `raycast-env.d.ts` 应由 Raycast 工具重新生成。

主要实现集中在 [src/capture-webpage-as-md-for-lzengan.ts](src/capture-webpage-as-md-for-lzengan.ts)：`pageMetadata` 提取元信息，`selectContent` 选择正文，`prepareContent` 清理内容，`localizeImages` 下载配图，`toMarkdown` 转换正文，`capture` 组织整个流程。`OUTPUT_ROOT` 控制保存目录。

这些命令检查依赖、类型和构建，不等于已经在每一种浏览器和网站上完成实际使用验证。

## 同一套 Raycast 阅读工具

三个项目可以独立使用，根据材料和任务选择：

| 项目 | 适合做什么 |
| --- | --- |
| **本项目** | 把已经打开的网页整理为本地 Markdown 和图片，不调用 AI |
| [DeepSeek PDF Summary](https://github.com/Johnnyzlee/raycast-deepseek-pdf-summary) | 从 PDF 图文生成中文摘要，再交接到 AI Chat |
| [DeepSeek Raycast Adapter](https://github.com/Johnnyzlee/raycast-deepseek-adapter) | 在同一个 AI Chat 中衔接本地工具、原生联网与文件图文问答 |

[个人 Raycast 工作流](https://johnnyzlee.github.io/blogs/arsenal/raycast-workflow.html)记录这套工具的使用背景和配置。

## 许可

[MIT License](LICENSE)。个人项目，与 Raycast 或网站内容提供方无隶属关系。保存和分享网页内容时，仍应遵守原内容的访问权限和版权要求。

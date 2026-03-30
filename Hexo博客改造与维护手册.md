### 2026-03-22 默认封面替换与本地插画生成
1. 新增 `tools/generate-default-cover-art.js`，专门处理 front-matter 里仍然引用默认外链封面的文章。
2. 脚本会自动为文章创建同名资源目录，生成本地 `cover.png`，再把文章里的 `cover:` 回写成 `cover.png`。
3. 当前生成风格是轻量卡通 + 写实混合，会结合文章路径、标题、首段内容和首个正文标题来选择视觉模板。
4. 如果以后又出现一批默认封面文章，直接在博客根目录执行 `npm run cover:generate` 即可再次批量生成。
5. 生成器只会改默认封面文章，不会覆盖你原本已经手工设置好的其他封面。

### 2026-03-22 音频体积优化
1. 将 `source/music/夢をあきらめないで.mp3` 从 320 kbps 压缩为 128 kbps，用于明显降低线上首播等待时间与卡顿概率。
2. 将 `source/music/evening-journey.mp3` 也同步从 320 kbps 压缩为 128 kbps，避免以后切歌时又遇到同样的问题。
3. 当前这类博客背景音乐更适合控制在 `96 kbps ~ 128 kbps`。对人声和轻音乐来说，网页播放通常已经足够。
4. 如果以后再换歌，推荐直接使用下面这条免费命令压缩：
   `ffmpeg -y -i input.mp3 -codec:a libmp3lame -b:a 128k -map_metadata 0 -id3v2_version 3 output.mp3`

### 2026-03-22 本地预览与发布命令说明
1. 现在这个项目最推荐的本地预览命令是 `npm run server`。它会先生成一次 `public/`，再以当前已经修好的静态模式启动预览，最适合检查播放器、音频跳转和样式。
2. 如果你正在改文章或页面内容，想一边修改一边自动更新，就额外开一个终端执行 `npm run watch`。
3. `npx hexo server` 也能用，但它不会像 `npm run server` 一样先帮你生成最新静态文件，所以更容易看到旧内容。
4. `hexo s` 依赖全局安装的 Hexo 版本，在这个仓库里不再作为首选命令。
5. 发布时优先用 `npm run deploy`。如果发布前想手动确认一次，就先执行 `npm run clean`、`npm run build`，确认无误后再执行 `npm run deploy`。

# Hexo 博客改造与维护手册

### 2026-03-22 本地音频跳转根因修复
1. 真正根因不是播放器前端，而是 `hexo server` 的动态路由模式对本地 MP3 不支持 `Range` 请求，所以浏览器 seek 时会回退到 `0:00`。
2. 现在项目已通过 `scripts/server-static-default.js` 把 `hexo server` 默认切到静态模式，本地音频可以正确分段读取。
3. `package.json` 里的 `npm run server` 也改成了“先生成再启动”，避免 `public/` 过旧。
4. 如果你在写博客时希望边改边更新，请额外开一个终端执行 `npm run watch`，它会在你修改 `source/`、主题注入资源或页面内容后持续重新生成静态文件。
5. 如果你只是测试播放器、样式或本地页面效果，只执行 `npm run server` 就够了，不必同时开 `watch`。
6. 验证本地服务是否已支持跳转：
   `curl -I -H "Range: bytes=100000-100100" http://127.0.0.1:4000/music/夢をあきらめないで.mp3`
   正常应返回 `206 Partial Content`，而不是 `200 OK`。

### 2026-03-22 时序歌词滚动与留白修复
1. 歌词高亮不再使用 `scrollIntoView()`，而是只滚动歌词列表容器本身，避免整页被自动带着往下跑。
2. 歌词列表加入了 `overscroll-behavior: contain`，减少触摸板或鼠标滚轮把外层页面一起拖动的情况。
3. 紧凑模式下歌词列表去掉了固定最小高度，改为按内容自适应并保留上限，因此底部不再出现明显空白块。

### 2026-03-19 进度条交互重构（最终修复）
1. 进度条已从原生 `range` 改为自绘 slider，点击、拖动、键盘跳转都走同一套 seek 逻辑，不再互相打架。
2. `pointercancel` 已单独处理，不会再把取消事件里的异常坐标误当成有效进度，因此不会再被重置到 `0:00`。
3. 进度条跳转与歌词点击现在都统一走 `applySeekTime()`，时间与歌词会同步更新。
4. 已在 `_config.butterfly.yml` 给播放器 CSS/JS 增加版本号参数（`?v=20260319e`），如果本地还看到旧行为，请先强刷页面。

## 2026-03-19 音乐播放器修复记录（LRC 双语 / 拖动进度 / 间奏留白）

这次修复了你反馈的三个问题：

1. 进度条现在支持稳定拖动跳转。拖动时会进入 `seek` 状态，避免被 `timeupdate` 回写打断。
2. 双语 LRC 会按同起始时间自动合并，播放器里会按换行展示原文 + 中文。
3. 歌词只在当前句有效时间段内显示，进入间奏后会自动留白，不再持续挂着上一句。

后续你自己换歌时，建议遵循这三点：

- `.lrc` 使用标准时间标签格式。
- 双语同一句尽量用同一个起始时间标签。
- 如果希望某段强制清屏，可在间奏起点加一个空歌词时间标签（如 `[01:52.50]`）。

验证命令：

```bash
npm run build
npm run server
```

### 2026-03-19 第二轮 UI 优化补充
1. 紧凑模式下已移除封面区唱片叠层，改为单封面卡片，避免“像两张图重叠”的观感。
2. 顶部提示改为单行省略样式，减少视觉拥挤。
3. 主体卡片的间距、字号、底部状态区与控制区已进一步压缩，整体更协调。

这份手册只围绕当前目录中的 Hexo 博客部分编写，目标是让你以后即使不记得细节，也能按步骤维护博客。

---

## 1. 先说结论：你现在的博客是怎样搭起来的

你当前博客的实际技术结构是：

- 博客框架：`Hexo 8.1.1`
- 主题：`Butterfly 5.5.4`
- Markdown 渲染器：`hexo-renderer-markdown-it`
- 部署方式：`hexo-deployer-git`
- 站点地址：`https://hydrogen1222.com.cn`
- 当前系统：`Gentoo Linux`

有一个很重要的现实情况：

- 你的博客目录和 Obsidian 知识库目录混在同一个大文件夹里。
- 真正和博客强相关的，主要只有根目录配置文件、`source/`、`scaffolds/`、`package.json`、`node_modules/`、`public/`、`.deploy_git/` 这些位置。
- 其他像 `A-专业知识`、`B-科研笔记`、`C-生活规划`、`.obsidian` 等，主要是 Obsidian 内容，不是 Hexo 的核心运行结构。

所以以后维护博客时，你可以优先盯住下面这些文件和文件夹。

---

## 2. 这个目录里，哪些文件最重要

### 2.1 博客根配置

`_config.yml`

这是 Hexo 的总站配置，常见用途：

- 网站标题
- 作者
- 语言
- 时区
- 站点域名
- 部署到 GitHub Pages 的地址
- 主题名称
- Markdown 渲染设置

你现在最关键的几项已经是：

- `theme: butterfly`
- `url: https://hydrogen1222.com.cn`
- `deploy.repo: git@github.com:hydrogen1222/hydrogen1222.github.io.git`

### 2.2 主题配置

`_config.butterfly.yml`

这是 Butterfly 主题的主配置文件。你以后想改这些内容，基本都在这里：

- 顶部导航
- 头像
- 背景图
- 首页横幅
- 页脚
- 侧边栏
- 社交链接
- 评论系统
- 自定义注入的 CSS/JS

### 2.3 文章和页面内容

`source/`

这是博客内容的主文件夹。

常见位置：

- `source/_posts/`：文章
- `source/about/index.md`：关于页
- `source/guestbook/index.md`：留言页
- `source/tags/index.md`：标签页
- `source/categories/index.md`：分类页
- `source/link/index.md`：友链页
- `source/img/`：通用图片
- `source/css/`：你自己写的样式
- `source/js/`：你自己写的脚本
- `source/music/`：现在新增的本地音乐文件

### 2.4 友情链接数据

`source/_data/link.yml`

这个文件专门控制友链页面内容。

### 2.5 依赖说明

`package.json`

这个文件相当于“项目需要哪些 npm 包”的清单。

### 2.6 已安装依赖

`node_modules/`

这是实际安装下来的依赖包。它和操作系统有关。

重点提醒：

- `node_modules` 不是跨平台万能的。
- 你之前在 Windows 11 下搭好的依赖，拿到 Gentoo 后，可能因为系统架构不同而报错。
- 如果以后你再次跨系统迁移，优先执行一次 `npm install`。

### 2.7 生成后的静态网页

`public/`

这是 Hexo 生成出来、准备用来发布的网站文件。

可以理解成：

- `source/` 是原材料
- `public/` 是烤出来的成品

### 2.8 部署仓库

`.deploy_git/`

这个目录是 Hexo 部署到 GitHub Pages 时使用的中间 Git 仓库。

通常不需要手动改。

---

## 3. 你现在的主题是怎么接入的

这个项目有一点和很多教程不同：

- `themes/` 目录几乎是空的
- 主题实际来自 `node_modules/hexo-theme-butterfly`

这意味着以后改主题时，尽量遵循下面这个原则：

- 优先改 `_config.butterfly.yml`
- 优先在 `source/css/`、`source/js/` 里加自己的文件
- 尽量不要直接改 `node_modules/hexo-theme-butterfly` 里的源码

原因很简单：

- 直接改 `node_modules`，以后 `npm install` 或升级时可能被覆盖
- 自己的样式和脚本留在 `source/` 更稳、更容易维护

---

## 4. 现在这套博客的日常工作流

以后你最常用的，其实只有下面这 6 步。

### 4.1 进入博客根目录

```bash
cd /home/storm/claudecode/codex/MyNewBlog/BCS-Academic-Vault-master
```

### 4.2 如果是跨系统迁移后第一次运行，先装依赖

```bash
npm install
```

为什么一定记住这一步：

- Hexo 的某些依赖包含平台相关文件
- Windows 下能跑，不代表 Linux 下能直接跑
- 本次在 Gentoo 上就实际遇到了这个问题，`npm install` 后已经修复

### 4.3 本地预览博客

```bash
npm run server
```

或者：

```bash
npx hexo server
```

默认访问地址通常是：

```txt
http://localhost:4000/
```

### 4.4 生成静态网页

```bash
npm run build
```

或者：

```bash
npx hexo generate
```

### 4.5 清理缓存后重新生成

当页面显示异常、样式不更新、文章链接不对时，优先执行：

```bash
npm run clean
npm run build
```

或者一步一步写成：

```bash
npx hexo clean
npx hexo generate
```

### 4.6 部署到 GitHub Pages

```bash
npm run deploy
```

或者：

```bash
npx hexo deploy
```

如果你想最稳妥地重新发布，建议用：

```bash
npx hexo clean
npx hexo generate
npx hexo deploy
```

---

## 5. 以后发新文章，应该怎么做

### 5.1 新建文章

推荐命令：

```bash
npx hexo new "文章标题"
```

例如：

```bash
npx hexo new "测试文章"
```

Hexo 会自动在 `source/_posts/` 里生成一个 `.md` 文件。

### 5.2 文章实际存放位置

你当前配置启用了：

- `post_asset_folder: true`

这意味着：

- 一篇文章通常对应一个 `.md` 文件
- 同时可以有一个同名资源文件夹，专门放这篇文章的图片

例如：

- `source/_posts/测试文章.md`
- `source/_posts/测试文章/图片1.png`

这是很适合你当前 Obsidian 图片使用习惯的。

### 5.3 文章头部格式

每篇文章开头通常都有一段 `Front-matter`，也就是：

```yaml
---
title: 测试文章
date: 2026-03-18 12:00:00
categories:
  - 分类名
tags:
  - 标签1
  - 标签2
cover: cover.png
---
```

常用字段说明：

- `title`：文章标题
- `date`：发布时间
- `categories`：分类
- `tags`：标签
- `cover`：封面图

### 5.4 插图怎么放

你当前博客非常适合这种做法：

1. 把图片放到文章同名资源文件夹里
2. 在文章中用相对路径引用

例如：

```md
![示意图](测试文章/image-001.png)
```

---

## 6. 如果要修改网站常见内容，改哪里

### 6.1 修改网站名称、副标题、作者

文件：

`_config.yml`

看这些字段：

- `title`
- `subtitle`
- `author`
- `language`
- `timezone`

### 6.2 修改导航栏菜单

文件：

`_config.butterfly.yml`

看这个区域：

```yaml
menu:
  首页: / || fas fa-home
  归档: /archives || fas fa-archive
  标签: /tags || fas fa-tags
  分类: /categories || fas fa-folder-open
  留言: /guestbook/ || fas fa-comments
  关于: /about/ || fas fa-heart
```

如果你想新增页面入口，通常要做两件事：

1. 先创建页面
2. 再把链接加到 `menu`

### 6.3 修改社交链接

文件：

`_config.butterfly.yml`

看 `social:` 区域。

### 6.4 修改头像、背景图、首页大图

文件：

`_config.butterfly.yml`

常见字段：

- `avatar.img`
- `default_top_img`
- `index_img`
- `archive_img`
- `tag_img`
- `category_img`
- `background`

### 6.5 修改页脚文字

文件：

`_config.butterfly.yml`

看：

```yaml
footer:
  custom_text: 欢迎来到我的个人博客！
```

### 6.6 修改友链

文件：

`source/_data/link.yml`

### 6.7 修改留言页、关于页等页面内容

直接改这些 Markdown 文件：

- `source/about/index.md`
- `source/guestbook/index.md`
- `source/link/index.md`
- `source/shuoshuo/index.md`

---

## 7. 你当前已经有的自定义功能

### 7.1 自定义字体和视觉微调

文件：

- `_config.butterfly.yml`
- `source/css/my-font.css`

目前已经做了这些事：

- 引入落霞文楷
- 统一文章和页面字体
- 卡片加磨砂玻璃效果
- 背景固定
- 滚动条美化

### 7.2 自动封面脚本

文件：

`auto_cover.js`

这个脚本的作用是：

- 遍历 `source/_posts/`
- 尝试找到文章第一张图
- 自动设置为封面
- 找不到时就使用默认封面

这不是 Hexo 内建功能，而是你自己项目里的辅助脚本。

如果以后要用它，一定先看脚本里的配置：

- `postsDir`
- `defaultCover`
- `dryRun`

---

## 8. 本次新增的音乐系统，怎么理解

这次我给博客加的是：

- 本地自托管音频
- 自定义悬浮播放器
- 首次访问尝试自动播放
- 用户可手动暂停、静音、关闭、重新打开
- 后续页面默认不再自动播放

### 8.1 为什么我选择“本地自托管音频”

因为它最适合你的需求：

- 不依赖网易云
- 不依赖第三方播放器服务
- 不容易突然失效
- 你完全能控制音频文件
- 后续更换音乐也简单

### 8.2 音乐相关文件在哪里

#### 音乐文件

`source/music/夢をあきらめないで.mp3`

#### 音乐封面

`source/music/liberte.jpg`

#### 歌词文件

`source/music/夢をあきらめないで.lrc`

#### 音乐配置

`source/js/blog-music-config.js`

#### 音乐脚本

`source/js/blog-music-player.js`

#### 音乐样式

`source/css/music-player.css`

### 8.3 当前默认音乐是什么

当前默认音乐是：

- 曲名：`夢をあきらめないで`
- 作者：`Takako Okamura`
- 当前接入方式：本地 MP3 文件
- 歌词方式：本地 LRC 文件
- 封面方式：本地 SVG 文件

这意味着：

- 没有第三方播放器依赖
- 你可以同时控制音频、封面、歌词
- 以后也可以直接换成你自己的本地音乐文件

### 8.4 自动播放是怎样判断的

逻辑是这样的：

1. 用户第一次访问网站时，播放器会尝试自动播放
2. 如果浏览器拦截了“直接有声自动播放”，播放器会再尝试静音预热
3. 一旦用户第一次点击、触摸或按键，播放器会自动再试一次，并优先把静音状态恢复成有声
4. 这次“首次访问机会”用过后，后续页面就不再重复自动播放
5. 如果用户手动关闭音乐，后续页面也会保持关闭状态

这里要特别知道一件事：

- 现代浏览器经常会拦截“未经用户操作的有声自动播放”

所以真实效果是：

- 浏览器允许时，会自动播放
- 浏览器不允许时，播放器会先尽量做静音预热，并在访客第一次触碰页面时自动恢复声音
- 但如果浏览器或容器本身策略更严格，仍可能需要访客手动点一下播放键

这不是你博客写错了，而是浏览器本身的限制。

如果你以后把博客包进自己可控的 App 容器里，情况会不一样：

- Android WebView 宿主应用可以设置 `setMediaPlaybackRequiresUserGesture(false)`
- iOS 的 WKWebView 宿主应用也有媒体播放相关配置

也就是说：

- 纯网页站点无法承诺所有浏览器都“必定有声自动播放”
- 但自定义 App 壳如果由你自己控制，有机会把限制再放宽

### 8.5 音量为什么默认比较小

因为你要求：

- 不影响阅读
- 音量合适

所以默认音量被设置成比较温和的值。

如果想改默认音量，去改：

`source/js/blog-music-config.js`

看这里：

```js
defaultVolume: 0.18,
```

数值范围：

- `0` = 静音
- `1` = 最大音量

一般建议：

- `0.12` 到 `0.22` 适合背景音乐

### 8.6 新版播放器如何拖动

新版播放器支持拖动，位置会记忆。

拖动方式：

- 直接拖动左侧的唱片本体
- 或者拖动面板顶部那个六点手柄

适用场景：

- 电脑鼠标拖动
- 手机触摸拖动

如果你拖到边缘，播放器会自动限制在屏幕范围内，避免被拖出可视区域。

### 8.7 新版播放器现在有哪些视觉特征

这次播放器已经不是之前那个偏小的悬浮卡片了，而是升级成了：

- 大尺寸玻璃质感主面板
- 左侧“封面卡片 + 黑胶唱片”舞台
- 更明显的氛围光效和流动光晕
- 更大的中央播放按钮
- 右侧独立歌词栏
- 播放时唱片旋转、光效漂移、节奏柱跳动

如果你觉得还想继续往“更夸张”或“更克制”两个方向调，我后面也可以继续改。

### 8.8 本地歌词文件怎么写

现在播放器支持读取本地 `.lrc` 文件。

默认文件：

`source/music/夢をあきらめないで.lrc`

推荐格式：

```txt
[00:12.00]第一句歌词
[00:18.50]第二句歌词
[00:25.80]第三句歌词
```

规则说明：

- 方括号里是时间
- `00:12.00` 的意思是 0 分 12 秒
- 后面紧跟歌词内容
- 一行对应一句

播放器会自动：

- 根据播放时间高亮当前行
- 让歌词滚动到合适位置
- 点击某一行歌词时跳转到对应时间

---

## 9. 以后如果你想换成自己的音乐，最简单的做法

这是你以后最常用的一部分，我写成最实操的步骤。

### 方法 A：换成本地音乐文件，最推荐

#### 第一步：把音乐文件放到这里

```txt
source/music/
```

例如你放一个文件：

```txt
source/music/my-song.mp3
```

#### 第二步：打开配置文件

文件：

`source/js/blog-music-config.js`

#### 第三步：改这几项

例如改成：

```js
window.BLOG_MUSIC_CONFIG = {
  enabled: true,
  storageNamespace: "storm-blog-music",
  autoplayOnFirstVisit: true,
  defaultVolume: 0.18,
  fadeInDuration: 1400,
  accentColor: "#7edcff",
  secondaryAccent: "#bb9cff",
  warmGlowColor: "#ffd68f",
  track: {
    title: "My Song",
    artist: "Your Name",
    subtitle: "Personal Theme",
    eyebrow: "Moonlight Broadcast",
    ambience: "本地自托管单曲 · 玻璃氛围播放器 · LRC 时序歌词",
    src: "/music/my-song.mp3",
    cover: "/music/my-cover.svg",
    lyrics: "/music/my-song.lrc",
    loop: true,
    sourceUrl: "",
    sourceLabel: ""
  }
};
```

这里最关键的是：

- `src` 要写成网站路径，不是 Linux 本地绝对路径
- 所以写 `/music/my-song.mp3`
- 不要写成 `/home/storm/...`
- `cover` 也写网站路径，比如 `/music/my-cover.svg`
- `lyrics` 也写网站路径，比如 `/music/my-song.lrc`

#### 第四步：重新生成预览

```bash
npx hexo clean
npx hexo generate
npx hexo server
```

#### 第五步：确认没问题后再部署

```bash
npx hexo deploy
```

### 方法 B：用在线音频

也可以，但我不推荐作为长期方案。

原因：

- 第三方站点可能失效
- 可能有跨域、限流、加载慢的问题
- 一旦链接失效，播放器就没声音了

如果你真的要用在线音频，也还是改：

`source/js/blog-music-config.js`

把：

```js
src: "/music/夢をあきらめないで.mp3",
```

改成：

```js
src: "https://example.com/your-audio.mp3",
```

---

## 10. 如何判断“我改对了没有”

每次改完博客，建议按下面的顺序检查。

### 10.1 先本地预览

```bash
npx hexo clean
npx hexo generate
npx hexo server
```

### 10.2 再检查这 6 件事

1. 首页能否正常打开
2. 一篇文章页面能否正常打开
3. 图片是否显示
4. 音乐播放器是否出现
5. 首次访问是否会尝试自动播放
6. 切换到其他页面后是否不会再次自动播放

### 10.3 最后再部署

```bash
npx hexo deploy
```

---

## 11. Gentoo 下你以后最可能遇到的问题

### 11.1 `npx hexo version` 或 `npx hexo server` 报依赖错误

先执行：

```bash
npm install
```

这是最优先的排查动作。

### 11.2 改了文件，但网页没变化

按顺序执行：

```bash
npx hexo clean
npx hexo generate
npx hexo server
```

### 11.3 图片丢失

检查三件事：

1. 图片文件是否真的在 `source/` 里面
2. 引用路径是否写对
3. 是否误把 Linux 路径写进了 Markdown

### 11.4 音乐播放器出现了，但没声音

按顺序检查：

1. `source/music/` 里是否真的有对应音频文件
2. `source/js/blog-music-config.js` 里的 `src` 是否匹配
3. 浏览器是否拦截了自动播放
4. 播放器是否被手动静音
5. 本地控制台是否有 404 错误

### 11.5 部署后线上和本地不一致

先重新完整跑一遍：

```bash
npx hexo clean
npx hexo generate
npx hexo deploy
```

---

## 12. 你维护博客时，最安全的修改顺序

以后每次改博客，我建议你都按下面的顺序来。

1. 先改 `source/` 或 `_config*.yml`
2. 本地运行 `npx hexo clean && npx hexo generate`
3. 本地运行 `npx hexo server`
4. 浏览器确认效果
5. 满意后再 `npx hexo deploy`

如果你要做“大改版”，最好先备份下面这些内容：

- `_config.yml`
- `_config.butterfly.yml`
- `source/`
- `package.json`
- `package-lock.json`

---

## 13. 关于这个目录，哪些东西尽量不要乱动

### 可以大胆改的

- `_config.yml`
- `_config.butterfly.yml`
- `source/`
- `source/_data/`
- `source/css/`
- `source/js/`
- `source/music/`

### 不建议随便直接改的

- `node_modules/`
- `public/`
- `.deploy_git/`

原因：

- `node_modules/` 是依赖安装结果
- `public/` 是生成结果
- `.deploy_git/` 是部署中间产物

如果要清理，一般用命令，不要直接手删核心内容。

---

## 14. 这次改造后，你最值得记住的三个文件

如果以后你只记得 3 个地方，请记住这三个：

1. `_config.butterfly.yml`
2. `source/js/blog-music-config.js`
3. `source/_posts/`

它们分别对应：

1. 主题外观和页面功能
2. 音乐播放器配置
3. 文章内容本身

---

## 15. 给未来自己的短版备忘录

如果哪天你很急，只看这段就够：

### 日常预览

```bash
npx hexo clean
npx hexo generate
npx hexo server
```

### 发布上线

```bash
npx hexo clean
npx hexo generate
npx hexo deploy
```

### 换音乐

1. 把音乐文件放进 `source/music/`
2. 改 `source/js/blog-music-config.js`
3. 本地预览
4. 没问题再部署

### 跨系统后跑不起来

```bash
npm install
```

---

如果后面你继续让我帮你改博客，这份手册就可以当作我们的共同基线，不用每次从头重新摸索。

---

## 16. 自动播放与播放器尺寸调节（2026-03 更新）

### 16.1 自动播放的实际行为

当前博客音乐播放器会按下面策略运行：

1. 首次访问会尝试自动播放。
2. 如果浏览器拦截“有声自动播放”，播放器会先尝试静音预热。
3. 用户第一次点击/触摸页面后，会再次尝试恢复有声播放。
4. 首次自动播放尝试完成后，不会在后续页面重复“强制自动播放”。

这属于现代浏览器的通用限制，不是博客配置错误。

### 16.2 现在如何调播放器大小（推荐方式）

请直接修改：

- `source/js/blog-music-config.js`

新增并已启用的关键参数：

```js
compactMode: true,
uiScale: 0.78,
lyricsAutoOpenMinWidth: 1800,
compactCollapseWidth: 1680,
```

参数说明：

- `compactMode`：是否使用紧凑布局。`true` 为更协调的小尺寸风格。
- `uiScale`：播放器缩放系数，建议 `0.72 ~ 0.95`。
- `lyricsAutoOpenMinWidth`：仅当视口宽度大于该值时，歌词侧栏才默认展开（可避免播放器在普通桌面宽度下显得过大）。
- `compactCollapseWidth`：在紧凑模式下，当视口宽度低于该值时，歌词栏会优先收起（即使之前本地记忆过“展开”也会先收起）。

### 16.3 推荐调参区间

- 想再小一点：`uiScale: 0.74`
- 当前平衡值：`uiScale: 0.78`
- 想恢复偏大：`uiScale: 0.86` 或更高

如果你希望歌词栏几乎总是折叠，可以把 `lyricsAutoOpenMinWidth` 和 `compactCollapseWidth` 都调到 `1900` 以上。

### 16.4 修改后验证流程

```bash
npm run clean
npm run build
npm run server
```

检查点：

1. 播放器初始体积是否协调。
2. 首次访问是否按预期尝试自动播放。
3. 歌词栏默认是否符合你设定的屏宽策略。

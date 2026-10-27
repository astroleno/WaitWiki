# 知涟 WaitWiki

等一段回答，读一段知识。Chrome Manifest V3 扩展，当前版本 **1.4.0**，需要 Chrome 102+。

## 当前体验

- 只内置 bg-027「极简混凝土展墙」一个阅读背景。默认纯色；开启背景后固定使用这一张，文字直接显示在灰色墙面上，无白色卡片或底板。
- 新装默认无交互 2 秒收起，可设置 1–120 秒或关闭自动收起。悬停或键盘焦点位于内容中时保持，离开后重新计时；手动收起不会被同一轮的重复发送通知重新打开。
- 重开保留当前内容和滚动位置；支持锁定、主动换内容、收藏与最近阅读。阅读记录仅保存在本机，不保存聊天正文或聊天地址。
- 保留九类内容：百科摘要、名言、数字趣闻、生活建议、猫咪趣闻、知识问答、调酒、数据真相和偈语。在线来源失败时明确标注本地备用内容。
- 跟随系统、白天与暗夜；可调宽度、环境光影。工具在悬停/聚焦时出现，不移动内容；Esc 可收起。
- 扩展图标打开快速设置；“完整设置、收藏与最近”进入本地设置页。清除本地数据可删除收藏、最近和缓存，保留同步偏好。
- 旧的有效开关、外观、内容类型和时长会迁移。WaitWiki 旧场景归一为 bg-027；旧版 10/20 秒和常驻偏好保留。

## 安装与验证

将 `dist/waitwiki-1.4.0.zip` 解压到独立目录，在 Chrome 扩展程序页面开启开发者模式，选择“加载已解压的扩展程序”。更新后重新加载扩展及 AI 网页。

站点范围由 manifest 的具体 AI 域名限定，涵盖 ChatGPT、Claude、Gemini、Copilot/Bing、Kimi、Grok、DeepSeek、元宝及豆包。各站点的登录限制、网络状况和 DOM 变化仍会影响触发；不能把受控测试页面验证等同于所有在线站点联调通过。扩展识别网页中的发送操作，不读取模型回复，也不把展示定时器当作任务完成信号，不接入 macOS Hook。

源码需要 Node.js 18+ 与 Python 3，无 npm 运行依赖：

```sh
npm run check
npm run preview -- --port 8768
npm run build
```

开发预览使用明确标注的 Chrome API/内容替身；真实 MV3 安装验证使用独立 Chrome for Testing 配置。验证记录及未覆盖项见 [同步验证](docs/2026-10-27-extension-sync-verification.md)，商店准备材料见 [上架说明](docs/store-readiness.md)。

## 资源与共享模块

ArtBreeze 维护共享渲染、生命周期和设置代码；两个产品分别带本地副本。目录和素材按产品生成，本产品只有一个场景，无运行时跨仓或 ArtDuo 服务依赖。

```sh
python3 scripts/sync-gallery.py --from /path/to/artbreeze/gallery --to /path/to/WaitWiki/gallery --product waitwiki
```

场景来源、挂画区、原图及分发图哈希记录于 `gallery/scenes.json`。资源重新制备需要 Pillow 与 libwebp（cwebp/dwebp），普通构建不需要。安装包只包含运行文件、必要本地内容与隐私说明，排除测试、研究资料、旧 chrome_store 和截图。

## 来源与隐私

在线内容继续沿用 Wikipedia、ZenQuotes、Quotable、Numbers API、Advice Slip、Cat Facts、The Trivia API 和 TheCocktailDB；数据真相与偈语保留原有 CSV，旧版备用条目保留原署名。Gapminder 改写材料带来源及 CC BY 提示；Wikipedia、ZenQuotes 及 Gapminder 的必要来源显示不随普通来源开关隐藏。
背景来自用户指定的 ArtDuo 集合，是生成的想象展厅，不是真实博物馆摄影。按用户要求保留既有素材并注明引用；引用、公开访问和历史上架经历不能证明所有内容均获得独立分发授权。具体权利以来源及适用许可为准，代码的既有 MIT 声明不覆盖第三方内容。

[隐私说明](privacy.md) · [场景来源](gallery/SOURCES.md) · [设计说明](docs/gallery-design.md)

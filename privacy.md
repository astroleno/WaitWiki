# 知涟 WaitWiki 隐私政策

更新日期：2026-10-27。

WaitWiki 不运营用于收集聊天或个人身份信息的服务器。页面脚本仅在清单列出的 AI 站点运行，用于识别输入操作和显示知识；不会把输入的聊天文本发送给知识服务。

## 保存的数据

- 用户偏好保存在 Chrome `storage.sync`；启用浏览器同步时，Chrome 可通过用户浏览器账号同步这些设置。
- 知识缓存、内容类型偏好统计和加载性能记录保存在 `storage.local`，用于本地轮换和预加载，不上传到扩展开发者。
- 场景图片和匹配配置随包发布。自动匹配和昼夜效果在本地运行，不增加背景服务或追踪请求。

## 外部内容

原有内容功能可能访问 Wikipedia / Wikimedia、Zen Quotes、Quotable、Numbers API、Advice Slip、Cat Facts、The Trivia API、TheCocktailDB 等提供方。普通内容请求会让提供方收到请求 IP 与请求资源等网络信息；请求不包含聊天文本。点击来源链接后，浏览器会访问对应网站。

## 权限与删除

`storage` 用于设置与缓存，`activeTab` 用于用户主动操作扩展，站点权限用于 AI 页面中的知识展示及公开内容获取。扩展不要求访问所有网站。卸载会移除扩展的本地缓存；同步数据由 Chrome 的同步设置管理。

问题与建议可通过 [GitHub Issues](https://github.com/astroleno/WaitWiki/issues) 反馈。

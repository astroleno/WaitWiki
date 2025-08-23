# WaitWiki API 资源文档

## 概述
本文档整理了适合 WaitWiki 插件使用的各种有趣 API，涵盖知识、冷知识、名言、历史事件等多种类型。这些 API 将用于在 LLM 等待期间展示有趣的知识内容。

---

## 🧠 核心知识类 API

### 1. Wikipedia API
**优先级：最高**
- **随机摘要**: `https://en.wikipedia.org/api/rest_v1/page/random/summary`
- **每日精选**: `https://api.wikimedia.org/feed/v1/wikipedia/en/featured/YYYY/MM/DD`
- **历史上的今天**: `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/all/MM/DD`
- **多语言支持**: 将 `en` 替换为 `zh`、`ja` 等语言代码
- **特点**: 权威、内容丰富、多语言、无需 API Key

### 2. Zen Quotes API
**推荐指数：⭐⭐⭐⭐⭐**
- **端点**: `https://zenquotes.io/api/random`
- **批量**: `https://zenquotes.io/api/quotes`
- **特点**: 无需认证、高质量名言、每秒5次限制
- **响应格式**: JSON `{q: "名言内容", a: "作者"}`

### 3. Quotable API
**推荐指数：⭐⭐⭐⭐⭐**
- **随机名言**: `https://api.quotable.io/random`
- **按作者**: `https://api.quotable.io/quotes?author=作者名`
- **按标签**: `https://api.quotable.io/quotes?tags= inspirational`
- **特点**: 开源、无需认证、支持筛选

### 4. Facts API (API Ninjas)
**推荐指数：⭐⭐⭐⭐**
- **端点**: `https://api.api-ninjas.com/v1/facts`
- **参数**: `limit=1` (限制返回数量)
- **认证**: 需要 API Key (免费额度充足)
- **特点**: 科学、文学、哲学等多领域有趣事实

---

## 📅 历史与时间相关 API

### 5. Numbers API
**推荐指数：⭐⭐⭐⭐**
- **随机数字事实**: `http://numbersapi.com/random/trivia`
- **日期事实**: `http://numbersapi.com/{month}/{day}/date`
- **数学事实**: `http://numbersapi.com/random/math`
- **特点**: 无需认证、趣味性强、适合每日内容

### 6. Historical Events API (API Ninjas)
**推荐指数：⭐⭐⭐⭐**
- **端点**: `https://api.api-ninjas.com/v1/historicalevents`
- **参数**: `text=关键词`, `year=年份`, `month=月份`, `day=日期`
- **认证**: 需要 API Key
- **特点**: 支持公元前年份、数据详尽

---

## 🎯 趣味知识类 API

### 7. The Trivia API
**推荐指数：⭐⭐⭐⭐**
- **端点**: `https://the-trivia-api.com/v2/questions`
- **参数**: `limit=1`, `categories=知识类别`, `difficulty=难度`
- **特点**: 问答形式、多类别、无需认证

### 8. Advice Slip API
**推荐指数：⭐⭐⭐**
- **随机建议**: `https://api.adviceslip.com/advice`
- **特点**: 幽默、生活建议、无需认证

### 9. Cat Facts API
**推荐指数：⭐⭐⭐**
- **端点**: `https://catfact.ninja/fact`
- **特点**: 关于猫咪的有趣事实、无需认证

---

## 🔬 科学与自然 API

### 10. NASA APOD API
**推荐指数：⭐⭐⭐⭐**
- **天文图片**: `https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY`
- **认证**: 免费使用 DEMO_KEY (有限制)，注册后限制更高
- **特点**: 每日天文图片、专业解释、视觉效果佳

### 11. Fruit API
**推荐指数：⭐⭐⭐**
- **端点**: `https://www.fruityvice.com/api/fruit/random`
- **特点**: 水果营养信息、科学知识、无需认证

---

## 🎨 娱乐与文化 API

### 12. The Movie Database (TMDB) API
**推荐指数：⭐⭐⭐⭐**
- **随机电影**: 需要先获取电影列表，然后随机选择
- **电影详情**: `https://api.themoviedb.org/3/movie/{movie_id}`
- **认证**: 需要 API Key (免费)
- **特点**: 电影知识、幕后故事、文化价值

### 13. Cocktail DB API
**推荐指数：⭐⭐⭐**
- **随机鸡尾酒**: `https://www.thecocktaildb.com/api/json/v1/1/random.php`
- **测试密钥**: 可使用 "1" 作为测试
- **特点**: 饮食文化、历史背景、无需认证

---

## 📊 API 使用策略

### 优先级排序
1. **Wikipedia API** - 主要数据源，权威且丰富
2. **Zen Quotes API** - 备用，提供深度思考
3. **Numbers API** - 轻松有趣，适合快速展示
4. **Facts API** - 科学知识，教育价值
5. **NASA API** - 视觉效果佳，激发好奇心

### 缓存策略
- **内存缓存**: 存储最近获取的 50-100 条内容
- **本地存储**: 使用 chrome.storage 持久化缓存
- **过期时间**: 知识类内容 7 天，时效性内容 1 天
- **失败重试**: 网络错误时指数退避重试

### 内容轮换逻辑
1. 优先从缓存中随机选择
2. 缓存不足时调用 API 获取新内容
3. 避免重复展示最近已显示的内容
4. 支持多种类型内容混合展示

### 错误处理
- **网络错误**: 自动重试，最多3次
- **API 限制**: 切换备用数据源
- **数据格式错误**: 使用备用内容
- **认证失败**: 降级到无需认证的 API

---

## 🔧 技术实现要点

### 请求优化
- 使用 Promise.all 并行请求多个 API
- 实现请求去重和节流
- 添加超时处理 (10秒)
- 支持 CORS 的 API 优先

### 数据处理
- 统一不同 API 的响应格式
- 内容长度限制 (适合卡片显示)
- 移除 HTML 标签和特殊字符
- 多语言内容处理

### 用户体验
- 加载状态指示器
- 平滑的淡入淡出动画
- 响应式设计适配不同屏幕
- 深色模式支持

---

## 📝 配置选项建议

### 显示设置
- 内容类型偏好 (知识/名言/历史/科学)
- 语言选择 (中文/英文/日文)
- 刷新频率 (2-5秒可调)
- 卡片样式 (简洁/详细/图片)

### 高级选项
- 自定义 API 端点
- 缓存大小设置
- 网络错误重试次数
- 调试模式开关

---

*最后更新：2025-08-23*
// WaitWiki Content Script V1.2.1 - Knowledge Cards for LLM Waiting Time
// 知涟 WaitWiki - 在AI对话期间展示有趣知识
// 
// 主要功能：
// - 多API数据源集成（维基百科、名言、趣闻、建议、动物、问答、调酒）
// - 智能防重复算法
// - 超时处理和错误恢复
// - 缓存机制和预加载策略
// - 响应式UI和深色模式支持
//
// 技术特性：
// - 安全的DOM操作（防XSS）
// - 扩展上下文失效检测
// - 定时器管理和内存泄漏防护
// - 平台自适应检测

class WaitWiki {
  constructor() {
    // 基础配置
    this.settings = { 
      enabled: true, 
      showSourceInfo: true, 
      showIcon: true, 
      darkMode: false, 
      cardSize: 'medium', 
      language: 'zh',
      contentTypes: ['wikipedia', 'quotes', 'facts', 'advice', 'catfacts', 'trivia', 'cocktails', 'datafacts', 'gathas'],
      displayDuration: '10'
    };

    // 缓存配置
    this.maxCacheSize = 300;
    this.cachedCards = new Map();
    this.globalCacheKey = 'waitwiki_global_cache_v1';
    
    // 防重复机制
    this.lastCardIndex = -1;
    this.recentCards = new Set();
    this.maxRecentCards = 50;
    this.recentContents = new Set();
    this.maxRecentContents = 50;
    // 短期去重：维护最近展示的标题队列，避免短时间内重复
    this.recentTitleQueue = [];
    this.recentTitleQueueSize = 5;
    
    // 批量更新配置
    this.batchUpdateConfig = {
      clickCount: 0,
      batchSize: 15, // 从10次改为15次，减少更新频率
      wikipediaTarget: 80,
      otherTarget: 8,
      lastBatchUpdate: 0,
      batchUpdateInterval: 60000 // 60秒间隔（从30秒改为60秒）
    };
    
    // 定时更新配置
    this.periodicUpdateConfig = {
      enabled: true,
      interval: 180000, // 3分钟间隔（从30秒改为3分钟，减少API调用频率）
      minCacheThreshold: 50, // 缓存低于50时开始定时更新（从30改为50）
      maxCacheThreshold: 250, // 缓存高于250时停止定时更新
      updateTimer: null,
      lastPeriodicUpdate: 0,
      apiCallDelay: 2000 // API调用间隔2秒，避免并发请求
    };
    
    // 性能统计
    this.performanceStats = {
      totalCardsFetched: 0,
      apiCallCount: 0,
      cacheHitRate: 0,
      averageLoadTime: 0,
      // 运行中会使用到以下字段，提前初始化避免 NaN/undefined
      apiSuccessCount: 0,
      apiFailureCount: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      lastResetTime: Date.now()
    };
    
    // 缓存命中统计，fetchKnowledgeCard 中会读写这些字段
    this.cacheStats = {
      hits: 0,
      misses: 0,
      failures: 0
    };
    
    // 用户统计
    this.userStats = {
      cardDisplayCount: 0,
      userPreferences: new Map(),
      // 记录各内容类型被展示的次数，供推荐算法使用
      favoriteContentTypes: new Map()
    };
    
    // 对话状态
    this.conversationState = 'idle';
    this.isShowingCard = false;
    this.hideTimer = null;
    
    // UI元素
    this.ui = {
      container: null,
      content: null,
      source: null,
      icon: null
    };
    
    // 重试机制配置
    this.retryConfig = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffFactor: 2,
      jitter: true
    };
    
    // 失败API记录
    this.failedApis = new Map();
    
    // 错误类型枚举
    this.ErrorTypes = {
      NETWORK: 'network',
      TIMEOUT: 'timeout',
      HTTP_404: 'http_404',
      HTTP_OTHER: 'http_other',
      CORS: 'cors',
      UNKNOWN: 'unknown'
    };

    // 调试与后台日志
    this.debug = false;
    this.log = (...args) => { if (this.debug) console.log('[WaitWiki]', ...args); };
    this.warn = (...args) => { if (this.debug) console.warn('[WaitWiki]', ...args); };
    this.report = (level, message, extra) => {
      try {
        if (chrome && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ action: 'waitwiki_log', level, message, extra });
        }
      } catch (e) { /* 静默 */ }
    };
    
    // 本地备用内容库（减少API依赖）
    this.localContent = {
      quotes: [
        { title: '每日名言', content: '知识就是力量。', source: '培根', type: 'quotes' },
        { title: '每日名言', content: '学而不思则罔，思而不学则殆。', source: '孔子', type: 'quotes' },
        { title: '每日名言', content: '读书破万卷，下笔如有神。', source: '杜甫', type: 'quotes' },
        { title: '每日名言', content: '业精于勤，荒于嬉；行成于思，毁于随。', source: '韩愈', type: 'quotes' },
        { title: '每日名言', content: '时间就是金钱。', source: '富兰克林', type: 'quotes' },
        { title: '每日名言', content: '成功不是偶然的，而是必然的。', source: '爱默生', type: 'quotes' },
        { title: '每日名言', content: '人生就像一面镜子，你对它笑，它就对你笑。', source: '萨克雷', type: 'quotes' },
        { title: '每日名言', content: '最困难的时候，也是离成功最近的时候。', source: '居里夫人', type: 'quotes' },
        { title: '每日名言', content: '天才就是百分之一的灵感加上百分之九十九的汗水。', source: '爱迪生', type: 'quotes' },
        { title: '每日名言', content: '不要等待机会，而要创造机会。', source: '乔治·萧伯纳', type: 'quotes' },
        { title: '每日名言', content: '一个人的价值，应该看他贡献什么，而不应当看他取得什么。', source: '爱因斯坦', type: 'quotes' },
        { title: '每日名言', content: '生活就像一盒巧克力，你永远不知道下一颗是什么味道。', source: '阿甘正传', type: 'quotes' },
        { title: '每日名言', content: '与其用华丽的外衣装饰自己，不如用知识充实自己。', source: '莎士比亚', type: 'quotes' },
        { title: '每日名言', content: '成功的关键在于相信自己有能力成功。', source: '罗伯特·舒勒', type: 'quotes' },
        { title: '每日名言', content: '最大的骄傲于最大的自卑都表示心灵的最软弱无力。', source: '斯宾诺莎', type: 'quotes' },
        { title: '每日名言', content: '人生不是一支短短的蜡烛，而是一支由我们暂时拿着的火炬。', source: '萧伯纳', type: 'quotes' },
        { title: '每日名言', content: '理想的人物不仅要在物质需要的满足上，还要在精神旨趣的满足上得到表现。', source: '黑格尔', type: 'quotes' },
        { title: '每日名言', content: '一个人的真正伟大之处就在于他能够认识到自己的渺小。', source: '保罗', type: 'quotes' },
        { title: '每日名言', content: '青春是一个短暂的美梦，当你醒来时，它早已消失无踪。', source: '莎士比亚', type: 'quotes' },
        { title: '每日名言', content: '友谊是一棵可以庇荫的树。', source: '柯尔律治', type: 'quotes' },
        { title: '每日名言', content: '真正的友谊，是一株成长缓慢的植物。', source: '华盛顿', type: 'quotes' },
        { title: '每日名言', content: '友谊是灵魂的结合，这个结合是可以离异的，这是两个敏感，正直的人之间心照不宣的契约。', source: '伏尔泰', type: 'quotes' },
        { title: '每日名言', content: '友谊像清晨的雾一样纯洁，奉承并不能得到友谊，友谊只能用忠实去巩固它。', source: '马克思', type: 'quotes' },
        { title: '每日名言', content: '友谊是培养人的感情的学校。', source: '苏霍姆林斯基', type: 'quotes' },
        { title: '每日名言', content: '友谊是天地间最可宝贵的东西，深挚的友谊是人生最大的一种安慰。', source: '邹韬奋', type: 'quotes' },
        { title: '每日名言', content: '友谊是两颗心真诚相待，而不是一颗心对另一颗心的敲打。', source: '鲁迅', type: 'quotes' },
        { title: '每日名言', content: '友谊是人生的调味品，也是人生的止痛药。', source: '爱默生', type: 'quotes' },
        { title: '每日名言', content: '友谊是精神的融合，心灵的联姻，道德的纽结。', source: '佩恩', type: 'quotes' },
        { title: '每日名言', content: '友谊是不会有感情的破产和快乐的幻灭的。', source: '巴尔扎克', type: 'quotes' },
        { title: '每日名言', content: '友谊是培养人的感情的学校。我们所以需要友谊，并不是想用它打发时间，而是要在人身上，在自己的身上培养美德。', source: '苏霍姆林斯基', type: 'quotes' },
        { title: '每日名言', content: '友谊是人生的调味品，也是人生的止痛药。', source: '爱默生', type: 'quotes' },
        { title: '每日名言', content: '友谊是精神的融合，心灵的联姻，道德的纽结。', source: '佩恩', type: 'quotes' },
        { title: '每日名言', content: '友谊是不会有感情的破产和快乐的幻灭的。', source: '巴尔扎克', type: 'quotes' },
        { title: '每日名言', content: '友谊是培养人的感情的学校。我们所以需要友谊，并不是想用它打发时间，而是要在人身上，在自己的身上培养美德。', source: '苏霍姆林斯基', type: 'quotes' }
      ],
      facts: [
        { title: '数字趣闻', content: '人体大约有206块骨头，但婴儿出生时有300多块骨头。', source: '人体科学', type: 'facts' },
        { title: '数字趣闻', content: '蜜蜂需要访问约200万朵花才能生产1磅蜂蜜。', source: '自然科普', type: 'facts' },
        { title: '数字趣闻', content: '地球表面71%被水覆盖，但只有2.5%是淡水。', source: '地理知识', type: 'facts' },
        { title: '数字趣闻', content: '人类大脑每天产生约7万个想法。', source: '脑科学', type: 'facts' },
        { title: '数字趣闻', content: '一只蚂蚁可以举起相当于自己体重50倍的物体。', source: '动物世界', type: 'facts' },
        { title: '数字趣闻', content: '太阳光到达地球需要约8分钟。', source: '天文知识', type: 'facts' },
        { title: '数字趣闻', content: '人类DNA与黑猩猩DNA的相似度高达98%。', source: '生物进化', type: 'facts' },
        { title: '数字趣闻', content: '世界上每分钟有约250个婴儿出生。', source: '人口统计', type: 'facts' }
      ],
      advice: [
        { title: '生活小贴士', content: '每天喝8杯水有助于保持身体健康和皮肤水润。', source: '健康建议', type: 'advice' },
        { title: '生活小贴士', content: '定期运动30分钟可以显著提升心情和精力。', source: '运动健康', type: 'advice' },
        { title: '生活小贴士', content: '保持良好睡眠习惯，每晚7-8小时睡眠最佳。', source: '睡眠科学', type: 'advice' },
        { title: '生活小贴士', content: '多吃蔬菜水果，每天至少5份，营养更均衡。', source: '营养学', type: 'advice' },
        { title: '生活小贴士', content: '定期整理工作环境，可以提高工作效率和专注力。', source: '心理学', type: 'advice' },
        { title: '生活小贴士', content: '学会感恩，每天记录3件值得感谢的事情。', source: '积极心理学', type: 'advice' },
        { title: '生活小贴士', content: '保持好奇心，终身学习是保持大脑活跃的秘诀。', source: '认知科学', type: 'advice' },
        { title: '生活小贴士', content: '培养一个爱好，让生活更有乐趣和意义。', source: '生活哲学', type: 'advice' }
      ],
      catfacts: [
        { title: '动物趣闻', content: '猫咪的胡须帮助它们测量空间，判断能否通过狭窄的地方。', source: '动物行为学', type: 'catfacts' },
        { title: '动物趣闻', content: '猫咪每天睡眠12-16小时，是真正的睡眠专家。', source: '动物生理学', type: 'catfacts' },
        { title: '动物趣闻', content: '猫咪的嗅觉比人类强14倍，能闻到很远的气味。', source: '动物感官', type: 'catfacts' },
        { title: '动物趣闻', content: '猫咪的跳跃能力惊人，可以跳到比自己身高5倍的高度。', source: '动物运动学', type: 'catfacts' },
        { title: '动物趣闻', content: '猫咪的舌头上有倒刺，帮助它们梳理毛发和喝水。', source: '动物解剖学', type: 'catfacts' },
        { title: '动物趣闻', content: '猫咪的瞳孔会根据光线强度变化，从细缝到圆形。', source: '动物视觉', type: 'catfacts' },
        { title: '动物趣闻', content: '猫咪的呼噜声频率在20-140赫兹，有助于骨骼愈合。', source: '动物声学', type: 'catfacts' },
        { title: '动物趣闻', content: '猫咪的尾巴是重要的平衡器官，帮助它们在高处行走。', source: '动物平衡学', type: 'catfacts' }
      ],
      trivia: [
        { title: '知识问答', content: '问题：世界上最高的山峰是？\n\n答案：珠穆朗玛峰，海拔8848米。', source: '地理知识', type: 'trivia' },
        { title: '知识问答', content: '问题：人体最大的器官是？\n\n答案：皮肤，成年人的皮肤面积约2平方米。', source: '人体科学', type: 'trivia' },
        { title: '知识问答', content: '问题：光速是多少？\n\n答案：约30万公里/秒，是宇宙中最快的速度。', source: '物理学', type: 'trivia' },
        { title: '知识问答', content: '问题：地球绕太阳一周需要多长时间？\n\n答案：365.25天，这就是为什么每4年有一个闰年。', source: '天文学', type: 'trivia' },
        { title: '知识问答', content: '问题：水的沸点是多少？\n\n答案：100摄氏度（在标准大气压下）。', source: '化学', type: 'trivia' },
        { title: '知识问答', content: '问题：人类有多少对染色体？\n\n答案：23对，总共46条染色体。', source: '遗传学', type: 'trivia' },
        { title: '知识问答', content: '问题：世界上最大的海洋是？\n\n答案：太平洋，占地球表面积的46%。', source: '海洋学', type: 'trivia' },
        { title: '知识问答', content: '问题：植物进行光合作用需要什么？\n\n答案：阳光、二氧化碳和水。', source: '植物学', type: 'trivia' }
      ],
      cocktails: [
        { title: '经典调酒', content: '配料：伏特加、橙汁\n\n制作方法：将伏特加和橙汁按1:2比例混合，加入冰块摇匀即可。', source: '调酒艺术', type: 'cocktails' },
        { title: '经典调酒', content: '配料：金酒、汤力水、柠檬片\n\n制作方法：将金酒和汤力水按1:3比例混合，加入柠檬片装饰。', source: '调酒艺术', type: 'cocktails' },
        { title: '经典调酒', content: '配料：威士忌、苏打水、柠檬\n\n制作方法：将威士忌和苏打水按1:2比例混合，加入柠檬片。', source: '调酒艺术', type: 'cocktails' },
        { title: '经典调酒', content: '配料：朗姆酒、可乐、柠檬\n\n制作方法：将朗姆酒和可乐按1:3比例混合，加入柠檬片装饰。', source: '调酒艺术', type: 'cocktails' },
        { title: '经典调酒', content: '配料：龙舌兰、橙汁、红石榴糖浆\n\n制作方法：分层倒入，先橙汁，再红石榴糖浆，最后龙舌兰。', source: '调酒艺术', type: 'cocktails' },
        { title: '经典调酒', content: '配料：白兰地、柠檬汁、糖浆\n\n制作方法：将三种配料按2:1:1比例混合，加入冰块摇匀。', source: '调酒艺术', type: 'cocktails' },
        { title: '经典调酒', content: '配料：伏特加、蔓越莓汁、青柠汁\n\n制作方法：将三种配料按2:2:1比例混合，加入冰块摇匀。', source: '调酒艺术', type: 'cocktails' },
        { title: '经典调酒', content: '配料：金酒、柠檬汁、糖浆、苏打水\n\n制作方法：将金酒、柠檬汁、糖浆混合，最后加入苏打水。', source: '调酒艺术', type: 'cocktails' }
      ],
      datafacts: [
        { title: '数据真相', content: '全球极端贫困人口比例从1990年的36%下降到2015年的10%，这意味着每天有13.7万人摆脱贫困。', source: '世界银行数据', type: 'datafacts' },
        { title: '数据真相', content: '全球儿童死亡率从1990年的每1000名活产婴儿93人死亡，下降到2019年的38人，下降了59%。', source: '联合国儿童基金会', type: 'datafacts' },
        { title: '数据真相', content: '全球手机普及率从2000年的12%增长到2020年的95%，移动通信革命改变了世界。', source: '国际电信联盟', type: 'datafacts' },
        { title: '数据真相', content: '全球女性平均受教育年限从1970年的3.4年增加到2018年的8.4年，教育性别差距大幅缩小。', source: '联合国教科文组织', type: 'datafacts' },
        { title: '数据真相', content: '全球可再生能源发电量从2000年的2.8%增长到2020年的29%，清洁能源转型加速。', source: '国际能源署', type: 'datafacts' },
        { title: '数据真相', content: '全球预期寿命从1960年的52.6岁增长到2019年的72.8岁，人类寿命显著延长。', source: '世界卫生组织', type: 'datafacts' },
        { title: '数据真相', content: '全球互联网用户比例从2000年的7%增长到2020年的59%，数字鸿沟正在缩小。', source: '国际电信联盟', type: 'datafacts' },
        { title: '数据真相', content: '全球森林覆盖率从1990年的31.8%下降到2020年的31.2%，但下降速度正在减缓。', source: '联合国粮农组织', type: 'datafacts' }
      ]
    };
    
    // API配置
    this.apiEndpoints = {
      wikipedia: {
        random: (lang) => `https://${lang}.wikipedia.org/api/rest_v1/page/random/summary`,
        featured: (lang, date) => `https://api.wikimedia.org/feed/v1/wikipedia/${lang}/featured/${date}`,
        onthisday: (lang, month, day) => `https://api.wikimedia.org/feed/v1/wikipedia/${lang}/onthisday/all/${month}/${day}`
      },
      quotes: {
        zen: 'https://zenquotes.io/api/random',
        quotable: 'https://api.quotable.io/random'
      },
      facts: {
        numbers: 'https://numbersapi.com/random/trivia',
        apiNinjas: 'https://api.api-ninjas.com/v1/facts?limit=1'
      },
      advice: {
        slip: 'https://api.adviceslip.com/advice'
      },
      catfacts: {
        ninja: 'https://catfact.ninja/fact'
      },
      trivia: {
        api: 'https://the-trivia-api.com/v2/questions?limit=1'
      },
      cocktails: {
        db: 'https://www.thecocktaildb.com/api/json/v1/1/random.php'
      },
      datafacts: {
        apiNinjas: 'https://api.api-ninjas.com/v1/facts?limit=1'
      },
      gathas: {
        local: 'csv'
      }
    };
    
    // V1.0: 平台检测配置（沿用ArtBreeze的成熟配置）
    this.platformConfig = {
      chatgpt: {
        sendButton: 'button[data-testid="send-button"]',
        inputArea: '#prompt-textarea',
        responseContainer: '[data-message-author-role="assistant"]',
        generatingIndicator: 'button[data-testid="stop-button"]',
      },
      claude: {
        sendButton: 'button[data-testid="send-button"]',
        inputArea: 'div[contenteditable="true"]',
        responseContainer: 'div[data-is-streaming="true"]',
        generatingIndicator: 'button[aria-label="Stop generating"]',
      },
      gemini: {
        sendButton: 'button[aria-label="Send message"]',
        inputArea: 'rich-textarea',
        responseContainer: 'model-response',
        generatingIndicator: '.loading-dots',
      },
      deepseek: {
        sendButton: 'button:has(svg)',
        inputArea: 'textarea',
        responseContainer: '.message.assistant',
        generatingIndicator: '.loading',
      },
      copilot: {
        sendButton: 'button[type="submit"]',
        inputArea: '#userInput',
        responseContainer: '.ac-container',
        generatingIndicator: '.typing-indicator',
      },
      kimi: {
        sendButton: 'button[data-testid="send-button"]',
        inputArea: 'textarea',
        responseContainer: '.message-assistant',
        generatingIndicator: '.generating',
      },
      grok: {
        sendButton: 'button[data-testid="send-button"]',
        inputArea: 'div[contenteditable="true"]',
        responseContainer: '.grok-response',
        generatingIndicator: '.generating',
      },
      yuanbao: {
        sendButton: 'button[type="submit"]',
        inputArea: 'textarea',
        responseContainer: '.message-assistant',
        generatingIndicator: '.generating',
      },
    };

    this.init();
  }

  async init() {
    await this.loadSettings();
    this.createUISafe();
    this.setupEventListeners();
    await this.primeCsvCaches();
    
    // 加载全局缓存
    await this.loadGlobalCache();
    
    // 加载展示时长设置
    await this.loadDisplayDuration();
    
    // 根据设置决定是否显示图标
    this.applySettings();
    
    // 在所有网站都设置通用Enter键监听
    this.setupUniversalEnterListener();
    
    // 页面卸载时保存缓存
    window.addEventListener('beforeunload', () => {
      this.saveGlobalCache();
    });
    
    const platform = this.detectPlatform();
    await this.loadKnowledgeCards();
    
    // 预加载本地内容到缓存
    this.preloadLocalContent();
    
    // 启动定时更新机制
    this.startPeriodicUpdate();
    
    // 强制预加载更多内容，确保内容丰富度
    setTimeout(() => {
      this.forcePreloadMoreContent();
    }, 2000);
  }
  // 预热CSV缓存到 storage.local，后续优先读取，避免 runtime.getURL 依赖
  async primeCsvCaches() {
    try {
      // datafacts
      const datafacts = await this.tryLoadCsvViaUrl('datafacts.csv', (line) => {
        const columns = line.split(',');
        if (columns.length >= 4) {
          return {
            title: columns[1] || '数据真相',
            content: columns[2] || '',
            source: columns[3] || '权威数据源',
            type: columns[4] || 'datafacts',
            category: columns[5] || 'general',
            year_start: columns[6] || '',
            year_end: columns[7] || '',
            region: columns[8] || 'global',
            trend: columns[9] || 'improving'
          };
        }
        return null;
      });
      if (datafacts && datafacts.length) {
        await chrome.storage.local.set({ 'waitwiki_cache_datafacts_v1': datafacts });
      }

      // gathas
      const gathas = await this.tryLoadCsvViaUrl('gathas.csv', (line) => {
        const columns = line.split(',');
        if (columns.length >= 4) {
          return {
            title: columns[1] || '偈语',
            content: (columns[2] || '').replace(/^\"|\"$/g, ''),
            source: columns[3] || '禅宗偈语',
            type: 'gathas'
          };
        }
        return null;
      });
      if (gathas && gathas.length) {
        await chrome.storage.local.set({ 'waitwiki_cache_gathas_v1': gathas });
      }
    } catch (e) {
      this.warn('primeCsvCaches failed:', e);
    }
  }

  // 通用：通过 runtime.getURL 加载 CSV 并解析
  async tryLoadCsvViaUrl(filename, mapLineFn) {
    try {
      if (!chrome || !chrome.runtime || typeof chrome.runtime.getURL !== 'function') {
        return null;
      }
      const url = chrome.runtime.getURL(filename);
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const text = await resp.text();
      const lines = text.split('\n');
      const dataLines = lines.slice(1).filter(line => line.trim());
      const items = dataLines.map(mapLineFn).filter(Boolean);
      return items;
    } catch (e) {
      return null;
    }
  }

  detectPlatform() {
    const H = window.location.hostname;
    const P = window.location.pathname;
    
    // 沿用ArtBreeze的成熟平台检测逻辑
    if (H.includes('chatgpt.com') || H.includes('chat.openai.com')) return 'chatgpt';
    if (H.includes('claude.ai')) return 'claude';
    if (H.includes('gemini.google.com') || H.includes('bard.google.com')) return 'gemini';
    if (H.includes('copilot.microsoft.com') || H.includes('bing.com')) return 'copilot';
    if (H.includes('kimi.moonshot.cn') || H.includes('kimi.ai')) return 'kimi';
    if (H.includes('grok') || (H.includes('x.com') && P.includes('grok'))) return 'grok';
    if (H.includes('chat.deepseek.com')) return 'deepseek';
    if (H.includes('yuanbao.tencent.com')) return 'yuanbao';
    if (H.includes('doubao.com') || H.includes('volcengine.com')) return 'doubao';
    return null;
  }

  async loadSettings() {
    const data = await chrome.storage.sync.get(['enabled', 'showSourceInfo', 'showIcon', 'darkMode', 'cardSize', 'language', 'contentTypes']);
    this.settings.enabled = data.enabled !== false;
    this.settings.showSourceInfo = data.showSourceInfo !== false;
    this.settings.showIcon = data.showIcon !== false;
    this.settings.darkMode = data.darkMode === true;
    this.settings.cardSize = data.cardSize || 'medium';
    this.settings.language = data.language || 'zh';
    this.settings.contentTypes = data.contentTypes || ['wikipedia', 'quotes', 'facts'];
  }

  async loadDisplayDuration() {
    const data = await chrome.storage.sync.get(['displayDuration']);
    this.settings.displayDuration = data.displayDuration || '10';
  }

  // 加载全局缓存
  async loadGlobalCache() {
    try {
      const result = await chrome.storage.local.get([
        this.globalCacheKey, 
        'waitwiki_performance_stats_v1',
        'waitwiki_user_stats_v1'
      ]);
      
      // 恢复内存缓存
      const cacheData = result[this.globalCacheKey] || {};
      for (const [key, card] of Object.entries(cacheData)) {
        this.cachedCards.set(key, card);
      }
      
      // 恢复性能统计
      if (result.waitwiki_performance_stats_v1) {
        this.performanceStats = { ...this.performanceStats, ...result.waitwiki_performance_stats_v1 };
      }
      
      // 恢复用户统计
      if (result.waitwiki_user_stats_v1) {
        const userStats = result.waitwiki_user_stats_v1;
        this.userStats = { ...this.userStats, ...userStats };
        if (userStats.favoriteContentTypes) {
          this.userStats.favoriteContentTypes = new Map(Object.entries(userStats.favoriteContentTypes));
        }
      }
    } catch (error) {
      console.warn('Failed to load global cache:', error);
    }
  }

  // 保存全局缓存
  async saveGlobalCache() {
    try {
      // 检查chrome扩展上下文是否有效
      if (!chrome.runtime?.id) {
        return; // 扩展上下文已失效，直接返回
      }
      
      const cacheData = {};
      let savedCount = 0;
      
      // 限制缓存大小，只保存最近的300张卡片
      const maxCacheSize = 300;
      const entries = Array.from(this.cachedCards.entries()).slice(-maxCacheSize);
      
      for (const [key, card] of entries) {
        cacheData[key] = card;
        savedCount++;
      }
      
      // 保存缓存数据
      await chrome.storage.local.set({ [this.globalCacheKey]: cacheData });
      
      // 保存性能统计（每小时保存一次）
      const now = Date.now();
      if (now - this.performanceStats.lastResetTime > 3600000) { // 1小时
        const statsKey = 'waitwiki_performance_stats_v1';
        const userStatsKey = 'waitwiki_user_stats_v1';
        
        await chrome.storage.local.set({
          [statsKey]: this.performanceStats,
          [userStatsKey]: {
            ...this.userStats,
            favoriteContentTypes: Object.fromEntries(this.userStats.favoriteContentTypes)
          }
        });
        
        // 重置统计
        this.performanceStats.lastResetTime = now;
      }
    } catch (error) {
      // 静默处理扩展上下文失效错误
      if (error.message.includes('Extension context invalidated')) {
        return;
      }
      console.warn('Failed to save global cache:', error);
    }
  }

  setupUniversalEnterListener() {
    document.addEventListener('keydown', (e) => {
      if (document.hidden || !document.hasFocus()) {
        return;
      }
      
      if (!this.settings.enabled || e.key !== 'Enter' || e.shiftKey || e.ctrlKey) {
        return;
      }
      
      const target = e.target;
      
      if (target !== document.activeElement) {
        // 不直接返回，继续检查
      }
      
      const isTextInput = this.isTextInputElement(target);
      
      if (isTextInput) {
        const platform = this.detectPlatform();
        
        if (platform) {
          this.showPopup();
        }
      }
    }, true);
    
    // 添加更宽泛的监听器用于ChatGPT
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && this.settings.enabled) {
        const platform = this.detectPlatform();
        if (platform === 'chatgpt') {
          const target = e.target;
          
          if (target.closest('.ProseMirror') || 
              target.closest('[data-testid="prompt-textarea"]') ||
              target.isContentEditable) {
            
            this.showPopup();
          }
        }
      }
    }, true);
  }
  
  isTextInputElement(element) {
    // 基本检查
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      return true;
    }
    
    // contenteditable检查
    if (element.contentEditable === 'true' || element.getAttribute('contentededitable') === 'true') {
      return true;
    }
    
    // 特定平台的特殊元素（沿用ArtBreeze逻辑）
    const platform = this.detectPlatform();
    if (platform === 'chatgpt') {
      if (element.classList.contains('ProseMirror') || 
          element.closest('.ProseMirror') ||
          element.closest('[data-testid="prompt-textarea"]') ||
          element.id === 'prompt-textarea' ||
          element.closest('#prompt-textarea') ||
          element.closest('[data-testid="composer-text-input"]') ||
          element.closest('[data-testid="chat-input"]') ||
          element.closest('[class*="input"]') ||
          element.closest('[class*="textarea"]') ||
          element.closest('[class*="composer"]') ||
          (element.getAttribute('spellcheck') === 'false' && element.tagName === 'DIV') ||
          (element.tagName === 'DIV' && element.getAttribute('contenteditable') === 'true') ||
          (element.tagName === 'P' && element.closest('[contenteditable="true"]'))) {
        return true;
      }
    }
    
    // 通用检查
    if (element.getAttribute('role') === 'textbox' ||
        element.closest('[role="textbox"]') ||
        element.matches('[data-testid*="input"]') ||
        element.matches('[placeholder]') ||
        element.closest('textarea') ||
        element.closest('[contenteditable="true"]') ||
        (element.tagName === 'DIV' && element.isContentEditable)) {
      return true;
    }
    
    return false;
  }

  showPopup() {
    this.onConversationStart();
    
    // 增加点击计数
    this.batchUpdateConfig.clickCount++;
    
    // 每次显示popup时，强制获取新卡片
    this.currentCard = null; // 清除当前卡片
    this.showCard(true); // 强制显示新卡片
    
    // 检查缓存状态和更新条件
    const cacheSize = this.cachedCards.size;
    const isCacheFull = cacheSize >= this.periodicUpdateConfig.maxCacheThreshold;
    
    // 缓存满后的批量更新逻辑
    if (isCacheFull && this.batchUpdateConfig.clickCount >= this.batchUpdateConfig.batchSize) {
      console.log(`Cache is full (${cacheSize}), triggering batch update after ${this.batchUpdateConfig.clickCount} clicks`);
      this.performBatchUpdate();
      this.batchUpdateConfig.clickCount = 0; // 重置计数
    } 
    // 缓存未满时的更新逻辑
    else if (!isCacheFull) {
      // 每次点击都预加载一张新卡片
    this.preloadOneMoreCard();
      
      // 如果点击次数达到阈值，触发批量更新
      if (this.batchUpdateConfig.clickCount >= this.batchUpdateConfig.batchSize) {
        console.log(`Cache not full (${cacheSize}), triggering batch update after ${this.batchUpdateConfig.clickCount} clicks`);
        this.performBatchUpdate();
        this.batchUpdateConfig.clickCount = 0; // 重置计数
      }
    }
    
    // 根据设置决定是否自动隐藏
    if (this.settings.displayDuration !== 'always') {
      const duration = parseInt(this.settings.displayDuration) * 1000;
      
      // 清除之前的定时器
      if (this.hideTimer) {
        clearTimeout(this.hideTimer);
      }
      
      this.hideTimer = setTimeout(() => {
        this.onConversationEnd(null);
        this.hideTimer = null;
      }, duration);
    }
  }

  // 每次触发时预加载一张新卡片
  async preloadOneMoreCard() {
    // 获取未缓存且未失败的API类型
    const availableTypes = this.settings.contentTypes.filter(type => {
      const isFailed = this.failedApis.has(type);
      return !isFailed;
    });
    
    if (availableTypes.length > 0) {
      const randomType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
      
      try {
        // 直接调用API获取新卡片，不使用缓存
        await this.fetchNewCardFromAPI(randomType);
      } catch (error) {
        console.warn(`Failed to preload card from ${randomType}:`, error);
      }
    } else {
      // 清理旧的失败记录
      this.cleanupFailedApis();
    }
  }
  
  // 清理旧的失败API记录（超过1小时）
  cleanupFailedApis() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    for (const [apiType, record] of this.failedApis.entries()) {
      if (record.lastAttempt < oneHourAgo) {
        this.failedApis.delete(apiType);
      }
    }
  }

  // V1.0: Safe UI creation using createElement
  createUISafe() {
    // Container
    const container = document.createElement('div');
    container.id = 'waitwiki-card-container';
    this.ui.container = container;

    // Frame
    const frame = document.createElement('div');
    frame.className = 'waitwiki-card-frame';
    this.ui.frame = frame;

    // Content Container
    const contentContainer = document.createElement('div');
    contentContainer.className = 'waitwiki-card-content';

    // Loader
    const loader = document.createElement('div');
    loader.className = 'waitwiki-loader';
    this.ui.loader = loader;

    // Title
    const title = document.createElement('h3');
    title.className = 'waitwiki-card-title';
    this.ui.title = title;

    // Content
    const content = document.createElement('div');
    content.className = 'waitwiki-card-content';
    this.ui.content = content;

    // Source
    const source = document.createElement('p');
    source.className = 'waitwiki-card-source';
    this.ui.source = source;

    contentContainer.append(loader, title, content, source);
    frame.appendChild(contentContainer);
    container.appendChild(frame);
    document.body.appendChild(container);

    // Circular Icon
    const icon = document.createElement('div');
    icon.id = 'waitwiki-circular-icon';
    const iconImg = document.createElement('img');
    iconImg.className = 'waitwiki-icon-image';
    iconImg.src = chrome.runtime.getURL('icons/logo48.png');
    iconImg.alt = 'WaitWiki';
    icon.appendChild(iconImg);
    document.body.appendChild(icon);
    this.ui.icon = icon;
  }

  setupEventListeners() {
    this.ui.icon.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.settings.enabled) {
        return;
      }
      
      this.isShowingCard ? this.hideCard() : this.showCard(true);
    });

    // 监听存储变更
    chrome.storage.onChanged.addListener((changes) => {
      try {
        Object.keys(changes).forEach(key => {
          if (this.settings.hasOwnProperty(key)) this.settings[key] = changes[key].newValue;
        });
        this.applySettings();

        // 若内容类型发生变化，立即清理缓存中的禁用类型
        if (changes.contentTypes) {
          this.purgeCacheBySettings();
        }
      } catch (e) {
        console.warn('[WaitWiki] Failed to handle storage change:', e);
      }
    });
    
    // 监听来自popup的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      try {
        if (request.action === 'settingsChanged') {
          this.settings = { ...this.settings, ...request.settings };
          this.applySettings();
          // popup显式发来设置变更时，同步清理缓存
          if (request.settings && request.settings.contentTypes) {
            this.purgeCacheBySettings();
          }
        }
      } catch (e) {
        console.warn('[WaitWiki] Failed to handle runtime message:', e);
      }
    });
    
    // 监听存储变更以更新展示时长设置
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.displayDuration) {
        this.settings.displayDuration = changes.displayDuration.newValue || '10';
      }
    });
  }
  
  applySettings() {
    if (!this.settings.enabled) {
      this.hideCard();
      this.hideCircularIcon();
    } else {
      if (this.settings.showIcon) {
        this.showCircularIcon();
      } else {
        this.hideCircularIcon();
      }
    }
    this.updateSourceInfoVisibility();
    this.applyDarkMode();
    this.applyCardSize();
    // 设置变化后，若当前卡片类型被禁用，则立即隐藏或更换
    try {
      if (this.currentCard && this.settings.contentTypes && !this.settings.contentTypes.includes(this.currentCard.type)) {
        // 当前展示的卡片类型已被禁用
        this.hideCard();
        this.currentCard = null;
      }
    } catch (e) {
      console.warn('[WaitWiki] applySettings post-check failed:', e);
    }
  }

  showCard(forceNew = false) {
    if (!this.settings.enabled) {
      return;
    }
    
    // 防止重复显示
    if (this.isShowingCard || this.isLoadingCard) {
      return;
    }
    
    // 预选择知识卡片
    if (forceNew || !this.currentCard) {
      this.selectRandomCard();
    }
    
    if (!this.currentCard) {
      return;
    }
    
    // 标记正在加载
    this.isLoadingCard = true;
    
    // 显示卡片内容
    this.displayCardContent();
  }

  hideCard() {
    this.isShowingCard = false;
    this.isLoadingCard = false;
    this.ui.container.classList.remove('waitwiki-show');
    if (this.settings.enabled && this.settings.showIcon) {
      this.showCircularIcon();
    }
  }

  // 绑定外部点击事件处理器
  bindOutsideClickHandler() {
    document.removeEventListener('click', this.boundOutsideClickHandler);
    
    this.boundOutsideClickHandler = this.handleOutsideClick.bind(this);
    
    document.addEventListener('click', this.boundOutsideClickHandler, { once: true });
  }

  handleOutsideClick(event) {
    if (this.ui.container.contains(event.target) || this.ui.icon.contains(event.target)) {
      setTimeout(() => this.bindOutsideClickHandler(), 0);
      return;
    }
    this.hideCard();
  }

  showCircularIcon() { 
    if (this.ui.icon) {
      this.ui.icon.style.display = 'flex';
    }
  }
  
  hideCircularIcon() { 
    if (this.ui.icon) {
      this.ui.icon.style.display = 'none'; 
    }
  }

  // 主要的数据获取函数
  async loadKnowledgeCards() {
    const promises = this.settings.contentTypes.map(type => this.fetchKnowledgeCard(type));
    
    try {
      const results = await Promise.allSettled(promises);
      const successfulResults = results.filter(result => result.status === 'fulfilled').map(result => result.value);
      
      this.knowledgeCards = successfulResults.flat().filter(card => card && card.title);
      
      // 如果缓存中卡片不足50张，开始预加载
      if (this.cachedCards.size < 50) {
        this.startSmartPreload();
      }
    } catch (error) {
      console.warn('Failed to load knowledge cards:', error);
      this.knowledgeCards = this.getFallbackCards();
    }
  }

  // 从各个API获取知识卡片
  async fetchKnowledgeCard(type) {
    const startTime = Date.now();
    this.performanceStats.apiCallCount++;
    
    const cacheKey = `${type}_${Date.now()}`;
    
    // 检查缓存（但允许获取新内容）
    if (this.cachedCards.size > 0) {
      const cachedCards = Array.from(this.cachedCards.values()).filter(card => card.type === type);
      if (cachedCards.length > 0) {
        this.cacheStats.hits++;
        // 不直接返回，继续获取新内容
      }
    }
    
    this.cacheStats.misses++;

    try {
      let cards = [];
      
      // 优先使用本地内容，减少API依赖
      cards = this.getLocalContent(type);
      
      // 如果本地内容不足，尝试API获取
      if (!cards || cards.length === 0) {
        try {
      switch (type) {
        case 'wikipedia':
          cards = await this.fetchWikipediaCards();
          break;
        case 'quotes':
          cards = await this.fetchQuoteCards();
          break;
        case 'facts':
          cards = await this.fetchFactCards();
          break;
            case 'advice':
              cards = await this.fetchAdviceCards();
              break;
            case 'catfacts':
              cards = await this.fetchCatFactCards();
              break;
            case 'trivia':
              cards = await this.fetchTriviaCards();
              break;
            case 'cocktails':
              cards = await this.fetchCocktailCards();
              break;
            case 'datafacts':
              cards = await this.fetchDataFactCards();
              break;
            case 'gathas':
              cards = await this.fetchGathasCards();
          break;
        default:
          break;
          }
        } catch (apiError) {
          console.warn(`API failed for ${type}, using local content:`, apiError);
          // API失败时使用本地内容
          cards = this.getLocalContent(type);
        }
      }
      
      // 如果API和本地内容都没有，返回空数组
      if (!cards || cards.length === 0) {
        cards = this.getLocalContent(type);
      }
      
      // 更新性能统计
      const responseTime = Date.now() - startTime;
      this.performanceStats.apiSuccessCount++;
      this.performanceStats.totalResponseTime += responseTime;
      this.performanceStats.averageResponseTime = 
        this.performanceStats.totalResponseTime / this.performanceStats.apiSuccessCount;
      
      // 缓存成功获取的卡片
      cards.forEach(card => {
        const cardKey = `${type}_${card.title}_${Date.now()}`;
        this.cachedCards.set(cardKey, card);
      });
      
      return cards;
    } catch (error) {
      // 更新失败统计
      this.performanceStats.apiFailureCount++;
      this.cacheStats.failures++;
      
      console.warn(`Failed to fetch ${type} cards:`, error);
      this.failedApis.set(type, {
        count: (this.failedApis.get(type)?.count || 0) + 1,
        lastAttempt: Date.now(),
        error: error.message
      });
      
      // 失败时返回本地内容
      return this.getLocalContent(type);
    }
  }
  
  // 获取本地备用内容
  getLocalContent(type) {
    const localCards = this.localContent[type] || [];
    if (localCards.length === 0) {
      return [];
    }
    
    // 返回所有本地卡片，增加内容多样性
    return localCards.map(card => ({
      ...card,
      language: this.settings.language,
      url: ''
    }));
  }

  // 直接从API获取新卡片（不使用缓存）
  async fetchNewCardFromAPI(type) {
    try {
      let cards = [];
      
      switch (type) {
        case 'wikipedia':
          cards = await this.fetchWikipediaCards();
          break;
        case 'quotes':
          cards = await this.fetchQuoteCards();
          break;
        case 'facts':
          cards = await this.fetchFactCards();
          break;
        case 'advice':
          cards = await this.fetchAdviceCards();
          break;
        case 'catfacts':
          cards = await this.fetchCatFactCards();
          break;
        case 'trivia':
          cards = await this.fetchTriviaCards();
          break;
        case 'cocktails':
          cards = await this.fetchCocktailCards();
          break;
        case 'datafacts':
          cards = await this.fetchDataFactCards();
          break;
        case 'gathas':
          cards = await this.fetchGathasCards();
          break;
        default:
          break;
      }
      
      // 缓存新获取的卡片
      cards.forEach(card => {
        const cardKey = `${type}_${card.title}_${Date.now()}`;
        this.cachedCards.set(cardKey, card);
      });
      
      return cards;
    } catch (error) {
      console.warn(`Failed to fetch new card from ${type}:`, error);
      this.failedApis.set(type, {
        count: (this.failedApis.get(type)?.count || 0) + 1,
        lastAttempt: Date.now(),
        error: error.message
      });
      return [];
    }
  }

  // 获取Wikipedia卡片
  async fetchWikipediaCards() {
    const lang = this.settings.language;
    const url = this.apiEndpoints.wikipedia.random(lang);
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      return [{
        type: 'wikipedia',
        title: data.title || '未知标题',
        content: data.extract || '暂无内容',
        source: 'Wikipedia',
        url: data.content_urls?.desktop?.page || '',
        language: lang
      }];
    } catch (error) {
      throw new Error(`Wikipedia API error: ${error.message}`);
    }
  }

  // 获取名言卡片
  async fetchQuoteCards() {
    try {
      // 优先使用 Zen Quotes，增加超时处理
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
      
      const response = await fetch(this.apiEndpoints.quotes.zen, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'WaitWiki/1.2.0'
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      return [{
        type: 'quotes',
        title: '每日名言',
        content: data[0]?.q || '暂无名言',
        source: data[0]?.a || '未知作者',
        url: '',
        language: this.settings.language
      }];
    } catch (error) {
      // 备用：使用 Quotable
      try {
        const controller2 = new AbortController();
        const timeoutId2 = setTimeout(() => controller2.abort(), 5000);
        
        const response = await fetch(this.apiEndpoints.quotes.quotable, {
          signal: controller2.signal,
          headers: {
            'User-Agent': 'WaitWiki/1.2.0'
          }
        });
        clearTimeout(timeoutId2);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        return [{
          type: 'quotes',
          title: '每日名言',
          content: data.content || '暂无名言',
          source: data.author || '未知作者',
          url: '',
          language: this.settings.language
        }];
      } catch (fallbackError) {
        throw new Error(`Quotes API error: 网络连接失败`);
      }
    }
  }

  // 获取趣闻卡片
  async fetchFactCards() {
    try {
      // 优先使用 Numbers API，增加超时处理
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(this.apiEndpoints.facts.numbers, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'WaitWiki/1.2.0'
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      return [{
        type: 'facts',
        title: '数字趣闻',
        content: data.text || '暂无趣闻',
        source: 'Numbers API',
        url: '',
        language: this.settings.language
      }];
    } catch (error) {
      throw new Error(`Facts API error: 网络连接失败`);
    }
  }

  // 获取建议卡片
  async fetchAdviceCards() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(this.apiEndpoints.advice.slip, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'WaitWiki/1.2.0'
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return [{
        type: 'advice',
        title: '生活小贴士',
        content: data.slip?.advice || '暂无建议',
        source: 'Advice Slip API',
        url: '',
        language: this.settings.language
      }];
    } catch (error) {
      throw new Error(`Advice API error: 网络连接失败`);
    }
  }

  // 获取猫咪趣闻卡片
  async fetchCatFactCards() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(this.apiEndpoints.catfacts.ninja, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'WaitWiki/1.2.0'
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return [{
        type: 'catfacts',
        title: '猫咪趣闻',
        content: data.fact || '暂无趣闻',
        source: 'Cat Facts API',
        url: '',
        language: this.settings.language
      }];
    } catch (error) {
      throw new Error(`Cat Facts API error: 网络连接失败`);
    }
  }

  // 获取知识问答卡片
  async fetchTriviaCards() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(this.apiEndpoints.trivia.api, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'WaitWiki/1.2.0'
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      const question = data[0];
      if (!question) {
        throw new Error('No trivia question received');
      }
      
      return [{
        type: 'trivia',
        title: `${question.category || '知识问答'}`,
        content: `${question.question?.text || question.question || '暂无问题'}\n\n答案：${question.correctAnswer || '暂无答案'}`,
        source: 'The Trivia API',
        url: '',
        language: this.settings.language
      }];
    } catch (error) {
      throw new Error(`Trivia API error: 网络连接失败`);
    }
  }

  // 获取鸡尾酒卡片
  async fetchCocktailCards() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(this.apiEndpoints.cocktails.db, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'WaitWiki/1.2.0'
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      const drink = data.drinks?.[0];
      if (!drink) {
        throw new Error('No cocktail data received');
      }
      
      const instructions = drink.strInstructions || '暂无制作方法';
      const ingredients = [];
      
      // 提取配料信息
      for (let i = 1; i <= 15; i++) {
        const ingredient = drink[`strIngredient${i}`];
        const measure = drink[`strMeasure${i}`];
        if (ingredient) {
          ingredients.push(measure ? `${measure} ${ingredient}` : ingredient);
        }
      }
      
      const content = `配料：${ingredients.join(', ')}\n\n制作方法：${instructions}`;
      
      return [{
        type: 'cocktails',
        title: `${drink.strDrink || '神秘鸡尾酒'}`,
        content: content,
        source: 'TheCocktailDB',
        url: '',
        language: this.settings.language
      }];
    } catch (error) {
      throw new Error(`Cocktail API error: 网络连接失败`);
    }
  }

  // 获取数据真相卡片
  async fetchDataFactCards() {
    try {
      // 首先尝试从CSV文件读取数据
      const csvData = await this.loadDataFactsFromCSV();
      if (csvData && csvData.length > 0) {
        // 随机选择一条数据
        const randomIndex = Math.floor(Math.random() * csvData.length);
        const selectedData = csvData[randomIndex];
        
        return [{
          type: 'datafacts',
          title: selectedData.title || '数据真相',
          content: selectedData.content,
          source: selectedData.source,
          url: '',
          language: this.settings.language
        }];
      }
      
      // 如果CSV读取失败，使用API
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(this.apiEndpoints.datafacts.apiNinjas, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'WaitWiki/1.2.0'
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      return [{
        type: 'datafacts',
        title: '数据真相',
        content: data.fact || '暂无数据真相',
        source: 'API Ninjas',
        url: '',
        language: this.settings.language
      }];
    } catch (error) {
      throw new Error(`Data Facts API error: 网络连接失败`);
    }
  }
  
  // 获取偈语卡片（优先CSV）
  async fetchGathasCards() {
    try {
      const csvData = await this.loadGathasFromCSV();
      if (csvData && csvData.length > 0) {
        const randomIndex = Math.floor(Math.random() * csvData.length);
        const row = csvData[randomIndex];
        return [{
          type: 'gathas',
          title: row.title || '偈语',
          content: row.content,
          source: row.source || '禅宗偈语',
          url: '',
          language: this.settings.language
        }];
      }
      return this.getLocalGathasFallback();
    } catch (error) {
      return this.getLocalGathasFallback();
    }
  }
  
  // 从CSV加载偈语
  async loadGathasFromCSV() {
    try {
      // 优先从本地缓存读取
      const cache = await chrome.storage.local.get(['waitwiki_cache_gathas_v1']);
      const cached = cache.waitwiki_cache_gathas_v1;
      if (Array.isArray(cached) && cached.length) {
        return cached;
      }
      // 回退通过 URL 读取
      const items = await this.tryLoadCsvViaUrl('gathas.csv', (line) => {
        const columns = line.split(',');
        if (columns.length >= 4) {
          return {
            title: columns[1] || '偈语',
            content: (columns[2] || '').replace(/^\"|\"$/g, ''),
            source: columns[3] || '禅宗偈语',
            type: 'gathas'
          };
        }
        return null;
      });
      return items || null;
    } catch (e) {
      this.warn('Failed to load gathas CSV:', e);
      return null;
    }
  }
  
  // 本地偈语兜底
  getLocalGathasFallback() {
    return [{
      type: 'gathas',
      title: '偈语',
      content: '至道无难，唯嫌拣择。',
      source: '禅宗偈语',
      url: '',
      language: this.settings.language
    }];
  }
  
  // 从CSV文件加载数据真相
  async loadDataFactsFromCSV() {
    try {
      // 优先从本地缓存读取
      const cache = await chrome.storage.local.get(['waitwiki_cache_datafacts_v1']);
      const cached = cache.waitwiki_cache_datafacts_v1;
      if (Array.isArray(cached) && cached.length) {
        return cached;
      }
      // 回退通过 URL 读取
      const items = await this.tryLoadCsvViaUrl('datafacts.csv', (line) => {
        const columns = line.split(',');
        if (columns.length >= 4) {
          return {
            title: columns[1] || '数据真相',
            content: columns[2] || '',
            source: columns[3] || '权威数据源',
            type: columns[4] || 'datafacts',
            category: columns[5] || 'general',
            year_start: columns[6] || '',
            year_end: columns[7] || '',
            region: columns[8] || 'global',
            trend: columns[9] || 'improving'
          };
        }
        return null;
      });
      return (items || []).filter(item => item && item.content);
    } catch (error) {
      this.warn('Failed to load CSV file:', error);
      return null;
    }
  }

  // 智能预加载策略
  async startSmartPreload() {
    const availableTypes = this.settings.contentTypes.filter(type => {
      const isFailed = this.failedApis.has(type);
      return !isFailed;
    });
    
    if (availableTypes.length === 0) {
      return;
    }
    
    // 统计当前各类型缓存数量
    const typeCounts = new Map();
    for (const [key, card] of this.cachedCards.entries()) {
      const type = card.type;
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }
    
    // 优先预加载Wikipedia（如果数量不足）
    const wikipediaCount = typeCounts.get('wikipedia') || 0;
    if (wikipediaCount < 30) { // 如果Wikipedia少于30条，优先预加载
      console.log(`Preloading Wikipedia (current: ${wikipediaCount})`);
      try {
        await this.fetchWikipediaCards();
      } catch (error) {
        console.warn('Failed to preload Wikipedia:', error);
      }
    }
    
    // 使用智能推荐算法选择其他预加载类型
    const recommendedType = this.getRecommendedContentType();
    if (!recommendedType) {
      return;
    }
    
    // 每次只预加载一张卡片，间隔更长时间
    let loadIndex = 0;
    const loadNext = async () => {
      if (loadIndex >= 5) { // 增加预加载数量，确保内容丰富度
        return;
      }
      
      try {
        // 优先预加载推荐类型
        const typeToLoad = loadIndex === 0 ? recommendedType : 
          availableTypes[Math.floor(Math.random() * availableTypes.length)];
        
        await this.fetchNewCardFromAPI(typeToLoad);
        loadIndex++;
        
        // 根据网络状况调整间隔时间
        const interval = this.performanceStats.averageResponseTime > 2000 ? 5000 : 3000;
        setTimeout(loadNext, interval);
      } catch (error) {
        loadIndex++;
        setTimeout(loadNext, 2000);
      }
    };
    
    loadNext();
  }

  // 显示卡片内容
  displayCardContent() {
    if (!this.currentCard) {
      this.isLoadingCard = false;
      return;
    }
    
    // 内容质量评估
    const qualityScore = this.assessContentQuality(this.currentCard);
    if (qualityScore < 0.3) {
      // 质量太差的内容，尝试获取新卡片
      console.warn('Content quality too low, trying to get new card');
      this.selectRandomCard();
      if (this.currentCard) {
        this.displayCardContent();
      }
      return;
    }
    
    // 更新用户偏好统计
    this.updateUserPreferences(this.currentCard.type);
    
    // 更新UI内容
    this.ui.title.textContent = this.currentCard.title;
    this.ui.content.textContent = this.currentCard.content;
    
    if (this.currentCard.url) {
      // 安全地创建链接元素，避免XSS攻击
      const link = document.createElement('a');
      link.href = this.currentCard.url;
      link.target = '_blank';
      link.textContent = `来源：${this.currentCard.source}`;
      this.ui.source.innerHTML = '';
      this.ui.source.appendChild(link);
    } else {
      this.ui.source.textContent = `来源：${this.currentCard.source}`;
    }
    
    this.updateSourceInfoVisibility();
    
    // 隐藏加载器，显示内容
    this.ui.loader.style.opacity = '0';
    
    // 显示卡片
    this.isShowingCard = true;
    this.isLoadingCard = false;
    this.hideCircularIcon();
    this.ui.container.classList.add('waitwiki-show');
    
    // 绑定点击事件
    this.bindOutsideClickHandler();
  }
  
  // 内容质量评估算法
  assessContentQuality(card) {
    let score = 1.0;
    
    // 标题质量检查
    if (!card.title || card.title.length < 2) {
      score -= 0.3;
    } else if (card.title.length > 100) {
      score -= 0.1;
    }
    
    // 内容质量检查
    if (!card.content || card.content.length < 10) {
      score -= 0.4;
    } else if (card.content.length > 1000) {
      score -= 0.1;
    }
    
    // 内容重复性检查
    if (card.content.includes('暂无') || card.content.includes('No data')) {
      score -= 0.3;
    }
    
    // 特殊字符和格式检查
    const specialCharRatio = (card.content.match(/[^\w\s\u4e00-\u9fff]/g) || []).length / card.content.length;
    if (specialCharRatio > 0.3) {
      score -= 0.2;
    }
    
    return Math.max(0, score);
  }

  selectRandomCard() {
    // 优先从缓存中选择
    const allCards = Array.from(this.cachedCards.values());

    if (allCards.length === 0 && this.knowledgeCards.length === 0) {
      return;
    }

    // 仅保留设置中启用的类型
    const allowedTypes = new Set(this.settings.contentTypes || []);
    let baseCandidates = allCards.length > 0 ? allCards : this.knowledgeCards;
    let availableCards = baseCandidates.filter(card => allowedTypes.has(card.type));

    // 如果过滤完没有可用卡片，直接返回（防止展示已禁用类型）
    if (availableCards.length === 0) {
      return;
    }
    
    // 如果只有一张卡片，直接返回
    if (availableCards.length === 1) {
      this.currentCard = availableCards[0];
      this.addToRecentCards(this.currentCard.title);
      return;
    }
    
    // 智能过滤：优先选择未显示过的卡片，先避开短期队列
    let filteredCards = availableCards.filter(card => {
      // 标题去重
      const titleNotRecent = !this.recentCards.has(card.title);
      const titleNotInShortQueue = !this.recentTitleQueue.includes(card.title);
      
      // 索引去重
      const indexNotRecent = availableCards.indexOf(card) !== this.lastCardIndex;
      
      // 内容相似度去重（防止内容重复）
      const contentNotSimilar = !this.isContentSimilar(card.content);
      
      return titleNotRecent && titleNotInShortQueue && indexNotRecent && contentNotSimilar;
    });
    
    // 如果过滤后卡片太少，先尝试拉取新卡片再放宽
    if (filteredCards.length < Math.min(5, availableCards.length * 0.3)) {
      console.log('Filtered cards too few, preloading one more card before relaxing conditions');
      try {
        this.preloadOneMoreCard();
      } catch (e) {
        // 忽略
      }
      // 放宽到仅排除短期内出现过的标题
      filteredCards = availableCards.filter(card => !this.recentTitleQueue.includes(card.title));
    }
    
    // 如果还是没有足够卡片，清空记录重新开始
    if (filteredCards.length === 0) {
      console.log('No filtered cards available, clearing recent records');
      this.recentCards.clear();
      this.recentContents.clear();
      // 清空短期队列，但保留最后一个，防止立刻复用同一张
      const lastRecent = this.recentTitleQueue[this.recentTitleQueue.length - 1];
      this.recentTitleQueue = lastRecent ? [lastRecent] : [];
      filteredCards = availableCards.filter(card => card.title !== lastRecent);
    }
    
    // 优先选择Wikipedia和数据真相内容（增加出现占比）
    const priorityTypes = ['wikipedia', 'datafacts'];
    const priorityCards = filteredCards.filter(card => priorityTypes.includes(card.type));
    const otherCards = filteredCards.filter(card => !priorityTypes.includes(card.type));
    
    // 70%概率选择优先类型，30%概率选择其他类型
    let selectedCard;
    if (priorityCards.length > 0 && Math.random() < 0.7) {
      // 在优先类型中，Wikipedia占60%，datafacts占40%
      const wikipediaCards = priorityCards.filter(card => card.type === 'wikipedia');
      const datafactsCards = priorityCards.filter(card => card.type === 'datafacts');
      
      if (wikipediaCards.length > 0 && datafactsCards.length > 0) {
        // 两种类型都有，按比例选择
        selectedCard = Math.random() < 0.6 ? 
          wikipediaCards[Math.floor(Math.random() * wikipediaCards.length)] :
          datafactsCards[Math.floor(Math.random() * datafactsCards.length)];
      } else if (wikipediaCards.length > 0) {
        selectedCard = wikipediaCards[Math.floor(Math.random() * wikipediaCards.length)];
      } else if (datafactsCards.length > 0) {
        selectedCard = datafactsCards[Math.floor(Math.random() * datafactsCards.length)];
      } else {
        selectedCard = priorityCards[Math.floor(Math.random() * priorityCards.length)];
      }
    } else if (otherCards.length > 0) {
      // 选择其他类型，但给不同类型的内容加权
      const typeCounts = new Map();
      otherCards.forEach(card => {
        typeCounts.set(card.type, (typeCounts.get(card.type) || 0) + 1);
      });
      
      const weights = otherCards.map(card => {
        const typeCount = typeCounts.get(card.type) || 1;
        return 1 / typeCount; // 类型数量越少，权重越高
      });
      
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      let randomWeight = Math.random() * totalWeight;
      
      let selectedIndex = 0;
      for (let i = 0; i < weights.length; i++) {
        randomWeight -= weights[i];
        if (randomWeight <= 0) {
          selectedIndex = i;
          break;
        }
      }
      
      selectedCard = otherCards[selectedIndex];
    } else {
      // 如果没有其他类型，从优先类型中选择
      selectedCard = priorityCards[Math.floor(Math.random() * priorityCards.length)];
    }
    
    this.currentCard = selectedCard;
    
    // 更新lastCardIndex为在原数组中的位置
    this.lastCardIndex = availableCards.indexOf(this.currentCard);
    
    // 添加到最近显示记录
    this.addToRecentCards(this.currentCard.title);
    
    console.log(`Selected card: ${this.currentCard.title} (${this.currentCard.type}) - Priority selection`);
  }
  
  // 检查内容相似度
  isContentSimilar(content) {
    if (!this.recentContents) {
      this.recentContents = new Set();
    }
    
    // 提取内容的关键词（简单实现）
    const keywords = content.replace(/[^\w\s\u4e00-\u9fff]/g, '').split(/\s+/).slice(0, 5).join(' ');
    
    if (this.recentContents.has(keywords)) {
      return true;
    }
    
    this.recentContents.add(keywords);
    
    // 限制记录数量
    if (this.recentContents.size > 50) {
      const oldestKeyword = this.recentContents.values().next().value;
      this.recentContents.delete(oldestKeyword);
    }
    
    return false;
  }
  
  // 添加卡片到最近显示记录
  addToRecentCards(title) {
    this.recentCards.add(title);
    try {
      // 维护短期队列，避免短时间内重复
      this.recentTitleQueue.push(title);
      if (this.recentTitleQueue.length > this.recentTitleQueueSize) {
        this.recentTitleQueue.shift();
      }
    } catch (e) {
      // 忽略
    }
    
    // 如果超过最大记录数，删除最旧的记录
    if (this.recentCards.size > this.maxRecentCards) {
      const oldestTitle = this.recentCards.values().next().value;
      this.recentCards.delete(oldestTitle);
    }
  }
  
  // 智能内容推荐算法
  getRecommendedContentType() {
    const typeStats = new Map();
    
    // 统计各类型的使用频率
    for (const [key, card] of this.cachedCards.entries()) {
      const type = card.type;
      typeStats.set(type, (typeStats.get(type) || 0) + 1);
    }
    
    // 获取用户偏好（基于显示次数）
    const userPreferences = Array.from(this.userStats.favoriteContentTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type]) => type);
    
    // 结合缓存统计和用户偏好
    const availableTypes = this.settings.contentTypes.filter(type => 
      !this.failedApis.has(type)
    );
    
    if (availableTypes.length === 0) {
      return null;
    }
    
    // 优先推荐用户偏好的类型，但也要保持多样性
    const preferredTypes = userPreferences.filter(type => 
      availableTypes.includes(type)
    );
    
    if (preferredTypes.length > 0 && Math.random() < 0.7) {
      // 70%概率选择用户偏好的类型
      return preferredTypes[Math.floor(Math.random() * preferredTypes.length)];
    } else {
      // 30%概率随机选择，保持多样性
      return availableTypes[Math.floor(Math.random() * availableTypes.length)];
    }
  }
  
  // 更新用户偏好统计
  updateUserPreferences(contentType) {
    const currentCount = this.userStats.favoriteContentTypes.get(contentType) || 0;
    this.userStats.favoriteContentTypes.set(contentType, currentCount + 1);
    this.userStats.cardDisplayCount++;
  }
  
  updateSourceInfoVisibility() {
    if (this.ui.source) {
      this.ui.source.style.display = this.settings.showSourceInfo ? 'block' : 'none';
    }
  }

  applyDarkMode() {
    if (this.settings.darkMode) {
      document.body.classList.add('waitwiki-dark-mode');
    } else {
      document.body.classList.remove('waitwiki-dark-mode');
    }
    
    if (this.settings.enabled && this.settings.showIcon && !this.isShowingCard) {
      this.showCircularIcon();
    }
  }

  applyCardSize() {
    if (this.ui.container) {
      this.ui.container.className = this.ui.container.className.replace(/\bwaitwiki-(small|medium|large)\b/g, '');
      this.ui.container.classList.add(`waitwiki-${this.settings.cardSize}`);
    }
  }

  // 事件处理函数（沿用ArtBreeze的逻辑）
  onConversationStart() {
    if (this.conversationState === 'generating' || !this.settings.enabled) return;
    this.conversationState = 'generating';
    this.showCard();
  }

  onConversationEnd(subObserver) {
    if (subObserver) {
      subObserver.disconnect();
    }
    if (this.conversationState === 'generating') {
      this.conversationState = 'idle';
      this.hideCard();
    }
  }

  // 获取备用卡片
  getFallbackCards() {
    return [
      {
        type: 'fallback',
        title: '知识卡片',
        content: '等待，不是浪费，而是遇见知识的涟漪。',
        source: 'WaitWiki',
        url: '',
        language: this.settings.language
      }
    ];
  }
  
  // 预加载本地内容到缓存
  preloadLocalContent() {
    // 仅预加载用户启用的内容类型
    const localTypes = (this.settings.contentTypes || []).filter(type => !!this.localContent[type]);
    localTypes.forEach(type => {
      const localCards = this.localContent[type];
      if (localCards && localCards.length > 0) {
        localCards.forEach(card => {
          const cardKey = `${type}_local_${card.title}_${Date.now()}`;
          this.cachedCards.set(cardKey, {
            ...card,
            language: this.settings.language,
            url: ''
          });
        });
      }
    });
    
    console.log(`Preloaded ${this.cachedCards.size} local cards to cache`);
  }
  
  // 强制预加载更多内容
  async forcePreloadMoreContent() {
    console.log('Force preloading more content...');
    
    // 统计当前各类型缓存数量
    const typeCounts = new Map();
    for (const [key, card] of this.cachedCards.entries()) {
      const type = card.type;
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }
    
         // 优先预加载本地内容，减少API依赖
     for (const type of this.settings.contentTypes) {
       const currentCount = typeCounts.get(type) || 0;
       let targetCount;
       if (type === 'wikipedia') {
         targetCount = 60; // Wikipedia目标60条
       } else if (type === 'datafacts') {
         targetCount = 40; // 数据真相目标40条
       } else {
         targetCount = 20; // 其他类型目标20条
       }
      
      if (currentCount < targetCount) {
        const needed = targetCount - currentCount;
        console.log(`Force preloading ${type}: ${needed} cards needed`);
        
        // 优先使用本地内容
        const localCards = this.getLocalContent(type);
        if (localCards && localCards.length > 0) {
          const cardsToAdd = Math.min(needed, localCards.length);
          for (let i = 0; i < cardsToAdd; i++) {
            const card = localCards[i];
            const cardKey = `${type}_local_${card.title}_${Date.now()}_${i}`;
            this.cachedCards.set(cardKey, card);
          }
        }
        
        // 如果本地内容不足，尝试API
        if (currentCount + (localCards?.length || 0) < targetCount) {
          const apiNeeded = targetCount - currentCount - (localCards?.length || 0);
          for (let i = 0; i < Math.min(apiNeeded, 3); i++) { // 减少API调用次数
            try {
              await this.fetchNewCardFromAPI(type);
              await new Promise(resolve => setTimeout(resolve, 1000)); // 增加间隔
            } catch (error) {
              console.warn(`Failed to force preload ${type}:`, error);
              break;
            }
          }
        }
      }
    }
    
    console.log(`Force preload completed. Total cache size: ${this.cachedCards.size}`);
  }
  
  // 批量更新缓存内容
  async performBatchUpdate() {
    console.log('Starting batch update...');
    const now = Date.now();
    
    // 防止频繁更新（至少间隔60秒）
    if (now - this.batchUpdateConfig.lastBatchUpdate < 60000) {
      return;
    }
    
    this.batchUpdateConfig.lastBatchUpdate = now;
    
    // 统计当前各类型缓存数量
    const typeCounts = new Map();
    for (const [key, card] of this.cachedCards.entries()) {
      const type = card.type;
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }
    
         // 优先更新Wikipedia（目标80条）
     const wikipediaCount = typeCounts.get('wikipedia') || 0;
     if (wikipediaCount < this.batchUpdateConfig.wikipediaTarget) {
       const needed = Math.min(8, this.batchUpdateConfig.wikipediaTarget - wikipediaCount); // 从15改为8
       console.log(`Updating Wikipedia: ${needed} cards needed`);
       
       for (let i = 0; i < needed; i++) {
         try {
           await this.fetchWikipediaCards();
           await new Promise(resolve => setTimeout(resolve, this.periodicUpdateConfig.apiCallDelay)); // 使用配置的延迟
         } catch (error) {
           console.warn('Failed to fetch Wikipedia card in batch update:', error);
           break;
         }
       }
     }
     
     // 优先更新数据真相（目标30条）
     const datafactsCount = typeCounts.get('datafacts') || 0;
     const datafactsTarget = 30;
     if (datafactsCount < datafactsTarget) {
       const needed = Math.min(5, datafactsTarget - datafactsCount); // 从10改为5
       console.log(`Updating datafacts: ${needed} cards needed`);
       
       for (let i = 0; i < needed; i++) {
         try {
           await this.fetchDataFactCards();
           await new Promise(resolve => setTimeout(resolve, this.periodicUpdateConfig.apiCallDelay)); // 使用配置的延迟
         } catch (error) {
           console.warn('Failed to fetch datafacts card in batch update:', error);
           break;
         }
       }
     }
     
     // 更新其他类型（每种目标8条）
     const otherTypes = this.settings.contentTypes.filter(type => type !== 'wikipedia' && type !== 'datafacts');
    for (const type of otherTypes) {
      const currentCount = typeCounts.get(type) || 0;
      if (currentCount < this.batchUpdateConfig.otherTarget) {
        const needed = Math.min(3, this.batchUpdateConfig.otherTarget - currentCount); // 从5改为3
        console.log(`Updating ${type}: ${needed} cards needed`);
        
        for (let i = 0; i < needed; i++) {
          try {
            await this.fetchNewCardFromAPI(type);
            await new Promise(resolve => setTimeout(resolve, this.periodicUpdateConfig.apiCallDelay)); // 使用配置的延迟
          } catch (error) {
            console.warn(`Failed to fetch ${type} card in batch update:`, error);
            break;
          }
        }
      }
    }
    
    console.log(`Batch update completed. Total cache size: ${this.cachedCards.size}`);
  }
  
  // 启动定时更新机制
  startPeriodicUpdate() {
    if (!this.periodicUpdateConfig.enabled) {
      return;
    }
    
    console.log('Starting periodic update mechanism...');
    
    // 清除可能存在的旧定时器
    if (this.periodicUpdateConfig.updateTimer) {
      clearInterval(this.periodicUpdateConfig.updateTimer);
    }
    
    // 启动定时器
    this.periodicUpdateConfig.updateTimer = setInterval(() => {
      this.performPeriodicUpdate();
    }, this.periodicUpdateConfig.interval);
    
    console.log(`Periodic update started with ${this.periodicUpdateConfig.interval / 1000}s interval`);
  }
  
  // 停止定时更新机制
  stopPeriodicUpdate() {
    if (this.periodicUpdateConfig.updateTimer) {
      clearInterval(this.periodicUpdateConfig.updateTimer);
      this.periodicUpdateConfig.updateTimer = null;
      console.log('Periodic update stopped');
    }
  }
  
  // 执行定时更新
  async performPeriodicUpdate() {
    const now = Date.now();
    const cacheSize = this.cachedCards.size;
    
    // 防止频繁更新（至少间隔2分钟）
    if (now - this.periodicUpdateConfig.lastPeriodicUpdate < 120000) {
      return;
    }
    
    // 检查缓存状态
    if (cacheSize >= this.periodicUpdateConfig.maxCacheThreshold) {
      console.log(`Cache is full (${cacheSize}), stopping periodic update`);
      this.stopPeriodicUpdate();
      return;
    }
    
    // 缓存未满时进行更新
    if (cacheSize < this.periodicUpdateConfig.maxCacheThreshold) {
      console.log(`Cache not full (${cacheSize}), performing periodic update...`);
      
      this.periodicUpdateConfig.lastPeriodicUpdate = now;
      
      // 统计当前各类型缓存数量
      const typeCounts = new Map();
      for (const [key, card] of this.cachedCards.entries()) {
        const type = card.type;
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      }
      
      // 优先更新Wikipedia（目标60条）
      const wikipediaCount = typeCounts.get('wikipedia') || 0;
      if (wikipediaCount < 60) {
        const needed = Math.min(2, 60 - wikipediaCount); // 从3改为2
        console.log(`Periodic update: Wikipedia needs ${needed} cards`);
        
        for (let i = 0; i < needed; i++) {
          try {
            await this.fetchWikipediaCards();
            await new Promise(resolve => setTimeout(resolve, this.periodicUpdateConfig.apiCallDelay)); // 使用配置的延迟
          } catch (error) {
            console.warn('Failed to fetch Wikipedia card in periodic update:', error);
            break;
          }
        }
      }
      
      // 更新数据真相（目标40条）
      const datafactsCount = typeCounts.get('datafacts') || 0;
      if (datafactsCount < 40) {
        const needed = Math.min(1, 40 - datafactsCount); // 从2改为1
        console.log(`Periodic update: Datafacts needs ${needed} cards`);
        
        for (let i = 0; i < needed; i++) {
          try {
            await this.fetchDataFactCards();
            await new Promise(resolve => setTimeout(resolve, this.periodicUpdateConfig.apiCallDelay)); // 使用配置的延迟
          } catch (error) {
            console.warn('Failed to fetch datafacts card in periodic update:', error);
            break;
          }
        }
      }
      
      // 更新其他类型（每种目标20条）
      const otherTypes = this.settings.contentTypes.filter(type => type !== 'wikipedia' && type !== 'datafacts');
      for (const type of otherTypes) {
        const currentCount = typeCounts.get(type) || 0;
        if (currentCount < 20) {
          const needed = Math.min(1, 20 - currentCount);
          console.log(`Periodic update: ${type} needs ${needed} cards`);
          
          for (let i = 0; i < needed; i++) {
            try {
              await this.fetchNewCardFromAPI(type);
              await new Promise(resolve => setTimeout(resolve, this.periodicUpdateConfig.apiCallDelay)); // 使用配置的延迟
            } catch (error) {
              console.warn(`Failed to fetch ${type} card in periodic update:`, error);
              break;
            }
          }
        }
      }
      
      console.log(`Periodic update completed. Total cache size: ${this.cachedCards.size}`);
    }
  }
  
  // 页面卸载时清理定时器
  cleanup() {
    this.stopPeriodicUpdate();
    this.saveGlobalCache();
  }

  // 根据当前设置清理缓存：移除禁用类型的卡片
  purgeCacheBySettings() {
    try {
      const allowed = new Set(this.settings.contentTypes || []);
      let removed = 0;
      for (const [key, card] of Array.from(this.cachedCards.entries())) {
        if (!allowed.has(card.type)) {
          this.cachedCards.delete(key);
          removed++;
        }
      }
      if (removed > 0) {
        console.log(`[WaitWiki] Purged ${removed} cached cards not in allowed types.`);
      }

      // 如果当前卡片类型被禁用，立即处理
      if (this.currentCard && !allowed.has(this.currentCard.type)) {
        this.hideCard();
        this.currentCard = null;
      }
    } catch (e) {
      console.warn('[WaitWiki] purgeCacheBySettings failed:', e);
    }
  }
}

// 初始化 WaitWiki
const waitWiki = new WaitWiki();

// 页面卸载时清理资源
window.addEventListener('beforeunload', () => {
  if (waitWiki) {
    waitWiki.cleanup();
  }
});
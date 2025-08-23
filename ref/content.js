// WaitWiki Content Script V1.0 - Knowledge Cards for LLM Waiting Time
// 知涟 WaitWiki - 在AI对话期间展示有趣知识

class WaitWiki {
  constructor() {
    this.isShowingCard = false;
    this.isLoadingCard = false;
    this.conversationState = 'idle'; // 'idle' | 'generating'
    this.knowledgeCards = [];
    this.lastCardIndex = -1;
    this.settings = { 
      enabled: true, 
      showSourceInfo: true, 
      showIcon: true, 
      darkMode: false, 
      cardSize: 'medium', 
      displayDuration: '10',
      language: 'zh',
      contentTypes: ['wikipedia', 'quotes', 'facts']
    };
    this.ui = {}; // Will be populated by createUI
    
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
    
    // 全局知识卡片缓存池
    this.globalCacheKey = 'waitwiki_global_cache_v1';
    this.cachedCards = new Map(); // 内存缓存
    this.cacheStats = { hits: 0, misses: 0, failures: 0 };
    
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
      const result = await chrome.storage.local.get([this.globalCacheKey]);
      const cacheData = result[this.globalCacheKey] || {};
      
      // 恢复内存缓存
      for (const [key, card] of Object.entries(cacheData)) {
        this.cachedCards.set(key, card);
      }
    } catch (error) {
      console.warn('Failed to load global cache:', error);
    }
  }

  // 保存全局缓存
  async saveGlobalCache() {
    try {
      const cacheData = {};
      let savedCount = 0;
      
      // 限制缓存大小，只保存最近的100张卡片
      const maxCacheSize = 100;
      const entries = Array.from(this.cachedCards.entries()).slice(-maxCacheSize);
      
      for (const [key, card] of entries) {
        cacheData[key] = card;
        savedCount++;
      }
      
      await chrome.storage.local.set({ [this.globalCacheKey]: cacheData });
    } catch (error) {
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
    
    // 每次显示popup时，预加载一张新卡片到缓存
    this.preloadOneMoreCard();
    
    // 根据设置决定是否自动隐藏
    if (this.settings.displayDuration !== 'always') {
      const duration = parseInt(this.settings.displayDuration) * 1000;
      
      setTimeout(() => {
        this.onConversationEnd(null);
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
        await this.fetchKnowledgeCard(randomType);
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
      Object.keys(changes).forEach(key => {
        if (this.settings.hasOwnProperty(key)) this.settings[key] = changes[key].newValue;
      });
      this.applySettings();
    });
    
    // 监听来自popup的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'settingsChanged') {
        this.settings = { ...this.settings, ...request.settings };
        this.applySettings();
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
      
      // 如果缓存中卡片不足10张，开始预加载
      if (this.cachedCards.size < 10) {
        this.startSmartPreload();
      }
    } catch (error) {
      console.warn('Failed to load knowledge cards:', error);
      this.knowledgeCards = this.getFallbackCards();
    }
  }

  // 从各个API获取知识卡片
  async fetchKnowledgeCard(type) {
    const cacheKey = `${type}_${Date.now()}`;
    
    // 检查缓存
    if (this.cachedCards.size > 0) {
      const cachedCards = Array.from(this.cachedCards.values()).filter(card => card.type === type);
      if (cachedCards.length > 0) {
        return cachedCards;
      }
    }

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
        default:
          break;
      }
      
      // 缓存成功获取的卡片
      cards.forEach(card => {
        const cardKey = `${type}_${card.title}_${Date.now()}`;
        this.cachedCards.set(cardKey, card);
      });
      
      return cards;
    } catch (error) {
      console.warn(`Failed to fetch ${type} cards:`, error);
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
      // 优先使用 Zen Quotes
      const response = await fetch(this.apiEndpoints.quotes.zen);
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
        const response = await fetch(this.apiEndpoints.quotes.quotable);
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
        throw new Error(`Quotes API error: ${error.message}`);
      }
    }
  }

  // 获取趣闻卡片
  async fetchFactCards() {
    try {
      // 优先使用 Numbers API
      const response = await fetch(this.apiEndpoints.facts.numbers);
      const text = await response.text();
      
      return [{
        type: 'facts',
        title: '数字趣闻',
        content: text,
        source: 'Numbers API',
        url: '',
        language: this.settings.language
      }];
    } catch (error) {
      throw new Error(`Facts API error: ${error.message}`);
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
    
    // 每次只预加载一张卡片，间隔更长时间
    let loadIndex = 0;
    const loadNext = async () => {
      if (loadIndex >= availableTypes.length || loadIndex >= 5) {
        return;
      }
      
      const type = availableTypes[loadIndex];
      
      try {
        await this.fetchKnowledgeCard(type);
        loadIndex++;
        setTimeout(loadNext, 3000);
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
    
    // 更新UI内容
    this.ui.title.textContent = this.currentCard.title;
    this.ui.content.textContent = this.currentCard.content;
    
    if (this.currentCard.url) {
      this.ui.source.innerHTML = `<a href="${this.currentCard.url}" target="_blank">来源：${this.currentCard.source}</a>`;
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

  selectRandomCard() {
    // 优先从缓存中选择
    const allCards = Array.from(this.cachedCards.values());
    
    if (allCards.length === 0 && this.knowledgeCards.length === 0) {
      return;
    }
    
    const availableCards = allCards.length > 0 ? allCards : this.knowledgeCards;
    
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * availableCards.length);
    } while (availableCards.length > 1 && newIndex === this.lastCardIndex);
    
    this.lastCardIndex = newIndex;
    this.currentCard = availableCards[newIndex];
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
}

// 初始化 WaitWiki
new WaitWiki();
// WaitWiki Popup Script

// 加载设置
function loadSettings() {
  chrome.storage.sync.get([
    'enabled',
    'showSourceInfo',
    'showIcon',
    'darkMode',
    'cardSize',
    'displayDuration',
    'contentTypes'
  ], (result) => {
    document.getElementById('enableToggle').checked = result.enabled !== false;
    document.getElementById('showInfoToggle').checked = result.showSourceInfo !== false;
    document.getElementById('showIconToggle').checked = result.showIcon !== false;
    document.getElementById('darkModeToggle').checked = result.darkMode === true;
    
    // 设置卡片大小
    const size = result.cardSize || 'medium';
    document.querySelector(`input[name="artworkSize"][value="${size}"]`).checked = true;
    
    // 设置展示时长
    const duration = result.displayDuration || '10';
    document.querySelector(`input[name="displayDuration"][value="${duration}"]`).checked = true;
    
    // 设置内容类型
    const contentTypes = result.contentTypes || ['wikipedia', 'quotes', 'facts', 'advice', 'catfacts', 'trivia', 'cocktails'];
    const allContentTypes = ['wikipedia', 'quotes', 'facts', 'advice', 'catfacts', 'trivia', 'cocktails'];
    
    allContentTypes.forEach(type => {
      const checkbox = document.getElementById(`contentType-${type}`);
      if (checkbox) {
        checkbox.checked = contentTypes.includes(type);
      }
    });
    
    // 应用暗夜模式
    applyDarkMode(result.darkMode === true);
  });
}

// 保存设置
function saveSettings() {
  const cardSizeElement = document.querySelector('input[name="artworkSize"]:checked');
  const durationElement = document.querySelector('input[name="displayDuration"]:checked');
  
  // 收集选中的内容类型
  const allContentTypes = ['wikipedia', 'quotes', 'facts', 'advice', 'catfacts', 'trivia', 'cocktails'];
  const selectedContentTypes = allContentTypes.filter(type => {
    const checkbox = document.getElementById(`contentType-${type}`);
    return checkbox && checkbox.checked;
  });
  
  const settings = {
    enabled: document.getElementById('enableToggle').checked,
    showSourceInfo: document.getElementById('showInfoToggle').checked,
    showIcon: document.getElementById('showIconToggle').checked,
    darkMode: document.getElementById('darkModeToggle').checked,
    cardSize: cardSizeElement ? cardSizeElement.value : 'medium',
    displayDuration: durationElement ? durationElement.value : '10',
    contentTypes: selectedContentTypes.length > 0 ? selectedContentTypes : ['wikipedia'] // 至少保留一个类型
  };
  
  chrome.storage.sync.set(settings, () => {
    console.log('Settings saved');
    
    // 应用暗夜模式
    applyDarkMode(settings.darkMode);
    
    // 通知所有标签页的设置变更
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { 
          action: 'settingsChanged', 
          settings: settings 
        }).catch(() => {
          // 忽略错误，某些标签页可能没有content script
        });
      });
    });
  });
}

// 应用暗夜模式
function applyDarkMode(isDark) {
  if (isDark) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  
  // 绑定事件
  document.getElementById('enableToggle').addEventListener('change', saveSettings);
  document.getElementById('showInfoToggle').addEventListener('change', saveSettings);
  document.getElementById('showIconToggle').addEventListener('change', saveSettings);
  document.getElementById('darkModeToggle').addEventListener('change', saveSettings);
  
  // 绑定卡片大小选择器事件
  document.querySelectorAll('input[name="artworkSize"]').forEach(radio => {
    radio.addEventListener('change', saveSettings);
  });
  
  // 绑定展示时长选择器事件
  document.querySelectorAll('input[name="displayDuration"]').forEach(radio => {
    radio.addEventListener('change', saveSettings);
  });
  
  // 绑定内容类型复选框事件
  const allContentTypes = ['wikipedia', 'quotes', 'facts', 'advice', 'catfacts', 'trivia', 'cocktails'];
  allContentTypes.forEach(type => {
    const checkbox = document.getElementById(`contentType-${type}`);
    if (checkbox) {
      checkbox.addEventListener('change', saveSettings);
    }
  });
});
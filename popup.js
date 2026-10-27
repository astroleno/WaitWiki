let gallerySettings;
const contentTypes = ['wikipedia', 'quotes', 'facts', 'advice', 'catfacts', 'trivia', 'cocktails', 'datafacts', 'gathas'];

async function loadSettings() {
  const result = await chrome.storage.sync.get(['enabled', 'showSourceInfo', 'showIcon', 'darkMode',
    'cardSize', 'displayDuration', 'contentTypes', ...GalleryExperience.KEYS]);
  document.getElementById('enableToggle').checked = result.enabled !== false;
  document.getElementById('showInfoToggle').checked = result.showSourceInfo !== false;
  document.getElementById('showIconToggle').checked = result.showIcon !== false;
  const size = ['small', 'medium', 'large'].includes(result.cardSize) ? result.cardSize : 'medium';
  const duration = ['10', '20', 'always'].includes(result.displayDuration) ? result.displayDuration : '10';
  document.querySelector('input[name="artworkSize"][value="' + size + '"]').checked = true;
  document.querySelector('input[name="displayDuration"][value="' + duration + '"]').checked = true;
  contentTypes.forEach(type => { document.getElementById('contentType-' + type).checked = (result.contentTypes || contentTypes).includes(type); });
  gallerySettings.load(result);
}

async function saveSettings() {
  let selectedTypes = contentTypes.filter(type => document.getElementById('contentType-' + type).checked);
  if (!selectedTypes.length) {
    selectedTypes = ['wikipedia'];
    document.getElementById('contentType-wikipedia').checked = true;
  }
  const prefs = gallerySettings.values();
  const settings = {
    enabled: document.getElementById('enableToggle').checked,
    showSourceInfo: document.getElementById('showInfoToggle').checked,
    showIcon: document.getElementById('showIconToggle').checked,
    cardSize: document.querySelector('input[name="artworkSize"]:checked').value,
    displayDuration: document.querySelector('input[name="displayDuration"]:checked').value,
    contentTypes: selectedTypes,
    ...prefs,
    darkMode: prefs.appearance === 'dark'
  };
  await chrome.storage.sync.set(settings);
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { action: 'settingsChanged', settings })));
}

document.addEventListener('DOMContentLoaded', () => {
  gallerySettings = new GallerySettings(document.getElementById('gallery-settings'), 'reading', saveSettings);
  document.getElementById('version').textContent = chrome.runtime.getManifest().version;
  loadSettings();
  document.querySelectorAll('main > section:not(#gallery-settings) input').forEach(input => input.addEventListener('change', saveSettings));
});

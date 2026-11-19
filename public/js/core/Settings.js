// Kalıcı ayarlar (localStorage). Bazı WebView'larda storage atabilir -> try/catch.
const KEY = 'wc_settings_v1';
const SESSION_KEY = 'wc_session_v1';

export const isNative = () => !!window.Capacitor?.isNativePlatform?.();
export const isTouch = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function load(key, fallback) {
  try { return { ...fallback, ...(JSON.parse(localStorage.getItem(key)) ?? {}) }; } catch { return { ...fallback }; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* yok say */ }
}

const defaults = {
  name: '',
  serverUrl: window.WC_DEFAULT_SERVER || (isNative() ? '' : location.origin),
  master: 0.8,
  music: 0.55,
  sfx: 0.9,
  quality: isTouch() ? 'medium' : 'high',
  showFps: false,
  introSeen: false,
};

const loaded = load(KEY, defaults);
// Eski sürümde boş kaydedilmiş adres varsa APK'ya gömülü sunucuyu kullan
if (!loaded.serverUrl && window.WC_DEFAULT_SERVER) loaded.serverUrl = window.WC_DEFAULT_SERVER;

export const Settings = {
  data: loaded,
  get(k) { return this.data[k]; },
  set(k, v) { this.data[k] = v; save(KEY, this.data); },
};

export const Session = {
  get() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } },
  set(s) { save(SESSION_KEY, s); },
  clear() { try { localStorage.removeItem(SESSION_KEY); } catch { /* yok say */ } },
};

// Her dünyadaki karakterin anahtarı: aynı telefondan geri dönünce aynı karakter
const TOKENS_KEY = 'wc_tokens_v1';
export const Tokens = {
  all() { try { return JSON.parse(localStorage.getItem(TOKENS_KEY)) ?? {}; } catch { return {}; } },
  get(code) { return this.all()[code] ?? null; },
  set(code, token) { const a = this.all(); a[code] = token; save(TOKENS_KEY, a); },
};

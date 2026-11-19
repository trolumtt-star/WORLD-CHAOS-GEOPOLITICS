import { el } from '../core/dom.js';
import { GAME_VERSION } from '../../shared/version.js';

/** Sunucu daha yeni sürüm istiyorsa oyunu kilitleyen "Güncelleme geldi" ekranı */
export function showUpdateGate(res) {
  if (document.querySelector('.update-gate')) return;
  const open = (url) => {
    if (!url) return;
    if (window.Capacitor?.isNativePlatform?.()) window.location.href = url; // Android: WhatsApp / tarayıcı uygulaması açılır
    else window.open(url, '_blank');
  };
  const wa = res.whatsapp || 'https://wa.me/';
  document.body.append(el('div', { class: 'update-gate' },
    el('div', { class: 'ug-card' },
      el('div', { class: 'ug-icon' }, '📲'),
      el('h2', {}, 'GÜNCELLEME GELDİ!'),
      el('p', {}, `Yeni sürüm (v${res.version}) çıktı. Senin sürümün v${GAME_VERSION}. Güncellemeden oynayamazsın.`),
      el('button', { class: 'btn primary wide big', onClick: () => open(wa) }, '💬 WhatsApp\'ı Aç ve İndir'),
      el('button', { class: 'btn wide', onClick: () => open(res.apk) }, '⬇️ Direkt İndir (GitHub)'),
      el('small', {}, 'İndirdiğin APK\'yı aç → "Güncelle" de. Kayıtlı dünyan ve karakterin kaybolmaz.'))));
}

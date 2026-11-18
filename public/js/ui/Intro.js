import { el, sleep } from '../core/dom.js';

/** "Başlamak için dokun" ekranı: ses kilidini açar, mobilde tam ekran + yatay mod dener. */
export function bootScreen(root) {
  return new Promise((resolve) => {
    const layer = el('div', { class: 'boot' },
      el('div', { class: 'boot-logo' }, 'WORLD', el('span', {}, 'CHAOS')),
      el('div', { class: 'boot-tap' }, 'Başlamak için dokun'),
      el('div', { class: 'boot-hint' }, '🎧 En iyi deneyim için sesi aç'));
    root.append(layer);
    layer.addEventListener('pointerdown', async () => {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen && matchMedia('(pointer: coarse)').matches) {
          await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
          await screen.orientation?.lock?.('landscape').catch(() => {});
        }
      } catch { /* bazı tarayıcılar izin vermez */ }
      layer.classList.add('out');
      setTimeout(() => layer.remove(), 600);
      resolve();
    }, { once: true });
  });
}

/**
 * Sinematik giriş: sinema bantları, stüdyo yazısı, daktilo efekti ile slogan,
 * füze + patlama ile logonun ekrana çarpması. Dokunarak geçilebilir.
 */
export async function playIntro(root, audio, backdrop) {
  let skipped = false;
  const text = el('div', { class: 'intro-text' });
  const title = el('div', { class: 'intro-title hidden' }, el('div', { class: 'it-main', 'data-text': 'WORLD CHAOS' }, 'WORLD CHAOS'), el('div', { class: 'it-sub' }, 'GEOPOLITICS · 3D'));
  const skip = el('button', { class: 'intro-skip' }, 'Geç ▸');
  const layer = el('div', { class: 'intro' }, el('div', { class: 'bar top' }), el('div', { class: 'bar bottom' }), text, title, skip, el('div', { class: 'vignette' }));
  root.append(layer);
  const done = new Promise((resolve) => {
    skip.addEventListener('click', () => { skipped = true; resolve(); });
  });

  const wait = (ms) => Promise.race([sleep(ms), done]);
  const show = async (content, ms, cls = '') => {
    if (skipped) return;
    text.className = `intro-text ${cls}`;
    text.textContent = '';
    text.classList.add('in');
    if (typeof content === 'string') text.textContent = content;
    else await content();
    await wait(ms);
    text.classList.remove('in');
    await wait(500);
  };
  const type = (str, speed = 45) => async () => {
    for (const ch of str) {
      if (skipped) return;
      text.textContent += ch;
      if (ch !== ' ') audio.play('type', { minGap: 0, vol: 0.7 });
      await wait(speed);
    }
  };

  backdrop.cinematic = true;
  audio.setMusic('menu');
  audio.play('riser');
  layer.classList.add('play');
  await wait(900);
  await show('K A O S   S T U D I O S   S U N A R', 1800, 'studio');
  await show(type('Bir şehir. Yüzlerce hayat.'), 1100);
  await show(type('Ticaret. Siyaset. Suç. Savaş.'), 1100);
  await show(type('Kurallar yok. Sadece kaos.'), 900, 'red');

  if (!skipped) {
    backdrop.strike(0, 0, { loud: true, type: 'ballistic' });
    await wait(1700);
  }
  title.classList.remove('hidden');
  title.classList.add('slam');
  if (!skipped) {
    document.getElementById('flash').style.cssText = 'opacity:1;background:#fff;transition:none';
    requestAnimationFrame(() => { document.getElementById('flash').style.cssText = 'opacity:0;background:#fff;transition:opacity 1.4s ease-out'; });
  }
  await wait(2200);
  layer.classList.add('out');
  backdrop.cinematic = false;
  await sleep(700);
  layer.remove();
}

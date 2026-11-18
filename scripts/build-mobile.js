// APK için web dosyalarını www/ klasörüne hazırlar (Capacitor webDir).
// Kütüphaneler (three.js, socket.io istemcisi) gömülür -> APK internetsiz açılır.
// Kullanım: SERVER_URL=http://192.168.1.20:3000 npm run build:mobile
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WWW = path.join(ROOT, 'www');
const NM = path.join(ROOT, 'node_modules');

const need = [path.join(NM, 'three', 'build', 'three.module.js'), path.join(NM, 'socket.io', 'client-dist', 'socket.io.min.js')];
for (const f of need) {
  if (!fs.existsSync(f)) {
    console.error(`Eksik: ${f}\nÖnce "npm install" çalıştır.`);
    process.exit(1);
  }
}

fs.rmSync(WWW, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), WWW, { recursive: true });
fs.cpSync(path.join(ROOT, 'shared'), path.join(WWW, 'shared'), { recursive: true });
fs.mkdirSync(path.join(WWW, 'vendor', 'three'), { recursive: true });
fs.cpSync(path.join(NM, 'three', 'build'), path.join(WWW, 'vendor', 'three'), { recursive: true });
fs.copyFileSync(need[1], path.join(WWW, 'vendor', 'socket.io.min.js'));

// Varsayılan sunucu adresi APK'ya gömülebilir (oyuncu yine Ayarlar'dan değiştirebilir)
const url = (process.env.SERVER_URL ?? '').trim();
fs.writeFileSync(path.join(WWW, 'config.js'), `window.WC_DEFAULT_SERVER = ${JSON.stringify(url)};\n`);

console.log(`✅ www/ hazır${url ? ` (varsayılan sunucu: ${url})` : ' (sunucu adresi oyun içinden girilecek)'}`);

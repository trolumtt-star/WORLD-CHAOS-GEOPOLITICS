import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

import { CONFIG } from './config.js';
import { Lobby } from './lobby/Lobby.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const NM = path.join(ROOT, 'node_modules');

const app = express();
app.use(express.static(path.join(ROOT, 'public')));
app.use('/shared', express.static(path.join(ROOT, 'shared')));
// Üçüncü parti kütüphaneler CDN'den değil node_modules'tan: APK'da internet olmadan da yüklenir
app.use('/vendor/three', express.static(path.join(NM, 'three', 'build')));
app.get('/vendor/socket.io.min.js', (_req, res) => res.sendFile(path.join(NM, 'socket.io', 'client-dist', 'socket.io.min.js')));

const server = http.createServer(app);
// APK (capacitor://localhost, https://localhost) farklı origin'den bağlandığı için CORS açık
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 10000, pingTimeout: 20000 });
const lobby = new Lobby(io);

app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: lobby.list() }));

server.listen(CONFIG.port, '0.0.0.0', () => {
  console.log(`\n🌍 WORLD CHAOS sunucusu hazır → http://localhost:${CONFIG.port}`);
  console.log('   Telefondan bağlanmak için aynı Wi-Fi\'da bilgisayarının IP adresini kullan (ör. http://192.168.1.20:3000)\n');
});

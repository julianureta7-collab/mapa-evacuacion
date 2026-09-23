// Servidor estático mínimo para desarrollo, sin dependencias.
// Uso: node scripts/servidor.mjs   → http://localhost:8080
// Sirve la carpeta app/ y /panel. Muestra también la IP de la red local
// (ojo: fuera de localhost los navegadores exigen HTTPS para la ubicación).

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = Number(process.env.PORT) || 8080;
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.geojson': 'application/geo+json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const base = ruta.startsWith('/panel') ? RAIZ : join(RAIZ, 'app');
  let archivo = normalize(join(base, ruta));
  if (!archivo.startsWith(RAIZ)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(archivo)).isDirectory()) archivo = join(archivo, 'index.html');
    const datos = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(datos);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado: ' + ruta);
  }
}).listen(PUERTO, () => {
  console.log(`App:   http://localhost:${PUERTO}`);
  console.log(`Panel: http://localhost:${PUERTO}/panel/`);
  for (const lista of Object.values(networkInterfaces()))
    for (const i of lista) if (i.family === 'IPv4' && !i.internal) console.log(`Red local: http://${i.address}:${PUERTO}`);
});

/* 80 Years of Freedom — minimal static file server for local development.
 * The production deployment is fully static (Vercel serves public/ directly);
 * this server exists so `npm start` works locally. No API, no WebSocket, no
 * state — just the files in public/.
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

app.listen(PORT, () => {
  console.log(`80 Years of Freedom running at http://localhost:${PORT}`);
});

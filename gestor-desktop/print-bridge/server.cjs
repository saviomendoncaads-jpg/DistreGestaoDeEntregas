const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const origins = new Set((process.env.DISTRE_PRINT_ORIGINS || '').split(',').filter(Boolean));
if (!origins.size) throw Error('Configure DISTRE_PRINT_ORIGINS antes de iniciar.');
const token = crypto.randomBytes(32).toString('hex');
const output = path.join(process.env.LOCALAPPDATA, 'Distre', 'Impressao');
fs.mkdirSync(output, { recursive: true });
const run = args => new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', ...args], { windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 }, (error, stdout) => error ? reject(Error('Não foi possível acessar a impressora. Verifique o driver e a conexão.')) : resolve(stdout.trim())));
let printQueue = Promise.resolve();
let pending = 0;
const server = http.createServer(async (req, res) => {
  if (!origins.has(req.headers.origin)) { res.writeHead(403); res.end(); return; }
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Distre-Print-Token');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cache-Control', 'no-store');
  const reply = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  try {
    if (req.url === '/printers' && req.method === 'GET') {
      const stdout = await run(['-Command', "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); @(Get-Printer | Select-Object Name,DriverName,PortName) | ConvertTo-Json -Compress"]);
      const result = JSON.parse(stdout || '[]');
      const printers = (Array.isArray(result) ? result : [result]).map(p => ({ name: p.Name, driver: p.DriverName, automatic: !/OneNote|Fax|XPS/i.test(`${p.Name} ${p.DriverName}`) }));
      reply(200, { printers, token }); return;
    }
    if (req.url !== '/print' || req.method !== 'POST') { reply(404, { error: 'Recurso não encontrado.' }); return; }
    if (req.headers['x-distre-print-token'] !== token) { reply(403, { error: 'Reconecte as impressoras locais.' }); return; }
    if (pending >= 20) { reply(429, { error: 'Fila de impressão cheia. Aguarde e tente novamente.' }); return; }
    let body = '';
    for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 100000) { reply(413, { error: 'Comanda muito grande.' }); return; } }
    const job = JSON.parse(body);
    if (typeof job.printer !== 'string' || !job.printer || !Array.isArray(job.lines) || job.lines.length > 500 || job.lines.some(l => typeof l !== 'string' || l.length > 2000)) { reply(400, { error: 'Dados de impressão inválidos.' }); return; }
    const id = `comanda-${crypto.randomUUID()}`;
    const requestPath = path.join(output, `${id}.json`);
    const outputPath = path.join(output, `${id}.pdf`);
    pending++;
    const task = printQueue.catch(() => {}).then(async () => {
      try {
        fs.writeFileSync(requestPath, JSON.stringify({ ...job, id, outputPath }), 'utf8');
        await run(['-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'print-job.ps1'), '-RequestPath', requestPath]);
      } finally { pending--; fs.rmSync(requestPath, { force: true }); }
    });
    printQueue = task;
    await task;
    reply(200, { success: true, file: fs.existsSync(outputPath) ? outputPath : undefined });
  } catch (error) { reply(500, { error: error.message || 'Falha na impressão local.' }); }
});
server.listen(17891, '127.0.0.1');

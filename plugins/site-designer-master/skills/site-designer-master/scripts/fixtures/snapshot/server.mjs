// A tiny app for the snapshot test, run as its own process (the browser call blocks the test's own process).
import http from 'node:http';
const files = {
  '/app/': '<!doctype html><html lang="en"><head><link rel="stylesheet" href="/app/app.css"></head><body><main id="m"></main><script src="/app/app.js"></script></body></html>',
  '/app/app.css': 'body{color:#111;background:url(/app/bg.png)} h1{font-size:40px}',
  '/app/app.js': "document.getElementById('m').innerHTML = '<h1>Drawn ' + location.hash + '</h1><img src=\"/app/pic.png\" alt=\"x\" width=\"10\" height=\"10\"><a href=\"/app/demo.html#spin\">Open the demo</a><iframe src=\"/app/demo.html?m=rise\" title=\"demo\"></iframe>';",
  '/app/demo.html': '<!doctype html><title>demo</title><p>A demo page.</p>',
  '/app/pic.png': 'PNGDATA', '/app/bg.png': 'BGDATA',
};
const type = (u) => (u.endsWith('.css') ? 'text/css' : u.endsWith('.js') ? 'text/javascript' : u.endsWith('.png') ? 'image/png' : 'text/html');
const srv = http.createServer((req, res) => { const u = req.url.split('?')[0]; const f = files[u]; res.writeHead(f ? 200 : 404, { 'content-type': type(u) }); res.end(f || ''); });
srv.listen(0, '127.0.0.1', () => console.log(srv.address().port));

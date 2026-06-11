const http = require("http");
const fs = require("fs");
const path = require("path");
const { handleApi } = require("./src/handler");

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  let filePath = path.normalize(path.join(PUBLIC_DIR, requestUrl.pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  if (requestUrl.pathname === "/" || !path.extname(filePath) || !fs.existsSync(filePath)) {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`Propostas SAESP ready at http://localhost:${PORT}`);
});

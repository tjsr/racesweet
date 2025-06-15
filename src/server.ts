import { createServer } from 'http';
import fs from 'fs';
import path from 'path';

// import { fileURLToPath } from 'url';



// const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const STATIC_FOLDER = path.join(__dirname, '..', 'public'); // Folder to serve static files from
const mimeTypes: Record<string, string> = {
  '.css': 'text/css',
  '.gif': 'image/gif',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// const serveFile = (filePath: fs.PathLike, res) => {
//   // Check if the requested file exists
//   fs.stat(filePath, (err, stats) => {
//     if (err || !stats.isFile()) {
//       res.writeHead(404, { 'Content-Type': 'text/plain' });
//       res.end('Not Found');
//       return;
//     }

//     res.writeHead(200, { 'Content-Type': contentType });

//     const readStream = fs.createReadStream(filePath);
//     readStream.pipe(res);
//   });
// };

const server = createServer((req, res) => {
  if (req.url) {
    const filePath = path.join(STATIC_FOLDER, req.url === '/' ? '../index.html' : req.url);
    // const filePath = path.join(__dirname, '..', req.url || 'index.html');
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        console.error(`File not found: ${filePath}`, err);
        res.end('Not Found');
        return;
      }
      
      // Serve the file
      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      console.log(`Serving file: ${filePath}`);

      const readStream = fs.createReadStream(filePath);
      readStream.pipe(res);
    });

    // fs.readFile(filePath, (err, data) => {
    //   if (err) {
    //     res.writeHead(500, { 'Content-Type': 'text/plain' });
    //     res.end('Internal Server Error');
    //     console.log(err);
    //     return;
    //   }
    //   res.writeHead(200, { 'Content-Type': 'text/html' });
    //   res.end(data);
    // });
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

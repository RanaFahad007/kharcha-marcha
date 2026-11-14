// Vercel serverless entry point for the SplitTrack Express API.
// The Express app lives in server/server.js (same code as local `node
// server.js`). Vercel invokes this file for every /api/* request via the
// rewrite in vercel.json.
const app = require('../server/server');

module.exports = (req, res) => {
  // When Vercel rewrites /api/(.*) to /api/index.js, some runtimes deliver
  // the rewritten destination path (/api/index.js) as req.url instead of
  // the original path. Restore the original API path in that case; when
  // the original path is already present this is a no-op.
  const rawUrl = req.url || '';
  const [pathOnly, query] = rawUrl.split('?');
  if (pathOnly === '/api/index.js' || pathOnly.startsWith('/api/index.js/')) {
    const rest = pathOnly.slice('/api/index.js'.length);
    req.url = '/api' + rest + (query ? `?${query}` : '');
  }
  return app(req, res);
};

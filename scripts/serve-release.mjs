import {createReadStream, existsSync, statSync} from 'node:fs'
import {createServer} from 'node:http'
import path from 'node:path'

const adminRoot = process.env.RELEASE_ADMIN_DIR
const uiRoot = process.env.RELEASE_UI_DIR
const host = process.env.RELEASE_SMOKE_HOST || '127.0.0.1'
const port = Number(process.env.RELEASE_SMOKE_PORT || '4175')

if (!adminRoot || !uiRoot) {
  throw new Error('RELEASE_ADMIN_DIR and RELEASE_UI_DIR are required')
}

const types = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

function resolveRequest(urlPath) {
  const mount = urlPath === '/admin' || urlPath.startsWith('/admin/')
    ? {prefix: '/admin/', root: path.resolve(adminRoot)}
    : urlPath === '/ui' || urlPath.startsWith('/ui/')
      ? {prefix: '/ui/', root: path.resolve(uiRoot)}
      : null
  if (!mount) return null

  const relative = urlPath === mount.prefix.slice(0, -1)
    ? ''
    : decodeURIComponent(urlPath.slice(mount.prefix.length))
  const candidate = path.resolve(mount.root, relative || 'index.html')
  if (candidate !== mount.root && !candidate.startsWith(`${mount.root}${path.sep}`)) return null
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  return path.join(mount.root, 'index.html')
}

const server = createServer((request, response) => {
  try {
    const pathname = new URL(request.url || '/', `http://${host}:${port}`).pathname
    const filePath = resolveRequest(pathname)
    if (!filePath || !existsSync(filePath)) {
      response.writeHead(404).end('Not found')
      return
    }
    response.writeHead(200, {
      'Content-Type': types.get(path.extname(filePath)) || 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    createReadStream(filePath).pipe(response)
  } catch (error) {
    response.writeHead(400).end(error instanceof Error ? error.message : 'Bad request')
  }
})

server.listen(port, host, () => console.log(`Serving extracted release applications on http://${host}:${port}`))
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}

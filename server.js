import { join } from 'node:path'
import { exec } from 'node:child_process'
import { networkInterfaces, platform } from 'node:os'

const clients = new Set()

const server = Bun.serve({
  port: 8477, // 8477 == BALL

  hostname: '0.0.0.0',

  async fetch(req) {
    const success = server.upgrade(req, { data: { clientId: crypto.randomUUID() } })
    if (success)
      return

    const url = new URL(req.url)

    // Ignore URL from Chrome DevTools
    if (url.pathname === '/.well-known/appspecific/com.chrome.devtools.json')
      return new Response(null, { status: 204 })

    const filePath = url.pathname === '/' ? '/index.html' : url.pathname
    const file = await Bun.file(join(import.meta.dir, filePath))
    return new Response(file)
  },

  websocket: {
    data: {},

    close(ws) {
      const clientId = ws.data.clientId
      clients.delete(clientId)
      console.info('Num clients:', clients.size)
    },

    open(ws) {
      const clientId = ws.data.clientId
      clients.add(clientId)
      console.info('Num clients:', clients.size)
    },

    message(ws, data) {
      const clientId = ws.data.clientId
      console.info('Message from clientId', clientId, data)
    },

    drain(ws) {
      console.warn('backpressure' + ws.getBufferedAmount())
    }
  }
})

const serverUrl = new URL(server.url)

// Find local IP
let address = 'localhost'
const nets = networkInterfaces()
for (const name of Object.keys(nets))
  for (const net of nets[name])
    // Skip over non-IPv4 and internal (loopback) addresses
    if (net.family === "IPv4" && !net.internal)
      serverUrl.hostname = address

// Open default browser.
switch(platform()) {
	case 'darwin': exec(`open ${serverUrl}`)
	case 'linux': exec(`xdg-open ${serverUrl}`)
	case 'win32': exec(`start ${serverUrl}`)
  default:
    console.info('Server running on:', '\x1b[32m', serverUrl.origin, '\x1b[0m')
}

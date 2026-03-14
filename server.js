import { join } from 'node:path'
import { exec } from 'node:child_process'
import { networkInterfaces, platform } from 'node:os'

const clients = new Set()

const sendMessage = (socket, type, data) => {
  socket.send(JSON.stringify({ type, data }))
}

const DEFAULT_GROUP = 'default'

/** @type {'stopped'|'playing'|'disposing'} */
let status = 'stopped'

const broadcastMessage = (server, type, data, group = DEFAULT_GROUP) => {
  server.publish(group, JSON.stringify({ type, data }))
}

const sendNumClients = (server) => {
  const numClients = clients.size
  console.info('Num clients:', numClients)
  broadcastMessage(server, 'NUM_CLIENTS', numClients)
}

const sendStatus = (server) => {
  broadcastMessage(server, 'STATUS', status)
}

const server = Bun.serve({
  port: 8477, // BALL ~ 8477

  // Enable access to external clients on the same network.
  hostname: '0.0.0.0',

  async fetch(request) {
    const success = server.upgrade(request, { data: { clientId: crypto.randomUUID() } })
    if (success)
      return

    const url = new URL(request.url)

    // Ignore URL from Chrome DevTools
    if (url.pathname === '/.well-known/appspecific/com.chrome.devtools.json')
      return new Response(null, { status: 204 })

    const filePath = url.pathname === '/' ? '/index.html' : url.pathname
    const file = await Bun.file(join(import.meta.dir, filePath))
    return new Response(file)
  },

  websocket: {
    data: {},

    open(socket) {
      const clientId = socket.data.clientId
      clients.add(clientId)

      sendMessage(socket, 'SERVER_ORIGIN', `${externalURL.hostname}:${externalURL.port}`)

      socket.subscribe(DEFAULT_GROUP)
      sendNumClients(server)
      status = 'stopped'
      sendStatus(server)
    },

    close(socket) {
      const clientId = socket.data.clientId
      clients.delete(clientId)

      socket.subscribe(DEFAULT_GROUP)
      sendNumClients(server)
      sendStatus(server)
    },

    message(_socket, data) {
      const { type } = JSON.parse(data)

      if (type === 'TOUCH') {
        if (status === 'stopped')
          status = 'playing'
        else if (status === 'playing')
          status = 'stopped'
        sendStatus(server)
      }
    },

    drain(socket) {
      console.warn('backpressure' + socket.getBufferedAmount())
    }
  }
})

const localUrl = `http://localhost:${server.url.port}`
let externalURL = new URL(localUrl)

// Look for IPv4 net interface.
const nets = networkInterfaces()
for (const name of Object.keys(nets))
  for (const net of nets[name])
    if (net.family === 'IPv4' && !net.internal) {
      externalURL = new URL(`http://${net.address}:${server.url.port}`)
      break
    }

// Open default browser.
switch(platform()) {
	case 'darwin': exec(`open ${localUrl}`)
	case 'linux': exec(`xdg-open ${localUrl}`)
	case 'win32': exec(`start ${localUrl}`)
  default:
    console.info('Server running on:', '\x1b[32m', externalURL.origin, '\x1b[0m')
}

/**
 * Create an HTML template element from a string template.
 *
 * @example
 *
 * const template = html`
 *   <style>
 *     :host {
 *       display: block;
 *     }
 *   </style>
 *   <slot></slot>
 * `
 */
const html = (strings, ...expressions) => {
  const template = document.createElement('template')
  template.innerHTML = strings.reduce((result, str, i) => result + str + (expressions[i] ?? ''), '')
  return template
}

/** Create DOM elements. */
const h = (tag, attributes = {}, children = []) => {
  const element = document.createElement(tag)
  Object.assign(element, attributes)
  element.append(...children)
  return element
}

/**
 * Create an SVG element.
 *
 * @example Create element and set attributes.
 *
 * const circle = createSvgElement('circle')
 *   .set('cx', 100)
 *   .set('cy', 100)
 *
 * @example Get attribute value.
 *
 * circle.get('cx')
 *
 * @param {string} qualifiedName
 */
const createSvgElement = (qualifiedName) => {
  const element = document.createElementNS('http://www.w3.org/2000/svg', qualifiedName)
  return Object.assign(element, {
    get: (attributeName) => element.getAttribute(attributeName),
    set: (attributeName, value) => {
      element.setAttribute(attributeName, value)
      return element
    }
  })
}

/**
 * Create an SVG.
 *
 * @example Create an svg with 100x200 dimensions.
 *
 * const svg = createSvg(100, 200)
 */
const createSvg = (width, height, viewBox = `0 0 ${width} ${height}`) => {
  const svg = createSvgElement('svg').set('xmlns', 'http://www.w3.org/2000/svg')
  svg.set('viewBox', viewBox)
  return Object.assign(svg, {
    resize: (width, height) =>
      svg.set('width', width)
         .set('height', height)
  }).resize(width, height)
}

/** Round number to two decimals. */
const decimal2 = (value = 0) => Number(value.toFixed(2))

// State management
// //////////////////////////////////////////////

const state = { __proto__: null }

const peek = (key) => state[key]

const subscribersMap = new Map()

const publish = (key, value) => {
  state[key] = value
  for (const callback of subscribersMap.get(key) ?? [])
    callback(value)
}

const subscribe = (key, callback) => {
  // Register the subscriber.
  const subscribers = subscribersMap.get(key)
  if (subscribers)
    subscribers.add(callback)
  else
    subscribersMap.set(key, new Set([callback]))
  // Send current state
  callback(state[key])
  // Return unsubscribe function.
  return () => {
    const subscribers = subscribersMap.get(key)
    if (subscribers)
      subscribers.delete(callback)
  }
}

// Custom elements
// //////////////////////////////////////////////

class Ball extends HTMLElement {
  /** The CustomElement tag name */
  static localName = 'ball-'

  static strokeWidth = 4

  static template = html`
    <style>
      :host {
        display: block;
      }
      svg {
        background: gainsboro;
        border: 1px solid gray;
        border-radius: 10px;
      }
      ellipse {
        fill: orange;
        stroke: black;
        stroke-width: ${Ball.strokeWidth}px;

        &.disabled { opacity: 40%; }
        transition: opacity 0.5s;
      }
    </style>
  `

  static bounceSoundPath = 'bounce.wav'

  static containerMaxWidth = 400
  static containerHeight = 500

  /**
   * The container width may vary according to client screen.
   * However this does not affect physics, cause the ball bounces only vertically.
   */
  containerWidth

  /**
   * Container height is fixed so it is the same on all clients.
   */
  containerHeight = Ball.containerHeight

  svg = createSvg(0, 0)
  ball = createSvgElement('ellipse')

  /** Ball radius, excluding stroke-width. */
  radius = 40

  /** Initial ball y coordinate. */
  initialY = 70

  /** @type {'stopped'|'playing'|'disposing'} */
  status = 'stopped'

  /** Frames per second. */
  FPS = 60

  /**
   * Ball velocity direction.
   * @type {'up'|'down'}
   */
  direction = 'down'

  /** Duration of ball falling, in milliseconds. */
  fallDuration = 5000

  /**
   * Indicates if the ball is bouncing on the floor.
   * During this stage, the ball will deform due to elasticity.
   */
  isBouncing = false

  /** During bouncing the radius ball will stretch up to this percentage. */
  maxBallRadiusDeformationPercentage = .75

  /** Duration of ball bouncing, in milliseconds. */
  bounceDuration = 300

  audioIsEnabled

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.shadowRoot.appendChild(Ball.template.content.cloneNode(true))
    this.shadowRoot.appendChild(this.svg)
  }

  connectedCallback() {
    this.setContainerDimensions()
    this.createBall()
    this.setBallToInitialPosition()

    subscribe('STATUS', (status) => {
      // Toggle animation.
      if (status === 'stopped')
        this.stop()
      else if (status === 'playing')
        this.start()
    })

    subscribe('AUDIO', (enabled) => {
      this.audioIsEnabled = enabled
      if (enabled)
        this.setupAudio()
    })
  }

  handleEvent(event) {
    const { ball, status } = this

    if (event.type === 'click' && event.target === ball) {
      if (status === 'disposing')
        return
      publish('TOUCH', true)
    }
  }

  createBall() {
    const { ball, radius, svg } = this

    svg.appendChild(ball
      .set('rx', radius)
      .set('ry', radius)
    )
    ball.addEventListener('click', this)
  }

  setBallToInitialPosition() {
    const { ball, initialY, containerWidth } = this

    ball
      .set('cx', containerWidth / 2)
      .set('cy', initialY)
  }

  setContainerDimensions() {
    const phi = 1.618
    const width = this.containerWidth = Math.min(Math.floor(innerWidth / phi), Ball.containerMaxWidth)
    const height = this.containerHeight
    this.svg
      .set('viewBox', `0 0 ${width} ${height}`)
      .resize(width, height)
  }

  generateAnimation() {
    const { containerHeight } = this

    const numFramesOfBouncing = Math.floor(this.bounceDuration / this.deltaT)
    const deltaR = this.radius * this.maxBallRadiusDeformationPercentage / numFramesOfBouncing / 2
    const distance = Math.floor(containerHeight - this.initialY - this.radius)
    // The deltaY with no acceleration.
    const uniformDeltaY = Math.floor(distance * this.deltaT / this.fallDuration)

    const self = this

    function* animationGenerator() {
      while (true) {
        const currentY = Number(self.ball.get('cy'))
        if (self.isBouncing) {
//// Bounce animation.
          let i = 1
          while(i <= numFramesOfBouncing) {
            let ry = Number(self.ball.get('ry'))
            if (i <= numFramesOfBouncing / 2) ry -= deltaR
            else ry += deltaR
            // Keep the same area.
            let rx = self.radius * self.radius / ry
            // Round to two decimals.
            rx = decimal2(rx)
            ry = decimal2(ry)
            // Deform the ball.
            self.ball.set('ry', ry)
            self.ball.set('rx', rx)
            // Move center in order to always touch the floor.
            self.ball.set('cy', decimal2(containerHeight - ry - Ball.strokeWidth))
            i++
            yield Promise.resolve()
          }
          // Once bounce is finished, restore original ball radius.
          self.ball.set('rx', self.radius).set('ry', self.radius)
          self.isBouncing = false
          self.direction = 'up'
        } else if (currentY < self.initialY) {
//// Ball returned to the top.
          self.direction = 'down'
          // Do not go above the container.
          self.ball.set('cy', self.initialY)
          // Stop animation if status is disposing.
          if (self.status === 'disposing') {
            self.status = 'stopped'
            return
          }
        } else {
//// Compute deltaY.
          let deltaY
          if (self.status === 'disposing')
            // Move with constant velocity during disposure.
            deltaY = 2 * uniformDeltaY
          else
            // A sort of acceleration.
            deltaY = Math.max(1, Math.floor(uniformDeltaY * (currentY - self.initialY) / 7))
          // Adjust vector direction.
          if (self.direction === 'up') deltaY = -deltaY
//// Check if it is a hit.
          if (!self.isBouncing && (currentY + self.radius + deltaY > containerHeight)) {
            // Do not go below the container.
            self.ball.set('cy', decimal2(containerHeight - self.radius - Ball.strokeWidth))
            // Play bouncing sound.
            self.playSound()
            // Start bouncing.
            self.isBouncing = true
          } else {
//// Move the ball.
            self.ball.set('cy', decimal2(currentY + deltaY))
          }
        }
        yield
      }
    }
    this.animation = animationGenerator()
  }

  playSound() {
    if (!peek('AUDIO')) return
    const sound = this.audioContext.createBufferSource()
    sound.buffer = this.soundBuffer
    sound.connect(this.audioContext.destination)
    sound.start(0)
  }

  /** Must be called during some user interaction, e.g. click. */
  async setupAudio() {
    // Do nothing if audio was already initialized.
    if (this.audioContext)
      return
    this.audioContext = new AudioContext()
    // Fetch audio file.
    const response = await fetch(Ball.bounceSoundPath)
    const arrayBuffer = await response.arrayBuffer()
    this.soundBuffer = await this.audioContext.decodeAudioData(arrayBuffer)
  }

  loop() {
    // Next animation frame can run when
    // current time is greater than last frame time plus frame duration.
    if (document.timeline.currentTime > this.lastFrameTime + this.deltaT) {
      this.animation.next()
      this.lastFrameTime = document.timeline.currentTime
    }
    if (this.status === 'stopped') {
      this.ball.classList.remove('disabled')
      this.animation.return()
      cancelAnimationFrame(this.frameRequestId)
    } else {
      this.requestAnimationFrame()
    }
  }

  requestAnimationFrame() {
    this.frameRequestId = requestAnimationFrame(this.loop.bind(this))
  }

  async start() {
    this.status = 'playing'
    this.ball.classList.remove('disabled')

    this.generateAnimation()
    // Will start animation immediately.
    // Using
    //
    //     this.lastFrameTime = document.timeline.currentTime
    //
    // would start animation after 1 frame duration.
    this.lastFrameTime = document.timeline.currentTime - this.deltaT
    this.requestAnimationFrame()
  }

  stop() {
    if (this.status === 'stopped') return
    this.status = 'disposing'
    this.ball.classList.add('disabled')
    this.direction = 'up'
  }

  /** Frame duration in milliseconds. */
  get deltaT() {
    return Math.floor(1000 / this.FPS)
  }
}

customElements.define(Ball.localName, Ball)

class Info extends HTMLElement {
  static localName = 'info-'

  serverOrigin = h('code')
  numClients = h('div')

  connectedCallback() {
    const { numClients, serverOrigin } = this

    // During the demo, external clients do not need the connection info.
    // They are already connected, other spectators can see it at the projector screen.
    if (location.hostname === 'localhost')
      this.append(serverOrigin)

    this.append(numClients)

    subscribe('NUM_CLIENTS', (data) => {
      if (data === undefined) return
      numClients.textContent = `Num players: ${data}`
    })

    subscribe('SERVER_ORIGIN', (data) => {
      if (data === undefined) return
      if (location.hostname === 'localhost')
        serverOrigin.textContent = data
    })
  }
}

customElements.define(Info.localName, Info)

class Volume extends HTMLElement {
  static localName = 'volume-'

  button = h('button')

  svg = createSvg(40, 40, '0 0 512 512')

  path = createSvgElement('path')
    .set('d', 'M48 352l48 0 134.1 119.2c6.4 5.7 14.6 8.8 23.1 8.8 19.2 0 34.8-15.6 34.8-34.8l0-378.4c0-19.2-15.6-34.8-34.8-34.8-8.5 0-16.7 3.1-23.1 8.8L96 160 48 160c-26.5 0-48 21.5-48 48l0 96c0 26.5 21.5 48 48 48zM441.1 107c-10.3-8.4-25.4-6.8-33.8 3.5s-6.8 25.4 3.5 33.8C443.3 170.7 464 210.9 464 256s-20.7 85.3-53.2 111.8c-10.3 8.4-11.8 23.5-3.5 33.8s23.5 11.8 33.8 3.5c43.2-35.2 70.9-88.9 70.9-149s-27.7-113.8-70.9-149zm-60.5 74.5c-10.3-8.4-25.4-6.8-33.8 3.5s-6.8 25.4 3.5 33.8C361.1 227.6 368 241 368 256s-6.9 28.4-17.7 37.3c-10.3 8.4-11.8 23.5-3.5 33.8s23.5 11.8 33.8 3.5C402.1 312.9 416 286.1 416 256s-13.9-56.9-35.5-74.5z')

  connectedCallback() {
    const { button, svg, path } = this

    svg.append(path)
    button.append(svg)
    this.append(button)

    button.addEventListener('click', this)

    subscribe('AUDIO', (enabled) => {
      if (enabled)
        path.setAttribute('fill', 'black')
      else
        path.setAttribute('fill', 'gray')
    })
  }

  handleEvent(event) {
    if (event.type === 'click') {
      const audioIsEnabled = peek('AUDIO')
      publish('AUDIO', !!!audioIsEnabled)
    }
  }
}

customElements.define(Volume.localName, Volume)

class WS extends HTMLElement {
  static localName = 'web-socket'

  url = location.origin.replace(/^http/, 'ws')
  socket = new WebSocket(this.url)
  isConnected = false

  connectedCallback() {
    this.connect()

    subscribe('TOUCH', (touch) => {
      if (touch === true)
        this.sendMessage('TOUCH')
    })
  }

  connect() {
    const { socket } = this

    socket.addEventListener('open', () => {
      this.isConnected = true
    })

    socket.addEventListener('close', () => {
      this.isConnected = false
    })

    socket.addEventListener('message', (event) => {
      const { type, data } = JSON.parse(event.data)
      publish(type, data)
    })
  }

  sendMessage(type, data) {
    if (this.isConnected !== true)
      return
    this.socket.send(JSON.stringify({ type, data }))
  }
}

customElements.define(WS.localName, WS)

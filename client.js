/**
 * Create an HTML template element from a string template.
 *
 * @example
 *
 * const myTemplate = html`
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
const createSvg = (width, height) => {
  const svg = createSvgElement('svg').set('xmlns', 'http://www.w3.org/2000/svg')
  return Object.assign(svg, {
    resize: (width, height) =>
      svg.set('width', width)
         .set('height', height)
         .set('viewBox', `0 0 ${width} ${height}`)
  }).resize(width, height)
}

/** Round number to two decimals. */
const decimal2 = (value = 0) => Number(value.toFixed(2))

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
      }
    </style>
  `

  static bounceSoundPath = 'bounce.wav'

  static containerMaxWidth = 400
  static containerHeight = 600

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

  containerWidth
  containerHeight

  socket

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
    this.connectWebSocket()
  }

  handleEvent(event) {
    if (event.type === 'click' && event.target === this.ball) {
      this.socket.send('TOUCH')

      // Toggle animation.
      if (this.status === 'stopped')
        this.start()
      else if (this.status === 'playing')
        this.stop()
    }
  }

  connectWebSocket() {
    const url = location.origin.replace(/^http/, 'ws')
    const socket = this.socket = new WebSocket(url)

    socket.addEventListener('open', () => {
      console.info('Connected to', url)
    })

    socket.addEventListener('close', () => {
      console.info('Disconnected')
    })

    socket.addEventListener('message', (event) => {
      console.info('Message', event.data)
    })
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
    this.containerWidth = Math.min(Math.floor(innerWidth / phi), Ball.containerMaxWidth)
    this.containerHeight = Ball.containerHeight

    this.svg.resize(this.containerWidth, this.containerHeight)
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
          if (self.status == 'disposing') {
            self.status = 'stopped'
            return
          }
        } else {
//// Compute deltaY.
          let deltaY
          if (self.status == 'disposing')
            // Move with constant velocity during disposure.
            deltaY = 2 * uniformDeltaY
          else
            // A sort of acceleration.
            deltaY = Math.max(1, Math.floor(uniformDeltaY * (currentY - self.initialY) / 7))
          // Adjust vector direction.
          if (self.direction == 'up') deltaY = -deltaY
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
    if (this.status == 'stopped') {
      this.ball.classList.remove('disposing')
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
    await this.setupAudio()
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
    this.status = 'disposing'
    this.ball.classList.add('disposing')
    this.direction = 'up'
  }

  /** Frame duration in milliseconds. */
  get deltaT() {
    return Math.floor(1000 / this.FPS)
  }
}

customElements.define(Ball.localName, Ball)

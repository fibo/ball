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
 * @example
 *
 * const circle = createSvgElement('circle')
 *   .set('cx', 100)
 *   .set('cy', 100)
 *
 * console.log(circle.get('cx'))
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
 * @example
 *
 * const svg = createSvg(100, 200)
 *
 * @param {number} width
 * @param {number} height
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

  static containerMaxWidth = 400
  static containerMinHeight = 600

  svg = createSvg(0, 0)
  ball = createSvgElement('ellipse')

  /** Initial ball y coordinate. */
  initialY = 70

  /** Ball radius, excluding stroke-width. */
  radius = 40

  socket

  width; height;

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.shadowRoot.appendChild(Ball.template.content.cloneNode(true))
    this.shadowRoot.appendChild(this.svg)
  }

  connectedCallback() {
    this.setDimensions()
    this.createBall()
    this.setBallToInitialPosition()
    this.connectWebSocket()
  }

  handleEvent(event) {
    if (event.type === 'click' && event.target === this.ball) {
      this.socket.send('TOUCH')
    }
  }

  connectWebSocket() {
    const url = window.location.origin.replace(/^http/, 'ws')
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
    const { ball, initialY, width } = this

    ball
      .set('cx', width / 2)
      .set('cy', initialY)
  }

  setDimensions() {
    const phi = 1.618
    this.width = Math.min(Math.floor(innerWidth / phi), Ball.containerMaxWidth)
    this.height = Math.max(Math.floor(innerHeight / phi), Ball.containerMinHeight)

    this.svg.resize(this.width, this.height)
  }
}

customElements.define(Ball.localName, Ball)

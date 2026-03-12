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
      }
      ellipse {
        fill: orange;
        stroke: black;
        stroke-width: ${Ball.strokeWidth}px;
      }
    </style>
  `

  svg = createSvg(0, 0)
  ball = createSvgElement('ellipse')

  /** Ball radius, excluding stroke-width. */
  radius = 40

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.shadowRoot.appendChild(Ball.template.content.cloneNode(true))
    this.shadowRoot.appendChild(this.svg)
  }

  connectedCallback() {
    const { ball, radius, svg } = this

    const phi = 1.618
    const width = Math.floor(innerWidth / phi)
    const height = Math.floor(innerHeight / phi)
    const initialY = 70

    svg.resize(width, height)

    svg.appendChild(ball
      .set('cx', width / 2)
      .set('cy', initialY)
      .set('rx', radius)
      .set('ry', radius)
    )
  }
}

customElements.define(Ball.localName, Ball)

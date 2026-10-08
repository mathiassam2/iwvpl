/**
 * Toggle the `inert` attribute imperatively.
 *
 * React 18 does not support `inert` as a prop - it is silently dropped, so
 * `<div inert="">` never made it to the DOM. React 19 added it. Setting the
 * attribute through a ref works on every version, and `inert` is what keeps a
 * hidden-but-mounted panel out of the tab order.
 */
export function setInert(el: HTMLElement | null, on: boolean) {
  if (!el) return
  if (on) el.setAttribute('inert', '')
  else el.removeAttribute('inert')
}

export function scrollToLine(line: number): void {
  const exact = window.document.querySelector(`[data-line="${line}"], [data-source-line="${line}"]`)
  const ranged = Array.from(window.document.querySelectorAll<HTMLElement>("[data-source-line][data-source-end-line]"))
    .find((element) => {
      const start = Number(element.dataset.sourceLine)
      const end = Number(element.dataset.sourceEndLine)
      return start <= line && end >= line
    })
  const target = exact ?? ranged
  target?.scrollIntoView({ block: "center", behavior: "smooth" })
}

/** Spreadsheet-style formulas for calculated fields.
 *
 *  A custom module's formulas are written by whoever builds the module, so
 *  they are parsed and evaluated here rather than handed to eval(): a field
 *  expression can reach the record's own values and these functions, and
 *  nothing else in the page.
 *
 *  Grammar: expr = term (('+'|'-') term)* ; term = factor (('*'|'/'|'%') factor)*
 *           factor = ['-'] ( number | ident ['(' args ')'] | '(' expr ')' )
 */

type Scope = Record<string, unknown>

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  ceil: Math.ceil,
  floor: Math.floor,
  round: (x, places = 0) => { const f = 10 ** places; return Math.round(x * f) / f },
  abs: Math.abs,
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  sqrt: Math.sqrt,
  /** Hours between two clock times, wrapping past midnight. */
  hours_between: (from, to) => (to >= from ? to - from : to + 24 - from),
}

interface Token { type: 'num' | 'ident' | 'op'; value: string }

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < src.length && /[0-9._]/.test(src[j])) j++
      out.push({ type: 'num', value: src.slice(i, j).replace(/_/g, '') })
      i = j
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++
      out.push({ type: 'ident', value: src.slice(i, j) })
      i = j
    } else if ('+-*/%(),'.includes(c)) {
      out.push({ type: 'op', value: c }); i++
    } else {
      throw new Error(`Unexpected character "${c}" in formula`)
    }
  }
  return out
}

/** Clock time as a fractional hour, so "22:30" can take part in arithmetic. */
function numeric(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') {
    const clock = /^(\d{1,2}):(\d{2})/.exec(value)
    if (clock) return Number(clock[1]) + Number(clock[2]) / 60
    const n = Number(value)
    if (!Number.isNaN(n)) return n
  }
  return 0
}

export function evaluateFormula(source: string, scope: Scope): number | null {
  let pos = 0
  let tokens: Token[]
  try { tokens = tokenize(source) } catch { return null }

  const peek = () => tokens[pos]
  const eat = (v?: string) => {
    const t = tokens[pos]
    if (!t || (v && t.value !== v)) throw new Error(`Expected ${v ?? 'a value'} in formula`)
    pos++
    return t
  }

  function expr(): number {
    let left = term()
    while (peek() && (peek().value === '+' || peek().value === '-')) {
      const op = eat().value
      const right = term()
      left = op === '+' ? left + right : left - right
    }
    return left
  }

  function term(): number {
    let left = factor()
    while (peek() && ['*', '/', '%'].includes(peek().value)) {
      const op = eat().value
      const right = factor()
      if ((op === '/' || op === '%') && right === 0) return NaN
      left = op === '*' ? left * right : op === '/' ? left / right : left % right
    }
    return left
  }

  function factor(): number {
    const t = peek()
    if (!t) throw new Error('Formula ends early')
    if (t.value === '-') { eat('-'); return -factor() }
    if (t.value === '(') { eat('('); const v = expr(); eat(')'); return v }
    if (t.type === 'num') { eat(); return Number(t.value) }
    if (t.type === 'ident') {
      eat()
      if (peek()?.value === '(') {
        eat('(')
        const args: number[] = []
        if (peek()?.value !== ')') {
          args.push(expr())
          while (peek()?.value === ',') { eat(','); args.push(expr()) }
        }
        eat(')')
        const fn = FUNCTIONS[t.value]
        if (!fn) throw new Error(`No function called ${t.value}`)
        return fn(...args)
      }
      return numeric(scope[t.value])
    }
    throw new Error(`Unexpected "${t.value}" in formula`)
  }

  try {
    const value = expr()
    if (pos !== tokens.length) return null
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

/** Used by the field editor to tell the user what is wrong before they save. */
export function checkFormula(source: string, fields: string[]): string | null {
  try {
    const scope = Object.fromEntries(fields.map((f) => [f, 1]))
    const tokens = tokenize(source)
    for (const t of tokens) {
      if (t.type !== 'ident') continue
      if (FUNCTIONS[t.value]) continue
      if (!fields.includes(t.value)) return `There is no field called "${t.value}".`
    }
    return evaluateFormula(source, scope) === null ? 'That formula does not parse.' : null
  } catch (e) {
    return e instanceof Error ? e.message : 'That formula does not parse.'
  }
}

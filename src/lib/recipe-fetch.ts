import { CapacitorHttp } from '@capacitor/core'
import { isNative } from './native'
import { fetchProblem, readPage, type FetchFailure } from './recipe-fetch-rules'

/** A recipe page, read (REC-07). In the Android app the request goes through
 *  the phone's own connection (CapacitorHttp, as product lookups do), where
 *  no browser rule stops it; in a browser it is an ordinary fetch, which
 *  most recipe sites refuse to other pages, so pasting stays the way there. */
export class RecipeFetchProblem extends Error {}

const fail = (kind: FetchFailure, opts: { status?: number; web?: boolean } = {}) => new RecipeFetchProblem(fetchProblem(kind, opts))

export async function fetchRecipePage(url: string): Promise<string> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw fail('offline')
  let status = 0
  let body: unknown
  if (isNative()) {
    try {
      const res = await CapacitorHttp.get({
        url, headers: { Accept: 'text/html,application/xhtml+xml' }, responseType: 'text',
        connectTimeout: 15000, readTimeout: 20000,
      })
      status = res.status
      body = res.data
    } catch {
      throw fail('blocked')
    }
  } else {
    const stop = new AbortController()
    const timer = setTimeout(() => stop.abort(), 15000)
    try {
      const res = await fetch(url, { signal: stop.signal, credentials: 'omit', headers: { Accept: 'text/html' } })
      status = res.status
      body = res.ok ? await res.text() : undefined
    } catch (e) {
      throw fail(e instanceof DOMException && e.name === 'AbortError' ? 'timeout' : 'blocked', { web: true })
    } finally {
      clearTimeout(timer)
    }
  }
  if (status < 200 || status >= 300) throw fail('status', { status })
  const page = readPage(body)
  if ('error' in page) throw new RecipeFetchProblem(page.error)
  return page.html
}

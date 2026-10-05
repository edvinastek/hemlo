import { Fragment } from 'react'
import { useApp } from '../lib/store'
import { searchUrl, searchWords } from '../lib/shops-rules'

/** The shops a product or food is sold at, as on its page ("Albert Heijn,
 *  Jumbo"), each name a link to that chain's own site search for it where
 *  the chain has one (PRICE-08). Opened in the browser; only the name goes. */
export function ShopNameLinks({ names, query }: { names: string[]; query: string | null }) {
  const country = useApp((s) => s.profile?.country ?? null)
  const words = query ? searchWords(query) : ''
  return (
    <>
      {names.map((name, i) => {
        const url = words ? searchUrl(name, country, words) : null
        return (
          <Fragment key={`${name}-${i}`}>
            {i > 0 && ', '}
            {url
              ? <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`${name}: search for ${words} on the ${name} website`}>{name}</a>
              : name}
          </Fragment>
        )
      })}
    </>
  )
}

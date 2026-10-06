import { useEffect, useState, type FormEvent } from 'react'
import { getMeta, setMeta } from '../lib/db'
import { useApp } from '../lib/store'
import { loadOffAccount, useOffAccount } from '../lib/open-prices-account'
import { OFF_SIGN_UP } from '../lib/open-prices-rules'
import { addToOff, missingForOff, offProductUrl, type OffProduct } from '../lib/products-write-rules'
import { doseText, readMicros } from '../lib/micros-rules'
import { offLang } from '../lib/products-rules'

/** Add a product the app did not know to Open Food Facts (PROD-05), after
 *  it was saved as one of the person's foods from its label. Opt-in, for
 *  this one product, on the person's tap: what goes is listed first, and
 *  the Open Food Facts password is asked for here and sent only with these
 *  two requests (the v18 account keeps the user name, never a password).
 *  Skipping it keeps the food as it is. */
export function FoodOffShare({ product, photo, onDone }: { product: OffProduct; photo: Blob | null; onDone: () => void }) {
  const account = useOffAccount()
  const country = useApp((s) => s.profile?.country ?? null)
  const owner = useApp((s) => s.session?.user.id ?? null)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  useEffect(() => { if (!account.ready) void loadOffAccount() }, [account.ready])
  useEffect(() => { if (account.user && !user) setUser(account.user) }, [account.user])
  const missing = missingForOff(product)

  async function send(e: FormEvent) {
    e.preventDefault()
    if (busy || missing) return
    setBusy(true); setProblem(null)
    try {
      const r = await addToOff(product, { user, password }, { uuid: await appUuid(owner), lang: offLang(country) }, photo,
        (url, init) => fetch(url, init))
      setPassword('')
      if (!r.ok) { setProblem(r.message); return }
      setResult(r.photo && !r.photo.ok ? r.photo.message : 'Added to Open Food Facts. Thank you.')
    } finally { setBusy(false) }
  }

  const figures = [
    product.kcal != null ? `${product.kcal} kcal` : null, product.fat_g != null ? `fat ${product.fat_g} g` : null,
    product.carbs_g != null ? `carbohydrate ${product.carbs_g} g` : null, product.protein_g != null ? `protein ${product.protein_g} g` : null,
    product.salt_g != null ? `salt ${product.salt_g} g` : null,
  ].filter(Boolean).join(' · ')
  const micros = doseText(readMicros(product.micros))

  return (
    <form className="fe-off form-grid" onSubmit={(e) => void send(e)} noValidate>
      <p className="fe-off-what">
        <b>{product.name}</b>{product.brand ? `, ${product.brand}` : ''} · barcode {product.barcode}<br />
        Per {product.per_ml ? '100 ml' : '100 g'}: {figures}{micros ? ` · ${micros}` : ''}{photo ? ' · the photo of the label' : ''}
      </p>
      {result ? (
        <>
          <p className="fe-note" role="status">{result} <a href={offProductUrl(product.barcode)} target="_blank" rel="noreferrer">See it on openfoodfacts.org</a></p>
          <div className="sheet-actions"><button type="button" className="btn btn-primary grow" onClick={onDone}>Done</button></div>
        </>
      ) : missing ? (
        <>
          <p className="fe-note is-warn">{missing}</p>
          <div className="sheet-actions"><button type="button" className="btn grow" onClick={onDone}>Not now</button></div>
        </>
      ) : (
        <>
          <p className="fe-note">Open Food Facts publishes it for anyone to use (ODbL; the photo under CC BY-SA), with your user name.</p>
          <div className="two">
            <label>Open Food Facts user name
              <input value={user} autoComplete="username" autoCapitalize="none" spellCheck={false} onChange={(e) => setUser(e.target.value)} />
            </label>
            <label>Password
              <input type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
            </label>
          </div>
          <a className="fe-note" href={OFF_SIGN_UP} target="_blank" rel="noreferrer">No account? Make one on openfoodfacts.org</a>
          {problem && <p className="re-error" role="alert">{problem}</p>}
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={onDone}>Not now</button>
            <button type="submit" className="btn btn-primary grow" disabled={busy || !user.trim() || !password}>{busy ? 'Sending' : 'Add to Open Food Facts'}</button>
          </div>
        </>
      )}
    </form>
  )
}

/** A random id for this Hemlo account on this device, sent with each
 *  product as Open Food Facts asks of apps, so its moderators can tell one
 *  person's edits apart without knowing who they are. */
async function appUuid(owner: string | null): Promise<string> {
  const key = `off:app_uuid:${owner ?? 'none'}`
  const have = await getMeta<string | null>(key, null)
  if (have) return have
  const made = crypto.randomUUID()
  await setMeta(key, made)
  return made
}

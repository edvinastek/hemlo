import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { getMeta, setMeta } from '../lib/db'
import { currencyFor, formatMoney, readPrice } from '../lib/shopping-rules'
import { basisText, dayText } from '../lib/price-rules'
import {
  OSM_ATTRIBUTION, placeKey, placeLine, placeMemoryKey, pricePayload, readPlace, reusableProof, sharedPriceUrl,
  type LastProof, type ProofType, type ShopPlace,
} from '../lib/open-prices-rules'
import { loadOffAccount, useOffAccount } from '../lib/open-prices-account'
import { postPrice, searchOsm, searchPlaces, shrinkPhoto, uploadProof } from '../lib/open-prices-share'
import type { ShopPrice } from '../lib/shopping-types'
import type { Profile } from '../lib/types'

/** Prices this device shared, by the household's own price row: the id on
 *  Open Prices and when. Kept on this device only: what is public is on
 *  Open Prices itself. */
const SHARED = 'openprices:shared'
const LAST_PROOF = 'openprices:proof'
export type SharedMarks = Record<string, { id: number; at: string }>

export function useSharedMarks(): SharedMarks {
  return useLiveQuery(() => getMeta<SharedMarks>(SHARED, {}), [], {} as SharedMarks)
}

/** Is sharing on, and can this price go? For the price sheet's "Share". */
export function useSharing(): { on: boolean; user: string | null } {
  const { on, user, ready } = useOffAccount()
  useEffect(() => { if (!ready) void loadOffAccount() }, [ready])
  return { on, user }
}

/** Sharing one of the household's own prices with Open Prices (PRICE-05),
 *  in the price sheet's place (never a sheet on a sheet). The person picks
 *  the actual shop, takes or picks a photo of the price tag or receipt, and
 *  taps Share: the photo goes first, then the price. Nothing is sent before
 *  that tap; with no connection it says so and sends nothing. */
export function SharePrice({ profile, name, price, code, perMl, onClose }: {
  profile: Profile; name: string; price: ShopPrice; code: string; perMl: boolean
  /** Back to the price sheet. */
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { user } = useSharing()
  const currency = currencyFor(profile.country)
  const online = useOnline()

  // The shop: the place picked for this shop before, else a search.
  const remembered = useLiveQuery(async () => readPlace(await getMeta<unknown>(placeMemoryKey(price.shop), null)), [price.shop])
  const [place, setPlace] = useState<ShopPlace | null>(null)
  const [choosing, setChoosing] = useState(false)
  const chosen = place ?? (choosing ? null : remembered ?? null)
  const [shopName, setShopName] = useState(price.shop)
  const [town, setTown] = useState(profile.city ?? '')
  const [found, setFound] = useState<ShopPlace[] | null>(null)
  const [osmAsked, setOsmAsked] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchSaid, setSearchSaid] = useState<string | null>(null)

  // The photo.
  const [kind, setKind] = useState<ProofType>('PRICE_TAG')
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [photoSaid, setPhotoSaid] = useState<string | null>(null)
  const lastProof = useLiveQuery(() => getMeta<LastProof | null>(LAST_PROOF, null), [], null)
  const reuse = reusableProof(lastProof, chosen, price.noted_on, Date.now())
  const [useLast, setUseLast] = useState(true)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)

  // An offer, and its normal price.
  const [offer, setOffer] = useState(false)
  const [normal, setNormal] = useState('')
  const normalPrice = normal.trim() ? readPrice(normal) : null

  const [stage, setStage] = useState<'form' | 'photo' | 'price' | 'done'>('form')
  const [problem, setProblem] = useState<string | null>(null)
  const [sharedId, setSharedId] = useState<number | null>(null)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const proofReady = !!photo || (!!reuse && useLast)
  const normalOk = !offer || !normal.trim() || (normalPrice !== null && normalPrice > Number(price.price))
  const ready = !!user && !!chosen && proofReady && normalOk && online && stage === 'form'

  async function search(where: 'open-prices' | 'osm') {
    if (!shopName.trim() || searching) return
    setSearching(true)
    setSearchSaid(null)
    try {
      const r = where === 'open-prices'
        ? await searchPlaces(shopName, town)
        : await searchOsm(shopName, town, profile.country ?? null)
      if (!r.ok) { setSearchSaid(r.problem.text); return }
      if (where === 'osm') setOsmAsked(true)
      const merged = where === 'osm' ? [...(found ?? []), ...r.value.filter((p) => !(found ?? []).some((f) => placeKey(f) === placeKey(p)))] : r.value
      setFound(merged)
      if (!r.value.length) setSearchSaid(where === 'osm' ? 'OpenStreetMap has no shop by that name there.' : null)
    } finally {
      setSearching(false)
    }
  }

  async function pick(p: ShopPlace) {
    setPlace(p)
    setChoosing(false)
    setFound(null)
    setOsmAsked(false)
    await setMeta(placeMemoryKey(price.shop), p)
  }

  async function takePhoto(file: File | undefined) {
    if (!file) return
    setPhotoSaid('Making the photo smaller…')
    try {
      const small = await shrinkPhoto(file)
      if (preview) URL.revokeObjectURL(preview)
      setPhoto(small)
      setPreview(URL.createObjectURL(small))
      setUseLast(false)
      setPhotoSaid(null)
    } catch {
      setPhotoSaid('That photo could not be read. Try another one.')
    }
  }

  async function share(e: FormEvent) {
    e.preventDefault()
    if (!ready || !chosen) return
    setProblem(null)
    let proofId = reuse && useLast && !photo ? reuse.id : null
    if (!proofId) {
      setStage('photo')
      const up = await uploadProof(photo!, { type: kind, place: chosen, date: price.noted_on, currency })
      if (!up.ok) { setStage('form'); setProblem(up.problem.text); return }
      proofId = up.value
      await setMeta(LAST_PROOF, { id: proofId, place: placeKey(chosen), date: price.noted_on, type: kind, at: new Date().toISOString() } satisfies LastProof)
    }
    const payload = pricePayload({
      code, price: Number(price.price), currency, date: price.noted_on, place: chosen, proofId,
      discounted: offer, normalPrice: offer ? normalPrice : null,
    })
    if (!payload) { setStage('form'); setProblem('This price cannot be shared.'); return }
    setStage('price')
    const sent = await postPrice(payload)
    if (!sent.ok) { setStage('form'); setProblem(sent.problem.text); return }
    const marks = await getMeta<SharedMarks>(SHARED, {})
    await setMeta(SHARED, { ...marks, [price.id]: { id: sent.value, at: new Date().toISOString() } })
    setSharedId(sent.value)
    setStage('done')
  }

  const what = `${formatMoney(Number(price.price), currency)} ${basisText(price.amount_g, perMl)} at ${price.shop}, ${dayText(price.noted_on)}`

  if (stage === 'done' && sharedId) {
    return (
      <section className="op-share" aria-label="Shared with Open Prices">
        <h3 className="op-title">Shared with Open Prices</h3>
        <p className="op-what"><span className="shop-serif">{name}</span> · {what}</p>
        <p className="pf-credit"><a href={sharedPriceUrl(sharedId)} target="_blank" rel="noopener noreferrer">See it on Open Prices</a></p>
        <div className="sheet-actions">
          <button type="button" className="btn btn-primary grow" onClick={onClose} data-autofocus>Done</button>
        </div>
      </section>
    )
  }

  if (!user) {
    return (
      <section className="op-share" aria-label="Share with Open Prices">
        <h3 className="op-title">Share with Open Prices</h3>
        {/* A refused sign-in says why; otherwise, what to do first. */}
        {problem
          ? <p className="stock-hint is-warn" role="alert">{problem}</p>
          : <p className="stock-hint">Sign in with your Open Food Facts account first.</p>}
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Back</button>
          <button type="button" className="btn btn-primary grow" onClick={() => navigate(`/more?find=${encodeURIComponent('Share prices with Open Prices')}`)}>Open Settings</button>
        </div>
      </section>
    )
  }

  const busy = stage === 'photo' || stage === 'price'
  return (
    <form className="op-share form-grid" onSubmit={share} aria-label="Share with Open Prices">
      <h3 className="op-title">Share with Open Prices</h3>
      <p className="op-what"><span className="shop-serif">{name}</span> · {what}</p>

      <div className="shop-field">
        <span className="shop-label" id="op-shop">Which shop exactly</span>
        {chosen ? (
          <div className="op-chosen">
            <span>{placeLine(chosen)}</span>
            <button type="button" className="slot-link" disabled={busy} onClick={() => { setPlace(null); setChoosing(true) }}>Change</button>
          </div>
        ) : (
          <>
            <div className="op-search" role="group" aria-labelledby="op-shop">
              <input value={shopName} onChange={(e) => setShopName(e.target.value)} maxLength={80} aria-label="Shop name" placeholder="Albert Heijn" />
              <input value={town} onChange={(e) => setTown(e.target.value)} maxLength={80} aria-label="Town" placeholder="Town" />
              <button type="button" className="btn" disabled={!shopName.trim() || searching || !online} onClick={() => void search('open-prices')}>
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>
            {found && found.length > 0 && (
              <ul className="op-places" aria-label="Shops found">
                {found.map((p) => (
                  <li key={placeKey(p)}>
                    <button type="button" onClick={() => void pick(p)}>
                      <span className="op-place-name">{p.name}</span>
                      {p.address && <span className="op-place-where">{p.address}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {found && !osmAsked && (
              <button type="button" className="slot-link op-osm" disabled={searching || !online} onClick={() => void search('osm')}>
                {found.length ? 'Not there? Search OpenStreetMap' : 'Not on Open Prices yet. Search OpenStreetMap'}
              </button>
            )}
            {found?.some((p) => p.from === 'osm') && <p className="pf-credit">{OSM_ATTRIBUTION}</p>}
            {searchSaid && <p className="stock-hint is-warn" role="status">{searchSaid}</p>}
          </>
        )}
      </div>

      <div className="shop-field">
        <span className="shop-label" id="op-photo">Photo</span>
        <div className="stock-units op-kind" role="group" aria-labelledby="op-photo">
          <button type="button" aria-pressed={kind === 'PRICE_TAG'} onClick={() => setKind('PRICE_TAG')}>Price tag</button>
          <button type="button" aria-pressed={kind === 'RECEIPT'} onClick={() => setKind('RECEIPT')}>Receipt</button>
        </div>
        {reuse && !photo && (
          <label className="op-check">
            <input type="checkbox" checked={useLast} onChange={(e) => setUseLast(e.target.checked)} />
            <span>Use the receipt sent earlier today</span>
          </label>
        )}
        {preview && <img className="op-preview" src={preview} alt={kind === 'RECEIPT' ? 'The receipt' : 'The price tag'} />}
        {!(reuse && useLast && !photo) && (
          <div className="op-photo-btns">
            <button type="button" className="btn" disabled={busy} onClick={() => camera.current?.click()}>{photo ? 'Take another' : 'Take a photo'}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => gallery.current?.click()}>Pick a photo</button>
          </div>
        )}
        {/* The camera through Android's own photo screen: Hemlo asks for no camera permission. */}
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void takePhoto(e.target.files?.[0]); e.target.value = '' }} />
        <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => { void takePhoto(e.target.files?.[0]); e.target.value = '' }} />
        {photoSaid && <p className="stock-hint" role="status">{photoSaid}</p>}
      </div>

      <label className="op-check">
        <input type="checkbox" checked={offer} onChange={(e) => setOffer(e.target.checked)} />
        <span>It was an offer</span>
      </label>
      {offer && (
        <label>Normal price, if shown
          <input value={normal} onChange={(e) => setNormal(e.target.value)} inputMode="decimal" placeholder={formatMoney(Number(price.price) + 0.5, currency)} />
        </label>
      )}
      {!normalOk && <p className="stock-hint is-warn">The normal price is higher than the offer.</p>}

      <p className="pf-credit">Public on Open Prices under ODbL, with your Open Food Facts name ({user}) and the photo.</p>
      {!online && <p className="stock-hint is-warn" role="status">Sharing needs a connection.</p>}
      {problem && <p className="stock-hint is-warn" role="alert">{problem}</p>}
      {busy && <p className="stock-hint" role="status">{stage === 'photo' ? 'Sending the photo…' : 'Sending the price…'}</p>}
      <div className="sheet-actions">
        <button type="button" className="btn" disabled={busy} onClick={onClose}>Back</button>
        <button type="submit" className="btn btn-primary grow" disabled={!ready}>Share</button>
      </div>
    </form>
  )
}

/** Whether the device says it has a connection, kept up to date. */
function useOnline(): boolean {
  const [on, setOn] = useState(typeof navigator === 'undefined' || navigator.onLine !== false)
  useEffect(() => {
    const up = () => setOn(true)
    const down = () => setOn(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return on
}

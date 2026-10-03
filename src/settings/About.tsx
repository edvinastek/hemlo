import { useState } from 'react'
import { Link } from 'react-router-dom'
import { version } from '../../package.json'
import { NEVO_ATTRIBUTION, PORTIE_ATTRIBUTION } from '../lib/eu-label-rules'
import { Privacy } from '../screens/Privacy'

/** Settings → About (v17, CALM-13): the version, where the shared data
 *  comes from, with the wording each source asks for, and the privacy
 *  policy and account deletion. The credits live here and on the food
 *  page, not on every list. */
export function AboutSettings() {
  const [policy, setPolicy] = useState(false)
  if (policy) return <Privacy onBack={() => setPolicy(false)} />
  return (
    <>
      <div className="setting-row">
        <div>
          <div className="row-name">Version</div>
          <div className="row-meta">GetIt {version}</div>
        </div>
      </div>

      <p className="section-title">Data sources</p>
      <div className="setting-row">
        <div>
          <div className="row-name">Shared foods</div>
          {/* RIVM asks for this sentence word for word wherever NEVO figures are used. */}
          <div className="row-meta">{NEVO_ATTRIBUTION}. A few foods are kept from a USDA list.</div>
        </div>
      </div>
      <div className="setting-row">
        <div>
          <div className="row-name">Portion and unit weights</div>
          <div className="row-meta">{PORTIE_ATTRIBUTION}.</div>
        </div>
      </div>
      <div className="setting-row">
        <div>
          <div className="row-name">Products</div>
          <div className="row-meta">
            <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">Open Food Facts</a>, under the
            Open Database Licence (ODbL).
          </div>
        </div>
      </div>
      <div className="setting-row">
        <div>
          <div className="row-name">Prices</div>
          <div className="row-meta">
            <a href="https://prices.openfoodfacts.org" target="_blank" rel="noopener noreferrer">Open Prices</a>, under the
            Open Database Licence (ODbL).
          </div>
        </div>
      </div>
      <div className="setting-row">
        <div>
          <div className="row-name">Public holidays</div>
          {/* The data's licence (CC BY-SA 3.0) asks for its source to be named. */}
          <div className="row-meta">The date-holidays project, CC BY-SA 3.0.</div>
        </div>
      </div>

      <p className="section-title">Privacy</p>
      <div className="setting-row">
        <div>
          <div className="row-name">Privacy policy</div>
          <div className="row-meta">What GetIt stores, why, and how to get it back.</div>
        </div>
        <button type="button" className="btn" onClick={() => setPolicy(true)}>Read</button>
      </div>
      <div className="setting-row">
        <div>
          <div className="row-name">Delete your account</div>
        </div>
        <Link className="btn" to="/more?page=data&find=Delete%20account">Open</Link>
      </div>
    </>
  )
}

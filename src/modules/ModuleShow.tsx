import { useApp } from '../lib/store'
import { db } from '../lib/db'
import { saveSettings } from '../lib/write'
import { readSettings } from '../lib/settings'
import { VIEW_SWITCHES, describeView, hasSwitches, moduleView, switchChange, type ViewSwitch } from '../lib/module-view-rules'
import './modules.css'

/** Where a module shows itself (GEN-03): Today, Plan, the widget, Stats and
 *  reminders, each a switch. These are the person's, kept in their settings
 *  (synced), and take effect at once, without the editor's Save: they move
 *  nothing about the module itself. A module that is on with every switch
 *  off still has its own page, and nothing it holds is touched. */
export function ModuleShow({ moduleKey, name }: { moduleKey: string; name: string }) {
  const profile = useApp((s) => s.profile)
  if (!profile) return null
  if (!hasSwitches(moduleKey)) {
    return (
      <p className="mp-note">
        {moduleKey === 'stats'
          ? 'Stats shows the other modules’ figures. Which modules it counts is set on each of them, under Show.'
          : `${name} has nothing of its own to place on Today or Plan.`}
      </p>
    )
  }
  const views = readSettings(profile).module_views
  const v = moduleView(views, moduleKey)

  // Read from the local copy, not the screen's profile, so two quick taps on
  // different switches each start from what the other saved.
  async function flip(key: ViewSwitch) {
    const p = await db.profile.get(profile!.id)
    if (!p) return
    const was = moduleView(readSettings(p).module_views, moduleKey)[key]
    await saveSettings(p, { module_views: switchChange(moduleKey, key, !was) })
  }

  return (
    <section aria-label={`Where ${name} shows`}>
      <p className="mp-note">{describeView(v)}. Switching one off hides its items there and keeps them; its page stays.</p>
      {VIEW_SWITCHES.map((s) => (
        <div key={s.key} className="me-row ms-row">
          <div>
            <div className="row-name" id={`ms-${moduleKey}-${s.key}`}>{s.label}</div>
            <div className="row-meta">{s.hint}</div>
          </div>
          <button type="button" className="switch" role="switch" aria-checked={v[s.key]}
            aria-labelledby={`ms-${moduleKey}-${s.key}`} onClick={() => void flip(s.key)} />
        </div>
      ))}
    </section>
  )
}

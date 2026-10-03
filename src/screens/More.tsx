import { saveFile } from '../lib/native'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, resetLocal } from '../lib/db'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { edit } from '../lib/write'
import { MODULES } from '../modules/registry'
import { setModuleEnabled } from '../modules/defs'
import { Privacy } from './Privacy'
import { ModuleEditor } from '../ui/ModuleEditor'
import { BuiltModules } from '../modules/ModuleBuilder'
import { Dropdown } from '../ui/Dropdown'
import { PlanningSettings } from '../settings/PlanningSettings'
import { FoodSettings } from '../settings/FoodSettings'
import { NavSettings } from '../settings/NavSettings'
import { ColourSettings } from '../settings/ColourSettings'
import { LooksSettings } from '../settings/Looks'
import { HolidaySettings } from '../settings/HolidaySettings'
import { CalendarLinks } from '../settings/CalendarLinks'
import { TransferSettings } from '../settings/TransferSettings'
import { RecipeReview } from '../settings/RecipeReview'
import { Accounts } from '../settings/Accounts'
import { exportBundle, importBundle } from '../lib/bundle'
import { getReminderSettings, setReminderSettings, requestPermission, type ReminderSettings } from '../lib/notify'
import type { ModuleInstance } from '../lib/types'
import type { ImportPreview } from '../lib/excel'
import type { ImportPlan, ImportSummary } from '../lib/import'

const SECTIONS = ['Modules', 'Profile', 'Reminders', 'Data']

export function More() {
  // ?section=Profile opens that tab (a followed event's "Open subscription settings").
  const [section, setSection] = useState(() => SECTIONS.find((s) => s === new URLSearchParams(window.location.search).get('section')) ?? 'Modules')
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <div className="page">
      <div className="page-inner">
        <header className="page-head">
          <h1 className="page-date">More</h1>
          <p className="page-sub">What the app is made of, and what it knows about you.</p>
          <div className="tabs" role="tablist">
            {SECTIONS.map((s) => (
              <button key={s} role="tab" aria-selected={s === section}
                onClick={() => { setSection(s); setEditing(null) }}>{s}</button>
            ))}
          </div>
        </header>

        {section === 'Modules' && (editing
          ? <ModuleEditor moduleKey={editing} onBack={() => setEditing(null)} />
          : <Modules onEdit={setEditing} />)}
        {section === 'Profile' && <ProfilePanel />}
        {section === 'Reminders' && <RemindersPanel />}
        {section === 'Data' && <DataPanel />}
      </div>
    </div>
  )
}

/** Switching a module off hides its screens and stops its rules; it never
 *  deletes what it held, so switching it back on returns everything. */
function Modules({ onEdit }: { onEdit: (key: string) => void }) {
  const profile = useApp((s) => s.profile)
  const instances = useLiveQuery(async () => {
    if (!profile) return []
    return db.module_instance.where('profile_id').equals(profile.id).toArray()
  }, [profile?.id], [] as ModuleInstance[])

  const byKey = new Map(instances.map((i) => [i.module_key, i]))

  async function toggle(instance: ModuleInstance) {
    await edit('module_instance', instance, { enabled: !instance.enabled })
  }
  // A module newer than the profile (Stats, on an older account) has no
  // switch row yet: switching it on makes one.
  async function switchOn(key: string) {
    if (profile) await setModuleEnabled(profile.id, key, true)
  }

  return (
    <>
      <NavSettings />
      <p className="section-title">On</p>
      {MODULES.filter((m) => byKey.get(m.key)?.enabled).map((m) => (
        <Row key={m.key} name={m.name} summary={m.summary} depth={m.depth}
          instance={byKey.get(m.key)} onToggle={toggle} onEdit={() => onEdit(m.key)} />
      ))}

      <p className="section-title">Available</p>
      {MODULES.filter((m) => !byKey.get(m.key)?.enabled).map((m) => (
        <Row key={m.key} name={m.name} summary={m.summary} depth={m.depth}
          instance={byKey.get(m.key)} onToggle={toggle} onCreate={() => void switchOn(m.key)} onEdit={() => onEdit(m.key)} />
      ))}

      {instances.length === 0 && <p className="empty">Modules arrive with your profile.</p>}
      <BuiltModules onEdit={onEdit} />
    </>
  )
}

function Row({ name, summary, depth, instance, onToggle, onCreate, onEdit }: {
  name: string; summary: string; depth: 'full' | 'light'
  instance?: ModuleInstance; onToggle: (i: ModuleInstance) => void; onCreate?: () => void; onEdit: () => void
}) {
  return (
    <div className="setting-row">
      <div>
        <div className="row-name">{name}</div>
        <div className="row-meta">
          {summary}
          {depth === 'light' && <> · <span className="chip">light template</span></>}
        </div>
      </div>
      <div className="row-right">
        <button className="btn" onClick={onEdit}>Edit</button>
        <button
          className="switch"
          role="switch"
          aria-checked={Boolean(instance?.enabled)}
          aria-label={`Turn ${name} ${instance?.enabled ? 'off' : 'on'}`}
          onClick={() => (instance ? onToggle(instance) : onCreate?.())}
        />
      </div>
    </div>
  )
}

function ProfilePanel() {
  const { profile, profiles, setProfile } = useApp()
  if (!profile) return <p className="empty">No profile yet.</p>

  return (
    <>
      <p className="section-title">Profiles</p>
      {profiles.map((p) => (
        <div key={p.id} className="setting-row">
          <div>
            <div className="row-name">{p.name}</div>
            <div className="row-meta">
              {[p.goal, p.height_cm ? `${p.height_cm} cm` : null, p.timezone].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button className={p.id === profile.id ? 'btn btn-primary' : 'btn'} onClick={() => setProfile(p)}>
            {p.id === profile.id ? 'Current' : 'Switch'}
          </button>
        </div>
      ))}

      <PlanningSettings />
      <LooksSettings />
      <ColourSettings />
      <HolidaySettings />
      <CalendarLinks />
      <p className="section-title">Body and goal</p>
      <Field label="Height" value={String(profile.height_cm ?? '')} unit="cm"
        onSave={(v) => edit('profile', profile, { height_cm: Number(v) })} />
      <Field label="Date of birth" type="date" value={profile.birth_date ?? ''}
        hint="Used for the calorie budget. Change it here if it was entered wrong."
        onSave={(v) => edit('profile', profile, { birth_date: v || null })} />
      <Field label="Activity factor" value={String(profile.activity_level)}
        hint="1.2 desk job, 1.5 hard training twice a day, 1.9 very active"
        onSave={(v) => edit('profile', profile, { activity_level: Number(v) })} />
      <div className="setting-row">
        <div>
          <div className="row-name">Goal</div>
          <div className="row-meta">Cut takes 500 kcal off, bulk adds 300, recomp holds the line.</div>
        </div>
        <div style={{ width: 170 }}>
          <Dropdown label="Body goal" value={profile.goal}
            options={[
              { value: 'cut', label: 'Lose fat' },
              { value: 'recomp', label: 'Maintain and recomp' },
              { value: 'bulk', label: 'Build muscle' },
            ]}
            onChange={(v) => void edit('profile', profile, { goal: v })} />
        </div>
      </div>
      <FoodSettings />
    </>
  )
}

function RemindersPanel() {
  const profile = useApp((s) => s.profile)
  const settings = useLiveQuery(() => getReminderSettings(), [], null)
  const [note, setNote] = useState<string | null>(null)
  if (!profile || !settings) return null

  async function update(next: ReminderSettings) {
    setNote(null)
    if (next.on && !settings!.on && !(await requestPermission())) {
      setNote('Notifications are blocked for GetIt. Allow them in the phone\u2019s settings, then turn this on again.')
      return
    }
    await setReminderSettings(next, profile!.id, profile!.ai_persona_name)
  }

  return (
    <>
      <p className="section-title">Who reminds you</p>
      <Field label="Name" value={profile.ai_persona_name ?? ''}
        hint="The name reminders arrive under. Leave it empty and they come from GetIt."
        onSave={(v) => edit('profile', profile, { ai_persona_name: v || null })} />

      <p className="section-title">Reminders on this device</p>
      <div className="setting-row">
        <div>
          <div className="row-name">Remind me at each task’s time</div>
          <div className="row-meta">
            Within a few minutes of the time, for the next three days, even with GetIt closed.
            On a locked phone the text is hidden. This setting is for this device only.
          </div>
        </div>
        <button className="switch" role="switch" aria-checked={settings.on}
          aria-label="Reminders" onClick={() => void update({ ...settings, on: !settings.on })} />
      </div>
      <div className="setting-row">
        <div>
          <div className="row-name">Quiet hours</div>
          <div className="row-meta">Nothing arrives between these times.</div>
        </div>
        <div className="row-right">
          <input className="btn" type="time" value={settings.quietFrom}
            onChange={(e) => void update({ ...settings, quietFrom: e.target.value })} />
          <span className="row-meta">to</span>
          <input className="btn" type="time" value={settings.quietTo}
            onChange={(e) => void update({ ...settings, quietTo: e.target.value })} />
        </div>
      </div>
      {note && <p className="empty" style={{ color: 'var(--e-warn)' }}>{note}</p>}

    </>
  )
}

function DataPanel() {
  const { profile, session } = useApp()
  const [note, setNote] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ file: File; preview: ImportPreview; plan: ImportPlan } | null>(null)
  const [summary, setSummary] = useState<{ file: string; summary: ImportSummary } | null>(null)
  const [saving, setSaving] = useState(false)
  const conflicts = useLiveQuery(() => db.conflicts.reverse().limit(20).toArray(), [], [])
  const pending = useLiveQuery(() => db.pending.count(), [], 0)
  const [policy, setPolicy] = useState(false)

  if (policy) return <Privacy onBack={() => setPolicy(false)} />

  async function doExport() {
    if (!profile) return
    const blob = await exportBundle(profile.id)
    // On the phone this opens the share sheet; in a browser it downloads.
    await saveFile(`getit-${new Date().toISOString().slice(0, 10)}.getit.json`, blob)
  }

  async function doImport(file: File) {
    setNote(null)
    setSummary(null)
    try {
      if (file.name.toLowerCase().endsWith('.xlsx')) {
        // The workbook is read and shown before anything is saved, so a bad
        // column never lands in the database unseen.
        if (!session) { setNote('Sign in first. Imported foods and recipes are saved to your account.'); return }
        const { readWorkbook } = await import('../lib/excel')
        const { planWorkbook } = await import('../lib/import')
        const preview = await readWorkbook(file)
        setPreview({ file, preview, plan: await planWorkbook(preview, session.user.id) })
        return
      }
      if (!profile || !session) { setNote('Sign in first. An export is read into the profile that is open.'); return }
      const result = await importBundle(file, profile.id, session.user.id)
      setNote(`${result.imported} records from ${result.name} added to ${profile.name}. They go up to your account with the next sync.`)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That file could not be read.')
    }
  }

  async function saveWorkbookNow() {
    if (!preview || !session || saving) return
    setSaving(true)
    try {
      const { saveWorkbook } = await import('../lib/import')
      const result = await saveWorkbook(preview.preview, session.user.id)
      setSummary({ file: preview.file.name, summary: result })
      setPreview(null)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'The workbook could not be saved. Nothing was imported.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <RecipeReview />
      <p className="section-title">Sync</p>
      <div className="setting-row">
        <div>
          <div className="row-name">Waiting to send</div>
          <div className="row-meta">
            Changes made while offline sit here and go up the moment there is a connection.
          </div>
        </div>
        <span className="chip">{pending} queued</span>
      </div>

      <p className="section-title">Merges the app had to resolve</p>
      {conflicts.length === 0
        ? <p className="empty">None. When two devices change the same field, what happened is listed here rather than decided silently.</p>
        : conflicts.map((c) => (
          <div key={c.id} className="setting-row">
            <div>
              <div className="row-name">{c.table} · {c.field}</div>
              <div className="row-meta">
                kept this device's “{String(c.local_value)}” over “{String(c.remote_value)}” · {new Date(c.at).toLocaleString()}
              </div>
            </div>
          </div>
        ))}

      <p className="section-title">Your data</p>
      <div className="setting-row">
        <div>
          <div className="row-name">Export</div>
          <div className="row-meta">Everything in one file: profile, plan, logs, recipes, settings.</div>
        </div>
        <button className="btn" onClick={doExport}>Export</button>
      </div>
      <div className="setting-row">
        <div>
          <div className="row-name">Import</div>
          <div className="row-meta">An export from another device, or your Excel workbook.</div>
        </div>
        <label className="btn" style={{ cursor: 'pointer' }}>
          Choose file
          <input type="file" accept=".json,.xlsx" hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              // Cleared so choosing the same file again, after closing its
              // preview, still reads it.
              e.target.value = ''
              if (file) void doImport(file)
            }} />
        </label>
      </div>
      {preview && (
        <>
          <p className="section-title">Preview · {preview.file.name}</p>
          <p className="empty">
            Nothing is saved until you tap Import. Foods and recipes you can already see are left
            as they are.
          </p>
          <div className="setting-row">
            <div>
              <div className="row-name">
                {preview.plan.foods.length} new foods · {preview.plan.recipes.length} new recipes
              </div>
              <div className="row-meta">
                {preview.plan.foodsExisting} foods and {preview.plan.recipesExisting} recipes already there
                · {preview.plan.linesMatched} ingredient lines matched to a food, {preview.plan.linesUnmatched} not
              </div>
            </div>
          </div>
          {preview.preview.exercises.length > 0 && (
            <div className="setting-row">
              <div>
                <div className="row-name">{preview.preview.exercises.length} exercises</div>
                <div className="row-meta">Read, but not saved yet. Exercises have nowhere to go in the app so far.</div>
              </div>
            </div>
          )}
          <div className="setting-row">
            <div>
              <div className="row-meta">
                Sheets read: {preview.preview.sheets.slice(0, 6).join(', ')}
                {preview.preview.skipped > 0 && ` · ${preview.preview.skipped} duplicate rows skipped`}
              </div>
            </div>
            <div className="row-right">
              <button className="btn" onClick={() => setPreview(null)} disabled={saving}>Close</button>
              <button className="btn btn-primary" onClick={() => void saveWorkbookNow()}
                disabled={saving || (preview.plan.foods.length === 0 && preview.plan.recipes.length === 0)}>
                {saving ? 'Importing' : 'Import'}
              </button>
            </div>
          </div>
          {preview.plan.foods.slice(0, 5).map((f) => (
            <div key={f.id} className="setting-row">
              <div><div className="row-name">{f.name}</div>
                <div className="row-meta">{f.kcal ?? '—'} kcal · {f.protein_g ?? '—'} g protein per 100 g</div></div>
            </div>
          ))}
          {preview.plan.unmatched.length > 0 && (
            <div className="setting-row">
              <div>
                <div className="row-name">Lines with no food yet</div>
                <div className="row-meta">
                  Saved with their text, left out of the macros until you pick a food:
                  {' '}{preview.plan.unmatched.slice(0, 8).join(', ')}
                  {preview.plan.unmatched.length > 8 && ` and ${preview.plan.unmatched.length - 8} more`}
                </div>
              </div>
            </div>
          )}
          {preview.plan.problems.length > 0 && (
            <div className="setting-row">
              <div>
                <div className="row-name">Amounts that cannot be right</div>
                <div className="row-meta">
                  Saved without an amount; open the recipe to fix them:
                  {' '}{preview.plan.problems.slice(0, 8).join('; ')}
                  {preview.plan.problems.length > 8 && ` and ${preview.plan.problems.length - 8} more`}
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {summary && (
        <>
          <p className="section-title">Imported · {summary.file}</p>
          <div className="setting-row">
            <div>
              <div className="row-name">
                {summary.summary.foodsAdded} foods added · {summary.summary.recipesAdded} recipes added
              </div>
              <div className="row-meta">
                {summary.summary.foodsExisting} foods and {summary.summary.recipesExisting} recipes were already there
                · {summary.summary.linesMatched} ingredient lines matched to a food, {summary.summary.linesUnmatched} not
                {summary.summary.exercises > 0 && ` · ${summary.summary.exercises} exercises not saved yet`}
              </div>
            </div>
            <button className="btn" onClick={() => setSummary(null)}>Close</button>
          </div>
        </>
      )}
      {note && <p className="empty">{note}</p>}
      <TransferSettings />

      <p className="section-title">Privacy</p>
      <div className="setting-row">
        <div>
          <div className="row-name">Privacy policy</div>
          <div className="row-meta">What GetIt stores, why, where, and how to get it back or delete it.</div>
        </div>
        <button className="btn" onClick={() => setPolicy(true)}>Read</button>
      </div>

      <p className="section-title">Account</p>
      <Accounts />
      <div className="setting-row">
        <div>
          <div className="row-name">Sign out</div>
          <div className="row-meta">Also clears everything GetIt stored on this device.</div>
        </div>
        <button className="btn" onClick={() => void supabase.auth.signOut()}>Sign out</button>
      </div>
      <DeleteAccount />
    </>
  )
}

function Field({ label, value, unit, hint, type = 'text', onSave }: {
  label: string; value: string; unit?: string; hint?: string; type?: 'text' | 'date'
  onSave: (v: string) => void | Promise<unknown>
}) {
  const [draft, setDraft] = useState(value)
  return (
    <div className="setting-row">
      <div>
        <div className="row-name">{label}</div>
        {hint && <div className="row-meta">{hint}</div>}
      </div>
      <div className="row-right">
        <input
          className="btn"
          type={type}
          value={draft}
          style={{ width: type === 'date' ? 150 : 110, textAlign: 'right' }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== value && void onSave(draft)}
        />
        {unit && <span className="row-meta">{unit}</span>}
      </div>
    </div>
  )
}


/** Deleting an account is permanent, so it asks for the word rather than a
 *  click, and says exactly what goes. Export first if you want a copy. */
function DeleteAccount() {
  const online = useApp((s) => s.online)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setBusy(true); setError(null)
    const { error } = await supabase.rpc('delete_my_account')
    if (error) {
      setBusy(false)
      setError('The account could not be deleted. Nothing was removed. ' + error.message)
      return
    }
    await resetLocal()
    await supabase.auth.signOut()
  }

  return (
    <div className="setting-row" style={{ alignItems: 'start' }}>
      <div>
        <div className="row-name">Delete account</div>
        <div className="row-meta">
          Removes your account, your profiles, plan, logs, recipes and settings from the server
          and from this device. A household you share passes to the other member.
          This cannot be undone.
        </div>
        {open && (
          <div style={{ marginTop: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}>
            <label className="row-meta">
              Type <b>delete</b> to confirm
              <input className="btn" style={{ display: 'block', marginTop: 4, width: 200 }}
                value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </label>
            {!online && <div className="row-meta" style={{ color: 'var(--e-warn)' }}>Needs a connection.</div>}
            {error && <div className="row-meta" style={{ color: 'var(--e-warn)' }}>{error}</div>}
          </div>
        )}
      </div>
      {!open
        ? <button className="btn" onClick={() => setOpen(true)}>Delete</button>
        : <div className="row-right">
            <button className="btn" onClick={() => { setOpen(false); setTyped('') }}>Cancel</button>
            <button className="btn btn-primary" disabled={typed !== 'delete' || busy || !online}
              onClick={() => void remove()}>{busy ? 'Deleting…' : 'Delete for good'}</button>
          </div>}
    </div>
  )
}

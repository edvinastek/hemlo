import { saveFile } from '../lib/native'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, resetLocal } from '../lib/db'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { edit } from '../lib/write'
import { MODULES } from '../modules/registry'
import { setModuleEnabled } from '../modules/defs'
import './more.css'
import { ModuleEditor } from '../ui/ModuleEditor'
import { BuiltModules } from '../modules/ModuleBuilder'
import { StartingLayout, WhereYouAre, WorkSettings } from '../settings/PlanningSettings'
import { HoldSettings } from '../settings/HoldSettings'
import { TodayCardsSettings } from '../settings/TodayCardsSettings'
import { FoodSettings } from '../settings/FoodSettings'
import { BodySettings } from '../settings/BodySettings'
import { ShoppingSettings } from '../settings/ShoppingSettings'
import { HouseholdShare } from '../settings/HouseholdShare'
import { NavSettings } from '../settings/NavSettings'
import { ColourSettings } from '../settings/ColourSettings'
import { LooksSettings } from '../settings/Looks'
import { HolidaySettings } from '../settings/HolidaySettings'
import { CalendarLinks } from '../settings/CalendarLinks'
import { TransferSettings } from '../settings/TransferSettings'
import { RecipeReview } from '../settings/RecipeReview'
import { Accounts } from '../settings/Accounts'
import { Profiles } from '../settings/Profiles'
import { SignOut } from '../settings/SignOut'
import { AboutSettings } from '../settings/About'
import { findSettings, pageForAddress, pageInfo, SETTINGS_INDEX, SETTINGS_PAGES, type SettingEntry, type SettingsPage } from '../lib/settings-index-rules'
import { conflictLine } from '../lib/sync-rules'
import { search } from '../lib/search-rules'
import { Tip } from '../ui/Tip'
import { WhatMovedList } from '../ui/WhatMoved'
import { resetTips } from '../lib/tips-rules'
import { saveTipState, tipState } from '../lib/tips'
import { setMeta } from '../lib/db'
import { reviewSettings, setReviewTime, DEFAULT_EXTENSION_LIMIT } from '../lib/review'
import { cleanLimit } from '../lib/review-rules'
import { NoteTemplates } from '../settings/NoteTemplates'
import { exportBundle, importBundle } from '../lib/bundle'
import { getReminderSettings, setReminderSettings, requestPermission, type ReminderSettings } from '../lib/notify'
import type { ModuleInstance } from '../lib/types'
import type { ImportPreview } from '../lib/excel'
import type { ImportPlan, ImportSummary } from '../lib/import'

/** Settings (SET-01, v17): a short list of pages, each opening on its own
 *  (CALM-12), with one search over every setting that jumps into its page.
 *  The address says which page is open (/more?page=looks), so Back returns
 *  to the list and other screens can link straight to a page; the old
 *  ?section= and ?find= addresses still land in the right place. */
export function More() {
  const [params] = useSearchParams()
  const { hash } = useLocation()
  const findAsked = params.get('find')
  const page = pageForAddress({ page: params.get('page'), section: params.get('section'), find: findAsked, hash })
  const [jump, setJump] = useState<SettingEntry | null>(null)
  // ?find=<title> opens that setting's page and scrolls to it (the Chores
  // page's "Invite someone" opens Household).
  useEffect(() => {
    const e = SETTINGS_INDEX.find((x) => x.title === findAsked)
    if (e) setJump(e)
  }, [findAsked])

  // After a search result opens its page, scroll to its heading or row.
  // Panels read their data first and draw a moment later, so the heading is
  // looked for a few times, and once found it is kept in view for a little
  // while as the panels above it fill in and push it down.
  useEffect(() => {
    if (!jump) return
    const find = () => [...document.querySelectorAll<HTMLElement>('.page .section-title, .page .row-name')]
      .find((x) => x.textContent?.trim().toLowerCase().startsWith(jump.title.toLowerCase()))
    let ticks = 0
    let seen = 0
    const id = window.setInterval(() => {
      ticks++
      const el = find()
      if (el) { seen++; el.scrollIntoView({ block: 'start' }) }
      if (seen >= 8 || ticks >= 25) { window.clearInterval(id); setJump(null) }
    }, 80)
    return () => window.clearInterval(id)
  }, [jump, page])

  return (
    <div className="page">
      <div className="page-inner">
        {page ? <SettingsPageView page={page} /> : <SettingsHome />}
      </div>
    </div>
  )
}

/** The Settings list: the search, then one row per page. */
function SettingsHome() {
  const [query, setQuery] = useState('')
  const found = findSettings(query)
  const to = (page: SettingsPage, find?: string) => `/more?page=${page}${find ? `&find=${encodeURIComponent(find)}` : ''}`
  return (
    <>
      <header className="page-head">
        <h1 className="page-date">Settings</h1>
        <div className="more-search">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a setting" aria-label="Find a setting" />
        </div>
      </header>
      {query.trim() ? (
        <ul className="more-found" aria-label="Settings found">
          {found.length === 0 && <li className="mp-note">No setting has all of “{query.trim()}”.</li>}
          {found.map((f) => (
            <li key={f.page + f.title}>
              <Link to={to(f.page, f.title)}>
                <span className="row-name">{f.title}</span>
                <span className="row-meta">{pageInfo(f.page)?.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <Tip id="make-yours" />
          <ul className="more-pages" aria-label="Settings">
            {SETTINGS_PAGES.map((p) => (
              <li key={p.key}>
                <Link to={to(p.key)}>
                  <span className="more-page-text">
                    <span className="row-name">{p.title}</span>
                    <span className="row-meta">{p.line}</span>
                  </span>
                  <span className="more-chev" aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

/** One Settings page: a way back to the list, its title, and its panels. */
function SettingsPageView({ page }: { page: SettingsPage }) {
  const navigate = useNavigate()
  const info = pageInfo(page)!
  const [editing, setEditing] = useState<string | null>(null)
  if (page === 'modules' && editing) {
    return <ModuleEditor moduleKey={editing} onBack={() => setEditing(null)} />
  }
  return (
    <>
      <header className="page-head more-sub-head">
        <button type="button" className="more-back" onClick={() => navigate('/more')}>
          <span aria-hidden="true">‹</span> Settings
        </button>
        <h1 className="page-date">{info.title}</h1>
      </header>
      {page === 'profile' && <ProfilePanel />}
      {page === 'looks' && <><LooksSettings /><ColourSettings /></>}
      {page === 'bar' && <NavSettings />}
      {page === 'modules' && <><Modules onEdit={setEditing} /><StartingLayout /></>}
      {page === 'planning' && <PlanningPanel />}
      {page === 'food' && <><FoodSettings /><BodySettings /></>}
      {page === 'shopping' && <><ShoppingSettings /><HouseholdShare /></>}
      {page === 'calendars' && <><CalendarLinks /><HolidaySettings /></>}
      {page === 'reminders' && <RemindersPanel />}
      {page === 'data' && <DataPanel />}
      {page === 'about' && <AboutSettings />}
    </>
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

  // The module lists can be searched (GEN-13), with THE search.
  const [filter, setFilter] = useState('')
  const listed = filter.trim()
    ? search(MODULES.map((m) => ({ ...m, extra: `${m.summary} ${(m.keywords ?? []).join(' ')}` })), filter).map((x) => MODULES.find((m) => m.key === x.key)!)
    : MODULES

  return (
    <>
      <div className="setting-row">
        <div>
          <div className="row-name">Modules page</div>
          <div className="row-meta">Every module that is on, with search.</div>
        </div>
        <Link className="btn" to="/modules">Open</Link>
      </div>
      <div className="more-filter">
        <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a module" aria-label="Find a module" />
      </div>
      <p className="section-title">On</p>
      {listed.filter((m) => byKey.get(m.key)?.enabled).map((m) => (
        <Row key={m.key} name={m.name} summary={m.summary} depth={m.depth}
          instance={byKey.get(m.key)} onToggle={toggle} onEdit={() => onEdit(m.key)} />
      ))}

      <p className="section-title">Available</p>
      {listed.filter((m) => !byKey.get(m.key)?.enabled).map((m) => (
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
        <button className="btn" onClick={onEdit} aria-label={`Edit ${name}`}>Edit</button>
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
  const { profile } = useApp()
  if (!profile) return <p className="empty">No profile yet.</p>
  return (
    <>
      <Profiles />
      <WhereYouAre />
    </>
  )
}

/** Settings → Planning: the work week, how a hold behaves, Today's cards,
 *  note templates and the evening review. */
function PlanningPanel() {
  return (
    <>
      <WorkSettings />
      <HoldSettings />
      <TodayCardsSettings />
      <NoteTemplates />
      <ReviewSettings />
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
        hint="Left empty, reminders come from GetIt."
        onSave={(v) => edit('profile', profile, { ai_persona_name: v || null })} />

      <p className="section-title">Reminders on this device</p>
      <div className="setting-row">
        <div>
          <div className="row-name">Remind me at each item’s time</div>
          <div className="row-meta">Even with GetIt closed; the text is hidden on a locked phone.</div>
        </div>
        <button className="switch" role="switch" aria-checked={settings.on}
          aria-label="Reminders" onClick={() => void update({ ...settings, on: !settings.on })} />
      </div>
      <div className="setting-row more-stack">
        <div>
          <div className="row-name">Quiet hours</div>
          <div className="row-meta">{settings.quietDelay
            ? 'A reminder that falls in these hours arrives when they end.'
            : 'Nothing arrives between these times.'}</div>
        </div>
        <div className="row-right more-times">
          <input className="btn" type="time" value={settings.quietFrom} aria-label="Quiet hours from"
            onChange={(e) => void update({ ...settings, quietFrom: e.target.value })} />
          <span className="row-meta">to</span>
          <input className="btn" type="time" value={settings.quietTo} aria-label="Quiet hours to"
            onChange={(e) => void update({ ...settings, quietTo: e.target.value })} />
        </div>
      </div>
      <div className="setting-row">
        <div>
          <div className="row-name">Hold them until quiet hours end</div>
          <div className="row-meta">Off: a reminder in quiet hours is dropped.</div>
        </div>
        <button className="switch" role="switch" aria-checked={settings.quietDelay}
          aria-label="Hold reminders until quiet hours end" onClick={() => void update({ ...settings, quietDelay: !settings.quietDelay })} />
      </div>
      <div className="setting-row">
        <div>
          <div className="row-name">Which modules remind you</div>
          <div className="row-meta">Each module’s Settings → Show → Send reminders.</div>
        </div>
        <Link className="btn" to="/modules">Modules</Link>
      </div>
      {note && <p className="empty" style={{ color: 'var(--e-warn)' }}>{note}</p>}

      <TipsSettings />
    </>
  )
}

/** The evening review's time and how often a task may move before it is
 *  flagged (SET-08). Both belong to this device, as before. */
function ReviewSettings() {
  const review = useLiveQuery(() => reviewSettings(), [], null)
  const [limitText, setLimitText] = useState<string | null>(null)
  if (!review) return null
  const shown = limitText ?? String(review.limit)
  async function saveLimit(v: string) {
    const n = cleanLimit(Number(v), DEFAULT_EXTENSION_LIMIT)
    await setMeta('extension_limit', n)
    setLimitText(null)
  }
  return (
    <>
      <p className="section-title">Evening review</p>
      <div className="setting-row">
        <div>
          <div className="row-name">Review time</div>
          <div className="row-meta">From then, what is left of the day is offered for another. This device only.</div>
        </div>
        <input className="btn" type="time" value={review.time} aria-label="Review time"
          onChange={(e) => e.target.value && void setReviewTime(e.target.value)} />
      </div>
      <div className="setting-row">
        <div>
          <div className="row-name">Moved this many times, it is flagged</div>
          <div className="row-meta">Its reminder then asks for a new time. This device only.</div>
        </div>
        <div className="row-right more-stepper">
          <button type="button" className="btn" aria-label="One fewer" disabled={review.limit <= 1}
            onClick={() => void saveLimit(String(review.limit - 1))}>−</button>
          <input className="btn" inputMode="numeric" value={shown} aria-label="Times moved before it is flagged"
            onChange={(e) => setLimitText(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
            onBlur={() => limitText !== null && void saveLimit(limitText)} />
          <button type="button" className="btn" aria-label="One more" disabled={review.limit >= 20}
            onClick={() => void saveLimit(String(review.limit + 1))}>+</button>
        </div>
      </div>
    </>
  )
}

/** Tips shown once (ONB-13, CALM-14), again on request, and what moved
 *  where (NAV-26). */
function TipsSettings() {
  const [shown, setShown] = useState(false)
  const [done, setDone] = useState(false)
  return (
    <>
      <p className="section-title">Tips</p>
      <div className="setting-row">
        <div>
          <div className="row-name">Show tips again</div>
          <div className="row-meta">Each tip shows once.</div>
        </div>
        <button className="btn" disabled={done} onClick={() => { saveTipState(resetTips(tipState())); setDone(true) }}>{done ? 'Done' : 'Show again'}</button>
      </div>
      <div className="setting-row">
        <div>
          <div className="row-name">What moved where</div>
          <div className="row-meta">Where things went in this version.</div>
        </div>
        <button className="btn" aria-expanded={shown} onClick={() => setShown((v) => !v)}>{shown ? 'Hide' : 'Read'}</button>
      </div>
      {shown && <div className="more-moved"><WhatMovedList /></div>}
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
          <div className="row-meta">Changes made offline go up the moment there is a connection.</div>
        </div>
        <span className="chip">{pending} queued</span>
      </div>

      <p className="section-title">Merges the app had to resolve</p>
      {conflicts.length === 0
        ? <p className="empty">None so far.</p>
        : conflicts.map((c) => {
          // Refused changes say so, and every value reads as words (SET-07).
          const line = conflictLine(c)
          return (
            <div key={c.id} className="setting-row">
              <div>
                <div className="row-name">{line.head}</div>
                <div className="row-meta">{line.text} · {new Date(c.at).toLocaleString()}</div>
              </div>
            </div>
          )
        })}

      <p className="section-title">Your data</p>
      <div className="setting-row">
        <div>
          <div className="row-name">Export</div>
          <div className="row-meta">Everything, in one file.</div>
        </div>
        <button className="btn" onClick={doExport}>Export</button>
      </div>
      <div className="setting-row">
        <div>
          <div className="row-name">Import</div>
          <div className="row-meta">A GetIt export, or your Excel workbook.</div>
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

      <p className="section-title">Account</p>
      <Accounts />
      <SignOut />
      <DeleteAccount />
    </>
  )
}

function Field({ label, value, unit, hint, type = 'text', inputMode, check, onSave }: {
  label: string; value: string; unit?: string; hint?: string; type?: 'text' | 'date'
  inputMode?: 'decimal' | 'text'
  /** What is wrong with a value, or null; a wrong one is not saved. */
  check?: (v: string) => string | null
  onSave: (v: string) => void | Promise<unknown>
}) {
  const [draft, setDraft] = useState(value)
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <div className="setting-row">
      <div>
        <div className="row-name">{label}</div>
        {hint && <div className="row-meta">{hint}</div>}
        {problem && <div className="row-meta" role="alert" style={{ color: 'var(--e-warn)' }}>{problem}</div>}
      </div>
      <div className="row-right">
        <input
          className="btn"
          type={type}
          value={draft}
          inputMode={inputMode}
          aria-label={label}
          aria-invalid={!!problem}
          style={{ width: type === 'date' ? 150 : 110, textAlign: 'right' }}
          onChange={(e) => { setDraft(e.target.value); setProblem(null) }}
          onBlur={() => {
            if (draft === value) return
            const p = check?.(draft) ?? null
            setProblem(p)
            if (!p) void onSave(draft)
          }}
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
        <div className="row-meta">Everything, from the server and this device. It cannot be undone.</div>
        {open && (
          <div style={{ marginTop: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}>
            <p className="row-meta">
              Your account, profiles, plan, logs, recipes and settings go. A household you share passes to
              the other member. Export first if you want a copy.
            </p>
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

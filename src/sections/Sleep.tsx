import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useModuleDef } from '../modules/defs'
import { useBuiltinRuleOn } from '../modules/rule-switch'
import {
  carryOutBedtimeRule, deleteNight, restoreNight, saveNight, saveSleepSettings, useNights, useSleepSettings,
} from '../lib/sleep'
import {
  bedFrom, clockOf, compareNight, describeLate, describeSpread, describeVsTarget, hoursSlept, minutesOf, regularity, sleepDebt,
  wakeFrom, type SleepSettings,
} from '../lib/sleep-rules'
import { addDays } from '../lib/schedule-rules'
import type { SleepLog } from '../lib/types'
import { offerUndo } from '../ui/Undo'
import { DefView, DeleteButton, ModuleTabs, Sheet, defTabs, localToday, useTab } from './ModuleKit'
import { ModuleMenu } from '../modules/ModuleHead'
import './sleep.css'

const QUALITY = [1, 2, 3, 4, 5]
const dayLabel = (d: string) => format(parseISO(d), 'EEE d MMM')
const h1 = (n: number) => `${n.toFixed(1)} h`

/** The Sleep page (SLP-02, SLP-03, SLP-04): the target and every night
 *  against it, sleep debt over the last week and how regular bed and wake
 *  times are, nights added or changed for any day, and an optional bedtime
 *  block on the planner. The module's own views (the table, the month)
 *  are under the page's ⋮ → Views. */
export function Sleep({ profileId }: { profileId: string; day: string }) {
  const def = useModuleDef('sleep')
  const today = localToday()
  const settings = useSleepSettings(profileId)
  const nights = useNights(profileId)
  const ruleOn = useBuiltinRuleOn(profileId, 'sleep', 'bedtime')
  const [night, setNight] = useState<SleepLog | 'new' | null>(null)
  const [target, setTarget] = useState(false)
  // The nights table is the Nights tab; the month and any other view of
  // the module's own are under ⋮ → Views.
  const all = defTabs(def)
  const nightsTab = all.find((t) => t.key === 'view:log')
  const tabs = [{ key: 'overview', name: 'Overview' }, ...(nightsTab ? [{ key: nightsTab.key, name: 'Nights' }] : [])]
  const views = all.filter((t) => t !== nightsTab)
  const [tab, setTab] = useTab('sleep', [...tabs, ...views])

  useEffect(() => { void carryOutBedtimeRule(profileId, today) }, [profileId, today, ruleOn])

  if (!settings || !nights) return null
  const free = (() => { const taken = new Set(nights.map((n) => n.log_date)); let d = today; for (let i = 0; i < 60 && taken.has(d); i++) d = addDays(d, -1); return d })()

  return (
    <>
      <ModuleMenu views={views} active={tab} onView={setTab} />
      <ModuleTabs tabs={tabs} active={tab} onTab={setTab} />
      {tab === 'overview' && (
        <>
          <Figures nights={nights} s={settings} today={today} />
          <div className="setting-row slp-target">
            <div>
              <div className="row-name">Target {settings.target_hours} h a night</div>
              <div className="row-meta">In bed by {settings.bedtime}, up at {wakeFrom(settings.bedtime, settings.target_hours)}
                {settings.block ? ruleOn
                  ? ` · on the planner from ${clockOf(minutesOf(settings.bedtime) - settings.wind_down)}${settings.locked ? ', locked' : ''}`
                  : ' · the bedtime block waits: its rule is switched off in Edit module' : ''}</div>
            </div>
            <button type="button" className="btn" onClick={() => setTarget(true)}>Change</button>
          </div>
          <h2 className="section-title">Last nights</h2>
          {nights.length === 0 ? (
            <p className="empty">Each night is logged on the morning it ends. Tap the round + button to add last night.</p>
          ) : (
            <>
              <NightList nights={nights.slice(0, 3)} s={settings} onOpen={setNight} brief />
              {nights.length > 3 && nightsTab && <div className="kit-toolbar"><button type="button" className="btn" onClick={() => setTab(nightsTab.key)}>All nights</button></div>}
              {!nightsTab && nights.length > 3 && <NightList nights={nights.slice(3)} s={settings} onOpen={setNight} brief />}
            </>
          )}
          <div className="kit-gap" />
          <button type="button" className="fab" aria-label="Add a night" onClick={() => setNight('new')}>+</button>
        </>
      )}
      {tab.startsWith('view:') && def && <DefView def={def} viewKey={tab.slice(5)} profileId={profileId}
        onClose={tab === nightsTab?.key ? undefined : () => setTab('overview')} />}
      {night && (
        <NightSheet key={night === 'new' ? 'new' : night.id} profileId={profileId} night={night === 'new' ? null : night}
          day={night === 'new' ? free : night.log_date} s={settings} today={today} onClose={() => setNight(null)} />
      )}
      {target && <TargetSheet profileId={profileId} s={settings} today={today} ruleOn={ruleOn} onClose={() => setTarget(false)} />}
    </>
  )
}

function Figures({ nights, s, today }: { nights: SleepLog[]; s: SleepSettings; today: string }) {
  const last = nights.find((n) => n.log_date <= today)
  const c = last ? compareNight(last, s) : null
  const debt = sleepDebt(nights, s.target_hours, today, 7)
  const reg = regularity(nights, today, 14)
  return (
    <div className="kit-figures is-four" aria-label="Sleep at a glance">
      <div className="kit-figure">
        <span className="k">{last ? (last.log_date === today ? 'Last night' : dayLabel(last.log_date)) : 'Last night'}</span>
        <span className="v">{c?.hours != null ? h1(c.hours) : '—'}</span>
        <span className="s">{c?.vsTarget != null ? describeVsTarget(c.vsTarget) : 'not logged'}</span>
      </div>
      <div className="kit-figure">
        <span className="k">Sleep debt</span>
        <span className="v">{debt.hours != null ? h1(debt.hours) : '—'}</span>
        <span className="s">{debt.nights ? `last 7 days, ${debt.nights} ${debt.nights === 1 ? 'night' : 'nights'}` : 'no nights this week'}</span>
      </div>
      <div className="kit-figure">
        <span className="k">Bedtime</span>
        <span className="v">{reg.averageBed ?? '—'}</span>
        <span className="s">{describeSpread(reg.bed)}</span>
      </div>
      <div className="kit-figure">
        <span className="k">Up at</span>
        <span className="v">{reg.averageWake ?? '—'}</span>
        <span className="s">{describeSpread(reg.wake)}</span>
      </div>
    </div>
  )
}

/** Nights, newest first. `brief` (the overview's last three) leaves out how
 *  late bed and waking were; the Nights tab and each night's sheet say it. */
function NightList({ nights, s, onOpen, brief = false }: { nights: SleepLog[]; s: SleepSettings; onOpen: (n: SleepLog) => void; brief?: boolean }) {
  const [shown, setShown] = useState(30)
  return (
    <>
      <ul className="kit-list" aria-label="Nights, newest first">
        {nights.slice(0, shown).map((n) => {
          const c = compareNight(n, s)
          const short = c.vsTarget != null && c.vsTarget < -0.05
          return (
            <li key={n.id} className="kit-row">
              <button type="button" className="kit-open" onClick={() => onOpen(n)} aria-label={`Change the night of ${dayLabel(n.log_date)}`}>
                <span className="row-name">{dayLabel(n.log_date)}</span>
                <span className="row-meta">{n.went_to_bed?.slice(0, 5) ?? '—'} to {n.woke_at?.slice(0, 5) ?? '—'}
                  {n.quality != null ? ` · quality ${n.quality} of 5` : ''}</span>
                {!brief && <span className="row-meta">{[describeLate(c.bedLate, 'bed'), describeLate(c.wakeLate, 'up')].filter(Boolean).join(' · ')}</span>}
              </button>
              <div className="slp-hours">
                <span className="kit-num">{c.hours != null ? h1(c.hours) : '—'}</span>
                <span className={`slp-vs${short ? ' kit-warn' : ''}`}>{describeVsTarget(c.vsTarget)}</span>
              </div>
            </li>
          )
        })}
      </ul>
      {nights.length > shown && (
        <div className="kit-toolbar"><button type="button" className="btn" onClick={() => setShown((x) => x + 60)}>Show older nights</button></div>
      )}
    </>
  )
}

function NightSheet({ profileId, night, day, s, today, onClose }: {
  profileId: string; night: SleepLog | null; day: string; s: SleepSettings; today: string; onClose: () => void
}) {
  const [date, setDate] = useState(day)
  const [bed, setBed] = useState(night?.went_to_bed?.slice(0, 5) ?? s.bedtime)
  const [woke, setWoke] = useState(night?.woke_at?.slice(0, 5) ?? wakeFrom(s.bedtime, s.target_hours))
  const [quality, setQuality] = useState<number | null>(night?.quality ?? null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const hours = bed && woke ? hoursSlept(bed, woke) : null
  const c = hours != null ? compareNight({ log_date: date, went_to_bed: bed, woke_at: woke, hours, quality }, s) : null

  async function save() {
    if (!date) return setError('Pick the day the night ended.')
    if (date > today) return setError('That day has not happened yet.')
    if (!bed || !woke) return setError('Both times are needed for the hours.')
    setBusy(true)
    const res = await saveNight(profileId, night, { log_date: date, went_to_bed: bed, woke_at: woke, quality })
    if (!res.ok) { setError(res.message); setBusy(false); return }
    onClose()
  }
  async function remove() {
    if (!night) return
    setBusy(true)
    await deleteNight(night)
    offerUndo(`Night of ${dayLabel(night.log_date)} deleted`, () => restoreNight(night))
    onClose()
  }

  return (
    <Sheet title={night ? 'Change night' : 'Add a night'} onClose={onClose} onSubmit={() => void save()}
      actions={<>
        {night && <DeleteButton onDelete={() => void remove()} disabled={busy} />}
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>Save</button>
      </>}>
      <div className="form-grid">
        <label>The morning it ended<input type="date" value={date} max={today} onChange={(e) => { setDate(e.target.value); setError(null) }} /></label>
        <div className="two">
          <label>To bed<input type="time" value={bed} onChange={(e) => setBed(e.target.value)} /></label>
          <label>Woke<input type="time" value={woke} onChange={(e) => setWoke(e.target.value)} /></label>
        </div>
        <div className="sleep-quality" role="group" aria-label="Quality, 1 to 5">
          <span>Quality</span>
          <div>
            {QUALITY.map((q) => (
              <button key={q} type="button" aria-pressed={quality === q} onClick={() => setQuality(quality === q ? null : q)}>{q}</button>
            ))}
          </div>
        </div>
        <p className="kit-hint" aria-live="polite">{c?.hours != null
          ? `${h1(c.hours)} · ${describeVsTarget(c.vsTarget)} of ${s.target_hours} h · ${describeLate(c.bedLate, 'bed')}`
          : 'Both times give the hours.'}</p>
      </div>
      {error && <p className="kit-error" role="alert">{error}</p>}
    </Sheet>
  )
}

function TargetSheet({ profileId, s, today, ruleOn, onClose }: { profileId: string; s: SleepSettings; today: string; ruleOn: boolean; onClose: () => void }) {
  const [hours, setHours] = useState(String(s.target_hours))
  const [bed, setBed] = useState(s.bedtime)
  const [wind, setWind] = useState(String(s.wind_down))
  const [block, setBlock] = useState(s.block)
  const [locked, setLocked] = useState(s.locked)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const h = Number(hours.replace(',', '.'))
  const okHours = Number.isFinite(h) && h >= 4 && h <= 12
  const wake = okHours && bed ? wakeFrom(bed, h) : ''

  async function save() {
    if (!okHours) return setError('Hours a night: 4 to 12.')
    const w = Number(wind)
    if (!Number.isInteger(w) || w < 0 || w > 120) return setError('Wind-down: 0 to 120 minutes.')
    if (!bed) return setError('Pick a bedtime.')
    setBusy(true)
    await saveSleepSettings(profileId, { target_hours: Math.round(h * 4) / 4, bedtime: bed, wind_down: w, block, locked }, today)
    onClose()
  }

  return (
    <Sheet title="Sleep target" onClose={onClose} onSubmit={() => void save()}
      actions={<>
        <button type="button" className="btn grow" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>Save</button>
      </>}>
      <div className="form-grid">
        <label>Hours a night<input inputMode="decimal" value={hours} onChange={(e) => { setHours(e.target.value); setError(null) }} /></label>
        <div className="two">
          <label>In bed by<input type="time" value={bed} onChange={(e) => setBed(e.target.value)} /></label>
          <label>Up at<input type="time" value={wake} disabled={!okHours}
            onChange={(e) => { if (e.target.value && okHours) setBed(bedFrom(e.target.value, h)) }} /></label>
        </div>
        <p className="kit-hint">Change either time: the other follows from the hours.</p>
        <label className="kit-check"><input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} />
          Keep a bedtime block on the planner every night</label>
        {block && (
          <>
            <label>Wind-down before bed, minutes<input inputMode="numeric" value={wind} onChange={(e) => setWind(e.target.value)} /></label>
            <label className="kit-check"><input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
              Locked: nothing is planned across it</label>
            <p className="kit-hint">It shows on Today and Plan from {okHours && bed ? clockOf(minutesOf(bed) - (Number(wind) || 0)) : '…'}.
              Its reminder comes at that time when Sleep's reminders are on.{!ruleOn && ' The rule for it is switched off in Edit module, so the block waits until it is on again.'}</p>
          </>
        )}
      </div>
      {error && <p className="kit-error" role="alert">{error}</p>}
    </Sheet>
  )
}

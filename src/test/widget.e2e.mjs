import { need, sql, checks, open, signIn, profileOf, today, drained, APP } from './e2e.mjs'

// The app's side of the home-screen widget, in a browser that pretends to be
// the Android app: a stand-in for Capacitor's native bridge records what the
// app sends to the widget and hands it ticks, as the real widget would. The
// widget itself is drawn and tested in android/app/src/test.
//
// Needs TEST_FEAT_EMAIL (a new account), TEST_PASSWORD and SB. Every query is
// scoped to that account, because this runs against the live project.
need('TEST_FEAT_EMAIL', 'TEST_PASSWORD', 'SB')
const email = process.env.TEST_FEAT_EMAIL
const pid = profileOf(email)
const mine = `profile_id = ${pid}`
const { is, failed } = checks()
const day = today()
const one = async (q) => (await sql(q))[0] ?? {}

/** Runs in the page before the app: Android's bridge, faked. */
function fakeAndroid(startTicks) {
  const plugins = {
    App: ['addListener', 'removeListener', 'getLaunchUrl', 'getState', 'exitApp'],
    LocalNotifications: ['checkPermissions', 'requestPermissions', 'getPending', 'cancel', 'schedule', 'createChannel',
      'registerActionTypes', 'addListener', 'removeListener', 'removeAllListeners'],
    GetItWidget: ['update', 'takeTicks', 'clear', 'addListener', 'removeListener'],
  }
  const state = { snapshot: null, ticks: startTicks, calls: [], listeners: {} }
  window.__widget = state
  window.androidBridge = { postMessage() {} }
  let nextId = 1
  window.Capacitor = {
    PluginHeaders: Object.entries(plugins).map(([name, methods]) => ({
      name,
      methods: methods.map((m) => ({ name: m, rtype: m === 'addListener' ? 'callback' : 'promise' })),
    })),
    nativeCallback(plugin, method, options, callback) {
      const id = String(nextId++)
      if (method === 'addListener') (state.listeners[`${plugin}:${options.eventName}`] ??= []).push(callback)
      return id
    },
    async nativePromise(plugin, method, options) {
      state.calls.push(`${plugin}.${method}`)
      if (plugin === 'GetItWidget') {
        if (method === 'update') { state.snapshot = JSON.parse(options.snapshot); return undefined }
        if (method === 'takeTicks') { const t = state.ticks; state.ticks = []; return { ticks: t } }
        if (method === 'clear') { state.snapshot = null; state.ticks = []; return undefined }
      }
      if (plugin === 'LocalNotifications') {
        if (method === 'checkPermissions' || method === 'requestPermissions') return { display: 'granted' }
        if (method === 'getPending') return { notifications: [] }
      }
      return {}
    },
  }
  /** What the widget's TickReceiver does: queue the tick, wake the app. */
  window.__tick = (kind, id, d, done) => {
    state.ticks.push({ kind, id, day: d, done, at: new Date().toISOString() })
    for (const cb of state.listeners['GetItWidget:tick'] ?? []) cb({})
  }
}

// A day to show: two tasks out of time order, a dropped one, a habit. Rows
// from an earlier run go first, so the account can be reused; that happens
// before any device has signed in, so none holds the old rows.
await sql(`delete from public.task where ${mine} and title like 'Widget %';
  delete from public.habit where ${mine} and name like 'Widget %';
  insert into public.task (profile_id, title, planned_date, planned_time) values
    (${pid}, 'Widget lunch', '${day}', '12:00'),
    (${pid}, 'Widget standup', '${day}', '09:00');
  insert into public.task (profile_id, title, planned_date, planned_time, status) values
    (${pid}, 'Widget dropped', '${day}', '10:00', 'dropped');
  insert into public.habit (profile_id, name, schedule, sort_order) values (${pid}, 'Widget stretch', 'daily', 0);`)
const A = await open()
let p = A.p
await p.addInitScript(fakeAndroid, [])
await signIn(p, email)

await p.reload({ waitUntil: 'domcontentloaded' })
await p.locator('.bottom-nav').waitFor({ timeout: 20000 })
await p.waitForFunction(() => window.__widget.snapshot?.days && Object.values(window.__widget.snapshot.days)[0].tasks.length >= 2 && Object.values(window.__widget.snapshot.days)[0].habits.some((h) => h.name === 'Widget stretch'), null, { timeout: 20000 })

let snap = await p.evaluate(() => window.__widget.snapshot)
const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('sv')
is('the widget gets today and tomorrow', Object.keys(snap.days).join(','), `${day},${tomorrow}`)
is('today’s tasks in time order, dropped left out', snap.days[day].tasks.map((t) => t.title).filter((t) => t.startsWith('Widget')).join(', '), 'Widget standup, Widget lunch')
is('with their times', snap.days[day].tasks.find((t) => t.title === 'Widget standup')?.time, '09:00')
is('and today’s habits', snap.days[day].habits.map((h) => h.name).filter((n) => n.startsWith('Widget')).join(', '), 'Widget stretch')

// A tick on the widget while the app is open: applied, synced, shown back.
const taskId = snap.days[day].tasks.find((t) => t.title === 'Widget standup').id
const habitId = snap.days[day].habits.find((h) => h.name === 'Widget stretch').id
await p.evaluate(([id, d]) => window.__tick('task', id, d, true), [taskId, day])
await p.evaluate(([id, d]) => window.__tick('habit', id, d, true), [habitId, day])
await p.waitForTimeout(1500)
await drained(p)
let r = await one(`select (select status from public.task where ${mine} and title = 'Widget standup') status,
  (select bool_and(l.done) from public.habit_log l join public.habit h on h.id = l.habit_id where h.${mine} and h.name = 'Widget stretch' and l.log_date = '${day}') habit`)
is('a task ticked on the widget is done on the server', r.status, 'done')
is('a habit ticked on the widget is done on the server', r.habit, true)
is('Today shows it ticked', await p.locator('.row.is-done', { hasText: 'Widget standup' }).count(), 1)
await p.waitForFunction((id) => window.__widget.snapshot.days && Object.values(window.__widget.snapshot.days)[0].tasks.find((t) => t.id === id)?.done === true, taskId, { timeout: 5000 }).catch(() => undefined)
snap = await p.evaluate(() => window.__widget.snapshot)
is('the widget is sent the new state', snap.days[day].tasks.find((t) => t.id === taskId)?.done, true)

// The same tick twice changes nothing: ticks say what a row should be.
await p.evaluate(([id, d]) => window.__tick('task', id, d, true), [taskId, day])
await p.waitForTimeout(1000)
is('a repeated tick leaves it done', await p.locator('.row.is-done', { hasText: 'Widget standup' }).count(), 1)

// Ticks made while the app was closed are applied when it opens.
await p.close()
p = await A.ctx.newPage()
await p.addInitScript(fakeAndroid, [{ kind: 'task', id: taskId, day, done: false, at: new Date().toISOString() }])
await p.goto(APP, { waitUntil: 'domcontentloaded' })
await p.locator('.bottom-nav').waitFor({ timeout: 20000 })
await p.waitForTimeout(2500)
await drained(p)
r = await one(`select status from public.task where ${mine} and title = 'Widget standup'`)
is('an untick made while the app was closed reaches the server when it opens', r.status, 'todo')
is('and the queue on the phone is empty', (await p.evaluate(() => window.__widget.ticks.length)), 0)

// Signing out clears the widget.
await p.click('.bottom-nav a[href="/more"]')
await p.click('.tabs button:has-text("Data")')
await p.click('button:has-text("Sign out")')
await p.locator('input[type=email]').waitFor({ timeout: 15000 })
await p.waitForTimeout(800)
is('signing out clears the widget', await p.evaluate(() => window.__widget.snapshot), null)
is('the widget was told to clear', await p.evaluate(() => window.__widget.calls.includes('GetItWidget.clear')), true)

console.log(A.errors.length ? 'PAGE ERRORS: ' + A.errors.join(' | ') : 'no page errors')
console.log(failed() ? `\n${failed()} check(s) failed` : '\nall checks passed')
await A.b.close()
process.exit(failed() || A.errors.length ? 1 : 0)

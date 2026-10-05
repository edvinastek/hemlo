// Checks Telegram reminders (REM-05): the link address, how Telegram's updates
// are read (/start with and without a code, /stop, blocking the bot, groups and
// everything else ignored), what goes to Telegram and what stays on the phone,
// the list the app hands over, which reminders a run sends and how they are
// grouped, and both server functions end to end with Telegram and the
// database stood in for: the secret headers, linking and unlinking, one
// message per chat, a reminder never sent twice (a second run, two runs at
// once, an answer that never came), a refusal tried again, a blocked bot
// unlinked, and the bot's token never in a log. No Deno, no network.
import {
  LINK_MINUTES, SEND_WINDOW_MIN, MAX_ITEMS, MAX_MESSAGE, REPLIES,
  cleanBotName, isLinkCode, linkAddress, parseUpdate, telegramBody, queueItems, queueSignature,
  chooseDue, buildMessage, groupByChat, sendOutcome, sameSecret, botSend,
} from '../lib/telegram-rules.ts'
import { handleWebhook } from '../../supabase/functions/telegram-webhook/handler.ts'
import { handleSend } from '../../supabase/functions/telegram-send/handler.ts'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  const ok = a === b
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${a}, expected ${b}`}`)
}

// ---- linking --------------------------------------------------------------------
const CODE = 'Ab3_dE-fGhIjKlMnOpQrSt' // 22 characters, as telegram_link_start makes
eq('the link code lasts 10 minutes (as 038)', LINK_MINUTES, 10)
eq('a bot name as BotFather gives it', cleanBotName('VisumaPlannerBot'), 'VisumaPlannerBot')
eq('a bot name with @', cleanBotName(' @VisumaPlannerBot '), 'VisumaPlannerBot')
eq('a bot name as a t.me address', cleanBotName('https://t.me/VisumaPlannerBot'), 'VisumaPlannerBot')
eq('a name that does not end in bot is no bot', cleanBotName('VisumaPlanner'), null)
eq('too short', cleanBotName('abot'), null)
eq('no spaces or dots', cleanBotName('get it.bot'), null)
eq('nothing set', cleanBotName(undefined), null)
eq('a code from 038 is a code', isLinkCode(CODE), true)
eq('a short code is not', isLinkCode('abc'), false)
eq('a code with other characters is not', isLinkCode('Ab3_dE-fGhIjKlMnOp/rSt'), false)
eq('the link address', linkAddress('@VisumaPlannerBot', CODE), `https://t.me/VisumaPlannerBot?start=${CODE}`)
eq('no link without a bot name', linkAddress('', CODE), null)

// ---- reading Telegram's updates ------------------------------------------------------
const msg = (text, chat = { id: 4242, type: 'private' }) => ({ update_id: 1, message: { message_id: 2, chat, text } })
eq('/start with the code', parseUpdate(msg(`/start ${CODE}`)), { kind: 'start', chat: '4242', code: CODE })
eq('/start@Bot with the code', parseUpdate(msg(`/start@VisumaPlannerBot ${CODE}`)), { kind: 'start', chat: '4242', code: CODE })
eq('/start on its own', parseUpdate(msg('/start')), { kind: 'start', chat: '4242', code: null })
eq('/start with something that is no code', parseUpdate(msg('/start hello!')), { kind: 'start', chat: '4242', code: null })
eq('/stop', parseUpdate(msg('/stop')), { kind: 'stop', chat: '4242', reply: true })
eq('/stop@Bot', parseUpdate(msg('/stop@VisumaPlannerBot')), { kind: 'stop', chat: '4242', reply: true })
eq('a chat id as text', parseUpdate(msg('/stop', { id: '4242', type: 'private' })), { kind: 'stop', chat: '4242', reply: true })
eq('an ordinary message is ignored', parseUpdate(msg('hello')), { kind: 'ignore' })
eq('another command is ignored', parseUpdate(msg('/help')), { kind: 'ignore' })
eq('/start in a group is ignored', parseUpdate(msg(`/start ${CODE}`, { id: -100123, type: 'group' })), { kind: 'ignore' })
eq('/stop in a channel is ignored', parseUpdate(msg('/stop', { id: -100123, type: 'channel' })), { kind: 'ignore' })
eq('an edited message is ignored', parseUpdate({ update_id: 1, edited_message: msg('/stop').message }), { kind: 'ignore' })
eq('a photo is ignored', parseUpdate({ update_id: 1, message: { chat: { id: 1, type: 'private' }, photo: [] } }), { kind: 'ignore' })
eq('blocking the bot unlinks, with no reply', parseUpdate({ update_id: 1, my_chat_member: { chat: { id: 4242, type: 'private' }, new_chat_member: { status: 'kicked' } } }),
  { kind: 'stop', chat: '4242', reply: false })
eq('unblocking it changes nothing', parseUpdate({ update_id: 1, my_chat_member: { chat: { id: 4242, type: 'private' }, new_chat_member: { status: 'member' } } }), { kind: 'ignore' })
eq('not an update', parseUpdate('nonsense'), { kind: 'ignore' })
eq('nothing', parseUpdate(null), { kind: 'ignore' })
eq('a fractional chat id is no chat', parseUpdate(msg('/stop', { id: 1.5, type: 'private' })), { kind: 'ignore' })

// ---- what goes to Telegram -------------------------------------------------------------
eq('a task the person wrote goes as the phone says it', telegramBody({ kind: 'task', body: 'Call the dentist at 10:00.', task: { source: 'manual' } }), 'Call the dentist at 10:00.')
eq('a planned meal stays on the phone (its title carries calories)', telegramBody({ kind: 'task', body: 'Lunch: Chicken salad · 520 kcal at 12:30.', task: { source: 'meal' } }), null)
eq('a planned workout stays on the phone', telegramBody({ kind: 'task', body: 'Calisthenics A at 17:30.', task: { source: 'workout' } }), null)
eq('a weigh-in written by a module rule stays on the phone', telegramBody({ kind: 'task', body: 'Weigh-in at 07:30.', task: { source: 'module', module_key: 'health' } }), null)
eq('a bedtime written by a module rule stays on the phone', telegramBody({ kind: 'task', body: 'Bedtime at 23:00.', task: { source: 'module', module_key: 'sleep' } }), null)
eq('a study block written by a module rule goes', telegramBody({ kind: 'task', body: 'Study: Dutch at 19:00.', task: { source: 'module', module_key: 'learning' } }), 'Study: Dutch at 19:00.')
eq('a task moved many times goes with its offer', telegramBody({ kind: 'task', body: 'Tax return has moved 4 times. Want a new time for it?', task: { source: 'manual' } }), 'Tax return has moved 4 times. Want a new time for it?')
eq('a habit goes', telegramBody({ kind: 'habit', body: 'Time for Stretch.' }), 'Time for Stretch.')
eq('a chore goes', telegramBody({ kind: 'chore', body: 'Bins out is due at 19:00.' }), 'Bins out is due at 19:00.')
eq('a supplement slot goes with the names the person gave', telegramBody({ kind: 'supplements', body: 'Morning: Vitamin D, Iron.' }), 'Morning: Vitamin D, Iron.')
eq('a refill goes without the count', telegramBody({ kind: 'supplements', refill: true, title: 'Vitamin D', body: 'Vitamin D: 7 left, enough for 7 days. Time to get more.' }), 'Vitamin D: time to get more.')
eq('a payment goes without the amount', telegramBody({ kind: 'payment', title: 'Rent', body: 'Rent today (€ 950.00).' }), 'Rent today.')
eq('an empty line goes nowhere', telegramBody({ kind: 'event', body: '  ' }), null)

const NOW = new Date('2026-10-04T08:00:00Z')
const at = (min) => new Date(NOW.getTime() + min * 60_000)
const items = queueItems([
  { key: 'task:b:2026-10-04', at: at(60), telegram: 'Second.' },
  { key: 'task:a:2026-10-04', at: at(30), telegram: '  First.  ' },
  { key: 'task:a:2026-10-04', at: at(90), telegram: 'First, again.' },
  { key: 'task:meal:2026-10-04', at: at(40), telegram: null },
  { key: 'task:gone:2026-10-04', at: at(-5), telegram: 'Already past.' },
  { key: 'task:now:2026-10-04', at: NOW, telegram: 'Right now.' },
  { key: 'x'.repeat(201), at: at(10), telegram: 'Key too long.' },
  { key: 'task:long:2026-10-04', at: at(120), telegram: 'y'.repeat(600) },
], NOW)
eq('the list: from now on, soonest first, once per key, only what Telegram gets',
  items.map((i) => [i.key, i.due_at, i.body.length > 20 ? `${i.body.length} chars` : i.body]),
  [['task:a:2026-10-04', '2026-10-04T08:30:00.000Z', 'First.'], ['task:b:2026-10-04', '2026-10-04T09:00:00.000Z', 'Second.'],
   ['task:long:2026-10-04', '2026-10-04T10:00:00.000Z', '500 chars']])
eq('at most 300 go', queueItems(Array.from({ length: 400 }, (_, i) => ({ key: `k${i}`, at: at(i + 1), telegram: 'x' })), NOW).length, MAX_ITEMS)
eq('the same list has the same fingerprint', queueSignature(items) === queueSignature(queueItems([
  { key: 'task:long:2026-10-04', at: at(120), telegram: 'y'.repeat(600) },
  { key: 'task:b:2026-10-04', at: at(60), telegram: 'Second.' }, { key: 'task:a:2026-10-04', at: at(30), telegram: 'First.' }], NOW)), true)
eq('a moved reminder changes it', queueSignature(items) === queueSignature(items.map((i, n) => (n ? i : { ...i, due_at: '2026-10-04T08:31:00.000Z' }))), false)
eq('an empty list has its own', queueSignature([]), '0:0')

// ---- what a run sends ---------------------------------------------------------------------
const row = (key, min, chat = '4242', body = `${key}.`) => ({ profile_id: 'p1', key, due_at: at(min).toISOString(), body, chat_id: chat })
eq('the window is 10 minutes', SEND_WINDOW_MIN, 10)
eq('due now and in the last 10 minutes; not later ones, not older ones, not groups, not empty ones',
  chooseDue([row('later', 1), row('now', 0), row('nine', -9), row('ten', -10), row('group', -1, '-100'), row('empty', -1, '4242', ' '), row('bad', -1, 'x')], NOW).map((r) => r.key),
  ['nine', 'now'])
eq('one message per chat, in time order', groupByChat(chooseDue([row('b', -1), row('a', -3), row('c', -2, '77')], NOW)).map((g) => [g.chat, g.text]),
  [['4242', 'a.\nb.'], ['77', 'c.']])
eq('a message stays within Telegram\'s limit', buildMessage(Array.from({ length: 20 }, () => 'z'.repeat(400))).length <= MAX_MESSAGE, true)
eq('a single huge line is cut', buildMessage(['q'.repeat(5000)]).length, MAX_MESSAGE)
eq('sent', sendOutcome(200), 'sent')
eq('too many requests: again next run', sendOutcome(429), 'retry')
eq('Telegram had a problem: again next run', sendOutcome(502), 'retry')
eq('blocked by the person: unlink', sendOutcome(403, 'Forbidden: bot was blocked by the user'), 'gone')
eq('chat deleted: unlink', sendOutcome(400, 'Bad Request: chat not found'), 'gone')
eq('another bad request: again', sendOutcome(400, 'Bad Request: message text is empty'), 'retry')
eq('no answer at all: leave it as sent', sendOutcome(0), 'unsure')
eq('the right secret', sameSecret('s3cret-Value_1', 's3cret-Value_1'), true)
eq('a wrong secret', sameSecret('s3cret-Value_2', 's3cret-Value_1'), false)
eq('a longer one', sameSecret('s3cret-Value_1x', 's3cret-Value_1'), false)
eq('a prefix', sameSecret('s3cret', 's3cret-Value_1'), false)
eq('none given', sameSecret(null, 's3cret-Value_1'), false)
eq('none set refuses everything', sameSecret('', ''), false)

// ---- Telegram stood in for -------------------------------------------------------------------
const TOKEN = '123456:TEST-token-never-real'
const SECRET = 'webhook-secret_123'
const CRON = 'cron-secret_456'
function fakeTelegram(answer = () => ({ status: 200, body: { ok: true } })) {
  const sent = []
  const f = async (url, init) => {
    const u = String(url)
    if (!u.startsWith(`https://api.telegram.org/bot${TOKEN}/sendMessage`)) throw new Error(`unexpected address ${u}`)
    const body = JSON.parse(init.body)
    const a = answer(body, sent.length)
    if (a === 'throw') throw new TypeError(`error sending request for url (${u})`)
    sent.push(body)
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status, headers: { 'Content-Type': 'application/json' } })
  }
  return { f, sent }
}
// Everything printed while the functions run, to make sure the token never is.
const printed = []
const origLog = console.log
const origErr = console.error
const capture = (fn) => async (...a) => {
  console.log = (...x) => printed.push(x.join(' '))
  console.error = (...x) => printed.push(x.join(' '))
  try { return await fn(...a) } finally { console.log = origLog; console.error = origErr }
}

// The database, as 038 behaves: one code per profile, used once, for 10
// minutes; a chat per profile; reminders; claims in a sent log.
function fakeDb(now = () => NOW) {
  const d = {
    codes: new Map(), chats: new Map(), reminders: [], sentLog: new Set(), calls: [],
    linkChat: async (code, chat) => {
      d.calls.push('link')
      const hit = [...d.codes.entries()].find(([, v]) => v.code === code && v.expires > now())
      if (!hit || !/^[0-9]{1,20}$/.test(chat)) return false
      d.codes.delete(hit[0])
      d.chats.set(hit[0], chat)
      return true
    },
    stopChat: async (chat) => {
      d.calls.push('stop')
      let n = 0
      for (const [p, c] of d.chats) if (c === chat) { d.chats.delete(p); d.reminders = d.reminders.filter((r) => r.profile_id !== p); n++ }
      return n
    },
    claimDue: async (windowMin) => {
      const t = now().getTime()
      const out = []
      for (const r of d.reminders) {
        const due = Date.parse(r.due_at)
        const chat = d.chats.get(r.profile_id)
        const id = `${r.profile_id}|${r.key}|${r.due_at}`
        if (!chat || due > t || due <= t - windowMin * 60_000 || d.sentLog.has(id)) continue
        d.sentLog.add(id)
        out.push({ ...r, chat_id: chat })
      }
      return out
    },
    release: async (rows) => { for (const r of rows) d.sentLog.delete(`${r.profile_id}|${r.key}|${r.due_at}`) },
  }
  return d
}
const post = (body, headers = {}) => new Request('https://example.test/functions/v1/x', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
})
const fromTelegram = (body, secret = SECRET) => post(body, secret === null ? {} : { 'X-Telegram-Bot-Api-Secret-Token': secret })

const webhook = capture(async () => {
  const db = fakeDb()
  db.codes.set('pA', { code: CODE, expires: new Date(NOW.getTime() + 10 * 60_000) })
  const tg = fakeTelegram()
  const deps = { store: db, fetch: tg.f, token: TOKEN, secret: SECRET }
  const status = async (req, d = deps) => (await handleWebhook(req, d)).status

  eq('webhook: only POST', await status(new Request('https://example.test/', { method: 'GET' })), 405)
  eq('webhook: without the secret set, nothing is read', await status(fromTelegram(msg(`/start ${CODE}`)), { ...deps, secret: undefined }), 503)
  eq('webhook: without the secret header, refused', await status(fromTelegram(msg(`/start ${CODE}`), null)), 401)
  eq('webhook: with a wrong secret header, refused', await status(fromTelegram(msg(`/start ${CODE}`), 'guess')), 401)
  eq('webhook: a refused request touched nothing', [db.calls.length, tg.sent.length, db.chats.size], [0, 0, 0])

  eq('webhook: /start with the code is taken', await status(fromTelegram(msg(`/start ${CODE}`))), 200)
  eq('webhook: the chat is linked to the profile the code was for', [...db.chats.entries()], [['pA', '4242']])
  eq('webhook: and the bot says so', tg.sent.at(-1), { chat_id: '4242', text: REPLIES.linked, link_preview_options: { is_disabled: true } })
  eq('webhook: the reply says "Linked to Visuma"', REPLIES.linked.startsWith('Linked to Visuma'), true)
  await status(fromTelegram(msg(`/start ${CODE}`, { id: 9999, type: 'private' })))
  eq('webhook: the same link again links nothing more', [...db.chats.entries()], [['pA', '4242']])
  eq('webhook: and says the link was used', tg.sent.at(-1).text, REPLIES.expired)

  db.codes.set('pB', { code: 'Zz9_yY-xXwWvVuUtTsSrRq', expires: new Date(NOW.getTime() - 1) })
  await status(fromTelegram(msg('/start Zz9_yY-xXwWvVuUtTsSrRq', { id: 5555, type: 'private' })))
  eq('webhook: an expired code links nothing', db.chats.has('pB'), false)

  const before = db.calls.length
  await status(fromTelegram(msg('/start')))
  eq('webhook: /start alone says where to get a link, and asks the database nothing', [tg.sent.at(-1).text, db.calls.length - before], [REPLIES.noCode, 0])
  const sentBefore = tg.sent.length
  eq('webhook: an ordinary message is taken and ignored', await status(fromTelegram(msg('hello there'))), 200)
  eq('webhook: a group /start is ignored', await status(fromTelegram(msg(`/start ${CODE}`, { id: -100, type: 'group' }))), 200)
  eq('webhook: a body that is not JSON is ignored', await status(fromTelegram('{not json')), 200)
  eq('webhook: and none of them got an answer or reached the database', [tg.sent.length - sentBefore, db.calls.length - before], [0, 0])

  await status(fromTelegram(msg('/stop')))
  eq('webhook: /stop unlinks', [db.chats.size, tg.sent.at(-1).text], [0, REPLIES.stopped])
  await status(fromTelegram(msg('/stop')))
  eq('webhook: /stop when not linked says so', tg.sent.at(-1).text, REPLIES.notLinked)

  db.chats.set('pA', '4242')
  const n = tg.sent.length
  await status(fromTelegram({ update_id: 9, my_chat_member: { chat: { id: 4242, type: 'private' }, new_chat_member: { status: 'kicked' } } }))
  eq('webhook: blocking the bot unlinks, with no message sent', [db.chats.size, tg.sent.length - n], [0, 0])

  const broken = { ...deps, store: { linkChat: async () => { throw new Error('db down') }, stopChat: async () => { throw new Error('db down') } } }
  eq('webhook: the database unreachable: Telegram is asked to send it again later', await status(fromTelegram(msg(`/start ${CODE}`)), broken), 500)

  db.codes.set('pC', { code: 'Cc3_cC-cCcCcCcCcCcCcCc', expires: new Date(NOW.getTime() + 60_000) })
  const silent = fakeTelegram(() => 'throw')
  eq('webhook: Telegram not answering the reply still links', [await status(fromTelegram(msg('/start Cc3_cC-cCcCcCcCcCcCcCc', { id: 6, type: 'private' })), { ...deps, fetch: silent.f }), db.chats.get('pC')], [200, '6'])
})
await webhook()

const sender = capture(async () => {
  let clock = NOW
  const db = fakeDb(() => clock)
  db.chats.set('pA', '4242')
  db.chats.set('pB', '77')
  const due = (p, key, min, body) => db.reminders.push({ profile_id: p, key, due_at: at(min).toISOString(), body })
  due('pA', 'task:1', -1, 'Call the dentist at 10:00.')
  due('pA', 'habit:1', 0, 'Time for Stretch.')
  due('pA', 'task:later', 5, 'Later.')
  due('pA', 'task:stale', -30, 'Too late.')
  due('pB', 'chore:1', -2, 'Bins out is due at 07:58.')
  due('pC', 'task:unlinked', -1, 'No chat.')
  let tg = fakeTelegram()
  const deps = () => ({ store: db, fetch: tg.f, token: TOKEN, cronSecret: CRON, now: () => clock })
  const run = async (headers = { 'x-getit-cron': CRON }, d = deps()) => handleSend(post({}, headers), d)

  eq('send: without the job\'s secret, refused', (await run({})).status, 401)
  eq('send: with a wrong one, refused', (await run({ 'x-getit-cron': 'nope' })).status, 401)
  eq('send: without the secrets set, nothing runs', (await run(undefined, { ...deps(), cronSecret: undefined })).status, 503)
  eq('send: a refused run claimed nothing', db.sentLog.size, 0)

  const res = await run()
  eq('send: the run went', [res.status, await res.json()], [200, { sent: 3, retry: 0, gone: 0, unsure: 0 }])
  eq('send: one message per chat, the person\'s reminders one per line',
    tg.sent.map((m) => [m.chat_id, m.text]).sort(),
    [['4242', 'Call the dentist at 10:00.\nTime for Stretch.'], ['77', 'Bins out is due at 07:58.']])
  eq('send: nothing later, nothing stale, nothing for a profile without a chat',
    tg.sent.some((m) => /Later|Too late|No chat/.test(m.text)), false)
  const n1 = tg.sent.length
  await run()
  eq('send: a second run sends nothing again', tg.sent.length - n1, 0)

  clock = at(5)
  await run()
  eq('send: five minutes on, the later one goes', tg.sent.at(-1).text, 'Later.')

  // Two runs at once: each reminder still goes once.
  due('pA', 'task:twice', 5, 'Once only.')
  await Promise.all([run(), run(), run()])
  eq('send: three runs at once send it once', tg.sent.filter((m) => m.text === 'Once only.').length, 1)

  // Telegram says "too many requests": given back, sent by the next run, once.
  due('pB', 'task:busy', 5, 'Busy now.')
  tg = fakeTelegram((_, i) => (i === 0 ? { status: 429, body: { ok: false, description: 'Too Many Requests: retry after 3' } } : { status: 200, body: { ok: true } }))
  const busy = await (await run()).json()
  eq('send: a refusal for now is given back', [busy.retry, tg.sent.length], [1, 1])
  await run()
  await run()
  eq('send: and the next run sends it, once', tg.sent.filter((m) => m.text === 'Busy now.').length, 2)

  // No answer at all: it may have arrived, so it is not sent again.
  due('pA', 'task:unsure', 5, 'Maybe arrived.')
  tg = fakeTelegram(() => 'throw')
  eq('send: no answer is counted as unsure', (await (await run()).json()).unsure, 1)
  tg = fakeTelegram()
  await run()
  eq('send: and is never sent again', tg.sent.length, 0)

  // The person blocked the bot: Telegram answers 403, the chat is unlinked.
  due('pB', 'task:blocked', 5, 'Nobody listening.')
  tg = fakeTelegram(() => ({ status: 403, body: { ok: false, description: 'Forbidden: bot was blocked by the user' } }))
  eq('send: a blocked bot unlinks the chat', [(await (await run()).json()).gone, db.chats.has('pB')], [1, false])

  const broken = { ...deps(), store: { ...db, claimDue: async () => { throw new Error('db down') } } }
  eq('send: the database unreachable: the run fails and the next one catches up', (await run(undefined, broken)).status, 500)
})
await sender()

eq('the bot\'s token was never printed', printed.some((l) => l.includes(TOKEN) || l.includes('TEST-token')), false)
eq('nor a chat id or a reminder\'s text', printed.some((l) => /4242|dentist|Stretch/.test(l)), false)
eq('a failed send never throws or shows the address', await botSend(async () => { throw new TypeError(`error sending request for url (https://api.telegram.org/bot${TOKEN}/sendMessage)`) }, TOKEN, '1', 'x'),
  { status: 0, description: 'no answer' })

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nAll Telegram checks passed')

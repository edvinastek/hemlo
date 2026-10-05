// What each app can do on its own platform (PLAT-10, platform-rules.ts): the
// iPhone app leaves out what needs Android's own code, keeps what works there,
// and never asks the phone for more notifications than it keeps.
import {
  platformFrom, platformFeatures, remindersThatFit, dynamicTypeScale, textZoomRoute, statusBarStyle,
} from '../lib/platform-rules.ts'
import { describeView, switchesHere, VIEW_SWITCHES } from '../lib/module-view-rules.ts'
import { widgetPath } from '../lib/widget-rules.ts'
import { addLink, QUICK_ADD_DEFAULT } from '../lib/widget-quickadd-rules.ts'
import { readFileSync } from 'node:fs'

let fail = 0
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want)
  if (a !== b) fail++
  console.log(`${a === b ? 'ok  ' : 'FAIL'}  ${label}${a === b ? '' : `: got ${a}, expected ${b}`}`)
}

// ---------- which platform ---------------------------------------------------------
eq('Capacitor names: android, ios, anything else is the web', ['android', 'ios', 'web', 'electron', '', null, undefined].map(platformFrom),
  ['android', 'ios', 'web', 'web', 'web', 'web', 'web'])

// ---------- Android keeps everything it had ---------------------------------------
const android = platformFeatures('android')
eq('Android: widgets, icons, native text zoom, phone colours, Health Connect, shortcuts, links, scanner module, channels',
  [android.widgets, android.appIcons, android.nativeTextZoom, android.phoneColours, android.healthConnect, android.quickAddSync,
    android.openLinks, android.scannerModule, android.notificationChannels], Array(9).fill(true))
eq('Android: no notification limit, actions stay in the background, status bar as before', [android.pendingLimit, android.actionsOpenApp, android.themedStatusBar], [null, false, false])
eq('Android: Open Prices hears android', android.openPrices, 'android')

// ---------- the iPhone ------------------------------------------------------------
const ios = platformFeatures('ios')
eq('iPhone: no widgets, launcher icons, phone colours, Health Connect, shortcut sync, scanner module or channels',
  [ios.widgets, ios.appIcons, ios.phoneColours, ios.healthConnect, ios.quickAddSync, ios.scannerModule, ios.notificationChannels], Array(7).fill(false))
eq('iPhone: text size by CSS zoom, on top of Dynamic Type', [ios.nativeTextZoom, ios.phoneTextSize], [false, true])
eq('iPhone: links open (quick actions, auth links), 64 notifications at most, actions open the app, status bar follows the page',
  [ios.openLinks, ios.pendingLimit, ios.actionsOpenApp, ios.themedStatusBar], [true, 64, true, true])
eq('iPhone: Open Prices hears ios', ios.openPrices, 'ios')

// ---------- the web and Windows stay as they were -----------------------------------
const web = platformFeatures('web')
eq('web: nothing native', [web.widgets, web.appIcons, web.nativeTextZoom, web.phoneTextSize, web.openLinks, web.pendingLimit], [false, false, false, false, false, null])

// ---------- reminders within the iPhone's 64 ---------------------------------------
const at = (h) => ({ at: new Date(2026, 9, 5, h), h })
const many = Array.from({ length: 70 }, (_, i) => at(70 - i))
eq('no limit: the list as it is', remindersThatFit(many, null).length, 70)
eq('64: the soonest 64, soonest first', remindersThatFit(many, 64).map((d) => d.h).slice(0, 3), [1, 2, 3])
eq('64: exactly 64', remindersThatFit(many, 64).length, 64)
eq('64 with 3 kept (a snooze, a focus end): 61', remindersThatFit(many, 64, 3).length, 61)
eq('more kept than the limit: none, never negative', remindersThatFit(many, 64, 80).length, 0)
eq('the list handed in is not reordered', many[0].h, 70)

// ---------- Dynamic Type --------------------------------------------------------------
eq('Dynamic Type: Large (17 px) is 1, larger and smaller follow', [17, 19, 23, 14].map(dynamicTypeScale), [1, 1.12, 1.35, 0.82])
eq('Dynamic Type: the accessibility sizes stop at 2, tiny at 0.8', [53, 10].map(dynamicTypeScale), [2, 0.8])
eq('Dynamic Type: unreadable is 1', [null, undefined, NaN, 0, -3].map(dynamicTypeScale), [1, 1, 1, 1, 1])

// ---------- text size route -----------------------------------------------------------
eq('Android: the web view zooms its text, no page zoom', textZoomRoute(android, 115), { native: 115, css: null })
eq('iPhone: the page is zoomed', textZoomRoute(ios, 115), { native: null, css: 1.15 })
eq('iPhone at 100%: no zoom at all', textZoomRoute(ios, 100), { native: null, css: null })
eq('web: as before, 90% zooms the page', textZoomRoute(web, 90), { native: null, css: 0.9 })

eq('status bar: light text on a dark page, dark text on a light one', [statusBarStyle(true), statusBarStyle(false)], ['DARK', 'LIGHT'])

// ---------- the widget switch ---------------------------------------------------------
eq('with widgets: all five switches', switchesHere(true).map((s) => s.key), VIEW_SWITCHES.map((s) => s.key))
eq('iPhone: the widget switch left out', switchesHere(false).map((s) => s.key), ['today', 'plan', 'stats', 'reminders'])
const v = { today: true, plan: false, widget: true, stats: true, reminders: false }
eq('a module row names the widget where there is one', describeView(v), 'On Today and widget · in Stats')
eq('and not on the iPhone', describeView(v, false), 'On Today · in Stats')

// ---------- quick actions: the iPhone's Info.plist matches the + menu's defaults -----
const plist = readFileSync(new URL('../../ios/App/App/Info.plist', import.meta.url), 'utf8')
const keys = [...plist.matchAll(/<key>add<\/key>\s*<string>([^<]+)<\/string>/g)].map((m) => m[1])
eq('Info.plist quick actions are the + menu defaults, in order', keys, QUICK_ADD_DEFAULT.map((q) => q.key))
const titles = [...plist.matchAll(/<key>UIApplicationShortcutItemTitle<\/key>\s*<string>([^<]+)<\/string>/g)].map((m) => m[1])
eq('their titles are the short names', titles, QUICK_ADD_DEFAULT.map((q) => q.short))
eq('the link SceneDelegate.swift builds routes to the + menu entry', keys.map((k) => widgetPath(addLink(k))), keys.map((k) => `/?add=${k}`))
const scene = readFileSync(new URL('../../ios/App/App/SceneDelegate.swift', import.meta.url), 'utf8')
eq('SceneDelegate.swift builds app.visuma.planner://open/?add=…', ['parts.scheme = "app.visuma.planner"', 'parts.host = "open"', 'parts.path = "/"', 'URLQueryItem(name: "add"'].every((t) => scene.includes(t)), true)
eq('the auth links and quick actions share the scheme Info.plist registers', plist.includes('<string>app.visuma.planner</string>'), true)

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall platform checks passed')

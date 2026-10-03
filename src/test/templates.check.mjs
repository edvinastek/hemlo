// Checks the starting layouts, the keyword suggestion and the country list
// (the activity levels are in activity.check.mjs): every template is whole, typed words lead to the
// template a person would expect, and nothing is guessed from no words.
import { TEMPLATES, DEFAULT_TEMPLATE, templateByKey, suggestTemplate, modulesFor } from '../lib/templates.ts'
import { COUNTRIES, countryName, cleanCountry, cleanCity } from '../lib/countries.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

// The modules the registry knows; copied here so the check needs no React.
const MODULE_KEYS = ['nutrition', 'shopping', 'training', 'habits', 'supplements', 'health', 'learning', 'agenda',
  'sleep', 'projects', 'finance', 'household', 'stats', 'custom']
const NUTRIENTS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g']

// The templates themselves.
const keys = TEMPLATES.map((t) => t.key)
is('the seven asked for are there', ['minimal', 'student', 'office', 'shift', 'household', 'fitness', 'freelance'].every((k) => keys.includes(k)), true)
is('keys are unique', new Set(keys).size, keys.length)
is('the default is a real template', !!templateByKey(DEFAULT_TEMPLATE), true)
is('the default is the minimal planner', DEFAULT_TEMPLATE, 'minimal')
for (const t of TEMPLATES) {
  is(`${t.key}: has a name and a one-line description`, !!t.name && !!t.description && !t.description.includes('\n'), true)
  is(`${t.key}: only known modules`, t.modules.filter((m) => !MODULE_KEYS.includes(m)), [])
  is(`${t.key}: never switches Custom`, t.modules.includes('custom'), false)
  is(`${t.key}: only known nutrients, at least one`, t.nutrients.length > 0 && t.nutrients.every((n) => NUTRIENTS.includes(n)), true)
  is(`${t.key}: Today's figure is none or one it tracks`, t.today_metric === 'none' || t.nutrients.includes(t.today_metric), true)
  is(`${t.key}: a template about food shows a figure, one not about food shows none`,
    t.modules.includes('nutrition') && t.targets ? t.today_metric !== 'none' : t.today_metric === 'none', true)
  is(`${t.key}: body targets only where the body is tracked`, !t.targets || t.modules.includes('health'), true)
  is(`${t.key}: the agenda is always on, it is a planner`, t.modules.includes('agenda'), true)
}
is('only the body templates suggest targets', TEMPLATES.filter((t) => t.targets).map((t) => t.key), ['fitness', 'everything'])
is('modulesFor gives a copy, not the template itself', modulesFor('student') !== templateByKey('student').modules, true)
is('an unknown template falls back to the default modules', modulesFor('nope'), templateByKey('minimal').modules)

// Keyword suggestion.
const pick = (text) => suggestTemplate(text)?.key ?? null
is('nothing typed, nothing suggested', pick(''), null)
is('only spaces, nothing suggested', pick('   '), null)
is('words that match nothing', pick('purple elephant'), null)
is('student', pick('student, exams next month'), 'student')
is('uni as a whole word', pick('I go to uni'), 'student')
is('but not inside another word', pick('community garden'), null)
is('capitals and accents do not matter', pick('ÉTUDIANT? no — University'), 'student')
is('office', pick('office job 9 to 5'), 'office')
is('nine to five spelt 9-5', pick('9-5 in the city'), 'office')
is('night shifts beat plain "work"', pick('I work nights in a warehouse'), 'shift')
is('rota', pick('rotating rota'), 'shift')
is('parent', pick('mum of two, school run and chores'), 'household')
is('two words together: school run is household, not student', pick('school run'), 'household')
is('fitness', pick('gym 4x a week and I count macros'), 'fitness')
is('lose weight as a phrase', pick('want to lose weight'), 'fitness')
is('freelancer', pick('freelance designer with three clients'), 'freelance')
is('self-employed with or without the hyphen', [pick('self-employed'), pick('self employed')], ['freelance', 'freelance'])
is('two spellings of the same words count once', suggestTemplate('self-employed')?.score, 2)
is('minimal', pick('just a simple to do list'), 'minimal')
is('clear keywords outweigh leaning ones', pick('student who likes the gym a bit, exams, lectures'), 'student')
const s = suggestTemplate('Student, EXAMS')
is('says which words matched, as listed', s?.matched, ['student', 'exams'])
is('scores clear words at 2 each', s?.score, 4)
is('a tie goes to the template listed first', pick('calendar student'), 'minimal')

// Countries.
const codes = COUNTRIES.map((c) => c.code)
is('the whole ISO list (249)', COUNTRIES.length, 249)
is('codes are two capital letters', codes.every((c) => /^[A-Z]{2}$/.test(c)), true)
is('codes are unique', new Set(codes).size, codes.length)
is('names are unique', new Set(COUNTRIES.map((c) => c.name)).size, COUNTRIES.length)
is('the Netherlands and Lithuania', [countryName('NL'), countryName('lt')], ['Netherlands', 'Lithuania'])
is('the United Kingdom is GB', countryName('GB'), 'United Kingdom')
is('an unknown code is none', [countryName('XX'), countryName(null), countryName('')], [null, null, null])
is('stored codes are cleaned to capitals', cleanCountry(' nl '), 'NL')
is('a code not on the list is not stored', cleanCountry('UK'), null)
is('a city is trimmed and squeezed', cleanCity('  Den   Haag '), 'Den Haag')
is('an empty city is none', cleanCity('   '), null)
is('a city is cut to 80 characters', cleanCity('x'.repeat(100)).length, 80)

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)

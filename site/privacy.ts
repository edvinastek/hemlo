import { nav, el, esc } from './common'
import { POLICY_VERSION, privacySections } from '../src/legal/policy'
import { policyDate } from '../src/legal/notice-rules'

el(`${nav}
  <h1>Privacy policy</h1>
  <p class="sub">Last changed ${policyDate(POLICY_VERSION)}</p>
  ${privacySections().map((s) => `<h2>${esc(s.heading)}</h2>${s.body.map((p) => `<p>${esc(p)}</p>`).join('')}`).join('')}`)

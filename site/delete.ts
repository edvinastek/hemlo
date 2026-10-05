import { nav, el, esc } from './common'
import { supabase } from '../src/lib/supabase'
import { controller } from '../src/legal/policy'

/** Delete an account without the app — Google Play requires a way that does
 *  not depend on reinstalling it. Sign in, confirm with a typed word, and the
 *  same database function the app uses removes everything. */
el(`${nav}
  <h1>Delete your Visuma account</h1>
  <p class="sub">Also possible in the app: Settings → Data and account → Delete account.</p>
  <h2>What is deleted</h2>
  <p>Everything Visuma keeps for you, at once:</p>
  <ul>
    <li>your account and sign-in, your profiles and your settings, with your stats views and note templates;</li>
    <li>your plan: tasks, notes, goals, projects and milestones, routines, and the events in your own agenda;</li>
    <li>your health details: every weigh-in and target, meal plan and food log, training log and the exercises you added, and sleep;</li>
    <li>habits and supplements, and all their ticks;</li>
    <li>Finance: every amount, category, budget and planned payment;</li>
    <li>the modules you built, their records and the photos in them, and the books you keep;</li>
    <li>your foods, the products you scanned, and your recipes, including any you shared with everyone;</li>
    <li>your calendar links and the calendars you follow;</li>
    <li>a household only you are in, with its chores, stock list, shopping list and the prices you typed.</li>
  </ul>
  <p>It cannot be undone. The database keeps no backups today, so nothing remains; if daily backups are added, deleted data will stay in them for no more than seven days, and the privacy policy will say so first.</p>
  <h2>What stays with your household</h2>
  <p>If you share a household, it passes to another member, and what the household shares stays with them: the stock list, the shopping list, the prices typed for the household’s shops, and the household’s chores with the record of who did them, without your name. Your name in the household is removed. Their own data is not touched.</p>
  <p>Prices you chose to share with Open Prices are public there and stay until you remove them on prices.openfoodfacts.org.</p>
  <h2>Delete it</h2>
  <form id="f">
    <label>Email <input id="email" type="email" required autocomplete="email" /></label>
    <label>Password <input id="password" type="password" required autocomplete="current-password" /></label>
    <label><span>Type <b>delete</b> to confirm</span> <input id="word" autocomplete="off" required /></label>
    <button class="primary" id="go" type="submit">Delete my account for good</button>
    <p class="note" id="note" role="status"></p>
  </form>
  <h2>Cannot sign in?</h2>
  <p>Write from the address the account uses to ${controller.email ? `<a href="mailto:${esc(controller.email)}?subject=Delete%20my%20Visuma%20account">${esc(controller.email)}</a>` : 'the contact address on the Google Play listing'} with the subject "Delete my Visuma account". It is deleted within 30 days and you get a reply when it is done.</p>`)

const form = document.getElementById('f') as HTMLFormElement
const note = document.getElementById('note')!
const go = document.getElementById('go') as HTMLButtonElement
const val = (id: string) => (document.getElementById(id) as HTMLInputElement).value

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  note.className = 'note'
  if (val('word').trim().toLowerCase() !== 'delete') { note.textContent = 'Type the word delete to confirm.'; return }
  go.disabled = true; note.textContent = 'Deleting…'

  const { error: signInError } = await supabase.auth.signInWithPassword({ email: val('email'), password: val('password') })
  if (signInError) { go.disabled = false; note.textContent = 'That email and password did not match. Nothing was deleted.'; return }

  const { error } = await supabase.rpc('delete_my_account')
  await supabase.auth.signOut()
  if (error) { go.disabled = false; note.textContent = 'The account could not be deleted, and nothing was removed. Try again, or write to the address below.'; return }

  form.reset()
  note.className = 'note ok'
  note.textContent = 'Your account and everything in it has been deleted.'
})

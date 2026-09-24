import { nav, el, esc } from './common'
import { supabase } from '../src/lib/supabase'
import { controller } from '../src/legal/policy'

/** Delete an account without the app — Google Play requires a way that does
 *  not depend on reinstalling it. Sign in, confirm with a typed word, and the
 *  same database function the app uses removes everything. */
el(`${nav}
  <h1>Delete your GetIt account</h1>
  <p class="sub">Also possible in the app: More → Data → Delete account.</p>
  <h2>What is deleted</h2>
  <p>Your account and sign-in, your profiles, plan, tasks, notes and goals, every weigh-in, target, meal plan, food log and training log, your recipes, and your settings. It happens at once and cannot be undone. Nothing is kept, apart from the database's own backups, which are overwritten within seven days.</p>
  <p>If you share a household, it passes to the other member; their own data is not touched.</p>
  <h2>Delete it</h2>
  <form id="f">
    <label>Email <input id="email" type="email" required autocomplete="email" /></label>
    <label>Password <input id="password" type="password" required autocomplete="current-password" /></label>
    <label>Type <b>delete</b> to confirm <input id="word" autocomplete="off" required /></label>
    <button class="primary" id="go" type="submit">Delete my account for good</button>
    <p class="note" id="note" role="status"></p>
  </form>
  <h2>Cannot sign in?</h2>
  <p>Write from the address the account uses to ${controller.email ? `<a href="mailto:${esc(controller.email)}?subject=Delete%20my%20GetIt%20account">${esc(controller.email)}</a>` : 'the contact address on the Google Play listing'} with the subject "Delete my GetIt account". It is deleted within 30 days and you get a reply when it is done.</p>`)

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

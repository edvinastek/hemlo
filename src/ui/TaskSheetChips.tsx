import type { Chip, ReadingKind } from '../lib/quick-add-rules'
import { useApp } from '../lib/store'
import { useModuleColours } from '../lib/colours'
import { usePlanPrefs } from '../lib/plan-prefs'
import { sectionChoices } from '../lib/plan-view-rules'

const KIND_WORDS: Record<ReadingKind, string> = { day: 'day', time: 'time', length: 'length', repeat: 'repeat', section: 'section' }

/** What quick add read from a task's name (TSK-07), as chips under the
 *  field while it is typed: nothing is set without one showing. Tapping a
 *  chip takes that reading away, and its words stay in the name. */
export function QuickChips({ chips, onRemove }: { chips: Chip[]; onRemove: (kind: ReadingKind) => void }) {
  if (chips.length === 0) return null
  return (
    <div className="qa-chips" role="group" aria-label="Read from the name">
      {chips.map((c) => (
        <button key={c.kind} type="button" className="chip qa-chip" onClick={() => onRemove(c.kind)}
          aria-label={`${c.label}: read as the ${KIND_WORDS[c.kind]}. Tap to keep these words in the name`}>
          {c.label}<span className="qa-x" aria-hidden="true">×</span>
        </button>
      ))}
    </div>
  )
}

/** Quick add's switch (Settings → Planning) and the sections a #word can
 *  name: the same list the task sheet's Section offers. */
export function useQuickAdd(): { on: boolean; sections: string[] } {
  const profileId = useApp((s) => s.profile?.id ?? null)
  const prefs = usePlanPrefs(profileId)
  const colours = useModuleColours()
  return { on: prefs.quick_add, sections: sectionChoices(colours.enabled, prefs.own_sections, null) }
}

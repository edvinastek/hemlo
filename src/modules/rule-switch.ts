import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { OVERLAY_KEY, isBuiltinRuleOn } from './def-rules'

/** Whether a built-in module's rule is switched on for a profile: the
 *  registry's rule with the person's switch from Edit module laid over it.
 *  Every piece of code that carries out a built-in rule asks this first, so
 *  switching the rule off stops it. Read inside a live query, it follows
 *  the switch as soon as it is saved. */
export async function builtinRuleOn(profileId: string, moduleKey: string, ruleName: string): Promise<boolean> {
  const inst = await db.module_instance.where('profile_id').equals(profileId)
    .filter((m) => m.module_key === moduleKey).first()
  return isBuiltinRuleOn(moduleKey, ruleName, inst?.settings?.[OVERLAY_KEY])
}

/** The same, live, for a screen. On until it is known to be off. */
export function useBuiltinRuleOn(profileId: string | null | undefined, moduleKey: string, ruleName: string): boolean {
  return useLiveQuery(async () => (profileId ? builtinRuleOn(profileId, moduleKey, ruleName) : true),
    [profileId, moduleKey, ruleName], true)
}

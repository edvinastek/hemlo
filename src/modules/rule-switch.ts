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

/** Carry out the rules of built-in modules that keep things on the planner,
 *  after one of them is switched on or off (Edit module), so the planner
 *  matches at once rather than when the module's page is next opened:
 *  - training.session_task: a routine's planned sessions as tasks;
 *  - sleep.bedtime: the nightly bedtime block;
 *  - learning.study_task: a dated study block's task.
 *  Each only adds or removes what the rule decides; nothing the person
 *  changed on one day is undone. Loaded on demand, so the screens that only
 *  read a switch do not pull in the planners. */
export async function carryOutRules(profileId: string, moduleKey: string, today: string): Promise<void> {
  if (moduleKey === 'training') {
    const { carryOutSessionRule } = await import('../lib/training')
    await carryOutSessionRule(profileId, today)
  } else if (moduleKey === 'sleep') {
    const { carryOutBedtimeRule } = await import('../lib/sleep')
    await carryOutBedtimeRule(profileId, today)
  } else if (moduleKey === 'learning') {
    const { syncStudyTasks } = await import('../lib/learning')
    await syncStudyTasks(profileId)
  }
}

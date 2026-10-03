import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { readFoodAddress } from '../lib/hub-rules'
import { PageHead } from '../ui/PageHead'
import { ExportLink } from '../ui/ExportLink'
import { FoodDay } from '../sections/FoodDay'
import { RecipesTab, FoodsTab } from '../sections/FoodTabs'

const SECTIONS = ['Day', 'Recipes', 'Foods']

/** The Food page: the day's meals, recipes, and foods. Each tab is its own
 *  section (sections/FoodDay.tsx, sections/FoodTabs.tsx). Its address can
 *  open a recipe or a food (/food?recipe=<id>, /food?food=<id>: a note's
 *  "Open recipe", the Modules hub's search) or a tab (/food?tab=recipes). */
export function Food() {
  const [params, setParams] = useSearchParams()
  const address = readFoodAddress(params)
  const [date, setDate] = useState(new Date())
  const [section, setSection] = useState<string>(address.section)
  // The address can change while the page is open (Open recipe in a note
  // on this page): its tab comes forward.
  useEffect(() => { if (address.recipe || address.food) setSection(address.section) }, [address.recipe, address.food, address.section])
  const opened = useCallback(() => setParams({}, { replace: true }), [setParams])
  const day = format(date, 'yyyy-MM-dd')
  return (
    <div className="page">
      <div className="page-inner">
        <PageHead date={date} onPick={setDate} sections={SECTIONS} active={section} onSection={setSection} />
        {section === 'Day' && <FoodDay day={day} />}
        {section === 'Recipes' && <RecipesTab openId={address.recipe} onOpened={opened} />}
        {section === 'Foods' && <FoodsTab openId={address.food} onOpened={opened} />}
        <ExportLink source={section === 'Day' ? { dataset: 'm:nutrition:meal_plan_slot', range: { from: day, to: day, label: format(date, 'd MMM yyyy') } }
          : { dataset: section === 'Recipes' ? 'm:nutrition:recipe' : 'm:nutrition:food' }} />
      </div>
    </div>
  )
}

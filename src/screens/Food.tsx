import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { readFoodAddress } from '../lib/hub-rules'
import { PageHead } from '../ui/PageHead'
import { FoodDay } from '../sections/FoodDay'
import { RecipesTab, FoodsTab } from '../sections/FoodTabs'
import { FoodMenuSlot } from '../sections/FoodMenu'
import '../ui/food.css'

const SECTIONS = ['Day', 'Recipes', 'Foods']

/** The Food page: the day's meals, recipes, and foods. Each tab is its own
 *  section (sections/FoodDay.tsx, sections/FoodTabs.tsx), with its own round
 *  + and its own items in the page's one ⋮ (v17). Only the Day has a date:
 *  Recipes and Foods are not about a day, so they show no date or week. Its
 *  address can open a recipe or a food (/food?recipe=<id>, /food?food=<id>:
 *  a note's "Open recipe", the Modules hub's search) or a tab
 *  (/food?tab=recipes). */
export function Food() {
  const [params, setParams] = useSearchParams()
  const address = readFoodAddress(params)
  const [date, setDate] = useState(new Date())
  const [section, setSection] = useState<string>(address.section)
  // Where the tabs draw the page's ⋮ (sections/FoodMenu.tsx).
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  // The address can change while the page is open (Open recipe in a note
  // on this page): its tab comes forward.
  useEffect(() => { if (address.recipe || address.food) setSection(address.section) }, [address.recipe, address.food, address.section])
  const opened = useCallback(() => setParams({}, { replace: true }), [setParams])
  const day = format(date, 'yyyy-MM-dd')
  const onDay = section === 'Day'
  return (
    <div className="page">
      <div className="page-inner">
        <FoodMenuSlot value={slot}>
          <div className={`food-head${onDay ? ' has-day' : ''}`}>
            <PageHead date={date} onPick={setDate} sections={SECTIONS} active={section} onSection={setSection}
              heading={onDay ? undefined : 'Food'} strip={onDay} />
            <span className="food-menu" ref={setSlot} />
          </div>
          {section === 'Day' && <FoodDay day={day} />}
          {section === 'Recipes' && <RecipesTab openId={address.recipe} onOpened={opened} />}
          {section === 'Foods' && <FoodsTab openId={address.food} onOpened={opened} />}
        </FoodMenuSlot>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { format } from 'date-fns'
import { PageHead } from '../ui/PageHead'
import { ExportLink } from '../ui/ExportLink'
import { FoodDay } from '../sections/FoodDay'
import { RecipesTab, FoodsTab } from '../sections/FoodTabs'

const SECTIONS = ['Day', 'Recipes', 'Foods']

/** The Food page: the day's meals, recipes, and foods. Each tab is its own
 *  section (sections/FoodDay.tsx, sections/FoodTabs.tsx). */
export function Food() {
  const [date, setDate] = useState(new Date())
  const [section, setSection] = useState('Day')
  const day = format(date, 'yyyy-MM-dd')
  return (
    <div className="page">
      <div className="page-inner">
        <PageHead date={date} onPick={setDate} sections={SECTIONS} active={section} onSection={setSection} />
        {section === 'Day' && <FoodDay day={day} />}
        {section === 'Recipes' && <RecipesTab />}
        {section === 'Foods' && <FoodsTab />}
        <ExportLink source={section === 'Day' ? { dataset: 'm:nutrition:meal_plan_slot', range: { from: day, to: day, label: format(date, 'd MMM yyyy') } }
          : { dataset: section === 'Recipes' ? 'm:nutrition:recipe' : 'm:nutrition:food' }} />
      </div>
    </div>
  )
}

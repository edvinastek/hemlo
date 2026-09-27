import type { ModuleDef } from './types'

/** The catalogue. Eight modules run on their own tables and screens; the rest
 *  ship on the shared record store with a list, fields and reminders, which is
 *  the light default template the spec names. */
export const MODULES: ModuleDef[] = [
  {
    key: 'nutrition',
    name: 'Nutrition',
    keywords: ['food', 'meals', 'meal prep', 'diet', 'macros', 'calories', 'protein', 'recipes', 'cooking'],
    summary: 'Foods, recipes, a meal plan and macro targets.',
    depth: 'full',
    defaultOn: true,
    entities: [
      { name: 'food', label: 'Food', table: 'food', fields: [
        { name: 'name', label: 'Food', type: 'text', required: true, width: 220 },
        { name: 'kcal', label: 'kcal', type: 'number', unit: '/100 g', width: 70 },
        { name: 'protein_g', label: 'Protein', type: 'number', unit: 'g', width: 70 },
        { name: 'carbs_g', label: 'Carbs', type: 'number', unit: 'g', width: 70 },
        { name: 'fat_g', label: 'Fat', type: 'number', unit: 'g', width: 70 },
        { name: 'fiber_g', label: 'Fibre', type: 'number', unit: 'g', width: 70 },
        { name: 'state', label: 'State', type: 'select', options: ['raw','cooked','canned','dried','frozen'], width: 90 },
      ]},
      { name: 'recipe', label: 'Recipe', table: 'recipe', fields: [
        { name: 'name', label: 'Recipe', type: 'text', required: true, width: 240 },
        { name: 'role', label: 'Role', type: 'select', options: ['breakfast','lunch','dinner','snack','shake','main'], width: 110 },
        { name: 'portions_per_batch', label: 'Portions', type: 'number', width: 80 },
        { name: 'cook_minutes', label: 'Cook', type: 'duration', unit: 'min', width: 70 },
      ]},
      { name: 'meal_plan_slot', label: 'Meal', table: 'meal_plan_slot', fields: [
        { name: 'slot', label: 'Slot', type: 'text', width: 110 },
        { name: 'recipe_id', label: 'Recipe', type: 'lookup', lookup: 'recipe', width: 240 },
        { name: 'portion_multiplier', label: 'Portions', type: 'number', width: 80 },
      ]},
    ],
    views: [
      { key: 'day', name: 'Meal plan', type: 'list', entity: 'meal_plan_slot' },
      { key: 'recipes', name: 'Recipes', type: 'table', entity: 'recipe', columns: ['name','role','portions_per_batch','cook_minutes'] },
      { key: 'foods', name: 'Foods', type: 'table', entity: 'food', columns: ['name','kcal','protein_g','carbs_g','fat_g','fiber_g','state'] },
    ],
    rules: [
      { name: 'meal_tasks', sentence: 'Every planned meal becomes a task on the day it is eaten.', when: 'meal_plan_slot.created', then: 'task.create', locked: false },
      { name: 'skipped_meal', sentence: 'If a meal is skipped, ask for a new time.', when: 'meal_plan_slot.skipped', then: 'reminder.ask_new_time' },
      { name: 'size_main', sentence: 'Scale the rotating main meal so the day reaches its target.', when: 'day.planned', then: 'meal.scale_to_target' },
    ],
    skills: ['read meal plan', 'add or change a meal', 'read targets'],
  },
  {
    key: 'shopping',
    name: 'Shopping',
    keywords: ['shopping', 'groceries', 'supermarket', 'stock', 'pantry', 'cupboard'],
    summary: 'Trips by aisle, packs, stock and prices.',
    depth: 'full',
    defaultOn: true,
    entities: [
      { name: 'shopping_trip', label: 'Trip', table: 'shopping_trip', fields: [
        { name: 'trip_date', label: 'Date', type: 'date', width: 120 },
        { name: 'store_id', label: 'Store', type: 'lookup', width: 160 },
        { name: 'status', label: 'Status', type: 'select', options: ['planned','shopping','done','skipped'], width: 110 },
      ]},
      { name: 'shopping_item', label: 'Item', table: 'shopping_item', fields: [
        { name: 'food_id', label: 'Food', type: 'lookup', lookup: 'food', width: 240 },
        { name: 'needed_g', label: 'Needed', type: 'number', unit: 'g', width: 90 },
        { name: 'from_stock_g', label: 'In stock', type: 'number', unit: 'g', width: 90 },
        { name: 'packs_to_buy', label: 'Packs', type: 'formula', formula: 'ceil((needed_g - from_stock_g) / pack_size_g)', width: 80 },
        { name: 'checked', label: 'Got it', type: 'boolean', width: 70 },
      ]},
    ],
    views: [
      { key: 'trip', name: 'Trip', type: 'list', entity: 'shopping_item' },
      { key: 'stock', name: 'Stock', type: 'table', entity: 'stock', columns: ['food_id','grams_on_hand'] },
    ],
    rules: [
      { name: 'from_plan', sentence: 'Each trip buys what the plan needs up to the next trip, less what is in stock.', when: 'trip.planned', then: 'shopping.fill_from_plan' },
      { name: 'trip_days', sentence: 'Shopping happens on the chosen days and those tasks are locked.', when: 'week.planned', then: 'task.create_locked', locked: true },
    ],
    skills: ['read the trip', 'tick items', 'read stock'],
  },
  {
    key: 'training',
    name: 'Training',
    summary: 'Sessions, exercises, a log and phases.',
    depth: 'full',
    defaultOn: true,
    keywords: ['gym', 'training', 'workout', 'workouts', 'lifting', 'sets', 'reps', 'exercise', 'strength'],
    // The session log. Planned sessions and the exercise catalogue live on the
    // server; the log is what the page reads and writes.
    entities: [
      { name: 'workout_log', label: 'Set', table: 'workout_log', fields: [
        { name: 'log_date', label: 'Day', type: 'date', required: true, width: 120 },
        { name: 'exercise_id', label: 'Exercise', type: 'lookup', lookup: 'exercise', width: 220 },
        { name: 'set_number', label: 'Set', type: 'integer', width: 60 },
        { name: 'reps_achieved', label: 'Reps', type: 'integer', width: 70 },
        { name: 'load_kg', label: 'Load', type: 'number', unit: 'kg', width: 80 },
        { name: 'seconds', label: 'Time', type: 'integer', unit: 's', width: 70 },
        { name: 'note', label: 'Note', type: 'text', width: 200 },
      ]},
    ],
    views: [
      { key: 'sessions', name: 'Sessions', type: 'list', entity: 'workout_log' },
      { key: 'log', name: 'Log', type: 'table', entity: 'workout_log', columns: ['log_date','exercise_id','set_number','reps_achieved','load_kg'] },
      { key: 'month', name: 'Month', type: 'calendar', entity: 'workout_log', dateField: 'log_date' },
    ],
    rules: [
      { name: 'session_task', sentence: 'A planned session becomes a task at its time.', when: 'workout.planned', then: 'task.create' },
    ],
    skills: ['read the week', 'log a set'],
  },
  {
    key: 'habits',
    name: 'Habits',
    keywords: ['habit', 'habits', 'streak', 'routine', 'daily'],
    summary: 'A habit grid and streaks.',
    depth: 'full',
    defaultOn: true,
    entities: [
      { name: 'habit', label: 'Habit', table: 'habit', fields: [
        { name: 'name', label: 'Habit', type: 'text', required: true, width: 220 },
        { name: 'schedule', label: 'Schedule', type: 'select', options: ['daily','weekdays','weekly'], width: 120 },
      ]},
    ],
    views: [{ key: 'grid', name: 'Grid', type: 'grid', entity: 'habit' }],
    rules: [{ name: 'daily', sentence: 'A daily habit appears on every day until it is turned off.', when: 'day.planned', then: 'task.create' }],
    skills: ['tick a habit', 'read streaks'],
  },
  {
    key: 'supplements',
    name: 'Supplements',
    keywords: ['supplements', 'vitamins', 'pills', 'creatine'],
    summary: 'A checklist by time slot.',
    depth: 'full',
    defaultOn: true,
    entities: [
      { name: 'supplement', label: 'Supplement', table: 'supplement', fields: [
        { name: 'name', label: 'Item', type: 'text', required: true, width: 200 },
        { name: 'dose_text', label: 'Dose', type: 'text', width: 140 },
        { name: 'time_slot', label: 'When', type: 'select', options: ['morning','midday','evening'], width: 110 },
      ]},
    ],
    views: [{ key: 'today', name: 'Today', type: 'list', entity: 'supplement' }],
    rules: [{ name: 'slot_task', sentence: 'Each slot becomes one task with all of its items.', when: 'day.planned', then: 'task.create' }],
    skills: ['tick a supplement'],
  },
  {
    key: 'health',
    name: 'Health and body',
    keywords: ['weight', 'weigh-in', 'waist', 'body', 'health', 'fat loss', 'lose weight'],
    summary: 'Weight and waist log, and the calorie budget they drive.',
    depth: 'full',
    defaultOn: true,
    entities: [
      { name: 'body_log', label: 'Weigh-in', table: 'body_log', fields: [
        { name: 'log_date', label: 'Date', type: 'date', width: 120 },
        { name: 'weight_kg', label: 'Weight', type: 'number', unit: 'kg', width: 100 },
        { name: 'waist_cm', label: 'Waist', type: 'number', unit: 'cm', width: 100 },
      ]},
    ],
    views: [{ key: 'log', name: 'Weight', type: 'table', entity: 'body_log', columns: ['log_date','weight_kg','waist_cm'] }],
    rules: [
      { name: 'retarget', sentence: 'When the weight changes, recalculate the targets from it.', when: 'body_log.created', then: 'target.recalculate' },
    ],
    skills: ['read the weight trend', 'add a weigh-in'],
  },
  {
    key: 'learning',
    name: 'Learning and reading',
    summary: 'Study blocks, a reading log and progress.',
    depth: 'full',
    defaultOn: true,
    keywords: ['study', 'studying', 'reading', 'books', 'course', 'learn', 'learning', 'exam', 'language'],
    entities: [
      { name: 'study', label: 'Block', fields: [
        { name: 'subject', label: 'Subject', type: 'text', required: true, width: 200 },
        { name: 'block_date', label: 'Day', type: 'date', width: 120 },
        { name: 'minutes', label: 'Length', type: 'duration', unit: 'min', width: 90, stats: 'sum' },
        { name: 'source', label: 'Book or course', type: 'text', width: 220 },
      ]},
    ],
    views: [
      { key: 'blocks', name: 'Blocks', type: 'table', entity: 'study', columns: ['subject','block_date','minutes','source'] },
      { key: 'month', name: 'Month', type: 'calendar', entity: 'study', dateField: 'block_date' },
    ],
    rules: [{ name: 'soft', sentence: 'Learning moves when the day is full, unless it is locked.', when: 'day.full', then: 'task.move' }],
    skills: ['read progress', 'log a block'],
  },
  {
    key: 'agenda',
    name: 'Agenda',
    summary: 'Month, week and year calendar.',
    depth: 'full',
    defaultOn: true,
    keywords: ['calendar', 'agenda', 'appointments', 'events', 'meetings', 'schedule'],
    entities: [
      { name: 'calendar_event', label: 'Event', table: 'calendar_event', fields: [
        { name: 'title', label: 'Event', type: 'text', required: true, width: 240 },
        { name: 'starts_at', label: 'Start', type: 'datetime', required: true, width: 160 },
        { name: 'ends_at', label: 'End', type: 'datetime', width: 160 },
        { name: 'all_day', label: 'All day', type: 'boolean', width: 80 },
        { name: 'location', label: 'Where', type: 'text', width: 180 },
      ]},
    ],
    views: [
      { key: 'month', name: 'Month', type: 'calendar', entity: 'calendar_event', dateField: 'starts_at' },
      { key: 'list', name: 'List', type: 'list', entity: 'calendar_event' },
    ],
    rules: [{ name: 'no_overlap', sentence: 'Nothing is scheduled across an all-day event.', when: 'day.planned', then: 'planner.block' }],
    skills: ['read the calendar'],
  },
  {
    key: 'sleep',
    name: 'Sleep',
    summary: 'A sleep log against a target.',
    depth: 'light',
    keywords: ['sleep', 'bedtime', 'tired', 'rest', 'nights', 'insomnia'],
    entities: [
      { name: 'sleep_log', label: 'Night', table: 'sleep_log', fields: [
        { name: 'log_date', label: 'Date', type: 'date', required: true, width: 120 },
        { name: 'went_to_bed', label: 'To bed', type: 'time', width: 90 },
        { name: 'woke_at', label: 'Woke', type: 'time', width: 90 },
        { name: 'hours', label: 'Hours', type: 'formula', formula: 'hours_between(went_to_bed, woke_at)', width: 80 },
        { name: 'quality', label: 'Quality', type: 'integer', width: 80 },
      ]},
    ],
    views: [
      { key: 'log', name: 'Nights', type: 'table', entity: 'sleep_log', columns: ['log_date','went_to_bed','woke_at','hours','quality'] },
      { key: 'month', name: 'Month', type: 'calendar', entity: 'sleep_log', dateField: 'log_date' },
    ],
    rules: [{ name: 'bedtime', sentence: 'Bedtime is locked and nothing is scheduled across it.', when: 'day.planned', then: 'planner.block', locked: true }],
  },
  {
    key: 'projects',
    name: 'Projects',
    keywords: ['projects', 'project', 'milestones', 'deadlines', 'clients'],
    summary: 'Projects, tasks and milestones.',
    depth: 'light',
    entities: [
      { name: 'project', label: 'Project', fields: [
        { name: 'name', label: 'Project', type: 'text', required: true, width: 240 },
        { name: 'status', label: 'Status', type: 'select', options: ['active','paused','done'], width: 110 },
        { name: 'due_date', label: 'Due', type: 'date', width: 120 },
      ]},
    ],
    views: [
      { key: 'list', name: 'Projects', type: 'table', entity: 'project', columns: ['name','status','due_date'] },
      { key: 'cards', name: 'Cards', type: 'list', entity: 'project' },
    ],
    rules: [{ name: 'to_goal', sentence: 'A project with a date becomes a goal on the year view.', when: 'project.created', then: 'goal.create' }],
  },
  {
    key: 'finance',
    name: 'Finance',
    keywords: ['money', 'budget', 'spending', 'expenses', 'finance', 'bills', 'savings'],
    summary: 'A budget and what was spent against it.',
    depth: 'light',
    entities: [
      { name: 'entry', label: 'Entry', fields: [
        { name: 'entry_date', label: 'Date', type: 'date', width: 120 },
        { name: 'category', label: 'Category', type: 'text', width: 160 },
        { name: 'amount', label: 'Amount', type: 'number', width: 110, stats: 'sum' },
        { name: 'note', label: 'Note', type: 'text', width: 240 },
      ]},
    ],
    views: [
      { key: 'list', name: 'Entries', type: 'table', entity: 'entry', columns: ['entry_date','category','amount','note'] },
      { key: 'month', name: 'Month', type: 'calendar', entity: 'entry', dateField: 'entry_date' },
    ],
    rules: [],
  },
  {
    key: 'household',
    name: 'Household',
    keywords: ['household', 'chores', 'cleaning', 'family', 'home', 'laundry'],
    summary: 'Shared lists, chores and shared meals.',
    depth: 'light',
    entities: [
      { name: 'chore', label: 'Chore', fields: [
        { name: 'name', label: 'Chore', type: 'text', required: true, width: 220 },
        { name: 'schedule', label: 'Schedule', type: 'select', options: ['daily','weekly','monthly'], width: 120 },
        { name: 'who', label: 'Who', type: 'text', width: 140 },
      ]},
    ],
    views: [{ key: 'list', name: 'Chores', type: 'table', entity: 'chore', columns: ['name','schedule','who'] }],
    rules: [{ name: 'shared', sentence: 'A household chore appears for everyone in the household.', when: 'chore.created', then: 'task.create' }],
  },
  {
    key: 'custom',
    name: 'Custom',
    summary: 'Anything you build yourself.',
    depth: 'light',
    entities: [],
    views: [],
    rules: [],
  },
]

export const moduleByKey = new Map(MODULES.map((m) => [m.key, m]))

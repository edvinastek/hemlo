/** Reads the workbooks GetIt grew out of: D_Food, D_Exercises and D_Meals.
 *  Loaded only when someone actually imports a file, so the app's first paint
 *  never carries a spreadsheet parser it may not need. */

export interface ImportPreview {
  foods: { name: string; kcal: number | null; carbs_g: number | null; fiber_g: number | null; fat_g: number | null; protein_g: number | null }[]
  exercises: { name: string }[]
  recipes: { name: string; kcal: number | null; protein_g: number | null; ingredients: string }[]
  sheets: string[]
  skipped: number
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export async function readWorkbook(file: File): Promise<ImportPreview> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const preview: ImportPreview = { foods: [], exercises: [], recipes: [], sheets: wb.SheetNames, skipped: 0 }
  const seen = { food: new Set<string>(), ex: new Set<string>() }

  const rowsOf = (name: string): unknown[][] => {
    const sheet = wb.Sheets[name]
    return sheet ? (XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][]) : []
  }

  for (const row of rowsOf('D_Food').slice(1)) {
    const name = String(row[1] ?? '').trim()
    if (!name || seen.food.has(name.toLowerCase())) { if (name) preview.skipped++; continue }
    seen.food.add(name.toLowerCase())
    preview.foods.push({
      name, kcal: num(row[2]), carbs_g: num(row[3]), fiber_g: num(row[4]),
      fat_g: num(row[5]), protein_g: num(row[6]),
    })
  }

  for (const row of rowsOf('D_Exercises').slice(1)) {
    const name = String(row[1] ?? '').trim()
    if (!name || seen.ex.has(name.toLowerCase())) { if (name) preview.skipped++; continue }
    seen.ex.add(name.toLowerCase())
    preview.exercises.push({ name })
  }

  for (const row of rowsOf('D_Meals').slice(1)) {
    const name = String(row[1] ?? '').trim()
    if (!name) continue
    preview.recipes.push({ name, kcal: num(row[2]), protein_g: num(row[6]), ingredients: String(row[7] ?? '') })
  }

  return preview
}

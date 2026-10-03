import { NEVO_ATTRIBUTION, PORTIE_ATTRIBUTION } from '../lib/eu-label-rules'
import './food.css'

/** Where the shared food figures come from, in the words their sources ask
 *  for (NEVO's conditions of use, Portie-online's, Open Food Facts' ODbL).
 *  v17 (CALM-13): these sit in Settings → About and on a food's own page,
 *  where its figures are shown in full, and no longer under the Foods list.
 *  Plain lines, for whatever list or panel holds them. */
export function FoodDataCredits({ className }: { className?: string }) {
  return (
    <ul className={className ?? 'food-credits'} aria-label="Food data">
      <li>Shared foods: {NEVO_ATTRIBUTION}.</li>
      <li>{PORTIE_ATTRIBUTION}.</li>
      <li>
        Products: <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">Open Food Facts</a>, under the
        Open Database Licence (ODbL).
      </li>
      <li>A few shared foods are kept from a USDA list.</li>
    </ul>
  )
}

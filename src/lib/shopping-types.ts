import type { UUID } from './types'

/** A price the household noted for something at one of its shops (028).
 *  One live row per item per shop: noting a new price replaces it. */
export interface ShopPrice {
  id: UUID
  household_id: UUID
  /** The shop's name, as the person keeps it in Stores. */
  shop: string
  /** The food's id, or 'name:' and the item's name in lower case. */
  item_key: string
  food_id: UUID | null
  name: string | null
  /** In the person's currency. */
  price: number
  /** What the price is for in grams (or millilitres); none means one of it. */
  amount_g: number | null
  /** The day it was seen, 'yyyy-MM-dd'. */
  noted_on: string
  added_by: UUID | null
  created_at?: string
  updated_at: string
  deleted_at: string | null
}

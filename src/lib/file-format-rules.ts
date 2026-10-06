/** The tags inside the files people keep: backups, dataset exports, module
 *  designs and recipe files. Files are written with the name Hemlo; files
 *  made before version 21, when the app was called GetIt, say getit, and
 *  people may hold them for years, so both are read. */

export const BUNDLE_FORMAT = 'hemlo.bundle'
export const DATASET_FORMAT = 'hemlo.dataset'
export const MODULE_FORMAT = 'hemlo.module'
export const RECIPES_FORMAT = 'hemlo-recipes'

/** The tag each format had before the name Hemlo. */
export const OLD_FORMATS: Record<string, string> = {
  [BUNDLE_FORMAT]: 'getit.bundle',
  [DATASET_FORMAT]: 'getit.dataset',
  [MODULE_FORMAT]: 'getit.module',
  [RECIPES_FORMAT]: 'getit-recipes',
}

/** Whether a file's format tag is this format, under its new or old name. */
export function isFormat(tag: unknown, format: string): boolean {
  return typeof tag === 'string' && (tag === format || tag === OLD_FORMATS[format])
}

/** A module's own page, reached from the page bar as /m/<module key>.
 *  Placeholder until the generic module pages land (batch 2). */
export function ModulePage({ moduleKey }: { moduleKey: string }) {
  return (
    <div className="page">
      <div className="page-inner">
        <p className="empty">This module's page is on its way ({moduleKey}).</p>
      </div>
    </div>
  )
}

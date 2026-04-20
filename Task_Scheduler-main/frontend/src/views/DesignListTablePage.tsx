// @ts-nocheck
import { DesignListShell } from './DesignListShell'
import { TableRow, TABLE_COLUMN_CLASSES } from '../components/TableRow'

const COLS = [
  'OP No',
  'Project No',
  'Design Type',
  'Business Unit',
  'Name',
  'Status',
  'Sales Person',
  'Created',
  'Deadline',
  'Aging',
  'Actions',
]

const TABLE_GRID =
  'grid-cols-[minmax(80px,1fr)_minmax(130px,1fr)_minmax(80px,1fr)_minmax(100px,1fr)_minmax(120px,1fr)_minmax(80px,1fr)_minmax(90px,1fr)_minmax(75px,1fr)_minmax(75px,1fr)_minmax(65px,1fr)_minmax(120px,1fr)]'

const HEADER_CELL = 'px-2 truncate'

export function DesignListTablePage() {
  return (
    <DesignListShell>
      {(rows) => (
        <div className="w-full h-full">
          <div className="h-full overflow-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="w-full min-w-[800px]">
              <div className="sticky top-0 z-10 bg-white px-4 pt-4 pb-2">
                <div className="w-full rounded-xl bg-slate-100 px-0 py-2 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
                  <div className={`grid ${TABLE_GRID} items-center`}>
                    {COLS.map((c, idx) => (
                      <div
                        key={c}
                        className={`${HEADER_CELL} ${TABLE_COLUMN_CLASSES[idx] ?? 'text-left'} px-2`}
                      >
                        {c}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-0 pb-2">
                {rows.map((r) => (
                  <TableRow key={r.id} row={r} gridClass={TABLE_GRID} />
                ))}
                {rows.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-slate-600">
                    No records found.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </DesignListShell>
  )
}


export function Table({ headers, rows }) {
  return (
    <div className="ui-surface overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="ui-table-header">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-2.5 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-4 py-6 text-center text-slate-500">
                No records found
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index} className="border-t border-slate-200">
                {row.map((cell, cellIndex) => (
                  <td key={`${index}-${cellIndex}`} className="px-4 py-2.5 text-slate-700">
                    {cell ?? '-'}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

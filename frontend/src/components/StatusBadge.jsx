// @ts-nocheck
const MAP = {
    WIP: {
        cls: 'bg-blue-100 text-blue-700 ring-blue-200',
        dot: 'bg-blue-500',
    },
    Completed: {
        cls: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
        dot: 'bg-emerald-500',
    },
    Pending: {
        cls: 'bg-yellow-100 text-yellow-800 ring-yellow-200',
        dot: 'bg-yellow-500',
    },
    Revision: {
        cls: 'bg-orange-100 text-orange-700 ring-orange-200',
        dot: 'bg-orange-500',
    },
    Approved: {
        cls: 'bg-purple-100 text-purple-700 ring-purple-200',
        dot: 'bg-purple-500',
    },
};
export function StatusBadge({ status }) {
    const s = MAP[status] ?? {
        cls: 'bg-slate-50 text-slate-700 ring-slate-200',
        dot: 'bg-slate-400',
    };
    return (<span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold ring-1 ring-inset ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`}/>
      {status}
    </span>);
}

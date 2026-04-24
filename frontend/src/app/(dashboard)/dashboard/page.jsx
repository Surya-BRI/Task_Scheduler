export default function DashboardPage() {
    return (<section className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Projects</p>
          <p className="text-3xl font-semibold text-slate-900">0</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Tasks</p>
          <p className="text-3xl font-semibold text-slate-900">0</p>
        </div>
      </div>
    </section>);
}

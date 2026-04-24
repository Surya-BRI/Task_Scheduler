import { TaskList } from '@/features/tasks/components/task-list';
export default function TasksPage() {
    return (<section className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Tasks</h1>
      <TaskList />
    </section>);
}

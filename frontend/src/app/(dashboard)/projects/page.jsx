import { ProjectList } from '@/features/projects/components/project-list';

export default function ProjectsPage() {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
        <button className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">
          Create Project
        </button>
      </div>
      <ProjectList />
    </section>
  );
}

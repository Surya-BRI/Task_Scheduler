import { redirect } from 'next/navigation';

export default async function LegacyDesignListRecordRedirect({ params, searchParams }) {
  const { taskId } = await params;
  const query = await searchParams;
  const qs = new URLSearchParams(
    Object.fromEntries(
      Object.entries(query ?? {}).filter(([, v]) => v != null && v !== ''),
    ),
  ).toString();
  const suffix = qs ? `?${qs}` : '';
  redirect(`/task-summary/${encodeURIComponent(String(taskId))}${suffix}`);
}

import { Table } from '@/components/ui/table';

const taskHeaders = ['Task', 'Project', 'Status', 'Assignee'];
const taskRows = [];

export function TaskList() {
  return <Table headers={taskHeaders} rows={taskRows} />;
}

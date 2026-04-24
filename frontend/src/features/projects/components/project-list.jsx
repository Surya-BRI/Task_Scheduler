import { Table } from '@/components/ui/table';
const projectHeaders = ['Project', 'Description', 'Status'];
const projectRows = [];
export function ProjectList() {
    return <Table headers={projectHeaders} rows={projectRows}/>;
}

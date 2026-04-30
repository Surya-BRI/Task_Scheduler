import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { PageContainer } from '@/components/layout/page-container';

export default function DashboardLayout({ children }) {
  return (
    <div className="app-shell flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <PageContainer>{children}</PageContainer>
      </div>
    </div>
  );
}

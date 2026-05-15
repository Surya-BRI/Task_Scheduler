import LeavePlannerClient from "./LeavePlannerClient";
import { getDesigner } from "@/lib/designers.server";

export default async function LeavePlannerPage({ params }) {
  const { designerId } = await params;
  const designer = getDesigner(designerId);

  if (!designer) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div>Designer Not Found</div>
      </div>
    );
  }

  return <LeavePlannerClient designer={designer} />;
}

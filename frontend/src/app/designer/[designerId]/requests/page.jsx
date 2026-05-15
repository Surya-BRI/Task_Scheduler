import RequestsClient from "./RequestsClient";
import { getDesigner } from "@/lib/designers.server";

export default async function RequestsPage({ params }) {
  const { designerId } = await params;
  const designer = getDesigner(designerId);

  if (!designer) {
    return <div>Designer not found.</div>;
  }

  return <RequestsClient designer={designer} />;
}

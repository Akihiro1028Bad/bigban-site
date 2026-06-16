import { ApproveClient } from "./ApproveClient";

interface PageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

export default async function ApprovePage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  return <ApproveClient token={value} />;
}

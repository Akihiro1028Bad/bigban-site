import "./theme/approveTheme.css";
import { ApproveClient } from "./ApproveClient";
import { ApproveProviders } from "./providers";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "記事承認コンソール",
};

export default function ApprovePage() {
  return (
    <ApproveProviders>
      <ApproveClient />
    </ApproveProviders>
  );
}

import "./theme/approveTheme.css";
import { ApproveClient } from "./ApproveClient";
import { ApproveProviders } from "./providers";

import type { Metadata } from "next";

/** axe document-title(serious) 対応: 管理コンソールのページタイトル。 */
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

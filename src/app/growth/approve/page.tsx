import "./theme/approveTheme.css";
import { ApproveClient } from "./ApproveClient";
import { ApproveProviders } from "./providers";

export default function ApprovePage() {
  return (
    <ApproveProviders>
      <ApproveClient />
    </ApproveProviders>
  );
}

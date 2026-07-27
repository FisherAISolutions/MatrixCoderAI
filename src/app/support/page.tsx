import { PolicyPage, PolicySection } from '@/components/legal/PolicyPage';

export default function SupportPage() {
  return (
    <PolicyPage
      title="Private Beta Support"
      summary="Use the operator-provided beta invitation channel to report a problem. Include the operation ID when one is shown, but never include passwords, API keys, or provider tokens."
    >
      <PolicySection title="Useful report details">
        <p>Include the project name, approximate time, current milestone, visible error, operation ID, browser version, and whether retry or refresh changed the result.</p>
      </PolicySection>
      <PolicySection title="Urgent privacy or security concerns">
        <p>Stop the affected operation, rotate any exposed credential, and contact the private-beta operator through the invitation channel immediately.</p>
      </PolicySection>
    </PolicyPage>
  );
}

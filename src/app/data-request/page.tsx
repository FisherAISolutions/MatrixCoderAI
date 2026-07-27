import { PolicyPage, PolicySection } from '@/components/legal/PolicyPage';

export default function DataRequestPage() {
  return (
    <PolicyPage
      title="Data Request Instructions"
      summary="Private-beta process placeholder. A verified support workflow and jurisdiction-specific review are required before public launch."
    >
      <PolicySection title="Request access or deletion">
        <p>Contact the private-beta operator from the email address attached to your Matrix account. State whether you are requesting access, correction, export, or deletion.</p>
      </PolicySection>
      <PolicySection title="Identity verification">
        <p>Matrix operators must verify account ownership before acting. Do not send passwords, recovery codes, API keys, or provider tokens.</p>
      </PolicySection>
    </PolicyPage>
  );
}

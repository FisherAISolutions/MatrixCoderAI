import { PolicyPage, PolicySection } from '@/components/legal/PolicyPage';

export default function AcceptableUsePage() {
  return (
    <PolicyPage
      title="Acceptable Use Policy"
      summary="Private-beta policy placeholder requiring professional review before public launch."
    >
      <PolicySection title="Prohibited use">
        <p>Do not use Matrix to harm people, compromise systems, distribute malware, violate privacy or intellectual-property rights, evade safeguards, or conduct unlawful activity.</p>
      </PolicySection>
      <PolicySection title="Resource protection">
        <p>Do not bypass account, provider, billing, benchmark, deployment, or usage limits. Operators may pause risky features while preserving existing project data.</p>
      </PolicySection>
    </PolicyPage>
  );
}

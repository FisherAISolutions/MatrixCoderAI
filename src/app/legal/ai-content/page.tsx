import { PolicyPage, PolicySection } from '@/components/legal/PolicyPage';

export default function AiContentPage() {
  return (
    <PolicyPage
      title="AI-Generated Content Disclosure"
      summary="Matrix uses AI systems to propose architecture, code, repairs, and explanations. This disclosure is a private-beta draft requiring professional review."
    >
      <PolicySection title="Human review remains necessary">
        <p>AI output may be incomplete, insecure, inaccurate, or unsuitable. Matrix validation improves confidence but does not replace security, legal, accessibility, or domain review.</p>
      </PolicySection>
      <PolicySection title="Third-party providers">
        <p>Approved project context may be sent to configured AI providers to perform requested work. Secrets are not intended to be included and should never be placed in prompts or generated files.</p>
      </PolicySection>
    </PolicyPage>
  );
}

import { PolicyPage, PolicySection } from '@/components/legal/PolicyPage';

export default function TermsPage() {
  return (
    <PolicyPage
      title="Terms of Service"
      summary="Implementation-ready private-beta terms placeholder. This text is not legal advice and must be reviewed by qualified counsel before public launch."
    >
      <PolicySection title="Private-beta service">
        <p>Matrix Coder AI is currently an experimental private-beta software engineering service. Features, limits, and availability may change during evaluation.</p>
      </PolicySection>
      <PolicySection title="Your responsibilities">
        <p>You remain responsible for reviewing generated software, protecting credentials, respecting third-party rights, and validating a project before production use.</p>
      </PolicySection>
      <PolicySection title="No unreviewed guarantees">
        <p>No draft policy on this site promises uninterrupted availability, legal compliance, fitness for a particular purpose, or error-free generated code.</p>
      </PolicySection>
    </PolicyPage>
  );
}

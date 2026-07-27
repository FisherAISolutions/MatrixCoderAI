import Link from 'next/link';
import { PolicyPage, PolicySection } from '@/components/legal/PolicyPage';

export default function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy Policy"
      summary="Private-beta privacy placeholder based on the current implementation. Professional privacy review is required before public launch."
    >
      <PolicySection title="Data currently used">
        <p>Matrix uses account information, project snapshots, build state, usage records, and operational diagnostics needed to provide and protect the service.</p>
      </PolicySection>
      <PolicySection title="Browser storage and cookies">
        <p>Supabase authentication and Matrix recovery features may use essential browser storage. No marketing analytics or advertising cookie system is currently represented by this disclosure; update it before enabling either.</p>
      </PolicySection>
      <PolicySection title="Requests and deletion">
        <p>Private-beta users can review the current <Link href="/data-request" className="text-matrix-green underline">data request instructions</Link>. Operators must verify identity before exporting or deleting account data.</p>
      </PolicySection>
    </PolicyPage>
  );
}

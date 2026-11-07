// src/pages/TextsScriptsPage.jsx
// Texts & Scripts: every script producers say and every text that goes out (getting
// the link out, after a quote, after they buy, partners), in one place. The owner edits
// the wording here with the copy editor; senders use whatever is saved.
import { T } from '../components/SiteCopy';
import PageSpinner from '../components/PageSpinner';
import { useCurrentAgency } from '../hooks/useAgencyLeads';
import TextsTab from './components/rate-checks/TextsTab';

export default function TextsScriptsPage() {
  const { data: agency, isLoading } = useCurrentAgency();
  if (isLoading) return <PageSpinner />;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="mb-4 text-2xl font-bold" style={{ color: 'var(--qs-bright)' }}><T k="pages.textsscripts.title">Texts & Scripts</T></h1>
      <TextsTab agencyId={agency?.agency_id} />
    </div>
  );
}

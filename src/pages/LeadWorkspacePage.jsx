// The lead record is the sales workspace. A lead with uploaded policies opens the Rate
// Check workspace for its household; any other lead (a winback, a call-in) opens the same
// steps without an upload. The old lead page is hidden at /agency/leads/:id/details.
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { T } from '../components/SiteCopy';
import PageSpinner from '../components/PageSpinner';
import { useCurrentAgency, useLeadDetail } from '../hooks/useAgencyLeads';
import { useRateChecks } from '../hooks/useRateChecks';
import { RateCheckDrawer } from './RateChecksPage';
import LeadWorkspace from './components/sales/LeadWorkspace';

export default function LeadWorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: agency, isLoading: agencyLoading } = useCurrentAgency();
  const agencyId = agency?.agency_id;
  const { data: lead, isLoading: leadLoading, error } = useLeadDetail(id, agencyId);
  const { data: rows = [], isLoading: rowsLoading } = useRateChecks(agencyId, null);
  const [pickedId, setPickedId] = useState(null);

  // This lead's policies, plus any others the household sent from the same phone.
  const household = useMemo(() => {
    const own = rows.filter(r => r.lead_id === id);
    const phone = own[0]?.phone;
    return phone ? rows.filter(r => r.lead_id === id || r.phone === phone) : own;
  }, [rows, id]);
  const rc = household.find(r => r.id === pickedId) || household[0] || null;

  // Back to wherever they came from; straight to the leads list when opened directly.
  const close = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/agency/leads');
  }, [navigate]);
  const [now] = useState(() => Date.now());

  if (agencyLoading || leadLoading || rowsLoading) return <PageSpinner label="Loading lead..." />;
  if (error || !lead) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h2 className="text-xl font-bold" style={{ color: 'var(--qs-bright)' }}><T k="pages.agencyleaddetailpage.17895d">Lead Not Found</T></h2>
        <Link to="/agency/leads" className="mt-3 inline-block font-semibold text-primary-600"><T k="sales.lead.back">Back to Leads</T></Link>
      </div>
    );
  }
  if (rc) {
    return <RateCheckDrawer key={rc.phone || rc.id} rc={rc} household={household} now={now} onClose={close} onSelect={(r) => setPickedId(r.id)} />;
  }
  return <LeadWorkspace lead={lead} agencyId={agencyId} onClose={close} />;
}

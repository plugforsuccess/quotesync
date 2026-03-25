// src/pages/AdminAgenciesPage.jsx
// Admin panel for managing agency applications and statuses — dark theme

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Clock, CheckCircle, XCircle, Ban, Eye, RefreshCw, ShieldOff, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAgencies } from '../hooks/useAgencies';
import PageSpinner from '../components/PageSpinner';

const STATUS_STYLES = {
  pending:   { background: 'rgba(245,158,11,0.15)',  color: '#FBBF24' },
  approved:  { background: 'rgba(52,211,153,0.15)',  color: '#34D399' },
  rejected:  { background: 'rgba(239,68,68,0.15)',   color: '#F87171' },
  suspended: { background: 'var(--qs-elevated)',     color: 'var(--qs-dim)' },
};

const STATUS_ICONS = {
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
  suspended: Ban,
};

const STAT_COLORS = {
  total:     { value: 'var(--qs-bright)',  bg: 'var(--qs-elevated)' },
  pending:   { value: '#FBBF24',           bg: 'rgba(245,158,11,0.1)' },
  approved:  { value: '#34D399',           bg: 'rgba(52,211,153,0.1)' },
  rejected:  { value: '#F87171',           bg: 'rgba(239,68,68,0.1)' },
  suspended: { value: 'var(--qs-dim)',     bg: 'var(--qs-elevated)' },
};

const AdminAgenciesPage = () => {
  const navigate = useNavigate();
  const { role: userRole } = useAuth();
  const [filter, setFilter] = useState('all');

  const { data: agencies = [], isLoading, error, refetch } = useAgencies(filter);

  // Redirect if not admin
  if (userRole !== 'admin') {
    return (
      <div className="dark-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <ShieldOff style={{ width: 64, height: 64, color: '#F87171', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 8 }}>Access Denied</h2>
          <p style={{ fontSize: 13, color: 'var(--qs-dim)' }}>You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  // Stats
  const stats = {
    total: agencies.length,
    pending: agencies.filter(a => a.status === 'pending').length,
    approved: agencies.filter(a => a.status === 'approved').length,
    rejected: agencies.filter(a => a.status === 'rejected').length,
    suspended: agencies.filter(a => a.status === 'suspended').length,
  };

  if (isLoading) {
    return <PageSpinner label="Loading agencies..." />;
  }

  if (error) {
    return (
      <div className="dark-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 16 }}>
        <div className="dark-card" style={{ maxWidth: 400, textAlign: 'center', padding: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 16 }}>Failed to Load</h2>
          <p style={{ fontSize: 13, color: 'var(--qs-dim)', marginBottom: 24 }}>{error.message}</p>
          <button
            onClick={() => refetch()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: 'var(--qs-primary, #3B82F6)', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dark-page">
      {/* Header */}
      <div style={{ background: 'var(--qs-card)', borderBottom: '1px solid var(--qs-border)' }}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Building2 size={28} style={{ color: 'var(--qs-primary, #3B82F6)' }} />
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--qs-bright)' }}>Agency Management</h1>
                <p style={{ fontSize: 13, color: 'var(--qs-dim)' }}>Review applications and manage agency partners</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => navigate('/admin/agencies/new')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: 'var(--qs-primary, #3B82F6)', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Plus size={14} />
                New Agency
              </button>
              <button
                onClick={() => refetch()}
                style={{
                  padding: 8, borderRadius: 8, border: '1px solid var(--qs-border)',
                  background: 'none', color: 'var(--qs-dim)', cursor: 'pointer',
                }}
                title="Refresh"
              >
                <RefreshCw size={18} />
              </button>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
            {['total', 'pending', 'approved', 'rejected', 'suspended'].map(key => (
              <div key={key} style={{ background: STAT_COLORS[key].bg, borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: STAT_COLORS[key].value }}>{stats[key]}</div>
                <div style={{ fontSize: 13, color: 'var(--qs-dim)', textTransform: 'capitalize' }}>{key}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--qs-card)', borderBottom: '1px solid var(--qs-border)' }}>
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {['all', 'pending', 'approved', 'rejected', 'suspended'].map(status => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  border: 'none', cursor: 'pointer',
                  background: filter === status ? 'var(--qs-primary, #3B82F6)' : 'var(--qs-elevated)',
                  color: filter === status ? '#fff' : 'var(--qs-dim)',
                }}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Agency List */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {agencies.length === 0 ? (
          <div className="dark-card" style={{ padding: 48, textAlign: 'center' }}>
            <Building2 size={64} style={{ color: 'var(--qs-subtle)', margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--qs-bright)', marginBottom: 8 }}>No agencies found</h2>
            <p style={{ fontSize: 13, color: 'var(--qs-dim)' }}>
              {filter === 'all' ? 'No agencies have applied yet.' : `No agencies with status "${filter}"`}
            </p>
          </div>
        ) : (
          <div className="dark-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--qs-elevated)', borderBottom: '1px solid var(--qs-border)' }}>
                    <th className="dark-section-label" style={{ padding: '10px 20px', textAlign: 'left' }}>Agency</th>
                    <th className="dark-section-label" style={{ padding: '10px 20px', textAlign: 'left' }}>Contact</th>
                    <th className="dark-section-label" style={{ padding: '10px 20px', textAlign: 'left' }}>States</th>
                    <th className="dark-section-label" style={{ padding: '10px 20px', textAlign: 'left' }}>Status</th>
                    <th className="dark-section-label" style={{ padding: '10px 20px', textAlign: 'left' }}>Applied</th>
                    <th className="dark-section-label" style={{ padding: '10px 20px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agencies.map((agency) => {
                    const StatusIcon = STATUS_ICONS[agency.status] || Clock;
                    const statusStyle = STATUS_STYLES[agency.status] || STATUS_STYLES.pending;

                    return (
                      <tr
                        key={agency.id}
                        style={{ borderBottom: '1px solid var(--qs-border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--qs-elevated)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '12px 20px' }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--qs-bright)' }}>{agency.name}</div>
                          {agency.brand_name && (
                            <div style={{ fontSize: 12, color: 'var(--qs-subtle)' }}>{agency.brand_name}</div>
                          )}
                        </td>
                        <td style={{ padding: '12px 20px' }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--qs-bright)' }}>
                            {agency.primary_contact_name || '-'}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--qs-subtle)' }}>{agency.email}</div>
                        </td>
                        <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--qs-dim)' }}>
                          {agency.state_licenses?.length > 0
                            ? agency.state_licenses.slice(0, 3).join(', ') +
                              (agency.state_licenses.length > 3 ? ` +${agency.state_licenses.length - 3}` : '')
                            : '-'}
                        </td>
                        <td style={{ padding: '12px 20px' }}>
                          <span style={{
                            ...statusStyle,
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                          }}>
                            <StatusIcon size={12} />
                            {agency.status.charAt(0).toUpperCase() + agency.status.slice(1)}
                          </span>
                        </td>
                        <td style={{ padding: '12px 20px', fontSize: 13, color: 'var(--qs-subtle)' }}>
                          {new Date(agency.created_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </td>
                        <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                          <Link
                            to={`/admin/agencies/${agency.id}`}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '6px 12px', fontSize: 13, fontWeight: 500,
                              color: 'var(--qs-primary, #3B82F6)', textDecoration: 'none',
                              borderRadius: 6, border: '1px solid transparent',
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--qs-border)'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                          >
                            <Eye size={14} />
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAgenciesPage;

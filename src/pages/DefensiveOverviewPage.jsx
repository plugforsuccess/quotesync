// src/pages/DefensiveOverviewPage.jsx
// Read-only overview of the Defensive Drivers Discount List (principal + staff).
import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Loader2, ArrowRight } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { getQueueAccess, getQueueOverview } from '../lib/ddApi';

export default function DefensiveOverviewPage() {
  const { user, loading: authLoading } = useAuth();
  const [access, setAccess] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    let live = true;
    (async () => {
      try {
        const acc = await getQueueAccess();
        if (!live) return;
        setAccess(acc);
        if (!acc.isStaff && !acc.isPrincipal) { setLoading(false); return; }
        const ov = await getQueueOverview();
        if (live) setData(ov);
      } catch (err) {
        if (live) setError(err.message);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [user, authLoading]);

  if (authLoading || loading) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><Loader2 className="w-8 h-8 text-success-400 animate-spin" /></div>;
  }
  if (!user) return <Navigate to="/admin-access-8by2X" replace />;
  if (access && !access.isStaff && !access.isPrincipal) {
    return <div className="min-h-screen bg-gray-950 text-gray-300 flex items-center justify-center p-6">You don’t have access to this dashboard.</div>;
  }
  if (error || !data) {
    return <div className="min-h-screen bg-gray-950 text-gray-300 flex items-center justify-center p-6">{error || 'No data.'}</div>;
  }

  const c = data.counts || {};
  const kpis = [
    { label: 'Total issued', value: data.total_issued },
    { label: 'New', value: c.new },
    { label: 'In review', value: c.in_review },
    { label: 'Applied', value: c.applied },
    { label: 'Completed', value: c.completed },
    { label: 'Oldest unprocessed', value: `${data.oldest_unprocessed_age_days}d` },
  ];

  return (
    <div className="bg-gray-950 text-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black">Defensive Drivers — Overview</h1>
            <p className="text-sm text-gray-400">Read-only summary of the discount queue.</p>
          </div>
          <Link to="/defensive-driving/queue" className="text-sm text-success-300 hover:text-success-200 flex items-center gap-1">
            Open full list <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <p className="text-2xl font-bold">{k.value ?? 0}</p>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 mt-1">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Throughput */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 mb-8">
          <h2 className="text-sm font-semibold mb-4">Throughput — last 12 weeks</h2>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={data.throughput || []} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="week" tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#374151' }} />
                <YAxis allowDecimals={false} tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#e5e7eb' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="issued" name="Certificates issued" fill="#34d399" radius={[3, 3, 0, 0]} />
                <Bar dataKey="completed" name="Items completed" fill="#38bdf8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Staff workload */}
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-3 bg-gray-900/60 text-sm font-semibold">Staff workload</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-900/40 text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-2">Assignee</th>
                <th className="text-right px-3 py-2">New</th>
                <th className="text-right px-3 py-2">In review</th>
                <th className="text-right px-3 py-2">Applied</th>
                <th className="text-right px-3 py-2">Completed</th>
                <th className="text-right px-5 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {(data.staff_workload || []).length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-500">No items yet.</td></tr>
              )}
              {(data.staff_workload || []).map((w) => (
                <tr key={w.assigned_to || 'unassigned'} className="border-t border-gray-800">
                  <td className="px-5 py-2.5">{w.assignee_name}</td>
                  <td className="px-3 py-2.5 text-right text-gray-300">{w.new}</td>
                  <td className="px-3 py-2.5 text-right text-gray-300">{w.in_review}</td>
                  <td className="px-3 py-2.5 text-right text-gray-300">{w.applied}</td>
                  <td className="px-3 py-2.5 text-right text-gray-300">{w.completed}</td>
                  <td className="px-5 py-2.5 text-right font-semibold">{w.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

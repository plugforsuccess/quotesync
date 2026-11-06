// src/pages/components/rate-checks/AgentUploadDialog.jsx
// "Upload dec page" from the Rate Checks inbox — for dec pages a customer
// emailed or texted in. One upload is one policy; several files are its pages. Creates a rate check + lead for the agent's agency and
// runs the same scan. No consumer consent is recorded, so the lost-quote
// auto-text never fires for these.

import { T } from '../../../components/SiteCopy';
import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAgentUploadDecPage } from '../../../hooks/useRateChecks';
import { formatPhoneInput, HOUSING_OPTIONS } from '../../../lib/rateCheckApi';
import { inputStyle } from './ui';

export default function AgentUploadDialog({ agencyId, onClose, onCreated }) {
  const fileInput = useRef(null);
  const upload = useAgentUploadDecPage();
  const [files, setFiles] = useState([]); // the policy's pages, in order
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [zip, setZip] = useState('');
  const [housing, setHousing] = useState('');

  const phoneDigits = phone.replace(/\D/g, '');
  const canSubmit = files.length > 0 && phoneDigits.length === 10 && (!zip || /^\d{5}$/.test(zip)) && !upload.isPending;

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    upload.mutate({ agencyId, files, firstName, phone: phoneDigits, zip, housing }, {
      onSuccess: (data) => onCreated?.(data),
    });
  };

  const field = 'w-full rounded-md px-3 py-2 text-sm';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Upload dec page">
      <div className="absolute inset-0 bg-black/50" onClick={upload.isPending ? undefined : onClose} />
      <form onSubmit={submit} className="relative w-full max-w-md space-y-4 rounded-xl p-5 shadow-xl"
        style={{ background: 'var(--qs-card)', border: '1px solid var(--qs-border)', color: 'var(--qs-text)' }}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--qs-bright)' }}><T k="pages.components.ratechecks.agentuploaddialog.d008bd">Upload Dec Page</T></h2>
            <p className="text-sm" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.agentuploaddialog.fd9270">For a dec page a customer emailed or texted you.</T></p>
          </div>
          <button type="button" onClick={onClose} disabled={upload.isPending} aria-label="Close" className="rounded p-1.5" style={inputStyle}><X className="w-4 h-4" /></button>
        </div>

        <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple className="hidden"
          onChange={e => { const picked = Array.from(e.target.files || []); setFiles(f => [...f, ...picked]); e.target.value = ''; }} />
        {files.length > 0 && (
          <ol className="space-y-1.5 text-sm">
            {files.map((f, i) => (
              <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-2 rounded-lg px-3 py-2" style={inputStyle}>
                <span className="shrink-0 font-semibold" style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.agentuploaddialog.193cfc">Page</T> {i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <button type="button" onClick={() => setFiles(list => list.filter((_, k) => k !== i))} disabled={upload.isPending}
                  aria-label={`Remove page ${i + 1}`} className="rounded p-1"><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ol>
        )}
        <button type="button" onClick={() => fileInput.current?.click()} disabled={upload.isPending}
          className="w-full rounded-lg border-2 border-dashed px-4 py-4 text-sm font-semibold" style={{ borderColor: 'var(--qs-border)', color: 'var(--qs-bright)' }}>
          {files.length ? `+ Add Page ${files.length + 1}` : 'Choose Photos or PDF'}
          <span className="block text-xs font-normal" style={{ color: 'var(--qs-subtle)' }}>
            {files.length ? 'More pages of the same policy' : 'Pick every page of the policy; they’re read together'}
          </span>
        </button>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 space-y-1 text-sm"><span style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.agentuploaddialog.77ca59">Customer Mobile *</T></span>
            <input className={field} style={inputStyle} type="tel" inputMode="tel" placeholder="(404) 555-1212"
              value={phone} onChange={e => setPhone(formatPhoneInput(e.target.value))} required />
          </label>
          <label className="space-y-1 text-sm"><span style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.agentuploaddialog.20db0b">First Name</T></span>
            <input className={field} style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} maxLength={60} />
          </label>
          <label className="space-y-1 text-sm"><span style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.agentuploaddialog.4348f9">ZIP</T></span>
            <input className={field} style={inputStyle} inputMode="numeric" maxLength={5} value={zip}
              onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))} />
          </label>
          <label className="col-span-2 space-y-1 text-sm"><span style={{ color: 'var(--qs-subtle)' }}><T k="pages.components.ratechecks.agentuploaddialog.91ae8d">Where They Live (If Known)</T></span>
            <select className={field} style={inputStyle} value={housing} onChange={e => setHousing(e.target.value)}>
              <option value="">Not sure</option>
              {HOUSING_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>

        <p className="text-xs" style={{ color: 'var(--qs-subtle)' }}>
          <T k="pages.components.ratechecks.agentuploaddialog.9a0dc1">We won’t send this customer automatic texts, because they haven’t agreed to them. If they already have an open lead, it gets updated instead of duplicated.</T>
        </p>

        {upload.isError && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{upload.error.message}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={upload.isPending} className="rounded-lg px-4 py-2 text-sm" style={inputStyle}><T k="pages.components.ratechecks.agentuploaddialog.ea4788">Cancel</T></button>
          <button type="submit" disabled={!canSubmit} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {upload.isPending ? 'Reading Dec Page…' : 'Upload & Scan'}
          </button>
        </div>
      </form>
    </div>
  );
}

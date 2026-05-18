// src/pages/components/operating-review/MarkReviewedBar.jsx
import { useState } from 'react';
import { Check, History, X } from 'lucide-react';
import {
  useIsWeekReviewed,
  useMarkReviewed,
  useCompletions,
  computeStreak,
} from '../../../hooks/useOperatingReview';
import { formatWeekLabel } from '../../../lib/weekUtils';

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--qs-elevated)',
  border: '1px solid var(--qs-border)',
  borderRadius: 8,
  color: 'var(--qs-text)',
  fontSize: 14,
  outline: 'none',
};

const btnPrimary = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 20px',
  background: 'var(--qs-info)',
  color: 'white',
  fontWeight: 600,
  fontSize: 14,
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
};

const btnSecondary = {
  ...btnPrimary,
  background: 'transparent',
  color: 'var(--qs-text)',
  border: '1px solid var(--qs-border)',
  fontWeight: 500,
};

const barStyle = {
  position: 'sticky',
  bottom: 0,
  marginTop: 24,
  padding: 16,
  background: 'var(--qs-card)',
  border: '1px solid var(--qs-border)',
  borderRadius: 12,
  boxShadow: '0 -8px 32px rgba(0,0,0,0.3)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  zIndex: 10,
};

export default function MarkReviewedBar({ agencyId, reviewWeekStart }) {
  const { isReviewed } = useIsWeekReviewed(agencyId, reviewWeekStart);
  const { data: completions = [] } = useCompletions(agencyId, 6);
  const markReviewed = useMarkReviewed();

  const [showHistory, setShowHistory] = useState(false);
  const [note, setNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);

  const streak = computeStreak(completions, reviewWeekStart);

  const handleMark = async () => {
    try {
      await markReviewed.mutateAsync({
        agencyId,
        weekStart: reviewWeekStart,
        note: note.trim() || undefined,
      });
      setNote('');
      setShowNoteInput(false);
    } catch (err) {
      window.alert(`Mark reviewed failed: ${err.message ?? err}`);
    }
  };

  return (
    <>
      <div style={barStyle}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--qs-subtle)' }}>
            {isReviewed
              ? `${formatWeekLabel(reviewWeekStart)} — reviewed`
              : `${formatWeekLabel(reviewWeekStart)} — not yet reviewed`}
          </div>
          {streak > 0 && (
            <div style={{ fontSize: 12, color: 'var(--qs-success)', marginTop: 2, fontWeight: 600 }}>
              🔥 {streak}-week streak
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            style={btnSecondary}
          >
            <History size={14} />
            History
          </button>

          {!isReviewed && !showNoteInput && (
            <button
              type="button"
              onClick={() => setShowNoteInput(true)}
              style={btnPrimary}
            >
              <Check size={14} />
              Mark this week reviewed
            </button>
          )}

          {isReviewed && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', background: 'rgba(16, 185, 129, 0.1)',
              color: 'var(--qs-success)', fontWeight: 600, fontSize: 14, borderRadius: 8,
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}>
              <Check size={14} />
              Reviewed
            </div>
          )}
        </div>
      </div>

      {showNoteInput && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '24px 16px',
        }}>
          <div
            style={{ position: 'absolute', inset: 0 }}
            onClick={() => setShowNoteInput(false)}
          />
          <div style={{
            position: 'relative',
            width: '100%', maxWidth: 480,
            background: 'var(--qs-card)',
            border: '1px solid var(--qs-border)',
            borderRadius: 16,
            overflow: 'hidden',
            marginTop: 80,
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--qs-border)',
              background: 'var(--qs-elevated)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <h2 style={{ margin: 0, fontSize: 16, color: 'var(--qs-bright)', fontWeight: 600 }}>
                Mark reviewed — optional note
              </h2>
              <button
                type="button"
                onClick={() => setShowNoteInput(false)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--qs-subtle)', padding: 4,
                }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: 20 }}>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What did you focus on this week? (Optional)"
                rows={3}
                style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowNoteInput(false)}
                  style={btnSecondary}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleMark}
                  disabled={markReviewed.isPending}
                  style={{ ...btnPrimary, opacity: markReviewed.isPending ? 0.5 : 1 }}
                >
                  <Check size={14} />
                  {markReviewed.isPending ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <HistoryModal
          completions={completions}
          onClose={() => setShowHistory(false)}
        />
      )}
    </>
  );
}

function HistoryModal({ completions, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(4px)',
      zIndex: 50,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '24px 16px',
      overflowY: 'auto',
    }}>
      <div
        style={{ position: 'absolute', inset: 0 }}
        onClick={onClose}
      />
      <div style={{
        position: 'relative',
        width: '100%', maxWidth: 560,
        background: 'var(--qs-card)',
        border: '1px solid var(--qs-border)',
        borderRadius: 16,
        overflow: 'hidden',
        marginTop: 80,
        maxHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--qs-border)',
          background: 'var(--qs-elevated)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--qs-bright)', fontWeight: 600 }}>
            Review history (last 6 months)
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--qs-subtle)', padding: 4,
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>
          {completions.length === 0 ? (
            <p style={{ color: 'var(--qs-subtle)', margin: 0 }}>
              No reviews yet. Mark this week reviewed to start your streak.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {completions.map(c => (
                <div key={c.id} style={{
                  padding: 12,
                  background: 'var(--qs-elevated)',
                  borderRadius: 8,
                  border: '1px solid var(--qs-border)',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)' }}>
                    {formatWeekLabel(c.review_week)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--qs-subtle)', marginTop: 2 }}>
                    Reviewed {new Date(c.completed_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </div>
                  {c.note && (
                    <div style={{ fontSize: 13, color: 'var(--qs-text)', marginTop: 6 }}>
                      {c.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

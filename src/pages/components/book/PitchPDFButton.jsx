// src/pages/components/book/PitchPDFButton.jsx
import { useState } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { Download } from 'lucide-react';
import BookPitchPDF from './BookPitchPDF';

const btnSecondary = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 16px', background: 'transparent', color: 'var(--qs-text)',
  fontSize: 14, fontWeight: 500, borderRadius: 8,
  border: '1px solid var(--qs-border)', cursor: 'pointer',
  textDecoration: 'none',
};

/**
 * Renders a "Download Pitch PDF" button. Lazy: only mounts the PDF document
 * when the user clicks Download, to avoid generating the doc on every render.
 *
 * @param {Object} props
 * @param {string} props.agencyName
 * @param {Object} props.aggregates  Output of computeBookAggregates
 * @param {Array}  props.moves       Output of generateMoves
 */
export default function PitchPDFButton({ agencyName, aggregates, moves }) {
  const [showLink, setShowLink] = useState(false);

  if (aggregates.totalPremium === 0) {
    return null;  // Don't offer PDF for an empty book
  }

  const filename = `book-analysis-${(agencyName ?? 'agency').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`;

  if (!showLink) {
    return (
      <button type="button" onClick={() => setShowLink(true)} style={btnSecondary}>
        <Download size={14} />
        Generate Pitch PDF
      </button>
    );
  }

  return (
    <PDFDownloadLink
      document={<BookPitchPDF agencyName={agencyName} aggregates={aggregates} moves={moves} />}
      fileName={filename}
      style={btnSecondary}
    >
      {({ loading }) => (
        <>
          <Download size={14} />
          {loading ? 'Generating PDF…' : 'Download Pitch PDF'}
        </>
      )}
    </PDFDownloadLink>
  );
}

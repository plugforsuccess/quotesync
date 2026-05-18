// src/pages/components/book/BookEditorTab.jsx
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useDeleteBookRow } from '../../../hooks/useBookSnapshot';
import BookEditorTable from './BookEditorTable';
import BookRowFormModal from './BookRowFormModal';

const btnPrimary = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 16px', background: 'var(--qs-info)', color: 'white',
  fontSize: 14, fontWeight: 500, borderRadius: 8, border: 'none', cursor: 'pointer',
};

export default function BookEditorTab({ agencyId, rows }) {
  const deleteRow = useDeleteBookRow();
  const [editingRow, setEditingRow] = useState(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const handleDelete = async (row) => {
    const confirmed = window.confirm(
      `Remove ${row.carrier_name} ${row.product_key} (${row.state_code})?\n\n` +
      `This deletes the composition row. It does not affect any policy records.`
    );
    if (!confirmed) return;
    try {
      await deleteRow.mutateAsync({ id: row.id, agencyId });
    } catch (err) {
      window.alert(`Delete failed: ${err.message ?? err}`);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button type="button" onClick={() => setCreatingNew(true)} style={btnPrimary}>
          <Plus size={16} />
          Add Row
        </button>
      </div>

      <BookEditorTable
        rows={rows}
        onEdit={setEditingRow}
        onDelete={handleDelete}
      />

      {creatingNew && (
        <BookRowFormModal
          mode="create" agencyId={agencyId}
          onClose={() => setCreatingNew(false)}
        />
      )}
      {editingRow && (
        <BookRowFormModal
          mode="edit" agencyId={agencyId} row={editingRow}
          onClose={() => setEditingRow(null)}
        />
      )}
    </div>
  );
}

export default function PageSpinner({ label = 'Loading...' }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mb-4" />
        <p className="text-gray-600 text-sm">{label}</p>
      </div>
    </div>
  );
}

import IngestionPanel from './IngestionPanel';

export default function TaxIntelligencePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          Tax Intelligence
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          公式税務ソースの現在版を確認・取り込みします
        </p>
      </div>

      <IngestionPanel />
    </div>
  );
}

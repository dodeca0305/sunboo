import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import ProcedureForm from '../ProcedureForm';

export default function NewProcedurePage() {
  return (
    <div className="space-y-6">
      <Link
        href="/admin/procedures"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" />
        手続き一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-900">手続きを追加</h1>
      <ProcedureForm />
    </div>
  );
}

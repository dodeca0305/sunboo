import { Info, FileText, ExternalLink, Target, Send } from 'lucide-react';

export type ProcedureDocumentItem = {
  name: string;
  form_number: string | null;
  is_required: boolean;
  notes: string | null;
  // 【Sprint54で追加】item_type・sort_orderはScheduleProcedure.procedure_documentsの型に
  // 揃えるためのフィールド。このコンポーネント自体はitem_typeを意識せず、Sprint53のレビュー方針
  // 通り既存のフラット表示（全件をnotesの有無だけで並べる）を維持する（/resultの回帰を避ける）。
  item_type?: 'document' | 'preparation' | 'checklist';
  sort_order?: number;
};

export type ProcedureDetailExtraProps = {
  targetNote?: string | null;
  submissionMethod?: string | null;
  documents?: ProcedureDocumentItem[];
  eFilingSystemName?: string | null;
  eFilingSystemUrl?: string | null;
  cautionNote?: string | null;
};

export default function ProcedureDetailExtra({
  targetNote,
  submissionMethod,
  documents = [],
  eFilingSystemName,
  eFilingSystemUrl,
  cautionNote,
}: ProcedureDetailExtraProps) {
  const hasAny =
    targetNote || submissionMethod || documents.length > 0 || eFilingSystemName || cautionNote;
  if (!hasAny) return null;

  return (
    <div className="mt-3 space-y-2.5 text-xs text-gray-600">
      {targetNote && (
        <p className="flex items-start gap-1.5">
          <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span><span className="font-medium text-gray-700">対象：</span>{targetNote}</span>
        </p>
      )}
      {submissionMethod && (
        <p className="flex items-start gap-1.5">
          <Send className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span><span className="font-medium text-gray-700">提出方法：</span>{submissionMethod}</span>
        </p>
      )}
      {documents.length > 0 && (
        <div className="flex items-start gap-1.5">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          <div>
            <span className="font-medium text-gray-700">必要書類：</span>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {documents.map((doc, idx) => (
                <li key={idx}>
                  {doc.name}
                  {!doc.is_required && <span className="text-gray-400">（任意）</span>}
                  {doc.notes && <span className="text-gray-400">　{doc.notes}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {eFilingSystemName && eFilingSystemUrl && (
        <div className="pt-0.5">
          <a
            href={eFilingSystemUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary inline-flex items-center gap-1 px-3 py-1 text-xs"
          >
            {eFilingSystemName}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
      {cautionNote && (
        <div className="flex items-start gap-1.5 rounded-lg bg-gray-50 px-3 py-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          <p className="leading-relaxed text-gray-500">{cautionNote}</p>
        </div>
      )}
    </div>
  );
}

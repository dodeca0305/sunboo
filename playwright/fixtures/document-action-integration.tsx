// ローカル合成試験専用。実WorkspaceDocumentsView（と実WorkspaceDocumentEditor）を合成データで描画する。
// supabase browser clientはverify-document-action-integration.mjsがビルド時にスタブへ差し替える。
// 認証・実データ・本番通信なし。本番ルートではない。
import { createRoot } from 'react-dom/client';
import WorkspaceDocumentsView from '@/components/WorkspaceDocumentsView';

type Props = React.ComponentProps<typeof WorkspaceDocumentsView>;

function Harness() {
  const props = (window as unknown as { __props: Props }).__props;
  return (
    <main className="mx-auto max-w-3xl p-4">
      <WorkspaceDocumentsView {...props} />
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);

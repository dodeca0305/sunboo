import { redirect } from 'next/navigation';

// このページは廃止済み。診断結果は /result で表示します（Prompt D で実装）。
export default function DiagnosisPage() {
  redirect('/start');
}

import InformationCard from '@/components/InformationCard';
export default function RuleLoadError({ href }: { href: string }) {
  return <div role="alert"><InformationCard kind="error" title="ルール設定を取得できませんでした">
    登録済みの条件・実行内容を確認できないため、編集・保存を停止しています。
    <a href={href} className="mt-2 block underline">再読み込み</a>
  </InformationCard></div>;
}

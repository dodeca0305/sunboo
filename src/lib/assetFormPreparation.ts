/** 現行R8の公式手引で確認した条件。R9の継続利用確認とは別。 */
export interface AssetFormPreparation {
  scope: string;
  items: readonly string[];
  sourceUrl: string;
  sourcePages: string;
}

export const ASSET_FORM_PREPARATION: Readonly<Record<string, AssetFormPreparation>> = {
  福岡市: {
    scope: 'ソフト等で作った紙の申告書を使う場合',
    items: [
      '市から届いた申告書（白紙）を必ず添付します。',
      '電算申告は、区ごとの全資産明細と増減資産の集計を用意し、評価額欄も記入します。',
      'eLTAXの電子申告では、申告書に所有者コードを記入します。',
    ],
    sourceUrl: 'https://www.city.fukuoka.lg.jp/zaisei/zeisei/netdetetsuduki/documents/R8tebikiALL.pdf',
    sourcePages: '表紙・10ページ',
  },
  北九州市: {
    scope: '自社用紙で電算申告する場合',
    items: [
      '市から届いた申告書を使うのが原則です。自社用紙を使う場合も、市の申告書を一緒に提出します。',
      '毎年、全資産明細と増減資産の集計を用意します。資産の種類・名称・数量・取得年月・取得価額・耐用年数・減価残存率・評価額を記載します。',
    ],
    sourceUrl: 'https://www.city.kitakyushu.lg.jp/files/000820838.pdf',
    sourcePages: '9ページ',
  },
  さいたま市: {
    scope: '全国統一様式・独自用紙を使う場合',
    items: [
      '全国統一様式（第26号様式）なら、市の用紙以外も受け付ける案内があります。',
      '電算申告の独自用紙では、所有者コードと評価額・決定価格・課税標準額を記入し、市から届いた未記入の申告書も添付します。',
      '電算申告は、全資産明細と増減資産の明細・集計を用意します。特例があれば特例率・課税標準額も記載します。',
    ],
    sourceUrl: 'https://www.city.saitama.lg.jp/001/153/004/002/002/004/p009364_d/fil/R8_tebiki.pdf',
    sourcePages: '2ページ・公式ページの「申告書の入手方法」',
  },
  千葉市: {
    scope: '電算処理で全資産を申告する場合',
    items: [
      '第26号様式の全項目と、所有者コード（11桁）・評価額・決定価格・課税標準額を記入します。',
      '区ごとの全資産明細を作り、資産の種類ごとに集計します。',
      '特例資産は特例率・課税標準額を記載し、複数ある場合は特例ごとの集計表も添付します。耐用年数を改正で変えた資産は、改正年と改正前の年数を記載します。',
    ],
    sourceUrl: 'https://www.city.chiba.jp/zaiseikyoku/zeimu/tobushizei/hojin/documents/r08_sinnkokunotebiki.pdf',
    sourcePages: '7ページ',
  },
  静岡市: {
    scope: '独自用紙・電算処理で申告する場合',
    items: [
      '独自用紙では、市から届いた申告書の整理番号を転記し、市の申告書も添付します。',
      '電算申告は第26号様式の全項目を記入し、毎年、全資産の評価額と資産の種類ごとの合計を記載します。',
      '特例・非課税・増加償却・短縮耐用年数などがあれば、手引の該当書類も添付します。',
    ],
    sourceUrl: 'https://www.city.shizuoka.lg.jp/documents/49644/reiwa8tebiki.pdf',
    sourcePages: '13～14ページ',
  },
  浜松市: {
    scope: '会計ソフト等で電算申告する場合',
    items: [
      '所有者コードを転記し、市から届いた申告書も添付します。価額に関する欄はすべて記入します。',
      '区ごとの全資産明細と増減資産の集計を用意し、評価額・課税標準額を記載します。',
      '特例資産は特例率と適用後の課税標準額も記載します。',
    ],
    sourceUrl: 'https://www.city.hamamatsu.shizuoka.jp/documents/15450/shinkokunotebiki.pdf',
    sourcePages: '7ページ',
  },
  名古屋市: {
    scope: '独自様式を使う場合',
    items: [
      '市から届いた申告書の所有者コードを、申告書の右上に転記します。',
      '市から届いた申告書に二次元コードがある場合は、その申告書も同封します。eLTAXの電子申告では同封不要です。',
    ],
    sourceUrl: 'https://www.city.nagoya.jp/_res/projects/default_project/_page_/001/011/956/r8sinnkokunotebiki.pdf',
    sourcePages: '11ページ',
  },
  京都市: {
    scope: '独自に作った用紙を使う場合',
    items: [
      '手引の17・19・21ページの様式どおりに作成します。',
      '市から申告書が届いている場合は、納税者コード確認のため、その申告書も一緒に提出します。',
    ],
    sourceUrl: 'https://www.city.kyoto.lg.jp/gyozai/cmsfiles/contents/0000052/52941/R8tebiki2.pdf',
    sourcePages: '12ページ',
  },
  神戸市: {
    scope: '自社の電算処理で全資産を申告する場合',
    items: [
      '第26号様式・別表1の内容を満たす用紙を使います。独自用紙では所有者コード（13桁）を転記します。',
      '全資産明細に全項目と評価額を記載し、資産の種類ごとに合計します。改良費は本体と分けて評価します。',
      '特例がある場合は、特例率・課税標準額を記載し、特例適用資産の一覧表も添付します。',
    ],
    sourceUrl: 'https://www.city.kobe.lg.jp/documents/2825/r8shinkokunotebiki.pdf',
    sourcePages: '8ページ',
  },
  札幌市: {
    scope: '電算処理で全資産を申告する場合',
    items: [
      '全国統一の第26号様式・別表1を使います。独自の明細も全項目を記載し、毎年、全資産を評価して申告します。',
      '所有者コードを記入し、市の申告書と、お持ちの種類別明細書も一緒に提出します。',
      '減少資産の確認用資料の提出にも協力するよう案内されています。',
    ],
    sourceUrl: 'https://www.city.sapporo.jp/documents/114194/08_shokyaku_tebiki.pdf',
    sourcePages: '8ページ',
  },
};

/** 市ごとの公式手引で確認した条件。年度を確認できた市のみ年度案内を指定する。 */
export interface AssetFormPreparation {
  scope: string;
  items: readonly string[];
  sourceUrl: string;
  sourcePages: string;
  checkedOn?: string;
  yearNotice?: string;
  sourceLinks?: readonly { label: string; url: string }[];
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
    sourceUrl: 'https://www.city.sapporo.jp/documents/114194/09_shokyaku_tebiki.pdf',
    sourcePages: '8ページ',
    checkedOn: '2026/11/27',
    yearNotice: '令和9年度の手引に基づく案内です。申告方法に合う用紙と添付を確認してください。',
  },

  // 2026-11-27追加確認。R9の様式利用可否とは区別する。
  川崎市: {
    "scope": "独自様式・電算処理で申告する場合",
    "items": [
        "独自様式には、市から届いた申告書の所有者コードを転記します。電算申告は11桁です。",
        "電算申告は毎年、全資産を申告します。一般方式では、市から届いた明細に増減・訂正を記載します。",
        "特例・非課税の資産があれば専用明細などを用意します。初めて適用する場合等は、申請書や確認書類も必要です。"
    ],
    "sourceUrl": "https://www.city.kawasaki.jp/230/cmsfiles/contents/0000053/53635/r8syoukyakutebiki.pdf",
    "sourcePages": "6・7・8ページ",
    "checkedOn": "2026/11/27",
    "sourceLinks": [
        {
            "label": "市の公式案内（別タブ）",
            "url": "https://www.city.kawasaki.jp/230/page/0000020553.html"
        },
        {
            "label": "手引 6・7・8ページ（PDF・別タブ）",
            "url": "https://www.city.kawasaki.jp/230/cmsfiles/contents/0000053/53635/r8syoukyakutebiki.pdf"
        }
    ]
},
  相模原市: {
    "scope": "私製用紙・電算処理で申告する場合",
    "items": [
        "私製用紙には、上部に資産の所在区を明記し、所有者コードを転記します。",
        "初めて資産を申告する場合は申告書と増加・全資産用明細を用意します。電算申告は評価額入りの全資産明細が必要です。",
        "特例には専用明細と必要資料、耐用年数短縮・増加償却には承認書や届出書の写しを添付します。"
    ],
    "sourceUrl": "https://www.city.sagamihara.kanagawa.jp/_res/projects/default_project/_page_/001/011/360/r08/tebiki.pdf",
    "sourcePages": "1・11・14ページ",
    "checkedOn": "2026/11/27",
    "sourceLinks": [
        {
            "label": "手引 1・11・14ページ（PDF・別タブ）",
            "url": "https://www.city.sagamihara.kanagawa.jp/_res/projects/default_project/_page_/001/011/360/r08/tebiki.pdf"
        }
    ]
},
  新潟市: {
    "scope": "一般方式・電算処理方式で用意する書類",
    "items": [
        "一般方式の初回は申告書と全資産の明細を用意し、翌年以降は増減・訂正に応じた明細を用意します。",
        "電算申告は評価額等を計算し、毎年、申告書と全資産明細を用意します。増減明細も提出できれば添付します。",
        "特例の初回申告は、特例適用申告書と必要な添付書類を用意します。",
        "控えのコピーが使える案内は修正申告用です。翌年度の申告に使えるという意味ではありません。"
    ],
    "sourceUrl": "https://www.city.niigata.lg.jp/kurashi/zei/siraberu/koteishisan/sinkoku.files/2026TEBIKIZENTAI.pdf",
    "sourcePages": "10・11・18・22ページ",
    "checkedOn": "2026/11/27",
    "sourceLinks": [
        {
            "label": "手引 10・11・18・22ページ（PDF・別タブ）",
            "url": "https://www.city.niigata.lg.jp/kurashi/zei/siraberu/koteishisan/sinkoku.files/2026TEBIKIZENTAI.pdf"
        }
    ]
},
  堺市: {
    "scope": "一般申告・電算処理で用意する書類",
    "items": [
        "初回は申告書と全資産の明細、継続申告は増減に応じた明細を用意します。",
        "電算申告は所有者コードを記入し、毎年の全資産を区分して資産の種類ごとに集計します。",
        "電算申告で特例・非課税資産があれば条項別の集計表、新たに取得した該当資産は専用届出書と関係資料も用意します。増減明細も可能な限り添付します。"
    ],
    "sourceUrl": "https://www.city.sakai.lg.jp/benri/download/download_shimin/mokuteki/kurashi/zeikin/koteishisan/syoukyakushishanshinkoku.files/R8shinkokunotebiki.pdf",
    "sourcePages": "10・11ページ",
    "checkedOn": "2026/11/27",
    "sourceLinks": [
        {
            "label": "手引 10・11ページ（PDF・別タブ）",
            "url": "https://www.city.sakai.lg.jp/benri/download/download_shimin/mokuteki/kurashi/zeikin/koteishisan/syoukyakushishanshinkoku.files/R8shinkokunotebiki.pdf"
        }
    ]
},
  広島市: {
    "scope": "市の様式で用意する書類・電算処理の条件",
    "items": [
        "初回や電算処理の全資産申告は、区ごとに申告書と全資産明細を用意します。",
        "継続する増減申告は、増加・減少に応じた明細を用意します。電算申告では評価額等も記入します。",
        "耐用年数短縮・増加償却があれば承認通知書や届出書の写しを添付します。非課税・特例の書類は市の案内で確認してください。"
    ],
    "sourceUrl": "https://www.city.hiroshima.lg.jp/_res/projects/default_project/_page_/001/019/210/256152.pdf",
    "sourcePages": "1・9・10・11・12・7・8ページ",
    "checkedOn": "2026/11/27",
    "sourceLinks": [
        {
            "label": "手引 1ページ（PDF・別タブ）",
            "url": "https://www.city.hiroshima.lg.jp/_res/projects/default_project/_page_/001/019/210/256152.pdf"
        },
        {
            "label": "市の公式案内（別タブ）",
            "url": "https://www.city.hiroshima.lg.jp/living/zei/1006021/1025589/1019210.html"
        },
        {
            "label": "手引 9・10ページ（PDF・別タブ）",
            "url": "https://www.city.hiroshima.lg.jp/_res/projects/default_project/_page_/001/019/210/256154.pdf"
        },
        {
            "label": "手引 11・12ページ（PDF・別タブ）",
            "url": "https://www.city.hiroshima.lg.jp/_res/projects/default_project/_page_/001/019/210/256155.pdf"
        },
        {
            "label": "手引 7・8ページ（PDF・別タブ）",
            "url": "https://www.city.hiroshima.lg.jp/_res/projects/default_project/_page_/001/019/210/256153.pdf"
        }
    ]
},
  熊本市: {
    "scope": "私製様式・電算処理で申告する場合",
    "items": [
        "私製様式の紙申告は、所有者コードと所在区を記入し、市から届いた申告書も必ず添付します。",
        "電算申告はA4横で全資産を記載し、取得価額・評価額・課税標準額を記入します。住所・法人名等の変更や送付先の違いは別紙を添付します。",
        "令和9年1月受付分から、控えの押印・返送は廃止されます。現行様式を令和9年度に使えるかは別途確認中です。"
    ],
    "sourceUrl": "https://www.city.kumamoto.jp/kiji00364398/3_64398_480131_up_rp0lb5vo.pdf",
    "sourcePages": "表紙・6ページ、控え返送の変更は市の案内",
    "checkedOn": "2026/11/27",
    "sourceLinks": [
        {
            "label": "手引 表紙・6ページ（PDF・別タブ）",
            "url": "https://www.city.kumamoto.jp/kiji00364398/3_64398_480131_up_rp0lb5vo.pdf"
        },
        {
            "label": "控えの押印・返送の変更（市の案内・別タブ）",
            "url": "https://www.city.kumamoto.jp/kiji00364398/index.html"
        }
    ]
},
};

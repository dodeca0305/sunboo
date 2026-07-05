// フィードバック送信先。フォーム/バックエンドは持たず、mailtoリンクのみで受け付ける（Sprint 11）。
export const FEEDBACK_EMAIL = 'sunboo.hasegawa@gmail.com';

export const FEEDBACK_MAILTO_HREF = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(
  'SUNBOO経営ナビ ご意見・不具合報告',
)}`;

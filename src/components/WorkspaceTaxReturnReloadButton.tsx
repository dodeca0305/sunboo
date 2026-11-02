'use client';

export default function WorkspaceTaxReturnReloadButton() {
  return (
    <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>
      再読み込み
    </button>
  );
}

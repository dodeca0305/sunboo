import { Circle, Clock, CheckCircle2, PauseCircle, CircleHelp, Info, type LucideIcon } from 'lucide-react';

// ── Status Badge 共通定義（Sprint83「Interactive Controls & Status Foundation」）─────
// Procedure Status / Roadmap Status / Dashboard Status（進捗サマリー）にまたがって
// 並存していた「未着手・進行中・完了・情報不足・推定」の5つの状態表現を、
// label・icon・className・printLabelの4点セットとしてここに一元管理する。
// 個々の画面（AnnualRoadmapView・ScheduleList・WorkspaceDashboard）は、この関数の
// 戻り値をそのまま使うだけとし、色やアイコンをコンポーネント側で独自に持たない。
//
// on_hold（保留）はワークスペースの手続きステータス（WorkspaceProcedureStatus、4値）に
// 存在する値のため、5値の指示に含まれていないが実装上必要になり追加した。

export type StatusBadgeKind = 'not_started' | 'in_progress' | 'done' | 'on_hold' | 'info_missing' | 'estimated';

export interface StatusBadgeConfig {
  /** 画面に表示する短いラベル */
  label: string;
  /** アイコンが使えない文脈（title属性・将来のExcel/印刷出力等）向けの補足込みラベル */
  printLabel: string;
  /** lucide-reactのアイコンコンポーネント。色だけで状態を表さないために必ず併記する */
  icon: LucideIcon;
  /** globals.cssの.status-badgeと組み合わせて使うトーン修飾子クラス */
  className: string;
}

const CONFIG: Record<StatusBadgeKind, StatusBadgeConfig> = {
  not_started: {
    label: '未着手',
    printLabel: '未着手',
    icon: Circle,
    className: 'status-badge status-badge--neutral',
  },
  in_progress: {
    label: '進行中',
    printLabel: '進行中',
    icon: Clock,
    className: 'status-badge status-badge--active',
  },
  done: {
    label: '完了',
    printLabel: '完了',
    icon: CheckCircle2,
    className: 'status-badge status-badge--done',
  },
  on_hold: {
    label: '保留',
    printLabel: '保留',
    icon: PauseCircle,
    className: 'status-badge status-badge--neutral',
  },
  info_missing: {
    label: '情報不足',
    printLabel: '情報不足（登録情報が不足しています）',
    icon: CircleHelp,
    className: 'status-badge status-badge--muted',
  },
  estimated: {
    label: '推定',
    printLabel: '推定（確定情報ではありません）',
    icon: Info,
    className: 'status-badge status-badge--muted',
  },
};

export function getStatusBadgeConfig(kind: StatusBadgeKind): StatusBadgeConfig {
  return CONFIG[kind];
}

// Priority（重要度）は5値のStatus Badgeとは別の概念（Dashboard/Notificationの優先度・重要度表示）。
// Status Badgeのような専用コンポーネントは持たず、既存の.tagにトーン修飾子を足すだけの
// 軽量な運用とする（詳細は docs/SUNBOO_INTERACTIVE_CONTROLS_REVIEW.md）。
export type PriorityLevel = 'high' | 'medium' | 'low';

export const PRIORITY_TAG_CLASS: Record<PriorityLevel, string> = {
  high: 'tag--danger',
  medium: 'tag--caution',
  low: '',
};

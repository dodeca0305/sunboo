import type { Metadata } from 'next';
import ResetPasswordForm from './ResetPasswordForm';
export const metadata: Metadata = { title: 'パスワード再設定', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default function ResetPasswordPage() { return <ResetPasswordForm />; }

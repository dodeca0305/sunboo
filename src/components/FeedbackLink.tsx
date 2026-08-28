'use client';

import { Mail } from 'lucide-react';
import Link from 'next/link';
import { FEEDBACK_FORM_HREF } from '@/lib/contact';
import { trackEvent } from '@/lib/analytics';

export default function FeedbackLink({ className }: { className: string }) {
  return (
    <Link
      href={FEEDBACK_FORM_HREF}
      onClick={() => trackEvent('feedback_link_clicked')}
      className={className}
    >
      <Mail className="h-3.5 w-3.5" />
      ご意見を送る
    </Link>
  );
}

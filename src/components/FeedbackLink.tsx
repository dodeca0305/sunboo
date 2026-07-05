'use client';

import { Mail } from 'lucide-react';
import { FEEDBACK_MAILTO_HREF } from '@/lib/contact';
import { trackEvent } from '@/lib/analytics';

export default function FeedbackLink({ className }: { className: string }) {
  return (
    <a
      href={FEEDBACK_MAILTO_HREF}
      onClick={() => trackEvent('feedback_link_clicked')}
      className={className}
    >
      <Mail className="h-3.5 w-3.5" />
      ご意見を送る
    </a>
  );
}

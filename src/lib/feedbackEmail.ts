import { FEEDBACK_EMAIL } from './contact.ts';

export type FeedbackInput = {
  name: string;
  email: string;
  message: string;
  website?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateFeedback(value: unknown): FeedbackInput {
  if (!value || typeof value !== 'object') {
    throw new Error('入力内容を確認してください。');
  }

  const input = value as Record<string, unknown>;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim() : '';
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  const website = typeof input.website === 'string' ? input.website.trim() : '';

  if (!name || name.length > 100) {
    throw new Error('お名前は100文字以内で入力してください。');
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new Error('メールアドレスを正しく入力してください。');
  }
  if (!message || message.length > 5000) {
    throw new Error('ご意見は5000文字以内で入力してください。');
  }

  return { name, email, message, website };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return entities[character];
  });
}

export async function sendFeedbackEmail(
  input: FeedbackInput,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'SUNBOO経営ナビ <feedback@sunboo-keiei.com>',
      to: [FEEDBACK_EMAIL],
      reply_to: input.email,
      subject: `【SUNBOO経営ナビ】${input.name}さんからのご意見`,
      text: `お名前: ${input.name}\nメールアドレス: ${input.email}\n\n${input.message}`,
      html: `<p><strong>お名前:</strong> ${escapeHtml(input.name)}</p><p><strong>メールアドレス:</strong> ${escapeHtml(input.email)}</p><hr><p>${escapeHtml(input.message).replace(/\n/g, '<br>')}</p>`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend API error: ${response.status}`);
  }
}

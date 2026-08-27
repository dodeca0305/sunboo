import { sendFeedbackEmail, validateFeedback } from '@/lib/feedbackEmail';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const input = validateFeedback(await request.json());

    // Botだけが埋める隠し項目。成功扱いにして送信は行わない。
    if (input.website) {
      return Response.json({ ok: true });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY is not configured');
      return Response.json(
        { error: '現在送信できません。時間をおいて再度お試しください。' },
        { status: 503 },
      );
    }

    await sendFeedbackEmail(input, apiKey);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: '入力内容を確認してください。' }, { status: 400 });
    }
    if (error instanceof Error && !error.message.startsWith('Resend API error:')) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error('Feedback email failed', error);
    return Response.json(
      { error: '送信に失敗しました。時間をおいて再度お試しください。' },
      { status: 502 },
    );
  }
}

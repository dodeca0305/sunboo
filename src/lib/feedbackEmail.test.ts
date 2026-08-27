import assert from 'node:assert/strict';
import test from 'node:test';
import { sendFeedbackEmail, validateFeedback } from './feedbackEmail.ts';

test('フィードバック入力を検証して前後の空白を除去する', () => {
  assert.deepEqual(
    validateFeedback({ name: ' せいや ', email: ' test@example.com ', message: ' テスト ', website: '' }),
    { name: 'せいや', email: 'test@example.com', message: 'テスト', website: '' },
  );
});

test('不正なメールアドレスを拒否する', () => {
  assert.throws(
    () => validateFeedback({ name: 'せいや', email: 'invalid', message: 'テスト' }),
    /メールアドレス/,
  );
});

test('Resendへ認証付きリクエストを送りHTMLをエスケープする', async () => {
  let request: RequestInit | undefined;
  await sendFeedbackEmail(
    { name: '<せいや>', email: 'test@example.com', message: '<script>alert(1)</script>' },
    're_test',
    async (_url, init) => {
      request = init;
      return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
    },
  );
  assert.equal((request?.headers as Record<string, string>).Authorization, 'Bearer re_test');
  const body = JSON.parse(request?.body as string) as { html: string; to: string[] };
  assert.deepEqual(body.to, ['sunboo.hasegawa@gmail.com']);
  assert.match(body.html, /&lt;script&gt;/);
  assert.doesNotMatch(body.html, /<script>/);
});

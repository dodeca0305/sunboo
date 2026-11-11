#!/usr/bin/env python3
"""Start one explicitly assigned local task; check/dry-run never request a model."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
TASK = 'docs/ai/current-task.json'
API_ENV = ('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
           'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK',
           'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY')


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).rstrip('\n')


def load_task():
    task = json.loads((ROOT / TASK).read_text(encoding='utf-8'))
    if not isinstance(task, dict):
        raise ValueError('依頼ファイルの形式を確認してください。')
    if task.get('status') == 'idle':
        return None
    if task.get('status') != 'ready':
        raise ValueError('依頼がreadyではありません。')
    if not all(isinstance(task.get(k), str) and task[k].strip() for k in ('id', 'goal')):
        raise ValueError('依頼IDと目的が必要です。')
    if not isinstance(task.get('baseSha'), str) or not re.fullmatch(r'[0-9a-f]{40}', task['baseSha']):
        raise ValueError('基点SHAが必要です。')
    for key in ('files', 'acceptance', 'checks'):
        if not isinstance(task.get(key), list) or not task[key] or not all(
                isinstance(x, str) and x.strip() for x in task[key]):
            raise ValueError('対象ファイル・完了条件・確認方法を指定してください。')
    for name in task['files']:
        path = Path(name)
        if path.is_absolute() or '..' in path.parts or not (ROOT / path).resolve().is_relative_to(ROOT):
            raise ValueError('対象ファイルはこの作業コピー内に限定してください。')
        if any(part.startswith('.env') or part in ('.git', '.auth', '.aws', '.codex', '.claude') for part in path.parts):
            raise ValueError('秘密・認証・管理情報は依頼対象にできません。')
    return task


def auth_status(cli):
    result = subprocess.run([cli, 'auth', 'status'], cwd=ROOT, text=True,
                            capture_output=True, timeout=20)
    try:
        status = json.loads(result.stdout)
    except (ValueError, TypeError):
        raise ValueError('認証状態を確認できません。本人のターミナルで確認してください。')
    if not isinstance(status, dict) or not status.get('loggedIn') or status.get('authMethod') != 'claude.ai' or status.get('apiProvider') != 'firstParty':
        raise ValueError('claude.aiのログインを確認できません。APIへ切り替えず停止します。')
    return status


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true', help='CLIと認証だけを確認')
    mode.add_argument('--dry-run', action='store_true', help='依頼の検査だけ。AIを起動しない')
    args = parser.parse_args(argv)
    try:
        if args.check:
            if any(os.environ.get(k) for k in API_ENV):
                raise ValueError('API/provider指定を検出しました。値を表示せず停止します。')
            cli = shutil.which('claude')
            if not cli:
                raise ValueError('Claude Codeが見つかりません。')
            version = subprocess.check_output([cli, '--version'], text=True, timeout=20).strip()
            auth_status(cli)
            print(version + '\nclaude.ai login: OK; model requests: 0')
            return 0
        task = load_task()
        if task is None:
            print('IDLE: 未割当のためAIを起動しません。')
            return 0
        if git('rev-parse', 'HEAD') != task['baseSha']:
            raise ValueError('基点SHAが現在のHEADと異なります。依頼を更新してください。')
        if not git('branch', '--show-current').startswith('codex/'):
            raise ValueError('実装用codex/ブランチで起動してください。')
        dirty = git('status', '--porcelain=v1', '--untracked-files=all')
        if any(line[3:] not in (TASK, 'node_modules') for line in dirty.splitlines()):
            raise ValueError('依頼ファイル以外の未コミット変更があります。保護してから開始してください。')
        if args.dry_run:
            print('SCOPE_OK: ' + task['id'] + '; files=' + str(len(task['files'])) + '; model requests: 0')
            return 0
        if task.get('extraUsageDisabledConfirmed') is not True:
            raise ValueError('同じClaudeアカウントの追加利用課金がOFFと確認できるまで起動しません。')
        if any(os.environ.get(k) for k in API_ENV):
            raise ValueError('API/provider指定を検出しました。値を表示せず停止します。')
        cli = shutil.which('claude')
        if not cli:
            raise ValueError('Claude Codeが見つかりません。')
        auth_status(cli)
        prompt = ('SUNBOOの指定1件を実装してください。AGENTS.mdとCLAUDE.mdに従い、'
                  '必要なファイルだけ確認してください。push/PR/マージ/本番操作はCodex担当です。'
                  '完了後はdocs/ai/LAST_RESULT.mdへ短く記録して停止してください。\n依頼:\n'
                  + json.dumps(task, ensure_ascii=False))
        os.chdir(ROOT)
        os.execv(cli, [cli, '--model', 'sonnet', '--effort', 'medium',
                      '--permission-mode', 'manual', '--strict-mcp-config',
                      '--mcp-config', '{"mcpServers":{}}', prompt])
        return 0
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        # Never print captured auth output, environment values, or a traceback.
        print('停止: ' + (str(error) if isinstance(error, ValueError) else '起動前の確認に失敗しました。'), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

"""Launcher guards; no real CLI, authentication, network, or model requests."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('claude_task', Path(__file__).parents[1] / 'claude_task.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class LauncherGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        (self.root / 'docs/ai').mkdir(parents=True)
        self.task = dict(status='ready', id='synthetic', baseSha='a' * 40,
                         goal='Synthetic only', files=['src/new.ts'],
                         acceptance=['Synthetic acceptance'], checks=['Synthetic check'])
        self.auth = dict(loggedIn=True, authMethod='claude.ai', apiProvider='firstParty')
        self.branch, self.dirty, self.head = 'codex/synthetic', '', 'a' * 40

    def tearDown(self):
        self.temp.cleanup()

    def run_launcher(self, args=(), env=None):
        (self.root / launcher.TASK).write_text(json.dumps(self.task))
        def git(*args):
            return self.head if args[0] == 'rev-parse' else self.branch if args[0] == 'branch' else self.dirty
        output = io.StringIO()
        with patch.object(launcher, 'ROOT', self.root), patch.object(launcher, 'git', side_effect=git), \
                patch.dict(launcher.os.environ, env or {}, clear=True), \
                patch.object(launcher.shutil, 'which', return_value='/synthetic/claude'), \
                patch.object(launcher, 'auth_status', return_value=self.auth) as auth, \
                patch.object(launcher.os, 'chdir'), patch.object(launcher.os, 'execv') as execute, \
                contextlib.redirect_stderr(output), contextlib.redirect_stdout(output):
            code = launcher.main(list(args))
        return code, output.getvalue(), auth, execute

    def test_idle_does_not_authenticate_or_start(self):
        self.task = {'status': 'idle'}
        code, _, auth, execute = self.run_launcher()
        self.assertEqual(code, 0)
        auth.assert_not_called()
        execute.assert_not_called()

    def test_dry_run_checks_assignment_without_auth_or_model(self):
        self.dirty = ' M docs/ai/current-task.json\n?? node_modules'
        code, _, auth, execute = self.run_launcher(['--dry-run'])
        self.assertEqual(code, 0)
        auth.assert_not_called()
        execute.assert_not_called()

    def test_stale_base_stops(self):
        self.head = 'b' * 40
        self.assertEqual(self.run_launcher()[0], 1)

    def test_main_branch_stops(self):
        self.branch = 'main'
        self.assertEqual(self.run_launcher()[0], 1)

    def test_uncommitted_implementation_stops(self):
        self.dirty = ' M src/important.ts'
        code, _, auth, execute = self.run_launcher()
        self.assertEqual(code, 1)
        auth.assert_not_called()
        execute.assert_not_called()

    def test_api_environment_stops_without_exposing_value(self):
        code, output, auth, execute = self.run_launcher(env={'ANTHROPIC_API_KEY': 'secret-synthetic-value'})
        self.assertEqual(code, 1)
        self.assertNotIn('secret-synthetic-value', output)
        auth.assert_not_called()
        execute.assert_not_called()

    def test_outside_or_secret_paths_stop(self):
        for path in ('../private.ts', '/tmp/private.ts', '.env.local', '.git/config', '.claude/settings.local.json', 'playwright/.auth/session.json'):
            with self.subTest(path=path):
                self.task['files'] = [path]
                self.assertEqual(self.run_launcher()[0], 1)

    def test_ready_uses_manual_balanced_session_without_production_mcp(self):
        code, _, auth, execute = self.run_launcher()
        self.assertEqual(code, 0)
        auth.assert_called_once()
        argv = execute.call_args.args[1]
        self.assertEqual(argv[argv.index('--model') + 1], 'sonnet')
        self.assertEqual(argv[argv.index('--permission-mode') + 1], 'manual')
        self.assertEqual(argv[argv.index('--mcp-config') + 1], '{"mcpServers":{}}')
        self.assertIn('--strict-mcp-config', argv)
        self.assertNotIn('--dangerously-skip-permissions', argv)

    def test_real_auth_gate_rejects_api_and_invalid_metadata(self):
        for status in ({'loggedIn': False}, {'loggedIn': True, 'authMethod': 'api_key'}, []):
            with self.subTest(status=status), patch.object(launcher.subprocess, 'run') as run:
                run.return_value.stdout = json.dumps(status)
                with self.assertRaises(ValueError):
                    launcher.auth_status('/synthetic/claude')


if __name__ == '__main__':
    unittest.main()

"""Apply the bounded local setup and transport patch to the exact pinned review action."""
import hashlib
import subprocess
import sys
from pathlib import Path

PIN = '8b2c7277772d514218a2e16e52b17c6e4619f425'
ACTION_SHA256 = '03f0850ee52cf22c72536a6216070d1379ba77925293ae095f046b293e35285b'
SOURCE_SHA256 = 'becbe7b19144b31504928260ee9dc6fff083fdb74aab6fdb344450bba4066b8a'


def prepare(action_dir: Path) -> None:
    revision = subprocess.run(['git', '-C', str(action_dir), 'rev-parse', 'HEAD'],
                              check=True, capture_output=True, text=True).stdout.strip()
    if revision != PIN:
        raise ValueError('Security action checkout does not match the reviewed pin')
    source = action_dir / 'claudecode/github_action_audit.py'
    if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError('Security action source differs from the reviewed patch target')
    if hashlib.sha256((action_dir / 'action.yml').read_bytes()).hexdigest() != ACTION_SHA256:
        raise ValueError('Security action setup differs from the reviewed patch target')
    patch = Path(__file__).with_name('action.patch').resolve()
    command = ['git', '-C', str(action_dir), 'apply', '--whitespace=error']
    subprocess.run([*command, '--check', str(patch)], check=True)
    subprocess.run([*command, str(patch)], check=True)


if __name__ == '__main__':
    prepare(Path(sys.argv[1]).resolve())

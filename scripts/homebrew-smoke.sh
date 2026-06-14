#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "JSON.parse(require('fs').readFileSync('$ROOT/package.json','utf8')).version")"

host_label() {
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) echo "darwin-arm64" ;;
    Darwin-x86_64) echo "darwin-x64" ;;
    Linux-aarch64|Linux-arm64) echo "linux-arm64" ;;
    Linux-x86_64) echo "linux-x64" ;;
    *) echo "unsupported" ;;
  esac
}

LABEL="$(host_label)"
if [[ "$LABEL" == "unsupported" ]]; then
  echo "Unsupported Homebrew smoke host: $(uname -s)-$(uname -m)" >&2
  exit 1
fi

TARBALL="${1:-$ROOT/artifacts/spec-reviewer-v$VERSION-$LABEL.tar.gz}"
if [[ ! -f "$TARBALL" ]]; then
  echo "Missing release tarball: $TARBALL" >&2
  exit 1
fi

TMPDIR="$(mktemp -d)"
DEVELOPER_WAS_ON=0
if brew developer 2>/dev/null | grep -q "enabled"; then
  DEVELOPER_WAS_ON=1
fi

cleanup() {
  brew uninstall --force spec-reviewer-smoke >/dev/null 2>&1 || true
  brew untap local/spec-reviewer-smoke >/dev/null 2>&1 || true
  if [[ "$DEVELOPER_WAS_ON" != "1" ]]; then
    brew developer off >/dev/null 2>&1 || true
  fi
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

SHA="$(shasum -a 256 "$TARBALL" | awk '{print $1}')"
FORMULA="$TMPDIR/spec-reviewer-smoke.rb"
cat > "$FORMULA" <<RUBY
class SpecReviewerSmoke < Formula
  desc "Local-first Markdown spec reviewer for source-anchored agent feedback"
  homepage "https://github.com/acartag7/spec-reviewer"
  version "$VERSION"
  license "MIT"
  url "file://$TARBALL"
  sha256 "$SHA"

  def install
    bin.install "spec-reviewer" => "spec-reviewer-smoke"
    prefix.install "README.md", "LICENSE", "VERSION", "release.json"
  end

  test do
    output = shell_output("#{bin}/spec-reviewer-smoke sessions --json --storage-dir #{testpath}/state")
    assert_match "\\"sessions\\"", output
  end
end
RUBY

brew uninstall --force spec-reviewer-smoke >/dev/null 2>&1 || true
brew untap local/spec-reviewer-smoke >/dev/null 2>&1 || true
brew tap-new local/spec-reviewer-smoke >/dev/null
TAP_REPO="$(brew --repo local/spec-reviewer-smoke)"
cp "$FORMULA" "$TAP_REPO/Formula/spec-reviewer-smoke.rb"
brew install local/spec-reviewer-smoke/spec-reviewer-smoke
brew test local/spec-reviewer-smoke/spec-reviewer-smoke

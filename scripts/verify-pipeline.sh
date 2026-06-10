#!/bin/bash
set -eu

# Move to the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "=== E2E Pipeline Verification Start ==="

# Clean state
echo "[1/7] Cleaning previous test state..."
rm -rf vuln-patch-agent-test/state
mkdir -p vuln-patch-agent-test/state

# Start mock NVD server
echo "[2/7] Starting mock NVD API server..."
python3 -m http.server 8000 --directory vuln-patch-agent-test >/dev/null 2>&1 &
SERVER_PID=$!

cleanup() {
    echo "[Cleanup] Terminating mock NVD API server (PID: $SERVER_PID)..."
    kill $SERVER_PID 2>/dev/null || true
}
trap cleanup EXIT

# Wait for server to start
sleep 2

# Path to python script
AGENT_PY="vuln-patch-agent_0.1.0/usr/lib/vuln-patch-agent/patch_agent.py"
CONFIG="vuln-patch-agent-test/config.json"

# 1. init-db
echo "[3/7] Running init-db..."
python3 "$AGENT_PY" --config "$CONFIG" init-db

# 2. sync-nvd
echo "[4/7] Running sync-nvd..."
python3 "$AGENT_PY" --config "$CONFIG" sync-nvd

# 3. import-oval
echo "[5/7] Running import-oval..."
python3 "$AGENT_PY" --config "$CONFIG" import-oval --file vuln-patch-agent-test/sample.oval.xml

# 4. scan
echo "[6/7] Running scan..."
python3 "$AGENT_PY" --config "$CONFIG" scan

# 5. patch --dry-run
echo "[7/7] Running patch --dry-run..."
python3 "$AGENT_PY" --config "$CONFIG" patch --dry-run

# 6. report
echo "[8/8] Running report..."
python3 "$AGENT_PY" --config "$CONFIG" report

echo "=== E2E Pipeline Verification Completed ==="

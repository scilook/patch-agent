#!/bin/sh
set -eu

PATCH_AGENT_BIN="${PATCH_AGENT_BIN:-/usr/bin/patch-agent}"
CONFIG_PATH="/etc/vuln-patch-agent/config.json"
API_KEY_ENV="NVD_API_KEY"
AGENT_USER="patch-agent"
PATCH_MODE="none"
DO_REPORT=1
SINCE=""
MAX_PAGES=""
OVAL_FILE=""
RUN_OUTPUT=""
REPORT_OUTPUT=""

usage() {
    cat <<'EOF'
Usage: auto-update.sh [options]

Runs patch-agent sync + scan (and optional patch) and then report.

Options:
  --config <path>         Config path (default: /etc/vuln-patch-agent/config.json)
  --since <iso8601>       Override NVD lastModStartDate
  --max-pages <n>         Limit NVD pages for controlled sync
  --oval-file <path>      Optional Ubuntu OVAL XML for alias import
  --patch                Include patch step (defaults to --dry-run)
  --dry-run              Patch step in dry-run mode
  --apply                Patch step with real upgrades
  --output <path>         Save pipeline JSON output
  --report-output <path>  Save report JSON output
  --no-report             Skip report step
  -h, --help              Show this help

Environment:
  NVD_API_KEY             NVD API key (optional; higher rate limits)
  PATCH_AGENT_BIN         Override patch-agent binary (default: /usr/bin/patch-agent)
EOF
}

run_patch_agent() {
    if [ ! -x "$PATCH_AGENT_BIN" ]; then
        echo "error: patch-agent not found at $PATCH_AGENT_BIN" >&2
        exit 1
    fi

    if [ "$(id -u)" -eq 0 ] && command -v runuser >/dev/null 2>&1; then
        runuser -u "$AGENT_USER" -- "$PATCH_AGENT_BIN" "$@"
    else
        "$PATCH_AGENT_BIN" "$@"
    fi
}

while [ $# -gt 0 ]; do
    case "$1" in
        --config)
            CONFIG_PATH="$2"
            shift 2
            ;;
        --since)
            SINCE="$2"
            shift 2
            ;;
        --max-pages)
            MAX_PAGES="$2"
            shift 2
            ;;
        --oval-file)
            OVAL_FILE="$2"
            shift 2
            ;;
        --output)
            RUN_OUTPUT="$2"
            shift 2
            ;;
        --report-output)
            REPORT_OUTPUT="$2"
            shift 2
            ;;
        --patch)
            PATCH_MODE="dry-run"
            shift
            ;;
        --dry-run)
            PATCH_MODE="dry-run"
            shift
            ;;
        --apply)
            PATCH_MODE="apply"
            shift
            ;;
        --no-report)
            DO_REPORT=0
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "error: unknown option $1" >&2
            usage
            exit 2
            ;;
    esac
done

if [ -z "${NVD_API_KEY:-}" ]; then
    echo "warning: NVD_API_KEY is not set; unauthenticated requests are rate-limited" >&2
fi

set -- --config "$CONFIG_PATH" run --api-key-env "$API_KEY_ENV"

if [ -n "$SINCE" ]; then
    set -- "$@" --since "$SINCE"
fi

if [ -n "$MAX_PAGES" ]; then
    set -- "$@" --max-pages "$MAX_PAGES"
fi

if [ -n "$OVAL_FILE" ]; then
    set -- "$@" --oval-file "$OVAL_FILE"
fi

if [ -n "$RUN_OUTPUT" ]; then
    set -- "$@" --output "$RUN_OUTPUT"
fi

if [ "$PATCH_MODE" != "none" ]; then
    set -- "$@" --patch
    if [ "$PATCH_MODE" = "dry-run" ]; then
        set -- "$@" --dry-run
    fi
fi

run_patch_agent "$@"

if [ "$DO_REPORT" -eq 1 ]; then
    set -- --config "$CONFIG_PATH" report
    if [ -n "$REPORT_OUTPUT" ]; then
        set -- "$@" --output "$REPORT_OUTPUT"
    fi
    run_patch_agent "$@"
fi

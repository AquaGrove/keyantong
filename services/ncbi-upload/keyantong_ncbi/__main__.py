"""CLI: validate stdin JSON, or run/dry-run local ascp."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .runner import prepare_and_run
from .validators import validate_submission


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="keyantong-ncbi")
    p.add_argument("--payload", type=Path, help="JSON payload file (default: stdin)")
    p.add_argument("--outdir", type=Path, default=Path("ncbi_run_out"))
    p.add_argument("--run", action="store_true", help="Execute ascp (default is dry-run / validate-only)")
    p.add_argument("--dry-run", action="store_true", help="Force dry-run after validation")
    p.add_argument("--validate-only", action="store_true", help="Only validate, no status runner")
    p.add_argument("--ascp-bin", default=None, help="Optional path to ascp binary")
    args = p.parse_args(argv)

    if args.payload:
        payload = json.loads(args.payload.read_text(encoding="utf-8"))
    else:
        payload = json.load(sys.stdin)

    if args.validate_only:
        print(json.dumps(validate_submission(payload).to_dict(), ensure_ascii=False, indent=2))
        return 0

    dry = True
    if args.run and not args.dry_run:
        dry = False
    if args.dry_run:
        dry = True

    st = prepare_and_run(payload, outdir=args.outdir, dry_run=dry, ascp_bin=args.ascp_bin)
    print(json.dumps(st.to_dict(), ensure_ascii=False, indent=2))
    return 0 if st.ok or st.status == "dry_run" else 1


if __name__ == "__main__":
    raise SystemExit(main())

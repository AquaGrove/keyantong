"""Worker entrypoint. `run` is the analysis job; `ncbi` prepares an upload; `pca` is the older plot-only CLI."""

import sys


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args or args[0] in {"-h", "--help"}:
        print("usage: python -m rnaseq_viz run | ncbi | pca", file=sys.stderr)
        return 2
    command, rest = args[0], args[1:]
    if command == "run":
        from rnaseq_viz.pipeline import main as run_main

        return run_main(rest)
    if command == "ncbi":
        from rnaseq_viz.ncbi_prepare import main as ncbi_main

        return ncbi_main(rest)
    if command == "pca":
        from rnaseq_viz.pca import main as pca_main

        return pca_main(rest)
    if command.startswith("-"):
        from rnaseq_viz.pca import main as pca_main

        return pca_main(args)
    print(f"未知命令: {command}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

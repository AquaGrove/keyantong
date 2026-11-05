---
name: ncbi-local-upload
description: Prepare and carry out a local NCBI SRA submission workflow using the user's logged-in browser, local Aspera installation, private-key download, file manifest, resumable transfer, and separate submission verification. Use for 科研通 NCBI 自动上传、SRA 提交、Aspera 本机传输及故障恢复；do not treat GEO, dbGaP or assembled genomes as this workflow.
---

Use the repository's local assistant, not the portal server, for browser credentials, installer operations, hashing and transfer. Read [the workflow design](../../docs/29-ncbi-automation.md) for the state/evidence contract and supported limitations. Read [the local service guide](../../services/ncbi-upload/README.md) for setup and commands.

## Operate

1. Establish the intended account, data directory, sample/experiment mappings, existing BioProject/BioSamples, and release date. Reuse existing submissions when appropriate; do not create duplicates while retrying.
2. Inspect the current authenticated SRA page. On 2026-11-05 the SRA home page exposes “Upload via Aspera command line or FTP” → “Aspera command line instructions”: download `/preload/aspera_key/` and capture the current command's `uploads/<account>` directory. Re-inspect if wording changes; no account-specific values belong in the skill or source code.
3. Download the key in the user's browser session and import it into the local assistant's credentials directory with owner-only permissions. Never send passwords, cookies or key contents to the portal or an LLM. Keep keys outside the upload directory.
4. Run local `doctor`. Missing ascp → discover the installer from IBM's official download page for the actual OS/architecture, verify the platform signature where supported, then open the native installer. User completes vendor licensing, elevation and login/MFA prompts. Do not guess ARM compatibility or silently install Rosetta.
5. Generate a dedicated file manifest and local dry-run. Exact filenames, sizes, MD5, SHA-256 and source modification times bind a transfer plan to a destination. The directory must contain only listed regular data files, with no keys, symlinks or unrelated subfolders.
6. Present the concrete transfer plan. After user confirmation, start the native task. Arguments are passed directly to ascp, never through shell evaluation. On failure retain the same task/target and use `-k1` resumption after checking the plan; do not blindly recreate or repeatedly upload.
7. ascp exit 0 means **transfer completed**, not SRA submission complete. Wait for the preload directory to appear in NCBI Files (the current page says at least around 10 minutes); check filenames, sizes/checksums where available, metadata mappings and release date.
8. Fill only uniquely matched fields in the verified current page. Unsupported tables, missing fields or ambiguous selectors pause for user correction. Never guess biological attributes or click final Submit to test a selector.
9. User reviews and performs final submission. Record the observed SUB ID and processing state locally; final accessions require NCBI processing evidence. Keep final submission, processing, rejection and accession assignment distinct.

## Report

State exactly which steps were observed or executed, what still needs the user, and whether transfer/submission/accession status is verified. A generated helper pack, UI checkmark or offline test is not evidence of a real upload. Development preview currently supports local transfer orchestration and conservative current-step field filling; complete multi-step Portal automation and signed public installers require further live acceptance.

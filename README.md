    # Sley LSP

    Language server scaffold for diagnostics, formatting, symbols, hover, and checked repair previews.

Status: private Sley ecosystem scaffold. This repository is intentionally
built as a detailed starting point before public release.

Implementation reality: Sley-native source-of-truth is now in `src/tool.sley`; current Node LSP host is temporary until a Sley emit target is ready.

    ## Why This Exists

    Sley is an agent-native structural language. Source remains the human review
    projection, while the compiler exposes stable JSON surfaces for graph,
    lint, query, edit planning, verification, trace receipts, and ZJX handoff.

    `sley-lsp` exists to make that loop easier for application developers and agent operators.

    ## Current Scope

    - Priority: `P0 scaffold`
    - Utility class: `language server`
    - Default mode: local and deterministic
    - Write mode: disabled unless explicitly documented by the command
    - Network calls: none in tests or examples
    - Provider, deploy, spend, wallet, and secret access: not used

    ## Quick Start

    ```bash
    make smoke
    ```

    Useful commands:

    - `sley-lsp --stdio`
- `sley check --json <target>`
- `sley plan --json --graft-templates <target>`

    ## Consumed Sley Contracts

    This tool treats Loom, the Sley compiler, as the oracle. It consumes these
    Sley surfaces instead of duplicating compiler logic:

    - `sley.diagnostics.report.v0`
- `sley.query.report.v0`
- `sley.edit_plan.report.v0`
- `sley.graft.outcome.v0`

    Details live in [`docs/contracts.md`](docs/contracts.md).

    ## Repository Layout

    - `assets/branding/` - repo mark, social card, banner, and generated PNGs
    - `docs/` - architecture, contract, brand, and SEO notes
    - `examples/` - minimal Sley fixtures for local smoke work
    - `test/` - smoke tests that avoid network and external systems
    - `Makefile` - `fmt`, `test`, and `smoke` entry points

    Includes a minimal JSON-RPC stdio server scaffold that shells to the local `sley` binary.

    ## Release Policy

    This repository stays private until:

    - consumed Sley schema versions are declared;
    - deterministic local tests pass;
    - examples work against the current Sley compiler;
    - public-use branding is reviewed;
    - docs avoid private local paths;
    - write paths, if any, preview through `sley fix --dry-run` or
      `sley graft --dry-run` before mutation.

    ## SEO Surface

    Draft SEO title: `Sley LSP - Sley developer tooling`

    Draft description: Connect Sley editor diagnostics, formatting, symbols, hover, and non-mutating checked repair previews to existing compiler JSON reports.

    Future canonical URL: `https://sley.greyforge.tech/tools/sley-lsp`

    GitHub URL while private: `https://github.com/GreyforgeLabs/sley-lsp`

    ## License

    MIT. See [`LICENSE`](LICENSE).

    Autonomy, Engineered.

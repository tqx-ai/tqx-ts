# MCP icons

The server, its nine tools, two prompts, and two strategy resource templates use
48 x 48 PNG icons embedded as `data:` URIs.
Each icon has a near-black (`#030303`) background. The server keeps the original
white TQX logomark; tool, prompt, and resource artwork uses TQX yellow (`#ffff3a`). Icons
keep the same appearance on light and dark client backgrounds.
The PNGs total less than 5 KB before Base64 encoding and require no image host.

The editable SVGs are the source artwork. After changing an SVG, export its PNG
at 48 x 48, preserving transparency around the rounded corners. Runtime code
loads the PNGs once from this directory; Docker already copies the whole `src`
tree. Clients decide whether to render the advertised icons.

The `inspect_strategy` prompt reuses `research-explore`, and `prepare_bug_report`
reuses `bug-report`. Both are advertised in `prompts/list`.

The `qube_strategy` and `qube_strategy_version` resource templates also reuse
`research-explore`. Their icons are advertised in `resources/templates/list`;
individual strategy instances are not enumerated in `resources/list`.

## Artwork sources

- `tqx`: the existing TQX website logomark in its original white.
- `research-explore`: the existing TQX website Qube navigation icon.
- The remaining icons reuse Tabler Icons 3.51.0, the icon library used by the TQX
  website, with 1.5 px strokes on a 24 x 24 inner canvas. Tabler's MIT license is
  preserved in [LICENSE.tabler](LICENSE.tabler).

| Icon          | Tabler source         |
| ------------- | --------------------- |
| snapshot      | Wallet                |
| activity      | ChartLine             |
| lookup        | Search                |
| order         | ArrowsExchange        |
| control       | AdjustmentsHorizontal |
| bug-report    | Bug                   |
| ping          | Activity              |
| research-call | Flask                 |

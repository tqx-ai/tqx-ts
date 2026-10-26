# Integration environment compatibility review

2026-10-26 later client evidence: Root's current CLI LAN OAuth discovery is blocked even with
the helper/server opt-in. Both LAN-resource combinations stop before AS metadata; all-loopback
only reaches an authorize URL and is deliberately denied. DEPLOYMENT_ENVIRONMENTS.md records
the evidence and a not-yet-executed test loopback SSH-forwarding plan. No original validation,
helper program, personal connection, forwarding or deployed service is changed by this note.
Shared acceptance is currently installation/OAuth/user Agent binding only; WRITE false, no
real Trading connection, account/tool verification or trading. Earlier fixture passes below
retain their original scope and are not promoted to direct LAN client acceptance.

2026-10-26 addendum: the historical compatibility review below describes the earlier
selector revision. The human has now authorized a narrow callback-helper HTTP exception:
existing effective TQX_ENV=test and exact canonical RFC1918 TQX_TEST_HTTP_ORIGINS only.
Other profiles retain the original transport checks, and all issuer/resource/state/Origin/
PKCE and local callback rules remain. See DEPLOYMENT_ENVIRONMENTS.md and
evidence/test-http-helper-20261026.json; no deployment or personal login was performed.

Scope: this round's Codex selector, templates and standalone MD only. The Owner
relayed the human's instruction to preserve earlier defaults and not introduce
broad new rules without asking. All changes below are local source/documentation;
no profile, credential, installed plugin, B harness, service or production endpoint
was changed. The initial stricter proposal was not installed or deployed.

| Initial new restriction                                                         | Compatible final behavior                                               | Impact/source                                                                                              |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Environment argument mandatory                                                  | Existing label or local default; local/test/prod are choices            | Withdrawn selector-only gate; NODE_ENV remains separate                                                    |
| Reject unrecognized labels                                                      | Preserve legacy labels such as dev-pro and display them                 | No forced rename of existing environment configuration                                                     |
| test/prod require every URL externally                                          | Explicit value > existing public setting > known local default          | Missing remote details do not block the original flow; effective URLs are displayed                        |
| prod must HTTPS and nonloopback                                                 | No environment-dependent URL rejection in selector                      | Withdrawn new deployment policy; original client/service authentication still applies                      |
| local must 127.0.0.1 with port                                                  | Existing/explicit local settings retained                               | No new locality policy imposed by source generation                                                        |
| Reject noncanonical URLs, different /mcp or issuer/Web shapes before generation | Selector carries effective existing/explicit values                     | Original client/service checks run in their original place; no new deployment startup gate                 |
| A complete new binding manifest is required for reuse                           | Comparison is advisory; missing manifest/differences are displayed      | Existing connections do not need a new marker or manifest                                                  |
| Always use environment/hash server/plugin/marketplace IDs                       | Suggested only for a new source; existing names/version can be supplied | No mandatory authentication-slot or token migration                                                        |
| Existing local must upgrade to source0.3.0                                      | Retain existing0.2.0 or supplied normal version                         | New source version is not an upgrade instruction                                                           |
| Output path must be absolute/outside hardcoded directories/new and empty        | Relative/existing directories accepted; matching files reused           | Explicit source generation only; does not select or change a user profile                                  |
| Conflicting source aborts generation                                            | Preserve original files and return a separate child source              | No overwrite, deletion or blocking of an existing client                                                   |
| Ask the user to configure backend API audience/base for a client plugin         | Only client MCP/issuer/Web values are used                              | API audience8102/api, Trading base8102 and Web Java18080 are documented separately, not user prerequisites |

Preserved requirements and their existing source:

| Requirement                                                                                                           | Existing source / reason                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Exact callback nonce, state and issuer; unique parameters; one transaction; native PKCE/exchange/storage              | callback-proxy.ts and callback-login.ts existed before this environment round; bytes unchanged                            |
| Helper's HTTPS-or-explicit-loopback URL validation, exact issuer/resource/Web shape                                   | Existing trustedServiceUrl/authorization callback checks; applies to that helper, not a new application deployment policy |
| Real human consent; no impersonated approval; CLI0 before presenting login success; actual read verification separate | Earlier standalone installation/auth handoff, unchanged security semantics                                                |
| Portable schema discriminators and supported bare mcp.json                                                            | Actual installed loader observation: omitted schema caused local/notfound; same-ID correction restored it                 |
| Normal CLI argument syntax, JSON and filesystem errors                                                                | Source-tool mechanics, not additional deployment gates                                                                    |
| Preserve unrelated files, profiles and credentials                                                                    | Original task scope and user intent; selector does not install or migrate authentication                                  |

Configuration changes with wider impact, such as replacing an existing server URL,
forcing new authentication storage or changing deployed validation, are not applied.
They require an original-behavior to proposed-change/impact discussion with the human
before implementation, as the user instructed. No such new change is included here.

Regression changes replace prior rejection expectations with compatibility checks:
omitted environment, missing/partial test/prod settings, prod-loopback and legacy
HTTP/path inputs, legacy labels/aliases/version, advisory missing binding, source
reuse/conflict preservation, and exact two-code-block/three-template MD integrity.
No live check, new login, installation, service restart or production call is needed.

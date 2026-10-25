# TQX Codex installation guide kit

Give INSTALL_WITH_CODEX.md to your Codex and say: "Connect me to my TQX MCP service;
preserve my existing configuration and let me complete my own consent."
The single MD contains all code. The two .mjs files are identical convenience copies,
not additional required downloads. No TQX repository, Bun or node_modules is needed.

You still need an installed supported Codex client, Node22.18+ for the standalone
helpers, and an actual reachable TQX service. If you have no existing connection,
provide its MCP URL or confirm that your own service runs on this same computer.
The guide's 127.0.0.1 addresses are local examples, not a public TQX deployment.
local/test/prod are configuration choices; their names do not create those services.

PUBLIC-CONNECTION.example.json is only a blank public configuration worksheet.
Populate known fields from your service or existing public config, or omit unused
fields; do not paste OAuth tokens, private keys or passwords. Unknown deployment
addresses remain provider dependencies. A selector plan does not install or log in.

Existing plugin names, versions and authentication remain in place unless you
request an actual change. The assistant first checks supported CLI installation and
authentication status. When consent is needed, it gives you one real consent entry
and waits for your response. A webpage click alone is not confirmed login; actual
client completion and account/position tool calls are separate checks.

Windows: use argument arrays or properly quoted paths; spaces/non-ASCII paths are
supported by the verified standalone programs. If a Node child cannot launch a
shell-only codex.cmd shim, pass the actual installed native Codex executable with
the helper's --codex-bin option, or retain the normal supported client login path.
Do not copy this kit author's executable path or download an unverified binary.
The current test host is Windows; Linux/macOS execution was not directly tested.

CHECKSUMS.json identifies the exact delivered bytes. This ZIP is an onboarding guide
kit, not a plugin ZIP for directory upload and not a cloud/tunnel deployment. The
selector can generate a local marketplace source once the actual target is known.

Remaining external dependencies are the provider's reachable MCP resource, its
working OAuth/consent service, real Agent/account access and a client/browser able
to reach the selected callback. Remote/cloud hosts do not automatically share your
computer's localhost. No real broker, public deployment or fresh human consent was
established by this kit's synthetic cold-start tests.

Official sources checked for the installed client's supported workflow:
[plugin packages](https://developers.openai.com/plugins/build/plugins),
[MCP/OAuth](https://learn.chatgpt.com/docs/extend/mcp),
[CLI](https://learn.chatgpt.com/docs/cli/reference).

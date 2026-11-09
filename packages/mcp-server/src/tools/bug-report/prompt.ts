import type { McpServer } from '@modelcontextprotocol/server'

export function registerBugReportPrompt(server: McpServer): void {
  server.registerPrompt(
    'prepare_bug_report',
    {
      title: 'Prepare a bug report',
      description:
        'Investigate the reported problem, determine ownership, and submit a TQX bug report when the evidence shows it is a TQX issue.',
    },
    () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              'First investigate the reported problem and determine whether the responsibility belongs to TQX, the broker, the user request parameters, or another dependency.',
              'Only continue gathering evidence and sending a bug report when the evidence shows that the issue is caused by TQX. Do not classify a broker rejection as a product bug without evidence.',
              'After organizing the evidence, call submit_bug_report directly; do not stop at a draft or confirmation step.',
              'Use a short, specific title. Write description as well-structured Markdown containing reproduction steps, environment, complete request parameters, complete response fields and values, and request_id when available.',
              "Match the user's language and writing system in all user-facing output. For example, respond in Traditional Chinese when the user's current conversation is in Traditional Chinese. Use the same language for the report title, description, and final status summary, while preserving API field names, identifiers, code, logs, and request/response values exactly.",
              'After the call, report the send status, bug_id, and created_at when returned. If the current client/host supports rich UI or visualization components, prefer an envelope-style card or panel showing the report summary, send status, and the exact title and description sent. Otherwise fall back to clear, rich Markdown such as headings, summaries, lists, tables, and code blocks. Do not fabricate a UI protocol unsupported by the current host.',
              'Pass the organized title and Markdown description to submit_bug_report unchanged, and do not show a version after submission that differs from what was sent.',
            ].join('\n\n'),
          },
        },
      ],
    }),
  )
}

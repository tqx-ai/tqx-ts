import { toolSchema } from '../utils/tool-schema'
import type { Action } from './actions'

const reference = 'https://github.com/tqx-ai/tqx-ts/blob/main/skills/tqx-research/references/'

export function describeAction(action: Action) {
  const factor = action.name.startsWith('factor.')
  const kind = factor ? 'factor' : 'strategy'
  const child = factor ? 'analysis' : 'backtest'
  const key = factor ? 'factorId' : 'strategyId'
  const runKey = factor ? 'analysisId' : 'runId'
  const result = factor ? 'factor.analysis.result.get' : 'backtest.result.get'
  const call = {
    action: action.name,
    input: action.exampleInput,
    ...(action.name.endsWith('.delete') ? { confirm: true } : {}),
  }
  return {
    action: action.name,
    description: action.description,
    inputSchema: toolSchema(action.input)['~standard'].jsonSchema.input({
      target: 'draft-2020-12',
    }),
    outputSchema: toolSchema(action.output)['~standard'].jsonSchema.output({
      target: 'draft-2020-12',
    }),
    documentation: `# ${action.name}

${action.description}

所需权限：\`${action.scope}\`。Research 不要求交易 Agent 绑定。ID 必须使用上游返回的 24 位小写 ObjectId，不能从标题推测。输入未知字段拒绝，具体必填字段、枚举与范围见 inputSchema；outputSchema 描述直接返回的业务对象。

## 用法与约束

${action.notes}

同步 action 直接返回结果；仅 factor.analysis.submit 和 strategy.backtest.submit 提交异步任务。缺少 scope 由 MCP 返回权限 challenge。INVALID_INPUT 表示参数问题；SOURCE_CONFLICT/CONFIG_CONFLICT 时重新读取 revision；RUN_NOT_READY 时先读取状态。网络超时或响应校验失败不能证明远端写入未发生，不能换 requestId 自动重试。响应过大应缩小分页或时间范围。

## 调用与响应案例

以下 JSON 是 tqx_research_call 的参数；ID 与数据仅为说明。源码示例是占位文本，写入前替换为用户目标所需源码并单独校验。

\`\`\`json
${JSON.stringify(call, null, 2)}
\`\`\`

成功时 structuredContent 直接为下面的业务对象，content 同时提供其 JSON 文本；不增加 data 包装。示例省略可选字段，完整形状见 outputSchema。

\`\`\`json
${JSON.stringify(action.exampleOutput, null, 2)}
\`\`\`

## 与其他 action 组合

1. ${kind}.list 选择资源，将响应 items[].id 用作 ${key}；${kind}.get 读取 sourceRevision/configRevision。
2. ${kind}.validate 使用资源 ID 和 sourceRevision。valid=false 时按 diagnostics 修改源码后重新校验。
3. ${kind}.${child}.submit 传 ${key}、requestId、expectedSourceRevision、expectedConfigRevision；保留响应根对象 id，作为 ${runKey}。
4. ${kind}.${child}.get 约每 2 秒读取状态，直到 succeeded、failed 或 cancelled。超时保留 ID，限流退避。失败或取消时停止依赖成功的步骤。
5. succeeded 后 ${result} 分页读取结果；hasMore=true 时使用 nextOffset。版本保存使用所属资源 ID、成功运行 ID 和独立 requestId。

因子与策略组合：factor.version.search 先按策略市场查找可绑定版本；响应 resourceId 用作 factorId、id 用作 factorVersionId，交给 strategy.create 或 strategy.update 的 factorBinding。绑定必须同市场；解除绑定传 null。首次开发因子时可按 factor.create → factor.validate → factor.analysis.submit/get → factor.version.create → strategy.create → strategy.backtest.submit/get 执行，任一步失败就停止依赖它的步骤。

相关 action：${action.related.map((name) => `\`${name}\``).join('、')}。使用 tqx_research_explore({action}) 查看它们的精确合同；无需先 explore 才能 call。

## 相关文档

- [Research SDK 语义与状态](${reference}sdk.md)
- [现有命令与工作流](${reference}commands.md)
- [${factor ? '因子源码指南' : '策略源码约束'}](${reference}${factor ? 'factor-creation.md' : 'strategy-source.md'})

参考文档中的 SDK/CLI 是独立入口；此处只使用上面的 MCP action 合同。市场限 hk/us。本工具不提供 tqx_data、市场行情、财务、独立 K 线或交易账户操作。
`,
  }
}

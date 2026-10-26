# 有界只读跟踪与跨会话恢复

本文件连接用户接入说明、纯观察helper与实际会话验收。它不是后台执行器，不新增MCP工具、
交易HTTP、OAuth流程或凭据存储。原TQX本机插件目前只有plugin.json与mcp.json、没有bundled
skill；本轮不改全局r0/tqx-trading。用户只拿单MD也能看到完整行为要求，下面的源码工具
是Owner的可选计时/证据辅助，不是接入必需附件。

## 与121项计划的关系及证据边界

源计划为TQX-MCP交易全旅程覆盖计划-2026-10-26的MD/JSON。本批准备MON-01/02/03/
04/06/07/08/09/11/12/13/14/15/17/18、REC-01/02/03/08/09、AUTH-02/03/04/05/08/09、
ENV-04/05及EXT-04的U层检查和C层输入。不能用这里的测试数冒充121项全部通过。
首批离线测试不发真实请求；实际partial/expiry/晚成交仍需Root的新隔离run及H层能力。
Trading fixture未冻结/未READY时标BLOCKED_CAPABILITY，不猜注入命令或改原业务DB。

正常C验收先给用户自然语言、目标server和必要原订单/信号引用：

> 请每10秒看看这张已有订单，最多15分钟，有变化告诉我；别重新下单、改单或撤单。

10秒/15分钟是本轮明确参数，不是产品默认。订单先前提交是独立请求：及时返回原回执
并结束交易请求，观察不重放写入。立即终态可以及时结束；只有明确hold中间态的夹具才
要求至少三轮GET。先保留自然语言轮的失败；controlledObserve仅供诊断对照，不能
覆盖成“自然语言主动跟踪已通过”。

## 实际执行路径

1. Root核实新run、原工具server/有效cwd、PAPER/fake范围与稳定intent/key关联。跟踪
   只接收已有orderId或signalId；不知道原下单key也可观察，不索要写key、不生成替代key
   或补单。已知原key摘要才保留核对。授权只读时不能自行升scope。
2. 会话自己调用真实MCP。新session必须产生新的thread/turn/tool marker；CLI管理输出、
   raw HTTP、SDK、旧会话历史、helper打印的permit均不能代替实际调用。
3. 开始时记录runId、ownerTaskId、intentId/key摘要、原引用、startUTC/deadlineUTC/budget。
   同一运行进程以monotonic时间计预算；原绝对monotonic值不落盘。每轮开始前检查剩余
   预算和停止事件，同任务串行，调用方等待取配置超时与剩余预算较小值。
4. deadline到点不启动新GET；不默认“最后再查一次”。读错误、429退避不重置deadline，
   也不改变最后已知订单/信号。宿主无工具取消/等待限时能力时如实记录，不编造MCP参数。
5. 用户停止指令实际被处理后不发新GET。在途调用可完成或取消，晚结果单列补充观察，
   不倒改原stopReason。发送/排队时刻不等于处理时刻；宿主只能排队时，应记录即时停止
   的能力限制，不能用CLI替代desktop或声称已通过即时steer验收。
6. 跨进程从UTC截止、已耗时和新进程monotonic重算，取较保守剩余预算，不默默续15分钟。
   墙钟倒退或旧在途未解时停止并报告不确定。任务转交须明确原/新owner；helper不提供
   分布式锁或共享限流，两处各自读不代表存在全局去重。旧UNKNOWN记录不得清理。
   恢复已耗预算至少取“已保存consumed+checkpoint后UTC离线耗时”和“UTC-start”的最大值，
   不能因前一进程monotonic比墙钟走得快而漏算离线时间。
7. 新会话用户再次询问原单，必须新GET。原观察已到期时不暗续；新的单次查询另记任务，
   沿用原订单/意图关联，不能重新下单。无法持续执行或没有通知渠道时不承诺离线主动通知。

## 状态必须分开

| 读到的内容                                                          | 解释                                                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| signal PENDING/ACCEPTED/UNKNOWN/REJECTED                            | 提交状态；ACCEPTED不等于成交，观察截止不能改它。                                                  |
| SUBMITTED/PARTIAL_FILLED/MODIFYING/CANCELLING                       | 订单中间态；保留准确quantity/filled_quantity/remaining_quantity与decimal字符串。                  |
| monitor_status=BUDGET_EXHAUSTED、monitor_stop_reason=monitor_budget | 后端观察预算结束；不是订单撤销/渠道到期，晚成交仍需实际回源验证。                                 |
| TIMEOUT且status_source=CHANNEL、status_reason=DAY_EXPIRED           | 结合实际渠道/新鲜详情作为到期证据；其余TIMEOUT来源不明，不能自行补EXPIRED枚举。                   |
| is_stale=true或来源字段null                                         | 旧快照或信息不足；不以陈旧终态假装当前确认。Signal.order_status_source另记，不能与提交state混同。 |
| GET错误/404/空活动列表                                              | 读失败/未找到/活动集为空；不证明已撤、全成或到期，不将已知订单改为UNKNOWN/FAILED。                |

真实财务收敛、trade去重、晚回报和渠道自然DAY到期是H/S层职责；helper不制造数量或成交。
观察窗口可有自然渠道成交事件，必须与代理新增写HTTP/operation/write-effect分别归因，
不能用全库不变断言掩盖自然变化，也不能因鉴权/配额正常持久化就误报交易写入。

## 可运行的输入/时间/证据辅助

源码入口journey-harness.ts只读取一个公开JSON并打印结果，不启动模型/服务、不联网、
不写文件、不复制密钥。文件持久化、原始marker采集与授权仍由调用方负责。
输入不得含token、cookie、私钥或账户完整资料。只在run私有目录保存原始证据，公开报告脱敏。

```text
bun --no-env-file packages/mcp-server/integrations/codex/journey-harness.ts plan PUBLIC_INPUT.json
bun --no-env-file packages/mcp-server/integrations/codex/journey-harness.ts window PUBLIC_CHECKPOINT_STEP.json
bun --no-env-file packages/mcp-server/integrations/codex/journey-harness.ts check PUBLIC_INPUT_AND_EVIDENCE.json
```

plan输入为{input: JourneyInput}，字段定义见journey-acceptance.ts，输出PLANNED、
naturalObserve/naturalStop/naturalResume和controlled对照。intentKeyDigest可省略或为null；
已知原始key时只保留其SHA256摘要，不生成新交易key；计划生成不会提前启动观察预算。
run/task/intent计时与证据字段是可选辅助记录，不要求正常用户先提供这些字段才可只读盯单。

window为可实际使用的时间辅助：action=start与observation: ObservationInput输出
初始checkpoint；next/begin/stop带原record、ownerTaskId；begin只输出读permit，不调用工具。
会话实际MCP完成后，complete带原inFlight record、相同sequence及ReadOutcome更新状态。
ReadOutcome使用evidenceRef指向真实结果，来源字段按源码接口映射；它不验证引用内容。
snapshot须从实际响应提取order_id/signal_id并核对原引用，不能从请求或预期permit复制充数；
缺失/错单记evidence_insufficient，不接受别单终态。每个快照的状态、source/reason/stale/
monitor字段一起更新，缺失归null；lastSnapshotEvidenceRef单独绑定其原始证据，读错误
只更新错误引用，不把前一快照的CHANNEL/DAY_EXPIRED拼给新TIMEOUT。
调用方保存输出record并串行传回，不能另起副本假装原任务延续。纯库ObservationWindow
允许同进程monotonic计时；每次重启的CLI按持久UTC预算恢复，不能持久复用旧monotonic。

check输入为{input: JourneyInput, evidence: JourneyEvidence}。每条事件保留actual模型来源、
run/task/session/turn/callId、server/tool/arguments、开始/结束UTC与原marker/result引用。
surface明确desktop或native_cli；真实native模型MCP也不能被写成desktop通过。
snapshot事件也须保留实际响应order_id/signal_id；字段完整不证明其真实，仍核原marker。
本批跟踪收集器只接受原引用的getOrder/getSignal；发现、账户读取、最终财务回查另列
步骤和窗口，不能过滤掉不合预期的真实调用来制造通过。写审计需要独立baseline/after引用
及观察窗口新增writeHttp/operation/writeEffect增量，实际交易链由Root与服务Owner对齐。

验收字段不足返回INCOMPLETE、矛盾返回VIOLATION，退出2；这是证据完整性检查，不是产品
拒绝只读请求或处理用户停止的门槛。结构齐全只返回NEEDS_OWNER_REVIEW，
不是PASS，不校验证据真实性。坏输入退出1。离线伪marker即使填“actual”也只能过结构检查，
Owner必须检查原始新MCP marker和独立审计后才能填写该case/layer的实际结果。

## 首批可执行离线与实际清单

```text
node node_modules/vitest/vitest.mjs run --config packages/mcp-server/integrations/codex/journey.config.ts
node node_modules/typescript/bin/tsc --project packages/mcp-server/integrations/codex/tsconfig.json --noEmit
```

离线覆盖：deadline前/等于/之后、stop在途晚结果、慢GET串行、429超剩余预算、GET失败不改
订单、monitor预算/渠道到期/陈旧终态分流、持久恢复/墙钟倒退/休眠/owner移交、原引用/key
保全、缺marker/旧marker/HTTP替代/写审计反例。它们是U层，不证明真实10秒或15分钟节奏。

| 121计划case                      | Root实际会话最小输入与证据                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| MON-01/06、REC-01/02             | 先自然语言跟踪原单；H夹具受控部分成交，真实新GET更新状态；新建/分叉再次问原单，不重放提交。                         |
| MON-02/03/13/17、REC-03/09       | 明确观察预算；实际10秒节奏与实际15分钟到点各保留一轮；截止无新GET，晚结果另列，休眠/恢复不续预算。                  |
| MON-04/18                        | Root用公开send_message_to_thread发自然“别盯了，别撤单”；保存发送、实际处理、GET start/end及双方任务归属。           |
| MON-07/08/12、AUTH-04/05、REC-08 | 只在独立run注入读错/限流/撤权/自然到期/合法refresh；保存错误与原状态，无新写/旁路，旧本人grant不做故障注入。        |
| MON-14/15                        | 后端budget耗尽后渠道晚成交，再由单独授权查询回源；分别保留monitor与order/signal来源，不因TIMEOUT虚报渠道结束。      |
| MON-09                           | 自然要求关闭对话后成交通知；未配置持续执行器/通知时明确缺能力，不创建服务或自动任务。                               |
| ENV-04/05、EXT-04、REC-05        | 临时项目旧URL/独立AS down，记录相同cwd effective配置和初始化错误；恢复后真实READ，不重装或新OAuth。                 |
| AUTH-08/09                       | 独立测试登录human pending时说“我好了”，仍等原流程；expired/denied报告真实状态；native完成后仍须新实际READ才称可用。 |

AUTH等待可直接测authorizationNextAction，无需伪造订单引用。实际prompt分别为“我已经
授权好了，请继续”和“我暂时不确认”；helper pending/expired/native_complete与真实事件
由Root采集，不能以用户口头答复当登录成功。NEEDS_FRESH_HUMAN_FLOW只是下一步说明，
不会自动发起OAuth，只有新的明确流程且真人同意才可继续。

本轮实际C尚未在本文件宣告通过；Root按case/layer/build/run追加独立结果，保留首次失败。
共享S/外部X、生产/真实资金和永续后台通知均不由本地offline通过解除依赖。

独立复审四guard已保留红后绿：恢复漏离线耗时、CLI stop误归未解在途、错单/缺身份回执、
跨快照来源拼接。原五条红测JSON保留在本线work/observation-review-20261026/red.json，
绿测另存green.json；公开摘要在evidence/observation-review-20261026.json。该证据仅U层。

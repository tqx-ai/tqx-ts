import type { SyntaxNode } from '@lezer/common'
import { parser } from '@lezer/python'
import type { BaseIssue } from 'valibot'

import { TqxValidationError } from '../../errors'
import type { QubeMarket } from '../schemas'
import { catalogForMarket, type DataApiLiteral, type DataApiMethod } from './data-api-catalog'
import { normalizeStrategyLocale, t } from './messages'

export interface StrategyValidationOptions {
  locale?: string
}

interface SourceFrame {
  readonly code: string
  readonly lineStarts: number[]
  readonly lines: string[]
}

interface FunctionAnalysis {
  readonly name: string
  readonly node: SyntaxNode
  readonly calls: CallAnalysis[]
  readonly directCalls: Set<string>
  readonly contextAttrs: ContextAttrUse[]
  readonly stringBindings: Map<string, string>
  hasTry: boolean
}

type DataApiModule = 'panda_data' | 'tqx_data'

interface DataApiBindings {
  readonly moduleAliases: Record<DataApiModule, Set<string>>
  readonly fromImports: Map<string, { module: DataApiModule; method: string }>
}

interface ResolvedDataApiCall {
  readonly module: DataApiModule
  readonly method: string
}

interface CallAnalysis {
  readonly node: SyntaxNode
  readonly callee: string | null
  readonly rootName: string | null
  readonly keywords: KeywordArg[]
  readonly positionalArgs: SyntaxNode[]
  readonly line: number
}

interface KeywordArg {
  readonly name: string
  readonly valueNode: SyntaxNode
}

interface ContextAttrUse {
  readonly attr: string
  readonly line: number
  readonly isWrite: boolean
}

interface Finding {
  readonly path: 'code' | 'market'
  readonly message: string
  readonly line?: number
  readonly snippet?: string
}

const INIT_MARKET_DATA_NAME = 'init_market_data'
const REQUIRED_IMPORT_RE = /^from\s+panda_backtest\.api\.api\s+import\s+\*$/
const HK_REQUIRED_IMPORT_RE = /^from\s+panda_backtest\.api\.stock_hk_api\s+import\s+\*$/
const US_REQUIRED_IMPORT_RE = /^from\s+panda_backtest\.api\.stock_us_api\s+import\s+\*$/
const WRONG_STOCK_API_IMPORT_RE = /^from\s+panda_backtest\.api\.stock_api\s+import\s+\*$/
const FORBIDDEN_IMPORT_RE = /\b(?:requests|urllib|pymongo|motor|socket)\b/
const FORBIDDEN_BUILTINS = new Set([
  'eval',
  'exec',
  'open',
  '__import__',
  'compile',
  'input',
  'globals',
  'locals',
  'vars',
  'dir',
])
const CONTEXT_ALLOWED_ATTRS = new Set([
  'account',
  'bar_minutes',
  'close_history',
  'closes',
  'df_factor',
  'fast_window',
  'future_account_dict',
  'hms',
  'is_last_trade_date',
  'is_trade_date',
  'last_date',
  'lot_by_symbol',
  'long_window',
  'max_position_ratio',
  'nature_date_len',
  'now',
  'portfolio',
  'run_info',
  'short_window',
  'slow_window',
  'stock_account_dict',
  'stock_universe',
  'sub_future_symbol',
  'sub_stock',
  'symbol',
  'target_symbols',
  'today_trades',
  'trade_date',
  'trade_date_len',
  'trade_date_list',
  'trade_time',
  'un_sub_future_symbol',
  'un_sub_stock',
  'top_n',
])
const CONTINUOUS_FUTURE_RE = /(?:_DOMINANT\.|(?:88|8888|9999)\.)/i
const FUTURE_ORDER_CALL_NAMES = new Set(['buy_open', 'sell_close', 'sell_open', 'buy_close'])
const STOCK_UNSUPPORTED_LIFECYCLES = new Set([
  'day_before',
  'handle_tick',
  'on_future_trade_rtn',
  'future_order_cancel',
  'trade_error',
])
const FUTURE_UNSUPPORTED_LIFECYCLES = new Set([
  'day_before',
  'handle_tick',
  'on_stock_trade_rtn',
  'stock_order_cancel',
  'trade_error',
])
const PUNCTUATION = new Set(['(', ')', ',', '[', ']', '{', '}', ':', '.'])
const ROLLING_LONG_WINDOW_RE = /\.rolling\(\s*(\d+)\s*[,)]/g
const ROLLING_VAR_WINDOW_RE = /\.rolling\(\s*(\w+(?:\.\w+)*)\s*[,)]/g
const CONTEXT_WINDOW_CONST_RE = /(?:^|\n)\s*context\.(\w+)\s*=\s*(\d+)/g
const TRADE_DATE_FROM_RUN_INFO_RE =
  /(?:start_date\s*=\s*|"start_date"\s*:\s*)\w+\.run_info\.start_date/
const TRADE_DATE_SHIFT_RE = /(?:start_date\s*=\s*|"start_date"\s*:\s*)[^,\n]*Timedelta/s
const SYMBOL_LITERAL_RE = /(["'])([A-Za-z][A-Za-z0-9.-]{0,15})\.(HK|NB|US|NY|SH|SZ)\1/g

export function validateStrategyCode(
  code: string,
  market: QubeMarket | string,
  options: StrategyValidationOptions = {},
): void {
  const locale = normalizeStrategyLocale(options.locale)
  const source = String(code ?? '')
  if (!source.trim()) {
    throwStrategyValidationError({ path: 'code', message: t('code_empty', locale) })
  }

  const normalizedMarket = normalizeMarket(market, locale)
  const normalizedSource = normalizedMarket === 'us' ? normalizeUsSymbolsInCode(source) : source
  const frame = createSourceFrame(normalizedSource)
  const tree = parser.parse(normalizedSource)
  const root = tree.topNode
  const functions = collectTopLevelFunctions(root, normalizedSource)
  const analyses = buildFunctionAnalyses(functions, normalizedSource)
  const dataApiBindings = collectDataApiBindings(root, normalizedSource)

  const finding =
    detectSyntaxError(root, frame, locale) ??
    detectImportContract(root, normalizedSource, frame, normalizedMarket, locale) ??
    detectTryAndLoggerRules(root, normalizedSource, frame, normalizedMarket, locale) ??
    detectLifecycleContract(functions, normalizedSource, frame, normalizedMarket, locale) ??
    detectInitMarketDataRequirement(
      functions,
      analyses,
      normalizedSource,
      frame,
      normalizedMarket,
      locale,
    ) ??
    detectUniversalCallRules(
      analyses,
      normalizedSource,
      frame,
      normalizedMarket,
      locale,
      functions,
    ) ??
    detectSymbolRules(normalizedSource, frame, normalizedMarket, locale) ??
    detectDataApiRules(
      analyses,
      normalizedSource,
      frame,
      normalizedMarket,
      locale,
      dataApiBindings,
    ) ??
    detectLookbackRule(normalizedSource, frame, locale) ??
    detectContextStateRule(analyses, frame, locale) ??
    detectFutureSpecificRules(analyses, normalizedSource, frame, normalizedMarket, locale)

  if (finding !== undefined) throwStrategyValidationError(finding)
}

function normalizeMarket(market: QubeMarket | string, locale: string): QubeMarket {
  const normalized = String(market ?? '')
    .trim()
    .toLowerCase()
  if (
    normalized === 'stock' ||
    normalized === 'future' ||
    normalized === 'hk' ||
    normalized === 'us'
  ) {
    return normalized
  }
  throwStrategyValidationError({
    path: 'market',
    message: t('invalid_market', locale, { market }),
  })
}

function throwStrategyValidationError(finding: Finding): never {
  const issue = makeIssue(finding.path, formatFindingMessage(finding))
  throw new TqxValidationError('Invalid strategy code', [issue])
}

function makeIssue(path: 'code' | 'market', message: string): BaseIssue<unknown> {
  return {
    kind: 'validation',
    type: 'custom',
    input: null,
    expected: null,
    received: 'custom',
    message,
    path: [{ key: path }],
    issues: undefined,
    lang: 'en',
    abort: false,
    abortEarly: false,
    skipPipe: false,
    reason: 'custom',
    validation: 'custom',
  } as unknown as BaseIssue<unknown>
}

function formatFindingMessage(finding: Finding): string {
  return finding.snippet === undefined ? finding.message : `${finding.message}${finding.snippet}`
}

function createSourceFrame(code: string): SourceFrame {
  const lineStarts = [0]
  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === '\n') lineStarts.push(index + 1)
  }
  return {
    code,
    lineStarts,
    lines: code.split(/\r?\n/),
  }
}

function lineForPosition(frame: SourceFrame, position: number): number {
  let low = 0
  let high = frame.lineStarts.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const start = frame.lineStarts[mid] ?? 0
    const next = frame.lineStarts[mid + 1] ?? Number.POSITIVE_INFINITY
    if (position < start) high = mid - 1
    else if (position >= next) low = mid + 1
    else return mid + 1
  }
  return frame.lineStarts.length || 1
}

function codeFrame(frame: SourceFrame, line: number): string {
  const startLine = Math.max(1, line - 1)
  const endLine = Math.min(frame.lines.length, line + 1)
  const width = String(endLine).length
  const lines: string[] = []
  for (let current = startLine; current <= endLine; current += 1) {
    const indicator = current === line ? '→' : ' '
    const text = frame.lines[current - 1] ?? ''
    lines.push(`${indicator} ${String(current).padStart(width)}| ${text}`)
  }
  return `\n\`\`\`python\n${lines.join('\n')}\n\`\`\``
}

function makeFinding(
  frame: SourceFrame,
  node: SyntaxNode | undefined,
  message: string,
  path: 'code' | 'market' = 'code',
): Finding {
  if (node === undefined) return { path, message }
  const line = lineForPosition(frame, node.from ?? node.to)
  return { path, message, line, snippet: codeFrame(frame, line) }
}

function makeFindingAtLine(
  frame: SourceFrame,
  line: number,
  message: string,
  path: 'code' | 'market' = 'code',
): Finding {
  return { path, message, line, snippet: codeFrame(frame, line) }
}

function detectSyntaxError(
  root: SyntaxNode,
  frame: SourceFrame,
  locale: string,
): Finding | undefined {
  let errorNode: SyntaxNode | undefined
  walk(root, (node) => {
    if (errorNode === undefined && node.name === '⚠') errorNode = node
  })
  if (errorNode === undefined) return undefined
  const line = lineForPosition(frame, errorNode.from ?? errorNode.to)
  return {
    path: 'code',
    message: t('compile_error_framed', locale, {
      where: t('compile_line_prefix', locale, { lineno: line }),
      msg: t('generic_syntax_error', locale),
      snippet: codeFrame(frame, line),
    }),
  }
}

function detectImportContract(
  root: SyntaxNode,
  source: string,
  frame: SourceFrame,
  market: QubeMarket,
  locale: string,
): Finding | undefined {
  const importTexts: string[] = []
  for (const node of directChildren(root)) {
    if (node.name !== 'ImportStatement') continue
    importTexts.push(compactText(nodeText(source, node)))
  }

  for (const node of walkNodes(root)) {
    if (node.name !== 'ImportStatement') continue
    const text = compactText(nodeText(source, node))
    if (node.parent !== root && text.includes('import *')) {
      return makeFinding(frame, node, t('nested_star_import', locale))
    }
    if (FORBIDDEN_IMPORT_RE.test(text)) {
      const forbidden = text.match(FORBIDDEN_IMPORT_RE)?.[0] ?? 'unknown'
      return makeFinding(frame, node, t('forbidden_dependency', locale, { forbidden }))
    }
    if ((market === 'hk' || market === 'us') && text.includes('panda_data')) {
      return makeFinding(frame, node, t('hk_us_forbidden_panda_data', locale))
    }
    if (market === 'hk' || market === 'us') {
      if (WRONG_STOCK_API_IMPORT_RE.test(text)) {
        return makeFinding(
          frame,
          node,
          t('hk_us_forbidden_stock_api_import', locale, {
            api_suffix: market,
          }),
        )
      }
      const oppositeImport =
        market === 'hk'
          ? 'from panda_backtest.api.stock_us_api import *'
          : 'from panda_backtest.api.stock_hk_api import *'
      if (text.includes(oppositeImport)) {
        return makeFinding(
          frame,
          node,
          t('hk_us_wrong_market_api_import', locale, {
            import_path: oppositeImport,
            expected_import:
              market === 'hk'
                ? 'from panda_backtest.api.stock_hk_api import *'
                : 'from panda_backtest.api.stock_us_api import *',
          }),
        )
      }
    }
  }

  if (!importTexts.some((text) => REQUIRED_IMPORT_RE.test(text))) {
    return {
      path: 'code',
      message: t('missing_required_import', locale, { required_import: 'panda_backtest.api.api' }),
    }
  }

  if (market === 'hk' || market === 'us') {
    const requiredRegex = market === 'hk' ? HK_REQUIRED_IMPORT_RE : US_REQUIRED_IMPORT_RE
    if (!importTexts.some((text) => requiredRegex.test(text))) {
      return {
        path: 'code',
        message: t('missing_required_api_import', locale, {
          required_api:
            market === 'hk' ? 'panda_backtest.api.stock_hk_api' : 'panda_backtest.api.stock_us_api',
        }),
      }
    }
  }

  return undefined
}

function detectTryAndLoggerRules(
  root: SyntaxNode,
  source: string,
  frame: SourceFrame,
  market: QubeMarket,
  locale: string,
): Finding | undefined {
  let tryNode: SyntaxNode | undefined
  let loggerNode: SyntaxNode | undefined
  walk(root, (node) => {
    if (tryNode === undefined && node.name === 'TryStatement') tryNode = node
    if (
      loggerNode === undefined &&
      (node.name === 'VariableName' || node.name === 'PropertyName') &&
      nodeText(source, node) === 'SRLogger'
    ) {
      loggerNode = node
    }
  })
  if (tryNode !== undefined) {
    const line = lineForPosition(frame, tryNode.from ?? tryNode.to)
    return makeFinding(
      frame,
      tryNode,
      market === 'future'
        ? t('future_try_except_forbidden', locale, { lineno: line })
        : t('stock_try_except_forbidden', locale, { lineno: line }),
    )
  }
  if (loggerNode !== undefined) {
    const line = lineForPosition(frame, loggerNode.from ?? loggerNode.to)
    return makeFinding(
      frame,
      loggerNode,
      market === 'future'
        ? t('future_srlogger_forbidden', locale, { lineno: line })
        : t('stock_srlogger_forbidden', locale, { lineno: line }),
    )
  }
  return undefined
}

function detectLifecycleContract(
  functions: Map<string, SyntaxNode>,
  source: string,
  frame: SourceFrame,
  market: QubeMarket,
  locale: string,
): Finding | undefined {
  const required = ['initialize', 'handle_data'] as const
  for (const name of required) {
    const node = functions.get(name)
    if (node === undefined) {
      return {
        path: 'code',
        message: t('missing_required_lifecycle_def', locale, { func_name: name }),
      }
    }
    if (isAsyncFunction(node, source)) {
      return makeFinding(
        frame,
        node,
        t('lifecycle_async_forbidden', locale, {
          lineno: lineForPosition(frame, node.from),
          name,
        }),
      )
    }
    if (!exactSignature(node, source, name === 'handle_data' ? ['context', 'data'] : ['context'])) {
      return makeFinding(
        frame,
        node,
        t('lifecycle_signature_mismatch', locale, {
          lineno: lineForPosition(frame, node.from),
          name,
          signature: name === 'handle_data' ? 'context, data' : 'context',
        }),
      )
    }
  }

  for (const name of ['before_trading', 'after_trading'] as const) {
    const node = functions.get(name)
    if (node === undefined) continue
    if (isAsyncFunction(node, source)) {
      return makeFinding(
        frame,
        node,
        t('lifecycle_async_forbidden', locale, {
          lineno: lineForPosition(frame, node.from),
          name,
        }),
      )
    }
    if (!exactSignature(node, source, ['context'])) {
      return makeFinding(
        frame,
        node,
        t('lifecycle_signature_mismatch', locale, {
          lineno: lineForPosition(frame, node.from),
          name,
          signature: 'context',
        }),
      )
    }
  }

  const unsupported =
    market === 'future' ? FUTURE_UNSUPPORTED_LIFECYCLES : STOCK_UNSUPPORTED_LIFECYCLES
  for (const name of unsupported) {
    const node = functions.get(name)
    if (node === undefined) continue
    return makeFinding(
      frame,
      node,
      market === 'future'
        ? t('future_unsupported_lifecycle', locale, {
            lineno: lineForPosition(frame, node.from),
            name,
          })
        : t('stock_unsupported_lifecycle', locale, {
            lineno: lineForPosition(frame, node.from),
            name,
          }),
    )
  }

  return undefined
}

function detectInitMarketDataRequirement(
  functions: Map<string, SyntaxNode>,
  analyses: Map<string, FunctionAnalysis>,
  source: string,
  frame: SourceFrame,
  market: QubeMarket,
  locale: string,
): Finding | undefined {
  if (market !== 'stock' && market !== 'hk' && market !== 'us') return undefined
  const initNode = functions.get(INIT_MARKET_DATA_NAME)
  const initializeNode = functions.get('initialize')
  if (
    initNode === undefined ||
    initializeNode === undefined ||
    !exactSignature(initNode, source, ['context']) ||
    !hasDirectCall(analyses.get('initialize'), INIT_MARKET_DATA_NAME)
  ) {
    return { path: 'code', message: t('stock_missing_init_market_data', locale) }
  }
  return undefined
}

function detectUniversalCallRules(
  analyses: Map<string, FunctionAnalysis>,
  source: string,
  frame: SourceFrame,
  market: QubeMarket,
  locale: string,
  functions: Map<string, SyntaxNode>,
): Finding | undefined {
  const forbiddenMarketDependency =
    market === 'stock' ? 'tqx_data' : market === 'future' ? 'tqx_data' : undefined

  for (const analysis of analyses.values()) {
    for (const call of analysis.calls) {
      if (call.callee === 'data.get') {
        return makeFinding(frame, call.node, t('data_get_forbidden', locale))
      }
      if (call.rootName !== null && FORBIDDEN_BUILTINS.has(call.rootName)) {
        return makeFinding(
          frame,
          call.node,
          t('forbidden_builtin', locale, { name: call.rootName }),
        )
      }
      if (call.callee === 'time.sleep') {
        return makeFinding(
          frame,
          call.node,
          t('forbidden_dependency', locale, { forbidden: 'time.sleep' }),
        )
      }
      if (call.rootName === 'preload') {
        return makeFinding(
          frame,
          call.node,
          t(market === 'future' ? 'preload_forbidden_future' : 'preload_forbidden_stock', locale),
        )
      }
      if (call.rootName === 'build_factor' || call.rootName === 'run_factor_analysis') {
        return makeFinding(
          frame,
          call.node,
          t('forbidden_dependency', locale, { forbidden: call.rootName }),
        )
      }
      if (forbiddenMarketDependency !== undefined && call.rootName === forbiddenMarketDependency) {
        return makeFinding(
          frame,
          call.node,
          t('forbidden_dependency', locale, { forbidden: forbiddenMarketDependency }),
        )
      }
      if ((market === 'hk' || market === 'us') && call.rootName === 'panda_data') {
        return makeFinding(frame, call.node, t('hk_us_forbidden_panda_data', locale))
      }
      if (market === 'stock' && call.rootName === 'stock_api_quotation') {
        return makeFinding(
          frame,
          call.node,
          t('forbidden_dependency', locale, { forbidden: 'stock_api_quotation' }),
        )
      }
      if (market === 'stock' && call.rootName === 'stock_api_pre_close') {
        return makeFinding(
          frame,
          call.node,
          t('forbidden_dependency', locale, { forbidden: 'stock_api_pre_close' }),
        )
      }
      if (market !== 'hk' && market !== 'us' && call.rootName === 'tqx_data') {
        return makeFinding(
          frame,
          call.node,
          t('forbidden_dependency', locale, { forbidden: 'tqx_data' }),
        )
      }
    }
  }

  void functions
  void source
  return undefined
}

function detectSymbolRules(
  source: string,
  frame: SourceFrame,
  market: QubeMarket,
  locale: string,
): Finding | undefined {
  if (market !== 'hk' && market !== 'us') return undefined
  let match: RegExpExecArray | null
  SYMBOL_LITERAL_RE.lastIndex = 0
  while ((match = SYMBOL_LITERAL_RE.exec(source)) !== null) {
    const literal = match[0]
    const suffix = match[3]!.toUpperCase()
    const line = lineForPosition(frame, match.index)
    if (market === 'hk') {
      if (suffix === 'SH' || suffix === 'SZ') {
        return makeFindingAtLine(
          frame,
          line,
          t('hk_us_forbidden_a_share_symbol', locale, {
            market_label: locale.startsWith('en') ? 'HK' : '港股',
          }),
        )
      }
      if (suffix !== 'HK') {
        return makeFindingAtLine(
          frame,
          line,
          t('market_symbol_suffix_mismatch', locale, {
            lineno: line,
            symbol: literal,
            market_label: 'HK',
            expected_suffix: '.HK',
          }),
        )
      }
      if (/^\d{5}\.HK$/i.test(literal)) {
        return makeFindingAtLine(frame, line, t('hk_symbol_must_be_four_digit', locale))
      }
      if (literal.toUpperCase() === 'HSI.HK') {
        return makeFindingAtLine(frame, line, t('hk_index_symbol_must_use_catalog_code', locale))
      }
    } else if (suffix === 'SH' || suffix === 'SZ') {
      return makeFindingAtLine(
        frame,
        line,
        t('hk_us_forbidden_a_share_symbol', locale, {
          market_label: locale.startsWith('en') ? 'US' : '美股',
        }),
      )
    } else if (suffix !== 'NB') {
      return makeFindingAtLine(
        frame,
        line,
        t('market_symbol_suffix_mismatch', locale, {
          lineno: line,
          symbol: literal,
          market_label: 'US',
          expected_suffix: '.NB',
        }),
      )
    }
  }
  return undefined
}

function detectDataApiRules(
  analyses: Map<string, FunctionAnalysis>,
  source: string,
  frame: SourceFrame,
  market: QubeMarket,
  locale: string,
  dataApiBindings: DataApiBindings,
): Finding | undefined {
  const { catalog } = catalogForMarket(market)
  const allowedFetchFunctions = reachableFunctionsFromRoots(analyses, [
    'before_trading',
    INIT_MARKET_DATA_NAME,
  ])
  const handleDataFunctions = reachableFunctionsFromRoots(analyses, ['handle_data'])
  const orderForbiddenFunctions = reachableFunctionsFromRoots(analyses, [
    'initialize',
    'before_trading',
    'after_trading',
  ])

  for (const analysis of analyses.values()) {
    for (const call of analysis.calls) {
      const resolvedDataApi = resolveDataApiCall(call, dataApiBindings)
      if (
        market === 'future' &&
        orderForbiddenFunctions.has(analysis.name) &&
        FUTURE_ORDER_CALL_NAMES.has(call.rootName ?? '')
      ) {
        return makeFinding(
          frame,
          call.node,
          t('future_order_call_outside_handle_data', locale, {
            lineno: call.line,
            func_name: analysis.name,
            call_name: call.rootName ?? call.callee ?? 'call',
          }),
        )
      }

      if (
        resolvedDataApi !== undefined &&
        market !== 'hk' &&
        market !== 'us' &&
        resolvedDataApi.module === 'tqx_data'
      ) {
        return makeFinding(
          frame,
          call.node,
          t('forbidden_dependency', locale, { forbidden: 'tqx_data' }),
        )
      }

      if (
        resolvedDataApi !== undefined &&
        (market === 'hk' || market === 'us') &&
        resolvedDataApi.module === 'panda_data'
      ) {
        return makeFinding(frame, call.node, t('hk_us_forbidden_panda_data', locale))
      }

      if (
        market === 'future' &&
        (call.rootName === 'panda_data' || resolvedDataApi?.module === 'panda_data')
      ) {
        if (allowedFetchFunctions.has(analysis.name)) {
          const result = validateDataApiCall(
            call,
            frame,
            source,
            'panda_data',
            catalog,
            locale,
            market,
            resolvedDataApi,
          )
          if (result !== undefined) return result
        } else {
          return makeFinding(
            frame,
            call.node,
            handleDataFunctions.has(analysis.name)
              ? t('future_panda_data_in_handle_data', locale, {
                  lineno: call.line,
                  method: callDisplayMethod(call, resolvedDataApi),
                })
              : t('data_read_outside_allowed_window', locale, {
                  lineno: call.line,
                  func_name: analysis.name,
                  call_name: call.callee ?? 'panda_data',
                }),
          )
        }
        continue
      }

      if (call.rootName === 'stock_api_quotation') {
        if (market !== 'hk' && market !== 'us') {
          return makeFinding(
            frame,
            call.node,
            t('forbidden_dependency', locale, { forbidden: 'stock_api_quotation' }),
          )
        }
        if (!allowedFetchFunctions.has(analysis.name)) {
          return makeFinding(
            frame,
            call.node,
            t('hk_us_data_outside_init_market_data', locale, {
              lineno: call.line,
              func_name: analysis.name,
            }),
          )
        }
        const special = validateStockApiQuotationCall(call, frame, source, locale)
        if (special !== undefined) return special
        continue
      }

      if (call.rootName === 'stock_api_pre_close') {
        if (market !== 'hk' && market !== 'us') {
          return makeFinding(
            frame,
            call.node,
            t('forbidden_dependency', locale, { forbidden: 'stock_api_pre_close' }),
          )
        }
        if (!allowedFetchFunctions.has(analysis.name)) {
          return makeFinding(
            frame,
            call.node,
            t('hk_us_data_outside_init_market_data', locale, {
              lineno: call.line,
              func_name: analysis.name,
            }),
          )
        }
        continue
      }

      if (
        call.rootName === 'panda_data' ||
        call.rootName === 'tqx_data' ||
        resolvedDataApi !== undefined
      ) {
        const moduleForCall: DataApiModule | null =
          resolvedDataApi?.module ??
          (call.rootName === 'panda_data' || call.rootName === 'tqx_data' ? call.rootName : null)
        if (moduleForCall === 'tqx_data' && (market === 'stock' || market === 'future')) {
          return makeFinding(
            frame,
            call.node,
            t('forbidden_dependency', locale, { forbidden: 'tqx_data' }),
          )
        }
        if (moduleForCall === 'panda_data' && (market === 'hk' || market === 'us')) {
          return makeFinding(frame, call.node, t('hk_us_forbidden_panda_data', locale))
        }
        if (market === 'hk' || market === 'us') {
          if (!allowedFetchFunctions.has(analysis.name)) {
            return makeFinding(
              frame,
              call.node,
              t('hk_us_data_outside_init_market_data', locale, {
                lineno: call.line,
                func_name: analysis.name,
              }),
            )
          }
        } else if (market === 'stock') {
          if (!allowedFetchFunctions.has(analysis.name)) {
            return makeFinding(
              frame,
              call.node,
              t('stock_panda_data_outside_init_market_data', locale, {
                lineno: call.line,
                func_name: analysis.name,
              }),
            )
          }
        } else if (!allowedFetchFunctions.has(analysis.name)) {
          return makeFinding(
            frame,
            call.node,
            t('data_read_outside_allowed_window', locale, {
              lineno: call.line,
              func_name: analysis.name,
              call_name: call.callee ?? call.rootName ?? 'call',
            }),
          )
        }

        const result = validateDataApiCall(
          call,
          frame,
          source,
          moduleForCall ?? 'panda_data',
          catalog,
          locale,
          market,
          resolvedDataApi,
        )
        if (result !== undefined) return result
      }
    }
  }

  return undefined
}

function validateStockApiQuotationCall(
  call: CallAnalysis,
  frame: SourceFrame,
  source: string,
  locale: string,
): Finding | undefined {
  for (const keyword of call.keywords) {
    if (keyword.name === 'frequency') {
      return makeFinding(
        frame,
        keyword.valueNode,
        t('stock_api_quotation_frequency_kwarg', locale, {
          lineno: call.line,
        }),
      )
    }
    if (!['symbol_list', 'start_date', 'end_date', 'fields', 'period'].includes(keyword.name)) {
      return makeFinding(
        frame,
        keyword.valueNode,
        t('stock_api_quotation_unknown_kwarg', locale, {
          lineno: call.line,
          kwarg: keyword.name,
        }),
      )
    }
  }

  const period = findKeyword(call, 'period')
  if (period !== undefined) {
    const value = literalValue(period.valueNode, source)
    if (value !== undefined && value !== '1d' && value !== '1m') {
      return makeFinding(
        frame,
        period.valueNode,
        t('stock_api_quotation_bad_period', locale, {
          lineno: call.line,
        }),
      )
    }
  }

  const symbolList = findKeyword(call, 'symbol_list')
  if (symbolList !== undefined) {
    const value = literalValue(symbolList.valueNode, source)
    if (Array.isArray(value) && value.length === 0) {
      return makeFinding(
        frame,
        symbolList.valueNode,
        t('stock_api_quotation_symbol_list_empty', locale, {
          lineno: call.line,
        }),
      )
    }
  }

  return undefined
}

function validateDataApiCall(
  call: CallAnalysis,
  frame: SourceFrame,
  source: string,
  module: DataApiModule,
  catalog: Record<string, DataApiMethod>,
  locale: string,
  market: QubeMarket,
  resolvedCall?: ResolvedDataApiCall,
): Finding | undefined {
  const method = resolvedCall?.method ?? call.callee?.split('.').slice(1).join('.') ?? ''
  if (!method) return undefined
  const spec = catalog[method]
  if (spec === undefined) {
    const known = Object.keys(catalog).toSorted().join(', ')
    return makeFinding(
      frame,
      call.node,
      t('data_api_unknown_method', locale, {
        lineno: call.line,
        module,
        method,
        known,
      }),
    )
  }

  for (const keyword of call.keywords) {
    if (!spec.params.includes(keyword.name)) {
      return makeFinding(
        frame,
        keyword.valueNode,
        t('data_api_unknown_kwarg', locale, {
          lineno: call.line,
          module,
          method: spec.name,
          kwarg: keyword.name,
          allowed: spec.params.join(', '),
        }),
      )
    }
    const enumValues = spec.enums[keyword.name]
    if (enumValues === undefined) continue
    const value = literalValue(keyword.valueNode, source)
    if (value === undefined) continue
    if (!literalMatchesEnum(value, enumValues)) {
      return makeFinding(
        frame,
        keyword.valueNode,
        t('data_api_enum_invalid', locale, {
          lineno: call.line,
          module,
          method: spec.name,
          kwarg: keyword.name,
          value: formatLiteral(value),
          allowed: formatLiteral([...enumValues]),
        }),
      )
    }
  }

  if (market === 'hk' && module === 'tqx_data' && spec.name === 'get_index_component') {
    const indexSymbol = findKeyword(call, 'index_symbol')
    if (indexSymbol !== undefined) {
      const value = literalValue(indexSymbol.valueNode, source)
      if (typeof value === 'string' && value.toUpperCase() === 'HSI.HK') {
        return makeFinding(
          frame,
          indexSymbol.valueNode,
          t('hk_index_symbol_must_use_catalog_code', locale),
        )
      }
    }
  }

  return undefined
}

function collectDataApiBindings(root: SyntaxNode, source: string): DataApiBindings {
  const moduleAliases: Record<DataApiModule, Set<string>> = {
    panda_data: new Set(['panda_data']),
    tqx_data: new Set(['tqx_data']),
  }
  const fromImports = new Map<string, { module: DataApiModule; method: string }>()

  for (const node of walkNodes(root)) {
    if (node.name !== 'ImportStatement') continue
    const children = directChildren(node)
    const firstKeyword = firstNonPunctuation(children)
    if (firstKeyword === undefined) continue

    if (firstKeyword.name === 'from') {
      const importIndex = children.findIndex((child) => child.name === 'import')
      if (importIndex <= 1) continue
      const moduleName = readQualifiedName(children, source, 1, importIndex)
      if (moduleName !== 'panda_data' && moduleName !== 'tqx_data') continue

      let index = importIndex + 1
      while (index < children.length) {
        const current = children[index]
        if (current === undefined || current.name === ',') {
          index += 1
          continue
        }
        if (
          current.name !== 'VariableName' &&
          current.name !== 'PropertyName' &&
          current.name !== '*'
        ) {
          index += 1
          continue
        }

        const importedName = current.name === '*' ? '*' : nodeText(source, current)
        let localName = importedName
        const aliasToken = children[index + 1]
        const aliasName = children[index + 2]
        if (
          aliasToken?.name === 'as' &&
          aliasName !== undefined &&
          (aliasName.name === 'VariableName' || aliasName.name === 'PropertyName')
        ) {
          localName = nodeText(source, aliasName)
          index += 3
        } else {
          index += 1
        }
        if (importedName !== '*') {
          fromImports.set(localName, { module: moduleName, method: importedName })
        }
      }
      continue
    }

    if (firstKeyword.name !== 'import') continue
    let index = 1
    while (index < children.length) {
      const current = children[index]
      if (current === undefined || current.name === ',') {
        index += 1
        continue
      }
      if (current.name !== 'VariableName' && current.name !== 'PropertyName') {
        index += 1
        continue
      }

      const moduleName = nodeText(source, current)
      let localName = moduleName
      const aliasToken = children[index + 1]
      const aliasName = children[index + 2]
      if (
        aliasToken?.name === 'as' &&
        aliasName !== undefined &&
        (aliasName.name === 'VariableName' || aliasName.name === 'PropertyName')
      ) {
        localName = nodeText(source, aliasName)
        index += 3
      } else {
        index += 1
      }
      if (moduleName === 'panda_data' || moduleName === 'tqx_data') {
        moduleAliases[moduleName].add(localName)
      }
    }
  }

  return { moduleAliases, fromImports }
}

function resolveDataApiCall(
  call: CallAnalysis,
  bindings: DataApiBindings,
): ResolvedDataApiCall | undefined {
  if (call.callee !== null) {
    const parts = call.callee.split('.')
    if (parts.length >= 2) {
      const moduleAlias = parts[0] ?? ''
      const method = parts.slice(1).join('.')
      if (method) {
        if (bindings.moduleAliases.panda_data.has(moduleAlias)) {
          return { module: 'panda_data', method }
        }
        if (bindings.moduleAliases.tqx_data.has(moduleAlias)) {
          return { module: 'tqx_data', method }
        }
      }
    }
  }

  if (call.rootName !== null) {
    const imported = bindings.fromImports.get(call.rootName)
    if (imported !== undefined) return imported
  }

  return undefined
}

function callDisplayMethod(call: CallAnalysis, resolvedCall?: ResolvedDataApiCall): string {
  if (resolvedCall?.method !== undefined && resolvedCall.method.length > 0)
    return resolvedCall.method
  if (call.callee !== null && call.callee.includes('.')) {
    const method = call.callee.split('.').slice(1).join('.')
    if (method.length > 0) return method
  }
  return call.rootName ?? 'get_*'
}

function firstNonPunctuation(nodes: readonly SyntaxNode[]): SyntaxNode | undefined {
  for (const node of nodes) {
    if (!isPunctuation(node)) return node
  }
  return undefined
}

function readQualifiedName(
  nodes: readonly SyntaxNode[],
  source: string,
  start: number,
  end: number,
): string | undefined {
  const parts: string[] = []
  for (let index = start; index < end; index += 1) {
    const node = nodes[index]
    if (node === undefined || node.name === '.') continue
    if (node.name !== 'VariableName' && node.name !== 'PropertyName') break
    parts.push(nodeText(source, node))
  }
  return parts.length > 0 ? parts.join('.') : undefined
}

function findLineForPattern(frame: SourceFrame, pattern: RegExp): number | undefined {
  for (let index = 0; index < frame.lines.length; index += 1) {
    if (pattern.test(frame.lines[index] ?? '')) return index + 1
  }
  return undefined
}

function findLineForIndex(source: string, index: number): number {
  let line = 1
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source[cursor] === '\n') line += 1
  }
  return line
}

function detectLookbackRule(
  source: string,
  frame: SourceFrame,
  locale: string,
): Finding | undefined {
  const windows = new Set<number>()
  ROLLING_LONG_WINDOW_RE.lastIndex = 0
  for (const match of source.matchAll(ROLLING_LONG_WINDOW_RE)) {
    windows.add(Number(match[1]))
  }
  const constMap = new Map<string, number>()
  for (const match of source.matchAll(CONTEXT_WINDOW_CONST_RE)) {
    constMap.set(match[1]!, Number(match[2]))
  }
  for (const match of source.matchAll(ROLLING_VAR_WINDOW_RE)) {
    const ref = match[1]!
    const attr = ref.split('.').pop() ?? ref
    const value = constMap.get(attr)
    if (value !== undefined) windows.add(value)
  }
  const maxWindow = Math.max(...Array.from(windows))
  if (!Number.isFinite(maxWindow) || maxWindow < 30) return undefined
  if (!TRADE_DATE_FROM_RUN_INFO_RE.test(source)) return undefined
  if (TRADE_DATE_SHIFT_RE.test(source)) return undefined
  const line = findLineForPattern(frame, /run_info\.start_date/)
  if (line === undefined) return undefined
  return makeFindingAtLine(
    frame,
    line,
    t('missing_lookback_for_rolling_window', locale, {
      max_window: maxWindow,
      buffer_days: maxWindow * 2,
    }),
  )
}

function detectContextStateRule(
  analyses: Map<string, FunctionAnalysis>,
  frame: SourceFrame,
  locale: string,
): Finding | undefined {
  const initialized = new Set<string>()
  for (const analysis of analyses.values()) {
    for (const use of analysis.contextAttrs) {
      if (use.isWrite) initialized.add(use.attr)
    }
  }
  for (const analysis of analyses.values()) {
    for (const use of analysis.contextAttrs) {
      if (use.isWrite) continue
      if (CONTEXT_ALLOWED_ATTRS.has(use.attr)) continue
      if (initialized.has(use.attr)) continue
      return makeFindingAtLine(
        frame,
        use.line,
        t('context_attr_not_initialized', locale, {
          lineno: use.line,
          attr: use.attr,
        }),
      )
    }
  }
  return undefined
}

function detectFutureSpecificRules(
  analyses: Map<string, FunctionAnalysis>,
  source: string,
  frame: SourceFrame,
  market: QubeMarket,
  locale: string,
): Finding | undefined {
  if (market !== 'future') return undefined

  const handleDataFunctions = reachableFunctionsFromRoots(analyses, ['handle_data'])
  for (const analysis of analyses.values()) {
    if (!handleDataFunctions.has(analysis.name)) continue
    for (const call of analysis.calls) {
      if (call.rootName === 'panda_data') {
        return makeFinding(
          frame,
          call.node,
          t('future_panda_data_in_handle_data', locale, {
            lineno: call.line,
            method: callDisplayMethod(call),
          }),
        )
      }
    }
  }

  for (const match of source.matchAll(
    /(?:str\(\s*context\.now\s*\)\s*\[:\s*8\s*\]|context\.now\s*\[:\s*8\s*\]|context\.now\.strftime\(\s*['"]%Y%m%d['"]\s*\))/g,
  )) {
    const line = findLineForIndex(source, match.index ?? 0)
    return makeFindingAtLine(
      frame,
      line,
      t('future_now_used_as_trade_date', locale, {
        lineno: line,
      }),
    )
  }

  for (const analysis of analyses.values()) {
    for (const call of analysis.calls) {
      if (!FUTURE_ORDER_CALL_NAMES.has(call.rootName ?? '')) continue
      const symbolArg = findFutureOrderSymbolArg(call, source, analysis, analyses)
      if (symbolArg !== undefined && CONTINUOUS_FUTURE_RE.test(symbolArg)) {
        return makeFinding(
          frame,
          call.node,
          t('future_order_on_continuous_symbol', locale, {
            lineno: call.line,
            func_name: call.rootName ?? call.callee ?? 'call',
            symbol: symbolArg,
          }),
        )
      }
    }
  }

  return undefined
}

function findFutureOrderSymbolArg(
  call: CallAnalysis,
  source: string,
  analysis: FunctionAnalysis,
  analyses: Map<string, FunctionAnalysis>,
): string | undefined {
  const direct = findKeyword(call, 'symbol')
  if (direct !== undefined) {
    const value = resolveLiteralLikeValue(direct.valueNode, source, analysis, analyses)
    if (typeof value === 'string') return value
  }
  const positional = call.positionalArgs[1]
  if (positional !== undefined) {
    const value = resolveLiteralLikeValue(positional, source, analysis, analyses)
    if (typeof value === 'string') return value
  }
  return undefined
}

function resolveLiteralLikeValue(
  node: SyntaxNode,
  source: string,
  analysis: FunctionAnalysis,
  analyses: Map<string, FunctionAnalysis>,
): DataApiLiteral | DataApiLiteral[] | undefined {
  const literal = literalValue(node, source)
  if (literal !== undefined) return literal
  const key = assignmentTargetKey(node, source)
  if (key !== undefined) {
    const local = analysis.stringBindings.get(key)
    if (local !== undefined) return local
    for (const current of analyses.values()) {
      const global = current.stringBindings.get(key)
      if (global !== undefined) return global
    }
  }
  if (node.name === 'VariableName') {
    const keyName = nodeText(source, node)
    const local = analysis.stringBindings.get(keyName)
    if (local !== undefined) return local
    for (const current of analyses.values()) {
      const global = current.stringBindings.get(keyName)
      if (global !== undefined) return global
    }
  }
  return undefined
}

function buildFunctionAnalyses(
  functions: Map<string, SyntaxNode>,
  source: string,
): Map<string, FunctionAnalysis> {
  const analyses = new Map<string, FunctionAnalysis>()
  for (const [name, node] of functions) {
    analyses.set(name, analyzeFunction(name, node, source, functions))
  }
  return analyses
}

function analyzeFunction(
  name: string,
  node: SyntaxNode,
  source: string,
  topLevelFunctions: Map<string, SyntaxNode>,
): FunctionAnalysis {
  const analysis: FunctionAnalysis = {
    name,
    node,
    calls: [],
    directCalls: new Set<string>(),
    contextAttrs: [],
    stringBindings: new Map<string, string>(),
    hasTry: false,
  }

  walk(node, (child) => {
    if (child.name === 'TryStatement') analysis.hasTry = true
    if (child.name === 'CallExpression') {
      const call = parseCall(child, source)
      if (call !== undefined) {
        analysis.calls.push(call)
        if (
          call.rootName !== null &&
          call.rootName === call.callee &&
          topLevelFunctions.has(call.rootName)
        ) {
          analysis.directCalls.add(call.rootName)
        }
      }
    }
    if (child.name === 'MemberExpression') {
      const chain = expressionNameChain(child, source)
      if (chain !== null && chain[0] === 'context' && chain.length >= 2) {
        analysis.contextAttrs.push({
          attr: chain[1]!,
          line: lineForPosition(createSourceFrame(source), child.from ?? child.to),
          isWrite: isContextMemberWrite(child, source),
        })
      }
    }
    if (child.name === 'AssignStatement' || child.name === 'UpdateStatement') {
      const target = firstMeaningfulChild(child)
      const value = lastMeaningfulChild(child)
      if (target !== undefined && value !== undefined) {
        const key = assignmentTargetKey(target, source)
        const literal = literalValue(value, source)
        if (key !== undefined && typeof literal === 'string') {
          analysis.stringBindings.set(key, literal)
        }
      }
    }
  })

  return analysis
}

function collectTopLevelFunctions(root: SyntaxNode, source: string): Map<string, SyntaxNode> {
  const result = new Map<string, SyntaxNode>()
  for (const child of directChildren(root)) {
    if (child.name !== 'FunctionDefinition') continue
    const name = functionName(child, source)
    if (name !== undefined) result.set(name, child)
  }
  return result
}

function parseCall(node: SyntaxNode, source: string): CallAnalysis | undefined {
  const children = directChildren(node)
  const callee = children.find((child) => child.name !== 'ArgList')
  if (callee === undefined) return undefined
  const calleeText = expressionNameChain(callee, source)?.join('.') ?? null
  const rootName = calleeText === null ? null : (calleeText.split('.')[0] ?? null)
  const argList = children.find((child) => child.name === 'ArgList')
  const keywords: KeywordArg[] = []
  const positionalArgs: SyntaxNode[] = []
  if (argList !== undefined) {
    const items = directChildren(argList).filter((child) => !isPunctuation(child))
    for (let index = 0; index < items.length; index += 1) {
      const current = items[index]
      if (current === undefined) continue
      if (current.name === '*' || current.name === '**') {
        index += 1
        continue
      }
      const next = items[index + 1]
      const next2 = items[index + 2]
      if (current.name === 'VariableName' && next?.name === 'AssignOp' && next2 !== undefined) {
        keywords.push({ name: nodeText(source, current), valueNode: next2 })
        index += 2
        continue
      }
      positionalArgs.push(current)
    }
  }

  return {
    node,
    callee: calleeText,
    rootName,
    keywords,
    positionalArgs,
    line: lineForPosition(createSourceFrame(source), node.from ?? node.to),
  }
}

function literalValue(
  node: SyntaxNode,
  source: string,
): DataApiLiteral | DataApiLiteral[] | undefined {
  if (node.name === 'String') {
    return parseStringLiteral(nodeText(source, node))
  }
  if (node.name === 'Number') {
    const normalized = nodeText(source, node).replace(/_/g, '')
    const value = Number(normalized)
    return Number.isFinite(value) ? value : undefined
  }
  if (node.name === 'Boolean') {
    return nodeText(source, node) === 'True'
  }
  if (node.name === 'None') return null
  if (node.name === 'ParenthesizedExpression' || node.name === 'AtomExpression') {
    for (const child of directChildren(node)) {
      if (isPunctuation(child)) continue
      return literalValue(child, source)
    }
    return undefined
  }
  if (node.name === 'ArrayExpression' || node.name === 'TupleExpression') {
    const values: DataApiLiteral[] = []
    for (const child of directChildren(node)) {
      if (isPunctuation(child)) continue
      const value = literalValue(child, source)
      if (value === undefined || Array.isArray(value)) return undefined
      values.push(value)
    }
    return values
  }
  return undefined
}

function parseStringLiteral(text: string): string | undefined {
  const match = text.match(/^[rRuUbBfF]*('''|"""|'|")([\s\S]*)\1$/)
  return match === null ? undefined : match[2]
}

function assignmentTargetKey(node: SyntaxNode, source: string): string | undefined {
  const chain = expressionNameChain(node, source)
  if (chain === null || chain.length === 0) return undefined
  if (chain.length === 1) return chain[0]
  if (chain[0] === 'context' && chain[1] !== undefined) return `context.${chain[1]}`
  return undefined
}

function isContextMemberWrite(node: SyntaxNode, source: string): boolean {
  const tail = source.slice(node.to)
  return /^\s*(?:\+=|-=|\*=|\/=|%=|@=|&=|\|=|\^=|\/\/=|<<=|>>=|=(?![=<>]))/.test(tail)
}

function exactSignature(node: SyntaxNode, source: string, expected: readonly string[]): boolean {
  const paramList = directChildren(node).find((child) => child.name === 'ParamList')
  if (paramList === undefined) return expected.length === 0
  return nodeText(source, paramList).replace(/\s+/g, '') === `(${expected.join(',')})`
}

function functionName(node: SyntaxNode, source: string): string | undefined {
  const nameNode = directChildren(node).find((child) => child.name === 'VariableName')
  return nameNode === undefined ? undefined : emptyToUndefined(nodeText(source, nameNode))
}

function isAsyncFunction(node: SyntaxNode, source: string): boolean {
  return nodeText(source, node).trimStart().startsWith('async ')
}

function hasDirectCall(analysis: FunctionAnalysis | undefined, calleeName: string): boolean {
  return (
    analysis?.calls.some((call) => call.callee === calleeName && call.rootName === calleeName) ??
    false
  )
}

function reachableFunctionsFromRoots(
  analyses: Map<string, FunctionAnalysis>,
  roots: readonly string[],
): Set<string> {
  const visited = new Set<string>()
  const queue = [...roots]
  while (queue.length > 0) {
    const name = queue.shift()
    if (name === undefined || visited.has(name)) continue
    const analysis = analyses.get(name)
    if (analysis === undefined) continue
    visited.add(name)
    for (const direct of analysis.directCalls) {
      if (!visited.has(direct)) queue.push(direct)
    }
  }
  return visited
}

function findKeyword(call: CallAnalysis, name: string): KeywordArg | undefined {
  return call.keywords.find((item) => item.name === name)
}

function formatLiteral(value: DataApiLiteral | DataApiLiteral[]): string {
  if (Array.isArray(value)) return `[${value.map((item) => formatLiteral(item)).join(', ')}]`
  if (typeof value === 'string') return `'${value}'`
  if (value === null) return 'None'
  return String(value)
}

function literalMatchesEnum(
  value: DataApiLiteral | DataApiLiteral[],
  allowed: readonly DataApiLiteral[],
): boolean {
  if (Array.isArray(value)) return value.every((item) => allowed.includes(item))
  return allowed.includes(value)
}

function normalizeUsSymbolsInCode(code: string): string {
  return code.replace(/(["'])([A-Za-z][A-Za-z0-9.-]{0,15})\.(?:US|NY)\1/g, '$1$2.NB$1')
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ')
}

function emptyToUndefined(value: string): string | undefined {
  return value.length > 0 ? value : undefined
}

function nodeText(source: string, node: SyntaxNode): string {
  return source.slice(node.from, node.to)
}

function directChildren(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = []
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    children.push(child)
  }
  return children
}

function firstMeaningfulChild(node: SyntaxNode): SyntaxNode | undefined {
  for (const child of directChildren(node)) {
    if (!isPunctuation(child)) return child
  }
  return undefined
}

function lastMeaningfulChild(node: SyntaxNode): SyntaxNode | undefined {
  const children = directChildren(node)
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index]
    if (child !== undefined && !isPunctuation(child)) return child
  }
  return undefined
}

function walk(node: SyntaxNode, visit: (child: SyntaxNode) => void): void {
  visit(node)
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    walk(child, visit)
  }
}

function walkNodes(root: SyntaxNode): SyntaxNode[] {
  const nodes: SyntaxNode[] = []
  walk(root, (node) => nodes.push(node))
  return nodes
}

function isPunctuation(node: SyntaxNode): boolean {
  return PUNCTUATION.has(node.name)
}

function expressionNameChain(node: SyntaxNode, source: string): string[] | null {
  if (node.name === 'VariableName' || node.name === 'PropertyName') {
    return [nodeText(source, node)]
  }
  if (node.name === 'MemberExpression') {
    const parts: string[] = []
    for (const child of directChildren(node)) {
      if (child.name === 'VariableName' || child.name === 'PropertyName') {
        parts.push(nodeText(source, child))
      } else if (child.name === 'MemberExpression') {
        const nested = expressionNameChain(child, source)
        if (nested !== null) parts.push(...nested)
      }
    }
    return parts.length > 0 ? parts : null
  }
  if (
    node.name === 'ParenthesizedExpression' ||
    node.name === 'AtomExpression' ||
    node.name === 'SubscriptExpression'
  ) {
    for (const child of directChildren(node)) {
      if (isPunctuation(child)) continue
      const nested = expressionNameChain(child, source)
      if (nested !== null) return nested
    }
    return null
  }
  return null
}

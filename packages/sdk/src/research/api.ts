import { BacktestApi } from './backtest-api'
import { FactorApi } from './factor-api'
import { StrategyApi } from './strategy-api'
import { ResearchEventsApi, type ResearchStreamRequest } from './events'
import type { ResearchRequest } from './shared'

export type ResearchApi = Pick<FactorApi, keyof FactorApi> &
  Pick<StrategyApi, keyof StrategyApi> &
  Pick<BacktestApi, keyof BacktestApi> &
  Pick<ResearchEventsApi, keyof ResearchEventsApi>
export class ResearchApiClient implements ResearchApi {
  readonly #factors: FactorApi
  readonly #strategies: StrategyApi
  readonly #backtests: BacktestApi
  readonly #events: ResearchEventsApi
  constructor(request: ResearchRequest, stream: ResearchStreamRequest) {
    this.#factors = new FactorApi(request)
    this.#strategies = new StrategyApi(request)
    this.#backtests = new BacktestApi(request)
    this.#events = new ResearchEventsApi(stream)
  }
  streamFactorAnalysis(...args: Parameters<ResearchEventsApi['streamFactorAnalysis']>) {
    return this.#events.streamFactorAnalysis(...args)
  }
  streamBacktest(...args: Parameters<ResearchEventsApi['streamBacktest']>) {
    return this.#events.streamBacktest(...args)
  }
  streamFactorTuning(...args: Parameters<ResearchEventsApi['streamFactorTuning']>) {
    return this.#events.streamFactorTuning(...args)
  }
  streamStrategyTuning(...args: Parameters<ResearchEventsApi['streamStrategyTuning']>) {
    return this.#events.streamStrategyTuning(...args)
  }
  createFactor(...args: Parameters<FactorApi['createFactor']>) {
    return this.#factors.createFactor(...args)
  }
  getFactor(...args: Parameters<FactorApi['getFactor']>) {
    return this.#factors.getFactor(...args)
  }
  getFactorSource(...args: Parameters<FactorApi['getFactorSource']>) {
    return this.#factors.getFactorSource(...args)
  }
  updateFactor(...args: Parameters<FactorApi['updateFactor']>) {
    return this.#factors.updateFactor(...args)
  }
  updateFactorSource(...args: Parameters<FactorApi['updateFactorSource']>) {
    return this.#factors.updateFactorSource(...args)
  }
  listFactors(...args: Parameters<FactorApi['listFactors']>) {
    return this.#factors.listFactors(...args)
  }
  deleteFactor(...args: Parameters<FactorApi['deleteFactor']>) {
    return this.#factors.deleteFactor(...args)
  }
  validateFactor(...args: Parameters<FactorApi['validateFactor']>) {
    return this.#factors.validateFactor(...args)
  }
  createFactorAnalysis(...args: Parameters<FactorApi['createFactorAnalysis']>) {
    return this.#factors.createFactorAnalysis(...args)
  }
  getFactorAnalysis(...args: Parameters<FactorApi['getFactorAnalysis']>) {
    return this.#factors.getFactorAnalysis(...args)
  }
  cancelFactorAnalysis(...args: Parameters<FactorApi['cancelFactorAnalysis']>) {
    return this.#factors.cancelFactorAnalysis(...args)
  }
  listFactorAnalyses(...args: Parameters<FactorApi['listFactorAnalyses']>) {
    return this.#factors.listFactorAnalyses(...args)
  }
  listAnalyses(...args: Parameters<FactorApi['listAnalyses']>) {
    return this.#factors.listAnalyses(...args)
  }
  listFactorSnapshots(...args: Parameters<FactorApi['listFactorSnapshots']>) {
    return this.#factors.listFactorSnapshots(...args)
  }
  createFactorSnapshot(...args: Parameters<FactorApi['createFactorSnapshot']>) {
    return this.#factors.createFactorSnapshot(...args)
  }
  listFactorTunings(...args: Parameters<FactorApi['listFactorTunings']>) {
    return this.#factors.listFactorTunings(...args)
  }
  createFactorTuning(...args: Parameters<FactorApi['createFactorTuning']>) {
    return this.#factors.createFactorTuning(...args)
  }
  getFactorTuning(...args: Parameters<FactorApi['getFactorTuning']>) {
    return this.#factors.getFactorTuning(...args)
  }
  cancelFactorTuning(...args: Parameters<FactorApi['cancelFactorTuning']>) {
    return this.#factors.cancelFactorTuning(...args)
  }
  rerunFactorTuning(...args: Parameters<FactorApi['rerunFactorTuning']>) {
    return this.#factors.rerunFactorTuning(...args)
  }
  applyFactorTuning(...args: Parameters<FactorApi['applyFactorTuning']>) {
    return this.#factors.applyFactorTuning(...args)
  }
  listFactorTuningSummaries(...args: Parameters<FactorApi['listFactorTuningSummaries']>) {
    return this.#factors.listFactorTuningSummaries(...args)
  }
  listFactorVersions(...args: Parameters<FactorApi['listFactorVersions']>) {
    return this.#factors.listFactorVersions(...args)
  }
  getFactorVersion(...args: Parameters<FactorApi['getFactorVersion']>) {
    return this.#factors.getFactorVersion(...args)
  }
  createFactorVersion(...args: Parameters<FactorApi['createFactorVersion']>) {
    return this.#factors.createFactorVersion(...args)
  }
  restoreFactorVersion(...args: Parameters<FactorApi['restoreFactorVersion']>) {
    return this.#factors.restoreFactorVersion(...args)
  }
  restoreFactorAnalysis(...args: Parameters<FactorApi['restoreFactorAnalysis']>) {
    return this.#factors.restoreFactorAnalysis(...args)
  }
  pollFactorAnalysis(...args: Parameters<FactorApi['pollFactorAnalysis']>) {
    return this.#factors.pollFactorAnalysis(...args)
  }
  createStrategy(...args: Parameters<StrategyApi['createStrategy']>) {
    return this.#strategies.createStrategy(...args)
  }
  getStrategy(...args: Parameters<StrategyApi['getStrategy']>) {
    return this.#strategies.getStrategy(...args)
  }
  getStrategySource(...args: Parameters<StrategyApi['getStrategySource']>) {
    return this.#strategies.getStrategySource(...args)
  }
  updateStrategy(...args: Parameters<StrategyApi['updateStrategy']>) {
    return this.#strategies.updateStrategy(...args)
  }
  updateStrategySource(...args: Parameters<StrategyApi['updateStrategySource']>) {
    return this.#strategies.updateStrategySource(...args)
  }
  listStrategies(...args: Parameters<StrategyApi['listStrategies']>) {
    return this.#strategies.listStrategies(...args)
  }
  deleteStrategy(...args: Parameters<StrategyApi['deleteStrategy']>) {
    return this.#strategies.deleteStrategy(...args)
  }
  validateStrategy(...args: Parameters<StrategyApi['validateStrategy']>) {
    return this.#strategies.validateStrategy(...args)
  }
  validateStrategyCode(...args: Parameters<StrategyApi['validateStrategyCode']>) {
    return this.#strategies.validateStrategyCode(...args)
  }
  runStrategyBacktest(...args: Parameters<StrategyApi['runStrategyBacktest']>) {
    return this.#strategies.runStrategyBacktest(...args)
  }
  listStrategyBacktests(...args: Parameters<StrategyApi['listStrategyBacktests']>) {
    return this.#strategies.listStrategyBacktests(...args)
  }
  getBacktest(...args: Parameters<StrategyApi['getBacktest']>) {
    return this.#strategies.getBacktest(...args)
  }
  cancelBacktest(...args: Parameters<StrategyApi['cancelBacktest']>) {
    return this.#strategies.cancelBacktest(...args)
  }
  listBacktests(...args: Parameters<StrategyApi['listBacktests']>) {
    return this.#strategies.listBacktests(...args)
  }
  pollBacktest(...args: Parameters<StrategyApi['pollBacktest']>) {
    return this.#strategies.pollBacktest(...args)
  }
  listStrategyVersions(...args: Parameters<StrategyApi['listStrategyVersions']>) {
    return this.#strategies.listStrategyVersions(...args)
  }
  getStrategyVersion(...args: Parameters<StrategyApi['getStrategyVersion']>) {
    return this.#strategies.getStrategyVersion(...args)
  }
  createStrategyVersion(...args: Parameters<StrategyApi['createStrategyVersion']>) {
    return this.#strategies.createStrategyVersion(...args)
  }
  restoreStrategyVersion(...args: Parameters<StrategyApi['restoreStrategyVersion']>) {
    return this.#strategies.restoreStrategyVersion(...args)
  }
  restoreBacktest(...args: Parameters<StrategyApi['restoreBacktest']>) {
    return this.#strategies.restoreBacktest(...args)
  }
  listFactorVersionsForStrategy(...args: Parameters<StrategyApi['listFactorVersionsForStrategy']>) {
    return this.#strategies.listFactorVersionsForStrategy(...args)
  }
  listStrategyTunings(...args: Parameters<StrategyApi['listStrategyTunings']>) {
    return this.#strategies.listStrategyTunings(...args)
  }
  createStrategyTuning(...args: Parameters<StrategyApi['createStrategyTuning']>) {
    return this.#strategies.createStrategyTuning(...args)
  }
  getStrategyTuning(...args: Parameters<StrategyApi['getStrategyTuning']>) {
    return this.#strategies.getStrategyTuning(...args)
  }
  cancelStrategyTuning(...args: Parameters<StrategyApi['cancelStrategyTuning']>) {
    return this.#strategies.cancelStrategyTuning(...args)
  }
  rerunStrategyTuning(...args: Parameters<StrategyApi['rerunStrategyTuning']>) {
    return this.#strategies.rerunStrategyTuning(...args)
  }
  applyStrategyTuning(...args: Parameters<StrategyApi['applyStrategyTuning']>) {
    return this.#strategies.applyStrategyTuning(...args)
  }
  listStrategyTuningSummaries(...args: Parameters<StrategyApi['listStrategyTuningSummaries']>) {
    return this.#strategies.listStrategyTuningSummaries(...args)
  }
  listStrategyVersionSummaries(...args: Parameters<StrategyApi['listStrategyVersionSummaries']>) {
    return this.#strategies.listStrategyVersionSummaries(...args)
  }
  getBacktestResultPage(...args: Parameters<BacktestApi['getBacktestResultPage']>) {
    return this.#backtests.getBacktestResultPage(...args)
  }
  getBacktestChart(...args: Parameters<BacktestApi['getBacktestChart']>) {
    return this.#backtests.getBacktestChart(...args)
  }
  getBacktestSymbolKlines(...args: Parameters<BacktestApi['getBacktestSymbolKlines']>) {
    return this.#backtests.getBacktestSymbolKlines(...args)
  }
}

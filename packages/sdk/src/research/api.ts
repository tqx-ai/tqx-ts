import { BacktestApi } from './backtest-api'
import { FactorApi } from './factor-api'
import { StrategyApi } from './strategy-api'
import type { ResearchRequest } from './shared'

export type ResearchApi = Pick<FactorApi, keyof FactorApi> &
  Pick<StrategyApi, keyof StrategyApi> &
  Pick<BacktestApi, keyof BacktestApi>

/** Composes Qube resource APIs behind the stable flat research client. */
export class ResearchApiClient implements ResearchApi {
  readonly #backtests: BacktestApi
  readonly #factors: FactorApi
  readonly #strategies: StrategyApi

  constructor(request: ResearchRequest) {
    this.#factors = new FactorApi(request)
    this.#strategies = new StrategyApi(request)
    this.#backtests = new BacktestApi(request)
  }

  createFactor(...args: Parameters<FactorApi['createFactor']>) {
    return this.#factors.createFactor(...args)
  }

  getFactor(...args: Parameters<FactorApi['getFactor']>) {
    return this.#factors.getFactor(...args)
  }

  updateFactor(...args: Parameters<FactorApi['updateFactor']>) {
    return this.#factors.updateFactor(...args)
  }

  listFactors(...args: Parameters<FactorApi['listFactors']>) {
    return this.#factors.listFactors(...args)
  }

  deleteFactor(...args: Parameters<FactorApi['deleteFactor']>) {
    return this.#factors.deleteFactor(...args)
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

  createStrategyFromFactor(...args: Parameters<FactorApi['createStrategyFromFactor']>) {
    return this.#factors.createStrategyFromFactor(...args)
  }

  createStrategyAndBacktestFromFactor(
    ...args: Parameters<FactorApi['createStrategyAndBacktestFromFactor']>
  ) {
    return this.#factors.createStrategyAndBacktestFromFactor(...args)
  }

  saveFactor(...args: Parameters<FactorApi['saveFactor']>) {
    return this.#factors.saveFactor(...args)
  }

  listFactorVersions(...args: Parameters<FactorApi['listFactorVersions']>) {
    return this.#factors.listFactorVersions(...args)
  }

  updateFactorVersion(...args: Parameters<FactorApi['updateFactorVersion']>) {
    return this.#factors.updateFactorVersion(...args)
  }

  revertFactorVersion(...args: Parameters<FactorApi['revertFactorVersion']>) {
    return this.#factors.revertFactorVersion(...args)
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

  updateStrategy(...args: Parameters<StrategyApi['updateStrategy']>) {
    return this.#strategies.updateStrategy(...args)
  }

  listStrategies(...args: Parameters<StrategyApi['listStrategies']>) {
    return this.#strategies.listStrategies(...args)
  }

  deleteStrategy(...args: Parameters<StrategyApi['deleteStrategy']>) {
    return this.#strategies.deleteStrategy(...args)
  }

  runStrategyBacktest(...args: Parameters<StrategyApi['runStrategyBacktest']>) {
    return this.#strategies.runStrategyBacktest(...args)
  }

  getStrategyBacktestParameters(...args: Parameters<StrategyApi['getStrategyBacktestParameters']>) {
    return this.#strategies.getStrategyBacktestParameters(...args)
  }

  saveStrategyBacktestParameters(
    ...args: Parameters<StrategyApi['saveStrategyBacktestParameters']>
  ) {
    return this.#strategies.saveStrategyBacktestParameters(...args)
  }

  saveStrategy(...args: Parameters<StrategyApi['saveStrategy']>) {
    return this.#strategies.saveStrategy(...args)
  }

  listStrategyVersions(...args: Parameters<StrategyApi['listStrategyVersions']>) {
    return this.#strategies.listStrategyVersions(...args)
  }

  getStrategyVersion(...args: Parameters<StrategyApi['getStrategyVersion']>) {
    return this.#strategies.getStrategyVersion(...args)
  }

  updateStrategyVersion(...args: Parameters<StrategyApi['updateStrategyVersion']>) {
    return this.#strategies.updateStrategyVersion(...args)
  }

  revertStrategyVersion(...args: Parameters<StrategyApi['revertStrategyVersion']>) {
    return this.#strategies.revertStrategyVersion(...args)
  }

  runStrategyVersionBacktest(...args: Parameters<StrategyApi['runStrategyVersionBacktest']>) {
    return this.#strategies.runStrategyVersionBacktest(...args)
  }

  getBacktest(...args: Parameters<BacktestApi['getBacktest']>) {
    return this.#backtests.getBacktest(...args)
  }

  cancelBacktest(...args: Parameters<BacktestApi['cancelBacktest']>) {
    return this.#backtests.cancelBacktest(...args)
  }

  listBacktests(...args: Parameters<BacktestApi['listBacktests']>) {
    return this.#backtests.listBacktests(...args)
  }

  listBacktestPage(...args: Parameters<BacktestApi['listBacktestPage']>) {
    return this.#backtests.listBacktestPage(...args)
  }

  listBacktestVersionPage(...args: Parameters<BacktestApi['listBacktestVersionPage']>) {
    return this.#backtests.listBacktestVersionPage(...args)
  }

  pollBacktest(...args: Parameters<BacktestApi['pollBacktest']>) {
    return this.#backtests.pollBacktest(...args)
  }
}

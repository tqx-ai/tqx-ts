import * as v from 'valibot'

const balanceValueSchema = v.union([v.string(), v.number()])

const balanceSourceSchema = v.union([
  v.looseObject({
    balance: balanceValueSchema,
  }),
  v.looseObject({
    computingPower: balanceValueSchema,
  }),
  v.looseObject({
    computing_power: balanceValueSchema,
  }),
])

export const BalanceDataSchema = v.pipe(
  balanceSourceSchema,
  v.transform((value) => ({
    balance:
      'balance' in value
        ? value.balance
        : 'computingPower' in value
          ? value.computingPower
          : value.computing_power,
  })),
)

export type BalanceData = v.InferOutput<typeof BalanceDataSchema>

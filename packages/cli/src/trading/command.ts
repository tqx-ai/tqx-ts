import { defineCommand } from 'citty'
import { randomUUID } from 'node:crypto'

import type { CommandRuntime } from '../runtime/command-runtime'
import { CliUsageError } from '../utils/errors'
import { optionalNumber } from '../utils/numbers'

export function createTradingCommand(runtime: CommandRuntime) {
  const paginationArgs = {
    limit: { type: 'string', description: 'Maximum number of results (1-100)' },
    cursor: { type: 'string', description: 'Opaque pagination cursor' },
  } as const

  const orders = defineCommand({
    meta: { name: 'orders', description: 'Inspect and manage orders' },
    subCommands: {
      list: defineCommand({
        meta: { name: 'list', description: 'List current orders' },
        args: paginationArgs,
        run: ({ args }) =>
          runtime.trading((client) =>
            client.trading.listOrders({ limit: optionalNumber(args.limit), cursor: args.cursor }),
          ),
      }),
      get: defineCommand({
        meta: { name: 'get', description: 'Get a current order' },
        args: {
          orderId: { type: 'positional', description: 'Order ID', required: true },
        },
        run: ({ args }) => runtime.trading((client) => client.trading.getOrder(args.orderId)),
      }),
      place: defineCommand({
        meta: { name: 'place', description: 'Place an order' },
        args: {
          symbol: { type: 'string', required: true, description: 'Symbol such as 00700.HK' },
          side: { type: 'enum', options: ['BUY', 'SELL'], required: true },
          orderType: {
            type: 'enum',
            options: ['MARKET', 'LIMIT'],
            description: 'Order type (defaults to MARKET)',
          },
          quantity: { type: 'string', required: true, description: 'Positive integer quantity' },
          price: { type: 'string', description: 'Required for LIMIT orders' },
          reason: { type: 'string', description: 'Optional order rationale' },
          idempotencyKey: {
            type: 'string',
            description: 'Stable key used to safely retry this order (generated when omitted)',
          },
          yes: { type: 'boolean', description: 'Confirm order submission' },
        },
        run: ({ args }) =>
          runtime.trading((client) => {
            if (!args.yes) throw new CliUsageError('order submission requires --yes')
            return client.trading.placeOrder({
              symbol: args.symbol!,
              side: args.side!,
              orderType: args.orderType ?? 'MARKET',
              quantity: args.quantity!,
              price: args.price,
              reason: args.reason,
              idempotencyKey: args.idempotencyKey ?? `cli-order-${randomUUID()}`,
            })
          }),
      }),
      modify: defineCommand({
        meta: { name: 'modify', description: 'Modify an order price' },
        args: {
          orderId: { type: 'positional', description: 'Order ID', required: true },
          price: { type: 'string', required: true, description: 'New positive price' },
        },
        run: ({ args }) =>
          runtime.trading((client) =>
            client.trading.modifyOrder({ orderId: args.orderId, price: args.price }),
          ),
      }),
      cancel: defineCommand({
        meta: { name: 'cancel', description: 'Cancel an order' },
        args: {
          orderId: { type: 'positional', description: 'Order ID', required: true },
        },
        run: ({ args }) => runtime.trading((client) => client.trading.cancelOrder(args.orderId)),
      }),
    },
  })

  return defineCommand({
    meta: { name: 'trading', description: 'Access trading account data and operations' },
    subCommands: {
      account: defineCommand({
        meta: { name: 'account', description: 'Show the trading account' },
        args: {
          currency: { type: 'enum', options: ['HKD', 'USD'], description: 'Currency filter' },
        },
        run: ({ args }) =>
          runtime.trading((client) => client.trading.getAccount({ currency: args.currency })),
      }),
      positions: defineCommand({
        meta: { name: 'positions', description: 'List positions' },
        args: {
          symbol: { type: 'string', description: 'Symbol filter' },
          market: { type: 'enum', options: ['HK', 'US'], description: 'Market filter' },
          ...paginationArgs,
        },
        run: ({ args }) =>
          runtime.trading((client) =>
            client.trading.listPositions({
              symbol: args.symbol,
              market: args.market,
              limit: optionalNumber(args.limit),
              cursor: args.cursor,
            }),
          ),
      }),
      orders,
      trades: defineCommand({
        meta: { name: 'trades', description: 'List recent trades' },
        args: {
          market: { type: 'enum', options: ['HK', 'US'], description: 'Market filter' },
          orderId: { type: 'string', description: 'Order ID filter' },
          ...paginationArgs,
        },
        run: ({ args }) =>
          runtime.trading((client) =>
            client.trading.listTrades({
              market: args.market,
              orderId: args.orderId,
              limit: optionalNumber(args.limit),
              cursor: args.cursor,
            }),
          ),
      }),
      signals: defineCommand({
        meta: { name: 'signals', description: 'Inspect trading signals' },
        subCommands: {
          get: defineCommand({
            meta: { name: 'get', description: 'Get a signal' },
            args: {
              signalId: { type: 'positional', description: 'Signal ID', required: true },
            },
            run: ({ args }) => runtime.trading((client) => client.trading.getSignal(args.signalId)),
          }),
        },
      }),
    },
  })
}

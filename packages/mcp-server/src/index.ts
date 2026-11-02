import { createApp } from './app'

export default {
  hostname: '127.0.0.1',
  port: 61102,
  fetch: createApp().fetch,
}

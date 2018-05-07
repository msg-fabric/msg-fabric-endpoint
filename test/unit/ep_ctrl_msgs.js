import { Hub, sym_sampi, expect, sleep } from './_setup'

describe @ 'Basic endpoint control messages', @=> ::
  var hub, msg_err

  beforeEach @=> ::
    msg_err = undefined
    hub = Hub.create('$unit$')
    Object.assign @ hub.endpoint.ep_fallback, @{}
      on_error(ep, l_err) :: msg_err = l_err
      on_shutdown(ep) ::

  async function checkCleanExit() ::
    await sleep(10)
    if undefined !== msg_err ::
      throw msg_err

  it @ 'answers ctrl messages, bypassing on_msg callback', @=>> ::
    const tgt = hub.endpoint @ ep => @:
      on_msg() :: throw new Error @ 'Problem'

    await hub.endpoint.client @ async ep => ::
      const ans = await ep.to(tgt).ctrl(null)
      expect(ans).to.equal(true)

    await checkCleanExit()


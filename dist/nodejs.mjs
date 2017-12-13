import { randomBytes } from 'crypto';

const ep_proto$1 = Object.create(Object.getPrototypeOf(function () {}));
function add_ep_kind(kinds) {
  Object.assign(ep_proto$1, kinds);
}

add_ep_kind({
  clientEndpoint(api) {
    const target = clientEndpoint(api);
    this.endpoint(target);
    return target.done;
  },

  client(...args) {
    if (1 === args.length && 'function' === typeof args[0]) {
      return this.clientEndpoint(args[0]);
    }

    const msg_ctx = new this.MsgCtx();
    return 0 !== args.length ? msg_ctx.to(...args) : msg_ctx;
  } });

const ep_client_api = {
  async on_ready(ep, hub) {
    this._resolve((await this.on_client_ready(ep, hub)));
    await ep.shutdown();
  },
  on_send_error(ep, err) {
    this._reject(err);
  },
  on_shutdown(ep, err) {
    err ? this._reject(err) : this._resolve();
  } };

function clientEndpoint(on_client_ready) {
  let target = Object.create(ep_client_api);
  target.on_client_ready = on_client_ready;
  target.done = new Promise((resolve, reject) => {
    target._resolve = resolve;
    target._reject = reject;
  });
  return target;
}

add_ep_kind({
  api(api) {
    return this.endpoint(asAPIEndpoint(api));
  } });

function asAPIEndpoint(api) {
  return (ep, hub) => {
    const invoke = as_rpc(api, ep, hub);
    return on_msg;

    async function on_msg({ msg, sender }) {
      await invoke(msg, sender);
    }
  };
}

function as_rpc(api, ep, hub) {
  const api_for_op = 'function' === typeof api ? op => api(op, ep, hub) : op => api[op];

  return Object.assign(invoke, {
    invoke, resolve_fn, invoke_fn, api_for_op });

  async function invoke(msg, sender) {
    const { op, kw } = msg;
    const fn = await resolve_fn(op, sender);
    if (undefined !== fn) {
      await invoke_fn(op, sender, () => fn(kw));
    }
  }

  async function resolve_fn(op, sender) {
    if ('string' !== typeof op || !op[0].match(/[A-Za-z]/)) {
      await sender.send({ op, err_from: ep,
        error: { message: 'Invalid operation', code: 400 } });
    }

    try {
      const fn = await api_for_op(op);
      if (!fn) {
        await sender.send({ op, err_from: ep,
          error: { message: 'Unknown operation', code: 404 } });
      }
      return fn;
    } catch (err) {
      await sender.send({ op, err_from: ep,
        error: { message: `Invalid operation: ${err.message}`, code: 500 } });
    }
  }

  async function invoke_fn(op, sender, cb) {
    try {
      var answer = await cb();
    } catch (err) {
      await sender.send({ op, err_from: ep, error: err });
      return false;
    }

    if (sender.replyExpected) {
      await sender.send({ op, answer });
    }
    return true;
  }
}

add_ep_kind({
  server(on_init) {
    return this.endpoint(on_init);
  } });

const little_endian = true;
const c_single = 'single';
const c_datagram = 'datagram';
const c_direct = 'direct';
const c_multipart = 'multipart';
const c_streaming = 'streaming';

const _err_msgid_required = `Response reqires 'msgid'`;
const _err_token_required = `Transport reqires 'token'`;

function frm_routing() {
  const size = 8,
        bits = 0x1,
        mask = 0x1;
  return {
    size, bits, mask,

    f_test(obj) {
      return null != obj.from_id ? bits : false;
    },

    f_pack(obj, dv, offset) {
      const { from_id } = obj;
      dv.setInt32(0 + offset, 0 | from_id.id_router, little_endian);
      dv.setInt32(4 + offset, 0 | from_id.id_target, little_endian);
    },

    f_unpack(obj, dv, offset) {
      const from_id = undefined === obj.from_id ? obj.from_id = {} : obj.from_id;
      from_id.id_router = dv.getInt32(0 + offset, little_endian);
      from_id.id_target = dv.getInt32(4 + offset, little_endian);
    } };
}

function frm_response() {
  const size = 8,
        bits = 0x2,
        mask = 0x2;
  return {
    size, bits, mask,

    f_test(obj) {
      return null != obj.msgid ? bits : false;
    },

    f_pack(obj, dv, offset) {
      if (!obj.msgid) {
        throw new Error(_err_msgid_required);
      }
      dv.setInt32(0 + offset, obj.msgid, little_endian);
      dv.setInt16(4 + offset, 0 | obj.seq_ack, little_endian);
      dv.setInt16(6 + offset, 0 | obj.ack_flags, little_endian);
    },

    f_unpack(obj, dv, offset) {
      obj.token = dv.getInt32(0 + offset, little_endian);
      obj.seq_ack = dv.getInt16(4 + offset, little_endian);
      obj.ack_flags = dv.getInt16(6 + offset, little_endian);
    } };
}

function frm_datagram() {
  const size = 0,
        bits = 0x0,
        mask = 0xc;
  return { transport: c_datagram,
    size, bits, mask,

    f_test(obj) {
      if (c_datagram === obj.transport) {
        return bits;
      }
      if (obj.transport && c_single !== obj.transport) {
        return false;
      }
      return !obj.token ? bits : false;
    },

    f_pack(obj, dv, offset) {},

    f_unpack(obj, dv, offset) {
      obj.transport = c_datagram;
    } };
}

function frm_direct() {
  const size = 4,
        bits = 0x4,
        mask = 0xc;
  return { transport: c_direct,
    size, bits, mask,

    f_test(obj) {
      if (c_direct === obj.transport) {
        return bits;
      }
      if (obj.transport && c_single !== obj.transport) {
        return false;
      }
      return !!obj.token ? bits : false;
    },

    f_pack(obj, dv, offset) {
      if (!obj.token) {
        throw new Error(_err_token_required);
      }
      dv.setInt32(0 + offset, obj.token, little_endian);
    },

    f_unpack(obj, dv, offset) {
      obj.msgid = dv.getInt32(0 + offset, little_endian);
      obj.transport = c_direct;
    } };
}

function frm_multipart() {
  const size = 8,
        bits = 0x8,
        mask = 0xc;
  return { transport: c_multipart,
    size, bits, mask,

    f_test(obj) {
      return c_multipart === obj.transport ? bits : false;
    },

    bind_seq_next, seq_pos: 4,
    f_pack(obj, dv, offset) {
      if (!obj.token) {
        throw new Error(_err_token_required);
      }
      dv.setInt32(0 + offset, obj.token, little_endian);
      if (true == obj.seq) {
        // use seq_next
        dv.setInt16(4 + offset, 0, little_endian);
      } else dv.setInt16(4 + offset, 0 | obj.seq, little_endian);
      dv.setInt16(6 + offset, 0 | obj.seq_flags, little_endian);
    },

    f_unpack(obj, dv, offset) {
      obj.msgid = dv.getInt32(0 + offset, little_endian);
      obj.seq = dv.getInt16(4 + offset, little_endian);
      obj.seq_flags = dv.getInt16(6 + offset, little_endian);
      obj.transport = c_multipart;
    } };
}

function frm_streaming() {
  const size = 8,
        bits = 0xc,
        mask = 0xc;
  return { transport: c_streaming,
    size, bits, mask,

    f_test(obj) {
      return c_streaming === obj.transport ? bits : false;
    },

    bind_seq_next, seq_pos: 4,
    f_pack(obj, dv, offset) {
      if (!obj.token) {
        throw new Error(_err_token_required);
      }
      dv.setInt32(0 + offset, obj.token, little_endian);
      if (true == obj.seq) {
        dv.setInt16(4 + offset, 0, little_endian // use seq_next
        );
      } else dv.setInt16(4 + offset, 0 | obj.seq, little_endian);
      dv.setInt16(6 + offset, 0 | obj.seq_flags, little_endian);
    },

    f_unpack(obj, dv, offset) {
      obj.msgid = dv.getInt32(0 + offset, little_endian);
      obj.seq = dv.getInt16(4 + offset, little_endian);
      obj.seq_flags = dv.getInt16(6 + offset, little_endian);
      obj.transport = c_streaming;
    } };
}

function bind_seq_next(offset) {
  const seq_offset = this.seq_pos + offset;
  let seq = 1;
  return function seq_next({ flags, fin }, dv) {
    if (!fin) {
      dv.setInt16(seq_offset, seq++, little_endian);
      dv.setInt16(2 + seq_offset, 0 | flags, little_endian);
    } else {
      dv.setInt16(seq_offset, -seq, little_endian);
      dv.setInt16(2 + seq_offset, 0 | flags, little_endian);
      seq = NaN;
    }
  };
}

var framings = composeFramings();
function composeFramings() {
  const frm_from = frm_routing(),
        frm_resp = frm_response();
  const frm_transports = [frm_datagram(), frm_direct(), frm_multipart(), frm_streaming()];

  if (8 !== frm_from.size || 8 !== frm_resp.size || 4 != frm_transports.length) {
    throw new Error(`Framing Size change`);
  }

  const byBits = [],
        mask = 0xf;

  {
    const t_from = frm_from.f_test,
          t_resp = frm_resp.f_test;
    const [t0, t1, t2, t3] = frm_transports.map(f => f.f_test);

    const testBits = byBits.testBits = obj => 0 | t_from(obj) | t_resp(obj) | t0(obj) | t1(obj) | t2(obj) | t3(obj);

    byBits.choose = function (obj, lst) {
      if (null == lst) {
        lst = this || byBits;
      }
      return lst[testBits(obj)];
    };
  }

  for (const T of frm_transports) {
    const { bits: b, size, transport } = T;

    byBits[b | 0] = { T, transport, bits: b | 0, mask, size: size, op: '' };
    byBits[b | 1] = { T, transport, bits: b | 1, mask, size: 8 + size, op: 'f' };
    byBits[b | 2] = { T, transport, bits: b | 2, mask, size: 8 + size, op: 'r' };
    byBits[b | 3] = { T, transport, bits: b | 3, mask, size: 16 + size, op: 'fr' };

    for (const fn_key of ['f_pack', 'f_unpack']) {
      const fn_tran = T[fn_key],
            fn_from = frm_from[fn_key],
            fn_resp = frm_resp[fn_key];

      byBits[b | 0][fn_key] = function (obj, dv) {
        fn_tran(obj, dv, 0);
      };
      byBits[b | 1][fn_key] = function (obj, dv) {
        fn_from(obj, dv, 0);fn_tran(obj, dv, 8);
      };
      byBits[b | 2][fn_key] = function (obj, dv) {
        fn_resp(obj, dv, 0);fn_tran(obj, dv, 8);
      };
      byBits[b | 3][fn_key] = function (obj, dv) {
        fn_from(obj, dv, 0);fn_resp(obj, dv, 8);fn_tran(obj, dv, 16);
      };
    }
  }

  for (const frm of byBits) {
    bindAssembled(frm);
  }

  return byBits;
}

function bindAssembled(frm) {
  const { T, size, f_pack, f_unpack } = frm;
  if (T.bind_seq_next) {
    frm.seq_next = T.bind_seq_next(frm.size - T.size);
  }

  delete frm.T;
  frm.pack = pack;frm.unpack = unpack;
  const seq_next = frm.seq_next;

  function pack(pkt_type, pkt_obj) {
    if (!(0 <= pkt_type && pkt_type <= 255)) {
      throw new TypeError(`Expected pkt_type to be [0..255]`);
    }

    pkt_obj.type = pkt_type;
    if (seq_next && null == pkt_obj.seq) {
      pkt_obj.seq = true;
    }

    const dv = new DataView(new ArrayBuffer(size));
    f_pack(pkt_obj, dv, 0);
    pkt_obj.header = dv.buffer;

    if (true === pkt_obj.seq) {
      _bind_iterable(pkt_obj, dv.buffer.slice(0, size));
    }
  }

  function unpack(pkt) {
    const buf = pkt.header_buffer();
    const dv = new DataView(new Uint8Array(buf).buffer);

    const info = {};
    f_unpack(info, dv, 0);
    return pkt.info = info;
  }

  function _bind_iterable(pkt_obj, buf_clone) {
    const { type } = pkt_obj;
    const { id_router, id_target, ttl, token } = pkt_obj;
    pkt_obj.next = next;

    function next(options) {
      if (null == options) {
        options = {};
      }
      const header = buf_clone.slice();
      seq_next(options, new DataView(header));
      return { done: !!options.fin, value: {// pkt_obj
        }, id_router, id_target, type, ttl, token, header };
    }
  }
}

var shared_proto = function (packetParser, options, fragment_size) {
  const { concatBuffers, packPacketObj, pack_utf8, unpack_utf8 } = packetParser;
  fragment_size = Number(fragment_size || 8000);
  if (1024 > fragment_size || 65000 < fragment_size) {
    throw new Error(`Invalid fragment size: ${fragment_size}`);
  }

  const { random_id, json_pack } = options;
  return { packetParser, random_id, json_pack,
    createMultipart, createStream, packetFragments,
    bindTransports };

  function createMultipart(pkt, sink, msgid) {
    let parts = [],
        fin = false;
    return { feed, info: pkt.info };

    function feed(pkt) {
      let seq = pkt.info.seq;
      if (seq < 0) {
        fin = true;seq = -seq;
      }
      parts[seq - 1] = pkt.body_buffer();

      if (!fin) {
        return;
      }
      if (parts.includes(undefined)) {
        return;
      }

      sink.deleteStateFor(msgid);

      const res = concatBuffers(parts);
      parts = null;
      return res;
    }
  }

  function createStream(pkt, sink, msgid) {
    let next = 0,
        fin = false,
        recvData,
        rstream;
    const state = { feed: feed_init, info: pkt.info };
    return state;

    function feed_init(pkt, as_content) {
      state.feed = feed_ignore;

      const info = pkt.info;
      const msg = sink.json_unpack(pkt.body_utf8());
      rstream = sink.recvStream(msg, info);
      if (null == rstream) {
        return;
      }
      check_fns(rstream, 'on_error', 'on_data', 'on_end');
      recvData = sink.recvStreamData.bind(sink, rstream, info);

      try {
        feed_seq(pkt);
      } catch (err) {
        return rstream.on_error(err, pkt);
      }

      state.feed = feed_body;
      if (rstream.on_init) {
        return rstream.on_init(msg, pkt);
      }
    }

    function feed_body(pkt, as_content) {
      recvData();
      let data;
      try {
        feed_seq(pkt);
        data = as_content(pkt, sink);
      } catch (err) {
        return rstream.on_error(err, pkt);
      }

      if (fin) {
        const res = rstream.on_data(data, pkt);
        return rstream.on_end(res, pkt);
      } else {
        return rstream.on_data(data, pkt);
      }
    }

    function feed_ignore(pkt) {
      try {
        feed_seq(pkt);
      } catch (err) {}
    }

    function feed_seq(pkt) {
      let seq = pkt.info.seq;
      if (seq >= 0) {
        if (next++ === seq) {
          return; // in order
        }
      } else {
          fin = true;
          sink.deleteStateFor(msgid);
          if (next === -seq) {
            next = 'done';
            return; // in-order, last packet
          }
        }state.feed = feed_ignore;
      next = 'invalid';
      throw new Error(`Packet out of sequence`);
    }
  }

  function* packetFragments(buf, next_hdr, fin) {
    if (null == buf) {
      const obj = next_hdr({ fin });
      yield obj;
      return;
    }

    let i = 0,
        lastInner = buf.byteLength - fragment_size;
    while (i < lastInner) {
      const i0 = i;
      i += fragment_size;

      const obj = next_hdr();
      obj.body = buf.slice(i0, i);
      yield obj;
    }

    {
      const obj = next_hdr({ fin });
      obj.body = buf.slice(i);
      yield obj;
    }
  }

  function bindTransportImpls(inbound, highbits, transports) {
    const outbound = [];
    outbound.choose = framings.choose;

    for (const frame of framings) {
      const impl = frame ? transports[frame.transport] : null;
      if (!impl) {
        continue;
      }

      const { bits, pack, unpack } = frame;
      const pkt_type = highbits | bits;
      const { t_recv } = impl;

      function pack_hdr(obj) {
        pack(pkt_type, obj);
        return obj;
      }

      function recv_msg(pkt, sink) {
        unpack(pkt);
        return t_recv(pkt, sink);
      }

      pack_hdr.pkt_type = recv_msg.pkt_type = pkt_type;
      outbound[bits] = pack_hdr;
      inbound[pkt_type] = recv_msg;

      
    }

    return outbound;
  }

  function bindTransports(inbound, highbits, transports) {
    const packBody = transports.packBody;
    const outbound = bindTransportImpls(inbound, highbits, transports);
    return transports.streaming ? { send, stream: bind_stream(transports.streaming.mode) } : { send };

    function send(chan, obj, body) {
      body = packBody(body);
      if (fragment_size < body.byteLength) {
        if (!obj.token) {
          obj.token = random_id();
        }
        obj.transport = 'multipart';
        const msend = msend_bytes(chan, obj);
        return msend(true, body);
      }

      obj.transport = 'single';
      obj.body = body;
      const pack_hdr = outbound.choose(obj);
      const pkt = packPacketObj(pack_hdr(obj));
      return chan(pkt);
    }

    function msend_bytes(chan, obj, msg) {
      const pack_hdr = outbound.choose(obj);
      let { next } = pack_hdr(obj);
      if (null !== msg) {
        obj.body = msg;
        const pkt = packPacketObj(obj);
        chan(pkt);
      }

      return async function (fin, body) {
        if (null === next) {
          throw new Error('Write after end');
        }
        let res;
        for (const obj of packetFragments(body, next, fin)) {
          const pkt = packPacketObj(obj);
          res = await chan(pkt);
        }
        if (fin) {
          next = null;
        }
        return res;
      };
    }

    function msend_objects(chan, obj, msg) {
      const pack_hdr = outbound.choose(obj);
      let { next } = pack_hdr(obj);
      if (null !== msg) {
        obj.body = msg;
        const pkt = packPacketObj(obj);
        chan(pkt);
      }

      return function (fin, body) {
        if (null === next) {
          throw new Error('Write after end');
        }
        const obj = next({ fin });
        obj.body = body;
        const pkt = packPacketObj(obj);
        if (fin) {
          next = null;
        }
        return chan(pkt);
      };
    }

    function bind_stream(mode) {
      const msend_impl = { object: msend_objects, bytes: msend_bytes }[mode];
      if (msend_impl) {
        return stream;
      }

      function stream(chan, obj, msg) {
        if (!obj.token) {
          obj.token = random_id();
        }
        obj.transport = 'streaming';
        const msend = msend_impl(chan, obj, json_pack(msg));
        write.write = write;write.end = write.bind(true);
        return write;

        function write(chunk) {
          return chunk != null ? msend(true === this, packBody(chunk)) : msend(true);
        }
      }
    }
  }
};

function check_fns(obj, ...keys) {
  for (const key of keys) {
    if ('function' !== typeof obj[key]) {
      throw new TypeError(`Expected "${key}" to be a function`);
    }
  }
}

function json_protocol(shared) {
  const { createMultipart, createStream, json_pack } = shared;
  const { pack_utf8, unpack_utf8 } = shared.packetParser;

  return {
    packBody,

    get datagram() {
      return this.direct;
    },
    direct: {
      t_recv(pkt, sink) {
        const msg = sink.json_unpack(pkt.body_utf8() || undefined);
        return sink.recvMsg(msg, pkt.info);
      } },

    multipart: {
      t_recv(pkt, sink) {
        const state = sink.stateFor(pkt, createMultipart);
        const body_buf = state.feed(pkt);
        if (undefined !== body_buf) {
          const msg = sink.json_unpack(unpack_utf8(body_buf) || undefined);
          return sink.recvMsg(msg, state.info);
        }
      } },

    streaming: {
      mode: 'object',
      t_recv(pkt, sink) {
        const state = sink.stateFor(pkt, createStream);
        return state.feed(pkt, unpackBody);
      } } };

  function packBody(body) {
    return pack_utf8(json_pack(body));
  }

  function unpackBody(pkt, sink) {
    return sink.json_unpack(pkt.body_utf8());
  }
}

function binary_protocol(shared) {
  const { createMultipart, createStream } = shared;
  const { pack_utf8, unpack_utf8 } = shared.packetParser;
  const { asBuffer } = shared.packetParser;
  return {
    packBody: asBuffer,

    get datagram() {
      return this.direct;
    },
    direct: {
      t_recv(pkt, sink) {
        const msg = pkt.body_buffer();
        return sink.recvMsg(msg, pkt.info);
      } },

    multipart: {
      t_recv(pkt, sink) {
        const state = sink.stateFor(pkt, createMultipart);
        const msg = state.feed(pkt);
        if (undefined !== msg) {
          return sink.recvMsg(msg, state.info);
        }
      } },

    streaming: {
      mode: 'bytes',
      t_recv(pkt, sink) {
        const state = sink.stateFor(pkt, createStream);
        const msg = state.feed(pkt, pkt_buffer);
        if (undefined !== msg) {
          return sink.recvMsg(msg, state.info);
        }
      } } };
}

function pkt_buffer(pkt) {
  return pkt.body_buffer();
}

function control_protocol(inbound, high, shared) {
  const { random_id } = shared;
  const { packPacketObj } = shared.packetParser;

  const ping_frame = framings.choose({ from_id: true, token: true, transport: 'direct' });
  const pong_frame = framings.choose({ from_id: true, msgid: true, transport: 'datagram' });

  const pong_type = high | 0xe;
  inbound[pong_type] = recv_pong;
  const ping_type = high | 0xf;
  inbound[high | 0xf] = recv_ping;

  return { send: ping, ping };

  function ping(chan, obj) {
    if (!obj.token) {
      obj.token = random_id();
    }
    obj.body = JSON.stringify({
      op: 'ping', ts0: new Date() });
    ping_frame.pack(ping_type, obj);
    const pkt = packPacketObj(obj);
    return chan(pkt);
  }

  function recv_ping(pkt, sink, router) {
    ping_frame.unpack(pkt);
    pkt.body = pkt.body_json();
    _send_pong(pkt.body, pkt, router);
    return sink.recvCtrl(pkt.body, pkt.info);
  }

  function _send_pong({ ts0 }, pkt_ping, router) {
    const { msgid, id_target, id_router, from_id: r_id } = pkt_ping.info;
    const obj = { msgid,
      from_id: { id_target, id_router },
      id_router: r_id.id_router, id_target: r_id.id_target,
      body: JSON.stringify({
        op: 'pong', ts0, ts1: new Date() }) };

    pong_frame.pack(pong_type, obj);
    const pkt = packPacketObj(obj);
    return router.dispatch([pkt]);
  }

  function recv_pong(pkt, sink) {
    pong_frame.unpack(pkt);
    pkt.body = pkt.body_json();
    return sink.recvCtrl(pkt.body, pkt.info);
  }
}

function init_protocol(packetParser, options) {
  const shared = shared_proto(packetParser, options);

  const inbound = [];
  const json = shared.bindTransports(inbound, 0x00 // 0x0* — JSON body
  , json_protocol(shared));

  const binary = shared.bindTransports(inbound, 0x10 // 0x1* — binary body
  , binary_protocol(shared));

  const control = control_protocol(inbound, 0xf0 // 0xf* — control
  , shared);

  const codecs = { json, binary, control, default: json };

  const { random_id } = shared;
  return { inbound, codecs, random_id };
}

class Sink {
  static forProtocols({ inbound }) {
    class Sink extends this {}
    Sink.prototype._protocol = inbound;
    return Sink;
  }

  register(endpoint, hub, id_target, handlers) {
    const unregister = () => hub.router.unregisterTarget(id_target);

    hub.router.registerTarget(id_target, this._bindDispatch(endpoint, unregister, handlers));
    return this;
  }

  _bindDispatch(endpoint, unregister, { on_msg, on_error, on_shutdown }) {
    let alive = true;
    const protocol = this._protocol;
    const isAlive = () => alive;
    const shutdown = (err, extra) => {
      if (alive) {
        unregister();unregister = alive = false;
        on_shutdown(err, extra);
      }
    };

    Object.assign(this, endpoint.bindSink(this), { isAlive, shutdown });
    Object.assign(endpoint, { isAlive, shutdown });

    return async (pkt, router) => {
      if (false === alive || null == pkt) {
        return alive;
      }

      const recv_msg = protocol[pkt.type];
      if (undefined === recv_msg) {
        return void on_error(false, { pkt, zone: 'pkt.type' });
      }

      try {
        var msg = await recv_msg(pkt, this, router);
        if (!msg) {
          return msg;
        }
      } catch (err) {
        return void on_error(err, { pkt, zone: 'protocol' });
      }

      if (false === alive) {
        return router.unregister;
      }

      try {
        await on_msg(msg, pkt);
      } catch (err) {
        try {
          var terminate = on_error(err, { msg, pkt, zone: 'dispatch' });
        } finally {
          if (false !== terminate) {
            shutdown(err, { msg, pkt });
            return router.unregister;
          }
        }
      }
    };
  }

  stateFor(pkt, ifAbsent) {
    const msgid = pkt.info.msgid;
    let entry = this.by_msgid.get(msgid);
    if (undefined === entry) {
      if (!msgid) {
        throw new Error(`Invalid msgid: ${msgid}`);
      }
      if ('function' === typeof ifAbsent) {
        entry = ifAbsent(pkt, this, msgid);
      } else entry = ifAbsent;
      this.by_msgid.set(msgid, entry);
    }
    return entry;
  }

  deleteStateFor(msgid) {
    return this.by_msgid.delete(msgid);
  }

  json_unpack(obj) {
    throw new Error(`Endpoint bindSink() responsibility`);
  }
}

class EPTarget$1 {
  constructor(id) {
    this.id = id;
  }

  inspect() {
    return `«EPTarget ${ep_encode(this.id, true)}»`;
  }
  toJSON() {
    return ep_encode(this.id, false);
  }
  asEndpointId() {
    return this.id;
  }
  isEPTarget() {
    return true;
  }

  get id_router() {
    return this.id.id_router;
  }
  get id_target() {
    return this.id.id_target;
  }

  static as_json_unpack(msg_ctx_to, xformByKey) {
    xformByKey = Object.create(xformByKey || null);
    xformByKey[token] = v => this.from_ctx(ep_decode(v), msg_ctx_to);
    return this.json_unpack_xform(xformByKey);
  }

  static from_ctx(id, msg_ctx_to, msgid) {
    if (!id) {
      return;
    }
    if ('function' === typeof id.asEndpointId) {
      id = id.asEndpointId();
    }

    const ep_tgt = new this(id);
    let fast,
        init = () => fast = msg_ctx_to(ep_tgt, { msgid }).fast_json;
    return Object.defineProperties(ep_tgt, {
      send: { get() {
          return (fast || init()).send;
        } },
      query: { get() {
          return (fast || init()).query;
        } },
      replyExpected: { value: !!msgid } });
  }
}

const token = '\u03E0'; // 'Ϡ'
EPTarget$1.token = token;

EPTarget$1.ep_encode = ep_encode;
function ep_encode(id, simple) {
  let { id_router: r, id_target: t } = id;
  r = (r >>> 0).toString(36);
  t = (t >>> 0).toString(36);
  if (simple) {
    return `${token} ${r}~${t}`;
  }

  const res = { [token]: `${r}~${t}` };
  Object.assign(res, id);
  delete res.id_router;delete res.id_target;
  return res;
}

EPTarget$1.ep_decode = ep_decode;
function ep_decode(v) {
  const id = 'string' === typeof v ? v.split(token)[1] : v[token];
  if (!id) {
    return;
  }

  let [r, t] = id.split('~');
  if (undefined === t) {
    return;
  }
  r = 0 | parseInt(r, 36);
  t = 0 | parseInt(t, 36);

  return { id_router: r, id_target: t };
}

EPTarget$1.json_unpack_xform = json_unpack_xform;
function json_unpack_xform(xformByKey) {
  return sz => JSON.parse(sz, reviver());

  function reviver() {
    const reg = new WeakMap();
    return function (key, value) {
      const xfn = xformByKey[key];
      if (undefined !== xfn) {
        reg.set(this, xfn);
        return value;
      }

      if ('object' === typeof value) {
        const vfn = reg.get(value);
        if (undefined !== vfn) {
          return vfn(value);
        }
      }
      return value;
    };
  }
}

class MsgCtx {
  static forProtocols({ random_id, codecs }) {
    class MsgCtx extends this {}
    MsgCtx.prototype.random_id = random_id;
    MsgCtx.withCodecs(codecs);
    return MsgCtx;
  }

  static forHub(hub, channel) {
    const { sendRaw } = channel;

    class MsgCtx extends this {}
    MsgCtx.prototype.chan_send = async pkt => {
      await sendRaw(pkt);
      return true;
    };

    return MsgCtx;
  }

  constructor(id) {
    if (null != id) {
      const { id_target, id_router } = id;
      const from_id = Object.freeze({ id_target, id_router });
      this.ctx = { from_id };
    }
  }

  withEndpoint(endpoint) {
    return Object.defineProperties(this, {
      endpoint: { value: endpoint } });
  }

  ping(token = true) {
    return this._invoke_ex(this._msgCodecs.control.ping, [], token);
  }
  send(...args) {
    return this._invoke_ex(this._codec.send, args);
  }
  sendQuery(...args) {
    return this._invoke_ex(this._codec.send, args, true);
  }
  query(...args) {
    return this._invoke_ex(this._codec.send, args, true).reply;
  }

  stream(...args) {
    return this._invoke_ex(this._codec.stream, args);
  }
  invoke(key, ...args) {
    return this._invoke_ex(this._codec[key], args);
  }
  bindInvoke(fnOrKey, token) {
    if ('function' !== typeof fnOrKey) {
      fnOrKey = this._codec;
    }
    return (...args) => this._invoke_ex(fnOrKey, args, token);
  }

  _invoke_ex(invoke, args, token) {
    const obj = Object.assign({}, this.ctx);
    if (null == token) {
      token = obj.token;
    } else obj.token = token;
    if (true === token) {
      token = obj.token = this.random_id();
    }

    this.assertMonitor();

    const res = invoke(this.chan_send, obj, ...args);
    if (!token || 'function' !== typeof res.then) {
      return res;
    }

    let p_sent = res.then();
    const reply = this.endpoint.initReply(token, p_sent, this);
    p_sent = p_sent.then(() => ({ reply }));
    p_sent.reply = reply;
    return p_sent;
  }

  get to() {
    return (tgt, ...args) => {
      if (null == tgt) {
        throw new Error(`Null target endpoint`);
      }

      const self = this.clone();

      const ctx = self.ctx;
      if ('number' === typeof tgt) {
        ctx.id_target = tgt;
        ctx.id_router = ctx.from_id.id_router;
      } else {
        tgt = ep_decode(tgt) || tgt;
        const { from_id: reply_id, id_target, id_router, token, msgid } = tgt;

        if (undefined !== id_target) {
          ctx.id_target = id_target;
          ctx.id_router = id_router;
        } else if (undefined !== reply_id && !ctx.id_target) {
          ctx.id_target = reply_id.id_target;
          ctx.id_router = reply_id.id_router;
        }

        if (undefined !== token) {
          ctx.token = token;
        }
        if (undefined !== msgid) {
          ctx.msgid = msgid;
        }
      }

      return 0 === args.length ? self : self.with(...args);
    };
  }

  with(...args) {
    const ctx = this.ctx;
    for (let tgt of args) {
      if (true === tgt || false === tgt) {
        ctx.token = tgt;
      } else if (null != tgt) {
        const { token, msgid } = tgt;
        if (undefined !== token) {
          ctx.token = token;
        }
        if (undefined !== msgid) {
          ctx.msgid = msgid;
        }
      }
    }
    return this;
  }

  withReply() {
    return this.clone({ token: true });
  }

  clone(...args) {
    return Object.create(this, {
      ctx: { value: Object.assign({}, this.ctx, ...args) } });
  }

  assertMonitor() {
    if (!this.checkMonitor()) {
      throw new Error(`Target monitor expired`);
    }
  }
  checkMonitor() {
    return true;
  }
  monitor(options = {}) {
    if (true === options || false === options) {
      options = { active: options };
    }

    const monitor = this.endpoint.initMonitor(this.ctx.id_target);

    const ts_duration = options.ts_duration || 5000;
    let ts_active = options.ts_active;
    if (true === ts_active) {
      ts_active = ts_duration / 4;
    }

    let checkMonitor;
    const promise = new Promise((resolve, reject) => {
      const done = options.reject ? reject : resolve;
      this.checkMonitor = checkMonitor = () => ts_duration > monitor.td() ? true : (done(monitor), false);
    });

    let tid;
    const ts_interval = ts_active || ts_duration / 4;
    if (options.active || ts_active) {
      const ctrl = this.codec('control');
      const checkPing = () => {
        if (ts_interval > monitor.td()) {
          ctrl.invoke('ping');
        }
      };
      tid = setInterval(checkPing, ts_interval);
    } else {
      tid = setInterval(checkMonitor, ts_interval);
    }
    if (tid.unref) {
      tid.unref();
    }
    const clear = () => clearInterval(tid);

    promise.then(clear, clear);
    return promise;
  }

  codec(msg_codec, ...args) {
    if ('string' === typeof msg_codec) {
      msg_codec = this._msgCodecs[msg_codec];
    }

    if ('function' !== typeof msg_codec.send) {
      throw new TypeError(`Expected packet codec protocol`);
    }

    return Object.create(this, {
      _codec: { value: msg_codec },
      ctx: { value: Object.assign({}, this.ctx, ...args) } });
  }

  static withCodecs(msgCodecs) {
    for (const [name, msg_codec] of Object.entries(msgCodecs)) {
      this.prototype[name] = function () {
        return this.codec(msg_codec);
      };
    }
    this.prototype._msgCodecs = msgCodecs;
    this.prototype._codec = msgCodecs.default;

    // bind send_json as frequently used fast-path
    const json_send = msgCodecs.json.send;
    Object.defineProperties(this.prototype, {
      fast_json: { get() {
          return {
            send: (...args) => this._invoke_ex(json_send, args),
            sendQuery: (...args) => this._invoke_ex(json_send, args, true),
            query: (...args) => this._invoke_ex(json_send, args, true).reply };
        } } });

    return this;
  }

  withRejectTimeout(p_reply) {
    return new Promise((resolve, reject) => {
      p_reply.then(resolve, reject);
      p_reply.then(clear, clear);

      const timeout = () => reject(new this.ReplyTimeout());
      const tid = setTimeout(timeout, this.ms_timeout);
      if (tid.unref) {
        tid.unref();
      }

      function clear() {
        clearTimeout(tid);
      }
    });
  }
}

class ReplyTimeout extends Error {}

Object.assign(MsgCtx.prototype, {
  ReplyTimeout, ms_timeout: 5000 });

class Endpoint {
  static subclass(extensions) {
    class Endpoint extends this {}
    Object.assign(Endpoint.prototype, extensions);
    return Endpoint;
  }

  inspect() {
    return `«Endpoint ${ep_encode(this.id, true)}»`;
  }
  toJSON() {
    return this.ep_self().toJSON();
  }
  ep_self() {
    return new this.EPTarget(this.id);
  }
  asEndpointId() {
    return this.id;
  }

  constructor(id, msg_ctx) {
    Object.defineProperties(this, {
      id: { value: id },
      to: { value: msg_ctx.withEndpoint(this).to } });
  }

  createMap() {
    return new Map();
  }
  createStateMap() {
    return this.createMap();
  }
  createReplyMap() {
    return this.createMap();
  }
  createTrafficMap() {
    return this.createMap();
  }
  createRouteCacheMap() {
    return this.createMap();
  }

  bindSink(sink) {
    const by_token = this.createReplyMap();
    const by_traffic = this.createTrafficMap();
    Object.defineProperties(this, {
      by_token: { value: by_token },
      by_traffic: { value: by_traffic } });

    const traffic = (from_id, traffic) => {
      const ts = Date.now();
      if (from_id) {
        const t = by_traffic.get(from_id.id_target);
        if (undefined !== t) {
          t.ts = t[`ts_${traffic}`] = ts;
        }
      }
      this.recvTraffic(from_id, traffic, ts);
    };

    return {
      by_msgid: this.createStateMap(),
      json_unpack: this.EPTarget.as_json_unpack(this.to),

      recvCtrl: (msg, info) => {
        traffic(info.from_id, 'ctrl');
        const reply = by_token.get(info.token);
        const rmsg = this.recvCtrl(msg, info, reply);

        if (undefined !== reply) {
          Promise.resolve(rmsg || { msg, info }).then(reply);
        } else return rmsg;
      },

      recvMsg: (msg, info) => {
        traffic(info.from_id, 'msg');
        const reply = by_token.get(info.token);
        const rmsg = this.recvMsg(msg, info, reply);

        if (undefined !== reply) {
          Promise.resolve(rmsg).then(reply);
        } else return rmsg;
      },

      recvStreamData: (rstream, info) => {
        traffic(info.from_id, 'stream');
      },
      recvStream: (msg, info) => {
        traffic(info.from_id, 'stream');
        const reply = by_token.get(info.token);
        const rstream = this.recvStream(msg, info, reply);

        if (undefined !== reply) {
          Promise.resolve(rstream).then(reply);
        }
        return rstream;
      } };
  }

  as_target(id) {
    if (id) {
      return this.EPTarget.from_ctx(id, this.to);
    }
  }
  as_sender({ from_id: id, msgid }) {
    if (id) {
      return this.EPTarget.from_ctx(id, this.to, msgid);
    }
  }

  recvTraffic(from_id, traffic, ts) {}
  recvCtrl(msg, info, is_reply) {
    if (is_reply) {
      return msg;
    }
  }
  recvMsg(msg, info, is_reply) {
    if (is_reply) {
      return msg;
    }
    return { msg, info, sender: this.as_sender(info) };
  }
  recvStream(msg, info, is_reply) {
    console.warn(`Unhandle recv stream: ${info}`);
    return null;
    /* return @{} msg, info
         on_init(msg, pkt) :: // return this
         on_data(data, pkt) :: this.parts.push @ data
         on_end(result, pkt) :: this.parts.join(''); // return this
         on_error(err, pkt) :: console.log @ err
    */
  }initReply(token, p_sent, msg_ctx) {
    return this.initReplyPromise(token, p_sent, msg_ctx);
  }

  initMonitor(id_target) {
    const key = id_target.id_target || id_target;
    let monitor = this.by_traffic.get(key);
    if (undefined === monitor) {
      monitor = { id_target, ts: Date.now(),
        td() {
          return Date.now() - this.ts;
        } };
      this.by_traffic.set(key, monitor);
    }
    return monitor;
  }

  initReplyPromise(token, p_sent, msg_ctx) {
    let reply = new Promise((resolve, reject) => {
      this.by_token.set(token, resolve);
      p_sent.catch(reject);
    });

    if (msg_ctx) {
      reply = msg_ctx.withRejectTimeout(reply);
    }

    const clear = () => this.by_token.delete(token);
    reply.then(clear, clear);
    return reply;
  }
}

Endpoint.prototype.EPTarget = EPTarget$1;

const default_plugin_options = {
  plugin_name: 'endpoint',
  on_msg({ msg, reply, info }) {
    console.warn('ENDPOINT MSG:', { msg, reply, info });
  },
  on_error(ep, err, extra) {
    console.error('ENDPOINT ERROR:', err);
    // const {msg, pkt} = extra
    // return false to prevent auto-shutdown
  }, on_shutdown(ep, err, extra) {
    // const {msg, pkt} = extra
    console.error(`ENDPOINT SHUTDOWN: ${err.message}`);
  },

  subclass(classes) {
    //const {Endpoint, Sink, MsgCtx, protocols} = classes
    return classes;
  },

  json_pack: JSON.stringify,
  createMap() {
    return new Map(); // LRUMap, HashbeltMap
  } };var endpoint_plugin = function (plugin_options) {
  plugin_options = Object.assign({}, default_plugin_options, plugin_options);
  const {
    plugin_name, random_id, json_pack,
    on_msg: default_on_msg,
    on_error: default_on_error,
    on_shutdown: default_on_shutdown,
    createMap } = plugin_options;

  if (plugin_options.ep_kinds) {
    Object.assign(ep_proto$1, plugin_options.ep_kinds);
  }

  return { order: 1, subclass, post };

  function subclass(FabricHub_PI, bases) {
    const { packetParser } = FabricHub_PI.prototype;
    if (null == packetParser || !packetParser.isPacketParser()) {
      throw new TypeError(`Invalid packetParser for plugin`);
    }

    FabricHub_PI.prototype[plugin_name] = bindEndpointApi(packetParser);
  }

  function post(hub) {
    return hub[plugin_name] = hub[plugin_name](hub);
  }

  function bindEndpointApi(packetParser) {
    const protocols = init_protocol(packetParser, { random_id, json_pack });

    const { Endpoint: Endpoint$$1, Sink: Sink$$1, MsgCtx: MsgCtx_pi } = plugin_options.subclass({ protocols,
      Sink: Sink.forProtocols(protocols),
      MsgCtx: MsgCtx.forProtocols(protocols),
      Endpoint: Endpoint.subclass({ createMap }) });

    return function (hub) {
      const channel = hub.connect_self();
      const MsgCtx$$1 = MsgCtx_pi.forHub(hub, channel);

      Object.setPrototypeOf(endpoint, ep_proto$1);
      Object.assign(endpoint, { endpoint, create, MsgCtx: MsgCtx$$1 });
      return endpoint;

      function endpoint(on_init) {
        const targets = hub.router.targets;
        do var id_target = random_id(); while (targets.has(id_target));
        return create(id_target, on_init);
      }

      function create(id_target, on_init) {
        const handlers = Object.create(null);
        const id = { id_target, id_router: hub.router.id_self };
        const msg_ctx = new MsgCtx$$1(id);
        const ep = new Endpoint$$1(id, msg_ctx);

        const ready = Promise.resolve('function' === typeof on_init ? on_init(ep, hub) : on_init).then(_after_init);

        // Allow for both internal and external error handling by forking ready.catch
        ready.catch(err => handlers.on_error(err, { zone: 'on_ready' }));

        {
          const ep_tgt = ep.ep_self();
          return Object.defineProperties(ep_tgt, {
            ready: { value: ready.then(() => ep_tgt) } });
        }

        function _after_init(target) {
          if (null == target) {
            throw new TypeError(`Expected endpoint init to return a closure or interface`);
          }

          handlers.on_msg = (target.on_msg || ('function' === typeof target ? target : default_on_msg)).bind(target);
          handlers.on_error = (target.on_error || default_on_error).bind(target, ep);
          handlers.on_shutdown = (target.on_shutdown || default_on_shutdown).bind(target, ep);

          new Sink$$1().register(ep, hub, id_target, handlers);

          return target.on_ready ? target.on_ready(ep, hub) : target;
        }
      }
    };
  }
};

endpoint_nodejs.random_id = random_id;
function random_id() {
  return randomBytes(4).readInt32LE();
}

function endpoint_nodejs(plugin_options = {}) {
  if (null == plugin_options.random_id) {
    plugin_options.random_id = random_id;
  }

  return endpoint_plugin(plugin_options);
}

export default endpoint_nodejs;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZWpzLm1qcyIsInNvdXJjZXMiOlsiLi4vY29kZS9lcF9raW5kcy9leHRlbnNpb25zLmpzeSIsIi4uL2NvZGUvZXBfa2luZHMvY2xpZW50LmpzeSIsIi4uL2NvZGUvZXBfa2luZHMvYXBpLmpzeSIsIi4uL2NvZGUvZXBfa2luZHMvaW5kZXguanN5IiwiLi4vY29kZS9wcm90b2NvbC9mcmFtaW5nLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvc2hhcmVkLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvanNvbi5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2JpbmFyeS5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2NvbnRyb2wuanN5IiwiLi4vY29kZS9wcm90b2NvbC9pbmRleC5qc3kiLCIuLi9jb2RlL3NpbmsuanN5IiwiLi4vY29kZS9lcF90YXJnZXQuanN5IiwiLi4vY29kZS9tc2djdHguanN5IiwiLi4vY29kZS9lbmRwb2ludC5qc3kiLCIuLi9jb2RlL3BsdWdpbi5qc3kiLCIuLi9jb2RlL2luZGV4Lm5vZGVqcy5qc3kiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNvbnN0IGVwX3Byb3RvID0gT2JqZWN0LmNyZWF0ZSBAIE9iamVjdC5nZXRQcm90b3R5cGVPZiBAIGZ1bmN0aW9uKCl7fVxuZXhwb3J0IGZ1bmN0aW9uIGFkZF9lcF9raW5kKGtpbmRzKSA6OlxuICBPYmplY3QuYXNzaWduIEAgZXBfcHJvdG8sIGtpbmRzXG5leHBvcnQgZGVmYXVsdCBhZGRfZXBfa2luZFxuIiwiaW1wb3J0IGFkZF9lcF9raW5kIGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIGNsaWVudEVuZHBvaW50KGFwaSkgOjpcbiAgICBjb25zdCB0YXJnZXQgPSBjbGllbnRFbmRwb2ludChhcGkpXG4gICAgdGhpcy5lbmRwb2ludCBAIHRhcmdldFxuICAgIHJldHVybiB0YXJnZXQuZG9uZVxuXG4gIGNsaWVudCguLi5hcmdzKSA6OlxuICAgIGlmIDEgPT09IGFyZ3MubGVuZ3RoICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBhcmdzWzBdIDo6XG4gICAgICByZXR1cm4gdGhpcy5jbGllbnRFbmRwb2ludCBAIGFyZ3NbMF1cblxuICAgIGNvbnN0IG1zZ19jdHggPSBuZXcgdGhpcy5Nc2dDdHgoKVxuICAgIHJldHVybiAwICE9PSBhcmdzLmxlbmd0aCA/IG1zZ19jdHgudG8oLi4uYXJncykgOiBtc2dfY3R4XG5cblxuY29uc3QgZXBfY2xpZW50X2FwaSA9IEB7fVxuICBhc3luYyBvbl9yZWFkeShlcCwgaHViKSA6OlxuICAgIHRoaXMuX3Jlc29sdmUgQCBhd2FpdCB0aGlzLm9uX2NsaWVudF9yZWFkeShlcCwgaHViKVxuICAgIGF3YWl0IGVwLnNodXRkb3duKClcbiAgb25fc2VuZF9lcnJvcihlcCwgZXJyKSA6OlxuICAgIHRoaXMuX3JlamVjdChlcnIpXG4gIG9uX3NodXRkb3duKGVwLCBlcnIpIDo6XG4gICAgZXJyID8gdGhpcy5fcmVqZWN0KGVycikgOiB0aGlzLl9yZXNvbHZlKClcblxuZXhwb3J0IGZ1bmN0aW9uIGNsaWVudEVuZHBvaW50KG9uX2NsaWVudF9yZWFkeSkgOjpcbiAgbGV0IHRhcmdldCA9IE9iamVjdC5jcmVhdGUgQCBlcF9jbGllbnRfYXBpXG4gIHRhcmdldC5vbl9jbGllbnRfcmVhZHkgPSBvbl9jbGllbnRfcmVhZHlcbiAgdGFyZ2V0LmRvbmUgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgdGFyZ2V0Ll9yZXNvbHZlID0gcmVzb2x2ZVxuICAgIHRhcmdldC5fcmVqZWN0ID0gcmVqZWN0XG4gIHJldHVybiB0YXJnZXRcbiIsImltcG9ydCBhZGRfZXBfa2luZCBmcm9tICcuL2V4dGVuc2lvbnMuanN5J1xuXG5hZGRfZXBfa2luZCBAOlxuICBhcGkoYXBpKSA6OiByZXR1cm4gdGhpcy5lbmRwb2ludCBAIGFzQVBJRW5kcG9pbnQoYXBpKVxuXG5leHBvcnQgZnVuY3Rpb24gYXNBUElFbmRwb2ludChhcGkpIDo6XG4gIHJldHVybiAoZXAsIGh1YikgPT4gOjpcbiAgICBjb25zdCBpbnZva2UgPSBhc19ycGMoYXBpLCBlcCwgaHViKVxuICAgIHJldHVybiBvbl9tc2dcblxuICAgIGFzeW5jIGZ1bmN0aW9uIG9uX21zZyh7bXNnLCBzZW5kZXJ9KSA6OlxuICAgICAgYXdhaXQgaW52b2tlIEAgbXNnLCBzZW5kZXJcblxuZXhwb3J0IGZ1bmN0aW9uIGFzX3JwYyhhcGksIGVwLCBodWIpIDo6XG4gIGNvbnN0IGFwaV9mb3Jfb3AgPSAnZnVuY3Rpb24nID09PSB0eXBlb2YgYXBpXG4gICAgPyBvcCA9PiBhcGkob3AsIGVwLCBodWIpXG4gICAgOiBvcCA9PiBhcGlbb3BdXG5cbiAgcmV0dXJuIE9iamVjdC5hc3NpZ24gQCBpbnZva2UsIEB7fVxuICAgIGludm9rZSwgcmVzb2x2ZV9mbiwgaW52b2tlX2ZuLCBhcGlfZm9yX29wXG5cbiAgYXN5bmMgZnVuY3Rpb24gaW52b2tlKG1zZywgc2VuZGVyKSA6OlxuICAgIGNvbnN0IHtvcCwga3d9ID0gbXNnXG4gICAgY29uc3QgZm4gPSBhd2FpdCByZXNvbHZlX2ZuIEAgb3AsIHNlbmRlclxuICAgIGlmIHVuZGVmaW5lZCAhPT0gZm4gOjpcbiAgICAgIGF3YWl0IGludm9rZV9mbiBAIG9wLCBzZW5kZXIsICgpID0+IGZuKGt3KVxuXG4gIGFzeW5jIGZ1bmN0aW9uIHJlc29sdmVfZm4ob3AsIHNlbmRlcikgOjpcbiAgICBpZiAnc3RyaW5nJyAhPT0gdHlwZW9mIG9wIHx8ICEgb3BbMF0ubWF0Y2goL1tBLVphLXpdLykgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogZXBcbiAgICAgICAgZXJyb3I6IEB7fSBtZXNzYWdlOiAnSW52YWxpZCBvcGVyYXRpb24nLCBjb2RlOiA0MDBcblxuICAgIHRyeSA6OlxuICAgICAgY29uc3QgZm4gPSBhd2FpdCBhcGlfZm9yX29wKG9wKVxuICAgICAgaWYgISBmbiA6OlxuICAgICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgZXJyX2Zyb206IGVwXG4gICAgICAgICAgZXJyb3I6IEB7fSBtZXNzYWdlOiAnVW5rbm93biBvcGVyYXRpb24nLCBjb2RlOiA0MDRcbiAgICAgIHJldHVybiBmblxuICAgIGNhdGNoIGVyciA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiBlcFxuICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6IGBJbnZhbGlkIG9wZXJhdGlvbjogJHtlcnIubWVzc2FnZX1gLCBjb2RlOiA1MDBcblxuICBhc3luYyBmdW5jdGlvbiBpbnZva2VfZm4ob3AsIHNlbmRlciwgY2IpIDo6XG4gICAgdHJ5IDo6XG4gICAgICB2YXIgYW5zd2VyID0gYXdhaXQgY2IoKVxuICAgIGNhdGNoIGVyciA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiBlcCwgZXJyb3I6IGVyclxuICAgICAgcmV0dXJuIGZhbHNlXG5cbiAgICBpZiBzZW5kZXIucmVwbHlFeHBlY3RlZCA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGFuc3dlclxuICAgIHJldHVybiB0cnVlXG5cbiIsImltcG9ydCB7YWRkX2VwX2tpbmQsIGVwX3Byb3RvfSBmcm9tICcuL2V4dGVuc2lvbnMuanN5J1xuXG5hZGRfZXBfa2luZCBAOlxuICBzZXJ2ZXIob25faW5pdCkgOjogcmV0dXJuIHRoaXMuZW5kcG9pbnQgQCBvbl9pbml0XG5cbmV4cG9ydCAqIGZyb20gJy4vY2xpZW50LmpzeSdcbmV4cG9ydCAqIGZyb20gJy4vYXBpLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZXBfcHJvdG9cbiIsImNvbnN0IGxpdHRsZV9lbmRpYW4gPSB0cnVlXG5jb25zdCBjX3NpbmdsZSA9ICdzaW5nbGUnXG5jb25zdCBjX2RhdGFncmFtID0gJ2RhdGFncmFtJ1xuY29uc3QgY19kaXJlY3QgPSAnZGlyZWN0J1xuY29uc3QgY19tdWx0aXBhcnQgPSAnbXVsdGlwYXJ0J1xuY29uc3QgY19zdHJlYW1pbmcgPSAnc3RyZWFtaW5nJ1xuXG5jb25zdCBfZXJyX21zZ2lkX3JlcXVpcmVkID0gYFJlc3BvbnNlIHJlcWlyZXMgJ21zZ2lkJ2BcbmNvbnN0IF9lcnJfdG9rZW5fcmVxdWlyZWQgPSBgVHJhbnNwb3J0IHJlcWlyZXMgJ3Rva2VuJ2BcblxuXG5mdW5jdGlvbiBmcm1fcm91dGluZygpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHgxLCBtYXNrID0gMHgxXG4gIHJldHVybiBAe31cbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gbnVsbCAhPSBvYmouZnJvbV9pZCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IHtmcm9tX2lkfSA9IG9ialxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgMHxmcm9tX2lkLmlkX3JvdXRlciwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MzIgQCA0K29mZnNldCwgMHxmcm9tX2lkLmlkX3RhcmdldCwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgY29uc3QgZnJvbV9pZCA9IHVuZGVmaW5lZCA9PT0gb2JqLmZyb21faWRcbiAgICAgICAgPyBvYmouZnJvbV9pZCA9IHt9IDogb2JqLmZyb21faWRcbiAgICAgIGZyb21faWQuaWRfcm91dGVyID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgZnJvbV9pZC5pZF90YXJnZXQgPSBkdi5nZXRJbnQzMiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG5cbmZ1bmN0aW9uIGZybV9yZXNwb25zZSgpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHgyLCBtYXNrID0gMHgyXG4gIHJldHVybiBAe31cbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gbnVsbCAhPSBvYmoubXNnaWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai5tc2dpZCA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX21zZ2lkX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoubXNnaWQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcV9hY2ssIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLmFja19mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLnRva2VuID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9hY2sgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouYWNrX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5cblxuZnVuY3Rpb24gZnJtX2RhdGFncmFtKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDAsIGJpdHMgPSAweDAsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGF0YWdyYW1cbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OlxuICAgICAgaWYgY19kYXRhZ3JhbSA9PT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gYml0c1xuICAgICAgaWYgb2JqLnRyYW5zcG9ydCAmJiBjX3NpbmdsZSAhPT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gZmFsc2VcbiAgICAgIHJldHVybiAhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX2RhdGFncmFtXG5cbmZ1bmN0aW9uIGZybV9kaXJlY3QoKSA6OlxuICBjb25zdCBzaXplID0gNCwgYml0cyA9IDB4NCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19kaXJlY3RcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OlxuICAgICAgaWYgY19kaXJlY3QgPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISEgb2JqLnRva2VuID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kaXJlY3RcblxuZnVuY3Rpb24gZnJtX211bHRpcGFydCgpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHg4LCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX211bHRpcGFydFxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBjX211bHRpcGFydCA9PT0gb2JqLnRyYW5zcG9ydCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgYmluZF9zZXFfbmV4dCwgc2VxX3BvczogNFxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cbiAgICAgIGlmIHRydWUgPT0gb2JqLnNlcSA6OiAvLyB1c2Ugc2VxX25leHRcbiAgICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMCwgbGl0dGxlX2VuZGlhblxuICAgICAgZWxzZSBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLnNlcV9mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkICAgICA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXEgICAgICAgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfbXVsdGlwYXJ0XG5cbmZ1bmN0aW9uIGZybV9zdHJlYW1pbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4YywgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19zdHJlYW1pbmdcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19zdHJlYW1pbmcgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjpcbiAgICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMCwgbGl0dGxlX2VuZGlhbiAvLyB1c2Ugc2VxX25leHRcbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX3N0cmVhbWluZ1xuXG5cbmZ1bmN0aW9uIGJpbmRfc2VxX25leHQob2Zmc2V0KSA6OlxuICBjb25zdCBzZXFfb2Zmc2V0ID0gdGhpcy5zZXFfcG9zICsgb2Zmc2V0XG4gIGxldCBzZXEgPSAxXG4gIHJldHVybiBmdW5jdGlvbiBzZXFfbmV4dCh7ZmxhZ3MsIGZpbn0sIGR2KSA6OlxuICAgIGlmICEgZmluIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIHNlcSsrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDIrc2VxX29mZnNldCwgMHxmbGFncywgbGl0dGxlX2VuZGlhblxuICAgIGVsc2UgOjpcbiAgICAgIGR2LnNldEludDE2IEAgc2VxX29mZnNldCwgLXNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICAgIHNlcSA9IE5hTlxuXG5cblxuZXhwb3J0IGRlZmF1bHQgY29tcG9zZUZyYW1pbmdzKClcbmZ1bmN0aW9uIGNvbXBvc2VGcmFtaW5ncygpIDo6XG4gIGNvbnN0IGZybV9mcm9tID0gZnJtX3JvdXRpbmcoKSwgZnJtX3Jlc3AgPSBmcm1fcmVzcG9uc2UoKVxuICBjb25zdCBmcm1fdHJhbnNwb3J0cyA9IEBbXSBmcm1fZGF0YWdyYW0oKSwgZnJtX2RpcmVjdCgpLCBmcm1fbXVsdGlwYXJ0KCksIGZybV9zdHJlYW1pbmcoKVxuXG4gIGlmIDggIT09IGZybV9mcm9tLnNpemUgfHwgOCAhPT0gZnJtX3Jlc3Auc2l6ZSB8fCA0ICE9IGZybV90cmFuc3BvcnRzLmxlbmd0aCA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBGcmFtaW5nIFNpemUgY2hhbmdlYFxuXG4gIGNvbnN0IGJ5Qml0cyA9IFtdLCBtYXNrPTB4ZlxuXG4gIDo6XG4gICAgY29uc3QgdF9mcm9tID0gZnJtX2Zyb20uZl90ZXN0LCB0X3Jlc3AgPSBmcm1fcmVzcC5mX3Rlc3RcbiAgICBjb25zdCBbdDAsdDEsdDIsdDNdID0gZnJtX3RyYW5zcG9ydHMubWFwIEAgZj0+Zi5mX3Rlc3RcblxuICAgIGNvbnN0IHRlc3RCaXRzID0gYnlCaXRzLnRlc3RCaXRzID0gb2JqID0+XG4gICAgICAwIHwgdF9mcm9tKG9iaikgfCB0X3Jlc3Aob2JqKSB8IHQwKG9iaikgfCB0MShvYmopIHwgdDIob2JqKSB8IHQzKG9iailcblxuICAgIGJ5Qml0cy5jaG9vc2UgPSBmdW5jdGlvbiAob2JqLCBsc3QpIDo6XG4gICAgICBpZiBudWxsID09IGxzdCA6OiBsc3QgPSB0aGlzIHx8IGJ5Qml0c1xuICAgICAgcmV0dXJuIGxzdFt0ZXN0Qml0cyhvYmopXVxuXG5cbiAgZm9yIGNvbnN0IFQgb2YgZnJtX3RyYW5zcG9ydHMgOjpcbiAgICBjb25zdCB7Yml0czpiLCBzaXplLCB0cmFuc3BvcnR9ID0gVFxuXG4gICAgYnlCaXRzW2J8MF0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDAsIG1hc2ssIHNpemU6IHNpemUsIG9wOiAnJ1xuICAgIGJ5Qml0c1tifDFdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwxLCBtYXNrLCBzaXplOiA4ICsgc2l6ZSwgb3A6ICdmJ1xuICAgIGJ5Qml0c1tifDJdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwyLCBtYXNrLCBzaXplOiA4ICsgc2l6ZSwgb3A6ICdyJ1xuICAgIGJ5Qml0c1tifDNdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwzLCBtYXNrLCBzaXplOiAxNiArIHNpemUsIG9wOiAnZnInXG5cbiAgICBmb3IgY29uc3QgZm5fa2V5IG9mIFsnZl9wYWNrJywgJ2ZfdW5wYWNrJ10gOjpcbiAgICAgIGNvbnN0IGZuX3RyYW4gPSBUW2ZuX2tleV0sIGZuX2Zyb20gPSBmcm1fZnJvbVtmbl9rZXldLCBmbl9yZXNwID0gZnJtX3Jlc3BbZm5fa2V5XVxuXG4gICAgICBieUJpdHNbYnwwXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fdHJhbihvYmosIGR2LCAwKVxuICAgICAgYnlCaXRzW2J8MV1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3RyYW4ob2JqLCBkdiwgOClcbiAgICAgIGJ5Qml0c1tifDJdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9yZXNwKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwzXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fZnJvbShvYmosIGR2LCAwKTsgZm5fcmVzcChvYmosIGR2LCA4KTsgZm5fdHJhbihvYmosIGR2LCAxNilcblxuICBmb3IgY29uc3QgZnJtIG9mIGJ5Qml0cyA6OlxuICAgIGJpbmRBc3NlbWJsZWQgQCBmcm1cblxuICByZXR1cm4gYnlCaXRzXG5cblxuZnVuY3Rpb24gYmluZEFzc2VtYmxlZChmcm0pIDo6XG4gIGNvbnN0IHtULCBzaXplLCBmX3BhY2ssIGZfdW5wYWNrfSA9IGZybVxuICBpZiBULmJpbmRfc2VxX25leHQgOjpcbiAgICBmcm0uc2VxX25leHQgPSBULmJpbmRfc2VxX25leHQgQCBmcm0uc2l6ZSAtIFQuc2l6ZVxuXG4gIGRlbGV0ZSBmcm0uVFxuICBmcm0ucGFjayA9IHBhY2sgOyBmcm0udW5wYWNrID0gdW5wYWNrXG4gIGNvbnN0IHNlcV9uZXh0ID0gZnJtLnNlcV9uZXh0XG5cbiAgZnVuY3Rpb24gcGFjayhwa3RfdHlwZSwgcGt0X29iaikgOjpcbiAgICBpZiAhIEAgMCA8PSBwa3RfdHlwZSAmJiBwa3RfdHlwZSA8PSAyNTUgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgcGt0X3R5cGUgdG8gYmUgWzAuLjI1NV1gXG5cbiAgICBwa3Rfb2JqLnR5cGUgPSBwa3RfdHlwZVxuICAgIGlmIHNlcV9uZXh0ICYmIG51bGwgPT0gcGt0X29iai5zZXEgOjpcbiAgICAgIHBrdF9vYmouc2VxID0gdHJ1ZVxuXG4gICAgY29uc3QgZHYgPSBuZXcgRGF0YVZpZXcgQCBuZXcgQXJyYXlCdWZmZXIoc2l6ZSlcbiAgICBmX3BhY2socGt0X29iaiwgZHYsIDApXG4gICAgcGt0X29iai5oZWFkZXIgPSBkdi5idWZmZXJcblxuICAgIGlmIHRydWUgPT09IHBrdF9vYmouc2VxIDo6XG4gICAgICBfYmluZF9pdGVyYWJsZSBAIHBrdF9vYmosIGR2LmJ1ZmZlci5zbGljZSgwLHNpemUpXG5cbiAgZnVuY3Rpb24gdW5wYWNrKHBrdCkgOjpcbiAgICBjb25zdCBidWYgPSBwa3QuaGVhZGVyX2J1ZmZlcigpXG4gICAgY29uc3QgZHYgPSBuZXcgRGF0YVZpZXcgQCBuZXcgVWludDhBcnJheShidWYpLmJ1ZmZlclxuXG4gICAgY29uc3QgaW5mbyA9IHt9XG4gICAgZl91bnBhY2soaW5mbywgZHYsIDApXG4gICAgcmV0dXJuIHBrdC5pbmZvID0gaW5mb1xuXG4gIGZ1bmN0aW9uIF9iaW5kX2l0ZXJhYmxlKHBrdF9vYmosIGJ1Zl9jbG9uZSkgOjpcbiAgICBjb25zdCB7dHlwZX0gPSBwa3Rfb2JqXG4gICAgY29uc3Qge2lkX3JvdXRlciwgaWRfdGFyZ2V0LCB0dGwsIHRva2VufSA9IHBrdF9vYmpcbiAgICBwa3Rfb2JqLm5leHQgPSBuZXh0XG5cbiAgICBmdW5jdGlvbiBuZXh0KG9wdGlvbnMpIDo6XG4gICAgICBpZiBudWxsID09IG9wdGlvbnMgOjogb3B0aW9ucyA9IHt9XG4gICAgICBjb25zdCBoZWFkZXIgPSBidWZfY2xvbmUuc2xpY2UoKVxuICAgICAgc2VxX25leHQgQCBvcHRpb25zLCBuZXcgRGF0YVZpZXcgQCBoZWFkZXJcbiAgICAgIHJldHVybiBAe30gZG9uZTogISEgb3B0aW9ucy5maW4sIHZhbHVlOiBAe30gLy8gcGt0X29ialxuICAgICAgICBpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHlwZSwgdHRsLCB0b2tlbiwgaGVhZGVyXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihwYWNrZXRQYXJzZXIsIG9wdGlvbnMsIGZyYWdtZW50X3NpemUpIDo6XG4gIGNvbnN0IHtjb25jYXRCdWZmZXJzLCBwYWNrUGFja2V0T2JqLCBwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHBhY2tldFBhcnNlclxuICBmcmFnbWVudF9zaXplID0gTnVtYmVyKGZyYWdtZW50X3NpemUgfHwgODAwMClcbiAgaWYgMTAyNCA+IGZyYWdtZW50X3NpemUgfHwgNjUwMDAgPCBmcmFnbWVudF9zaXplIDo6XG4gICAgdGhyb3cgbmV3IEVycm9yIEAgYEludmFsaWQgZnJhZ21lbnQgc2l6ZTogJHtmcmFnbWVudF9zaXplfWBcblxuICBjb25zdCB7cmFuZG9tX2lkLCBqc29uX3BhY2t9ID0gb3B0aW9uc1xuICByZXR1cm4gQDogcGFja2V0UGFyc2VyLCByYW5kb21faWQsIGpzb25fcGFja1xuICAgIGNyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtLCBwYWNrZXRGcmFnbWVudHNcbiAgICBiaW5kVHJhbnNwb3J0c1xuXG5cbiAgZnVuY3Rpb24gY3JlYXRlTXVsdGlwYXJ0KHBrdCwgc2luaywgbXNnaWQpIDo6XG4gICAgbGV0IHBhcnRzID0gW10sIGZpbiA9IGZhbHNlXG4gICAgcmV0dXJuIEB7fSBmZWVkLCBpbmZvOiBwa3QuaW5mb1xuXG4gICAgZnVuY3Rpb24gZmVlZChwa3QpIDo6XG4gICAgICBsZXQgc2VxID0gcGt0LmluZm8uc2VxXG4gICAgICBpZiBzZXEgPCAwIDo6IGZpbiA9IHRydWU7IHNlcSA9IC1zZXFcbiAgICAgIHBhcnRzW3NlcS0xXSA9IHBrdC5ib2R5X2J1ZmZlcigpXG5cbiAgICAgIGlmICEgZmluIDo6IHJldHVyblxuICAgICAgaWYgcGFydHMuaW5jbHVkZXMgQCB1bmRlZmluZWQgOjogcmV0dXJuXG5cbiAgICAgIHNpbmsuZGVsZXRlU3RhdGVGb3IobXNnaWQpXG5cbiAgICAgIGNvbnN0IHJlcyA9IGNvbmNhdEJ1ZmZlcnMocGFydHMpXG4gICAgICBwYXJ0cyA9IG51bGxcbiAgICAgIHJldHVybiByZXNcblxuICBmdW5jdGlvbiBjcmVhdGVTdHJlYW0ocGt0LCBzaW5rLCBtc2dpZCkgOjpcbiAgICBsZXQgbmV4dD0wLCBmaW4gPSBmYWxzZSwgcmVjdkRhdGEsIHJzdHJlYW1cbiAgICBjb25zdCBzdGF0ZSA9IEB7fSBmZWVkOiBmZWVkX2luaXQsIGluZm86IHBrdC5pbmZvXG4gICAgcmV0dXJuIHN0YXRlXG5cbiAgICBmdW5jdGlvbiBmZWVkX2luaXQocGt0LCBhc19jb250ZW50KSA6OlxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfaWdub3JlXG5cbiAgICAgIGNvbnN0IGluZm8gPSBwa3QuaW5mb1xuICAgICAgY29uc3QgbXNnID0gc2luay5qc29uX3VucGFjayBAIHBrdC5ib2R5X3V0ZjgoKVxuICAgICAgcnN0cmVhbSA9IHNpbmsucmVjdlN0cmVhbShtc2csIGluZm8pXG4gICAgICBpZiBudWxsID09IHJzdHJlYW0gOjogcmV0dXJuXG4gICAgICBjaGVja19mbnMgQCByc3RyZWFtLCAnb25fZXJyb3InLCAnb25fZGF0YScsICdvbl9lbmQnIFxuICAgICAgcmVjdkRhdGEgPSBzaW5rLnJlY3ZTdHJlYW1EYXRhLmJpbmQoc2luaywgcnN0cmVhbSwgaW5mbylcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIGZlZWRfc2VxKHBrdClcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lcnJvciBAIGVyciwgcGt0XG5cbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2JvZHlcbiAgICAgIGlmIHJzdHJlYW0ub25faW5pdCA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9pbml0KG1zZywgcGt0KVxuXG4gICAgZnVuY3Rpb24gZmVlZF9ib2R5KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIHJlY3ZEYXRhKClcbiAgICAgIGxldCBkYXRhXG4gICAgICB0cnkgOjpcbiAgICAgICAgZmVlZF9zZXEocGt0KVxuICAgICAgICBkYXRhID0gYXNfY29udGVudChwa3QsIHNpbmspXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgICBpZiBmaW4gOjpcbiAgICAgICAgY29uc3QgcmVzID0gcnN0cmVhbS5vbl9kYXRhIEAgZGF0YSwgcGt0XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2VuZCBAIHJlcywgcGt0XG4gICAgICBlbHNlIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2RhdGEgQCBkYXRhLCBwa3RcblxuICAgIGZ1bmN0aW9uIGZlZWRfaWdub3JlKHBrdCkgOjpcbiAgICAgIHRyeSA6OiBmZWVkX3NlcShwa3QpXG4gICAgICBjYXRjaCBlcnIgOjpcblxuICAgIGZ1bmN0aW9uIGZlZWRfc2VxKHBrdCkgOjpcbiAgICAgIGxldCBzZXEgPSBwa3QuaW5mby5zZXFcbiAgICAgIGlmIHNlcSA+PSAwIDo6XG4gICAgICAgIGlmIG5leHQrKyA9PT0gc2VxIDo6XG4gICAgICAgICAgcmV0dXJuIC8vIGluIG9yZGVyXG4gICAgICBlbHNlIDo6XG4gICAgICAgIGZpbiA9IHRydWVcbiAgICAgICAgc2luay5kZWxldGVTdGF0ZUZvcihtc2dpZClcbiAgICAgICAgaWYgbmV4dCA9PT0gLXNlcSA6OlxuICAgICAgICAgIG5leHQgPSAnZG9uZSdcbiAgICAgICAgICByZXR1cm4gLy8gaW4tb3JkZXIsIGxhc3QgcGFja2V0XG5cbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuICAgICAgbmV4dCA9ICdpbnZhbGlkJ1xuICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFBhY2tldCBvdXQgb2Ygc2VxdWVuY2VgXG5cbiAgZnVuY3Rpb24gKiBwYWNrZXRGcmFnbWVudHMoYnVmLCBuZXh0X2hkciwgZmluKSA6OlxuICAgIGlmIG51bGwgPT0gYnVmIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIHlpZWxkIG9ialxuICAgICAgcmV0dXJuXG5cbiAgICBsZXQgaSA9IDAsIGxhc3RJbm5lciA9IGJ1Zi5ieXRlTGVuZ3RoIC0gZnJhZ21lbnRfc2l6ZTtcbiAgICB3aGlsZSBpIDwgbGFzdElubmVyIDo6XG4gICAgICBjb25zdCBpMCA9IGlcbiAgICAgIGkgKz0gZnJhZ21lbnRfc2l6ZVxuXG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcigpXG4gICAgICBvYmouYm9keSA9IGJ1Zi5zbGljZShpMCwgaSlcbiAgICAgIHlpZWxkIG9ialxuXG4gICAgOjpcbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKHtmaW59KVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaSlcbiAgICAgIHlpZWxkIG9ialxuXG5cblxuICBmdW5jdGlvbiBiaW5kVHJhbnNwb3J0SW1wbHMoaW5ib3VuZCwgaGlnaGJpdHMsIHRyYW5zcG9ydHMpIDo6XG4gICAgY29uc3Qgb3V0Ym91bmQgPSBbXVxuICAgIG91dGJvdW5kLmNob29zZSA9IGZyYW1pbmdzLmNob29zZVxuXG4gICAgZm9yIGNvbnN0IGZyYW1lIG9mIGZyYW1pbmdzIDo6XG4gICAgICBjb25zdCBpbXBsID0gZnJhbWUgPyB0cmFuc3BvcnRzW2ZyYW1lLnRyYW5zcG9ydF0gOiBudWxsXG4gICAgICBpZiAhIGltcGwgOjogY29udGludWVcblxuICAgICAgY29uc3Qge2JpdHMsIHBhY2ssIHVucGFja30gPSBmcmFtZVxuICAgICAgY29uc3QgcGt0X3R5cGUgPSBoaWdoYml0cyB8IGJpdHNcbiAgICAgIGNvbnN0IHt0X3JlY3Z9ID0gaW1wbFxuXG4gICAgICBmdW5jdGlvbiBwYWNrX2hkcihvYmopIDo6XG4gICAgICAgIHBhY2socGt0X3R5cGUsIG9iailcbiAgICAgICAgcmV0dXJuIG9ialxuXG4gICAgICBmdW5jdGlvbiByZWN2X21zZyhwa3QsIHNpbmspIDo6XG4gICAgICAgIHVucGFjayhwa3QpXG4gICAgICAgIHJldHVybiB0X3JlY3YocGt0LCBzaW5rKVxuXG4gICAgICBwYWNrX2hkci5wa3RfdHlwZSA9IHJlY3ZfbXNnLnBrdF90eXBlID0gcGt0X3R5cGVcbiAgICAgIG91dGJvdW5kW2JpdHNdID0gcGFja19oZHJcbiAgICAgIGluYm91bmRbcGt0X3R5cGVdID0gcmVjdl9tc2dcblxuICAgICAgaWYgJ3Byb2R1Y3Rpb24nICE9PSBwcm9jZXNzLmVudi5OT0RFX0VOViA6OlxuICAgICAgICBjb25zdCBvcCA9IHBhY2tfaGRyLm9wID0gcmVjdl9tc2cub3AgPSBmcmFtZS5vcFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCBwYWNrX2hkciwgJ25hbWUnLCBAe30gdmFsdWU6IGBwYWNrX2hkciDCqyR7b3B9wrtgXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSBAIHJlY3ZfbXNnLCAnbmFtZScsIEB7fSB2YWx1ZTogYHJlY3ZfbXNnIMKrJHtvcH3Cu2BcblxuICAgIHJldHVybiBvdXRib3VuZFxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydHMoaW5ib3VuZCwgaGlnaGJpdHMsIHRyYW5zcG9ydHMpIDo6XG4gICAgY29uc3QgcGFja0JvZHkgPSB0cmFuc3BvcnRzLnBhY2tCb2R5XG4gICAgY29uc3Qgb3V0Ym91bmQgPSBiaW5kVHJhbnNwb3J0SW1wbHMoaW5ib3VuZCwgaGlnaGJpdHMsIHRyYW5zcG9ydHMpXG4gICAgcmV0dXJuIHRyYW5zcG9ydHMuc3RyZWFtaW5nXG4gICAgICA/IEB7fSBzZW5kLCBzdHJlYW06IGJpbmRfc3RyZWFtIEAgdHJhbnNwb3J0cy5zdHJlYW1pbmcubW9kZVxuICAgICAgOiBAe30gc2VuZFxuXG4gICAgZnVuY3Rpb24gc2VuZChjaGFuLCBvYmosIGJvZHkpIDo6XG4gICAgICBib2R5ID0gcGFja0JvZHkoYm9keSlcbiAgICAgIGlmIGZyYWdtZW50X3NpemUgPCBib2R5LmJ5dGVMZW5ndGggOjpcbiAgICAgICAgaWYgISBvYmoudG9rZW4gOjogb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICAgICAgb2JqLnRyYW5zcG9ydCA9ICdtdWx0aXBhcnQnXG4gICAgICAgIGNvbnN0IG1zZW5kID0gbXNlbmRfYnl0ZXMoY2hhbiwgb2JqKVxuICAgICAgICByZXR1cm4gbXNlbmQgQCB0cnVlLCBib2R5XG5cbiAgICAgIG9iai50cmFuc3BvcnQgPSAnc2luZ2xlJ1xuICAgICAgb2JqLmJvZHkgPSBib2R5XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgcGFja19oZHIob2JqKVxuICAgICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIG1zZW5kX2J5dGVzKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGFzeW5jIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBsZXQgcmVzXG4gICAgICAgIGZvciBjb25zdCBvYmogb2YgcGFja2V0RnJhZ21lbnRzIEAgYm9keSwgbmV4dCwgZmluIDo6XG4gICAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICAgIHJlcyA9IGF3YWl0IGNoYW4gQCBwa3RcbiAgICAgICAgaWYgZmluIDo6IG5leHQgPSBudWxsXG4gICAgICAgIHJldHVybiByZXNcblxuICAgIGZ1bmN0aW9uIG1zZW5kX29iamVjdHMoY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBsZXQge25leHR9ID0gcGFja19oZHIob2JqKVxuICAgICAgaWYgbnVsbCAhPT0gbXNnIDo6XG4gICAgICAgIG9iai5ib2R5ID0gbXNnXG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgY2hhbiBAIHBrdFxuXG4gICAgICByZXR1cm4gZnVuY3Rpb24gKGZpbiwgYm9keSkgOjpcbiAgICAgICAgaWYgbnVsbCA9PT0gbmV4dCA6OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvciBAICdXcml0ZSBhZnRlciBlbmQnXG4gICAgICAgIGNvbnN0IG9iaiA9IG5leHQoe2Zpbn0pXG4gICAgICAgIG9iai5ib2R5ID0gYm9keVxuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gICAgZnVuY3Rpb24gYmluZF9zdHJlYW0obW9kZSkgOjpcbiAgICAgIGNvbnN0IG1zZW5kX2ltcGwgPSB7b2JqZWN0OiBtc2VuZF9vYmplY3RzLCBieXRlczogbXNlbmRfYnl0ZXN9W21vZGVdXG4gICAgICBpZiBtc2VuZF9pbXBsIDo6IHJldHVybiBzdHJlYW1cblxuICAgICAgZnVuY3Rpb24gc3RyZWFtKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBvYmoudHJhbnNwb3J0ID0gJ3N0cmVhbWluZydcbiAgICAgICAgY29uc3QgbXNlbmQgPSBtc2VuZF9pbXBsIEAgY2hhbiwgb2JqLCBqc29uX3BhY2sobXNnKVxuICAgICAgICB3cml0ZS53cml0ZSA9IHdyaXRlOyB3cml0ZS5lbmQgPSB3cml0ZS5iaW5kKHRydWUpXG4gICAgICAgIHJldHVybiB3cml0ZVxuXG4gICAgICAgIGZ1bmN0aW9uIHdyaXRlKGNodW5rKSA6OlxuICAgICAgICAgIHJldHVybiBjaHVuayAhPSBudWxsXG4gICAgICAgICAgICA/IG1zZW5kIEAgdHJ1ZT09PXRoaXMsIHBhY2tCb2R5KGNodW5rKVxuICAgICAgICAgICAgOiBtc2VuZCBAIHRydWVcblxuXG5mdW5jdGlvbiBjaGVja19mbnMob2JqLCAuLi5rZXlzKSA6OlxuICBmb3IgY29uc3Qga2V5IG9mIGtleXMgOjpcbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2Ygb2JqW2tleV0gOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgXCIke2tleX1cIiB0byBiZSBhIGZ1bmN0aW9uYFxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ganNvbl9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwganNvbl9wYWNrfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG5cbiAgcmV0dXJuIEB7fVxuICAgIHBhY2tCb2R5XG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0gc2luay5qc29uX3VucGFjayBAIHBrdC5ib2R5X3V0ZjgoKSB8fCB1bmRlZmluZWRcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBib2R5X2J1ZiA9IHN0YXRlLmZlZWQocGt0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IGJvZHlfYnVmIDo6XG4gICAgICAgICAgY29uc3QgbXNnID0gc2luay5qc29uX3VucGFjayBAIHVucGFja191dGY4KGJvZHlfYnVmKSB8fCB1bmRlZmluZWRcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ29iamVjdCdcbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlU3RyZWFtXG4gICAgICAgIHJldHVybiBzdGF0ZS5mZWVkKHBrdCwgdW5wYWNrQm9keSlcblxuICBmdW5jdGlvbiBwYWNrQm9keShib2R5KSA6OlxuICAgIHJldHVybiBwYWNrX3V0ZjggQCBqc29uX3BhY2soYm9keSlcblxuICBmdW5jdGlvbiB1bnBhY2tCb2R5KHBrdCwgc2luaykgOjpcbiAgICByZXR1cm4gc2luay5qc29uX3VucGFjayBAIHBrdC5ib2R5X3V0ZjgoKVxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gYmluYXJ5X3Byb3RvY29sKHNoYXJlZCkgOjpcbiAgY29uc3Qge2NyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG4gIGNvbnN0IHthc0J1ZmZlcn0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keTogYXNCdWZmZXJcblxuICAgIGdldCBkYXRhZ3JhbSgpIDo6IHJldHVybiB0aGlzLmRpcmVjdFxuICAgIGRpcmVjdDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBtc2cgPSBwa3QuYm9keV9idWZmZXIoKVxuICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBwa3QuaW5mb1xuXG4gICAgbXVsdGlwYXJ0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlTXVsdGlwYXJ0XG4gICAgICAgIGNvbnN0IG1zZyA9IHN0YXRlLmZlZWQocGt0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZyA6OlxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuICAgIHN0cmVhbWluZzogQHt9XG4gICAgICBtb2RlOiAnYnl0ZXMnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICBjb25zdCBtc2cgPSBzdGF0ZS5mZWVkKHBrdCwgcGt0X2J1ZmZlcilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2cgOjpcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbmZ1bmN0aW9uIHBrdF9idWZmZXIocGt0KSA6OiByZXR1cm4gcGt0LmJvZHlfYnVmZmVyKClcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGNvbnRyb2xfcHJvdG9jb2woaW5ib3VuZCwgaGlnaCwgc2hhcmVkKSA6OlxuICBjb25zdCB7cmFuZG9tX2lkfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja1BhY2tldE9ian0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG5cbiAgY29uc3QgcGluZ19mcmFtZSA9IGZyYW1pbmdzLmNob29zZSBAOiBmcm9tX2lkOiB0cnVlLCB0b2tlbjogdHJ1ZSwgdHJhbnNwb3J0OiAnZGlyZWN0J1xuICBjb25zdCBwb25nX2ZyYW1lID0gZnJhbWluZ3MuY2hvb3NlIEA6IGZyb21faWQ6IHRydWUsIG1zZ2lkOiB0cnVlLCB0cmFuc3BvcnQ6ICdkYXRhZ3JhbSdcblxuICBjb25zdCBwb25nX3R5cGUgPSBoaWdofDB4ZVxuICBpbmJvdW5kW3BvbmdfdHlwZV0gPSByZWN2X3BvbmdcbiAgY29uc3QgcGluZ190eXBlID0gaGlnaHwweGZcbiAgaW5ib3VuZFtoaWdofDB4Zl0gPSByZWN2X3BpbmdcblxuICByZXR1cm4gQHt9IHNlbmQ6cGluZywgcGluZ1xuXG4gIGZ1bmN0aW9uIHBpbmcoY2hhbiwgb2JqKSA6OlxuICAgIGlmICEgb2JqLnRva2VuIDo6XG4gICAgICBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgIG9iai5ib2R5ID0gSlNPTi5zdHJpbmdpZnkgQDpcbiAgICAgIG9wOiAncGluZycsIHRzMDogbmV3IERhdGUoKVxuICAgIHBpbmdfZnJhbWUucGFjayhwaW5nX3R5cGUsIG9iailcbiAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICBmdW5jdGlvbiByZWN2X3BpbmcocGt0LCBzaW5rLCByb3V0ZXIpIDo6XG4gICAgcGluZ19mcmFtZS51bnBhY2socGt0KVxuICAgIHBrdC5ib2R5ID0gcGt0LmJvZHlfanNvbigpXG4gICAgX3NlbmRfcG9uZyBAIHBrdC5ib2R5LCBwa3QsIHJvdXRlclxuICAgIHJldHVybiBzaW5rLnJlY3ZDdHJsKHBrdC5ib2R5LCBwa3QuaW5mbylcblxuICBmdW5jdGlvbiBfc2VuZF9wb25nKHt0czB9LCBwa3RfcGluZywgcm91dGVyKSA6OlxuICAgIGNvbnN0IHttc2dpZCwgaWRfdGFyZ2V0LCBpZF9yb3V0ZXIsIGZyb21faWQ6cl9pZH0gPSBwa3RfcGluZy5pbmZvXG4gICAgY29uc3Qgb2JqID0gQHt9IG1zZ2lkXG4gICAgICBmcm9tX2lkOiBAe30gaWRfdGFyZ2V0LCBpZF9yb3V0ZXJcbiAgICAgIGlkX3JvdXRlcjogcl9pZC5pZF9yb3V0ZXIsIGlkX3RhcmdldDogcl9pZC5pZF90YXJnZXRcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICAgIG9wOiAncG9uZycsIHRzMCwgdHMxOiBuZXcgRGF0ZSgpXG5cbiAgICBwb25nX2ZyYW1lLnBhY2socG9uZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiByb3V0ZXIuZGlzcGF0Y2ggQCBbcGt0XVxuXG4gIGZ1bmN0aW9uIHJlY3ZfcG9uZyhwa3QsIHNpbmspIDo6XG4gICAgcG9uZ19mcmFtZS51bnBhY2socGt0KVxuICAgIHBrdC5ib2R5ID0gcGt0LmJvZHlfanNvbigpXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcbmltcG9ydCBzaGFyZWRfcHJvdG8gZnJvbSAnLi9zaGFyZWQuanN5J1xuaW1wb3J0IGpzb25fcHJvdG8gZnJvbSAnLi9qc29uLmpzeSdcbmltcG9ydCBiaW5hcnlfcHJvdG8gZnJvbSAnLi9iaW5hcnkuanN5J1xuaW1wb3J0IGNvbnRyb2xfcHJvdG8gZnJvbSAnLi9jb250cm9sLmpzeSdcblxuZXhwb3J0ICogZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gaW5pdF9wcm90b2NvbChwYWNrZXRQYXJzZXIsIG9wdGlvbnMpIDo6XG4gIGNvbnN0IHNoYXJlZCA9IHNoYXJlZF9wcm90byBAIHBhY2tldFBhcnNlciwgb3B0aW9uc1xuXG4gIGNvbnN0IGluYm91bmQgPSBbXVxuICBjb25zdCBqc29uID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MDAgLy8gMHgwKiDigJQgSlNPTiBib2R5XG4gICAganNvbl9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgYmluYXJ5ID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MTAgLy8gMHgxKiDigJQgYmluYXJ5IGJvZHlcbiAgICBiaW5hcnlfcHJvdG8oc2hhcmVkKVxuXG4gIGNvbnN0IGNvbnRyb2wgPSBjb250cm9sX3Byb3RvIEAgaW5ib3VuZCxcbiAgICAweGYwIC8vIDB4Ziog4oCUIGNvbnRyb2xcbiAgICBzaGFyZWRcblxuICBjb25zdCBjb2RlY3MgPSBAOiBqc29uLCBiaW5hcnksIGNvbnRyb2wsIGRlZmF1bHQ6IGpzb25cblxuICBjb25zdCB7cmFuZG9tX2lkfSA9IHNoYXJlZFxuICByZXR1cm4gQDogaW5ib3VuZCwgY29kZWNzLCByYW5kb21faWRcblxuXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBTaW5rIDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe2luYm91bmR9KSA6OlxuICAgIGNsYXNzIFNpbmsgZXh0ZW5kcyB0aGlzIDo6XG4gICAgU2luay5wcm90b3R5cGUuX3Byb3RvY29sID0gaW5ib3VuZFxuICAgIHJldHVybiBTaW5rXG5cbiAgcmVnaXN0ZXIoZW5kcG9pbnQsIGh1YiwgaWRfdGFyZ2V0LCBoYW5kbGVycykgOjpcbiAgICBjb25zdCB1bnJlZ2lzdGVyID0gKCkgPT4gaHViLnJvdXRlci51bnJlZ2lzdGVyVGFyZ2V0KGlkX3RhcmdldClcblxuICAgIGh1Yi5yb3V0ZXIucmVnaXN0ZXJUYXJnZXQgQCBpZF90YXJnZXQsXG4gICAgICB0aGlzLl9iaW5kRGlzcGF0Y2ggQCBlbmRwb2ludCwgdW5yZWdpc3RlciwgaGFuZGxlcnNcbiAgICByZXR1cm4gdGhpc1xuXG4gIF9iaW5kRGlzcGF0Y2goZW5kcG9pbnQsIHVucmVnaXN0ZXIsIHtvbl9tc2csIG9uX2Vycm9yLCBvbl9zaHV0ZG93bn0pIDo6XG4gICAgbGV0IGFsaXZlID0gdHJ1ZVxuICAgIGNvbnN0IHByb3RvY29sID0gdGhpcy5fcHJvdG9jb2xcbiAgICBjb25zdCBpc0FsaXZlID0gKCkgPT4gYWxpdmVcbiAgICBjb25zdCBzaHV0ZG93biA9IChlcnIsIGV4dHJhKSA9PiA6OlxuICAgICAgaWYgYWxpdmUgOjpcbiAgICAgICAgdW5yZWdpc3RlcigpOyB1bnJlZ2lzdGVyID0gYWxpdmUgPSBmYWxzZVxuICAgICAgICBvbl9zaHV0ZG93bihlcnIsIGV4dHJhKVxuXG4gICAgT2JqZWN0LmFzc2lnbiBAIHRoaXMsIGVuZHBvaW50LmJpbmRTaW5rKHRoaXMpLCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cbiAgICBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuXG4gICAgcmV0dXJuIGFzeW5jIChwa3QsIHJvdXRlcikgPT4gOjpcbiAgICAgIGlmIGZhbHNlPT09YWxpdmUgfHwgbnVsbD09cGt0IDo6IHJldHVybiBhbGl2ZVxuXG4gICAgICBjb25zdCByZWN2X21zZyA9IHByb3RvY29sW3BrdC50eXBlXVxuICAgICAgaWYgdW5kZWZpbmVkID09PSByZWN2X21zZyA6OlxuICAgICAgICByZXR1cm4gdm9pZCBvbl9lcnJvciBAIGZhbHNlLCBAe30gcGt0LCB6b25lOiAncGt0LnR5cGUnXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICB2YXIgbXNnID0gYXdhaXQgcmVjdl9tc2cgQCBwa3QsIHRoaXMsIHJvdXRlclxuICAgICAgICBpZiAhIG1zZyA6OiByZXR1cm4gbXNnXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBlcnIsIEB7fSBwa3QsIHpvbmU6ICdwcm90b2NvbCdcblxuICAgICAgaWYgZmFsc2UgPT09IGFsaXZlIDo6XG4gICAgICAgIHJldHVybiByb3V0ZXIudW5yZWdpc3RlclxuXG4gICAgICB0cnkgOjpcbiAgICAgICAgYXdhaXQgb25fbXNnIEAgbXNnLCBwa3RcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICB0cnkgOjpcbiAgICAgICAgICB2YXIgdGVybWluYXRlID0gb25fZXJyb3IgQCBlcnIsIEB7fSBtc2csIHBrdCwgem9uZTogJ2Rpc3BhdGNoJ1xuICAgICAgICBmaW5hbGx5IDo6XG4gICAgICAgICAgaWYgZmFsc2UgIT09IHRlcm1pbmF0ZSA6OlxuICAgICAgICAgICAgc2h1dGRvd24oZXJyLCB7bXNnLCBwa3R9KVxuICAgICAgICAgICAgcmV0dXJuIHJvdXRlci51bnJlZ2lzdGVyXG5cbiAgc3RhdGVGb3IocGt0LCBpZkFic2VudCkgOjpcbiAgICBjb25zdCBtc2dpZCA9IHBrdC5pbmZvLm1zZ2lkXG4gICAgbGV0IGVudHJ5ID0gdGhpcy5ieV9tc2dpZC5nZXQobXNnaWQpXG4gICAgaWYgdW5kZWZpbmVkID09PSBlbnRyeSA6OlxuICAgICAgaWYgISBtc2dpZCA6OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgSW52YWxpZCBtc2dpZDogJHttc2dpZH1gXG4gICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgaWZBYnNlbnQgOjpcbiAgICAgICAgZW50cnkgPSBpZkFic2VudChwa3QsIHRoaXMsIG1zZ2lkKVxuICAgICAgZWxzZSBlbnRyeSA9IGlmQWJzZW50XG4gICAgICB0aGlzLmJ5X21zZ2lkLnNldCBAIG1zZ2lkLCBlbnRyeVxuICAgIHJldHVybiBlbnRyeVxuXG4gIGRlbGV0ZVN0YXRlRm9yKG1zZ2lkKSA6OlxuICAgIHJldHVybiB0aGlzLmJ5X21zZ2lkLmRlbGV0ZShtc2dpZClcblxuICBqc29uX3VucGFjayhvYmopIDo6IHRocm93IG5ldyBFcnJvciBAIGBFbmRwb2ludCBiaW5kU2luaygpIHJlc3BvbnNpYmlsaXR5YFxuXG4iLCJleHBvcnQgZGVmYXVsdCBFUFRhcmdldFxuZXhwb3J0IGNsYXNzIEVQVGFyZ2V0IDo6XG4gIGNvbnN0cnVjdG9yKGlkKSA6OiB0aGlzLmlkID0gaWRcblxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VQVGFyZ2V0ICR7ZXBfZW5jb2RlKHRoaXMuaWQsIHRydWUpfcK7YFxuICB0b0pTT04oKSA6OiByZXR1cm4gZXBfZW5jb2RlKHRoaXMuaWQsIGZhbHNlKVxuICBhc0VuZHBvaW50SWQoKSA6OiByZXR1cm4gdGhpcy5pZFxuICBpc0VQVGFyZ2V0KCkgOjogcmV0dXJuIHRydWVcblxuICBnZXQgaWRfcm91dGVyKCkgOjogcmV0dXJuIHRoaXMuaWQuaWRfcm91dGVyXG4gIGdldCBpZF90YXJnZXQoKSA6OiByZXR1cm4gdGhpcy5pZC5pZF90YXJnZXRcblxuICBzdGF0aWMgYXNfanNvbl91bnBhY2sobXNnX2N0eF90bywgeGZvcm1CeUtleSkgOjpcbiAgICB4Zm9ybUJ5S2V5ID0gT2JqZWN0LmNyZWF0ZSh4Zm9ybUJ5S2V5IHx8IG51bGwpXG4gICAgeGZvcm1CeUtleVt0b2tlbl0gPSB2ID0+IHRoaXMuZnJvbV9jdHggQCBlcF9kZWNvZGUodiksIG1zZ19jdHhfdG9cbiAgICByZXR1cm4gdGhpcy5qc29uX3VucGFja194Zm9ybSh4Zm9ybUJ5S2V5KVxuXG4gIHN0YXRpYyBmcm9tX2N0eChpZCwgbXNnX2N0eF90bywgbXNnaWQpIDo6XG4gICAgaWYgISBpZCA6OiByZXR1cm5cbiAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgaWQuYXNFbmRwb2ludElkIDo6XG4gICAgICBpZCA9IGlkLmFzRW5kcG9pbnRJZCgpXG5cbiAgICBjb25zdCBlcF90Z3QgPSBuZXcgdGhpcyhpZClcbiAgICBsZXQgZmFzdCwgaW5pdCA9ICgpID0+IGZhc3QgPSBtc2dfY3R4X3RvKGVwX3RndCwge21zZ2lkfSkuZmFzdF9qc29uXG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgZXBfdGd0LCBAe31cbiAgICAgIHNlbmQ6IEB7fSBnZXQoKSA6OiByZXR1cm4gKGZhc3QgfHwgaW5pdCgpKS5zZW5kXG4gICAgICBxdWVyeTogQHt9IGdldCgpIDo6IHJldHVybiAoZmFzdCB8fCBpbml0KCkpLnF1ZXJ5XG4gICAgICByZXBseUV4cGVjdGVkOiBAe30gdmFsdWU6ICEhIG1zZ2lkXG5cblxuY29uc3QgdG9rZW4gPSAnXFx1MDNFMCcgLy8gJ8+gJ1xuRVBUYXJnZXQudG9rZW4gPSB0b2tlblxuXG5FUFRhcmdldC5lcF9lbmNvZGUgPSBlcF9lbmNvZGVcbmV4cG9ydCBmdW5jdGlvbiBlcF9lbmNvZGUoaWQsIHNpbXBsZSkgOjpcbiAgbGV0IHtpZF9yb3V0ZXI6ciwgaWRfdGFyZ2V0OnR9ID0gaWRcbiAgciA9IChyPj4+MCkudG9TdHJpbmcoMzYpXG4gIHQgPSAodD4+PjApLnRvU3RyaW5nKDM2KVxuICBpZiBzaW1wbGUgOjpcbiAgICByZXR1cm4gYCR7dG9rZW59ICR7cn1+JHt0fWBcblxuICBjb25zdCByZXMgPSBAe30gW3Rva2VuXTogYCR7cn1+JHt0fWBcbiAgT2JqZWN0LmFzc2lnbiBAIHJlcywgaWRcbiAgZGVsZXRlIHJlcy5pZF9yb3V0ZXI7IGRlbGV0ZSByZXMuaWRfdGFyZ2V0XG4gIHJldHVybiByZXNcblxuXG5FUFRhcmdldC5lcF9kZWNvZGUgPSBlcF9kZWNvZGVcbmV4cG9ydCBmdW5jdGlvbiBlcF9kZWNvZGUodikgOjpcbiAgY29uc3QgaWQgPSAnc3RyaW5nJyA9PT0gdHlwZW9mIHZcbiAgICA/IHYuc3BsaXQodG9rZW4pWzFdXG4gICAgOiB2W3Rva2VuXVxuICBpZiAhIGlkIDo6IHJldHVyblxuXG4gIGxldCBbcix0XSA9IGlkLnNwbGl0KCd+JylcbiAgaWYgdW5kZWZpbmVkID09PSB0IDo6IHJldHVyblxuICByID0gMCB8IHBhcnNlSW50KHIsIDM2KVxuICB0ID0gMCB8IHBhcnNlSW50KHQsIDM2KVxuXG4gIHJldHVybiBAe30gaWRfcm91dGVyOiByLCBpZF90YXJnZXQ6IHRcblxuXG5FUFRhcmdldC5qc29uX3VucGFja194Zm9ybSA9IGpzb25fdW5wYWNrX3hmb3JtXG5leHBvcnQgZnVuY3Rpb24ganNvbl91bnBhY2tfeGZvcm0oeGZvcm1CeUtleSkgOjpcbiAgcmV0dXJuIHN6ID0+IEpTT04ucGFyc2UgQCBzeiwgcmV2aXZlcigpXG5cbiAgZnVuY3Rpb24gcmV2aXZlcigpIDo6XG4gICAgY29uc3QgcmVnID0gbmV3IFdlYWtNYXAoKVxuICAgIHJldHVybiBmdW5jdGlvbihrZXksIHZhbHVlKSA6OlxuICAgICAgY29uc3QgeGZuID0geGZvcm1CeUtleVtrZXldXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHhmbiA6OlxuICAgICAgICByZWcuc2V0KHRoaXMsIHhmbilcbiAgICAgICAgcmV0dXJuIHZhbHVlXG5cbiAgICAgIGlmICdvYmplY3QnID09PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgICAgY29uc3QgdmZuID0gcmVnLmdldCh2YWx1ZSlcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB2Zm4gOjpcbiAgICAgICAgICByZXR1cm4gdmZuIEAgdmFsdWVcbiAgICAgIHJldHVybiB2YWx1ZVxuXG4iLCJpbXBvcnQge2VwX2RlY29kZX0gZnJvbSAnLi9lcF90YXJnZXQuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNc2dDdHggOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7cmFuZG9tX2lkLCBjb2RlY3N9KSA6OlxuICAgIGNsYXNzIE1zZ0N0eCBleHRlbmRzIHRoaXMgOjpcbiAgICBNc2dDdHgucHJvdG90eXBlLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuICAgIE1zZ0N0eC53aXRoQ29kZWNzIEAgY29kZWNzXG4gICAgcmV0dXJuIE1zZ0N0eFxuXG4gIHN0YXRpYyBmb3JIdWIoaHViLCBjaGFubmVsKSA6OlxuICAgIGNvbnN0IHtzZW5kUmF3fSA9IGNoYW5uZWxcblxuICAgIGNsYXNzIE1zZ0N0eCBleHRlbmRzIHRoaXMgOjpcbiAgICBNc2dDdHgucHJvdG90eXBlLmNoYW5fc2VuZCA9IGFzeW5jIHBrdCA9PiA6OlxuICAgICAgYXdhaXQgc2VuZFJhdyhwa3QpXG4gICAgICByZXR1cm4gdHJ1ZVxuXG4gICAgcmV0dXJuIE1zZ0N0eFxuXG5cbiAgY29uc3RydWN0b3IoaWQpIDo6XG4gICAgaWYgbnVsbCAhPSBpZCA6OlxuICAgICAgY29uc3Qge2lkX3RhcmdldCwgaWRfcm91dGVyfSA9IGlkXG4gICAgICBjb25zdCBmcm9tX2lkID0gT2JqZWN0LmZyZWV6ZSBAOiBpZF90YXJnZXQsIGlkX3JvdXRlclxuICAgICAgdGhpcy5jdHggPSBAe30gZnJvbV9pZFxuXG5cbiAgd2l0aEVuZHBvaW50KGVuZHBvaW50KSA6OlxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEB7fVxuICAgICAgZW5kcG9pbnQ6IEB7fSB2YWx1ZTogZW5kcG9pbnRcblxuXG4gIHBpbmcodG9rZW49dHJ1ZSkgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9tc2dDb2RlY3MuY29udHJvbC5waW5nLCBbXSwgdG9rZW4pXG4gIHNlbmQoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9jb2RlYy5zZW5kLCBhcmdzKVxuICBzZW5kUXVlcnkoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9jb2RlYy5zZW5kLCBhcmdzLCB0cnVlKVxuICBxdWVyeSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MsIHRydWUpLnJlcGx5XG5cbiAgc3RyZWFtKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlYy5zdHJlYW0sIGFyZ3NcbiAgaW52b2tlKGtleSwgLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX2NvZGVjW2tleV0sIGFyZ3NcbiAgYmluZEludm9rZShmbk9yS2V5LCB0b2tlbikgOjpcbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgZm5PcktleSA6OiBmbk9yS2V5ID0gdGhpcy5fY29kZWNcbiAgICByZXR1cm4gKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChmbk9yS2V5LCBhcmdzLCB0b2tlbilcblxuICBfaW52b2tlX2V4KGludm9rZSwgYXJncywgdG9rZW4pIDo6XG4gICAgY29uc3Qgb2JqID0gT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eFxuICAgIGlmIG51bGwgPT0gdG9rZW4gOjogdG9rZW4gPSBvYmoudG9rZW5cbiAgICBlbHNlIG9iai50b2tlbiA9IHRva2VuXG4gICAgaWYgdHJ1ZSA9PT0gdG9rZW4gOjpcbiAgICAgIHRva2VuID0gb2JqLnRva2VuID0gdGhpcy5yYW5kb21faWQoKVxuXG4gICAgdGhpcy5hc3NlcnRNb25pdG9yKClcblxuICAgIGNvbnN0IHJlcyA9IGludm9rZSBAIHRoaXMuY2hhbl9zZW5kLCBvYmosIC4uLmFyZ3NcbiAgICBpZiAhIHRva2VuIHx8ICdmdW5jdGlvbicgIT09IHR5cGVvZiByZXMudGhlbiA6OiByZXR1cm4gcmVzXG5cbiAgICBsZXQgcF9zZW50ICA9IHJlcy50aGVuKClcbiAgICBjb25zdCByZXBseSA9IHRoaXMuZW5kcG9pbnQuaW5pdFJlcGx5KHRva2VuLCBwX3NlbnQsIHRoaXMpXG4gICAgcF9zZW50ID0gcF9zZW50LnRoZW4gQCAoKSA9PiBAOiByZXBseVxuICAgIHBfc2VudC5yZXBseSA9IHJlcGx5XG4gICAgcmV0dXJuIHBfc2VudFxuXG4gIGdldCB0bygpIDo6IHJldHVybiAodGd0LCAuLi5hcmdzKSA9PiA6OlxuICAgIGlmIG51bGwgPT0gdGd0IDo6IHRocm93IG5ldyBFcnJvciBAIGBOdWxsIHRhcmdldCBlbmRwb2ludGBcblxuICAgIGNvbnN0IHNlbGYgPSB0aGlzLmNsb25lKClcblxuICAgIGNvbnN0IGN0eCA9IHNlbGYuY3R4XG4gICAgaWYgJ251bWJlcicgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgIGN0eC5pZF90YXJnZXQgPSB0Z3RcbiAgICAgIGN0eC5pZF9yb3V0ZXIgPSBjdHguZnJvbV9pZC5pZF9yb3V0ZXJcbiAgICBlbHNlIDo6XG4gICAgICB0Z3QgPSBlcF9kZWNvZGUodGd0KSB8fCB0Z3RcbiAgICAgIGNvbnN0IHtmcm9tX2lkOiByZXBseV9pZCwgaWRfdGFyZ2V0LCBpZF9yb3V0ZXIsIHRva2VuLCBtc2dpZH0gPSB0Z3RcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBpZF90YXJnZXQgOjpcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IGlkX3RhcmdldFxuICAgICAgICBjdHguaWRfcm91dGVyID0gaWRfcm91dGVyXG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHlfaWQgJiYgISBjdHguaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSByZXBseV9pZC5pZF90YXJnZXRcbiAgICAgICAgY3R4LmlkX3JvdXRlciA9IHJlcGx5X2lkLmlkX3JvdXRlclxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG5cbiAgICByZXR1cm4gMCA9PT0gYXJncy5sZW5ndGggPyBzZWxmIDogc2VsZi53aXRoIEAgLi4uYXJnc1xuXG4gIHdpdGgoLi4uYXJncykgOjpcbiAgICBjb25zdCBjdHggPSB0aGlzLmN0eFxuICAgIGZvciBsZXQgdGd0IG9mIGFyZ3MgOjpcbiAgICAgIGlmIHRydWUgPT09IHRndCB8fCBmYWxzZSA9PT0gdGd0IDo6XG4gICAgICAgIGN0eC50b2tlbiA9IHRndFxuICAgICAgZWxzZSBpZiBudWxsICE9IHRndCA6OlxuICAgICAgICBjb25zdCB7dG9rZW4sIG1zZ2lkfSA9IHRndFxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnaWQgOjogY3R4Lm1zZ2lkID0gbXNnaWRcbiAgICByZXR1cm4gdGhpc1xuXG4gIHdpdGhSZXBseSgpIDo6XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUgQDogdG9rZW46IHRydWVcblxuICBjbG9uZSguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQHt9XG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cblxuICBhc3NlcnRNb25pdG9yKCkgOjpcbiAgICBpZiAhIHRoaXMuY2hlY2tNb25pdG9yKCkgOjpcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBUYXJnZXQgbW9uaXRvciBleHBpcmVkYFxuICBjaGVja01vbml0b3IoKSA6OiByZXR1cm4gdHJ1ZVxuICBtb25pdG9yKG9wdGlvbnM9e30pIDo6XG4gICAgaWYgdHJ1ZSA9PT0gb3B0aW9ucyB8fCBmYWxzZSA9PT0gb3B0aW9ucyA6OlxuICAgICAgb3B0aW9ucyA9IEB7fSBhY3RpdmU6IG9wdGlvbnNcblxuICAgIGNvbnN0IG1vbml0b3IgPSB0aGlzLmVuZHBvaW50LmluaXRNb25pdG9yKHRoaXMuY3R4LmlkX3RhcmdldClcblxuICAgIGNvbnN0IHRzX2R1cmF0aW9uID0gb3B0aW9ucy50c19kdXJhdGlvbiB8fCA1MDAwXG4gICAgbGV0IHRzX2FjdGl2ZSA9IG9wdGlvbnMudHNfYWN0aXZlXG4gICAgaWYgdHJ1ZSA9PT0gdHNfYWN0aXZlIDo6XG4gICAgICB0c19hY3RpdmUgPSB0c19kdXJhdGlvbi80XG5cbiAgICBsZXQgY2hlY2tNb25pdG9yXG4gICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIGNvbnN0IGRvbmUgPSBvcHRpb25zLnJlamVjdCA/IHJlamVjdCA6IHJlc29sdmVcbiAgICAgIHRoaXMuY2hlY2tNb25pdG9yID0gY2hlY2tNb25pdG9yID0gKCkgPT5cbiAgICAgICAgdHNfZHVyYXRpb24gPiBtb25pdG9yLnRkKClcbiAgICAgICAgICA/IHRydWUgOiAoZG9uZShtb25pdG9yKSwgZmFsc2UpXG5cbiAgICBsZXQgdGlkXG4gICAgY29uc3QgdHNfaW50ZXJ2YWwgPSB0c19hY3RpdmUgfHwgdHNfZHVyYXRpb24vNFxuICAgIGlmIG9wdGlvbnMuYWN0aXZlIHx8IHRzX2FjdGl2ZSA6OlxuICAgICAgY29uc3QgY3RybCA9IHRoaXMuY29kZWMoJ2NvbnRyb2wnKVxuICAgICAgY29uc3QgY2hlY2tQaW5nID0gKCkgPT4gOjpcbiAgICAgICAgaWYgdHNfaW50ZXJ2YWwgPiBtb25pdG9yLnRkKCkgOjpcbiAgICAgICAgICBjdHJsLmludm9rZSgncGluZycpXG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrUGluZywgdHNfaW50ZXJ2YWxcbiAgICBlbHNlIDo6XG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrTW9uaXRvciwgdHNfaW50ZXJ2YWxcbiAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcbiAgICBjb25zdCBjbGVhciA9ICgpID0+IGNsZWFySW50ZXJ2YWwodGlkKVxuXG4gICAgcHJvbWlzZS50aGVuKGNsZWFyLCBjbGVhcilcbiAgICByZXR1cm4gcHJvbWlzZVxuXG5cbiAgY29kZWMobXNnX2NvZGVjLCAuLi5hcmdzKSA6OlxuICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgbXNnX2NvZGVjIDo6XG4gICAgICBtc2dfY29kZWMgPSB0aGlzLl9tc2dDb2RlY3NbbXNnX2NvZGVjXVxuXG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG1zZ19jb2RlYy5zZW5kIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBhY2tldCBjb2RlYyBwcm90b2NvbGBcblxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQDpcbiAgICAgIF9jb2RlYzogQDogdmFsdWU6IG1zZ19jb2RlY1xuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG4gIHN0YXRpYyB3aXRoQ29kZWNzKG1zZ0NvZGVjcykgOjpcbiAgICBmb3IgY29uc3QgW25hbWUsIG1zZ19jb2RlY10gb2YgT2JqZWN0LmVudHJpZXMgQCBtc2dDb2RlY3MgOjpcbiAgICAgIHRoaXMucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSA6OlxuICAgICAgICByZXR1cm4gdGhpcy5jb2RlYyBAIG1zZ19jb2RlY1xuICAgIHRoaXMucHJvdG90eXBlLl9tc2dDb2RlY3MgPSBtc2dDb2RlY3NcbiAgICB0aGlzLnByb3RvdHlwZS5fY29kZWMgPSBtc2dDb2RlY3MuZGVmYXVsdFxuXG4gICAgLy8gYmluZCBzZW5kX2pzb24gYXMgZnJlcXVlbnRseSB1c2VkIGZhc3QtcGF0aFxuICAgIGNvbnN0IGpzb25fc2VuZCA9IG1zZ0NvZGVjcy5qc29uLnNlbmRcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMucHJvdG90eXBlLCBAOlxuICAgICAgZmFzdF9qc29uOiBAe30gZ2V0KCkgOjogcmV0dXJuIEA6XG4gICAgICAgIHNlbmQ6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoanNvbl9zZW5kLCBhcmdzKVxuICAgICAgICBzZW5kUXVlcnk6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoanNvbl9zZW5kLCBhcmdzLCB0cnVlKVxuICAgICAgICBxdWVyeTogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChqc29uX3NlbmQsIGFyZ3MsIHRydWUpLnJlcGx5XG5cbiAgICByZXR1cm4gdGhpc1xuXG5cbiAgd2l0aFJlamVjdFRpbWVvdXQocF9yZXBseSkgOjpcbiAgICByZXR1cm4gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgcF9yZXBseS50aGVuIEAgcmVzb2x2ZSwgcmVqZWN0XG4gICAgICBwX3JlcGx5LnRoZW4gQCBjbGVhciwgY2xlYXJcblxuICAgICAgY29uc3QgdGltZW91dCA9ICgpID0+IHJlamVjdCBAIG5ldyB0aGlzLlJlcGx5VGltZW91dFxuICAgICAgY29uc3QgdGlkID0gc2V0VGltZW91dCh0aW1lb3V0LCB0aGlzLm1zX3RpbWVvdXQpXG4gICAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcblxuICAgICAgZnVuY3Rpb24gY2xlYXIoKSA6OiBjbGVhclRpbWVvdXQgQCB0aWRcblxuXG5jbGFzcyBSZXBseVRpbWVvdXQgZXh0ZW5kcyBFcnJvciA6OlxuXG5PYmplY3QuYXNzaWduIEAgTXNnQ3R4LnByb3RvdHlwZSwgQHt9XG4gIFJlcGx5VGltZW91dCwgbXNfdGltZW91dDogNTAwMFxuXG4iLCJpbXBvcnQge0VQVGFyZ2V0LCBlcF9lbmNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRW5kcG9pbnQgOjpcbiAgc3RhdGljIHN1YmNsYXNzKGV4dGVuc2lvbnMpIDo6XG4gICAgY2xhc3MgRW5kcG9pbnQgZXh0ZW5kcyB0aGlzIDo6XG4gICAgT2JqZWN0LmFzc2lnbiBAIEVuZHBvaW50LnByb3RvdHlwZSwgZXh0ZW5zaW9uc1xuICAgIHJldHVybiBFbmRwb2ludFxuXG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRW5kcG9pbnQgJHtlcF9lbmNvZGUodGhpcy5pZCwgdHJ1ZSl9wrtgXG4gIHRvSlNPTigpIDo6IHJldHVybiB0aGlzLmVwX3NlbGYoKS50b0pTT04oKVxuICBlcF9zZWxmKCkgOjogcmV0dXJuIG5ldyB0aGlzLkVQVGFyZ2V0KHRoaXMuaWQpXG4gIGFzRW5kcG9pbnRJZCgpIDo6IHJldHVybiB0aGlzLmlkXG5cbiAgY29uc3RydWN0b3IoaWQsIG1zZ19jdHgpIDo6XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGlkOiBAe30gdmFsdWU6IGlkXG4gICAgICB0bzogQHt9IHZhbHVlOiBtc2dfY3R4LndpdGhFbmRwb2ludCh0aGlzKS50b1xuXG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKClcbiAgY3JlYXRlU3RhdGVNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSZXBseU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVRyYWZmaWNNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSb3V0ZUNhY2hlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcblxuICBiaW5kU2luayhzaW5rKSA6OlxuICAgIGNvbnN0IGJ5X3Rva2VuID0gdGhpcy5jcmVhdGVSZXBseU1hcCgpXG4gICAgY29uc3QgYnlfdHJhZmZpYyA9IHRoaXMuY3JlYXRlVHJhZmZpY01hcCgpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAOlxuICAgICAgYnlfdG9rZW46IEB7fSB2YWx1ZTogYnlfdG9rZW5cbiAgICAgIGJ5X3RyYWZmaWM6IEB7fSB2YWx1ZTogYnlfdHJhZmZpY1xuXG4gICAgY29uc3QgdHJhZmZpYyA9IChmcm9tX2lkLCB0cmFmZmljKSA9PiA6OlxuICAgICAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gICAgICBpZiBmcm9tX2lkIDo6XG4gICAgICAgIGNvbnN0IHQgPSBieV90cmFmZmljLmdldChmcm9tX2lkLmlkX3RhcmdldClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0IDo6XG4gICAgICAgICAgdC50cyA9IHRbYHRzXyR7dHJhZmZpY31gXSA9IHRzXG4gICAgICB0aGlzLnJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKVxuXG4gICAgcmV0dXJuIEB7fVxuICAgICAgYnlfbXNnaWQ6IHRoaXMuY3JlYXRlU3RhdGVNYXAoKVxuICAgICAganNvbl91bnBhY2s6IHRoaXMuRVBUYXJnZXQuYXNfanNvbl91bnBhY2sodGhpcy50bylcblxuICAgICAgcmVjdkN0cmw6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnY3RybCcpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZDdHJsKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnIHx8IHttc2csIGluZm99KS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZNc2c6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnbXNnJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdk1zZyhtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZykudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2U3RyZWFtRGF0YTogKHJzdHJlYW0sIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgIHJlY3ZTdHJlYW06IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3QgcnN0cmVhbSA9IHRoaXMucmVjdlN0cmVhbShtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocnN0cmVhbSkudGhlbihyZXBseSlcbiAgICAgICAgcmV0dXJuIHJzdHJlYW1cblxuICBhc190YXJnZXQoaWQpIDo6XG4gICAgaWYgaWQgOjogcmV0dXJuIHRoaXMuRVBUYXJnZXQuZnJvbV9jdHggQCBpZCwgdGhpcy50b1xuICBhc19zZW5kZXIoe2Zyb21faWQ6aWQsIG1zZ2lkfSkgOjpcbiAgICBpZiBpZCA6OiByZXR1cm4gdGhpcy5FUFRhcmdldC5mcm9tX2N0eCBAIGlkLCB0aGlzLnRvLCBtc2dpZFxuXG4gIHJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKSA6OlxuICByZWN2Q3RybChtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGlmIGlzX3JlcGx5IDo6IHJldHVybiBtc2dcbiAgcmVjdk1zZyhtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGlmIGlzX3JlcGx5IDo6IHJldHVybiBtc2dcbiAgICByZXR1cm4gQHt9IG1zZywgaW5mbywgc2VuZGVyOiB0aGlzLmFzX3NlbmRlcihpbmZvKVxuICByZWN2U3RyZWFtKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgY29uc29sZS53YXJuIEAgYFVuaGFuZGxlIHJlY3Ygc3RyZWFtOiAke2luZm99YFxuICAgIHJldHVybiBudWxsXG4gICAgLyogcmV0dXJuIEB7fSBtc2csIGluZm9cbiAgICAgICAgIG9uX2luaXQobXNnLCBwa3QpIDo6IC8vIHJldHVybiB0aGlzXG4gICAgICAgICBvbl9kYXRhKGRhdGEsIHBrdCkgOjogdGhpcy5wYXJ0cy5wdXNoIEAgZGF0YVxuICAgICAgICAgb25fZW5kKHJlc3VsdCwgcGt0KSA6OiB0aGlzLnBhcnRzLmpvaW4oJycpOyAvLyByZXR1cm4gdGhpc1xuICAgICAgICAgb25fZXJyb3IoZXJyLCBwa3QpIDo6IGNvbnNvbGUubG9nIEAgZXJyXG4gICAgKi9cblxuICBpbml0UmVwbHkodG9rZW4sIHBfc2VudCwgbXNnX2N0eCkgOjpcbiAgICByZXR1cm4gdGhpcy5pbml0UmVwbHlQcm9taXNlIEAgdG9rZW4sIHBfc2VudCwgbXNnX2N0eFxuXG4gIGluaXRNb25pdG9yKGlkX3RhcmdldCkgOjpcbiAgICBjb25zdCBrZXkgPSBpZF90YXJnZXQuaWRfdGFyZ2V0IHx8IGlkX3RhcmdldFxuICAgIGxldCBtb25pdG9yID0gdGhpcy5ieV90cmFmZmljLmdldCBAIGtleVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gbW9uaXRvciA6OlxuICAgICAgbW9uaXRvciA9IEB7fSBpZF90YXJnZXQsIHRzOiBEYXRlLm5vdygpXG4gICAgICAgIHRkKCkgOjogcmV0dXJuIERhdGUubm93KCkgLSB0aGlzLnRzXG4gICAgICB0aGlzLmJ5X3RyYWZmaWMuc2V0IEAga2V5LCBtb25pdG9yXG4gICAgcmV0dXJuIG1vbml0b3JcblxuICBpbml0UmVwbHlQcm9taXNlKHRva2VuLCBwX3NlbnQsIG1zZ19jdHgpIDo6XG4gICAgbGV0IHJlcGx5ID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgdGhpcy5ieV90b2tlbi5zZXQgQCB0b2tlbiwgcmVzb2x2ZVxuICAgICAgcF9zZW50LmNhdGNoIEAgcmVqZWN0XG5cbiAgICBpZiBtc2dfY3R4IDo6XG4gICAgICByZXBseSA9IG1zZ19jdHgud2l0aFJlamVjdFRpbWVvdXQocmVwbHkpXG5cbiAgICBjb25zdCBjbGVhciA9ICgpID0+IHRoaXMuYnlfdG9rZW4uZGVsZXRlIEAgdG9rZW5cbiAgICByZXBseS50aGVuIEAgY2xlYXIsIGNsZWFyXG4gICAgcmV0dXJuIHJlcGx5XG5cbkVuZHBvaW50LnByb3RvdHlwZS5FUFRhcmdldCA9IEVQVGFyZ2V0XG4iLCJpbXBvcnQgZXBfcHJvdG8gZnJvbSAnLi9lcF9raW5kcy9pbmRleC5qc3knXG5pbXBvcnQgaW5pdF9wcm90b2NvbCBmcm9tICcuL3Byb3RvY29sL2luZGV4LmpzeSdcbmltcG9ydCBTaW5rQmFzZSBmcm9tICcuL3NpbmsuanN5J1xuaW1wb3J0IE1zZ0N0eEJhc2UgZnJvbSAnLi9tc2djdHguanN5J1xuaW1wb3J0IEVuZHBvaW50QmFzZSBmcm9tICcuL2VuZHBvaW50LmpzeSdcblxuY29uc3QgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyA9IEA6XG4gIHBsdWdpbl9uYW1lOiAnZW5kcG9pbnQnXG4gIG9uX21zZyh7bXNnLCByZXBseSwgaW5mb30pIDo6XG4gICAgY29uc29sZS53YXJuIEAgJ0VORFBPSU5UIE1TRzonLCBAe30gbXNnLCByZXBseSwgaW5mb1xuICBvbl9lcnJvcihlcCwgZXJyLCBleHRyYSkgOjpcbiAgICBjb25zb2xlLmVycm9yIEAgJ0VORFBPSU5UIEVSUk9SOicsIGVyclxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIC8vIHJldHVybiBmYWxzZSB0byBwcmV2ZW50IGF1dG8tc2h1dGRvd25cbiAgb25fc2h1dGRvd24oZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgLy8gY29uc3Qge21zZywgcGt0fSA9IGV4dHJhXG4gICAgY29uc29sZS5lcnJvciBAIGBFTkRQT0lOVCBTSFVURE9XTjogJHtlcnIubWVzc2FnZX1gXG5cbiAgc3ViY2xhc3MoY2xhc3NlcykgOjpcbiAgICAvL2NvbnN0IHtFbmRwb2ludCwgU2luaywgTXNnQ3R4LCBwcm90b2NvbHN9ID0gY2xhc3Nlc1xuICAgIHJldHVybiBjbGFzc2VzXG5cbiAganNvbl9wYWNrOiBKU09OLnN0cmluZ2lmeVxuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpIC8vIExSVU1hcCwgSGFzaGJlbHRNYXBcblxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihwbHVnaW5fb3B0aW9ucykgOjpcbiAgcGx1Z2luX29wdGlvbnMgPSBPYmplY3QuYXNzaWduIEAge30sIGRlZmF1bHRfcGx1Z2luX29wdGlvbnMsIHBsdWdpbl9vcHRpb25zXG4gIGNvbnN0IEB7fVxuICAgIHBsdWdpbl9uYW1lLCByYW5kb21faWQsIGpzb25fcGFja1xuICAgIG9uX21zZzogZGVmYXVsdF9vbl9tc2dcbiAgICBvbl9lcnJvcjogZGVmYXVsdF9vbl9lcnJvclxuICAgIG9uX3NodXRkb3duOiBkZWZhdWx0X29uX3NodXRkb3duXG4gICAgY3JlYXRlTWFwXG4gID0gcGx1Z2luX29wdGlvbnNcblxuICBpZiBwbHVnaW5fb3B0aW9ucy5lcF9raW5kcyA6OlxuICAgIE9iamVjdC5hc3NpZ24gQCBlcF9wcm90bywgcGx1Z2luX29wdGlvbnMuZXBfa2luZHNcblxuICByZXR1cm4gQDogb3JkZXI6IDEsIHN1YmNsYXNzLCBwb3N0XG4gIFxuICBmdW5jdGlvbiBzdWJjbGFzcyhGYWJyaWNIdWJfUEksIGJhc2VzKSA6OlxuICAgIGNvbnN0IHtwYWNrZXRQYXJzZXJ9ID0gRmFicmljSHViX1BJLnByb3RvdHlwZVxuICAgIGlmIG51bGw9PXBhY2tldFBhcnNlciB8fCAhIHBhY2tldFBhcnNlci5pc1BhY2tldFBhcnNlcigpIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEludmFsaWQgcGFja2V0UGFyc2VyIGZvciBwbHVnaW5gXG4gICAgXG4gICAgRmFicmljSHViX1BJLnByb3RvdHlwZVtwbHVnaW5fbmFtZV0gPVxuICAgICAgYmluZEVuZHBvaW50QXBpIEAgcGFja2V0UGFyc2VyXG5cbiAgZnVuY3Rpb24gcG9zdChodWIpIDo6XG4gICAgcmV0dXJuIGh1YltwbHVnaW5fbmFtZV0gPSBodWJbcGx1Z2luX25hbWVdKGh1YilcblxuICBmdW5jdGlvbiBiaW5kRW5kcG9pbnRBcGkocGFja2V0UGFyc2VyKSA6OlxuICAgIGNvbnN0IHByb3RvY29scyA9IGluaXRfcHJvdG9jb2wgQCBwYWNrZXRQYXJzZXIsIEB7fSByYW5kb21faWQsIGpzb25fcGFja1xuXG4gICAgY29uc3Qge0VuZHBvaW50LCBTaW5rLCBNc2dDdHg6IE1zZ0N0eF9waX0gPVxuICAgICAgcGx1Z2luX29wdGlvbnMuc3ViY2xhc3MgQDogcHJvdG9jb2xzXG4gICAgICAgIFNpbms6IFNpbmtCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIE1zZ0N0eDogTXNnQ3R4QmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgICAgICBFbmRwb2ludDogRW5kcG9pbnRCYXNlLnN1YmNsYXNzKHtjcmVhdGVNYXB9KVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGh1YikgOjpcbiAgICAgIGNvbnN0IGNoYW5uZWwgPSBodWIuY29ubmVjdF9zZWxmKClcbiAgICAgIGNvbnN0IE1zZ0N0eCA9IE1zZ0N0eF9waS5mb3JIdWIoaHViLCBjaGFubmVsKVxuXG4gICAgICBPYmplY3Quc2V0UHJvdG90eXBlT2YgQCBlbmRwb2ludCwgZXBfcHJvdG9cbiAgICAgIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQHt9IGVuZHBvaW50LCBjcmVhdGUsIE1zZ0N0eFxuICAgICAgcmV0dXJuIGVuZHBvaW50XG5cblxuICAgICAgZnVuY3Rpb24gZW5kcG9pbnQob25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgdGFyZ2V0cyA9IGh1Yi5yb3V0ZXIudGFyZ2V0c1xuICAgICAgICBkbyB2YXIgaWRfdGFyZ2V0ID0gcmFuZG9tX2lkKClcbiAgICAgICAgd2hpbGUgdGFyZ2V0cy5oYXMgQCBpZF90YXJnZXRcbiAgICAgICAgcmV0dXJuIGNyZWF0ZSBAIGlkX3RhcmdldCwgb25faW5pdFxuXG4gICAgICBmdW5jdGlvbiBjcmVhdGUoaWRfdGFyZ2V0LCBvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCBoYW5kbGVycyA9IE9iamVjdC5jcmVhdGUobnVsbClcbiAgICAgICAgY29uc3QgaWQgPSBAe30gaWRfdGFyZ2V0LCBpZF9yb3V0ZXI6IGh1Yi5yb3V0ZXIuaWRfc2VsZlxuICAgICAgICBjb25zdCBtc2dfY3R4ID0gbmV3IE1zZ0N0eCBAIGlkXG4gICAgICAgIGNvbnN0IGVwID0gbmV3IEVuZHBvaW50IEAgaWQsIG1zZ19jdHhcblxuICAgICAgICBjb25zdCByZWFkeSA9IFByb21pc2VcbiAgICAgICAgICAucmVzb2x2ZSBAXG4gICAgICAgICAgICAnZnVuY3Rpb24nID09PSB0eXBlb2Ygb25faW5pdFxuICAgICAgICAgICAgICA/IG9uX2luaXQoZXAsIGh1YilcbiAgICAgICAgICAgICAgOiBvbl9pbml0XG4gICAgICAgICAgLnRoZW4gQCBfYWZ0ZXJfaW5pdFxuXG4gICAgICAgIC8vIEFsbG93IGZvciBib3RoIGludGVybmFsIGFuZCBleHRlcm5hbCBlcnJvciBoYW5kbGluZyBieSBmb3JraW5nIHJlYWR5LmNhdGNoXG4gICAgICAgIHJlYWR5LmNhdGNoIEAgZXJyID0+IGhhbmRsZXJzLm9uX2Vycm9yIEAgZXJyLCBAe30gem9uZTonb25fcmVhZHknXG5cbiAgICAgICAgOjpcbiAgICAgICAgICBjb25zdCBlcF90Z3QgPSBlcC5lcF9zZWxmKClcbiAgICAgICAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBlcF90Z3QsIEB7fVxuICAgICAgICAgICAgcmVhZHk6IEB7fSB2YWx1ZTogcmVhZHkudGhlbiBAICgpID0+IGVwX3RndFxuXG5cbiAgICAgICAgZnVuY3Rpb24gX2FmdGVyX2luaXQodGFyZ2V0KSA6OlxuICAgICAgICAgIGlmIG51bGwgPT0gdGFyZ2V0IDo6XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIGVuZHBvaW50IGluaXQgdG8gcmV0dXJuIGEgY2xvc3VyZSBvciBpbnRlcmZhY2VgXG5cbiAgICAgICAgICBoYW5kbGVycy5vbl9tc2cgPSAodGFyZ2V0Lm9uX21zZyB8fCAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIHRhcmdldCA/IHRhcmdldCA6IGRlZmF1bHRfb25fbXNnKSkuYmluZCh0YXJnZXQpXG4gICAgICAgICAgaGFuZGxlcnMub25fZXJyb3IgPSAodGFyZ2V0Lm9uX2Vycm9yIHx8IGRlZmF1bHRfb25fZXJyb3IpLmJpbmQodGFyZ2V0LCBlcClcbiAgICAgICAgICBoYW5kbGVycy5vbl9zaHV0ZG93biA9ICh0YXJnZXQub25fc2h1dGRvd24gfHwgZGVmYXVsdF9vbl9zaHV0ZG93bikuYmluZCh0YXJnZXQsIGVwKVxuXG4gICAgICAgICAgbmV3IFNpbmsoKS5yZWdpc3RlciBAIGVwLCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnNcblxuICAgICAgICAgIHJldHVybiB0YXJnZXQub25fcmVhZHkgPyB0YXJnZXQub25fcmVhZHkoZXAsIGh1YikgOiB0YXJnZXRcblxuXG4iLCJpbXBvcnQge3JhbmRvbUJ5dGVzfSBmcm9tICdjcnlwdG8nXG5pbXBvcnQgZW5kcG9pbnRfcGx1Z2luIGZyb20gJy4vcGx1Z2luLmpzeSdcblxuZW5kcG9pbnRfbm9kZWpzLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuZnVuY3Rpb24gcmFuZG9tX2lkKCkgOjpcbiAgcmV0dXJuIHJhbmRvbUJ5dGVzKDQpLnJlYWRJbnQzMkxFKClcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gZW5kcG9pbnRfbm9kZWpzKHBsdWdpbl9vcHRpb25zPXt9KSA6OlxuICBpZiBudWxsID09IHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA6OlxuICAgIHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuXG4gIHJldHVybiBlbmRwb2ludF9wbHVnaW4ocGx1Z2luX29wdGlvbnMpXG5cbiJdLCJuYW1lcyI6WyJlcF9wcm90byIsIk9iamVjdCIsImNyZWF0ZSIsImdldFByb3RvdHlwZU9mIiwiYWRkX2VwX2tpbmQiLCJraW5kcyIsImFzc2lnbiIsImFwaSIsInRhcmdldCIsImNsaWVudEVuZHBvaW50IiwiZW5kcG9pbnQiLCJkb25lIiwiYXJncyIsImxlbmd0aCIsIm1zZ19jdHgiLCJNc2dDdHgiLCJ0byIsImVwX2NsaWVudF9hcGkiLCJvbl9yZWFkeSIsImVwIiwiaHViIiwiX3Jlc29sdmUiLCJvbl9jbGllbnRfcmVhZHkiLCJzaHV0ZG93biIsImVyciIsIl9yZWplY3QiLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsImFzQVBJRW5kcG9pbnQiLCJpbnZva2UiLCJhc19ycGMiLCJvbl9tc2ciLCJtc2ciLCJzZW5kZXIiLCJhcGlfZm9yX29wIiwib3AiLCJyZXNvbHZlX2ZuIiwiaW52b2tlX2ZuIiwia3ciLCJmbiIsInVuZGVmaW5lZCIsIm1hdGNoIiwic2VuZCIsImVycl9mcm9tIiwibWVzc2FnZSIsImNvZGUiLCJjYiIsImFuc3dlciIsImVycm9yIiwicmVwbHlFeHBlY3RlZCIsIm9uX2luaXQiLCJsaXR0bGVfZW5kaWFuIiwiY19zaW5nbGUiLCJjX2RhdGFncmFtIiwiY19kaXJlY3QiLCJjX211bHRpcGFydCIsImNfc3RyZWFtaW5nIiwiX2Vycl9tc2dpZF9yZXF1aXJlZCIsIl9lcnJfdG9rZW5fcmVxdWlyZWQiLCJmcm1fcm91dGluZyIsInNpemUiLCJiaXRzIiwibWFzayIsIm9iaiIsImZyb21faWQiLCJkdiIsIm9mZnNldCIsInNldEludDMyIiwiaWRfcm91dGVyIiwiaWRfdGFyZ2V0IiwiZ2V0SW50MzIiLCJmcm1fcmVzcG9uc2UiLCJtc2dpZCIsIkVycm9yIiwic2V0SW50MTYiLCJzZXFfYWNrIiwiYWNrX2ZsYWdzIiwidG9rZW4iLCJnZXRJbnQxNiIsImZybV9kYXRhZ3JhbSIsInRyYW5zcG9ydCIsImZybV9kaXJlY3QiLCJmcm1fbXVsdGlwYXJ0Iiwic2VxX3BvcyIsInNlcSIsInNlcV9mbGFncyIsImZybV9zdHJlYW1pbmciLCJiaW5kX3NlcV9uZXh0Iiwic2VxX29mZnNldCIsInNlcV9uZXh0IiwiZmxhZ3MiLCJmaW4iLCJOYU4iLCJjb21wb3NlRnJhbWluZ3MiLCJmcm1fZnJvbSIsImZybV9yZXNwIiwiZnJtX3RyYW5zcG9ydHMiLCJieUJpdHMiLCJ0X2Zyb20iLCJmX3Rlc3QiLCJ0X3Jlc3AiLCJ0MCIsInQxIiwidDIiLCJ0MyIsIm1hcCIsImYiLCJ0ZXN0Qml0cyIsImNob29zZSIsImxzdCIsIlQiLCJiIiwiZm5fa2V5IiwiZm5fdHJhbiIsImZuX2Zyb20iLCJmbl9yZXNwIiwiZnJtIiwiYmluZEFzc2VtYmxlZCIsImZfcGFjayIsImZfdW5wYWNrIiwicGFjayIsInVucGFjayIsInBrdF90eXBlIiwicGt0X29iaiIsIlR5cGVFcnJvciIsInR5cGUiLCJEYXRhVmlldyIsIkFycmF5QnVmZmVyIiwiaGVhZGVyIiwiYnVmZmVyIiwic2xpY2UiLCJwa3QiLCJidWYiLCJoZWFkZXJfYnVmZmVyIiwiVWludDhBcnJheSIsImluZm8iLCJfYmluZF9pdGVyYWJsZSIsImJ1Zl9jbG9uZSIsInR0bCIsIm5leHQiLCJvcHRpb25zIiwidmFsdWUiLCJwYWNrZXRQYXJzZXIiLCJmcmFnbWVudF9zaXplIiwiY29uY2F0QnVmZmVycyIsInBhY2tQYWNrZXRPYmoiLCJwYWNrX3V0ZjgiLCJ1bnBhY2tfdXRmOCIsIk51bWJlciIsInJhbmRvbV9pZCIsImpzb25fcGFjayIsImNyZWF0ZVN0cmVhbSIsInBhY2tldEZyYWdtZW50cyIsImNyZWF0ZU11bHRpcGFydCIsInNpbmsiLCJwYXJ0cyIsImZlZWQiLCJib2R5X2J1ZmZlciIsImluY2x1ZGVzIiwiZGVsZXRlU3RhdGVGb3IiLCJyZXMiLCJyZWN2RGF0YSIsInJzdHJlYW0iLCJzdGF0ZSIsImZlZWRfaW5pdCIsImFzX2NvbnRlbnQiLCJmZWVkX2lnbm9yZSIsImpzb25fdW5wYWNrIiwiYm9keV91dGY4IiwicmVjdlN0cmVhbSIsInJlY3ZTdHJlYW1EYXRhIiwiYmluZCIsIm9uX2Vycm9yIiwiZmVlZF9ib2R5IiwiZGF0YSIsIm9uX2RhdGEiLCJvbl9lbmQiLCJmZWVkX3NlcSIsIm5leHRfaGRyIiwiaSIsImxhc3RJbm5lciIsImJ5dGVMZW5ndGgiLCJpMCIsImJvZHkiLCJiaW5kVHJhbnNwb3J0SW1wbHMiLCJpbmJvdW5kIiwiaGlnaGJpdHMiLCJ0cmFuc3BvcnRzIiwib3V0Ym91bmQiLCJmcmFtaW5ncyIsImZyYW1lIiwiaW1wbCIsInRfcmVjdiIsInBhY2tfaGRyIiwicmVjdl9tc2ciLCJiaW5kVHJhbnNwb3J0cyIsInBhY2tCb2R5Iiwic3RyZWFtaW5nIiwic3RyZWFtIiwiYmluZF9zdHJlYW0iLCJtb2RlIiwiY2hhbiIsIm1zZW5kIiwibXNlbmRfYnl0ZXMiLCJtc2VuZF9vYmplY3RzIiwibXNlbmRfaW1wbCIsIm9iamVjdCIsImJ5dGVzIiwid3JpdGUiLCJlbmQiLCJjaHVuayIsImNoZWNrX2ZucyIsImtleXMiLCJrZXkiLCJqc29uX3Byb3RvY29sIiwic2hhcmVkIiwiZGF0YWdyYW0iLCJkaXJlY3QiLCJyZWN2TXNnIiwic3RhdGVGb3IiLCJib2R5X2J1ZiIsInVucGFja0JvZHkiLCJiaW5hcnlfcHJvdG9jb2wiLCJhc0J1ZmZlciIsInBrdF9idWZmZXIiLCJjb250cm9sX3Byb3RvY29sIiwiaGlnaCIsInBpbmdfZnJhbWUiLCJwb25nX2ZyYW1lIiwicG9uZ190eXBlIiwicmVjdl9wb25nIiwicGluZ190eXBlIiwicmVjdl9waW5nIiwicGluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJ0czAiLCJEYXRlIiwicm91dGVyIiwiYm9keV9qc29uIiwicmVjdkN0cmwiLCJfc2VuZF9wb25nIiwicGt0X3BpbmciLCJyX2lkIiwidHMxIiwiZGlzcGF0Y2giLCJpbml0X3Byb3RvY29sIiwic2hhcmVkX3Byb3RvIiwianNvbiIsImpzb25fcHJvdG8iLCJiaW5hcnkiLCJiaW5hcnlfcHJvdG8iLCJjb250cm9sIiwiY29udHJvbF9wcm90byIsImNvZGVjcyIsImRlZmF1bHQiLCJTaW5rIiwiZm9yUHJvdG9jb2xzIiwicHJvdG90eXBlIiwiX3Byb3RvY29sIiwiaGFuZGxlcnMiLCJ1bnJlZ2lzdGVyIiwidW5yZWdpc3RlclRhcmdldCIsInJlZ2lzdGVyVGFyZ2V0IiwiX2JpbmREaXNwYXRjaCIsIm9uX3NodXRkb3duIiwiYWxpdmUiLCJwcm90b2NvbCIsImlzQWxpdmUiLCJleHRyYSIsImJpbmRTaW5rIiwiem9uZSIsInRlcm1pbmF0ZSIsImlmQWJzZW50IiwiZW50cnkiLCJieV9tc2dpZCIsImdldCIsInNldCIsImRlbGV0ZSIsIkVQVGFyZ2V0IiwiaWQiLCJlcF9lbmNvZGUiLCJhc19qc29uX3VucGFjayIsIm1zZ19jdHhfdG8iLCJ4Zm9ybUJ5S2V5IiwidiIsImZyb21fY3R4IiwiZXBfZGVjb2RlIiwianNvbl91bnBhY2tfeGZvcm0iLCJhc0VuZHBvaW50SWQiLCJlcF90Z3QiLCJmYXN0IiwiaW5pdCIsImZhc3RfanNvbiIsImRlZmluZVByb3BlcnRpZXMiLCJxdWVyeSIsInNpbXBsZSIsInIiLCJ0IiwidG9TdHJpbmciLCJzcGxpdCIsInBhcnNlSW50Iiwic3oiLCJwYXJzZSIsInJldml2ZXIiLCJyZWciLCJXZWFrTWFwIiwieGZuIiwidmZuIiwid2l0aENvZGVjcyIsImZvckh1YiIsImNoYW5uZWwiLCJzZW5kUmF3IiwiY2hhbl9zZW5kIiwiZnJlZXplIiwiY3R4IiwiX2ludm9rZV9leCIsIl9tc2dDb2RlY3MiLCJfY29kZWMiLCJyZXBseSIsImZuT3JLZXkiLCJhc3NlcnRNb25pdG9yIiwidGhlbiIsInBfc2VudCIsImluaXRSZXBseSIsInRndCIsInNlbGYiLCJjbG9uZSIsInJlcGx5X2lkIiwid2l0aCIsImNoZWNrTW9uaXRvciIsImFjdGl2ZSIsIm1vbml0b3IiLCJpbml0TW9uaXRvciIsInRzX2R1cmF0aW9uIiwidHNfYWN0aXZlIiwicHJvbWlzZSIsInRkIiwidGlkIiwidHNfaW50ZXJ2YWwiLCJjdHJsIiwiY29kZWMiLCJjaGVja1BpbmciLCJzZXRJbnRlcnZhbCIsInVucmVmIiwiY2xlYXIiLCJjbGVhckludGVydmFsIiwibXNnX2NvZGVjIiwibXNnQ29kZWNzIiwibmFtZSIsImVudHJpZXMiLCJqc29uX3NlbmQiLCJwX3JlcGx5IiwidGltZW91dCIsIlJlcGx5VGltZW91dCIsInNldFRpbWVvdXQiLCJtc190aW1lb3V0IiwiRW5kcG9pbnQiLCJzdWJjbGFzcyIsImV4dGVuc2lvbnMiLCJlcF9zZWxmIiwidG9KU09OIiwid2l0aEVuZHBvaW50IiwiTWFwIiwiY3JlYXRlTWFwIiwiYnlfdG9rZW4iLCJjcmVhdGVSZXBseU1hcCIsImJ5X3RyYWZmaWMiLCJjcmVhdGVUcmFmZmljTWFwIiwidHJhZmZpYyIsInRzIiwibm93IiwicmVjdlRyYWZmaWMiLCJjcmVhdGVTdGF0ZU1hcCIsInJtc2ciLCJpc19yZXBseSIsImFzX3NlbmRlciIsIndhcm4iLCJpbml0UmVwbHlQcm9taXNlIiwiY2F0Y2giLCJ3aXRoUmVqZWN0VGltZW91dCIsImRlZmF1bHRfcGx1Z2luX29wdGlvbnMiLCJjbGFzc2VzIiwicGx1Z2luX29wdGlvbnMiLCJkZWZhdWx0X29uX21zZyIsImRlZmF1bHRfb25fZXJyb3IiLCJkZWZhdWx0X29uX3NodXRkb3duIiwiZXBfa2luZHMiLCJvcmRlciIsInBvc3QiLCJGYWJyaWNIdWJfUEkiLCJiYXNlcyIsImlzUGFja2V0UGFyc2VyIiwicGx1Z2luX25hbWUiLCJiaW5kRW5kcG9pbnRBcGkiLCJwcm90b2NvbHMiLCJNc2dDdHhfcGkiLCJTaW5rQmFzZSIsIk1zZ0N0eEJhc2UiLCJFbmRwb2ludEJhc2UiLCJjb25uZWN0X3NlbGYiLCJzZXRQcm90b3R5cGVPZiIsInRhcmdldHMiLCJoYXMiLCJpZF9zZWxmIiwicmVhZHkiLCJfYWZ0ZXJfaW5pdCIsInJlZ2lzdGVyIiwiZW5kcG9pbnRfbm9kZWpzIiwicmFuZG9tQnl0ZXMiLCJyZWFkSW50MzJMRSIsImVuZHBvaW50X3BsdWdpbiJdLCJtYXBwaW5ncyI6Ijs7QUFBTyxNQUFNQSxhQUFXQyxPQUFPQyxNQUFQLENBQWdCRCxPQUFPRSxjQUFQLENBQXdCLFlBQVUsRUFBbEMsQ0FBaEIsQ0FBakI7QUFDUCxBQUFPLFNBQVNDLFdBQVQsQ0FBcUJDLEtBQXJCLEVBQTRCO1NBQzFCQyxNQUFQLENBQWdCTixVQUFoQixFQUEwQkssS0FBMUI7OztBQ0FGRCxZQUFjO2lCQUNHRyxHQUFmLEVBQW9CO1VBQ1pDLFNBQVNDLGVBQWVGLEdBQWYsQ0FBZjtTQUNLRyxRQUFMLENBQWdCRixNQUFoQjtXQUNPQSxPQUFPRyxJQUFkO0dBSlU7O1NBTUwsR0FBR0MsSUFBVixFQUFnQjtRQUNY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

'use strict';

var crypto = require('crypto');

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
  return crypto.randomBytes(4).readInt32LE();
}

function endpoint_nodejs(plugin_options = {}) {
  if (null == plugin_options.random_id) {
    plugin_options.random_id = random_id;
  }

  return endpoint_plugin(plugin_options);
}

module.exports = endpoint_nodejs;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZWpzLmpzIiwic291cmNlcyI6WyIuLi9jb2RlL2VwX2tpbmRzL2V4dGVuc2lvbnMuanN5IiwiLi4vY29kZS9lcF9raW5kcy9jbGllbnQuanN5IiwiLi4vY29kZS9lcF9raW5kcy9hcGkuanN5IiwiLi4vY29kZS9lcF9raW5kcy9pbmRleC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2ZyYW1pbmcuanN5IiwiLi4vY29kZS9wcm90b2NvbC9zaGFyZWQuanN5IiwiLi4vY29kZS9wcm90b2NvbC9qc29uLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvYmluYXJ5LmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvY29udHJvbC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2luZGV4LmpzeSIsIi4uL2NvZGUvc2luay5qc3kiLCIuLi9jb2RlL2VwX3RhcmdldC5qc3kiLCIuLi9jb2RlL21zZ2N0eC5qc3kiLCIuLi9jb2RlL2VuZHBvaW50LmpzeSIsIi4uL2NvZGUvcGx1Z2luLmpzeSIsIi4uL2NvZGUvaW5kZXgubm9kZWpzLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgY29uc3QgZXBfcHJvdG8gPSBPYmplY3QuY3JlYXRlIEAgT2JqZWN0LmdldFByb3RvdHlwZU9mIEAgZnVuY3Rpb24oKXt9XG5leHBvcnQgZnVuY3Rpb24gYWRkX2VwX2tpbmQoa2luZHMpIDo6XG4gIE9iamVjdC5hc3NpZ24gQCBlcF9wcm90bywga2luZHNcbmV4cG9ydCBkZWZhdWx0IGFkZF9lcF9raW5kXG4iLCJpbXBvcnQgYWRkX2VwX2tpbmQgZnJvbSAnLi9leHRlbnNpb25zLmpzeSdcblxuYWRkX2VwX2tpbmQgQDpcbiAgY2xpZW50RW5kcG9pbnQoYXBpKSA6OlxuICAgIGNvbnN0IHRhcmdldCA9IGNsaWVudEVuZHBvaW50KGFwaSlcbiAgICB0aGlzLmVuZHBvaW50IEAgdGFyZ2V0XG4gICAgcmV0dXJuIHRhcmdldC5kb25lXG5cbiAgY2xpZW50KC4uLmFyZ3MpIDo6XG4gICAgaWYgMSA9PT0gYXJncy5sZW5ndGggJiYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGFyZ3NbMF0gOjpcbiAgICAgIHJldHVybiB0aGlzLmNsaWVudEVuZHBvaW50IEAgYXJnc1swXVxuXG4gICAgY29uc3QgbXNnX2N0eCA9IG5ldyB0aGlzLk1zZ0N0eCgpXG4gICAgcmV0dXJuIDAgIT09IGFyZ3MubGVuZ3RoID8gbXNnX2N0eC50byguLi5hcmdzKSA6IG1zZ19jdHhcblxuXG5jb25zdCBlcF9jbGllbnRfYXBpID0gQHt9XG4gIGFzeW5jIG9uX3JlYWR5KGVwLCBodWIpIDo6XG4gICAgdGhpcy5fcmVzb2x2ZSBAIGF3YWl0IHRoaXMub25fY2xpZW50X3JlYWR5KGVwLCBodWIpXG4gICAgYXdhaXQgZXAuc2h1dGRvd24oKVxuICBvbl9zZW5kX2Vycm9yKGVwLCBlcnIpIDo6XG4gICAgdGhpcy5fcmVqZWN0KGVycilcbiAgb25fc2h1dGRvd24oZXAsIGVycikgOjpcbiAgICBlcnIgPyB0aGlzLl9yZWplY3QoZXJyKSA6IHRoaXMuX3Jlc29sdmUoKVxuXG5leHBvcnQgZnVuY3Rpb24gY2xpZW50RW5kcG9pbnQob25fY2xpZW50X3JlYWR5KSA6OlxuICBsZXQgdGFyZ2V0ID0gT2JqZWN0LmNyZWF0ZSBAIGVwX2NsaWVudF9hcGlcbiAgdGFyZ2V0Lm9uX2NsaWVudF9yZWFkeSA9IG9uX2NsaWVudF9yZWFkeVxuICB0YXJnZXQuZG9uZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICB0YXJnZXQuX3Jlc29sdmUgPSByZXNvbHZlXG4gICAgdGFyZ2V0Ll9yZWplY3QgPSByZWplY3RcbiAgcmV0dXJuIHRhcmdldFxuIiwiaW1wb3J0IGFkZF9lcF9raW5kIGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIGFwaShhcGkpIDo6IHJldHVybiB0aGlzLmVuZHBvaW50IEAgYXNBUElFbmRwb2ludChhcGkpXG5cbmV4cG9ydCBmdW5jdGlvbiBhc0FQSUVuZHBvaW50KGFwaSkgOjpcbiAgcmV0dXJuIChlcCwgaHViKSA9PiA6OlxuICAgIGNvbnN0IGludm9rZSA9IGFzX3JwYyhhcGksIGVwLCBodWIpXG4gICAgcmV0dXJuIG9uX21zZ1xuXG4gICAgYXN5bmMgZnVuY3Rpb24gb25fbXNnKHttc2csIHNlbmRlcn0pIDo6XG4gICAgICBhd2FpdCBpbnZva2UgQCBtc2csIHNlbmRlclxuXG5leHBvcnQgZnVuY3Rpb24gYXNfcnBjKGFwaSwgZXAsIGh1YikgOjpcbiAgY29uc3QgYXBpX2Zvcl9vcCA9ICdmdW5jdGlvbicgPT09IHR5cGVvZiBhcGlcbiAgICA/IG9wID0+IGFwaShvcCwgZXAsIGh1YilcbiAgICA6IG9wID0+IGFwaVtvcF1cblxuICByZXR1cm4gT2JqZWN0LmFzc2lnbiBAIGludm9rZSwgQHt9XG4gICAgaW52b2tlLCByZXNvbHZlX2ZuLCBpbnZva2VfZm4sIGFwaV9mb3Jfb3BcblxuICBhc3luYyBmdW5jdGlvbiBpbnZva2UobXNnLCBzZW5kZXIpIDo6XG4gICAgY29uc3Qge29wLCBrd30gPSBtc2dcbiAgICBjb25zdCBmbiA9IGF3YWl0IHJlc29sdmVfZm4gQCBvcCwgc2VuZGVyXG4gICAgaWYgdW5kZWZpbmVkICE9PSBmbiA6OlxuICAgICAgYXdhaXQgaW52b2tlX2ZuIEAgb3AsIHNlbmRlciwgKCkgPT4gZm4oa3cpXG5cbiAgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZV9mbihvcCwgc2VuZGVyKSA6OlxuICAgIGlmICdzdHJpbmcnICE9PSB0eXBlb2Ygb3AgfHwgISBvcFswXS5tYXRjaCgvW0EtWmEtel0vKSA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiBlcFxuICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6ICdJbnZhbGlkIG9wZXJhdGlvbicsIGNvZGU6IDQwMFxuXG4gICAgdHJ5IDo6XG4gICAgICBjb25zdCBmbiA9IGF3YWl0IGFwaV9mb3Jfb3Aob3ApXG4gICAgICBpZiAhIGZuIDo6XG4gICAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogZXBcbiAgICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6ICdVbmtub3duIG9wZXJhdGlvbicsIGNvZGU6IDQwNFxuICAgICAgcmV0dXJuIGZuXG4gICAgY2F0Y2ggZXJyIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgZXJyX2Zyb206IGVwXG4gICAgICAgIGVycm9yOiBAe30gbWVzc2FnZTogYEludmFsaWQgb3BlcmF0aW9uOiAke2Vyci5tZXNzYWdlfWAsIGNvZGU6IDUwMFxuXG4gIGFzeW5jIGZ1bmN0aW9uIGludm9rZV9mbihvcCwgc2VuZGVyLCBjYikgOjpcbiAgICB0cnkgOjpcbiAgICAgIHZhciBhbnN3ZXIgPSBhd2FpdCBjYigpXG4gICAgY2F0Y2ggZXJyIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgZXJyX2Zyb206IGVwLCBlcnJvcjogZXJyXG4gICAgICByZXR1cm4gZmFsc2VcblxuICAgIGlmIHNlbmRlci5yZXBseUV4cGVjdGVkIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgYW5zd2VyXG4gICAgcmV0dXJuIHRydWVcblxuIiwiaW1wb3J0IHthZGRfZXBfa2luZCwgZXBfcHJvdG99IGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIHNlcnZlcihvbl9pbml0KSA6OiByZXR1cm4gdGhpcy5lbmRwb2ludCBAIG9uX2luaXRcblxuZXhwb3J0ICogZnJvbSAnLi9jbGllbnQuanN5J1xuZXhwb3J0ICogZnJvbSAnLi9hcGkuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBlcF9wcm90b1xuIiwiY29uc3QgbGl0dGxlX2VuZGlhbiA9IHRydWVcbmNvbnN0IGNfc2luZ2xlID0gJ3NpbmdsZSdcbmNvbnN0IGNfZGF0YWdyYW0gPSAnZGF0YWdyYW0nXG5jb25zdCBjX2RpcmVjdCA9ICdkaXJlY3QnXG5jb25zdCBjX211bHRpcGFydCA9ICdtdWx0aXBhcnQnXG5jb25zdCBjX3N0cmVhbWluZyA9ICdzdHJlYW1pbmcnXG5cbmNvbnN0IF9lcnJfbXNnaWRfcmVxdWlyZWQgPSBgUmVzcG9uc2UgcmVxaXJlcyAnbXNnaWQnYFxuY29uc3QgX2Vycl90b2tlbl9yZXF1aXJlZCA9IGBUcmFuc3BvcnQgcmVxaXJlcyAndG9rZW4nYFxuXG5cbmZ1bmN0aW9uIGZybV9yb3V0aW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDEsIG1hc2sgPSAweDFcbiAgcmV0dXJuIEB7fVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBudWxsICE9IG9iai5mcm9tX2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgY29uc3Qge2Zyb21faWR9ID0gb2JqXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCAwfGZyb21faWQuaWRfcm91dGVyLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQzMiBAIDQrb2Zmc2V0LCAwfGZyb21faWQuaWRfdGFyZ2V0LCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCBmcm9tX2lkID0gdW5kZWZpbmVkID09PSBvYmouZnJvbV9pZFxuICAgICAgICA/IG9iai5mcm9tX2lkID0ge30gOiBvYmouZnJvbV9pZFxuICAgICAgZnJvbV9pZC5pZF9yb3V0ZXIgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBmcm9tX2lkLmlkX3RhcmdldCA9IGR2LmdldEludDMyIEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuZnVuY3Rpb24gZnJtX3Jlc3BvbnNlKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDIsIG1hc2sgPSAweDJcbiAgcmV0dXJuIEB7fVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBudWxsICE9IG9iai5tc2dpZCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLm1zZ2lkIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfbXNnaWRfcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai5tc2dpZCwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxX2FjaywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouYWNrX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudG9rZW4gPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2FjayA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5hY2tfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG5cblxuXG5mdW5jdGlvbiBmcm1fZGF0YWdyYW0oKSA6OlxuICBjb25zdCBzaXplID0gMCwgYml0cyA9IDB4MCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19kYXRhZ3JhbVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6XG4gICAgICBpZiBjX2RhdGFncmFtID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEgb2JqLnRva2VuID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGF0YWdyYW1cblxuZnVuY3Rpb24gZnJtX2RpcmVjdCgpIDo6XG4gIGNvbnN0IHNpemUgPSA0LCBiaXRzID0gMHg0LCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RpcmVjdFxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6XG4gICAgICBpZiBjX2RpcmVjdCA9PT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gYml0c1xuICAgICAgaWYgb2JqLnRyYW5zcG9ydCAmJiBjX3NpbmdsZSAhPT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gZmFsc2VcbiAgICAgIHJldHVybiAhISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX2RpcmVjdFxuXG5mdW5jdGlvbiBmcm1fbXVsdGlwYXJ0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDgsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfbXVsdGlwYXJ0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfbXVsdGlwYXJ0ID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6IC8vIHVzZSBzZXFfbmV4dFxuICAgICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwLCBsaXR0bGVfZW5kaWFuXG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19tdWx0aXBhcnRcblxuZnVuY3Rpb24gZnJtX3N0cmVhbWluZygpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHhjLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX3N0cmVhbWluZ1xuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBjX3N0cmVhbWluZyA9PT0gb2JqLnRyYW5zcG9ydCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgYmluZF9zZXFfbmV4dCwgc2VxX3BvczogNFxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cbiAgICAgIGlmIHRydWUgPT0gb2JqLnNlcSA6OlxuICAgICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwLCBsaXR0bGVfZW5kaWFuIC8vIHVzZSBzZXFfbmV4dFxuICAgICAgZWxzZSBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLnNlcV9mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkICAgICA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXEgICAgICAgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfc3RyZWFtaW5nXG5cblxuZnVuY3Rpb24gYmluZF9zZXFfbmV4dChvZmZzZXQpIDo6XG4gIGNvbnN0IHNlcV9vZmZzZXQgPSB0aGlzLnNlcV9wb3MgKyBvZmZzZXRcbiAgbGV0IHNlcSA9IDFcbiAgcmV0dXJuIGZ1bmN0aW9uIHNlcV9uZXh0KHtmbGFncywgZmlufSwgZHYpIDo6XG4gICAgaWYgISBmaW4gOjpcbiAgICAgIGR2LnNldEludDE2IEAgc2VxX29mZnNldCwgc2VxKyssIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgZWxzZSA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCAtc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDIrc2VxX29mZnNldCwgMHxmbGFncywgbGl0dGxlX2VuZGlhblxuICAgICAgc2VxID0gTmFOXG5cblxuXG5leHBvcnQgZGVmYXVsdCBjb21wb3NlRnJhbWluZ3MoKVxuZnVuY3Rpb24gY29tcG9zZUZyYW1pbmdzKCkgOjpcbiAgY29uc3QgZnJtX2Zyb20gPSBmcm1fcm91dGluZygpLCBmcm1fcmVzcCA9IGZybV9yZXNwb25zZSgpXG4gIGNvbnN0IGZybV90cmFuc3BvcnRzID0gQFtdIGZybV9kYXRhZ3JhbSgpLCBmcm1fZGlyZWN0KCksIGZybV9tdWx0aXBhcnQoKSwgZnJtX3N0cmVhbWluZygpXG5cbiAgaWYgOCAhPT0gZnJtX2Zyb20uc2l6ZSB8fCA4ICE9PSBmcm1fcmVzcC5zaXplIHx8IDQgIT0gZnJtX3RyYW5zcG9ydHMubGVuZ3RoIDo6XG4gICAgdGhyb3cgbmV3IEVycm9yIEAgYEZyYW1pbmcgU2l6ZSBjaGFuZ2VgXG5cbiAgY29uc3QgYnlCaXRzID0gW10sIG1hc2s9MHhmXG5cbiAgOjpcbiAgICBjb25zdCB0X2Zyb20gPSBmcm1fZnJvbS5mX3Rlc3QsIHRfcmVzcCA9IGZybV9yZXNwLmZfdGVzdFxuICAgIGNvbnN0IFt0MCx0MSx0Mix0M10gPSBmcm1fdHJhbnNwb3J0cy5tYXAgQCBmPT5mLmZfdGVzdFxuXG4gICAgY29uc3QgdGVzdEJpdHMgPSBieUJpdHMudGVzdEJpdHMgPSBvYmogPT5cbiAgICAgIDAgfCB0X2Zyb20ob2JqKSB8IHRfcmVzcChvYmopIHwgdDAob2JqKSB8IHQxKG9iaikgfCB0MihvYmopIHwgdDMob2JqKVxuXG4gICAgYnlCaXRzLmNob29zZSA9IGZ1bmN0aW9uIChvYmosIGxzdCkgOjpcbiAgICAgIGlmIG51bGwgPT0gbHN0IDo6IGxzdCA9IHRoaXMgfHwgYnlCaXRzXG4gICAgICByZXR1cm4gbHN0W3Rlc3RCaXRzKG9iaildXG5cblxuICBmb3IgY29uc3QgVCBvZiBmcm1fdHJhbnNwb3J0cyA6OlxuICAgIGNvbnN0IHtiaXRzOmIsIHNpemUsIHRyYW5zcG9ydH0gPSBUXG5cbiAgICBieUJpdHNbYnwwXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MCwgbWFzaywgc2l6ZTogc2l6ZSwgb3A6ICcnXG4gICAgYnlCaXRzW2J8MV0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDEsIG1hc2ssIHNpemU6IDggKyBzaXplLCBvcDogJ2YnXG4gICAgYnlCaXRzW2J8Ml0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDIsIG1hc2ssIHNpemU6IDggKyBzaXplLCBvcDogJ3InXG4gICAgYnlCaXRzW2J8M10gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDMsIG1hc2ssIHNpemU6IDE2ICsgc2l6ZSwgb3A6ICdmcidcblxuICAgIGZvciBjb25zdCBmbl9rZXkgb2YgWydmX3BhY2snLCAnZl91bnBhY2snXSA6OlxuICAgICAgY29uc3QgZm5fdHJhbiA9IFRbZm5fa2V5XSwgZm5fZnJvbSA9IGZybV9mcm9tW2ZuX2tleV0sIGZuX3Jlc3AgPSBmcm1fcmVzcFtmbl9rZXldXG5cbiAgICAgIGJ5Qml0c1tifDBdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl90cmFuKG9iaiwgZHYsIDApXG4gICAgICBieUJpdHNbYnwxXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fZnJvbShvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8Ml1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3Jlc3Aob2JqLCBkdiwgMCk7IGZuX3RyYW4ob2JqLCBkdiwgOClcbiAgICAgIGJ5Qml0c1tifDNdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl9yZXNwKG9iaiwgZHYsIDgpOyBmbl90cmFuKG9iaiwgZHYsIDE2KVxuXG4gIGZvciBjb25zdCBmcm0gb2YgYnlCaXRzIDo6XG4gICAgYmluZEFzc2VtYmxlZCBAIGZybVxuXG4gIHJldHVybiBieUJpdHNcblxuXG5mdW5jdGlvbiBiaW5kQXNzZW1ibGVkKGZybSkgOjpcbiAgY29uc3Qge1QsIHNpemUsIGZfcGFjaywgZl91bnBhY2t9ID0gZnJtXG4gIGlmIFQuYmluZF9zZXFfbmV4dCA6OlxuICAgIGZybS5zZXFfbmV4dCA9IFQuYmluZF9zZXFfbmV4dCBAIGZybS5zaXplIC0gVC5zaXplXG5cbiAgZGVsZXRlIGZybS5UXG4gIGZybS5wYWNrID0gcGFjayA7IGZybS51bnBhY2sgPSB1bnBhY2tcbiAgY29uc3Qgc2VxX25leHQgPSBmcm0uc2VxX25leHRcblxuICBmdW5jdGlvbiBwYWNrKHBrdF90eXBlLCBwa3Rfb2JqKSA6OlxuICAgIGlmICEgQCAwIDw9IHBrdF90eXBlICYmIHBrdF90eXBlIDw9IDI1NSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwa3RfdHlwZSB0byBiZSBbMC4uMjU1XWBcblxuICAgIHBrdF9vYmoudHlwZSA9IHBrdF90eXBlXG4gICAgaWYgc2VxX25leHQgJiYgbnVsbCA9PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgcGt0X29iai5zZXEgPSB0cnVlXG5cbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyBAIG5ldyBBcnJheUJ1ZmZlcihzaXplKVxuICAgIGZfcGFjayhwa3Rfb2JqLCBkdiwgMClcbiAgICBwa3Rfb2JqLmhlYWRlciA9IGR2LmJ1ZmZlclxuXG4gICAgaWYgdHJ1ZSA9PT0gcGt0X29iai5zZXEgOjpcbiAgICAgIF9iaW5kX2l0ZXJhYmxlIEAgcGt0X29iaiwgZHYuYnVmZmVyLnNsaWNlKDAsc2l6ZSlcblxuICBmdW5jdGlvbiB1bnBhY2socGt0KSA6OlxuICAgIGNvbnN0IGJ1ZiA9IHBrdC5oZWFkZXJfYnVmZmVyKClcbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyBAIG5ldyBVaW50OEFycmF5KGJ1ZikuYnVmZmVyXG5cbiAgICBjb25zdCBpbmZvID0ge31cbiAgICBmX3VucGFjayhpbmZvLCBkdiwgMClcbiAgICByZXR1cm4gcGt0LmluZm8gPSBpbmZvXG5cbiAgZnVuY3Rpb24gX2JpbmRfaXRlcmFibGUocGt0X29iaiwgYnVmX2Nsb25lKSA6OlxuICAgIGNvbnN0IHt0eXBlfSA9IHBrdF9vYmpcbiAgICBjb25zdCB7aWRfcm91dGVyLCBpZF90YXJnZXQsIHR0bCwgdG9rZW59ID0gcGt0X29ialxuICAgIHBrdF9vYmoubmV4dCA9IG5leHRcblxuICAgIGZ1bmN0aW9uIG5leHQob3B0aW9ucykgOjpcbiAgICAgIGlmIG51bGwgPT0gb3B0aW9ucyA6OiBvcHRpb25zID0ge31cbiAgICAgIGNvbnN0IGhlYWRlciA9IGJ1Zl9jbG9uZS5zbGljZSgpXG4gICAgICBzZXFfbmV4dCBAIG9wdGlvbnMsIG5ldyBEYXRhVmlldyBAIGhlYWRlclxuICAgICAgcmV0dXJuIEB7fSBkb25lOiAhISBvcHRpb25zLmZpbiwgdmFsdWU6IEB7fSAvLyBwa3Rfb2JqXG4gICAgICAgIGlkX3JvdXRlciwgaWRfdGFyZ2V0LCB0eXBlLCB0dGwsIHRva2VuLCBoZWFkZXJcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBhY2tldFBhcnNlciwgb3B0aW9ucywgZnJhZ21lbnRfc2l6ZSkgOjpcbiAgY29uc3Qge2NvbmNhdEJ1ZmZlcnMsIHBhY2tQYWNrZXRPYmosIHBhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gcGFja2V0UGFyc2VyXG4gIGZyYWdtZW50X3NpemUgPSBOdW1iZXIoZnJhZ21lbnRfc2l6ZSB8fCA4MDAwKVxuICBpZiAxMDI0ID4gZnJhZ21lbnRfc2l6ZSB8fCA2NTAwMCA8IGZyYWdtZW50X3NpemUgOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgSW52YWxpZCBmcmFnbWVudCBzaXplOiAke2ZyYWdtZW50X3NpemV9YFxuXG4gIGNvbnN0IHtyYW5kb21faWQsIGpzb25fcGFja30gPSBvcHRpb25zXG4gIHJldHVybiBAOiBwYWNrZXRQYXJzZXIsIHJhbmRvbV9pZCwganNvbl9wYWNrXG4gICAgY3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIHBhY2tldEZyYWdtZW50c1xuICAgIGJpbmRUcmFuc3BvcnRzXG5cblxuICBmdW5jdGlvbiBjcmVhdGVNdWx0aXBhcnQocGt0LCBzaW5rLCBtc2dpZCkgOjpcbiAgICBsZXQgcGFydHMgPSBbXSwgZmluID0gZmFsc2VcbiAgICByZXR1cm4gQHt9IGZlZWQsIGluZm86IHBrdC5pbmZvXG5cbiAgICBmdW5jdGlvbiBmZWVkKHBrdCkgOjpcbiAgICAgIGxldCBzZXEgPSBwa3QuaW5mby5zZXFcbiAgICAgIGlmIHNlcSA8IDAgOjogZmluID0gdHJ1ZTsgc2VxID0gLXNlcVxuICAgICAgcGFydHNbc2VxLTFdID0gcGt0LmJvZHlfYnVmZmVyKClcblxuICAgICAgaWYgISBmaW4gOjogcmV0dXJuXG4gICAgICBpZiBwYXJ0cy5pbmNsdWRlcyBAIHVuZGVmaW5lZCA6OiByZXR1cm5cblxuICAgICAgc2luay5kZWxldGVTdGF0ZUZvcihtc2dpZClcblxuICAgICAgY29uc3QgcmVzID0gY29uY2F0QnVmZmVycyhwYXJ0cylcbiAgICAgIHBhcnRzID0gbnVsbFxuICAgICAgcmV0dXJuIHJlc1xuXG4gIGZ1bmN0aW9uIGNyZWF0ZVN0cmVhbShwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBuZXh0PTAsIGZpbiA9IGZhbHNlLCByZWN2RGF0YSwgcnN0cmVhbVxuICAgIGNvbnN0IHN0YXRlID0gQHt9IGZlZWQ6IGZlZWRfaW5pdCwgaW5mbzogcGt0LmluZm9cbiAgICByZXR1cm4gc3RhdGVcblxuICAgIGZ1bmN0aW9uIGZlZWRfaW5pdChwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcblxuICAgICAgY29uc3QgaW5mbyA9IHBrdC5pbmZvXG4gICAgICBjb25zdCBtc2cgPSBzaW5rLmpzb25fdW5wYWNrIEAgcGt0LmJvZHlfdXRmOCgpXG4gICAgICByc3RyZWFtID0gc2luay5yZWN2U3RyZWFtKG1zZywgaW5mbylcbiAgICAgIGlmIG51bGwgPT0gcnN0cmVhbSA6OiByZXR1cm5cbiAgICAgIGNoZWNrX2ZucyBAIHJzdHJlYW0sICdvbl9lcnJvcicsICdvbl9kYXRhJywgJ29uX2VuZCcgXG4gICAgICByZWN2RGF0YSA9IHNpbmsucmVjdlN0cmVhbURhdGEuYmluZChzaW5rLCByc3RyZWFtLCBpbmZvKVxuXG4gICAgICB0cnkgOjpcbiAgICAgICAgZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfYm9keVxuICAgICAgaWYgcnN0cmVhbS5vbl9pbml0IDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2luaXQobXNnLCBwa3QpXG5cbiAgICBmdW5jdGlvbiBmZWVkX2JvZHkocGt0LCBhc19jb250ZW50KSA6OlxuICAgICAgcmVjdkRhdGEoKVxuICAgICAgbGV0IGRhdGFcbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICAgIGRhdGEgPSBhc19jb250ZW50KHBrdCwgc2luaylcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lcnJvciBAIGVyciwgcGt0XG5cbiAgICAgIGlmIGZpbiA6OlxuICAgICAgICBjb25zdCByZXMgPSByc3RyZWFtLm9uX2RhdGEgQCBkYXRhLCBwa3RcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZW5kIEAgcmVzLCBwa3RcbiAgICAgIGVsc2UgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuXG4gICAgZnVuY3Rpb24gZmVlZF9pZ25vcmUocGt0KSA6OlxuICAgICAgdHJ5IDo6IGZlZWRfc2VxKHBrdClcbiAgICAgIGNhdGNoIGVyciA6OlxuXG4gICAgZnVuY3Rpb24gZmVlZF9zZXEocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxID49IDAgOjpcbiAgICAgICAgaWYgbmV4dCsrID09PSBzZXEgOjpcbiAgICAgICAgICByZXR1cm4gLy8gaW4gb3JkZXJcbiAgICAgIGVsc2UgOjpcbiAgICAgICAgZmluID0gdHJ1ZVxuICAgICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuICAgICAgICBpZiBuZXh0ID09PSAtc2VxIDo6XG4gICAgICAgICAgbmV4dCA9ICdkb25lJ1xuICAgICAgICAgIHJldHVybiAvLyBpbi1vcmRlciwgbGFzdCBwYWNrZXRcblxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfaWdub3JlXG4gICAgICBuZXh0ID0gJ2ludmFsaWQnXG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgUGFja2V0IG91dCBvZiBzZXF1ZW5jZWBcblxuICBmdW5jdGlvbiAqIHBhY2tldEZyYWdtZW50cyhidWYsIG5leHRfaGRyLCBmaW4pIDo6XG4gICAgaWYgbnVsbCA9PSBidWYgOjpcbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKHtmaW59KVxuICAgICAgeWllbGQgb2JqXG4gICAgICByZXR1cm5cblxuICAgIGxldCBpID0gMCwgbGFzdElubmVyID0gYnVmLmJ5dGVMZW5ndGggLSBmcmFnbWVudF9zaXplO1xuICAgIHdoaWxlIGkgPCBsYXN0SW5uZXIgOjpcbiAgICAgIGNvbnN0IGkwID0gaVxuICAgICAgaSArPSBmcmFnbWVudF9zaXplXG5cbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKClcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkwLCBpKVxuICAgICAgeWllbGQgb2JqXG5cbiAgICA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICBvYmouYm9keSA9IGJ1Zi5zbGljZShpKVxuICAgICAgeWllbGQgb2JqXG5cblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRJbXBscyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cykgOjpcbiAgICBjb25zdCBvdXRib3VuZCA9IFtdXG4gICAgb3V0Ym91bmQuY2hvb3NlID0gZnJhbWluZ3MuY2hvb3NlXG5cbiAgICBmb3IgY29uc3QgZnJhbWUgb2YgZnJhbWluZ3MgOjpcbiAgICAgIGNvbnN0IGltcGwgPSBmcmFtZSA/IHRyYW5zcG9ydHNbZnJhbWUudHJhbnNwb3J0XSA6IG51bGxcbiAgICAgIGlmICEgaW1wbCA6OiBjb250aW51ZVxuXG4gICAgICBjb25zdCB7Yml0cywgcGFjaywgdW5wYWNrfSA9IGZyYW1lXG4gICAgICBjb25zdCBwa3RfdHlwZSA9IGhpZ2hiaXRzIHwgYml0c1xuICAgICAgY29uc3Qge3RfcmVjdn0gPSBpbXBsXG5cbiAgICAgIGZ1bmN0aW9uIHBhY2tfaGRyKG9iaikgOjpcbiAgICAgICAgcGFjayhwa3RfdHlwZSwgb2JqKVxuICAgICAgICByZXR1cm4gb2JqXG5cbiAgICAgIGZ1bmN0aW9uIHJlY3ZfbXNnKHBrdCwgc2luaykgOjpcbiAgICAgICAgdW5wYWNrKHBrdClcbiAgICAgICAgcmV0dXJuIHRfcmVjdihwa3QsIHNpbmspXG5cbiAgICAgIHBhY2tfaGRyLnBrdF90eXBlID0gcmVjdl9tc2cucGt0X3R5cGUgPSBwa3RfdHlwZVxuICAgICAgb3V0Ym91bmRbYml0c10gPSBwYWNrX2hkclxuICAgICAgaW5ib3VuZFtwa3RfdHlwZV0gPSByZWN2X21zZ1xuXG4gICAgICBpZiAncHJvZHVjdGlvbicgIT09IHByb2Nlc3MuZW52Lk5PREVfRU5WIDo6XG4gICAgICAgIGNvbnN0IG9wID0gcGFja19oZHIub3AgPSByZWN2X21zZy5vcCA9IGZyYW1lLm9wXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSBAIHBhY2tfaGRyLCAnbmFtZScsIEB7fSB2YWx1ZTogYHBhY2tfaGRyIMKrJHtvcH3Cu2BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcmVjdl9tc2csICduYW1lJywgQHt9IHZhbHVlOiBgcmVjdl9tc2cgwqske29wfcK7YFxuXG4gICAgcmV0dXJuIG91dGJvdW5kXG5cblxuICBmdW5jdGlvbiBiaW5kVHJhbnNwb3J0cyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cykgOjpcbiAgICBjb25zdCBwYWNrQm9keSA9IHRyYW5zcG9ydHMucGFja0JvZHlcbiAgICBjb25zdCBvdXRib3VuZCA9IGJpbmRUcmFuc3BvcnRJbXBscyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cylcbiAgICByZXR1cm4gdHJhbnNwb3J0cy5zdHJlYW1pbmdcbiAgICAgID8gQHt9IHNlbmQsIHN0cmVhbTogYmluZF9zdHJlYW0gQCB0cmFuc3BvcnRzLnN0cmVhbWluZy5tb2RlXG4gICAgICA6IEB7fSBzZW5kXG5cbiAgICBmdW5jdGlvbiBzZW5kKGNoYW4sIG9iaiwgYm9keSkgOjpcbiAgICAgIGJvZHkgPSBwYWNrQm9keShib2R5KVxuICAgICAgaWYgZnJhZ21lbnRfc2l6ZSA8IGJvZHkuYnl0ZUxlbmd0aCA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBvYmoudHJhbnNwb3J0ID0gJ211bHRpcGFydCdcbiAgICAgICAgY29uc3QgbXNlbmQgPSBtc2VuZF9ieXRlcyhjaGFuLCBvYmopXG4gICAgICAgIHJldHVybiBtc2VuZCBAIHRydWUsIGJvZHlcblxuICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzaW5nbGUnXG4gICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBwYWNrX2hkcihvYmopXG4gICAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gICAgZnVuY3Rpb24gbXNlbmRfYnl0ZXMoY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBsZXQge25leHR9ID0gcGFja19oZHIob2JqKVxuICAgICAgaWYgbnVsbCAhPT0gbXNnIDo6XG4gICAgICAgIG9iai5ib2R5ID0gbXNnXG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgY2hhbiBAIHBrdFxuXG4gICAgICByZXR1cm4gYXN5bmMgZnVuY3Rpb24gKGZpbiwgYm9keSkgOjpcbiAgICAgICAgaWYgbnVsbCA9PT0gbmV4dCA6OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvciBAICdXcml0ZSBhZnRlciBlbmQnXG4gICAgICAgIGxldCByZXNcbiAgICAgICAgZm9yIGNvbnN0IG9iaiBvZiBwYWNrZXRGcmFnbWVudHMgQCBib2R5LCBuZXh0LCBmaW4gOjpcbiAgICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgICAgcmVzID0gYXdhaXQgY2hhbiBAIHBrdFxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIHJlc1xuXG4gICAgZnVuY3Rpb24gbXNlbmRfb2JqZWN0cyhjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGxldCB7bmV4dH0gPSBwYWNrX2hkcihvYmopXG4gICAgICBpZiBudWxsICE9PSBtc2cgOjpcbiAgICAgICAgb2JqLmJvZHkgPSBtc2dcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBjaGFuIEAgcGt0XG5cbiAgICAgIHJldHVybiBmdW5jdGlvbiAoZmluLCBib2R5KSA6OlxuICAgICAgICBpZiBudWxsID09PSBuZXh0IDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgJ1dyaXRlIGFmdGVyIGVuZCdcbiAgICAgICAgY29uc3Qgb2JqID0gbmV4dCh7ZmlufSlcbiAgICAgICAgb2JqLmJvZHkgPSBib2R5XG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgaWYgZmluIDo6IG5leHQgPSBudWxsXG4gICAgICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgICBmdW5jdGlvbiBiaW5kX3N0cmVhbShtb2RlKSA6OlxuICAgICAgY29uc3QgbXNlbmRfaW1wbCA9IHtvYmplY3Q6IG1zZW5kX29iamVjdHMsIGJ5dGVzOiBtc2VuZF9ieXRlc31bbW9kZV1cbiAgICAgIGlmIG1zZW5kX2ltcGwgOjogcmV0dXJuIHN0cmVhbVxuXG4gICAgICBmdW5jdGlvbiBzdHJlYW0oY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIG9iai50cmFuc3BvcnQgPSAnc3RyZWFtaW5nJ1xuICAgICAgICBjb25zdCBtc2VuZCA9IG1zZW5kX2ltcGwgQCBjaGFuLCBvYmosIGpzb25fcGFjayhtc2cpXG4gICAgICAgIHdyaXRlLndyaXRlID0gd3JpdGU7IHdyaXRlLmVuZCA9IHdyaXRlLmJpbmQodHJ1ZSlcbiAgICAgICAgcmV0dXJuIHdyaXRlXG5cbiAgICAgICAgZnVuY3Rpb24gd3JpdGUoY2h1bmspIDo6XG4gICAgICAgICAgcmV0dXJuIGNodW5rICE9IG51bGxcbiAgICAgICAgICAgID8gbXNlbmQgQCB0cnVlPT09dGhpcywgcGFja0JvZHkoY2h1bmspXG4gICAgICAgICAgICA6IG1zZW5kIEAgdHJ1ZVxuXG5cbmZ1bmN0aW9uIGNoZWNrX2ZucyhvYmosIC4uLmtleXMpIDo6XG4gIGZvciBjb25zdCBrZXkgb2Yga2V5cyA6OlxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBvYmpba2V5XSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBcIiR7a2V5fVwiIHRvIGJlIGEgZnVuY3Rpb25gXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBqc29uX3Byb3RvY29sKHNoYXJlZCkgOjpcbiAgY29uc3Qge2NyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtLCBqc29uX3BhY2t9ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcblxuICByZXR1cm4gQHt9XG4gICAgcGFja0JvZHlcblxuICAgIGdldCBkYXRhZ3JhbSgpIDo6IHJldHVybiB0aGlzLmRpcmVjdFxuICAgIGRpcmVjdDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBtc2cgPSBzaW5rLmpzb25fdW5wYWNrIEAgcGt0LmJvZHlfdXRmOCgpIHx8IHVuZGVmaW5lZFxuICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBwa3QuaW5mb1xuXG4gICAgbXVsdGlwYXJ0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlTXVsdGlwYXJ0XG4gICAgICAgIGNvbnN0IGJvZHlfYnVmID0gc3RhdGUuZmVlZChwa3QpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gYm9keV9idWYgOjpcbiAgICAgICAgICBjb25zdCBtc2cgPSBzaW5rLmpzb25fdW5wYWNrIEAgdW5wYWNrX3V0ZjgoYm9keV9idWYpIHx8IHVuZGVmaW5lZFxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuICAgIHN0cmVhbWluZzogQHt9XG4gICAgICBtb2RlOiAnb2JqZWN0J1xuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVTdHJlYW1cbiAgICAgICAgcmV0dXJuIHN0YXRlLmZlZWQocGt0LCB1bnBhY2tCb2R5KVxuXG4gIGZ1bmN0aW9uIHBhY2tCb2R5KGJvZHkpIDo6XG4gICAgcmV0dXJuIHBhY2tfdXRmOCBAIGpzb25fcGFjayhib2R5KVxuXG4gIGZ1bmN0aW9uIHVucGFja0JvZHkocGt0LCBzaW5rKSA6OlxuICAgIHJldHVybiBzaW5rLmpzb25fdW5wYWNrIEAgcGt0LmJvZHlfdXRmOCgpXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBiaW5hcnlfcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW19ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgY29uc3Qge2FzQnVmZmVyfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgcmV0dXJuIEB7fVxuICAgIHBhY2tCb2R5OiBhc0J1ZmZlclxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHBrdC5ib2R5X2J1ZmZlcigpXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdieXRlcydcbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlU3RyZWFtXG4gICAgICAgIGNvbnN0IG1zZyA9IHN0YXRlLmZlZWQocGt0LCBwa3RfYnVmZmVyKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZyA6OlxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuZnVuY3Rpb24gcGt0X2J1ZmZlcihwa3QpIDo6IHJldHVybiBwa3QuYm9keV9idWZmZXIoKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gY29udHJvbF9wcm90b2NvbChpbmJvdW5kLCBoaWdoLCBzaGFyZWQpIDo6XG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrUGFja2V0T2JqfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcblxuICBjb25zdCBwaW5nX2ZyYW1lID0gZnJhbWluZ3MuY2hvb3NlIEA6IGZyb21faWQ6IHRydWUsIHRva2VuOiB0cnVlLCB0cmFuc3BvcnQ6ICdkaXJlY3QnXG4gIGNvbnN0IHBvbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgbXNnaWQ6IHRydWUsIHRyYW5zcG9ydDogJ2RhdGFncmFtJ1xuXG4gIGNvbnN0IHBvbmdfdHlwZSA9IGhpZ2h8MHhlXG4gIGluYm91bmRbcG9uZ190eXBlXSA9IHJlY3ZfcG9uZ1xuICBjb25zdCBwaW5nX3R5cGUgPSBoaWdofDB4ZlxuICBpbmJvdW5kW2hpZ2h8MHhmXSA9IHJlY3ZfcGluZ1xuXG4gIHJldHVybiBAe30gc2VuZDpwaW5nLCBwaW5nXG5cbiAgZnVuY3Rpb24gcGluZyhjaGFuLCBvYmopIDo6XG4gICAgaWYgISBvYmoudG9rZW4gOjpcbiAgICAgIG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgb2JqLmJvZHkgPSBKU09OLnN0cmluZ2lmeSBAOlxuICAgICAgb3A6ICdwaW5nJywgdHMwOiBuZXcgRGF0ZSgpXG4gICAgcGluZ19mcmFtZS5wYWNrKHBpbmdfdHlwZSwgb2JqKVxuICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gIGZ1bmN0aW9uIHJlY3ZfcGluZyhwa3QsIHNpbmssIHJvdXRlcikgOjpcbiAgICBwaW5nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICBfc2VuZF9wb25nIEAgcGt0LmJvZHksIHBrdCwgcm91dGVyXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4gIGZ1bmN0aW9uIF9zZW5kX3Bvbmcoe3RzMH0sIHBrdF9waW5nLCByb3V0ZXIpIDo6XG4gICAgY29uc3Qge21zZ2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgZnJvbV9pZDpyX2lkfSA9IHBrdF9waW5nLmluZm9cbiAgICBjb25zdCBvYmogPSBAe30gbXNnaWRcbiAgICAgIGZyb21faWQ6IEB7fSBpZF90YXJnZXQsIGlkX3JvdXRlclxuICAgICAgaWRfcm91dGVyOiByX2lkLmlkX3JvdXRlciwgaWRfdGFyZ2V0OiByX2lkLmlkX3RhcmdldFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkgQDpcbiAgICAgICAgb3A6ICdwb25nJywgdHMwLCB0czE6IG5ldyBEYXRlKClcblxuICAgIHBvbmdfZnJhbWUucGFjayhwb25nX3R5cGUsIG9iailcbiAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgcmV0dXJuIHJvdXRlci5kaXNwYXRjaCBAIFtwa3RdXG5cbiAgZnVuY3Rpb24gcmVjdl9wb25nKHBrdCwgc2luaykgOjpcbiAgICBwb25nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuaW1wb3J0IHNoYXJlZF9wcm90byBmcm9tICcuL3NoYXJlZC5qc3knXG5pbXBvcnQganNvbl9wcm90byBmcm9tICcuL2pzb24uanN5J1xuaW1wb3J0IGJpbmFyeV9wcm90byBmcm9tICcuL2JpbmFyeS5qc3knXG5pbXBvcnQgY29udHJvbF9wcm90byBmcm9tICcuL2NvbnRyb2wuanN5J1xuXG5leHBvcnQgKiBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBpbml0X3Byb3RvY29sKHBhY2tldFBhcnNlciwgb3B0aW9ucykgOjpcbiAgY29uc3Qgc2hhcmVkID0gc2hhcmVkX3Byb3RvIEAgcGFja2V0UGFyc2VyLCBvcHRpb25zXG5cbiAgY29uc3QgaW5ib3VuZCA9IFtdXG4gIGNvbnN0IGpzb24gPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgwMCAvLyAweDAqIOKAlCBKU09OIGJvZHlcbiAgICBqc29uX3Byb3RvKHNoYXJlZClcblxuICBjb25zdCBiaW5hcnkgPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgxMCAvLyAweDEqIOKAlCBiaW5hcnkgYm9keVxuICAgIGJpbmFyeV9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgY29udHJvbCA9IGNvbnRyb2xfcHJvdG8gQCBpbmJvdW5kLFxuICAgIDB4ZjAgLy8gMHhmKiDigJQgY29udHJvbFxuICAgIHNoYXJlZFxuXG4gIGNvbnN0IGNvZGVjcyA9IEA6IGpzb24sIGJpbmFyeSwgY29udHJvbCwgZGVmYXVsdDoganNvblxuXG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIHJldHVybiBAOiBpbmJvdW5kLCBjb2RlY3MsIHJhbmRvbV9pZFxuXG5cbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIFNpbmsgOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7aW5ib3VuZH0pIDo6XG4gICAgY2xhc3MgU2luayBleHRlbmRzIHRoaXMgOjpcbiAgICBTaW5rLnByb3RvdHlwZS5fcHJvdG9jb2wgPSBpbmJvdW5kXG4gICAgcmV0dXJuIFNpbmtcblxuICByZWdpc3RlcihlbmRwb2ludCwgaHViLCBpZF90YXJnZXQsIGhhbmRsZXJzKSA6OlxuICAgIGNvbnN0IHVucmVnaXN0ZXIgPSAoKSA9PiBodWIucm91dGVyLnVucmVnaXN0ZXJUYXJnZXQoaWRfdGFyZ2V0KVxuXG4gICAgaHViLnJvdXRlci5yZWdpc3RlclRhcmdldCBAIGlkX3RhcmdldCxcbiAgICAgIHRoaXMuX2JpbmREaXNwYXRjaCBAIGVuZHBvaW50LCB1bnJlZ2lzdGVyLCBoYW5kbGVyc1xuICAgIHJldHVybiB0aGlzXG5cbiAgX2JpbmREaXNwYXRjaChlbmRwb2ludCwgdW5yZWdpc3Rlciwge29uX21zZywgb25fZXJyb3IsIG9uX3NodXRkb3dufSkgOjpcbiAgICBsZXQgYWxpdmUgPSB0cnVlXG4gICAgY29uc3QgcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbFxuICAgIGNvbnN0IGlzQWxpdmUgPSAoKSA9PiBhbGl2ZVxuICAgIGNvbnN0IHNodXRkb3duID0gKGVyciwgZXh0cmEpID0+IDo6XG4gICAgICBpZiBhbGl2ZSA6OlxuICAgICAgICB1bnJlZ2lzdGVyKCk7IHVucmVnaXN0ZXIgPSBhbGl2ZSA9IGZhbHNlXG4gICAgICAgIG9uX3NodXRkb3duKGVyciwgZXh0cmEpXG5cbiAgICBPYmplY3QuYXNzaWduIEAgdGhpcywgZW5kcG9pbnQuYmluZFNpbmsodGhpcyksIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuICAgIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG5cbiAgICByZXR1cm4gYXN5bmMgKHBrdCwgcm91dGVyKSA9PiA6OlxuICAgICAgaWYgZmFsc2U9PT1hbGl2ZSB8fCBudWxsPT1wa3QgOjogcmV0dXJuIGFsaXZlXG5cbiAgICAgIGNvbnN0IHJlY3ZfbXNnID0gcHJvdG9jb2xbcGt0LnR5cGVdXG4gICAgICBpZiB1bmRlZmluZWQgPT09IHJlY3ZfbXNnIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZmFsc2UsIEB7fSBwa3QsIHpvbmU6ICdwa3QudHlwZSdcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIHZhciBtc2cgPSBhd2FpdCByZWN2X21zZyBAIHBrdCwgdGhpcywgcm91dGVyXG4gICAgICAgIGlmICEgbXNnIDo6IHJldHVybiBtc2dcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gdm9pZCBvbl9lcnJvciBAIGVyciwgQHt9IHBrdCwgem9uZTogJ3Byb3RvY29sJ1xuXG4gICAgICBpZiBmYWxzZSA9PT0gYWxpdmUgOjpcbiAgICAgICAgcmV0dXJuIHJvdXRlci51bnJlZ2lzdGVyXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICBhd2FpdCBvbl9tc2cgQCBtc2csIHBrdFxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHRyeSA6OlxuICAgICAgICAgIHZhciB0ZXJtaW5hdGUgPSBvbl9lcnJvciBAIGVyciwgQHt9IG1zZywgcGt0LCB6b25lOiAnZGlzcGF0Y2gnXG4gICAgICAgIGZpbmFsbHkgOjpcbiAgICAgICAgICBpZiBmYWxzZSAhPT0gdGVybWluYXRlIDo6XG4gICAgICAgICAgICBzaHV0ZG93bihlcnIsIHttc2csIHBrdH0pXG4gICAgICAgICAgICByZXR1cm4gcm91dGVyLnVucmVnaXN0ZXJcblxuICBzdGF0ZUZvcihwa3QsIGlmQWJzZW50KSA6OlxuICAgIGNvbnN0IG1zZ2lkID0gcGt0LmluZm8ubXNnaWRcbiAgICBsZXQgZW50cnkgPSB0aGlzLmJ5X21zZ2lkLmdldChtc2dpZClcbiAgICBpZiB1bmRlZmluZWQgPT09IGVudHJ5IDo6XG4gICAgICBpZiAhIG1zZ2lkIDo6XG4gICAgICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIG1zZ2lkOiAke21zZ2lkfWBcbiAgICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiBpZkFic2VudCA6OlxuICAgICAgICBlbnRyeSA9IGlmQWJzZW50KHBrdCwgdGhpcywgbXNnaWQpXG4gICAgICBlbHNlIGVudHJ5ID0gaWZBYnNlbnRcbiAgICAgIHRoaXMuYnlfbXNnaWQuc2V0IEAgbXNnaWQsIGVudHJ5XG4gICAgcmV0dXJuIGVudHJ5XG5cbiAgZGVsZXRlU3RhdGVGb3IobXNnaWQpIDo6XG4gICAgcmV0dXJuIHRoaXMuYnlfbXNnaWQuZGVsZXRlKG1zZ2lkKVxuXG4gIGpzb25fdW5wYWNrKG9iaikgOjogdGhyb3cgbmV3IEVycm9yIEAgYEVuZHBvaW50IGJpbmRTaW5rKCkgcmVzcG9uc2liaWxpdHlgXG5cbiIsImV4cG9ydCBkZWZhdWx0IEVQVGFyZ2V0XG5leHBvcnQgY2xhc3MgRVBUYXJnZXQgOjpcbiAgY29uc3RydWN0b3IoaWQpIDo6IHRoaXMuaWQgPSBpZFxuXG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRVBUYXJnZXQgJHtlcF9lbmNvZGUodGhpcy5pZCwgdHJ1ZSl9wrtgXG4gIHRvSlNPTigpIDo6IHJldHVybiBlcF9lbmNvZGUodGhpcy5pZCwgZmFsc2UpXG4gIGFzRW5kcG9pbnRJZCgpIDo6IHJldHVybiB0aGlzLmlkXG4gIGlzRVBUYXJnZXQoKSA6OiByZXR1cm4gdHJ1ZVxuXG4gIGdldCBpZF9yb3V0ZXIoKSA6OiByZXR1cm4gdGhpcy5pZC5pZF9yb3V0ZXJcbiAgZ2V0IGlkX3RhcmdldCgpIDo6IHJldHVybiB0aGlzLmlkLmlkX3RhcmdldFxuXG4gIHN0YXRpYyBhc19qc29uX3VucGFjayhtc2dfY3R4X3RvLCB4Zm9ybUJ5S2V5KSA6OlxuICAgIHhmb3JtQnlLZXkgPSBPYmplY3QuY3JlYXRlKHhmb3JtQnlLZXkgfHwgbnVsbClcbiAgICB4Zm9ybUJ5S2V5W3Rva2VuXSA9IHYgPT4gdGhpcy5mcm9tX2N0eCBAIGVwX2RlY29kZSh2KSwgbXNnX2N0eF90b1xuICAgIHJldHVybiB0aGlzLmpzb25fdW5wYWNrX3hmb3JtKHhmb3JtQnlLZXkpXG5cbiAgc3RhdGljIGZyb21fY3R4KGlkLCBtc2dfY3R4X3RvLCBtc2dpZCkgOjpcbiAgICBpZiAhIGlkIDo6IHJldHVyblxuICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiBpZC5hc0VuZHBvaW50SWQgOjpcbiAgICAgIGlkID0gaWQuYXNFbmRwb2ludElkKClcblxuICAgIGNvbnN0IGVwX3RndCA9IG5ldyB0aGlzKGlkKVxuICAgIGxldCBmYXN0LCBpbml0ID0gKCkgPT4gZmFzdCA9IG1zZ19jdHhfdG8oZXBfdGd0LCB7bXNnaWR9KS5mYXN0X2pzb25cbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBlcF90Z3QsIEB7fVxuICAgICAgc2VuZDogQHt9IGdldCgpIDo6IHJldHVybiAoZmFzdCB8fCBpbml0KCkpLnNlbmRcbiAgICAgIHF1ZXJ5OiBAe30gZ2V0KCkgOjogcmV0dXJuIChmYXN0IHx8IGluaXQoKSkucXVlcnlcbiAgICAgIHJlcGx5RXhwZWN0ZWQ6IEB7fSB2YWx1ZTogISEgbXNnaWRcblxuXG5jb25zdCB0b2tlbiA9ICdcXHUwM0UwJyAvLyAnz6AnXG5FUFRhcmdldC50b2tlbiA9IHRva2VuXG5cbkVQVGFyZ2V0LmVwX2VuY29kZSA9IGVwX2VuY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2VuY29kZShpZCwgc2ltcGxlKSA6OlxuICBsZXQge2lkX3JvdXRlcjpyLCBpZF90YXJnZXQ6dH0gPSBpZFxuICByID0gKHI+Pj4wKS50b1N0cmluZygzNilcbiAgdCA9ICh0Pj4+MCkudG9TdHJpbmcoMzYpXG4gIGlmIHNpbXBsZSA6OlxuICAgIHJldHVybiBgJHt0b2tlbn0gJHtyfX4ke3R9YFxuXG4gIGNvbnN0IHJlcyA9IEB7fSBbdG9rZW5dOiBgJHtyfX4ke3R9YFxuICBPYmplY3QuYXNzaWduIEAgcmVzLCBpZFxuICBkZWxldGUgcmVzLmlkX3JvdXRlcjsgZGVsZXRlIHJlcy5pZF90YXJnZXRcbiAgcmV0dXJuIHJlc1xuXG5cbkVQVGFyZ2V0LmVwX2RlY29kZSA9IGVwX2RlY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2RlY29kZSh2KSA6OlxuICBjb25zdCBpZCA9ICdzdHJpbmcnID09PSB0eXBlb2YgdlxuICAgID8gdi5zcGxpdCh0b2tlbilbMV1cbiAgICA6IHZbdG9rZW5dXG4gIGlmICEgaWQgOjogcmV0dXJuXG5cbiAgbGV0IFtyLHRdID0gaWQuc3BsaXQoJ34nKVxuICBpZiB1bmRlZmluZWQgPT09IHQgOjogcmV0dXJuXG4gIHIgPSAwIHwgcGFyc2VJbnQociwgMzYpXG4gIHQgPSAwIHwgcGFyc2VJbnQodCwgMzYpXG5cbiAgcmV0dXJuIEB7fSBpZF9yb3V0ZXI6IHIsIGlkX3RhcmdldDogdFxuXG5cbkVQVGFyZ2V0Lmpzb25fdW5wYWNrX3hmb3JtID0ganNvbl91bnBhY2tfeGZvcm1cbmV4cG9ydCBmdW5jdGlvbiBqc29uX3VucGFja194Zm9ybSh4Zm9ybUJ5S2V5KSA6OlxuICByZXR1cm4gc3ogPT4gSlNPTi5wYXJzZSBAIHN6LCByZXZpdmVyKClcblxuICBmdW5jdGlvbiByZXZpdmVyKCkgOjpcbiAgICBjb25zdCByZWcgPSBuZXcgV2Vha01hcCgpXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGtleSwgdmFsdWUpIDo6XG4gICAgICBjb25zdCB4Zm4gPSB4Zm9ybUJ5S2V5W2tleV1cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0geGZuIDo6XG4gICAgICAgIHJlZy5zZXQodGhpcywgeGZuKVxuICAgICAgICByZXR1cm4gdmFsdWVcblxuICAgICAgaWYgJ29iamVjdCcgPT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgICBjb25zdCB2Zm4gPSByZWcuZ2V0KHZhbHVlKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHZmbiA6OlxuICAgICAgICAgIHJldHVybiB2Zm4gQCB2YWx1ZVxuICAgICAgcmV0dXJuIHZhbHVlXG5cbiIsImltcG9ydCB7ZXBfZGVjb2RlfSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1zZ0N0eCA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtyYW5kb21faWQsIGNvZGVjc30pIDo6XG4gICAgY2xhc3MgTXNnQ3R4IGV4dGVuZHMgdGhpcyA6OlxuICAgIE1zZ0N0eC5wcm90b3R5cGUucmFuZG9tX2lkID0gcmFuZG9tX2lkXG4gICAgTXNnQ3R4LndpdGhDb2RlY3MgQCBjb2RlY3NcbiAgICByZXR1cm4gTXNnQ3R4XG5cbiAgc3RhdGljIGZvckh1YihodWIsIGNoYW5uZWwpIDo6XG4gICAgY29uc3Qge3NlbmRSYXd9ID0gY2hhbm5lbFxuXG4gICAgY2xhc3MgTXNnQ3R4IGV4dGVuZHMgdGhpcyA6OlxuICAgIE1zZ0N0eC5wcm90b3R5cGUuY2hhbl9zZW5kID0gYXN5bmMgcGt0ID0+IDo6XG4gICAgICBhd2FpdCBzZW5kUmF3KHBrdClcbiAgICAgIHJldHVybiB0cnVlXG5cbiAgICByZXR1cm4gTXNnQ3R4XG5cblxuICBjb25zdHJ1Y3RvcihpZCkgOjpcbiAgICBpZiBudWxsICE9IGlkIDo6XG4gICAgICBjb25zdCB7aWRfdGFyZ2V0LCBpZF9yb3V0ZXJ9ID0gaWRcbiAgICAgIGNvbnN0IGZyb21faWQgPSBPYmplY3QuZnJlZXplIEA6IGlkX3RhcmdldCwgaWRfcm91dGVyXG4gICAgICB0aGlzLmN0eCA9IEB7fSBmcm9tX2lkXG5cblxuICB3aXRoRW5kcG9pbnQoZW5kcG9pbnQpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBlbmRwb2ludDogQHt9IHZhbHVlOiBlbmRwb2ludFxuXG5cbiAgcGluZyh0b2tlbj10cnVlKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX21zZ0NvZGVjcy5jb250cm9sLnBpbmcsIFtdLCB0b2tlbilcbiAgc2VuZCguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MpXG4gIHNlbmRRdWVyeSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MsIHRydWUpXG4gIHF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZSkucmVwbHlcblxuICBzdHJlYW0oLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX2NvZGVjLnN0cmVhbSwgYXJnc1xuICBpbnZva2Uoa2V5LCAuLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWNba2V5XSwgYXJnc1xuICBiaW5kSW52b2tlKGZuT3JLZXksIHRva2VuKSA6OlxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBmbk9yS2V5IDo6IGZuT3JLZXkgPSB0aGlzLl9jb2RlY1xuICAgIHJldHVybiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGZuT3JLZXksIGFyZ3MsIHRva2VuKVxuXG4gIF9pbnZva2VfZXgoaW52b2tlLCBhcmdzLCB0b2tlbikgOjpcbiAgICBjb25zdCBvYmogPSBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4XG4gICAgaWYgbnVsbCA9PSB0b2tlbiA6OiB0b2tlbiA9IG9iai50b2tlblxuICAgIGVsc2Ugb2JqLnRva2VuID0gdG9rZW5cbiAgICBpZiB0cnVlID09PSB0b2tlbiA6OlxuICAgICAgdG9rZW4gPSBvYmoudG9rZW4gPSB0aGlzLnJhbmRvbV9pZCgpXG5cbiAgICB0aGlzLmFzc2VydE1vbml0b3IoKVxuXG4gICAgY29uc3QgcmVzID0gaW52b2tlIEAgdGhpcy5jaGFuX3NlbmQsIG9iaiwgLi4uYXJnc1xuICAgIGlmICEgdG9rZW4gfHwgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJlcy50aGVuIDo6IHJldHVybiByZXNcblxuICAgIGxldCBwX3NlbnQgID0gcmVzLnRoZW4oKVxuICAgIGNvbnN0IHJlcGx5ID0gdGhpcy5lbmRwb2ludC5pbml0UmVwbHkodG9rZW4sIHBfc2VudCwgdGhpcylcbiAgICBwX3NlbnQgPSBwX3NlbnQudGhlbiBAICgpID0+IEA6IHJlcGx5XG4gICAgcF9zZW50LnJlcGx5ID0gcmVwbHlcbiAgICByZXR1cm4gcF9zZW50XG5cbiAgZ2V0IHRvKCkgOjogcmV0dXJuICh0Z3QsIC4uLmFyZ3MpID0+IDo6XG4gICAgaWYgbnVsbCA9PSB0Z3QgOjogdGhyb3cgbmV3IEVycm9yIEAgYE51bGwgdGFyZ2V0IGVuZHBvaW50YFxuXG4gICAgY29uc3Qgc2VsZiA9IHRoaXMuY2xvbmUoKVxuXG4gICAgY29uc3QgY3R4ID0gc2VsZi5jdHhcbiAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgY3R4LmlkX3RhcmdldCA9IHRndFxuICAgICAgY3R4LmlkX3JvdXRlciA9IGN0eC5mcm9tX2lkLmlkX3JvdXRlclxuICAgIGVsc2UgOjpcbiAgICAgIHRndCA9IGVwX2RlY29kZSh0Z3QpIHx8IHRndFxuICAgICAgY29uc3Qge2Zyb21faWQ6IHJlcGx5X2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgdG9rZW4sIG1zZ2lkfSA9IHRndFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IGlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gaWRfdGFyZ2V0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBpZF9yb3V0ZXJcbiAgICAgIGVsc2UgaWYgdW5kZWZpbmVkICE9PSByZXBseV9pZCAmJiAhIGN0eC5pZF90YXJnZXQgOjpcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHJlcGx5X2lkLmlkX3RhcmdldFxuICAgICAgICBjdHguaWRfcm91dGVyID0gcmVwbHlfaWQuaWRfcm91dGVyXG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnaWQgOjogY3R4Lm1zZ2lkID0gbXNnaWRcblxuICAgIHJldHVybiAwID09PSBhcmdzLmxlbmd0aCA/IHNlbGYgOiBzZWxmLndpdGggQCAuLi5hcmdzXG5cbiAgd2l0aCguLi5hcmdzKSA6OlxuICAgIGNvbnN0IGN0eCA9IHRoaXMuY3R4XG4gICAgZm9yIGxldCB0Z3Qgb2YgYXJncyA6OlxuICAgICAgaWYgdHJ1ZSA9PT0gdGd0IHx8IGZhbHNlID09PSB0Z3QgOjpcbiAgICAgICAgY3R4LnRva2VuID0gdGd0XG4gICAgICBlbHNlIGlmIG51bGwgIT0gdGd0IDo6XG4gICAgICAgIGNvbnN0IHt0b2tlbiwgbXNnaWR9ID0gdGd0XG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuICAgIHJldHVybiB0aGlzXG5cbiAgd2l0aFJlcGx5KCkgOjpcbiAgICByZXR1cm4gdGhpcy5jbG9uZSBAOiB0b2tlbjogdHJ1ZVxuXG4gIGNsb25lKC4uLmFyZ3MpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAe31cbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuXG4gIGFzc2VydE1vbml0b3IoKSA6OlxuICAgIGlmICEgdGhpcy5jaGVja01vbml0b3IoKSA6OlxuICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFRhcmdldCBtb25pdG9yIGV4cGlyZWRgXG4gIGNoZWNrTW9uaXRvcigpIDo6IHJldHVybiB0cnVlXG4gIG1vbml0b3Iob3B0aW9ucz17fSkgOjpcbiAgICBpZiB0cnVlID09PSBvcHRpb25zIHx8IGZhbHNlID09PSBvcHRpb25zIDo6XG4gICAgICBvcHRpb25zID0gQHt9IGFjdGl2ZTogb3B0aW9uc1xuXG4gICAgY29uc3QgbW9uaXRvciA9IHRoaXMuZW5kcG9pbnQuaW5pdE1vbml0b3IodGhpcy5jdHguaWRfdGFyZ2V0KVxuXG4gICAgY29uc3QgdHNfZHVyYXRpb24gPSBvcHRpb25zLnRzX2R1cmF0aW9uIHx8IDUwMDBcbiAgICBsZXQgdHNfYWN0aXZlID0gb3B0aW9ucy50c19hY3RpdmVcbiAgICBpZiB0cnVlID09PSB0c19hY3RpdmUgOjpcbiAgICAgIHRzX2FjdGl2ZSA9IHRzX2R1cmF0aW9uLzRcblxuICAgIGxldCBjaGVja01vbml0b3JcbiAgICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgY29uc3QgZG9uZSA9IG9wdGlvbnMucmVqZWN0ID8gcmVqZWN0IDogcmVzb2x2ZVxuICAgICAgdGhpcy5jaGVja01vbml0b3IgPSBjaGVja01vbml0b3IgPSAoKSA9PlxuICAgICAgICB0c19kdXJhdGlvbiA+IG1vbml0b3IudGQoKVxuICAgICAgICAgID8gdHJ1ZSA6IChkb25lKG1vbml0b3IpLCBmYWxzZSlcblxuICAgIGxldCB0aWRcbiAgICBjb25zdCB0c19pbnRlcnZhbCA9IHRzX2FjdGl2ZSB8fCB0c19kdXJhdGlvbi80XG4gICAgaWYgb3B0aW9ucy5hY3RpdmUgfHwgdHNfYWN0aXZlIDo6XG4gICAgICBjb25zdCBjdHJsID0gdGhpcy5jb2RlYygnY29udHJvbCcpXG4gICAgICBjb25zdCBjaGVja1BpbmcgPSAoKSA9PiA6OlxuICAgICAgICBpZiB0c19pbnRlcnZhbCA+IG1vbml0b3IudGQoKSA6OlxuICAgICAgICAgIGN0cmwuaW52b2tlKCdwaW5nJylcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tQaW5nLCB0c19pbnRlcnZhbFxuICAgIGVsc2UgOjpcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tNb25pdG9yLCB0c19pbnRlcnZhbFxuICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuICAgIGNvbnN0IGNsZWFyID0gKCkgPT4gY2xlYXJJbnRlcnZhbCh0aWQpXG5cbiAgICBwcm9taXNlLnRoZW4oY2xlYXIsIGNsZWFyKVxuICAgIHJldHVybiBwcm9taXNlXG5cblxuICBjb2RlYyhtc2dfY29kZWMsIC4uLmFyZ3MpIDo6XG4gICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiBtc2dfY29kZWMgOjpcbiAgICAgIG1zZ19jb2RlYyA9IHRoaXMuX21zZ0NvZGVjc1ttc2dfY29kZWNdXG5cbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgbXNnX2NvZGVjLnNlbmQgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgcGFja2V0IGNvZGVjIHByb3RvY29sYFxuXG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAOlxuICAgICAgX2NvZGVjOiBAOiB2YWx1ZTogbXNnX2NvZGVjXG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cbiAgc3RhdGljIHdpdGhDb2RlY3MobXNnQ29kZWNzKSA6OlxuICAgIGZvciBjb25zdCBbbmFtZSwgbXNnX2NvZGVjXSBvZiBPYmplY3QuZW50cmllcyBAIG1zZ0NvZGVjcyA6OlxuICAgICAgdGhpcy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIDo6XG4gICAgICAgIHJldHVybiB0aGlzLmNvZGVjIEAgbXNnX2NvZGVjXG4gICAgdGhpcy5wcm90b3R5cGUuX21zZ0NvZGVjcyA9IG1zZ0NvZGVjc1xuICAgIHRoaXMucHJvdG90eXBlLl9jb2RlYyA9IG1zZ0NvZGVjcy5kZWZhdWx0XG5cbiAgICAvLyBiaW5kIHNlbmRfanNvbiBhcyBmcmVxdWVudGx5IHVzZWQgZmFzdC1wYXRoXG4gICAgY29uc3QganNvbl9zZW5kID0gbXNnQ29kZWNzLmpzb24uc2VuZFxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcy5wcm90b3R5cGUsIEA6XG4gICAgICBmYXN0X2pzb246IEB7fSBnZXQoKSA6OiByZXR1cm4gQDpcbiAgICAgICAgc2VuZDogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChqc29uX3NlbmQsIGFyZ3MpXG4gICAgICAgIHNlbmRRdWVyeTogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChqc29uX3NlbmQsIGFyZ3MsIHRydWUpXG4gICAgICAgIHF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGpzb25fc2VuZCwgYXJncywgdHJ1ZSkucmVwbHlcblxuICAgIHJldHVybiB0aGlzXG5cblxuICB3aXRoUmVqZWN0VGltZW91dChwX3JlcGx5KSA6OlxuICAgIHJldHVybiBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBwX3JlcGx5LnRoZW4gQCByZXNvbHZlLCByZWplY3RcbiAgICAgIHBfcmVwbHkudGhlbiBAIGNsZWFyLCBjbGVhclxuXG4gICAgICBjb25zdCB0aW1lb3V0ID0gKCkgPT4gcmVqZWN0IEAgbmV3IHRoaXMuUmVwbHlUaW1lb3V0XG4gICAgICBjb25zdCB0aWQgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIHRoaXMubXNfdGltZW91dClcbiAgICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuXG4gICAgICBmdW5jdGlvbiBjbGVhcigpIDo6IGNsZWFyVGltZW91dCBAIHRpZFxuXG5cbmNsYXNzIFJlcGx5VGltZW91dCBleHRlbmRzIEVycm9yIDo6XG5cbk9iamVjdC5hc3NpZ24gQCBNc2dDdHgucHJvdG90eXBlLCBAe31cbiAgUmVwbHlUaW1lb3V0LCBtc190aW1lb3V0OiA1MDAwXG5cbiIsImltcG9ydCB7RVBUYXJnZXQsIGVwX2VuY29kZX0gZnJvbSAnLi9lcF90YXJnZXQuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBFbmRwb2ludCA6OlxuICBzdGF0aWMgc3ViY2xhc3MoZXh0ZW5zaW9ucykgOjpcbiAgICBjbGFzcyBFbmRwb2ludCBleHRlbmRzIHRoaXMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgRW5kcG9pbnQucHJvdG90eXBlLCBleHRlbnNpb25zXG4gICAgcmV0dXJuIEVuZHBvaW50XG5cbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFbmRwb2ludCAke2VwX2VuY29kZSh0aGlzLmlkLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIHRoaXMuZXBfc2VsZigpLnRvSlNPTigpXG4gIGVwX3NlbGYoKSA6OiByZXR1cm4gbmV3IHRoaXMuRVBUYXJnZXQodGhpcy5pZClcbiAgYXNFbmRwb2ludElkKCkgOjogcmV0dXJuIHRoaXMuaWRcblxuICBjb25zdHJ1Y3RvcihpZCwgbXNnX2N0eCkgOjpcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEB7fVxuICAgICAgaWQ6IEB7fSB2YWx1ZTogaWRcbiAgICAgIHRvOiBAe30gdmFsdWU6IG1zZ19jdHgud2l0aEVuZHBvaW50KHRoaXMpLnRvXG5cbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKVxuICBjcmVhdGVTdGF0ZU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVJlcGx5TWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlVHJhZmZpY01hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVJvdXRlQ2FjaGVNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuXG4gIGJpbmRTaW5rKHNpbmspIDo6XG4gICAgY29uc3QgYnlfdG9rZW4gPSB0aGlzLmNyZWF0ZVJlcGx5TWFwKClcbiAgICBjb25zdCBieV90cmFmZmljID0gdGhpcy5jcmVhdGVUcmFmZmljTWFwKClcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBieV90b2tlbjogQHt9IHZhbHVlOiBieV90b2tlblxuICAgICAgYnlfdHJhZmZpYzogQHt9IHZhbHVlOiBieV90cmFmZmljXG5cbiAgICBjb25zdCB0cmFmZmljID0gKGZyb21faWQsIHRyYWZmaWMpID0+IDo6XG4gICAgICBjb25zdCB0cyA9IERhdGUubm93KClcbiAgICAgIGlmIGZyb21faWQgOjpcbiAgICAgICAgY29uc3QgdCA9IGJ5X3RyYWZmaWMuZ2V0KGZyb21faWQuaWRfdGFyZ2V0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHQgOjpcbiAgICAgICAgICB0LnRzID0gdFtgdHNfJHt0cmFmZmljfWBdID0gdHNcbiAgICAgIHRoaXMucmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpXG5cbiAgICByZXR1cm4gQHt9XG4gICAgICBieV9tc2dpZDogdGhpcy5jcmVhdGVTdGF0ZU1hcCgpXG4gICAgICBqc29uX3VucGFjazogdGhpcy5FUFRhcmdldC5hc19qc29uX3VucGFjayh0aGlzLnRvKVxuXG4gICAgICByZWN2Q3RybDogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdjdHJsJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdkN0cmwobXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cgfHwge21zZywgaW5mb30pLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdk1zZzogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdtc2cnKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2TXNnKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnKS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZTdHJlYW1EYXRhOiAocnN0cmVhbSwgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgcmVjdlN0cmVhbTogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCByc3RyZWFtID0gdGhpcy5yZWN2U3RyZWFtKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShyc3RyZWFtKS50aGVuKHJlcGx5KVxuICAgICAgICByZXR1cm4gcnN0cmVhbVxuXG4gIGFzX3RhcmdldChpZCkgOjpcbiAgICBpZiBpZCA6OiByZXR1cm4gdGhpcy5FUFRhcmdldC5mcm9tX2N0eCBAIGlkLCB0aGlzLnRvXG4gIGFzX3NlbmRlcih7ZnJvbV9pZDppZCwgbXNnaWR9KSA6OlxuICAgIGlmIGlkIDo6IHJldHVybiB0aGlzLkVQVGFyZ2V0LmZyb21fY3R4IEAgaWQsIHRoaXMudG8sIG1zZ2lkXG5cbiAgcmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpIDo6XG4gIHJlY3ZDdHJsKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgaWYgaXNfcmVwbHkgOjogcmV0dXJuIG1zZ1xuICByZWN2TXNnKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgaWYgaXNfcmVwbHkgOjogcmV0dXJuIG1zZ1xuICAgIHJldHVybiBAe30gbXNnLCBpbmZvLCBzZW5kZXI6IHRoaXMuYXNfc2VuZGVyKGluZm8pXG4gIHJlY3ZTdHJlYW0obXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBjb25zb2xlLndhcm4gQCBgVW5oYW5kbGUgcmVjdiBzdHJlYW06ICR7aW5mb31gXG4gICAgcmV0dXJuIG51bGxcbiAgICAvKiByZXR1cm4gQHt9IG1zZywgaW5mb1xuICAgICAgICAgb25faW5pdChtc2csIHBrdCkgOjogLy8gcmV0dXJuIHRoaXNcbiAgICAgICAgIG9uX2RhdGEoZGF0YSwgcGt0KSA6OiB0aGlzLnBhcnRzLnB1c2ggQCBkYXRhXG4gICAgICAgICBvbl9lbmQocmVzdWx0LCBwa3QpIDo6IHRoaXMucGFydHMuam9pbignJyk7IC8vIHJldHVybiB0aGlzXG4gICAgICAgICBvbl9lcnJvcihlcnIsIHBrdCkgOjogY29uc29sZS5sb2cgQCBlcnJcbiAgICAqL1xuXG4gIGluaXRSZXBseSh0b2tlbiwgcF9zZW50LCBtc2dfY3R4KSA6OlxuICAgIHJldHVybiB0aGlzLmluaXRSZXBseVByb21pc2UgQCB0b2tlbiwgcF9zZW50LCBtc2dfY3R4XG5cbiAgaW5pdE1vbml0b3IoaWRfdGFyZ2V0KSA6OlxuICAgIGNvbnN0IGtleSA9IGlkX3RhcmdldC5pZF90YXJnZXQgfHwgaWRfdGFyZ2V0XG4gICAgbGV0IG1vbml0b3IgPSB0aGlzLmJ5X3RyYWZmaWMuZ2V0IEAga2V5XG4gICAgaWYgdW5kZWZpbmVkID09PSBtb25pdG9yIDo6XG4gICAgICBtb25pdG9yID0gQHt9IGlkX3RhcmdldCwgdHM6IERhdGUubm93KClcbiAgICAgICAgdGQoKSA6OiByZXR1cm4gRGF0ZS5ub3coKSAtIHRoaXMudHNcbiAgICAgIHRoaXMuYnlfdHJhZmZpYy5zZXQgQCBrZXksIG1vbml0b3JcbiAgICByZXR1cm4gbW9uaXRvclxuXG4gIGluaXRSZXBseVByb21pc2UodG9rZW4sIHBfc2VudCwgbXNnX2N0eCkgOjpcbiAgICBsZXQgcmVwbHkgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICB0aGlzLmJ5X3Rva2VuLnNldCBAIHRva2VuLCByZXNvbHZlXG4gICAgICBwX3NlbnQuY2F0Y2ggQCByZWplY3RcblxuICAgIGlmIG1zZ19jdHggOjpcbiAgICAgIHJlcGx5ID0gbXNnX2N0eC53aXRoUmVqZWN0VGltZW91dChyZXBseSlcblxuICAgIGNvbnN0IGNsZWFyID0gKCkgPT4gdGhpcy5ieV90b2tlbi5kZWxldGUgQCB0b2tlblxuICAgIHJlcGx5LnRoZW4gQCBjbGVhciwgY2xlYXJcbiAgICByZXR1cm4gcmVwbHlcblxuRW5kcG9pbnQucHJvdG90eXBlLkVQVGFyZ2V0ID0gRVBUYXJnZXRcbiIsImltcG9ydCBlcF9wcm90byBmcm9tICcuL2VwX2tpbmRzL2luZGV4LmpzeSdcbmltcG9ydCBpbml0X3Byb3RvY29sIGZyb20gJy4vcHJvdG9jb2wvaW5kZXguanN5J1xuaW1wb3J0IFNpbmtCYXNlIGZyb20gJy4vc2luay5qc3knXG5pbXBvcnQgTXNnQ3R4QmFzZSBmcm9tICcuL21zZ2N0eC5qc3knXG5pbXBvcnQgRW5kcG9pbnRCYXNlIGZyb20gJy4vZW5kcG9pbnQuanN5J1xuXG5jb25zdCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zID0gQDpcbiAgcGx1Z2luX25hbWU6ICdlbmRwb2ludCdcbiAgb25fbXNnKHttc2csIHJlcGx5LCBpbmZvfSkgOjpcbiAgICBjb25zb2xlLndhcm4gQCAnRU5EUE9JTlQgTVNHOicsIEB7fSBtc2csIHJlcGx5LCBpbmZvXG4gIG9uX2Vycm9yKGVwLCBlcnIsIGV4dHJhKSA6OlxuICAgIGNvbnNvbGUuZXJyb3IgQCAnRU5EUE9JTlQgRVJST1I6JywgZXJyXG4gICAgLy8gY29uc3Qge21zZywgcGt0fSA9IGV4dHJhXG4gICAgLy8gcmV0dXJuIGZhbHNlIHRvIHByZXZlbnQgYXV0by1zaHV0ZG93blxuICBvbl9zaHV0ZG93bihlcCwgZXJyLCBleHRyYSkgOjpcbiAgICAvLyBjb25zdCB7bXNnLCBwa3R9ID0gZXh0cmFcbiAgICBjb25zb2xlLmVycm9yIEAgYEVORFBPSU5UIFNIVVRET1dOOiAke2Vyci5tZXNzYWdlfWBcblxuICBzdWJjbGFzcyhjbGFzc2VzKSA6OlxuICAgIC8vY29uc3Qge0VuZHBvaW50LCBTaW5rLCBNc2dDdHgsIHByb3RvY29sc30gPSBjbGFzc2VzXG4gICAgcmV0dXJuIGNsYXNzZXNcblxuICBqc29uX3BhY2s6IEpTT04uc3RyaW5naWZ5XG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKCkgLy8gTFJVTWFwLCBIYXNoYmVsdE1hcFxuXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBsdWdpbl9vcHRpb25zKSA6OlxuICBwbHVnaW5fb3B0aW9ucyA9IE9iamVjdC5hc3NpZ24gQCB7fSwgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucywgcGx1Z2luX29wdGlvbnNcbiAgY29uc3QgQHt9XG4gICAgcGx1Z2luX25hbWUsIHJhbmRvbV9pZCwganNvbl9wYWNrXG4gICAgb25fbXNnOiBkZWZhdWx0X29uX21zZ1xuICAgIG9uX2Vycm9yOiBkZWZhdWx0X29uX2Vycm9yXG4gICAgb25fc2h1dGRvd246IGRlZmF1bHRfb25fc2h1dGRvd25cbiAgICBjcmVhdGVNYXBcbiAgPSBwbHVnaW5fb3B0aW9uc1xuXG4gIGlmIHBsdWdpbl9vcHRpb25zLmVwX2tpbmRzIDo6XG4gICAgT2JqZWN0LmFzc2lnbiBAIGVwX3Byb3RvLCBwbHVnaW5fb3B0aW9ucy5lcF9raW5kc1xuXG4gIHJldHVybiBAOiBvcmRlcjogMSwgc3ViY2xhc3MsIHBvc3RcbiAgXG4gIGZ1bmN0aW9uIHN1YmNsYXNzKEZhYnJpY0h1Yl9QSSwgYmFzZXMpIDo6XG4gICAgY29uc3Qge3BhY2tldFBhcnNlcn0gPSBGYWJyaWNIdWJfUEkucHJvdG90eXBlXG4gICAgaWYgbnVsbD09cGFja2V0UGFyc2VyIHx8ICEgcGFja2V0UGFyc2VyLmlzUGFja2V0UGFyc2VyKCkgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgSW52YWxpZCBwYWNrZXRQYXJzZXIgZm9yIHBsdWdpbmBcbiAgICBcbiAgICBGYWJyaWNIdWJfUEkucHJvdG90eXBlW3BsdWdpbl9uYW1lXSA9XG4gICAgICBiaW5kRW5kcG9pbnRBcGkgQCBwYWNrZXRQYXJzZXJcblxuICBmdW5jdGlvbiBwb3N0KGh1YikgOjpcbiAgICByZXR1cm4gaHViW3BsdWdpbl9uYW1lXSA9IGh1YltwbHVnaW5fbmFtZV0oaHViKVxuXG4gIGZ1bmN0aW9uIGJpbmRFbmRwb2ludEFwaShwYWNrZXRQYXJzZXIpIDo6XG4gICAgY29uc3QgcHJvdG9jb2xzID0gaW5pdF9wcm90b2NvbCBAIHBhY2tldFBhcnNlciwgQHt9IHJhbmRvbV9pZCwganNvbl9wYWNrXG5cbiAgICBjb25zdCB7RW5kcG9pbnQsIFNpbmssIE1zZ0N0eDogTXNnQ3R4X3BpfSA9XG4gICAgICBwbHVnaW5fb3B0aW9ucy5zdWJjbGFzcyBAOiBwcm90b2NvbHNcbiAgICAgICAgU2luazogU2lua0Jhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICAgICAgTXNnQ3R4OiBNc2dDdHhCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIEVuZHBvaW50OiBFbmRwb2ludEJhc2Uuc3ViY2xhc3Moe2NyZWF0ZU1hcH0pXG5cbiAgICByZXR1cm4gZnVuY3Rpb24oaHViKSA6OlxuICAgICAgY29uc3QgY2hhbm5lbCA9IGh1Yi5jb25uZWN0X3NlbGYoKVxuICAgICAgY29uc3QgTXNnQ3R4ID0gTXNnQ3R4X3BpLmZvckh1YihodWIsIGNoYW5uZWwpXG5cbiAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZiBAIGVuZHBvaW50LCBlcF9wcm90b1xuICAgICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gZW5kcG9pbnQsIGNyZWF0ZSwgTXNnQ3R4XG4gICAgICByZXR1cm4gZW5kcG9pbnRcblxuXG4gICAgICBmdW5jdGlvbiBlbmRwb2ludChvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCB0YXJnZXRzID0gaHViLnJvdXRlci50YXJnZXRzXG4gICAgICAgIGRvIHZhciBpZF90YXJnZXQgPSByYW5kb21faWQoKVxuICAgICAgICB3aGlsZSB0YXJnZXRzLmhhcyBAIGlkX3RhcmdldFxuICAgICAgICByZXR1cm4gY3JlYXRlIEAgaWRfdGFyZ2V0LCBvbl9pbml0XG5cbiAgICAgIGZ1bmN0aW9uIGNyZWF0ZShpZF90YXJnZXQsIG9uX2luaXQpIDo6XG4gICAgICAgIGNvbnN0IGhhbmRsZXJzID0gT2JqZWN0LmNyZWF0ZShudWxsKVxuICAgICAgICBjb25zdCBpZCA9IEB7fSBpZF90YXJnZXQsIGlkX3JvdXRlcjogaHViLnJvdXRlci5pZF9zZWxmXG4gICAgICAgIGNvbnN0IG1zZ19jdHggPSBuZXcgTXNnQ3R4IEAgaWRcbiAgICAgICAgY29uc3QgZXAgPSBuZXcgRW5kcG9pbnQgQCBpZCwgbXNnX2N0eFxuXG4gICAgICAgIGNvbnN0IHJlYWR5ID0gUHJvbWlzZVxuICAgICAgICAgIC5yZXNvbHZlIEBcbiAgICAgICAgICAgICdmdW5jdGlvbicgPT09IHR5cGVvZiBvbl9pbml0XG4gICAgICAgICAgICAgID8gb25faW5pdChlcCwgaHViKVxuICAgICAgICAgICAgICA6IG9uX2luaXRcbiAgICAgICAgICAudGhlbiBAIF9hZnRlcl9pbml0XG5cbiAgICAgICAgLy8gQWxsb3cgZm9yIGJvdGggaW50ZXJuYWwgYW5kIGV4dGVybmFsIGVycm9yIGhhbmRsaW5nIGJ5IGZvcmtpbmcgcmVhZHkuY2F0Y2hcbiAgICAgICAgcmVhZHkuY2F0Y2ggQCBlcnIgPT4gaGFuZGxlcnMub25fZXJyb3IgQCBlcnIsIEB7fSB6b25lOidvbl9yZWFkeSdcblxuICAgICAgICA6OlxuICAgICAgICAgIGNvbnN0IGVwX3RndCA9IGVwLmVwX3NlbGYoKVxuICAgICAgICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIGVwX3RndCwgQHt9XG4gICAgICAgICAgICByZWFkeTogQHt9IHZhbHVlOiByZWFkeS50aGVuIEAgKCkgPT4gZXBfdGd0XG5cblxuICAgICAgICBmdW5jdGlvbiBfYWZ0ZXJfaW5pdCh0YXJnZXQpIDo6XG4gICAgICAgICAgaWYgbnVsbCA9PSB0YXJnZXQgOjpcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgZW5kcG9pbnQgaW5pdCB0byByZXR1cm4gYSBjbG9zdXJlIG9yIGludGVyZmFjZWBcblxuICAgICAgICAgIGhhbmRsZXJzLm9uX21zZyA9ICh0YXJnZXQub25fbXNnIHx8ICgnZnVuY3Rpb24nID09PSB0eXBlb2YgdGFyZ2V0ID8gdGFyZ2V0IDogZGVmYXVsdF9vbl9tc2cpKS5iaW5kKHRhcmdldClcbiAgICAgICAgICBoYW5kbGVycy5vbl9lcnJvciA9ICh0YXJnZXQub25fZXJyb3IgfHwgZGVmYXVsdF9vbl9lcnJvcikuYmluZCh0YXJnZXQsIGVwKVxuICAgICAgICAgIGhhbmRsZXJzLm9uX3NodXRkb3duID0gKHRhcmdldC5vbl9zaHV0ZG93biB8fCBkZWZhdWx0X29uX3NodXRkb3duKS5iaW5kKHRhcmdldCwgZXApXG5cbiAgICAgICAgICBuZXcgU2luaygpLnJlZ2lzdGVyIEAgZXAsIGh1YiwgaWRfdGFyZ2V0LCBoYW5kbGVyc1xuXG4gICAgICAgICAgcmV0dXJuIHRhcmdldC5vbl9yZWFkeSA/IHRhcmdldC5vbl9yZWFkeShlcCwgaHViKSA6IHRhcmdldFxuXG5cbiIsImltcG9ydCB7cmFuZG9tQnl0ZXN9IGZyb20gJ2NyeXB0bydcbmltcG9ydCBlbmRwb2ludF9wbHVnaW4gZnJvbSAnLi9wbHVnaW4uanN5J1xuXG5lbmRwb2ludF9ub2RlanMucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5mdW5jdGlvbiByYW5kb21faWQoKSA6OlxuICByZXR1cm4gcmFuZG9tQnl0ZXMoNCkucmVhZEludDMyTEUoKVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBlbmRwb2ludF9ub2RlanMocGx1Z2luX29wdGlvbnM9e30pIDo6XG4gIGlmIG51bGwgPT0gcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkIDo6XG4gICAgcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5cbiAgcmV0dXJuIGVuZHBvaW50X3BsdWdpbihwbHVnaW5fb3B0aW9ucylcblxuIl0sIm5hbWVzIjpbImVwX3Byb3RvIiwiT2JqZWN0IiwiY3JlYXRlIiwiZ2V0UHJvdG90eXBlT2YiLCJhZGRfZXBfa2luZCIsImtpbmRzIiwiYXNzaWduIiwiYXBpIiwidGFyZ2V0IiwiY2xpZW50RW5kcG9pbnQiLCJlbmRwb2ludCIsImRvbmUiLCJhcmdzIiwibGVuZ3RoIiwibXNnX2N0eCIsIk1zZ0N0eCIsInRvIiwiZXBfY2xpZW50X2FwaSIsIm9uX3JlYWR5IiwiZXAiLCJodWIiLCJfcmVzb2x2ZSIsIm9uX2NsaWVudF9yZWFkeSIsInNodXRkb3duIiwiZXJyIiwiX3JlamVjdCIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiYXNBUElFbmRwb2ludCIsImludm9rZSIsImFzX3JwYyIsIm9uX21zZyIsIm1zZyIsInNlbmRlciIsImFwaV9mb3Jfb3AiLCJvcCIsInJlc29sdmVfZm4iLCJpbnZva2VfZm4iLCJrdyIsImZuIiwidW5kZWZpbmVkIiwibWF0Y2giLCJzZW5kIiwiZXJyX2Zyb20iLCJtZXNzYWdlIiwiY29kZSIsImNiIiwiYW5zd2VyIiwiZXJyb3IiLCJyZXBseUV4cGVjdGVkIiwib25faW5pdCIsImxpdHRsZV9lbmRpYW4iLCJjX3NpbmdsZSIsImNfZGF0YWdyYW0iLCJjX2RpcmVjdCIsImNfbXVsdGlwYXJ0IiwiY19zdHJlYW1pbmciLCJfZXJyX21zZ2lkX3JlcXVpcmVkIiwiX2Vycl90b2tlbl9yZXF1aXJlZCIsImZybV9yb3V0aW5nIiwic2l6ZSIsImJpdHMiLCJtYXNrIiwib2JqIiwiZnJvbV9pZCIsImR2Iiwib2Zmc2V0Iiwic2V0SW50MzIiLCJpZF9yb3V0ZXIiLCJpZF90YXJnZXQiLCJnZXRJbnQzMiIsImZybV9yZXNwb25zZSIsIm1zZ2lkIiwiRXJyb3IiLCJzZXRJbnQxNiIsInNlcV9hY2siLCJhY2tfZmxhZ3MiLCJ0b2tlbiIsImdldEludDE2IiwiZnJtX2RhdGFncmFtIiwidHJhbnNwb3J0IiwiZnJtX2RpcmVjdCIsImZybV9tdWx0aXBhcnQiLCJzZXFfcG9zIiwic2VxIiwic2VxX2ZsYWdzIiwiZnJtX3N0cmVhbWluZyIsImJpbmRfc2VxX25leHQiLCJzZXFfb2Zmc2V0Iiwic2VxX25leHQiLCJmbGFncyIsImZpbiIsIk5hTiIsImNvbXBvc2VGcmFtaW5ncyIsImZybV9mcm9tIiwiZnJtX3Jlc3AiLCJmcm1fdHJhbnNwb3J0cyIsImJ5Qml0cyIsInRfZnJvbSIsImZfdGVzdCIsInRfcmVzcCIsInQwIiwidDEiLCJ0MiIsInQzIiwibWFwIiwiZiIsInRlc3RCaXRzIiwiY2hvb3NlIiwibHN0IiwiVCIsImIiLCJmbl9rZXkiLCJmbl90cmFuIiwiZm5fZnJvbSIsImZuX3Jlc3AiLCJmcm0iLCJiaW5kQXNzZW1ibGVkIiwiZl9wYWNrIiwiZl91bnBhY2siLCJwYWNrIiwidW5wYWNrIiwicGt0X3R5cGUiLCJwa3Rfb2JqIiwiVHlwZUVycm9yIiwidHlwZSIsIkRhdGFWaWV3IiwiQXJyYXlCdWZmZXIiLCJoZWFkZXIiLCJidWZmZXIiLCJzbGljZSIsInBrdCIsImJ1ZiIsImhlYWRlcl9idWZmZXIiLCJVaW50OEFycmF5IiwiaW5mbyIsIl9iaW5kX2l0ZXJhYmxlIiwiYnVmX2Nsb25lIiwidHRsIiwibmV4dCIsIm9wdGlvbnMiLCJ2YWx1ZSIsInBhY2tldFBhcnNlciIsImZyYWdtZW50X3NpemUiLCJjb25jYXRCdWZmZXJzIiwicGFja1BhY2tldE9iaiIsInBhY2tfdXRmOCIsInVucGFja191dGY4IiwiTnVtYmVyIiwicmFuZG9tX2lkIiwianNvbl9wYWNrIiwiY3JlYXRlU3RyZWFtIiwicGFja2V0RnJhZ21lbnRzIiwiY3JlYXRlTXVsdGlwYXJ0Iiwic2luayIsInBhcnRzIiwiZmVlZCIsImJvZHlfYnVmZmVyIiwiaW5jbHVkZXMiLCJkZWxldGVTdGF0ZUZvciIsInJlcyIsInJlY3ZEYXRhIiwicnN0cmVhbSIsInN0YXRlIiwiZmVlZF9pbml0IiwiYXNfY29udGVudCIsImZlZWRfaWdub3JlIiwianNvbl91bnBhY2siLCJib2R5X3V0ZjgiLCJyZWN2U3RyZWFtIiwicmVjdlN0cmVhbURhdGEiLCJiaW5kIiwib25fZXJyb3IiLCJmZWVkX2JvZHkiLCJkYXRhIiwib25fZGF0YSIsIm9uX2VuZCIsImZlZWRfc2VxIiwibmV4dF9oZHIiLCJpIiwibGFzdElubmVyIiwiYnl0ZUxlbmd0aCIsImkwIiwiYm9keSIsImJpbmRUcmFuc3BvcnRJbXBscyIsImluYm91bmQiLCJoaWdoYml0cyIsInRyYW5zcG9ydHMiLCJvdXRib3VuZCIsImZyYW1pbmdzIiwiZnJhbWUiLCJpbXBsIiwidF9yZWN2IiwicGFja19oZHIiLCJyZWN2X21zZyIsImJpbmRUcmFuc3BvcnRzIiwicGFja0JvZHkiLCJzdHJlYW1pbmciLCJzdHJlYW0iLCJiaW5kX3N0cmVhbSIsIm1vZGUiLCJjaGFuIiwibXNlbmQiLCJtc2VuZF9ieXRlcyIsIm1zZW5kX29iamVjdHMiLCJtc2VuZF9pbXBsIiwib2JqZWN0IiwiYnl0ZXMiLCJ3cml0ZSIsImVuZCIsImNodW5rIiwiY2hlY2tfZm5zIiwia2V5cyIsImtleSIsImpzb25fcHJvdG9jb2wiLCJzaGFyZWQiLCJkYXRhZ3JhbSIsImRpcmVjdCIsInJlY3ZNc2ciLCJzdGF0ZUZvciIsImJvZHlfYnVmIiwidW5wYWNrQm9keSIsImJpbmFyeV9wcm90b2NvbCIsImFzQnVmZmVyIiwicGt0X2J1ZmZlciIsImNvbnRyb2xfcHJvdG9jb2wiLCJoaWdoIiwicGluZ19mcmFtZSIsInBvbmdfZnJhbWUiLCJwb25nX3R5cGUiLCJyZWN2X3BvbmciLCJwaW5nX3R5cGUiLCJyZWN2X3BpbmciLCJwaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsInRzMCIsIkRhdGUiLCJyb3V0ZXIiLCJib2R5X2pzb24iLCJyZWN2Q3RybCIsIl9zZW5kX3BvbmciLCJwa3RfcGluZyIsInJfaWQiLCJ0czEiLCJkaXNwYXRjaCIsImluaXRfcHJvdG9jb2wiLCJzaGFyZWRfcHJvdG8iLCJqc29uIiwianNvbl9wcm90byIsImJpbmFyeSIsImJpbmFyeV9wcm90byIsImNvbnRyb2wiLCJjb250cm9sX3Byb3RvIiwiY29kZWNzIiwiZGVmYXVsdCIsIlNpbmsiLCJmb3JQcm90b2NvbHMiLCJwcm90b3R5cGUiLCJfcHJvdG9jb2wiLCJoYW5kbGVycyIsInVucmVnaXN0ZXIiLCJ1bnJlZ2lzdGVyVGFyZ2V0IiwicmVnaXN0ZXJUYXJnZXQiLCJfYmluZERpc3BhdGNoIiwib25fc2h1dGRvd24iLCJhbGl2ZSIsInByb3RvY29sIiwiaXNBbGl2ZSIsImV4dHJhIiwiYmluZFNpbmsiLCJ6b25lIiwidGVybWluYXRlIiwiaWZBYnNlbnQiLCJlbnRyeSIsImJ5X21zZ2lkIiwiZ2V0Iiwic2V0IiwiZGVsZXRlIiwiRVBUYXJnZXQiLCJpZCIsImVwX2VuY29kZSIsImFzX2pzb25fdW5wYWNrIiwibXNnX2N0eF90byIsInhmb3JtQnlLZXkiLCJ2IiwiZnJvbV9jdHgiLCJlcF9kZWNvZGUiLCJqc29uX3VucGFja194Zm9ybSIsImFzRW5kcG9pbnRJZCIsImVwX3RndCIsImZhc3QiLCJpbml0IiwiZmFzdF9qc29uIiwiZGVmaW5lUHJvcGVydGllcyIsInF1ZXJ5Iiwic2ltcGxlIiwiciIsInQiLCJ0b1N0cmluZyIsInNwbGl0IiwicGFyc2VJbnQiLCJzeiIsInBhcnNlIiwicmV2aXZlciIsInJlZyIsIldlYWtNYXAiLCJ4Zm4iLCJ2Zm4iLCJ3aXRoQ29kZWNzIiwiZm9ySHViIiwiY2hhbm5lbCIsInNlbmRSYXciLCJjaGFuX3NlbmQiLCJmcmVlemUiLCJjdHgiLCJfaW52b2tlX2V4IiwiX21zZ0NvZGVjcyIsIl9jb2RlYyIsInJlcGx5IiwiZm5PcktleSIsImFzc2VydE1vbml0b3IiLCJ0aGVuIiwicF9zZW50IiwiaW5pdFJlcGx5IiwidGd0Iiwic2VsZiIsImNsb25lIiwicmVwbHlfaWQiLCJ3aXRoIiwiY2hlY2tNb25pdG9yIiwiYWN0aXZlIiwibW9uaXRvciIsImluaXRNb25pdG9yIiwidHNfZHVyYXRpb24iLCJ0c19hY3RpdmUiLCJwcm9taXNlIiwidGQiLCJ0aWQiLCJ0c19pbnRlcnZhbCIsImN0cmwiLCJjb2RlYyIsImNoZWNrUGluZyIsInNldEludGVydmFsIiwidW5yZWYiLCJjbGVhciIsImNsZWFySW50ZXJ2YWwiLCJtc2dfY29kZWMiLCJtc2dDb2RlY3MiLCJuYW1lIiwiZW50cmllcyIsImpzb25fc2VuZCIsInBfcmVwbHkiLCJ0aW1lb3V0IiwiUmVwbHlUaW1lb3V0Iiwic2V0VGltZW91dCIsIm1zX3RpbWVvdXQiLCJFbmRwb2ludCIsInN1YmNsYXNzIiwiZXh0ZW5zaW9ucyIsImVwX3NlbGYiLCJ0b0pTT04iLCJ3aXRoRW5kcG9pbnQiLCJNYXAiLCJjcmVhdGVNYXAiLCJieV90b2tlbiIsImNyZWF0ZVJlcGx5TWFwIiwiYnlfdHJhZmZpYyIsImNyZWF0ZVRyYWZmaWNNYXAiLCJ0cmFmZmljIiwidHMiLCJub3ciLCJyZWN2VHJhZmZpYyIsImNyZWF0ZVN0YXRlTWFwIiwicm1zZyIsImlzX3JlcGx5IiwiYXNfc2VuZGVyIiwid2FybiIsImluaXRSZXBseVByb21pc2UiLCJjYXRjaCIsIndpdGhSZWplY3RUaW1lb3V0IiwiZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyIsImNsYXNzZXMiLCJwbHVnaW5fb3B0aW9ucyIsImRlZmF1bHRfb25fbXNnIiwiZGVmYXVsdF9vbl9lcnJvciIsImRlZmF1bHRfb25fc2h1dGRvd24iLCJlcF9raW5kcyIsIm9yZGVyIiwicG9zdCIsIkZhYnJpY0h1Yl9QSSIsImJhc2VzIiwiaXNQYWNrZXRQYXJzZXIiLCJwbHVnaW5fbmFtZSIsImJpbmRFbmRwb2ludEFwaSIsInByb3RvY29scyIsIk1zZ0N0eF9waSIsIlNpbmtCYXNlIiwiTXNnQ3R4QmFzZSIsIkVuZHBvaW50QmFzZSIsImNvbm5lY3Rfc2VsZiIsInNldFByb3RvdHlwZU9mIiwidGFyZ2V0cyIsImhhcyIsImlkX3NlbGYiLCJyZWFkeSIsIl9hZnRlcl9pbml0IiwicmVnaXN0ZXIiLCJlbmRwb2ludF9ub2RlanMiLCJyYW5kb21CeXRlcyIsInJlYWRJbnQzMkxFIiwiZW5kcG9pbnRfcGx1Z2luIl0sIm1hcHBpbmdzIjoiOzs7O0FBQU8sTUFBTUEsYUFBV0MsT0FBT0MsTUFBUCxDQUFnQkQsT0FBT0UsY0FBUCxDQUF3QixZQUFVLEVBQWxDLENBQWhCLENBQWpCO0FBQ1AsQUFBTyxTQUFTQyxXQUFULENBQXFCQyxLQUFyQixFQUE0QjtTQUMxQkMsTUFBUCxDQUFnQk4sVUFBaEIsRUFBMEJLLEtBQTFCOzs7QUNBRkQsWUFBYztpQkFDR0csR0FBZixFQUFvQjtVQUNaQyxTQUFTQyxlQUFlRixHQUFmLENBQWY7U0FDS0csUUFBTCxDQUFnQkYsTUFBaEI7V0FDT0EsT0FBT0csSUFBZDtHQUpVOztTQU1MLEdBQUdDLElBQVYsRUFBZ0I7UUFD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

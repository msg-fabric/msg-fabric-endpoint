(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global['msg-fabric-sink'] = factory());
}(this, (function () { 'use strict';

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

const getRandomValues = 'undefined' !== typeof window ? window.crypto.getRandomValues : null;

endpoint_browser.random_id = random_id;
function random_id() {
  const arr = new Int32Array(1);
  getRandomValues(arr);
  return arr[0];
}

function endpoint_browser(plugin_options = {}) {
  if (null == plugin_options.random_id) {
    plugin_options.random_id = random_id;
  }

  return endpoint_plugin(plugin_options);
}

return endpoint_browser;

})));
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3Nlci51bWQuanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvZXBfa2luZHMvZXh0ZW5zaW9ucy5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2NsaWVudC5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2FwaS5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2luZGV4LmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvZnJhbWluZy5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL3NoYXJlZC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2pzb24uanN5IiwiLi4vY29kZS9wcm90b2NvbC9iaW5hcnkuanN5IiwiLi4vY29kZS9wcm90b2NvbC9jb250cm9sLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvaW5kZXguanN5IiwiLi4vY29kZS9zaW5rLmpzeSIsIi4uL2NvZGUvZXBfdGFyZ2V0LmpzeSIsIi4uL2NvZGUvbXNnY3R4LmpzeSIsIi4uL2NvZGUvZW5kcG9pbnQuanN5IiwiLi4vY29kZS9wbHVnaW4uanN5IiwiLi4vY29kZS9pbmRleC5icm93c2VyLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgY29uc3QgZXBfcHJvdG8gPSBPYmplY3QuY3JlYXRlIEAgT2JqZWN0LmdldFByb3RvdHlwZU9mIEAgZnVuY3Rpb24oKXt9XG5leHBvcnQgZnVuY3Rpb24gYWRkX2VwX2tpbmQoa2luZHMpIDo6XG4gIE9iamVjdC5hc3NpZ24gQCBlcF9wcm90bywga2luZHNcbmV4cG9ydCBkZWZhdWx0IGFkZF9lcF9raW5kXG4iLCJpbXBvcnQgYWRkX2VwX2tpbmQgZnJvbSAnLi9leHRlbnNpb25zLmpzeSdcblxuYWRkX2VwX2tpbmQgQDpcbiAgY2xpZW50RW5kcG9pbnQoYXBpKSA6OlxuICAgIGNvbnN0IHRhcmdldCA9IGNsaWVudEVuZHBvaW50KGFwaSlcbiAgICB0aGlzLmVuZHBvaW50IEAgdGFyZ2V0XG4gICAgcmV0dXJuIHRhcmdldC5kb25lXG5cbiAgY2xpZW50KC4uLmFyZ3MpIDo6XG4gICAgaWYgMSA9PT0gYXJncy5sZW5ndGggJiYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGFyZ3NbMF0gOjpcbiAgICAgIHJldHVybiB0aGlzLmNsaWVudEVuZHBvaW50IEAgYXJnc1swXVxuXG4gICAgY29uc3QgbXNnX2N0eCA9IG5ldyB0aGlzLk1zZ0N0eCgpXG4gICAgcmV0dXJuIDAgIT09IGFyZ3MubGVuZ3RoID8gbXNnX2N0eC50byguLi5hcmdzKSA6IG1zZ19jdHhcblxuXG5jb25zdCBlcF9jbGllbnRfYXBpID0gQHt9XG4gIGFzeW5jIG9uX3JlYWR5KGVwLCBodWIpIDo6XG4gICAgdGhpcy5fcmVzb2x2ZSBAIGF3YWl0IHRoaXMub25fY2xpZW50X3JlYWR5KGVwLCBodWIpXG4gICAgYXdhaXQgZXAuc2h1dGRvd24oKVxuICBvbl9zZW5kX2Vycm9yKGVwLCBlcnIpIDo6XG4gICAgdGhpcy5fcmVqZWN0KGVycilcbiAgb25fc2h1dGRvd24oZXAsIGVycikgOjpcbiAgICBlcnIgPyB0aGlzLl9yZWplY3QoZXJyKSA6IHRoaXMuX3Jlc29sdmUoKVxuXG5leHBvcnQgZnVuY3Rpb24gY2xpZW50RW5kcG9pbnQob25fY2xpZW50X3JlYWR5KSA6OlxuICBsZXQgdGFyZ2V0ID0gT2JqZWN0LmNyZWF0ZSBAIGVwX2NsaWVudF9hcGlcbiAgdGFyZ2V0Lm9uX2NsaWVudF9yZWFkeSA9IG9uX2NsaWVudF9yZWFkeVxuICB0YXJnZXQuZG9uZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICB0YXJnZXQuX3Jlc29sdmUgPSByZXNvbHZlXG4gICAgdGFyZ2V0Ll9yZWplY3QgPSByZWplY3RcbiAgcmV0dXJuIHRhcmdldFxuIiwiaW1wb3J0IGFkZF9lcF9raW5kIGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIGFwaShhcGkpIDo6IHJldHVybiB0aGlzLmVuZHBvaW50IEAgYXNBUElFbmRwb2ludChhcGkpXG5cbmV4cG9ydCBmdW5jdGlvbiBhc0FQSUVuZHBvaW50KGFwaSkgOjpcbiAgcmV0dXJuIChlcCwgaHViKSA9PiA6OlxuICAgIGNvbnN0IGludm9rZSA9IGFzX3JwYyhhcGksIGVwLCBodWIpXG4gICAgcmV0dXJuIG9uX21zZ1xuXG4gICAgYXN5bmMgZnVuY3Rpb24gb25fbXNnKHttc2csIHNlbmRlcn0pIDo6XG4gICAgICBhd2FpdCBpbnZva2UgQCBtc2csIHNlbmRlclxuXG5leHBvcnQgZnVuY3Rpb24gYXNfcnBjKGFwaSwgZXAsIGh1YikgOjpcbiAgY29uc3QgYXBpX2Zvcl9vcCA9ICdmdW5jdGlvbicgPT09IHR5cGVvZiBhcGlcbiAgICA/IG9wID0+IGFwaShvcCwgZXAsIGh1YilcbiAgICA6IG9wID0+IGFwaVtvcF1cblxuICByZXR1cm4gT2JqZWN0LmFzc2lnbiBAIGludm9rZSwgQHt9XG4gICAgaW52b2tlLCByZXNvbHZlX2ZuLCBpbnZva2VfZm4sIGFwaV9mb3Jfb3BcblxuICBhc3luYyBmdW5jdGlvbiBpbnZva2UobXNnLCBzZW5kZXIpIDo6XG4gICAgY29uc3Qge29wLCBrd30gPSBtc2dcbiAgICBjb25zdCBmbiA9IGF3YWl0IHJlc29sdmVfZm4gQCBvcCwgc2VuZGVyXG4gICAgaWYgdW5kZWZpbmVkICE9PSBmbiA6OlxuICAgICAgYXdhaXQgaW52b2tlX2ZuIEAgb3AsIHNlbmRlciwgKCkgPT4gZm4oa3cpXG5cbiAgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZV9mbihvcCwgc2VuZGVyKSA6OlxuICAgIGlmICdzdHJpbmcnICE9PSB0eXBlb2Ygb3AgfHwgISBvcFswXS5tYXRjaCgvW0EtWmEtel0vKSA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiBlcFxuICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6ICdJbnZhbGlkIG9wZXJhdGlvbicsIGNvZGU6IDQwMFxuXG4gICAgdHJ5IDo6XG4gICAgICBjb25zdCBmbiA9IGF3YWl0IGFwaV9mb3Jfb3Aob3ApXG4gICAgICBpZiAhIGZuIDo6XG4gICAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogZXBcbiAgICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6ICdVbmtub3duIG9wZXJhdGlvbicsIGNvZGU6IDQwNFxuICAgICAgcmV0dXJuIGZuXG4gICAgY2F0Y2ggZXJyIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgZXJyX2Zyb206IGVwXG4gICAgICAgIGVycm9yOiBAe30gbWVzc2FnZTogYEludmFsaWQgb3BlcmF0aW9uOiAke2Vyci5tZXNzYWdlfWAsIGNvZGU6IDUwMFxuXG4gIGFzeW5jIGZ1bmN0aW9uIGludm9rZV9mbihvcCwgc2VuZGVyLCBjYikgOjpcbiAgICB0cnkgOjpcbiAgICAgIHZhciBhbnN3ZXIgPSBhd2FpdCBjYigpXG4gICAgY2F0Y2ggZXJyIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgZXJyX2Zyb206IGVwLCBlcnJvcjogZXJyXG4gICAgICByZXR1cm4gZmFsc2VcblxuICAgIGlmIHNlbmRlci5yZXBseUV4cGVjdGVkIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBvcCwgYW5zd2VyXG4gICAgcmV0dXJuIHRydWVcblxuIiwiaW1wb3J0IHthZGRfZXBfa2luZCwgZXBfcHJvdG99IGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIHNlcnZlcihvbl9pbml0KSA6OiByZXR1cm4gdGhpcy5lbmRwb2ludCBAIG9uX2luaXRcblxuZXhwb3J0ICogZnJvbSAnLi9jbGllbnQuanN5J1xuZXhwb3J0ICogZnJvbSAnLi9hcGkuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBlcF9wcm90b1xuIiwiY29uc3QgbGl0dGxlX2VuZGlhbiA9IHRydWVcbmNvbnN0IGNfc2luZ2xlID0gJ3NpbmdsZSdcbmNvbnN0IGNfZGF0YWdyYW0gPSAnZGF0YWdyYW0nXG5jb25zdCBjX2RpcmVjdCA9ICdkaXJlY3QnXG5jb25zdCBjX211bHRpcGFydCA9ICdtdWx0aXBhcnQnXG5jb25zdCBjX3N0cmVhbWluZyA9ICdzdHJlYW1pbmcnXG5cbmNvbnN0IF9lcnJfbXNnaWRfcmVxdWlyZWQgPSBgUmVzcG9uc2UgcmVxaXJlcyAnbXNnaWQnYFxuY29uc3QgX2Vycl90b2tlbl9yZXF1aXJlZCA9IGBUcmFuc3BvcnQgcmVxaXJlcyAndG9rZW4nYFxuXG5cbmZ1bmN0aW9uIGZybV9yb3V0aW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDEsIG1hc2sgPSAweDFcbiAgcmV0dXJuIEB7fVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBudWxsICE9IG9iai5mcm9tX2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgY29uc3Qge2Zyb21faWR9ID0gb2JqXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCAwfGZyb21faWQuaWRfcm91dGVyLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQzMiBAIDQrb2Zmc2V0LCAwfGZyb21faWQuaWRfdGFyZ2V0LCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCBmcm9tX2lkID0gdW5kZWZpbmVkID09PSBvYmouZnJvbV9pZFxuICAgICAgICA/IG9iai5mcm9tX2lkID0ge30gOiBvYmouZnJvbV9pZFxuICAgICAgZnJvbV9pZC5pZF9yb3V0ZXIgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBmcm9tX2lkLmlkX3RhcmdldCA9IGR2LmdldEludDMyIEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuZnVuY3Rpb24gZnJtX3Jlc3BvbnNlKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDIsIG1hc2sgPSAweDJcbiAgcmV0dXJuIEB7fVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBudWxsICE9IG9iai5tc2dpZCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLm1zZ2lkIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfbXNnaWRfcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai5tc2dpZCwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxX2FjaywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouYWNrX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudG9rZW4gPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2FjayA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5hY2tfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG5cblxuXG5mdW5jdGlvbiBmcm1fZGF0YWdyYW0oKSA6OlxuICBjb25zdCBzaXplID0gMCwgYml0cyA9IDB4MCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19kYXRhZ3JhbVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6XG4gICAgICBpZiBjX2RhdGFncmFtID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEgb2JqLnRva2VuID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGF0YWdyYW1cblxuZnVuY3Rpb24gZnJtX2RpcmVjdCgpIDo6XG4gIGNvbnN0IHNpemUgPSA0LCBiaXRzID0gMHg0LCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RpcmVjdFxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6XG4gICAgICBpZiBjX2RpcmVjdCA9PT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gYml0c1xuICAgICAgaWYgb2JqLnRyYW5zcG9ydCAmJiBjX3NpbmdsZSAhPT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gZmFsc2VcbiAgICAgIHJldHVybiAhISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX2RpcmVjdFxuXG5mdW5jdGlvbiBmcm1fbXVsdGlwYXJ0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDgsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfbXVsdGlwYXJ0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfbXVsdGlwYXJ0ID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6IC8vIHVzZSBzZXFfbmV4dFxuICAgICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwLCBsaXR0bGVfZW5kaWFuXG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19tdWx0aXBhcnRcblxuZnVuY3Rpb24gZnJtX3N0cmVhbWluZygpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHhjLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX3N0cmVhbWluZ1xuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBjX3N0cmVhbWluZyA9PT0gb2JqLnRyYW5zcG9ydCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgYmluZF9zZXFfbmV4dCwgc2VxX3BvczogNFxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cbiAgICAgIGlmIHRydWUgPT0gb2JqLnNlcSA6OlxuICAgICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwLCBsaXR0bGVfZW5kaWFuIC8vIHVzZSBzZXFfbmV4dFxuICAgICAgZWxzZSBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLnNlcV9mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkICAgICA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXEgICAgICAgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfc3RyZWFtaW5nXG5cblxuZnVuY3Rpb24gYmluZF9zZXFfbmV4dChvZmZzZXQpIDo6XG4gIGNvbnN0IHNlcV9vZmZzZXQgPSB0aGlzLnNlcV9wb3MgKyBvZmZzZXRcbiAgbGV0IHNlcSA9IDFcbiAgcmV0dXJuIGZ1bmN0aW9uIHNlcV9uZXh0KHtmbGFncywgZmlufSwgZHYpIDo6XG4gICAgaWYgISBmaW4gOjpcbiAgICAgIGR2LnNldEludDE2IEAgc2VxX29mZnNldCwgc2VxKyssIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgZWxzZSA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCAtc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDIrc2VxX29mZnNldCwgMHxmbGFncywgbGl0dGxlX2VuZGlhblxuICAgICAgc2VxID0gTmFOXG5cblxuXG5leHBvcnQgZGVmYXVsdCBjb21wb3NlRnJhbWluZ3MoKVxuZnVuY3Rpb24gY29tcG9zZUZyYW1pbmdzKCkgOjpcbiAgY29uc3QgZnJtX2Zyb20gPSBmcm1fcm91dGluZygpLCBmcm1fcmVzcCA9IGZybV9yZXNwb25zZSgpXG4gIGNvbnN0IGZybV90cmFuc3BvcnRzID0gQFtdIGZybV9kYXRhZ3JhbSgpLCBmcm1fZGlyZWN0KCksIGZybV9tdWx0aXBhcnQoKSwgZnJtX3N0cmVhbWluZygpXG5cbiAgaWYgOCAhPT0gZnJtX2Zyb20uc2l6ZSB8fCA4ICE9PSBmcm1fcmVzcC5zaXplIHx8IDQgIT0gZnJtX3RyYW5zcG9ydHMubGVuZ3RoIDo6XG4gICAgdGhyb3cgbmV3IEVycm9yIEAgYEZyYW1pbmcgU2l6ZSBjaGFuZ2VgXG5cbiAgY29uc3QgYnlCaXRzID0gW10sIG1hc2s9MHhmXG5cbiAgOjpcbiAgICBjb25zdCB0X2Zyb20gPSBmcm1fZnJvbS5mX3Rlc3QsIHRfcmVzcCA9IGZybV9yZXNwLmZfdGVzdFxuICAgIGNvbnN0IFt0MCx0MSx0Mix0M10gPSBmcm1fdHJhbnNwb3J0cy5tYXAgQCBmPT5mLmZfdGVzdFxuXG4gICAgY29uc3QgdGVzdEJpdHMgPSBieUJpdHMudGVzdEJpdHMgPSBvYmogPT5cbiAgICAgIDAgfCB0X2Zyb20ob2JqKSB8IHRfcmVzcChvYmopIHwgdDAob2JqKSB8IHQxKG9iaikgfCB0MihvYmopIHwgdDMob2JqKVxuXG4gICAgYnlCaXRzLmNob29zZSA9IGZ1bmN0aW9uIChvYmosIGxzdCkgOjpcbiAgICAgIGlmIG51bGwgPT0gbHN0IDo6IGxzdCA9IHRoaXMgfHwgYnlCaXRzXG4gICAgICByZXR1cm4gbHN0W3Rlc3RCaXRzKG9iaildXG5cblxuICBmb3IgY29uc3QgVCBvZiBmcm1fdHJhbnNwb3J0cyA6OlxuICAgIGNvbnN0IHtiaXRzOmIsIHNpemUsIHRyYW5zcG9ydH0gPSBUXG5cbiAgICBieUJpdHNbYnwwXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MCwgbWFzaywgc2l6ZTogc2l6ZSwgb3A6ICcnXG4gICAgYnlCaXRzW2J8MV0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDEsIG1hc2ssIHNpemU6IDggKyBzaXplLCBvcDogJ2YnXG4gICAgYnlCaXRzW2J8Ml0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDIsIG1hc2ssIHNpemU6IDggKyBzaXplLCBvcDogJ3InXG4gICAgYnlCaXRzW2J8M10gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDMsIG1hc2ssIHNpemU6IDE2ICsgc2l6ZSwgb3A6ICdmcidcblxuICAgIGZvciBjb25zdCBmbl9rZXkgb2YgWydmX3BhY2snLCAnZl91bnBhY2snXSA6OlxuICAgICAgY29uc3QgZm5fdHJhbiA9IFRbZm5fa2V5XSwgZm5fZnJvbSA9IGZybV9mcm9tW2ZuX2tleV0sIGZuX3Jlc3AgPSBmcm1fcmVzcFtmbl9rZXldXG5cbiAgICAgIGJ5Qml0c1tifDBdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl90cmFuKG9iaiwgZHYsIDApXG4gICAgICBieUJpdHNbYnwxXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fZnJvbShvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8Ml1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3Jlc3Aob2JqLCBkdiwgMCk7IGZuX3RyYW4ob2JqLCBkdiwgOClcbiAgICAgIGJ5Qml0c1tifDNdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl9yZXNwKG9iaiwgZHYsIDgpOyBmbl90cmFuKG9iaiwgZHYsIDE2KVxuXG4gIGZvciBjb25zdCBmcm0gb2YgYnlCaXRzIDo6XG4gICAgYmluZEFzc2VtYmxlZCBAIGZybVxuXG4gIHJldHVybiBieUJpdHNcblxuXG5mdW5jdGlvbiBiaW5kQXNzZW1ibGVkKGZybSkgOjpcbiAgY29uc3Qge1QsIHNpemUsIGZfcGFjaywgZl91bnBhY2t9ID0gZnJtXG4gIGlmIFQuYmluZF9zZXFfbmV4dCA6OlxuICAgIGZybS5zZXFfbmV4dCA9IFQuYmluZF9zZXFfbmV4dCBAIGZybS5zaXplIC0gVC5zaXplXG5cbiAgZGVsZXRlIGZybS5UXG4gIGZybS5wYWNrID0gcGFjayA7IGZybS51bnBhY2sgPSB1bnBhY2tcbiAgY29uc3Qgc2VxX25leHQgPSBmcm0uc2VxX25leHRcblxuICBmdW5jdGlvbiBwYWNrKHBrdF90eXBlLCBwa3Rfb2JqKSA6OlxuICAgIGlmICEgQCAwIDw9IHBrdF90eXBlICYmIHBrdF90eXBlIDw9IDI1NSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwa3RfdHlwZSB0byBiZSBbMC4uMjU1XWBcblxuICAgIHBrdF9vYmoudHlwZSA9IHBrdF90eXBlXG4gICAgaWYgc2VxX25leHQgJiYgbnVsbCA9PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgcGt0X29iai5zZXEgPSB0cnVlXG5cbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyBAIG5ldyBBcnJheUJ1ZmZlcihzaXplKVxuICAgIGZfcGFjayhwa3Rfb2JqLCBkdiwgMClcbiAgICBwa3Rfb2JqLmhlYWRlciA9IGR2LmJ1ZmZlclxuXG4gICAgaWYgdHJ1ZSA9PT0gcGt0X29iai5zZXEgOjpcbiAgICAgIF9iaW5kX2l0ZXJhYmxlIEAgcGt0X29iaiwgZHYuYnVmZmVyLnNsaWNlKDAsc2l6ZSlcblxuICBmdW5jdGlvbiB1bnBhY2socGt0KSA6OlxuICAgIGNvbnN0IGJ1ZiA9IHBrdC5oZWFkZXJfYnVmZmVyKClcbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyBAIG5ldyBVaW50OEFycmF5KGJ1ZikuYnVmZmVyXG5cbiAgICBjb25zdCBpbmZvID0ge31cbiAgICBmX3VucGFjayhpbmZvLCBkdiwgMClcbiAgICByZXR1cm4gcGt0LmluZm8gPSBpbmZvXG5cbiAgZnVuY3Rpb24gX2JpbmRfaXRlcmFibGUocGt0X29iaiwgYnVmX2Nsb25lKSA6OlxuICAgIGNvbnN0IHt0eXBlfSA9IHBrdF9vYmpcbiAgICBjb25zdCB7aWRfcm91dGVyLCBpZF90YXJnZXQsIHR0bCwgdG9rZW59ID0gcGt0X29ialxuICAgIHBrdF9vYmoubmV4dCA9IG5leHRcblxuICAgIGZ1bmN0aW9uIG5leHQob3B0aW9ucykgOjpcbiAgICAgIGlmIG51bGwgPT0gb3B0aW9ucyA6OiBvcHRpb25zID0ge31cbiAgICAgIGNvbnN0IGhlYWRlciA9IGJ1Zl9jbG9uZS5zbGljZSgpXG4gICAgICBzZXFfbmV4dCBAIG9wdGlvbnMsIG5ldyBEYXRhVmlldyBAIGhlYWRlclxuICAgICAgcmV0dXJuIEB7fSBkb25lOiAhISBvcHRpb25zLmZpbiwgdmFsdWU6IEB7fSAvLyBwa3Rfb2JqXG4gICAgICAgIGlkX3JvdXRlciwgaWRfdGFyZ2V0LCB0eXBlLCB0dGwsIHRva2VuLCBoZWFkZXJcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBhY2tldFBhcnNlciwgb3B0aW9ucywgZnJhZ21lbnRfc2l6ZSkgOjpcbiAgY29uc3Qge2NvbmNhdEJ1ZmZlcnMsIHBhY2tQYWNrZXRPYmosIHBhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gcGFja2V0UGFyc2VyXG4gIGZyYWdtZW50X3NpemUgPSBOdW1iZXIoZnJhZ21lbnRfc2l6ZSB8fCA4MDAwKVxuICBpZiAxMDI0ID4gZnJhZ21lbnRfc2l6ZSB8fCA2NTAwMCA8IGZyYWdtZW50X3NpemUgOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgSW52YWxpZCBmcmFnbWVudCBzaXplOiAke2ZyYWdtZW50X3NpemV9YFxuXG4gIGNvbnN0IHtyYW5kb21faWQsIGpzb25fcGFja30gPSBvcHRpb25zXG4gIHJldHVybiBAOiBwYWNrZXRQYXJzZXIsIHJhbmRvbV9pZCwganNvbl9wYWNrXG4gICAgY3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIHBhY2tldEZyYWdtZW50c1xuICAgIGJpbmRUcmFuc3BvcnRzXG5cblxuICBmdW5jdGlvbiBjcmVhdGVNdWx0aXBhcnQocGt0LCBzaW5rLCBtc2dpZCkgOjpcbiAgICBsZXQgcGFydHMgPSBbXSwgZmluID0gZmFsc2VcbiAgICByZXR1cm4gQHt9IGZlZWQsIGluZm86IHBrdC5pbmZvXG5cbiAgICBmdW5jdGlvbiBmZWVkKHBrdCkgOjpcbiAgICAgIGxldCBzZXEgPSBwa3QuaW5mby5zZXFcbiAgICAgIGlmIHNlcSA8IDAgOjogZmluID0gdHJ1ZTsgc2VxID0gLXNlcVxuICAgICAgcGFydHNbc2VxLTFdID0gcGt0LmJvZHlfYnVmZmVyKClcblxuICAgICAgaWYgISBmaW4gOjogcmV0dXJuXG4gICAgICBpZiBwYXJ0cy5pbmNsdWRlcyBAIHVuZGVmaW5lZCA6OiByZXR1cm5cblxuICAgICAgc2luay5kZWxldGVTdGF0ZUZvcihtc2dpZClcblxuICAgICAgY29uc3QgcmVzID0gY29uY2F0QnVmZmVycyhwYXJ0cylcbiAgICAgIHBhcnRzID0gbnVsbFxuICAgICAgcmV0dXJuIHJlc1xuXG4gIGZ1bmN0aW9uIGNyZWF0ZVN0cmVhbShwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBuZXh0PTAsIGZpbiA9IGZhbHNlLCByZWN2RGF0YSwgcnN0cmVhbVxuICAgIGNvbnN0IHN0YXRlID0gQHt9IGZlZWQ6IGZlZWRfaW5pdCwgaW5mbzogcGt0LmluZm9cbiAgICByZXR1cm4gc3RhdGVcblxuICAgIGZ1bmN0aW9uIGZlZWRfaW5pdChwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcblxuICAgICAgY29uc3QgaW5mbyA9IHBrdC5pbmZvXG4gICAgICBjb25zdCBtc2cgPSBzaW5rLmpzb25fdW5wYWNrIEAgcGt0LmJvZHlfdXRmOCgpXG4gICAgICByc3RyZWFtID0gc2luay5yZWN2U3RyZWFtKG1zZywgaW5mbylcbiAgICAgIGlmIG51bGwgPT0gcnN0cmVhbSA6OiByZXR1cm5cbiAgICAgIGNoZWNrX2ZucyBAIHJzdHJlYW0sICdvbl9lcnJvcicsICdvbl9kYXRhJywgJ29uX2VuZCcgXG4gICAgICByZWN2RGF0YSA9IHNpbmsucmVjdlN0cmVhbURhdGEuYmluZChzaW5rLCByc3RyZWFtLCBpbmZvKVxuXG4gICAgICB0cnkgOjpcbiAgICAgICAgZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfYm9keVxuICAgICAgaWYgcnN0cmVhbS5vbl9pbml0IDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2luaXQobXNnLCBwa3QpXG5cbiAgICBmdW5jdGlvbiBmZWVkX2JvZHkocGt0LCBhc19jb250ZW50KSA6OlxuICAgICAgcmVjdkRhdGEoKVxuICAgICAgbGV0IGRhdGFcbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICAgIGRhdGEgPSBhc19jb250ZW50KHBrdCwgc2luaylcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lcnJvciBAIGVyciwgcGt0XG5cbiAgICAgIGlmIGZpbiA6OlxuICAgICAgICBjb25zdCByZXMgPSByc3RyZWFtLm9uX2RhdGEgQCBkYXRhLCBwa3RcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZW5kIEAgcmVzLCBwa3RcbiAgICAgIGVsc2UgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuXG4gICAgZnVuY3Rpb24gZmVlZF9pZ25vcmUocGt0KSA6OlxuICAgICAgdHJ5IDo6IGZlZWRfc2VxKHBrdClcbiAgICAgIGNhdGNoIGVyciA6OlxuXG4gICAgZnVuY3Rpb24gZmVlZF9zZXEocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxID49IDAgOjpcbiAgICAgICAgaWYgbmV4dCsrID09PSBzZXEgOjpcbiAgICAgICAgICByZXR1cm4gLy8gaW4gb3JkZXJcbiAgICAgIGVsc2UgOjpcbiAgICAgICAgZmluID0gdHJ1ZVxuICAgICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuICAgICAgICBpZiBuZXh0ID09PSAtc2VxIDo6XG4gICAgICAgICAgbmV4dCA9ICdkb25lJ1xuICAgICAgICAgIHJldHVybiAvLyBpbi1vcmRlciwgbGFzdCBwYWNrZXRcblxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfaWdub3JlXG4gICAgICBuZXh0ID0gJ2ludmFsaWQnXG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgUGFja2V0IG91dCBvZiBzZXF1ZW5jZWBcblxuICBmdW5jdGlvbiAqIHBhY2tldEZyYWdtZW50cyhidWYsIG5leHRfaGRyLCBmaW4pIDo6XG4gICAgaWYgbnVsbCA9PSBidWYgOjpcbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKHtmaW59KVxuICAgICAgeWllbGQgb2JqXG4gICAgICByZXR1cm5cblxuICAgIGxldCBpID0gMCwgbGFzdElubmVyID0gYnVmLmJ5dGVMZW5ndGggLSBmcmFnbWVudF9zaXplO1xuICAgIHdoaWxlIGkgPCBsYXN0SW5uZXIgOjpcbiAgICAgIGNvbnN0IGkwID0gaVxuICAgICAgaSArPSBmcmFnbWVudF9zaXplXG5cbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKClcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkwLCBpKVxuICAgICAgeWllbGQgb2JqXG5cbiAgICA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICBvYmouYm9keSA9IGJ1Zi5zbGljZShpKVxuICAgICAgeWllbGQgb2JqXG5cblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRJbXBscyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cykgOjpcbiAgICBjb25zdCBvdXRib3VuZCA9IFtdXG4gICAgb3V0Ym91bmQuY2hvb3NlID0gZnJhbWluZ3MuY2hvb3NlXG5cbiAgICBmb3IgY29uc3QgZnJhbWUgb2YgZnJhbWluZ3MgOjpcbiAgICAgIGNvbnN0IGltcGwgPSBmcmFtZSA/IHRyYW5zcG9ydHNbZnJhbWUudHJhbnNwb3J0XSA6IG51bGxcbiAgICAgIGlmICEgaW1wbCA6OiBjb250aW51ZVxuXG4gICAgICBjb25zdCB7Yml0cywgcGFjaywgdW5wYWNrfSA9IGZyYW1lXG4gICAgICBjb25zdCBwa3RfdHlwZSA9IGhpZ2hiaXRzIHwgYml0c1xuICAgICAgY29uc3Qge3RfcmVjdn0gPSBpbXBsXG5cbiAgICAgIGZ1bmN0aW9uIHBhY2tfaGRyKG9iaikgOjpcbiAgICAgICAgcGFjayhwa3RfdHlwZSwgb2JqKVxuICAgICAgICByZXR1cm4gb2JqXG5cbiAgICAgIGZ1bmN0aW9uIHJlY3ZfbXNnKHBrdCwgc2luaykgOjpcbiAgICAgICAgdW5wYWNrKHBrdClcbiAgICAgICAgcmV0dXJuIHRfcmVjdihwa3QsIHNpbmspXG5cbiAgICAgIHBhY2tfaGRyLnBrdF90eXBlID0gcmVjdl9tc2cucGt0X3R5cGUgPSBwa3RfdHlwZVxuICAgICAgb3V0Ym91bmRbYml0c10gPSBwYWNrX2hkclxuICAgICAgaW5ib3VuZFtwa3RfdHlwZV0gPSByZWN2X21zZ1xuXG4gICAgICBpZiAncHJvZHVjdGlvbicgIT09IHByb2Nlc3MuZW52Lk5PREVfRU5WIDo6XG4gICAgICAgIGNvbnN0IG9wID0gcGFja19oZHIub3AgPSByZWN2X21zZy5vcCA9IGZyYW1lLm9wXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSBAIHBhY2tfaGRyLCAnbmFtZScsIEB7fSB2YWx1ZTogYHBhY2tfaGRyIMKrJHtvcH3Cu2BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcmVjdl9tc2csICduYW1lJywgQHt9IHZhbHVlOiBgcmVjdl9tc2cgwqske29wfcK7YFxuXG4gICAgcmV0dXJuIG91dGJvdW5kXG5cblxuICBmdW5jdGlvbiBiaW5kVHJhbnNwb3J0cyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cykgOjpcbiAgICBjb25zdCBwYWNrQm9keSA9IHRyYW5zcG9ydHMucGFja0JvZHlcbiAgICBjb25zdCBvdXRib3VuZCA9IGJpbmRUcmFuc3BvcnRJbXBscyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cylcbiAgICByZXR1cm4gdHJhbnNwb3J0cy5zdHJlYW1pbmdcbiAgICAgID8gQHt9IHNlbmQsIHN0cmVhbTogYmluZF9zdHJlYW0gQCB0cmFuc3BvcnRzLnN0cmVhbWluZy5tb2RlXG4gICAgICA6IEB7fSBzZW5kXG5cbiAgICBmdW5jdGlvbiBzZW5kKGNoYW4sIG9iaiwgYm9keSkgOjpcbiAgICAgIGJvZHkgPSBwYWNrQm9keShib2R5KVxuICAgICAgaWYgZnJhZ21lbnRfc2l6ZSA8IGJvZHkuYnl0ZUxlbmd0aCA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBvYmoudHJhbnNwb3J0ID0gJ211bHRpcGFydCdcbiAgICAgICAgY29uc3QgbXNlbmQgPSBtc2VuZF9ieXRlcyhjaGFuLCBvYmopXG4gICAgICAgIHJldHVybiBtc2VuZCBAIHRydWUsIGJvZHlcblxuICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzaW5nbGUnXG4gICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBwYWNrX2hkcihvYmopXG4gICAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gICAgZnVuY3Rpb24gbXNlbmRfYnl0ZXMoY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBsZXQge25leHR9ID0gcGFja19oZHIob2JqKVxuICAgICAgaWYgbnVsbCAhPT0gbXNnIDo6XG4gICAgICAgIG9iai5ib2R5ID0gbXNnXG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgY2hhbiBAIHBrdFxuXG4gICAgICByZXR1cm4gYXN5bmMgZnVuY3Rpb24gKGZpbiwgYm9keSkgOjpcbiAgICAgICAgaWYgbnVsbCA9PT0gbmV4dCA6OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvciBAICdXcml0ZSBhZnRlciBlbmQnXG4gICAgICAgIGxldCByZXNcbiAgICAgICAgZm9yIGNvbnN0IG9iaiBvZiBwYWNrZXRGcmFnbWVudHMgQCBib2R5LCBuZXh0LCBmaW4gOjpcbiAgICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgICAgcmVzID0gYXdhaXQgY2hhbiBAIHBrdFxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIHJlc1xuXG4gICAgZnVuY3Rpb24gbXNlbmRfb2JqZWN0cyhjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGxldCB7bmV4dH0gPSBwYWNrX2hkcihvYmopXG4gICAgICBpZiBudWxsICE9PSBtc2cgOjpcbiAgICAgICAgb2JqLmJvZHkgPSBtc2dcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBjaGFuIEAgcGt0XG5cbiAgICAgIHJldHVybiBmdW5jdGlvbiAoZmluLCBib2R5KSA6OlxuICAgICAgICBpZiBudWxsID09PSBuZXh0IDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgJ1dyaXRlIGFmdGVyIGVuZCdcbiAgICAgICAgY29uc3Qgb2JqID0gbmV4dCh7ZmlufSlcbiAgICAgICAgb2JqLmJvZHkgPSBib2R5XG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgaWYgZmluIDo6IG5leHQgPSBudWxsXG4gICAgICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgICBmdW5jdGlvbiBiaW5kX3N0cmVhbShtb2RlKSA6OlxuICAgICAgY29uc3QgbXNlbmRfaW1wbCA9IHtvYmplY3Q6IG1zZW5kX29iamVjdHMsIGJ5dGVzOiBtc2VuZF9ieXRlc31bbW9kZV1cbiAgICAgIGlmIG1zZW5kX2ltcGwgOjogcmV0dXJuIHN0cmVhbVxuXG4gICAgICBmdW5jdGlvbiBzdHJlYW0oY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIG9iai50cmFuc3BvcnQgPSAnc3RyZWFtaW5nJ1xuICAgICAgICBjb25zdCBtc2VuZCA9IG1zZW5kX2ltcGwgQCBjaGFuLCBvYmosIGpzb25fcGFjayhtc2cpXG4gICAgICAgIHdyaXRlLndyaXRlID0gd3JpdGU7IHdyaXRlLmVuZCA9IHdyaXRlLmJpbmQodHJ1ZSlcbiAgICAgICAgcmV0dXJuIHdyaXRlXG5cbiAgICAgICAgZnVuY3Rpb24gd3JpdGUoY2h1bmspIDo6XG4gICAgICAgICAgcmV0dXJuIGNodW5rICE9IG51bGxcbiAgICAgICAgICAgID8gbXNlbmQgQCB0cnVlPT09dGhpcywgcGFja0JvZHkoY2h1bmspXG4gICAgICAgICAgICA6IG1zZW5kIEAgdHJ1ZVxuXG5cbmZ1bmN0aW9uIGNoZWNrX2ZucyhvYmosIC4uLmtleXMpIDo6XG4gIGZvciBjb25zdCBrZXkgb2Yga2V5cyA6OlxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBvYmpba2V5XSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBcIiR7a2V5fVwiIHRvIGJlIGEgZnVuY3Rpb25gXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBqc29uX3Byb3RvY29sKHNoYXJlZCkgOjpcbiAgY29uc3Qge2NyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtLCBqc29uX3BhY2t9ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcblxuICByZXR1cm4gQHt9XG4gICAgcGFja0JvZHlcblxuICAgIGdldCBkYXRhZ3JhbSgpIDo6IHJldHVybiB0aGlzLmRpcmVjdFxuICAgIGRpcmVjdDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBtc2cgPSBzaW5rLmpzb25fdW5wYWNrIEAgcGt0LmJvZHlfdXRmOCgpIHx8IHVuZGVmaW5lZFxuICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBwa3QuaW5mb1xuXG4gICAgbXVsdGlwYXJ0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlTXVsdGlwYXJ0XG4gICAgICAgIGNvbnN0IGJvZHlfYnVmID0gc3RhdGUuZmVlZChwa3QpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gYm9keV9idWYgOjpcbiAgICAgICAgICBjb25zdCBtc2cgPSBzaW5rLmpzb25fdW5wYWNrIEAgdW5wYWNrX3V0ZjgoYm9keV9idWYpIHx8IHVuZGVmaW5lZFxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuICAgIHN0cmVhbWluZzogQHt9XG4gICAgICBtb2RlOiAnb2JqZWN0J1xuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVTdHJlYW1cbiAgICAgICAgcmV0dXJuIHN0YXRlLmZlZWQocGt0LCB1bnBhY2tCb2R5KVxuXG4gIGZ1bmN0aW9uIHBhY2tCb2R5KGJvZHkpIDo6XG4gICAgcmV0dXJuIHBhY2tfdXRmOCBAIGpzb25fcGFjayhib2R5KVxuXG4gIGZ1bmN0aW9uIHVucGFja0JvZHkocGt0LCBzaW5rKSA6OlxuICAgIHJldHVybiBzaW5rLmpzb25fdW5wYWNrIEAgcGt0LmJvZHlfdXRmOCgpXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBiaW5hcnlfcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW19ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgY29uc3Qge2FzQnVmZmVyfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgcmV0dXJuIEB7fVxuICAgIHBhY2tCb2R5OiBhc0J1ZmZlclxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHBrdC5ib2R5X2J1ZmZlcigpXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdieXRlcydcbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlU3RyZWFtXG4gICAgICAgIGNvbnN0IG1zZyA9IHN0YXRlLmZlZWQocGt0LCBwa3RfYnVmZmVyKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZyA6OlxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuZnVuY3Rpb24gcGt0X2J1ZmZlcihwa3QpIDo6IHJldHVybiBwa3QuYm9keV9idWZmZXIoKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gY29udHJvbF9wcm90b2NvbChpbmJvdW5kLCBoaWdoLCBzaGFyZWQpIDo6XG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrUGFja2V0T2JqfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcblxuICBjb25zdCBwaW5nX2ZyYW1lID0gZnJhbWluZ3MuY2hvb3NlIEA6IGZyb21faWQ6IHRydWUsIHRva2VuOiB0cnVlLCB0cmFuc3BvcnQ6ICdkaXJlY3QnXG4gIGNvbnN0IHBvbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgbXNnaWQ6IHRydWUsIHRyYW5zcG9ydDogJ2RhdGFncmFtJ1xuXG4gIGNvbnN0IHBvbmdfdHlwZSA9IGhpZ2h8MHhlXG4gIGluYm91bmRbcG9uZ190eXBlXSA9IHJlY3ZfcG9uZ1xuICBjb25zdCBwaW5nX3R5cGUgPSBoaWdofDB4ZlxuICBpbmJvdW5kW2hpZ2h8MHhmXSA9IHJlY3ZfcGluZ1xuXG4gIHJldHVybiBAe30gc2VuZDpwaW5nLCBwaW5nXG5cbiAgZnVuY3Rpb24gcGluZyhjaGFuLCBvYmopIDo6XG4gICAgaWYgISBvYmoudG9rZW4gOjpcbiAgICAgIG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgb2JqLmJvZHkgPSBKU09OLnN0cmluZ2lmeSBAOlxuICAgICAgb3A6ICdwaW5nJywgdHMwOiBuZXcgRGF0ZSgpXG4gICAgcGluZ19mcmFtZS5wYWNrKHBpbmdfdHlwZSwgb2JqKVxuICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gIGZ1bmN0aW9uIHJlY3ZfcGluZyhwa3QsIHNpbmssIHJvdXRlcikgOjpcbiAgICBwaW5nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICBfc2VuZF9wb25nIEAgcGt0LmJvZHksIHBrdCwgcm91dGVyXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4gIGZ1bmN0aW9uIF9zZW5kX3Bvbmcoe3RzMH0sIHBrdF9waW5nLCByb3V0ZXIpIDo6XG4gICAgY29uc3Qge21zZ2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgZnJvbV9pZDpyX2lkfSA9IHBrdF9waW5nLmluZm9cbiAgICBjb25zdCBvYmogPSBAe30gbXNnaWRcbiAgICAgIGZyb21faWQ6IEB7fSBpZF90YXJnZXQsIGlkX3JvdXRlclxuICAgICAgaWRfcm91dGVyOiByX2lkLmlkX3JvdXRlciwgaWRfdGFyZ2V0OiByX2lkLmlkX3RhcmdldFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkgQDpcbiAgICAgICAgb3A6ICdwb25nJywgdHMwLCB0czE6IG5ldyBEYXRlKClcblxuICAgIHBvbmdfZnJhbWUucGFjayhwb25nX3R5cGUsIG9iailcbiAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgcmV0dXJuIHJvdXRlci5kaXNwYXRjaCBAIFtwa3RdXG5cbiAgZnVuY3Rpb24gcmVjdl9wb25nKHBrdCwgc2luaykgOjpcbiAgICBwb25nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuaW1wb3J0IHNoYXJlZF9wcm90byBmcm9tICcuL3NoYXJlZC5qc3knXG5pbXBvcnQganNvbl9wcm90byBmcm9tICcuL2pzb24uanN5J1xuaW1wb3J0IGJpbmFyeV9wcm90byBmcm9tICcuL2JpbmFyeS5qc3knXG5pbXBvcnQgY29udHJvbF9wcm90byBmcm9tICcuL2NvbnRyb2wuanN5J1xuXG5leHBvcnQgKiBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBpbml0X3Byb3RvY29sKHBhY2tldFBhcnNlciwgb3B0aW9ucykgOjpcbiAgY29uc3Qgc2hhcmVkID0gc2hhcmVkX3Byb3RvIEAgcGFja2V0UGFyc2VyLCBvcHRpb25zXG5cbiAgY29uc3QgaW5ib3VuZCA9IFtdXG4gIGNvbnN0IGpzb24gPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgwMCAvLyAweDAqIOKAlCBKU09OIGJvZHlcbiAgICBqc29uX3Byb3RvKHNoYXJlZClcblxuICBjb25zdCBiaW5hcnkgPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgxMCAvLyAweDEqIOKAlCBiaW5hcnkgYm9keVxuICAgIGJpbmFyeV9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgY29udHJvbCA9IGNvbnRyb2xfcHJvdG8gQCBpbmJvdW5kLFxuICAgIDB4ZjAgLy8gMHhmKiDigJQgY29udHJvbFxuICAgIHNoYXJlZFxuXG4gIGNvbnN0IGNvZGVjcyA9IEA6IGpzb24sIGJpbmFyeSwgY29udHJvbCwgZGVmYXVsdDoganNvblxuXG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIHJldHVybiBAOiBpbmJvdW5kLCBjb2RlY3MsIHJhbmRvbV9pZFxuXG5cbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIFNpbmsgOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7aW5ib3VuZH0pIDo6XG4gICAgY2xhc3MgU2luayBleHRlbmRzIHRoaXMgOjpcbiAgICBTaW5rLnByb3RvdHlwZS5fcHJvdG9jb2wgPSBpbmJvdW5kXG4gICAgcmV0dXJuIFNpbmtcblxuICByZWdpc3RlcihlbmRwb2ludCwgaHViLCBpZF90YXJnZXQsIGhhbmRsZXJzKSA6OlxuICAgIGNvbnN0IHVucmVnaXN0ZXIgPSAoKSA9PiBodWIucm91dGVyLnVucmVnaXN0ZXJUYXJnZXQoaWRfdGFyZ2V0KVxuXG4gICAgaHViLnJvdXRlci5yZWdpc3RlclRhcmdldCBAIGlkX3RhcmdldCxcbiAgICAgIHRoaXMuX2JpbmREaXNwYXRjaCBAIGVuZHBvaW50LCB1bnJlZ2lzdGVyLCBoYW5kbGVyc1xuICAgIHJldHVybiB0aGlzXG5cbiAgX2JpbmREaXNwYXRjaChlbmRwb2ludCwgdW5yZWdpc3Rlciwge29uX21zZywgb25fZXJyb3IsIG9uX3NodXRkb3dufSkgOjpcbiAgICBsZXQgYWxpdmUgPSB0cnVlXG4gICAgY29uc3QgcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbFxuICAgIGNvbnN0IGlzQWxpdmUgPSAoKSA9PiBhbGl2ZVxuICAgIGNvbnN0IHNodXRkb3duID0gKGVyciwgZXh0cmEpID0+IDo6XG4gICAgICBpZiBhbGl2ZSA6OlxuICAgICAgICB1bnJlZ2lzdGVyKCk7IHVucmVnaXN0ZXIgPSBhbGl2ZSA9IGZhbHNlXG4gICAgICAgIG9uX3NodXRkb3duKGVyciwgZXh0cmEpXG5cbiAgICBPYmplY3QuYXNzaWduIEAgdGhpcywgZW5kcG9pbnQuYmluZFNpbmsodGhpcyksIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuICAgIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG5cbiAgICByZXR1cm4gYXN5bmMgKHBrdCwgcm91dGVyKSA9PiA6OlxuICAgICAgaWYgZmFsc2U9PT1hbGl2ZSB8fCBudWxsPT1wa3QgOjogcmV0dXJuIGFsaXZlXG5cbiAgICAgIGNvbnN0IHJlY3ZfbXNnID0gcHJvdG9jb2xbcGt0LnR5cGVdXG4gICAgICBpZiB1bmRlZmluZWQgPT09IHJlY3ZfbXNnIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZmFsc2UsIEB7fSBwa3QsIHpvbmU6ICdwa3QudHlwZSdcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIHZhciBtc2cgPSBhd2FpdCByZWN2X21zZyBAIHBrdCwgdGhpcywgcm91dGVyXG4gICAgICAgIGlmICEgbXNnIDo6IHJldHVybiBtc2dcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gdm9pZCBvbl9lcnJvciBAIGVyciwgQHt9IHBrdCwgem9uZTogJ3Byb3RvY29sJ1xuXG4gICAgICBpZiBmYWxzZSA9PT0gYWxpdmUgOjpcbiAgICAgICAgcmV0dXJuIHJvdXRlci51bnJlZ2lzdGVyXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICBhd2FpdCBvbl9tc2cgQCBtc2csIHBrdFxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHRyeSA6OlxuICAgICAgICAgIHZhciB0ZXJtaW5hdGUgPSBvbl9lcnJvciBAIGVyciwgQHt9IG1zZywgcGt0LCB6b25lOiAnZGlzcGF0Y2gnXG4gICAgICAgIGZpbmFsbHkgOjpcbiAgICAgICAgICBpZiBmYWxzZSAhPT0gdGVybWluYXRlIDo6XG4gICAgICAgICAgICBzaHV0ZG93bihlcnIsIHttc2csIHBrdH0pXG4gICAgICAgICAgICByZXR1cm4gcm91dGVyLnVucmVnaXN0ZXJcblxuICBzdGF0ZUZvcihwa3QsIGlmQWJzZW50KSA6OlxuICAgIGNvbnN0IG1zZ2lkID0gcGt0LmluZm8ubXNnaWRcbiAgICBsZXQgZW50cnkgPSB0aGlzLmJ5X21zZ2lkLmdldChtc2dpZClcbiAgICBpZiB1bmRlZmluZWQgPT09IGVudHJ5IDo6XG4gICAgICBpZiAhIG1zZ2lkIDo6XG4gICAgICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIG1zZ2lkOiAke21zZ2lkfWBcbiAgICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiBpZkFic2VudCA6OlxuICAgICAgICBlbnRyeSA9IGlmQWJzZW50KHBrdCwgdGhpcywgbXNnaWQpXG4gICAgICBlbHNlIGVudHJ5ID0gaWZBYnNlbnRcbiAgICAgIHRoaXMuYnlfbXNnaWQuc2V0IEAgbXNnaWQsIGVudHJ5XG4gICAgcmV0dXJuIGVudHJ5XG5cbiAgZGVsZXRlU3RhdGVGb3IobXNnaWQpIDo6XG4gICAgcmV0dXJuIHRoaXMuYnlfbXNnaWQuZGVsZXRlKG1zZ2lkKVxuXG4gIGpzb25fdW5wYWNrKG9iaikgOjogdGhyb3cgbmV3IEVycm9yIEAgYEVuZHBvaW50IGJpbmRTaW5rKCkgcmVzcG9uc2liaWxpdHlgXG5cbiIsImV4cG9ydCBkZWZhdWx0IEVQVGFyZ2V0XG5leHBvcnQgY2xhc3MgRVBUYXJnZXQgOjpcbiAgY29uc3RydWN0b3IoaWQpIDo6IHRoaXMuaWQgPSBpZFxuXG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRVBUYXJnZXQgJHtlcF9lbmNvZGUodGhpcy5pZCwgdHJ1ZSl9wrtgXG4gIHRvSlNPTigpIDo6IHJldHVybiBlcF9lbmNvZGUodGhpcy5pZCwgZmFsc2UpXG4gIGFzRW5kcG9pbnRJZCgpIDo6IHJldHVybiB0aGlzLmlkXG4gIGlzRVBUYXJnZXQoKSA6OiByZXR1cm4gdHJ1ZVxuXG4gIGdldCBpZF9yb3V0ZXIoKSA6OiByZXR1cm4gdGhpcy5pZC5pZF9yb3V0ZXJcbiAgZ2V0IGlkX3RhcmdldCgpIDo6IHJldHVybiB0aGlzLmlkLmlkX3RhcmdldFxuXG4gIHN0YXRpYyBhc19qc29uX3VucGFjayhtc2dfY3R4X3RvLCB4Zm9ybUJ5S2V5KSA6OlxuICAgIHhmb3JtQnlLZXkgPSBPYmplY3QuY3JlYXRlKHhmb3JtQnlLZXkgfHwgbnVsbClcbiAgICB4Zm9ybUJ5S2V5W3Rva2VuXSA9IHYgPT4gdGhpcy5mcm9tX2N0eCBAIGVwX2RlY29kZSh2KSwgbXNnX2N0eF90b1xuICAgIHJldHVybiB0aGlzLmpzb25fdW5wYWNrX3hmb3JtKHhmb3JtQnlLZXkpXG5cbiAgc3RhdGljIGZyb21fY3R4KGlkLCBtc2dfY3R4X3RvLCBtc2dpZCkgOjpcbiAgICBpZiAhIGlkIDo6IHJldHVyblxuICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiBpZC5hc0VuZHBvaW50SWQgOjpcbiAgICAgIGlkID0gaWQuYXNFbmRwb2ludElkKClcblxuICAgIGNvbnN0IGVwX3RndCA9IG5ldyB0aGlzKGlkKVxuICAgIGxldCBmYXN0LCBpbml0ID0gKCkgPT4gZmFzdCA9IG1zZ19jdHhfdG8oZXBfdGd0LCB7bXNnaWR9KS5mYXN0X2pzb25cbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBlcF90Z3QsIEB7fVxuICAgICAgc2VuZDogQHt9IGdldCgpIDo6IHJldHVybiAoZmFzdCB8fCBpbml0KCkpLnNlbmRcbiAgICAgIHF1ZXJ5OiBAe30gZ2V0KCkgOjogcmV0dXJuIChmYXN0IHx8IGluaXQoKSkucXVlcnlcbiAgICAgIHJlcGx5RXhwZWN0ZWQ6IEB7fSB2YWx1ZTogISEgbXNnaWRcblxuXG5jb25zdCB0b2tlbiA9ICdcXHUwM0UwJyAvLyAnz6AnXG5FUFRhcmdldC50b2tlbiA9IHRva2VuXG5cbkVQVGFyZ2V0LmVwX2VuY29kZSA9IGVwX2VuY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2VuY29kZShpZCwgc2ltcGxlKSA6OlxuICBsZXQge2lkX3JvdXRlcjpyLCBpZF90YXJnZXQ6dH0gPSBpZFxuICByID0gKHI+Pj4wKS50b1N0cmluZygzNilcbiAgdCA9ICh0Pj4+MCkudG9TdHJpbmcoMzYpXG4gIGlmIHNpbXBsZSA6OlxuICAgIHJldHVybiBgJHt0b2tlbn0gJHtyfX4ke3R9YFxuXG4gIGNvbnN0IHJlcyA9IEB7fSBbdG9rZW5dOiBgJHtyfX4ke3R9YFxuICBPYmplY3QuYXNzaWduIEAgcmVzLCBpZFxuICBkZWxldGUgcmVzLmlkX3JvdXRlcjsgZGVsZXRlIHJlcy5pZF90YXJnZXRcbiAgcmV0dXJuIHJlc1xuXG5cbkVQVGFyZ2V0LmVwX2RlY29kZSA9IGVwX2RlY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2RlY29kZSh2KSA6OlxuICBjb25zdCBpZCA9ICdzdHJpbmcnID09PSB0eXBlb2YgdlxuICAgID8gdi5zcGxpdCh0b2tlbilbMV1cbiAgICA6IHZbdG9rZW5dXG4gIGlmICEgaWQgOjogcmV0dXJuXG5cbiAgbGV0IFtyLHRdID0gaWQuc3BsaXQoJ34nKVxuICBpZiB1bmRlZmluZWQgPT09IHQgOjogcmV0dXJuXG4gIHIgPSAwIHwgcGFyc2VJbnQociwgMzYpXG4gIHQgPSAwIHwgcGFyc2VJbnQodCwgMzYpXG5cbiAgcmV0dXJuIEB7fSBpZF9yb3V0ZXI6IHIsIGlkX3RhcmdldDogdFxuXG5cbkVQVGFyZ2V0Lmpzb25fdW5wYWNrX3hmb3JtID0ganNvbl91bnBhY2tfeGZvcm1cbmV4cG9ydCBmdW5jdGlvbiBqc29uX3VucGFja194Zm9ybSh4Zm9ybUJ5S2V5KSA6OlxuICByZXR1cm4gc3ogPT4gSlNPTi5wYXJzZSBAIHN6LCByZXZpdmVyKClcblxuICBmdW5jdGlvbiByZXZpdmVyKCkgOjpcbiAgICBjb25zdCByZWcgPSBuZXcgV2Vha01hcCgpXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGtleSwgdmFsdWUpIDo6XG4gICAgICBjb25zdCB4Zm4gPSB4Zm9ybUJ5S2V5W2tleV1cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0geGZuIDo6XG4gICAgICAgIHJlZy5zZXQodGhpcywgeGZuKVxuICAgICAgICByZXR1cm4gdmFsdWVcblxuICAgICAgaWYgJ29iamVjdCcgPT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgICBjb25zdCB2Zm4gPSByZWcuZ2V0KHZhbHVlKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHZmbiA6OlxuICAgICAgICAgIHJldHVybiB2Zm4gQCB2YWx1ZVxuICAgICAgcmV0dXJuIHZhbHVlXG5cbiIsImltcG9ydCB7ZXBfZGVjb2RlfSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1zZ0N0eCA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtyYW5kb21faWQsIGNvZGVjc30pIDo6XG4gICAgY2xhc3MgTXNnQ3R4IGV4dGVuZHMgdGhpcyA6OlxuICAgIE1zZ0N0eC5wcm90b3R5cGUucmFuZG9tX2lkID0gcmFuZG9tX2lkXG4gICAgTXNnQ3R4LndpdGhDb2RlY3MgQCBjb2RlY3NcbiAgICByZXR1cm4gTXNnQ3R4XG5cbiAgc3RhdGljIGZvckh1YihodWIsIGNoYW5uZWwpIDo6XG4gICAgY29uc3Qge3NlbmRSYXd9ID0gY2hhbm5lbFxuXG4gICAgY2xhc3MgTXNnQ3R4IGV4dGVuZHMgdGhpcyA6OlxuICAgIE1zZ0N0eC5wcm90b3R5cGUuY2hhbl9zZW5kID0gYXN5bmMgcGt0ID0+IDo6XG4gICAgICBhd2FpdCBzZW5kUmF3KHBrdClcbiAgICAgIHJldHVybiB0cnVlXG5cbiAgICByZXR1cm4gTXNnQ3R4XG5cblxuICBjb25zdHJ1Y3RvcihpZCkgOjpcbiAgICBpZiBudWxsICE9IGlkIDo6XG4gICAgICBjb25zdCB7aWRfdGFyZ2V0LCBpZF9yb3V0ZXJ9ID0gaWRcbiAgICAgIGNvbnN0IGZyb21faWQgPSBPYmplY3QuZnJlZXplIEA6IGlkX3RhcmdldCwgaWRfcm91dGVyXG4gICAgICB0aGlzLmN0eCA9IEB7fSBmcm9tX2lkXG5cblxuICB3aXRoRW5kcG9pbnQoZW5kcG9pbnQpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBlbmRwb2ludDogQHt9IHZhbHVlOiBlbmRwb2ludFxuXG5cbiAgcGluZyh0b2tlbj10cnVlKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX21zZ0NvZGVjcy5jb250cm9sLnBpbmcsIFtdLCB0b2tlbilcbiAgc2VuZCguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MpXG4gIHNlbmRRdWVyeSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MsIHRydWUpXG4gIHF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZSkucmVwbHlcblxuICBzdHJlYW0oLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX2NvZGVjLnN0cmVhbSwgYXJnc1xuICBpbnZva2Uoa2V5LCAuLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWNba2V5XSwgYXJnc1xuICBiaW5kSW52b2tlKGZuT3JLZXksIHRva2VuKSA6OlxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBmbk9yS2V5IDo6IGZuT3JLZXkgPSB0aGlzLl9jb2RlY1xuICAgIHJldHVybiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGZuT3JLZXksIGFyZ3MsIHRva2VuKVxuXG4gIF9pbnZva2VfZXgoaW52b2tlLCBhcmdzLCB0b2tlbikgOjpcbiAgICBjb25zdCBvYmogPSBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4XG4gICAgaWYgbnVsbCA9PSB0b2tlbiA6OiB0b2tlbiA9IG9iai50b2tlblxuICAgIGVsc2Ugb2JqLnRva2VuID0gdG9rZW5cbiAgICBpZiB0cnVlID09PSB0b2tlbiA6OlxuICAgICAgdG9rZW4gPSBvYmoudG9rZW4gPSB0aGlzLnJhbmRvbV9pZCgpXG5cbiAgICB0aGlzLmFzc2VydE1vbml0b3IoKVxuXG4gICAgY29uc3QgcmVzID0gaW52b2tlIEAgdGhpcy5jaGFuX3NlbmQsIG9iaiwgLi4uYXJnc1xuICAgIGlmICEgdG9rZW4gfHwgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJlcy50aGVuIDo6IHJldHVybiByZXNcblxuICAgIGxldCBwX3NlbnQgID0gcmVzLnRoZW4oKVxuICAgIGNvbnN0IHJlcGx5ID0gdGhpcy5lbmRwb2ludC5pbml0UmVwbHkodG9rZW4sIHBfc2VudCwgdGhpcylcbiAgICBwX3NlbnQgPSBwX3NlbnQudGhlbiBAICgpID0+IEA6IHJlcGx5XG4gICAgcF9zZW50LnJlcGx5ID0gcmVwbHlcbiAgICByZXR1cm4gcF9zZW50XG5cbiAgZ2V0IHRvKCkgOjogcmV0dXJuICh0Z3QsIC4uLmFyZ3MpID0+IDo6XG4gICAgaWYgbnVsbCA9PSB0Z3QgOjogdGhyb3cgbmV3IEVycm9yIEAgYE51bGwgdGFyZ2V0IGVuZHBvaW50YFxuXG4gICAgY29uc3Qgc2VsZiA9IHRoaXMuY2xvbmUoKVxuXG4gICAgY29uc3QgY3R4ID0gc2VsZi5jdHhcbiAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgY3R4LmlkX3RhcmdldCA9IHRndFxuICAgICAgY3R4LmlkX3JvdXRlciA9IGN0eC5mcm9tX2lkLmlkX3JvdXRlclxuICAgIGVsc2UgOjpcbiAgICAgIHRndCA9IGVwX2RlY29kZSh0Z3QpIHx8IHRndFxuICAgICAgY29uc3Qge2Zyb21faWQ6IHJlcGx5X2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgdG9rZW4sIG1zZ2lkfSA9IHRndFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IGlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gaWRfdGFyZ2V0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBpZF9yb3V0ZXJcbiAgICAgIGVsc2UgaWYgdW5kZWZpbmVkICE9PSByZXBseV9pZCAmJiAhIGN0eC5pZF90YXJnZXQgOjpcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHJlcGx5X2lkLmlkX3RhcmdldFxuICAgICAgICBjdHguaWRfcm91dGVyID0gcmVwbHlfaWQuaWRfcm91dGVyXG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnaWQgOjogY3R4Lm1zZ2lkID0gbXNnaWRcblxuICAgIHJldHVybiAwID09PSBhcmdzLmxlbmd0aCA/IHNlbGYgOiBzZWxmLndpdGggQCAuLi5hcmdzXG5cbiAgd2l0aCguLi5hcmdzKSA6OlxuICAgIGNvbnN0IGN0eCA9IHRoaXMuY3R4XG4gICAgZm9yIGxldCB0Z3Qgb2YgYXJncyA6OlxuICAgICAgaWYgdHJ1ZSA9PT0gdGd0IHx8IGZhbHNlID09PSB0Z3QgOjpcbiAgICAgICAgY3R4LnRva2VuID0gdGd0XG4gICAgICBlbHNlIGlmIG51bGwgIT0gdGd0IDo6XG4gICAgICAgIGNvbnN0IHt0b2tlbiwgbXNnaWR9ID0gdGd0XG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuICAgIHJldHVybiB0aGlzXG5cbiAgd2l0aFJlcGx5KCkgOjpcbiAgICByZXR1cm4gdGhpcy5jbG9uZSBAOiB0b2tlbjogdHJ1ZVxuXG4gIGNsb25lKC4uLmFyZ3MpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAe31cbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuXG4gIGFzc2VydE1vbml0b3IoKSA6OlxuICAgIGlmICEgdGhpcy5jaGVja01vbml0b3IoKSA6OlxuICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFRhcmdldCBtb25pdG9yIGV4cGlyZWRgXG4gIGNoZWNrTW9uaXRvcigpIDo6IHJldHVybiB0cnVlXG4gIG1vbml0b3Iob3B0aW9ucz17fSkgOjpcbiAgICBpZiB0cnVlID09PSBvcHRpb25zIHx8IGZhbHNlID09PSBvcHRpb25zIDo6XG4gICAgICBvcHRpb25zID0gQHt9IGFjdGl2ZTogb3B0aW9uc1xuXG4gICAgY29uc3QgbW9uaXRvciA9IHRoaXMuZW5kcG9pbnQuaW5pdE1vbml0b3IodGhpcy5jdHguaWRfdGFyZ2V0KVxuXG4gICAgY29uc3QgdHNfZHVyYXRpb24gPSBvcHRpb25zLnRzX2R1cmF0aW9uIHx8IDUwMDBcbiAgICBsZXQgdHNfYWN0aXZlID0gb3B0aW9ucy50c19hY3RpdmVcbiAgICBpZiB0cnVlID09PSB0c19hY3RpdmUgOjpcbiAgICAgIHRzX2FjdGl2ZSA9IHRzX2R1cmF0aW9uLzRcblxuICAgIGxldCBjaGVja01vbml0b3JcbiAgICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgY29uc3QgZG9uZSA9IG9wdGlvbnMucmVqZWN0ID8gcmVqZWN0IDogcmVzb2x2ZVxuICAgICAgdGhpcy5jaGVja01vbml0b3IgPSBjaGVja01vbml0b3IgPSAoKSA9PlxuICAgICAgICB0c19kdXJhdGlvbiA+IG1vbml0b3IudGQoKVxuICAgICAgICAgID8gdHJ1ZSA6IChkb25lKG1vbml0b3IpLCBmYWxzZSlcblxuICAgIGxldCB0aWRcbiAgICBjb25zdCB0c19pbnRlcnZhbCA9IHRzX2FjdGl2ZSB8fCB0c19kdXJhdGlvbi80XG4gICAgaWYgb3B0aW9ucy5hY3RpdmUgfHwgdHNfYWN0aXZlIDo6XG4gICAgICBjb25zdCBjdHJsID0gdGhpcy5jb2RlYygnY29udHJvbCcpXG4gICAgICBjb25zdCBjaGVja1BpbmcgPSAoKSA9PiA6OlxuICAgICAgICBpZiB0c19pbnRlcnZhbCA+IG1vbml0b3IudGQoKSA6OlxuICAgICAgICAgIGN0cmwuaW52b2tlKCdwaW5nJylcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tQaW5nLCB0c19pbnRlcnZhbFxuICAgIGVsc2UgOjpcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tNb25pdG9yLCB0c19pbnRlcnZhbFxuICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuICAgIGNvbnN0IGNsZWFyID0gKCkgPT4gY2xlYXJJbnRlcnZhbCh0aWQpXG5cbiAgICBwcm9taXNlLnRoZW4oY2xlYXIsIGNsZWFyKVxuICAgIHJldHVybiBwcm9taXNlXG5cblxuICBjb2RlYyhtc2dfY29kZWMsIC4uLmFyZ3MpIDo6XG4gICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiBtc2dfY29kZWMgOjpcbiAgICAgIG1zZ19jb2RlYyA9IHRoaXMuX21zZ0NvZGVjc1ttc2dfY29kZWNdXG5cbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgbXNnX2NvZGVjLnNlbmQgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgcGFja2V0IGNvZGVjIHByb3RvY29sYFxuXG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAOlxuICAgICAgX2NvZGVjOiBAOiB2YWx1ZTogbXNnX2NvZGVjXG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cbiAgc3RhdGljIHdpdGhDb2RlY3MobXNnQ29kZWNzKSA6OlxuICAgIGZvciBjb25zdCBbbmFtZSwgbXNnX2NvZGVjXSBvZiBPYmplY3QuZW50cmllcyBAIG1zZ0NvZGVjcyA6OlxuICAgICAgdGhpcy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIDo6XG4gICAgICAgIHJldHVybiB0aGlzLmNvZGVjIEAgbXNnX2NvZGVjXG4gICAgdGhpcy5wcm90b3R5cGUuX21zZ0NvZGVjcyA9IG1zZ0NvZGVjc1xuICAgIHRoaXMucHJvdG90eXBlLl9jb2RlYyA9IG1zZ0NvZGVjcy5kZWZhdWx0XG5cbiAgICAvLyBiaW5kIHNlbmRfanNvbiBhcyBmcmVxdWVudGx5IHVzZWQgZmFzdC1wYXRoXG4gICAgY29uc3QganNvbl9zZW5kID0gbXNnQ29kZWNzLmpzb24uc2VuZFxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcy5wcm90b3R5cGUsIEA6XG4gICAgICBmYXN0X2pzb246IEB7fSBnZXQoKSA6OiByZXR1cm4gQDpcbiAgICAgICAgc2VuZDogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChqc29uX3NlbmQsIGFyZ3MpXG4gICAgICAgIHNlbmRRdWVyeTogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChqc29uX3NlbmQsIGFyZ3MsIHRydWUpXG4gICAgICAgIHF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGpzb25fc2VuZCwgYXJncywgdHJ1ZSkucmVwbHlcblxuICAgIHJldHVybiB0aGlzXG5cblxuICB3aXRoUmVqZWN0VGltZW91dChwX3JlcGx5KSA6OlxuICAgIHJldHVybiBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBwX3JlcGx5LnRoZW4gQCByZXNvbHZlLCByZWplY3RcbiAgICAgIHBfcmVwbHkudGhlbiBAIGNsZWFyLCBjbGVhclxuXG4gICAgICBjb25zdCB0aW1lb3V0ID0gKCkgPT4gcmVqZWN0IEAgbmV3IHRoaXMuUmVwbHlUaW1lb3V0XG4gICAgICBjb25zdCB0aWQgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIHRoaXMubXNfdGltZW91dClcbiAgICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuXG4gICAgICBmdW5jdGlvbiBjbGVhcigpIDo6IGNsZWFyVGltZW91dCBAIHRpZFxuXG5cbmNsYXNzIFJlcGx5VGltZW91dCBleHRlbmRzIEVycm9yIDo6XG5cbk9iamVjdC5hc3NpZ24gQCBNc2dDdHgucHJvdG90eXBlLCBAe31cbiAgUmVwbHlUaW1lb3V0LCBtc190aW1lb3V0OiA1MDAwXG5cbiIsImltcG9ydCB7RVBUYXJnZXQsIGVwX2VuY29kZX0gZnJvbSAnLi9lcF90YXJnZXQuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBFbmRwb2ludCA6OlxuICBzdGF0aWMgc3ViY2xhc3MoZXh0ZW5zaW9ucykgOjpcbiAgICBjbGFzcyBFbmRwb2ludCBleHRlbmRzIHRoaXMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgRW5kcG9pbnQucHJvdG90eXBlLCBleHRlbnNpb25zXG4gICAgcmV0dXJuIEVuZHBvaW50XG5cbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFbmRwb2ludCAke2VwX2VuY29kZSh0aGlzLmlkLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIHRoaXMuZXBfc2VsZigpLnRvSlNPTigpXG4gIGVwX3NlbGYoKSA6OiByZXR1cm4gbmV3IHRoaXMuRVBUYXJnZXQodGhpcy5pZClcbiAgYXNFbmRwb2ludElkKCkgOjogcmV0dXJuIHRoaXMuaWRcblxuICBjb25zdHJ1Y3RvcihpZCwgbXNnX2N0eCkgOjpcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEB7fVxuICAgICAgaWQ6IEB7fSB2YWx1ZTogaWRcbiAgICAgIHRvOiBAe30gdmFsdWU6IG1zZ19jdHgud2l0aEVuZHBvaW50KHRoaXMpLnRvXG5cbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKVxuICBjcmVhdGVTdGF0ZU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVJlcGx5TWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlVHJhZmZpY01hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVJvdXRlQ2FjaGVNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuXG4gIGJpbmRTaW5rKHNpbmspIDo6XG4gICAgY29uc3QgYnlfdG9rZW4gPSB0aGlzLmNyZWF0ZVJlcGx5TWFwKClcbiAgICBjb25zdCBieV90cmFmZmljID0gdGhpcy5jcmVhdGVUcmFmZmljTWFwKClcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBieV90b2tlbjogQHt9IHZhbHVlOiBieV90b2tlblxuICAgICAgYnlfdHJhZmZpYzogQHt9IHZhbHVlOiBieV90cmFmZmljXG5cbiAgICBjb25zdCB0cmFmZmljID0gKGZyb21faWQsIHRyYWZmaWMpID0+IDo6XG4gICAgICBjb25zdCB0cyA9IERhdGUubm93KClcbiAgICAgIGlmIGZyb21faWQgOjpcbiAgICAgICAgY29uc3QgdCA9IGJ5X3RyYWZmaWMuZ2V0KGZyb21faWQuaWRfdGFyZ2V0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHQgOjpcbiAgICAgICAgICB0LnRzID0gdFtgdHNfJHt0cmFmZmljfWBdID0gdHNcbiAgICAgIHRoaXMucmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpXG5cbiAgICByZXR1cm4gQHt9XG4gICAgICBieV9tc2dpZDogdGhpcy5jcmVhdGVTdGF0ZU1hcCgpXG4gICAgICBqc29uX3VucGFjazogdGhpcy5FUFRhcmdldC5hc19qc29uX3VucGFjayh0aGlzLnRvKVxuXG4gICAgICByZWN2Q3RybDogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdjdHJsJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdkN0cmwobXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cgfHwge21zZywgaW5mb30pLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdk1zZzogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdtc2cnKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2TXNnKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnKS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZTdHJlYW1EYXRhOiAocnN0cmVhbSwgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgcmVjdlN0cmVhbTogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCByc3RyZWFtID0gdGhpcy5yZWN2U3RyZWFtKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShyc3RyZWFtKS50aGVuKHJlcGx5KVxuICAgICAgICByZXR1cm4gcnN0cmVhbVxuXG4gIGFzX3RhcmdldChpZCkgOjpcbiAgICBpZiBpZCA6OiByZXR1cm4gdGhpcy5FUFRhcmdldC5mcm9tX2N0eCBAIGlkLCB0aGlzLnRvXG4gIGFzX3NlbmRlcih7ZnJvbV9pZDppZCwgbXNnaWR9KSA6OlxuICAgIGlmIGlkIDo6IHJldHVybiB0aGlzLkVQVGFyZ2V0LmZyb21fY3R4IEAgaWQsIHRoaXMudG8sIG1zZ2lkXG5cbiAgcmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpIDo6XG4gIHJlY3ZDdHJsKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgaWYgaXNfcmVwbHkgOjogcmV0dXJuIG1zZ1xuICByZWN2TXNnKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgaWYgaXNfcmVwbHkgOjogcmV0dXJuIG1zZ1xuICAgIHJldHVybiBAe30gbXNnLCBpbmZvLCBzZW5kZXI6IHRoaXMuYXNfc2VuZGVyKGluZm8pXG4gIHJlY3ZTdHJlYW0obXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBjb25zb2xlLndhcm4gQCBgVW5oYW5kbGUgcmVjdiBzdHJlYW06ICR7aW5mb31gXG4gICAgcmV0dXJuIG51bGxcbiAgICAvKiByZXR1cm4gQHt9IG1zZywgaW5mb1xuICAgICAgICAgb25faW5pdChtc2csIHBrdCkgOjogLy8gcmV0dXJuIHRoaXNcbiAgICAgICAgIG9uX2RhdGEoZGF0YSwgcGt0KSA6OiB0aGlzLnBhcnRzLnB1c2ggQCBkYXRhXG4gICAgICAgICBvbl9lbmQocmVzdWx0LCBwa3QpIDo6IHRoaXMucGFydHMuam9pbignJyk7IC8vIHJldHVybiB0aGlzXG4gICAgICAgICBvbl9lcnJvcihlcnIsIHBrdCkgOjogY29uc29sZS5sb2cgQCBlcnJcbiAgICAqL1xuXG4gIGluaXRSZXBseSh0b2tlbiwgcF9zZW50LCBtc2dfY3R4KSA6OlxuICAgIHJldHVybiB0aGlzLmluaXRSZXBseVByb21pc2UgQCB0b2tlbiwgcF9zZW50LCBtc2dfY3R4XG5cbiAgaW5pdE1vbml0b3IoaWRfdGFyZ2V0KSA6OlxuICAgIGNvbnN0IGtleSA9IGlkX3RhcmdldC5pZF90YXJnZXQgfHwgaWRfdGFyZ2V0XG4gICAgbGV0IG1vbml0b3IgPSB0aGlzLmJ5X3RyYWZmaWMuZ2V0IEAga2V5XG4gICAgaWYgdW5kZWZpbmVkID09PSBtb25pdG9yIDo6XG4gICAgICBtb25pdG9yID0gQHt9IGlkX3RhcmdldCwgdHM6IERhdGUubm93KClcbiAgICAgICAgdGQoKSA6OiByZXR1cm4gRGF0ZS5ub3coKSAtIHRoaXMudHNcbiAgICAgIHRoaXMuYnlfdHJhZmZpYy5zZXQgQCBrZXksIG1vbml0b3JcbiAgICByZXR1cm4gbW9uaXRvclxuXG4gIGluaXRSZXBseVByb21pc2UodG9rZW4sIHBfc2VudCwgbXNnX2N0eCkgOjpcbiAgICBsZXQgcmVwbHkgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICB0aGlzLmJ5X3Rva2VuLnNldCBAIHRva2VuLCByZXNvbHZlXG4gICAgICBwX3NlbnQuY2F0Y2ggQCByZWplY3RcblxuICAgIGlmIG1zZ19jdHggOjpcbiAgICAgIHJlcGx5ID0gbXNnX2N0eC53aXRoUmVqZWN0VGltZW91dChyZXBseSlcblxuICAgIGNvbnN0IGNsZWFyID0gKCkgPT4gdGhpcy5ieV90b2tlbi5kZWxldGUgQCB0b2tlblxuICAgIHJlcGx5LnRoZW4gQCBjbGVhciwgY2xlYXJcbiAgICByZXR1cm4gcmVwbHlcblxuRW5kcG9pbnQucHJvdG90eXBlLkVQVGFyZ2V0ID0gRVBUYXJnZXRcbiIsImltcG9ydCBlcF9wcm90byBmcm9tICcuL2VwX2tpbmRzL2luZGV4LmpzeSdcbmltcG9ydCBpbml0X3Byb3RvY29sIGZyb20gJy4vcHJvdG9jb2wvaW5kZXguanN5J1xuaW1wb3J0IFNpbmtCYXNlIGZyb20gJy4vc2luay5qc3knXG5pbXBvcnQgTXNnQ3R4QmFzZSBmcm9tICcuL21zZ2N0eC5qc3knXG5pbXBvcnQgRW5kcG9pbnRCYXNlIGZyb20gJy4vZW5kcG9pbnQuanN5J1xuXG5jb25zdCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zID0gQDpcbiAgcGx1Z2luX25hbWU6ICdlbmRwb2ludCdcbiAgb25fbXNnKHttc2csIHJlcGx5LCBpbmZvfSkgOjpcbiAgICBjb25zb2xlLndhcm4gQCAnRU5EUE9JTlQgTVNHOicsIEB7fSBtc2csIHJlcGx5LCBpbmZvXG4gIG9uX2Vycm9yKGVwLCBlcnIsIGV4dHJhKSA6OlxuICAgIGNvbnNvbGUuZXJyb3IgQCAnRU5EUE9JTlQgRVJST1I6JywgZXJyXG4gICAgLy8gY29uc3Qge21zZywgcGt0fSA9IGV4dHJhXG4gICAgLy8gcmV0dXJuIGZhbHNlIHRvIHByZXZlbnQgYXV0by1zaHV0ZG93blxuICBvbl9zaHV0ZG93bihlcCwgZXJyLCBleHRyYSkgOjpcbiAgICAvLyBjb25zdCB7bXNnLCBwa3R9ID0gZXh0cmFcbiAgICBjb25zb2xlLmVycm9yIEAgYEVORFBPSU5UIFNIVVRET1dOOiAke2Vyci5tZXNzYWdlfWBcblxuICBzdWJjbGFzcyhjbGFzc2VzKSA6OlxuICAgIC8vY29uc3Qge0VuZHBvaW50LCBTaW5rLCBNc2dDdHgsIHByb3RvY29sc30gPSBjbGFzc2VzXG4gICAgcmV0dXJuIGNsYXNzZXNcblxuICBqc29uX3BhY2s6IEpTT04uc3RyaW5naWZ5XG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKCkgLy8gTFJVTWFwLCBIYXNoYmVsdE1hcFxuXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBsdWdpbl9vcHRpb25zKSA6OlxuICBwbHVnaW5fb3B0aW9ucyA9IE9iamVjdC5hc3NpZ24gQCB7fSwgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucywgcGx1Z2luX29wdGlvbnNcbiAgY29uc3QgQHt9XG4gICAgcGx1Z2luX25hbWUsIHJhbmRvbV9pZCwganNvbl9wYWNrXG4gICAgb25fbXNnOiBkZWZhdWx0X29uX21zZ1xuICAgIG9uX2Vycm9yOiBkZWZhdWx0X29uX2Vycm9yXG4gICAgb25fc2h1dGRvd246IGRlZmF1bHRfb25fc2h1dGRvd25cbiAgICBjcmVhdGVNYXBcbiAgPSBwbHVnaW5fb3B0aW9uc1xuXG4gIGlmIHBsdWdpbl9vcHRpb25zLmVwX2tpbmRzIDo6XG4gICAgT2JqZWN0LmFzc2lnbiBAIGVwX3Byb3RvLCBwbHVnaW5fb3B0aW9ucy5lcF9raW5kc1xuXG4gIHJldHVybiBAOiBvcmRlcjogMSwgc3ViY2xhc3MsIHBvc3RcbiAgXG4gIGZ1bmN0aW9uIHN1YmNsYXNzKEZhYnJpY0h1Yl9QSSwgYmFzZXMpIDo6XG4gICAgY29uc3Qge3BhY2tldFBhcnNlcn0gPSBGYWJyaWNIdWJfUEkucHJvdG90eXBlXG4gICAgaWYgbnVsbD09cGFja2V0UGFyc2VyIHx8ICEgcGFja2V0UGFyc2VyLmlzUGFja2V0UGFyc2VyKCkgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgSW52YWxpZCBwYWNrZXRQYXJzZXIgZm9yIHBsdWdpbmBcbiAgICBcbiAgICBGYWJyaWNIdWJfUEkucHJvdG90eXBlW3BsdWdpbl9uYW1lXSA9XG4gICAgICBiaW5kRW5kcG9pbnRBcGkgQCBwYWNrZXRQYXJzZXJcblxuICBmdW5jdGlvbiBwb3N0KGh1YikgOjpcbiAgICByZXR1cm4gaHViW3BsdWdpbl9uYW1lXSA9IGh1YltwbHVnaW5fbmFtZV0oaHViKVxuXG4gIGZ1bmN0aW9uIGJpbmRFbmRwb2ludEFwaShwYWNrZXRQYXJzZXIpIDo6XG4gICAgY29uc3QgcHJvdG9jb2xzID0gaW5pdF9wcm90b2NvbCBAIHBhY2tldFBhcnNlciwgQHt9IHJhbmRvbV9pZCwganNvbl9wYWNrXG5cbiAgICBjb25zdCB7RW5kcG9pbnQsIFNpbmssIE1zZ0N0eDogTXNnQ3R4X3BpfSA9XG4gICAgICBwbHVnaW5fb3B0aW9ucy5zdWJjbGFzcyBAOiBwcm90b2NvbHNcbiAgICAgICAgU2luazogU2lua0Jhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICAgICAgTXNnQ3R4OiBNc2dDdHhCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIEVuZHBvaW50OiBFbmRwb2ludEJhc2Uuc3ViY2xhc3Moe2NyZWF0ZU1hcH0pXG5cbiAgICByZXR1cm4gZnVuY3Rpb24oaHViKSA6OlxuICAgICAgY29uc3QgY2hhbm5lbCA9IGh1Yi5jb25uZWN0X3NlbGYoKVxuICAgICAgY29uc3QgTXNnQ3R4ID0gTXNnQ3R4X3BpLmZvckh1YihodWIsIGNoYW5uZWwpXG5cbiAgICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZiBAIGVuZHBvaW50LCBlcF9wcm90b1xuICAgICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gZW5kcG9pbnQsIGNyZWF0ZSwgTXNnQ3R4XG4gICAgICByZXR1cm4gZW5kcG9pbnRcblxuXG4gICAgICBmdW5jdGlvbiBlbmRwb2ludChvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCB0YXJnZXRzID0gaHViLnJvdXRlci50YXJnZXRzXG4gICAgICAgIGRvIHZhciBpZF90YXJnZXQgPSByYW5kb21faWQoKVxuICAgICAgICB3aGlsZSB0YXJnZXRzLmhhcyBAIGlkX3RhcmdldFxuICAgICAgICByZXR1cm4gY3JlYXRlIEAgaWRfdGFyZ2V0LCBvbl9pbml0XG5cbiAgICAgIGZ1bmN0aW9uIGNyZWF0ZShpZF90YXJnZXQsIG9uX2luaXQpIDo6XG4gICAgICAgIGNvbnN0IGhhbmRsZXJzID0gT2JqZWN0LmNyZWF0ZShudWxsKVxuICAgICAgICBjb25zdCBpZCA9IEB7fSBpZF90YXJnZXQsIGlkX3JvdXRlcjogaHViLnJvdXRlci5pZF9zZWxmXG4gICAgICAgIGNvbnN0IG1zZ19jdHggPSBuZXcgTXNnQ3R4IEAgaWRcbiAgICAgICAgY29uc3QgZXAgPSBuZXcgRW5kcG9pbnQgQCBpZCwgbXNnX2N0eFxuXG4gICAgICAgIGNvbnN0IHJlYWR5ID0gUHJvbWlzZVxuICAgICAgICAgIC5yZXNvbHZlIEBcbiAgICAgICAgICAgICdmdW5jdGlvbicgPT09IHR5cGVvZiBvbl9pbml0XG4gICAgICAgICAgICAgID8gb25faW5pdChlcCwgaHViKVxuICAgICAgICAgICAgICA6IG9uX2luaXRcbiAgICAgICAgICAudGhlbiBAIF9hZnRlcl9pbml0XG5cbiAgICAgICAgLy8gQWxsb3cgZm9yIGJvdGggaW50ZXJuYWwgYW5kIGV4dGVybmFsIGVycm9yIGhhbmRsaW5nIGJ5IGZvcmtpbmcgcmVhZHkuY2F0Y2hcbiAgICAgICAgcmVhZHkuY2F0Y2ggQCBlcnIgPT4gaGFuZGxlcnMub25fZXJyb3IgQCBlcnIsIEB7fSB6b25lOidvbl9yZWFkeSdcblxuICAgICAgICA6OlxuICAgICAgICAgIGNvbnN0IGVwX3RndCA9IGVwLmVwX3NlbGYoKVxuICAgICAgICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIGVwX3RndCwgQHt9XG4gICAgICAgICAgICByZWFkeTogQHt9IHZhbHVlOiByZWFkeS50aGVuIEAgKCkgPT4gZXBfdGd0XG5cblxuICAgICAgICBmdW5jdGlvbiBfYWZ0ZXJfaW5pdCh0YXJnZXQpIDo6XG4gICAgICAgICAgaWYgbnVsbCA9PSB0YXJnZXQgOjpcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgZW5kcG9pbnQgaW5pdCB0byByZXR1cm4gYSBjbG9zdXJlIG9yIGludGVyZmFjZWBcblxuICAgICAgICAgIGhhbmRsZXJzLm9uX21zZyA9ICh0YXJnZXQub25fbXNnIHx8ICgnZnVuY3Rpb24nID09PSB0eXBlb2YgdGFyZ2V0ID8gdGFyZ2V0IDogZGVmYXVsdF9vbl9tc2cpKS5iaW5kKHRhcmdldClcbiAgICAgICAgICBoYW5kbGVycy5vbl9lcnJvciA9ICh0YXJnZXQub25fZXJyb3IgfHwgZGVmYXVsdF9vbl9lcnJvcikuYmluZCh0YXJnZXQsIGVwKVxuICAgICAgICAgIGhhbmRsZXJzLm9uX3NodXRkb3duID0gKHRhcmdldC5vbl9zaHV0ZG93biB8fCBkZWZhdWx0X29uX3NodXRkb3duKS5iaW5kKHRhcmdldCwgZXApXG5cbiAgICAgICAgICBuZXcgU2luaygpLnJlZ2lzdGVyIEAgZXAsIGh1YiwgaWRfdGFyZ2V0LCBoYW5kbGVyc1xuXG4gICAgICAgICAgcmV0dXJuIHRhcmdldC5vbl9yZWFkeSA/IHRhcmdldC5vbl9yZWFkeShlcCwgaHViKSA6IHRhcmdldFxuXG5cbiIsImltcG9ydCBlbmRwb2ludF9wbHVnaW4gZnJvbSAnLi9wbHVnaW4uanN5J1xuXG5jb25zdCBnZXRSYW5kb21WYWx1ZXMgPSAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIHdpbmRvd1xuICA/IHdpbmRvdy5jcnlwdG8uZ2V0UmFuZG9tVmFsdWVzIDogbnVsbFxuXG5lbmRwb2ludF9icm93c2VyLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuZnVuY3Rpb24gcmFuZG9tX2lkKCkgOjpcbiAgY29uc3QgYXJyID0gbmV3IEludDMyQXJyYXkoMSlcbiAgZ2V0UmFuZG9tVmFsdWVzKGFycilcbiAgcmV0dXJuIGFyclswXVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBlbmRwb2ludF9icm93c2VyKHBsdWdpbl9vcHRpb25zPXt9KSA6OlxuICBpZiBudWxsID09IHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA6OlxuICAgIHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuXG4gIHJldHVybiBlbmRwb2ludF9wbHVnaW4ocGx1Z2luX29wdGlvbnMpXG5cbiJdLCJuYW1lcyI6WyJlcF9wcm90byIsIk9iamVjdCIsImNyZWF0ZSIsImdldFByb3RvdHlwZU9mIiwiYWRkX2VwX2tpbmQiLCJraW5kcyIsImFzc2lnbiIsImFwaSIsInRhcmdldCIsImNsaWVudEVuZHBvaW50IiwiZW5kcG9pbnQiLCJkb25lIiwiYXJncyIsImxlbmd0aCIsIm1zZ19jdHgiLCJNc2dDdHgiLCJ0byIsImVwX2NsaWVudF9hcGkiLCJvbl9yZWFkeSIsImVwIiwiaHViIiwiX3Jlc29sdmUiLCJvbl9jbGllbnRfcmVhZHkiLCJzaHV0ZG93biIsImVyciIsIl9yZWplY3QiLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsImFzQVBJRW5kcG9pbnQiLCJpbnZva2UiLCJhc19ycGMiLCJvbl9tc2ciLCJtc2ciLCJzZW5kZXIiLCJhcGlfZm9yX29wIiwib3AiLCJyZXNvbHZlX2ZuIiwiaW52b2tlX2ZuIiwia3ciLCJmbiIsInVuZGVmaW5lZCIsIm1hdGNoIiwic2VuZCIsImVycl9mcm9tIiwibWVzc2FnZSIsImNvZGUiLCJjYiIsImFuc3dlciIsImVycm9yIiwicmVwbHlFeHBlY3RlZCIsIm9uX2luaXQiLCJsaXR0bGVfZW5kaWFuIiwiY19zaW5nbGUiLCJjX2RhdGFncmFtIiwiY19kaXJlY3QiLCJjX211bHRpcGFydCIsImNfc3RyZWFtaW5nIiwiX2Vycl9tc2dpZF9yZXF1aXJlZCIsIl9lcnJfdG9rZW5fcmVxdWlyZWQiLCJmcm1fcm91dGluZyIsInNpemUiLCJiaXRzIiwibWFzayIsIm9iaiIsImZyb21faWQiLCJkdiIsIm9mZnNldCIsInNldEludDMyIiwiaWRfcm91dGVyIiwiaWRfdGFyZ2V0IiwiZ2V0SW50MzIiLCJmcm1fcmVzcG9uc2UiLCJtc2dpZCIsIkVycm9yIiwic2V0SW50MTYiLCJzZXFfYWNrIiwiYWNrX2ZsYWdzIiwidG9rZW4iLCJnZXRJbnQxNiIsImZybV9kYXRhZ3JhbSIsInRyYW5zcG9ydCIsImZybV9kaXJlY3QiLCJmcm1fbXVsdGlwYXJ0Iiwic2VxX3BvcyIsInNlcSIsInNlcV9mbGFncyIsImZybV9zdHJlYW1pbmciLCJiaW5kX3NlcV9uZXh0Iiwic2VxX29mZnNldCIsInNlcV9uZXh0IiwiZmxhZ3MiLCJmaW4iLCJOYU4iLCJjb21wb3NlRnJhbWluZ3MiLCJmcm1fZnJvbSIsImZybV9yZXNwIiwiZnJtX3RyYW5zcG9ydHMiLCJieUJpdHMiLCJ0X2Zyb20iLCJmX3Rlc3QiLCJ0X3Jlc3AiLCJ0MCIsInQxIiwidDIiLCJ0MyIsIm1hcCIsImYiLCJ0ZXN0Qml0cyIsImNob29zZSIsImxzdCIsIlQiLCJiIiwiZm5fa2V5IiwiZm5fdHJhbiIsImZuX2Zyb20iLCJmbl9yZXNwIiwiZnJtIiwiYmluZEFzc2VtYmxlZCIsImZfcGFjayIsImZfdW5wYWNrIiwicGFjayIsInVucGFjayIsInBrdF90eXBlIiwicGt0X29iaiIsIlR5cGVFcnJvciIsInR5cGUiLCJEYXRhVmlldyIsIkFycmF5QnVmZmVyIiwiaGVhZGVyIiwiYnVmZmVyIiwic2xpY2UiLCJwa3QiLCJidWYiLCJoZWFkZXJfYnVmZmVyIiwiVWludDhBcnJheSIsImluZm8iLCJfYmluZF9pdGVyYWJsZSIsImJ1Zl9jbG9uZSIsInR0bCIsIm5leHQiLCJvcHRpb25zIiwidmFsdWUiLCJwYWNrZXRQYXJzZXIiLCJmcmFnbWVudF9zaXplIiwiY29uY2F0QnVmZmVycyIsInBhY2tQYWNrZXRPYmoiLCJwYWNrX3V0ZjgiLCJ1bnBhY2tfdXRmOCIsIk51bWJlciIsInJhbmRvbV9pZCIsImpzb25fcGFjayIsImNyZWF0ZVN0cmVhbSIsInBhY2tldEZyYWdtZW50cyIsImNyZWF0ZU11bHRpcGFydCIsInNpbmsiLCJwYXJ0cyIsImZlZWQiLCJib2R5X2J1ZmZlciIsImluY2x1ZGVzIiwiZGVsZXRlU3RhdGVGb3IiLCJyZXMiLCJyZWN2RGF0YSIsInJzdHJlYW0iLCJzdGF0ZSIsImZlZWRfaW5pdCIsImFzX2NvbnRlbnQiLCJmZWVkX2lnbm9yZSIsImpzb25fdW5wYWNrIiwiYm9keV91dGY4IiwicmVjdlN0cmVhbSIsInJlY3ZTdHJlYW1EYXRhIiwiYmluZCIsIm9uX2Vycm9yIiwiZmVlZF9ib2R5IiwiZGF0YSIsIm9uX2RhdGEiLCJvbl9lbmQiLCJmZWVkX3NlcSIsIm5leHRfaGRyIiwiaSIsImxhc3RJbm5lciIsImJ5dGVMZW5ndGgiLCJpMCIsImJvZHkiLCJiaW5kVHJhbnNwb3J0SW1wbHMiLCJpbmJvdW5kIiwiaGlnaGJpdHMiLCJ0cmFuc3BvcnRzIiwib3V0Ym91bmQiLCJmcmFtaW5ncyIsImZyYW1lIiwiaW1wbCIsInRfcmVjdiIsInBhY2tfaGRyIiwicmVjdl9tc2ciLCJiaW5kVHJhbnNwb3J0cyIsInBhY2tCb2R5Iiwic3RyZWFtaW5nIiwic3RyZWFtIiwiYmluZF9zdHJlYW0iLCJtb2RlIiwiY2hhbiIsIm1zZW5kIiwibXNlbmRfYnl0ZXMiLCJtc2VuZF9vYmplY3RzIiwibXNlbmRfaW1wbCIsIm9iamVjdCIsImJ5dGVzIiwid3JpdGUiLCJlbmQiLCJjaHVuayIsImNoZWNrX2ZucyIsImtleXMiLCJrZXkiLCJqc29uX3Byb3RvY29sIiwic2hhcmVkIiwiZGF0YWdyYW0iLCJkaXJlY3QiLCJyZWN2TXNnIiwic3RhdGVGb3IiLCJib2R5X2J1ZiIsInVucGFja0JvZHkiLCJiaW5hcnlfcHJvdG9jb2wiLCJhc0J1ZmZlciIsInBrdF9idWZmZXIiLCJjb250cm9sX3Byb3RvY29sIiwiaGlnaCIsInBpbmdfZnJhbWUiLCJwb25nX2ZyYW1lIiwicG9uZ190eXBlIiwicmVjdl9wb25nIiwicGluZ190eXBlIiwicmVjdl9waW5nIiwicGluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJ0czAiLCJEYXRlIiwicm91dGVyIiwiYm9keV9qc29uIiwicmVjdkN0cmwiLCJfc2VuZF9wb25nIiwicGt0X3BpbmciLCJyX2lkIiwidHMxIiwiZGlzcGF0Y2giLCJpbml0X3Byb3RvY29sIiwic2hhcmVkX3Byb3RvIiwianNvbiIsImpzb25fcHJvdG8iLCJiaW5hcnkiLCJiaW5hcnlfcHJvdG8iLCJjb250cm9sIiwiY29udHJvbF9wcm90byIsImNvZGVjcyIsImRlZmF1bHQiLCJTaW5rIiwiZm9yUHJvdG9jb2xzIiwicHJvdG90eXBlIiwiX3Byb3RvY29sIiwiaGFuZGxlcnMiLCJ1bnJlZ2lzdGVyIiwidW5yZWdpc3RlclRhcmdldCIsInJlZ2lzdGVyVGFyZ2V0IiwiX2JpbmREaXNwYXRjaCIsIm9uX3NodXRkb3duIiwiYWxpdmUiLCJwcm90b2NvbCIsImlzQWxpdmUiLCJleHRyYSIsImJpbmRTaW5rIiwiem9uZSIsInRlcm1pbmF0ZSIsImlmQWJzZW50IiwiZW50cnkiLCJieV9tc2dpZCIsImdldCIsInNldCIsImRlbGV0ZSIsIkVQVGFyZ2V0IiwiaWQiLCJlcF9lbmNvZGUiLCJhc19qc29uX3VucGFjayIsIm1zZ19jdHhfdG8iLCJ4Zm9ybUJ5S2V5IiwidiIsImZyb21fY3R4IiwiZXBfZGVjb2RlIiwianNvbl91bnBhY2tfeGZvcm0iLCJhc0VuZHBvaW50SWQiLCJlcF90Z3QiLCJmYXN0IiwiaW5pdCIsImZhc3RfanNvbiIsImRlZmluZVByb3BlcnRpZXMiLCJxdWVyeSIsInNpbXBsZSIsInIiLCJ0IiwidG9TdHJpbmciLCJzcGxpdCIsInBhcnNlSW50Iiwic3oiLCJwYXJzZSIsInJldml2ZXIiLCJyZWciLCJXZWFrTWFwIiwieGZuIiwidmZuIiwid2l0aENvZGVjcyIsImZvckh1YiIsImNoYW5uZWwiLCJzZW5kUmF3IiwiY2hhbl9zZW5kIiwiZnJlZXplIiwiY3R4IiwiX2ludm9rZV9leCIsIl9tc2dDb2RlY3MiLCJfY29kZWMiLCJyZXBseSIsImZuT3JLZXkiLCJhc3NlcnRNb25pdG9yIiwidGhlbiIsInBfc2VudCIsImluaXRSZXBseSIsInRndCIsInNlbGYiLCJjbG9uZSIsInJlcGx5X2lkIiwid2l0aCIsImNoZWNrTW9uaXRvciIsImFjdGl2ZSIsIm1vbml0b3IiLCJpbml0TW9uaXRvciIsInRzX2R1cmF0aW9uIiwidHNfYWN0aXZlIiwicHJvbWlzZSIsInRkIiwidGlkIiwidHNfaW50ZXJ2YWwiLCJjdHJsIiwiY29kZWMiLCJjaGVja1BpbmciLCJzZXRJbnRlcnZhbCIsInVucmVmIiwiY2xlYXIiLCJjbGVhckludGVydmFsIiwibXNnX2NvZGVjIiwibXNnQ29kZWNzIiwibmFtZSIsImVudHJpZXMiLCJqc29uX3NlbmQiLCJwX3JlcGx5IiwidGltZW91dCIsIlJlcGx5VGltZW91dCIsInNldFRpbWVvdXQiLCJtc190aW1lb3V0IiwiRW5kcG9pbnQiLCJzdWJjbGFzcyIsImV4dGVuc2lvbnMiLCJlcF9zZWxmIiwidG9KU09OIiwid2l0aEVuZHBvaW50IiwiTWFwIiwiY3JlYXRlTWFwIiwiYnlfdG9rZW4iLCJjcmVhdGVSZXBseU1hcCIsImJ5X3RyYWZmaWMiLCJjcmVhdGVUcmFmZmljTWFwIiwidHJhZmZpYyIsInRzIiwibm93IiwicmVjdlRyYWZmaWMiLCJjcmVhdGVTdGF0ZU1hcCIsInJtc2ciLCJpc19yZXBseSIsImFzX3NlbmRlciIsIndhcm4iLCJpbml0UmVwbHlQcm9taXNlIiwiY2F0Y2giLCJ3aXRoUmVqZWN0VGltZW91dCIsImRlZmF1bHRfcGx1Z2luX29wdGlvbnMiLCJjbGFzc2VzIiwicGx1Z2luX29wdGlvbnMiLCJkZWZhdWx0X29uX21zZyIsImRlZmF1bHRfb25fZXJyb3IiLCJkZWZhdWx0X29uX3NodXRkb3duIiwiZXBfa2luZHMiLCJvcmRlciIsInBvc3QiLCJGYWJyaWNIdWJfUEkiLCJiYXNlcyIsImlzUGFja2V0UGFyc2VyIiwicGx1Z2luX25hbWUiLCJiaW5kRW5kcG9pbnRBcGkiLCJwcm90b2NvbHMiLCJNc2dDdHhfcGkiLCJTaW5rQmFzZSIsIk1zZ0N0eEJhc2UiLCJFbmRwb2ludEJhc2UiLCJjb25uZWN0X3NlbGYiLCJzZXRQcm90b3R5cGVPZiIsInRhcmdldHMiLCJoYXMiLCJpZF9zZWxmIiwicmVhZHkiLCJfYWZ0ZXJfaW5pdCIsInJlZ2lzdGVyIiwiZ2V0UmFuZG9tVmFsdWVzIiwid2luZG93IiwiY3J5cHRvIiwiZW5kcG9pbnRfYnJvd3NlciIsImFyciIsIkludDMyQXJyYXkiLCJlbmRwb2ludF9wbHVnaW4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFPLE1BQU1BLGFBQVdDLE9BQU9DLE1BQVAsQ0FBZ0JELE9BQU9FLGNBQVAsQ0FBd0IsWUFBVSxFQUFsQyxDQUFoQixDQUFqQjtBQUNQLEFBQU8sU0FBU0MsV0FBVCxDQUFxQkMsS0FBckIsRUFBNEI7U0FDMUJDLE1BQVAsQ0FBZ0JOLFVBQWhCLEVBQTBCSyxL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

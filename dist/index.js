'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var crypto = require('crypto');

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

      if ('production' !== process.env.NODE_ENV) {
        const op = pack_hdr.op = recv_msg.op = frame.op;
        Object.defineProperty(pack_hdr, 'name', { value: `pack_hdr «${op}»` });
        Object.defineProperty(recv_msg, 'name', { value: `recv_msg «${op}»` });
      }
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
    return this.endpoint(api_endpoints.parallel(api));
  },
  api_parallel(api) {
    return this.endpoint(api_endpoints.parallel(api));
  },
  api_inorder(api) {
    return this.endpoint(api_endpoints.inorder(api));
  } });

const api_endpoints = {
  parallel(api) {
    return function (ep, hub) {
      const rpc = api_endpoints.bind_rpc(api, ep, hub);
      return { rpc,
        async on_msg({ msg, sender }) {
          await rpc.invoke(sender, msg.op, api_fn => api_fn(msg.kw, msg.ctx));
        } };
    };
  },

  inorder(api) {
    return function (ep, hub) {
      const rpc = api_endpoints.bind_rpc(api, ep, hub);
      return { rpc,
        async on_msg({ msg, sender }) {
          await rpc.invoke_gated(sender, msg.op, api_fn => api_fn(msg.kw, msg.ctx));
        } };
    };
  },

  bind_rpc(api, ep, hub) {
    const pfx = api.op_prefix || 'rpc_';
    const lookup_op = api.op_lookup ? op => api.op_lookup(pfx + op, ep, hub) : 'function' === typeof api ? op => api(pfx + op, ep, hub) : op => {
      const fn = api[pfx + op];
      return fn ? fn.bind(api) : fn;
    };

    return Object.create(rpc_api, {
      lookup_op: { value: lookup_op },
      err_from: { value: ep.ep_self() } });
  } };

const rpc_api = {
  async invoke(sender, op, cb) {
    const api_fn = await this.resolve_op(sender, op);
    if (undefined === api_fn) {
      return;
    }

    const res = this.answer(sender, api_fn, cb);
    return await res;
  },

  async invoke_gated(sender, op, cb) {
    const api_fn = await this.resolve_op(sender, op);
    if (undefined === api_fn) {
      return;
    }

    const res = Promise.resolve(this.gate).then(() => this.answer(sender, api_fn, cb));
    this.gate = res.then(noop, noop);
    return await res;
  },

  async resolve_op(sender, op) {
    if ('string' !== typeof op) {
      await sender.send({ op, err_from: this.err_from,
        error: { message: 'Invalid operation', code: 400 } });
      return;
    }

    try {
      const api_fn = await this.lookup_op(op);
      if (!api_fn) {
        await sender.send({ op, err_from: this.err_from,
          error: { message: 'Unknown operation', code: 404 } });
      }
      return api_fn;
    } catch (err) {
      await sender.send({ op, err_from: this.err_from,
        error: { message: `Invalid operation: ${err.message}`, code: 500 } });
    }
  },

  async answer(sender, api_fn, cb) {
    try {
      var answer = cb ? await cb(api_fn) : await api_fn();
    } catch (err) {
      await sender.send({ err_from: this.err_from, error: err });
      return false;
    }

    if (sender.replyExpected) {
      await sender.send({ answer });
    }
    return true;
  } };

function noop() {}

add_ep_kind({
  server(on_init) {
    return this.endpoint(on_init);
  } });

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

const getRandomValues = 'undefined' !== typeof window ? window.crypto.getRandomValues : null;

endpoint_browser.random_id = random_id$1;
function random_id$1() {
  const arr = new Int32Array(1);
  getRandomValues(arr);
  return arr[0];
}

function endpoint_browser(plugin_options = {}) {
  if (null == plugin_options.random_id) {
    plugin_options.random_id = random_id$1;
  }

  return endpoint_plugin(plugin_options);
}

exports.endpoint_nodejs = endpoint_nodejs;
exports.endpoint_browser = endpoint_browser;
exports['default'] = endpoint_plugin;
exports.endpoint = endpoint_plugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvcHJvdG9jb2wvZnJhbWluZy5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL3NoYXJlZC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2pzb24uanN5IiwiLi4vY29kZS9wcm90b2NvbC9iaW5hcnkuanN5IiwiLi4vY29kZS9wcm90b2NvbC9jb250cm9sLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvaW5kZXguanN5IiwiLi4vY29kZS9zaW5rLmpzeSIsIi4uL2NvZGUvZXBfa2luZHMvZXh0ZW5zaW9ucy5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2NsaWVudC5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2FwaS5qc3kiLCIuLi9jb2RlL2VwX2tpbmRzL2luZGV4LmpzeSIsIi4uL2NvZGUvZXBfdGFyZ2V0LmpzeSIsIi4uL2NvZGUvbXNnY3R4LmpzeSIsIi4uL2NvZGUvZW5kcG9pbnQuanN5IiwiLi4vY29kZS9wbHVnaW4uanN5IiwiLi4vY29kZS9pbmRleC5ub2RlanMuanN5IiwiLi4vY29kZS9pbmRleC5icm93c2VyLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBsaXR0bGVfZW5kaWFuID0gdHJ1ZVxuY29uc3QgY19zaW5nbGUgPSAnc2luZ2xlJ1xuY29uc3QgY19kYXRhZ3JhbSA9ICdkYXRhZ3JhbSdcbmNvbnN0IGNfZGlyZWN0ID0gJ2RpcmVjdCdcbmNvbnN0IGNfbXVsdGlwYXJ0ID0gJ211bHRpcGFydCdcbmNvbnN0IGNfc3RyZWFtaW5nID0gJ3N0cmVhbWluZydcblxuY29uc3QgX2Vycl9tc2dpZF9yZXF1aXJlZCA9IGBSZXNwb25zZSByZXFpcmVzICdtc2dpZCdgXG5jb25zdCBfZXJyX3Rva2VuX3JlcXVpcmVkID0gYFRyYW5zcG9ydCByZXFpcmVzICd0b2tlbidgXG5cblxuZnVuY3Rpb24gZnJtX3JvdXRpbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MSwgbWFzayA9IDB4MVxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLmZyb21faWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCB7ZnJvbV9pZH0gPSBvYmpcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF9yb3V0ZXIsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDMyIEAgNCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF90YXJnZXQsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IGZyb21faWQgPSB1bmRlZmluZWQgPT09IG9iai5mcm9tX2lkXG4gICAgICAgID8gb2JqLmZyb21faWQgPSB7fSA6IG9iai5mcm9tX2lkXG4gICAgICBmcm9tX2lkLmlkX3JvdXRlciA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGZyb21faWQuaWRfdGFyZ2V0ID0gZHYuZ2V0SW50MzIgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5mdW5jdGlvbiBmcm1fcmVzcG9uc2UoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MiwgbWFzayA9IDB4MlxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLm1zZ2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoubXNnaWQgOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl9tc2dpZF9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLm1zZ2lkLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXFfYWNrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5hY2tfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50b2tlbiA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfYWNrID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLmFja19mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuXG5cbmZ1bmN0aW9uIGZybV9kYXRhZ3JhbSgpIDo6XG4gIGNvbnN0IHNpemUgPSAwLCBiaXRzID0gMHgwLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RhdGFncmFtXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGF0YWdyYW0gPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kYXRhZ3JhbVxuXG5mdW5jdGlvbiBmcm1fZGlyZWN0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDQsIGJpdHMgPSAweDQsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGlyZWN0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGlyZWN0ID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGlyZWN0XG5cbmZ1bmN0aW9uIGZybV9tdWx0aXBhcnQoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4OCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19tdWx0aXBhcnRcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19tdWx0aXBhcnQgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjogLy8gdXNlIHNlcV9uZXh0XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX211bHRpcGFydFxuXG5mdW5jdGlvbiBmcm1fc3RyZWFtaW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweGMsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfc3RyZWFtaW5nXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfc3RyZWFtaW5nID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW4gLy8gdXNlIHNlcV9uZXh0XG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19zdHJlYW1pbmdcblxuXG5mdW5jdGlvbiBiaW5kX3NlcV9uZXh0KG9mZnNldCkgOjpcbiAgY29uc3Qgc2VxX29mZnNldCA9IHRoaXMuc2VxX3BvcyArIG9mZnNldFxuICBsZXQgc2VxID0gMVxuICByZXR1cm4gZnVuY3Rpb24gc2VxX25leHQoe2ZsYWdzLCBmaW59LCBkdikgOjpcbiAgICBpZiAhIGZpbiA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCBzZXErKywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICBlbHNlIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIC1zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgICBzZXEgPSBOYU5cblxuXG5cbmV4cG9ydCBkZWZhdWx0IGNvbXBvc2VGcmFtaW5ncygpXG5mdW5jdGlvbiBjb21wb3NlRnJhbWluZ3MoKSA6OlxuICBjb25zdCBmcm1fZnJvbSA9IGZybV9yb3V0aW5nKCksIGZybV9yZXNwID0gZnJtX3Jlc3BvbnNlKClcbiAgY29uc3QgZnJtX3RyYW5zcG9ydHMgPSBAW10gZnJtX2RhdGFncmFtKCksIGZybV9kaXJlY3QoKSwgZnJtX211bHRpcGFydCgpLCBmcm1fc3RyZWFtaW5nKClcblxuICBpZiA4ICE9PSBmcm1fZnJvbS5zaXplIHx8IDggIT09IGZybV9yZXNwLnNpemUgfHwgNCAhPSBmcm1fdHJhbnNwb3J0cy5sZW5ndGggOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgRnJhbWluZyBTaXplIGNoYW5nZWBcblxuICBjb25zdCBieUJpdHMgPSBbXSwgbWFzaz0weGZcblxuICA6OlxuICAgIGNvbnN0IHRfZnJvbSA9IGZybV9mcm9tLmZfdGVzdCwgdF9yZXNwID0gZnJtX3Jlc3AuZl90ZXN0XG4gICAgY29uc3QgW3QwLHQxLHQyLHQzXSA9IGZybV90cmFuc3BvcnRzLm1hcCBAIGY9PmYuZl90ZXN0XG5cbiAgICBjb25zdCB0ZXN0Qml0cyA9IGJ5Qml0cy50ZXN0Qml0cyA9IG9iaiA9PlxuICAgICAgMCB8IHRfZnJvbShvYmopIHwgdF9yZXNwKG9iaikgfCB0MChvYmopIHwgdDEob2JqKSB8IHQyKG9iaikgfCB0MyhvYmopXG5cbiAgICBieUJpdHMuY2hvb3NlID0gZnVuY3Rpb24gKG9iaiwgbHN0KSA6OlxuICAgICAgaWYgbnVsbCA9PSBsc3QgOjogbHN0ID0gdGhpcyB8fCBieUJpdHNcbiAgICAgIHJldHVybiBsc3RbdGVzdEJpdHMob2JqKV1cblxuXG4gIGZvciBjb25zdCBUIG9mIGZybV90cmFuc3BvcnRzIDo6XG4gICAgY29uc3Qge2JpdHM6Yiwgc2l6ZSwgdHJhbnNwb3J0fSA9IFRcblxuICAgIGJ5Qml0c1tifDBdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwwLCBtYXNrLCBzaXplOiBzaXplLCBvcDogJydcbiAgICBieUJpdHNbYnwxXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MSwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAnZidcbiAgICBieUJpdHNbYnwyXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MiwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAncidcbiAgICBieUJpdHNbYnwzXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MywgbWFzaywgc2l6ZTogMTYgKyBzaXplLCBvcDogJ2ZyJ1xuXG4gICAgZm9yIGNvbnN0IGZuX2tleSBvZiBbJ2ZfcGFjaycsICdmX3VucGFjayddIDo6XG4gICAgICBjb25zdCBmbl90cmFuID0gVFtmbl9rZXldLCBmbl9mcm9tID0gZnJtX2Zyb21bZm5fa2V5XSwgZm5fcmVzcCA9IGZybV9yZXNwW2ZuX2tleV1cblxuICAgICAgYnlCaXRzW2J8MF1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3RyYW4ob2JqLCBkdiwgMClcbiAgICAgIGJ5Qml0c1tifDFdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwyXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fcmVzcChvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8M11bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3Jlc3Aob2JqLCBkdiwgOCk7IGZuX3RyYW4ob2JqLCBkdiwgMTYpXG5cbiAgZm9yIGNvbnN0IGZybSBvZiBieUJpdHMgOjpcbiAgICBiaW5kQXNzZW1ibGVkIEAgZnJtXG5cbiAgcmV0dXJuIGJ5Qml0c1xuXG5cbmZ1bmN0aW9uIGJpbmRBc3NlbWJsZWQoZnJtKSA6OlxuICBjb25zdCB7VCwgc2l6ZSwgZl9wYWNrLCBmX3VucGFja30gPSBmcm1cbiAgaWYgVC5iaW5kX3NlcV9uZXh0IDo6XG4gICAgZnJtLnNlcV9uZXh0ID0gVC5iaW5kX3NlcV9uZXh0IEAgZnJtLnNpemUgLSBULnNpemVcblxuICBkZWxldGUgZnJtLlRcbiAgZnJtLnBhY2sgPSBwYWNrIDsgZnJtLnVucGFjayA9IHVucGFja1xuICBjb25zdCBzZXFfbmV4dCA9IGZybS5zZXFfbmV4dFxuXG4gIGZ1bmN0aW9uIHBhY2socGt0X3R5cGUsIHBrdF9vYmopIDo6XG4gICAgaWYgISBAIDAgPD0gcGt0X3R5cGUgJiYgcGt0X3R5cGUgPD0gMjU1IDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBrdF90eXBlIHRvIGJlIFswLi4yNTVdYFxuXG4gICAgcGt0X29iai50eXBlID0gcGt0X3R5cGVcbiAgICBpZiBzZXFfbmV4dCAmJiBudWxsID09IHBrdF9vYmouc2VxIDo6XG4gICAgICBwa3Rfb2JqLnNlcSA9IHRydWVcblxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IEFycmF5QnVmZmVyKHNpemUpXG4gICAgZl9wYWNrKHBrdF9vYmosIGR2LCAwKVxuICAgIHBrdF9vYmouaGVhZGVyID0gZHYuYnVmZmVyXG5cbiAgICBpZiB0cnVlID09PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgX2JpbmRfaXRlcmFibGUgQCBwa3Rfb2JqLCBkdi5idWZmZXIuc2xpY2UoMCxzaXplKVxuXG4gIGZ1bmN0aW9uIHVucGFjayhwa3QpIDo6XG4gICAgY29uc3QgYnVmID0gcGt0LmhlYWRlcl9idWZmZXIoKVxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IFVpbnQ4QXJyYXkoYnVmKS5idWZmZXJcblxuICAgIGNvbnN0IGluZm8gPSB7fVxuICAgIGZfdW5wYWNrKGluZm8sIGR2LCAwKVxuICAgIHJldHVybiBwa3QuaW5mbyA9IGluZm9cblxuICBmdW5jdGlvbiBfYmluZF9pdGVyYWJsZShwa3Rfb2JqLCBidWZfY2xvbmUpIDo6XG4gICAgY29uc3Qge3R5cGV9ID0gcGt0X29ialxuICAgIGNvbnN0IHtpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHRsLCB0b2tlbn0gPSBwa3Rfb2JqXG4gICAgcGt0X29iai5uZXh0ID0gbmV4dFxuXG4gICAgZnVuY3Rpb24gbmV4dChvcHRpb25zKSA6OlxuICAgICAgaWYgbnVsbCA9PSBvcHRpb25zIDo6IG9wdGlvbnMgPSB7fVxuICAgICAgY29uc3QgaGVhZGVyID0gYnVmX2Nsb25lLnNsaWNlKClcbiAgICAgIHNlcV9uZXh0IEAgb3B0aW9ucywgbmV3IERhdGFWaWV3IEAgaGVhZGVyXG4gICAgICByZXR1cm4gQHt9IGRvbmU6ICEhIG9wdGlvbnMuZmluLCB2YWx1ZTogQHt9IC8vIHBrdF9vYmpcbiAgICAgICAgaWRfcm91dGVyLCBpZF90YXJnZXQsIHR5cGUsIHR0bCwgdG9rZW4sIGhlYWRlclxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGFja2V0UGFyc2VyLCBvcHRpb25zLCBmcmFnbWVudF9zaXplKSA6OlxuICBjb25zdCB7Y29uY2F0QnVmZmVycywgcGFja1BhY2tldE9iaiwgcGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBwYWNrZXRQYXJzZXJcbiAgZnJhZ21lbnRfc2l6ZSA9IE51bWJlcihmcmFnbWVudF9zaXplIHx8IDgwMDApXG4gIGlmIDEwMjQgPiBmcmFnbWVudF9zaXplIHx8IDY1MDAwIDwgZnJhZ21lbnRfc2l6ZSA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIGZyYWdtZW50IHNpemU6ICR7ZnJhZ21lbnRfc2l6ZX1gXG5cbiAgY29uc3Qge3JhbmRvbV9pZCwganNvbl9wYWNrfSA9IG9wdGlvbnNcbiAgcmV0dXJuIEA6IHBhY2tldFBhcnNlciwgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwgcGFja2V0RnJhZ21lbnRzXG4gICAgYmluZFRyYW5zcG9ydHNcblxuXG4gIGZ1bmN0aW9uIGNyZWF0ZU11bHRpcGFydChwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBwYXJ0cyA9IFtdLCBmaW4gPSBmYWxzZVxuICAgIHJldHVybiBAe30gZmVlZCwgaW5mbzogcGt0LmluZm9cblxuICAgIGZ1bmN0aW9uIGZlZWQocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxIDwgMCA6OiBmaW4gPSB0cnVlOyBzZXEgPSAtc2VxXG4gICAgICBwYXJ0c1tzZXEtMV0gPSBwa3QuYm9keV9idWZmZXIoKVxuXG4gICAgICBpZiAhIGZpbiA6OiByZXR1cm5cbiAgICAgIGlmIHBhcnRzLmluY2x1ZGVzIEAgdW5kZWZpbmVkIDo6IHJldHVyblxuXG4gICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuXG4gICAgICBjb25zdCByZXMgPSBjb25jYXRCdWZmZXJzKHBhcnRzKVxuICAgICAgcGFydHMgPSBudWxsXG4gICAgICByZXR1cm4gcmVzXG5cbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtKHBrdCwgc2luaywgbXNnaWQpIDo6XG4gICAgbGV0IG5leHQ9MCwgZmluID0gZmFsc2UsIHJlY3ZEYXRhLCByc3RyZWFtXG4gICAgY29uc3Qgc3RhdGUgPSBAe30gZmVlZDogZmVlZF9pbml0LCBpbmZvOiBwa3QuaW5mb1xuICAgIHJldHVybiBzdGF0ZVxuXG4gICAgZnVuY3Rpb24gZmVlZF9pbml0KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuXG4gICAgICBjb25zdCBpbmZvID0gcGt0LmluZm9cbiAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiAgICAgIHJzdHJlYW0gPSBzaW5rLnJlY3ZTdHJlYW0obXNnLCBpbmZvKVxuICAgICAgaWYgbnVsbCA9PSByc3RyZWFtIDo6IHJldHVyblxuICAgICAgY2hlY2tfZm5zIEAgcnN0cmVhbSwgJ29uX2Vycm9yJywgJ29uX2RhdGEnLCAnb25fZW5kJyBcbiAgICAgIHJlY3ZEYXRhID0gc2luay5yZWN2U3RyZWFtRGF0YS5iaW5kKHNpbmssIHJzdHJlYW0sIGluZm8pXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9ib2R5XG4gICAgICBpZiByc3RyZWFtLm9uX2luaXQgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25faW5pdChtc2csIHBrdClcblxuICAgIGZ1bmN0aW9uIGZlZWRfYm9keShwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICByZWN2RGF0YSgpXG4gICAgICBsZXQgZGF0YVxuICAgICAgdHJ5IDo6XG4gICAgICAgIGZlZWRfc2VxKHBrdClcbiAgICAgICAgZGF0YSA9IGFzX2NvbnRlbnQocGt0LCBzaW5rKVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgaWYgZmluIDo6XG4gICAgICAgIGNvbnN0IHJlcyA9IHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lbmQgQCByZXMsIHBrdFxuICAgICAgZWxzZSA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9kYXRhIEAgZGF0YSwgcGt0XG5cbiAgICBmdW5jdGlvbiBmZWVkX2lnbm9yZShwa3QpIDo6XG4gICAgICB0cnkgOjogZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG5cbiAgICBmdW5jdGlvbiBmZWVkX3NlcShwa3QpIDo6XG4gICAgICBsZXQgc2VxID0gcGt0LmluZm8uc2VxXG4gICAgICBpZiBzZXEgPj0gMCA6OlxuICAgICAgICBpZiBuZXh0KysgPT09IHNlcSA6OlxuICAgICAgICAgIHJldHVybiAvLyBpbiBvcmRlclxuICAgICAgZWxzZSA6OlxuICAgICAgICBmaW4gPSB0cnVlXG4gICAgICAgIHNpbmsuZGVsZXRlU3RhdGVGb3IobXNnaWQpXG4gICAgICAgIGlmIG5leHQgPT09IC1zZXEgOjpcbiAgICAgICAgICBuZXh0ID0gJ2RvbmUnXG4gICAgICAgICAgcmV0dXJuIC8vIGluLW9yZGVyLCBsYXN0IHBhY2tldFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcbiAgICAgIG5leHQgPSAnaW52YWxpZCdcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYWNrZXQgb3V0IG9mIHNlcXVlbmNlYFxuXG4gIGZ1bmN0aW9uICogcGFja2V0RnJhZ21lbnRzKGJ1ZiwgbmV4dF9oZHIsIGZpbikgOjpcbiAgICBpZiBudWxsID09IGJ1ZiA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICB5aWVsZCBvYmpcbiAgICAgIHJldHVyblxuXG4gICAgbGV0IGkgPSAwLCBsYXN0SW5uZXIgPSBidWYuYnl0ZUxlbmd0aCAtIGZyYWdtZW50X3NpemU7XG4gICAgd2hpbGUgaSA8IGxhc3RJbm5lciA6OlxuICAgICAgY29uc3QgaTAgPSBpXG4gICAgICBpICs9IGZyYWdtZW50X3NpemVcblxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoKVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaTAsIGkpXG4gICAgICB5aWVsZCBvYmpcblxuICAgIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkpXG4gICAgICB5aWVsZCBvYmpcblxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IG91dGJvdW5kID0gW11cbiAgICBvdXRib3VuZC5jaG9vc2UgPSBmcmFtaW5ncy5jaG9vc2VcblxuICAgIGZvciBjb25zdCBmcmFtZSBvZiBmcmFtaW5ncyA6OlxuICAgICAgY29uc3QgaW1wbCA9IGZyYW1lID8gdHJhbnNwb3J0c1tmcmFtZS50cmFuc3BvcnRdIDogbnVsbFxuICAgICAgaWYgISBpbXBsIDo6IGNvbnRpbnVlXG5cbiAgICAgIGNvbnN0IHtiaXRzLCBwYWNrLCB1bnBhY2t9ID0gZnJhbWVcbiAgICAgIGNvbnN0IHBrdF90eXBlID0gaGlnaGJpdHMgfCBiaXRzXG4gICAgICBjb25zdCB7dF9yZWN2fSA9IGltcGxcblxuICAgICAgZnVuY3Rpb24gcGFja19oZHIob2JqKSA6OlxuICAgICAgICBwYWNrKHBrdF90eXBlLCBvYmopXG4gICAgICAgIHJldHVybiBvYmpcblxuICAgICAgZnVuY3Rpb24gcmVjdl9tc2cocGt0LCBzaW5rKSA6OlxuICAgICAgICB1bnBhY2socGt0KVxuICAgICAgICByZXR1cm4gdF9yZWN2KHBrdCwgc2luaylcblxuICAgICAgcGFja19oZHIucGt0X3R5cGUgPSByZWN2X21zZy5wa3RfdHlwZSA9IHBrdF90eXBlXG4gICAgICBvdXRib3VuZFtiaXRzXSA9IHBhY2tfaGRyXG4gICAgICBpbmJvdW5kW3BrdF90eXBlXSA9IHJlY3ZfbXNnXG5cbiAgICAgIGlmICdwcm9kdWN0aW9uJyAhPT0gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgOjpcbiAgICAgICAgY29uc3Qgb3AgPSBwYWNrX2hkci5vcCA9IHJlY3ZfbXNnLm9wID0gZnJhbWUub3BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcGFja19oZHIsICduYW1lJywgQHt9IHZhbHVlOiBgcGFja19oZHIgwqske29wfcK7YFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCByZWN2X21zZywgJ25hbWUnLCBAe30gdmFsdWU6IGByZWN2X21zZyDCqyR7b3B9wrtgXG5cbiAgICByZXR1cm4gb3V0Ym91bmRcblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IHBhY2tCb2R5ID0gdHJhbnNwb3J0cy5wYWNrQm9keVxuICAgIGNvbnN0IG91dGJvdW5kID0gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKVxuICAgIHJldHVybiB0cmFuc3BvcnRzLnN0cmVhbWluZ1xuICAgICAgPyBAe30gc2VuZCwgc3RyZWFtOiBiaW5kX3N0cmVhbSBAIHRyYW5zcG9ydHMuc3RyZWFtaW5nLm1vZGVcbiAgICAgIDogQHt9IHNlbmRcblxuICAgIGZ1bmN0aW9uIHNlbmQoY2hhbiwgb2JqLCBib2R5KSA6OlxuICAgICAgYm9keSA9IHBhY2tCb2R5KGJvZHkpXG4gICAgICBpZiBmcmFnbWVudF9zaXplIDwgYm9keS5ieXRlTGVuZ3RoIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIG9iai50cmFuc3BvcnQgPSAnbXVsdGlwYXJ0J1xuICAgICAgICBjb25zdCBtc2VuZCA9IG1zZW5kX2J5dGVzKGNoYW4sIG9iailcbiAgICAgICAgcmV0dXJuIG1zZW5kIEAgdHJ1ZSwgYm9keVxuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gJ3NpbmdsZSdcbiAgICAgIG9iai5ib2R5ID0gYm9keVxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIHBhY2tfaGRyKG9iailcbiAgICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgICBmdW5jdGlvbiBtc2VuZF9ieXRlcyhjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGxldCB7bmV4dH0gPSBwYWNrX2hkcihvYmopXG4gICAgICBpZiBudWxsICE9PSBtc2cgOjpcbiAgICAgICAgb2JqLmJvZHkgPSBtc2dcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBjaGFuIEAgcGt0XG5cbiAgICAgIHJldHVybiBhc3luYyBmdW5jdGlvbiAoZmluLCBib2R5KSA6OlxuICAgICAgICBpZiBudWxsID09PSBuZXh0IDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgJ1dyaXRlIGFmdGVyIGVuZCdcbiAgICAgICAgbGV0IHJlc1xuICAgICAgICBmb3IgY29uc3Qgb2JqIG9mIHBhY2tldEZyYWdtZW50cyBAIGJvZHksIG5leHQsIGZpbiA6OlxuICAgICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgICByZXMgPSBhd2FpdCBjaGFuIEAgcGt0XG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gcmVzXG5cbiAgICBmdW5jdGlvbiBtc2VuZF9vYmplY3RzKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBjb25zdCBvYmogPSBuZXh0KHtmaW59KVxuICAgICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIGJpbmRfc3RyZWFtKG1vZGUpIDo6XG4gICAgICBjb25zdCBtc2VuZF9pbXBsID0ge29iamVjdDogbXNlbmRfb2JqZWN0cywgYnl0ZXM6IG1zZW5kX2J5dGVzfVttb2RlXVxuICAgICAgaWYgbXNlbmRfaW1wbCA6OiByZXR1cm4gc3RyZWFtXG5cbiAgICAgIGZ1bmN0aW9uIHN0cmVhbShjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgICAgaWYgISBvYmoudG9rZW4gOjogb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzdHJlYW1pbmcnXG4gICAgICAgIGNvbnN0IG1zZW5kID0gbXNlbmRfaW1wbCBAIGNoYW4sIG9iaiwganNvbl9wYWNrKG1zZylcbiAgICAgICAgd3JpdGUud3JpdGUgPSB3cml0ZTsgd3JpdGUuZW5kID0gd3JpdGUuYmluZCh0cnVlKVxuICAgICAgICByZXR1cm4gd3JpdGVcblxuICAgICAgICBmdW5jdGlvbiB3cml0ZShjaHVuaykgOjpcbiAgICAgICAgICByZXR1cm4gY2h1bmsgIT0gbnVsbFxuICAgICAgICAgICAgPyBtc2VuZCBAIHRydWU9PT10aGlzLCBwYWNrQm9keShjaHVuaylcbiAgICAgICAgICAgIDogbXNlbmQgQCB0cnVlXG5cblxuZnVuY3Rpb24gY2hlY2tfZm5zKG9iaiwgLi4ua2V5cykgOjpcbiAgZm9yIGNvbnN0IGtleSBvZiBrZXlzIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG9ialtrZXldIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIFwiJHtrZXl9XCIgdG8gYmUgYSBmdW5jdGlvbmBcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGpzb25fcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIGpzb25fcGFja30gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keVxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KCkgfHwgdW5kZWZpbmVkXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgYm9keV9idWYgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBib2R5X2J1ZiA6OlxuICAgICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCB1bnBhY2tfdXRmOChib2R5X2J1ZikgfHwgdW5kZWZpbmVkXG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdvYmplY3QnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICByZXR1cm4gc3RhdGUuZmVlZChwa3QsIHVucGFja0JvZHkpXG5cbiAgZnVuY3Rpb24gcGFja0JvZHkoYm9keSkgOjpcbiAgICByZXR1cm4gcGFja191dGY4IEAganNvbl9wYWNrKGJvZHkpXG5cbiAgZnVuY3Rpb24gdW5wYWNrQm9keShwa3QsIHNpbmspIDo6XG4gICAgcmV0dXJuIHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGJpbmFyeV9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbX0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICBjb25zdCB7YXNCdWZmZXJ9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICByZXR1cm4gQHt9XG4gICAgcGFja0JvZHk6IGFzQnVmZmVyXG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0gcGt0LmJvZHlfYnVmZmVyKClcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBtc2cgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2cgOjpcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ2J5dGVzJ1xuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVTdHJlYW1cbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QsIHBrdF9idWZmZXIpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG5mdW5jdGlvbiBwa3RfYnVmZmVyKHBrdCkgOjogcmV0dXJuIHBrdC5ib2R5X2J1ZmZlcigpXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBjb250cm9sX3Byb3RvY29sKGluYm91bmQsIGhpZ2gsIHNoYXJlZCkgOjpcbiAgY29uc3Qge3JhbmRvbV9pZH0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tQYWNrZXRPYmp9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIGNvbnN0IHBpbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgdG9rZW46IHRydWUsIHRyYW5zcG9ydDogJ2RpcmVjdCdcbiAgY29uc3QgcG9uZ19mcmFtZSA9IGZyYW1pbmdzLmNob29zZSBAOiBmcm9tX2lkOiB0cnVlLCBtc2dpZDogdHJ1ZSwgdHJhbnNwb3J0OiAnZGF0YWdyYW0nXG5cbiAgY29uc3QgcG9uZ190eXBlID0gaGlnaHwweGVcbiAgaW5ib3VuZFtwb25nX3R5cGVdID0gcmVjdl9wb25nXG4gIGNvbnN0IHBpbmdfdHlwZSA9IGhpZ2h8MHhmXG4gIGluYm91bmRbaGlnaHwweGZdID0gcmVjdl9waW5nXG5cbiAgcmV0dXJuIEB7fSBzZW5kOnBpbmcsIHBpbmdcblxuICBmdW5jdGlvbiBwaW5nKGNoYW4sIG9iaikgOjpcbiAgICBpZiAhIG9iai50b2tlbiA6OlxuICAgICAgb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICBvYmouYm9keSA9IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICBvcDogJ3BpbmcnLCB0czA6IG5ldyBEYXRlKClcbiAgICBwaW5nX2ZyYW1lLnBhY2socGluZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgZnVuY3Rpb24gcmVjdl9waW5nKHBrdCwgc2luaywgcm91dGVyKSA6OlxuICAgIHBpbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIF9zZW5kX3BvbmcgQCBwa3QuYm9keSwgcGt0LCByb3V0ZXJcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiAgZnVuY3Rpb24gX3NlbmRfcG9uZyh7dHMwfSwgcGt0X3BpbmcsIHJvdXRlcikgOjpcbiAgICBjb25zdCB7bXNnaWQsIGlkX3RhcmdldCwgaWRfcm91dGVyLCBmcm9tX2lkOnJfaWR9ID0gcGt0X3BpbmcuaW5mb1xuICAgIGNvbnN0IG9iaiA9IEB7fSBtc2dpZFxuICAgICAgZnJvbV9pZDogQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyXG4gICAgICBpZF9yb3V0ZXI6IHJfaWQuaWRfcm91dGVyLCBpZF90YXJnZXQ6IHJfaWQuaWRfdGFyZ2V0XG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSBAOlxuICAgICAgICBvcDogJ3BvbmcnLCB0czAsIHRzMTogbmV3IERhdGUoKVxuXG4gICAgcG9uZ19mcmFtZS5wYWNrKHBvbmdfdHlwZSwgb2JqKVxuICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICByZXR1cm4gcm91dGVyLmRpc3BhdGNoIEAgW3BrdF1cblxuICBmdW5jdGlvbiByZWN2X3BvbmcocGt0LCBzaW5rKSA6OlxuICAgIHBvbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIHJldHVybiBzaW5rLnJlY3ZDdHJsKHBrdC5ib2R5LCBwa3QuaW5mbylcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5pbXBvcnQgc2hhcmVkX3Byb3RvIGZyb20gJy4vc2hhcmVkLmpzeSdcbmltcG9ydCBqc29uX3Byb3RvIGZyb20gJy4vanNvbi5qc3knXG5pbXBvcnQgYmluYXJ5X3Byb3RvIGZyb20gJy4vYmluYXJ5LmpzeSdcbmltcG9ydCBjb250cm9sX3Byb3RvIGZyb20gJy4vY29udHJvbC5qc3knXG5cbmV4cG9ydCAqIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGluaXRfcHJvdG9jb2wocGFja2V0UGFyc2VyLCBvcHRpb25zKSA6OlxuICBjb25zdCBzaGFyZWQgPSBzaGFyZWRfcHJvdG8gQCBwYWNrZXRQYXJzZXIsIG9wdGlvbnNcblxuICBjb25zdCBpbmJvdW5kID0gW11cbiAgY29uc3QganNvbiA9IHNoYXJlZC5iaW5kVHJhbnNwb3J0cyBAIGluYm91bmRcbiAgICAweDAwIC8vIDB4MCog4oCUIEpTT04gYm9keVxuICAgIGpzb25fcHJvdG8oc2hhcmVkKVxuXG4gIGNvbnN0IGJpbmFyeSA9IHNoYXJlZC5iaW5kVHJhbnNwb3J0cyBAIGluYm91bmRcbiAgICAweDEwIC8vIDB4MSog4oCUIGJpbmFyeSBib2R5XG4gICAgYmluYXJ5X3Byb3RvKHNoYXJlZClcblxuICBjb25zdCBjb250cm9sID0gY29udHJvbF9wcm90byBAIGluYm91bmQsXG4gICAgMHhmMCAvLyAweGYqIOKAlCBjb250cm9sXG4gICAgc2hhcmVkXG5cbiAgY29uc3QgY29kZWNzID0gQDoganNvbiwgYmluYXJ5LCBjb250cm9sLCBkZWZhdWx0OiBqc29uXG5cbiAgY29uc3Qge3JhbmRvbV9pZH0gPSBzaGFyZWRcbiAgcmV0dXJuIEA6IGluYm91bmQsIGNvZGVjcywgcmFuZG9tX2lkXG5cblxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2luayA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtpbmJvdW5kfSkgOjpcbiAgICBjbGFzcyBTaW5rIGV4dGVuZHMgdGhpcyA6OlxuICAgIFNpbmsucHJvdG90eXBlLl9wcm90b2NvbCA9IGluYm91bmRcbiAgICByZXR1cm4gU2lua1xuXG4gIHJlZ2lzdGVyKGVuZHBvaW50LCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnMpIDo6XG4gICAgY29uc3QgdW5yZWdpc3RlciA9ICgpID0+IGh1Yi5yb3V0ZXIudW5yZWdpc3RlclRhcmdldChpZF90YXJnZXQpXG5cbiAgICBodWIucm91dGVyLnJlZ2lzdGVyVGFyZ2V0IEAgaWRfdGFyZ2V0LFxuICAgICAgdGhpcy5fYmluZERpc3BhdGNoIEAgZW5kcG9pbnQsIHVucmVnaXN0ZXIsIGhhbmRsZXJzXG4gICAgcmV0dXJuIHRoaXNcblxuICBfYmluZERpc3BhdGNoKGVuZHBvaW50LCB1bnJlZ2lzdGVyLCB7b25fbXNnLCBvbl9lcnJvciwgb25fc2h1dGRvd259KSA6OlxuICAgIGxldCBhbGl2ZSA9IHRydWVcbiAgICBjb25zdCBwcm90b2NvbCA9IHRoaXMuX3Byb3RvY29sXG4gICAgY29uc3QgaXNBbGl2ZSA9ICgpID0+IGFsaXZlXG4gICAgY29uc3Qgc2h1dGRvd24gPSAoZXJyLCBleHRyYSkgPT4gOjpcbiAgICAgIGlmIGFsaXZlIDo6XG4gICAgICAgIHVucmVnaXN0ZXIoKTsgdW5yZWdpc3RlciA9IGFsaXZlID0gZmFsc2VcbiAgICAgICAgb25fc2h1dGRvd24oZXJyLCBleHRyYSlcblxuICAgIE9iamVjdC5hc3NpZ24gQCB0aGlzLCBlbmRwb2ludC5iaW5kU2luayh0aGlzKSwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG4gICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cblxuICAgIHJldHVybiBhc3luYyAocGt0LCByb3V0ZXIpID0+IDo6XG4gICAgICBpZiBmYWxzZT09PWFsaXZlIHx8IG51bGw9PXBrdCA6OiByZXR1cm4gYWxpdmVcblxuICAgICAgY29uc3QgcmVjdl9tc2cgPSBwcm90b2NvbFtwa3QudHlwZV1cbiAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmVjdl9tc2cgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBmYWxzZSwgQHt9IHBrdCwgem9uZTogJ3BrdC50eXBlJ1xuXG4gICAgICB0cnkgOjpcbiAgICAgICAgdmFyIG1zZyA9IGF3YWl0IHJlY3ZfbXNnIEAgcGt0LCB0aGlzLCByb3V0ZXJcbiAgICAgICAgaWYgISBtc2cgOjogcmV0dXJuIG1zZ1xuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZXJyLCBAe30gcGt0LCB6b25lOiAncHJvdG9jb2wnXG5cbiAgICAgIGlmIGZhbHNlID09PSBhbGl2ZSA6OlxuICAgICAgICByZXR1cm4gcm91dGVyLnVucmVnaXN0ZXJcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIGF3YWl0IG9uX21zZyBAIG1zZywgcGt0XG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgdHJ5IDo6XG4gICAgICAgICAgdmFyIHRlcm1pbmF0ZSA9IG9uX2Vycm9yIEAgZXJyLCBAe30gbXNnLCBwa3QsIHpvbmU6ICdkaXNwYXRjaCdcbiAgICAgICAgZmluYWxseSA6OlxuICAgICAgICAgIGlmIGZhbHNlICE9PSB0ZXJtaW5hdGUgOjpcbiAgICAgICAgICAgIHNodXRkb3duKGVyciwge21zZywgcGt0fSlcbiAgICAgICAgICAgIHJldHVybiByb3V0ZXIudW5yZWdpc3RlclxuXG4gIHN0YXRlRm9yKHBrdCwgaWZBYnNlbnQpIDo6XG4gICAgY29uc3QgbXNnaWQgPSBwa3QuaW5mby5tc2dpZFxuICAgIGxldCBlbnRyeSA9IHRoaXMuYnlfbXNnaWQuZ2V0KG1zZ2lkKVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gZW50cnkgOjpcbiAgICAgIGlmICEgbXNnaWQgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYEludmFsaWQgbXNnaWQ6ICR7bXNnaWR9YFxuICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlmQWJzZW50IDo6XG4gICAgICAgIGVudHJ5ID0gaWZBYnNlbnQocGt0LCB0aGlzLCBtc2dpZClcbiAgICAgIGVsc2UgZW50cnkgPSBpZkFic2VudFxuICAgICAgdGhpcy5ieV9tc2dpZC5zZXQgQCBtc2dpZCwgZW50cnlcbiAgICByZXR1cm4gZW50cnlcblxuICBkZWxldGVTdGF0ZUZvcihtc2dpZCkgOjpcbiAgICByZXR1cm4gdGhpcy5ieV9tc2dpZC5kZWxldGUobXNnaWQpXG5cbiAganNvbl91bnBhY2sob2JqKSA6OiB0aHJvdyBuZXcgRXJyb3IgQCBgRW5kcG9pbnQgYmluZFNpbmsoKSByZXNwb25zaWJpbGl0eWBcblxuIiwiZXhwb3J0IGNvbnN0IGVwX3Byb3RvID0gT2JqZWN0LmNyZWF0ZSBAIE9iamVjdC5nZXRQcm90b3R5cGVPZiBAIGZ1bmN0aW9uKCl7fVxuZXhwb3J0IGZ1bmN0aW9uIGFkZF9lcF9raW5kKGtpbmRzKSA6OlxuICBPYmplY3QuYXNzaWduIEAgZXBfcHJvdG8sIGtpbmRzXG5leHBvcnQgZGVmYXVsdCBhZGRfZXBfa2luZFxuIiwiaW1wb3J0IGFkZF9lcF9raW5kIGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIGNsaWVudEVuZHBvaW50KGFwaSkgOjpcbiAgICBjb25zdCB0YXJnZXQgPSBjbGllbnRFbmRwb2ludChhcGkpXG4gICAgdGhpcy5lbmRwb2ludCBAIHRhcmdldFxuICAgIHJldHVybiB0YXJnZXQuZG9uZVxuXG4gIGNsaWVudCguLi5hcmdzKSA6OlxuICAgIGlmIDEgPT09IGFyZ3MubGVuZ3RoICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBhcmdzWzBdIDo6XG4gICAgICByZXR1cm4gdGhpcy5jbGllbnRFbmRwb2ludCBAIGFyZ3NbMF1cblxuICAgIGNvbnN0IG1zZ19jdHggPSBuZXcgdGhpcy5Nc2dDdHgoKVxuICAgIHJldHVybiAwICE9PSBhcmdzLmxlbmd0aCA/IG1zZ19jdHgudG8oLi4uYXJncykgOiBtc2dfY3R4XG5cblxuY29uc3QgZXBfY2xpZW50X2FwaSA9IEB7fVxuICBhc3luYyBvbl9yZWFkeShlcCwgaHViKSA6OlxuICAgIHRoaXMuX3Jlc29sdmUgQCBhd2FpdCB0aGlzLm9uX2NsaWVudF9yZWFkeShlcCwgaHViKVxuICAgIGF3YWl0IGVwLnNodXRkb3duKClcbiAgb25fc2VuZF9lcnJvcihlcCwgZXJyKSA6OlxuICAgIHRoaXMuX3JlamVjdChlcnIpXG4gIG9uX3NodXRkb3duKGVwLCBlcnIpIDo6XG4gICAgZXJyID8gdGhpcy5fcmVqZWN0KGVycikgOiB0aGlzLl9yZXNvbHZlKClcblxuZXhwb3J0IGZ1bmN0aW9uIGNsaWVudEVuZHBvaW50KG9uX2NsaWVudF9yZWFkeSkgOjpcbiAgbGV0IHRhcmdldCA9IE9iamVjdC5jcmVhdGUgQCBlcF9jbGllbnRfYXBpXG4gIHRhcmdldC5vbl9jbGllbnRfcmVhZHkgPSBvbl9jbGllbnRfcmVhZHlcbiAgdGFyZ2V0LmRvbmUgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgdGFyZ2V0Ll9yZXNvbHZlID0gcmVzb2x2ZVxuICAgIHRhcmdldC5fcmVqZWN0ID0gcmVqZWN0XG4gIHJldHVybiB0YXJnZXRcbiIsImltcG9ydCBhZGRfZXBfa2luZCBmcm9tICcuL2V4dGVuc2lvbnMuanN5J1xuXG5hZGRfZXBfa2luZCBAOlxuICBhcGkoYXBpKSA6OiByZXR1cm4gdGhpcy5lbmRwb2ludCBAIGFwaV9lbmRwb2ludHMucGFyYWxsZWwoYXBpKVxuICBhcGlfcGFyYWxsZWwoYXBpKSA6OiByZXR1cm4gdGhpcy5lbmRwb2ludCBAIGFwaV9lbmRwb2ludHMucGFyYWxsZWwoYXBpKVxuICBhcGlfaW5vcmRlcihhcGkpIDo6IHJldHVybiB0aGlzLmVuZHBvaW50IEAgYXBpX2VuZHBvaW50cy5pbm9yZGVyKGFwaSlcblxuXG5leHBvcnQgY29uc3QgYXBpX2VuZHBvaW50cyA9IEB7fVxuICBwYXJhbGxlbChhcGkpIDo6XG4gICAgcmV0dXJuIGZ1bmN0aW9uIChlcCwgaHViKSA6OlxuICAgICAgY29uc3QgcnBjID0gYXBpX2VuZHBvaW50cy5iaW5kX3JwYyhhcGksIGVwLCBodWIpXG4gICAgICByZXR1cm4gQHt9IHJwYyxcbiAgICAgICAgYXN5bmMgb25fbXNnKHttc2csIHNlbmRlcn0pIDo6XG4gICAgICAgICAgYXdhaXQgcnBjLmludm9rZSBAIHNlbmRlciwgbXNnLm9wLFxuICAgICAgICAgICAgYXBpX2ZuID0+IGFwaV9mbihtc2cua3csIG1zZy5jdHgpXG5cbiAgaW5vcmRlcihhcGkpIDo6XG4gICAgcmV0dXJuIGZ1bmN0aW9uIChlcCwgaHViKSA6OlxuICAgICAgY29uc3QgcnBjID0gYXBpX2VuZHBvaW50cy5iaW5kX3JwYyhhcGksIGVwLCBodWIpXG4gICAgICByZXR1cm4gQHt9IHJwYyxcbiAgICAgICAgYXN5bmMgb25fbXNnKHttc2csIHNlbmRlcn0pIDo6XG4gICAgICAgICAgYXdhaXQgcnBjLmludm9rZV9nYXRlZCBAIHNlbmRlciwgbXNnLm9wLFxuICAgICAgICAgICAgYXBpX2ZuID0+IGFwaV9mbihtc2cua3csIG1zZy5jdHgpXG5cbiAgYmluZF9ycGMoYXBpLCBlcCwgaHViKSA6OlxuICAgIGNvbnN0IHBmeCA9IGFwaS5vcF9wcmVmaXggfHwgJ3JwY18nXG4gICAgY29uc3QgbG9va3VwX29wID0gYXBpLm9wX2xvb2t1cFxuICAgICAgPyBvcCA9PiBhcGkub3BfbG9va3VwKHBmeCArIG9wLCBlcCwgaHViKVxuICAgICAgOiAnZnVuY3Rpb24nID09PSB0eXBlb2YgYXBpXG4gICAgICA/IG9wID0+IGFwaShwZnggKyBvcCwgZXAsIGh1YilcbiAgICAgIDogb3AgPT4gOjpcbiAgICAgICAgICBjb25zdCBmbiA9IGFwaVtwZnggKyBvcF1cbiAgICAgICAgICByZXR1cm4gZm4gPyBmbi5iaW5kKGFwaSkgOiBmblxuXG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCBycGNfYXBpLCBAe31cbiAgICAgIGxvb2t1cF9vcDogQHt9IHZhbHVlOiBsb29rdXBfb3BcbiAgICAgIGVycl9mcm9tOiBAe30gdmFsdWU6IGVwLmVwX3NlbGYoKVxuXG5cbmNvbnN0IHJwY19hcGkgPSBAOlxuICBhc3luYyBpbnZva2Uoc2VuZGVyLCBvcCwgY2IpIDo6XG4gICAgY29uc3QgYXBpX2ZuID0gYXdhaXQgdGhpcy5yZXNvbHZlX29wIEAgc2VuZGVyLCBvcFxuICAgIGlmIHVuZGVmaW5lZCA9PT0gYXBpX2ZuIDo6IHJldHVyblxuXG4gICAgY29uc3QgcmVzID0gdGhpcy5hbnN3ZXIgQCBzZW5kZXIsIGFwaV9mbiwgY2JcbiAgICByZXR1cm4gYXdhaXQgcmVzXG5cbiAgYXN5bmMgaW52b2tlX2dhdGVkKHNlbmRlciwgb3AsIGNiKSA6OlxuICAgIGNvbnN0IGFwaV9mbiA9IGF3YWl0IHRoaXMucmVzb2x2ZV9vcCBAIHNlbmRlciwgb3BcbiAgICBpZiB1bmRlZmluZWQgPT09IGFwaV9mbiA6OiByZXR1cm5cblxuICAgIGNvbnN0IHJlcyA9IFByb21pc2UucmVzb2x2ZSh0aGlzLmdhdGUpXG4gICAgICAudGhlbiBAICgpID0+IHRoaXMuYW5zd2VyIEAgc2VuZGVyLCBhcGlfZm4sIGNiXG4gICAgdGhpcy5nYXRlID0gcmVzLnRoZW4obm9vcCwgbm9vcClcbiAgICByZXR1cm4gYXdhaXQgcmVzXG5cbiAgYXN5bmMgcmVzb2x2ZV9vcChzZW5kZXIsIG9wKSA6OlxuICAgIGlmICdzdHJpbmcnICE9PSB0eXBlb2Ygb3AgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbVxuICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6ICdJbnZhbGlkIG9wZXJhdGlvbicsIGNvZGU6IDQwMFxuICAgICAgcmV0dXJuXG5cbiAgICB0cnkgOjpcbiAgICAgIGNvbnN0IGFwaV9mbiA9IGF3YWl0IHRoaXMubG9va3VwX29wKG9wKVxuICAgICAgaWYgISBhcGlfZm4gOjpcbiAgICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogb3AsIGVycl9mcm9tOiB0aGlzLmVycl9mcm9tXG4gICAgICAgICAgZXJyb3I6IEB7fSBtZXNzYWdlOiAnVW5rbm93biBvcGVyYXRpb24nLCBjb2RlOiA0MDRcbiAgICAgIHJldHVybiBhcGlfZm5cbiAgICBjYXRjaCBlcnIgOjpcbiAgICAgIGF3YWl0IHNlbmRlci5zZW5kIEA6IG9wLCBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbVxuICAgICAgICBlcnJvcjogQHt9IG1lc3NhZ2U6IGBJbnZhbGlkIG9wZXJhdGlvbjogJHtlcnIubWVzc2FnZX1gLCBjb2RlOiA1MDBcblxuICBhc3luYyBhbnN3ZXIoc2VuZGVyLCBhcGlfZm4sIGNiKSA6OlxuICAgIHRyeSA6OlxuICAgICAgdmFyIGFuc3dlciA9IGNiID8gYXdhaXQgY2IoYXBpX2ZuKSA6IGF3YWl0IGFwaV9mbigpXG4gICAgY2F0Y2ggZXJyIDo6XG4gICAgICBhd2FpdCBzZW5kZXIuc2VuZCBAOiBlcnJfZnJvbTogdGhpcy5lcnJfZnJvbSwgZXJyb3I6IGVyclxuICAgICAgcmV0dXJuIGZhbHNlXG5cbiAgICBpZiBzZW5kZXIucmVwbHlFeHBlY3RlZCA6OlxuICAgICAgYXdhaXQgc2VuZGVyLnNlbmQgQDogYW5zd2VyXG4gICAgcmV0dXJuIHRydWVcblxuXG5mdW5jdGlvbiBub29wKCkge31cblxuIiwiaW1wb3J0IHthZGRfZXBfa2luZCwgZXBfcHJvdG99IGZyb20gJy4vZXh0ZW5zaW9ucy5qc3knXG5cbmFkZF9lcF9raW5kIEA6XG4gIHNlcnZlcihvbl9pbml0KSA6OiByZXR1cm4gdGhpcy5lbmRwb2ludCBAIG9uX2luaXRcblxuZXhwb3J0ICogZnJvbSAnLi9jbGllbnQuanN5J1xuZXhwb3J0ICogZnJvbSAnLi9hcGkuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBlcF9wcm90b1xuIiwiZXhwb3J0IGRlZmF1bHQgRVBUYXJnZXRcbmV4cG9ydCBjbGFzcyBFUFRhcmdldCA6OlxuICBjb25zdHJ1Y3RvcihpZCkgOjogdGhpcy5pZCA9IGlkXG5cbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFUFRhcmdldCAke2VwX2VuY29kZSh0aGlzLmlkLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIGVwX2VuY29kZSh0aGlzLmlkLCBmYWxzZSlcbiAgYXNFbmRwb2ludElkKCkgOjogcmV0dXJuIHRoaXMuaWRcbiAgaXNFUFRhcmdldCgpIDo6IHJldHVybiB0cnVlXG5cbiAgZ2V0IGlkX3JvdXRlcigpIDo6IHJldHVybiB0aGlzLmlkLmlkX3JvdXRlclxuICBnZXQgaWRfdGFyZ2V0KCkgOjogcmV0dXJuIHRoaXMuaWQuaWRfdGFyZ2V0XG5cbiAgc3RhdGljIGFzX2pzb25fdW5wYWNrKG1zZ19jdHhfdG8sIHhmb3JtQnlLZXkpIDo6XG4gICAgeGZvcm1CeUtleSA9IE9iamVjdC5jcmVhdGUoeGZvcm1CeUtleSB8fCBudWxsKVxuICAgIHhmb3JtQnlLZXlbdG9rZW5dID0gdiA9PiB0aGlzLmZyb21fY3R4IEAgZXBfZGVjb2RlKHYpLCBtc2dfY3R4X3RvXG4gICAgcmV0dXJuIHRoaXMuanNvbl91bnBhY2tfeGZvcm0oeGZvcm1CeUtleSlcblxuICBzdGF0aWMgZnJvbV9jdHgoaWQsIG1zZ19jdHhfdG8sIG1zZ2lkKSA6OlxuICAgIGlmICEgaWQgOjogcmV0dXJuXG4gICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlkLmFzRW5kcG9pbnRJZCA6OlxuICAgICAgaWQgPSBpZC5hc0VuZHBvaW50SWQoKVxuXG4gICAgY29uc3QgZXBfdGd0ID0gbmV3IHRoaXMoaWQpXG4gICAgbGV0IGZhc3QsIGluaXQgPSAoKSA9PiBmYXN0ID0gbXNnX2N0eF90byhlcF90Z3QsIHttc2dpZH0pLmZhc3RfanNvblxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIGVwX3RndCwgQHt9XG4gICAgICBzZW5kOiBAe30gZ2V0KCkgOjogcmV0dXJuIChmYXN0IHx8IGluaXQoKSkuc2VuZFxuICAgICAgcXVlcnk6IEB7fSBnZXQoKSA6OiByZXR1cm4gKGZhc3QgfHwgaW5pdCgpKS5xdWVyeVxuICAgICAgcmVwbHlFeHBlY3RlZDogQHt9IHZhbHVlOiAhISBtc2dpZFxuXG5cbmNvbnN0IHRva2VuID0gJ1xcdTAzRTAnIC8vICfPoCdcbkVQVGFyZ2V0LnRva2VuID0gdG9rZW5cblxuRVBUYXJnZXQuZXBfZW5jb2RlID0gZXBfZW5jb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZW5jb2RlKGlkLCBzaW1wbGUpIDo6XG4gIGxldCB7aWRfcm91dGVyOnIsIGlkX3RhcmdldDp0fSA9IGlkXG4gIHIgPSAocj4+PjApLnRvU3RyaW5nKDM2KVxuICB0ID0gKHQ+Pj4wKS50b1N0cmluZygzNilcbiAgaWYgc2ltcGxlIDo6XG4gICAgcmV0dXJuIGAke3Rva2VufSAke3J9fiR7dH1gXG5cbiAgY29uc3QgcmVzID0gQHt9IFt0b2tlbl06IGAke3J9fiR7dH1gXG4gIE9iamVjdC5hc3NpZ24gQCByZXMsIGlkXG4gIGRlbGV0ZSByZXMuaWRfcm91dGVyOyBkZWxldGUgcmVzLmlkX3RhcmdldFxuICByZXR1cm4gcmVzXG5cblxuRVBUYXJnZXQuZXBfZGVjb2RlID0gZXBfZGVjb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZGVjb2RlKHYpIDo6XG4gIGNvbnN0IGlkID0gJ3N0cmluZycgPT09IHR5cGVvZiB2XG4gICAgPyB2LnNwbGl0KHRva2VuKVsxXVxuICAgIDogdlt0b2tlbl1cbiAgaWYgISBpZCA6OiByZXR1cm5cblxuICBsZXQgW3IsdF0gPSBpZC5zcGxpdCgnficpXG4gIGlmIHVuZGVmaW5lZCA9PT0gdCA6OiByZXR1cm5cbiAgciA9IDAgfCBwYXJzZUludChyLCAzNilcbiAgdCA9IDAgfCBwYXJzZUludCh0LCAzNilcblxuICByZXR1cm4gQHt9IGlkX3JvdXRlcjogciwgaWRfdGFyZ2V0OiB0XG5cblxuRVBUYXJnZXQuanNvbl91bnBhY2tfeGZvcm0gPSBqc29uX3VucGFja194Zm9ybVxuZXhwb3J0IGZ1bmN0aW9uIGpzb25fdW5wYWNrX3hmb3JtKHhmb3JtQnlLZXkpIDo6XG4gIHJldHVybiBzeiA9PiBKU09OLnBhcnNlIEAgc3osIHJldml2ZXIoKVxuXG4gIGZ1bmN0aW9uIHJldml2ZXIoKSA6OlxuICAgIGNvbnN0IHJlZyA9IG5ldyBXZWFrTWFwKClcbiAgICByZXR1cm4gZnVuY3Rpb24oa2V5LCB2YWx1ZSkgOjpcbiAgICAgIGNvbnN0IHhmbiA9IHhmb3JtQnlLZXlba2V5XVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB4Zm4gOjpcbiAgICAgICAgcmVnLnNldCh0aGlzLCB4Zm4pXG4gICAgICAgIHJldHVybiB2YWx1ZVxuXG4gICAgICBpZiAnb2JqZWN0JyA9PT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICAgIGNvbnN0IHZmbiA9IHJlZy5nZXQodmFsdWUpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdmZuIDo6XG4gICAgICAgICAgcmV0dXJuIHZmbiBAIHZhbHVlXG4gICAgICByZXR1cm4gdmFsdWVcblxuIiwiaW1wb3J0IHtlcF9kZWNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTXNnQ3R4IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe3JhbmRvbV9pZCwgY29kZWNzfSkgOjpcbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5yYW5kb21faWQgPSByYW5kb21faWRcbiAgICBNc2dDdHgud2l0aENvZGVjcyBAIGNvZGVjc1xuICAgIHJldHVybiBNc2dDdHhcblxuICBzdGF0aWMgZm9ySHViKGh1YiwgY2hhbm5lbCkgOjpcbiAgICBjb25zdCB7c2VuZFJhd30gPSBjaGFubmVsXG5cbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5jaGFuX3NlbmQgPSBhc3luYyBwa3QgPT4gOjpcbiAgICAgIGF3YWl0IHNlbmRSYXcocGt0KVxuICAgICAgcmV0dXJuIHRydWVcblxuICAgIHJldHVybiBNc2dDdHhcblxuXG4gIGNvbnN0cnVjdG9yKGlkKSA6OlxuICAgIGlmIG51bGwgIT0gaWQgOjpcbiAgICAgIGNvbnN0IHtpZF90YXJnZXQsIGlkX3JvdXRlcn0gPSBpZFxuICAgICAgY29uc3QgZnJvbV9pZCA9IE9iamVjdC5mcmVlemUgQDogaWRfdGFyZ2V0LCBpZF9yb3V0ZXJcbiAgICAgIHRoaXMuY3R4ID0gQHt9IGZyb21faWRcblxuXG4gIHdpdGhFbmRwb2ludChlbmRwb2ludCkgOjpcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGVuZHBvaW50OiBAe30gdmFsdWU6IGVuZHBvaW50XG5cblxuICBwaW5nKHRva2VuPXRydWUpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fbXNnQ29kZWNzLmNvbnRyb2wucGluZywgW10sIHRva2VuKVxuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncylcbiAgc2VuZFF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZSlcbiAgcXVlcnkoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9jb2RlYy5zZW5kLCBhcmdzLCB0cnVlKS5yZXBseVxuXG4gIHN0cmVhbSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWMuc3RyZWFtLCBhcmdzXG4gIGludm9rZShrZXksIC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlY1trZXldLCBhcmdzXG4gIGJpbmRJbnZva2UoZm5PcktleSwgdG9rZW4pIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIGZuT3JLZXkgOjogZm5PcktleSA9IHRoaXMuX2NvZGVjXG4gICAgcmV0dXJuICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoZm5PcktleSwgYXJncywgdG9rZW4pXG5cbiAgX2ludm9rZV9leChpbnZva2UsIGFyZ3MsIHRva2VuKSA6OlxuICAgIGNvbnN0IG9iaiA9IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHhcbiAgICBpZiBudWxsID09IHRva2VuIDo6IHRva2VuID0gb2JqLnRva2VuXG4gICAgZWxzZSBvYmoudG9rZW4gPSB0b2tlblxuICAgIGlmIHRydWUgPT09IHRva2VuIDo6XG4gICAgICB0b2tlbiA9IG9iai50b2tlbiA9IHRoaXMucmFuZG9tX2lkKClcblxuICAgIHRoaXMuYXNzZXJ0TW9uaXRvcigpXG5cbiAgICBjb25zdCByZXMgPSBpbnZva2UgQCB0aGlzLmNoYW5fc2VuZCwgb2JqLCAuLi5hcmdzXG4gICAgaWYgISB0b2tlbiB8fCAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmVzLnRoZW4gOjogcmV0dXJuIHJlc1xuXG4gICAgbGV0IHBfc2VudCAgPSByZXMudGhlbigpXG4gICAgY29uc3QgcmVwbHkgPSB0aGlzLmVuZHBvaW50LmluaXRSZXBseSh0b2tlbiwgcF9zZW50LCB0aGlzKVxuICAgIHBfc2VudCA9IHBfc2VudC50aGVuIEAgKCkgPT4gQDogcmVwbHlcbiAgICBwX3NlbnQucmVwbHkgPSByZXBseVxuICAgIHJldHVybiBwX3NlbnRcblxuICBnZXQgdG8oKSA6OiByZXR1cm4gKHRndCwgLi4uYXJncykgPT4gOjpcbiAgICBpZiBudWxsID09IHRndCA6OiB0aHJvdyBuZXcgRXJyb3IgQCBgTnVsbCB0YXJnZXQgZW5kcG9pbnRgXG5cbiAgICBjb25zdCBzZWxmID0gdGhpcy5jbG9uZSgpXG5cbiAgICBjb25zdCBjdHggPSBzZWxmLmN0eFxuICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICBjdHguaWRfdGFyZ2V0ID0gdGd0XG4gICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgZWxzZSA6OlxuICAgICAgdGd0ID0gZXBfZGVjb2RlKHRndCkgfHwgdGd0XG4gICAgICBjb25zdCB7ZnJvbV9pZDogcmVwbHlfaWQsIGlkX3RhcmdldCwgaWRfcm91dGVyLCB0b2tlbiwgbXNnaWR9ID0gdGd0XG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSBpZF90YXJnZXRcbiAgICAgICAgY3R4LmlkX3JvdXRlciA9IGlkX3JvdXRlclxuICAgICAgZWxzZSBpZiB1bmRlZmluZWQgIT09IHJlcGx5X2lkICYmICEgY3R4LmlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gcmVwbHlfaWQuaWRfdGFyZ2V0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSByZXBseV9pZC5pZF9yb3V0ZXJcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuXG4gICAgcmV0dXJuIDAgPT09IGFyZ3MubGVuZ3RoID8gc2VsZiA6IHNlbGYud2l0aCBAIC4uLmFyZ3NcblxuICB3aXRoKC4uLmFyZ3MpIDo6XG4gICAgY29uc3QgY3R4ID0gdGhpcy5jdHhcbiAgICBmb3IgbGV0IHRndCBvZiBhcmdzIDo6XG4gICAgICBpZiB0cnVlID09PSB0Z3QgfHwgZmFsc2UgPT09IHRndCA6OlxuICAgICAgICBjdHgudG9rZW4gPSB0Z3RcbiAgICAgIGVsc2UgaWYgbnVsbCAhPSB0Z3QgOjpcbiAgICAgICAgY29uc3Qge3Rva2VuLCBtc2dpZH0gPSB0Z3RcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG4gICAgcmV0dXJuIHRoaXNcblxuICB3aXRoUmVwbHkoKSA6OlxuICAgIHJldHVybiB0aGlzLmNsb25lIEA6IHRva2VuOiB0cnVlXG5cbiAgY2xvbmUoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG5cbiAgYXNzZXJ0TW9uaXRvcigpIDo6XG4gICAgaWYgISB0aGlzLmNoZWNrTW9uaXRvcigpIDo6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgVGFyZ2V0IG1vbml0b3IgZXhwaXJlZGBcbiAgY2hlY2tNb25pdG9yKCkgOjogcmV0dXJuIHRydWVcbiAgbW9uaXRvcihvcHRpb25zPXt9KSA6OlxuICAgIGlmIHRydWUgPT09IG9wdGlvbnMgfHwgZmFsc2UgPT09IG9wdGlvbnMgOjpcbiAgICAgIG9wdGlvbnMgPSBAe30gYWN0aXZlOiBvcHRpb25zXG5cbiAgICBjb25zdCBtb25pdG9yID0gdGhpcy5lbmRwb2ludC5pbml0TW9uaXRvcih0aGlzLmN0eC5pZF90YXJnZXQpXG5cbiAgICBjb25zdCB0c19kdXJhdGlvbiA9IG9wdGlvbnMudHNfZHVyYXRpb24gfHwgNTAwMFxuICAgIGxldCB0c19hY3RpdmUgPSBvcHRpb25zLnRzX2FjdGl2ZVxuICAgIGlmIHRydWUgPT09IHRzX2FjdGl2ZSA6OlxuICAgICAgdHNfYWN0aXZlID0gdHNfZHVyYXRpb24vNFxuXG4gICAgbGV0IGNoZWNrTW9uaXRvclxuICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBjb25zdCBkb25lID0gb3B0aW9ucy5yZWplY3QgPyByZWplY3QgOiByZXNvbHZlXG4gICAgICB0aGlzLmNoZWNrTW9uaXRvciA9IGNoZWNrTW9uaXRvciA9ICgpID0+XG4gICAgICAgIHRzX2R1cmF0aW9uID4gbW9uaXRvci50ZCgpXG4gICAgICAgICAgPyB0cnVlIDogKGRvbmUobW9uaXRvciksIGZhbHNlKVxuXG4gICAgbGV0IHRpZFxuICAgIGNvbnN0IHRzX2ludGVydmFsID0gdHNfYWN0aXZlIHx8IHRzX2R1cmF0aW9uLzRcbiAgICBpZiBvcHRpb25zLmFjdGl2ZSB8fCB0c19hY3RpdmUgOjpcbiAgICAgIGNvbnN0IGN0cmwgPSB0aGlzLmNvZGVjKCdjb250cm9sJylcbiAgICAgIGNvbnN0IGNoZWNrUGluZyA9ICgpID0+IDo6XG4gICAgICAgIGlmIHRzX2ludGVydmFsID4gbW9uaXRvci50ZCgpIDo6XG4gICAgICAgICAgY3RybC5pbnZva2UoJ3BpbmcnKVxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja1BpbmcsIHRzX2ludGVydmFsXG4gICAgZWxzZSA6OlxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja01vbml0b3IsIHRzX2ludGVydmFsXG4gICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiBjbGVhckludGVydmFsKHRpZClcblxuICAgIHByb21pc2UudGhlbihjbGVhciwgY2xlYXIpXG4gICAgcmV0dXJuIHByb21pc2VcblxuXG4gIGNvZGVjKG1zZ19jb2RlYywgLi4uYXJncykgOjpcbiAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIG1zZ19jb2RlYyA6OlxuICAgICAgbXNnX2NvZGVjID0gdGhpcy5fbXNnQ29kZWNzW21zZ19jb2RlY11cblxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBtc2dfY29kZWMuc2VuZCA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwYWNrZXQgY29kZWMgcHJvdG9jb2xgXG5cbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEA6XG4gICAgICBfY29kZWM6IEA6IHZhbHVlOiBtc2dfY29kZWNcbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuICBzdGF0aWMgd2l0aENvZGVjcyhtc2dDb2RlY3MpIDo6XG4gICAgZm9yIGNvbnN0IFtuYW1lLCBtc2dfY29kZWNdIG9mIE9iamVjdC5lbnRyaWVzIEAgbXNnQ29kZWNzIDo6XG4gICAgICB0aGlzLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMuY29kZWMgQCBtc2dfY29kZWNcbiAgICB0aGlzLnByb3RvdHlwZS5fbXNnQ29kZWNzID0gbXNnQ29kZWNzXG4gICAgdGhpcy5wcm90b3R5cGUuX2NvZGVjID0gbXNnQ29kZWNzLmRlZmF1bHRcblxuICAgIC8vIGJpbmQgc2VuZF9qc29uIGFzIGZyZXF1ZW50bHkgdXNlZCBmYXN0LXBhdGhcbiAgICBjb25zdCBqc29uX3NlbmQgPSBtc2dDb2RlY3MuanNvbi5zZW5kXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLnByb3RvdHlwZSwgQDpcbiAgICAgIGZhc3RfanNvbjogQHt9IGdldCgpIDo6IHJldHVybiBAOlxuICAgICAgICBzZW5kOiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGpzb25fc2VuZCwgYXJncylcbiAgICAgICAgc2VuZFF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGpzb25fc2VuZCwgYXJncywgdHJ1ZSlcbiAgICAgICAgcXVlcnk6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoanNvbl9zZW5kLCBhcmdzLCB0cnVlKS5yZXBseVxuXG4gICAgcmV0dXJuIHRoaXNcblxuXG4gIHdpdGhSZWplY3RUaW1lb3V0KHBfcmVwbHkpIDo6XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHBfcmVwbHkudGhlbiBAIHJlc29sdmUsIHJlamVjdFxuICAgICAgcF9yZXBseS50aGVuIEAgY2xlYXIsIGNsZWFyXG5cbiAgICAgIGNvbnN0IHRpbWVvdXQgPSAoKSA9PiByZWplY3QgQCBuZXcgdGhpcy5SZXBseVRpbWVvdXRcbiAgICAgIGNvbnN0IHRpZCA9IHNldFRpbWVvdXQodGltZW91dCwgdGhpcy5tc190aW1lb3V0KVxuICAgICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG5cbiAgICAgIGZ1bmN0aW9uIGNsZWFyKCkgOjogY2xlYXJUaW1lb3V0IEAgdGlkXG5cblxuY2xhc3MgUmVwbHlUaW1lb3V0IGV4dGVuZHMgRXJyb3IgOjpcblxuT2JqZWN0LmFzc2lnbiBAIE1zZ0N0eC5wcm90b3R5cGUsIEB7fVxuICBSZXBseVRpbWVvdXQsIG1zX3RpbWVvdXQ6IDUwMDBcblxuIiwiaW1wb3J0IHtFUFRhcmdldCwgZXBfZW5jb2RlfSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEVuZHBvaW50IDo6XG4gIHN0YXRpYyBzdWJjbGFzcyhleHRlbnNpb25zKSA6OlxuICAgIGNsYXNzIEVuZHBvaW50IGV4dGVuZHMgdGhpcyA6OlxuICAgIE9iamVjdC5hc3NpZ24gQCBFbmRwb2ludC5wcm90b3R5cGUsIGV4dGVuc2lvbnNcbiAgICByZXR1cm4gRW5kcG9pbnRcblxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VuZHBvaW50ICR7ZXBfZW5jb2RlKHRoaXMuaWQsIHRydWUpfcK7YFxuICB0b0pTT04oKSA6OiByZXR1cm4gdGhpcy5lcF9zZWxmKCkudG9KU09OKClcbiAgZXBfc2VsZigpIDo6IHJldHVybiBuZXcgdGhpcy5FUFRhcmdldCh0aGlzLmlkKVxuICBhc0VuZHBvaW50SWQoKSA6OiByZXR1cm4gdGhpcy5pZFxuXG4gIGNvbnN0cnVjdG9yKGlkLCBtc2dfY3R4KSA6OlxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBpZDogQHt9IHZhbHVlOiBpZFxuICAgICAgdG86IEB7fSB2YWx1ZTogbXNnX2N0eC53aXRoRW5kcG9pbnQodGhpcykudG9cblxuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpXG4gIGNyZWF0ZVN0YXRlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUmVwbHlNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVUcmFmZmljTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUm91dGVDYWNoZU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG5cbiAgYmluZFNpbmsoc2luaykgOjpcbiAgICBjb25zdCBieV90b2tlbiA9IHRoaXMuY3JlYXRlUmVwbHlNYXAoKVxuICAgIGNvbnN0IGJ5X3RyYWZmaWMgPSB0aGlzLmNyZWF0ZVRyYWZmaWNNYXAoKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIGJ5X3Rva2VuOiBAe30gdmFsdWU6IGJ5X3Rva2VuXG4gICAgICBieV90cmFmZmljOiBAe30gdmFsdWU6IGJ5X3RyYWZmaWNcblxuICAgIGNvbnN0IHRyYWZmaWMgPSAoZnJvbV9pZCwgdHJhZmZpYykgPT4gOjpcbiAgICAgIGNvbnN0IHRzID0gRGF0ZS5ub3coKVxuICAgICAgaWYgZnJvbV9pZCA6OlxuICAgICAgICBjb25zdCB0ID0gYnlfdHJhZmZpYy5nZXQoZnJvbV9pZC5pZF90YXJnZXQpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdCA6OlxuICAgICAgICAgIHQudHMgPSB0W2B0c18ke3RyYWZmaWN9YF0gPSB0c1xuICAgICAgdGhpcy5yZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cylcblxuICAgIHJldHVybiBAe31cbiAgICAgIGJ5X21zZ2lkOiB0aGlzLmNyZWF0ZVN0YXRlTWFwKClcbiAgICAgIGpzb25fdW5wYWNrOiB0aGlzLkVQVGFyZ2V0LmFzX2pzb25fdW5wYWNrKHRoaXMudG8pXG5cbiAgICAgIHJlY3ZDdHJsOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ2N0cmwnKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2Q3RybChtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZyB8fCB7bXNnLCBpbmZvfSkudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2TXNnOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ21zZycpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZNc2cobXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cpLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdlN0cmVhbURhdGE6IChyc3RyZWFtLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICByZWN2U3RyZWFtOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJzdHJlYW0gPSB0aGlzLnJlY3ZTdHJlYW0obXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJzdHJlYW0pLnRoZW4ocmVwbHkpXG4gICAgICAgIHJldHVybiByc3RyZWFtXG5cbiAgYXNfdGFyZ2V0KGlkKSA6OlxuICAgIGlmIGlkIDo6IHJldHVybiB0aGlzLkVQVGFyZ2V0LmZyb21fY3R4IEAgaWQsIHRoaXMudG9cbiAgYXNfc2VuZGVyKHtmcm9tX2lkOmlkLCBtc2dpZH0pIDo6XG4gICAgaWYgaWQgOjogcmV0dXJuIHRoaXMuRVBUYXJnZXQuZnJvbV9jdHggQCBpZCwgdGhpcy50bywgbXNnaWRcblxuICByZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cykgOjpcbiAgcmVjdkN0cmwobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gIHJlY3ZNc2cobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gICAgcmV0dXJuIEB7fSBtc2csIGluZm8sIHNlbmRlcjogdGhpcy5hc19zZW5kZXIoaW5mbylcbiAgcmVjdlN0cmVhbShtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGNvbnNvbGUud2FybiBAIGBVbmhhbmRsZSByZWN2IHN0cmVhbTogJHtpbmZvfWBcbiAgICByZXR1cm4gbnVsbFxuICAgIC8qIHJldHVybiBAe30gbXNnLCBpbmZvXG4gICAgICAgICBvbl9pbml0KG1zZywgcGt0KSA6OiAvLyByZXR1cm4gdGhpc1xuICAgICAgICAgb25fZGF0YShkYXRhLCBwa3QpIDo6IHRoaXMucGFydHMucHVzaCBAIGRhdGFcbiAgICAgICAgIG9uX2VuZChyZXN1bHQsIHBrdCkgOjogdGhpcy5wYXJ0cy5qb2luKCcnKTsgLy8gcmV0dXJuIHRoaXNcbiAgICAgICAgIG9uX2Vycm9yKGVyciwgcGt0KSA6OiBjb25zb2xlLmxvZyBAIGVyclxuICAgICovXG5cbiAgaW5pdFJlcGx5KHRva2VuLCBwX3NlbnQsIG1zZ19jdHgpIDo6XG4gICAgcmV0dXJuIHRoaXMuaW5pdFJlcGx5UHJvbWlzZSBAIHRva2VuLCBwX3NlbnQsIG1zZ19jdHhcblxuICBpbml0TW9uaXRvcihpZF90YXJnZXQpIDo6XG4gICAgY29uc3Qga2V5ID0gaWRfdGFyZ2V0LmlkX3RhcmdldCB8fCBpZF90YXJnZXRcbiAgICBsZXQgbW9uaXRvciA9IHRoaXMuYnlfdHJhZmZpYy5nZXQgQCBrZXlcbiAgICBpZiB1bmRlZmluZWQgPT09IG1vbml0b3IgOjpcbiAgICAgIG1vbml0b3IgPSBAe30gaWRfdGFyZ2V0LCB0czogRGF0ZS5ub3coKVxuICAgICAgICB0ZCgpIDo6IHJldHVybiBEYXRlLm5vdygpIC0gdGhpcy50c1xuICAgICAgdGhpcy5ieV90cmFmZmljLnNldCBAIGtleSwgbW9uaXRvclxuICAgIHJldHVybiBtb25pdG9yXG5cbiAgaW5pdFJlcGx5UHJvbWlzZSh0b2tlbiwgcF9zZW50LCBtc2dfY3R4KSA6OlxuICAgIGxldCByZXBseSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHRoaXMuYnlfdG9rZW4uc2V0IEAgdG9rZW4sIHJlc29sdmVcbiAgICAgIHBfc2VudC5jYXRjaCBAIHJlamVjdFxuXG4gICAgaWYgbXNnX2N0eCA6OlxuICAgICAgcmVwbHkgPSBtc2dfY3R4LndpdGhSZWplY3RUaW1lb3V0KHJlcGx5KVxuXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiB0aGlzLmJ5X3Rva2VuLmRlbGV0ZSBAIHRva2VuXG4gICAgcmVwbHkudGhlbiBAIGNsZWFyLCBjbGVhclxuICAgIHJldHVybiByZXBseVxuXG5FbmRwb2ludC5wcm90b3R5cGUuRVBUYXJnZXQgPSBFUFRhcmdldFxuIiwiaW1wb3J0IGVwX3Byb3RvIGZyb20gJy4vZXBfa2luZHMvaW5kZXguanN5J1xuaW1wb3J0IGluaXRfcHJvdG9jb2wgZnJvbSAnLi9wcm90b2NvbC9pbmRleC5qc3knXG5pbXBvcnQgU2lua0Jhc2UgZnJvbSAnLi9zaW5rLmpzeSdcbmltcG9ydCBNc2dDdHhCYXNlIGZyb20gJy4vbXNnY3R4LmpzeSdcbmltcG9ydCBFbmRwb2ludEJhc2UgZnJvbSAnLi9lbmRwb2ludC5qc3knXG5cbmNvbnN0IGRlZmF1bHRfcGx1Z2luX29wdGlvbnMgPSBAOlxuICBwbHVnaW5fbmFtZTogJ2VuZHBvaW50J1xuICBvbl9tc2coe21zZywgcmVwbHksIGluZm99KSA6OlxuICAgIGNvbnNvbGUud2FybiBAICdFTkRQT0lOVCBNU0c6JywgQHt9IG1zZywgcmVwbHksIGluZm9cbiAgb25fZXJyb3IoZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgY29uc29sZS5lcnJvciBAICdFTkRQT0lOVCBFUlJPUjonLCBlcnJcbiAgICAvLyBjb25zdCB7bXNnLCBwa3R9ID0gZXh0cmFcbiAgICAvLyByZXR1cm4gZmFsc2UgdG8gcHJldmVudCBhdXRvLXNodXRkb3duXG4gIG9uX3NodXRkb3duKGVwLCBlcnIsIGV4dHJhKSA6OlxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIGNvbnNvbGUuZXJyb3IgQCBgRU5EUE9JTlQgU0hVVERPV046ICR7ZXJyLm1lc3NhZ2V9YFxuXG4gIHN1YmNsYXNzKGNsYXNzZXMpIDo6XG4gICAgLy9jb25zdCB7RW5kcG9pbnQsIFNpbmssIE1zZ0N0eCwgcHJvdG9jb2xzfSA9IGNsYXNzZXNcbiAgICByZXR1cm4gY2xhc3Nlc1xuXG4gIGpzb25fcGFjazogSlNPTi5zdHJpbmdpZnlcbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKSAvLyBMUlVNYXAsIEhhc2hiZWx0TWFwXG5cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGx1Z2luX29wdGlvbnMpIDo6XG4gIHBsdWdpbl9vcHRpb25zID0gT2JqZWN0LmFzc2lnbiBAIHt9LCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zLCBwbHVnaW5fb3B0aW9uc1xuICBjb25zdCBAe31cbiAgICBwbHVnaW5fbmFtZSwgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBvbl9tc2c6IGRlZmF1bHRfb25fbXNnXG4gICAgb25fZXJyb3I6IGRlZmF1bHRfb25fZXJyb3JcbiAgICBvbl9zaHV0ZG93bjogZGVmYXVsdF9vbl9zaHV0ZG93blxuICAgIGNyZWF0ZU1hcFxuICA9IHBsdWdpbl9vcHRpb25zXG5cbiAgaWYgcGx1Z2luX29wdGlvbnMuZXBfa2luZHMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgZXBfcHJvdG8sIHBsdWdpbl9vcHRpb25zLmVwX2tpbmRzXG5cbiAgcmV0dXJuIEA6IG9yZGVyOiAxLCBzdWJjbGFzcywgcG9zdFxuICBcbiAgZnVuY3Rpb24gc3ViY2xhc3MoRmFicmljSHViX1BJLCBiYXNlcykgOjpcbiAgICBjb25zdCB7cGFja2V0UGFyc2VyfSA9IEZhYnJpY0h1Yl9QSS5wcm90b3R5cGVcbiAgICBpZiBudWxsPT1wYWNrZXRQYXJzZXIgfHwgISBwYWNrZXRQYXJzZXIuaXNQYWNrZXRQYXJzZXIoKSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBJbnZhbGlkIHBhY2tldFBhcnNlciBmb3IgcGx1Z2luYFxuICAgIFxuICAgIEZhYnJpY0h1Yl9QSS5wcm90b3R5cGVbcGx1Z2luX25hbWVdID1cbiAgICAgIGJpbmRFbmRwb2ludEFwaSBAIHBhY2tldFBhcnNlclxuXG4gIGZ1bmN0aW9uIHBvc3QoaHViKSA6OlxuICAgIHJldHVybiBodWJbcGx1Z2luX25hbWVdID0gaHViW3BsdWdpbl9uYW1lXShodWIpXG5cbiAgZnVuY3Rpb24gYmluZEVuZHBvaW50QXBpKHBhY2tldFBhcnNlcikgOjpcbiAgICBjb25zdCBwcm90b2NvbHMgPSBpbml0X3Byb3RvY29sIEAgcGFja2V0UGFyc2VyLCBAe30gcmFuZG9tX2lkLCBqc29uX3BhY2tcblxuICAgIGNvbnN0IHtFbmRwb2ludCwgU2luaywgTXNnQ3R4OiBNc2dDdHhfcGl9ID1cbiAgICAgIHBsdWdpbl9vcHRpb25zLnN1YmNsYXNzIEA6IHByb3RvY29sc1xuICAgICAgICBTaW5rOiBTaW5rQmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgICAgICBNc2dDdHg6IE1zZ0N0eEJhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICAgICAgRW5kcG9pbnQ6IEVuZHBvaW50QmFzZS5zdWJjbGFzcyh7Y3JlYXRlTWFwfSlcblxuICAgIHJldHVybiBmdW5jdGlvbihodWIpIDo6XG4gICAgICBjb25zdCBjaGFubmVsID0gaHViLmNvbm5lY3Rfc2VsZigpXG4gICAgICBjb25zdCBNc2dDdHggPSBNc2dDdHhfcGkuZm9ySHViKGh1YiwgY2hhbm5lbClcblxuICAgICAgT2JqZWN0LnNldFByb3RvdHlwZU9mIEAgZW5kcG9pbnQsIGVwX3Byb3RvXG4gICAgICBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEB7fSBlbmRwb2ludCwgY3JlYXRlLCBNc2dDdHhcbiAgICAgIHJldHVybiBlbmRwb2ludFxuXG5cbiAgICAgIGZ1bmN0aW9uIGVuZHBvaW50KG9uX2luaXQpIDo6XG4gICAgICAgIGNvbnN0IHRhcmdldHMgPSBodWIucm91dGVyLnRhcmdldHNcbiAgICAgICAgZG8gdmFyIGlkX3RhcmdldCA9IHJhbmRvbV9pZCgpXG4gICAgICAgIHdoaWxlIHRhcmdldHMuaGFzIEAgaWRfdGFyZ2V0XG4gICAgICAgIHJldHVybiBjcmVhdGUgQCBpZF90YXJnZXQsIG9uX2luaXRcblxuICAgICAgZnVuY3Rpb24gY3JlYXRlKGlkX3RhcmdldCwgb25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgaGFuZGxlcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpXG4gICAgICAgIGNvbnN0IGlkID0gQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IG5ldyBNc2dDdHggQCBpZFxuICAgICAgICBjb25zdCBlcCA9IG5ldyBFbmRwb2ludCBAIGlkLCBtc2dfY3R4XG5cbiAgICAgICAgY29uc3QgcmVhZHkgPSBQcm9taXNlXG4gICAgICAgICAgLnJlc29sdmUgQFxuICAgICAgICAgICAgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIG9uX2luaXRcbiAgICAgICAgICAgICAgPyBvbl9pbml0KGVwLCBodWIpXG4gICAgICAgICAgICAgIDogb25faW5pdFxuICAgICAgICAgIC50aGVuIEAgX2FmdGVyX2luaXRcblxuICAgICAgICAvLyBBbGxvdyBmb3IgYm90aCBpbnRlcm5hbCBhbmQgZXh0ZXJuYWwgZXJyb3IgaGFuZGxpbmcgYnkgZm9ya2luZyByZWFkeS5jYXRjaFxuICAgICAgICByZWFkeS5jYXRjaCBAIGVyciA9PiBoYW5kbGVycy5vbl9lcnJvciBAIGVyciwgQHt9IHpvbmU6J29uX3JlYWR5J1xuXG4gICAgICAgIDo6XG4gICAgICAgICAgY29uc3QgZXBfdGd0ID0gZXAuZXBfc2VsZigpXG4gICAgICAgICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgZXBfdGd0LCBAe31cbiAgICAgICAgICAgIHJlYWR5OiBAe30gdmFsdWU6IHJlYWR5LnRoZW4gQCAoKSA9PiBlcF90Z3RcblxuXG4gICAgICAgIGZ1bmN0aW9uIF9hZnRlcl9pbml0KHRhcmdldCkgOjpcbiAgICAgICAgICBpZiBudWxsID09IHRhcmdldCA6OlxuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBlbmRwb2ludCBpbml0IHRvIHJldHVybiBhIGNsb3N1cmUgb3IgaW50ZXJmYWNlYFxuXG4gICAgICAgICAgaGFuZGxlcnMub25fbXNnID0gKHRhcmdldC5vbl9tc2cgfHwgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0YXJnZXQgPyB0YXJnZXQgOiBkZWZhdWx0X29uX21zZykpLmJpbmQodGFyZ2V0KVxuICAgICAgICAgIGhhbmRsZXJzLm9uX2Vycm9yID0gKHRhcmdldC5vbl9lcnJvciB8fCBkZWZhdWx0X29uX2Vycm9yKS5iaW5kKHRhcmdldCwgZXApXG4gICAgICAgICAgaGFuZGxlcnMub25fc2h1dGRvd24gPSAodGFyZ2V0Lm9uX3NodXRkb3duIHx8IGRlZmF1bHRfb25fc2h1dGRvd24pLmJpbmQodGFyZ2V0LCBlcClcblxuICAgICAgICAgIG5ldyBTaW5rKCkucmVnaXN0ZXIgQCBlcCwgaHViLCBpZF90YXJnZXQsIGhhbmRsZXJzXG5cbiAgICAgICAgICByZXR1cm4gdGFyZ2V0Lm9uX3JlYWR5ID8gdGFyZ2V0Lm9uX3JlYWR5KGVwLCBodWIpIDogdGFyZ2V0XG5cblxuIiwiaW1wb3J0IHtyYW5kb21CeXRlc30gZnJvbSAnY3J5cHRvJ1xuaW1wb3J0IGVuZHBvaW50X3BsdWdpbiBmcm9tICcuL3BsdWdpbi5qc3knXG5cbmVuZHBvaW50X25vZGVqcy5yYW5kb21faWQgPSByYW5kb21faWRcbmZ1bmN0aW9uIHJhbmRvbV9pZCgpIDo6XG4gIHJldHVybiByYW5kb21CeXRlcyg0KS5yZWFkSW50MzJMRSgpXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGVuZHBvaW50X25vZGVqcyhwbHVnaW5fb3B0aW9ucz17fSkgOjpcbiAgaWYgbnVsbCA9PSBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgOjpcbiAgICBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgPSByYW5kb21faWRcblxuICByZXR1cm4gZW5kcG9pbnRfcGx1Z2luKHBsdWdpbl9vcHRpb25zKVxuXG4iLCJpbXBvcnQgZW5kcG9pbnRfcGx1Z2luIGZyb20gJy4vcGx1Z2luLmpzeSdcblxuY29uc3QgZ2V0UmFuZG9tVmFsdWVzID0gJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiB3aW5kb3dcbiAgPyB3aW5kb3cuY3J5cHRvLmdldFJhbmRvbVZhbHVlcyA6IG51bGxcblxuZW5kcG9pbnRfYnJvd3Nlci5yYW5kb21faWQgPSByYW5kb21faWRcbmZ1bmN0aW9uIHJhbmRvbV9pZCgpIDo6XG4gIGNvbnN0IGFyciA9IG5ldyBJbnQzMkFycmF5KDEpXG4gIGdldFJhbmRvbVZhbHVlcyhhcnIpXG4gIHJldHVybiBhcnJbMF1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gZW5kcG9pbnRfYnJvd3NlcihwbHVnaW5fb3B0aW9ucz17fSkgOjpcbiAgaWYgbnVsbCA9PSBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgOjpcbiAgICBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgPSByYW5kb21faWRcblxuICByZXR1cm4gZW5kcG9pbnRfcGx1Z2luKHBsdWdpbl9vcHRpb25zKVxuXG4iXSwibmFtZXMiOlsibGl0dGxlX2VuZGlhbiIsImNfc2luZ2xlIiwiY19kYXRhZ3JhbSIsImNfZGlyZWN0IiwiY19tdWx0aXBhcnQiLCJjX3N0cmVhbWluZyIsIl9lcnJfbXNnaWRfcmVxdWlyZWQiLCJfZXJyX3Rva2VuX3JlcXVpcmVkIiwiZnJtX3JvdXRpbmciLCJzaXplIiwiYml0cyIsIm1hc2siLCJvYmoiLCJmcm9tX2lkIiwiZHYiLCJvZmZzZXQiLCJzZXRJbnQzMiIsImlkX3JvdXRlciIsImlkX3RhcmdldCIsInVuZGVmaW5lZCIsImdldEludDMyIiwiZnJtX3Jlc3BvbnNlIiwibXNnaWQiLCJFcnJvciIsInNldEludDE2Iiwic2VxX2FjayIsImFja19mbGFncyIsInRva2VuIiwiZ2V0SW50MTYiLCJmcm1fZGF0YWdyYW0iLCJ0cmFuc3BvcnQiLCJmcm1fZGlyZWN0IiwiZnJtX211bHRpcGFydCIsInNlcV9wb3MiLCJzZXEiLCJzZXFfZmxhZ3MiLCJmcm1fc3RyZWFtaW5nIiwiYmluZF9zZXFfbmV4dCIsInNlcV9vZmZzZXQiLCJzZXFfbmV4dCIsImZsYWdzIiwiZmluIiwiTmFOIiwiY29tcG9zZUZyYW1pbmdzIiwiZnJtX2Zyb20iLCJmcm1fcmVzcCIsImZybV90cmFuc3BvcnRzIiwibGVuZ3RoIiwiYnlCaXRzIiwidF9mcm9tIiwiZl90ZXN0IiwidF9yZXNwIiwidDAiLCJ0MSIsInQyIiwidDMiLCJtYXAiLCJmIiwidGVzdEJpdHMiLCJjaG9vc2UiLCJsc3QiLCJUIiwiYiIsIm9wIiwiZm5fa2V5IiwiZm5fdHJhbiIsImZuX2Zyb20iLCJmbl9yZXNwIiwiZnJtIiwiYmluZEFzc2VtYmxlZCIsImZfcGFjayIsImZfdW5wYWNrIiwicGFjayIsInVucGFjayIsInBrdF90eXBlIiwicGt0X29iaiIsIlR5cGVFcnJvciIsInR5cGUiLCJEYXRhVmlldyIsIkFycmF5QnVmZmVyIiwiaGVhZGVyIiwiYnVmZmVyIiwic2xpY2UiLCJwa3QiLCJidWYiLCJoZWFkZXJfYnVmZmVyIiwiVWludDhBcnJheSIsImluZm8iLCJfYmluZF9pdGVyYWJsZSIsImJ1Zl9jbG9uZSIsInR0bCIsIm5leHQiLCJvcHRpb25zIiwiZG9uZSIsInZhbHVlIiwicGFja2V0UGFyc2VyIiwiZnJhZ21lbnRfc2l6ZSIsImNvbmNhdEJ1ZmZlcnMiLCJwYWNrUGFja2V0T2JqIiwicGFja191dGY4IiwidW5wYWNrX3V0ZjgiLCJOdW1iZXIiLCJyYW5kb21faWQiLCJqc29uX3BhY2siLCJjcmVhdGVTdHJlYW0iLCJwYWNrZXRGcmFnbWVudHMiLCJjcmVhdGVNdWx0aXBhcnQiLCJzaW5rIiwicGFydHMiLCJmZWVkIiwiYm9keV9idWZmZXIiLCJpbmNsdWRlcyIsImRlbGV0ZVN0YXRlRm9yIiwicmVzIiwicmVjdkRhdGEiLCJyc3RyZWFtIiwic3RhdGUiLCJmZWVkX2luaXQiLCJhc19jb250ZW50IiwiZmVlZF9pZ25vcmUiLCJtc2ciLCJqc29uX3VucGFjayIsImJvZHlfdXRmOCIsInJlY3ZTdHJlYW0iLCJyZWN2U3RyZWFtRGF0YSIsImJpbmQiLCJlcnIiLCJvbl9lcnJvciIsImZlZWRfYm9keSIsIm9uX2luaXQiLCJkYXRhIiwib25fZGF0YSIsIm9uX2VuZCIsImZlZWRfc2VxIiwibmV4dF9oZHIiLCJpIiwibGFzdElubmVyIiwiYnl0ZUxlbmd0aCIsImkwIiwiYm9keSIsImJpbmRUcmFuc3BvcnRJbXBscyIsImluYm91bmQiLCJoaWdoYml0cyIsInRyYW5zcG9ydHMiLCJvdXRib3VuZCIsImZyYW1pbmdzIiwiZnJhbWUiLCJpbXBsIiwidF9yZWN2IiwicGFja19oZHIiLCJyZWN2X21zZyIsInByb2Nlc3MiLCJlbnYiLCJOT0RFX0VOViIsImRlZmluZVByb3BlcnR5IiwiYmluZFRyYW5zcG9ydHMiLCJwYWNrQm9keSIsInN0cmVhbWluZyIsInNlbmQiLCJzdHJlYW0iLCJiaW5kX3N0cmVhbSIsIm1vZGUiLCJjaGFuIiwibXNlbmQiLCJtc2VuZF9ieXRlcyIsIm1zZW5kX29iamVjdHMiLCJtc2VuZF9pbXBsIiwib2JqZWN0IiwiYnl0ZXMiLCJ3cml0ZSIsImVuZCIsImNodW5rIiwiY2hlY2tfZm5zIiwia2V5cyIsImtleSIsImpzb25fcHJvdG9jb2wiLCJzaGFyZWQiLCJkYXRhZ3JhbSIsImRpcmVjdCIsInJlY3ZNc2ciLCJzdGF0ZUZvciIsImJvZHlfYnVmIiwidW5wYWNrQm9keSIsImJpbmFyeV9wcm90b2NvbCIsImFzQnVmZmVyIiwicGt0X2J1ZmZlciIsImNvbnRyb2xfcHJvdG9jb2wiLCJoaWdoIiwicGluZ19mcmFtZSIsInBvbmdfZnJhbWUiLCJwb25nX3R5cGUiLCJyZWN2X3BvbmciLCJwaW5nX3R5cGUiLCJyZWN2X3BpbmciLCJwaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsInRzMCIsIkRhdGUiLCJyb3V0ZXIiLCJib2R5X2pzb24iLCJyZWN2Q3RybCIsIl9zZW5kX3BvbmciLCJwa3RfcGluZyIsInJfaWQiLCJ0czEiLCJkaXNwYXRjaCIsImluaXRfcHJvdG9jb2wiLCJzaGFyZWRfcHJvdG8iLCJqc29uIiwianNvbl9wcm90byIsImJpbmFyeSIsImJpbmFyeV9wcm90byIsImNvbnRyb2wiLCJjb250cm9sX3Byb3RvIiwiY29kZWNzIiwiZGVmYXVsdCIsIlNpbmsiLCJmb3JQcm90b2NvbHMiLCJwcm90b3R5cGUiLCJfcHJvdG9jb2wiLCJlbmRwb2ludCIsImh1YiIsImhhbmRsZXJzIiwidW5yZWdpc3RlciIsInVucmVnaXN0ZXJUYXJnZXQiLCJyZWdpc3RlclRhcmdldCIsIl9iaW5kRGlzcGF0Y2giLCJvbl9tc2ciLCJvbl9zaHV0ZG93biIsImFsaXZlIiwicHJvdG9jb2wiLCJpc0FsaXZlIiwic2h1dGRvd24iLCJleHRyYSIsImFzc2lnbiIsImJpbmRTaW5rIiwiem9uZSIsInRlcm1pbmF0ZSIsImlmQWJzZW50IiwiZW50cnkiLCJieV9tc2dpZCIsImdldCIsInNldCIsImRlbGV0ZSIsImVwX3Byb3RvIiwiT2JqZWN0IiwiY3JlYXRlIiwiZ2V0UHJvdG90eXBlT2YiLCJhZGRfZXBfa2luZCIsImtpbmRzIiwiYXBpIiwidGFyZ2V0IiwiY2xpZW50RW5kcG9pbnQiLCJhcmdzIiwibXNnX2N0eCIsIk1zZ0N0eCIsInRvIiwiZXBfY2xpZW50X2FwaSIsIm9uX3JlYWR5IiwiZXAiLCJfcmVzb2x2ZSIsIm9uX2NsaWVudF9yZWFkeSIsIl9yZWplY3QiLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsImFwaV9lbmRwb2ludHMiLCJwYXJhbGxlbCIsImlub3JkZXIiLCJycGMiLCJiaW5kX3JwYyIsInNlbmRlciIsImludm9rZSIsImFwaV9mbiIsImt3IiwiY3R4IiwiaW52b2tlX2dhdGVkIiwicGZ4Iiwib3BfcHJlZml4IiwibG9va3VwX29wIiwib3BfbG9va3VwIiwiZm4iLCJycGNfYXBpIiwiZXBfc2VsZiIsImNiIiwicmVzb2x2ZV9vcCIsImFuc3dlciIsImdhdGUiLCJ0aGVuIiwibm9vcCIsImVycl9mcm9tIiwibWVzc2FnZSIsImNvZGUiLCJlcnJvciIsInJlcGx5RXhwZWN0ZWQiLCJFUFRhcmdldCIsImlkIiwiZXBfZW5jb2RlIiwiYXNfanNvbl91bnBhY2siLCJtc2dfY3R4X3RvIiwieGZvcm1CeUtleSIsInYiLCJmcm9tX2N0eCIsImVwX2RlY29kZSIsImpzb25fdW5wYWNrX3hmb3JtIiwiYXNFbmRwb2ludElkIiwiZXBfdGd0IiwiZmFzdCIsImluaXQiLCJmYXN0X2pzb24iLCJkZWZpbmVQcm9wZXJ0aWVzIiwicXVlcnkiLCJzaW1wbGUiLCJyIiwidCIsInRvU3RyaW5nIiwic3BsaXQiLCJwYXJzZUludCIsInN6IiwicGFyc2UiLCJyZXZpdmVyIiwicmVnIiwiV2Vha01hcCIsInhmbiIsInZmbiIsIndpdGhDb2RlY3MiLCJmb3JIdWIiLCJjaGFubmVsIiwic2VuZFJhdyIsImNoYW5fc2VuZCIsImZyZWV6ZSIsIl9pbnZva2VfZXgiLCJfbXNnQ29kZWNzIiwiX2NvZGVjIiwicmVwbHkiLCJmbk9yS2V5IiwiYXNzZXJ0TW9uaXRvciIsInBfc2VudCIsImluaXRSZXBseSIsInRndCIsInNlbGYiLCJjbG9uZSIsInJlcGx5X2lkIiwid2l0aCIsImNoZWNrTW9uaXRvciIsImFjdGl2ZSIsIm1vbml0b3IiLCJpbml0TW9uaXRvciIsInRzX2R1cmF0aW9uIiwidHNfYWN0aXZlIiwicHJvbWlzZSIsInRkIiwidGlkIiwidHNfaW50ZXJ2YWwiLCJjdHJsIiwiY29kZWMiLCJjaGVja1BpbmciLCJzZXRJbnRlcnZhbCIsInVucmVmIiwiY2xlYXIiLCJjbGVhckludGVydmFsIiwibXNnX2NvZGVjIiwibXNnQ29kZWNzIiwibmFtZSIsImVudHJpZXMiLCJqc29uX3NlbmQiLCJwX3JlcGx5IiwidGltZW91dCIsIlJlcGx5VGltZW91dCIsInNldFRpbWVvdXQiLCJtc190aW1lb3V0IiwiRW5kcG9pbnQiLCJzdWJjbGFzcyIsImV4dGVuc2lvbnMiLCJ0b0pTT04iLCJ3aXRoRW5kcG9pbnQiLCJNYXAiLCJjcmVhdGVNYXAiLCJieV90b2tlbiIsImNyZWF0ZVJlcGx5TWFwIiwiYnlfdHJhZmZpYyIsImNyZWF0ZVRyYWZmaWNNYXAiLCJ0cmFmZmljIiwidHMiLCJub3ciLCJyZWN2VHJhZmZpYyIsImNyZWF0ZVN0YXRlTWFwIiwicm1zZyIsImlzX3JlcGx5IiwiYXNfc2VuZGVyIiwid2FybiIsImluaXRSZXBseVByb21pc2UiLCJjYXRjaCIsIndpdGhSZWplY3RUaW1lb3V0IiwiZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyIsImNsYXNzZXMiLCJwbHVnaW5fb3B0aW9ucyIsImRlZmF1bHRfb25fbXNnIiwiZGVmYXVsdF9vbl9lcnJvciIsImRlZmF1bHRfb25fc2h1dGRvd24iLCJlcF9raW5kcyIsIm9yZGVyIiwicG9zdCIsIkZhYnJpY0h1Yl9QSSIsImJhc2VzIiwiaXNQYWNrZXRQYXJzZXIiLCJwbHVnaW5fbmFtZSIsImJpbmRFbmRwb2ludEFwaSIsInByb3RvY29scyIsIk1zZ0N0eF9waSIsIlNpbmtCYXNlIiwiTXNnQ3R4QmFzZSIsIkVuZHBvaW50QmFzZSIsImNvbm5lY3Rfc2VsZiIsInNldFByb3RvdHlwZU9mIiwidGFyZ2V0cyIsImhhcyIsImlkX3NlbGYiLCJyZWFkeSIsIl9hZnRlcl9pbml0IiwicmVnaXN0ZXIiLCJlbmRwb2ludF9ub2RlanMiLCJyYW5kb21CeXRlcyIsInJlYWRJbnQzMkxFIiwiZW5kcG9pbnRfcGx1Z2luIiwiZ2V0UmFuZG9tVmFsdWVzIiwid2luZG93IiwiY3J5cHRvIiwiZW5kcG9pbnRfYnJvd3NlciIsImFyciIsIkludDMyQXJyYXkiXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLE1BQU1BLGdCQUFnQixJQUF0QjtBQUNBLE1BQU1DLFdBQVcsUUFBakI7QUFDQSxNQUFNQyxhQUFhLFVBQW5CO0FBQ0EsTUFBTUMsV0FBVyxRQUFqQjtBQUNBLE1BQU1DLGNBQWMsV0FBcEI7QUFDQSxNQUFNQyxjQUFjLFdBQXBCOztBQUVBLE1BQU1DLHNCQUF1QiwwQkFBN0I7QUFDQSxNQUFNQyxzQkFBdUIsMkJBQTdCOztBQUdBLFNBQVNDLFdBQVQsR0FBdUI7UUFDZkMsT0FBTyxD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

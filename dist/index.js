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

  constructor(json_unpack) {
    this.json_unpack = json_unpack;
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
        return false; // change while awaiting above…
      }try {
        return await on_msg(msg, pkt);
      } catch (err) {
        try {
          var terminate = on_error(err, { msg, pkt, zone: 'dispatch' });
        } finally {
          if (false !== terminate) {
            shutdown(err, { msg, pkt });
            return false; // signal unregister to msg-fabric-core/router
          }
        }
      }
    };
  }stateFor(pkt, ifAbsent) {
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
}

function bindRouteChannel(hub, cache) {
  const channel = hub.connect_self();
  const { resolveRoute, routes } = hub.router;
  return cache ? cacheRouteChannel : resolveRouteChannel;

  function cacheRouteChannel(id_router) {
    let chan = cache.get(id_router);
    if (undefined === chan) {
      chan = resolveRouteChannel(id_router);
      cache.set(id_router, chan);
    }
    return chan;
  }

  function resolveRouteChannel(id_router) {
    let route,
        disco = resolveRoute(id_router);
    return async pkt => {
      try {
        if (null !== disco) {
          route = await disco;
          disco = null;
        }

        if (null == route || !routes.has(id_router)) {
          throw new Error("Unresolvable route");
        }

        await route(pkt, channel);
        return true;
      } catch (err) {
        disco = route = null;
        if (cache) {
          cache.delete(id_router);
        }
        throw err;
      }
    };
  }
}

class Endpoint {
  static subclass(extensions) {
    class Endpoint extends this {}
    Object.assign(Endpoint.prototype, extensions);
    return Endpoint;
  }

  valueOf() {
    return this.id.id_target;
  }
  inspect() {
    return `«Endpoint ${this.encode(true)}»`;
  }
  toJSON() {
    return this.encode(false);
  }

  constructor(id, msg_ctx, ep_tgt) {
    msg_ctx = msg_ctx.withEndpoint(this);
    const asSender = ep_tgt.constructor.json_as_sender(msg_ctx);
    Object.defineProperties(this, {
      id: { value: id, enumerable: true },
      to: { value: msg_ctx.to },
      encode: { value: ep_tgt.encode },
      asSender: { value: asSender } });
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
    return { msg, info, sender: this.asSender(info) };
  }
  recvStream(msg, info, is_reply) {
    console.warn(`Unhandle recv stream: ${info}`);
    return null;
    /* return @{} msg, info
         on_init(msg, pkt) :: return this
         on_data(data, pkt) :: this.parts.push @ data
         on_end(result, pkt) :: return this.parts.join('')
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

class EPTarget {
  static subclass(extensions) {
    class EPTarget extends this {}
    Object.assign(EPTarget.prototype, extensions);
    return EPTarget;
  }

  constructor(id, msg_ctx, msg_info) {
    const props = {
      id_router: { enumerable: true, value: id.id_router },
      id_target: { enumerable: true, value: id.id_target },
      encode: { value: simple => this.ep_encode(id, simple) } };

    if (msg_ctx) {
      bindCtxProps(props, msg_info, () => msg_ctx.to(this, msg_info).fast_json);
    }
    return Object.defineProperties(this, props);
  }

  valueOf() {
    return this.id_target;
  }
  inspect() {
    return `«EPTarget ${this.encode(true)}»`;
  }
  toJSON() {
    return this.encode(false);
  }
  isEPTarget() {
    return true;
  }

  static json_as_sender(msg_ctx) {
    return info => this.from_json(info.from_id, msg_ctx, info);
  }

  static from_json(id, msg_ctx, msg_info) {
    if (id) {
      return new this(id, msg_ctx, msg_info);
    }
  }

  static jsonUnpack(msg_ctx, xformByKey) {
    xformByKey = Object.create(xformByKey || null);
    xformByKey[this.token] = v => this.from_json(this.ep_decode(v), msg_ctx);
    return this.jsonUnpackByKey(xformByKey);
  }

  static jsonUnpackByKey(xformByKey) {
    const reg = new WeakMap();
    return sz => JSON.parse(sz, reviver);

    function reviver(key, value) {
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
    }
  }
}

function bindCtxProps(props, msg_info, init) {
  let ctx;
  props.send = { get() {
      return (ctx || (ctx = init())).send;
    } };
  props.query = { get() {
      return (ctx || (ctx = init())).query;
    } };
  if (msg_info && msg_info.msgid) {
    // reads as "sender.replyExpected"
    props.replyExpected = { value: true };
  }
}

const token = '\u03E0'; // 'Ϡ'
EPTarget.token = token;

EPTarget.ep_encode = EPTarget.prototype.ep_encode = ep_encode;
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

EPTarget.ep_decode = EPTarget.prototype.ep_decode = ep_decode;
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

class MsgCtx {
  static forProtocols({ random_id, codecs }) {
    class MsgCtx extends this {}
    MsgCtx.prototype.random_id = random_id;
    MsgCtx.withCodecs(codecs);
    return MsgCtx;
  }

  constructor(ep_tgt, resolveRouteChannel) {
    const props = {
      _root_: { value: this },
      resolveRouteChannel: { value: resolveRouteChannel } };

    if (null !== ep_tgt) {
      const { id_target, id_router } = ep_tgt;
      const from_id = Object.freeze({ id_target, id_router });
      props.from_id = { value: from_id };
      props.ctx = { value: { from_id } };
      props.ep_decode = { value: ep_tgt.ep_decode };
    }

    return Object.defineProperties(this, props);
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
    const chan = this.resolveRouteChannel(obj.id_router);

    const res = invoke(chan, obj, ...args);
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
        const { from_id: reply_id, id_target, id_router, token, msgid } = this.ep_decode(tgt) || tgt;

        if (undefined !== id_target) {
          if (undefined === id_router) {
            if (!ctx.id_router) {
              // implicitly on the same router
              ctx.id_router = ctx.from_id.id_router;
            }
          } else ctx.id_router = id_router;
          ctx.id_target = id_target;
        } else if (undefined !== id_router) {
          throw new Error(`Passing 'id_router' requires 'id_target'`);
        } else if (undefined !== reply_id && !ctx.id_target) {
          ctx.id_router = reply_id.id_router;
          ctx.id_target = reply_id.id_target;
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

  reset(...args) {
    return Object.create(this._root_, {
      ctx: { value: Object.assign({}, this.ctx, ...args) } });
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
  ReplyTimeout, ms_timeout: 5000,
  ep_decode });

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
    //const {Endpoint, EPTarget, Sink, MsgCtx, protocols} = classes
    return classes;
  },

  json_pack: JSON.stringify,
  createMap() {
    return new Map(); // LRUMap, HashbeltMap
  }, createRouteCache() {
    return new Map(); // LRUMap, HashbeltMap
  } };var endpoint_plugin = function (plugin_options) {
  plugin_options = Object.assign({}, default_plugin_options, plugin_options);
  const {
    plugin_name, random_id, json_pack,
    on_msg: default_on_msg,
    on_error: default_on_error,
    on_shutdown: default_on_shutdown,
    createMap, createRouteCache } = plugin_options;

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

    const { Endpoint: Endpoint$$1, EPTarget: EPTarget$$1, Sink: Sink$$1, MsgCtx: MsgCtx$$1 } = plugin_options.subclass({
      protocols,
      Sink: Sink.forProtocols(protocols),
      MsgCtx: MsgCtx.forProtocols(protocols),
      Endpoint: Endpoint.subclass({ createMap }),
      EPTarget: EPTarget.subclass({}) });

    return function (hub) {
      let _client_rrc;
      return Object.assign(endpoint, { create, server: endpoint, client, clientEndpoint });

      function endpoint(on_init) {
        const targets = hub.router.targets;
        do var id_target = random_id(); while (targets.has(id_target));
        return create(id_target, on_init);
      }

      function create(id_target, on_init) {
        const handlers = Object.create(null);
        const id = { id_target, id_router: hub.router.id_self };
        const ep_tgt = new EPTarget$$1(id);
        const msg_ctx = new MsgCtx$$1(ep_tgt, bindRouteChannel(hub, createRouteCache(true)));
        const ep = new Endpoint$$1(id, msg_ctx, ep_tgt);

        const ready = Promise.resolve(on_init(ep, hub)).then(_after_init);

        ready.catch(err => handlers.on_error(err, { zone: 'on_ready' }));

        return Object.defineProperties(ep_tgt, {
          ready: { value: ready.then(() => ep_tgt) } });

        function _after_init(target) {
          if (null == target) {
            throw new TypeError(`Expected endpoint init to return a closure or interface`);
          }

          handlers.on_msg = (target.on_msg || ('function' === typeof target ? target : default_on_msg)).bind(target);
          handlers.on_error = (target.on_error || default_on_error).bind(target, ep);
          handlers.on_shutdown = (target.on_shutdown || default_on_shutdown).bind(target, ep);

          const json_unpack = target.json_unpack ? target.json_unpack.bind(target) : EPTarget$$1.jsonUnpack(msg_ctx);

          const sink = new Sink$$1(json_unpack);
          sink.register(ep, hub, id_target, handlers);

          return target.on_ready ? target.on_ready(ep, hub) : target;
        }
      }

      function clientEndpoint(on_ready) {
        let ep_tgt,
            done = new Promise((resolve, reject) => {
          ep_tgt = endpoint(ep => ({
            async on_ready(ep, hub) {
              resolve((await on_ready(ep, hub)));
              ep.shutdown();
            },

            on_shutdown(ep) {
              reject();
            },
            on_send_error(ep, err) {
              reject(err);
            } }));
        });

        return Object.assign(ep_tgt, {
          then(y, n) {
            return done.then(y, n);
          },
          catch(n) {
            return done.catch(n);
          },
          done });
      }

      function client(...args) {
        if (1 === args.length && 'function' === typeof args[0]) {
          return clientEndpoint(args[0]);
        }

        if (undefined === _client_rrc) {
          _client_rrc = bindRouteChannel(hub, createRouteCache(false));
        }

        const msg_ctx = new MsgCtx$$1(null, _client_rrc);
        return 0 !== args.length ? msg_ctx.to(...args) : msg_ctx;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvcHJvdG9jb2wvZnJhbWluZy5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL3NoYXJlZC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2pzb24uanN5IiwiLi4vY29kZS9wcm90b2NvbC9iaW5hcnkuanN5IiwiLi4vY29kZS9wcm90b2NvbC9jb250cm9sLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvaW5kZXguanN5IiwiLi4vY29kZS9zaW5rLmpzeSIsIi4uL2NvZGUvY29yZV9pbnRlZ3JhdGlvbi5qc3kiLCIuLi9jb2RlL2VuZHBvaW50LmpzeSIsIi4uL2NvZGUvZXBfdGFyZ2V0LmpzeSIsIi4uL2NvZGUvbXNnY3R4LmpzeSIsIi4uL2NvZGUvcGx1Z2luLmpzeSIsIi4uL2NvZGUvaW5kZXgubm9kZWpzLmpzeSIsIi4uL2NvZGUvaW5kZXguYnJvd3Nlci5qc3kiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgbGl0dGxlX2VuZGlhbiA9IHRydWVcbmNvbnN0IGNfc2luZ2xlID0gJ3NpbmdsZSdcbmNvbnN0IGNfZGF0YWdyYW0gPSAnZGF0YWdyYW0nXG5jb25zdCBjX2RpcmVjdCA9ICdkaXJlY3QnXG5jb25zdCBjX211bHRpcGFydCA9ICdtdWx0aXBhcnQnXG5jb25zdCBjX3N0cmVhbWluZyA9ICdzdHJlYW1pbmcnXG5cbmNvbnN0IF9lcnJfbXNnaWRfcmVxdWlyZWQgPSBgUmVzcG9uc2UgcmVxaXJlcyAnbXNnaWQnYFxuY29uc3QgX2Vycl90b2tlbl9yZXF1aXJlZCA9IGBUcmFuc3BvcnQgcmVxaXJlcyAndG9rZW4nYFxuXG5cbmZ1bmN0aW9uIGZybV9yb3V0aW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDEsIG1hc2sgPSAweDFcbiAgcmV0dXJuIEB7fVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBudWxsICE9IG9iai5mcm9tX2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgY29uc3Qge2Zyb21faWR9ID0gb2JqXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCAwfGZyb21faWQuaWRfcm91dGVyLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQzMiBAIDQrb2Zmc2V0LCAwfGZyb21faWQuaWRfdGFyZ2V0LCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCBmcm9tX2lkID0gdW5kZWZpbmVkID09PSBvYmouZnJvbV9pZFxuICAgICAgICA/IG9iai5mcm9tX2lkID0ge30gOiBvYmouZnJvbV9pZFxuICAgICAgZnJvbV9pZC5pZF9yb3V0ZXIgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBmcm9tX2lkLmlkX3RhcmdldCA9IGR2LmdldEludDMyIEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuZnVuY3Rpb24gZnJtX3Jlc3BvbnNlKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDIsIG1hc2sgPSAweDJcbiAgcmV0dXJuIEB7fVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBudWxsICE9IG9iai5tc2dpZCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLm1zZ2lkIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfbXNnaWRfcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai5tc2dpZCwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxX2FjaywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouYWNrX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudG9rZW4gPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2FjayA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5hY2tfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG5cblxuXG5mdW5jdGlvbiBmcm1fZGF0YWdyYW0oKSA6OlxuICBjb25zdCBzaXplID0gMCwgYml0cyA9IDB4MCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19kYXRhZ3JhbVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6XG4gICAgICBpZiBjX2RhdGFncmFtID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEgb2JqLnRva2VuID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGF0YWdyYW1cblxuZnVuY3Rpb24gZnJtX2RpcmVjdCgpIDo6XG4gIGNvbnN0IHNpemUgPSA0LCBiaXRzID0gMHg0LCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RpcmVjdFxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6XG4gICAgICBpZiBjX2RpcmVjdCA9PT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gYml0c1xuICAgICAgaWYgb2JqLnRyYW5zcG9ydCAmJiBjX3NpbmdsZSAhPT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gZmFsc2VcbiAgICAgIHJldHVybiAhISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX2RpcmVjdFxuXG5mdW5jdGlvbiBmcm1fbXVsdGlwYXJ0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDgsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfbXVsdGlwYXJ0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfbXVsdGlwYXJ0ID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6IC8vIHVzZSBzZXFfbmV4dFxuICAgICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwLCBsaXR0bGVfZW5kaWFuXG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19tdWx0aXBhcnRcblxuZnVuY3Rpb24gZnJtX3N0cmVhbWluZygpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHhjLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX3N0cmVhbWluZ1xuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBjX3N0cmVhbWluZyA9PT0gb2JqLnRyYW5zcG9ydCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgYmluZF9zZXFfbmV4dCwgc2VxX3BvczogNFxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cbiAgICAgIGlmIHRydWUgPT0gb2JqLnNlcSA6OlxuICAgICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwLCBsaXR0bGVfZW5kaWFuIC8vIHVzZSBzZXFfbmV4dFxuICAgICAgZWxzZSBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLnNlcV9mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkICAgICA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXEgICAgICAgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfc3RyZWFtaW5nXG5cblxuZnVuY3Rpb24gYmluZF9zZXFfbmV4dChvZmZzZXQpIDo6XG4gIGNvbnN0IHNlcV9vZmZzZXQgPSB0aGlzLnNlcV9wb3MgKyBvZmZzZXRcbiAgbGV0IHNlcSA9IDFcbiAgcmV0dXJuIGZ1bmN0aW9uIHNlcV9uZXh0KHtmbGFncywgZmlufSwgZHYpIDo6XG4gICAgaWYgISBmaW4gOjpcbiAgICAgIGR2LnNldEludDE2IEAgc2VxX29mZnNldCwgc2VxKyssIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgZWxzZSA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCAtc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDIrc2VxX29mZnNldCwgMHxmbGFncywgbGl0dGxlX2VuZGlhblxuICAgICAgc2VxID0gTmFOXG5cblxuXG5leHBvcnQgZGVmYXVsdCBjb21wb3NlRnJhbWluZ3MoKVxuZnVuY3Rpb24gY29tcG9zZUZyYW1pbmdzKCkgOjpcbiAgY29uc3QgZnJtX2Zyb20gPSBmcm1fcm91dGluZygpLCBmcm1fcmVzcCA9IGZybV9yZXNwb25zZSgpXG4gIGNvbnN0IGZybV90cmFuc3BvcnRzID0gQFtdIGZybV9kYXRhZ3JhbSgpLCBmcm1fZGlyZWN0KCksIGZybV9tdWx0aXBhcnQoKSwgZnJtX3N0cmVhbWluZygpXG5cbiAgaWYgOCAhPT0gZnJtX2Zyb20uc2l6ZSB8fCA4ICE9PSBmcm1fcmVzcC5zaXplIHx8IDQgIT0gZnJtX3RyYW5zcG9ydHMubGVuZ3RoIDo6XG4gICAgdGhyb3cgbmV3IEVycm9yIEAgYEZyYW1pbmcgU2l6ZSBjaGFuZ2VgXG5cbiAgY29uc3QgYnlCaXRzID0gW10sIG1hc2s9MHhmXG5cbiAgOjpcbiAgICBjb25zdCB0X2Zyb20gPSBmcm1fZnJvbS5mX3Rlc3QsIHRfcmVzcCA9IGZybV9yZXNwLmZfdGVzdFxuICAgIGNvbnN0IFt0MCx0MSx0Mix0M10gPSBmcm1fdHJhbnNwb3J0cy5tYXAgQCBmPT5mLmZfdGVzdFxuXG4gICAgY29uc3QgdGVzdEJpdHMgPSBieUJpdHMudGVzdEJpdHMgPSBvYmogPT5cbiAgICAgIDAgfCB0X2Zyb20ob2JqKSB8IHRfcmVzcChvYmopIHwgdDAob2JqKSB8IHQxKG9iaikgfCB0MihvYmopIHwgdDMob2JqKVxuXG4gICAgYnlCaXRzLmNob29zZSA9IGZ1bmN0aW9uIChvYmosIGxzdCkgOjpcbiAgICAgIGlmIG51bGwgPT0gbHN0IDo6IGxzdCA9IHRoaXMgfHwgYnlCaXRzXG4gICAgICByZXR1cm4gbHN0W3Rlc3RCaXRzKG9iaildXG5cblxuICBmb3IgY29uc3QgVCBvZiBmcm1fdHJhbnNwb3J0cyA6OlxuICAgIGNvbnN0IHtiaXRzOmIsIHNpemUsIHRyYW5zcG9ydH0gPSBUXG5cbiAgICBieUJpdHNbYnwwXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MCwgbWFzaywgc2l6ZTogc2l6ZSwgb3A6ICcnXG4gICAgYnlCaXRzW2J8MV0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDEsIG1hc2ssIHNpemU6IDggKyBzaXplLCBvcDogJ2YnXG4gICAgYnlCaXRzW2J8Ml0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDIsIG1hc2ssIHNpemU6IDggKyBzaXplLCBvcDogJ3InXG4gICAgYnlCaXRzW2J8M10gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDMsIG1hc2ssIHNpemU6IDE2ICsgc2l6ZSwgb3A6ICdmcidcblxuICAgIGZvciBjb25zdCBmbl9rZXkgb2YgWydmX3BhY2snLCAnZl91bnBhY2snXSA6OlxuICAgICAgY29uc3QgZm5fdHJhbiA9IFRbZm5fa2V5XSwgZm5fZnJvbSA9IGZybV9mcm9tW2ZuX2tleV0sIGZuX3Jlc3AgPSBmcm1fcmVzcFtmbl9rZXldXG5cbiAgICAgIGJ5Qml0c1tifDBdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl90cmFuKG9iaiwgZHYsIDApXG4gICAgICBieUJpdHNbYnwxXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fZnJvbShvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8Ml1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3Jlc3Aob2JqLCBkdiwgMCk7IGZuX3RyYW4ob2JqLCBkdiwgOClcbiAgICAgIGJ5Qml0c1tifDNdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl9yZXNwKG9iaiwgZHYsIDgpOyBmbl90cmFuKG9iaiwgZHYsIDE2KVxuXG4gIGZvciBjb25zdCBmcm0gb2YgYnlCaXRzIDo6XG4gICAgYmluZEFzc2VtYmxlZCBAIGZybVxuXG4gIHJldHVybiBieUJpdHNcblxuXG5mdW5jdGlvbiBiaW5kQXNzZW1ibGVkKGZybSkgOjpcbiAgY29uc3Qge1QsIHNpemUsIGZfcGFjaywgZl91bnBhY2t9ID0gZnJtXG4gIGlmIFQuYmluZF9zZXFfbmV4dCA6OlxuICAgIGZybS5zZXFfbmV4dCA9IFQuYmluZF9zZXFfbmV4dCBAIGZybS5zaXplIC0gVC5zaXplXG5cbiAgZGVsZXRlIGZybS5UXG4gIGZybS5wYWNrID0gcGFjayA7IGZybS51bnBhY2sgPSB1bnBhY2tcbiAgY29uc3Qgc2VxX25leHQgPSBmcm0uc2VxX25leHRcblxuICBmdW5jdGlvbiBwYWNrKHBrdF90eXBlLCBwa3Rfb2JqKSA6OlxuICAgIGlmICEgQCAwIDw9IHBrdF90eXBlICYmIHBrdF90eXBlIDw9IDI1NSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwa3RfdHlwZSB0byBiZSBbMC4uMjU1XWBcblxuICAgIHBrdF9vYmoudHlwZSA9IHBrdF90eXBlXG4gICAgaWYgc2VxX25leHQgJiYgbnVsbCA9PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgcGt0X29iai5zZXEgPSB0cnVlXG5cbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyBAIG5ldyBBcnJheUJ1ZmZlcihzaXplKVxuICAgIGZfcGFjayhwa3Rfb2JqLCBkdiwgMClcbiAgICBwa3Rfb2JqLmhlYWRlciA9IGR2LmJ1ZmZlclxuXG4gICAgaWYgdHJ1ZSA9PT0gcGt0X29iai5zZXEgOjpcbiAgICAgIF9iaW5kX2l0ZXJhYmxlIEAgcGt0X29iaiwgZHYuYnVmZmVyLnNsaWNlKDAsc2l6ZSlcblxuICBmdW5jdGlvbiB1bnBhY2socGt0KSA6OlxuICAgIGNvbnN0IGJ1ZiA9IHBrdC5oZWFkZXJfYnVmZmVyKClcbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyBAIG5ldyBVaW50OEFycmF5KGJ1ZikuYnVmZmVyXG5cbiAgICBjb25zdCBpbmZvID0ge31cbiAgICBmX3VucGFjayhpbmZvLCBkdiwgMClcbiAgICByZXR1cm4gcGt0LmluZm8gPSBpbmZvXG5cbiAgZnVuY3Rpb24gX2JpbmRfaXRlcmFibGUocGt0X29iaiwgYnVmX2Nsb25lKSA6OlxuICAgIGNvbnN0IHt0eXBlfSA9IHBrdF9vYmpcbiAgICBjb25zdCB7aWRfcm91dGVyLCBpZF90YXJnZXQsIHR0bCwgdG9rZW59ID0gcGt0X29ialxuICAgIHBrdF9vYmoubmV4dCA9IG5leHRcblxuICAgIGZ1bmN0aW9uIG5leHQob3B0aW9ucykgOjpcbiAgICAgIGlmIG51bGwgPT0gb3B0aW9ucyA6OiBvcHRpb25zID0ge31cbiAgICAgIGNvbnN0IGhlYWRlciA9IGJ1Zl9jbG9uZS5zbGljZSgpXG4gICAgICBzZXFfbmV4dCBAIG9wdGlvbnMsIG5ldyBEYXRhVmlldyBAIGhlYWRlclxuICAgICAgcmV0dXJuIEB7fSBkb25lOiAhISBvcHRpb25zLmZpbiwgdmFsdWU6IEB7fSAvLyBwa3Rfb2JqXG4gICAgICAgIGlkX3JvdXRlciwgaWRfdGFyZ2V0LCB0eXBlLCB0dGwsIHRva2VuLCBoZWFkZXJcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBhY2tldFBhcnNlciwgb3B0aW9ucywgZnJhZ21lbnRfc2l6ZSkgOjpcbiAgY29uc3Qge2NvbmNhdEJ1ZmZlcnMsIHBhY2tQYWNrZXRPYmosIHBhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gcGFja2V0UGFyc2VyXG4gIGZyYWdtZW50X3NpemUgPSBOdW1iZXIoZnJhZ21lbnRfc2l6ZSB8fCA4MDAwKVxuICBpZiAxMDI0ID4gZnJhZ21lbnRfc2l6ZSB8fCA2NTAwMCA8IGZyYWdtZW50X3NpemUgOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgSW52YWxpZCBmcmFnbWVudCBzaXplOiAke2ZyYWdtZW50X3NpemV9YFxuXG4gIGNvbnN0IHtyYW5kb21faWQsIGpzb25fcGFja30gPSBvcHRpb25zXG4gIHJldHVybiBAOiBwYWNrZXRQYXJzZXIsIHJhbmRvbV9pZCwganNvbl9wYWNrXG4gICAgY3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIHBhY2tldEZyYWdtZW50c1xuICAgIGJpbmRUcmFuc3BvcnRzXG5cblxuICBmdW5jdGlvbiBjcmVhdGVNdWx0aXBhcnQocGt0LCBzaW5rLCBtc2dpZCkgOjpcbiAgICBsZXQgcGFydHMgPSBbXSwgZmluID0gZmFsc2VcbiAgICByZXR1cm4gQHt9IGZlZWQsIGluZm86IHBrdC5pbmZvXG5cbiAgICBmdW5jdGlvbiBmZWVkKHBrdCkgOjpcbiAgICAgIGxldCBzZXEgPSBwa3QuaW5mby5zZXFcbiAgICAgIGlmIHNlcSA8IDAgOjogZmluID0gdHJ1ZTsgc2VxID0gLXNlcVxuICAgICAgcGFydHNbc2VxLTFdID0gcGt0LmJvZHlfYnVmZmVyKClcblxuICAgICAgaWYgISBmaW4gOjogcmV0dXJuXG4gICAgICBpZiBwYXJ0cy5pbmNsdWRlcyBAIHVuZGVmaW5lZCA6OiByZXR1cm5cblxuICAgICAgc2luay5kZWxldGVTdGF0ZUZvcihtc2dpZClcblxuICAgICAgY29uc3QgcmVzID0gY29uY2F0QnVmZmVycyhwYXJ0cylcbiAgICAgIHBhcnRzID0gbnVsbFxuICAgICAgcmV0dXJuIHJlc1xuXG4gIGZ1bmN0aW9uIGNyZWF0ZVN0cmVhbShwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBuZXh0PTAsIGZpbiA9IGZhbHNlLCByZWN2RGF0YSwgcnN0cmVhbVxuICAgIGNvbnN0IHN0YXRlID0gQHt9IGZlZWQ6IGZlZWRfaW5pdCwgaW5mbzogcGt0LmluZm9cbiAgICByZXR1cm4gc3RhdGVcblxuICAgIGZ1bmN0aW9uIGZlZWRfaW5pdChwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcblxuICAgICAgY29uc3QgaW5mbyA9IHBrdC5pbmZvXG4gICAgICBjb25zdCBtc2cgPSBzaW5rLmpzb25fdW5wYWNrIEAgcGt0LmJvZHlfdXRmOCgpXG4gICAgICByc3RyZWFtID0gc2luay5yZWN2U3RyZWFtKG1zZywgaW5mbylcbiAgICAgIGlmIG51bGwgPT0gcnN0cmVhbSA6OiByZXR1cm5cbiAgICAgIGNoZWNrX2ZucyBAIHJzdHJlYW0sICdvbl9lcnJvcicsICdvbl9kYXRhJywgJ29uX2VuZCcgXG4gICAgICByZWN2RGF0YSA9IHNpbmsucmVjdlN0cmVhbURhdGEuYmluZChzaW5rLCByc3RyZWFtLCBpbmZvKVxuXG4gICAgICB0cnkgOjpcbiAgICAgICAgZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfYm9keVxuICAgICAgaWYgcnN0cmVhbS5vbl9pbml0IDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2luaXQobXNnLCBwa3QpXG5cbiAgICBmdW5jdGlvbiBmZWVkX2JvZHkocGt0LCBhc19jb250ZW50KSA6OlxuICAgICAgcmVjdkRhdGEoKVxuICAgICAgbGV0IGRhdGFcbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICAgIGRhdGEgPSBhc19jb250ZW50KHBrdCwgc2luaylcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lcnJvciBAIGVyciwgcGt0XG5cbiAgICAgIGlmIGZpbiA6OlxuICAgICAgICBjb25zdCByZXMgPSByc3RyZWFtLm9uX2RhdGEgQCBkYXRhLCBwa3RcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZW5kIEAgcmVzLCBwa3RcbiAgICAgIGVsc2UgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuXG4gICAgZnVuY3Rpb24gZmVlZF9pZ25vcmUocGt0KSA6OlxuICAgICAgdHJ5IDo6IGZlZWRfc2VxKHBrdClcbiAgICAgIGNhdGNoIGVyciA6OlxuXG4gICAgZnVuY3Rpb24gZmVlZF9zZXEocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxID49IDAgOjpcbiAgICAgICAgaWYgbmV4dCsrID09PSBzZXEgOjpcbiAgICAgICAgICByZXR1cm4gLy8gaW4gb3JkZXJcbiAgICAgIGVsc2UgOjpcbiAgICAgICAgZmluID0gdHJ1ZVxuICAgICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuICAgICAgICBpZiBuZXh0ID09PSAtc2VxIDo6XG4gICAgICAgICAgbmV4dCA9ICdkb25lJ1xuICAgICAgICAgIHJldHVybiAvLyBpbi1vcmRlciwgbGFzdCBwYWNrZXRcblxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfaWdub3JlXG4gICAgICBuZXh0ID0gJ2ludmFsaWQnXG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgUGFja2V0IG91dCBvZiBzZXF1ZW5jZWBcblxuICBmdW5jdGlvbiAqIHBhY2tldEZyYWdtZW50cyhidWYsIG5leHRfaGRyLCBmaW4pIDo6XG4gICAgaWYgbnVsbCA9PSBidWYgOjpcbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKHtmaW59KVxuICAgICAgeWllbGQgb2JqXG4gICAgICByZXR1cm5cblxuICAgIGxldCBpID0gMCwgbGFzdElubmVyID0gYnVmLmJ5dGVMZW5ndGggLSBmcmFnbWVudF9zaXplO1xuICAgIHdoaWxlIGkgPCBsYXN0SW5uZXIgOjpcbiAgICAgIGNvbnN0IGkwID0gaVxuICAgICAgaSArPSBmcmFnbWVudF9zaXplXG5cbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKClcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkwLCBpKVxuICAgICAgeWllbGQgb2JqXG5cbiAgICA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICBvYmouYm9keSA9IGJ1Zi5zbGljZShpKVxuICAgICAgeWllbGQgb2JqXG5cblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRJbXBscyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cykgOjpcbiAgICBjb25zdCBvdXRib3VuZCA9IFtdXG4gICAgb3V0Ym91bmQuY2hvb3NlID0gZnJhbWluZ3MuY2hvb3NlXG5cbiAgICBmb3IgY29uc3QgZnJhbWUgb2YgZnJhbWluZ3MgOjpcbiAgICAgIGNvbnN0IGltcGwgPSBmcmFtZSA/IHRyYW5zcG9ydHNbZnJhbWUudHJhbnNwb3J0XSA6IG51bGxcbiAgICAgIGlmICEgaW1wbCA6OiBjb250aW51ZVxuXG4gICAgICBjb25zdCB7Yml0cywgcGFjaywgdW5wYWNrfSA9IGZyYW1lXG4gICAgICBjb25zdCBwa3RfdHlwZSA9IGhpZ2hiaXRzIHwgYml0c1xuICAgICAgY29uc3Qge3RfcmVjdn0gPSBpbXBsXG5cbiAgICAgIGZ1bmN0aW9uIHBhY2tfaGRyKG9iaikgOjpcbiAgICAgICAgcGFjayhwa3RfdHlwZSwgb2JqKVxuICAgICAgICByZXR1cm4gb2JqXG5cbiAgICAgIGZ1bmN0aW9uIHJlY3ZfbXNnKHBrdCwgc2luaykgOjpcbiAgICAgICAgdW5wYWNrKHBrdClcbiAgICAgICAgcmV0dXJuIHRfcmVjdihwa3QsIHNpbmspXG5cbiAgICAgIHBhY2tfaGRyLnBrdF90eXBlID0gcmVjdl9tc2cucGt0X3R5cGUgPSBwa3RfdHlwZVxuICAgICAgb3V0Ym91bmRbYml0c10gPSBwYWNrX2hkclxuICAgICAgaW5ib3VuZFtwa3RfdHlwZV0gPSByZWN2X21zZ1xuXG4gICAgICBpZiAncHJvZHVjdGlvbicgIT09IHByb2Nlc3MuZW52Lk5PREVfRU5WIDo6XG4gICAgICAgIGNvbnN0IG9wID0gcGFja19oZHIub3AgPSByZWN2X21zZy5vcCA9IGZyYW1lLm9wXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSBAIHBhY2tfaGRyLCAnbmFtZScsIEB7fSB2YWx1ZTogYHBhY2tfaGRyIMKrJHtvcH3Cu2BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcmVjdl9tc2csICduYW1lJywgQHt9IHZhbHVlOiBgcmVjdl9tc2cgwqske29wfcK7YFxuXG4gICAgcmV0dXJuIG91dGJvdW5kXG5cblxuICBmdW5jdGlvbiBiaW5kVHJhbnNwb3J0cyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cykgOjpcbiAgICBjb25zdCBwYWNrQm9keSA9IHRyYW5zcG9ydHMucGFja0JvZHlcbiAgICBjb25zdCBvdXRib3VuZCA9IGJpbmRUcmFuc3BvcnRJbXBscyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cylcbiAgICByZXR1cm4gdHJhbnNwb3J0cy5zdHJlYW1pbmdcbiAgICAgID8gQHt9IHNlbmQsIHN0cmVhbTogYmluZF9zdHJlYW0gQCB0cmFuc3BvcnRzLnN0cmVhbWluZy5tb2RlXG4gICAgICA6IEB7fSBzZW5kXG5cbiAgICBmdW5jdGlvbiBzZW5kKGNoYW4sIG9iaiwgYm9keSkgOjpcbiAgICAgIGJvZHkgPSBwYWNrQm9keShib2R5KVxuICAgICAgaWYgZnJhZ21lbnRfc2l6ZSA8IGJvZHkuYnl0ZUxlbmd0aCA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBvYmoudHJhbnNwb3J0ID0gJ211bHRpcGFydCdcbiAgICAgICAgY29uc3QgbXNlbmQgPSBtc2VuZF9ieXRlcyhjaGFuLCBvYmopXG4gICAgICAgIHJldHVybiBtc2VuZCBAIHRydWUsIGJvZHlcblxuICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzaW5nbGUnXG4gICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBwYWNrX2hkcihvYmopXG4gICAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gICAgZnVuY3Rpb24gbXNlbmRfYnl0ZXMoY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBsZXQge25leHR9ID0gcGFja19oZHIob2JqKVxuICAgICAgaWYgbnVsbCAhPT0gbXNnIDo6XG4gICAgICAgIG9iai5ib2R5ID0gbXNnXG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgY2hhbiBAIHBrdFxuXG4gICAgICByZXR1cm4gYXN5bmMgZnVuY3Rpb24gKGZpbiwgYm9keSkgOjpcbiAgICAgICAgaWYgbnVsbCA9PT0gbmV4dCA6OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvciBAICdXcml0ZSBhZnRlciBlbmQnXG4gICAgICAgIGxldCByZXNcbiAgICAgICAgZm9yIGNvbnN0IG9iaiBvZiBwYWNrZXRGcmFnbWVudHMgQCBib2R5LCBuZXh0LCBmaW4gOjpcbiAgICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgICAgcmVzID0gYXdhaXQgY2hhbiBAIHBrdFxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIHJlc1xuXG4gICAgZnVuY3Rpb24gbXNlbmRfb2JqZWN0cyhjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGxldCB7bmV4dH0gPSBwYWNrX2hkcihvYmopXG4gICAgICBpZiBudWxsICE9PSBtc2cgOjpcbiAgICAgICAgb2JqLmJvZHkgPSBtc2dcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBjaGFuIEAgcGt0XG5cbiAgICAgIHJldHVybiBmdW5jdGlvbiAoZmluLCBib2R5KSA6OlxuICAgICAgICBpZiBudWxsID09PSBuZXh0IDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgJ1dyaXRlIGFmdGVyIGVuZCdcbiAgICAgICAgY29uc3Qgb2JqID0gbmV4dCh7ZmlufSlcbiAgICAgICAgb2JqLmJvZHkgPSBib2R5XG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgaWYgZmluIDo6IG5leHQgPSBudWxsXG4gICAgICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgICBmdW5jdGlvbiBiaW5kX3N0cmVhbShtb2RlKSA6OlxuICAgICAgY29uc3QgbXNlbmRfaW1wbCA9IHtvYmplY3Q6IG1zZW5kX29iamVjdHMsIGJ5dGVzOiBtc2VuZF9ieXRlc31bbW9kZV1cbiAgICAgIGlmIG1zZW5kX2ltcGwgOjogcmV0dXJuIHN0cmVhbVxuXG4gICAgICBmdW5jdGlvbiBzdHJlYW0oY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIG9iai50cmFuc3BvcnQgPSAnc3RyZWFtaW5nJ1xuICAgICAgICBjb25zdCBtc2VuZCA9IG1zZW5kX2ltcGwgQCBjaGFuLCBvYmosIGpzb25fcGFjayhtc2cpXG4gICAgICAgIHdyaXRlLndyaXRlID0gd3JpdGU7IHdyaXRlLmVuZCA9IHdyaXRlLmJpbmQodHJ1ZSlcbiAgICAgICAgcmV0dXJuIHdyaXRlXG5cbiAgICAgICAgZnVuY3Rpb24gd3JpdGUoY2h1bmspIDo6XG4gICAgICAgICAgcmV0dXJuIGNodW5rICE9IG51bGxcbiAgICAgICAgICAgID8gbXNlbmQgQCB0cnVlPT09dGhpcywgcGFja0JvZHkoY2h1bmspXG4gICAgICAgICAgICA6IG1zZW5kIEAgdHJ1ZVxuXG5cbmZ1bmN0aW9uIGNoZWNrX2ZucyhvYmosIC4uLmtleXMpIDo6XG4gIGZvciBjb25zdCBrZXkgb2Yga2V5cyA6OlxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBvYmpba2V5XSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBcIiR7a2V5fVwiIHRvIGJlIGEgZnVuY3Rpb25gXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBqc29uX3Byb3RvY29sKHNoYXJlZCkgOjpcbiAgY29uc3Qge2NyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtLCBqc29uX3BhY2t9ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcblxuICByZXR1cm4gQHt9XG4gICAgcGFja0JvZHlcblxuICAgIGdldCBkYXRhZ3JhbSgpIDo6IHJldHVybiB0aGlzLmRpcmVjdFxuICAgIGRpcmVjdDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBtc2cgPSBzaW5rLmpzb25fdW5wYWNrIEAgcGt0LmJvZHlfdXRmOCgpIHx8IHVuZGVmaW5lZFxuICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBwa3QuaW5mb1xuXG4gICAgbXVsdGlwYXJ0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlTXVsdGlwYXJ0XG4gICAgICAgIGNvbnN0IGJvZHlfYnVmID0gc3RhdGUuZmVlZChwa3QpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gYm9keV9idWYgOjpcbiAgICAgICAgICBjb25zdCBtc2cgPSBzaW5rLmpzb25fdW5wYWNrIEAgdW5wYWNrX3V0ZjgoYm9keV9idWYpIHx8IHVuZGVmaW5lZFxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuICAgIHN0cmVhbWluZzogQHt9XG4gICAgICBtb2RlOiAnb2JqZWN0J1xuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVTdHJlYW1cbiAgICAgICAgcmV0dXJuIHN0YXRlLmZlZWQocGt0LCB1bnBhY2tCb2R5KVxuXG4gIGZ1bmN0aW9uIHBhY2tCb2R5KGJvZHkpIDo6XG4gICAgcmV0dXJuIHBhY2tfdXRmOCBAIGpzb25fcGFjayhib2R5KVxuXG4gIGZ1bmN0aW9uIHVucGFja0JvZHkocGt0LCBzaW5rKSA6OlxuICAgIHJldHVybiBzaW5rLmpzb25fdW5wYWNrIEAgcGt0LmJvZHlfdXRmOCgpXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBiaW5hcnlfcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW19ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgY29uc3Qge2FzQnVmZmVyfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgcmV0dXJuIEB7fVxuICAgIHBhY2tCb2R5OiBhc0J1ZmZlclxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHBrdC5ib2R5X2J1ZmZlcigpXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdieXRlcydcbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlU3RyZWFtXG4gICAgICAgIGNvbnN0IG1zZyA9IHN0YXRlLmZlZWQocGt0LCBwa3RfYnVmZmVyKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZyA6OlxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuZnVuY3Rpb24gcGt0X2J1ZmZlcihwa3QpIDo6IHJldHVybiBwa3QuYm9keV9idWZmZXIoKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gY29udHJvbF9wcm90b2NvbChpbmJvdW5kLCBoaWdoLCBzaGFyZWQpIDo6XG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrUGFja2V0T2JqfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcblxuICBjb25zdCBwaW5nX2ZyYW1lID0gZnJhbWluZ3MuY2hvb3NlIEA6IGZyb21faWQ6IHRydWUsIHRva2VuOiB0cnVlLCB0cmFuc3BvcnQ6ICdkaXJlY3QnXG4gIGNvbnN0IHBvbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgbXNnaWQ6IHRydWUsIHRyYW5zcG9ydDogJ2RhdGFncmFtJ1xuXG4gIGNvbnN0IHBvbmdfdHlwZSA9IGhpZ2h8MHhlXG4gIGluYm91bmRbcG9uZ190eXBlXSA9IHJlY3ZfcG9uZ1xuICBjb25zdCBwaW5nX3R5cGUgPSBoaWdofDB4ZlxuICBpbmJvdW5kW2hpZ2h8MHhmXSA9IHJlY3ZfcGluZ1xuXG4gIHJldHVybiBAe30gc2VuZDpwaW5nLCBwaW5nXG5cbiAgZnVuY3Rpb24gcGluZyhjaGFuLCBvYmopIDo6XG4gICAgaWYgISBvYmoudG9rZW4gOjpcbiAgICAgIG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgb2JqLmJvZHkgPSBKU09OLnN0cmluZ2lmeSBAOlxuICAgICAgb3A6ICdwaW5nJywgdHMwOiBuZXcgRGF0ZSgpXG4gICAgcGluZ19mcmFtZS5wYWNrKHBpbmdfdHlwZSwgb2JqKVxuICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gIGZ1bmN0aW9uIHJlY3ZfcGluZyhwa3QsIHNpbmssIHJvdXRlcikgOjpcbiAgICBwaW5nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICBfc2VuZF9wb25nIEAgcGt0LmJvZHksIHBrdCwgcm91dGVyXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4gIGZ1bmN0aW9uIF9zZW5kX3Bvbmcoe3RzMH0sIHBrdF9waW5nLCByb3V0ZXIpIDo6XG4gICAgY29uc3Qge21zZ2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgZnJvbV9pZDpyX2lkfSA9IHBrdF9waW5nLmluZm9cbiAgICBjb25zdCBvYmogPSBAe30gbXNnaWRcbiAgICAgIGZyb21faWQ6IEB7fSBpZF90YXJnZXQsIGlkX3JvdXRlclxuICAgICAgaWRfcm91dGVyOiByX2lkLmlkX3JvdXRlciwgaWRfdGFyZ2V0OiByX2lkLmlkX3RhcmdldFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkgQDpcbiAgICAgICAgb3A6ICdwb25nJywgdHMwLCB0czE6IG5ldyBEYXRlKClcblxuICAgIHBvbmdfZnJhbWUucGFjayhwb25nX3R5cGUsIG9iailcbiAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgcmV0dXJuIHJvdXRlci5kaXNwYXRjaCBAIFtwa3RdXG5cbiAgZnVuY3Rpb24gcmVjdl9wb25nKHBrdCwgc2luaykgOjpcbiAgICBwb25nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuaW1wb3J0IHNoYXJlZF9wcm90byBmcm9tICcuL3NoYXJlZC5qc3knXG5pbXBvcnQganNvbl9wcm90byBmcm9tICcuL2pzb24uanN5J1xuaW1wb3J0IGJpbmFyeV9wcm90byBmcm9tICcuL2JpbmFyeS5qc3knXG5pbXBvcnQgY29udHJvbF9wcm90byBmcm9tICcuL2NvbnRyb2wuanN5J1xuXG5leHBvcnQgKiBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBpbml0X3Byb3RvY29sKHBhY2tldFBhcnNlciwgb3B0aW9ucykgOjpcbiAgY29uc3Qgc2hhcmVkID0gc2hhcmVkX3Byb3RvIEAgcGFja2V0UGFyc2VyLCBvcHRpb25zXG5cbiAgY29uc3QgaW5ib3VuZCA9IFtdXG4gIGNvbnN0IGpzb24gPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgwMCAvLyAweDAqIOKAlCBKU09OIGJvZHlcbiAgICBqc29uX3Byb3RvKHNoYXJlZClcblxuICBjb25zdCBiaW5hcnkgPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgxMCAvLyAweDEqIOKAlCBiaW5hcnkgYm9keVxuICAgIGJpbmFyeV9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgY29udHJvbCA9IGNvbnRyb2xfcHJvdG8gQCBpbmJvdW5kLFxuICAgIDB4ZjAgLy8gMHhmKiDigJQgY29udHJvbFxuICAgIHNoYXJlZFxuXG4gIGNvbnN0IGNvZGVjcyA9IEA6IGpzb24sIGJpbmFyeSwgY29udHJvbCwgZGVmYXVsdDoganNvblxuXG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIHJldHVybiBAOiBpbmJvdW5kLCBjb2RlY3MsIHJhbmRvbV9pZFxuXG5cbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIFNpbmsgOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7aW5ib3VuZH0pIDo6XG4gICAgY2xhc3MgU2luayBleHRlbmRzIHRoaXMgOjpcbiAgICBTaW5rLnByb3RvdHlwZS5fcHJvdG9jb2wgPSBpbmJvdW5kXG4gICAgcmV0dXJuIFNpbmtcblxuICBjb25zdHJ1Y3Rvcihqc29uX3VucGFjaykgOjpcbiAgICB0aGlzLmpzb25fdW5wYWNrID0ganNvbl91bnBhY2tcblxuICByZWdpc3RlcihlbmRwb2ludCwgaHViLCBpZF90YXJnZXQsIGhhbmRsZXJzKSA6OlxuICAgIGNvbnN0IHVucmVnaXN0ZXIgPSAoKSA9PiBodWIucm91dGVyLnVucmVnaXN0ZXJUYXJnZXQoaWRfdGFyZ2V0KVxuXG4gICAgaHViLnJvdXRlci5yZWdpc3RlclRhcmdldCBAIGlkX3RhcmdldCxcbiAgICAgIHRoaXMuX2JpbmREaXNwYXRjaCBAIGVuZHBvaW50LCB1bnJlZ2lzdGVyLCBoYW5kbGVyc1xuICAgIHJldHVybiB0aGlzXG5cbiAgX2JpbmREaXNwYXRjaChlbmRwb2ludCwgdW5yZWdpc3Rlciwge29uX21zZywgb25fZXJyb3IsIG9uX3NodXRkb3dufSkgOjpcbiAgICBsZXQgYWxpdmUgPSB0cnVlXG4gICAgY29uc3QgcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbFxuICAgIGNvbnN0IGlzQWxpdmUgPSAoKSA9PiBhbGl2ZVxuICAgIGNvbnN0IHNodXRkb3duID0gKGVyciwgZXh0cmEpID0+IDo6XG4gICAgICBpZiBhbGl2ZSA6OlxuICAgICAgICB1bnJlZ2lzdGVyKCk7IHVucmVnaXN0ZXIgPSBhbGl2ZSA9IGZhbHNlXG4gICAgICAgIG9uX3NodXRkb3duKGVyciwgZXh0cmEpXG5cbiAgICBPYmplY3QuYXNzaWduIEAgdGhpcywgZW5kcG9pbnQuYmluZFNpbmsodGhpcyksIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuICAgIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG5cbiAgICByZXR1cm4gYXN5bmMgKHBrdCwgcm91dGVyKSA9PiA6OlxuICAgICAgaWYgZmFsc2U9PT1hbGl2ZSB8fCBudWxsPT1wa3QgOjogcmV0dXJuIGFsaXZlXG5cbiAgICAgIGNvbnN0IHJlY3ZfbXNnID0gcHJvdG9jb2xbcGt0LnR5cGVdXG4gICAgICBpZiB1bmRlZmluZWQgPT09IHJlY3ZfbXNnIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZmFsc2UsIEB7fSBwa3QsIHpvbmU6ICdwa3QudHlwZSdcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIHZhciBtc2cgPSBhd2FpdCByZWN2X21zZyBAIHBrdCwgdGhpcywgcm91dGVyXG4gICAgICAgIGlmICEgbXNnIDo6IHJldHVybiBtc2dcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gdm9pZCBvbl9lcnJvciBAIGVyciwgQHt9IHBrdCwgem9uZTogJ3Byb3RvY29sJ1xuXG4gICAgICBpZiBmYWxzZSA9PT0gYWxpdmUgOjpcbiAgICAgICAgcmV0dXJuIGZhbHNlIC8vIGNoYW5nZSB3aGlsZSBhd2FpdGluZyBhYm92ZeKAplxuICAgICAgdHJ5IDo6XG4gICAgICAgIHJldHVybiBhd2FpdCBvbl9tc2cgQCBtc2csIHBrdFxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHRyeSA6OlxuICAgICAgICAgIHZhciB0ZXJtaW5hdGUgPSBvbl9lcnJvciBAIGVyciwgQHt9IG1zZywgcGt0LCB6b25lOiAnZGlzcGF0Y2gnXG4gICAgICAgIGZpbmFsbHkgOjpcbiAgICAgICAgICBpZiBmYWxzZSAhPT0gdGVybWluYXRlIDo6XG4gICAgICAgICAgICBzaHV0ZG93bihlcnIsIHttc2csIHBrdH0pXG4gICAgICAgICAgICByZXR1cm4gZmFsc2UgLy8gc2lnbmFsIHVucmVnaXN0ZXIgdG8gbXNnLWZhYnJpYy1jb3JlL3JvdXRlclxuXG4gIHN0YXRlRm9yKHBrdCwgaWZBYnNlbnQpIDo6XG4gICAgY29uc3QgbXNnaWQgPSBwa3QuaW5mby5tc2dpZFxuICAgIGxldCBlbnRyeSA9IHRoaXMuYnlfbXNnaWQuZ2V0KG1zZ2lkKVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gZW50cnkgOjpcbiAgICAgIGlmICEgbXNnaWQgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYEludmFsaWQgbXNnaWQ6ICR7bXNnaWR9YFxuICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlmQWJzZW50IDo6XG4gICAgICAgIGVudHJ5ID0gaWZBYnNlbnQocGt0LCB0aGlzLCBtc2dpZClcbiAgICAgIGVsc2UgZW50cnkgPSBpZkFic2VudFxuICAgICAgdGhpcy5ieV9tc2dpZC5zZXQgQCBtc2dpZCwgZW50cnlcbiAgICByZXR1cm4gZW50cnlcblxuICBkZWxldGVTdGF0ZUZvcihtc2dpZCkgOjpcbiAgICByZXR1cm4gdGhpcy5ieV9tc2dpZC5kZWxldGUobXNnaWQpXG4iLCJleHBvcnQgZnVuY3Rpb24gYmluZFJvdXRlQ2hhbm5lbChodWIsIGNhY2hlKSA6OlxuICBjb25zdCBjaGFubmVsID0gaHViLmNvbm5lY3Rfc2VsZigpXG4gIGNvbnN0IHtyZXNvbHZlUm91dGUsIHJvdXRlc30gPSBodWIucm91dGVyXG4gIHJldHVybiBjYWNoZSA/IGNhY2hlUm91dGVDaGFubmVsIDogcmVzb2x2ZVJvdXRlQ2hhbm5lbFxuXG4gIGZ1bmN0aW9uIGNhY2hlUm91dGVDaGFubmVsKGlkX3JvdXRlcikgOjpcbiAgICBsZXQgY2hhbiA9IGNhY2hlLmdldChpZF9yb3V0ZXIpXG4gICAgaWYgdW5kZWZpbmVkID09PSBjaGFuIDo6XG4gICAgICBjaGFuID0gcmVzb2x2ZVJvdXRlQ2hhbm5lbChpZF9yb3V0ZXIpXG4gICAgICBjYWNoZS5zZXQoaWRfcm91dGVyLCBjaGFuKVxuICAgIHJldHVybiBjaGFuXG5cbiAgZnVuY3Rpb24gcmVzb2x2ZVJvdXRlQ2hhbm5lbChpZF9yb3V0ZXIpIDo6XG4gICAgbGV0IHJvdXRlLCBkaXNjbyA9IHJlc29sdmVSb3V0ZShpZF9yb3V0ZXIpXG4gICAgcmV0dXJuIGFzeW5jIHBrdCA9PiA6OlxuICAgICAgdHJ5IDo6XG4gICAgICAgIGlmIG51bGwgIT09IGRpc2NvIDo6XG4gICAgICAgICAgcm91dGUgPSBhd2FpdCBkaXNjb1xuICAgICAgICAgIGRpc2NvID0gbnVsbFxuXG4gICAgICAgIGlmIG51bGwgPT0gcm91dGUgfHwgISByb3V0ZXMuaGFzKGlkX3JvdXRlcikgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCBcIlVucmVzb2x2YWJsZSByb3V0ZVwiXG5cbiAgICAgICAgYXdhaXQgcm91dGUgQCBwa3QsIGNoYW5uZWxcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICBkaXNjbyA9IHJvdXRlID0gbnVsbFxuICAgICAgICBpZiBjYWNoZSA6OiBjYWNoZS5kZWxldGUoaWRfcm91dGVyKVxuICAgICAgICB0aHJvdyBlcnJcbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIEVuZHBvaW50IDo6XG4gIHN0YXRpYyBzdWJjbGFzcyhleHRlbnNpb25zKSA6OlxuICAgIGNsYXNzIEVuZHBvaW50IGV4dGVuZHMgdGhpcyA6OlxuICAgIE9iamVjdC5hc3NpZ24gQCBFbmRwb2ludC5wcm90b3R5cGUsIGV4dGVuc2lvbnNcbiAgICByZXR1cm4gRW5kcG9pbnRcblxuICB2YWx1ZU9mKCkgOjogcmV0dXJuIHRoaXMuaWQuaWRfdGFyZ2V0XG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRW5kcG9pbnQgJHt0aGlzLmVuY29kZSh0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIHRoaXMuZW5jb2RlKGZhbHNlKVxuXG4gIGNvbnN0cnVjdG9yKGlkLCBtc2dfY3R4LCBlcF90Z3QpIDo6XG4gICAgbXNnX2N0eCA9IG1zZ19jdHgud2l0aEVuZHBvaW50KHRoaXMpXG4gICAgY29uc3QgYXNTZW5kZXIgPSBlcF90Z3QuY29uc3RydWN0b3IuanNvbl9hc19zZW5kZXIobXNnX2N0eClcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBpZDogQHt9IHZhbHVlOiBpZCwgZW51bWVyYWJsZTogdHJ1ZVxuICAgICAgdG86IEB7fSB2YWx1ZTogbXNnX2N0eC50b1xuICAgICAgZW5jb2RlOiBAe30gdmFsdWU6IGVwX3RndC5lbmNvZGVcbiAgICAgIGFzU2VuZGVyOiBAe30gdmFsdWU6IGFzU2VuZGVyXG5cbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKVxuICBjcmVhdGVTdGF0ZU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVJlcGx5TWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlVHJhZmZpY01hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVJvdXRlQ2FjaGVNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuXG4gIGJpbmRTaW5rKHNpbmspIDo6XG4gICAgY29uc3QgYnlfdG9rZW4gPSB0aGlzLmNyZWF0ZVJlcGx5TWFwKClcbiAgICBjb25zdCBieV90cmFmZmljID0gdGhpcy5jcmVhdGVUcmFmZmljTWFwKClcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBieV90b2tlbjogQHt9IHZhbHVlOiBieV90b2tlblxuICAgICAgYnlfdHJhZmZpYzogQHt9IHZhbHVlOiBieV90cmFmZmljXG5cbiAgICBjb25zdCB0cmFmZmljID0gKGZyb21faWQsIHRyYWZmaWMpID0+IDo6XG4gICAgICBjb25zdCB0cyA9IERhdGUubm93KClcbiAgICAgIGlmIGZyb21faWQgOjpcbiAgICAgICAgY29uc3QgdCA9IGJ5X3RyYWZmaWMuZ2V0KGZyb21faWQuaWRfdGFyZ2V0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHQgOjpcbiAgICAgICAgICB0LnRzID0gdFtgdHNfJHt0cmFmZmljfWBdID0gdHNcbiAgICAgIHRoaXMucmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpXG5cbiAgICByZXR1cm4gQHt9XG4gICAgICBieV9tc2dpZDogdGhpcy5jcmVhdGVTdGF0ZU1hcCgpXG5cbiAgICAgIHJlY3ZDdHJsOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ2N0cmwnKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2Q3RybChtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZyB8fCB7bXNnLCBpbmZvfSkudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2TXNnOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ21zZycpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZNc2cobXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cpLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdlN0cmVhbURhdGE6IChyc3RyZWFtLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICByZWN2U3RyZWFtOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJzdHJlYW0gPSB0aGlzLnJlY3ZTdHJlYW0obXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJzdHJlYW0pLnRoZW4ocmVwbHkpXG4gICAgICAgIHJldHVybiByc3RyZWFtXG5cbiAgcmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpIDo6XG4gIHJlY3ZDdHJsKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgaWYgaXNfcmVwbHkgOjogcmV0dXJuIG1zZ1xuICByZWN2TXNnKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgaWYgaXNfcmVwbHkgOjogcmV0dXJuIG1zZ1xuICAgIHJldHVybiBAe30gbXNnLCBpbmZvLCBzZW5kZXI6IHRoaXMuYXNTZW5kZXIoaW5mbylcbiAgcmVjdlN0cmVhbShtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGNvbnNvbGUud2FybiBAIGBVbmhhbmRsZSByZWN2IHN0cmVhbTogJHtpbmZvfWBcbiAgICByZXR1cm4gbnVsbFxuICAgIC8qIHJldHVybiBAe30gbXNnLCBpbmZvXG4gICAgICAgICBvbl9pbml0KG1zZywgcGt0KSA6OiByZXR1cm4gdGhpc1xuICAgICAgICAgb25fZGF0YShkYXRhLCBwa3QpIDo6IHRoaXMucGFydHMucHVzaCBAIGRhdGFcbiAgICAgICAgIG9uX2VuZChyZXN1bHQsIHBrdCkgOjogcmV0dXJuIHRoaXMucGFydHMuam9pbignJylcbiAgICAgICAgIG9uX2Vycm9yKGVyciwgcGt0KSA6OiBjb25zb2xlLmxvZyBAIGVyclxuICAgICovXG5cbiAgaW5pdFJlcGx5KHRva2VuLCBwX3NlbnQsIG1zZ19jdHgpIDo6XG4gICAgcmV0dXJuIHRoaXMuaW5pdFJlcGx5UHJvbWlzZSBAIHRva2VuLCBwX3NlbnQsIG1zZ19jdHhcblxuICBpbml0TW9uaXRvcihpZF90YXJnZXQpIDo6XG4gICAgY29uc3Qga2V5ID0gaWRfdGFyZ2V0LmlkX3RhcmdldCB8fCBpZF90YXJnZXRcbiAgICBsZXQgbW9uaXRvciA9IHRoaXMuYnlfdHJhZmZpYy5nZXQgQCBrZXlcbiAgICBpZiB1bmRlZmluZWQgPT09IG1vbml0b3IgOjpcbiAgICAgIG1vbml0b3IgPSBAe30gaWRfdGFyZ2V0LCB0czogRGF0ZS5ub3coKVxuICAgICAgICB0ZCgpIDo6IHJldHVybiBEYXRlLm5vdygpIC0gdGhpcy50c1xuICAgICAgdGhpcy5ieV90cmFmZmljLnNldCBAIGtleSwgbW9uaXRvclxuICAgIHJldHVybiBtb25pdG9yXG5cbiAgaW5pdFJlcGx5UHJvbWlzZSh0b2tlbiwgcF9zZW50LCBtc2dfY3R4KSA6OlxuICAgIGxldCByZXBseSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHRoaXMuYnlfdG9rZW4uc2V0IEAgdG9rZW4sIHJlc29sdmVcbiAgICAgIHBfc2VudC5jYXRjaCBAIHJlamVjdFxuXG4gICAgaWYgbXNnX2N0eCA6OlxuICAgICAgcmVwbHkgPSBtc2dfY3R4LndpdGhSZWplY3RUaW1lb3V0KHJlcGx5KVxuXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiB0aGlzLmJ5X3Rva2VuLmRlbGV0ZSBAIHRva2VuXG4gICAgcmVwbHkudGhlbiBAIGNsZWFyLCBjbGVhclxuICAgIHJldHVybiByZXBseVxuXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBFUFRhcmdldCA6OlxuICBzdGF0aWMgc3ViY2xhc3MoZXh0ZW5zaW9ucykgOjpcbiAgICBjbGFzcyBFUFRhcmdldCBleHRlbmRzIHRoaXMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgRVBUYXJnZXQucHJvdG90eXBlLCBleHRlbnNpb25zXG4gICAgcmV0dXJuIEVQVGFyZ2V0XG5cbiAgY29uc3RydWN0b3IoaWQsIG1zZ19jdHgsIG1zZ19pbmZvKSA6OlxuICAgIGNvbnN0IHByb3BzID0gQHt9XG4gICAgICBpZF9yb3V0ZXI6IEB7fSBlbnVtZXJhYmxlOiB0cnVlLCB2YWx1ZTogaWQuaWRfcm91dGVyXG4gICAgICBpZF90YXJnZXQ6IEB7fSBlbnVtZXJhYmxlOiB0cnVlLCB2YWx1ZTogaWQuaWRfdGFyZ2V0XG4gICAgICBlbmNvZGU6IEB7fSB2YWx1ZTogc2ltcGxlID0+IHRoaXMuZXBfZW5jb2RlKGlkLCBzaW1wbGUpXG5cbiAgICBpZiBtc2dfY3R4IDo6XG4gICAgICBiaW5kQ3R4UHJvcHMgQCBwcm9wcywgbXNnX2luZm8sICgpID0+XG4gICAgICAgIG1zZ19jdHgudG8odGhpcywgbXNnX2luZm8pLmZhc3RfanNvblxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIHByb3BzXG5cblxuICB2YWx1ZU9mKCkgOjogcmV0dXJuIHRoaXMuaWRfdGFyZ2V0XG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRVBUYXJnZXQgJHt0aGlzLmVuY29kZSh0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIHRoaXMuZW5jb2RlKGZhbHNlKVxuICBpc0VQVGFyZ2V0KCkgOjogcmV0dXJuIHRydWVcblxuICBzdGF0aWMganNvbl9hc19zZW5kZXIobXNnX2N0eCkgOjpcbiAgICByZXR1cm4gaW5mbyA9PlxuICAgICAgdGhpcy5mcm9tX2pzb24gQCBpbmZvLmZyb21faWQsIG1zZ19jdHgsIGluZm9cblxuICBzdGF0aWMgZnJvbV9qc29uKGlkLCBtc2dfY3R4LCBtc2dfaW5mbykgOjpcbiAgICBpZiBpZCA6OiByZXR1cm4gbmV3IHRoaXMoaWQsIG1zZ19jdHgsIG1zZ19pbmZvKVxuXG4gIHN0YXRpYyBqc29uVW5wYWNrKG1zZ19jdHgsIHhmb3JtQnlLZXkpIDo6XG4gICAgeGZvcm1CeUtleSA9IE9iamVjdC5jcmVhdGUoeGZvcm1CeUtleSB8fCBudWxsKVxuICAgIHhmb3JtQnlLZXlbdGhpcy50b2tlbl0gPSB2ID0+XG4gICAgICB0aGlzLmZyb21fanNvbiBAIHRoaXMuZXBfZGVjb2RlKHYpLCBtc2dfY3R4XG4gICAgcmV0dXJuIHRoaXMuanNvblVucGFja0J5S2V5KHhmb3JtQnlLZXkpXG5cbiAgc3RhdGljIGpzb25VbnBhY2tCeUtleSh4Zm9ybUJ5S2V5KSA6OlxuICAgIGNvbnN0IHJlZyA9IG5ldyBXZWFrTWFwKClcbiAgICByZXR1cm4gc3ogPT4gSlNPTi5wYXJzZSBAIHN6LCByZXZpdmVyXG5cbiAgICBmdW5jdGlvbiByZXZpdmVyKGtleSwgdmFsdWUpIDo6XG4gICAgICBjb25zdCB4Zm4gPSB4Zm9ybUJ5S2V5W2tleV1cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0geGZuIDo6XG4gICAgICAgIHJlZy5zZXQodGhpcywgeGZuKVxuICAgICAgICByZXR1cm4gdmFsdWVcblxuICAgICAgaWYgJ29iamVjdCcgPT09IHR5cGVvZiB2YWx1ZSA6OlxuICAgICAgICBjb25zdCB2Zm4gPSByZWcuZ2V0KHZhbHVlKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHZmbiA6OlxuICAgICAgICAgIHJldHVybiB2Zm4gQCB2YWx1ZVxuICAgICAgcmV0dXJuIHZhbHVlXG5cblxuZnVuY3Rpb24gYmluZEN0eFByb3BzKHByb3BzLCBtc2dfaW5mbywgaW5pdCkgOjpcbiAgbGV0IGN0eFxuICBwcm9wcy5zZW5kID0gQHt9IGdldCgpIDo6IHJldHVybiAoY3R4IHx8IChjdHggPSBpbml0KCkpKS5zZW5kXG4gIHByb3BzLnF1ZXJ5ID0gQHt9IGdldCgpIDo6IHJldHVybiAoY3R4IHx8IChjdHggPSBpbml0KCkpKS5xdWVyeVxuICBpZiBtc2dfaW5mbyAmJiBtc2dfaW5mby5tc2dpZCA6OlxuICAgIC8vIHJlYWRzIGFzIFwic2VuZGVyLnJlcGx5RXhwZWN0ZWRcIlxuICAgIHByb3BzLnJlcGx5RXhwZWN0ZWQgPSBAe30gdmFsdWU6IHRydWVcblxuXG5jb25zdCB0b2tlbiA9ICdcXHUwM0UwJyAvLyAnz6AnXG5FUFRhcmdldC50b2tlbiA9IHRva2VuXG5cbkVQVGFyZ2V0LmVwX2VuY29kZSA9IEVQVGFyZ2V0LnByb3RvdHlwZS5lcF9lbmNvZGUgPSBlcF9lbmNvZGVcbmV4cG9ydCBmdW5jdGlvbiBlcF9lbmNvZGUoaWQsIHNpbXBsZSkgOjpcbiAgbGV0IHtpZF9yb3V0ZXI6ciwgaWRfdGFyZ2V0OnR9ID0gaWRcbiAgciA9IChyPj4+MCkudG9TdHJpbmcoMzYpXG4gIHQgPSAodD4+PjApLnRvU3RyaW5nKDM2KVxuICBpZiBzaW1wbGUgOjpcbiAgICByZXR1cm4gYCR7dG9rZW59ICR7cn1+JHt0fWBcblxuICBjb25zdCByZXMgPSBAe30gW3Rva2VuXTogYCR7cn1+JHt0fWBcbiAgT2JqZWN0LmFzc2lnbiBAIHJlcywgaWRcbiAgZGVsZXRlIHJlcy5pZF9yb3V0ZXI7IGRlbGV0ZSByZXMuaWRfdGFyZ2V0XG4gIHJldHVybiByZXNcblxuXG5FUFRhcmdldC5lcF9kZWNvZGUgPSBFUFRhcmdldC5wcm90b3R5cGUuZXBfZGVjb2RlID0gZXBfZGVjb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZGVjb2RlKHYpIDo6XG4gIGNvbnN0IGlkID0gJ3N0cmluZycgPT09IHR5cGVvZiB2XG4gICAgPyB2LnNwbGl0KHRva2VuKVsxXVxuICAgIDogdlt0b2tlbl1cbiAgaWYgISBpZCA6OiByZXR1cm5cblxuICBsZXQgW3IsdF0gPSBpZC5zcGxpdCgnficpXG4gIGlmIHVuZGVmaW5lZCA9PT0gdCA6OiByZXR1cm5cbiAgciA9IDAgfCBwYXJzZUludChyLCAzNilcbiAgdCA9IDAgfCBwYXJzZUludCh0LCAzNilcblxuICByZXR1cm4gQHt9IGlkX3JvdXRlcjogciwgaWRfdGFyZ2V0OiB0XG5cbiIsImltcG9ydCB7ZXBfZGVjb2RlfSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1zZ0N0eCA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtyYW5kb21faWQsIGNvZGVjc30pIDo6XG4gICAgY2xhc3MgTXNnQ3R4IGV4dGVuZHMgdGhpcyA6OlxuICAgIE1zZ0N0eC5wcm90b3R5cGUucmFuZG9tX2lkID0gcmFuZG9tX2lkXG4gICAgTXNnQ3R4LndpdGhDb2RlY3MgQCBjb2RlY3NcbiAgICByZXR1cm4gTXNnQ3R4XG5cbiAgY29uc3RydWN0b3IoZXBfdGd0LCByZXNvbHZlUm91dGVDaGFubmVsKSA6OlxuICAgIGNvbnN0IHByb3BzID0gQHt9XG4gICAgICBfcm9vdF86IEA6IHZhbHVlOiB0aGlzXG4gICAgICByZXNvbHZlUm91dGVDaGFubmVsOiBAOiB2YWx1ZTogcmVzb2x2ZVJvdXRlQ2hhbm5lbFxuXG4gICAgaWYgbnVsbCAhPT0gZXBfdGd0IDo6XG4gICAgICBjb25zdCB7aWRfdGFyZ2V0LCBpZF9yb3V0ZXJ9ID0gZXBfdGd0XG4gICAgICBjb25zdCBmcm9tX2lkID0gT2JqZWN0LmZyZWV6ZSBAOiBpZF90YXJnZXQsIGlkX3JvdXRlclxuICAgICAgcHJvcHMuZnJvbV9pZCA9IEB7fSB2YWx1ZTogZnJvbV9pZFxuICAgICAgcHJvcHMuY3R4ID0gQHt9IHZhbHVlOiB7ZnJvbV9pZH1cbiAgICAgIHByb3BzLmVwX2RlY29kZSA9IEB7fSB2YWx1ZTogZXBfdGd0LmVwX2RlY29kZVxuXG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgcHJvcHNcblxuICB3aXRoRW5kcG9pbnQoZW5kcG9pbnQpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBlbmRwb2ludDogQHt9IHZhbHVlOiBlbmRwb2ludFxuXG5cbiAgcGluZyh0b2tlbj10cnVlKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX21zZ0NvZGVjcy5jb250cm9sLnBpbmcsIFtdLCB0b2tlbilcbiAgc2VuZCguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MpXG4gIHNlbmRRdWVyeSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MsIHRydWUpXG4gIHF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZSkucmVwbHlcblxuICBzdHJlYW0oLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX2NvZGVjLnN0cmVhbSwgYXJnc1xuICBpbnZva2Uoa2V5LCAuLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWNba2V5XSwgYXJnc1xuICBiaW5kSW52b2tlKGZuT3JLZXksIHRva2VuKSA6OlxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBmbk9yS2V5IDo6IGZuT3JLZXkgPSB0aGlzLl9jb2RlY1xuICAgIHJldHVybiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGZuT3JLZXksIGFyZ3MsIHRva2VuKVxuXG4gIF9pbnZva2VfZXgoaW52b2tlLCBhcmdzLCB0b2tlbikgOjpcbiAgICBjb25zdCBvYmogPSBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4XG4gICAgaWYgbnVsbCA9PSB0b2tlbiA6OiB0b2tlbiA9IG9iai50b2tlblxuICAgIGVsc2Ugb2JqLnRva2VuID0gdG9rZW5cbiAgICBpZiB0cnVlID09PSB0b2tlbiA6OlxuICAgICAgdG9rZW4gPSBvYmoudG9rZW4gPSB0aGlzLnJhbmRvbV9pZCgpXG5cbiAgICB0aGlzLmFzc2VydE1vbml0b3IoKVxuICAgIGNvbnN0IGNoYW4gPSB0aGlzLnJlc29sdmVSb3V0ZUNoYW5uZWwob2JqLmlkX3JvdXRlcilcblxuICAgIGNvbnN0IHJlcyA9IGludm9rZSBAIGNoYW4sIG9iaiwgLi4uYXJnc1xuICAgIGlmICEgdG9rZW4gfHwgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJlcy50aGVuIDo6IHJldHVybiByZXNcblxuICAgIGxldCBwX3NlbnQgID0gcmVzLnRoZW4oKVxuICAgIGNvbnN0IHJlcGx5ID0gdGhpcy5lbmRwb2ludC5pbml0UmVwbHkodG9rZW4sIHBfc2VudCwgdGhpcylcbiAgICBwX3NlbnQgPSBwX3NlbnQudGhlbiBAICgpID0+IEA6IHJlcGx5XG4gICAgcF9zZW50LnJlcGx5ID0gcmVwbHlcbiAgICByZXR1cm4gcF9zZW50XG5cbiAgZ2V0IHRvKCkgOjogcmV0dXJuICh0Z3QsIC4uLmFyZ3MpID0+IDo6XG4gICAgaWYgbnVsbCA9PSB0Z3QgOjogdGhyb3cgbmV3IEVycm9yIEAgYE51bGwgdGFyZ2V0IGVuZHBvaW50YFxuXG4gICAgY29uc3Qgc2VsZiA9IHRoaXMuY2xvbmUoKVxuXG4gICAgY29uc3QgY3R4ID0gc2VsZi5jdHhcbiAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgY3R4LmlkX3RhcmdldCA9IHRndFxuICAgICAgY3R4LmlkX3JvdXRlciA9IGN0eC5mcm9tX2lkLmlkX3JvdXRlclxuICAgIGVsc2UgOjpcbiAgICAgIGNvbnN0IHtmcm9tX2lkOiByZXBseV9pZCwgaWRfdGFyZ2V0LCBpZF9yb3V0ZXIsIHRva2VuLCBtc2dpZH0gPSB0aGlzLmVwX2RlY29kZSh0Z3QpIHx8IHRndFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IGlkX3RhcmdldCA6OlxuICAgICAgICBpZiB1bmRlZmluZWQgPT09IGlkX3JvdXRlciA6OlxuICAgICAgICAgIGlmICEgY3R4LmlkX3JvdXRlciA6OlxuICAgICAgICAgICAgLy8gaW1wbGljaXRseSBvbiB0aGUgc2FtZSByb3V0ZXJcbiAgICAgICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBjdHguZnJvbV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgZWxzZSBjdHguaWRfcm91dGVyID0gaWRfcm91dGVyXG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSBpZF90YXJnZXRcbiAgICAgIGVsc2UgaWYgdW5kZWZpbmVkICE9PSBpZF9yb3V0ZXIgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFBhc3NpbmcgJ2lkX3JvdXRlcicgcmVxdWlyZXMgJ2lkX3RhcmdldCdgXG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHlfaWQgJiYgISBjdHguaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSByZXBseV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHJlcGx5X2lkLmlkX3RhcmdldFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG5cbiAgICByZXR1cm4gMCA9PT0gYXJncy5sZW5ndGggPyBzZWxmIDogc2VsZi53aXRoIEAgLi4uYXJnc1xuXG4gIHdpdGgoLi4uYXJncykgOjpcbiAgICBjb25zdCBjdHggPSB0aGlzLmN0eFxuICAgIGZvciBsZXQgdGd0IG9mIGFyZ3MgOjpcbiAgICAgIGlmIHRydWUgPT09IHRndCB8fCBmYWxzZSA9PT0gdGd0IDo6XG4gICAgICAgIGN0eC50b2tlbiA9IHRndFxuICAgICAgZWxzZSBpZiBudWxsICE9IHRndCA6OlxuICAgICAgICBjb25zdCB7dG9rZW4sIG1zZ2lkfSA9IHRndFxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnaWQgOjogY3R4Lm1zZ2lkID0gbXNnaWRcbiAgICByZXR1cm4gdGhpc1xuXG4gIHdpdGhSZXBseSgpIDo6XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUgQDogdG9rZW46IHRydWVcblxuICByZXNldCguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcy5fcm9vdF8sIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuICBjbG9uZSguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQHt9XG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cblxuICBhc3NlcnRNb25pdG9yKCkgOjpcbiAgICBpZiAhIHRoaXMuY2hlY2tNb25pdG9yKCkgOjpcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBUYXJnZXQgbW9uaXRvciBleHBpcmVkYFxuICBjaGVja01vbml0b3IoKSA6OiByZXR1cm4gdHJ1ZVxuICBtb25pdG9yKG9wdGlvbnM9e30pIDo6XG4gICAgaWYgdHJ1ZSA9PT0gb3B0aW9ucyB8fCBmYWxzZSA9PT0gb3B0aW9ucyA6OlxuICAgICAgb3B0aW9ucyA9IEB7fSBhY3RpdmU6IG9wdGlvbnNcblxuICAgIGNvbnN0IG1vbml0b3IgPSB0aGlzLmVuZHBvaW50LmluaXRNb25pdG9yKHRoaXMuY3R4LmlkX3RhcmdldClcblxuICAgIGNvbnN0IHRzX2R1cmF0aW9uID0gb3B0aW9ucy50c19kdXJhdGlvbiB8fCA1MDAwXG4gICAgbGV0IHRzX2FjdGl2ZSA9IG9wdGlvbnMudHNfYWN0aXZlXG4gICAgaWYgdHJ1ZSA9PT0gdHNfYWN0aXZlIDo6XG4gICAgICB0c19hY3RpdmUgPSB0c19kdXJhdGlvbi80XG5cbiAgICBsZXQgY2hlY2tNb25pdG9yXG4gICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIGNvbnN0IGRvbmUgPSBvcHRpb25zLnJlamVjdCA/IHJlamVjdCA6IHJlc29sdmVcbiAgICAgIHRoaXMuY2hlY2tNb25pdG9yID0gY2hlY2tNb25pdG9yID0gKCkgPT5cbiAgICAgICAgdHNfZHVyYXRpb24gPiBtb25pdG9yLnRkKClcbiAgICAgICAgICA/IHRydWUgOiAoZG9uZShtb25pdG9yKSwgZmFsc2UpXG5cbiAgICBsZXQgdGlkXG4gICAgY29uc3QgdHNfaW50ZXJ2YWwgPSB0c19hY3RpdmUgfHwgdHNfZHVyYXRpb24vNFxuICAgIGlmIG9wdGlvbnMuYWN0aXZlIHx8IHRzX2FjdGl2ZSA6OlxuICAgICAgY29uc3QgY3RybCA9IHRoaXMuY29kZWMoJ2NvbnRyb2wnKVxuICAgICAgY29uc3QgY2hlY2tQaW5nID0gKCkgPT4gOjpcbiAgICAgICAgaWYgdHNfaW50ZXJ2YWwgPiBtb25pdG9yLnRkKCkgOjpcbiAgICAgICAgICBjdHJsLmludm9rZSgncGluZycpXG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrUGluZywgdHNfaW50ZXJ2YWxcbiAgICBlbHNlIDo6XG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrTW9uaXRvciwgdHNfaW50ZXJ2YWxcbiAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcbiAgICBjb25zdCBjbGVhciA9ICgpID0+IGNsZWFySW50ZXJ2YWwodGlkKVxuXG4gICAgcHJvbWlzZS50aGVuKGNsZWFyLCBjbGVhcilcbiAgICByZXR1cm4gcHJvbWlzZVxuXG5cbiAgY29kZWMobXNnX2NvZGVjLCAuLi5hcmdzKSA6OlxuICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgbXNnX2NvZGVjIDo6XG4gICAgICBtc2dfY29kZWMgPSB0aGlzLl9tc2dDb2RlY3NbbXNnX2NvZGVjXVxuXG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG1zZ19jb2RlYy5zZW5kIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBhY2tldCBjb2RlYyBwcm90b2NvbGBcblxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQDpcbiAgICAgIF9jb2RlYzogQDogdmFsdWU6IG1zZ19jb2RlY1xuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG4gIHN0YXRpYyB3aXRoQ29kZWNzKG1zZ0NvZGVjcykgOjpcbiAgICBmb3IgY29uc3QgW25hbWUsIG1zZ19jb2RlY10gb2YgT2JqZWN0LmVudHJpZXMgQCBtc2dDb2RlY3MgOjpcbiAgICAgIHRoaXMucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSA6OlxuICAgICAgICByZXR1cm4gdGhpcy5jb2RlYyBAIG1zZ19jb2RlY1xuICAgIHRoaXMucHJvdG90eXBlLl9tc2dDb2RlY3MgPSBtc2dDb2RlY3NcbiAgICB0aGlzLnByb3RvdHlwZS5fY29kZWMgPSBtc2dDb2RlY3MuZGVmYXVsdFxuXG4gICAgLy8gYmluZCBzZW5kX2pzb24gYXMgZnJlcXVlbnRseSB1c2VkIGZhc3QtcGF0aFxuICAgIGNvbnN0IGpzb25fc2VuZCA9IG1zZ0NvZGVjcy5qc29uLnNlbmRcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMucHJvdG90eXBlLCBAOlxuICAgICAgZmFzdF9qc29uOiBAe30gZ2V0KCkgOjogcmV0dXJuIEA6XG4gICAgICAgIHNlbmQ6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoanNvbl9zZW5kLCBhcmdzKVxuICAgICAgICBzZW5kUXVlcnk6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoanNvbl9zZW5kLCBhcmdzLCB0cnVlKVxuICAgICAgICBxdWVyeTogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChqc29uX3NlbmQsIGFyZ3MsIHRydWUpLnJlcGx5XG5cbiAgICByZXR1cm4gdGhpc1xuXG5cbiAgd2l0aFJlamVjdFRpbWVvdXQocF9yZXBseSkgOjpcbiAgICByZXR1cm4gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgcF9yZXBseS50aGVuIEAgcmVzb2x2ZSwgcmVqZWN0XG4gICAgICBwX3JlcGx5LnRoZW4gQCBjbGVhciwgY2xlYXJcblxuICAgICAgY29uc3QgdGltZW91dCA9ICgpID0+IHJlamVjdCBAIG5ldyB0aGlzLlJlcGx5VGltZW91dFxuICAgICAgY29uc3QgdGlkID0gc2V0VGltZW91dCh0aW1lb3V0LCB0aGlzLm1zX3RpbWVvdXQpXG4gICAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcblxuICAgICAgZnVuY3Rpb24gY2xlYXIoKSA6OiBjbGVhclRpbWVvdXQgQCB0aWRcblxuXG5jbGFzcyBSZXBseVRpbWVvdXQgZXh0ZW5kcyBFcnJvciA6OlxuXG5PYmplY3QuYXNzaWduIEAgTXNnQ3R4LnByb3RvdHlwZSwgQHt9XG4gIFJlcGx5VGltZW91dCwgbXNfdGltZW91dDogNTAwMFxuICBlcF9kZWNvZGVcblxuIiwiaW1wb3J0IGluaXRfcHJvdG9jb2wgZnJvbSAnLi9wcm90b2NvbC9pbmRleC5qc3knXG5pbXBvcnQge2JpbmRSb3V0ZUNoYW5uZWx9IGZyb20gJy4vY29yZV9pbnRlZ3JhdGlvbi5qc3knXG5pbXBvcnQgRW5kcG9pbnRCYXNlIGZyb20gJy4vZW5kcG9pbnQuanN5J1xuaW1wb3J0IEVQVGFyZ2V0QmFzZSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5pbXBvcnQgU2lua0Jhc2UgZnJvbSAnLi9zaW5rLmpzeSdcbmltcG9ydCBNc2dDdHhCYXNlIGZyb20gJy4vbXNnY3R4LmpzeSdcblxuY29uc3QgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyA9IEA6XG4gIHBsdWdpbl9uYW1lOiAnZW5kcG9pbnQnXG4gIG9uX21zZyh7bXNnLCByZXBseSwgaW5mb30pIDo6XG4gICAgY29uc29sZS53YXJuIEAgJ0VORFBPSU5UIE1TRzonLCBAe30gbXNnLCByZXBseSwgaW5mb1xuICBvbl9lcnJvcihlcCwgZXJyLCBleHRyYSkgOjpcbiAgICBjb25zb2xlLmVycm9yIEAgJ0VORFBPSU5UIEVSUk9SOicsIGVyclxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIC8vIHJldHVybiBmYWxzZSB0byBwcmV2ZW50IGF1dG8tc2h1dGRvd25cbiAgb25fc2h1dGRvd24oZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgLy8gY29uc3Qge21zZywgcGt0fSA9IGV4dHJhXG4gICAgY29uc29sZS5lcnJvciBAIGBFTkRQT0lOVCBTSFVURE9XTjogJHtlcnIubWVzc2FnZX1gXG5cbiAgc3ViY2xhc3MoY2xhc3NlcykgOjpcbiAgICAvL2NvbnN0IHtFbmRwb2ludCwgRVBUYXJnZXQsIFNpbmssIE1zZ0N0eCwgcHJvdG9jb2xzfSA9IGNsYXNzZXNcbiAgICByZXR1cm4gY2xhc3Nlc1xuXG4gIGpzb25fcGFjazogSlNPTi5zdHJpbmdpZnlcbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKSAvLyBMUlVNYXAsIEhhc2hiZWx0TWFwXG4gIGNyZWF0ZVJvdXRlQ2FjaGUoKSA6OiByZXR1cm4gbmV3IE1hcCgpIC8vIExSVU1hcCwgSGFzaGJlbHRNYXBcblxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihwbHVnaW5fb3B0aW9ucykgOjpcbiAgcGx1Z2luX29wdGlvbnMgPSBPYmplY3QuYXNzaWduIEAge30sIGRlZmF1bHRfcGx1Z2luX29wdGlvbnMsIHBsdWdpbl9vcHRpb25zXG4gIGNvbnN0IEB7fVxuICAgIHBsdWdpbl9uYW1lLCByYW5kb21faWQsIGpzb25fcGFja1xuICAgIG9uX21zZzogZGVmYXVsdF9vbl9tc2dcbiAgICBvbl9lcnJvcjogZGVmYXVsdF9vbl9lcnJvclxuICAgIG9uX3NodXRkb3duOiBkZWZhdWx0X29uX3NodXRkb3duXG4gICAgY3JlYXRlTWFwLCBjcmVhdGVSb3V0ZUNhY2hlXG4gID0gcGx1Z2luX29wdGlvbnNcblxuICByZXR1cm4gQDogb3JkZXI6IDEsIHN1YmNsYXNzLCBwb3N0XG4gIFxuICBmdW5jdGlvbiBzdWJjbGFzcyhGYWJyaWNIdWJfUEksIGJhc2VzKSA6OlxuICAgIGNvbnN0IHtwYWNrZXRQYXJzZXJ9ID0gRmFicmljSHViX1BJLnByb3RvdHlwZVxuICAgIGlmIG51bGw9PXBhY2tldFBhcnNlciB8fCAhIHBhY2tldFBhcnNlci5pc1BhY2tldFBhcnNlcigpIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEludmFsaWQgcGFja2V0UGFyc2VyIGZvciBwbHVnaW5gXG4gICAgXG4gICAgRmFicmljSHViX1BJLnByb3RvdHlwZVtwbHVnaW5fbmFtZV0gPVxuICAgICAgYmluZEVuZHBvaW50QXBpIEAgcGFja2V0UGFyc2VyXG5cbiAgZnVuY3Rpb24gcG9zdChodWIpIDo6XG4gICAgcmV0dXJuIGh1YltwbHVnaW5fbmFtZV0gPSBodWJbcGx1Z2luX25hbWVdKGh1YilcblxuICBmdW5jdGlvbiBiaW5kRW5kcG9pbnRBcGkocGFja2V0UGFyc2VyKSA6OlxuICAgIGNvbnN0IHByb3RvY29scyA9IGluaXRfcHJvdG9jb2wgQCBwYWNrZXRQYXJzZXIsIEB7fSByYW5kb21faWQsIGpzb25fcGFja1xuXG4gICAgY29uc3Qge0VuZHBvaW50LCBFUFRhcmdldCwgU2luaywgTXNnQ3R4fSA9XG4gICAgICBwbHVnaW5fb3B0aW9ucy5zdWJjbGFzcyBAOlxuICAgICAgICBwcm90b2NvbHMsXG4gICAgICAgIFNpbms6IFNpbmtCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIE1zZ0N0eDogTXNnQ3R4QmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgICAgICBFbmRwb2ludDogRW5kcG9pbnRCYXNlLnN1YmNsYXNzKHtjcmVhdGVNYXB9KVxuICAgICAgICBFUFRhcmdldDogRVBUYXJnZXRCYXNlLnN1YmNsYXNzKHt9KVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGh1YikgOjpcbiAgICAgIGxldCBfY2xpZW50X3JyY1xuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQDogY3JlYXRlLCBzZXJ2ZXI6IGVuZHBvaW50LCBjbGllbnQsIGNsaWVudEVuZHBvaW50XG5cblxuICAgICAgZnVuY3Rpb24gZW5kcG9pbnQob25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgdGFyZ2V0cyA9IGh1Yi5yb3V0ZXIudGFyZ2V0c1xuICAgICAgICBkbyB2YXIgaWRfdGFyZ2V0ID0gcmFuZG9tX2lkKClcbiAgICAgICAgd2hpbGUgdGFyZ2V0cy5oYXMgQCBpZF90YXJnZXRcbiAgICAgICAgcmV0dXJuIGNyZWF0ZSBAIGlkX3RhcmdldCwgb25faW5pdFxuXG4gICAgICBmdW5jdGlvbiBjcmVhdGUoaWRfdGFyZ2V0LCBvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCBoYW5kbGVycyA9IE9iamVjdC5jcmVhdGUobnVsbClcbiAgICAgICAgY29uc3QgaWQgPSBAe30gaWRfdGFyZ2V0LCBpZF9yb3V0ZXI6IGh1Yi5yb3V0ZXIuaWRfc2VsZlxuICAgICAgICBjb25zdCBlcF90Z3QgPSBuZXcgRVBUYXJnZXQgQCBpZFxuICAgICAgICBjb25zdCBtc2dfY3R4ID0gbmV3IE1zZ0N0eCBAIGVwX3RndCwgYmluZFJvdXRlQ2hhbm5lbChodWIsIGNyZWF0ZVJvdXRlQ2FjaGUodHJ1ZSkpXG4gICAgICAgIGNvbnN0IGVwID0gbmV3IEVuZHBvaW50IEAgaWQsIG1zZ19jdHgsIGVwX3RndFxuXG4gICAgICAgIGNvbnN0IHJlYWR5ID0gUHJvbWlzZVxuICAgICAgICAgIC5yZXNvbHZlIEAgb25faW5pdChlcCwgaHViKVxuICAgICAgICAgIC50aGVuIEAgX2FmdGVyX2luaXRcblxuICAgICAgICByZWFkeS5jYXRjaCBAIGVyciA9PlxuICAgICAgICAgIGhhbmRsZXJzLm9uX2Vycm9yIEAgZXJyLCBAe30gem9uZTonb25fcmVhZHknXG5cbiAgICAgICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgZXBfdGd0LCBAe31cbiAgICAgICAgICByZWFkeTogQHt9IHZhbHVlOiByZWFkeS50aGVuIEAgKCkgPT4gZXBfdGd0XG5cblxuICAgICAgICBmdW5jdGlvbiBfYWZ0ZXJfaW5pdCh0YXJnZXQpIDo6XG4gICAgICAgICAgaWYgbnVsbCA9PSB0YXJnZXQgOjpcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgZW5kcG9pbnQgaW5pdCB0byByZXR1cm4gYSBjbG9zdXJlIG9yIGludGVyZmFjZWBcblxuICAgICAgICAgIGhhbmRsZXJzLm9uX21zZyA9ICh0YXJnZXQub25fbXNnIHx8ICgnZnVuY3Rpb24nID09PSB0eXBlb2YgdGFyZ2V0ID8gdGFyZ2V0IDogZGVmYXVsdF9vbl9tc2cpKS5iaW5kKHRhcmdldClcbiAgICAgICAgICBoYW5kbGVycy5vbl9lcnJvciA9ICh0YXJnZXQub25fZXJyb3IgfHwgZGVmYXVsdF9vbl9lcnJvcikuYmluZCh0YXJnZXQsIGVwKVxuICAgICAgICAgIGhhbmRsZXJzLm9uX3NodXRkb3duID0gKHRhcmdldC5vbl9zaHV0ZG93biB8fCBkZWZhdWx0X29uX3NodXRkb3duKS5iaW5kKHRhcmdldCwgZXApXG5cbiAgICAgICAgICBjb25zdCBqc29uX3VucGFjayA9IHRhcmdldC5qc29uX3VucGFja1xuICAgICAgICAgICAgPyB0YXJnZXQuanNvbl91bnBhY2suYmluZCh0YXJnZXQpXG4gICAgICAgICAgICA6IEVQVGFyZ2V0Lmpzb25VbnBhY2sobXNnX2N0eClcblxuICAgICAgICAgIGNvbnN0IHNpbmsgPSBuZXcgU2luayBAIGpzb25fdW5wYWNrXG4gICAgICAgICAgc2luay5yZWdpc3RlciBAIGVwLCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnNcblxuICAgICAgICAgIHJldHVybiB0YXJnZXQub25fcmVhZHlcbiAgICAgICAgICAgID8gdGFyZ2V0Lm9uX3JlYWR5KGVwLCBodWIpXG4gICAgICAgICAgICA6IHRhcmdldFxuXG5cblxuICAgICAgZnVuY3Rpb24gY2xpZW50RW5kcG9pbnQob25fcmVhZHkpIDo6XG4gICAgICAgIGxldCBlcF90Z3QsIGRvbmUgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICAgICAgZXBfdGd0ID0gZW5kcG9pbnQgQCBlcCA9PiBAOlxuICAgICAgICAgICAgYXN5bmMgb25fcmVhZHkoZXAsIGh1YikgOjpcbiAgICAgICAgICAgICAgcmVzb2x2ZSBAIGF3YWl0IG9uX3JlYWR5KGVwLCBodWIpXG4gICAgICAgICAgICAgIGVwLnNodXRkb3duKClcblxuICAgICAgICAgICAgb25fc2h1dGRvd24oZXApIDo6IHJlamVjdCgpXG4gICAgICAgICAgICBvbl9zZW5kX2Vycm9yKGVwLCBlcnIpIDo6IHJlamVjdChlcnIpXG5cbiAgICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24gQCBlcF90Z3QsIEB7fVxuICAgICAgICAgIHRoZW4oeSxuKSA6OiByZXR1cm4gZG9uZS50aGVuKHksbilcbiAgICAgICAgICBjYXRjaChuKSA6OiByZXR1cm4gZG9uZS5jYXRjaChuKVxuICAgICAgICAgIGRvbmVcblxuXG4gICAgICBmdW5jdGlvbiBjbGllbnQoLi4uYXJncykgOjpcbiAgICAgICAgaWYgMSA9PT0gYXJncy5sZW5ndGggJiYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGFyZ3NbMF0gOjpcbiAgICAgICAgICByZXR1cm4gY2xpZW50RW5kcG9pbnQoYXJnc1swXSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgPT09IF9jbGllbnRfcnJjIDo6XG4gICAgICAgICAgX2NsaWVudF9ycmMgPSBiaW5kUm91dGVDaGFubmVsKGh1YiwgY3JlYXRlUm91dGVDYWNoZShmYWxzZSkpXG5cbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IG5ldyBNc2dDdHggQCBudWxsLCBfY2xpZW50X3JyY1xuICAgICAgICByZXR1cm4gMCAhPT0gYXJncy5sZW5ndGggPyBtc2dfY3R4LnRvKC4uLmFyZ3MpIDogbXNnX2N0eFxuXG4iLCJpbXBvcnQge3JhbmRvbUJ5dGVzfSBmcm9tICdjcnlwdG8nXG5pbXBvcnQgZW5kcG9pbnRfcGx1Z2luIGZyb20gJy4vcGx1Z2luLmpzeSdcblxuZW5kcG9pbnRfbm9kZWpzLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuZnVuY3Rpb24gcmFuZG9tX2lkKCkgOjpcbiAgcmV0dXJuIHJhbmRvbUJ5dGVzKDQpLnJlYWRJbnQzMkxFKClcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gZW5kcG9pbnRfbm9kZWpzKHBsdWdpbl9vcHRpb25zPXt9KSA6OlxuICBpZiBudWxsID09IHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA6OlxuICAgIHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuXG4gIHJldHVybiBlbmRwb2ludF9wbHVnaW4ocGx1Z2luX29wdGlvbnMpXG5cbiIsImltcG9ydCBlbmRwb2ludF9wbHVnaW4gZnJvbSAnLi9wbHVnaW4uanN5J1xuXG5jb25zdCBnZXRSYW5kb21WYWx1ZXMgPSAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIHdpbmRvd1xuICA/IHdpbmRvdy5jcnlwdG8uZ2V0UmFuZG9tVmFsdWVzIDogbnVsbFxuXG5lbmRwb2ludF9icm93c2VyLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuZnVuY3Rpb24gcmFuZG9tX2lkKCkgOjpcbiAgY29uc3QgYXJyID0gbmV3IEludDMyQXJyYXkoMSlcbiAgZ2V0UmFuZG9tVmFsdWVzKGFycilcbiAgcmV0dXJuIGFyclswXVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBlbmRwb2ludF9icm93c2VyKHBsdWdpbl9vcHRpb25zPXt9KSA6OlxuICBpZiBudWxsID09IHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA6OlxuICAgIHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuXG4gIHJldHVybiBlbmRwb2ludF9wbHVnaW4ocGx1Z2luX29wdGlvbnMpXG5cbiJdLCJuYW1lcyI6WyJsaXR0bGVfZW5kaWFuIiwiY19zaW5nbGUiLCJjX2RhdGFncmFtIiwiY19kaXJlY3QiLCJjX211bHRpcGFydCIsImNfc3RyZWFtaW5nIiwiX2Vycl9tc2dpZF9yZXF1aXJlZCIsIl9lcnJfdG9rZW5fcmVxdWlyZWQiLCJmcm1fcm91dGluZyIsInNpemUiLCJiaXRzIiwibWFzayIsIm9iaiIsImZyb21faWQiLCJkdiIsIm9mZnNldCIsInNldEludDMyIiwiaWRfcm91dGVyIiwiaWRfdGFyZ2V0IiwidW5kZWZpbmVkIiwiZ2V0SW50MzIiLCJmcm1fcmVzcG9uc2UiLCJtc2dpZCIsIkVycm9yIiwic2V0SW50MTYiLCJzZXFfYWNrIiwiYWNrX2ZsYWdzIiwidG9rZW4iLCJnZXRJbnQxNiIsImZybV9kYXRhZ3JhbSIsInRyYW5zcG9ydCIsImZybV9kaXJlY3QiLCJmcm1fbXVsdGlwYXJ0Iiwic2VxX3BvcyIsInNlcSIsInNlcV9mbGFncyIsImZybV9zdHJlYW1pbmciLCJiaW5kX3NlcV9uZXh0Iiwic2VxX29mZnNldCIsInNlcV9uZXh0IiwiZmxhZ3MiLCJmaW4iLCJOYU4iLCJjb21wb3NlRnJhbWluZ3MiLCJmcm1fZnJvbSIsImZybV9yZXNwIiwiZnJtX3RyYW5zcG9ydHMiLCJsZW5ndGgiLCJieUJpdHMiLCJ0X2Zyb20iLCJmX3Rlc3QiLCJ0X3Jlc3AiLCJ0MCIsInQxIiwidDIiLCJ0MyIsIm1hcCIsImYiLCJ0ZXN0Qml0cyIsImNob29zZSIsImxzdCIsIlQiLCJiIiwib3AiLCJmbl9rZXkiLCJmbl90cmFuIiwiZm5fZnJvbSIsImZuX3Jlc3AiLCJmcm0iLCJiaW5kQXNzZW1ibGVkIiwiZl9wYWNrIiwiZl91bnBhY2siLCJwYWNrIiwidW5wYWNrIiwicGt0X3R5cGUiLCJwa3Rfb2JqIiwiVHlwZUVycm9yIiwidHlwZSIsIkRhdGFWaWV3IiwiQXJyYXlCdWZmZXIiLCJoZWFkZXIiLCJidWZmZXIiLCJzbGljZSIsInBrdCIsImJ1ZiIsImhlYWRlcl9idWZmZXIiLCJVaW50OEFycmF5IiwiaW5mbyIsIl9iaW5kX2l0ZXJhYmxlIiwiYnVmX2Nsb25lIiwidHRsIiwibmV4dCIsIm9wdGlvbnMiLCJkb25lIiwidmFsdWUiLCJwYWNrZXRQYXJzZXIiLCJmcmFnbWVudF9zaXplIiwiY29uY2F0QnVmZmVycyIsInBhY2tQYWNrZXRPYmoiLCJwYWNrX3V0ZjgiLCJ1bnBhY2tfdXRmOCIsIk51bWJlciIsInJhbmRvbV9pZCIsImpzb25fcGFjayIsImNyZWF0ZVN0cmVhbSIsInBhY2tldEZyYWdtZW50cyIsImNyZWF0ZU11bHRpcGFydCIsInNpbmsiLCJwYXJ0cyIsImZlZWQiLCJib2R5X2J1ZmZlciIsImluY2x1ZGVzIiwiZGVsZXRlU3RhdGVGb3IiLCJyZXMiLCJyZWN2RGF0YSIsInJzdHJlYW0iLCJzdGF0ZSIsImZlZWRfaW5pdCIsImFzX2NvbnRlbnQiLCJmZWVkX2lnbm9yZSIsIm1zZyIsImpzb25fdW5wYWNrIiwiYm9keV91dGY4IiwicmVjdlN0cmVhbSIsInJlY3ZTdHJlYW1EYXRhIiwiYmluZCIsImVyciIsIm9uX2Vycm9yIiwiZmVlZF9ib2R5Iiwib25faW5pdCIsImRhdGEiLCJvbl9kYXRhIiwib25fZW5kIiwiZmVlZF9zZXEiLCJuZXh0X2hkciIsImkiLCJsYXN0SW5uZXIiLCJieXRlTGVuZ3RoIiwiaTAiLCJib2R5IiwiYmluZFRyYW5zcG9ydEltcGxzIiwiaW5ib3VuZCIsImhpZ2hiaXRzIiwidHJhbnNwb3J0cyIsIm91dGJvdW5kIiwiZnJhbWluZ3MiLCJmcmFtZSIsImltcGwiLCJ0X3JlY3YiLCJwYWNrX2hkciIsInJlY3ZfbXNnIiwicHJvY2VzcyIsImVudiIsIk5PREVfRU5WIiwiZGVmaW5lUHJvcGVydHkiLCJiaW5kVHJhbnNwb3J0cyIsInBhY2tCb2R5Iiwic3RyZWFtaW5nIiwic2VuZCIsInN0cmVhbSIsImJpbmRfc3RyZWFtIiwibW9kZSIsImNoYW4iLCJtc2VuZCIsIm1zZW5kX2J5dGVzIiwibXNlbmRfb2JqZWN0cyIsIm1zZW5kX2ltcGwiLCJvYmplY3QiLCJieXRlcyIsIndyaXRlIiwiZW5kIiwiY2h1bmsiLCJjaGVja19mbnMiLCJrZXlzIiwia2V5IiwianNvbl9wcm90b2NvbCIsInNoYXJlZCIsImRhdGFncmFtIiwiZGlyZWN0IiwicmVjdk1zZyIsInN0YXRlRm9yIiwiYm9keV9idWYiLCJ1bnBhY2tCb2R5IiwiYmluYXJ5X3Byb3RvY29sIiwiYXNCdWZmZXIiLCJwa3RfYnVmZmVyIiwiY29udHJvbF9wcm90b2NvbCIsImhpZ2giLCJwaW5nX2ZyYW1lIiwicG9uZ19mcmFtZSIsInBvbmdfdHlwZSIsInJlY3ZfcG9uZyIsInBpbmdfdHlwZSIsInJlY3ZfcGluZyIsInBpbmciLCJKU09OIiwic3RyaW5naWZ5IiwidHMwIiwiRGF0ZSIsInJvdXRlciIsImJvZHlfanNvbiIsInJlY3ZDdHJsIiwiX3NlbmRfcG9uZyIsInBrdF9waW5nIiwicl9pZCIsInRzMSIsImRpc3BhdGNoIiwiaW5pdF9wcm90b2NvbCIsInNoYXJlZF9wcm90byIsImpzb24iLCJqc29uX3Byb3RvIiwiYmluYXJ5IiwiYmluYXJ5X3Byb3RvIiwiY29udHJvbCIsImNvbnRyb2xfcHJvdG8iLCJjb2RlY3MiLCJkZWZhdWx0IiwiU2luayIsImZvclByb3RvY29scyIsInByb3RvdHlwZSIsIl9wcm90b2NvbCIsImVuZHBvaW50IiwiaHViIiwiaGFuZGxlcnMiLCJ1bnJlZ2lzdGVyIiwidW5yZWdpc3RlclRhcmdldCIsInJlZ2lzdGVyVGFyZ2V0IiwiX2JpbmREaXNwYXRjaCIsIm9uX21zZyIsIm9uX3NodXRkb3duIiwiYWxpdmUiLCJwcm90b2NvbCIsImlzQWxpdmUiLCJzaHV0ZG93biIsImV4dHJhIiwiYXNzaWduIiwiYmluZFNpbmsiLCJ6b25lIiwidGVybWluYXRlIiwiaWZBYnNlbnQiLCJlbnRyeSIsImJ5X21zZ2lkIiwiZ2V0Iiwic2V0IiwiZGVsZXRlIiwiYmluZFJvdXRlQ2hhbm5lbCIsImNhY2hlIiwiY2hhbm5lbCIsImNvbm5lY3Rfc2VsZiIsInJlc29sdmVSb3V0ZSIsInJvdXRlcyIsImNhY2hlUm91dGVDaGFubmVsIiwicmVzb2x2ZVJvdXRlQ2hhbm5lbCIsInJvdXRlIiwiZGlzY28iLCJoYXMiLCJFbmRwb2ludCIsInN1YmNsYXNzIiwiZXh0ZW5zaW9ucyIsImlkIiwiZW5jb2RlIiwibXNnX2N0eCIsImVwX3RndCIsIndpdGhFbmRwb2ludCIsImFzU2VuZGVyIiwiY29uc3RydWN0b3IiLCJqc29uX2FzX3NlbmRlciIsImRlZmluZVByb3BlcnRpZXMiLCJlbnVtZXJhYmxlIiwidG8iLCJNYXAiLCJjcmVhdGVNYXAiLCJieV90b2tlbiIsImNyZWF0ZVJlcGx5TWFwIiwiYnlfdHJhZmZpYyIsImNyZWF0ZVRyYWZmaWNNYXAiLCJ0cmFmZmljIiwidHMiLCJub3ciLCJ0IiwicmVjdlRyYWZmaWMiLCJjcmVhdGVTdGF0ZU1hcCIsInJlcGx5Iiwicm1zZyIsInJlc29sdmUiLCJ0aGVuIiwiaXNfcmVwbHkiLCJzZW5kZXIiLCJ3YXJuIiwiaW5pdFJlcGx5IiwicF9zZW50IiwiaW5pdFJlcGx5UHJvbWlzZSIsIm1vbml0b3IiLCJQcm9taXNlIiwicmVqZWN0IiwiY2F0Y2giLCJ3aXRoUmVqZWN0VGltZW91dCIsImNsZWFyIiwiRVBUYXJnZXQiLCJtc2dfaW5mbyIsInByb3BzIiwic2ltcGxlIiwiZXBfZW5jb2RlIiwiZmFzdF9qc29uIiwiT2JqZWN0IiwiZnJvbV9qc29uIiwianNvblVucGFjayIsInhmb3JtQnlLZXkiLCJjcmVhdGUiLCJ2IiwiZXBfZGVjb2RlIiwianNvblVucGFja0J5S2V5IiwicmVnIiwiV2Vha01hcCIsInN6IiwicGFyc2UiLCJyZXZpdmVyIiwieGZuIiwidmZuIiwiYmluZEN0eFByb3BzIiwiaW5pdCIsImN0eCIsInF1ZXJ5IiwicmVwbHlFeHBlY3RlZCIsInIiLCJ0b1N0cmluZyIsInNwbGl0IiwicGFyc2VJbnQiLCJNc2dDdHgiLCJ3aXRoQ29kZWNzIiwiZnJlZXplIiwiX2ludm9rZV9leCIsIl9tc2dDb2RlY3MiLCJhcmdzIiwiX2NvZGVjIiwiZm5PcktleSIsImludm9rZSIsImFzc2VydE1vbml0b3IiLCJ0Z3QiLCJzZWxmIiwiY2xvbmUiLCJyZXBseV9pZCIsIndpdGgiLCJfcm9vdF8iLCJjaGVja01vbml0b3IiLCJhY3RpdmUiLCJpbml0TW9uaXRvciIsInRzX2R1cmF0aW9uIiwidHNfYWN0aXZlIiwicHJvbWlzZSIsInRkIiwidGlkIiwidHNfaW50ZXJ2YWwiLCJjdHJsIiwiY29kZWMiLCJjaGVja1BpbmciLCJzZXRJbnRlcnZhbCIsInVucmVmIiwiY2xlYXJJbnRlcnZhbCIsIm1zZ19jb2RlYyIsIm1zZ0NvZGVjcyIsIm5hbWUiLCJlbnRyaWVzIiwianNvbl9zZW5kIiwicF9yZXBseSIsInRpbWVvdXQiLCJSZXBseVRpbWVvdXQiLCJzZXRUaW1lb3V0IiwibXNfdGltZW91dCIsImRlZmF1bHRfcGx1Z2luX29wdGlvbnMiLCJlcCIsImVycm9yIiwibWVzc2FnZSIsImNsYXNzZXMiLCJjcmVhdGVSb3V0ZUNhY2hlIiwicGx1Z2luX29wdGlvbnMiLCJkZWZhdWx0X29uX21zZyIsImRlZmF1bHRfb25fZXJyb3IiLCJkZWZhdWx0X29uX3NodXRkb3duIiwib3JkZXIiLCJwb3N0IiwiRmFicmljSHViX1BJIiwiYmFzZXMiLCJpc1BhY2tldFBhcnNlciIsInBsdWdpbl9uYW1lIiwiYmluZEVuZHBvaW50QXBpIiwicHJvdG9jb2xzIiwiU2lua0Jhc2UiLCJNc2dDdHhCYXNlIiwiRW5kcG9pbnRCYXNlIiwiRVBUYXJnZXRCYXNlIiwiX2NsaWVudF9ycmMiLCJzZXJ2ZXIiLCJjbGllbnQiLCJjbGllbnRFbmRwb2ludCIsInRhcmdldHMiLCJpZF9zZWxmIiwicmVhZHkiLCJfYWZ0ZXJfaW5pdCIsInRhcmdldCIsInJlZ2lzdGVyIiwib25fcmVhZHkiLCJ5IiwibiIsImVuZHBvaW50X25vZGVqcyIsInJhbmRvbUJ5dGVzIiwicmVhZEludDMyTEUiLCJlbmRwb2ludF9wbHVnaW4iLCJnZXRSYW5kb21WYWx1ZXMiLCJ3aW5kb3ciLCJjcnlwdG8iLCJlbmRwb2ludF9icm93c2VyIiwiYXJyIiwiSW50MzJBcnJheSJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsTUFBTUEsZ0JBQWdCLElBQXRCO0FBQ0EsTUFB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

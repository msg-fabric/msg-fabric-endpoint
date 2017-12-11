'use strict';

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

module.exports = endpoint_nodejs;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZWpzLmpzIiwic291cmNlcyI6WyIuLi9jb2RlL3Byb3RvY29sL2ZyYW1pbmcuanN5IiwiLi4vY29kZS9wcm90b2NvbC9zaGFyZWQuanN5IiwiLi4vY29kZS9wcm90b2NvbC9qc29uLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvYmluYXJ5LmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvY29udHJvbC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2luZGV4LmpzeSIsIi4uL2NvZGUvY29yZV9pbnRlZ3JhdGlvbi5qc3kiLCIuLi9jb2RlL2VuZHBvaW50LmpzeSIsIi4uL2NvZGUvZXBfdGFyZ2V0LmpzeSIsIi4uL2NvZGUvc2luay5qc3kiLCIuLi9jb2RlL21zZ2N0eC5qc3kiLCIuLi9jb2RlL3BsdWdpbi5qc3kiLCIuLi9jb2RlL2luZGV4Lm5vZGVqcy5qc3kiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgbGl0dGxlX2VuZGlhbiA9IHRydWVcbmNvbnN0IGNfc2luZ2xlID0gJ3NpbmdsZSdcbmNvbnN0IGNfZGF0YWdyYW0gPSAnZGF0YWdyYW0nXG5jb25zdCBjX2RpcmVjdCA9ICdkaXJlY3QnXG5jb25zdCBjX211bHRpcGFydCA9ICdtdWx0aXBhcnQnXG5jb25zdCBjX3N0cmVhbWluZyA9ICdzdHJlYW1pbmcnXG5cbmNvbnN0IF9lcnJfbXNnaWRfcmVxdWlyZWQgPSBgUmVzcG9uc2UgcmVxaXJlcyAnbXNnaWQnYFxuY29uc3QgX2Vycl90b2tlbl9yZXF1aXJlZCA9IGBUcmFuc3BvcnQgcmVxaXJlcyAndG9rZW4nYFxuXG5cbmZ1bmN0aW9uIGZybV9yb3V0aW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDEsIG1hc2sgPSAweDFcbiAgcmV0dXJuIEB7fVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBudWxsICE9IG9iai5mcm9tX2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgY29uc3Qge2Zyb21faWR9ID0gb2JqXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCAwfGZyb21faWQuaWRfcm91dGVyLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQzMiBAIDQrb2Zmc2V0LCAwfGZyb21faWQuaWRfdGFyZ2V0LCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCBmcm9tX2lkID0gdW5kZWZpbmVkID09PSBvYmouZnJvbV9pZFxuICAgICAgICA/IG9iai5mcm9tX2lkID0ge30gOiBvYmouZnJvbV9pZFxuICAgICAgZnJvbV9pZC5pZF9yb3V0ZXIgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBmcm9tX2lkLmlkX3RhcmdldCA9IGR2LmdldEludDMyIEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuZnVuY3Rpb24gZnJtX3Jlc3BvbnNlKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDIsIG1hc2sgPSAweDJcbiAgcmV0dXJuIEB7fVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBudWxsICE9IG9iai5tc2dpZCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLm1zZ2lkIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfbXNnaWRfcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai5tc2dpZCwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxX2FjaywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouYWNrX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudG9rZW4gPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2FjayA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5hY2tfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG5cblxuXG5mdW5jdGlvbiBmcm1fZGF0YWdyYW0oKSA6OlxuICBjb25zdCBzaXplID0gMCwgYml0cyA9IDB4MCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19kYXRhZ3JhbVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6XG4gICAgICBpZiBjX2RhdGFncmFtID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEgb2JqLnRva2VuID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGF0YWdyYW1cblxuZnVuY3Rpb24gZnJtX2RpcmVjdCgpIDo6XG4gIGNvbnN0IHNpemUgPSA0LCBiaXRzID0gMHg0LCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RpcmVjdFxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6XG4gICAgICBpZiBjX2RpcmVjdCA9PT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gYml0c1xuICAgICAgaWYgb2JqLnRyYW5zcG9ydCAmJiBjX3NpbmdsZSAhPT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gZmFsc2VcbiAgICAgIHJldHVybiAhISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX2RpcmVjdFxuXG5mdW5jdGlvbiBmcm1fbXVsdGlwYXJ0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDgsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfbXVsdGlwYXJ0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfbXVsdGlwYXJ0ID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6IC8vIHVzZSBzZXFfbmV4dFxuICAgICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwLCBsaXR0bGVfZW5kaWFuXG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19tdWx0aXBhcnRcblxuZnVuY3Rpb24gZnJtX3N0cmVhbWluZygpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHhjLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX3N0cmVhbWluZ1xuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBjX3N0cmVhbWluZyA9PT0gb2JqLnRyYW5zcG9ydCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgYmluZF9zZXFfbmV4dCwgc2VxX3BvczogNFxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cbiAgICAgIGlmIHRydWUgPT0gb2JqLnNlcSA6OlxuICAgICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwLCBsaXR0bGVfZW5kaWFuIC8vIHVzZSBzZXFfbmV4dFxuICAgICAgZWxzZSBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLnNlcV9mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkICAgICA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXEgICAgICAgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfc3RyZWFtaW5nXG5cblxuZnVuY3Rpb24gYmluZF9zZXFfbmV4dChvZmZzZXQpIDo6XG4gIGNvbnN0IHNlcV9vZmZzZXQgPSB0aGlzLnNlcV9wb3MgKyBvZmZzZXRcbiAgbGV0IHNlcSA9IDFcbiAgcmV0dXJuIGZ1bmN0aW9uIHNlcV9uZXh0KHtmbGFncywgZmlufSwgZHYpIDo6XG4gICAgaWYgISBmaW4gOjpcbiAgICAgIGR2LnNldEludDE2IEAgc2VxX29mZnNldCwgc2VxKyssIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgZWxzZSA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCAtc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDIrc2VxX29mZnNldCwgMHxmbGFncywgbGl0dGxlX2VuZGlhblxuICAgICAgc2VxID0gTmFOXG5cblxuXG5leHBvcnQgZGVmYXVsdCBjb21wb3NlRnJhbWluZ3MoKVxuZnVuY3Rpb24gY29tcG9zZUZyYW1pbmdzKCkgOjpcbiAgY29uc3QgZnJtX2Zyb20gPSBmcm1fcm91dGluZygpLCBmcm1fcmVzcCA9IGZybV9yZXNwb25zZSgpXG4gIGNvbnN0IGZybV90cmFuc3BvcnRzID0gQFtdIGZybV9kYXRhZ3JhbSgpLCBmcm1fZGlyZWN0KCksIGZybV9tdWx0aXBhcnQoKSwgZnJtX3N0cmVhbWluZygpXG5cbiAgaWYgOCAhPT0gZnJtX2Zyb20uc2l6ZSB8fCA4ICE9PSBmcm1fcmVzcC5zaXplIHx8IDQgIT0gZnJtX3RyYW5zcG9ydHMubGVuZ3RoIDo6XG4gICAgdGhyb3cgbmV3IEVycm9yIEAgYEZyYW1pbmcgU2l6ZSBjaGFuZ2VgXG5cbiAgY29uc3QgYnlCaXRzID0gW10sIG1hc2s9MHhmXG5cbiAgOjpcbiAgICBjb25zdCB0X2Zyb20gPSBmcm1fZnJvbS5mX3Rlc3QsIHRfcmVzcCA9IGZybV9yZXNwLmZfdGVzdFxuICAgIGNvbnN0IFt0MCx0MSx0Mix0M10gPSBmcm1fdHJhbnNwb3J0cy5tYXAgQCBmPT5mLmZfdGVzdFxuXG4gICAgY29uc3QgdGVzdEJpdHMgPSBieUJpdHMudGVzdEJpdHMgPSBvYmogPT5cbiAgICAgIDAgfCB0X2Zyb20ob2JqKSB8IHRfcmVzcChvYmopIHwgdDAob2JqKSB8IHQxKG9iaikgfCB0MihvYmopIHwgdDMob2JqKVxuXG4gICAgYnlCaXRzLmNob29zZSA9IGZ1bmN0aW9uIChvYmosIGxzdCkgOjpcbiAgICAgIGlmIG51bGwgPT0gbHN0IDo6IGxzdCA9IHRoaXMgfHwgYnlCaXRzXG4gICAgICByZXR1cm4gbHN0W3Rlc3RCaXRzKG9iaildXG5cblxuICBmb3IgY29uc3QgVCBvZiBmcm1fdHJhbnNwb3J0cyA6OlxuICAgIGNvbnN0IHtiaXRzOmIsIHNpemUsIHRyYW5zcG9ydH0gPSBUXG5cbiAgICBieUJpdHNbYnwwXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MCwgbWFzaywgc2l6ZTogc2l6ZSwgb3A6ICcnXG4gICAgYnlCaXRzW2J8MV0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDEsIG1hc2ssIHNpemU6IDggKyBzaXplLCBvcDogJ2YnXG4gICAgYnlCaXRzW2J8Ml0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDIsIG1hc2ssIHNpemU6IDggKyBzaXplLCBvcDogJ3InXG4gICAgYnlCaXRzW2J8M10gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDMsIG1hc2ssIHNpemU6IDE2ICsgc2l6ZSwgb3A6ICdmcidcblxuICAgIGZvciBjb25zdCBmbl9rZXkgb2YgWydmX3BhY2snLCAnZl91bnBhY2snXSA6OlxuICAgICAgY29uc3QgZm5fdHJhbiA9IFRbZm5fa2V5XSwgZm5fZnJvbSA9IGZybV9mcm9tW2ZuX2tleV0sIGZuX3Jlc3AgPSBmcm1fcmVzcFtmbl9rZXldXG5cbiAgICAgIGJ5Qml0c1tifDBdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl90cmFuKG9iaiwgZHYsIDApXG4gICAgICBieUJpdHNbYnwxXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fZnJvbShvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8Ml1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3Jlc3Aob2JqLCBkdiwgMCk7IGZuX3RyYW4ob2JqLCBkdiwgOClcbiAgICAgIGJ5Qml0c1tifDNdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl9yZXNwKG9iaiwgZHYsIDgpOyBmbl90cmFuKG9iaiwgZHYsIDE2KVxuXG4gIGZvciBjb25zdCBmcm0gb2YgYnlCaXRzIDo6XG4gICAgYmluZEFzc2VtYmxlZCBAIGZybVxuXG4gIHJldHVybiBieUJpdHNcblxuXG5mdW5jdGlvbiBiaW5kQXNzZW1ibGVkKGZybSkgOjpcbiAgY29uc3Qge1QsIHNpemUsIGZfcGFjaywgZl91bnBhY2t9ID0gZnJtXG4gIGlmIFQuYmluZF9zZXFfbmV4dCA6OlxuICAgIGZybS5zZXFfbmV4dCA9IFQuYmluZF9zZXFfbmV4dCBAIGZybS5zaXplIC0gVC5zaXplXG5cbiAgZGVsZXRlIGZybS5UXG4gIGZybS5wYWNrID0gcGFjayA7IGZybS51bnBhY2sgPSB1bnBhY2tcbiAgY29uc3Qgc2VxX25leHQgPSBmcm0uc2VxX25leHRcblxuICBmdW5jdGlvbiBwYWNrKHBrdF90eXBlLCBwa3Rfb2JqKSA6OlxuICAgIGlmICEgQCAwIDw9IHBrdF90eXBlICYmIHBrdF90eXBlIDw9IDI1NSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwa3RfdHlwZSB0byBiZSBbMC4uMjU1XWBcblxuICAgIHBrdF9vYmoudHlwZSA9IHBrdF90eXBlXG4gICAgaWYgc2VxX25leHQgJiYgbnVsbCA9PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgcGt0X29iai5zZXEgPSB0cnVlXG5cbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyBAIG5ldyBBcnJheUJ1ZmZlcihzaXplKVxuICAgIGZfcGFjayhwa3Rfb2JqLCBkdiwgMClcbiAgICBwa3Rfb2JqLmhlYWRlciA9IGR2LmJ1ZmZlclxuXG4gICAgaWYgdHJ1ZSA9PT0gcGt0X29iai5zZXEgOjpcbiAgICAgIF9iaW5kX2l0ZXJhYmxlIEAgcGt0X29iaiwgZHYuYnVmZmVyLnNsaWNlKDAsc2l6ZSlcblxuICBmdW5jdGlvbiB1bnBhY2socGt0KSA6OlxuICAgIGNvbnN0IGJ1ZiA9IHBrdC5oZWFkZXJfYnVmZmVyKClcbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyBAIG5ldyBVaW50OEFycmF5KGJ1ZikuYnVmZmVyXG5cbiAgICBjb25zdCBpbmZvID0ge31cbiAgICBmX3VucGFjayhpbmZvLCBkdiwgMClcbiAgICByZXR1cm4gcGt0LmluZm8gPSBpbmZvXG5cbiAgZnVuY3Rpb24gX2JpbmRfaXRlcmFibGUocGt0X29iaiwgYnVmX2Nsb25lKSA6OlxuICAgIGNvbnN0IHt0eXBlfSA9IHBrdF9vYmpcbiAgICBjb25zdCB7aWRfcm91dGVyLCBpZF90YXJnZXQsIHR0bCwgdG9rZW59ID0gcGt0X29ialxuICAgIHBrdF9vYmoubmV4dCA9IG5leHRcblxuICAgIGZ1bmN0aW9uIG5leHQob3B0aW9ucykgOjpcbiAgICAgIGlmIG51bGwgPT0gb3B0aW9ucyA6OiBvcHRpb25zID0ge31cbiAgICAgIGNvbnN0IGhlYWRlciA9IGJ1Zl9jbG9uZS5zbGljZSgpXG4gICAgICBzZXFfbmV4dCBAIG9wdGlvbnMsIG5ldyBEYXRhVmlldyBAIGhlYWRlclxuICAgICAgcmV0dXJuIEB7fSBkb25lOiAhISBvcHRpb25zLmZpbiwgdmFsdWU6IEB7fSAvLyBwa3Rfb2JqXG4gICAgICAgIGlkX3JvdXRlciwgaWRfdGFyZ2V0LCB0eXBlLCB0dGwsIHRva2VuLCBoZWFkZXJcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBhY2tldFBhcnNlciwgb3B0aW9ucywgZnJhZ21lbnRfc2l6ZSkgOjpcbiAgY29uc3Qge2NvbmNhdEJ1ZmZlcnMsIHBhY2tQYWNrZXRPYmosIHBhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gcGFja2V0UGFyc2VyXG4gIGZyYWdtZW50X3NpemUgPSBOdW1iZXIoZnJhZ21lbnRfc2l6ZSB8fCA4MDAwKVxuICBpZiAxMDI0ID4gZnJhZ21lbnRfc2l6ZSB8fCA2NTAwMCA8IGZyYWdtZW50X3NpemUgOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgSW52YWxpZCBmcmFnbWVudCBzaXplOiAke2ZyYWdtZW50X3NpemV9YFxuXG4gIGNvbnN0IHtyYW5kb21faWQsIGpzb25fcGFja30gPSBvcHRpb25zXG4gIHJldHVybiBAOiBwYWNrZXRQYXJzZXIsIHJhbmRvbV9pZCwganNvbl9wYWNrXG4gICAgY3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIHBhY2tldEZyYWdtZW50c1xuICAgIGJpbmRUcmFuc3BvcnRzXG5cblxuICBmdW5jdGlvbiBjcmVhdGVNdWx0aXBhcnQocGt0LCBzaW5rLCBtc2dpZCkgOjpcbiAgICBsZXQgcGFydHMgPSBbXSwgZmluID0gZmFsc2VcbiAgICByZXR1cm4gQHt9IGZlZWQsIGluZm86IHBrdC5pbmZvXG5cbiAgICBmdW5jdGlvbiBmZWVkKHBrdCkgOjpcbiAgICAgIGxldCBzZXEgPSBwa3QuaW5mby5zZXFcbiAgICAgIGlmIHNlcSA8IDAgOjogZmluID0gdHJ1ZTsgc2VxID0gLXNlcVxuICAgICAgcGFydHNbc2VxLTFdID0gcGt0LmJvZHlfYnVmZmVyKClcblxuICAgICAgaWYgISBmaW4gOjogcmV0dXJuXG4gICAgICBpZiBwYXJ0cy5pbmNsdWRlcyBAIHVuZGVmaW5lZCA6OiByZXR1cm5cblxuICAgICAgc2luay5kZWxldGVTdGF0ZUZvcihtc2dpZClcblxuICAgICAgY29uc3QgcmVzID0gY29uY2F0QnVmZmVycyhwYXJ0cylcbiAgICAgIHBhcnRzID0gbnVsbFxuICAgICAgcmV0dXJuIHJlc1xuXG4gIGZ1bmN0aW9uIGNyZWF0ZVN0cmVhbShwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBuZXh0PTAsIGZpbiA9IGZhbHNlLCByZWN2RGF0YSwgcnN0cmVhbVxuICAgIGNvbnN0IHN0YXRlID0gQHt9IGZlZWQ6IGZlZWRfaW5pdCwgaW5mbzogcGt0LmluZm9cbiAgICByZXR1cm4gc3RhdGVcblxuICAgIGZ1bmN0aW9uIGZlZWRfaW5pdChwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcblxuICAgICAgY29uc3QgaW5mbyA9IHBrdC5pbmZvXG4gICAgICBjb25zdCBtc2cgPSBzaW5rLmpzb25fdW5wYWNrIEAgcGt0LmJvZHlfdXRmOCgpXG4gICAgICByc3RyZWFtID0gc2luay5yZWN2U3RyZWFtKG1zZywgaW5mbylcbiAgICAgIGlmIG51bGwgPT0gcnN0cmVhbSA6OiByZXR1cm5cbiAgICAgIGNoZWNrX2ZucyBAIHJzdHJlYW0sICdvbl9lcnJvcicsICdvbl9kYXRhJywgJ29uX2VuZCcgXG4gICAgICByZWN2RGF0YSA9IHNpbmsucmVjdlN0cmVhbURhdGEuYmluZChzaW5rLCByc3RyZWFtLCBpbmZvKVxuXG4gICAgICB0cnkgOjpcbiAgICAgICAgZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfYm9keVxuICAgICAgaWYgcnN0cmVhbS5vbl9pbml0IDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2luaXQobXNnLCBwa3QpXG5cbiAgICBmdW5jdGlvbiBmZWVkX2JvZHkocGt0LCBhc19jb250ZW50KSA6OlxuICAgICAgcmVjdkRhdGEoKVxuICAgICAgbGV0IGRhdGFcbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICAgIGRhdGEgPSBhc19jb250ZW50KHBrdCwgc2luaylcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lcnJvciBAIGVyciwgcGt0XG5cbiAgICAgIGlmIGZpbiA6OlxuICAgICAgICBjb25zdCByZXMgPSByc3RyZWFtLm9uX2RhdGEgQCBkYXRhLCBwa3RcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZW5kIEAgcmVzLCBwa3RcbiAgICAgIGVsc2UgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuXG4gICAgZnVuY3Rpb24gZmVlZF9pZ25vcmUocGt0KSA6OlxuICAgICAgdHJ5IDo6IGZlZWRfc2VxKHBrdClcbiAgICAgIGNhdGNoIGVyciA6OlxuXG4gICAgZnVuY3Rpb24gZmVlZF9zZXEocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxID49IDAgOjpcbiAgICAgICAgaWYgbmV4dCsrID09PSBzZXEgOjpcbiAgICAgICAgICByZXR1cm4gLy8gaW4gb3JkZXJcbiAgICAgIGVsc2UgOjpcbiAgICAgICAgZmluID0gdHJ1ZVxuICAgICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuICAgICAgICBpZiBuZXh0ID09PSAtc2VxIDo6XG4gICAgICAgICAgbmV4dCA9ICdkb25lJ1xuICAgICAgICAgIHJldHVybiAvLyBpbi1vcmRlciwgbGFzdCBwYWNrZXRcblxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfaWdub3JlXG4gICAgICBuZXh0ID0gJ2ludmFsaWQnXG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgUGFja2V0IG91dCBvZiBzZXF1ZW5jZWBcblxuICBmdW5jdGlvbiAqIHBhY2tldEZyYWdtZW50cyhidWYsIG5leHRfaGRyLCBmaW4pIDo6XG4gICAgaWYgbnVsbCA9PSBidWYgOjpcbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKHtmaW59KVxuICAgICAgeWllbGQgb2JqXG4gICAgICByZXR1cm5cblxuICAgIGxldCBpID0gMCwgbGFzdElubmVyID0gYnVmLmJ5dGVMZW5ndGggLSBmcmFnbWVudF9zaXplO1xuICAgIHdoaWxlIGkgPCBsYXN0SW5uZXIgOjpcbiAgICAgIGNvbnN0IGkwID0gaVxuICAgICAgaSArPSBmcmFnbWVudF9zaXplXG5cbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKClcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkwLCBpKVxuICAgICAgeWllbGQgb2JqXG5cbiAgICA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICBvYmouYm9keSA9IGJ1Zi5zbGljZShpKVxuICAgICAgeWllbGQgb2JqXG5cblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRJbXBscyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cykgOjpcbiAgICBjb25zdCBvdXRib3VuZCA9IFtdXG4gICAgb3V0Ym91bmQuY2hvb3NlID0gZnJhbWluZ3MuY2hvb3NlXG5cbiAgICBmb3IgY29uc3QgZnJhbWUgb2YgZnJhbWluZ3MgOjpcbiAgICAgIGNvbnN0IGltcGwgPSBmcmFtZSA/IHRyYW5zcG9ydHNbZnJhbWUudHJhbnNwb3J0XSA6IG51bGxcbiAgICAgIGlmICEgaW1wbCA6OiBjb250aW51ZVxuXG4gICAgICBjb25zdCB7Yml0cywgcGFjaywgdW5wYWNrfSA9IGZyYW1lXG4gICAgICBjb25zdCBwa3RfdHlwZSA9IGhpZ2hiaXRzIHwgYml0c1xuICAgICAgY29uc3Qge3RfcmVjdn0gPSBpbXBsXG5cbiAgICAgIGZ1bmN0aW9uIHBhY2tfaGRyKG9iaikgOjpcbiAgICAgICAgcGFjayhwa3RfdHlwZSwgb2JqKVxuICAgICAgICByZXR1cm4gb2JqXG5cbiAgICAgIGZ1bmN0aW9uIHJlY3ZfbXNnKHBrdCwgc2luaykgOjpcbiAgICAgICAgdW5wYWNrKHBrdClcbiAgICAgICAgcmV0dXJuIHRfcmVjdihwa3QsIHNpbmspXG5cbiAgICAgIHBhY2tfaGRyLnBrdF90eXBlID0gcmVjdl9tc2cucGt0X3R5cGUgPSBwa3RfdHlwZVxuICAgICAgb3V0Ym91bmRbYml0c10gPSBwYWNrX2hkclxuICAgICAgaW5ib3VuZFtwa3RfdHlwZV0gPSByZWN2X21zZ1xuXG4gICAgICBpZiAncHJvZHVjdGlvbicgIT09IHByb2Nlc3MuZW52Lk5PREVfRU5WIDo6XG4gICAgICAgIGNvbnN0IG9wID0gcGFja19oZHIub3AgPSByZWN2X21zZy5vcCA9IGZyYW1lLm9wXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSBAIHBhY2tfaGRyLCAnbmFtZScsIEB7fSB2YWx1ZTogYHBhY2tfaGRyIMKrJHtvcH3Cu2BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcmVjdl9tc2csICduYW1lJywgQHt9IHZhbHVlOiBgcmVjdl9tc2cgwqske29wfcK7YFxuXG4gICAgcmV0dXJuIG91dGJvdW5kXG5cblxuICBmdW5jdGlvbiBiaW5kVHJhbnNwb3J0cyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cykgOjpcbiAgICBjb25zdCBwYWNrQm9keSA9IHRyYW5zcG9ydHMucGFja0JvZHlcbiAgICBjb25zdCBvdXRib3VuZCA9IGJpbmRUcmFuc3BvcnRJbXBscyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cylcbiAgICByZXR1cm4gdHJhbnNwb3J0cy5zdHJlYW1pbmdcbiAgICAgID8gQHt9IHNlbmQsIHN0cmVhbTogYmluZF9zdHJlYW0gQCB0cmFuc3BvcnRzLnN0cmVhbWluZy5tb2RlXG4gICAgICA6IEB7fSBzZW5kXG5cbiAgICBmdW5jdGlvbiBzZW5kKGNoYW4sIG9iaiwgYm9keSkgOjpcbiAgICAgIGJvZHkgPSBwYWNrQm9keShib2R5KVxuICAgICAgaWYgZnJhZ21lbnRfc2l6ZSA8IGJvZHkuYnl0ZUxlbmd0aCA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBvYmoudHJhbnNwb3J0ID0gJ211bHRpcGFydCdcbiAgICAgICAgY29uc3QgbXNlbmQgPSBtc2VuZF9ieXRlcyhjaGFuLCBvYmopXG4gICAgICAgIHJldHVybiBtc2VuZCBAIHRydWUsIGJvZHlcblxuICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzaW5nbGUnXG4gICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBwYWNrX2hkcihvYmopXG4gICAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gICAgZnVuY3Rpb24gbXNlbmRfYnl0ZXMoY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBsZXQge25leHR9ID0gcGFja19oZHIob2JqKVxuICAgICAgaWYgbnVsbCAhPT0gbXNnIDo6XG4gICAgICAgIG9iai5ib2R5ID0gbXNnXG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgY2hhbiBAIHBrdFxuXG4gICAgICByZXR1cm4gYXN5bmMgZnVuY3Rpb24gKGZpbiwgYm9keSkgOjpcbiAgICAgICAgaWYgbnVsbCA9PT0gbmV4dCA6OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvciBAICdXcml0ZSBhZnRlciBlbmQnXG4gICAgICAgIGxldCByZXNcbiAgICAgICAgZm9yIGNvbnN0IG9iaiBvZiBwYWNrZXRGcmFnbWVudHMgQCBib2R5LCBuZXh0LCBmaW4gOjpcbiAgICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgICAgcmVzID0gYXdhaXQgY2hhbiBAIHBrdFxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIHJlc1xuXG4gICAgZnVuY3Rpb24gbXNlbmRfb2JqZWN0cyhjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGxldCB7bmV4dH0gPSBwYWNrX2hkcihvYmopXG4gICAgICBpZiBudWxsICE9PSBtc2cgOjpcbiAgICAgICAgb2JqLmJvZHkgPSBtc2dcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBjaGFuIEAgcGt0XG5cbiAgICAgIHJldHVybiBmdW5jdGlvbiAoZmluLCBib2R5KSA6OlxuICAgICAgICBpZiBudWxsID09PSBuZXh0IDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgJ1dyaXRlIGFmdGVyIGVuZCdcbiAgICAgICAgY29uc3Qgb2JqID0gbmV4dCh7ZmlufSlcbiAgICAgICAgb2JqLmJvZHkgPSBib2R5XG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgaWYgZmluIDo6IG5leHQgPSBudWxsXG4gICAgICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgICBmdW5jdGlvbiBiaW5kX3N0cmVhbShtb2RlKSA6OlxuICAgICAgY29uc3QgbXNlbmRfaW1wbCA9IHtvYmplY3Q6IG1zZW5kX29iamVjdHMsIGJ5dGVzOiBtc2VuZF9ieXRlc31bbW9kZV1cbiAgICAgIGlmIG1zZW5kX2ltcGwgOjogcmV0dXJuIHN0cmVhbVxuXG4gICAgICBmdW5jdGlvbiBzdHJlYW0oY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIG9iai50cmFuc3BvcnQgPSAnc3RyZWFtaW5nJ1xuICAgICAgICBjb25zdCBtc2VuZCA9IG1zZW5kX2ltcGwgQCBjaGFuLCBvYmosIGpzb25fcGFjayhtc2cpXG4gICAgICAgIHdyaXRlLndyaXRlID0gd3JpdGU7IHdyaXRlLmVuZCA9IHdyaXRlLmJpbmQodHJ1ZSlcbiAgICAgICAgcmV0dXJuIHdyaXRlXG5cbiAgICAgICAgZnVuY3Rpb24gd3JpdGUoY2h1bmspIDo6XG4gICAgICAgICAgcmV0dXJuIGNodW5rICE9IG51bGxcbiAgICAgICAgICAgID8gbXNlbmQgQCB0cnVlPT09dGhpcywgcGFja0JvZHkoY2h1bmspXG4gICAgICAgICAgICA6IG1zZW5kIEAgdHJ1ZVxuXG5cbmZ1bmN0aW9uIGNoZWNrX2ZucyhvYmosIC4uLmtleXMpIDo6XG4gIGZvciBjb25zdCBrZXkgb2Yga2V5cyA6OlxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBvYmpba2V5XSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBcIiR7a2V5fVwiIHRvIGJlIGEgZnVuY3Rpb25gXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBqc29uX3Byb3RvY29sKHNoYXJlZCkgOjpcbiAgY29uc3Qge2NyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtLCBqc29uX3BhY2t9ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcblxuICByZXR1cm4gQHt9XG4gICAgcGFja0JvZHlcblxuICAgIGdldCBkYXRhZ3JhbSgpIDo6IHJldHVybiB0aGlzLmRpcmVjdFxuICAgIGRpcmVjdDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBtc2cgPSBzaW5rLmpzb25fdW5wYWNrIEAgcGt0LmJvZHlfdXRmOCgpIHx8IHVuZGVmaW5lZFxuICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBwa3QuaW5mb1xuXG4gICAgbXVsdGlwYXJ0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlTXVsdGlwYXJ0XG4gICAgICAgIGNvbnN0IGJvZHlfYnVmID0gc3RhdGUuZmVlZChwa3QpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gYm9keV9idWYgOjpcbiAgICAgICAgICBjb25zdCBtc2cgPSBzaW5rLmpzb25fdW5wYWNrIEAgdW5wYWNrX3V0ZjgoYm9keV9idWYpIHx8IHVuZGVmaW5lZFxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuICAgIHN0cmVhbWluZzogQHt9XG4gICAgICBtb2RlOiAnb2JqZWN0J1xuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVTdHJlYW1cbiAgICAgICAgcmV0dXJuIHN0YXRlLmZlZWQocGt0LCB1bnBhY2tCb2R5KVxuXG4gIGZ1bmN0aW9uIHBhY2tCb2R5KGJvZHkpIDo6XG4gICAgcmV0dXJuIHBhY2tfdXRmOCBAIGpzb25fcGFjayhib2R5KVxuXG4gIGZ1bmN0aW9uIHVucGFja0JvZHkocGt0LCBzaW5rKSA6OlxuICAgIHJldHVybiBzaW5rLmpzb25fdW5wYWNrIEAgcGt0LmJvZHlfdXRmOCgpXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBiaW5hcnlfcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW19ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgY29uc3Qge2FzQnVmZmVyfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgcmV0dXJuIEB7fVxuICAgIHBhY2tCb2R5OiBhc0J1ZmZlclxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHBrdC5ib2R5X2J1ZmZlcigpXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdieXRlcydcbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlU3RyZWFtXG4gICAgICAgIGNvbnN0IG1zZyA9IHN0YXRlLmZlZWQocGt0LCBwa3RfYnVmZmVyKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZyA6OlxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuZnVuY3Rpb24gcGt0X2J1ZmZlcihwa3QpIDo6IHJldHVybiBwa3QuYm9keV9idWZmZXIoKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gY29udHJvbF9wcm90b2NvbChpbmJvdW5kLCBoaWdoLCBzaGFyZWQpIDo6XG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrUGFja2V0T2JqfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcblxuICBjb25zdCBwaW5nX2ZyYW1lID0gZnJhbWluZ3MuY2hvb3NlIEA6IGZyb21faWQ6IHRydWUsIHRva2VuOiB0cnVlLCB0cmFuc3BvcnQ6ICdkaXJlY3QnXG4gIGNvbnN0IHBvbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgbXNnaWQ6IHRydWUsIHRyYW5zcG9ydDogJ2RhdGFncmFtJ1xuXG4gIGNvbnN0IHBvbmdfdHlwZSA9IGhpZ2h8MHhlXG4gIGluYm91bmRbcG9uZ190eXBlXSA9IHJlY3ZfcG9uZ1xuICBjb25zdCBwaW5nX3R5cGUgPSBoaWdofDB4ZlxuICBpbmJvdW5kW2hpZ2h8MHhmXSA9IHJlY3ZfcGluZ1xuXG4gIHJldHVybiBAe30gc2VuZDpwaW5nLCBwaW5nXG5cbiAgZnVuY3Rpb24gcGluZyhjaGFuLCBvYmopIDo6XG4gICAgaWYgISBvYmoudG9rZW4gOjpcbiAgICAgIG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgb2JqLmJvZHkgPSBKU09OLnN0cmluZ2lmeSBAOlxuICAgICAgb3A6ICdwaW5nJywgdHMwOiBuZXcgRGF0ZSgpXG4gICAgcGluZ19mcmFtZS5wYWNrKHBpbmdfdHlwZSwgb2JqKVxuICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gIGZ1bmN0aW9uIHJlY3ZfcGluZyhwa3QsIHNpbmssIHJvdXRlcikgOjpcbiAgICBwaW5nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICBfc2VuZF9wb25nIEAgcGt0LmJvZHksIHBrdCwgcm91dGVyXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4gIGZ1bmN0aW9uIF9zZW5kX3Bvbmcoe3RzMH0sIHBrdF9waW5nLCByb3V0ZXIpIDo6XG4gICAgY29uc3Qge21zZ2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgZnJvbV9pZDpyX2lkfSA9IHBrdF9waW5nLmluZm9cbiAgICBjb25zdCBvYmogPSBAe30gbXNnaWRcbiAgICAgIGZyb21faWQ6IEB7fSBpZF90YXJnZXQsIGlkX3JvdXRlclxuICAgICAgaWRfcm91dGVyOiByX2lkLmlkX3JvdXRlciwgaWRfdGFyZ2V0OiByX2lkLmlkX3RhcmdldFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkgQDpcbiAgICAgICAgb3A6ICdwb25nJywgdHMwLCB0czE6IG5ldyBEYXRlKClcblxuICAgIHBvbmdfZnJhbWUucGFjayhwb25nX3R5cGUsIG9iailcbiAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgcmV0dXJuIHJvdXRlci5kaXNwYXRjaCBAIFtwa3RdXG5cbiAgZnVuY3Rpb24gcmVjdl9wb25nKHBrdCwgc2luaykgOjpcbiAgICBwb25nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuaW1wb3J0IHNoYXJlZF9wcm90byBmcm9tICcuL3NoYXJlZC5qc3knXG5pbXBvcnQganNvbl9wcm90byBmcm9tICcuL2pzb24uanN5J1xuaW1wb3J0IGJpbmFyeV9wcm90byBmcm9tICcuL2JpbmFyeS5qc3knXG5pbXBvcnQgY29udHJvbF9wcm90byBmcm9tICcuL2NvbnRyb2wuanN5J1xuXG5leHBvcnQgKiBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBpbml0X3Byb3RvY29sKHBhY2tldFBhcnNlciwgb3B0aW9ucykgOjpcbiAgY29uc3Qgc2hhcmVkID0gc2hhcmVkX3Byb3RvIEAgcGFja2V0UGFyc2VyLCBvcHRpb25zXG5cbiAgY29uc3QgaW5ib3VuZCA9IFtdXG4gIGNvbnN0IGpzb24gPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgwMCAvLyAweDAqIOKAlCBKU09OIGJvZHlcbiAgICBqc29uX3Byb3RvKHNoYXJlZClcblxuICBjb25zdCBiaW5hcnkgPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgxMCAvLyAweDEqIOKAlCBiaW5hcnkgYm9keVxuICAgIGJpbmFyeV9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgY29udHJvbCA9IGNvbnRyb2xfcHJvdG8gQCBpbmJvdW5kLFxuICAgIDB4ZjAgLy8gMHhmKiDigJQgY29udHJvbFxuICAgIHNoYXJlZFxuXG4gIGNvbnN0IGNvZGVjcyA9IEA6IGpzb24sIGJpbmFyeSwgY29udHJvbCwgZGVmYXVsdDoganNvblxuXG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIHJldHVybiBAOiBpbmJvdW5kLCBjb2RlY3MsIHJhbmRvbV9pZFxuXG5cbiIsImV4cG9ydCBmdW5jdGlvbiBiaW5kUm91dGVDaGFubmVsKGh1YiwgY2FjaGUpIDo6XG4gIGNvbnN0IGNoYW5uZWwgPSBodWIuY29ubmVjdF9zZWxmKClcbiAgY29uc3Qge3Jlc29sdmVSb3V0ZSwgcm91dGVzfSA9IGh1Yi5yb3V0ZXJcbiAgcmV0dXJuIGNhY2hlID8gY2FjaGVSb3V0ZUNoYW5uZWwgOiByZXNvbHZlUm91dGVDaGFubmVsXG5cbiAgZnVuY3Rpb24gY2FjaGVSb3V0ZUNoYW5uZWwoaWRfcm91dGVyKSA6OlxuICAgIGxldCBjaGFuID0gY2FjaGUuZ2V0KGlkX3JvdXRlcilcbiAgICBpZiB1bmRlZmluZWQgPT09IGNoYW4gOjpcbiAgICAgIGNoYW4gPSByZXNvbHZlUm91dGVDaGFubmVsKGlkX3JvdXRlcilcbiAgICAgIGNhY2hlLnNldChpZF9yb3V0ZXIsIGNoYW4pXG4gICAgcmV0dXJuIGNoYW5cblxuICBmdW5jdGlvbiByZXNvbHZlUm91dGVDaGFubmVsKGlkX3JvdXRlcikgOjpcbiAgICBsZXQgcm91dGUsIGRpc2NvID0gcmVzb2x2ZVJvdXRlKGlkX3JvdXRlcilcbiAgICByZXR1cm4gYXN5bmMgcGt0ID0+IDo6XG4gICAgICB0cnkgOjpcbiAgICAgICAgaWYgbnVsbCAhPT0gZGlzY28gOjpcbiAgICAgICAgICByb3V0ZSA9IGF3YWl0IGRpc2NvXG4gICAgICAgICAgZGlzY28gPSBudWxsXG5cbiAgICAgICAgaWYgbnVsbCA9PSByb3V0ZSB8fCAhIHJvdXRlcy5oYXMoaWRfcm91dGVyKSA6OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvciBAIFwiVW5yZXNvbHZhYmxlIHJvdXRlXCJcblxuICAgICAgICBhd2FpdCByb3V0ZSBAIHBrdCwgY2hhbm5lbFxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIGRpc2NvID0gcm91dGUgPSBudWxsXG4gICAgICAgIGlmIGNhY2hlIDo6IGNhY2hlLmRlbGV0ZShpZF9yb3V0ZXIpXG4gICAgICAgIHRocm93IGVyclxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgRW5kcG9pbnQgOjpcbiAgc3RhdGljIHN1YmNsYXNzKGV4dGVuc2lvbnMpIDo6XG4gICAgY2xhc3MgRW5kcG9pbnQgZXh0ZW5kcyB0aGlzIDo6XG4gICAgT2JqZWN0LmFzc2lnbiBAIEVuZHBvaW50LnByb3RvdHlwZSwgZXh0ZW5zaW9uc1xuICAgIHJldHVybiBFbmRwb2ludFxuXG4gIHZhbHVlT2YoKSA6OiByZXR1cm4gdGhpcy5pZC5pZF90YXJnZXRcbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFbmRwb2ludCAke3RoaXMuZW5jb2RlKHRydWUpfcK7YFxuICB0b0pTT04oKSA6OiByZXR1cm4gdGhpcy5lbmNvZGUoZmFsc2UpXG5cbiAgY29uc3RydWN0b3IoaWQsIG1zZ19jdHgsIGVwX3RndCkgOjpcbiAgICBtc2dfY3R4ID0gbXNnX2N0eC53aXRoRW5kcG9pbnQodGhpcylcbiAgICBjb25zdCBhc1NlbmRlciA9IGVwX3RndC5jb25zdHJ1Y3Rvci5qc29uX2FzX3NlbmRlcihtc2dfY3R4KVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIGlkOiBAe30gdmFsdWU6IGlkLCBlbnVtZXJhYmxlOiB0cnVlXG4gICAgICB0bzogQHt9IHZhbHVlOiBtc2dfY3R4LnRvXG4gICAgICBlbmNvZGU6IEB7fSB2YWx1ZTogZXBfdGd0LmVuY29kZVxuICAgICAgYXNTZW5kZXI6IEB7fSB2YWx1ZTogYXNTZW5kZXJcblxuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpXG4gIGNyZWF0ZVN0YXRlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUmVwbHlNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVUcmFmZmljTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUm91dGVDYWNoZU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG5cbiAgYmluZFNpbmsoc2luaykgOjpcbiAgICBjb25zdCBieV90b2tlbiA9IHRoaXMuY3JlYXRlUmVwbHlNYXAoKVxuICAgIGNvbnN0IGJ5X3RyYWZmaWMgPSB0aGlzLmNyZWF0ZVRyYWZmaWNNYXAoKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIGJ5X3Rva2VuOiBAe30gdmFsdWU6IGJ5X3Rva2VuXG4gICAgICBieV90cmFmZmljOiBAe30gdmFsdWU6IGJ5X3RyYWZmaWNcblxuICAgIGNvbnN0IHRyYWZmaWMgPSAoZnJvbV9pZCwgdHJhZmZpYykgPT4gOjpcbiAgICAgIGNvbnN0IHRzID0gRGF0ZS5ub3coKVxuICAgICAgaWYgZnJvbV9pZCA6OlxuICAgICAgICBjb25zdCB0ID0gYnlfdHJhZmZpYy5nZXQoZnJvbV9pZC5pZF90YXJnZXQpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdCA6OlxuICAgICAgICAgIHQudHMgPSB0W2B0c18ke3RyYWZmaWN9YF0gPSB0c1xuICAgICAgdGhpcy5yZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cylcblxuICAgIHJldHVybiBAe31cbiAgICAgIGJ5X21zZ2lkOiB0aGlzLmNyZWF0ZVN0YXRlTWFwKClcblxuICAgICAgcmVjdkN0cmw6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnY3RybCcpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZDdHJsKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnIHx8IHttc2csIGluZm99KS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZNc2c6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnbXNnJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdk1zZyhtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZykudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2U3RyZWFtRGF0YTogKHJzdHJlYW0sIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgIHJlY3ZTdHJlYW06IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3QgcnN0cmVhbSA9IHRoaXMucmVjdlN0cmVhbShtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocnN0cmVhbSkudGhlbihyZXBseSlcbiAgICAgICAgcmV0dXJuIHJzdHJlYW1cblxuICByZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cykgOjpcbiAgcmVjdkN0cmwobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gIHJlY3ZNc2cobXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBpZiBpc19yZXBseSA6OiByZXR1cm4gbXNnXG4gICAgcmV0dXJuIEB7fSBtc2csIGluZm8sIHNlbmRlcjogdGhpcy5hc1NlbmRlcihpbmZvKVxuICByZWN2U3RyZWFtKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgY29uc29sZS53YXJuIEAgYFVuaGFuZGxlIHJlY3Ygc3RyZWFtOiAke2luZm99YFxuICAgIHJldHVybiBudWxsXG4gICAgLyogcmV0dXJuIEB7fSBtc2csIGluZm9cbiAgICAgICAgIG9uX2luaXQobXNnLCBwa3QpIDo6IHJldHVybiB0aGlzXG4gICAgICAgICBvbl9kYXRhKGRhdGEsIHBrdCkgOjogdGhpcy5wYXJ0cy5wdXNoIEAgZGF0YVxuICAgICAgICAgb25fZW5kKHJlc3VsdCwgcGt0KSA6OiByZXR1cm4gdGhpcy5wYXJ0cy5qb2luKCcnKVxuICAgICAgICAgb25fZXJyb3IoZXJyLCBwa3QpIDo6IGNvbnNvbGUubG9nIEAgZXJyXG4gICAgKi9cblxuICBpbml0UmVwbHkodG9rZW4sIHBfc2VudCwgbXNnX2N0eCkgOjpcbiAgICByZXR1cm4gdGhpcy5pbml0UmVwbHlQcm9taXNlIEAgdG9rZW4sIHBfc2VudCwgbXNnX2N0eFxuXG4gIGluaXRNb25pdG9yKGlkX3RhcmdldCkgOjpcbiAgICBjb25zdCBrZXkgPSBpZF90YXJnZXQuaWRfdGFyZ2V0IHx8IGlkX3RhcmdldFxuICAgIGxldCBtb25pdG9yID0gdGhpcy5ieV90cmFmZmljLmdldCBAIGtleVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gbW9uaXRvciA6OlxuICAgICAgbW9uaXRvciA9IEB7fSBpZF90YXJnZXQsIHRzOiBEYXRlLm5vdygpXG4gICAgICAgIHRkKCkgOjogcmV0dXJuIERhdGUubm93KCkgLSB0aGlzLnRzXG4gICAgICB0aGlzLmJ5X3RyYWZmaWMuc2V0IEAga2V5LCBtb25pdG9yXG4gICAgcmV0dXJuIG1vbml0b3JcblxuICBpbml0UmVwbHlQcm9taXNlKHRva2VuLCBwX3NlbnQsIG1zZ19jdHgpIDo6XG4gICAgbGV0IHJlcGx5ID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgdGhpcy5ieV90b2tlbi5zZXQgQCB0b2tlbiwgcmVzb2x2ZVxuICAgICAgcF9zZW50LmNhdGNoIEAgcmVqZWN0XG5cbiAgICBpZiBtc2dfY3R4IDo6XG4gICAgICByZXBseSA9IG1zZ19jdHgud2l0aFJlamVjdFRpbWVvdXQocmVwbHkpXG5cbiAgICBjb25zdCBjbGVhciA9ICgpID0+IHRoaXMuYnlfdG9rZW4uZGVsZXRlIEAgdG9rZW5cbiAgICByZXBseS50aGVuIEAgY2xlYXIsIGNsZWFyXG4gICAgcmV0dXJuIHJlcGx5XG5cbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIEVQVGFyZ2V0IDo6XG4gIHN0YXRpYyBzdWJjbGFzcyhleHRlbnNpb25zKSA6OlxuICAgIGNsYXNzIEVQVGFyZ2V0IGV4dGVuZHMgdGhpcyA6OlxuICAgIE9iamVjdC5hc3NpZ24gQCBFUFRhcmdldC5wcm90b3R5cGUsIGV4dGVuc2lvbnNcbiAgICByZXR1cm4gRVBUYXJnZXRcblxuICBjb25zdHJ1Y3RvcihpZCwgbXNnX2N0eCwgbXNnX2luZm8pIDo6XG4gICAgY29uc3QgcHJvcHMgPSBAe31cbiAgICAgIGlkX3JvdXRlcjogQHt9IGVudW1lcmFibGU6IHRydWUsIHZhbHVlOiBpZC5pZF9yb3V0ZXJcbiAgICAgIGlkX3RhcmdldDogQHt9IGVudW1lcmFibGU6IHRydWUsIHZhbHVlOiBpZC5pZF90YXJnZXRcbiAgICAgIGVuY29kZTogQHt9IHZhbHVlOiBzaW1wbGUgPT4gdGhpcy5lcF9lbmNvZGUoaWQsIHNpbXBsZSlcblxuICAgIGlmIG1zZ19jdHggOjpcbiAgICAgIGJpbmRDdHhQcm9wcyBAIHByb3BzLCBtc2dfaW5mbywgKCkgPT5cbiAgICAgICAgbXNnX2N0eC50byh0aGlzLCBtc2dfaW5mbykuZmFzdF9qc29uXG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgcHJvcHNcblxuXG4gIHZhbHVlT2YoKSA6OiByZXR1cm4gdGhpcy5pZF90YXJnZXRcbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFUFRhcmdldCAke3RoaXMuZW5jb2RlKHRydWUpfcK7YFxuICB0b0pTT04oKSA6OiByZXR1cm4gdGhpcy5lbmNvZGUoZmFsc2UpXG4gIGlzRVBUYXJnZXQoKSA6OiByZXR1cm4gdHJ1ZVxuXG4gIHN0YXRpYyBqc29uX2FzX3NlbmRlcihtc2dfY3R4KSA6OlxuICAgIHJldHVybiBpbmZvID0+XG4gICAgICB0aGlzLmZyb21fanNvbiBAIGluZm8uZnJvbV9pZCwgbXNnX2N0eCwgaW5mb1xuXG4gIHN0YXRpYyBmcm9tX2pzb24oaWQsIG1zZ19jdHgsIG1zZ19pbmZvKSA6OlxuICAgIGlmIGlkIDo6IHJldHVybiBuZXcgdGhpcyhpZCwgbXNnX2N0eCwgbXNnX2luZm8pXG5cbiAgc3RhdGljIGpzb25VbnBhY2sobXNnX2N0eCwgeGZvcm1CeUtleSkgOjpcbiAgICB4Zm9ybUJ5S2V5ID0gT2JqZWN0LmNyZWF0ZSh4Zm9ybUJ5S2V5IHx8IG51bGwpXG4gICAgeGZvcm1CeUtleVt0aGlzLnRva2VuXSA9IHYgPT5cbiAgICAgIHRoaXMuZnJvbV9qc29uIEAgdGhpcy5lcF9kZWNvZGUodiksIG1zZ19jdHhcbiAgICByZXR1cm4gdGhpcy5qc29uVW5wYWNrQnlLZXkoeGZvcm1CeUtleSlcblxuICBzdGF0aWMganNvblVucGFja0J5S2V5KHhmb3JtQnlLZXkpIDo6XG4gICAgY29uc3QgcmVnID0gbmV3IFdlYWtNYXAoKVxuICAgIHJldHVybiBzeiA9PiBKU09OLnBhcnNlIEAgc3osIHJldml2ZXJcblxuICAgIGZ1bmN0aW9uIHJldml2ZXIoa2V5LCB2YWx1ZSkgOjpcbiAgICAgIGNvbnN0IHhmbiA9IHhmb3JtQnlLZXlba2V5XVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB4Zm4gOjpcbiAgICAgICAgcmVnLnNldCh0aGlzLCB4Zm4pXG4gICAgICAgIHJldHVybiB2YWx1ZVxuXG4gICAgICBpZiAnb2JqZWN0JyA9PT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICAgIGNvbnN0IHZmbiA9IHJlZy5nZXQodmFsdWUpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdmZuIDo6XG4gICAgICAgICAgcmV0dXJuIHZmbiBAIHZhbHVlXG4gICAgICByZXR1cm4gdmFsdWVcblxuXG5mdW5jdGlvbiBiaW5kQ3R4UHJvcHMocHJvcHMsIG1zZ19pbmZvLCBpbml0KSA6OlxuICBsZXQgY3R4XG4gIHByb3BzLnNlbmQgPSBAe30gZ2V0KCkgOjogcmV0dXJuIChjdHggfHwgKGN0eCA9IGluaXQoKSkpLnNlbmRcbiAgcHJvcHMucXVlcnkgPSBAe30gZ2V0KCkgOjogcmV0dXJuIChjdHggfHwgKGN0eCA9IGluaXQoKSkpLnF1ZXJ5XG4gIGlmIG1zZ19pbmZvICYmIG1zZ19pbmZvLm1zZ2lkIDo6XG4gICAgLy8gcmVhZHMgYXMgXCJzZW5kZXIucmVwbHlFeHBlY3RlZFwiXG4gICAgcHJvcHMucmVwbHlFeHBlY3RlZCA9IEB7fSB2YWx1ZTogdHJ1ZVxuXG5cbmNvbnN0IHRva2VuID0gJ1xcdTAzRTAnIC8vICfPoCdcbkVQVGFyZ2V0LnRva2VuID0gdG9rZW5cblxuRVBUYXJnZXQuZXBfZW5jb2RlID0gRVBUYXJnZXQucHJvdG90eXBlLmVwX2VuY29kZSA9IGVwX2VuY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2VuY29kZShpZCwgc2ltcGxlKSA6OlxuICBsZXQge2lkX3JvdXRlcjpyLCBpZF90YXJnZXQ6dH0gPSBpZFxuICByID0gKHI+Pj4wKS50b1N0cmluZygzNilcbiAgdCA9ICh0Pj4+MCkudG9TdHJpbmcoMzYpXG4gIGlmIHNpbXBsZSA6OlxuICAgIHJldHVybiBgJHt0b2tlbn0gJHtyfX4ke3R9YFxuXG4gIGNvbnN0IHJlcyA9IEB7fSBbdG9rZW5dOiBgJHtyfX4ke3R9YFxuICBPYmplY3QuYXNzaWduIEAgcmVzLCBpZFxuICBkZWxldGUgcmVzLmlkX3JvdXRlcjsgZGVsZXRlIHJlcy5pZF90YXJnZXRcbiAgcmV0dXJuIHJlc1xuXG5cbkVQVGFyZ2V0LmVwX2RlY29kZSA9IEVQVGFyZ2V0LnByb3RvdHlwZS5lcF9kZWNvZGUgPSBlcF9kZWNvZGVcbmV4cG9ydCBmdW5jdGlvbiBlcF9kZWNvZGUodikgOjpcbiAgY29uc3QgaWQgPSAnc3RyaW5nJyA9PT0gdHlwZW9mIHZcbiAgICA/IHYuc3BsaXQodG9rZW4pWzFdXG4gICAgOiB2W3Rva2VuXVxuICBpZiAhIGlkIDo6IHJldHVyblxuXG4gIGxldCBbcix0XSA9IGlkLnNwbGl0KCd+JylcbiAgaWYgdW5kZWZpbmVkID09PSB0IDo6IHJldHVyblxuICByID0gMCB8IHBhcnNlSW50KHIsIDM2KVxuICB0ID0gMCB8IHBhcnNlSW50KHQsIDM2KVxuXG4gIHJldHVybiBAe30gaWRfcm91dGVyOiByLCBpZF90YXJnZXQ6IHRcblxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2luayA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtpbmJvdW5kfSkgOjpcbiAgICBjbGFzcyBTaW5rIGV4dGVuZHMgdGhpcyA6OlxuICAgIFNpbmsucHJvdG90eXBlLl9wcm90b2NvbCA9IGluYm91bmRcbiAgICByZXR1cm4gU2lua1xuXG4gIGNvbnN0cnVjdG9yKGpzb25fdW5wYWNrKSA6OlxuICAgIHRoaXMuanNvbl91bnBhY2sgPSBqc29uX3VucGFja1xuXG4gIHJlZ2lzdGVyKGVuZHBvaW50LCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnMpIDo6XG4gICAgY29uc3QgdW5yZWdpc3RlciA9ICgpID0+IGh1Yi5yb3V0ZXIudW5yZWdpc3RlclRhcmdldChpZF90YXJnZXQpXG5cbiAgICBodWIucm91dGVyLnJlZ2lzdGVyVGFyZ2V0IEAgaWRfdGFyZ2V0LFxuICAgICAgdGhpcy5fYmluZERpc3BhdGNoIEAgZW5kcG9pbnQsIHVucmVnaXN0ZXIsIGhhbmRsZXJzXG4gICAgcmV0dXJuIHRoaXNcblxuICBfYmluZERpc3BhdGNoKGVuZHBvaW50LCB1bnJlZ2lzdGVyLCB7b25fbXNnLCBvbl9lcnJvciwgb25fc2h1dGRvd259KSA6OlxuICAgIGxldCBhbGl2ZSA9IHRydWVcbiAgICBjb25zdCBwcm90b2NvbCA9IHRoaXMuX3Byb3RvY29sXG4gICAgY29uc3QgaXNBbGl2ZSA9ICgpID0+IGFsaXZlXG4gICAgY29uc3Qgc2h1dGRvd24gPSAoZXJyLCBleHRyYSkgPT4gOjpcbiAgICAgIGlmIGFsaXZlIDo6XG4gICAgICAgIHVucmVnaXN0ZXIoKTsgdW5yZWdpc3RlciA9IGFsaXZlID0gZmFsc2VcbiAgICAgICAgb25fc2h1dGRvd24oZXJyLCBleHRyYSlcblxuICAgIE9iamVjdC5hc3NpZ24gQCB0aGlzLCBlbmRwb2ludC5iaW5kU2luayh0aGlzKSwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG4gICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cblxuICAgIHJldHVybiBhc3luYyAocGt0LCByb3V0ZXIpID0+IDo6XG4gICAgICBpZiBmYWxzZT09PWFsaXZlIHx8IG51bGw9PXBrdCA6OiByZXR1cm4gYWxpdmVcblxuICAgICAgY29uc3QgcmVjdl9tc2cgPSBwcm90b2NvbFtwa3QudHlwZV1cbiAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmVjdl9tc2cgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBmYWxzZSwgQHt9IHBrdCwgem9uZTogJ3BrdC50eXBlJ1xuXG4gICAgICB0cnkgOjpcbiAgICAgICAgdmFyIG1zZyA9IGF3YWl0IHJlY3ZfbXNnIEAgcGt0LCB0aGlzLCByb3V0ZXJcbiAgICAgICAgaWYgISBtc2cgOjogcmV0dXJuIG1zZ1xuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZXJyLCBAe30gcGt0LCB6b25lOiAncHJvdG9jb2wnXG5cbiAgICAgIGlmIGZhbHNlID09PSBhbGl2ZSA6OlxuICAgICAgICByZXR1cm4gZmFsc2UgLy8gY2hhbmdlIHdoaWxlIGF3YWl0aW5nIGFib3Zl4oCmXG4gICAgICB0cnkgOjpcbiAgICAgICAgcmV0dXJuIGF3YWl0IG9uX21zZyBAIG1zZywgcGt0XG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgdHJ5IDo6XG4gICAgICAgICAgdmFyIHRlcm1pbmF0ZSA9IG9uX2Vycm9yIEAgZXJyLCBAe30gbXNnLCBwa3QsIHpvbmU6ICdkaXNwYXRjaCdcbiAgICAgICAgZmluYWxseSA6OlxuICAgICAgICAgIGlmIGZhbHNlICE9PSB0ZXJtaW5hdGUgOjpcbiAgICAgICAgICAgIHNodXRkb3duKGVyciwge21zZywgcGt0fSlcbiAgICAgICAgICAgIHJldHVybiBmYWxzZSAvLyBzaWduYWwgdW5yZWdpc3RlciB0byBtc2ctZmFicmljLWNvcmUvcm91dGVyXG5cbiAgc3RhdGVGb3IocGt0LCBpZkFic2VudCkgOjpcbiAgICBjb25zdCBtc2dpZCA9IHBrdC5pbmZvLm1zZ2lkXG4gICAgbGV0IGVudHJ5ID0gdGhpcy5ieV9tc2dpZC5nZXQobXNnaWQpXG4gICAgaWYgdW5kZWZpbmVkID09PSBlbnRyeSA6OlxuICAgICAgaWYgISBtc2dpZCA6OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgSW52YWxpZCBtc2dpZDogJHttc2dpZH1gXG4gICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgaWZBYnNlbnQgOjpcbiAgICAgICAgZW50cnkgPSBpZkFic2VudChwa3QsIHRoaXMsIG1zZ2lkKVxuICAgICAgZWxzZSBlbnRyeSA9IGlmQWJzZW50XG4gICAgICB0aGlzLmJ5X21zZ2lkLnNldCBAIG1zZ2lkLCBlbnRyeVxuICAgIHJldHVybiBlbnRyeVxuXG4gIGRlbGV0ZVN0YXRlRm9yKG1zZ2lkKSA6OlxuICAgIHJldHVybiB0aGlzLmJ5X21zZ2lkLmRlbGV0ZShtc2dpZClcbiIsImltcG9ydCB7ZXBfZGVjb2RlfSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1zZ0N0eCA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtyYW5kb21faWQsIGNvZGVjc30pIDo6XG4gICAgY2xhc3MgTXNnQ3R4IGV4dGVuZHMgdGhpcyA6OlxuICAgIE1zZ0N0eC5wcm90b3R5cGUucmFuZG9tX2lkID0gcmFuZG9tX2lkXG4gICAgTXNnQ3R4LndpdGhDb2RlY3MgQCBjb2RlY3NcbiAgICByZXR1cm4gTXNnQ3R4XG5cbiAgY29uc3RydWN0b3IoZXBfdGd0LCByZXNvbHZlUm91dGVDaGFubmVsKSA6OlxuICAgIGNvbnN0IHByb3BzID0gQHt9XG4gICAgICBfcm9vdF86IEA6IHZhbHVlOiB0aGlzXG4gICAgICByZXNvbHZlUm91dGVDaGFubmVsOiBAOiB2YWx1ZTogcmVzb2x2ZVJvdXRlQ2hhbm5lbFxuXG4gICAgaWYgbnVsbCAhPT0gZXBfdGd0IDo6XG4gICAgICBjb25zdCB7aWRfdGFyZ2V0LCBpZF9yb3V0ZXJ9ID0gZXBfdGd0XG4gICAgICBjb25zdCBmcm9tX2lkID0gT2JqZWN0LmZyZWV6ZSBAOiBpZF90YXJnZXQsIGlkX3JvdXRlclxuICAgICAgcHJvcHMuZnJvbV9pZCA9IEB7fSB2YWx1ZTogZnJvbV9pZFxuICAgICAgcHJvcHMuY3R4ID0gQHt9IHZhbHVlOiB7ZnJvbV9pZH1cbiAgICAgIHByb3BzLmVwX2RlY29kZSA9IEB7fSB2YWx1ZTogZXBfdGd0LmVwX2RlY29kZVxuXG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgcHJvcHNcblxuICB3aXRoRW5kcG9pbnQoZW5kcG9pbnQpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBlbmRwb2ludDogQHt9IHZhbHVlOiBlbmRwb2ludFxuXG5cbiAgcGluZyh0b2tlbj10cnVlKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX21zZ0NvZGVjcy5jb250cm9sLnBpbmcsIFtdLCB0b2tlbilcbiAgc2VuZCguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MpXG4gIHNlbmRRdWVyeSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4KHRoaXMuX2NvZGVjLnNlbmQsIGFyZ3MsIHRydWUpXG4gIHF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZSkucmVwbHlcblxuICBzdHJlYW0oLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX2NvZGVjLnN0cmVhbSwgYXJnc1xuICBpbnZva2Uoa2V5LCAuLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWNba2V5XSwgYXJnc1xuICBiaW5kSW52b2tlKGZuT3JLZXksIHRva2VuKSA6OlxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBmbk9yS2V5IDo6IGZuT3JLZXkgPSB0aGlzLl9jb2RlY1xuICAgIHJldHVybiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGZuT3JLZXksIGFyZ3MsIHRva2VuKVxuXG4gIF9pbnZva2VfZXgoaW52b2tlLCBhcmdzLCB0b2tlbikgOjpcbiAgICBjb25zdCBvYmogPSBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4XG4gICAgaWYgbnVsbCA9PSB0b2tlbiA6OiB0b2tlbiA9IG9iai50b2tlblxuICAgIGVsc2Ugb2JqLnRva2VuID0gdG9rZW5cbiAgICBpZiB0cnVlID09PSB0b2tlbiA6OlxuICAgICAgdG9rZW4gPSBvYmoudG9rZW4gPSB0aGlzLnJhbmRvbV9pZCgpXG5cbiAgICB0aGlzLmFzc2VydE1vbml0b3IoKVxuICAgIGNvbnN0IGNoYW4gPSB0aGlzLnJlc29sdmVSb3V0ZUNoYW5uZWwob2JqLmlkX3JvdXRlcilcblxuICAgIGNvbnN0IHJlcyA9IGludm9rZSBAIGNoYW4sIG9iaiwgLi4uYXJnc1xuICAgIGlmICEgdG9rZW4gfHwgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJlcy50aGVuIDo6IHJldHVybiByZXNcblxuICAgIGxldCBwX3NlbnQgID0gcmVzLnRoZW4oKVxuICAgIGNvbnN0IHJlcGx5ID0gdGhpcy5lbmRwb2ludC5pbml0UmVwbHkodG9rZW4sIHBfc2VudCwgdGhpcylcbiAgICBwX3NlbnQgPSBwX3NlbnQudGhlbiBAICgpID0+IEA6IHJlcGx5XG4gICAgcF9zZW50LnJlcGx5ID0gcmVwbHlcbiAgICByZXR1cm4gcF9zZW50XG5cbiAgZ2V0IHRvKCkgOjogcmV0dXJuICh0Z3QsIC4uLmFyZ3MpID0+IDo6XG4gICAgaWYgbnVsbCA9PSB0Z3QgOjogdGhyb3cgbmV3IEVycm9yIEAgYE51bGwgdGFyZ2V0IGVuZHBvaW50YFxuXG4gICAgY29uc3Qgc2VsZiA9IHRoaXMuY2xvbmUoKVxuXG4gICAgY29uc3QgY3R4ID0gc2VsZi5jdHhcbiAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgY3R4LmlkX3RhcmdldCA9IHRndFxuICAgICAgY3R4LmlkX3JvdXRlciA9IGN0eC5mcm9tX2lkLmlkX3JvdXRlclxuICAgIGVsc2UgOjpcbiAgICAgIGNvbnN0IHtmcm9tX2lkOiByZXBseV9pZCwgaWRfdGFyZ2V0LCBpZF9yb3V0ZXIsIHRva2VuLCBtc2dpZH0gPSB0aGlzLmVwX2RlY29kZSh0Z3QpIHx8IHRndFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IGlkX3RhcmdldCA6OlxuICAgICAgICBpZiB1bmRlZmluZWQgPT09IGlkX3JvdXRlciA6OlxuICAgICAgICAgIGlmICEgY3R4LmlkX3JvdXRlciA6OlxuICAgICAgICAgICAgLy8gaW1wbGljaXRseSBvbiB0aGUgc2FtZSByb3V0ZXJcbiAgICAgICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBjdHguZnJvbV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgZWxzZSBjdHguaWRfcm91dGVyID0gaWRfcm91dGVyXG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSBpZF90YXJnZXRcbiAgICAgIGVsc2UgaWYgdW5kZWZpbmVkICE9PSBpZF9yb3V0ZXIgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFBhc3NpbmcgJ2lkX3JvdXRlcicgcmVxdWlyZXMgJ2lkX3RhcmdldCdgXG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHlfaWQgJiYgISBjdHguaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSByZXBseV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHJlcGx5X2lkLmlkX3RhcmdldFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG5cbiAgICByZXR1cm4gMCA9PT0gYXJncy5sZW5ndGggPyBzZWxmIDogc2VsZi53aXRoIEAgLi4uYXJnc1xuXG4gIHdpdGgoLi4uYXJncykgOjpcbiAgICBjb25zdCBjdHggPSB0aGlzLmN0eFxuICAgIGZvciBsZXQgdGd0IG9mIGFyZ3MgOjpcbiAgICAgIGlmIHRydWUgPT09IHRndCB8fCBmYWxzZSA9PT0gdGd0IDo6XG4gICAgICAgIGN0eC50b2tlbiA9IHRndFxuICAgICAgZWxzZSBpZiBudWxsICE9IHRndCA6OlxuICAgICAgICBjb25zdCB7dG9rZW4sIG1zZ2lkfSA9IHRndFxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnaWQgOjogY3R4Lm1zZ2lkID0gbXNnaWRcbiAgICByZXR1cm4gdGhpc1xuXG4gIHdpdGhSZXBseSgpIDo6XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUgQDogdG9rZW46IHRydWVcblxuICByZXNldCguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcy5fcm9vdF8sIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuICBjbG9uZSguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQHt9XG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cblxuICBhc3NlcnRNb25pdG9yKCkgOjpcbiAgICBpZiAhIHRoaXMuY2hlY2tNb25pdG9yKCkgOjpcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBUYXJnZXQgbW9uaXRvciBleHBpcmVkYFxuICBjaGVja01vbml0b3IoKSA6OiByZXR1cm4gdHJ1ZVxuICBtb25pdG9yKG9wdGlvbnM9e30pIDo6XG4gICAgaWYgdHJ1ZSA9PT0gb3B0aW9ucyB8fCBmYWxzZSA9PT0gb3B0aW9ucyA6OlxuICAgICAgb3B0aW9ucyA9IEB7fSBhY3RpdmU6IG9wdGlvbnNcblxuICAgIGNvbnN0IG1vbml0b3IgPSB0aGlzLmVuZHBvaW50LmluaXRNb25pdG9yKHRoaXMuY3R4LmlkX3RhcmdldClcblxuICAgIGNvbnN0IHRzX2R1cmF0aW9uID0gb3B0aW9ucy50c19kdXJhdGlvbiB8fCA1MDAwXG4gICAgbGV0IHRzX2FjdGl2ZSA9IG9wdGlvbnMudHNfYWN0aXZlXG4gICAgaWYgdHJ1ZSA9PT0gdHNfYWN0aXZlIDo6XG4gICAgICB0c19hY3RpdmUgPSB0c19kdXJhdGlvbi80XG5cbiAgICBsZXQgY2hlY2tNb25pdG9yXG4gICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIGNvbnN0IGRvbmUgPSBvcHRpb25zLnJlamVjdCA/IHJlamVjdCA6IHJlc29sdmVcbiAgICAgIHRoaXMuY2hlY2tNb25pdG9yID0gY2hlY2tNb25pdG9yID0gKCkgPT5cbiAgICAgICAgdHNfZHVyYXRpb24gPiBtb25pdG9yLnRkKClcbiAgICAgICAgICA/IHRydWUgOiAoZG9uZShtb25pdG9yKSwgZmFsc2UpXG5cbiAgICBsZXQgdGlkXG4gICAgY29uc3QgdHNfaW50ZXJ2YWwgPSB0c19hY3RpdmUgfHwgdHNfZHVyYXRpb24vNFxuICAgIGlmIG9wdGlvbnMuYWN0aXZlIHx8IHRzX2FjdGl2ZSA6OlxuICAgICAgY29uc3QgY3RybCA9IHRoaXMuY29kZWMoJ2NvbnRyb2wnKVxuICAgICAgY29uc3QgY2hlY2tQaW5nID0gKCkgPT4gOjpcbiAgICAgICAgaWYgdHNfaW50ZXJ2YWwgPiBtb25pdG9yLnRkKCkgOjpcbiAgICAgICAgICBjdHJsLmludm9rZSgncGluZycpXG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrUGluZywgdHNfaW50ZXJ2YWxcbiAgICBlbHNlIDo6XG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrTW9uaXRvciwgdHNfaW50ZXJ2YWxcbiAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcbiAgICBjb25zdCBjbGVhciA9ICgpID0+IGNsZWFySW50ZXJ2YWwodGlkKVxuXG4gICAgcHJvbWlzZS50aGVuKGNsZWFyLCBjbGVhcilcbiAgICByZXR1cm4gcHJvbWlzZVxuXG5cbiAgY29kZWMobXNnX2NvZGVjLCAuLi5hcmdzKSA6OlxuICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgbXNnX2NvZGVjIDo6XG4gICAgICBtc2dfY29kZWMgPSB0aGlzLl9tc2dDb2RlY3NbbXNnX2NvZGVjXVxuXG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG1zZ19jb2RlYy5zZW5kIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBhY2tldCBjb2RlYyBwcm90b2NvbGBcblxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQDpcbiAgICAgIF9jb2RlYzogQDogdmFsdWU6IG1zZ19jb2RlY1xuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG4gIHN0YXRpYyB3aXRoQ29kZWNzKG1zZ0NvZGVjcykgOjpcbiAgICBmb3IgY29uc3QgW25hbWUsIG1zZ19jb2RlY10gb2YgT2JqZWN0LmVudHJpZXMgQCBtc2dDb2RlY3MgOjpcbiAgICAgIHRoaXMucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSA6OlxuICAgICAgICByZXR1cm4gdGhpcy5jb2RlYyBAIG1zZ19jb2RlY1xuICAgIHRoaXMucHJvdG90eXBlLl9tc2dDb2RlY3MgPSBtc2dDb2RlY3NcbiAgICB0aGlzLnByb3RvdHlwZS5fY29kZWMgPSBtc2dDb2RlY3MuZGVmYXVsdFxuXG4gICAgLy8gYmluZCBzZW5kX2pzb24gYXMgZnJlcXVlbnRseSB1c2VkIGZhc3QtcGF0aFxuICAgIGNvbnN0IGpzb25fc2VuZCA9IG1zZ0NvZGVjcy5qc29uLnNlbmRcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMucHJvdG90eXBlLCBAOlxuICAgICAgZmFzdF9qc29uOiBAe30gZ2V0KCkgOjogcmV0dXJuIEA6XG4gICAgICAgIHNlbmQ6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoanNvbl9zZW5kLCBhcmdzKVxuICAgICAgICBzZW5kUXVlcnk6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoanNvbl9zZW5kLCBhcmdzLCB0cnVlKVxuICAgICAgICBxdWVyeTogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChqc29uX3NlbmQsIGFyZ3MsIHRydWUpLnJlcGx5XG5cbiAgICByZXR1cm4gdGhpc1xuXG5cbiAgd2l0aFJlamVjdFRpbWVvdXQocF9yZXBseSkgOjpcbiAgICByZXR1cm4gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgcF9yZXBseS50aGVuIEAgcmVzb2x2ZSwgcmVqZWN0XG4gICAgICBwX3JlcGx5LnRoZW4gQCBjbGVhciwgY2xlYXJcblxuICAgICAgY29uc3QgdGltZW91dCA9ICgpID0+IHJlamVjdCBAIG5ldyB0aGlzLlJlcGx5VGltZW91dFxuICAgICAgY29uc3QgdGlkID0gc2V0VGltZW91dCh0aW1lb3V0LCB0aGlzLm1zX3RpbWVvdXQpXG4gICAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcblxuICAgICAgZnVuY3Rpb24gY2xlYXIoKSA6OiBjbGVhclRpbWVvdXQgQCB0aWRcblxuXG5jbGFzcyBSZXBseVRpbWVvdXQgZXh0ZW5kcyBFcnJvciA6OlxuXG5PYmplY3QuYXNzaWduIEAgTXNnQ3R4LnByb3RvdHlwZSwgQHt9XG4gIFJlcGx5VGltZW91dCwgbXNfdGltZW91dDogNTAwMFxuICBlcF9kZWNvZGVcblxuIiwiaW1wb3J0IGluaXRfcHJvdG9jb2wgZnJvbSAnLi9wcm90b2NvbC9pbmRleC5qc3knXG5pbXBvcnQge2JpbmRSb3V0ZUNoYW5uZWx9IGZyb20gJy4vY29yZV9pbnRlZ3JhdGlvbi5qc3knXG5pbXBvcnQgRW5kcG9pbnRCYXNlIGZyb20gJy4vZW5kcG9pbnQuanN5J1xuaW1wb3J0IEVQVGFyZ2V0QmFzZSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5pbXBvcnQgU2lua0Jhc2UgZnJvbSAnLi9zaW5rLmpzeSdcbmltcG9ydCBNc2dDdHhCYXNlIGZyb20gJy4vbXNnY3R4LmpzeSdcblxuY29uc3QgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyA9IEA6XG4gIHBsdWdpbl9uYW1lOiAnZW5kcG9pbnQnXG4gIG9uX21zZyh7bXNnLCByZXBseSwgaW5mb30pIDo6XG4gICAgY29uc29sZS53YXJuIEAgJ0VORFBPSU5UIE1TRzonLCBAe30gbXNnLCByZXBseSwgaW5mb1xuICBvbl9lcnJvcihlcCwgZXJyLCBleHRyYSkgOjpcbiAgICBjb25zb2xlLmVycm9yIEAgJ0VORFBPSU5UIEVSUk9SOicsIGVyclxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIC8vIHJldHVybiBmYWxzZSB0byBwcmV2ZW50IGF1dG8tc2h1dGRvd25cbiAgb25fc2h1dGRvd24oZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgLy8gY29uc3Qge21zZywgcGt0fSA9IGV4dHJhXG4gICAgY29uc29sZS5lcnJvciBAIGBFTkRQT0lOVCBTSFVURE9XTjogJHtlcnIubWVzc2FnZX1gXG5cbiAgc3ViY2xhc3MoY2xhc3NlcykgOjpcbiAgICAvL2NvbnN0IHtFbmRwb2ludCwgRVBUYXJnZXQsIFNpbmssIE1zZ0N0eCwgcHJvdG9jb2xzfSA9IGNsYXNzZXNcbiAgICByZXR1cm4gY2xhc3Nlc1xuXG4gIGpzb25fcGFjazogSlNPTi5zdHJpbmdpZnlcbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKSAvLyBMUlVNYXAsIEhhc2hiZWx0TWFwXG4gIGNyZWF0ZVJvdXRlQ2FjaGUoKSA6OiByZXR1cm4gbmV3IE1hcCgpIC8vIExSVU1hcCwgSGFzaGJlbHRNYXBcblxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihwbHVnaW5fb3B0aW9ucykgOjpcbiAgcGx1Z2luX29wdGlvbnMgPSBPYmplY3QuYXNzaWduIEAge30sIGRlZmF1bHRfcGx1Z2luX29wdGlvbnMsIHBsdWdpbl9vcHRpb25zXG4gIGNvbnN0IEB7fVxuICAgIHBsdWdpbl9uYW1lLCByYW5kb21faWQsIGpzb25fcGFja1xuICAgIG9uX21zZzogZGVmYXVsdF9vbl9tc2dcbiAgICBvbl9lcnJvcjogZGVmYXVsdF9vbl9lcnJvclxuICAgIG9uX3NodXRkb3duOiBkZWZhdWx0X29uX3NodXRkb3duXG4gICAgY3JlYXRlTWFwLCBjcmVhdGVSb3V0ZUNhY2hlXG4gID0gcGx1Z2luX29wdGlvbnNcblxuICByZXR1cm4gQDogb3JkZXI6IDEsIHN1YmNsYXNzLCBwb3N0XG4gIFxuICBmdW5jdGlvbiBzdWJjbGFzcyhGYWJyaWNIdWJfUEksIGJhc2VzKSA6OlxuICAgIGNvbnN0IHtwYWNrZXRQYXJzZXJ9ID0gRmFicmljSHViX1BJLnByb3RvdHlwZVxuICAgIGlmIG51bGw9PXBhY2tldFBhcnNlciB8fCAhIHBhY2tldFBhcnNlci5pc1BhY2tldFBhcnNlcigpIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEludmFsaWQgcGFja2V0UGFyc2VyIGZvciBwbHVnaW5gXG4gICAgXG4gICAgRmFicmljSHViX1BJLnByb3RvdHlwZVtwbHVnaW5fbmFtZV0gPVxuICAgICAgYmluZEVuZHBvaW50QXBpIEAgcGFja2V0UGFyc2VyXG5cbiAgZnVuY3Rpb24gcG9zdChodWIpIDo6XG4gICAgcmV0dXJuIGh1YltwbHVnaW5fbmFtZV0gPSBodWJbcGx1Z2luX25hbWVdKGh1YilcblxuICBmdW5jdGlvbiBiaW5kRW5kcG9pbnRBcGkocGFja2V0UGFyc2VyKSA6OlxuICAgIGNvbnN0IHByb3RvY29scyA9IGluaXRfcHJvdG9jb2wgQCBwYWNrZXRQYXJzZXIsIEB7fSByYW5kb21faWQsIGpzb25fcGFja1xuXG4gICAgY29uc3Qge0VuZHBvaW50LCBFUFRhcmdldCwgU2luaywgTXNnQ3R4fSA9XG4gICAgICBwbHVnaW5fb3B0aW9ucy5zdWJjbGFzcyBAOlxuICAgICAgICBwcm90b2NvbHMsXG4gICAgICAgIFNpbms6IFNpbmtCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIE1zZ0N0eDogTXNnQ3R4QmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgICAgICBFbmRwb2ludDogRW5kcG9pbnRCYXNlLnN1YmNsYXNzKHtjcmVhdGVNYXB9KVxuICAgICAgICBFUFRhcmdldDogRVBUYXJnZXRCYXNlLnN1YmNsYXNzKHt9KVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGh1YikgOjpcbiAgICAgIGxldCBfY2xpZW50X3JyY1xuICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQDogY3JlYXRlLCBzZXJ2ZXI6IGVuZHBvaW50LCBjbGllbnQsIGNsaWVudEVuZHBvaW50XG5cblxuICAgICAgZnVuY3Rpb24gZW5kcG9pbnQob25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgdGFyZ2V0cyA9IGh1Yi5yb3V0ZXIudGFyZ2V0c1xuICAgICAgICBkbyB2YXIgaWRfdGFyZ2V0ID0gcmFuZG9tX2lkKClcbiAgICAgICAgd2hpbGUgdGFyZ2V0cy5oYXMgQCBpZF90YXJnZXRcbiAgICAgICAgcmV0dXJuIGNyZWF0ZSBAIGlkX3RhcmdldCwgb25faW5pdFxuXG4gICAgICBmdW5jdGlvbiBjcmVhdGUoaWRfdGFyZ2V0LCBvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCBoYW5kbGVycyA9IE9iamVjdC5jcmVhdGUobnVsbClcbiAgICAgICAgY29uc3QgaWQgPSBAe30gaWRfdGFyZ2V0LCBpZF9yb3V0ZXI6IGh1Yi5yb3V0ZXIuaWRfc2VsZlxuICAgICAgICBjb25zdCBlcF90Z3QgPSBuZXcgRVBUYXJnZXQgQCBpZFxuICAgICAgICBjb25zdCBtc2dfY3R4ID0gbmV3IE1zZ0N0eCBAIGVwX3RndCwgYmluZFJvdXRlQ2hhbm5lbChodWIsIGNyZWF0ZVJvdXRlQ2FjaGUodHJ1ZSkpXG4gICAgICAgIGNvbnN0IGVwID0gbmV3IEVuZHBvaW50IEAgaWQsIG1zZ19jdHgsIGVwX3RndFxuXG4gICAgICAgIGNvbnN0IHJlYWR5ID0gUHJvbWlzZVxuICAgICAgICAgIC5yZXNvbHZlIEAgb25faW5pdChlcCwgaHViKVxuICAgICAgICAgIC50aGVuIEAgX2FmdGVyX2luaXRcblxuICAgICAgICByZWFkeS5jYXRjaCBAIGVyciA9PlxuICAgICAgICAgIGhhbmRsZXJzLm9uX2Vycm9yIEAgZXJyLCBAe30gem9uZTonb25fcmVhZHknXG5cbiAgICAgICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgZXBfdGd0LCBAe31cbiAgICAgICAgICByZWFkeTogQHt9IHZhbHVlOiByZWFkeS50aGVuIEAgKCkgPT4gZXBfdGd0XG5cblxuICAgICAgICBmdW5jdGlvbiBfYWZ0ZXJfaW5pdCh0YXJnZXQpIDo6XG4gICAgICAgICAgaWYgbnVsbCA9PSB0YXJnZXQgOjpcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgZW5kcG9pbnQgaW5pdCB0byByZXR1cm4gYSBjbG9zdXJlIG9yIGludGVyZmFjZWBcblxuICAgICAgICAgIGhhbmRsZXJzLm9uX21zZyA9ICh0YXJnZXQub25fbXNnIHx8ICgnZnVuY3Rpb24nID09PSB0eXBlb2YgdGFyZ2V0ID8gdGFyZ2V0IDogZGVmYXVsdF9vbl9tc2cpKS5iaW5kKHRhcmdldClcbiAgICAgICAgICBoYW5kbGVycy5vbl9lcnJvciA9ICh0YXJnZXQub25fZXJyb3IgfHwgZGVmYXVsdF9vbl9lcnJvcikuYmluZCh0YXJnZXQsIGVwKVxuICAgICAgICAgIGhhbmRsZXJzLm9uX3NodXRkb3duID0gKHRhcmdldC5vbl9zaHV0ZG93biB8fCBkZWZhdWx0X29uX3NodXRkb3duKS5iaW5kKHRhcmdldCwgZXApXG5cbiAgICAgICAgICBjb25zdCBqc29uX3VucGFjayA9IHRhcmdldC5qc29uX3VucGFja1xuICAgICAgICAgICAgPyB0YXJnZXQuanNvbl91bnBhY2suYmluZCh0YXJnZXQpXG4gICAgICAgICAgICA6IEVQVGFyZ2V0Lmpzb25VbnBhY2sobXNnX2N0eClcblxuICAgICAgICAgIGNvbnN0IHNpbmsgPSBuZXcgU2luayBAIGpzb25fdW5wYWNrXG4gICAgICAgICAgc2luay5yZWdpc3RlciBAIGVwLCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnNcblxuICAgICAgICAgIHJldHVybiB0YXJnZXQub25fcmVhZHlcbiAgICAgICAgICAgID8gdGFyZ2V0Lm9uX3JlYWR5KGVwLCBodWIpXG4gICAgICAgICAgICA6IHRhcmdldFxuXG5cblxuICAgICAgZnVuY3Rpb24gY2xpZW50RW5kcG9pbnQob25fcmVhZHkpIDo6XG4gICAgICAgIGxldCBlcF90Z3QsIGRvbmUgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICAgICAgZXBfdGd0ID0gZW5kcG9pbnQgQCBlcCA9PiBAOlxuICAgICAgICAgICAgYXN5bmMgb25fcmVhZHkoZXAsIGh1YikgOjpcbiAgICAgICAgICAgICAgcmVzb2x2ZSBAIGF3YWl0IG9uX3JlYWR5KGVwLCBodWIpXG4gICAgICAgICAgICAgIGVwLnNodXRkb3duKClcblxuICAgICAgICAgICAgb25fc2h1dGRvd24oZXApIDo6IHJlamVjdCgpXG4gICAgICAgICAgICBvbl9zZW5kX2Vycm9yKGVwLCBlcnIpIDo6IHJlamVjdChlcnIpXG5cbiAgICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24gQCBlcF90Z3QsIEB7fVxuICAgICAgICAgIHRoZW4oeSxuKSA6OiByZXR1cm4gZG9uZS50aGVuKHksbilcbiAgICAgICAgICBjYXRjaChuKSA6OiByZXR1cm4gZG9uZS5jYXRjaChuKVxuICAgICAgICAgIGRvbmVcblxuXG4gICAgICBmdW5jdGlvbiBjbGllbnQoLi4uYXJncykgOjpcbiAgICAgICAgaWYgMSA9PT0gYXJncy5sZW5ndGggJiYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGFyZ3NbMF0gOjpcbiAgICAgICAgICByZXR1cm4gY2xpZW50RW5kcG9pbnQoYXJnc1swXSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgPT09IF9jbGllbnRfcnJjIDo6XG4gICAgICAgICAgX2NsaWVudF9ycmMgPSBiaW5kUm91dGVDaGFubmVsKGh1YiwgY3JlYXRlUm91dGVDYWNoZShmYWxzZSkpXG5cbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IG5ldyBNc2dDdHggQCBudWxsLCBfY2xpZW50X3JyY1xuICAgICAgICByZXR1cm4gMCAhPT0gYXJncy5sZW5ndGggPyBtc2dfY3R4LnRvKC4uLmFyZ3MpIDogbXNnX2N0eFxuXG4iLCJpbXBvcnQge3JhbmRvbUJ5dGVzfSBmcm9tICdjcnlwdG8nXG5pbXBvcnQgZW5kcG9pbnRfcGx1Z2luIGZyb20gJy4vcGx1Z2luLmpzeSdcblxuZW5kcG9pbnRfbm9kZWpzLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuZnVuY3Rpb24gcmFuZG9tX2lkKCkgOjpcbiAgcmV0dXJuIHJhbmRvbUJ5dGVzKDQpLnJlYWRJbnQzMkxFKClcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gZW5kcG9pbnRfbm9kZWpzKHBsdWdpbl9vcHRpb25zPXt9KSA6OlxuICBpZiBudWxsID09IHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA6OlxuICAgIHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuXG4gIHJldHVybiBlbmRwb2ludF9wbHVnaW4ocGx1Z2luX29wdGlvbnMpXG5cbiJdLCJuYW1lcyI6WyJsaXR0bGVfZW5kaWFuIiwiY19zaW5nbGUiLCJjX2RhdGFncmFtIiwiY19kaXJlY3QiLCJjX211bHRpcGFydCIsImNfc3RyZWFtaW5nIiwiX2Vycl9tc2dpZF9yZXF1aXJlZCIsIl9lcnJfdG9rZW5fcmVxdWlyZWQiLCJmcm1fcm91dGluZyIsInNpemUiLCJiaXRzIiwibWFzayIsIm9iaiIsImZyb21faWQiLCJkdiIsIm9mZnNldCIsInNldEludDMyIiwiaWRfcm91dGVyIiwiaWRfdGFyZ2V0IiwidW5kZWZpbmVkIiwiZ2V0SW50MzIiLCJmcm1fcmVzcG9uc2UiLCJtc2dpZCIsIkVycm9yIiwic2V0SW50MTYiLCJzZXFfYWNrIiwiYWNrX2ZsYWdzIiwidG9rZW4iLCJnZXRJbnQxNiIsImZybV9kYXRhZ3JhbSIsInRyYW5zcG9ydCIsImZybV9kaXJlY3QiLCJmcm1fbXVsdGlwYXJ0Iiwic2VxX3BvcyIsInNlcSIsInNlcV9mbGFncyIsImZybV9zdHJlYW1pbmciLCJiaW5kX3NlcV9uZXh0Iiwic2VxX29mZnNldCIsInNlcV9uZXh0IiwiZmxhZ3MiLCJmaW4iLCJOYU4iLCJjb21wb3NlRnJhbWluZ3MiLCJmcm1fZnJvbSIsImZybV9yZXNwIiwiZnJtX3RyYW5zcG9ydHMiLCJsZW5ndGgiLCJieUJpdHMiLCJ0X2Zyb20iLCJmX3Rlc3QiLCJ0X3Jlc3AiLCJ0MCIsInQxIiwidDIiLCJ0MyIsIm1hcCIsImYiLCJ0ZXN0Qml0cyIsImNob29zZSIsImxzdCIsIlQiLCJiIiwib3AiLCJmbl9rZXkiLCJmbl90cmFuIiwiZm5fZnJvbSIsImZuX3Jlc3AiLCJmcm0iLCJiaW5kQXNzZW1ibGVkIiwiZl9wYWNrIiwiZl91bnBhY2siLCJwYWNrIiwidW5wYWNrIiwicGt0X3R5cGUiLCJwa3Rfb2JqIiwiVHlwZUVycm9yIiwidHlwZSIsIkRhdGFWaWV3IiwiQXJyYXlCdWZmZXIiLCJoZWFkZXIiLCJidWZmZXIiLCJzbGljZSIsInBrdCIsImJ1ZiIsImhlYWRlcl9idWZmZXIiLCJVaW50OEFycmF5IiwiaW5mbyIsIl9iaW5kX2l0ZXJhYmxlIiwiYnVmX2Nsb25lIiwidHRsIiwibmV4dCIsIm9wdGlvbnMiLCJkb25lIiwidmFsdWUiLCJwYWNrZXRQYXJzZXIiLCJmcmFnbWVudF9zaXplIiwiY29uY2F0QnVmZmVycyIsInBhY2tQYWNrZXRPYmoiLCJwYWNrX3V0ZjgiLCJ1bnBhY2tfdXRmOCIsIk51bWJlciIsInJhbmRvbV9pZCIsImpzb25fcGFjayIsImNyZWF0ZVN0cmVhbSIsInBhY2tldEZyYWdtZW50cyIsImNyZWF0ZU11bHRpcGFydCIsInNpbmsiLCJwYXJ0cyIsImZlZWQiLCJib2R5X2J1ZmZlciIsImluY2x1ZGVzIiwiZGVsZXRlU3RhdGVGb3IiLCJyZXMiLCJyZWN2RGF0YSIsInJzdHJlYW0iLCJzdGF0ZSIsImZlZWRfaW5pdCIsImFzX2NvbnRlbnQiLCJmZWVkX2lnbm9yZSIsIm1zZyIsImpzb25fdW5wYWNrIiwiYm9keV91dGY4IiwicmVjdlN0cmVhbSIsInJlY3ZTdHJlYW1EYXRhIiwiYmluZCIsImVyciIsIm9uX2Vycm9yIiwiZmVlZF9ib2R5Iiwib25faW5pdCIsImRhdGEiLCJvbl9kYXRhIiwib25fZW5kIiwiZmVlZF9zZXEiLCJuZXh0X2hkciIsImkiLCJsYXN0SW5uZXIiLCJieXRlTGVuZ3RoIiwiaTAiLCJib2R5IiwiYmluZFRyYW5zcG9ydEltcGxzIiwiaW5ib3VuZCIsImhpZ2hiaXRzIiwidHJhbnNwb3J0cyIsIm91dGJvdW5kIiwiZnJhbWluZ3MiLCJmcmFtZSIsImltcGwiLCJ0X3JlY3YiLCJwYWNrX2hkciIsInJlY3ZfbXNnIiwiYmluZFRyYW5zcG9ydHMiLCJwYWNrQm9keSIsInN0cmVhbWluZyIsInNlbmQiLCJzdHJlYW0iLCJiaW5kX3N0cmVhbSIsIm1vZGUiLCJjaGFuIiwibXNlbmQiLCJtc2VuZF9ieXRlcyIsIm1zZW5kX29iamVjdHMiLCJtc2VuZF9pbXBsIiwib2JqZWN0IiwiYnl0ZXMiLCJ3cml0ZSIsImVuZCIsImNodW5rIiwiY2hlY2tfZm5zIiwia2V5cyIsImtleSIsImpzb25fcHJvdG9jb2wiLCJzaGFyZWQiLCJkYXRhZ3JhbSIsImRpcmVjdCIsInJlY3ZNc2ciLCJzdGF0ZUZvciIsImJvZHlfYnVmIiwidW5wYWNrQm9keSIsImJpbmFyeV9wcm90b2NvbCIsImFzQnVmZmVyIiwicGt0X2J1ZmZlciIsImNvbnRyb2xfcHJvdG9jb2wiLCJoaWdoIiwicGluZ19mcmFtZSIsInBvbmdfZnJhbWUiLCJwb25nX3R5cGUiLCJyZWN2X3BvbmciLCJwaW5nX3R5cGUiLCJyZWN2X3BpbmciLCJwaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsInRzMCIsIkRhdGUiLCJyb3V0ZXIiLCJib2R5X2pzb24iLCJyZWN2Q3RybCIsIl9zZW5kX3BvbmciLCJwa3RfcGluZyIsInJfaWQiLCJ0czEiLCJkaXNwYXRjaCIsImluaXRfcHJvdG9jb2wiLCJzaGFyZWRfcHJvdG8iLCJqc29uIiwianNvbl9wcm90byIsImJpbmFyeSIsImJpbmFyeV9wcm90byIsImNvbnRyb2wiLCJjb250cm9sX3Byb3RvIiwiY29kZWNzIiwiZGVmYXVsdCIsImJpbmRSb3V0ZUNoYW5uZWwiLCJodWIiLCJjYWNoZSIsImNoYW5uZWwiLCJjb25uZWN0X3NlbGYiLCJyZXNvbHZlUm91dGUiLCJyb3V0ZXMiLCJjYWNoZVJvdXRlQ2hhbm5lbCIsInJlc29sdmVSb3V0ZUNoYW5uZWwiLCJnZXQiLCJzZXQiLCJyb3V0ZSIsImRpc2NvIiwiaGFzIiwiZGVsZXRlIiwiRW5kcG9pbnQiLCJzdWJjbGFzcyIsImV4dGVuc2lvbnMiLCJhc3NpZ24iLCJwcm90b3R5cGUiLCJpZCIsImVuY29kZSIsIm1zZ19jdHgiLCJlcF90Z3QiLCJ3aXRoRW5kcG9pbnQiLCJhc1NlbmRlciIsImNvbnN0cnVjdG9yIiwianNvbl9hc19zZW5kZXIiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiZW51bWVyYWJsZSIsInRvIiwiTWFwIiwiY3JlYXRlTWFwIiwiYnlfdG9rZW4iLCJjcmVhdGVSZXBseU1hcCIsImJ5X3RyYWZmaWMiLCJjcmVhdGVUcmFmZmljTWFwIiwidHJhZmZpYyIsInRzIiwibm93IiwidCIsInJlY3ZUcmFmZmljIiwiY3JlYXRlU3RhdGVNYXAiLCJyZXBseSIsInJtc2ciLCJyZXNvbHZlIiwidGhlbiIsImlzX3JlcGx5Iiwic2VuZGVyIiwid2FybiIsImluaXRSZXBseSIsInBfc2VudCIsImluaXRSZXBseVByb21pc2UiLCJtb25pdG9yIiwiUHJvbWlzZSIsInJlamVjdCIsImNhdGNoIiwid2l0aFJlamVjdFRpbWVvdXQiLCJjbGVhciIsIkVQVGFyZ2V0IiwibXNnX2luZm8iLCJwcm9wcyIsInNpbXBsZSIsImVwX2VuY29kZSIsImZhc3RfanNvbiIsIk9iamVjdCIsImZyb21fanNvbiIsImpzb25VbnBhY2siLCJ4Zm9ybUJ5S2V5IiwiY3JlYXRlIiwidiIsImVwX2RlY29kZSIsImpzb25VbnBhY2tCeUtleSIsInJlZyIsIldlYWtNYXAiLCJzeiIsInBhcnNlIiwicmV2aXZlciIsInhmbiIsInZmbiIsImJpbmRDdHhQcm9wcyIsImluaXQiLCJjdHgiLCJxdWVyeSIsInJlcGx5RXhwZWN0ZWQiLCJyIiwidG9TdHJpbmciLCJzcGxpdCIsInBhcnNlSW50IiwiU2luayIsImZvclByb3RvY29scyIsIl9wcm90b2NvbCIsImVuZHBvaW50IiwiaGFuZGxlcnMiLCJ1bnJlZ2lzdGVyIiwidW5yZWdpc3RlclRhcmdldCIsInJlZ2lzdGVyVGFyZ2V0IiwiX2JpbmREaXNwYXRjaCIsIm9uX21zZyIsIm9uX3NodXRkb3duIiwiYWxpdmUiLCJwcm90b2NvbCIsImlzQWxpdmUiLCJzaHV0ZG93biIsImV4dHJhIiwiYmluZFNpbmsiLCJ6b25lIiwidGVybWluYXRlIiwiaWZBYnNlbnQiLCJlbnRyeSIsImJ5X21zZ2lkIiwiTXNnQ3R4Iiwid2l0aENvZGVjcyIsImZyZWV6ZSIsIl9pbnZva2VfZXgiLCJfbXNnQ29kZWNzIiwiYXJncyIsIl9jb2RlYyIsImZuT3JLZXkiLCJpbnZva2UiLCJhc3NlcnRNb25pdG9yIiwidGd0Iiwic2VsZiIsImNsb25lIiwicmVwbHlfaWQiLCJ3aXRoIiwiX3Jvb3RfIiwiY2hlY2tNb25pdG9yIiwiYWN0aXZlIiwiaW5pdE1vbml0b3IiLCJ0c19kdXJhdGlvbiIsInRzX2FjdGl2ZSIsInByb21pc2UiLCJ0ZCIsInRpZCIsInRzX2ludGVydmFsIiwiY3RybCIsImNvZGVjIiwiY2hlY2tQaW5nIiwic2V0SW50ZXJ2YWwiLCJ1bnJlZiIsImNsZWFySW50ZXJ2YWwiLCJtc2dfY29kZWMiLCJtc2dDb2RlY3MiLCJuYW1lIiwiZW50cmllcyIsImpzb25fc2VuZCIsInBfcmVwbHkiLCJ0aW1lb3V0IiwiUmVwbHlUaW1lb3V0Iiwic2V0VGltZW91dCIsIm1zX3RpbWVvdXQiLCJkZWZhdWx0X3BsdWdpbl9vcHRpb25zIiwiZXAiLCJlcnJvciIsIm1lc3NhZ2UiLCJjbGFzc2VzIiwiY3JlYXRlUm91dGVDYWNoZSIsInBsdWdpbl9vcHRpb25zIiwiZGVmYXVsdF9vbl9tc2ciLCJkZWZhdWx0X29uX2Vycm9yIiwiZGVmYXVsdF9vbl9zaHV0ZG93biIsIm9yZGVyIiwicG9zdCIsIkZhYnJpY0h1Yl9QSSIsImJhc2VzIiwiaXNQYWNrZXRQYXJzZXIiLCJwbHVnaW5fbmFtZSIsImJpbmRFbmRwb2ludEFwaSIsInByb3RvY29scyIsIlNpbmtCYXNlIiwiTXNnQ3R4QmFzZSIsIkVuZHBvaW50QmFzZSIsIkVQVGFyZ2V0QmFzZSIsIl9jbGllbnRfcnJjIiwic2VydmVyIiwiY2xpZW50IiwiY2xpZW50RW5kcG9pbnQiLCJ0YXJnZXRzIiwiaWRfc2VsZiIsInJlYWR5IiwiX2FmdGVyX2luaXQiLCJ0YXJnZXQiLCJyZWdpc3RlciIsIm9uX3JlYWR5IiwieSIsIm4iLCJlbmRwb2ludF9ub2RlanMiLCJyYW5kb21CeXRlcyIsInJlYWRJbnQzMkxFIiwiZW5kcG9pbnRfcGx1Z2luIl0sIm1hcHBpbmdzIjoiOzs7O0FBQUEsTUFBTUEsZ0JBQWdCLElBQXRCO0FBQ0EsTUFBTUMsV0FBVyxRQUFqQjtBQUNBLE1BQU1DLGFBQWEsVUFBbkI7QUFDQSxNQUFNQyxXQUFXLFFBQWpCO0FBQ0EsTUFBTUMsY0FBYyxXQUFwQjtBQUNBLE1BQU1DLGNBQWMsV0FBcEI7O0FBRUEsTUFBTUMsc0JBQXVCLDBCQUE3QjtBQUNBLE1BQU1DLHNCQUF1QiwyQkFBN0I7O0FBR0EsU0FBU0MsV0FBVCxHQUF1QjtRQUNmQyxPQUFPLENBQWI7UUFBZ0JDLE9BQU8sR0FBdkI7UUFBNEJDLE9BQU8sR0FBbkM7U0FDTztRQUFBLEVBQ0NELElBREQsRUFDT0MsSUFEUDs7V0FHRUMsR0FBUCxFQUFZO2FBQVUsUUFBUUEsSUFBSUMsT0FBWixHQUFzQkgsSUFBdEIsR0FBNkIsS0FBcEM7S0FIVjs7V0FLRUUsR0FBUCxFQUFZRSxFQUFaLEVBQWdCQyxNQUFoQixFQUF3QjtZQUNoQixFQUFDRixPQUFELEtBQVlELEdBQWxCO1NBQ0dJLFFBQUgsQ0FBYyxJQUFFRCxNQUFoQixFQUF3QixJQUFFRixRQUFRSSxTQUFsQyxFQUE2Q2pCLGFBQTdDO1NBQ0dnQixRQUFILENBQWMsSUFBRUQsTUFBaEIsRUFBd0IsSUFBRUYsUUFBUUssU0FBbEMsRUFBNkNsQixhQUE3QztLQVJHOzthQVVJWSxHQUFULEVBQWNFLEVBQWQsRUFBa0JDLE1BQWxCLEVBQTBCO1lBQ2xCRixVQUFVTSxjQUFjUCxJQUFJQyxPQUFsQixHQUNaRCxJQUFJQyxPQUFKLEdB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

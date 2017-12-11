'use strict';

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

module.exports = endpoint_browser;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3Nlci5qcyIsInNvdXJjZXMiOlsiLi4vY29kZS9wcm90b2NvbC9mcmFtaW5nLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvc2hhcmVkLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvanNvbi5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2JpbmFyeS5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2NvbnRyb2wuanN5IiwiLi4vY29kZS9wcm90b2NvbC9pbmRleC5qc3kiLCIuLi9jb2RlL2NvcmVfaW50ZWdyYXRpb24uanN5IiwiLi4vY29kZS9lbmRwb2ludC5qc3kiLCIuLi9jb2RlL2VwX3RhcmdldC5qc3kiLCIuLi9jb2RlL3NpbmsuanN5IiwiLi4vY29kZS9tc2djdHguanN5IiwiLi4vY29kZS9wbHVnaW4uanN5IiwiLi4vY29kZS9pbmRleC5icm93c2VyLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBsaXR0bGVfZW5kaWFuID0gdHJ1ZVxuY29uc3QgY19zaW5nbGUgPSAnc2luZ2xlJ1xuY29uc3QgY19kYXRhZ3JhbSA9ICdkYXRhZ3JhbSdcbmNvbnN0IGNfZGlyZWN0ID0gJ2RpcmVjdCdcbmNvbnN0IGNfbXVsdGlwYXJ0ID0gJ211bHRpcGFydCdcbmNvbnN0IGNfc3RyZWFtaW5nID0gJ3N0cmVhbWluZydcblxuY29uc3QgX2Vycl9tc2dpZF9yZXF1aXJlZCA9IGBSZXNwb25zZSByZXFpcmVzICdtc2dpZCdgXG5jb25zdCBfZXJyX3Rva2VuX3JlcXVpcmVkID0gYFRyYW5zcG9ydCByZXFpcmVzICd0b2tlbidgXG5cblxuZnVuY3Rpb24gZnJtX3JvdXRpbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MSwgbWFzayA9IDB4MVxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLmZyb21faWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCB7ZnJvbV9pZH0gPSBvYmpcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF9yb3V0ZXIsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDMyIEAgNCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF90YXJnZXQsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IGZyb21faWQgPSB1bmRlZmluZWQgPT09IG9iai5mcm9tX2lkXG4gICAgICAgID8gb2JqLmZyb21faWQgPSB7fSA6IG9iai5mcm9tX2lkXG4gICAgICBmcm9tX2lkLmlkX3JvdXRlciA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGZyb21faWQuaWRfdGFyZ2V0ID0gZHYuZ2V0SW50MzIgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5mdW5jdGlvbiBmcm1fcmVzcG9uc2UoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MiwgbWFzayA9IDB4MlxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLm1zZ2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoubXNnaWQgOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl9tc2dpZF9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLm1zZ2lkLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXFfYWNrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5hY2tfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50b2tlbiA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfYWNrID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLmFja19mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuXG5cbmZ1bmN0aW9uIGZybV9kYXRhZ3JhbSgpIDo6XG4gIGNvbnN0IHNpemUgPSAwLCBiaXRzID0gMHgwLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RhdGFncmFtXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGF0YWdyYW0gPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kYXRhZ3JhbVxuXG5mdW5jdGlvbiBmcm1fZGlyZWN0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDQsIGJpdHMgPSAweDQsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGlyZWN0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGlyZWN0ID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGlyZWN0XG5cbmZ1bmN0aW9uIGZybV9tdWx0aXBhcnQoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4OCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19tdWx0aXBhcnRcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19tdWx0aXBhcnQgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjogLy8gdXNlIHNlcV9uZXh0XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX211bHRpcGFydFxuXG5mdW5jdGlvbiBmcm1fc3RyZWFtaW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweGMsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfc3RyZWFtaW5nXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfc3RyZWFtaW5nID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW4gLy8gdXNlIHNlcV9uZXh0XG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19zdHJlYW1pbmdcblxuXG5mdW5jdGlvbiBiaW5kX3NlcV9uZXh0KG9mZnNldCkgOjpcbiAgY29uc3Qgc2VxX29mZnNldCA9IHRoaXMuc2VxX3BvcyArIG9mZnNldFxuICBsZXQgc2VxID0gMVxuICByZXR1cm4gZnVuY3Rpb24gc2VxX25leHQoe2ZsYWdzLCBmaW59LCBkdikgOjpcbiAgICBpZiAhIGZpbiA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCBzZXErKywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICBlbHNlIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIC1zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgICBzZXEgPSBOYU5cblxuXG5cbmV4cG9ydCBkZWZhdWx0IGNvbXBvc2VGcmFtaW5ncygpXG5mdW5jdGlvbiBjb21wb3NlRnJhbWluZ3MoKSA6OlxuICBjb25zdCBmcm1fZnJvbSA9IGZybV9yb3V0aW5nKCksIGZybV9yZXNwID0gZnJtX3Jlc3BvbnNlKClcbiAgY29uc3QgZnJtX3RyYW5zcG9ydHMgPSBAW10gZnJtX2RhdGFncmFtKCksIGZybV9kaXJlY3QoKSwgZnJtX211bHRpcGFydCgpLCBmcm1fc3RyZWFtaW5nKClcblxuICBpZiA4ICE9PSBmcm1fZnJvbS5zaXplIHx8IDggIT09IGZybV9yZXNwLnNpemUgfHwgNCAhPSBmcm1fdHJhbnNwb3J0cy5sZW5ndGggOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgRnJhbWluZyBTaXplIGNoYW5nZWBcblxuICBjb25zdCBieUJpdHMgPSBbXSwgbWFzaz0weGZcblxuICA6OlxuICAgIGNvbnN0IHRfZnJvbSA9IGZybV9mcm9tLmZfdGVzdCwgdF9yZXNwID0gZnJtX3Jlc3AuZl90ZXN0XG4gICAgY29uc3QgW3QwLHQxLHQyLHQzXSA9IGZybV90cmFuc3BvcnRzLm1hcCBAIGY9PmYuZl90ZXN0XG5cbiAgICBjb25zdCB0ZXN0Qml0cyA9IGJ5Qml0cy50ZXN0Qml0cyA9IG9iaiA9PlxuICAgICAgMCB8IHRfZnJvbShvYmopIHwgdF9yZXNwKG9iaikgfCB0MChvYmopIHwgdDEob2JqKSB8IHQyKG9iaikgfCB0MyhvYmopXG5cbiAgICBieUJpdHMuY2hvb3NlID0gZnVuY3Rpb24gKG9iaiwgbHN0KSA6OlxuICAgICAgaWYgbnVsbCA9PSBsc3QgOjogbHN0ID0gdGhpcyB8fCBieUJpdHNcbiAgICAgIHJldHVybiBsc3RbdGVzdEJpdHMob2JqKV1cblxuXG4gIGZvciBjb25zdCBUIG9mIGZybV90cmFuc3BvcnRzIDo6XG4gICAgY29uc3Qge2JpdHM6Yiwgc2l6ZSwgdHJhbnNwb3J0fSA9IFRcblxuICAgIGJ5Qml0c1tifDBdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwwLCBtYXNrLCBzaXplOiBzaXplLCBvcDogJydcbiAgICBieUJpdHNbYnwxXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MSwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAnZidcbiAgICBieUJpdHNbYnwyXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MiwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAncidcbiAgICBieUJpdHNbYnwzXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MywgbWFzaywgc2l6ZTogMTYgKyBzaXplLCBvcDogJ2ZyJ1xuXG4gICAgZm9yIGNvbnN0IGZuX2tleSBvZiBbJ2ZfcGFjaycsICdmX3VucGFjayddIDo6XG4gICAgICBjb25zdCBmbl90cmFuID0gVFtmbl9rZXldLCBmbl9mcm9tID0gZnJtX2Zyb21bZm5fa2V5XSwgZm5fcmVzcCA9IGZybV9yZXNwW2ZuX2tleV1cblxuICAgICAgYnlCaXRzW2J8MF1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3RyYW4ob2JqLCBkdiwgMClcbiAgICAgIGJ5Qml0c1tifDFdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwyXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fcmVzcChvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8M11bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3Jlc3Aob2JqLCBkdiwgOCk7IGZuX3RyYW4ob2JqLCBkdiwgMTYpXG5cbiAgZm9yIGNvbnN0IGZybSBvZiBieUJpdHMgOjpcbiAgICBiaW5kQXNzZW1ibGVkIEAgZnJtXG5cbiAgcmV0dXJuIGJ5Qml0c1xuXG5cbmZ1bmN0aW9uIGJpbmRBc3NlbWJsZWQoZnJtKSA6OlxuICBjb25zdCB7VCwgc2l6ZSwgZl9wYWNrLCBmX3VucGFja30gPSBmcm1cbiAgaWYgVC5iaW5kX3NlcV9uZXh0IDo6XG4gICAgZnJtLnNlcV9uZXh0ID0gVC5iaW5kX3NlcV9uZXh0IEAgZnJtLnNpemUgLSBULnNpemVcblxuICBkZWxldGUgZnJtLlRcbiAgZnJtLnBhY2sgPSBwYWNrIDsgZnJtLnVucGFjayA9IHVucGFja1xuICBjb25zdCBzZXFfbmV4dCA9IGZybS5zZXFfbmV4dFxuXG4gIGZ1bmN0aW9uIHBhY2socGt0X3R5cGUsIHBrdF9vYmopIDo6XG4gICAgaWYgISBAIDAgPD0gcGt0X3R5cGUgJiYgcGt0X3R5cGUgPD0gMjU1IDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBrdF90eXBlIHRvIGJlIFswLi4yNTVdYFxuXG4gICAgcGt0X29iai50eXBlID0gcGt0X3R5cGVcbiAgICBpZiBzZXFfbmV4dCAmJiBudWxsID09IHBrdF9vYmouc2VxIDo6XG4gICAgICBwa3Rfb2JqLnNlcSA9IHRydWVcblxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IEFycmF5QnVmZmVyKHNpemUpXG4gICAgZl9wYWNrKHBrdF9vYmosIGR2LCAwKVxuICAgIHBrdF9vYmouaGVhZGVyID0gZHYuYnVmZmVyXG5cbiAgICBpZiB0cnVlID09PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgX2JpbmRfaXRlcmFibGUgQCBwa3Rfb2JqLCBkdi5idWZmZXIuc2xpY2UoMCxzaXplKVxuXG4gIGZ1bmN0aW9uIHVucGFjayhwa3QpIDo6XG4gICAgY29uc3QgYnVmID0gcGt0LmhlYWRlcl9idWZmZXIoKVxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IFVpbnQ4QXJyYXkoYnVmKS5idWZmZXJcblxuICAgIGNvbnN0IGluZm8gPSB7fVxuICAgIGZfdW5wYWNrKGluZm8sIGR2LCAwKVxuICAgIHJldHVybiBwa3QuaW5mbyA9IGluZm9cblxuICBmdW5jdGlvbiBfYmluZF9pdGVyYWJsZShwa3Rfb2JqLCBidWZfY2xvbmUpIDo6XG4gICAgY29uc3Qge3R5cGV9ID0gcGt0X29ialxuICAgIGNvbnN0IHtpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHRsLCB0b2tlbn0gPSBwa3Rfb2JqXG4gICAgcGt0X29iai5uZXh0ID0gbmV4dFxuXG4gICAgZnVuY3Rpb24gbmV4dChvcHRpb25zKSA6OlxuICAgICAgaWYgbnVsbCA9PSBvcHRpb25zIDo6IG9wdGlvbnMgPSB7fVxuICAgICAgY29uc3QgaGVhZGVyID0gYnVmX2Nsb25lLnNsaWNlKClcbiAgICAgIHNlcV9uZXh0IEAgb3B0aW9ucywgbmV3IERhdGFWaWV3IEAgaGVhZGVyXG4gICAgICByZXR1cm4gQHt9IGRvbmU6ICEhIG9wdGlvbnMuZmluLCB2YWx1ZTogQHt9IC8vIHBrdF9vYmpcbiAgICAgICAgaWRfcm91dGVyLCBpZF90YXJnZXQsIHR5cGUsIHR0bCwgdG9rZW4sIGhlYWRlclxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGFja2V0UGFyc2VyLCBvcHRpb25zLCBmcmFnbWVudF9zaXplKSA6OlxuICBjb25zdCB7Y29uY2F0QnVmZmVycywgcGFja1BhY2tldE9iaiwgcGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBwYWNrZXRQYXJzZXJcbiAgZnJhZ21lbnRfc2l6ZSA9IE51bWJlcihmcmFnbWVudF9zaXplIHx8IDgwMDApXG4gIGlmIDEwMjQgPiBmcmFnbWVudF9zaXplIHx8IDY1MDAwIDwgZnJhZ21lbnRfc2l6ZSA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIGZyYWdtZW50IHNpemU6ICR7ZnJhZ21lbnRfc2l6ZX1gXG5cbiAgY29uc3Qge3JhbmRvbV9pZCwganNvbl9wYWNrfSA9IG9wdGlvbnNcbiAgcmV0dXJuIEA6IHBhY2tldFBhcnNlciwgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwgcGFja2V0RnJhZ21lbnRzXG4gICAgYmluZFRyYW5zcG9ydHNcblxuXG4gIGZ1bmN0aW9uIGNyZWF0ZU11bHRpcGFydChwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBwYXJ0cyA9IFtdLCBmaW4gPSBmYWxzZVxuICAgIHJldHVybiBAe30gZmVlZCwgaW5mbzogcGt0LmluZm9cblxuICAgIGZ1bmN0aW9uIGZlZWQocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxIDwgMCA6OiBmaW4gPSB0cnVlOyBzZXEgPSAtc2VxXG4gICAgICBwYXJ0c1tzZXEtMV0gPSBwa3QuYm9keV9idWZmZXIoKVxuXG4gICAgICBpZiAhIGZpbiA6OiByZXR1cm5cbiAgICAgIGlmIHBhcnRzLmluY2x1ZGVzIEAgdW5kZWZpbmVkIDo6IHJldHVyblxuXG4gICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuXG4gICAgICBjb25zdCByZXMgPSBjb25jYXRCdWZmZXJzKHBhcnRzKVxuICAgICAgcGFydHMgPSBudWxsXG4gICAgICByZXR1cm4gcmVzXG5cbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtKHBrdCwgc2luaywgbXNnaWQpIDo6XG4gICAgbGV0IG5leHQ9MCwgZmluID0gZmFsc2UsIHJlY3ZEYXRhLCByc3RyZWFtXG4gICAgY29uc3Qgc3RhdGUgPSBAe30gZmVlZDogZmVlZF9pbml0LCBpbmZvOiBwa3QuaW5mb1xuICAgIHJldHVybiBzdGF0ZVxuXG4gICAgZnVuY3Rpb24gZmVlZF9pbml0KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuXG4gICAgICBjb25zdCBpbmZvID0gcGt0LmluZm9cbiAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiAgICAgIHJzdHJlYW0gPSBzaW5rLnJlY3ZTdHJlYW0obXNnLCBpbmZvKVxuICAgICAgaWYgbnVsbCA9PSByc3RyZWFtIDo6IHJldHVyblxuICAgICAgY2hlY2tfZm5zIEAgcnN0cmVhbSwgJ29uX2Vycm9yJywgJ29uX2RhdGEnLCAnb25fZW5kJyBcbiAgICAgIHJlY3ZEYXRhID0gc2luay5yZWN2U3RyZWFtRGF0YS5iaW5kKHNpbmssIHJzdHJlYW0sIGluZm8pXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9ib2R5XG4gICAgICBpZiByc3RyZWFtLm9uX2luaXQgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25faW5pdChtc2csIHBrdClcblxuICAgIGZ1bmN0aW9uIGZlZWRfYm9keShwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICByZWN2RGF0YSgpXG4gICAgICBsZXQgZGF0YVxuICAgICAgdHJ5IDo6XG4gICAgICAgIGZlZWRfc2VxKHBrdClcbiAgICAgICAgZGF0YSA9IGFzX2NvbnRlbnQocGt0LCBzaW5rKVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgaWYgZmluIDo6XG4gICAgICAgIGNvbnN0IHJlcyA9IHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lbmQgQCByZXMsIHBrdFxuICAgICAgZWxzZSA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9kYXRhIEAgZGF0YSwgcGt0XG5cbiAgICBmdW5jdGlvbiBmZWVkX2lnbm9yZShwa3QpIDo6XG4gICAgICB0cnkgOjogZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG5cbiAgICBmdW5jdGlvbiBmZWVkX3NlcShwa3QpIDo6XG4gICAgICBsZXQgc2VxID0gcGt0LmluZm8uc2VxXG4gICAgICBpZiBzZXEgPj0gMCA6OlxuICAgICAgICBpZiBuZXh0KysgPT09IHNlcSA6OlxuICAgICAgICAgIHJldHVybiAvLyBpbiBvcmRlclxuICAgICAgZWxzZSA6OlxuICAgICAgICBmaW4gPSB0cnVlXG4gICAgICAgIHNpbmsuZGVsZXRlU3RhdGVGb3IobXNnaWQpXG4gICAgICAgIGlmIG5leHQgPT09IC1zZXEgOjpcbiAgICAgICAgICBuZXh0ID0gJ2RvbmUnXG4gICAgICAgICAgcmV0dXJuIC8vIGluLW9yZGVyLCBsYXN0IHBhY2tldFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcbiAgICAgIG5leHQgPSAnaW52YWxpZCdcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYWNrZXQgb3V0IG9mIHNlcXVlbmNlYFxuXG4gIGZ1bmN0aW9uICogcGFja2V0RnJhZ21lbnRzKGJ1ZiwgbmV4dF9oZHIsIGZpbikgOjpcbiAgICBpZiBudWxsID09IGJ1ZiA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICB5aWVsZCBvYmpcbiAgICAgIHJldHVyblxuXG4gICAgbGV0IGkgPSAwLCBsYXN0SW5uZXIgPSBidWYuYnl0ZUxlbmd0aCAtIGZyYWdtZW50X3NpemU7XG4gICAgd2hpbGUgaSA8IGxhc3RJbm5lciA6OlxuICAgICAgY29uc3QgaTAgPSBpXG4gICAgICBpICs9IGZyYWdtZW50X3NpemVcblxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoKVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaTAsIGkpXG4gICAgICB5aWVsZCBvYmpcblxuICAgIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkpXG4gICAgICB5aWVsZCBvYmpcblxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IG91dGJvdW5kID0gW11cbiAgICBvdXRib3VuZC5jaG9vc2UgPSBmcmFtaW5ncy5jaG9vc2VcblxuICAgIGZvciBjb25zdCBmcmFtZSBvZiBmcmFtaW5ncyA6OlxuICAgICAgY29uc3QgaW1wbCA9IGZyYW1lID8gdHJhbnNwb3J0c1tmcmFtZS50cmFuc3BvcnRdIDogbnVsbFxuICAgICAgaWYgISBpbXBsIDo6IGNvbnRpbnVlXG5cbiAgICAgIGNvbnN0IHtiaXRzLCBwYWNrLCB1bnBhY2t9ID0gZnJhbWVcbiAgICAgIGNvbnN0IHBrdF90eXBlID0gaGlnaGJpdHMgfCBiaXRzXG4gICAgICBjb25zdCB7dF9yZWN2fSA9IGltcGxcblxuICAgICAgZnVuY3Rpb24gcGFja19oZHIob2JqKSA6OlxuICAgICAgICBwYWNrKHBrdF90eXBlLCBvYmopXG4gICAgICAgIHJldHVybiBvYmpcblxuICAgICAgZnVuY3Rpb24gcmVjdl9tc2cocGt0LCBzaW5rKSA6OlxuICAgICAgICB1bnBhY2socGt0KVxuICAgICAgICByZXR1cm4gdF9yZWN2KHBrdCwgc2luaylcblxuICAgICAgcGFja19oZHIucGt0X3R5cGUgPSByZWN2X21zZy5wa3RfdHlwZSA9IHBrdF90eXBlXG4gICAgICBvdXRib3VuZFtiaXRzXSA9IHBhY2tfaGRyXG4gICAgICBpbmJvdW5kW3BrdF90eXBlXSA9IHJlY3ZfbXNnXG5cbiAgICAgIGlmICdwcm9kdWN0aW9uJyAhPT0gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgOjpcbiAgICAgICAgY29uc3Qgb3AgPSBwYWNrX2hkci5vcCA9IHJlY3ZfbXNnLm9wID0gZnJhbWUub3BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcGFja19oZHIsICduYW1lJywgQHt9IHZhbHVlOiBgcGFja19oZHIgwqske29wfcK7YFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCByZWN2X21zZywgJ25hbWUnLCBAe30gdmFsdWU6IGByZWN2X21zZyDCqyR7b3B9wrtgXG5cbiAgICByZXR1cm4gb3V0Ym91bmRcblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IHBhY2tCb2R5ID0gdHJhbnNwb3J0cy5wYWNrQm9keVxuICAgIGNvbnN0IG91dGJvdW5kID0gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKVxuICAgIHJldHVybiB0cmFuc3BvcnRzLnN0cmVhbWluZ1xuICAgICAgPyBAe30gc2VuZCwgc3RyZWFtOiBiaW5kX3N0cmVhbSBAIHRyYW5zcG9ydHMuc3RyZWFtaW5nLm1vZGVcbiAgICAgIDogQHt9IHNlbmRcblxuICAgIGZ1bmN0aW9uIHNlbmQoY2hhbiwgb2JqLCBib2R5KSA6OlxuICAgICAgYm9keSA9IHBhY2tCb2R5KGJvZHkpXG4gICAgICBpZiBmcmFnbWVudF9zaXplIDwgYm9keS5ieXRlTGVuZ3RoIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIG9iai50cmFuc3BvcnQgPSAnbXVsdGlwYXJ0J1xuICAgICAgICBjb25zdCBtc2VuZCA9IG1zZW5kX2J5dGVzKGNoYW4sIG9iailcbiAgICAgICAgcmV0dXJuIG1zZW5kIEAgdHJ1ZSwgYm9keVxuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gJ3NpbmdsZSdcbiAgICAgIG9iai5ib2R5ID0gYm9keVxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIHBhY2tfaGRyKG9iailcbiAgICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgICBmdW5jdGlvbiBtc2VuZF9ieXRlcyhjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGxldCB7bmV4dH0gPSBwYWNrX2hkcihvYmopXG4gICAgICBpZiBudWxsICE9PSBtc2cgOjpcbiAgICAgICAgb2JqLmJvZHkgPSBtc2dcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBjaGFuIEAgcGt0XG5cbiAgICAgIHJldHVybiBhc3luYyBmdW5jdGlvbiAoZmluLCBib2R5KSA6OlxuICAgICAgICBpZiBudWxsID09PSBuZXh0IDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgJ1dyaXRlIGFmdGVyIGVuZCdcbiAgICAgICAgbGV0IHJlc1xuICAgICAgICBmb3IgY29uc3Qgb2JqIG9mIHBhY2tldEZyYWdtZW50cyBAIGJvZHksIG5leHQsIGZpbiA6OlxuICAgICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgICByZXMgPSBhd2FpdCBjaGFuIEAgcGt0XG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gcmVzXG5cbiAgICBmdW5jdGlvbiBtc2VuZF9vYmplY3RzKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBjb25zdCBvYmogPSBuZXh0KHtmaW59KVxuICAgICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIGJpbmRfc3RyZWFtKG1vZGUpIDo6XG4gICAgICBjb25zdCBtc2VuZF9pbXBsID0ge29iamVjdDogbXNlbmRfb2JqZWN0cywgYnl0ZXM6IG1zZW5kX2J5dGVzfVttb2RlXVxuICAgICAgaWYgbXNlbmRfaW1wbCA6OiByZXR1cm4gc3RyZWFtXG5cbiAgICAgIGZ1bmN0aW9uIHN0cmVhbShjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgICAgaWYgISBvYmoudG9rZW4gOjogb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzdHJlYW1pbmcnXG4gICAgICAgIGNvbnN0IG1zZW5kID0gbXNlbmRfaW1wbCBAIGNoYW4sIG9iaiwganNvbl9wYWNrKG1zZylcbiAgICAgICAgd3JpdGUud3JpdGUgPSB3cml0ZTsgd3JpdGUuZW5kID0gd3JpdGUuYmluZCh0cnVlKVxuICAgICAgICByZXR1cm4gd3JpdGVcblxuICAgICAgICBmdW5jdGlvbiB3cml0ZShjaHVuaykgOjpcbiAgICAgICAgICByZXR1cm4gY2h1bmsgIT0gbnVsbFxuICAgICAgICAgICAgPyBtc2VuZCBAIHRydWU9PT10aGlzLCBwYWNrQm9keShjaHVuaylcbiAgICAgICAgICAgIDogbXNlbmQgQCB0cnVlXG5cblxuZnVuY3Rpb24gY2hlY2tfZm5zKG9iaiwgLi4ua2V5cykgOjpcbiAgZm9yIGNvbnN0IGtleSBvZiBrZXlzIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG9ialtrZXldIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIFwiJHtrZXl9XCIgdG8gYmUgYSBmdW5jdGlvbmBcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGpzb25fcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIGpzb25fcGFja30gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keVxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KCkgfHwgdW5kZWZpbmVkXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgYm9keV9idWYgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBib2R5X2J1ZiA6OlxuICAgICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCB1bnBhY2tfdXRmOChib2R5X2J1ZikgfHwgdW5kZWZpbmVkXG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdvYmplY3QnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICByZXR1cm4gc3RhdGUuZmVlZChwa3QsIHVucGFja0JvZHkpXG5cbiAgZnVuY3Rpb24gcGFja0JvZHkoYm9keSkgOjpcbiAgICByZXR1cm4gcGFja191dGY4IEAganNvbl9wYWNrKGJvZHkpXG5cbiAgZnVuY3Rpb24gdW5wYWNrQm9keShwa3QsIHNpbmspIDo6XG4gICAgcmV0dXJuIHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGJpbmFyeV9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbX0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICBjb25zdCB7YXNCdWZmZXJ9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICByZXR1cm4gQHt9XG4gICAgcGFja0JvZHk6IGFzQnVmZmVyXG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0gcGt0LmJvZHlfYnVmZmVyKClcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBtc2cgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2cgOjpcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ2J5dGVzJ1xuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVTdHJlYW1cbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QsIHBrdF9idWZmZXIpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG5mdW5jdGlvbiBwa3RfYnVmZmVyKHBrdCkgOjogcmV0dXJuIHBrdC5ib2R5X2J1ZmZlcigpXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBjb250cm9sX3Byb3RvY29sKGluYm91bmQsIGhpZ2gsIHNoYXJlZCkgOjpcbiAgY29uc3Qge3JhbmRvbV9pZH0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tQYWNrZXRPYmp9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIGNvbnN0IHBpbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgdG9rZW46IHRydWUsIHRyYW5zcG9ydDogJ2RpcmVjdCdcbiAgY29uc3QgcG9uZ19mcmFtZSA9IGZyYW1pbmdzLmNob29zZSBAOiBmcm9tX2lkOiB0cnVlLCBtc2dpZDogdHJ1ZSwgdHJhbnNwb3J0OiAnZGF0YWdyYW0nXG5cbiAgY29uc3QgcG9uZ190eXBlID0gaGlnaHwweGVcbiAgaW5ib3VuZFtwb25nX3R5cGVdID0gcmVjdl9wb25nXG4gIGNvbnN0IHBpbmdfdHlwZSA9IGhpZ2h8MHhmXG4gIGluYm91bmRbaGlnaHwweGZdID0gcmVjdl9waW5nXG5cbiAgcmV0dXJuIEB7fSBzZW5kOnBpbmcsIHBpbmdcblxuICBmdW5jdGlvbiBwaW5nKGNoYW4sIG9iaikgOjpcbiAgICBpZiAhIG9iai50b2tlbiA6OlxuICAgICAgb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICBvYmouYm9keSA9IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICBvcDogJ3BpbmcnLCB0czA6IG5ldyBEYXRlKClcbiAgICBwaW5nX2ZyYW1lLnBhY2socGluZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgZnVuY3Rpb24gcmVjdl9waW5nKHBrdCwgc2luaywgcm91dGVyKSA6OlxuICAgIHBpbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIF9zZW5kX3BvbmcgQCBwa3QuYm9keSwgcGt0LCByb3V0ZXJcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiAgZnVuY3Rpb24gX3NlbmRfcG9uZyh7dHMwfSwgcGt0X3BpbmcsIHJvdXRlcikgOjpcbiAgICBjb25zdCB7bXNnaWQsIGlkX3RhcmdldCwgaWRfcm91dGVyLCBmcm9tX2lkOnJfaWR9ID0gcGt0X3BpbmcuaW5mb1xuICAgIGNvbnN0IG9iaiA9IEB7fSBtc2dpZFxuICAgICAgZnJvbV9pZDogQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyXG4gICAgICBpZF9yb3V0ZXI6IHJfaWQuaWRfcm91dGVyLCBpZF90YXJnZXQ6IHJfaWQuaWRfdGFyZ2V0XG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSBAOlxuICAgICAgICBvcDogJ3BvbmcnLCB0czAsIHRzMTogbmV3IERhdGUoKVxuXG4gICAgcG9uZ19mcmFtZS5wYWNrKHBvbmdfdHlwZSwgb2JqKVxuICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICByZXR1cm4gcm91dGVyLmRpc3BhdGNoIEAgW3BrdF1cblxuICBmdW5jdGlvbiByZWN2X3BvbmcocGt0LCBzaW5rKSA6OlxuICAgIHBvbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIHJldHVybiBzaW5rLnJlY3ZDdHJsKHBrdC5ib2R5LCBwa3QuaW5mbylcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5pbXBvcnQgc2hhcmVkX3Byb3RvIGZyb20gJy4vc2hhcmVkLmpzeSdcbmltcG9ydCBqc29uX3Byb3RvIGZyb20gJy4vanNvbi5qc3knXG5pbXBvcnQgYmluYXJ5X3Byb3RvIGZyb20gJy4vYmluYXJ5LmpzeSdcbmltcG9ydCBjb250cm9sX3Byb3RvIGZyb20gJy4vY29udHJvbC5qc3knXG5cbmV4cG9ydCAqIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGluaXRfcHJvdG9jb2wocGFja2V0UGFyc2VyLCBvcHRpb25zKSA6OlxuICBjb25zdCBzaGFyZWQgPSBzaGFyZWRfcHJvdG8gQCBwYWNrZXRQYXJzZXIsIG9wdGlvbnNcblxuICBjb25zdCBpbmJvdW5kID0gW11cbiAgY29uc3QganNvbiA9IHNoYXJlZC5iaW5kVHJhbnNwb3J0cyBAIGluYm91bmRcbiAgICAweDAwIC8vIDB4MCog4oCUIEpTT04gYm9keVxuICAgIGpzb25fcHJvdG8oc2hhcmVkKVxuXG4gIGNvbnN0IGJpbmFyeSA9IHNoYXJlZC5iaW5kVHJhbnNwb3J0cyBAIGluYm91bmRcbiAgICAweDEwIC8vIDB4MSog4oCUIGJpbmFyeSBib2R5XG4gICAgYmluYXJ5X3Byb3RvKHNoYXJlZClcblxuICBjb25zdCBjb250cm9sID0gY29udHJvbF9wcm90byBAIGluYm91bmQsXG4gICAgMHhmMCAvLyAweGYqIOKAlCBjb250cm9sXG4gICAgc2hhcmVkXG5cbiAgY29uc3QgY29kZWNzID0gQDoganNvbiwgYmluYXJ5LCBjb250cm9sLCBkZWZhdWx0OiBqc29uXG5cbiAgY29uc3Qge3JhbmRvbV9pZH0gPSBzaGFyZWRcbiAgcmV0dXJuIEA6IGluYm91bmQsIGNvZGVjcywgcmFuZG9tX2lkXG5cblxuIiwiZXhwb3J0IGZ1bmN0aW9uIGJpbmRSb3V0ZUNoYW5uZWwoaHViLCBjYWNoZSkgOjpcbiAgY29uc3QgY2hhbm5lbCA9IGh1Yi5jb25uZWN0X3NlbGYoKVxuICBjb25zdCB7cmVzb2x2ZVJvdXRlLCByb3V0ZXN9ID0gaHViLnJvdXRlclxuICByZXR1cm4gY2FjaGUgPyBjYWNoZVJvdXRlQ2hhbm5lbCA6IHJlc29sdmVSb3V0ZUNoYW5uZWxcblxuICBmdW5jdGlvbiBjYWNoZVJvdXRlQ2hhbm5lbChpZF9yb3V0ZXIpIDo6XG4gICAgbGV0IGNoYW4gPSBjYWNoZS5nZXQoaWRfcm91dGVyKVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gY2hhbiA6OlxuICAgICAgY2hhbiA9IHJlc29sdmVSb3V0ZUNoYW5uZWwoaWRfcm91dGVyKVxuICAgICAgY2FjaGUuc2V0KGlkX3JvdXRlciwgY2hhbilcbiAgICByZXR1cm4gY2hhblxuXG4gIGZ1bmN0aW9uIHJlc29sdmVSb3V0ZUNoYW5uZWwoaWRfcm91dGVyKSA6OlxuICAgIGxldCByb3V0ZSwgZGlzY28gPSByZXNvbHZlUm91dGUoaWRfcm91dGVyKVxuICAgIHJldHVybiBhc3luYyBwa3QgPT4gOjpcbiAgICAgIHRyeSA6OlxuICAgICAgICBpZiBudWxsICE9PSBkaXNjbyA6OlxuICAgICAgICAgIHJvdXRlID0gYXdhaXQgZGlzY29cbiAgICAgICAgICBkaXNjbyA9IG51bGxcblxuICAgICAgICBpZiBudWxsID09IHJvdXRlIHx8ICEgcm91dGVzLmhhcyhpZF9yb3V0ZXIpIDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgXCJVbnJlc29sdmFibGUgcm91dGVcIlxuXG4gICAgICAgIGF3YWl0IHJvdXRlIEAgcGt0LCBjaGFubmVsXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgZGlzY28gPSByb3V0ZSA9IG51bGxcbiAgICAgICAgaWYgY2FjaGUgOjogY2FjaGUuZGVsZXRlKGlkX3JvdXRlcilcbiAgICAgICAgdGhyb3cgZXJyXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBFbmRwb2ludCA6OlxuICBzdGF0aWMgc3ViY2xhc3MoZXh0ZW5zaW9ucykgOjpcbiAgICBjbGFzcyBFbmRwb2ludCBleHRlbmRzIHRoaXMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgRW5kcG9pbnQucHJvdG90eXBlLCBleHRlbnNpb25zXG4gICAgcmV0dXJuIEVuZHBvaW50XG5cbiAgdmFsdWVPZigpIDo6IHJldHVybiB0aGlzLmlkLmlkX3RhcmdldFxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VuZHBvaW50ICR7dGhpcy5lbmNvZGUodHJ1ZSl9wrtgXG4gIHRvSlNPTigpIDo6IHJldHVybiB0aGlzLmVuY29kZShmYWxzZSlcblxuICBjb25zdHJ1Y3RvcihpZCwgbXNnX2N0eCwgZXBfdGd0KSA6OlxuICAgIG1zZ19jdHggPSBtc2dfY3R4LndpdGhFbmRwb2ludCh0aGlzKVxuICAgIGNvbnN0IGFzU2VuZGVyID0gZXBfdGd0LmNvbnN0cnVjdG9yLmpzb25fYXNfc2VuZGVyKG1zZ19jdHgpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAOlxuICAgICAgaWQ6IEB7fSB2YWx1ZTogaWQsIGVudW1lcmFibGU6IHRydWVcbiAgICAgIHRvOiBAe30gdmFsdWU6IG1zZ19jdHgudG9cbiAgICAgIGVuY29kZTogQHt9IHZhbHVlOiBlcF90Z3QuZW5jb2RlXG4gICAgICBhc1NlbmRlcjogQHt9IHZhbHVlOiBhc1NlbmRlclxuXG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKClcbiAgY3JlYXRlU3RhdGVNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSZXBseU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVRyYWZmaWNNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSb3V0ZUNhY2hlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcblxuICBiaW5kU2luayhzaW5rKSA6OlxuICAgIGNvbnN0IGJ5X3Rva2VuID0gdGhpcy5jcmVhdGVSZXBseU1hcCgpXG4gICAgY29uc3QgYnlfdHJhZmZpYyA9IHRoaXMuY3JlYXRlVHJhZmZpY01hcCgpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAOlxuICAgICAgYnlfdG9rZW46IEB7fSB2YWx1ZTogYnlfdG9rZW5cbiAgICAgIGJ5X3RyYWZmaWM6IEB7fSB2YWx1ZTogYnlfdHJhZmZpY1xuXG4gICAgY29uc3QgdHJhZmZpYyA9IChmcm9tX2lkLCB0cmFmZmljKSA9PiA6OlxuICAgICAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gICAgICBpZiBmcm9tX2lkIDo6XG4gICAgICAgIGNvbnN0IHQgPSBieV90cmFmZmljLmdldChmcm9tX2lkLmlkX3RhcmdldClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0IDo6XG4gICAgICAgICAgdC50cyA9IHRbYHRzXyR7dHJhZmZpY31gXSA9IHRzXG4gICAgICB0aGlzLnJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKVxuXG4gICAgcmV0dXJuIEB7fVxuICAgICAgYnlfbXNnaWQ6IHRoaXMuY3JlYXRlU3RhdGVNYXAoKVxuXG4gICAgICByZWN2Q3RybDogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdjdHJsJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdkN0cmwobXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cgfHwge21zZywgaW5mb30pLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdk1zZzogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdtc2cnKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2TXNnKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnKS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZTdHJlYW1EYXRhOiAocnN0cmVhbSwgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgcmVjdlN0cmVhbTogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCByc3RyZWFtID0gdGhpcy5yZWN2U3RyZWFtKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShyc3RyZWFtKS50aGVuKHJlcGx5KVxuICAgICAgICByZXR1cm4gcnN0cmVhbVxuXG4gIHJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKSA6OlxuICByZWN2Q3RybChtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGlmIGlzX3JlcGx5IDo6IHJldHVybiBtc2dcbiAgcmVjdk1zZyhtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGlmIGlzX3JlcGx5IDo6IHJldHVybiBtc2dcbiAgICByZXR1cm4gQHt9IG1zZywgaW5mbywgc2VuZGVyOiB0aGlzLmFzU2VuZGVyKGluZm8pXG4gIHJlY3ZTdHJlYW0obXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBjb25zb2xlLndhcm4gQCBgVW5oYW5kbGUgcmVjdiBzdHJlYW06ICR7aW5mb31gXG4gICAgcmV0dXJuIG51bGxcbiAgICAvKiByZXR1cm4gQHt9IG1zZywgaW5mb1xuICAgICAgICAgb25faW5pdChtc2csIHBrdCkgOjogcmV0dXJuIHRoaXNcbiAgICAgICAgIG9uX2RhdGEoZGF0YSwgcGt0KSA6OiB0aGlzLnBhcnRzLnB1c2ggQCBkYXRhXG4gICAgICAgICBvbl9lbmQocmVzdWx0LCBwa3QpIDo6IHJldHVybiB0aGlzLnBhcnRzLmpvaW4oJycpXG4gICAgICAgICBvbl9lcnJvcihlcnIsIHBrdCkgOjogY29uc29sZS5sb2cgQCBlcnJcbiAgICAqL1xuXG4gIGluaXRSZXBseSh0b2tlbiwgcF9zZW50LCBtc2dfY3R4KSA6OlxuICAgIHJldHVybiB0aGlzLmluaXRSZXBseVByb21pc2UgQCB0b2tlbiwgcF9zZW50LCBtc2dfY3R4XG5cbiAgaW5pdE1vbml0b3IoaWRfdGFyZ2V0KSA6OlxuICAgIGNvbnN0IGtleSA9IGlkX3RhcmdldC5pZF90YXJnZXQgfHwgaWRfdGFyZ2V0XG4gICAgbGV0IG1vbml0b3IgPSB0aGlzLmJ5X3RyYWZmaWMuZ2V0IEAga2V5XG4gICAgaWYgdW5kZWZpbmVkID09PSBtb25pdG9yIDo6XG4gICAgICBtb25pdG9yID0gQHt9IGlkX3RhcmdldCwgdHM6IERhdGUubm93KClcbiAgICAgICAgdGQoKSA6OiByZXR1cm4gRGF0ZS5ub3coKSAtIHRoaXMudHNcbiAgICAgIHRoaXMuYnlfdHJhZmZpYy5zZXQgQCBrZXksIG1vbml0b3JcbiAgICByZXR1cm4gbW9uaXRvclxuXG4gIGluaXRSZXBseVByb21pc2UodG9rZW4sIHBfc2VudCwgbXNnX2N0eCkgOjpcbiAgICBsZXQgcmVwbHkgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICB0aGlzLmJ5X3Rva2VuLnNldCBAIHRva2VuLCByZXNvbHZlXG4gICAgICBwX3NlbnQuY2F0Y2ggQCByZWplY3RcblxuICAgIGlmIG1zZ19jdHggOjpcbiAgICAgIHJlcGx5ID0gbXNnX2N0eC53aXRoUmVqZWN0VGltZW91dChyZXBseSlcblxuICAgIGNvbnN0IGNsZWFyID0gKCkgPT4gdGhpcy5ieV90b2tlbi5kZWxldGUgQCB0b2tlblxuICAgIHJlcGx5LnRoZW4gQCBjbGVhciwgY2xlYXJcbiAgICByZXR1cm4gcmVwbHlcblxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgRVBUYXJnZXQgOjpcbiAgc3RhdGljIHN1YmNsYXNzKGV4dGVuc2lvbnMpIDo6XG4gICAgY2xhc3MgRVBUYXJnZXQgZXh0ZW5kcyB0aGlzIDo6XG4gICAgT2JqZWN0LmFzc2lnbiBAIEVQVGFyZ2V0LnByb3RvdHlwZSwgZXh0ZW5zaW9uc1xuICAgIHJldHVybiBFUFRhcmdldFxuXG4gIGNvbnN0cnVjdG9yKGlkLCBtc2dfY3R4LCBtc2dfaW5mbykgOjpcbiAgICBjb25zdCBwcm9wcyA9IEB7fVxuICAgICAgaWRfcm91dGVyOiBAe30gZW51bWVyYWJsZTogdHJ1ZSwgdmFsdWU6IGlkLmlkX3JvdXRlclxuICAgICAgaWRfdGFyZ2V0OiBAe30gZW51bWVyYWJsZTogdHJ1ZSwgdmFsdWU6IGlkLmlkX3RhcmdldFxuICAgICAgZW5jb2RlOiBAe30gdmFsdWU6IHNpbXBsZSA9PiB0aGlzLmVwX2VuY29kZShpZCwgc2ltcGxlKVxuXG4gICAgaWYgbXNnX2N0eCA6OlxuICAgICAgYmluZEN0eFByb3BzIEAgcHJvcHMsIG1zZ19pbmZvLCAoKSA9PlxuICAgICAgICBtc2dfY3R4LnRvKHRoaXMsIG1zZ19pbmZvKS5mYXN0X2pzb25cbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBwcm9wc1xuXG5cbiAgdmFsdWVPZigpIDo6IHJldHVybiB0aGlzLmlkX3RhcmdldFxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VQVGFyZ2V0ICR7dGhpcy5lbmNvZGUodHJ1ZSl9wrtgXG4gIHRvSlNPTigpIDo6IHJldHVybiB0aGlzLmVuY29kZShmYWxzZSlcbiAgaXNFUFRhcmdldCgpIDo6IHJldHVybiB0cnVlXG5cbiAgc3RhdGljIGpzb25fYXNfc2VuZGVyKG1zZ19jdHgpIDo6XG4gICAgcmV0dXJuIGluZm8gPT5cbiAgICAgIHRoaXMuZnJvbV9qc29uIEAgaW5mby5mcm9tX2lkLCBtc2dfY3R4LCBpbmZvXG5cbiAgc3RhdGljIGZyb21fanNvbihpZCwgbXNnX2N0eCwgbXNnX2luZm8pIDo6XG4gICAgaWYgaWQgOjogcmV0dXJuIG5ldyB0aGlzKGlkLCBtc2dfY3R4LCBtc2dfaW5mbylcblxuICBzdGF0aWMganNvblVucGFjayhtc2dfY3R4LCB4Zm9ybUJ5S2V5KSA6OlxuICAgIHhmb3JtQnlLZXkgPSBPYmplY3QuY3JlYXRlKHhmb3JtQnlLZXkgfHwgbnVsbClcbiAgICB4Zm9ybUJ5S2V5W3RoaXMudG9rZW5dID0gdiA9PlxuICAgICAgdGhpcy5mcm9tX2pzb24gQCB0aGlzLmVwX2RlY29kZSh2KSwgbXNnX2N0eFxuICAgIHJldHVybiB0aGlzLmpzb25VbnBhY2tCeUtleSh4Zm9ybUJ5S2V5KVxuXG4gIHN0YXRpYyBqc29uVW5wYWNrQnlLZXkoeGZvcm1CeUtleSkgOjpcbiAgICBjb25zdCByZWcgPSBuZXcgV2Vha01hcCgpXG4gICAgcmV0dXJuIHN6ID0+IEpTT04ucGFyc2UgQCBzeiwgcmV2aXZlclxuXG4gICAgZnVuY3Rpb24gcmV2aXZlcihrZXksIHZhbHVlKSA6OlxuICAgICAgY29uc3QgeGZuID0geGZvcm1CeUtleVtrZXldXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHhmbiA6OlxuICAgICAgICByZWcuc2V0KHRoaXMsIHhmbilcbiAgICAgICAgcmV0dXJuIHZhbHVlXG5cbiAgICAgIGlmICdvYmplY3QnID09PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgICAgY29uc3QgdmZuID0gcmVnLmdldCh2YWx1ZSlcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB2Zm4gOjpcbiAgICAgICAgICByZXR1cm4gdmZuIEAgdmFsdWVcbiAgICAgIHJldHVybiB2YWx1ZVxuXG5cbmZ1bmN0aW9uIGJpbmRDdHhQcm9wcyhwcm9wcywgbXNnX2luZm8sIGluaXQpIDo6XG4gIGxldCBjdHhcbiAgcHJvcHMuc2VuZCA9IEB7fSBnZXQoKSA6OiByZXR1cm4gKGN0eCB8fCAoY3R4ID0gaW5pdCgpKSkuc2VuZFxuICBwcm9wcy5xdWVyeSA9IEB7fSBnZXQoKSA6OiByZXR1cm4gKGN0eCB8fCAoY3R4ID0gaW5pdCgpKSkucXVlcnlcbiAgaWYgbXNnX2luZm8gJiYgbXNnX2luZm8ubXNnaWQgOjpcbiAgICAvLyByZWFkcyBhcyBcInNlbmRlci5yZXBseUV4cGVjdGVkXCJcbiAgICBwcm9wcy5yZXBseUV4cGVjdGVkID0gQHt9IHZhbHVlOiB0cnVlXG5cblxuY29uc3QgdG9rZW4gPSAnXFx1MDNFMCcgLy8gJ8+gJ1xuRVBUYXJnZXQudG9rZW4gPSB0b2tlblxuXG5FUFRhcmdldC5lcF9lbmNvZGUgPSBFUFRhcmdldC5wcm90b3R5cGUuZXBfZW5jb2RlID0gZXBfZW5jb2RlXG5leHBvcnQgZnVuY3Rpb24gZXBfZW5jb2RlKGlkLCBzaW1wbGUpIDo6XG4gIGxldCB7aWRfcm91dGVyOnIsIGlkX3RhcmdldDp0fSA9IGlkXG4gIHIgPSAocj4+PjApLnRvU3RyaW5nKDM2KVxuICB0ID0gKHQ+Pj4wKS50b1N0cmluZygzNilcbiAgaWYgc2ltcGxlIDo6XG4gICAgcmV0dXJuIGAke3Rva2VufSAke3J9fiR7dH1gXG5cbiAgY29uc3QgcmVzID0gQHt9IFt0b2tlbl06IGAke3J9fiR7dH1gXG4gIE9iamVjdC5hc3NpZ24gQCByZXMsIGlkXG4gIGRlbGV0ZSByZXMuaWRfcm91dGVyOyBkZWxldGUgcmVzLmlkX3RhcmdldFxuICByZXR1cm4gcmVzXG5cblxuRVBUYXJnZXQuZXBfZGVjb2RlID0gRVBUYXJnZXQucHJvdG90eXBlLmVwX2RlY29kZSA9IGVwX2RlY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2RlY29kZSh2KSA6OlxuICBjb25zdCBpZCA9ICdzdHJpbmcnID09PSB0eXBlb2YgdlxuICAgID8gdi5zcGxpdCh0b2tlbilbMV1cbiAgICA6IHZbdG9rZW5dXG4gIGlmICEgaWQgOjogcmV0dXJuXG5cbiAgbGV0IFtyLHRdID0gaWQuc3BsaXQoJ34nKVxuICBpZiB1bmRlZmluZWQgPT09IHQgOjogcmV0dXJuXG4gIHIgPSAwIHwgcGFyc2VJbnQociwgMzYpXG4gIHQgPSAwIHwgcGFyc2VJbnQodCwgMzYpXG5cbiAgcmV0dXJuIEB7fSBpZF9yb3V0ZXI6IHIsIGlkX3RhcmdldDogdFxuXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBTaW5rIDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe2luYm91bmR9KSA6OlxuICAgIGNsYXNzIFNpbmsgZXh0ZW5kcyB0aGlzIDo6XG4gICAgU2luay5wcm90b3R5cGUuX3Byb3RvY29sID0gaW5ib3VuZFxuICAgIHJldHVybiBTaW5rXG5cbiAgY29uc3RydWN0b3IoanNvbl91bnBhY2spIDo6XG4gICAgdGhpcy5qc29uX3VucGFjayA9IGpzb25fdW5wYWNrXG5cbiAgcmVnaXN0ZXIoZW5kcG9pbnQsIGh1YiwgaWRfdGFyZ2V0LCBoYW5kbGVycykgOjpcbiAgICBjb25zdCB1bnJlZ2lzdGVyID0gKCkgPT4gaHViLnJvdXRlci51bnJlZ2lzdGVyVGFyZ2V0KGlkX3RhcmdldClcblxuICAgIGh1Yi5yb3V0ZXIucmVnaXN0ZXJUYXJnZXQgQCBpZF90YXJnZXQsXG4gICAgICB0aGlzLl9iaW5kRGlzcGF0Y2ggQCBlbmRwb2ludCwgdW5yZWdpc3RlciwgaGFuZGxlcnNcbiAgICByZXR1cm4gdGhpc1xuXG4gIF9iaW5kRGlzcGF0Y2goZW5kcG9pbnQsIHVucmVnaXN0ZXIsIHtvbl9tc2csIG9uX2Vycm9yLCBvbl9zaHV0ZG93bn0pIDo6XG4gICAgbGV0IGFsaXZlID0gdHJ1ZVxuICAgIGNvbnN0IHByb3RvY29sID0gdGhpcy5fcHJvdG9jb2xcbiAgICBjb25zdCBpc0FsaXZlID0gKCkgPT4gYWxpdmVcbiAgICBjb25zdCBzaHV0ZG93biA9IChlcnIsIGV4dHJhKSA9PiA6OlxuICAgICAgaWYgYWxpdmUgOjpcbiAgICAgICAgdW5yZWdpc3RlcigpOyB1bnJlZ2lzdGVyID0gYWxpdmUgPSBmYWxzZVxuICAgICAgICBvbl9zaHV0ZG93bihlcnIsIGV4dHJhKVxuXG4gICAgT2JqZWN0LmFzc2lnbiBAIHRoaXMsIGVuZHBvaW50LmJpbmRTaW5rKHRoaXMpLCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cbiAgICBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuXG4gICAgcmV0dXJuIGFzeW5jIChwa3QsIHJvdXRlcikgPT4gOjpcbiAgICAgIGlmIGZhbHNlPT09YWxpdmUgfHwgbnVsbD09cGt0IDo6IHJldHVybiBhbGl2ZVxuXG4gICAgICBjb25zdCByZWN2X21zZyA9IHByb3RvY29sW3BrdC50eXBlXVxuICAgICAgaWYgdW5kZWZpbmVkID09PSByZWN2X21zZyA6OlxuICAgICAgICByZXR1cm4gdm9pZCBvbl9lcnJvciBAIGZhbHNlLCBAe30gcGt0LCB6b25lOiAncGt0LnR5cGUnXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICB2YXIgbXNnID0gYXdhaXQgcmVjdl9tc2cgQCBwa3QsIHRoaXMsIHJvdXRlclxuICAgICAgICBpZiAhIG1zZyA6OiByZXR1cm4gbXNnXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBlcnIsIEB7fSBwa3QsIHpvbmU6ICdwcm90b2NvbCdcblxuICAgICAgaWYgZmFsc2UgPT09IGFsaXZlIDo6XG4gICAgICAgIHJldHVybiBmYWxzZSAvLyBjaGFuZ2Ugd2hpbGUgYXdhaXRpbmcgYWJvdmXigKZcbiAgICAgIHRyeSA6OlxuICAgICAgICByZXR1cm4gYXdhaXQgb25fbXNnIEAgbXNnLCBwa3RcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICB0cnkgOjpcbiAgICAgICAgICB2YXIgdGVybWluYXRlID0gb25fZXJyb3IgQCBlcnIsIEB7fSBtc2csIHBrdCwgem9uZTogJ2Rpc3BhdGNoJ1xuICAgICAgICBmaW5hbGx5IDo6XG4gICAgICAgICAgaWYgZmFsc2UgIT09IHRlcm1pbmF0ZSA6OlxuICAgICAgICAgICAgc2h1dGRvd24oZXJyLCB7bXNnLCBwa3R9KVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlIC8vIHNpZ25hbCB1bnJlZ2lzdGVyIHRvIG1zZy1mYWJyaWMtY29yZS9yb3V0ZXJcblxuICBzdGF0ZUZvcihwa3QsIGlmQWJzZW50KSA6OlxuICAgIGNvbnN0IG1zZ2lkID0gcGt0LmluZm8ubXNnaWRcbiAgICBsZXQgZW50cnkgPSB0aGlzLmJ5X21zZ2lkLmdldChtc2dpZClcbiAgICBpZiB1bmRlZmluZWQgPT09IGVudHJ5IDo6XG4gICAgICBpZiAhIG1zZ2lkIDo6XG4gICAgICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIG1zZ2lkOiAke21zZ2lkfWBcbiAgICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiBpZkFic2VudCA6OlxuICAgICAgICBlbnRyeSA9IGlmQWJzZW50KHBrdCwgdGhpcywgbXNnaWQpXG4gICAgICBlbHNlIGVudHJ5ID0gaWZBYnNlbnRcbiAgICAgIHRoaXMuYnlfbXNnaWQuc2V0IEAgbXNnaWQsIGVudHJ5XG4gICAgcmV0dXJuIGVudHJ5XG5cbiAgZGVsZXRlU3RhdGVGb3IobXNnaWQpIDo6XG4gICAgcmV0dXJuIHRoaXMuYnlfbXNnaWQuZGVsZXRlKG1zZ2lkKVxuIiwiaW1wb3J0IHtlcF9kZWNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTXNnQ3R4IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe3JhbmRvbV9pZCwgY29kZWNzfSkgOjpcbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5yYW5kb21faWQgPSByYW5kb21faWRcbiAgICBNc2dDdHgud2l0aENvZGVjcyBAIGNvZGVjc1xuICAgIHJldHVybiBNc2dDdHhcblxuICBjb25zdHJ1Y3RvcihlcF90Z3QsIHJlc29sdmVSb3V0ZUNoYW5uZWwpIDo6XG4gICAgY29uc3QgcHJvcHMgPSBAe31cbiAgICAgIF9yb290XzogQDogdmFsdWU6IHRoaXNcbiAgICAgIHJlc29sdmVSb3V0ZUNoYW5uZWw6IEA6IHZhbHVlOiByZXNvbHZlUm91dGVDaGFubmVsXG5cbiAgICBpZiBudWxsICE9PSBlcF90Z3QgOjpcbiAgICAgIGNvbnN0IHtpZF90YXJnZXQsIGlkX3JvdXRlcn0gPSBlcF90Z3RcbiAgICAgIGNvbnN0IGZyb21faWQgPSBPYmplY3QuZnJlZXplIEA6IGlkX3RhcmdldCwgaWRfcm91dGVyXG4gICAgICBwcm9wcy5mcm9tX2lkID0gQHt9IHZhbHVlOiBmcm9tX2lkXG4gICAgICBwcm9wcy5jdHggPSBAe30gdmFsdWU6IHtmcm9tX2lkfVxuICAgICAgcHJvcHMuZXBfZGVjb2RlID0gQHt9IHZhbHVlOiBlcF90Z3QuZXBfZGVjb2RlXG5cbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBwcm9wc1xuXG4gIHdpdGhFbmRwb2ludChlbmRwb2ludCkgOjpcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGVuZHBvaW50OiBAe30gdmFsdWU6IGVuZHBvaW50XG5cblxuICBwaW5nKHRva2VuPXRydWUpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fbXNnQ29kZWNzLmNvbnRyb2wucGluZywgW10sIHRva2VuKVxuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncylcbiAgc2VuZFF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXgodGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZSlcbiAgcXVlcnkoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCh0aGlzLl9jb2RlYy5zZW5kLCBhcmdzLCB0cnVlKS5yZXBseVxuXG4gIHN0cmVhbSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWMuc3RyZWFtLCBhcmdzXG4gIGludm9rZShrZXksIC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlY1trZXldLCBhcmdzXG4gIGJpbmRJbnZva2UoZm5PcktleSwgdG9rZW4pIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIGZuT3JLZXkgOjogZm5PcktleSA9IHRoaXMuX2NvZGVjXG4gICAgcmV0dXJuICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoZm5PcktleSwgYXJncywgdG9rZW4pXG5cbiAgX2ludm9rZV9leChpbnZva2UsIGFyZ3MsIHRva2VuKSA6OlxuICAgIGNvbnN0IG9iaiA9IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHhcbiAgICBpZiBudWxsID09IHRva2VuIDo6IHRva2VuID0gb2JqLnRva2VuXG4gICAgZWxzZSBvYmoudG9rZW4gPSB0b2tlblxuICAgIGlmIHRydWUgPT09IHRva2VuIDo6XG4gICAgICB0b2tlbiA9IG9iai50b2tlbiA9IHRoaXMucmFuZG9tX2lkKClcblxuICAgIHRoaXMuYXNzZXJ0TW9uaXRvcigpXG4gICAgY29uc3QgY2hhbiA9IHRoaXMucmVzb2x2ZVJvdXRlQ2hhbm5lbChvYmouaWRfcm91dGVyKVxuXG4gICAgY29uc3QgcmVzID0gaW52b2tlIEAgY2hhbiwgb2JqLCAuLi5hcmdzXG4gICAgaWYgISB0b2tlbiB8fCAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmVzLnRoZW4gOjogcmV0dXJuIHJlc1xuXG4gICAgbGV0IHBfc2VudCAgPSByZXMudGhlbigpXG4gICAgY29uc3QgcmVwbHkgPSB0aGlzLmVuZHBvaW50LmluaXRSZXBseSh0b2tlbiwgcF9zZW50LCB0aGlzKVxuICAgIHBfc2VudCA9IHBfc2VudC50aGVuIEAgKCkgPT4gQDogcmVwbHlcbiAgICBwX3NlbnQucmVwbHkgPSByZXBseVxuICAgIHJldHVybiBwX3NlbnRcblxuICBnZXQgdG8oKSA6OiByZXR1cm4gKHRndCwgLi4uYXJncykgPT4gOjpcbiAgICBpZiBudWxsID09IHRndCA6OiB0aHJvdyBuZXcgRXJyb3IgQCBgTnVsbCB0YXJnZXQgZW5kcG9pbnRgXG5cbiAgICBjb25zdCBzZWxmID0gdGhpcy5jbG9uZSgpXG5cbiAgICBjb25zdCBjdHggPSBzZWxmLmN0eFxuICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICBjdHguaWRfdGFyZ2V0ID0gdGd0XG4gICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgZWxzZSA6OlxuICAgICAgY29uc3Qge2Zyb21faWQ6IHJlcGx5X2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgdG9rZW4sIG1zZ2lkfSA9IHRoaXMuZXBfZGVjb2RlKHRndCkgfHwgdGd0XG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gaWRfdGFyZ2V0IDo6XG4gICAgICAgIGlmIHVuZGVmaW5lZCA9PT0gaWRfcm91dGVyIDo6XG4gICAgICAgICAgaWYgISBjdHguaWRfcm91dGVyIDo6XG4gICAgICAgICAgICAvLyBpbXBsaWNpdGx5IG9uIHRoZSBzYW1lIHJvdXRlclxuICAgICAgICAgICAgY3R4LmlkX3JvdXRlciA9IGN0eC5mcm9tX2lkLmlkX3JvdXRlclxuICAgICAgICBlbHNlIGN0eC5pZF9yb3V0ZXIgPSBpZF9yb3V0ZXJcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IGlkX3RhcmdldFxuICAgICAgZWxzZSBpZiB1bmRlZmluZWQgIT09IGlkX3JvdXRlciA6OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgUGFzc2luZyAnaWRfcm91dGVyJyByZXF1aXJlcyAnaWRfdGFyZ2V0J2BcbiAgICAgIGVsc2UgaWYgdW5kZWZpbmVkICE9PSByZXBseV9pZCAmJiAhIGN0eC5pZF90YXJnZXQgOjpcbiAgICAgICAgY3R4LmlkX3JvdXRlciA9IHJlcGx5X2lkLmlkX3JvdXRlclxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gcmVwbHlfaWQuaWRfdGFyZ2V0XG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnaWQgOjogY3R4Lm1zZ2lkID0gbXNnaWRcblxuICAgIHJldHVybiAwID09PSBhcmdzLmxlbmd0aCA/IHNlbGYgOiBzZWxmLndpdGggQCAuLi5hcmdzXG5cbiAgd2l0aCguLi5hcmdzKSA6OlxuICAgIGNvbnN0IGN0eCA9IHRoaXMuY3R4XG4gICAgZm9yIGxldCB0Z3Qgb2YgYXJncyA6OlxuICAgICAgaWYgdHJ1ZSA9PT0gdGd0IHx8IGZhbHNlID09PSB0Z3QgOjpcbiAgICAgICAgY3R4LnRva2VuID0gdGd0XG4gICAgICBlbHNlIGlmIG51bGwgIT0gdGd0IDo6XG4gICAgICAgIGNvbnN0IHt0b2tlbiwgbXNnaWR9ID0gdGd0XG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuICAgIHJldHVybiB0aGlzXG5cbiAgd2l0aFJlcGx5KCkgOjpcbiAgICByZXR1cm4gdGhpcy5jbG9uZSBAOiB0b2tlbjogdHJ1ZVxuXG4gIHJlc2V0KC4uLmFyZ3MpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLl9yb290XywgQHt9XG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG4gIGNsb25lKC4uLmFyZ3MpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAe31cbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuXG4gIGFzc2VydE1vbml0b3IoKSA6OlxuICAgIGlmICEgdGhpcy5jaGVja01vbml0b3IoKSA6OlxuICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFRhcmdldCBtb25pdG9yIGV4cGlyZWRgXG4gIGNoZWNrTW9uaXRvcigpIDo6IHJldHVybiB0cnVlXG4gIG1vbml0b3Iob3B0aW9ucz17fSkgOjpcbiAgICBpZiB0cnVlID09PSBvcHRpb25zIHx8IGZhbHNlID09PSBvcHRpb25zIDo6XG4gICAgICBvcHRpb25zID0gQHt9IGFjdGl2ZTogb3B0aW9uc1xuXG4gICAgY29uc3QgbW9uaXRvciA9IHRoaXMuZW5kcG9pbnQuaW5pdE1vbml0b3IodGhpcy5jdHguaWRfdGFyZ2V0KVxuXG4gICAgY29uc3QgdHNfZHVyYXRpb24gPSBvcHRpb25zLnRzX2R1cmF0aW9uIHx8IDUwMDBcbiAgICBsZXQgdHNfYWN0aXZlID0gb3B0aW9ucy50c19hY3RpdmVcbiAgICBpZiB0cnVlID09PSB0c19hY3RpdmUgOjpcbiAgICAgIHRzX2FjdGl2ZSA9IHRzX2R1cmF0aW9uLzRcblxuICAgIGxldCBjaGVja01vbml0b3JcbiAgICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgY29uc3QgZG9uZSA9IG9wdGlvbnMucmVqZWN0ID8gcmVqZWN0IDogcmVzb2x2ZVxuICAgICAgdGhpcy5jaGVja01vbml0b3IgPSBjaGVja01vbml0b3IgPSAoKSA9PlxuICAgICAgICB0c19kdXJhdGlvbiA+IG1vbml0b3IudGQoKVxuICAgICAgICAgID8gdHJ1ZSA6IChkb25lKG1vbml0b3IpLCBmYWxzZSlcblxuICAgIGxldCB0aWRcbiAgICBjb25zdCB0c19pbnRlcnZhbCA9IHRzX2FjdGl2ZSB8fCB0c19kdXJhdGlvbi80XG4gICAgaWYgb3B0aW9ucy5hY3RpdmUgfHwgdHNfYWN0aXZlIDo6XG4gICAgICBjb25zdCBjdHJsID0gdGhpcy5jb2RlYygnY29udHJvbCcpXG4gICAgICBjb25zdCBjaGVja1BpbmcgPSAoKSA9PiA6OlxuICAgICAgICBpZiB0c19pbnRlcnZhbCA+IG1vbml0b3IudGQoKSA6OlxuICAgICAgICAgIGN0cmwuaW52b2tlKCdwaW5nJylcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tQaW5nLCB0c19pbnRlcnZhbFxuICAgIGVsc2UgOjpcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tNb25pdG9yLCB0c19pbnRlcnZhbFxuICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuICAgIGNvbnN0IGNsZWFyID0gKCkgPT4gY2xlYXJJbnRlcnZhbCh0aWQpXG5cbiAgICBwcm9taXNlLnRoZW4oY2xlYXIsIGNsZWFyKVxuICAgIHJldHVybiBwcm9taXNlXG5cblxuICBjb2RlYyhtc2dfY29kZWMsIC4uLmFyZ3MpIDo6XG4gICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiBtc2dfY29kZWMgOjpcbiAgICAgIG1zZ19jb2RlYyA9IHRoaXMuX21zZ0NvZGVjc1ttc2dfY29kZWNdXG5cbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgbXNnX2NvZGVjLnNlbmQgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgcGFja2V0IGNvZGVjIHByb3RvY29sYFxuXG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAOlxuICAgICAgX2NvZGVjOiBAOiB2YWx1ZTogbXNnX2NvZGVjXG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cbiAgc3RhdGljIHdpdGhDb2RlY3MobXNnQ29kZWNzKSA6OlxuICAgIGZvciBjb25zdCBbbmFtZSwgbXNnX2NvZGVjXSBvZiBPYmplY3QuZW50cmllcyBAIG1zZ0NvZGVjcyA6OlxuICAgICAgdGhpcy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIDo6XG4gICAgICAgIHJldHVybiB0aGlzLmNvZGVjIEAgbXNnX2NvZGVjXG4gICAgdGhpcy5wcm90b3R5cGUuX21zZ0NvZGVjcyA9IG1zZ0NvZGVjc1xuICAgIHRoaXMucHJvdG90eXBlLl9jb2RlYyA9IG1zZ0NvZGVjcy5kZWZhdWx0XG5cbiAgICAvLyBiaW5kIHNlbmRfanNvbiBhcyBmcmVxdWVudGx5IHVzZWQgZmFzdC1wYXRoXG4gICAgY29uc3QganNvbl9zZW5kID0gbXNnQ29kZWNzLmpzb24uc2VuZFxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcy5wcm90b3R5cGUsIEA6XG4gICAgICBmYXN0X2pzb246IEB7fSBnZXQoKSA6OiByZXR1cm4gQDpcbiAgICAgICAgc2VuZDogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChqc29uX3NlbmQsIGFyZ3MpXG4gICAgICAgIHNlbmRRdWVyeTogKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChqc29uX3NlbmQsIGFyZ3MsIHRydWUpXG4gICAgICAgIHF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4KGpzb25fc2VuZCwgYXJncywgdHJ1ZSkucmVwbHlcblxuICAgIHJldHVybiB0aGlzXG5cblxuICB3aXRoUmVqZWN0VGltZW91dChwX3JlcGx5KSA6OlxuICAgIHJldHVybiBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBwX3JlcGx5LnRoZW4gQCByZXNvbHZlLCByZWplY3RcbiAgICAgIHBfcmVwbHkudGhlbiBAIGNsZWFyLCBjbGVhclxuXG4gICAgICBjb25zdCB0aW1lb3V0ID0gKCkgPT4gcmVqZWN0IEAgbmV3IHRoaXMuUmVwbHlUaW1lb3V0XG4gICAgICBjb25zdCB0aWQgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIHRoaXMubXNfdGltZW91dClcbiAgICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuXG4gICAgICBmdW5jdGlvbiBjbGVhcigpIDo6IGNsZWFyVGltZW91dCBAIHRpZFxuXG5cbmNsYXNzIFJlcGx5VGltZW91dCBleHRlbmRzIEVycm9yIDo6XG5cbk9iamVjdC5hc3NpZ24gQCBNc2dDdHgucHJvdG90eXBlLCBAe31cbiAgUmVwbHlUaW1lb3V0LCBtc190aW1lb3V0OiA1MDAwXG4gIGVwX2RlY29kZVxuXG4iLCJpbXBvcnQgaW5pdF9wcm90b2NvbCBmcm9tICcuL3Byb3RvY29sL2luZGV4LmpzeSdcbmltcG9ydCB7YmluZFJvdXRlQ2hhbm5lbH0gZnJvbSAnLi9jb3JlX2ludGVncmF0aW9uLmpzeSdcbmltcG9ydCBFbmRwb2ludEJhc2UgZnJvbSAnLi9lbmRwb2ludC5qc3knXG5pbXBvcnQgRVBUYXJnZXRCYXNlIGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcbmltcG9ydCBTaW5rQmFzZSBmcm9tICcuL3NpbmsuanN5J1xuaW1wb3J0IE1zZ0N0eEJhc2UgZnJvbSAnLi9tc2djdHguanN5J1xuXG5jb25zdCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zID0gQDpcbiAgcGx1Z2luX25hbWU6ICdlbmRwb2ludCdcbiAgb25fbXNnKHttc2csIHJlcGx5LCBpbmZvfSkgOjpcbiAgICBjb25zb2xlLndhcm4gQCAnRU5EUE9JTlQgTVNHOicsIEB7fSBtc2csIHJlcGx5LCBpbmZvXG4gIG9uX2Vycm9yKGVwLCBlcnIsIGV4dHJhKSA6OlxuICAgIGNvbnNvbGUuZXJyb3IgQCAnRU5EUE9JTlQgRVJST1I6JywgZXJyXG4gICAgLy8gY29uc3Qge21zZywgcGt0fSA9IGV4dHJhXG4gICAgLy8gcmV0dXJuIGZhbHNlIHRvIHByZXZlbnQgYXV0by1zaHV0ZG93blxuICBvbl9zaHV0ZG93bihlcCwgZXJyLCBleHRyYSkgOjpcbiAgICAvLyBjb25zdCB7bXNnLCBwa3R9ID0gZXh0cmFcbiAgICBjb25zb2xlLmVycm9yIEAgYEVORFBPSU5UIFNIVVRET1dOOiAke2Vyci5tZXNzYWdlfWBcblxuICBzdWJjbGFzcyhjbGFzc2VzKSA6OlxuICAgIC8vY29uc3Qge0VuZHBvaW50LCBFUFRhcmdldCwgU2luaywgTXNnQ3R4LCBwcm90b2NvbHN9ID0gY2xhc3Nlc1xuICAgIHJldHVybiBjbGFzc2VzXG5cbiAganNvbl9wYWNrOiBKU09OLnN0cmluZ2lmeVxuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpIC8vIExSVU1hcCwgSGFzaGJlbHRNYXBcbiAgY3JlYXRlUm91dGVDYWNoZSgpIDo6IHJldHVybiBuZXcgTWFwKCkgLy8gTFJVTWFwLCBIYXNoYmVsdE1hcFxuXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBsdWdpbl9vcHRpb25zKSA6OlxuICBwbHVnaW5fb3B0aW9ucyA9IE9iamVjdC5hc3NpZ24gQCB7fSwgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucywgcGx1Z2luX29wdGlvbnNcbiAgY29uc3QgQHt9XG4gICAgcGx1Z2luX25hbWUsIHJhbmRvbV9pZCwganNvbl9wYWNrXG4gICAgb25fbXNnOiBkZWZhdWx0X29uX21zZ1xuICAgIG9uX2Vycm9yOiBkZWZhdWx0X29uX2Vycm9yXG4gICAgb25fc2h1dGRvd246IGRlZmF1bHRfb25fc2h1dGRvd25cbiAgICBjcmVhdGVNYXAsIGNyZWF0ZVJvdXRlQ2FjaGVcbiAgPSBwbHVnaW5fb3B0aW9uc1xuXG4gIHJldHVybiBAOiBvcmRlcjogMSwgc3ViY2xhc3MsIHBvc3RcbiAgXG4gIGZ1bmN0aW9uIHN1YmNsYXNzKEZhYnJpY0h1Yl9QSSwgYmFzZXMpIDo6XG4gICAgY29uc3Qge3BhY2tldFBhcnNlcn0gPSBGYWJyaWNIdWJfUEkucHJvdG90eXBlXG4gICAgaWYgbnVsbD09cGFja2V0UGFyc2VyIHx8ICEgcGFja2V0UGFyc2VyLmlzUGFja2V0UGFyc2VyKCkgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgSW52YWxpZCBwYWNrZXRQYXJzZXIgZm9yIHBsdWdpbmBcbiAgICBcbiAgICBGYWJyaWNIdWJfUEkucHJvdG90eXBlW3BsdWdpbl9uYW1lXSA9XG4gICAgICBiaW5kRW5kcG9pbnRBcGkgQCBwYWNrZXRQYXJzZXJcblxuICBmdW5jdGlvbiBwb3N0KGh1YikgOjpcbiAgICByZXR1cm4gaHViW3BsdWdpbl9uYW1lXSA9IGh1YltwbHVnaW5fbmFtZV0oaHViKVxuXG4gIGZ1bmN0aW9uIGJpbmRFbmRwb2ludEFwaShwYWNrZXRQYXJzZXIpIDo6XG4gICAgY29uc3QgcHJvdG9jb2xzID0gaW5pdF9wcm90b2NvbCBAIHBhY2tldFBhcnNlciwgQHt9IHJhbmRvbV9pZCwganNvbl9wYWNrXG5cbiAgICBjb25zdCB7RW5kcG9pbnQsIEVQVGFyZ2V0LCBTaW5rLCBNc2dDdHh9ID1cbiAgICAgIHBsdWdpbl9vcHRpb25zLnN1YmNsYXNzIEA6XG4gICAgICAgIHByb3RvY29scyxcbiAgICAgICAgU2luazogU2lua0Jhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICAgICAgTXNnQ3R4OiBNc2dDdHhCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIEVuZHBvaW50OiBFbmRwb2ludEJhc2Uuc3ViY2xhc3Moe2NyZWF0ZU1hcH0pXG4gICAgICAgIEVQVGFyZ2V0OiBFUFRhcmdldEJhc2Uuc3ViY2xhc3Moe30pXG5cbiAgICByZXR1cm4gZnVuY3Rpb24oaHViKSA6OlxuICAgICAgbGV0IF9jbGllbnRfcnJjXG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAOiBjcmVhdGUsIHNlcnZlcjogZW5kcG9pbnQsIGNsaWVudCwgY2xpZW50RW5kcG9pbnRcblxuXG4gICAgICBmdW5jdGlvbiBlbmRwb2ludChvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCB0YXJnZXRzID0gaHViLnJvdXRlci50YXJnZXRzXG4gICAgICAgIGRvIHZhciBpZF90YXJnZXQgPSByYW5kb21faWQoKVxuICAgICAgICB3aGlsZSB0YXJnZXRzLmhhcyBAIGlkX3RhcmdldFxuICAgICAgICByZXR1cm4gY3JlYXRlIEAgaWRfdGFyZ2V0LCBvbl9pbml0XG5cbiAgICAgIGZ1bmN0aW9uIGNyZWF0ZShpZF90YXJnZXQsIG9uX2luaXQpIDo6XG4gICAgICAgIGNvbnN0IGhhbmRsZXJzID0gT2JqZWN0LmNyZWF0ZShudWxsKVxuICAgICAgICBjb25zdCBpZCA9IEB7fSBpZF90YXJnZXQsIGlkX3JvdXRlcjogaHViLnJvdXRlci5pZF9zZWxmXG4gICAgICAgIGNvbnN0IGVwX3RndCA9IG5ldyBFUFRhcmdldCBAIGlkXG4gICAgICAgIGNvbnN0IG1zZ19jdHggPSBuZXcgTXNnQ3R4IEAgZXBfdGd0LCBiaW5kUm91dGVDaGFubmVsKGh1YiwgY3JlYXRlUm91dGVDYWNoZSh0cnVlKSlcbiAgICAgICAgY29uc3QgZXAgPSBuZXcgRW5kcG9pbnQgQCBpZCwgbXNnX2N0eCwgZXBfdGd0XG5cbiAgICAgICAgY29uc3QgcmVhZHkgPSBQcm9taXNlXG4gICAgICAgICAgLnJlc29sdmUgQCBvbl9pbml0KGVwLCBodWIpXG4gICAgICAgICAgLnRoZW4gQCBfYWZ0ZXJfaW5pdFxuXG4gICAgICAgIHJlYWR5LmNhdGNoIEAgZXJyID0+XG4gICAgICAgICAgaGFuZGxlcnMub25fZXJyb3IgQCBlcnIsIEB7fSB6b25lOidvbl9yZWFkeSdcblxuICAgICAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBlcF90Z3QsIEB7fVxuICAgICAgICAgIHJlYWR5OiBAe30gdmFsdWU6IHJlYWR5LnRoZW4gQCAoKSA9PiBlcF90Z3RcblxuXG4gICAgICAgIGZ1bmN0aW9uIF9hZnRlcl9pbml0KHRhcmdldCkgOjpcbiAgICAgICAgICBpZiBudWxsID09IHRhcmdldCA6OlxuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBlbmRwb2ludCBpbml0IHRvIHJldHVybiBhIGNsb3N1cmUgb3IgaW50ZXJmYWNlYFxuXG4gICAgICAgICAgaGFuZGxlcnMub25fbXNnID0gKHRhcmdldC5vbl9tc2cgfHwgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0YXJnZXQgPyB0YXJnZXQgOiBkZWZhdWx0X29uX21zZykpLmJpbmQodGFyZ2V0KVxuICAgICAgICAgIGhhbmRsZXJzLm9uX2Vycm9yID0gKHRhcmdldC5vbl9lcnJvciB8fCBkZWZhdWx0X29uX2Vycm9yKS5iaW5kKHRhcmdldCwgZXApXG4gICAgICAgICAgaGFuZGxlcnMub25fc2h1dGRvd24gPSAodGFyZ2V0Lm9uX3NodXRkb3duIHx8IGRlZmF1bHRfb25fc2h1dGRvd24pLmJpbmQodGFyZ2V0LCBlcClcblxuICAgICAgICAgIGNvbnN0IGpzb25fdW5wYWNrID0gdGFyZ2V0Lmpzb25fdW5wYWNrXG4gICAgICAgICAgICA/IHRhcmdldC5qc29uX3VucGFjay5iaW5kKHRhcmdldClcbiAgICAgICAgICAgIDogRVBUYXJnZXQuanNvblVucGFjayhtc2dfY3R4KVxuXG4gICAgICAgICAgY29uc3Qgc2luayA9IG5ldyBTaW5rIEAganNvbl91bnBhY2tcbiAgICAgICAgICBzaW5rLnJlZ2lzdGVyIEAgZXAsIGh1YiwgaWRfdGFyZ2V0LCBoYW5kbGVyc1xuXG4gICAgICAgICAgcmV0dXJuIHRhcmdldC5vbl9yZWFkeVxuICAgICAgICAgICAgPyB0YXJnZXQub25fcmVhZHkoZXAsIGh1YilcbiAgICAgICAgICAgIDogdGFyZ2V0XG5cblxuXG4gICAgICBmdW5jdGlvbiBjbGllbnRFbmRwb2ludChvbl9yZWFkeSkgOjpcbiAgICAgICAgbGV0IGVwX3RndCwgZG9uZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgICAgICBlcF90Z3QgPSBlbmRwb2ludCBAIGVwID0+IEA6XG4gICAgICAgICAgICBhc3luYyBvbl9yZWFkeShlcCwgaHViKSA6OlxuICAgICAgICAgICAgICByZXNvbHZlIEAgYXdhaXQgb25fcmVhZHkoZXAsIGh1YilcbiAgICAgICAgICAgICAgZXAuc2h1dGRvd24oKVxuXG4gICAgICAgICAgICBvbl9zaHV0ZG93bihlcCkgOjogcmVqZWN0KClcbiAgICAgICAgICAgIG9uX3NlbmRfZXJyb3IoZXAsIGVycikgOjogcmVqZWN0KGVycilcblxuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbiBAIGVwX3RndCwgQHt9XG4gICAgICAgICAgdGhlbih5LG4pIDo6IHJldHVybiBkb25lLnRoZW4oeSxuKVxuICAgICAgICAgIGNhdGNoKG4pIDo6IHJldHVybiBkb25lLmNhdGNoKG4pXG4gICAgICAgICAgZG9uZVxuXG5cbiAgICAgIGZ1bmN0aW9uIGNsaWVudCguLi5hcmdzKSA6OlxuICAgICAgICBpZiAxID09PSBhcmdzLmxlbmd0aCAmJiAnZnVuY3Rpb24nID09PSB0eXBlb2YgYXJnc1swXSA6OlxuICAgICAgICAgIHJldHVybiBjbGllbnRFbmRwb2ludChhcmdzWzBdKVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCA9PT0gX2NsaWVudF9ycmMgOjpcbiAgICAgICAgICBfY2xpZW50X3JyYyA9IGJpbmRSb3V0ZUNoYW5uZWwoaHViLCBjcmVhdGVSb3V0ZUNhY2hlKGZhbHNlKSlcblxuICAgICAgICBjb25zdCBtc2dfY3R4ID0gbmV3IE1zZ0N0eCBAIG51bGwsIF9jbGllbnRfcnJjXG4gICAgICAgIHJldHVybiAwICE9PSBhcmdzLmxlbmd0aCA/IG1zZ19jdHgudG8oLi4uYXJncykgOiBtc2dfY3R4XG5cbiIsImltcG9ydCBlbmRwb2ludF9wbHVnaW4gZnJvbSAnLi9wbHVnaW4uanN5J1xuXG5jb25zdCBnZXRSYW5kb21WYWx1ZXMgPSAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIHdpbmRvd1xuICA/IHdpbmRvdy5jcnlwdG8uZ2V0UmFuZG9tVmFsdWVzIDogbnVsbFxuXG5lbmRwb2ludF9icm93c2VyLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuZnVuY3Rpb24gcmFuZG9tX2lkKCkgOjpcbiAgY29uc3QgYXJyID0gbmV3IEludDMyQXJyYXkoMSlcbiAgZ2V0UmFuZG9tVmFsdWVzKGFycilcbiAgcmV0dXJuIGFyclswXVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBlbmRwb2ludF9icm93c2VyKHBsdWdpbl9vcHRpb25zPXt9KSA6OlxuICBpZiBudWxsID09IHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA6OlxuICAgIHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuXG4gIHJldHVybiBlbmRwb2ludF9wbHVnaW4ocGx1Z2luX29wdGlvbnMpXG5cbiJdLCJuYW1lcyI6WyJsaXR0bGVfZW5kaWFuIiwiY19zaW5nbGUiLCJjX2RhdGFncmFtIiwiY19kaXJlY3QiLCJjX211bHRpcGFydCIsImNfc3RyZWFtaW5nIiwiX2Vycl9tc2dpZF9yZXF1aXJlZCIsIl9lcnJfdG9rZW5fcmVxdWlyZWQiLCJmcm1fcm91dGluZyIsInNpemUiLCJiaXRzIiwibWFzayIsIm9iaiIsImZyb21faWQiLCJkdiIsIm9mZnNldCIsInNldEludDMyIiwiaWRfcm91dGVyIiwiaWRfdGFyZ2V0IiwidW5kZWZpbmVkIiwiZ2V0SW50MzIiLCJmcm1fcmVzcG9uc2UiLCJtc2dpZCIsIkVycm9yIiwic2V0SW50MTYiLCJzZXFfYWNrIiwiYWNrX2ZsYWdzIiwidG9rZW4iLCJnZXRJbnQxNiIsImZybV9kYXRhZ3JhbSIsInRyYW5zcG9ydCIsImZybV9kaXJlY3QiLCJmcm1fbXVsdGlwYXJ0Iiwic2VxX3BvcyIsInNlcSIsInNlcV9mbGFncyIsImZybV9zdHJlYW1pbmciLCJiaW5kX3NlcV9uZXh0Iiwic2VxX29mZnNldCIsInNlcV9uZXh0IiwiZmxhZ3MiLCJmaW4iLCJOYU4iLCJjb21wb3NlRnJhbWluZ3MiLCJmcm1fZnJvbSIsImZybV9yZXNwIiwiZnJtX3RyYW5zcG9ydHMiLCJsZW5ndGgiLCJieUJpdHMiLCJ0X2Zyb20iLCJmX3Rlc3QiLCJ0X3Jlc3AiLCJ0MCIsInQxIiwidDIiLCJ0MyIsIm1hcCIsImYiLCJ0ZXN0Qml0cyIsImNob29zZSIsImxzdCIsIlQiLCJiIiwib3AiLCJmbl9rZXkiLCJmbl90cmFuIiwiZm5fZnJvbSIsImZuX3Jlc3AiLCJmcm0iLCJiaW5kQXNzZW1ibGVkIiwiZl9wYWNrIiwiZl91bnBhY2siLCJwYWNrIiwidW5wYWNrIiwicGt0X3R5cGUiLCJwa3Rfb2JqIiwiVHlwZUVycm9yIiwidHlwZSIsIkRhdGFWaWV3IiwiQXJyYXlCdWZmZXIiLCJoZWFkZXIiLCJidWZmZXIiLCJzbGljZSIsInBrdCIsImJ1ZiIsImhlYWRlcl9idWZmZXIiLCJVaW50OEFycmF5IiwiaW5mbyIsIl9iaW5kX2l0ZXJhYmxlIiwiYnVmX2Nsb25lIiwidHRsIiwibmV4dCIsIm9wdGlvbnMiLCJkb25lIiwidmFsdWUiLCJwYWNrZXRQYXJzZXIiLCJmcmFnbWVudF9zaXplIiwiY29uY2F0QnVmZmVycyIsInBhY2tQYWNrZXRPYmoiLCJwYWNrX3V0ZjgiLCJ1bnBhY2tfdXRmOCIsIk51bWJlciIsInJhbmRvbV9pZCIsImpzb25fcGFjayIsImNyZWF0ZVN0cmVhbSIsInBhY2tldEZyYWdtZW50cyIsImNyZWF0ZU11bHRpcGFydCIsInNpbmsiLCJwYXJ0cyIsImZlZWQiLCJib2R5X2J1ZmZlciIsImluY2x1ZGVzIiwiZGVsZXRlU3RhdGVGb3IiLCJyZXMiLCJyZWN2RGF0YSIsInJzdHJlYW0iLCJzdGF0ZSIsImZlZWRfaW5pdCIsImFzX2NvbnRlbnQiLCJmZWVkX2lnbm9yZSIsIm1zZyIsImpzb25fdW5wYWNrIiwiYm9keV91dGY4IiwicmVjdlN0cmVhbSIsInJlY3ZTdHJlYW1EYXRhIiwiYmluZCIsImVyciIsIm9uX2Vycm9yIiwiZmVlZF9ib2R5Iiwib25faW5pdCIsImRhdGEiLCJvbl9kYXRhIiwib25fZW5kIiwiZmVlZF9zZXEiLCJuZXh0X2hkciIsImkiLCJsYXN0SW5uZXIiLCJieXRlTGVuZ3RoIiwiaTAiLCJib2R5IiwiYmluZFRyYW5zcG9ydEltcGxzIiwiaW5ib3VuZCIsImhpZ2hiaXRzIiwidHJhbnNwb3J0cyIsIm91dGJvdW5kIiwiZnJhbWluZ3MiLCJmcmFtZSIsImltcGwiLCJ0X3JlY3YiLCJwYWNrX2hkciIsInJlY3ZfbXNnIiwiYmluZFRyYW5zcG9ydHMiLCJwYWNrQm9keSIsInN0cmVhbWluZyIsInNlbmQiLCJzdHJlYW0iLCJiaW5kX3N0cmVhbSIsIm1vZGUiLCJjaGFuIiwibXNlbmQiLCJtc2VuZF9ieXRlcyIsIm1zZW5kX29iamVjdHMiLCJtc2VuZF9pbXBsIiwib2JqZWN0IiwiYnl0ZXMiLCJ3cml0ZSIsImVuZCIsImNodW5rIiwiY2hlY2tfZm5zIiwia2V5cyIsImtleSIsImpzb25fcHJvdG9jb2wiLCJzaGFyZWQiLCJkYXRhZ3JhbSIsImRpcmVjdCIsInJlY3ZNc2ciLCJzdGF0ZUZvciIsImJvZHlfYnVmIiwidW5wYWNrQm9keSIsImJpbmFyeV9wcm90b2NvbCIsImFzQnVmZmVyIiwicGt0X2J1ZmZlciIsImNvbnRyb2xfcHJvdG9jb2wiLCJoaWdoIiwicGluZ19mcmFtZSIsInBvbmdfZnJhbWUiLCJwb25nX3R5cGUiLCJyZWN2X3BvbmciLCJwaW5nX3R5cGUiLCJyZWN2X3BpbmciLCJwaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsInRzMCIsIkRhdGUiLCJyb3V0ZXIiLCJib2R5X2pzb24iLCJyZWN2Q3RybCIsIl9zZW5kX3BvbmciLCJwa3RfcGluZyIsInJfaWQiLCJ0czEiLCJkaXNwYXRjaCIsImluaXRfcHJvdG9jb2wiLCJzaGFyZWRfcHJvdG8iLCJqc29uIiwianNvbl9wcm90byIsImJpbmFyeSIsImJpbmFyeV9wcm90byIsImNvbnRyb2wiLCJjb250cm9sX3Byb3RvIiwiY29kZWNzIiwiZGVmYXVsdCIsImJpbmRSb3V0ZUNoYW5uZWwiLCJodWIiLCJjYWNoZSIsImNoYW5uZWwiLCJjb25uZWN0X3NlbGYiLCJyZXNvbHZlUm91dGUiLCJyb3V0ZXMiLCJjYWNoZVJvdXRlQ2hhbm5lbCIsInJlc29sdmVSb3V0ZUNoYW5uZWwiLCJnZXQiLCJzZXQiLCJyb3V0ZSIsImRpc2NvIiwiaGFzIiwiZGVsZXRlIiwiRW5kcG9pbnQiLCJzdWJjbGFzcyIsImV4dGVuc2lvbnMiLCJhc3NpZ24iLCJwcm90b3R5cGUiLCJpZCIsImVuY29kZSIsIm1zZ19jdHgiLCJlcF90Z3QiLCJ3aXRoRW5kcG9pbnQiLCJhc1NlbmRlciIsImNvbnN0cnVjdG9yIiwianNvbl9hc19zZW5kZXIiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiZW51bWVyYWJsZSIsInRvIiwiTWFwIiwiY3JlYXRlTWFwIiwiYnlfdG9rZW4iLCJjcmVhdGVSZXBseU1hcCIsImJ5X3RyYWZmaWMiLCJjcmVhdGVUcmFmZmljTWFwIiwidHJhZmZpYyIsInRzIiwibm93IiwidCIsInJlY3ZUcmFmZmljIiwiY3JlYXRlU3RhdGVNYXAiLCJyZXBseSIsInJtc2ciLCJyZXNvbHZlIiwidGhlbiIsImlzX3JlcGx5Iiwic2VuZGVyIiwid2FybiIsImluaXRSZXBseSIsInBfc2VudCIsImluaXRSZXBseVByb21pc2UiLCJtb25pdG9yIiwiUHJvbWlzZSIsInJlamVjdCIsImNhdGNoIiwid2l0aFJlamVjdFRpbWVvdXQiLCJjbGVhciIsIkVQVGFyZ2V0IiwibXNnX2luZm8iLCJwcm9wcyIsInNpbXBsZSIsImVwX2VuY29kZSIsImZhc3RfanNvbiIsIk9iamVjdCIsImZyb21fanNvbiIsImpzb25VbnBhY2siLCJ4Zm9ybUJ5S2V5IiwiY3JlYXRlIiwidiIsImVwX2RlY29kZSIsImpzb25VbnBhY2tCeUtleSIsInJlZyIsIldlYWtNYXAiLCJzeiIsInBhcnNlIiwicmV2aXZlciIsInhmbiIsInZmbiIsImJpbmRDdHhQcm9wcyIsImluaXQiLCJjdHgiLCJxdWVyeSIsInJlcGx5RXhwZWN0ZWQiLCJyIiwidG9TdHJpbmciLCJzcGxpdCIsInBhcnNlSW50IiwiU2luayIsImZvclByb3RvY29scyIsIl9wcm90b2NvbCIsImVuZHBvaW50IiwiaGFuZGxlcnMiLCJ1bnJlZ2lzdGVyIiwidW5yZWdpc3RlclRhcmdldCIsInJlZ2lzdGVyVGFyZ2V0IiwiX2JpbmREaXNwYXRjaCIsIm9uX21zZyIsIm9uX3NodXRkb3duIiwiYWxpdmUiLCJwcm90b2NvbCIsImlzQWxpdmUiLCJzaHV0ZG93biIsImV4dHJhIiwiYmluZFNpbmsiLCJ6b25lIiwidGVybWluYXRlIiwiaWZBYnNlbnQiLCJlbnRyeSIsImJ5X21zZ2lkIiwiTXNnQ3R4Iiwid2l0aENvZGVjcyIsImZyZWV6ZSIsIl9pbnZva2VfZXgiLCJfbXNnQ29kZWNzIiwiYXJncyIsIl9jb2RlYyIsImZuT3JLZXkiLCJpbnZva2UiLCJhc3NlcnRNb25pdG9yIiwidGd0Iiwic2VsZiIsImNsb25lIiwicmVwbHlfaWQiLCJ3aXRoIiwiX3Jvb3RfIiwiY2hlY2tNb25pdG9yIiwiYWN0aXZlIiwiaW5pdE1vbml0b3IiLCJ0c19kdXJhdGlvbiIsInRzX2FjdGl2ZSIsInByb21pc2UiLCJ0ZCIsInRpZCIsInRzX2ludGVydmFsIiwiY3RybCIsImNvZGVjIiwiY2hlY2tQaW5nIiwic2V0SW50ZXJ2YWwiLCJ1bnJlZiIsImNsZWFySW50ZXJ2YWwiLCJtc2dfY29kZWMiLCJtc2dDb2RlY3MiLCJuYW1lIiwiZW50cmllcyIsImpzb25fc2VuZCIsInBfcmVwbHkiLCJ0aW1lb3V0IiwiUmVwbHlUaW1lb3V0Iiwic2V0VGltZW91dCIsIm1zX3RpbWVvdXQiLCJkZWZhdWx0X3BsdWdpbl9vcHRpb25zIiwiZXAiLCJlcnJvciIsIm1lc3NhZ2UiLCJjbGFzc2VzIiwiY3JlYXRlUm91dGVDYWNoZSIsInBsdWdpbl9vcHRpb25zIiwiZGVmYXVsdF9vbl9tc2ciLCJkZWZhdWx0X29uX2Vycm9yIiwiZGVmYXVsdF9vbl9zaHV0ZG93biIsIm9yZGVyIiwicG9zdCIsIkZhYnJpY0h1Yl9QSSIsImJhc2VzIiwiaXNQYWNrZXRQYXJzZXIiLCJwbHVnaW5fbmFtZSIsImJpbmRFbmRwb2ludEFwaSIsInByb3RvY29scyIsIlNpbmtCYXNlIiwiTXNnQ3R4QmFzZSIsIkVuZHBvaW50QmFzZSIsIkVQVGFyZ2V0QmFzZSIsIl9jbGllbnRfcnJjIiwic2VydmVyIiwiY2xpZW50IiwiY2xpZW50RW5kcG9pbnQiLCJ0YXJnZXRzIiwiaWRfc2VsZiIsInJlYWR5IiwiX2FmdGVyX2luaXQiLCJ0YXJnZXQiLCJyZWdpc3RlciIsIm9uX3JlYWR5IiwieSIsIm4iLCJnZXRSYW5kb21WYWx1ZXMiLCJ3aW5kb3ciLCJjcnlwdG8iLCJlbmRwb2ludF9icm93c2VyIiwiYXJyIiwiSW50MzJBcnJheSIsImVuZHBvaW50X3BsdWdpbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQSxNQUFNQSxnQkFBZ0IsSUFBdEI7QUFDQSxNQUFNQyxXQUFXLFFBQWpCO0FBQ0EsTUFBTUMsYUFBYSxVQUFuQjtBQUNBLE1BQU1DLFdBQVcsUUFBakI7QUFDQSxNQUFNQyxjQUFjLFdBQXBCO0FBQ0EsTUFBTUMsY0FBYyxXQUFwQjs7QUFFQSxNQUFNQyxzQkFBdUIsMEJBQTdCO0FBQ0EsTUFBTUMsc0JBQXVCLDJCQUE3Qjs7QUFHQSxTQUFTQyxXQUFULEdBQXVCO1FBQ2ZDLE9BQU8sQ0FBYjtRQUFnQkMsT0FBTyxHQUF2QjtRQUE0QkMsT0FBTyxHQUFuQztTQUNPO1FBQUEsRUFDQ0QsSUFERCxFQUNPQyxJQURQOztXQUdFQyxHQUFQLEVBQVk7YUFBVSxRQUFRQSxJQUFJQyxPQUFaLEdBQXNCSCxJQUF0QixHQUE2QixLQUFwQztLQUhWOztXQUtFRSxHQUFQLEVBQVlFLEVBQVosRUFBZ0JDLE1BQWhCLEVBQXdCO1lBQ2hCLEVBQUNGLE9BQUQsS0FBWUQsR0FBbEI7U0FDR0ksUUFBSCxDQUFjLElBQUVELE1BQWhCLEVBQXdCLElBQUVGLFFBQVFJLFNBQWxDLEVBQTZDakIsYUFBN0M7U0FDR2dCLFFBQUgsQ0FBYyxJQUFFRCxNQUFoQixFQUF3QixJ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

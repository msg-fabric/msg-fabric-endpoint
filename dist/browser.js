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
    _send_pong(pkt.body, pkt, sink, router);
    return sink.recvCtrl(pkt.body, pkt.info);
  }

  function _send_pong({ ts0 }, pkt_ping, sink, router) {
    const { msgid, from_id: r_id } = pkt_ping.info;
    const { id_router, id_target } = r_id;
    const obj = { id_router, id_target,
      from_id: sink.from_id, msgid,
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

class EPTarget {
  static subclass(extensions) {
    class EPTarget extends this {}
    Object.assign(EPTarget.prototype, extensions);
    return EPTarget;
  }

  constructor(id, msg_ctx, msg_info) {
    const props = {
      id_router: { enumerable: true, value: id.id_router },
      id_target: { enumerable: true, value: id.id_target } };

    if (msg_ctx) {
      bindCtxProps(props, msg_info, () => msg_ctx.to(this, msg_info).fast_json);
    }
    return Object.defineProperties(this, props);
  }

  valueOf() {
    return 0 | this.id_target;
  }
  inspect() {
    return `«EPTarget ${this.ep_encode(this, true)}»`;
  }
  toJSON() {
    return this.ep_encode(this);
  }
  isEPTarget() {
    return true;
  }

  static json_as_reply(msg_ctx) {
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
    // reads as "reply.expected"
    props.expected = { value: true };
  }
}

const token = '\u03E0'; // 'Ϡ'
EPTarget.token = token;

EPTarget.ep_encode = EPTarget.prototype.ep_encode = ep_encode;
function ep_encode(from_id, simple) {
  let { id_router: r, id_target: t } = from_id;
  r = (r >>> 0).toString(36);
  t = (t >>> 0).toString(36);
  return simple ? `${token} ${r}~${t}` : { [token]: `${r}~${t}` };
}

EPTarget.ep_decode = EPTarget.prototype.ep_decode = ep_decode;
function ep_decode(v) {
  const from_id = 'string' === typeof v ? v.split(token)[1] : v[token];
  if (!from_id) {
    return;
  }

  let [r, t] = from_id.split('~');
  if (undefined === t) {
    return;
  }
  r = 0 | parseInt(r, 36);
  t = 0 | parseInt(t, 36);

  return { id_router: r, id_target: t };
}

class Endpoint {
  static subclass(extensions) {
    class Endpoint extends this {}
    Object.assign(Endpoint.prototype, extensions);
    return Endpoint;
  }

  valueOf() {
    return this.from_id;
  }
  inspect() {
    return `«Endpoint ${ep_encode(this.from_id, true)}»`;
  }

  constructor(msg_ctx, ep_tgt) {
    msg_ctx = msg_ctx.withEndpoint(this);
    const asReply = ep_tgt.constructor.json_as_reply(msg_ctx);
    Object.defineProperties(this, {
      from_id: { value: msg_ctx.from_id, enumerable: true },
      toJSON: { value() {
          return ep_tgt.toJSON();
        } },
      to: { value: msg_ctx.to },
      asReply: { value: asReply } });
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
      from_id: this.from_id,
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
    return { msg, info, reply: this.asReply(info) };
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

  inspect() {
    const ctx = Object.assign({}, this.ctx);
    ctx.from = ep_encode(ctx.from_id, true);
    ctx.to = ep_encode(ctx, true);
    delete ctx.from_id;delete ctx.id_router;delete ctx.id_target;
    return `«MsgCtx ${JSON.stringify(ctx)}»`;
  }

  constructor(from_id, resolveRouteChannel) {
    if (null !== from_id) {
      const { id_target, id_router } = from_id;
      from_id = Object.freeze({ id_target, id_router });
    }

    const ctx = { from_id };
    Object.defineProperties(this, {
      _root_: { value: this },
      from_id: { value: from_id },
      ctx: { value: ctx },
      resolveRouteChannel: { value: resolveRouteChannel } });
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
  query(...args) {
    return this._invoke_ex(this._codec.send, args, true);
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
        const { from_id: reply_id, id_target, id_router, token, msgid } = ep_decode(tgt) || tgt;

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
            query: (...args) => this._invoke_ex(json_send, args, true) };
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
      EPTarget: EPTarget.subclass(protocols) });

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
        const from_id = { id_target, id_router: hub.router.id_self };
        const msg_ctx = new MsgCtx$$1(from_id, bindRouteChannel(hub, createRouteCache(true)));
        const ep_tgt = new EPTarget$$1(msg_ctx.from_id);
        const ep = new Endpoint$$1(msg_ctx, ep_tgt);

        const ready = Promise.resolve(on_init(ep, hub)).then(_after_init).catch(err => handlers.on_error(err, { zone: 'on_ready' }));

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3Nlci5qcyIsInNvdXJjZXMiOlsiLi4vY29kZS9wcm90b2NvbC9mcmFtaW5nLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvc2hhcmVkLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvanNvbi5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2JpbmFyeS5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2NvbnRyb2wuanN5IiwiLi4vY29kZS9wcm90b2NvbC9pbmRleC5qc3kiLCIuLi9jb2RlL2NvcmVfaW50ZWdyYXRpb24uanN5IiwiLi4vY29kZS9lcF90YXJnZXQuanN5IiwiLi4vY29kZS9lbmRwb2ludC5qc3kiLCIuLi9jb2RlL3NpbmsuanN5IiwiLi4vY29kZS9tc2djdHguanN5IiwiLi4vY29kZS9wbHVnaW4uanN5IiwiLi4vY29kZS9pbmRleC5icm93c2VyLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBsaXR0bGVfZW5kaWFuID0gdHJ1ZVxuY29uc3QgY19zaW5nbGUgPSAnc2luZ2xlJ1xuY29uc3QgY19kYXRhZ3JhbSA9ICdkYXRhZ3JhbSdcbmNvbnN0IGNfZGlyZWN0ID0gJ2RpcmVjdCdcbmNvbnN0IGNfbXVsdGlwYXJ0ID0gJ211bHRpcGFydCdcbmNvbnN0IGNfc3RyZWFtaW5nID0gJ3N0cmVhbWluZydcblxuY29uc3QgX2Vycl9tc2dpZF9yZXF1aXJlZCA9IGBSZXNwb25zZSByZXFpcmVzICdtc2dpZCdgXG5jb25zdCBfZXJyX3Rva2VuX3JlcXVpcmVkID0gYFRyYW5zcG9ydCByZXFpcmVzICd0b2tlbidgXG5cblxuZnVuY3Rpb24gZnJtX3JvdXRpbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MSwgbWFzayA9IDB4MVxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLmZyb21faWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCB7ZnJvbV9pZH0gPSBvYmpcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF9yb3V0ZXIsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDMyIEAgNCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF90YXJnZXQsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IGZyb21faWQgPSB1bmRlZmluZWQgPT09IG9iai5mcm9tX2lkXG4gICAgICAgID8gb2JqLmZyb21faWQgPSB7fSA6IG9iai5mcm9tX2lkXG4gICAgICBmcm9tX2lkLmlkX3JvdXRlciA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGZyb21faWQuaWRfdGFyZ2V0ID0gZHYuZ2V0SW50MzIgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5mdW5jdGlvbiBmcm1fcmVzcG9uc2UoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MiwgbWFzayA9IDB4MlxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLm1zZ2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoubXNnaWQgOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl9tc2dpZF9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLm1zZ2lkLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXFfYWNrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5hY2tfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50b2tlbiA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfYWNrID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLmFja19mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuXG5cbmZ1bmN0aW9uIGZybV9kYXRhZ3JhbSgpIDo6XG4gIGNvbnN0IHNpemUgPSAwLCBiaXRzID0gMHgwLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RhdGFncmFtXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGF0YWdyYW0gPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kYXRhZ3JhbVxuXG5mdW5jdGlvbiBmcm1fZGlyZWN0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDQsIGJpdHMgPSAweDQsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGlyZWN0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGlyZWN0ID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGlyZWN0XG5cbmZ1bmN0aW9uIGZybV9tdWx0aXBhcnQoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4OCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19tdWx0aXBhcnRcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19tdWx0aXBhcnQgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjogLy8gdXNlIHNlcV9uZXh0XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX211bHRpcGFydFxuXG5mdW5jdGlvbiBmcm1fc3RyZWFtaW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweGMsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfc3RyZWFtaW5nXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfc3RyZWFtaW5nID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW4gLy8gdXNlIHNlcV9uZXh0XG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19zdHJlYW1pbmdcblxuXG5mdW5jdGlvbiBiaW5kX3NlcV9uZXh0KG9mZnNldCkgOjpcbiAgY29uc3Qgc2VxX29mZnNldCA9IHRoaXMuc2VxX3BvcyArIG9mZnNldFxuICBsZXQgc2VxID0gMVxuICByZXR1cm4gZnVuY3Rpb24gc2VxX25leHQoe2ZsYWdzLCBmaW59LCBkdikgOjpcbiAgICBpZiAhIGZpbiA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCBzZXErKywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICBlbHNlIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIC1zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgICBzZXEgPSBOYU5cblxuXG5cbmV4cG9ydCBkZWZhdWx0IGNvbXBvc2VGcmFtaW5ncygpXG5mdW5jdGlvbiBjb21wb3NlRnJhbWluZ3MoKSA6OlxuICBjb25zdCBmcm1fZnJvbSA9IGZybV9yb3V0aW5nKCksIGZybV9yZXNwID0gZnJtX3Jlc3BvbnNlKClcbiAgY29uc3QgZnJtX3RyYW5zcG9ydHMgPSBAW10gZnJtX2RhdGFncmFtKCksIGZybV9kaXJlY3QoKSwgZnJtX211bHRpcGFydCgpLCBmcm1fc3RyZWFtaW5nKClcblxuICBpZiA4ICE9PSBmcm1fZnJvbS5zaXplIHx8IDggIT09IGZybV9yZXNwLnNpemUgfHwgNCAhPSBmcm1fdHJhbnNwb3J0cy5sZW5ndGggOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgRnJhbWluZyBTaXplIGNoYW5nZWBcblxuICBjb25zdCBieUJpdHMgPSBbXSwgbWFzaz0weGZcblxuICA6OlxuICAgIGNvbnN0IHRfZnJvbSA9IGZybV9mcm9tLmZfdGVzdCwgdF9yZXNwID0gZnJtX3Jlc3AuZl90ZXN0XG4gICAgY29uc3QgW3QwLHQxLHQyLHQzXSA9IGZybV90cmFuc3BvcnRzLm1hcCBAIGY9PmYuZl90ZXN0XG5cbiAgICBjb25zdCB0ZXN0Qml0cyA9IGJ5Qml0cy50ZXN0Qml0cyA9IG9iaiA9PlxuICAgICAgMCB8IHRfZnJvbShvYmopIHwgdF9yZXNwKG9iaikgfCB0MChvYmopIHwgdDEob2JqKSB8IHQyKG9iaikgfCB0MyhvYmopXG5cbiAgICBieUJpdHMuY2hvb3NlID0gZnVuY3Rpb24gKG9iaiwgbHN0KSA6OlxuICAgICAgaWYgbnVsbCA9PSBsc3QgOjogbHN0ID0gdGhpcyB8fCBieUJpdHNcbiAgICAgIHJldHVybiBsc3RbdGVzdEJpdHMob2JqKV1cblxuXG4gIGZvciBjb25zdCBUIG9mIGZybV90cmFuc3BvcnRzIDo6XG4gICAgY29uc3Qge2JpdHM6Yiwgc2l6ZSwgdHJhbnNwb3J0fSA9IFRcblxuICAgIGJ5Qml0c1tifDBdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwwLCBtYXNrLCBzaXplOiBzaXplLCBvcDogJydcbiAgICBieUJpdHNbYnwxXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MSwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAnZidcbiAgICBieUJpdHNbYnwyXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MiwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAncidcbiAgICBieUJpdHNbYnwzXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MywgbWFzaywgc2l6ZTogMTYgKyBzaXplLCBvcDogJ2ZyJ1xuXG4gICAgZm9yIGNvbnN0IGZuX2tleSBvZiBbJ2ZfcGFjaycsICdmX3VucGFjayddIDo6XG4gICAgICBjb25zdCBmbl90cmFuID0gVFtmbl9rZXldLCBmbl9mcm9tID0gZnJtX2Zyb21bZm5fa2V5XSwgZm5fcmVzcCA9IGZybV9yZXNwW2ZuX2tleV1cblxuICAgICAgYnlCaXRzW2J8MF1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3RyYW4ob2JqLCBkdiwgMClcbiAgICAgIGJ5Qml0c1tifDFdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwyXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fcmVzcChvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8M11bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3Jlc3Aob2JqLCBkdiwgOCk7IGZuX3RyYW4ob2JqLCBkdiwgMTYpXG5cbiAgZm9yIGNvbnN0IGZybSBvZiBieUJpdHMgOjpcbiAgICBiaW5kQXNzZW1ibGVkIEAgZnJtXG5cbiAgcmV0dXJuIGJ5Qml0c1xuXG5cbmZ1bmN0aW9uIGJpbmRBc3NlbWJsZWQoZnJtKSA6OlxuICBjb25zdCB7VCwgc2l6ZSwgZl9wYWNrLCBmX3VucGFja30gPSBmcm1cbiAgaWYgVC5iaW5kX3NlcV9uZXh0IDo6XG4gICAgZnJtLnNlcV9uZXh0ID0gVC5iaW5kX3NlcV9uZXh0IEAgZnJtLnNpemUgLSBULnNpemVcblxuICBkZWxldGUgZnJtLlRcbiAgZnJtLnBhY2sgPSBwYWNrIDsgZnJtLnVucGFjayA9IHVucGFja1xuICBjb25zdCBzZXFfbmV4dCA9IGZybS5zZXFfbmV4dFxuXG4gIGZ1bmN0aW9uIHBhY2socGt0X3R5cGUsIHBrdF9vYmopIDo6XG4gICAgaWYgISBAIDAgPD0gcGt0X3R5cGUgJiYgcGt0X3R5cGUgPD0gMjU1IDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBrdF90eXBlIHRvIGJlIFswLi4yNTVdYFxuXG4gICAgcGt0X29iai50eXBlID0gcGt0X3R5cGVcbiAgICBpZiBzZXFfbmV4dCAmJiBudWxsID09IHBrdF9vYmouc2VxIDo6XG4gICAgICBwa3Rfb2JqLnNlcSA9IHRydWVcblxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IEFycmF5QnVmZmVyKHNpemUpXG4gICAgZl9wYWNrKHBrdF9vYmosIGR2LCAwKVxuICAgIHBrdF9vYmouaGVhZGVyID0gZHYuYnVmZmVyXG5cbiAgICBpZiB0cnVlID09PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgX2JpbmRfaXRlcmFibGUgQCBwa3Rfb2JqLCBkdi5idWZmZXIuc2xpY2UoMCxzaXplKVxuXG4gIGZ1bmN0aW9uIHVucGFjayhwa3QpIDo6XG4gICAgY29uc3QgYnVmID0gcGt0LmhlYWRlcl9idWZmZXIoKVxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IFVpbnQ4QXJyYXkoYnVmKS5idWZmZXJcblxuICAgIGNvbnN0IGluZm8gPSB7fVxuICAgIGZfdW5wYWNrKGluZm8sIGR2LCAwKVxuICAgIHJldHVybiBwa3QuaW5mbyA9IGluZm9cblxuICBmdW5jdGlvbiBfYmluZF9pdGVyYWJsZShwa3Rfb2JqLCBidWZfY2xvbmUpIDo6XG4gICAgY29uc3Qge3R5cGV9ID0gcGt0X29ialxuICAgIGNvbnN0IHtpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHRsLCB0b2tlbn0gPSBwa3Rfb2JqXG4gICAgcGt0X29iai5uZXh0ID0gbmV4dFxuXG4gICAgZnVuY3Rpb24gbmV4dChvcHRpb25zKSA6OlxuICAgICAgaWYgbnVsbCA9PSBvcHRpb25zIDo6IG9wdGlvbnMgPSB7fVxuICAgICAgY29uc3QgaGVhZGVyID0gYnVmX2Nsb25lLnNsaWNlKClcbiAgICAgIHNlcV9uZXh0IEAgb3B0aW9ucywgbmV3IERhdGFWaWV3IEAgaGVhZGVyXG4gICAgICByZXR1cm4gQHt9IGRvbmU6ICEhIG9wdGlvbnMuZmluLCB2YWx1ZTogQHt9IC8vIHBrdF9vYmpcbiAgICAgICAgaWRfcm91dGVyLCBpZF90YXJnZXQsIHR5cGUsIHR0bCwgdG9rZW4sIGhlYWRlclxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGFja2V0UGFyc2VyLCBvcHRpb25zLCBmcmFnbWVudF9zaXplKSA6OlxuICBjb25zdCB7Y29uY2F0QnVmZmVycywgcGFja1BhY2tldE9iaiwgcGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBwYWNrZXRQYXJzZXJcbiAgZnJhZ21lbnRfc2l6ZSA9IE51bWJlcihmcmFnbWVudF9zaXplIHx8IDgwMDApXG4gIGlmIDEwMjQgPiBmcmFnbWVudF9zaXplIHx8IDY1MDAwIDwgZnJhZ21lbnRfc2l6ZSA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIGZyYWdtZW50IHNpemU6ICR7ZnJhZ21lbnRfc2l6ZX1gXG5cbiAgY29uc3Qge3JhbmRvbV9pZCwganNvbl9wYWNrfSA9IG9wdGlvbnNcbiAgcmV0dXJuIEA6IHBhY2tldFBhcnNlciwgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwgcGFja2V0RnJhZ21lbnRzXG4gICAgYmluZFRyYW5zcG9ydHNcblxuXG4gIGZ1bmN0aW9uIGNyZWF0ZU11bHRpcGFydChwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBwYXJ0cyA9IFtdLCBmaW4gPSBmYWxzZVxuICAgIHJldHVybiBAe30gZmVlZCwgaW5mbzogcGt0LmluZm9cblxuICAgIGZ1bmN0aW9uIGZlZWQocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxIDwgMCA6OiBmaW4gPSB0cnVlOyBzZXEgPSAtc2VxXG4gICAgICBwYXJ0c1tzZXEtMV0gPSBwa3QuYm9keV9idWZmZXIoKVxuXG4gICAgICBpZiAhIGZpbiA6OiByZXR1cm5cbiAgICAgIGlmIHBhcnRzLmluY2x1ZGVzIEAgdW5kZWZpbmVkIDo6IHJldHVyblxuXG4gICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuXG4gICAgICBjb25zdCByZXMgPSBjb25jYXRCdWZmZXJzKHBhcnRzKVxuICAgICAgcGFydHMgPSBudWxsXG4gICAgICByZXR1cm4gcmVzXG5cbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtKHBrdCwgc2luaywgbXNnaWQpIDo6XG4gICAgbGV0IG5leHQ9MCwgZmluID0gZmFsc2UsIHJlY3ZEYXRhLCByc3RyZWFtXG4gICAgY29uc3Qgc3RhdGUgPSBAe30gZmVlZDogZmVlZF9pbml0LCBpbmZvOiBwa3QuaW5mb1xuICAgIHJldHVybiBzdGF0ZVxuXG4gICAgZnVuY3Rpb24gZmVlZF9pbml0KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuXG4gICAgICBjb25zdCBpbmZvID0gcGt0LmluZm9cbiAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiAgICAgIHJzdHJlYW0gPSBzaW5rLnJlY3ZTdHJlYW0obXNnLCBpbmZvKVxuICAgICAgaWYgbnVsbCA9PSByc3RyZWFtIDo6IHJldHVyblxuICAgICAgY2hlY2tfZm5zIEAgcnN0cmVhbSwgJ29uX2Vycm9yJywgJ29uX2RhdGEnLCAnb25fZW5kJyBcbiAgICAgIHJlY3ZEYXRhID0gc2luay5yZWN2U3RyZWFtRGF0YS5iaW5kKHNpbmssIHJzdHJlYW0sIGluZm8pXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9ib2R5XG4gICAgICBpZiByc3RyZWFtLm9uX2luaXQgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25faW5pdChtc2csIHBrdClcblxuICAgIGZ1bmN0aW9uIGZlZWRfYm9keShwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICByZWN2RGF0YSgpXG4gICAgICBsZXQgZGF0YVxuICAgICAgdHJ5IDo6XG4gICAgICAgIGZlZWRfc2VxKHBrdClcbiAgICAgICAgZGF0YSA9IGFzX2NvbnRlbnQocGt0LCBzaW5rKVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgaWYgZmluIDo6XG4gICAgICAgIGNvbnN0IHJlcyA9IHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lbmQgQCByZXMsIHBrdFxuICAgICAgZWxzZSA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9kYXRhIEAgZGF0YSwgcGt0XG5cbiAgICBmdW5jdGlvbiBmZWVkX2lnbm9yZShwa3QpIDo6XG4gICAgICB0cnkgOjogZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG5cbiAgICBmdW5jdGlvbiBmZWVkX3NlcShwa3QpIDo6XG4gICAgICBsZXQgc2VxID0gcGt0LmluZm8uc2VxXG4gICAgICBpZiBzZXEgPj0gMCA6OlxuICAgICAgICBpZiBuZXh0KysgPT09IHNlcSA6OlxuICAgICAgICAgIHJldHVybiAvLyBpbiBvcmRlclxuICAgICAgZWxzZSA6OlxuICAgICAgICBmaW4gPSB0cnVlXG4gICAgICAgIHNpbmsuZGVsZXRlU3RhdGVGb3IobXNnaWQpXG4gICAgICAgIGlmIG5leHQgPT09IC1zZXEgOjpcbiAgICAgICAgICBuZXh0ID0gJ2RvbmUnXG4gICAgICAgICAgcmV0dXJuIC8vIGluLW9yZGVyLCBsYXN0IHBhY2tldFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcbiAgICAgIG5leHQgPSAnaW52YWxpZCdcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYWNrZXQgb3V0IG9mIHNlcXVlbmNlYFxuXG4gIGZ1bmN0aW9uICogcGFja2V0RnJhZ21lbnRzKGJ1ZiwgbmV4dF9oZHIsIGZpbikgOjpcbiAgICBpZiBudWxsID09IGJ1ZiA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICB5aWVsZCBvYmpcbiAgICAgIHJldHVyblxuXG4gICAgbGV0IGkgPSAwLCBsYXN0SW5uZXIgPSBidWYuYnl0ZUxlbmd0aCAtIGZyYWdtZW50X3NpemU7XG4gICAgd2hpbGUgaSA8IGxhc3RJbm5lciA6OlxuICAgICAgY29uc3QgaTAgPSBpXG4gICAgICBpICs9IGZyYWdtZW50X3NpemVcblxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoKVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaTAsIGkpXG4gICAgICB5aWVsZCBvYmpcblxuICAgIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkpXG4gICAgICB5aWVsZCBvYmpcblxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IG91dGJvdW5kID0gW11cbiAgICBvdXRib3VuZC5jaG9vc2UgPSBmcmFtaW5ncy5jaG9vc2VcblxuICAgIGZvciBjb25zdCBmcmFtZSBvZiBmcmFtaW5ncyA6OlxuICAgICAgY29uc3QgaW1wbCA9IGZyYW1lID8gdHJhbnNwb3J0c1tmcmFtZS50cmFuc3BvcnRdIDogbnVsbFxuICAgICAgaWYgISBpbXBsIDo6IGNvbnRpbnVlXG5cbiAgICAgIGNvbnN0IHtiaXRzLCBwYWNrLCB1bnBhY2t9ID0gZnJhbWVcbiAgICAgIGNvbnN0IHBrdF90eXBlID0gaGlnaGJpdHMgfCBiaXRzXG4gICAgICBjb25zdCB7dF9yZWN2fSA9IGltcGxcblxuICAgICAgZnVuY3Rpb24gcGFja19oZHIob2JqKSA6OlxuICAgICAgICBwYWNrKHBrdF90eXBlLCBvYmopXG4gICAgICAgIHJldHVybiBvYmpcblxuICAgICAgZnVuY3Rpb24gcmVjdl9tc2cocGt0LCBzaW5rKSA6OlxuICAgICAgICB1bnBhY2socGt0KVxuICAgICAgICByZXR1cm4gdF9yZWN2KHBrdCwgc2luaylcblxuICAgICAgcGFja19oZHIucGt0X3R5cGUgPSByZWN2X21zZy5wa3RfdHlwZSA9IHBrdF90eXBlXG4gICAgICBvdXRib3VuZFtiaXRzXSA9IHBhY2tfaGRyXG4gICAgICBpbmJvdW5kW3BrdF90eXBlXSA9IHJlY3ZfbXNnXG5cbiAgICAgIGlmICdwcm9kdWN0aW9uJyAhPT0gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgOjpcbiAgICAgICAgY29uc3Qgb3AgPSBwYWNrX2hkci5vcCA9IHJlY3ZfbXNnLm9wID0gZnJhbWUub3BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcGFja19oZHIsICduYW1lJywgQHt9IHZhbHVlOiBgcGFja19oZHIgwqske29wfcK7YFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCByZWN2X21zZywgJ25hbWUnLCBAe30gdmFsdWU6IGByZWN2X21zZyDCqyR7b3B9wrtgXG5cbiAgICByZXR1cm4gb3V0Ym91bmRcblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IHBhY2tCb2R5ID0gdHJhbnNwb3J0cy5wYWNrQm9keVxuICAgIGNvbnN0IG91dGJvdW5kID0gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKVxuICAgIHJldHVybiB0cmFuc3BvcnRzLnN0cmVhbWluZ1xuICAgICAgPyBAe30gc2VuZCwgc3RyZWFtOiBiaW5kX3N0cmVhbSBAIHRyYW5zcG9ydHMuc3RyZWFtaW5nLm1vZGVcbiAgICAgIDogQHt9IHNlbmRcblxuICAgIGZ1bmN0aW9uIHNlbmQoY2hhbiwgb2JqLCBib2R5KSA6OlxuICAgICAgYm9keSA9IHBhY2tCb2R5KGJvZHkpXG4gICAgICBpZiBmcmFnbWVudF9zaXplIDwgYm9keS5ieXRlTGVuZ3RoIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIG9iai50cmFuc3BvcnQgPSAnbXVsdGlwYXJ0J1xuICAgICAgICBjb25zdCBtc2VuZCA9IG1zZW5kX2J5dGVzKGNoYW4sIG9iailcbiAgICAgICAgcmV0dXJuIG1zZW5kIEAgdHJ1ZSwgYm9keVxuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gJ3NpbmdsZSdcbiAgICAgIG9iai5ib2R5ID0gYm9keVxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIHBhY2tfaGRyKG9iailcbiAgICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgICBmdW5jdGlvbiBtc2VuZF9ieXRlcyhjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGxldCB7bmV4dH0gPSBwYWNrX2hkcihvYmopXG4gICAgICBpZiBudWxsICE9PSBtc2cgOjpcbiAgICAgICAgb2JqLmJvZHkgPSBtc2dcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBjaGFuIEAgcGt0XG5cbiAgICAgIHJldHVybiBhc3luYyBmdW5jdGlvbiAoZmluLCBib2R5KSA6OlxuICAgICAgICBpZiBudWxsID09PSBuZXh0IDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgJ1dyaXRlIGFmdGVyIGVuZCdcbiAgICAgICAgbGV0IHJlc1xuICAgICAgICBmb3IgY29uc3Qgb2JqIG9mIHBhY2tldEZyYWdtZW50cyBAIGJvZHksIG5leHQsIGZpbiA6OlxuICAgICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgICByZXMgPSBhd2FpdCBjaGFuIEAgcGt0XG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gcmVzXG5cbiAgICBmdW5jdGlvbiBtc2VuZF9vYmplY3RzKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBjb25zdCBvYmogPSBuZXh0KHtmaW59KVxuICAgICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIGJpbmRfc3RyZWFtKG1vZGUpIDo6XG4gICAgICBjb25zdCBtc2VuZF9pbXBsID0ge29iamVjdDogbXNlbmRfb2JqZWN0cywgYnl0ZXM6IG1zZW5kX2J5dGVzfVttb2RlXVxuICAgICAgaWYgbXNlbmRfaW1wbCA6OiByZXR1cm4gc3RyZWFtXG5cbiAgICAgIGZ1bmN0aW9uIHN0cmVhbShjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgICAgaWYgISBvYmoudG9rZW4gOjogb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzdHJlYW1pbmcnXG4gICAgICAgIGNvbnN0IG1zZW5kID0gbXNlbmRfaW1wbCBAIGNoYW4sIG9iaiwganNvbl9wYWNrKG1zZylcbiAgICAgICAgd3JpdGUud3JpdGUgPSB3cml0ZTsgd3JpdGUuZW5kID0gd3JpdGUuYmluZCh0cnVlKVxuICAgICAgICByZXR1cm4gd3JpdGVcblxuICAgICAgICBmdW5jdGlvbiB3cml0ZShjaHVuaykgOjpcbiAgICAgICAgICByZXR1cm4gY2h1bmsgIT0gbnVsbFxuICAgICAgICAgICAgPyBtc2VuZCBAIHRydWU9PT10aGlzLCBwYWNrQm9keShjaHVuaylcbiAgICAgICAgICAgIDogbXNlbmQgQCB0cnVlXG5cblxuZnVuY3Rpb24gY2hlY2tfZm5zKG9iaiwgLi4ua2V5cykgOjpcbiAgZm9yIGNvbnN0IGtleSBvZiBrZXlzIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG9ialtrZXldIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIFwiJHtrZXl9XCIgdG8gYmUgYSBmdW5jdGlvbmBcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGpzb25fcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIGpzb25fcGFja30gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keVxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KCkgfHwgdW5kZWZpbmVkXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgYm9keV9idWYgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBib2R5X2J1ZiA6OlxuICAgICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCB1bnBhY2tfdXRmOChib2R5X2J1ZikgfHwgdW5kZWZpbmVkXG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdvYmplY3QnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICByZXR1cm4gc3RhdGUuZmVlZChwa3QsIHVucGFja0JvZHkpXG5cbiAgZnVuY3Rpb24gcGFja0JvZHkoYm9keSkgOjpcbiAgICByZXR1cm4gcGFja191dGY4IEAganNvbl9wYWNrKGJvZHkpXG5cbiAgZnVuY3Rpb24gdW5wYWNrQm9keShwa3QsIHNpbmspIDo6XG4gICAgcmV0dXJuIHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGJpbmFyeV9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbX0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICBjb25zdCB7YXNCdWZmZXJ9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICByZXR1cm4gQHt9XG4gICAgcGFja0JvZHk6IGFzQnVmZmVyXG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0gcGt0LmJvZHlfYnVmZmVyKClcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBtc2cgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2cgOjpcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ2J5dGVzJ1xuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVTdHJlYW1cbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QsIHBrdF9idWZmZXIpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG5mdW5jdGlvbiBwa3RfYnVmZmVyKHBrdCkgOjogcmV0dXJuIHBrdC5ib2R5X2J1ZmZlcigpXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBjb250cm9sX3Byb3RvY29sKGluYm91bmQsIGhpZ2gsIHNoYXJlZCkgOjpcbiAgY29uc3Qge3JhbmRvbV9pZH0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tQYWNrZXRPYmp9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIGNvbnN0IHBpbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgdG9rZW46IHRydWUsIHRyYW5zcG9ydDogJ2RpcmVjdCdcbiAgY29uc3QgcG9uZ19mcmFtZSA9IGZyYW1pbmdzLmNob29zZSBAOiBmcm9tX2lkOiB0cnVlLCBtc2dpZDogdHJ1ZSwgdHJhbnNwb3J0OiAnZGF0YWdyYW0nXG5cbiAgY29uc3QgcG9uZ190eXBlID0gaGlnaHwweGVcbiAgaW5ib3VuZFtwb25nX3R5cGVdID0gcmVjdl9wb25nXG4gIGNvbnN0IHBpbmdfdHlwZSA9IGhpZ2h8MHhmXG4gIGluYm91bmRbaGlnaHwweGZdID0gcmVjdl9waW5nXG5cbiAgcmV0dXJuIEB7fSBzZW5kOnBpbmcsIHBpbmdcblxuICBmdW5jdGlvbiBwaW5nKGNoYW4sIG9iaikgOjpcbiAgICBpZiAhIG9iai50b2tlbiA6OlxuICAgICAgb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICBvYmouYm9keSA9IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICBvcDogJ3BpbmcnLCB0czA6IG5ldyBEYXRlKClcbiAgICBwaW5nX2ZyYW1lLnBhY2socGluZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgZnVuY3Rpb24gcmVjdl9waW5nKHBrdCwgc2luaywgcm91dGVyKSA6OlxuICAgIHBpbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIF9zZW5kX3BvbmcgQCBwa3QuYm9keSwgcGt0LCBzaW5rLCByb3V0ZXJcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiAgZnVuY3Rpb24gX3NlbmRfcG9uZyh7dHMwfSwgcGt0X3BpbmcsIHNpbmssIHJvdXRlcikgOjpcbiAgICBjb25zdCB7bXNnaWQsIGZyb21faWQ6cl9pZH0gPSBwa3RfcGluZy5pbmZvXG4gICAgY29uc3Qge2lkX3JvdXRlciwgaWRfdGFyZ2V0fSA9IHJfaWRcbiAgICBjb25zdCBvYmogPSBAe30gaWRfcm91dGVyLCBpZF90YXJnZXRcbiAgICAgIGZyb21faWQ6IHNpbmsuZnJvbV9pZCwgbXNnaWRcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICAgIG9wOiAncG9uZycsIHRzMCwgdHMxOiBuZXcgRGF0ZSgpXG5cbiAgICBwb25nX2ZyYW1lLnBhY2socG9uZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiByb3V0ZXIuZGlzcGF0Y2ggQCBbcGt0XVxuXG4gIGZ1bmN0aW9uIHJlY3ZfcG9uZyhwa3QsIHNpbmspIDo6XG4gICAgcG9uZ19mcmFtZS51bnBhY2socGt0KVxuICAgIHBrdC5ib2R5ID0gcGt0LmJvZHlfanNvbigpXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcbmltcG9ydCBzaGFyZWRfcHJvdG8gZnJvbSAnLi9zaGFyZWQuanN5J1xuaW1wb3J0IGpzb25fcHJvdG8gZnJvbSAnLi9qc29uLmpzeSdcbmltcG9ydCBiaW5hcnlfcHJvdG8gZnJvbSAnLi9iaW5hcnkuanN5J1xuaW1wb3J0IGNvbnRyb2xfcHJvdG8gZnJvbSAnLi9jb250cm9sLmpzeSdcblxuZXhwb3J0ICogZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gaW5pdF9wcm90b2NvbChwYWNrZXRQYXJzZXIsIG9wdGlvbnMpIDo6XG4gIGNvbnN0IHNoYXJlZCA9IHNoYXJlZF9wcm90byBAIHBhY2tldFBhcnNlciwgb3B0aW9uc1xuXG4gIGNvbnN0IGluYm91bmQgPSBbXVxuICBjb25zdCBqc29uID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MDAgLy8gMHgwKiDigJQgSlNPTiBib2R5XG4gICAganNvbl9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgYmluYXJ5ID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MTAgLy8gMHgxKiDigJQgYmluYXJ5IGJvZHlcbiAgICBiaW5hcnlfcHJvdG8oc2hhcmVkKVxuXG4gIGNvbnN0IGNvbnRyb2wgPSBjb250cm9sX3Byb3RvIEAgaW5ib3VuZCxcbiAgICAweGYwIC8vIDB4Ziog4oCUIGNvbnRyb2xcbiAgICBzaGFyZWRcblxuICBjb25zdCBjb2RlY3MgPSBAOiBqc29uLCBiaW5hcnksIGNvbnRyb2wsIGRlZmF1bHQ6IGpzb25cblxuICBjb25zdCB7cmFuZG9tX2lkfSA9IHNoYXJlZFxuICByZXR1cm4gQDogaW5ib3VuZCwgY29kZWNzLCByYW5kb21faWRcblxuXG4iLCJleHBvcnQgZnVuY3Rpb24gYmluZFJvdXRlQ2hhbm5lbChodWIsIGNhY2hlKSA6OlxuICBjb25zdCBjaGFubmVsID0gaHViLmNvbm5lY3Rfc2VsZigpXG4gIGNvbnN0IHtyZXNvbHZlUm91dGUsIHJvdXRlc30gPSBodWIucm91dGVyXG4gIHJldHVybiBjYWNoZSA/IGNhY2hlUm91dGVDaGFubmVsIDogcmVzb2x2ZVJvdXRlQ2hhbm5lbFxuXG4gIGZ1bmN0aW9uIGNhY2hlUm91dGVDaGFubmVsKGlkX3JvdXRlcikgOjpcbiAgICBsZXQgY2hhbiA9IGNhY2hlLmdldChpZF9yb3V0ZXIpXG4gICAgaWYgdW5kZWZpbmVkID09PSBjaGFuIDo6XG4gICAgICBjaGFuID0gcmVzb2x2ZVJvdXRlQ2hhbm5lbChpZF9yb3V0ZXIpXG4gICAgICBjYWNoZS5zZXQoaWRfcm91dGVyLCBjaGFuKVxuICAgIHJldHVybiBjaGFuXG5cbiAgZnVuY3Rpb24gcmVzb2x2ZVJvdXRlQ2hhbm5lbChpZF9yb3V0ZXIpIDo6XG4gICAgbGV0IHJvdXRlLCBkaXNjbyA9IHJlc29sdmVSb3V0ZShpZF9yb3V0ZXIpXG4gICAgcmV0dXJuIGFzeW5jIHBrdCA9PiA6OlxuICAgICAgdHJ5IDo6XG4gICAgICAgIGlmIG51bGwgIT09IGRpc2NvIDo6XG4gICAgICAgICAgcm91dGUgPSBhd2FpdCBkaXNjb1xuICAgICAgICAgIGRpc2NvID0gbnVsbFxuXG4gICAgICAgIGlmIG51bGwgPT0gcm91dGUgfHwgISByb3V0ZXMuaGFzKGlkX3JvdXRlcikgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCBcIlVucmVzb2x2YWJsZSByb3V0ZVwiXG5cbiAgICAgICAgYXdhaXQgcm91dGUgQCBwa3QsIGNoYW5uZWxcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICBkaXNjbyA9IHJvdXRlID0gbnVsbFxuICAgICAgICBpZiBjYWNoZSA6OiBjYWNoZS5kZWxldGUoaWRfcm91dGVyKVxuICAgICAgICB0aHJvdyBlcnJcbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIEVQVGFyZ2V0IDo6XG4gIHN0YXRpYyBzdWJjbGFzcyhleHRlbnNpb25zKSA6OlxuICAgIGNsYXNzIEVQVGFyZ2V0IGV4dGVuZHMgdGhpcyA6OlxuICAgIE9iamVjdC5hc3NpZ24gQCBFUFRhcmdldC5wcm90b3R5cGUsIGV4dGVuc2lvbnNcbiAgICByZXR1cm4gRVBUYXJnZXRcblxuICBjb25zdHJ1Y3RvcihpZCwgbXNnX2N0eCwgbXNnX2luZm8pIDo6XG4gICAgY29uc3QgcHJvcHMgPSBAe31cbiAgICAgIGlkX3JvdXRlcjogQHt9IGVudW1lcmFibGU6IHRydWUsIHZhbHVlOiBpZC5pZF9yb3V0ZXJcbiAgICAgIGlkX3RhcmdldDogQHt9IGVudW1lcmFibGU6IHRydWUsIHZhbHVlOiBpZC5pZF90YXJnZXRcblxuICAgIGlmIG1zZ19jdHggOjpcbiAgICAgIGJpbmRDdHhQcm9wcyBAIHByb3BzLCBtc2dfaW5mbywgKCkgPT5cbiAgICAgICAgbXNnX2N0eC50byh0aGlzLCBtc2dfaW5mbykuZmFzdF9qc29uXG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgcHJvcHNcblxuXG4gIHZhbHVlT2YoKSA6OiByZXR1cm4gMCB8IHRoaXMuaWRfdGFyZ2V0XG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRVBUYXJnZXQgJHt0aGlzLmVwX2VuY29kZSh0aGlzLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIHRoaXMuZXBfZW5jb2RlKHRoaXMpXG4gIGlzRVBUYXJnZXQoKSA6OiByZXR1cm4gdHJ1ZVxuXG4gIHN0YXRpYyBqc29uX2FzX3JlcGx5KG1zZ19jdHgpIDo6XG4gICAgcmV0dXJuIGluZm8gPT5cbiAgICAgIHRoaXMuZnJvbV9qc29uIEAgaW5mby5mcm9tX2lkLCBtc2dfY3R4LCBpbmZvXG5cbiAgc3RhdGljIGZyb21fanNvbihpZCwgbXNnX2N0eCwgbXNnX2luZm8pIDo6XG4gICAgaWYgaWQgOjogcmV0dXJuIG5ldyB0aGlzKGlkLCBtc2dfY3R4LCBtc2dfaW5mbylcblxuICBzdGF0aWMganNvblVucGFjayhtc2dfY3R4LCB4Zm9ybUJ5S2V5KSA6OlxuICAgIHhmb3JtQnlLZXkgPSBPYmplY3QuY3JlYXRlKHhmb3JtQnlLZXkgfHwgbnVsbClcbiAgICB4Zm9ybUJ5S2V5W3RoaXMudG9rZW5dID0gdiA9PlxuICAgICAgdGhpcy5mcm9tX2pzb24gQCB0aGlzLmVwX2RlY29kZSh2KSwgbXNnX2N0eFxuICAgIHJldHVybiB0aGlzLmpzb25VbnBhY2tCeUtleSh4Zm9ybUJ5S2V5KVxuXG4gIHN0YXRpYyBqc29uVW5wYWNrQnlLZXkoeGZvcm1CeUtleSkgOjpcbiAgICBjb25zdCByZWcgPSBuZXcgV2Vha01hcCgpXG4gICAgcmV0dXJuIHN6ID0+IEpTT04ucGFyc2UgQCBzeiwgcmV2aXZlclxuXG4gICAgZnVuY3Rpb24gcmV2aXZlcihrZXksIHZhbHVlKSA6OlxuICAgICAgY29uc3QgeGZuID0geGZvcm1CeUtleVtrZXldXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHhmbiA6OlxuICAgICAgICByZWcuc2V0KHRoaXMsIHhmbilcbiAgICAgICAgcmV0dXJuIHZhbHVlXG5cbiAgICAgIGlmICdvYmplY3QnID09PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgICAgY29uc3QgdmZuID0gcmVnLmdldCh2YWx1ZSlcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB2Zm4gOjpcbiAgICAgICAgICByZXR1cm4gdmZuIEAgdmFsdWVcbiAgICAgIHJldHVybiB2YWx1ZVxuXG5cbmZ1bmN0aW9uIGJpbmRDdHhQcm9wcyhwcm9wcywgbXNnX2luZm8sIGluaXQpIDo6XG4gIGxldCBjdHhcbiAgcHJvcHMuc2VuZCA9IEB7fSBnZXQoKSA6OiByZXR1cm4gKGN0eCB8fCAoY3R4ID0gaW5pdCgpKSkuc2VuZFxuICBwcm9wcy5xdWVyeSA9IEB7fSBnZXQoKSA6OiByZXR1cm4gKGN0eCB8fCAoY3R4ID0gaW5pdCgpKSkucXVlcnlcbiAgaWYgbXNnX2luZm8gJiYgbXNnX2luZm8ubXNnaWQgOjpcbiAgICAvLyByZWFkcyBhcyBcInJlcGx5LmV4cGVjdGVkXCJcbiAgICBwcm9wcy5leHBlY3RlZCA9IEB7fSB2YWx1ZTogdHJ1ZVxuXG5cbmNvbnN0IHRva2VuID0gJ1xcdTAzRTAnIC8vICfPoCdcbkVQVGFyZ2V0LnRva2VuID0gdG9rZW5cblxuRVBUYXJnZXQuZXBfZW5jb2RlID0gRVBUYXJnZXQucHJvdG90eXBlLmVwX2VuY29kZSA9IGVwX2VuY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2VuY29kZShmcm9tX2lkLCBzaW1wbGUpIDo6XG4gIGxldCB7aWRfcm91dGVyOnIsIGlkX3RhcmdldDp0fSA9IGZyb21faWRcbiAgciA9IChyPj4+MCkudG9TdHJpbmcoMzYpXG4gIHQgPSAodD4+PjApLnRvU3RyaW5nKDM2KVxuICByZXR1cm4gc2ltcGxlXG4gICAgPyBgJHt0b2tlbn0gJHtyfX4ke3R9YFxuICAgIDogQHt9IFt0b2tlbl06IGAke3J9fiR7dH1gXG5cblxuRVBUYXJnZXQuZXBfZGVjb2RlID0gRVBUYXJnZXQucHJvdG90eXBlLmVwX2RlY29kZSA9IGVwX2RlY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2RlY29kZSh2KSA6OlxuICBjb25zdCBmcm9tX2lkID0gJ3N0cmluZycgPT09IHR5cGVvZiB2XG4gICAgPyB2LnNwbGl0KHRva2VuKVsxXVxuICAgIDogdlt0b2tlbl1cbiAgaWYgISBmcm9tX2lkIDo6IHJldHVyblxuXG4gIGxldCBbcix0XSA9IGZyb21faWQuc3BsaXQoJ34nKVxuICBpZiB1bmRlZmluZWQgPT09IHQgOjogcmV0dXJuXG4gIHIgPSAwIHwgcGFyc2VJbnQociwgMzYpXG4gIHQgPSAwIHwgcGFyc2VJbnQodCwgMzYpXG5cbiAgcmV0dXJuIEB7fSBpZF9yb3V0ZXI6IHIsIGlkX3RhcmdldDogdFxuXG4iLCJpbXBvcnQge2VwX2VuY29kZX0gZnJvbSAnLi9lcF90YXJnZXQuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBFbmRwb2ludCA6OlxuICBzdGF0aWMgc3ViY2xhc3MoZXh0ZW5zaW9ucykgOjpcbiAgICBjbGFzcyBFbmRwb2ludCBleHRlbmRzIHRoaXMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgRW5kcG9pbnQucHJvdG90eXBlLCBleHRlbnNpb25zXG4gICAgcmV0dXJuIEVuZHBvaW50XG5cbiAgdmFsdWVPZigpIDo6IHJldHVybiB0aGlzLmZyb21faWRcbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFbmRwb2ludCAke2VwX2VuY29kZSh0aGlzLmZyb21faWQsIHRydWUpfcK7YFxuXG4gIGNvbnN0cnVjdG9yKG1zZ19jdHgsIGVwX3RndCkgOjpcbiAgICBtc2dfY3R4ID0gbXNnX2N0eC53aXRoRW5kcG9pbnQodGhpcylcbiAgICBjb25zdCBhc1JlcGx5ID0gZXBfdGd0LmNvbnN0cnVjdG9yLmpzb25fYXNfcmVwbHkobXNnX2N0eClcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBmcm9tX2lkOiBAe30gdmFsdWU6IG1zZ19jdHguZnJvbV9pZCwgZW51bWVyYWJsZTogdHJ1ZVxuICAgICAgdG9KU09OOiBAe30gdmFsdWUoKSA6OiByZXR1cm4gZXBfdGd0LnRvSlNPTigpXG4gICAgICB0bzogQHt9IHZhbHVlOiBtc2dfY3R4LnRvXG4gICAgICBhc1JlcGx5OiBAe30gdmFsdWU6IGFzUmVwbHlcblxuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpXG4gIGNyZWF0ZVN0YXRlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUmVwbHlNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVUcmFmZmljTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUm91dGVDYWNoZU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG5cbiAgYmluZFNpbmsoc2luaykgOjpcbiAgICBjb25zdCBieV90b2tlbiA9IHRoaXMuY3JlYXRlUmVwbHlNYXAoKVxuICAgIGNvbnN0IGJ5X3RyYWZmaWMgPSB0aGlzLmNyZWF0ZVRyYWZmaWNNYXAoKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIGJ5X3Rva2VuOiBAe30gdmFsdWU6IGJ5X3Rva2VuXG4gICAgICBieV90cmFmZmljOiBAe30gdmFsdWU6IGJ5X3RyYWZmaWNcblxuICAgIGNvbnN0IHRyYWZmaWMgPSAoZnJvbV9pZCwgdHJhZmZpYykgPT4gOjpcbiAgICAgIGNvbnN0IHRzID0gRGF0ZS5ub3coKVxuICAgICAgaWYgZnJvbV9pZCA6OlxuICAgICAgICBjb25zdCB0ID0gYnlfdHJhZmZpYy5nZXQoZnJvbV9pZC5pZF90YXJnZXQpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdCA6OlxuICAgICAgICAgIHQudHMgPSB0W2B0c18ke3RyYWZmaWN9YF0gPSB0c1xuICAgICAgdGhpcy5yZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cylcblxuICAgIHJldHVybiBAe31cbiAgICAgIGZyb21faWQ6IHRoaXMuZnJvbV9pZFxuICAgICAgYnlfbXNnaWQ6IHRoaXMuY3JlYXRlU3RhdGVNYXAoKVxuXG4gICAgICByZWN2Q3RybDogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdjdHJsJylcbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdkN0cmwobXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cgfHwge21zZywgaW5mb30pLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdk1zZzogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdtc2cnKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2TXNnKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnKS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZTdHJlYW1EYXRhOiAocnN0cmVhbSwgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgcmVjdlN0cmVhbTogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCByc3RyZWFtID0gdGhpcy5yZWN2U3RyZWFtKG1zZywgaW5mbywgcmVwbHkpXG5cbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShyc3RyZWFtKS50aGVuKHJlcGx5KVxuICAgICAgICByZXR1cm4gcnN0cmVhbVxuXG4gIHJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKSA6OlxuICByZWN2Q3RybChtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGlmIGlzX3JlcGx5IDo6IHJldHVybiBtc2dcbiAgcmVjdk1zZyhtc2csIGluZm8sIGlzX3JlcGx5KSA6OlxuICAgIGlmIGlzX3JlcGx5IDo6IHJldHVybiBtc2dcbiAgICByZXR1cm4gQHt9IG1zZywgaW5mbywgcmVwbHk6IHRoaXMuYXNSZXBseShpbmZvKVxuICByZWN2U3RyZWFtKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgY29uc29sZS53YXJuIEAgYFVuaGFuZGxlIHJlY3Ygc3RyZWFtOiAke2luZm99YFxuICAgIHJldHVybiBudWxsXG4gICAgLyogcmV0dXJuIEB7fSBtc2csIGluZm9cbiAgICAgICAgIG9uX2luaXQobXNnLCBwa3QpIDo6IHJldHVybiB0aGlzXG4gICAgICAgICBvbl9kYXRhKGRhdGEsIHBrdCkgOjogdGhpcy5wYXJ0cy5wdXNoIEAgZGF0YVxuICAgICAgICAgb25fZW5kKHJlc3VsdCwgcGt0KSA6OiByZXR1cm4gdGhpcy5wYXJ0cy5qb2luKCcnKVxuICAgICAgICAgb25fZXJyb3IoZXJyLCBwa3QpIDo6IGNvbnNvbGUubG9nIEAgZXJyXG4gICAgKi9cblxuICBpbml0UmVwbHkodG9rZW4sIHBfc2VudCwgbXNnX2N0eCkgOjpcbiAgICByZXR1cm4gdGhpcy5pbml0UmVwbHlQcm9taXNlIEAgdG9rZW4sIHBfc2VudCwgbXNnX2N0eFxuXG4gIGluaXRNb25pdG9yKGlkX3RhcmdldCkgOjpcbiAgICBjb25zdCBrZXkgPSBpZF90YXJnZXQuaWRfdGFyZ2V0IHx8IGlkX3RhcmdldFxuICAgIGxldCBtb25pdG9yID0gdGhpcy5ieV90cmFmZmljLmdldCBAIGtleVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gbW9uaXRvciA6OlxuICAgICAgbW9uaXRvciA9IEB7fSBpZF90YXJnZXQsIHRzOiBEYXRlLm5vdygpXG4gICAgICAgIHRkKCkgOjogcmV0dXJuIERhdGUubm93KCkgLSB0aGlzLnRzXG4gICAgICB0aGlzLmJ5X3RyYWZmaWMuc2V0IEAga2V5LCBtb25pdG9yXG4gICAgcmV0dXJuIG1vbml0b3JcblxuICBpbml0UmVwbHlQcm9taXNlKHRva2VuLCBwX3NlbnQsIG1zZ19jdHgpIDo6XG4gICAgbGV0IHJlcGx5ID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgdGhpcy5ieV90b2tlbi5zZXQgQCB0b2tlbiwgcmVzb2x2ZVxuICAgICAgcF9zZW50LmNhdGNoIEAgcmVqZWN0XG5cbiAgICBpZiBtc2dfY3R4IDo6XG4gICAgICByZXBseSA9IG1zZ19jdHgud2l0aFJlamVjdFRpbWVvdXQocmVwbHkpXG5cbiAgICBjb25zdCBjbGVhciA9ICgpID0+IHRoaXMuYnlfdG9rZW4uZGVsZXRlIEAgdG9rZW5cbiAgICByZXBseS50aGVuIEAgY2xlYXIsIGNsZWFyXG4gICAgcmV0dXJuIHJlcGx5XG5cbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIFNpbmsgOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7aW5ib3VuZH0pIDo6XG4gICAgY2xhc3MgU2luayBleHRlbmRzIHRoaXMgOjpcbiAgICBTaW5rLnByb3RvdHlwZS5fcHJvdG9jb2wgPSBpbmJvdW5kXG4gICAgcmV0dXJuIFNpbmtcblxuICBjb25zdHJ1Y3Rvcihqc29uX3VucGFjaykgOjpcbiAgICB0aGlzLmpzb25fdW5wYWNrID0ganNvbl91bnBhY2tcblxuICByZWdpc3RlcihlbmRwb2ludCwgaHViLCBpZF90YXJnZXQsIGhhbmRsZXJzKSA6OlxuICAgIGNvbnN0IHVucmVnaXN0ZXIgPSAoKSA9PiBodWIucm91dGVyLnVucmVnaXN0ZXJUYXJnZXQoaWRfdGFyZ2V0KVxuXG4gICAgaHViLnJvdXRlci5yZWdpc3RlclRhcmdldCBAIGlkX3RhcmdldCxcbiAgICAgIHRoaXMuX2JpbmREaXNwYXRjaCBAIGVuZHBvaW50LCB1bnJlZ2lzdGVyLCBoYW5kbGVyc1xuICAgIHJldHVybiB0aGlzXG5cbiAgX2JpbmREaXNwYXRjaChlbmRwb2ludCwgdW5yZWdpc3Rlciwge29uX21zZywgb25fZXJyb3IsIG9uX3NodXRkb3dufSkgOjpcbiAgICBsZXQgYWxpdmUgPSB0cnVlXG4gICAgY29uc3QgcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbFxuICAgIGNvbnN0IGlzQWxpdmUgPSAoKSA9PiBhbGl2ZVxuICAgIGNvbnN0IHNodXRkb3duID0gKGVyciwgZXh0cmEpID0+IDo6XG4gICAgICBpZiBhbGl2ZSA6OlxuICAgICAgICB1bnJlZ2lzdGVyKCk7IHVucmVnaXN0ZXIgPSBhbGl2ZSA9IGZhbHNlXG4gICAgICAgIG9uX3NodXRkb3duKGVyciwgZXh0cmEpXG5cbiAgICBPYmplY3QuYXNzaWduIEAgdGhpcywgZW5kcG9pbnQuYmluZFNpbmsodGhpcyksIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuICAgIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG5cbiAgICByZXR1cm4gYXN5bmMgKHBrdCwgcm91dGVyKSA9PiA6OlxuICAgICAgaWYgZmFsc2U9PT1hbGl2ZSB8fCBudWxsPT1wa3QgOjogcmV0dXJuIGFsaXZlXG5cbiAgICAgIGNvbnN0IHJlY3ZfbXNnID0gcHJvdG9jb2xbcGt0LnR5cGVdXG4gICAgICBpZiB1bmRlZmluZWQgPT09IHJlY3ZfbXNnIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZmFsc2UsIEB7fSBwa3QsIHpvbmU6ICdwa3QudHlwZSdcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIHZhciBtc2cgPSBhd2FpdCByZWN2X21zZyBAIHBrdCwgdGhpcywgcm91dGVyXG4gICAgICAgIGlmICEgbXNnIDo6IHJldHVybiBtc2dcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gdm9pZCBvbl9lcnJvciBAIGVyciwgQHt9IHBrdCwgem9uZTogJ3Byb3RvY29sJ1xuXG4gICAgICBpZiBmYWxzZSA9PT0gYWxpdmUgOjpcbiAgICAgICAgcmV0dXJuIGZhbHNlIC8vIGNoYW5nZSB3aGlsZSBhd2FpdGluZyBhYm92ZeKAplxuICAgICAgdHJ5IDo6XG4gICAgICAgIHJldHVybiBhd2FpdCBvbl9tc2cgQCBtc2csIHBrdFxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHRyeSA6OlxuICAgICAgICAgIHZhciB0ZXJtaW5hdGUgPSBvbl9lcnJvciBAIGVyciwgQHt9IG1zZywgcGt0LCB6b25lOiAnZGlzcGF0Y2gnXG4gICAgICAgIGZpbmFsbHkgOjpcbiAgICAgICAgICBpZiBmYWxzZSAhPT0gdGVybWluYXRlIDo6XG4gICAgICAgICAgICBzaHV0ZG93bihlcnIsIHttc2csIHBrdH0pXG4gICAgICAgICAgICByZXR1cm4gZmFsc2UgLy8gc2lnbmFsIHVucmVnaXN0ZXIgdG8gbXNnLWZhYnJpYy1jb3JlL3JvdXRlclxuXG4gIHN0YXRlRm9yKHBrdCwgaWZBYnNlbnQpIDo6XG4gICAgY29uc3QgbXNnaWQgPSBwa3QuaW5mby5tc2dpZFxuICAgIGxldCBlbnRyeSA9IHRoaXMuYnlfbXNnaWQuZ2V0KG1zZ2lkKVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gZW50cnkgOjpcbiAgICAgIGlmICEgbXNnaWQgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYEludmFsaWQgbXNnaWQ6ICR7bXNnaWR9YFxuICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlmQWJzZW50IDo6XG4gICAgICAgIGVudHJ5ID0gaWZBYnNlbnQocGt0LCB0aGlzLCBtc2dpZClcbiAgICAgIGVsc2UgZW50cnkgPSBpZkFic2VudFxuICAgICAgdGhpcy5ieV9tc2dpZC5zZXQgQCBtc2dpZCwgZW50cnlcbiAgICByZXR1cm4gZW50cnlcblxuICBkZWxldGVTdGF0ZUZvcihtc2dpZCkgOjpcbiAgICByZXR1cm4gdGhpcy5ieV9tc2dpZC5kZWxldGUobXNnaWQpXG4iLCJpbXBvcnQge2VwX2VuY29kZSwgZXBfZGVjb2RlfSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1zZ0N0eCA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtyYW5kb21faWQsIGNvZGVjc30pIDo6XG4gICAgY2xhc3MgTXNnQ3R4IGV4dGVuZHMgdGhpcyA6OlxuICAgIE1zZ0N0eC5wcm90b3R5cGUucmFuZG9tX2lkID0gcmFuZG9tX2lkXG4gICAgTXNnQ3R4LndpdGhDb2RlY3MgQCBjb2RlY3NcbiAgICByZXR1cm4gTXNnQ3R4XG5cbiAgaW5zcGVjdCgpIDo6XG4gICAgY29uc3QgY3R4ID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5jdHgpXG4gICAgY3R4LmZyb20gPSBlcF9lbmNvZGUoY3R4LmZyb21faWQsIHRydWUpXG4gICAgY3R4LnRvID0gZXBfZW5jb2RlKGN0eCwgdHJ1ZSlcbiAgICBkZWxldGUgY3R4LmZyb21faWQ7IGRlbGV0ZSBjdHguaWRfcm91dGVyOyBkZWxldGUgY3R4LmlkX3RhcmdldFxuICAgIHJldHVybiBgwqtNc2dDdHggJHtKU09OLnN0cmluZ2lmeShjdHgpfcK7YFxuXG4gIGNvbnN0cnVjdG9yKGZyb21faWQsIHJlc29sdmVSb3V0ZUNoYW5uZWwpIDo6XG4gICAgaWYgbnVsbCAhPT0gZnJvbV9pZCA6OlxuICAgICAgY29uc3Qge2lkX3RhcmdldCwgaWRfcm91dGVyfSA9IGZyb21faWRcbiAgICAgIGZyb21faWQgPSBPYmplY3QuZnJlZXplIEA6IGlkX3RhcmdldCwgaWRfcm91dGVyXG5cbiAgICBjb25zdCBjdHggPSB7ZnJvbV9pZH1cbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBfcm9vdF86IEA6IHZhbHVlOiB0aGlzXG4gICAgICBmcm9tX2lkOiBAOiB2YWx1ZTogZnJvbV9pZFxuICAgICAgY3R4OiBAOiB2YWx1ZTogY3R4XG4gICAgICByZXNvbHZlUm91dGVDaGFubmVsOiBAOiB2YWx1ZTogcmVzb2x2ZVJvdXRlQ2hhbm5lbFxuXG4gIHdpdGhFbmRwb2ludChlbmRwb2ludCkgOjpcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGVuZHBvaW50OiBAe30gdmFsdWU6IGVuZHBvaW50XG5cblxuICBwaW5nKHRva2VuPXRydWUpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9tc2dDb2RlY3MuY29udHJvbC5waW5nLCBbXSwgdG9rZW5cbiAgc2VuZCguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWMuc2VuZCwgYXJnc1xuICBxdWVyeSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWMuc2VuZCwgYXJncywgdHJ1ZVxuXG4gIHN0cmVhbSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWMuc3RyZWFtLCBhcmdzXG4gIGludm9rZShrZXksIC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlY1trZXldLCBhcmdzXG4gIGJpbmRJbnZva2UoZm5PcktleSwgdG9rZW4pIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIGZuT3JLZXkgOjogZm5PcktleSA9IHRoaXMuX2NvZGVjXG4gICAgcmV0dXJuICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoZm5PcktleSwgYXJncywgdG9rZW4pXG5cbiAgX2ludm9rZV9leChpbnZva2UsIGFyZ3MsIHRva2VuKSA6OlxuICAgIGNvbnN0IG9iaiA9IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHhcbiAgICBpZiBudWxsID09IHRva2VuIDo6IHRva2VuID0gb2JqLnRva2VuXG4gICAgZWxzZSBvYmoudG9rZW4gPSB0b2tlblxuICAgIGlmIHRydWUgPT09IHRva2VuIDo6XG4gICAgICB0b2tlbiA9IG9iai50b2tlbiA9IHRoaXMucmFuZG9tX2lkKClcblxuICAgIHRoaXMuYXNzZXJ0TW9uaXRvcigpXG4gICAgY29uc3QgY2hhbiA9IHRoaXMucmVzb2x2ZVJvdXRlQ2hhbm5lbChvYmouaWRfcm91dGVyKVxuXG4gICAgY29uc3QgcmVzID0gaW52b2tlIEAgY2hhbiwgb2JqLCAuLi5hcmdzXG4gICAgaWYgISB0b2tlbiB8fCAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcmVzLnRoZW4gOjogcmV0dXJuIHJlc1xuXG4gICAgbGV0IHBfc2VudCAgPSByZXMudGhlbigpXG4gICAgY29uc3QgcmVwbHkgPSB0aGlzLmVuZHBvaW50LmluaXRSZXBseSh0b2tlbiwgcF9zZW50LCB0aGlzKVxuICAgIHBfc2VudCA9IHBfc2VudC50aGVuIEAgKCkgPT4gQDogcmVwbHlcbiAgICBwX3NlbnQucmVwbHkgPSByZXBseVxuICAgIHJldHVybiBwX3NlbnRcblxuICBnZXQgdG8oKSA6OiByZXR1cm4gKHRndCwgLi4uYXJncykgPT4gOjpcbiAgICBpZiBudWxsID09IHRndCA6OiB0aHJvdyBuZXcgRXJyb3IgQCBgTnVsbCB0YXJnZXQgZW5kcG9pbnRgXG5cbiAgICBjb25zdCBzZWxmID0gdGhpcy5jbG9uZSgpXG5cbiAgICBjb25zdCBjdHggPSBzZWxmLmN0eFxuICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICBjdHguaWRfdGFyZ2V0ID0gdGd0XG4gICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgZWxzZSA6OlxuICAgICAgY29uc3Qge2Zyb21faWQ6IHJlcGx5X2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgdG9rZW4sIG1zZ2lkfSA9IGVwX2RlY29kZSh0Z3QpIHx8IHRndFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IGlkX3RhcmdldCA6OlxuICAgICAgICBpZiB1bmRlZmluZWQgPT09IGlkX3JvdXRlciA6OlxuICAgICAgICAgIGlmICEgY3R4LmlkX3JvdXRlciA6OlxuICAgICAgICAgICAgLy8gaW1wbGljaXRseSBvbiB0aGUgc2FtZSByb3V0ZXJcbiAgICAgICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBjdHguZnJvbV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgZWxzZSBjdHguaWRfcm91dGVyID0gaWRfcm91dGVyXG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSBpZF90YXJnZXRcbiAgICAgIGVsc2UgaWYgdW5kZWZpbmVkICE9PSBpZF9yb3V0ZXIgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFBhc3NpbmcgJ2lkX3JvdXRlcicgcmVxdWlyZXMgJ2lkX3RhcmdldCdgXG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHlfaWQgJiYgISBjdHguaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSByZXBseV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHJlcGx5X2lkLmlkX3RhcmdldFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG5cbiAgICByZXR1cm4gMCA9PT0gYXJncy5sZW5ndGggPyBzZWxmIDogc2VsZi53aXRoIEAgLi4uYXJnc1xuXG4gIHdpdGgoLi4uYXJncykgOjpcbiAgICBjb25zdCBjdHggPSB0aGlzLmN0eFxuICAgIGZvciBsZXQgdGd0IG9mIGFyZ3MgOjpcbiAgICAgIGlmIHRydWUgPT09IHRndCB8fCBmYWxzZSA9PT0gdGd0IDo6XG4gICAgICAgIGN0eC50b2tlbiA9IHRndFxuICAgICAgZWxzZSBpZiBudWxsICE9IHRndCA6OlxuICAgICAgICBjb25zdCB7dG9rZW4sIG1zZ2lkfSA9IHRndFxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnaWQgOjogY3R4Lm1zZ2lkID0gbXNnaWRcbiAgICByZXR1cm4gdGhpc1xuXG4gIHdpdGhSZXBseSgpIDo6XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUgQDogdG9rZW46IHRydWVcblxuICByZXNldCguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcy5fcm9vdF8sIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuICBjbG9uZSguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQHt9XG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cblxuICBhc3NlcnRNb25pdG9yKCkgOjpcbiAgICBpZiAhIHRoaXMuY2hlY2tNb25pdG9yKCkgOjpcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBUYXJnZXQgbW9uaXRvciBleHBpcmVkYFxuICBjaGVja01vbml0b3IoKSA6OiByZXR1cm4gdHJ1ZVxuICBtb25pdG9yKG9wdGlvbnM9e30pIDo6XG4gICAgaWYgdHJ1ZSA9PT0gb3B0aW9ucyB8fCBmYWxzZSA9PT0gb3B0aW9ucyA6OlxuICAgICAgb3B0aW9ucyA9IEB7fSBhY3RpdmU6IG9wdGlvbnNcblxuICAgIGNvbnN0IG1vbml0b3IgPSB0aGlzLmVuZHBvaW50LmluaXRNb25pdG9yKHRoaXMuY3R4LmlkX3RhcmdldClcblxuICAgIGNvbnN0IHRzX2R1cmF0aW9uID0gb3B0aW9ucy50c19kdXJhdGlvbiB8fCA1MDAwXG4gICAgbGV0IHRzX2FjdGl2ZSA9IG9wdGlvbnMudHNfYWN0aXZlXG4gICAgaWYgdHJ1ZSA9PT0gdHNfYWN0aXZlIDo6XG4gICAgICB0c19hY3RpdmUgPSB0c19kdXJhdGlvbi80XG5cbiAgICBsZXQgY2hlY2tNb25pdG9yXG4gICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIGNvbnN0IGRvbmUgPSBvcHRpb25zLnJlamVjdCA/IHJlamVjdCA6IHJlc29sdmVcbiAgICAgIHRoaXMuY2hlY2tNb25pdG9yID0gY2hlY2tNb25pdG9yID0gKCkgPT5cbiAgICAgICAgdHNfZHVyYXRpb24gPiBtb25pdG9yLnRkKClcbiAgICAgICAgICA/IHRydWUgOiAoZG9uZShtb25pdG9yKSwgZmFsc2UpXG5cbiAgICBsZXQgdGlkXG4gICAgY29uc3QgdHNfaW50ZXJ2YWwgPSB0c19hY3RpdmUgfHwgdHNfZHVyYXRpb24vNFxuICAgIGlmIG9wdGlvbnMuYWN0aXZlIHx8IHRzX2FjdGl2ZSA6OlxuICAgICAgY29uc3QgY3RybCA9IHRoaXMuY29kZWMoJ2NvbnRyb2wnKVxuICAgICAgY29uc3QgY2hlY2tQaW5nID0gKCkgPT4gOjpcbiAgICAgICAgaWYgdHNfaW50ZXJ2YWwgPiBtb25pdG9yLnRkKCkgOjpcbiAgICAgICAgICBjdHJsLmludm9rZSgncGluZycpXG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrUGluZywgdHNfaW50ZXJ2YWxcbiAgICBlbHNlIDo6XG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrTW9uaXRvciwgdHNfaW50ZXJ2YWxcbiAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcbiAgICBjb25zdCBjbGVhciA9ICgpID0+IGNsZWFySW50ZXJ2YWwodGlkKVxuXG4gICAgcHJvbWlzZS50aGVuKGNsZWFyLCBjbGVhcilcbiAgICByZXR1cm4gcHJvbWlzZVxuXG5cbiAgY29kZWMobXNnX2NvZGVjLCAuLi5hcmdzKSA6OlxuICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgbXNnX2NvZGVjIDo6XG4gICAgICBtc2dfY29kZWMgPSB0aGlzLl9tc2dDb2RlY3NbbXNnX2NvZGVjXVxuXG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG1zZ19jb2RlYy5zZW5kIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBhY2tldCBjb2RlYyBwcm90b2NvbGBcblxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQDpcbiAgICAgIF9jb2RlYzogQDogdmFsdWU6IG1zZ19jb2RlY1xuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG4gIHN0YXRpYyB3aXRoQ29kZWNzKG1zZ0NvZGVjcykgOjpcbiAgICBmb3IgY29uc3QgW25hbWUsIG1zZ19jb2RlY10gb2YgT2JqZWN0LmVudHJpZXMgQCBtc2dDb2RlY3MgOjpcbiAgICAgIHRoaXMucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSA6OlxuICAgICAgICByZXR1cm4gdGhpcy5jb2RlYyBAIG1zZ19jb2RlY1xuICAgIHRoaXMucHJvdG90eXBlLl9tc2dDb2RlY3MgPSBtc2dDb2RlY3NcbiAgICB0aGlzLnByb3RvdHlwZS5fY29kZWMgPSBtc2dDb2RlY3MuZGVmYXVsdFxuXG4gICAgLy8gYmluZCBzZW5kX2pzb24gYXMgZnJlcXVlbnRseSB1c2VkIGZhc3QtcGF0aFxuICAgIGNvbnN0IGpzb25fc2VuZCA9IG1zZ0NvZGVjcy5qc29uLnNlbmRcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMucHJvdG90eXBlLCBAOlxuICAgICAgZmFzdF9qc29uOiBAe30gZ2V0KCkgOjogcmV0dXJuIEA6XG4gICAgICAgIHNlbmQ6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXggQCBqc29uX3NlbmQsIGFyZ3NcbiAgICAgICAgcXVlcnk6ICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXggQCBqc29uX3NlbmQsIGFyZ3MsIHRydWVcblxuICAgIHJldHVybiB0aGlzXG5cblxuICB3aXRoUmVqZWN0VGltZW91dChwX3JlcGx5KSA6OlxuICAgIHJldHVybiBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBwX3JlcGx5LnRoZW4gQCByZXNvbHZlLCByZWplY3RcbiAgICAgIHBfcmVwbHkudGhlbiBAIGNsZWFyLCBjbGVhclxuXG4gICAgICBjb25zdCB0aW1lb3V0ID0gKCkgPT4gcmVqZWN0IEAgbmV3IHRoaXMuUmVwbHlUaW1lb3V0XG4gICAgICBjb25zdCB0aWQgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIHRoaXMubXNfdGltZW91dClcbiAgICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuXG4gICAgICBmdW5jdGlvbiBjbGVhcigpIDo6IGNsZWFyVGltZW91dCBAIHRpZFxuXG5cbmNsYXNzIFJlcGx5VGltZW91dCBleHRlbmRzIEVycm9yIDo6XG5cbk9iamVjdC5hc3NpZ24gQCBNc2dDdHgucHJvdG90eXBlLCBAe31cbiAgUmVwbHlUaW1lb3V0LCBtc190aW1lb3V0OiA1MDAwXG5cbiIsImltcG9ydCBpbml0X3Byb3RvY29sIGZyb20gJy4vcHJvdG9jb2wvaW5kZXguanN5J1xuaW1wb3J0IHtiaW5kUm91dGVDaGFubmVsfSBmcm9tICcuL2NvcmVfaW50ZWdyYXRpb24uanN5J1xuaW1wb3J0IEVuZHBvaW50QmFzZSBmcm9tICcuL2VuZHBvaW50LmpzeSdcbmltcG9ydCBFUFRhcmdldEJhc2UgZnJvbSAnLi9lcF90YXJnZXQuanN5J1xuaW1wb3J0IFNpbmtCYXNlIGZyb20gJy4vc2luay5qc3knXG5pbXBvcnQgTXNnQ3R4QmFzZSBmcm9tICcuL21zZ2N0eC5qc3knXG5cbmNvbnN0IGRlZmF1bHRfcGx1Z2luX29wdGlvbnMgPSBAOlxuICBwbHVnaW5fbmFtZTogJ2VuZHBvaW50J1xuICBvbl9tc2coe21zZywgcmVwbHksIGluZm99KSA6OlxuICAgIGNvbnNvbGUud2FybiBAICdFTkRQT0lOVCBNU0c6JywgQHt9IG1zZywgcmVwbHksIGluZm9cbiAgb25fZXJyb3IoZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgY29uc29sZS5lcnJvciBAICdFTkRQT0lOVCBFUlJPUjonLCBlcnJcbiAgICAvLyBjb25zdCB7bXNnLCBwa3R9ID0gZXh0cmFcbiAgICAvLyByZXR1cm4gZmFsc2UgdG8gcHJldmVudCBhdXRvLXNodXRkb3duXG4gIG9uX3NodXRkb3duKGVwLCBlcnIsIGV4dHJhKSA6OlxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIGNvbnNvbGUuZXJyb3IgQCBgRU5EUE9JTlQgU0hVVERPV046ICR7ZXJyLm1lc3NhZ2V9YFxuXG4gIHN1YmNsYXNzKGNsYXNzZXMpIDo6XG4gICAgLy9jb25zdCB7RW5kcG9pbnQsIEVQVGFyZ2V0LCBTaW5rLCBNc2dDdHgsIHByb3RvY29sc30gPSBjbGFzc2VzXG4gICAgcmV0dXJuIGNsYXNzZXNcblxuICBqc29uX3BhY2s6IEpTT04uc3RyaW5naWZ5XG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKCkgLy8gTFJVTWFwLCBIYXNoYmVsdE1hcFxuICBjcmVhdGVSb3V0ZUNhY2hlKCkgOjogcmV0dXJuIG5ldyBNYXAoKSAvLyBMUlVNYXAsIEhhc2hiZWx0TWFwXG5cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGx1Z2luX29wdGlvbnMpIDo6XG4gIHBsdWdpbl9vcHRpb25zID0gT2JqZWN0LmFzc2lnbiBAIHt9LCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zLCBwbHVnaW5fb3B0aW9uc1xuICBjb25zdCBAe31cbiAgICBwbHVnaW5fbmFtZSwgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBvbl9tc2c6IGRlZmF1bHRfb25fbXNnXG4gICAgb25fZXJyb3I6IGRlZmF1bHRfb25fZXJyb3JcbiAgICBvbl9zaHV0ZG93bjogZGVmYXVsdF9vbl9zaHV0ZG93blxuICAgIGNyZWF0ZU1hcCwgY3JlYXRlUm91dGVDYWNoZVxuICA9IHBsdWdpbl9vcHRpb25zXG5cbiAgcmV0dXJuIEA6IG9yZGVyOiAxLCBzdWJjbGFzcywgcG9zdFxuICBcbiAgZnVuY3Rpb24gc3ViY2xhc3MoRmFicmljSHViX1BJLCBiYXNlcykgOjpcbiAgICBjb25zdCB7cGFja2V0UGFyc2VyfSA9IEZhYnJpY0h1Yl9QSS5wcm90b3R5cGVcbiAgICBpZiBudWxsPT1wYWNrZXRQYXJzZXIgfHwgISBwYWNrZXRQYXJzZXIuaXNQYWNrZXRQYXJzZXIoKSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBJbnZhbGlkIHBhY2tldFBhcnNlciBmb3IgcGx1Z2luYFxuICAgIFxuICAgIEZhYnJpY0h1Yl9QSS5wcm90b3R5cGVbcGx1Z2luX25hbWVdID1cbiAgICAgIGJpbmRFbmRwb2ludEFwaSBAIHBhY2tldFBhcnNlclxuXG4gIGZ1bmN0aW9uIHBvc3QoaHViKSA6OlxuICAgIHJldHVybiBodWJbcGx1Z2luX25hbWVdID0gaHViW3BsdWdpbl9uYW1lXShodWIpXG5cbiAgZnVuY3Rpb24gYmluZEVuZHBvaW50QXBpKHBhY2tldFBhcnNlcikgOjpcbiAgICBjb25zdCBwcm90b2NvbHMgPSBpbml0X3Byb3RvY29sIEAgcGFja2V0UGFyc2VyLCBAe30gcmFuZG9tX2lkLCBqc29uX3BhY2tcblxuICAgIGNvbnN0IHtFbmRwb2ludCwgRVBUYXJnZXQsIFNpbmssIE1zZ0N0eH0gPVxuICAgICAgcGx1Z2luX29wdGlvbnMuc3ViY2xhc3MgQDpcbiAgICAgICAgcHJvdG9jb2xzLFxuICAgICAgICBTaW5rOiBTaW5rQmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgICAgICBNc2dDdHg6IE1zZ0N0eEJhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICAgICAgRW5kcG9pbnQ6IEVuZHBvaW50QmFzZS5zdWJjbGFzcyh7Y3JlYXRlTWFwfSlcbiAgICAgICAgRVBUYXJnZXQ6IEVQVGFyZ2V0QmFzZS5zdWJjbGFzcyhwcm90b2NvbHMpXG5cbiAgICByZXR1cm4gZnVuY3Rpb24oaHViKSA6OlxuICAgICAgbGV0IF9jbGllbnRfcnJjXG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAOiBjcmVhdGUsIHNlcnZlcjogZW5kcG9pbnQsIGNsaWVudCwgY2xpZW50RW5kcG9pbnRcblxuXG4gICAgICBmdW5jdGlvbiBlbmRwb2ludChvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCB0YXJnZXRzID0gaHViLnJvdXRlci50YXJnZXRzXG4gICAgICAgIGRvIHZhciBpZF90YXJnZXQgPSByYW5kb21faWQoKVxuICAgICAgICB3aGlsZSB0YXJnZXRzLmhhcyBAIGlkX3RhcmdldFxuICAgICAgICByZXR1cm4gY3JlYXRlIEAgaWRfdGFyZ2V0LCBvbl9pbml0XG5cbiAgICAgIGZ1bmN0aW9uIGNyZWF0ZShpZF90YXJnZXQsIG9uX2luaXQpIDo6XG4gICAgICAgIGNvbnN0IGhhbmRsZXJzID0gT2JqZWN0LmNyZWF0ZShudWxsKVxuICAgICAgICBjb25zdCBmcm9tX2lkID0gQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IG5ldyBNc2dDdHggQCBmcm9tX2lkLCBiaW5kUm91dGVDaGFubmVsKGh1YiwgY3JlYXRlUm91dGVDYWNoZSh0cnVlKSlcbiAgICAgICAgY29uc3QgZXBfdGd0ID0gbmV3IEVQVGFyZ2V0KG1zZ19jdHguZnJvbV9pZClcbiAgICAgICAgY29uc3QgZXAgPSBuZXcgRW5kcG9pbnQobXNnX2N0eCwgZXBfdGd0KVxuXG4gICAgICAgIGNvbnN0IHJlYWR5ID0gUHJvbWlzZVxuICAgICAgICAgIC5yZXNvbHZlIEAgb25faW5pdChlcCwgaHViKVxuICAgICAgICAgIC50aGVuIEAgX2FmdGVyX2luaXRcbiAgICAgICAgICAuY2F0Y2ggQCBlcnIgPT5cbiAgICAgICAgICAgIGhhbmRsZXJzLm9uX2Vycm9yIEAgZXJyLCBAe30gem9uZTonb25fcmVhZHknXG5cbiAgICAgICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgZXBfdGd0LCBAe31cbiAgICAgICAgICByZWFkeTogQHt9IHZhbHVlOiByZWFkeS50aGVuIEAgKCkgPT4gZXBfdGd0XG5cblxuICAgICAgICBmdW5jdGlvbiBfYWZ0ZXJfaW5pdCh0YXJnZXQpIDo6XG4gICAgICAgICAgaWYgbnVsbCA9PSB0YXJnZXQgOjpcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgZW5kcG9pbnQgaW5pdCB0byByZXR1cm4gYSBjbG9zdXJlIG9yIGludGVyZmFjZWBcblxuICAgICAgICAgIGhhbmRsZXJzLm9uX21zZyA9ICh0YXJnZXQub25fbXNnIHx8ICgnZnVuY3Rpb24nID09PSB0eXBlb2YgdGFyZ2V0ID8gdGFyZ2V0IDogZGVmYXVsdF9vbl9tc2cpKS5iaW5kKHRhcmdldClcbiAgICAgICAgICBoYW5kbGVycy5vbl9lcnJvciA9ICh0YXJnZXQub25fZXJyb3IgfHwgZGVmYXVsdF9vbl9lcnJvcikuYmluZCh0YXJnZXQsIGVwKVxuICAgICAgICAgIGhhbmRsZXJzLm9uX3NodXRkb3duID0gKHRhcmdldC5vbl9zaHV0ZG93biB8fCBkZWZhdWx0X29uX3NodXRkb3duKS5iaW5kKHRhcmdldCwgZXApXG5cbiAgICAgICAgICBjb25zdCBqc29uX3VucGFjayA9IHRhcmdldC5qc29uX3VucGFja1xuICAgICAgICAgICAgPyB0YXJnZXQuanNvbl91bnBhY2suYmluZCh0YXJnZXQpXG4gICAgICAgICAgICA6IEVQVGFyZ2V0Lmpzb25VbnBhY2sobXNnX2N0eClcblxuICAgICAgICAgIGNvbnN0IHNpbmsgPSBuZXcgU2luayBAIGpzb25fdW5wYWNrXG4gICAgICAgICAgc2luay5yZWdpc3RlciBAIGVwLCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnNcblxuICAgICAgICAgIHJldHVybiB0YXJnZXQub25fcmVhZHlcbiAgICAgICAgICAgID8gdGFyZ2V0Lm9uX3JlYWR5KGVwLCBodWIpXG4gICAgICAgICAgICA6IHRhcmdldFxuXG5cblxuICAgICAgZnVuY3Rpb24gY2xpZW50RW5kcG9pbnQob25fcmVhZHkpIDo6XG4gICAgICAgIGxldCBlcF90Z3QsIGRvbmUgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICAgICAgZXBfdGd0ID0gZW5kcG9pbnQgQCBlcCA9PiBAOlxuICAgICAgICAgICAgYXN5bmMgb25fcmVhZHkoZXAsIGh1YikgOjpcbiAgICAgICAgICAgICAgcmVzb2x2ZSBAIGF3YWl0IG9uX3JlYWR5KGVwLCBodWIpXG4gICAgICAgICAgICAgIGVwLnNodXRkb3duKClcblxuICAgICAgICAgICAgb25fc2h1dGRvd24oZXApIDo6IHJlamVjdCgpXG4gICAgICAgICAgICBvbl9zZW5kX2Vycm9yKGVwLCBlcnIpIDo6IHJlamVjdChlcnIpXG5cbiAgICAgICAgcmV0dXJuIE9iamVjdC5hc3NpZ24gQCBlcF90Z3QsIEB7fVxuICAgICAgICAgIHRoZW4oeSxuKSA6OiByZXR1cm4gZG9uZS50aGVuKHksbilcbiAgICAgICAgICBjYXRjaChuKSA6OiByZXR1cm4gZG9uZS5jYXRjaChuKVxuICAgICAgICAgIGRvbmVcblxuXG4gICAgICBmdW5jdGlvbiBjbGllbnQoLi4uYXJncykgOjpcbiAgICAgICAgaWYgMSA9PT0gYXJncy5sZW5ndGggJiYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGFyZ3NbMF0gOjpcbiAgICAgICAgICByZXR1cm4gY2xpZW50RW5kcG9pbnQoYXJnc1swXSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgPT09IF9jbGllbnRfcnJjIDo6XG4gICAgICAgICAgX2NsaWVudF9ycmMgPSBiaW5kUm91dGVDaGFubmVsKGh1YiwgY3JlYXRlUm91dGVDYWNoZShmYWxzZSkpXG5cbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IG5ldyBNc2dDdHggQCBudWxsLCBfY2xpZW50X3JyY1xuICAgICAgICByZXR1cm4gMCAhPT0gYXJncy5sZW5ndGggPyBtc2dfY3R4LnRvKC4uLmFyZ3MpIDogbXNnX2N0eFxuXG4iLCJpbXBvcnQgZW5kcG9pbnRfcGx1Z2luIGZyb20gJy4vcGx1Z2luLmpzeSdcblxuY29uc3QgZ2V0UmFuZG9tVmFsdWVzID0gJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiB3aW5kb3dcbiAgPyB3aW5kb3cuY3J5cHRvLmdldFJhbmRvbVZhbHVlcyA6IG51bGxcblxuZW5kcG9pbnRfYnJvd3Nlci5yYW5kb21faWQgPSByYW5kb21faWRcbmZ1bmN0aW9uIHJhbmRvbV9pZCgpIDo6XG4gIGNvbnN0IGFyciA9IG5ldyBJbnQzMkFycmF5KDEpXG4gIGdldFJhbmRvbVZhbHVlcyhhcnIpXG4gIHJldHVybiBhcnJbMF1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gZW5kcG9pbnRfYnJvd3NlcihwbHVnaW5fb3B0aW9ucz17fSkgOjpcbiAgaWYgbnVsbCA9PSBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgOjpcbiAgICBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgPSByYW5kb21faWRcblxuICByZXR1cm4gZW5kcG9pbnRfcGx1Z2luKHBsdWdpbl9vcHRpb25zKVxuXG4iXSwibmFtZXMiOlsibGl0dGxlX2VuZGlhbiIsImNfc2luZ2xlIiwiY19kYXRhZ3JhbSIsImNfZGlyZWN0IiwiY19tdWx0aXBhcnQiLCJjX3N0cmVhbWluZyIsIl9lcnJfbXNnaWRfcmVxdWlyZWQiLCJfZXJyX3Rva2VuX3JlcXVpcmVkIiwiZnJtX3JvdXRpbmciLCJzaXplIiwiYml0cyIsIm1hc2siLCJvYmoiLCJmcm9tX2lkIiwiZHYiLCJvZmZzZXQiLCJzZXRJbnQzMiIsImlkX3JvdXRlciIsImlkX3RhcmdldCIsInVuZGVmaW5lZCIsImdldEludDMyIiwiZnJtX3Jlc3BvbnNlIiwibXNnaWQiLCJFcnJvciIsInNldEludDE2Iiwic2VxX2FjayIsImFja19mbGFncyIsInRva2VuIiwiZ2V0SW50MTYiLCJmcm1fZGF0YWdyYW0iLCJ0cmFuc3BvcnQiLCJmcm1fZGlyZWN0IiwiZnJtX211bHRpcGFydCIsInNlcV9wb3MiLCJzZXEiLCJzZXFfZmxhZ3MiLCJmcm1fc3RyZWFtaW5nIiwiYmluZF9zZXFfbmV4dCIsInNlcV9vZmZzZXQiLCJzZXFfbmV4dCIsImZsYWdzIiwiZmluIiwiTmFOIiwiY29tcG9zZUZyYW1pbmdzIiwiZnJtX2Zyb20iLCJmcm1fcmVzcCIsImZybV90cmFuc3BvcnRzIiwibGVuZ3RoIiwiYnlCaXRzIiwidF9mcm9tIiwiZl90ZXN0IiwidF9yZXNwIiwidDAiLCJ0MSIsInQyIiwidDMiLCJtYXAiLCJmIiwidGVzdEJpdHMiLCJjaG9vc2UiLCJsc3QiLCJUIiwiYiIsIm9wIiwiZm5fa2V5IiwiZm5fdHJhbiIsImZuX2Zyb20iLCJmbl9yZXNwIiwiZnJtIiwiYmluZEFzc2VtYmxlZCIsImZfcGFjayIsImZfdW5wYWNrIiwicGFjayIsInVucGFjayIsInBrdF90eXBlIiwicGt0X29iaiIsIlR5cGVFcnJvciIsInR5cGUiLCJEYXRhVmlldyIsIkFycmF5QnVmZmVyIiwiaGVhZGVyIiwiYnVmZmVyIiwic2xpY2UiLCJwa3QiLCJidWYiLCJoZWFkZXJfYnVmZmVyIiwiVWludDhBcnJheSIsImluZm8iLCJfYmluZF9pdGVyYWJsZSIsImJ1Zl9jbG9uZSIsInR0bCIsIm5leHQiLCJvcHRpb25zIiwiZG9uZSIsInZhbHVlIiwicGFja2V0UGFyc2VyIiwiZnJhZ21lbnRfc2l6ZSIsImNvbmNhdEJ1ZmZlcnMiLCJwYWNrUGFja2V0T2JqIiwicGFja191dGY4IiwidW5wYWNrX3V0ZjgiLCJOdW1iZXIiLCJyYW5kb21faWQiLCJqc29uX3BhY2siLCJjcmVhdGVTdHJlYW0iLCJwYWNrZXRGcmFnbWVudHMiLCJjcmVhdGVNdWx0aXBhcnQiLCJzaW5rIiwicGFydHMiLCJmZWVkIiwiYm9keV9idWZmZXIiLCJpbmNsdWRlcyIsImRlbGV0ZVN0YXRlRm9yIiwicmVzIiwicmVjdkRhdGEiLCJyc3RyZWFtIiwic3RhdGUiLCJmZWVkX2luaXQiLCJhc19jb250ZW50IiwiZmVlZF9pZ25vcmUiLCJtc2ciLCJqc29uX3VucGFjayIsImJvZHlfdXRmOCIsInJlY3ZTdHJlYW0iLCJyZWN2U3RyZWFtRGF0YSIsImJpbmQiLCJlcnIiLCJvbl9lcnJvciIsImZlZWRfYm9keSIsIm9uX2luaXQiLCJkYXRhIiwib25fZGF0YSIsIm9uX2VuZCIsImZlZWRfc2VxIiwibmV4dF9oZHIiLCJpIiwibGFzdElubmVyIiwiYnl0ZUxlbmd0aCIsImkwIiwiYm9keSIsImJpbmRUcmFuc3BvcnRJbXBscyIsImluYm91bmQiLCJoaWdoYml0cyIsInRyYW5zcG9ydHMiLCJvdXRib3VuZCIsImZyYW1pbmdzIiwiZnJhbWUiLCJpbXBsIiwidF9yZWN2IiwicGFja19oZHIiLCJyZWN2X21zZyIsImJpbmRUcmFuc3BvcnRzIiwicGFja0JvZHkiLCJzdHJlYW1pbmciLCJzZW5kIiwic3RyZWFtIiwiYmluZF9zdHJlYW0iLCJtb2RlIiwiY2hhbiIsIm1zZW5kIiwibXNlbmRfYnl0ZXMiLCJtc2VuZF9vYmplY3RzIiwibXNlbmRfaW1wbCIsIm9iamVjdCIsImJ5dGVzIiwid3JpdGUiLCJlbmQiLCJjaHVuayIsImNoZWNrX2ZucyIsImtleXMiLCJrZXkiLCJqc29uX3Byb3RvY29sIiwic2hhcmVkIiwiZGF0YWdyYW0iLCJkaXJlY3QiLCJyZWN2TXNnIiwic3RhdGVGb3IiLCJib2R5X2J1ZiIsInVucGFja0JvZHkiLCJiaW5hcnlfcHJvdG9jb2wiLCJhc0J1ZmZlciIsInBrdF9idWZmZXIiLCJjb250cm9sX3Byb3RvY29sIiwiaGlnaCIsInBpbmdfZnJhbWUiLCJwb25nX2ZyYW1lIiwicG9uZ190eXBlIiwicmVjdl9wb25nIiwicGluZ190eXBlIiwicmVjdl9waW5nIiwicGluZyIsIkpTT04iLCJzdHJpbmdpZnkiLCJ0czAiLCJEYXRlIiwicm91dGVyIiwiYm9keV9qc29uIiwicmVjdkN0cmwiLCJfc2VuZF9wb25nIiwicGt0X3BpbmciLCJyX2lkIiwidHMxIiwiZGlzcGF0Y2giLCJpbml0X3Byb3RvY29sIiwic2hhcmVkX3Byb3RvIiwianNvbiIsImpzb25fcHJvdG8iLCJiaW5hcnkiLCJiaW5hcnlfcHJvdG8iLCJjb250cm9sIiwiY29udHJvbF9wcm90byIsImNvZGVjcyIsImRlZmF1bHQiLCJiaW5kUm91dGVDaGFubmVsIiwiaHViIiwiY2FjaGUiLCJjaGFubmVsIiwiY29ubmVjdF9zZWxmIiwicmVzb2x2ZVJvdXRlIiwicm91dGVzIiwiY2FjaGVSb3V0ZUNoYW5uZWwiLCJyZXNvbHZlUm91dGVDaGFubmVsIiwiZ2V0Iiwic2V0Iiwicm91dGUiLCJkaXNjbyIsImhhcyIsImRlbGV0ZSIsIkVQVGFyZ2V0Iiwic3ViY2xhc3MiLCJleHRlbnNpb25zIiwiYXNzaWduIiwicHJvdG90eXBlIiwiaWQiLCJtc2dfY3R4IiwibXNnX2luZm8iLCJwcm9wcyIsImVudW1lcmFibGUiLCJ0byIsImZhc3RfanNvbiIsIk9iamVjdCIsImRlZmluZVByb3BlcnRpZXMiLCJlcF9lbmNvZGUiLCJqc29uX2FzX3JlcGx5IiwiZnJvbV9qc29uIiwianNvblVucGFjayIsInhmb3JtQnlLZXkiLCJjcmVhdGUiLCJ2IiwiZXBfZGVjb2RlIiwianNvblVucGFja0J5S2V5IiwicmVnIiwiV2Vha01hcCIsInN6IiwicGFyc2UiLCJyZXZpdmVyIiwieGZuIiwidmZuIiwiYmluZEN0eFByb3BzIiwiaW5pdCIsImN0eCIsInF1ZXJ5IiwiZXhwZWN0ZWQiLCJzaW1wbGUiLCJyIiwidCIsInRvU3RyaW5nIiwic3BsaXQiLCJwYXJzZUludCIsIkVuZHBvaW50IiwiZXBfdGd0Iiwid2l0aEVuZHBvaW50IiwiYXNSZXBseSIsImNvbnN0cnVjdG9yIiwidG9KU09OIiwiTWFwIiwiY3JlYXRlTWFwIiwiYnlfdG9rZW4iLCJjcmVhdGVSZXBseU1hcCIsImJ5X3RyYWZmaWMiLCJjcmVhdGVUcmFmZmljTWFwIiwidHJhZmZpYyIsInRzIiwibm93IiwicmVjdlRyYWZmaWMiLCJjcmVhdGVTdGF0ZU1hcCIsInJlcGx5Iiwicm1zZyIsInJlc29sdmUiLCJ0aGVuIiwiaXNfcmVwbHkiLCJ3YXJuIiwiaW5pdFJlcGx5IiwicF9zZW50IiwiaW5pdFJlcGx5UHJvbWlzZSIsIm1vbml0b3IiLCJQcm9taXNlIiwicmVqZWN0IiwiY2F0Y2giLCJ3aXRoUmVqZWN0VGltZW91dCIsImNsZWFyIiwiU2luayIsImZvclByb3RvY29scyIsIl9wcm90b2NvbCIsImVuZHBvaW50IiwiaGFuZGxlcnMiLCJ1bnJlZ2lzdGVyIiwidW5yZWdpc3RlclRhcmdldCIsInJlZ2lzdGVyVGFyZ2V0IiwiX2JpbmREaXNwYXRjaCIsIm9uX21zZyIsIm9uX3NodXRkb3duIiwiYWxpdmUiLCJwcm90b2NvbCIsImlzQWxpdmUiLCJzaHV0ZG93biIsImV4dHJhIiwiYmluZFNpbmsiLCJ6b25lIiwidGVybWluYXRlIiwiaWZBYnNlbnQiLCJlbnRyeSIsImJ5X21zZ2lkIiwiTXNnQ3R4Iiwid2l0aENvZGVjcyIsImZyb20iLCJmcmVlemUiLCJfaW52b2tlX2V4IiwiX21zZ0NvZGVjcyIsImFyZ3MiLCJfY29kZWMiLCJmbk9yS2V5IiwiaW52b2tlIiwiYXNzZXJ0TW9uaXRvciIsInRndCIsInNlbGYiLCJjbG9uZSIsInJlcGx5X2lkIiwid2l0aCIsIl9yb290XyIsImNoZWNrTW9uaXRvciIsImFjdGl2ZSIsImluaXRNb25pdG9yIiwidHNfZHVyYXRpb24iLCJ0c19hY3RpdmUiLCJwcm9taXNlIiwidGQiLCJ0aWQiLCJ0c19pbnRlcnZhbCIsImN0cmwiLCJjb2RlYyIsImNoZWNrUGluZyIsInNldEludGVydmFsIiwidW5yZWYiLCJjbGVhckludGVydmFsIiwibXNnX2NvZGVjIiwibXNnQ29kZWNzIiwibmFtZSIsImVudHJpZXMiLCJqc29uX3NlbmQiLCJwX3JlcGx5IiwidGltZW91dCIsIlJlcGx5VGltZW91dCIsInNldFRpbWVvdXQiLCJtc190aW1lb3V0IiwiZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyIsImVwIiwiZXJyb3IiLCJtZXNzYWdlIiwiY2xhc3NlcyIsImNyZWF0ZVJvdXRlQ2FjaGUiLCJwbHVnaW5fb3B0aW9ucyIsImRlZmF1bHRfb25fbXNnIiwiZGVmYXVsdF9vbl9lcnJvciIsImRlZmF1bHRfb25fc2h1dGRvd24iLCJvcmRlciIsInBvc3QiLCJGYWJyaWNIdWJfUEkiLCJiYXNlcyIsImlzUGFja2V0UGFyc2VyIiwicGx1Z2luX25hbWUiLCJiaW5kRW5kcG9pbnRBcGkiLCJwcm90b2NvbHMiLCJTaW5rQmFzZSIsIk1zZ0N0eEJhc2UiLCJFbmRwb2ludEJhc2UiLCJFUFRhcmdldEJhc2UiLCJfY2xpZW50X3JyYyIsInNlcnZlciIsImNsaWVudCIsImNsaWVudEVuZHBvaW50IiwidGFyZ2V0cyIsImlkX3NlbGYiLCJyZWFkeSIsIl9hZnRlcl9pbml0IiwidGFyZ2V0IiwicmVnaXN0ZXIiLCJvbl9yZWFkeSIsInkiLCJuIiwiZ2V0UmFuZG9tVmFsdWVzIiwid2luZG93IiwiY3J5cHRvIiwiZW5kcG9pbnRfYnJvd3NlciIsImFyciIsIkludDMyQXJyYXkiLCJlbmRwb2ludF9wbHVnaW4iXSwibWFwcGluZ3MiOiI7O0FBQUEsTUFBTUEsZ0JBQWdCLElBQXRCO0FBQ0EsTUFBTUMsV0FBVyxRQUFqQjtBQUNBLE1BQU1DLGFBQWEsVUFBbkI7QUFDQSxNQUFNQyxXQUFXLFFBQWpCO0FBQ0EsTUFBTUMsY0FBYyxXQUFwQjtBQUNBLE1BQU1DLGNBQWMsV0FBcEI7O0FBRUEsTUFBTUMsc0JBQXVCLDBCQUE3QjtBQUNBLE1BQU1DLHNCQUF1QiwyQkFBN0I7O0FBR0EsU0FBU0MsV0FBVCxHQUF1QjtRQUNmQyxPQUFPLENBQWI7UUFBZ0JDLE9BQU8sR0FBdkI7UUFBNEJDLE9BQU8sR0FBbkM7U0FDTztRQUFBLEVBQ0NELElBREQsRUFDT0MsSUFEUDs7V0FHRUMsR0FBUCxFQUFZO2FBQVUsUUFBUUEsSUFBSUMsT0FBWixHQUFzQkgsSUFBdEIsR0FBNkIsS0FBcEM7S0FIVjs7V0FLRUUsR0FBUCxFQUFZRSxFQUFaLEVBQWdCQyxNQUFoQixFQUF3QjtZQUNoQixFQUFDRixPQUFELEtBQVlELEdBQWxCO1NBQ0dJLFFBQUgsQ0FBYyxJQUFFRCxNQUFoQixFQUF3QixJQUFFRixRQUFRSSxTQUFsQyxFQUE2Q2pCLGFBQTdDO1NBQ0dnQixRQUFILENBQWMsSUFBRUQsTUFBaEIsRUFBd0IsSUFBRUYsUUFBUUssU0FBbEMsRUFBNkNsQixhQUE3QztLQVJHOzthQVVJWSxHQUFULEVBQWNFLEVBQWQsRUFBa0JDLE1BQWxCLEVBQTBC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

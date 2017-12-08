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
      bindCtxProps(props, () => msg_ctx.to(this, msg_info).fast_json);
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

function bindCtxProps(props, init) {
  let ctx;
  props.send = { get() {
      return (ctx || (ctx = init())).send;
    } };
  props.query = { get() {
      return (ctx || (ctx = init())).query;
    } };
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
  }initReply(token, msg_ctx) {
    return this.initReplyPromise(token, msg_ctx.ms_timeout);
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

  initReplyPromise(token, ms_timeout) {
    let reject;
    const ans = new Promise((resolve, reject_) => {
      this.by_token.set(token, resolve);
      reject = reject_;
    });

    if (ms_timeout) {
      const timeout = () => reject(new this.ReplyTimeout());
      const tid = setTimeout(timeout, ms_timeout);
      if (tid.unref) {
        tid.unref();
      }
      function clear() {
        clearTimeout(tid);
      }
      ans.then(clear, clear);
    }

    return res => {
      if (res && res.catch) {
        ans.sent = res;
        res.catch(reject);
      }
      return ans;
    };
  }
}

class ReplyTimeout extends Error {}

Object.assign(Endpoint.prototype, {
  ReplyTimeout });

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

    this.assertMonitor();
    const chan = this.resolveRouteChannel(obj.id_router);
    if (true !== token) {
      return invoke(chan, obj, ...args);
    } else {
      token = obj.token = this.random_id();
      const reply = this.endpoint.initReply(token, this);
      return reply(invoke(chan, obj, ...args));
    }
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
}

Object.assign(MsgCtx.prototype, {
  ms_timeout: 5000 });

const default_plugin_options = {
  plugin_name: 'endpoint',
  on_msg({ msg, reply, info }) {
    console.warn('ENDPOINT MSG:', { msg, reply, info });
  },
  on_send_error(ep, err) {
    console.error('ENDPOINT SEND ERROR:', err);
    ep.shutdown();
  },
  on_recv_error(ep, err, extra) {
    console.error('ENDPOINT RECV ERROR:', err, extra);
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
  }, createCacheMap() {
    return new Map(); // LRUMap, HashbeltMap
  } };var endpoint_plugin = function (plugin_options) {
  plugin_options = Object.assign({}, default_plugin_options, plugin_options);
  const {
    plugin_name, random_id, json_pack,
    on_msg: default_on_msg,
    on_send_error: default_on_send_error,
    on_recv_error: default_on_recv_error,
    on_shutdown: default_on_shutdown,
    createMap, createCacheMap } = plugin_options;

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
      const resolveRouteChannel = hub.bindRouteChannel(null, createCacheMap());
      return Object.assign(endpoint, { create, server: endpoint, client, clientEndpoint });

      function endpoint(on_init) {
        const targets = hub.router.targets;
        do var id_target = random_id(); while (targets.has(id_target));
        return create(id_target, on_init);
      }

      function create(id_target, on_init) {
        const from_id = { id_target, id_router: hub.router.id_self };
        const msg_ctx = new MsgCtx$$1(from_id, resolveRouteChannel);
        const ep_tgt = new EPTarget$$1(msg_ctx.from_id);
        const ep = new Endpoint$$1(msg_ctx, ep_tgt);

        const ready = Promise.resolve(on_init(ep, hub)).then(_after_init);

        return Object.defineProperties(ep_tgt, {
          ready: { value: ready.then(() => ep_tgt) } });

        function _after_init(target) {
          if (null == target) {
            throw new TypeError(`Expected endpoint init to return a closure or interface`);
          }

          const on_msg = (target.on_msg || ('function' === typeof target ? target : default_on_msg)).bind(target);
          const on_send_error = (target.on_send_error || default_on_send_error).bind(target, ep);
          const on_recv_error = (target.on_recv_error || default_on_recv_error).bind(target, ep);
          const on_shutdown = (target.on_shutdown || default_on_shutdown).bind(target, ep);

          ready.catch(on_send_error);

          const json_unpack = target.json_unpack ? target.json_unpack.bind(target) : EPTarget$$1.jsonUnpack(msg_ctx);

          const sink = new Sink$$1(json_unpack);
          sink.register(ep, hub, id_target, { on_msg, on_recv_error, on_shutdown });

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
          finally(cb) {
            return done.then(cb, cb);
          },
          done });
      }

      function client(...args) {
        if (1 === args.length && 'function' === typeof args[0]) {
          return clientEndpoint(args[0]);
        }

        const msg_ctx = new MsgCtx$$1(null, resolveRouteChannel);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZWpzLmpzIiwic291cmNlcyI6WyIuLi9jb2RlL3Byb3RvY29sL2ZyYW1pbmcuanN5IiwiLi4vY29kZS9wcm90b2NvbC9zaGFyZWQuanN5IiwiLi4vY29kZS9wcm90b2NvbC9qc29uLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvYmluYXJ5LmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvY29udHJvbC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2luZGV4LmpzeSIsIi4uL2NvZGUvZXBfdGFyZ2V0LmpzeSIsIi4uL2NvZGUvZW5kcG9pbnQuanN5IiwiLi4vY29kZS9zaW5rLmpzeSIsIi4uL2NvZGUvbXNnY3R4LmpzeSIsIi4uL2NvZGUvcGx1Z2luLmpzeSIsIi4uL2NvZGUvaW5kZXgubm9kZWpzLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBsaXR0bGVfZW5kaWFuID0gdHJ1ZVxuY29uc3QgY19zaW5nbGUgPSAnc2luZ2xlJ1xuY29uc3QgY19kYXRhZ3JhbSA9ICdkYXRhZ3JhbSdcbmNvbnN0IGNfZGlyZWN0ID0gJ2RpcmVjdCdcbmNvbnN0IGNfbXVsdGlwYXJ0ID0gJ211bHRpcGFydCdcbmNvbnN0IGNfc3RyZWFtaW5nID0gJ3N0cmVhbWluZydcblxuY29uc3QgX2Vycl9tc2dpZF9yZXF1aXJlZCA9IGBSZXNwb25zZSByZXFpcmVzICdtc2dpZCdgXG5jb25zdCBfZXJyX3Rva2VuX3JlcXVpcmVkID0gYFRyYW5zcG9ydCByZXFpcmVzICd0b2tlbidgXG5cblxuZnVuY3Rpb24gZnJtX3JvdXRpbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MSwgbWFzayA9IDB4MVxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLmZyb21faWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCB7ZnJvbV9pZH0gPSBvYmpcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF9yb3V0ZXIsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDMyIEAgNCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF90YXJnZXQsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IGZyb21faWQgPSB1bmRlZmluZWQgPT09IG9iai5mcm9tX2lkXG4gICAgICAgID8gb2JqLmZyb21faWQgPSB7fSA6IG9iai5mcm9tX2lkXG4gICAgICBmcm9tX2lkLmlkX3JvdXRlciA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGZyb21faWQuaWRfdGFyZ2V0ID0gZHYuZ2V0SW50MzIgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5mdW5jdGlvbiBmcm1fcmVzcG9uc2UoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MiwgbWFzayA9IDB4MlxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLm1zZ2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoubXNnaWQgOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl9tc2dpZF9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLm1zZ2lkLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXFfYWNrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5hY2tfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50b2tlbiA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfYWNrID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLmFja19mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuXG5cbmZ1bmN0aW9uIGZybV9kYXRhZ3JhbSgpIDo6XG4gIGNvbnN0IHNpemUgPSAwLCBiaXRzID0gMHgwLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RhdGFncmFtXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGF0YWdyYW0gPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kYXRhZ3JhbVxuXG5mdW5jdGlvbiBmcm1fZGlyZWN0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDQsIGJpdHMgPSAweDQsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGlyZWN0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGlyZWN0ID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGlyZWN0XG5cbmZ1bmN0aW9uIGZybV9tdWx0aXBhcnQoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4OCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19tdWx0aXBhcnRcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19tdWx0aXBhcnQgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjogLy8gdXNlIHNlcV9uZXh0XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX211bHRpcGFydFxuXG5mdW5jdGlvbiBmcm1fc3RyZWFtaW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweGMsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfc3RyZWFtaW5nXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfc3RyZWFtaW5nID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW4gLy8gdXNlIHNlcV9uZXh0XG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19zdHJlYW1pbmdcblxuXG5mdW5jdGlvbiBiaW5kX3NlcV9uZXh0KG9mZnNldCkgOjpcbiAgY29uc3Qgc2VxX29mZnNldCA9IHRoaXMuc2VxX3BvcyArIG9mZnNldFxuICBsZXQgc2VxID0gMVxuICByZXR1cm4gZnVuY3Rpb24gc2VxX25leHQoe2ZsYWdzLCBmaW59LCBkdikgOjpcbiAgICBpZiAhIGZpbiA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCBzZXErKywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICBlbHNlIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIC1zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgICBzZXEgPSBOYU5cblxuXG5cbmV4cG9ydCBkZWZhdWx0IGNvbXBvc2VGcmFtaW5ncygpXG5mdW5jdGlvbiBjb21wb3NlRnJhbWluZ3MoKSA6OlxuICBjb25zdCBmcm1fZnJvbSA9IGZybV9yb3V0aW5nKCksIGZybV9yZXNwID0gZnJtX3Jlc3BvbnNlKClcbiAgY29uc3QgZnJtX3RyYW5zcG9ydHMgPSBAW10gZnJtX2RhdGFncmFtKCksIGZybV9kaXJlY3QoKSwgZnJtX211bHRpcGFydCgpLCBmcm1fc3RyZWFtaW5nKClcblxuICBpZiA4ICE9PSBmcm1fZnJvbS5zaXplIHx8IDggIT09IGZybV9yZXNwLnNpemUgfHwgNCAhPSBmcm1fdHJhbnNwb3J0cy5sZW5ndGggOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgRnJhbWluZyBTaXplIGNoYW5nZWBcblxuICBjb25zdCBieUJpdHMgPSBbXSwgbWFzaz0weGZcblxuICA6OlxuICAgIGNvbnN0IHRfZnJvbSA9IGZybV9mcm9tLmZfdGVzdCwgdF9yZXNwID0gZnJtX3Jlc3AuZl90ZXN0XG4gICAgY29uc3QgW3QwLHQxLHQyLHQzXSA9IGZybV90cmFuc3BvcnRzLm1hcCBAIGY9PmYuZl90ZXN0XG5cbiAgICBjb25zdCB0ZXN0Qml0cyA9IGJ5Qml0cy50ZXN0Qml0cyA9IG9iaiA9PlxuICAgICAgMCB8IHRfZnJvbShvYmopIHwgdF9yZXNwKG9iaikgfCB0MChvYmopIHwgdDEob2JqKSB8IHQyKG9iaikgfCB0MyhvYmopXG5cbiAgICBieUJpdHMuY2hvb3NlID0gZnVuY3Rpb24gKG9iaiwgbHN0KSA6OlxuICAgICAgaWYgbnVsbCA9PSBsc3QgOjogbHN0ID0gdGhpcyB8fCBieUJpdHNcbiAgICAgIHJldHVybiBsc3RbdGVzdEJpdHMob2JqKV1cblxuXG4gIGZvciBjb25zdCBUIG9mIGZybV90cmFuc3BvcnRzIDo6XG4gICAgY29uc3Qge2JpdHM6Yiwgc2l6ZSwgdHJhbnNwb3J0fSA9IFRcblxuICAgIGJ5Qml0c1tifDBdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwwLCBtYXNrLCBzaXplOiBzaXplLCBvcDogJydcbiAgICBieUJpdHNbYnwxXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MSwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAnZidcbiAgICBieUJpdHNbYnwyXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MiwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAncidcbiAgICBieUJpdHNbYnwzXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MywgbWFzaywgc2l6ZTogMTYgKyBzaXplLCBvcDogJ2ZyJ1xuXG4gICAgZm9yIGNvbnN0IGZuX2tleSBvZiBbJ2ZfcGFjaycsICdmX3VucGFjayddIDo6XG4gICAgICBjb25zdCBmbl90cmFuID0gVFtmbl9rZXldLCBmbl9mcm9tID0gZnJtX2Zyb21bZm5fa2V5XSwgZm5fcmVzcCA9IGZybV9yZXNwW2ZuX2tleV1cblxuICAgICAgYnlCaXRzW2J8MF1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3RyYW4ob2JqLCBkdiwgMClcbiAgICAgIGJ5Qml0c1tifDFdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwyXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fcmVzcChvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8M11bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3Jlc3Aob2JqLCBkdiwgOCk7IGZuX3RyYW4ob2JqLCBkdiwgMTYpXG5cbiAgZm9yIGNvbnN0IGZybSBvZiBieUJpdHMgOjpcbiAgICBiaW5kQXNzZW1ibGVkIEAgZnJtXG5cbiAgcmV0dXJuIGJ5Qml0c1xuXG5cbmZ1bmN0aW9uIGJpbmRBc3NlbWJsZWQoZnJtKSA6OlxuICBjb25zdCB7VCwgc2l6ZSwgZl9wYWNrLCBmX3VucGFja30gPSBmcm1cbiAgaWYgVC5iaW5kX3NlcV9uZXh0IDo6XG4gICAgZnJtLnNlcV9uZXh0ID0gVC5iaW5kX3NlcV9uZXh0IEAgZnJtLnNpemUgLSBULnNpemVcblxuICBkZWxldGUgZnJtLlRcbiAgZnJtLnBhY2sgPSBwYWNrIDsgZnJtLnVucGFjayA9IHVucGFja1xuICBjb25zdCBzZXFfbmV4dCA9IGZybS5zZXFfbmV4dFxuXG4gIGZ1bmN0aW9uIHBhY2socGt0X3R5cGUsIHBrdF9vYmopIDo6XG4gICAgaWYgISBAIDAgPD0gcGt0X3R5cGUgJiYgcGt0X3R5cGUgPD0gMjU1IDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBrdF90eXBlIHRvIGJlIFswLi4yNTVdYFxuXG4gICAgcGt0X29iai50eXBlID0gcGt0X3R5cGVcbiAgICBpZiBzZXFfbmV4dCAmJiBudWxsID09IHBrdF9vYmouc2VxIDo6XG4gICAgICBwa3Rfb2JqLnNlcSA9IHRydWVcblxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IEFycmF5QnVmZmVyKHNpemUpXG4gICAgZl9wYWNrKHBrdF9vYmosIGR2LCAwKVxuICAgIHBrdF9vYmouaGVhZGVyID0gZHYuYnVmZmVyXG5cbiAgICBpZiB0cnVlID09PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgX2JpbmRfaXRlcmFibGUgQCBwa3Rfb2JqLCBkdi5idWZmZXIuc2xpY2UoMCxzaXplKVxuXG4gIGZ1bmN0aW9uIHVucGFjayhwa3QpIDo6XG4gICAgY29uc3QgYnVmID0gcGt0LmhlYWRlcl9idWZmZXIoKVxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IFVpbnQ4QXJyYXkoYnVmKS5idWZmZXJcblxuICAgIGNvbnN0IGluZm8gPSB7fVxuICAgIGZfdW5wYWNrKGluZm8sIGR2LCAwKVxuICAgIHJldHVybiBwa3QuaW5mbyA9IGluZm9cblxuICBmdW5jdGlvbiBfYmluZF9pdGVyYWJsZShwa3Rfb2JqLCBidWZfY2xvbmUpIDo6XG4gICAgY29uc3Qge3R5cGV9ID0gcGt0X29ialxuICAgIGNvbnN0IHtpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHRsLCB0b2tlbn0gPSBwa3Rfb2JqXG4gICAgcGt0X29iai5uZXh0ID0gbmV4dFxuXG4gICAgZnVuY3Rpb24gbmV4dChvcHRpb25zKSA6OlxuICAgICAgaWYgbnVsbCA9PSBvcHRpb25zIDo6IG9wdGlvbnMgPSB7fVxuICAgICAgY29uc3QgaGVhZGVyID0gYnVmX2Nsb25lLnNsaWNlKClcbiAgICAgIHNlcV9uZXh0IEAgb3B0aW9ucywgbmV3IERhdGFWaWV3IEAgaGVhZGVyXG4gICAgICByZXR1cm4gQHt9IGRvbmU6ICEhIG9wdGlvbnMuZmluLCB2YWx1ZTogQHt9IC8vIHBrdF9vYmpcbiAgICAgICAgaWRfcm91dGVyLCBpZF90YXJnZXQsIHR5cGUsIHR0bCwgdG9rZW4sIGhlYWRlclxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGFja2V0UGFyc2VyLCBvcHRpb25zLCBmcmFnbWVudF9zaXplKSA6OlxuICBjb25zdCB7Y29uY2F0QnVmZmVycywgcGFja1BhY2tldE9iaiwgcGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBwYWNrZXRQYXJzZXJcbiAgZnJhZ21lbnRfc2l6ZSA9IE51bWJlcihmcmFnbWVudF9zaXplIHx8IDgwMDApXG4gIGlmIDEwMjQgPiBmcmFnbWVudF9zaXplIHx8IDY1MDAwIDwgZnJhZ21lbnRfc2l6ZSA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIGZyYWdtZW50IHNpemU6ICR7ZnJhZ21lbnRfc2l6ZX1gXG5cbiAgY29uc3Qge3JhbmRvbV9pZCwganNvbl9wYWNrfSA9IG9wdGlvbnNcbiAgcmV0dXJuIEA6IHBhY2tldFBhcnNlciwgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwgcGFja2V0RnJhZ21lbnRzXG4gICAgYmluZFRyYW5zcG9ydHNcblxuXG4gIGZ1bmN0aW9uIGNyZWF0ZU11bHRpcGFydChwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBwYXJ0cyA9IFtdLCBmaW4gPSBmYWxzZVxuICAgIHJldHVybiBAe30gZmVlZCwgaW5mbzogcGt0LmluZm9cblxuICAgIGZ1bmN0aW9uIGZlZWQocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxIDwgMCA6OiBmaW4gPSB0cnVlOyBzZXEgPSAtc2VxXG4gICAgICBwYXJ0c1tzZXEtMV0gPSBwa3QuYm9keV9idWZmZXIoKVxuXG4gICAgICBpZiAhIGZpbiA6OiByZXR1cm5cbiAgICAgIGlmIHBhcnRzLmluY2x1ZGVzIEAgdW5kZWZpbmVkIDo6IHJldHVyblxuXG4gICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuXG4gICAgICBjb25zdCByZXMgPSBjb25jYXRCdWZmZXJzKHBhcnRzKVxuICAgICAgcGFydHMgPSBudWxsXG4gICAgICByZXR1cm4gcmVzXG5cbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtKHBrdCwgc2luaywgbXNnaWQpIDo6XG4gICAgbGV0IG5leHQ9MCwgZmluID0gZmFsc2UsIHJlY3ZEYXRhLCByc3RyZWFtXG4gICAgY29uc3Qgc3RhdGUgPSBAe30gZmVlZDogZmVlZF9pbml0LCBpbmZvOiBwa3QuaW5mb1xuICAgIHJldHVybiBzdGF0ZVxuXG4gICAgZnVuY3Rpb24gZmVlZF9pbml0KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuXG4gICAgICBjb25zdCBpbmZvID0gcGt0LmluZm9cbiAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiAgICAgIHJzdHJlYW0gPSBzaW5rLnJlY3ZTdHJlYW0obXNnLCBpbmZvKVxuICAgICAgaWYgbnVsbCA9PSByc3RyZWFtIDo6IHJldHVyblxuICAgICAgY2hlY2tfZm5zIEAgcnN0cmVhbSwgJ29uX2Vycm9yJywgJ29uX2RhdGEnLCAnb25fZW5kJyBcbiAgICAgIHJlY3ZEYXRhID0gc2luay5yZWN2U3RyZWFtRGF0YS5iaW5kKHNpbmssIHJzdHJlYW0sIGluZm8pXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9ib2R5XG4gICAgICBpZiByc3RyZWFtLm9uX2luaXQgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25faW5pdChtc2csIHBrdClcblxuICAgIGZ1bmN0aW9uIGZlZWRfYm9keShwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICByZWN2RGF0YSgpXG4gICAgICBsZXQgZGF0YVxuICAgICAgdHJ5IDo6XG4gICAgICAgIGZlZWRfc2VxKHBrdClcbiAgICAgICAgZGF0YSA9IGFzX2NvbnRlbnQocGt0LCBzaW5rKVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgaWYgZmluIDo6XG4gICAgICAgIGNvbnN0IHJlcyA9IHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lbmQgQCByZXMsIHBrdFxuICAgICAgZWxzZSA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9kYXRhIEAgZGF0YSwgcGt0XG5cbiAgICBmdW5jdGlvbiBmZWVkX2lnbm9yZShwa3QpIDo6XG4gICAgICB0cnkgOjogZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG5cbiAgICBmdW5jdGlvbiBmZWVkX3NlcShwa3QpIDo6XG4gICAgICBsZXQgc2VxID0gcGt0LmluZm8uc2VxXG4gICAgICBpZiBzZXEgPj0gMCA6OlxuICAgICAgICBpZiBuZXh0KysgPT09IHNlcSA6OlxuICAgICAgICAgIHJldHVybiAvLyBpbiBvcmRlclxuICAgICAgZWxzZSA6OlxuICAgICAgICBmaW4gPSB0cnVlXG4gICAgICAgIHNpbmsuZGVsZXRlU3RhdGVGb3IobXNnaWQpXG4gICAgICAgIGlmIG5leHQgPT09IC1zZXEgOjpcbiAgICAgICAgICBuZXh0ID0gJ2RvbmUnXG4gICAgICAgICAgcmV0dXJuIC8vIGluLW9yZGVyLCBsYXN0IHBhY2tldFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcbiAgICAgIG5leHQgPSAnaW52YWxpZCdcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYWNrZXQgb3V0IG9mIHNlcXVlbmNlYFxuXG4gIGZ1bmN0aW9uICogcGFja2V0RnJhZ21lbnRzKGJ1ZiwgbmV4dF9oZHIsIGZpbikgOjpcbiAgICBpZiBudWxsID09IGJ1ZiA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICB5aWVsZCBvYmpcbiAgICAgIHJldHVyblxuXG4gICAgbGV0IGkgPSAwLCBsYXN0SW5uZXIgPSBidWYuYnl0ZUxlbmd0aCAtIGZyYWdtZW50X3NpemU7XG4gICAgd2hpbGUgaSA8IGxhc3RJbm5lciA6OlxuICAgICAgY29uc3QgaTAgPSBpXG4gICAgICBpICs9IGZyYWdtZW50X3NpemVcblxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoKVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaTAsIGkpXG4gICAgICB5aWVsZCBvYmpcblxuICAgIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkpXG4gICAgICB5aWVsZCBvYmpcblxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IG91dGJvdW5kID0gW11cbiAgICBvdXRib3VuZC5jaG9vc2UgPSBmcmFtaW5ncy5jaG9vc2VcblxuICAgIGZvciBjb25zdCBmcmFtZSBvZiBmcmFtaW5ncyA6OlxuICAgICAgY29uc3QgaW1wbCA9IGZyYW1lID8gdHJhbnNwb3J0c1tmcmFtZS50cmFuc3BvcnRdIDogbnVsbFxuICAgICAgaWYgISBpbXBsIDo6IGNvbnRpbnVlXG5cbiAgICAgIGNvbnN0IHtiaXRzLCBwYWNrLCB1bnBhY2t9ID0gZnJhbWVcbiAgICAgIGNvbnN0IHBrdF90eXBlID0gaGlnaGJpdHMgfCBiaXRzXG4gICAgICBjb25zdCB7dF9yZWN2fSA9IGltcGxcblxuICAgICAgZnVuY3Rpb24gcGFja19oZHIob2JqKSA6OlxuICAgICAgICBwYWNrKHBrdF90eXBlLCBvYmopXG4gICAgICAgIHJldHVybiBvYmpcblxuICAgICAgZnVuY3Rpb24gcmVjdl9tc2cocGt0LCBzaW5rKSA6OlxuICAgICAgICB1bnBhY2socGt0KVxuICAgICAgICByZXR1cm4gdF9yZWN2KHBrdCwgc2luaylcblxuICAgICAgcGFja19oZHIucGt0X3R5cGUgPSByZWN2X21zZy5wa3RfdHlwZSA9IHBrdF90eXBlXG4gICAgICBvdXRib3VuZFtiaXRzXSA9IHBhY2tfaGRyXG4gICAgICBpbmJvdW5kW3BrdF90eXBlXSA9IHJlY3ZfbXNnXG5cbiAgICAgIGlmICdwcm9kdWN0aW9uJyAhPT0gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgOjpcbiAgICAgICAgY29uc3Qgb3AgPSBwYWNrX2hkci5vcCA9IHJlY3ZfbXNnLm9wID0gZnJhbWUub3BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcGFja19oZHIsICduYW1lJywgQHt9IHZhbHVlOiBgcGFja19oZHIgwqske29wfcK7YFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCByZWN2X21zZywgJ25hbWUnLCBAe30gdmFsdWU6IGByZWN2X21zZyDCqyR7b3B9wrtgXG5cbiAgICByZXR1cm4gb3V0Ym91bmRcblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IHBhY2tCb2R5ID0gdHJhbnNwb3J0cy5wYWNrQm9keVxuICAgIGNvbnN0IG91dGJvdW5kID0gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKVxuICAgIHJldHVybiB0cmFuc3BvcnRzLnN0cmVhbWluZ1xuICAgICAgPyBAe30gc2VuZCwgc3RyZWFtOiBiaW5kX3N0cmVhbSBAIHRyYW5zcG9ydHMuc3RyZWFtaW5nLm1vZGVcbiAgICAgIDogQHt9IHNlbmRcblxuICAgIGZ1bmN0aW9uIHNlbmQoY2hhbiwgb2JqLCBib2R5KSA6OlxuICAgICAgYm9keSA9IHBhY2tCb2R5KGJvZHkpXG4gICAgICBpZiBmcmFnbWVudF9zaXplIDwgYm9keS5ieXRlTGVuZ3RoIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIG9iai50cmFuc3BvcnQgPSAnbXVsdGlwYXJ0J1xuICAgICAgICBjb25zdCBtc2VuZCA9IG1zZW5kX2J5dGVzKGNoYW4sIG9iailcbiAgICAgICAgcmV0dXJuIG1zZW5kIEAgdHJ1ZSwgYm9keVxuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gJ3NpbmdsZSdcbiAgICAgIG9iai5ib2R5ID0gYm9keVxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIHBhY2tfaGRyKG9iailcbiAgICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgICBmdW5jdGlvbiBtc2VuZF9ieXRlcyhjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGxldCB7bmV4dH0gPSBwYWNrX2hkcihvYmopXG4gICAgICBpZiBudWxsICE9PSBtc2cgOjpcbiAgICAgICAgb2JqLmJvZHkgPSBtc2dcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBjaGFuIEAgcGt0XG5cbiAgICAgIHJldHVybiBhc3luYyBmdW5jdGlvbiAoZmluLCBib2R5KSA6OlxuICAgICAgICBpZiBudWxsID09PSBuZXh0IDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgJ1dyaXRlIGFmdGVyIGVuZCdcbiAgICAgICAgbGV0IHJlc1xuICAgICAgICBmb3IgY29uc3Qgb2JqIG9mIHBhY2tldEZyYWdtZW50cyBAIGJvZHksIG5leHQsIGZpbiA6OlxuICAgICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgICByZXMgPSBhd2FpdCBjaGFuIEAgcGt0XG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gcmVzXG5cbiAgICBmdW5jdGlvbiBtc2VuZF9vYmplY3RzKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBjb25zdCBvYmogPSBuZXh0KHtmaW59KVxuICAgICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIGJpbmRfc3RyZWFtKG1vZGUpIDo6XG4gICAgICBjb25zdCBtc2VuZF9pbXBsID0ge29iamVjdDogbXNlbmRfb2JqZWN0cywgYnl0ZXM6IG1zZW5kX2J5dGVzfVttb2RlXVxuICAgICAgaWYgbXNlbmRfaW1wbCA6OiByZXR1cm4gc3RyZWFtXG5cbiAgICAgIGZ1bmN0aW9uIHN0cmVhbShjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgICAgaWYgISBvYmoudG9rZW4gOjogb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzdHJlYW1pbmcnXG4gICAgICAgIGNvbnN0IG1zZW5kID0gbXNlbmRfaW1wbCBAIGNoYW4sIG9iaiwganNvbl9wYWNrKG1zZylcbiAgICAgICAgd3JpdGUud3JpdGUgPSB3cml0ZTsgd3JpdGUuZW5kID0gd3JpdGUuYmluZCh0cnVlKVxuICAgICAgICByZXR1cm4gd3JpdGVcblxuICAgICAgICBmdW5jdGlvbiB3cml0ZShjaHVuaykgOjpcbiAgICAgICAgICByZXR1cm4gY2h1bmsgIT0gbnVsbFxuICAgICAgICAgICAgPyBtc2VuZCBAIHRydWU9PT10aGlzLCBwYWNrQm9keShjaHVuaylcbiAgICAgICAgICAgIDogbXNlbmQgQCB0cnVlXG5cblxuZnVuY3Rpb24gY2hlY2tfZm5zKG9iaiwgLi4ua2V5cykgOjpcbiAgZm9yIGNvbnN0IGtleSBvZiBrZXlzIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG9ialtrZXldIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIFwiJHtrZXl9XCIgdG8gYmUgYSBmdW5jdGlvbmBcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGpzb25fcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIGpzb25fcGFja30gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keVxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KCkgfHwgdW5kZWZpbmVkXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgYm9keV9idWYgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBib2R5X2J1ZiA6OlxuICAgICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCB1bnBhY2tfdXRmOChib2R5X2J1ZikgfHwgdW5kZWZpbmVkXG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdvYmplY3QnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICByZXR1cm4gc3RhdGUuZmVlZChwa3QsIHVucGFja0JvZHkpXG5cbiAgZnVuY3Rpb24gcGFja0JvZHkoYm9keSkgOjpcbiAgICByZXR1cm4gcGFja191dGY4IEAganNvbl9wYWNrKGJvZHkpXG5cbiAgZnVuY3Rpb24gdW5wYWNrQm9keShwa3QsIHNpbmspIDo6XG4gICAgcmV0dXJuIHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGJpbmFyeV9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbX0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICBjb25zdCB7YXNCdWZmZXJ9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICByZXR1cm4gQHt9XG4gICAgcGFja0JvZHk6IGFzQnVmZmVyXG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0gcGt0LmJvZHlfYnVmZmVyKClcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBtc2cgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2cgOjpcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ2J5dGVzJ1xuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVTdHJlYW1cbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QsIHBrdF9idWZmZXIpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG5mdW5jdGlvbiBwa3RfYnVmZmVyKHBrdCkgOjogcmV0dXJuIHBrdC5ib2R5X2J1ZmZlcigpXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBjb250cm9sX3Byb3RvY29sKGluYm91bmQsIGhpZ2gsIHNoYXJlZCkgOjpcbiAgY29uc3Qge3JhbmRvbV9pZH0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tQYWNrZXRPYmp9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIGNvbnN0IHBpbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgdG9rZW46IHRydWUsIHRyYW5zcG9ydDogJ2RpcmVjdCdcbiAgY29uc3QgcG9uZ19mcmFtZSA9IGZyYW1pbmdzLmNob29zZSBAOiBmcm9tX2lkOiB0cnVlLCBtc2dpZDogdHJ1ZSwgdHJhbnNwb3J0OiAnZGF0YWdyYW0nXG5cbiAgY29uc3QgcG9uZ190eXBlID0gaGlnaHwweGVcbiAgaW5ib3VuZFtwb25nX3R5cGVdID0gcmVjdl9wb25nXG4gIGNvbnN0IHBpbmdfdHlwZSA9IGhpZ2h8MHhmXG4gIGluYm91bmRbaGlnaHwweGZdID0gcmVjdl9waW5nXG5cbiAgcmV0dXJuIEB7fSBzZW5kOnBpbmcsIHBpbmdcblxuICBmdW5jdGlvbiBwaW5nKGNoYW4sIG9iaikgOjpcbiAgICBpZiAhIG9iai50b2tlbiA6OlxuICAgICAgb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICBvYmouYm9keSA9IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICBvcDogJ3BpbmcnLCB0czA6IG5ldyBEYXRlKClcbiAgICBwaW5nX2ZyYW1lLnBhY2socGluZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgZnVuY3Rpb24gcmVjdl9waW5nKHBrdCwgc2luaywgcm91dGVyKSA6OlxuICAgIHBpbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIF9zZW5kX3BvbmcgQCBwa3QuYm9keSwgcGt0LCBzaW5rLCByb3V0ZXJcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiAgZnVuY3Rpb24gX3NlbmRfcG9uZyh7dHMwfSwgcGt0X3BpbmcsIHNpbmssIHJvdXRlcikgOjpcbiAgICBjb25zdCB7bXNnaWQsIGZyb21faWQ6cl9pZH0gPSBwa3RfcGluZy5pbmZvXG4gICAgY29uc3Qge2lkX3JvdXRlciwgaWRfdGFyZ2V0fSA9IHJfaWRcbiAgICBjb25zdCBvYmogPSBAe30gaWRfcm91dGVyLCBpZF90YXJnZXRcbiAgICAgIGZyb21faWQ6IHNpbmsuZnJvbV9pZCwgbXNnaWRcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICAgIG9wOiAncG9uZycsIHRzMCwgdHMxOiBuZXcgRGF0ZSgpXG5cbiAgICBwb25nX2ZyYW1lLnBhY2socG9uZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiByb3V0ZXIuZGlzcGF0Y2ggQCBbcGt0XVxuXG4gIGZ1bmN0aW9uIHJlY3ZfcG9uZyhwa3QsIHNpbmspIDo6XG4gICAgcG9uZ19mcmFtZS51bnBhY2socGt0KVxuICAgIHBrdC5ib2R5ID0gcGt0LmJvZHlfanNvbigpXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcbmltcG9ydCBzaGFyZWRfcHJvdG8gZnJvbSAnLi9zaGFyZWQuanN5J1xuaW1wb3J0IGpzb25fcHJvdG8gZnJvbSAnLi9qc29uLmpzeSdcbmltcG9ydCBiaW5hcnlfcHJvdG8gZnJvbSAnLi9iaW5hcnkuanN5J1xuaW1wb3J0IGNvbnRyb2xfcHJvdG8gZnJvbSAnLi9jb250cm9sLmpzeSdcblxuZXhwb3J0ICogZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gaW5pdF9wcm90b2NvbChwYWNrZXRQYXJzZXIsIG9wdGlvbnMpIDo6XG4gIGNvbnN0IHNoYXJlZCA9IHNoYXJlZF9wcm90byBAIHBhY2tldFBhcnNlciwgb3B0aW9uc1xuXG4gIGNvbnN0IGluYm91bmQgPSBbXVxuICBjb25zdCBqc29uID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MDAgLy8gMHgwKiDigJQgSlNPTiBib2R5XG4gICAganNvbl9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgYmluYXJ5ID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MTAgLy8gMHgxKiDigJQgYmluYXJ5IGJvZHlcbiAgICBiaW5hcnlfcHJvdG8oc2hhcmVkKVxuXG4gIGNvbnN0IGNvbnRyb2wgPSBjb250cm9sX3Byb3RvIEAgaW5ib3VuZCxcbiAgICAweGYwIC8vIDB4Ziog4oCUIGNvbnRyb2xcbiAgICBzaGFyZWRcblxuICBjb25zdCBjb2RlY3MgPSBAOiBqc29uLCBiaW5hcnksIGNvbnRyb2wsIGRlZmF1bHQ6IGpzb25cblxuICBjb25zdCB7cmFuZG9tX2lkfSA9IHNoYXJlZFxuICByZXR1cm4gQDogaW5ib3VuZCwgY29kZWNzLCByYW5kb21faWRcblxuXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBFUFRhcmdldCA6OlxuICBzdGF0aWMgc3ViY2xhc3MoZXh0ZW5zaW9ucykgOjpcbiAgICBjbGFzcyBFUFRhcmdldCBleHRlbmRzIHRoaXMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgRVBUYXJnZXQucHJvdG90eXBlLCBleHRlbnNpb25zXG4gICAgcmV0dXJuIEVQVGFyZ2V0XG5cbiAgY29uc3RydWN0b3IoaWQsIG1zZ19jdHgsIG1zZ19pbmZvKSA6OlxuICAgIGNvbnN0IHByb3BzID0gQHt9XG4gICAgICBpZF9yb3V0ZXI6IEB7fSBlbnVtZXJhYmxlOiB0cnVlLCB2YWx1ZTogaWQuaWRfcm91dGVyXG4gICAgICBpZF90YXJnZXQ6IEB7fSBlbnVtZXJhYmxlOiB0cnVlLCB2YWx1ZTogaWQuaWRfdGFyZ2V0XG5cbiAgICBpZiBtc2dfY3R4IDo6XG4gICAgICBiaW5kQ3R4UHJvcHMgQCBwcm9wcywgKCkgPT5cbiAgICAgICAgbXNnX2N0eC50byh0aGlzLCBtc2dfaW5mbykuZmFzdF9qc29uXG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgcHJvcHNcblxuXG4gIHZhbHVlT2YoKSA6OiByZXR1cm4gMCB8IHRoaXMuaWRfdGFyZ2V0XG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRVBUYXJnZXQgJHt0aGlzLmVwX2VuY29kZSh0aGlzLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIHRoaXMuZXBfZW5jb2RlKHRoaXMpXG4gIGlzRVBUYXJnZXQoKSA6OiByZXR1cm4gdHJ1ZVxuXG4gIHN0YXRpYyBqc29uX2FzX3JlcGx5KG1zZ19jdHgpIDo6XG4gICAgcmV0dXJuIGluZm8gPT5cbiAgICAgIHRoaXMuZnJvbV9qc29uIEAgaW5mby5mcm9tX2lkLCBtc2dfY3R4LCBpbmZvXG5cbiAgc3RhdGljIGZyb21fanNvbihpZCwgbXNnX2N0eCwgbXNnX2luZm8pIDo6XG4gICAgaWYgaWQgOjogcmV0dXJuIG5ldyB0aGlzKGlkLCBtc2dfY3R4LCBtc2dfaW5mbylcblxuICBzdGF0aWMganNvblVucGFjayhtc2dfY3R4LCB4Zm9ybUJ5S2V5KSA6OlxuICAgIHhmb3JtQnlLZXkgPSBPYmplY3QuY3JlYXRlKHhmb3JtQnlLZXkgfHwgbnVsbClcbiAgICB4Zm9ybUJ5S2V5W3RoaXMudG9rZW5dID0gdiA9PlxuICAgICAgdGhpcy5mcm9tX2pzb24gQCB0aGlzLmVwX2RlY29kZSh2KSwgbXNnX2N0eFxuICAgIHJldHVybiB0aGlzLmpzb25VbnBhY2tCeUtleSh4Zm9ybUJ5S2V5KVxuXG4gIHN0YXRpYyBqc29uVW5wYWNrQnlLZXkoeGZvcm1CeUtleSkgOjpcbiAgICBjb25zdCByZWcgPSBuZXcgV2Vha01hcCgpXG4gICAgcmV0dXJuIHN6ID0+IEpTT04ucGFyc2UgQCBzeiwgcmV2aXZlclxuXG4gICAgZnVuY3Rpb24gcmV2aXZlcihrZXksIHZhbHVlKSA6OlxuICAgICAgY29uc3QgeGZuID0geGZvcm1CeUtleVtrZXldXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHhmbiA6OlxuICAgICAgICByZWcuc2V0KHRoaXMsIHhmbilcbiAgICAgICAgcmV0dXJuIHZhbHVlXG5cbiAgICAgIGlmICdvYmplY3QnID09PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgICAgY29uc3QgdmZuID0gcmVnLmdldCh2YWx1ZSlcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB2Zm4gOjpcbiAgICAgICAgICByZXR1cm4gdmZuIEAgdmFsdWVcbiAgICAgIHJldHVybiB2YWx1ZVxuXG5cbmZ1bmN0aW9uIGJpbmRDdHhQcm9wcyhwcm9wcywgaW5pdCkgOjpcbiAgbGV0IGN0eFxuICBwcm9wcy5zZW5kID0gQHt9IGdldCgpIDo6IHJldHVybiAoY3R4IHx8IChjdHggPSBpbml0KCkpKS5zZW5kXG4gIHByb3BzLnF1ZXJ5ID0gQHt9IGdldCgpIDo6IHJldHVybiAoY3R4IHx8IChjdHggPSBpbml0KCkpKS5xdWVyeVxuXG5cbmNvbnN0IHRva2VuID0gJ1xcdTAzRTAnIC8vICfPoCdcbkVQVGFyZ2V0LnRva2VuID0gdG9rZW5cblxuRVBUYXJnZXQuZXBfZW5jb2RlID0gRVBUYXJnZXQucHJvdG90eXBlLmVwX2VuY29kZSA9IGVwX2VuY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2VuY29kZShmcm9tX2lkLCBzaW1wbGUpIDo6XG4gIGxldCB7aWRfcm91dGVyOnIsIGlkX3RhcmdldDp0fSA9IGZyb21faWRcbiAgciA9IChyPj4+MCkudG9TdHJpbmcoMzYpXG4gIHQgPSAodD4+PjApLnRvU3RyaW5nKDM2KVxuICByZXR1cm4gc2ltcGxlXG4gICAgPyBgJHt0b2tlbn0gJHtyfX4ke3R9YFxuICAgIDogQHt9IFt0b2tlbl06IGAke3J9fiR7dH1gXG5cblxuRVBUYXJnZXQuZXBfZGVjb2RlID0gRVBUYXJnZXQucHJvdG90eXBlLmVwX2RlY29kZSA9IGVwX2RlY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2RlY29kZSh2KSA6OlxuICBjb25zdCBmcm9tX2lkID0gJ3N0cmluZycgPT09IHR5cGVvZiB2XG4gICAgPyB2LnNwbGl0KHRva2VuKVsxXVxuICAgIDogdlt0b2tlbl1cbiAgaWYgISBmcm9tX2lkIDo6IHJldHVyblxuXG4gIGxldCBbcix0XSA9IGZyb21faWQuc3BsaXQoJ34nKVxuICBpZiB1bmRlZmluZWQgPT09IHQgOjogcmV0dXJuXG4gIHIgPSAwIHwgcGFyc2VJbnQociwgMzYpXG4gIHQgPSAwIHwgcGFyc2VJbnQodCwgMzYpXG5cbiAgcmV0dXJuIEB7fSBpZF9yb3V0ZXI6IHIsIGlkX3RhcmdldDogdFxuXG4iLCJpbXBvcnQge2VwX2VuY29kZX0gZnJvbSAnLi9lcF90YXJnZXQuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBFbmRwb2ludCA6OlxuICBzdGF0aWMgc3ViY2xhc3MoZXh0ZW5zaW9ucykgOjpcbiAgICBjbGFzcyBFbmRwb2ludCBleHRlbmRzIHRoaXMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgRW5kcG9pbnQucHJvdG90eXBlLCBleHRlbnNpb25zXG4gICAgcmV0dXJuIEVuZHBvaW50XG5cbiAgdmFsdWVPZigpIDo6IHJldHVybiB0aGlzLmZyb21faWRcbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFbmRwb2ludCAke2VwX2VuY29kZSh0aGlzLmZyb21faWQsIHRydWUpfcK7YFxuXG4gIGNvbnN0cnVjdG9yKG1zZ19jdHgsIGVwX3RndCkgOjpcbiAgICBtc2dfY3R4ID0gbXNnX2N0eC53aXRoRW5kcG9pbnQodGhpcylcbiAgICBjb25zdCBhc1JlcGx5ID0gZXBfdGd0LmNvbnN0cnVjdG9yLmpzb25fYXNfcmVwbHkobXNnX2N0eClcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBmcm9tX2lkOiBAe30gdmFsdWU6IG1zZ19jdHguZnJvbV9pZCwgZW51bWVyYWJsZTogdHJ1ZVxuICAgICAgdG9KU09OOiBAe30gdmFsdWUoKSA6OiByZXR1cm4gZXBfdGd0LnRvSlNPTigpXG4gICAgICB0bzogQHt9IHZhbHVlOiBtc2dfY3R4LnRvXG4gICAgICBhc1JlcGx5OiBAe30gdmFsdWU6IGFzUmVwbHlcblxuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpXG4gIGNyZWF0ZVN0YXRlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUmVwbHlNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVUcmFmZmljTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcblxuICBiaW5kU2luayhzaW5rKSA6OlxuICAgIGNvbnN0IGJ5X3Rva2VuID0gdGhpcy5jcmVhdGVSZXBseU1hcCgpXG4gICAgY29uc3QgYnlfdHJhZmZpYyA9IHRoaXMuY3JlYXRlVHJhZmZpY01hcCgpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAOlxuICAgICAgYnlfdG9rZW46IEB7fSB2YWx1ZTogYnlfdG9rZW5cbiAgICAgIGJ5X3RyYWZmaWM6IEB7fSB2YWx1ZTogYnlfdHJhZmZpY1xuXG4gICAgY29uc3QgdHJhZmZpYyA9IChmcm9tX2lkLCB0cmFmZmljKSA9PiA6OlxuICAgICAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gICAgICBpZiBmcm9tX2lkIDo6XG4gICAgICAgIGNvbnN0IHQgPSBieV90cmFmZmljLmdldChmcm9tX2lkLmlkX3RhcmdldClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0IDo6XG4gICAgICAgICAgdC50cyA9IHRbYHRzXyR7dHJhZmZpY31gXSA9IHRzXG4gICAgICB0aGlzLnJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKVxuXG4gICAgcmV0dXJuIEB7fVxuICAgICAgZnJvbV9pZDogdGhpcy5mcm9tX2lkXG4gICAgICBieV9tc2dpZDogdGhpcy5jcmVhdGVTdGF0ZU1hcCgpXG5cbiAgICAgIHJlY3ZDdHJsOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ2N0cmwnKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2Q3RybChtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZyB8fCB7bXNnLCBpbmZvfSkudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2TXNnOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ21zZycpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZNc2cobXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cpLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdlN0cmVhbURhdGE6IChyc3RyZWFtLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICByZWN2U3RyZWFtOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJzdHJlYW0gPSB0aGlzLnJlY3ZTdHJlYW0obXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJzdHJlYW0pLnRoZW4ocmVwbHkpXG4gICAgICAgIHJldHVybiByc3RyZWFtXG5cbiAgcmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpIDo6XG4gIHJlY3ZDdHJsKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgaWYgaXNfcmVwbHkgOjogcmV0dXJuIG1zZ1xuICByZWN2TXNnKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgaWYgaXNfcmVwbHkgOjogcmV0dXJuIG1zZ1xuICAgIHJldHVybiBAe30gbXNnLCBpbmZvLCByZXBseTogdGhpcy5hc1JlcGx5KGluZm8pXG4gIHJlY3ZTdHJlYW0obXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBjb25zb2xlLndhcm4gQCBgVW5oYW5kbGUgcmVjdiBzdHJlYW06ICR7aW5mb31gXG4gICAgcmV0dXJuIG51bGxcbiAgICAvKiByZXR1cm4gQHt9IG1zZywgaW5mb1xuICAgICAgICAgb25faW5pdChtc2csIHBrdCkgOjogcmV0dXJuIHRoaXNcbiAgICAgICAgIG9uX2RhdGEoZGF0YSwgcGt0KSA6OiB0aGlzLnBhcnRzLnB1c2ggQCBkYXRhXG4gICAgICAgICBvbl9lbmQocmVzdWx0LCBwa3QpIDo6IHJldHVybiB0aGlzLnBhcnRzLmpvaW4oJycpXG4gICAgICAgICBvbl9lcnJvcihlcnIsIHBrdCkgOjogY29uc29sZS5sb2cgQCBlcnJcbiAgICAqL1xuXG4gIGluaXRSZXBseSh0b2tlbiwgbXNnX2N0eCkgOjpcbiAgICByZXR1cm4gdGhpcy5pbml0UmVwbHlQcm9taXNlIEAgdG9rZW4sIG1zZ19jdHgubXNfdGltZW91dFxuXG4gIGluaXRNb25pdG9yKGlkX3RhcmdldCkgOjpcbiAgICBjb25zdCBrZXkgPSBpZF90YXJnZXQuaWRfdGFyZ2V0IHx8IGlkX3RhcmdldFxuICAgIGxldCBtb25pdG9yID0gdGhpcy5ieV90cmFmZmljLmdldCBAIGtleVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gbW9uaXRvciA6OlxuICAgICAgbW9uaXRvciA9IEB7fSBpZF90YXJnZXQsIHRzOiBEYXRlLm5vdygpXG4gICAgICAgIHRkKCkgOjogcmV0dXJuIERhdGUubm93KCkgLSB0aGlzLnRzXG4gICAgICB0aGlzLmJ5X3RyYWZmaWMuc2V0IEAga2V5LCBtb25pdG9yXG4gICAgcmV0dXJuIG1vbml0b3JcblxuICBpbml0UmVwbHlQcm9taXNlKHRva2VuLCBtc190aW1lb3V0KSA6OlxuICAgIGxldCByZWplY3RcbiAgICBjb25zdCBhbnMgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3RfKSA9PiA6OlxuICAgICAgdGhpcy5ieV90b2tlbi5zZXQgQCB0b2tlbiwgcmVzb2x2ZVxuICAgICAgcmVqZWN0ID0gcmVqZWN0X1xuXG4gICAgaWYgbXNfdGltZW91dCA6OlxuICAgICAgY29uc3QgdGltZW91dCA9ICgpID0+IHJlamVjdCBAIG5ldyB0aGlzLlJlcGx5VGltZW91dFxuICAgICAgY29uc3QgdGlkID0gc2V0VGltZW91dCh0aW1lb3V0LCBtc190aW1lb3V0KVxuICAgICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgICBmdW5jdGlvbiBjbGVhcigpIDo6IGNsZWFyVGltZW91dCh0aWQpXG4gICAgICBhbnMudGhlbiBAIGNsZWFyLCBjbGVhclxuXG4gICAgcmV0dXJuIHJlcyA9PiA6OlxuICAgICAgaWYgcmVzICYmIHJlcy5jYXRjaCA6OlxuICAgICAgICBhbnMuc2VudCA9IHJlc1xuICAgICAgICByZXMuY2F0Y2gocmVqZWN0KVxuICAgICAgcmV0dXJuIGFuc1xuXG5cbmNsYXNzIFJlcGx5VGltZW91dCBleHRlbmRzIEVycm9yIDo6XG5cbk9iamVjdC5hc3NpZ24gQCBFbmRwb2ludC5wcm90b3R5cGUsIEB7fVxuICBSZXBseVRpbWVvdXRcblxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2luayA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtpbmJvdW5kfSkgOjpcbiAgICBjbGFzcyBTaW5rIGV4dGVuZHMgdGhpcyA6OlxuICAgIFNpbmsucHJvdG90eXBlLl9wcm90b2NvbCA9IGluYm91bmRcbiAgICByZXR1cm4gU2lua1xuXG4gIGNvbnN0cnVjdG9yKGpzb25fdW5wYWNrKSA6OlxuICAgIHRoaXMuanNvbl91bnBhY2sgPSBqc29uX3VucGFja1xuXG4gIHJlZ2lzdGVyKGVuZHBvaW50LCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnMpIDo6XG4gICAgY29uc3QgdW5yZWdpc3RlciA9ICgpID0+IGh1Yi5yb3V0ZXIudW5yZWdpc3RlclRhcmdldChpZF90YXJnZXQpXG5cbiAgICBodWIucm91dGVyLnJlZ2lzdGVyVGFyZ2V0IEAgaWRfdGFyZ2V0LFxuICAgICAgdGhpcy5fYmluZERpc3BhdGNoIEAgZW5kcG9pbnQsIHVucmVnaXN0ZXIsIGhhbmRsZXJzXG4gICAgcmV0dXJuIHRoaXNcblxuICBfYmluZERpc3BhdGNoKGVuZHBvaW50LCB1bnJlZ2lzdGVyLCB7b25fbXNnLCBvbl9lcnJvciwgb25fc2h1dGRvd259KSA6OlxuICAgIGxldCBhbGl2ZSA9IHRydWVcbiAgICBjb25zdCBwcm90b2NvbCA9IHRoaXMuX3Byb3RvY29sXG4gICAgY29uc3QgaXNBbGl2ZSA9ICgpID0+IGFsaXZlXG4gICAgY29uc3Qgc2h1dGRvd24gPSAoZXJyLCBleHRyYSkgPT4gOjpcbiAgICAgIGlmIGFsaXZlIDo6XG4gICAgICAgIHVucmVnaXN0ZXIoKTsgdW5yZWdpc3RlciA9IGFsaXZlID0gZmFsc2VcbiAgICAgICAgb25fc2h1dGRvd24oZXJyLCBleHRyYSlcblxuICAgIE9iamVjdC5hc3NpZ24gQCB0aGlzLCBlbmRwb2ludC5iaW5kU2luayh0aGlzKSwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG4gICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cblxuICAgIHJldHVybiBhc3luYyAocGt0LCByb3V0ZXIpID0+IDo6XG4gICAgICBpZiBmYWxzZT09PWFsaXZlIHx8IG51bGw9PXBrdCA6OiByZXR1cm4gYWxpdmVcblxuICAgICAgY29uc3QgcmVjdl9tc2cgPSBwcm90b2NvbFtwa3QudHlwZV1cbiAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmVjdl9tc2cgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBmYWxzZSwgQHt9IHBrdCwgem9uZTogJ3BrdC50eXBlJ1xuXG4gICAgICB0cnkgOjpcbiAgICAgICAgdmFyIG1zZyA9IGF3YWl0IHJlY3ZfbXNnIEAgcGt0LCB0aGlzLCByb3V0ZXJcbiAgICAgICAgaWYgISBtc2cgOjogcmV0dXJuIG1zZ1xuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZXJyLCBAe30gcGt0LCB6b25lOiAncHJvdG9jb2wnXG5cbiAgICAgIGlmIGZhbHNlID09PSBhbGl2ZSA6OlxuICAgICAgICByZXR1cm4gZmFsc2UgLy8gY2hhbmdlIHdoaWxlIGF3YWl0aW5nIGFib3Zl4oCmXG4gICAgICB0cnkgOjpcbiAgICAgICAgcmV0dXJuIGF3YWl0IG9uX21zZyBAIG1zZywgcGt0XG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgdHJ5IDo6XG4gICAgICAgICAgdmFyIHRlcm1pbmF0ZSA9IG9uX2Vycm9yIEAgZXJyLCBAe30gbXNnLCBwa3QsIHpvbmU6ICdkaXNwYXRjaCdcbiAgICAgICAgZmluYWxseSA6OlxuICAgICAgICAgIGlmIGZhbHNlICE9PSB0ZXJtaW5hdGUgOjpcbiAgICAgICAgICAgIHNodXRkb3duKGVyciwge21zZywgcGt0fSlcbiAgICAgICAgICAgIHJldHVybiBmYWxzZSAvLyBzaWduYWwgdW5yZWdpc3RlciB0byBtc2ctZmFicmljLWNvcmUvcm91dGVyXG5cbiAgc3RhdGVGb3IocGt0LCBpZkFic2VudCkgOjpcbiAgICBjb25zdCBtc2dpZCA9IHBrdC5pbmZvLm1zZ2lkXG4gICAgbGV0IGVudHJ5ID0gdGhpcy5ieV9tc2dpZC5nZXQobXNnaWQpXG4gICAgaWYgdW5kZWZpbmVkID09PSBlbnRyeSA6OlxuICAgICAgaWYgISBtc2dpZCA6OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgSW52YWxpZCBtc2dpZDogJHttc2dpZH1gXG4gICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgaWZBYnNlbnQgOjpcbiAgICAgICAgZW50cnkgPSBpZkFic2VudChwa3QsIHRoaXMsIG1zZ2lkKVxuICAgICAgZWxzZSBlbnRyeSA9IGlmQWJzZW50XG4gICAgICB0aGlzLmJ5X21zZ2lkLnNldCBAIG1zZ2lkLCBlbnRyeVxuICAgIHJldHVybiBlbnRyeVxuXG4gIGRlbGV0ZVN0YXRlRm9yKG1zZ2lkKSA6OlxuICAgIHJldHVybiB0aGlzLmJ5X21zZ2lkLmRlbGV0ZShtc2dpZClcbiIsImltcG9ydCB7ZXBfZW5jb2RlLCBlcF9kZWNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTXNnQ3R4IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe3JhbmRvbV9pZCwgY29kZWNzfSkgOjpcbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5yYW5kb21faWQgPSByYW5kb21faWRcbiAgICBNc2dDdHgud2l0aENvZGVjcyBAIGNvZGVjc1xuICAgIHJldHVybiBNc2dDdHhcblxuICBpbnNwZWN0KCkgOjpcbiAgICBjb25zdCBjdHggPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLmN0eClcbiAgICBjdHguZnJvbSA9IGVwX2VuY29kZShjdHguZnJvbV9pZCwgdHJ1ZSlcbiAgICBjdHgudG8gPSBlcF9lbmNvZGUoY3R4LCB0cnVlKVxuICAgIGRlbGV0ZSBjdHguZnJvbV9pZDsgZGVsZXRlIGN0eC5pZF9yb3V0ZXI7IGRlbGV0ZSBjdHguaWRfdGFyZ2V0XG4gICAgcmV0dXJuIGDCq01zZ0N0eCAke0pTT04uc3RyaW5naWZ5KGN0eCl9wrtgXG5cbiAgY29uc3RydWN0b3IoZnJvbV9pZCwgcmVzb2x2ZVJvdXRlQ2hhbm5lbCkgOjpcbiAgICBpZiBudWxsICE9PSBmcm9tX2lkIDo6XG4gICAgICBjb25zdCB7aWRfdGFyZ2V0LCBpZF9yb3V0ZXJ9ID0gZnJvbV9pZFxuICAgICAgZnJvbV9pZCA9IE9iamVjdC5mcmVlemUgQDogaWRfdGFyZ2V0LCBpZF9yb3V0ZXJcblxuICAgIGNvbnN0IGN0eCA9IHtmcm9tX2lkfVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIF9yb290XzogQDogdmFsdWU6IHRoaXNcbiAgICAgIGZyb21faWQ6IEA6IHZhbHVlOiBmcm9tX2lkXG4gICAgICBjdHg6IEA6IHZhbHVlOiBjdHhcbiAgICAgIHJlc29sdmVSb3V0ZUNoYW5uZWw6IEA6IHZhbHVlOiByZXNvbHZlUm91dGVDaGFubmVsXG5cbiAgd2l0aEVuZHBvaW50KGVuZHBvaW50KSA6OlxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEB7fVxuICAgICAgZW5kcG9pbnQ6IEB7fSB2YWx1ZTogZW5kcG9pbnRcblxuXG4gIHBpbmcodG9rZW49dHJ1ZSkgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX21zZ0NvZGVjcy5jb250cm9sLnBpbmcsIFtdLCB0b2tlblxuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlYy5zZW5kLCBhcmdzXG4gIHF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlYy5zZW5kLCBhcmdzLCB0cnVlXG5cbiAgc3RyZWFtKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlYy5zdHJlYW0sIGFyZ3NcbiAgaW52b2tlKGtleSwgLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX2NvZGVjW2tleV0sIGFyZ3NcbiAgYmluZEludm9rZShmbk9yS2V5LCB0b2tlbikgOjpcbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgZm5PcktleSA6OiBmbk9yS2V5ID0gdGhpcy5fY29kZWNcbiAgICByZXR1cm4gKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChmbk9yS2V5LCBhcmdzLCB0b2tlbilcblxuICBfaW52b2tlX2V4KGludm9rZSwgYXJncywgdG9rZW4pIDo6XG4gICAgY29uc3Qgb2JqID0gT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eFxuICAgIGlmIG51bGwgPT0gdG9rZW4gOjogdG9rZW4gPSBvYmoudG9rZW5cbiAgICBlbHNlIG9iai50b2tlbiA9IHRva2VuXG5cbiAgICB0aGlzLmFzc2VydE1vbml0b3IoKVxuICAgIGNvbnN0IGNoYW4gPSB0aGlzLnJlc29sdmVSb3V0ZUNoYW5uZWwob2JqLmlkX3JvdXRlcilcbiAgICBpZiB0cnVlICE9PSB0b2tlbiA6OlxuICAgICAgcmV0dXJuIGludm9rZSBAIGNoYW4sIG9iaiwgLi4uYXJnc1xuXG4gICAgZWxzZSA6OlxuICAgICAgdG9rZW4gPSBvYmoudG9rZW4gPSB0aGlzLnJhbmRvbV9pZCgpXG4gICAgICBjb25zdCByZXBseSA9IHRoaXMuZW5kcG9pbnQuaW5pdFJlcGx5KHRva2VuLCB0aGlzKVxuICAgICAgcmV0dXJuIHJlcGx5IEAgaW52b2tlIEAgY2hhbiwgb2JqLCAuLi5hcmdzXG5cbiAgZ2V0IHRvKCkgOjogcmV0dXJuICh0Z3QsIC4uLmFyZ3MpID0+IDo6XG4gICAgaWYgbnVsbCA9PSB0Z3QgOjogdGhyb3cgbmV3IEVycm9yIEAgYE51bGwgdGFyZ2V0IGVuZHBvaW50YFxuXG4gICAgY29uc3Qgc2VsZiA9IHRoaXMuY2xvbmUoKVxuXG4gICAgY29uc3QgY3R4ID0gc2VsZi5jdHhcbiAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgY3R4LmlkX3RhcmdldCA9IHRndFxuICAgICAgY3R4LmlkX3JvdXRlciA9IGN0eC5mcm9tX2lkLmlkX3JvdXRlclxuICAgIGVsc2UgOjpcbiAgICAgIGNvbnN0IHtmcm9tX2lkOiByZXBseV9pZCwgaWRfdGFyZ2V0LCBpZF9yb3V0ZXIsIHRva2VuLCBtc2dpZH0gPSBlcF9kZWNvZGUodGd0KSB8fCB0Z3RcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBpZF90YXJnZXQgOjpcbiAgICAgICAgaWYgdW5kZWZpbmVkID09PSBpZF9yb3V0ZXIgOjpcbiAgICAgICAgICBpZiAhIGN0eC5pZF9yb3V0ZXIgOjpcbiAgICAgICAgICAgIC8vIGltcGxpY2l0bHkgb24gdGhlIHNhbWUgcm91dGVyXG4gICAgICAgICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgICAgIGVsc2UgY3R4LmlkX3JvdXRlciA9IGlkX3JvdXRlclxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gaWRfdGFyZ2V0XG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gaWRfcm91dGVyIDo6XG4gICAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYXNzaW5nICdpZF9yb3V0ZXInIHJlcXVpcmVzICdpZF90YXJnZXQnYFxuICAgICAgZWxzZSBpZiB1bmRlZmluZWQgIT09IHJlcGx5X2lkICYmICEgY3R4LmlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfcm91dGVyID0gcmVwbHlfaWQuaWRfcm91dGVyXG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSByZXBseV9pZC5pZF90YXJnZXRcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuXG4gICAgcmV0dXJuIDAgPT09IGFyZ3MubGVuZ3RoID8gc2VsZiA6IHNlbGYud2l0aCBAIC4uLmFyZ3NcblxuICB3aXRoKC4uLmFyZ3MpIDo6XG4gICAgY29uc3QgY3R4ID0gdGhpcy5jdHhcbiAgICBmb3IgbGV0IHRndCBvZiBhcmdzIDo6XG4gICAgICBpZiB0cnVlID09PSB0Z3QgfHwgZmFsc2UgPT09IHRndCA6OlxuICAgICAgICBjdHgudG9rZW4gPSB0Z3RcbiAgICAgIGVsc2UgaWYgbnVsbCAhPSB0Z3QgOjpcbiAgICAgICAgY29uc3Qge3Rva2VuLCBtc2dpZH0gPSB0Z3RcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG4gICAgcmV0dXJuIHRoaXNcblxuICB3aXRoUmVwbHkoKSA6OlxuICAgIHJldHVybiB0aGlzLmNsb25lIEA6IHRva2VuOiB0cnVlXG5cbiAgcmVzZXQoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMuX3Jvb3RfLCBAe31cbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcbiAgY2xvbmUoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG5cbiAgYXNzZXJ0TW9uaXRvcigpIDo6XG4gICAgaWYgISB0aGlzLmNoZWNrTW9uaXRvcigpIDo6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgVGFyZ2V0IG1vbml0b3IgZXhwaXJlZGBcbiAgY2hlY2tNb25pdG9yKCkgOjogcmV0dXJuIHRydWVcbiAgbW9uaXRvcihvcHRpb25zPXt9KSA6OlxuICAgIGlmIHRydWUgPT09IG9wdGlvbnMgfHwgZmFsc2UgPT09IG9wdGlvbnMgOjpcbiAgICAgIG9wdGlvbnMgPSBAe30gYWN0aXZlOiBvcHRpb25zXG5cbiAgICBjb25zdCBtb25pdG9yID0gdGhpcy5lbmRwb2ludC5pbml0TW9uaXRvcih0aGlzLmN0eC5pZF90YXJnZXQpXG5cbiAgICBjb25zdCB0c19kdXJhdGlvbiA9IG9wdGlvbnMudHNfZHVyYXRpb24gfHwgNTAwMFxuICAgIGxldCB0c19hY3RpdmUgPSBvcHRpb25zLnRzX2FjdGl2ZVxuICAgIGlmIHRydWUgPT09IHRzX2FjdGl2ZSA6OlxuICAgICAgdHNfYWN0aXZlID0gdHNfZHVyYXRpb24vNFxuXG4gICAgbGV0IGNoZWNrTW9uaXRvclxuICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBjb25zdCBkb25lID0gb3B0aW9ucy5yZWplY3QgPyByZWplY3QgOiByZXNvbHZlXG4gICAgICB0aGlzLmNoZWNrTW9uaXRvciA9IGNoZWNrTW9uaXRvciA9ICgpID0+XG4gICAgICAgIHRzX2R1cmF0aW9uID4gbW9uaXRvci50ZCgpXG4gICAgICAgICAgPyB0cnVlIDogKGRvbmUobW9uaXRvciksIGZhbHNlKVxuXG4gICAgbGV0IHRpZFxuICAgIGNvbnN0IHRzX2ludGVydmFsID0gdHNfYWN0aXZlIHx8IHRzX2R1cmF0aW9uLzRcbiAgICBpZiBvcHRpb25zLmFjdGl2ZSB8fCB0c19hY3RpdmUgOjpcbiAgICAgIGNvbnN0IGN0cmwgPSB0aGlzLmNvZGVjKCdjb250cm9sJylcbiAgICAgIGNvbnN0IGNoZWNrUGluZyA9ICgpID0+IDo6XG4gICAgICAgIGlmIHRzX2ludGVydmFsID4gbW9uaXRvci50ZCgpIDo6XG4gICAgICAgICAgY3RybC5pbnZva2UoJ3BpbmcnKVxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja1BpbmcsIHRzX2ludGVydmFsXG4gICAgZWxzZSA6OlxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja01vbml0b3IsIHRzX2ludGVydmFsXG4gICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiBjbGVhckludGVydmFsKHRpZClcblxuICAgIHByb21pc2UudGhlbihjbGVhciwgY2xlYXIpXG4gICAgcmV0dXJuIHByb21pc2VcblxuXG4gIGNvZGVjKG1zZ19jb2RlYywgLi4uYXJncykgOjpcbiAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIG1zZ19jb2RlYyA6OlxuICAgICAgbXNnX2NvZGVjID0gdGhpcy5fbXNnQ29kZWNzW21zZ19jb2RlY11cblxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBtc2dfY29kZWMuc2VuZCA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwYWNrZXQgY29kZWMgcHJvdG9jb2xgXG5cbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEA6XG4gICAgICBfY29kZWM6IEA6IHZhbHVlOiBtc2dfY29kZWNcbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuICBzdGF0aWMgd2l0aENvZGVjcyhtc2dDb2RlY3MpIDo6XG4gICAgZm9yIGNvbnN0IFtuYW1lLCBtc2dfY29kZWNdIG9mIE9iamVjdC5lbnRyaWVzIEAgbXNnQ29kZWNzIDo6XG4gICAgICB0aGlzLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMuY29kZWMgQCBtc2dfY29kZWNcbiAgICB0aGlzLnByb3RvdHlwZS5fbXNnQ29kZWNzID0gbXNnQ29kZWNzXG4gICAgdGhpcy5wcm90b3R5cGUuX2NvZGVjID0gbXNnQ29kZWNzLmRlZmF1bHRcblxuICAgIC8vIGJpbmQgc2VuZF9qc29uIGFzIGZyZXF1ZW50bHkgdXNlZCBmYXN0LXBhdGhcbiAgICBjb25zdCBqc29uX3NlbmQgPSBtc2dDb2RlY3MuanNvbi5zZW5kXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLnByb3RvdHlwZSwgQDpcbiAgICAgIGZhc3RfanNvbjogQHt9IGdldCgpIDo6IHJldHVybiBAOlxuICAgICAgICBzZW5kOiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4IEAganNvbl9zZW5kLCBhcmdzXG4gICAgICAgIHF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4IEAganNvbl9zZW5kLCBhcmdzLCB0cnVlXG5cbiAgICByZXR1cm4gdGhpc1xuXG5PYmplY3QuYXNzaWduIEAgTXNnQ3R4LnByb3RvdHlwZSwgQHt9XG4gIG1zX3RpbWVvdXQ6IDUwMDBcblxuIiwiaW1wb3J0IGluaXRfcHJvdG9jb2wgZnJvbSAnLi9wcm90b2NvbC9pbmRleC5qc3knXG5pbXBvcnQgRW5kcG9pbnRCYXNlIGZyb20gJy4vZW5kcG9pbnQuanN5J1xuaW1wb3J0IEVQVGFyZ2V0QmFzZSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5pbXBvcnQgU2lua0Jhc2UgZnJvbSAnLi9zaW5rLmpzeSdcbmltcG9ydCBNc2dDdHhCYXNlIGZyb20gJy4vbXNnY3R4LmpzeSdcblxuY29uc3QgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyA9IEA6XG4gIHBsdWdpbl9uYW1lOiAnZW5kcG9pbnQnXG4gIG9uX21zZyh7bXNnLCByZXBseSwgaW5mb30pIDo6XG4gICAgY29uc29sZS53YXJuIEAgJ0VORFBPSU5UIE1TRzonLCBAe30gbXNnLCByZXBseSwgaW5mb1xuICBvbl9zZW5kX2Vycm9yKGVwLCBlcnIpIDo6XG4gICAgY29uc29sZS5lcnJvciBAICdFTkRQT0lOVCBTRU5EIEVSUk9SOicsIGVyclxuICAgIGVwLnNodXRkb3duKClcbiAgb25fcmVjdl9lcnJvcihlcCwgZXJyLCBleHRyYSkgOjpcbiAgICBjb25zb2xlLmVycm9yIEAgJ0VORFBPSU5UIFJFQ1YgRVJST1I6JywgZXJyLCBleHRyYVxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIC8vIHJldHVybiBmYWxzZSB0byBwcmV2ZW50IGF1dG8tc2h1dGRvd25cbiAgb25fc2h1dGRvd24oZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgLy8gY29uc3Qge21zZywgcGt0fSA9IGV4dHJhXG4gICAgY29uc29sZS5lcnJvciBAIGBFTkRQT0lOVCBTSFVURE9XTjogJHtlcnIubWVzc2FnZX1gXG5cbiAgc3ViY2xhc3MoY2xhc3NlcykgOjpcbiAgICAvL2NvbnN0IHtFbmRwb2ludCwgRVBUYXJnZXQsIFNpbmssIE1zZ0N0eCwgcHJvdG9jb2xzfSA9IGNsYXNzZXNcbiAgICByZXR1cm4gY2xhc3Nlc1xuXG4gIGpzb25fcGFjazogSlNPTi5zdHJpbmdpZnlcbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKSAvLyBMUlVNYXAsIEhhc2hiZWx0TWFwXG4gIGNyZWF0ZUNhY2hlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKSAvLyBMUlVNYXAsIEhhc2hiZWx0TWFwXG5cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGx1Z2luX29wdGlvbnMpIDo6XG4gIHBsdWdpbl9vcHRpb25zID0gT2JqZWN0LmFzc2lnbiBAIHt9LCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zLCBwbHVnaW5fb3B0aW9uc1xuICBjb25zdCBAe31cbiAgICBwbHVnaW5fbmFtZSwgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBvbl9tc2c6IGRlZmF1bHRfb25fbXNnXG4gICAgb25fc2VuZF9lcnJvcjogZGVmYXVsdF9vbl9zZW5kX2Vycm9yXG4gICAgb25fcmVjdl9lcnJvcjogZGVmYXVsdF9vbl9yZWN2X2Vycm9yXG4gICAgb25fc2h1dGRvd246IGRlZmF1bHRfb25fc2h1dGRvd25cbiAgICBjcmVhdGVNYXAsIGNyZWF0ZUNhY2hlTWFwXG4gID0gcGx1Z2luX29wdGlvbnNcblxuICByZXR1cm4gQDogb3JkZXI6IDEsIHN1YmNsYXNzLCBwb3N0XG4gIFxuICBmdW5jdGlvbiBzdWJjbGFzcyhGYWJyaWNIdWJfUEksIGJhc2VzKSA6OlxuICAgIGNvbnN0IHtwYWNrZXRQYXJzZXJ9ID0gRmFicmljSHViX1BJLnByb3RvdHlwZVxuICAgIGlmIG51bGw9PXBhY2tldFBhcnNlciB8fCAhIHBhY2tldFBhcnNlci5pc1BhY2tldFBhcnNlcigpIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEludmFsaWQgcGFja2V0UGFyc2VyIGZvciBwbHVnaW5gXG4gICAgXG4gICAgRmFicmljSHViX1BJLnByb3RvdHlwZVtwbHVnaW5fbmFtZV0gPVxuICAgICAgYmluZEVuZHBvaW50QXBpIEAgcGFja2V0UGFyc2VyXG5cbiAgZnVuY3Rpb24gcG9zdChodWIpIDo6XG4gICAgcmV0dXJuIGh1YltwbHVnaW5fbmFtZV0gPSBodWJbcGx1Z2luX25hbWVdKGh1YilcblxuICBmdW5jdGlvbiBiaW5kRW5kcG9pbnRBcGkocGFja2V0UGFyc2VyKSA6OlxuICAgIGNvbnN0IHByb3RvY29scyA9IGluaXRfcHJvdG9jb2wgQCBwYWNrZXRQYXJzZXIsIEB7fSByYW5kb21faWQsIGpzb25fcGFja1xuXG4gICAgY29uc3Qge0VuZHBvaW50LCBFUFRhcmdldCwgU2luaywgTXNnQ3R4fSA9XG4gICAgICBwbHVnaW5fb3B0aW9ucy5zdWJjbGFzcyBAOlxuICAgICAgICBwcm90b2NvbHMsXG4gICAgICAgIFNpbms6IFNpbmtCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIE1zZ0N0eDogTXNnQ3R4QmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgICAgICBFbmRwb2ludDogRW5kcG9pbnRCYXNlLnN1YmNsYXNzKHtjcmVhdGVNYXB9KVxuICAgICAgICBFUFRhcmdldDogRVBUYXJnZXRCYXNlLnN1YmNsYXNzKHByb3RvY29scylcblxuICAgIHJldHVybiBmdW5jdGlvbihodWIpIDo6XG4gICAgICBjb25zdCByZXNvbHZlUm91dGVDaGFubmVsID0gaHViLmJpbmRSb3V0ZUNoYW5uZWwgQCBudWxsLCBjcmVhdGVDYWNoZU1hcCgpXG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAOiBjcmVhdGUsIHNlcnZlcjogZW5kcG9pbnQsIGNsaWVudCwgY2xpZW50RW5kcG9pbnRcblxuXG4gICAgICBmdW5jdGlvbiBlbmRwb2ludChvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCB0YXJnZXRzID0gaHViLnJvdXRlci50YXJnZXRzXG4gICAgICAgIGRvIHZhciBpZF90YXJnZXQgPSByYW5kb21faWQoKVxuICAgICAgICB3aGlsZSB0YXJnZXRzLmhhcyBAIGlkX3RhcmdldFxuICAgICAgICByZXR1cm4gY3JlYXRlIEAgaWRfdGFyZ2V0LCBvbl9pbml0XG5cbiAgICAgIGZ1bmN0aW9uIGNyZWF0ZShpZF90YXJnZXQsIG9uX2luaXQpIDo6XG4gICAgICAgIGNvbnN0IGZyb21faWQgPSBAe30gaWRfdGFyZ2V0LCBpZF9yb3V0ZXI6IGh1Yi5yb3V0ZXIuaWRfc2VsZlxuICAgICAgICBjb25zdCBtc2dfY3R4ID0gbmV3IE1zZ0N0eCBAIGZyb21faWQsIHJlc29sdmVSb3V0ZUNoYW5uZWxcbiAgICAgICAgY29uc3QgZXBfdGd0ID0gbmV3IEVQVGFyZ2V0KG1zZ19jdHguZnJvbV9pZClcbiAgICAgICAgY29uc3QgZXAgPSBuZXcgRW5kcG9pbnQobXNnX2N0eCwgZXBfdGd0KVxuXG4gICAgICAgIGNvbnN0IHJlYWR5ID0gUHJvbWlzZVxuICAgICAgICAgIC5yZXNvbHZlIEAgb25faW5pdChlcCwgaHViKVxuICAgICAgICAgIC50aGVuIEAgX2FmdGVyX2luaXRcblxuICAgICAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBlcF90Z3QsIEB7fVxuICAgICAgICAgIHJlYWR5OiBAe30gdmFsdWU6IHJlYWR5LnRoZW4gQCAoKSA9PiBlcF90Z3RcblxuXG4gICAgICAgIGZ1bmN0aW9uIF9hZnRlcl9pbml0KHRhcmdldCkgOjpcbiAgICAgICAgICBpZiBudWxsID09IHRhcmdldCA6OlxuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBlbmRwb2ludCBpbml0IHRvIHJldHVybiBhIGNsb3N1cmUgb3IgaW50ZXJmYWNlYFxuXG4gICAgICAgICAgY29uc3Qgb25fbXNnID0gKHRhcmdldC5vbl9tc2cgfHwgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0YXJnZXQgPyB0YXJnZXQgOiBkZWZhdWx0X29uX21zZykpLmJpbmQodGFyZ2V0KVxuICAgICAgICAgIGNvbnN0IG9uX3NlbmRfZXJyb3IgPSAodGFyZ2V0Lm9uX3NlbmRfZXJyb3IgfHwgZGVmYXVsdF9vbl9zZW5kX2Vycm9yKS5iaW5kKHRhcmdldCwgZXApXG4gICAgICAgICAgY29uc3Qgb25fcmVjdl9lcnJvciA9ICh0YXJnZXQub25fcmVjdl9lcnJvciB8fCBkZWZhdWx0X29uX3JlY3ZfZXJyb3IpLmJpbmQodGFyZ2V0LCBlcClcbiAgICAgICAgICBjb25zdCBvbl9zaHV0ZG93biA9ICh0YXJnZXQub25fc2h1dGRvd24gfHwgZGVmYXVsdF9vbl9zaHV0ZG93bikuYmluZCh0YXJnZXQsIGVwKVxuXG4gICAgICAgICAgcmVhZHkuY2F0Y2ggQCBvbl9zZW5kX2Vycm9yXG5cbiAgICAgICAgICBjb25zdCBqc29uX3VucGFjayA9IHRhcmdldC5qc29uX3VucGFja1xuICAgICAgICAgICAgPyB0YXJnZXQuanNvbl91bnBhY2suYmluZCh0YXJnZXQpXG4gICAgICAgICAgICA6IEVQVGFyZ2V0Lmpzb25VbnBhY2sobXNnX2N0eClcblxuICAgICAgICAgIGNvbnN0IHNpbmsgPSBuZXcgU2luayBAIGpzb25fdW5wYWNrXG4gICAgICAgICAgc2luay5yZWdpc3RlciBAIGVwLCBodWIsIGlkX3RhcmdldCxcbiAgICAgICAgICAgIEB7fSBvbl9tc2csIG9uX3JlY3ZfZXJyb3IsIG9uX3NodXRkb3duXG5cbiAgICAgICAgICByZXR1cm4gdGFyZ2V0Lm9uX3JlYWR5XG4gICAgICAgICAgICA/IHRhcmdldC5vbl9yZWFkeShlcCwgaHViKVxuICAgICAgICAgICAgOiB0YXJnZXRcblxuXG5cbiAgICAgIGZ1bmN0aW9uIGNsaWVudEVuZHBvaW50KG9uX3JlYWR5KSA6OlxuICAgICAgICBsZXQgZXBfdGd0LCBkb25lID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgICAgIGVwX3RndCA9IGVuZHBvaW50IEAgZXAgPT4gQDpcbiAgICAgICAgICAgIGFzeW5jIG9uX3JlYWR5KGVwLCBodWIpIDo6XG4gICAgICAgICAgICAgIHJlc29sdmUgQCBhd2FpdCBvbl9yZWFkeShlcCwgaHViKVxuICAgICAgICAgICAgICBlcC5zaHV0ZG93bigpXG5cbiAgICAgICAgICAgIG9uX3NodXRkb3duKGVwKSA6OiByZWplY3QoKVxuICAgICAgICAgICAgb25fc2VuZF9lcnJvcihlcCwgZXJyKSA6OiByZWplY3QoZXJyKVxuXG4gICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduIEAgZXBfdGd0LCBAe31cbiAgICAgICAgICB0aGVuKHksbikgOjogcmV0dXJuIGRvbmUudGhlbih5LG4pXG4gICAgICAgICAgY2F0Y2gobikgOjogcmV0dXJuIGRvbmUuY2F0Y2gobilcbiAgICAgICAgICBmaW5hbGx5KGNiKSA6OiByZXR1cm4gZG9uZS50aGVuKGNiLCBjYilcbiAgICAgICAgICBkb25lXG5cblxuICAgICAgZnVuY3Rpb24gY2xpZW50KC4uLmFyZ3MpIDo6XG4gICAgICAgIGlmIDEgPT09IGFyZ3MubGVuZ3RoICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBhcmdzWzBdIDo6XG4gICAgICAgICAgcmV0dXJuIGNsaWVudEVuZHBvaW50KGFyZ3NbMF0pXG5cbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IG5ldyBNc2dDdHggQCBudWxsLCByZXNvbHZlUm91dGVDaGFubmVsXG4gICAgICAgIHJldHVybiAwICE9PSBhcmdzLmxlbmd0aCA/IG1zZ19jdHgudG8oLi4uYXJncykgOiBtc2dfY3R4XG5cbiIsImltcG9ydCB7cmFuZG9tQnl0ZXN9IGZyb20gJ2NyeXB0bydcbmltcG9ydCBlbmRwb2ludF9wbHVnaW4gZnJvbSAnLi9wbHVnaW4uanN5J1xuXG5lbmRwb2ludF9ub2RlanMucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5mdW5jdGlvbiByYW5kb21faWQoKSA6OlxuICByZXR1cm4gcmFuZG9tQnl0ZXMoNCkucmVhZEludDMyTEUoKVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBlbmRwb2ludF9ub2RlanMocGx1Z2luX29wdGlvbnM9e30pIDo6XG4gIGlmIG51bGwgPT0gcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkIDo6XG4gICAgcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5cbiAgcmV0dXJuIGVuZHBvaW50X3BsdWdpbihwbHVnaW5fb3B0aW9ucylcblxuIl0sIm5hbWVzIjpbImxpdHRsZV9lbmRpYW4iLCJjX3NpbmdsZSIsImNfZGF0YWdyYW0iLCJjX2RpcmVjdCIsImNfbXVsdGlwYXJ0IiwiY19zdHJlYW1pbmciLCJfZXJyX21zZ2lkX3JlcXVpcmVkIiwiX2Vycl90b2tlbl9yZXF1aXJlZCIsImZybV9yb3V0aW5nIiwic2l6ZSIsImJpdHMiLCJtYXNrIiwib2JqIiwiZnJvbV9pZCIsImR2Iiwib2Zmc2V0Iiwic2V0SW50MzIiLCJpZF9yb3V0ZXIiLCJpZF90YXJnZXQiLCJ1bmRlZmluZWQiLCJnZXRJbnQzMiIsImZybV9yZXNwb25zZSIsIm1zZ2lkIiwiRXJyb3IiLCJzZXRJbnQxNiIsInNlcV9hY2siLCJhY2tfZmxhZ3MiLCJ0b2tlbiIsImdldEludDE2IiwiZnJtX2RhdGFncmFtIiwidHJhbnNwb3J0IiwiZnJtX2RpcmVjdCIsImZybV9tdWx0aXBhcnQiLCJzZXFfcG9zIiwic2VxIiwic2VxX2ZsYWdzIiwiZnJtX3N0cmVhbWluZyIsImJpbmRfc2VxX25leHQiLCJzZXFfb2Zmc2V0Iiwic2VxX25leHQiLCJmbGFncyIsImZpbiIsIk5hTiIsImNvbXBvc2VGcmFtaW5ncyIsImZybV9mcm9tIiwiZnJtX3Jlc3AiLCJmcm1fdHJhbnNwb3J0cyIsImxlbmd0aCIsImJ5Qml0cyIsInRfZnJvbSIsImZfdGVzdCIsInRfcmVzcCIsInQwIiwidDEiLCJ0MiIsInQzIiwibWFwIiwiZiIsInRlc3RCaXRzIiwiY2hvb3NlIiwibHN0IiwiVCIsImIiLCJvcCIsImZuX2tleSIsImZuX3RyYW4iLCJmbl9mcm9tIiwiZm5fcmVzcCIsImZybSIsImJpbmRBc3NlbWJsZWQiLCJmX3BhY2siLCJmX3VucGFjayIsInBhY2siLCJ1bnBhY2siLCJwa3RfdHlwZSIsInBrdF9vYmoiLCJUeXBlRXJyb3IiLCJ0eXBlIiwiRGF0YVZpZXciLCJBcnJheUJ1ZmZlciIsImhlYWRlciIsImJ1ZmZlciIsInNsaWNlIiwicGt0IiwiYnVmIiwiaGVhZGVyX2J1ZmZlciIsIlVpbnQ4QXJyYXkiLCJpbmZvIiwiX2JpbmRfaXRlcmFibGUiLCJidWZfY2xvbmUiLCJ0dGwiLCJuZXh0Iiwib3B0aW9ucyIsImRvbmUiLCJ2YWx1ZSIsInBhY2tldFBhcnNlciIsImZyYWdtZW50X3NpemUiLCJjb25jYXRCdWZmZXJzIiwicGFja1BhY2tldE9iaiIsInBhY2tfdXRmOCIsInVucGFja191dGY4IiwiTnVtYmVyIiwicmFuZG9tX2lkIiwianNvbl9wYWNrIiwiY3JlYXRlU3RyZWFtIiwicGFja2V0RnJhZ21lbnRzIiwiY3JlYXRlTXVsdGlwYXJ0Iiwic2luayIsInBhcnRzIiwiZmVlZCIsImJvZHlfYnVmZmVyIiwiaW5jbHVkZXMiLCJkZWxldGVTdGF0ZUZvciIsInJlcyIsInJlY3ZEYXRhIiwicnN0cmVhbSIsInN0YXRlIiwiZmVlZF9pbml0IiwiYXNfY29udGVudCIsImZlZWRfaWdub3JlIiwibXNnIiwianNvbl91bnBhY2siLCJib2R5X3V0ZjgiLCJyZWN2U3RyZWFtIiwicmVjdlN0cmVhbURhdGEiLCJiaW5kIiwiZXJyIiwib25fZXJyb3IiLCJmZWVkX2JvZHkiLCJvbl9pbml0IiwiZGF0YSIsIm9uX2RhdGEiLCJvbl9lbmQiLCJmZWVkX3NlcSIsIm5leHRfaGRyIiwiaSIsImxhc3RJbm5lciIsImJ5dGVMZW5ndGgiLCJpMCIsImJvZHkiLCJiaW5kVHJhbnNwb3J0SW1wbHMiLCJpbmJvdW5kIiwiaGlnaGJpdHMiLCJ0cmFuc3BvcnRzIiwib3V0Ym91bmQiLCJmcmFtaW5ncyIsImZyYW1lIiwiaW1wbCIsInRfcmVjdiIsInBhY2tfaGRyIiwicmVjdl9tc2ciLCJiaW5kVHJhbnNwb3J0cyIsInBhY2tCb2R5Iiwic3RyZWFtaW5nIiwic2VuZCIsInN0cmVhbSIsImJpbmRfc3RyZWFtIiwibW9kZSIsImNoYW4iLCJtc2VuZCIsIm1zZW5kX2J5dGVzIiwibXNlbmRfb2JqZWN0cyIsIm1zZW5kX2ltcGwiLCJvYmplY3QiLCJieXRlcyIsIndyaXRlIiwiZW5kIiwiY2h1bmsiLCJjaGVja19mbnMiLCJrZXlzIiwia2V5IiwianNvbl9wcm90b2NvbCIsInNoYXJlZCIsImRhdGFncmFtIiwiZGlyZWN0IiwicmVjdk1zZyIsInN0YXRlRm9yIiwiYm9keV9idWYiLCJ1bnBhY2tCb2R5IiwiYmluYXJ5X3Byb3RvY29sIiwiYXNCdWZmZXIiLCJwa3RfYnVmZmVyIiwiY29udHJvbF9wcm90b2NvbCIsImhpZ2giLCJwaW5nX2ZyYW1lIiwicG9uZ19mcmFtZSIsInBvbmdfdHlwZSIsInJlY3ZfcG9uZyIsInBpbmdfdHlwZSIsInJlY3ZfcGluZyIsInBpbmciLCJKU09OIiwic3RyaW5naWZ5IiwidHMwIiwiRGF0ZSIsInJvdXRlciIsImJvZHlfanNvbiIsInJlY3ZDdHJsIiwiX3NlbmRfcG9uZyIsInBrdF9waW5nIiwicl9pZCIsInRzMSIsImRpc3BhdGNoIiwiaW5pdF9wcm90b2NvbCIsInNoYXJlZF9wcm90byIsImpzb24iLCJqc29uX3Byb3RvIiwiYmluYXJ5IiwiYmluYXJ5X3Byb3RvIiwiY29udHJvbCIsImNvbnRyb2xfcHJvdG8iLCJjb2RlY3MiLCJkZWZhdWx0IiwiRVBUYXJnZXQiLCJzdWJjbGFzcyIsImV4dGVuc2lvbnMiLCJhc3NpZ24iLCJwcm90b3R5cGUiLCJpZCIsIm1zZ19jdHgiLCJtc2dfaW5mbyIsInByb3BzIiwiZW51bWVyYWJsZSIsInRvIiwiZmFzdF9qc29uIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydGllcyIsImVwX2VuY29kZSIsImpzb25fYXNfcmVwbHkiLCJmcm9tX2pzb24iLCJqc29uVW5wYWNrIiwieGZvcm1CeUtleSIsImNyZWF0ZSIsInYiLCJlcF9kZWNvZGUiLCJqc29uVW5wYWNrQnlLZXkiLCJyZWciLCJXZWFrTWFwIiwic3oiLCJwYXJzZSIsInJldml2ZXIiLCJ4Zm4iLCJzZXQiLCJ2Zm4iLCJnZXQiLCJiaW5kQ3R4UHJvcHMiLCJpbml0IiwiY3R4IiwicXVlcnkiLCJzaW1wbGUiLCJyIiwidCIsInRvU3RyaW5nIiwic3BsaXQiLCJwYXJzZUludCIsIkVuZHBvaW50IiwiZXBfdGd0Iiwid2l0aEVuZHBvaW50IiwiYXNSZXBseSIsImNvbnN0cnVjdG9yIiwidG9KU09OIiwiTWFwIiwiY3JlYXRlTWFwIiwiYnlfdG9rZW4iLCJjcmVhdGVSZXBseU1hcCIsImJ5X3RyYWZmaWMiLCJjcmVhdGVUcmFmZmljTWFwIiwidHJhZmZpYyIsInRzIiwibm93IiwicmVjdlRyYWZmaWMiLCJjcmVhdGVTdGF0ZU1hcCIsInJlcGx5Iiwicm1zZyIsInJlc29sdmUiLCJ0aGVuIiwiaXNfcmVwbHkiLCJ3YXJuIiwiaW5pdFJlcGx5IiwiaW5pdFJlcGx5UHJvbWlzZSIsIm1zX3RpbWVvdXQiLCJtb25pdG9yIiwicmVqZWN0IiwiYW5zIiwiUHJvbWlzZSIsInJlamVjdF8iLCJ0aW1lb3V0IiwiUmVwbHlUaW1lb3V0IiwidGlkIiwic2V0VGltZW91dCIsInVucmVmIiwiY2xlYXIiLCJjYXRjaCIsInNlbnQiLCJTaW5rIiwiZm9yUHJvdG9jb2xzIiwiX3Byb3RvY29sIiwiZW5kcG9pbnQiLCJodWIiLCJoYW5kbGVycyIsInVucmVnaXN0ZXIiLCJ1bnJlZ2lzdGVyVGFyZ2V0IiwicmVnaXN0ZXJUYXJnZXQiLCJfYmluZERpc3BhdGNoIiwib25fbXNnIiwib25fc2h1dGRvd24iLCJhbGl2ZSIsInByb3RvY29sIiwiaXNBbGl2ZSIsInNodXRkb3duIiwiZXh0cmEiLCJiaW5kU2luayIsInpvbmUiLCJ0ZXJtaW5hdGUiLCJpZkFic2VudCIsImVudHJ5IiwiYnlfbXNnaWQiLCJkZWxldGUiLCJNc2dDdHgiLCJ3aXRoQ29kZWNzIiwiZnJvbSIsInJlc29sdmVSb3V0ZUNoYW5uZWwiLCJmcmVlemUiLCJfaW52b2tlX2V4IiwiX21zZ0NvZGVjcyIsImFyZ3MiLCJfY29kZWMiLCJmbk9yS2V5IiwiaW52b2tlIiwiYXNzZXJ0TW9uaXRvciIsInRndCIsInNlbGYiLCJjbG9uZSIsInJlcGx5X2lkIiwid2l0aCIsIl9yb290XyIsImNoZWNrTW9uaXRvciIsImFjdGl2ZSIsImluaXRNb25pdG9yIiwidHNfZHVyYXRpb24iLCJ0c19hY3RpdmUiLCJwcm9taXNlIiwidGQiLCJ0c19pbnRlcnZhbCIsImN0cmwiLCJjb2RlYyIsImNoZWNrUGluZyIsInNldEludGVydmFsIiwiY2xlYXJJbnRlcnZhbCIsIm1zZ19jb2RlYyIsIm1zZ0NvZGVjcyIsIm5hbWUiLCJlbnRyaWVzIiwianNvbl9zZW5kIiwiZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyIsImVwIiwiZXJyb3IiLCJtZXNzYWdlIiwiY2xhc3NlcyIsImNyZWF0ZUNhY2hlTWFwIiwicGx1Z2luX29wdGlvbnMiLCJkZWZhdWx0X29uX21zZyIsImRlZmF1bHRfb25fc2VuZF9lcnJvciIsImRlZmF1bHRfb25fcmVjdl9lcnJvciIsImRlZmF1bHRfb25fc2h1dGRvd24iLCJvcmRlciIsInBvc3QiLCJGYWJyaWNIdWJfUEkiLCJiYXNlcyIsImlzUGFja2V0UGFyc2VyIiwicGx1Z2luX25hbWUiLCJiaW5kRW5kcG9pbnRBcGkiLCJwcm90b2NvbHMiLCJTaW5rQmFzZSIsIk1zZ0N0eEJhc2UiLCJFbmRwb2ludEJhc2UiLCJFUFRhcmdldEJhc2UiLCJiaW5kUm91dGVDaGFubmVsIiwic2VydmVyIiwiY2xpZW50IiwiY2xpZW50RW5kcG9pbnQiLCJ0YXJnZXRzIiwiaGFzIiwiaWRfc2VsZiIsInJlYWR5IiwiX2FmdGVyX2luaXQiLCJ0YXJnZXQiLCJvbl9zZW5kX2Vycm9yIiwib25fcmVjdl9lcnJvciIsInJlZ2lzdGVyIiwib25fcmVhZHkiLCJ5IiwibiIsImNiIiwiZW5kcG9pbnRfbm9kZWpzIiwicmFuZG9tQnl0ZXMiLCJyZWFkSW50MzJMRSIsImVuZHBvaW50X3BsdWdpbiJdLCJtYXBwaW5ncyI6Ijs7OztBQUFBLE1BQU1BLGdCQUFnQixJQUF0QjtBQUNBLE1BQU1DLFdBQVcsUUFBakI7QUFDQSxNQUFNQyxhQUFhLFVBQW5CO0FBQ0EsTUFBTUMsV0FBVyxRQUFqQjtBQUNBLE1BQU1DLGNBQWMsV0FBcEI7QUFDQSxNQUFNQyxjQUFjLFdBQXBCOztBQUVBLE1BQU1DLHNCQUF1QiwwQkFBN0I7QUFDQSxNQUFNQyxzQkFBdUIsMkJBQTdCOztBQUdBLFNBQVNDLFdBQVQsR0FBdUI7UUFDZkMsT0FBTyxDQUFiO1FBQWdCQyxPQUFPLEdBQXZC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

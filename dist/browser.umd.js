(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global['msg-fabric-sink'] = factory());
}(this, (function () { 'use strict';

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3Nlci51bWQuanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvcHJvdG9jb2wvZnJhbWluZy5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL3NoYXJlZC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2pzb24uanN5IiwiLi4vY29kZS9wcm90b2NvbC9iaW5hcnkuanN5IiwiLi4vY29kZS9wcm90b2NvbC9jb250cm9sLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvaW5kZXguanN5IiwiLi4vY29kZS9lcF90YXJnZXQuanN5IiwiLi4vY29kZS9lbmRwb2ludC5qc3kiLCIuLi9jb2RlL3NpbmsuanN5IiwiLi4vY29kZS9tc2djdHguanN5IiwiLi4vY29kZS9wbHVnaW4uanN5IiwiLi4vY29kZS9pbmRleC5icm93c2VyLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBsaXR0bGVfZW5kaWFuID0gdHJ1ZVxuY29uc3QgY19zaW5nbGUgPSAnc2luZ2xlJ1xuY29uc3QgY19kYXRhZ3JhbSA9ICdkYXRhZ3JhbSdcbmNvbnN0IGNfZGlyZWN0ID0gJ2RpcmVjdCdcbmNvbnN0IGNfbXVsdGlwYXJ0ID0gJ211bHRpcGFydCdcbmNvbnN0IGNfc3RyZWFtaW5nID0gJ3N0cmVhbWluZydcblxuY29uc3QgX2Vycl9tc2dpZF9yZXF1aXJlZCA9IGBSZXNwb25zZSByZXFpcmVzICdtc2dpZCdgXG5jb25zdCBfZXJyX3Rva2VuX3JlcXVpcmVkID0gYFRyYW5zcG9ydCByZXFpcmVzICd0b2tlbidgXG5cblxuZnVuY3Rpb24gZnJtX3JvdXRpbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MSwgbWFzayA9IDB4MVxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLmZyb21faWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCB7ZnJvbV9pZH0gPSBvYmpcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF9yb3V0ZXIsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDMyIEAgNCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF90YXJnZXQsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IGZyb21faWQgPSB1bmRlZmluZWQgPT09IG9iai5mcm9tX2lkXG4gICAgICAgID8gb2JqLmZyb21faWQgPSB7fSA6IG9iai5mcm9tX2lkXG4gICAgICBmcm9tX2lkLmlkX3JvdXRlciA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGZyb21faWQuaWRfdGFyZ2V0ID0gZHYuZ2V0SW50MzIgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5mdW5jdGlvbiBmcm1fcmVzcG9uc2UoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MiwgbWFzayA9IDB4MlxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLm1zZ2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoubXNnaWQgOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl9tc2dpZF9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLm1zZ2lkLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXFfYWNrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5hY2tfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50b2tlbiA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfYWNrID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLmFja19mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuXG5cbmZ1bmN0aW9uIGZybV9kYXRhZ3JhbSgpIDo6XG4gIGNvbnN0IHNpemUgPSAwLCBiaXRzID0gMHgwLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RhdGFncmFtXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGF0YWdyYW0gPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kYXRhZ3JhbVxuXG5mdW5jdGlvbiBmcm1fZGlyZWN0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDQsIGJpdHMgPSAweDQsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGlyZWN0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGlyZWN0ID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGlyZWN0XG5cbmZ1bmN0aW9uIGZybV9tdWx0aXBhcnQoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4OCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19tdWx0aXBhcnRcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19tdWx0aXBhcnQgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjogLy8gdXNlIHNlcV9uZXh0XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX211bHRpcGFydFxuXG5mdW5jdGlvbiBmcm1fc3RyZWFtaW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweGMsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfc3RyZWFtaW5nXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfc3RyZWFtaW5nID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW4gLy8gdXNlIHNlcV9uZXh0XG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19zdHJlYW1pbmdcblxuXG5mdW5jdGlvbiBiaW5kX3NlcV9uZXh0KG9mZnNldCkgOjpcbiAgY29uc3Qgc2VxX29mZnNldCA9IHRoaXMuc2VxX3BvcyArIG9mZnNldFxuICBsZXQgc2VxID0gMVxuICByZXR1cm4gZnVuY3Rpb24gc2VxX25leHQoe2ZsYWdzLCBmaW59LCBkdikgOjpcbiAgICBpZiAhIGZpbiA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCBzZXErKywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICBlbHNlIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIC1zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgICBzZXEgPSBOYU5cblxuXG5cbmV4cG9ydCBkZWZhdWx0IGNvbXBvc2VGcmFtaW5ncygpXG5mdW5jdGlvbiBjb21wb3NlRnJhbWluZ3MoKSA6OlxuICBjb25zdCBmcm1fZnJvbSA9IGZybV9yb3V0aW5nKCksIGZybV9yZXNwID0gZnJtX3Jlc3BvbnNlKClcbiAgY29uc3QgZnJtX3RyYW5zcG9ydHMgPSBAW10gZnJtX2RhdGFncmFtKCksIGZybV9kaXJlY3QoKSwgZnJtX211bHRpcGFydCgpLCBmcm1fc3RyZWFtaW5nKClcblxuICBpZiA4ICE9PSBmcm1fZnJvbS5zaXplIHx8IDggIT09IGZybV9yZXNwLnNpemUgfHwgNCAhPSBmcm1fdHJhbnNwb3J0cy5sZW5ndGggOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgRnJhbWluZyBTaXplIGNoYW5nZWBcblxuICBjb25zdCBieUJpdHMgPSBbXSwgbWFzaz0weGZcblxuICA6OlxuICAgIGNvbnN0IHRfZnJvbSA9IGZybV9mcm9tLmZfdGVzdCwgdF9yZXNwID0gZnJtX3Jlc3AuZl90ZXN0XG4gICAgY29uc3QgW3QwLHQxLHQyLHQzXSA9IGZybV90cmFuc3BvcnRzLm1hcCBAIGY9PmYuZl90ZXN0XG5cbiAgICBjb25zdCB0ZXN0Qml0cyA9IGJ5Qml0cy50ZXN0Qml0cyA9IG9iaiA9PlxuICAgICAgMCB8IHRfZnJvbShvYmopIHwgdF9yZXNwKG9iaikgfCB0MChvYmopIHwgdDEob2JqKSB8IHQyKG9iaikgfCB0MyhvYmopXG5cbiAgICBieUJpdHMuY2hvb3NlID0gZnVuY3Rpb24gKG9iaiwgbHN0KSA6OlxuICAgICAgaWYgbnVsbCA9PSBsc3QgOjogbHN0ID0gdGhpcyB8fCBieUJpdHNcbiAgICAgIHJldHVybiBsc3RbdGVzdEJpdHMob2JqKV1cblxuXG4gIGZvciBjb25zdCBUIG9mIGZybV90cmFuc3BvcnRzIDo6XG4gICAgY29uc3Qge2JpdHM6Yiwgc2l6ZSwgdHJhbnNwb3J0fSA9IFRcblxuICAgIGJ5Qml0c1tifDBdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwwLCBtYXNrLCBzaXplOiBzaXplLCBvcDogJydcbiAgICBieUJpdHNbYnwxXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MSwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAnZidcbiAgICBieUJpdHNbYnwyXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MiwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAncidcbiAgICBieUJpdHNbYnwzXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MywgbWFzaywgc2l6ZTogMTYgKyBzaXplLCBvcDogJ2ZyJ1xuXG4gICAgZm9yIGNvbnN0IGZuX2tleSBvZiBbJ2ZfcGFjaycsICdmX3VucGFjayddIDo6XG4gICAgICBjb25zdCBmbl90cmFuID0gVFtmbl9rZXldLCBmbl9mcm9tID0gZnJtX2Zyb21bZm5fa2V5XSwgZm5fcmVzcCA9IGZybV9yZXNwW2ZuX2tleV1cblxuICAgICAgYnlCaXRzW2J8MF1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3RyYW4ob2JqLCBkdiwgMClcbiAgICAgIGJ5Qml0c1tifDFdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwyXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fcmVzcChvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8M11bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3Jlc3Aob2JqLCBkdiwgOCk7IGZuX3RyYW4ob2JqLCBkdiwgMTYpXG5cbiAgZm9yIGNvbnN0IGZybSBvZiBieUJpdHMgOjpcbiAgICBiaW5kQXNzZW1ibGVkIEAgZnJtXG5cbiAgcmV0dXJuIGJ5Qml0c1xuXG5cbmZ1bmN0aW9uIGJpbmRBc3NlbWJsZWQoZnJtKSA6OlxuICBjb25zdCB7VCwgc2l6ZSwgZl9wYWNrLCBmX3VucGFja30gPSBmcm1cbiAgaWYgVC5iaW5kX3NlcV9uZXh0IDo6XG4gICAgZnJtLnNlcV9uZXh0ID0gVC5iaW5kX3NlcV9uZXh0IEAgZnJtLnNpemUgLSBULnNpemVcblxuICBkZWxldGUgZnJtLlRcbiAgZnJtLnBhY2sgPSBwYWNrIDsgZnJtLnVucGFjayA9IHVucGFja1xuICBjb25zdCBzZXFfbmV4dCA9IGZybS5zZXFfbmV4dFxuXG4gIGZ1bmN0aW9uIHBhY2socGt0X3R5cGUsIHBrdF9vYmopIDo6XG4gICAgaWYgISBAIDAgPD0gcGt0X3R5cGUgJiYgcGt0X3R5cGUgPD0gMjU1IDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBrdF90eXBlIHRvIGJlIFswLi4yNTVdYFxuXG4gICAgcGt0X29iai50eXBlID0gcGt0X3R5cGVcbiAgICBpZiBzZXFfbmV4dCAmJiBudWxsID09IHBrdF9vYmouc2VxIDo6XG4gICAgICBwa3Rfb2JqLnNlcSA9IHRydWVcblxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IEFycmF5QnVmZmVyKHNpemUpXG4gICAgZl9wYWNrKHBrdF9vYmosIGR2LCAwKVxuICAgIHBrdF9vYmouaGVhZGVyID0gZHYuYnVmZmVyXG5cbiAgICBpZiB0cnVlID09PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgX2JpbmRfaXRlcmFibGUgQCBwa3Rfb2JqLCBkdi5idWZmZXIuc2xpY2UoMCxzaXplKVxuXG4gIGZ1bmN0aW9uIHVucGFjayhwa3QpIDo6XG4gICAgY29uc3QgYnVmID0gcGt0LmhlYWRlcl9idWZmZXIoKVxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IFVpbnQ4QXJyYXkoYnVmKS5idWZmZXJcblxuICAgIGNvbnN0IGluZm8gPSB7fVxuICAgIGZfdW5wYWNrKGluZm8sIGR2LCAwKVxuICAgIHJldHVybiBwa3QuaW5mbyA9IGluZm9cblxuICBmdW5jdGlvbiBfYmluZF9pdGVyYWJsZShwa3Rfb2JqLCBidWZfY2xvbmUpIDo6XG4gICAgY29uc3Qge3R5cGV9ID0gcGt0X29ialxuICAgIGNvbnN0IHtpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHRsLCB0b2tlbn0gPSBwa3Rfb2JqXG4gICAgcGt0X29iai5uZXh0ID0gbmV4dFxuXG4gICAgZnVuY3Rpb24gbmV4dChvcHRpb25zKSA6OlxuICAgICAgaWYgbnVsbCA9PSBvcHRpb25zIDo6IG9wdGlvbnMgPSB7fVxuICAgICAgY29uc3QgaGVhZGVyID0gYnVmX2Nsb25lLnNsaWNlKClcbiAgICAgIHNlcV9uZXh0IEAgb3B0aW9ucywgbmV3IERhdGFWaWV3IEAgaGVhZGVyXG4gICAgICByZXR1cm4gQHt9IGRvbmU6ICEhIG9wdGlvbnMuZmluLCB2YWx1ZTogQHt9IC8vIHBrdF9vYmpcbiAgICAgICAgaWRfcm91dGVyLCBpZF90YXJnZXQsIHR5cGUsIHR0bCwgdG9rZW4sIGhlYWRlclxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGFja2V0UGFyc2VyLCBvcHRpb25zLCBmcmFnbWVudF9zaXplKSA6OlxuICBjb25zdCB7Y29uY2F0QnVmZmVycywgcGFja1BhY2tldE9iaiwgcGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBwYWNrZXRQYXJzZXJcbiAgZnJhZ21lbnRfc2l6ZSA9IE51bWJlcihmcmFnbWVudF9zaXplIHx8IDgwMDApXG4gIGlmIDEwMjQgPiBmcmFnbWVudF9zaXplIHx8IDY1MDAwIDwgZnJhZ21lbnRfc2l6ZSA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIGZyYWdtZW50IHNpemU6ICR7ZnJhZ21lbnRfc2l6ZX1gXG5cbiAgY29uc3Qge3JhbmRvbV9pZCwganNvbl9wYWNrfSA9IG9wdGlvbnNcbiAgcmV0dXJuIEA6IHBhY2tldFBhcnNlciwgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwgcGFja2V0RnJhZ21lbnRzXG4gICAgYmluZFRyYW5zcG9ydHNcblxuXG4gIGZ1bmN0aW9uIGNyZWF0ZU11bHRpcGFydChwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBwYXJ0cyA9IFtdLCBmaW4gPSBmYWxzZVxuICAgIHJldHVybiBAe30gZmVlZCwgaW5mbzogcGt0LmluZm9cblxuICAgIGZ1bmN0aW9uIGZlZWQocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxIDwgMCA6OiBmaW4gPSB0cnVlOyBzZXEgPSAtc2VxXG4gICAgICBwYXJ0c1tzZXEtMV0gPSBwa3QuYm9keV9idWZmZXIoKVxuXG4gICAgICBpZiAhIGZpbiA6OiByZXR1cm5cbiAgICAgIGlmIHBhcnRzLmluY2x1ZGVzIEAgdW5kZWZpbmVkIDo6IHJldHVyblxuXG4gICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuXG4gICAgICBjb25zdCByZXMgPSBjb25jYXRCdWZmZXJzKHBhcnRzKVxuICAgICAgcGFydHMgPSBudWxsXG4gICAgICByZXR1cm4gcmVzXG5cbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtKHBrdCwgc2luaywgbXNnaWQpIDo6XG4gICAgbGV0IG5leHQ9MCwgZmluID0gZmFsc2UsIHJlY3ZEYXRhLCByc3RyZWFtXG4gICAgY29uc3Qgc3RhdGUgPSBAe30gZmVlZDogZmVlZF9pbml0LCBpbmZvOiBwa3QuaW5mb1xuICAgIHJldHVybiBzdGF0ZVxuXG4gICAgZnVuY3Rpb24gZmVlZF9pbml0KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuXG4gICAgICBjb25zdCBpbmZvID0gcGt0LmluZm9cbiAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiAgICAgIHJzdHJlYW0gPSBzaW5rLnJlY3ZTdHJlYW0obXNnLCBpbmZvKVxuICAgICAgaWYgbnVsbCA9PSByc3RyZWFtIDo6IHJldHVyblxuICAgICAgY2hlY2tfZm5zIEAgcnN0cmVhbSwgJ29uX2Vycm9yJywgJ29uX2RhdGEnLCAnb25fZW5kJyBcbiAgICAgIHJlY3ZEYXRhID0gc2luay5yZWN2U3RyZWFtRGF0YS5iaW5kKHNpbmssIHJzdHJlYW0sIGluZm8pXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9ib2R5XG4gICAgICBpZiByc3RyZWFtLm9uX2luaXQgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25faW5pdChtc2csIHBrdClcblxuICAgIGZ1bmN0aW9uIGZlZWRfYm9keShwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICByZWN2RGF0YSgpXG4gICAgICBsZXQgZGF0YVxuICAgICAgdHJ5IDo6XG4gICAgICAgIGZlZWRfc2VxKHBrdClcbiAgICAgICAgZGF0YSA9IGFzX2NvbnRlbnQocGt0LCBzaW5rKVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgaWYgZmluIDo6XG4gICAgICAgIGNvbnN0IHJlcyA9IHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lbmQgQCByZXMsIHBrdFxuICAgICAgZWxzZSA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9kYXRhIEAgZGF0YSwgcGt0XG5cbiAgICBmdW5jdGlvbiBmZWVkX2lnbm9yZShwa3QpIDo6XG4gICAgICB0cnkgOjogZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG5cbiAgICBmdW5jdGlvbiBmZWVkX3NlcShwa3QpIDo6XG4gICAgICBsZXQgc2VxID0gcGt0LmluZm8uc2VxXG4gICAgICBpZiBzZXEgPj0gMCA6OlxuICAgICAgICBpZiBuZXh0KysgPT09IHNlcSA6OlxuICAgICAgICAgIHJldHVybiAvLyBpbiBvcmRlclxuICAgICAgZWxzZSA6OlxuICAgICAgICBmaW4gPSB0cnVlXG4gICAgICAgIHNpbmsuZGVsZXRlU3RhdGVGb3IobXNnaWQpXG4gICAgICAgIGlmIG5leHQgPT09IC1zZXEgOjpcbiAgICAgICAgICBuZXh0ID0gJ2RvbmUnXG4gICAgICAgICAgcmV0dXJuIC8vIGluLW9yZGVyLCBsYXN0IHBhY2tldFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcbiAgICAgIG5leHQgPSAnaW52YWxpZCdcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYWNrZXQgb3V0IG9mIHNlcXVlbmNlYFxuXG4gIGZ1bmN0aW9uICogcGFja2V0RnJhZ21lbnRzKGJ1ZiwgbmV4dF9oZHIsIGZpbikgOjpcbiAgICBpZiBudWxsID09IGJ1ZiA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICB5aWVsZCBvYmpcbiAgICAgIHJldHVyblxuXG4gICAgbGV0IGkgPSAwLCBsYXN0SW5uZXIgPSBidWYuYnl0ZUxlbmd0aCAtIGZyYWdtZW50X3NpemU7XG4gICAgd2hpbGUgaSA8IGxhc3RJbm5lciA6OlxuICAgICAgY29uc3QgaTAgPSBpXG4gICAgICBpICs9IGZyYWdtZW50X3NpemVcblxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoKVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaTAsIGkpXG4gICAgICB5aWVsZCBvYmpcblxuICAgIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkpXG4gICAgICB5aWVsZCBvYmpcblxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IG91dGJvdW5kID0gW11cbiAgICBvdXRib3VuZC5jaG9vc2UgPSBmcmFtaW5ncy5jaG9vc2VcblxuICAgIGZvciBjb25zdCBmcmFtZSBvZiBmcmFtaW5ncyA6OlxuICAgICAgY29uc3QgaW1wbCA9IGZyYW1lID8gdHJhbnNwb3J0c1tmcmFtZS50cmFuc3BvcnRdIDogbnVsbFxuICAgICAgaWYgISBpbXBsIDo6IGNvbnRpbnVlXG5cbiAgICAgIGNvbnN0IHtiaXRzLCBwYWNrLCB1bnBhY2t9ID0gZnJhbWVcbiAgICAgIGNvbnN0IHBrdF90eXBlID0gaGlnaGJpdHMgfCBiaXRzXG4gICAgICBjb25zdCB7dF9yZWN2fSA9IGltcGxcblxuICAgICAgZnVuY3Rpb24gcGFja19oZHIob2JqKSA6OlxuICAgICAgICBwYWNrKHBrdF90eXBlLCBvYmopXG4gICAgICAgIHJldHVybiBvYmpcblxuICAgICAgZnVuY3Rpb24gcmVjdl9tc2cocGt0LCBzaW5rKSA6OlxuICAgICAgICB1bnBhY2socGt0KVxuICAgICAgICByZXR1cm4gdF9yZWN2KHBrdCwgc2luaylcblxuICAgICAgcGFja19oZHIucGt0X3R5cGUgPSByZWN2X21zZy5wa3RfdHlwZSA9IHBrdF90eXBlXG4gICAgICBvdXRib3VuZFtiaXRzXSA9IHBhY2tfaGRyXG4gICAgICBpbmJvdW5kW3BrdF90eXBlXSA9IHJlY3ZfbXNnXG5cbiAgICAgIGlmICdwcm9kdWN0aW9uJyAhPT0gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgOjpcbiAgICAgICAgY29uc3Qgb3AgPSBwYWNrX2hkci5vcCA9IHJlY3ZfbXNnLm9wID0gZnJhbWUub3BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcGFja19oZHIsICduYW1lJywgQHt9IHZhbHVlOiBgcGFja19oZHIgwqske29wfcK7YFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCByZWN2X21zZywgJ25hbWUnLCBAe30gdmFsdWU6IGByZWN2X21zZyDCqyR7b3B9wrtgXG5cbiAgICByZXR1cm4gb3V0Ym91bmRcblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IHBhY2tCb2R5ID0gdHJhbnNwb3J0cy5wYWNrQm9keVxuICAgIGNvbnN0IG91dGJvdW5kID0gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKVxuICAgIHJldHVybiB0cmFuc3BvcnRzLnN0cmVhbWluZ1xuICAgICAgPyBAe30gc2VuZCwgc3RyZWFtOiBiaW5kX3N0cmVhbSBAIHRyYW5zcG9ydHMuc3RyZWFtaW5nLm1vZGVcbiAgICAgIDogQHt9IHNlbmRcblxuICAgIGZ1bmN0aW9uIHNlbmQoY2hhbiwgb2JqLCBib2R5KSA6OlxuICAgICAgYm9keSA9IHBhY2tCb2R5KGJvZHkpXG4gICAgICBpZiBmcmFnbWVudF9zaXplIDwgYm9keS5ieXRlTGVuZ3RoIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIG9iai50cmFuc3BvcnQgPSAnbXVsdGlwYXJ0J1xuICAgICAgICBjb25zdCBtc2VuZCA9IG1zZW5kX2J5dGVzKGNoYW4sIG9iailcbiAgICAgICAgcmV0dXJuIG1zZW5kIEAgdHJ1ZSwgYm9keVxuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gJ3NpbmdsZSdcbiAgICAgIG9iai5ib2R5ID0gYm9keVxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIHBhY2tfaGRyKG9iailcbiAgICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgICBmdW5jdGlvbiBtc2VuZF9ieXRlcyhjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGxldCB7bmV4dH0gPSBwYWNrX2hkcihvYmopXG4gICAgICBpZiBudWxsICE9PSBtc2cgOjpcbiAgICAgICAgb2JqLmJvZHkgPSBtc2dcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBjaGFuIEAgcGt0XG5cbiAgICAgIHJldHVybiBhc3luYyBmdW5jdGlvbiAoZmluLCBib2R5KSA6OlxuICAgICAgICBpZiBudWxsID09PSBuZXh0IDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgJ1dyaXRlIGFmdGVyIGVuZCdcbiAgICAgICAgbGV0IHJlc1xuICAgICAgICBmb3IgY29uc3Qgb2JqIG9mIHBhY2tldEZyYWdtZW50cyBAIGJvZHksIG5leHQsIGZpbiA6OlxuICAgICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgICByZXMgPSBhd2FpdCBjaGFuIEAgcGt0XG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gcmVzXG5cbiAgICBmdW5jdGlvbiBtc2VuZF9vYmplY3RzKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBjb25zdCBvYmogPSBuZXh0KHtmaW59KVxuICAgICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIGJpbmRfc3RyZWFtKG1vZGUpIDo6XG4gICAgICBjb25zdCBtc2VuZF9pbXBsID0ge29iamVjdDogbXNlbmRfb2JqZWN0cywgYnl0ZXM6IG1zZW5kX2J5dGVzfVttb2RlXVxuICAgICAgaWYgbXNlbmRfaW1wbCA6OiByZXR1cm4gc3RyZWFtXG5cbiAgICAgIGZ1bmN0aW9uIHN0cmVhbShjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgICAgaWYgISBvYmoudG9rZW4gOjogb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzdHJlYW1pbmcnXG4gICAgICAgIGNvbnN0IG1zZW5kID0gbXNlbmRfaW1wbCBAIGNoYW4sIG9iaiwganNvbl9wYWNrKG1zZylcbiAgICAgICAgd3JpdGUud3JpdGUgPSB3cml0ZTsgd3JpdGUuZW5kID0gd3JpdGUuYmluZCh0cnVlKVxuICAgICAgICByZXR1cm4gd3JpdGVcblxuICAgICAgICBmdW5jdGlvbiB3cml0ZShjaHVuaykgOjpcbiAgICAgICAgICByZXR1cm4gY2h1bmsgIT0gbnVsbFxuICAgICAgICAgICAgPyBtc2VuZCBAIHRydWU9PT10aGlzLCBwYWNrQm9keShjaHVuaylcbiAgICAgICAgICAgIDogbXNlbmQgQCB0cnVlXG5cblxuZnVuY3Rpb24gY2hlY2tfZm5zKG9iaiwgLi4ua2V5cykgOjpcbiAgZm9yIGNvbnN0IGtleSBvZiBrZXlzIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG9ialtrZXldIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIFwiJHtrZXl9XCIgdG8gYmUgYSBmdW5jdGlvbmBcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGpzb25fcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIGpzb25fcGFja30gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keVxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KCkgfHwgdW5kZWZpbmVkXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgYm9keV9idWYgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBib2R5X2J1ZiA6OlxuICAgICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCB1bnBhY2tfdXRmOChib2R5X2J1ZikgfHwgdW5kZWZpbmVkXG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdvYmplY3QnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICByZXR1cm4gc3RhdGUuZmVlZChwa3QsIHVucGFja0JvZHkpXG5cbiAgZnVuY3Rpb24gcGFja0JvZHkoYm9keSkgOjpcbiAgICByZXR1cm4gcGFja191dGY4IEAganNvbl9wYWNrKGJvZHkpXG5cbiAgZnVuY3Rpb24gdW5wYWNrQm9keShwa3QsIHNpbmspIDo6XG4gICAgcmV0dXJuIHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGJpbmFyeV9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbX0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICBjb25zdCB7YXNCdWZmZXJ9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICByZXR1cm4gQHt9XG4gICAgcGFja0JvZHk6IGFzQnVmZmVyXG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0gcGt0LmJvZHlfYnVmZmVyKClcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBtc2cgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2cgOjpcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ2J5dGVzJ1xuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVTdHJlYW1cbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QsIHBrdF9idWZmZXIpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG5mdW5jdGlvbiBwa3RfYnVmZmVyKHBrdCkgOjogcmV0dXJuIHBrdC5ib2R5X2J1ZmZlcigpXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBjb250cm9sX3Byb3RvY29sKGluYm91bmQsIGhpZ2gsIHNoYXJlZCkgOjpcbiAgY29uc3Qge3JhbmRvbV9pZH0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tQYWNrZXRPYmp9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIGNvbnN0IHBpbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgdG9rZW46IHRydWUsIHRyYW5zcG9ydDogJ2RpcmVjdCdcbiAgY29uc3QgcG9uZ19mcmFtZSA9IGZyYW1pbmdzLmNob29zZSBAOiBmcm9tX2lkOiB0cnVlLCBtc2dpZDogdHJ1ZSwgdHJhbnNwb3J0OiAnZGF0YWdyYW0nXG5cbiAgY29uc3QgcG9uZ190eXBlID0gaGlnaHwweGVcbiAgaW5ib3VuZFtwb25nX3R5cGVdID0gcmVjdl9wb25nXG4gIGNvbnN0IHBpbmdfdHlwZSA9IGhpZ2h8MHhmXG4gIGluYm91bmRbaGlnaHwweGZdID0gcmVjdl9waW5nXG5cbiAgcmV0dXJuIEB7fSBzZW5kOnBpbmcsIHBpbmdcblxuICBmdW5jdGlvbiBwaW5nKGNoYW4sIG9iaikgOjpcbiAgICBpZiAhIG9iai50b2tlbiA6OlxuICAgICAgb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICBvYmouYm9keSA9IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICBvcDogJ3BpbmcnLCB0czA6IG5ldyBEYXRlKClcbiAgICBwaW5nX2ZyYW1lLnBhY2socGluZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgZnVuY3Rpb24gcmVjdl9waW5nKHBrdCwgc2luaywgcm91dGVyKSA6OlxuICAgIHBpbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIF9zZW5kX3BvbmcgQCBwa3QuYm9keSwgcGt0LCBzaW5rLCByb3V0ZXJcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiAgZnVuY3Rpb24gX3NlbmRfcG9uZyh7dHMwfSwgcGt0X3BpbmcsIHNpbmssIHJvdXRlcikgOjpcbiAgICBjb25zdCB7bXNnaWQsIGZyb21faWQ6cl9pZH0gPSBwa3RfcGluZy5pbmZvXG4gICAgY29uc3Qge2lkX3JvdXRlciwgaWRfdGFyZ2V0fSA9IHJfaWRcbiAgICBjb25zdCBvYmogPSBAe30gaWRfcm91dGVyLCBpZF90YXJnZXRcbiAgICAgIGZyb21faWQ6IHNpbmsuZnJvbV9pZCwgbXNnaWRcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICAgIG9wOiAncG9uZycsIHRzMCwgdHMxOiBuZXcgRGF0ZSgpXG5cbiAgICBwb25nX2ZyYW1lLnBhY2socG9uZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiByb3V0ZXIuZGlzcGF0Y2ggQCBbcGt0XVxuXG4gIGZ1bmN0aW9uIHJlY3ZfcG9uZyhwa3QsIHNpbmspIDo6XG4gICAgcG9uZ19mcmFtZS51bnBhY2socGt0KVxuICAgIHBrdC5ib2R5ID0gcGt0LmJvZHlfanNvbigpXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcbmltcG9ydCBzaGFyZWRfcHJvdG8gZnJvbSAnLi9zaGFyZWQuanN5J1xuaW1wb3J0IGpzb25fcHJvdG8gZnJvbSAnLi9qc29uLmpzeSdcbmltcG9ydCBiaW5hcnlfcHJvdG8gZnJvbSAnLi9iaW5hcnkuanN5J1xuaW1wb3J0IGNvbnRyb2xfcHJvdG8gZnJvbSAnLi9jb250cm9sLmpzeSdcblxuZXhwb3J0ICogZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gaW5pdF9wcm90b2NvbChwYWNrZXRQYXJzZXIsIG9wdGlvbnMpIDo6XG4gIGNvbnN0IHNoYXJlZCA9IHNoYXJlZF9wcm90byBAIHBhY2tldFBhcnNlciwgb3B0aW9uc1xuXG4gIGNvbnN0IGluYm91bmQgPSBbXVxuICBjb25zdCBqc29uID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MDAgLy8gMHgwKiDigJQgSlNPTiBib2R5XG4gICAganNvbl9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgYmluYXJ5ID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MTAgLy8gMHgxKiDigJQgYmluYXJ5IGJvZHlcbiAgICBiaW5hcnlfcHJvdG8oc2hhcmVkKVxuXG4gIGNvbnN0IGNvbnRyb2wgPSBjb250cm9sX3Byb3RvIEAgaW5ib3VuZCxcbiAgICAweGYwIC8vIDB4Ziog4oCUIGNvbnRyb2xcbiAgICBzaGFyZWRcblxuICBjb25zdCBjb2RlY3MgPSBAOiBqc29uLCBiaW5hcnksIGNvbnRyb2wsIGRlZmF1bHQ6IGpzb25cblxuICBjb25zdCB7cmFuZG9tX2lkfSA9IHNoYXJlZFxuICByZXR1cm4gQDogaW5ib3VuZCwgY29kZWNzLCByYW5kb21faWRcblxuXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBFUFRhcmdldCA6OlxuICBzdGF0aWMgc3ViY2xhc3MoZXh0ZW5zaW9ucykgOjpcbiAgICBjbGFzcyBFUFRhcmdldCBleHRlbmRzIHRoaXMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgRVBUYXJnZXQucHJvdG90eXBlLCBleHRlbnNpb25zXG4gICAgcmV0dXJuIEVQVGFyZ2V0XG5cbiAgY29uc3RydWN0b3IoaWQsIG1zZ19jdHgsIG1zZ19pbmZvKSA6OlxuICAgIGNvbnN0IHByb3BzID0gQHt9XG4gICAgICBpZF9yb3V0ZXI6IEB7fSBlbnVtZXJhYmxlOiB0cnVlLCB2YWx1ZTogaWQuaWRfcm91dGVyXG4gICAgICBpZF90YXJnZXQ6IEB7fSBlbnVtZXJhYmxlOiB0cnVlLCB2YWx1ZTogaWQuaWRfdGFyZ2V0XG5cbiAgICBpZiBtc2dfY3R4IDo6XG4gICAgICBiaW5kQ3R4UHJvcHMgQCBwcm9wcywgKCkgPT5cbiAgICAgICAgbXNnX2N0eC50byh0aGlzLCBtc2dfaW5mbykuZmFzdF9qc29uXG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgcHJvcHNcblxuXG4gIHZhbHVlT2YoKSA6OiByZXR1cm4gMCB8IHRoaXMuaWRfdGFyZ2V0XG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRVBUYXJnZXQgJHt0aGlzLmVwX2VuY29kZSh0aGlzLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIHRoaXMuZXBfZW5jb2RlKHRoaXMpXG4gIGlzRVBUYXJnZXQoKSA6OiByZXR1cm4gdHJ1ZVxuXG4gIHN0YXRpYyBqc29uX2FzX3JlcGx5KG1zZ19jdHgpIDo6XG4gICAgcmV0dXJuIGluZm8gPT5cbiAgICAgIHRoaXMuZnJvbV9qc29uIEAgaW5mby5mcm9tX2lkLCBtc2dfY3R4LCBpbmZvXG5cbiAgc3RhdGljIGZyb21fanNvbihpZCwgbXNnX2N0eCwgbXNnX2luZm8pIDo6XG4gICAgaWYgaWQgOjogcmV0dXJuIG5ldyB0aGlzKGlkLCBtc2dfY3R4LCBtc2dfaW5mbylcblxuICBzdGF0aWMganNvblVucGFjayhtc2dfY3R4LCB4Zm9ybUJ5S2V5KSA6OlxuICAgIHhmb3JtQnlLZXkgPSBPYmplY3QuY3JlYXRlKHhmb3JtQnlLZXkgfHwgbnVsbClcbiAgICB4Zm9ybUJ5S2V5W3RoaXMudG9rZW5dID0gdiA9PlxuICAgICAgdGhpcy5mcm9tX2pzb24gQCB0aGlzLmVwX2RlY29kZSh2KSwgbXNnX2N0eFxuICAgIHJldHVybiB0aGlzLmpzb25VbnBhY2tCeUtleSh4Zm9ybUJ5S2V5KVxuXG4gIHN0YXRpYyBqc29uVW5wYWNrQnlLZXkoeGZvcm1CeUtleSkgOjpcbiAgICBjb25zdCByZWcgPSBuZXcgV2Vha01hcCgpXG4gICAgcmV0dXJuIHN6ID0+IEpTT04ucGFyc2UgQCBzeiwgcmV2aXZlclxuXG4gICAgZnVuY3Rpb24gcmV2aXZlcihrZXksIHZhbHVlKSA6OlxuICAgICAgY29uc3QgeGZuID0geGZvcm1CeUtleVtrZXldXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHhmbiA6OlxuICAgICAgICByZWcuc2V0KHRoaXMsIHhmbilcbiAgICAgICAgcmV0dXJuIHZhbHVlXG5cbiAgICAgIGlmICdvYmplY3QnID09PSB0eXBlb2YgdmFsdWUgOjpcbiAgICAgICAgY29uc3QgdmZuID0gcmVnLmdldCh2YWx1ZSlcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB2Zm4gOjpcbiAgICAgICAgICByZXR1cm4gdmZuIEAgdmFsdWVcbiAgICAgIHJldHVybiB2YWx1ZVxuXG5cbmZ1bmN0aW9uIGJpbmRDdHhQcm9wcyhwcm9wcywgaW5pdCkgOjpcbiAgbGV0IGN0eFxuICBwcm9wcy5zZW5kID0gQHt9IGdldCgpIDo6IHJldHVybiAoY3R4IHx8IChjdHggPSBpbml0KCkpKS5zZW5kXG4gIHByb3BzLnF1ZXJ5ID0gQHt9IGdldCgpIDo6IHJldHVybiAoY3R4IHx8IChjdHggPSBpbml0KCkpKS5xdWVyeVxuXG5cbmNvbnN0IHRva2VuID0gJ1xcdTAzRTAnIC8vICfPoCdcbkVQVGFyZ2V0LnRva2VuID0gdG9rZW5cblxuRVBUYXJnZXQuZXBfZW5jb2RlID0gRVBUYXJnZXQucHJvdG90eXBlLmVwX2VuY29kZSA9IGVwX2VuY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2VuY29kZShmcm9tX2lkLCBzaW1wbGUpIDo6XG4gIGxldCB7aWRfcm91dGVyOnIsIGlkX3RhcmdldDp0fSA9IGZyb21faWRcbiAgciA9IChyPj4+MCkudG9TdHJpbmcoMzYpXG4gIHQgPSAodD4+PjApLnRvU3RyaW5nKDM2KVxuICByZXR1cm4gc2ltcGxlXG4gICAgPyBgJHt0b2tlbn0gJHtyfX4ke3R9YFxuICAgIDogQHt9IFt0b2tlbl06IGAke3J9fiR7dH1gXG5cblxuRVBUYXJnZXQuZXBfZGVjb2RlID0gRVBUYXJnZXQucHJvdG90eXBlLmVwX2RlY29kZSA9IGVwX2RlY29kZVxuZXhwb3J0IGZ1bmN0aW9uIGVwX2RlY29kZSh2KSA6OlxuICBjb25zdCBmcm9tX2lkID0gJ3N0cmluZycgPT09IHR5cGVvZiB2XG4gICAgPyB2LnNwbGl0KHRva2VuKVsxXVxuICAgIDogdlt0b2tlbl1cbiAgaWYgISBmcm9tX2lkIDo6IHJldHVyblxuXG4gIGxldCBbcix0XSA9IGZyb21faWQuc3BsaXQoJ34nKVxuICBpZiB1bmRlZmluZWQgPT09IHQgOjogcmV0dXJuXG4gIHIgPSAwIHwgcGFyc2VJbnQociwgMzYpXG4gIHQgPSAwIHwgcGFyc2VJbnQodCwgMzYpXG5cbiAgcmV0dXJuIEB7fSBpZF9yb3V0ZXI6IHIsIGlkX3RhcmdldDogdFxuXG4iLCJpbXBvcnQge2VwX2VuY29kZX0gZnJvbSAnLi9lcF90YXJnZXQuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBFbmRwb2ludCA6OlxuICBzdGF0aWMgc3ViY2xhc3MoZXh0ZW5zaW9ucykgOjpcbiAgICBjbGFzcyBFbmRwb2ludCBleHRlbmRzIHRoaXMgOjpcbiAgICBPYmplY3QuYXNzaWduIEAgRW5kcG9pbnQucHJvdG90eXBlLCBleHRlbnNpb25zXG4gICAgcmV0dXJuIEVuZHBvaW50XG5cbiAgdmFsdWVPZigpIDo6IHJldHVybiB0aGlzLmZyb21faWRcbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFbmRwb2ludCAke2VwX2VuY29kZSh0aGlzLmZyb21faWQsIHRydWUpfcK7YFxuXG4gIGNvbnN0cnVjdG9yKG1zZ19jdHgsIGVwX3RndCkgOjpcbiAgICBtc2dfY3R4ID0gbXNnX2N0eC53aXRoRW5kcG9pbnQodGhpcylcbiAgICBjb25zdCBhc1JlcGx5ID0gZXBfdGd0LmNvbnN0cnVjdG9yLmpzb25fYXNfcmVwbHkobXNnX2N0eClcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBmcm9tX2lkOiBAe30gdmFsdWU6IG1zZ19jdHguZnJvbV9pZCwgZW51bWVyYWJsZTogdHJ1ZVxuICAgICAgdG9KU09OOiBAe30gdmFsdWUoKSA6OiByZXR1cm4gZXBfdGd0LnRvSlNPTigpXG4gICAgICB0bzogQHt9IHZhbHVlOiBtc2dfY3R4LnRvXG4gICAgICBhc1JlcGx5OiBAe30gdmFsdWU6IGFzUmVwbHlcblxuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpXG4gIGNyZWF0ZVN0YXRlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUmVwbHlNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVUcmFmZmljTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcblxuICBiaW5kU2luayhzaW5rKSA6OlxuICAgIGNvbnN0IGJ5X3Rva2VuID0gdGhpcy5jcmVhdGVSZXBseU1hcCgpXG4gICAgY29uc3QgYnlfdHJhZmZpYyA9IHRoaXMuY3JlYXRlVHJhZmZpY01hcCgpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAOlxuICAgICAgYnlfdG9rZW46IEB7fSB2YWx1ZTogYnlfdG9rZW5cbiAgICAgIGJ5X3RyYWZmaWM6IEB7fSB2YWx1ZTogYnlfdHJhZmZpY1xuXG4gICAgY29uc3QgdHJhZmZpYyA9IChmcm9tX2lkLCB0cmFmZmljKSA9PiA6OlxuICAgICAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gICAgICBpZiBmcm9tX2lkIDo6XG4gICAgICAgIGNvbnN0IHQgPSBieV90cmFmZmljLmdldChmcm9tX2lkLmlkX3RhcmdldClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0IDo6XG4gICAgICAgICAgdC50cyA9IHRbYHRzXyR7dHJhZmZpY31gXSA9IHRzXG4gICAgICB0aGlzLnJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKVxuXG4gICAgcmV0dXJuIEB7fVxuICAgICAgZnJvbV9pZDogdGhpcy5mcm9tX2lkXG4gICAgICBieV9tc2dpZDogdGhpcy5jcmVhdGVTdGF0ZU1hcCgpXG5cbiAgICAgIHJlY3ZDdHJsOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ2N0cmwnKVxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2Q3RybChtc2csIGluZm8sIHJlcGx5KVxuXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZyB8fCB7bXNnLCBpbmZvfSkudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2TXNnOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ21zZycpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZNc2cobXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cpLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdlN0cmVhbURhdGE6IChyc3RyZWFtLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICByZWN2U3RyZWFtOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGNvbnN0IHJzdHJlYW0gPSB0aGlzLnJlY3ZTdHJlYW0obXNnLCBpbmZvLCByZXBseSlcblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJzdHJlYW0pLnRoZW4ocmVwbHkpXG4gICAgICAgIHJldHVybiByc3RyZWFtXG5cbiAgcmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpIDo6XG4gIHJlY3ZDdHJsKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgaWYgaXNfcmVwbHkgOjogcmV0dXJuIG1zZ1xuICByZWN2TXNnKG1zZywgaW5mbywgaXNfcmVwbHkpIDo6XG4gICAgaWYgaXNfcmVwbHkgOjogcmV0dXJuIG1zZ1xuICAgIHJldHVybiBAe30gbXNnLCBpbmZvLCByZXBseTogdGhpcy5hc1JlcGx5KGluZm8pXG4gIHJlY3ZTdHJlYW0obXNnLCBpbmZvLCBpc19yZXBseSkgOjpcbiAgICBjb25zb2xlLndhcm4gQCBgVW5oYW5kbGUgcmVjdiBzdHJlYW06ICR7aW5mb31gXG4gICAgcmV0dXJuIG51bGxcbiAgICAvKiByZXR1cm4gQHt9IG1zZywgaW5mb1xuICAgICAgICAgb25faW5pdChtc2csIHBrdCkgOjogcmV0dXJuIHRoaXNcbiAgICAgICAgIG9uX2RhdGEoZGF0YSwgcGt0KSA6OiB0aGlzLnBhcnRzLnB1c2ggQCBkYXRhXG4gICAgICAgICBvbl9lbmQocmVzdWx0LCBwa3QpIDo6IHJldHVybiB0aGlzLnBhcnRzLmpvaW4oJycpXG4gICAgICAgICBvbl9lcnJvcihlcnIsIHBrdCkgOjogY29uc29sZS5sb2cgQCBlcnJcbiAgICAqL1xuXG4gIGluaXRSZXBseSh0b2tlbiwgbXNnX2N0eCkgOjpcbiAgICByZXR1cm4gdGhpcy5pbml0UmVwbHlQcm9taXNlIEAgdG9rZW4sIG1zZ19jdHgubXNfdGltZW91dFxuXG4gIGluaXRNb25pdG9yKGlkX3RhcmdldCkgOjpcbiAgICBjb25zdCBrZXkgPSBpZF90YXJnZXQuaWRfdGFyZ2V0IHx8IGlkX3RhcmdldFxuICAgIGxldCBtb25pdG9yID0gdGhpcy5ieV90cmFmZmljLmdldCBAIGtleVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gbW9uaXRvciA6OlxuICAgICAgbW9uaXRvciA9IEB7fSBpZF90YXJnZXQsIHRzOiBEYXRlLm5vdygpXG4gICAgICAgIHRkKCkgOjogcmV0dXJuIERhdGUubm93KCkgLSB0aGlzLnRzXG4gICAgICB0aGlzLmJ5X3RyYWZmaWMuc2V0IEAga2V5LCBtb25pdG9yXG4gICAgcmV0dXJuIG1vbml0b3JcblxuICBpbml0UmVwbHlQcm9taXNlKHRva2VuLCBtc190aW1lb3V0KSA6OlxuICAgIGxldCByZWplY3RcbiAgICBjb25zdCBhbnMgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3RfKSA9PiA6OlxuICAgICAgdGhpcy5ieV90b2tlbi5zZXQgQCB0b2tlbiwgcmVzb2x2ZVxuICAgICAgcmVqZWN0ID0gcmVqZWN0X1xuXG4gICAgaWYgbXNfdGltZW91dCA6OlxuICAgICAgY29uc3QgdGltZW91dCA9ICgpID0+IHJlamVjdCBAIG5ldyB0aGlzLlJlcGx5VGltZW91dFxuICAgICAgY29uc3QgdGlkID0gc2V0VGltZW91dCh0aW1lb3V0LCBtc190aW1lb3V0KVxuICAgICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgICBmdW5jdGlvbiBjbGVhcigpIDo6IGNsZWFyVGltZW91dCh0aWQpXG4gICAgICBhbnMudGhlbiBAIGNsZWFyLCBjbGVhclxuXG4gICAgcmV0dXJuIHJlcyA9PiA6OlxuICAgICAgaWYgcmVzICYmIHJlcy5jYXRjaCA6OlxuICAgICAgICBhbnMuc2VudCA9IHJlc1xuICAgICAgICByZXMuY2F0Y2gocmVqZWN0KVxuICAgICAgcmV0dXJuIGFuc1xuXG5cbmNsYXNzIFJlcGx5VGltZW91dCBleHRlbmRzIEVycm9yIDo6XG5cbk9iamVjdC5hc3NpZ24gQCBFbmRwb2ludC5wcm90b3R5cGUsIEB7fVxuICBSZXBseVRpbWVvdXRcblxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2luayA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtpbmJvdW5kfSkgOjpcbiAgICBjbGFzcyBTaW5rIGV4dGVuZHMgdGhpcyA6OlxuICAgIFNpbmsucHJvdG90eXBlLl9wcm90b2NvbCA9IGluYm91bmRcbiAgICByZXR1cm4gU2lua1xuXG4gIGNvbnN0cnVjdG9yKGpzb25fdW5wYWNrKSA6OlxuICAgIHRoaXMuanNvbl91bnBhY2sgPSBqc29uX3VucGFja1xuXG4gIHJlZ2lzdGVyKGVuZHBvaW50LCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnMpIDo6XG4gICAgY29uc3QgdW5yZWdpc3RlciA9ICgpID0+IGh1Yi5yb3V0ZXIudW5yZWdpc3RlclRhcmdldChpZF90YXJnZXQpXG5cbiAgICBodWIucm91dGVyLnJlZ2lzdGVyVGFyZ2V0IEAgaWRfdGFyZ2V0LFxuICAgICAgdGhpcy5fYmluZERpc3BhdGNoIEAgZW5kcG9pbnQsIHVucmVnaXN0ZXIsIGhhbmRsZXJzXG4gICAgcmV0dXJuIHRoaXNcblxuICBfYmluZERpc3BhdGNoKGVuZHBvaW50LCB1bnJlZ2lzdGVyLCB7b25fbXNnLCBvbl9lcnJvciwgb25fc2h1dGRvd259KSA6OlxuICAgIGxldCBhbGl2ZSA9IHRydWVcbiAgICBjb25zdCBwcm90b2NvbCA9IHRoaXMuX3Byb3RvY29sXG4gICAgY29uc3QgaXNBbGl2ZSA9ICgpID0+IGFsaXZlXG4gICAgY29uc3Qgc2h1dGRvd24gPSAoZXJyLCBleHRyYSkgPT4gOjpcbiAgICAgIGlmIGFsaXZlIDo6XG4gICAgICAgIHVucmVnaXN0ZXIoKTsgdW5yZWdpc3RlciA9IGFsaXZlID0gZmFsc2VcbiAgICAgICAgb25fc2h1dGRvd24oZXJyLCBleHRyYSlcblxuICAgIE9iamVjdC5hc3NpZ24gQCB0aGlzLCBlbmRwb2ludC5iaW5kU2luayh0aGlzKSwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG4gICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cblxuICAgIHJldHVybiBhc3luYyAocGt0LCByb3V0ZXIpID0+IDo6XG4gICAgICBpZiBmYWxzZT09PWFsaXZlIHx8IG51bGw9PXBrdCA6OiByZXR1cm4gYWxpdmVcblxuICAgICAgY29uc3QgcmVjdl9tc2cgPSBwcm90b2NvbFtwa3QudHlwZV1cbiAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmVjdl9tc2cgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBmYWxzZSwgQHt9IHBrdCwgem9uZTogJ3BrdC50eXBlJ1xuXG4gICAgICB0cnkgOjpcbiAgICAgICAgdmFyIG1zZyA9IGF3YWl0IHJlY3ZfbXNnIEAgcGt0LCB0aGlzLCByb3V0ZXJcbiAgICAgICAgaWYgISBtc2cgOjogcmV0dXJuIG1zZ1xuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZXJyLCBAe30gcGt0LCB6b25lOiAncHJvdG9jb2wnXG5cbiAgICAgIGlmIGZhbHNlID09PSBhbGl2ZSA6OlxuICAgICAgICByZXR1cm4gZmFsc2UgLy8gY2hhbmdlIHdoaWxlIGF3YWl0aW5nIGFib3Zl4oCmXG4gICAgICB0cnkgOjpcbiAgICAgICAgcmV0dXJuIGF3YWl0IG9uX21zZyBAIG1zZywgcGt0XG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgdHJ5IDo6XG4gICAgICAgICAgdmFyIHRlcm1pbmF0ZSA9IG9uX2Vycm9yIEAgZXJyLCBAe30gbXNnLCBwa3QsIHpvbmU6ICdkaXNwYXRjaCdcbiAgICAgICAgZmluYWxseSA6OlxuICAgICAgICAgIGlmIGZhbHNlICE9PSB0ZXJtaW5hdGUgOjpcbiAgICAgICAgICAgIHNodXRkb3duKGVyciwge21zZywgcGt0fSlcbiAgICAgICAgICAgIHJldHVybiBmYWxzZSAvLyBzaWduYWwgdW5yZWdpc3RlciB0byBtc2ctZmFicmljLWNvcmUvcm91dGVyXG5cbiAgc3RhdGVGb3IocGt0LCBpZkFic2VudCkgOjpcbiAgICBjb25zdCBtc2dpZCA9IHBrdC5pbmZvLm1zZ2lkXG4gICAgbGV0IGVudHJ5ID0gdGhpcy5ieV9tc2dpZC5nZXQobXNnaWQpXG4gICAgaWYgdW5kZWZpbmVkID09PSBlbnRyeSA6OlxuICAgICAgaWYgISBtc2dpZCA6OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgSW52YWxpZCBtc2dpZDogJHttc2dpZH1gXG4gICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgaWZBYnNlbnQgOjpcbiAgICAgICAgZW50cnkgPSBpZkFic2VudChwa3QsIHRoaXMsIG1zZ2lkKVxuICAgICAgZWxzZSBlbnRyeSA9IGlmQWJzZW50XG4gICAgICB0aGlzLmJ5X21zZ2lkLnNldCBAIG1zZ2lkLCBlbnRyeVxuICAgIHJldHVybiBlbnRyeVxuXG4gIGRlbGV0ZVN0YXRlRm9yKG1zZ2lkKSA6OlxuICAgIHJldHVybiB0aGlzLmJ5X21zZ2lkLmRlbGV0ZShtc2dpZClcbiIsImltcG9ydCB7ZXBfZW5jb2RlLCBlcF9kZWNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTXNnQ3R4IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe3JhbmRvbV9pZCwgY29kZWNzfSkgOjpcbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5yYW5kb21faWQgPSByYW5kb21faWRcbiAgICBNc2dDdHgud2l0aENvZGVjcyBAIGNvZGVjc1xuICAgIHJldHVybiBNc2dDdHhcblxuICBpbnNwZWN0KCkgOjpcbiAgICBjb25zdCBjdHggPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLmN0eClcbiAgICBjdHguZnJvbSA9IGVwX2VuY29kZShjdHguZnJvbV9pZCwgdHJ1ZSlcbiAgICBjdHgudG8gPSBlcF9lbmNvZGUoY3R4LCB0cnVlKVxuICAgIGRlbGV0ZSBjdHguZnJvbV9pZDsgZGVsZXRlIGN0eC5pZF9yb3V0ZXI7IGRlbGV0ZSBjdHguaWRfdGFyZ2V0XG4gICAgcmV0dXJuIGDCq01zZ0N0eCAke0pTT04uc3RyaW5naWZ5KGN0eCl9wrtgXG5cbiAgY29uc3RydWN0b3IoZnJvbV9pZCwgcmVzb2x2ZVJvdXRlQ2hhbm5lbCkgOjpcbiAgICBpZiBudWxsICE9PSBmcm9tX2lkIDo6XG4gICAgICBjb25zdCB7aWRfdGFyZ2V0LCBpZF9yb3V0ZXJ9ID0gZnJvbV9pZFxuICAgICAgZnJvbV9pZCA9IE9iamVjdC5mcmVlemUgQDogaWRfdGFyZ2V0LCBpZF9yb3V0ZXJcblxuICAgIGNvbnN0IGN0eCA9IHtmcm9tX2lkfVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIF9yb290XzogQDogdmFsdWU6IHRoaXNcbiAgICAgIGZyb21faWQ6IEA6IHZhbHVlOiBmcm9tX2lkXG4gICAgICBjdHg6IEA6IHZhbHVlOiBjdHhcbiAgICAgIHJlc29sdmVSb3V0ZUNoYW5uZWw6IEA6IHZhbHVlOiByZXNvbHZlUm91dGVDaGFubmVsXG5cbiAgd2l0aEVuZHBvaW50KGVuZHBvaW50KSA6OlxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEB7fVxuICAgICAgZW5kcG9pbnQ6IEB7fSB2YWx1ZTogZW5kcG9pbnRcblxuXG4gIHBpbmcodG9rZW49dHJ1ZSkgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX21zZ0NvZGVjcy5jb250cm9sLnBpbmcsIFtdLCB0b2tlblxuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlYy5zZW5kLCBhcmdzXG4gIHF1ZXJ5KC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlYy5zZW5kLCBhcmdzLCB0cnVlXG5cbiAgc3RyZWFtKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlYy5zdHJlYW0sIGFyZ3NcbiAgaW52b2tlKGtleSwgLi4uYXJncykgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX2NvZGVjW2tleV0sIGFyZ3NcbiAgYmluZEludm9rZShmbk9yS2V5LCB0b2tlbikgOjpcbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgZm5PcktleSA6OiBmbk9yS2V5ID0gdGhpcy5fY29kZWNcbiAgICByZXR1cm4gKC4uLmFyZ3MpID0+IHRoaXMuX2ludm9rZV9leChmbk9yS2V5LCBhcmdzLCB0b2tlbilcblxuICBfaW52b2tlX2V4KGludm9rZSwgYXJncywgdG9rZW4pIDo6XG4gICAgY29uc3Qgb2JqID0gT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eFxuICAgIGlmIG51bGwgPT0gdG9rZW4gOjogdG9rZW4gPSBvYmoudG9rZW5cbiAgICBlbHNlIG9iai50b2tlbiA9IHRva2VuXG5cbiAgICB0aGlzLmFzc2VydE1vbml0b3IoKVxuICAgIGNvbnN0IGNoYW4gPSB0aGlzLnJlc29sdmVSb3V0ZUNoYW5uZWwob2JqLmlkX3JvdXRlcilcbiAgICBpZiB0cnVlICE9PSB0b2tlbiA6OlxuICAgICAgcmV0dXJuIGludm9rZSBAIGNoYW4sIG9iaiwgLi4uYXJnc1xuXG4gICAgZWxzZSA6OlxuICAgICAgdG9rZW4gPSBvYmoudG9rZW4gPSB0aGlzLnJhbmRvbV9pZCgpXG4gICAgICBjb25zdCByZXBseSA9IHRoaXMuZW5kcG9pbnQuaW5pdFJlcGx5KHRva2VuLCB0aGlzKVxuICAgICAgcmV0dXJuIHJlcGx5IEAgaW52b2tlIEAgY2hhbiwgb2JqLCAuLi5hcmdzXG5cbiAgZ2V0IHRvKCkgOjogcmV0dXJuICh0Z3QsIC4uLmFyZ3MpID0+IDo6XG4gICAgaWYgbnVsbCA9PSB0Z3QgOjogdGhyb3cgbmV3IEVycm9yIEAgYE51bGwgdGFyZ2V0IGVuZHBvaW50YFxuXG4gICAgY29uc3Qgc2VsZiA9IHRoaXMuY2xvbmUoKVxuXG4gICAgY29uc3QgY3R4ID0gc2VsZi5jdHhcbiAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgY3R4LmlkX3RhcmdldCA9IHRndFxuICAgICAgY3R4LmlkX3JvdXRlciA9IGN0eC5mcm9tX2lkLmlkX3JvdXRlclxuICAgIGVsc2UgOjpcbiAgICAgIGNvbnN0IHtmcm9tX2lkOiByZXBseV9pZCwgaWRfdGFyZ2V0LCBpZF9yb3V0ZXIsIHRva2VuLCBtc2dpZH0gPSBlcF9kZWNvZGUodGd0KSB8fCB0Z3RcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBpZF90YXJnZXQgOjpcbiAgICAgICAgaWYgdW5kZWZpbmVkID09PSBpZF9yb3V0ZXIgOjpcbiAgICAgICAgICBpZiAhIGN0eC5pZF9yb3V0ZXIgOjpcbiAgICAgICAgICAgIC8vIGltcGxpY2l0bHkgb24gdGhlIHNhbWUgcm91dGVyXG4gICAgICAgICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgICAgIGVsc2UgY3R4LmlkX3JvdXRlciA9IGlkX3JvdXRlclxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gaWRfdGFyZ2V0XG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gaWRfcm91dGVyIDo6XG4gICAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYXNzaW5nICdpZF9yb3V0ZXInIHJlcXVpcmVzICdpZF90YXJnZXQnYFxuICAgICAgZWxzZSBpZiB1bmRlZmluZWQgIT09IHJlcGx5X2lkICYmICEgY3R4LmlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfcm91dGVyID0gcmVwbHlfaWQuaWRfcm91dGVyXG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSByZXBseV9pZC5pZF90YXJnZXRcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuXG4gICAgcmV0dXJuIDAgPT09IGFyZ3MubGVuZ3RoID8gc2VsZiA6IHNlbGYud2l0aCBAIC4uLmFyZ3NcblxuICB3aXRoKC4uLmFyZ3MpIDo6XG4gICAgY29uc3QgY3R4ID0gdGhpcy5jdHhcbiAgICBmb3IgbGV0IHRndCBvZiBhcmdzIDo6XG4gICAgICBpZiB0cnVlID09PSB0Z3QgfHwgZmFsc2UgPT09IHRndCA6OlxuICAgICAgICBjdHgudG9rZW4gPSB0Z3RcbiAgICAgIGVsc2UgaWYgbnVsbCAhPSB0Z3QgOjpcbiAgICAgICAgY29uc3Qge3Rva2VuLCBtc2dpZH0gPSB0Z3RcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG4gICAgcmV0dXJuIHRoaXNcblxuICB3aXRoUmVwbHkoKSA6OlxuICAgIHJldHVybiB0aGlzLmNsb25lIEA6IHRva2VuOiB0cnVlXG5cbiAgcmVzZXQoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMuX3Jvb3RfLCBAe31cbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcbiAgY2xvbmUoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG5cbiAgYXNzZXJ0TW9uaXRvcigpIDo6XG4gICAgaWYgISB0aGlzLmNoZWNrTW9uaXRvcigpIDo6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgVGFyZ2V0IG1vbml0b3IgZXhwaXJlZGBcbiAgY2hlY2tNb25pdG9yKCkgOjogcmV0dXJuIHRydWVcbiAgbW9uaXRvcihvcHRpb25zPXt9KSA6OlxuICAgIGlmIHRydWUgPT09IG9wdGlvbnMgfHwgZmFsc2UgPT09IG9wdGlvbnMgOjpcbiAgICAgIG9wdGlvbnMgPSBAe30gYWN0aXZlOiBvcHRpb25zXG5cbiAgICBjb25zdCBtb25pdG9yID0gdGhpcy5lbmRwb2ludC5pbml0TW9uaXRvcih0aGlzLmN0eC5pZF90YXJnZXQpXG5cbiAgICBjb25zdCB0c19kdXJhdGlvbiA9IG9wdGlvbnMudHNfZHVyYXRpb24gfHwgNTAwMFxuICAgIGxldCB0c19hY3RpdmUgPSBvcHRpb25zLnRzX2FjdGl2ZVxuICAgIGlmIHRydWUgPT09IHRzX2FjdGl2ZSA6OlxuICAgICAgdHNfYWN0aXZlID0gdHNfZHVyYXRpb24vNFxuXG4gICAgbGV0IGNoZWNrTW9uaXRvclxuICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBjb25zdCBkb25lID0gb3B0aW9ucy5yZWplY3QgPyByZWplY3QgOiByZXNvbHZlXG4gICAgICB0aGlzLmNoZWNrTW9uaXRvciA9IGNoZWNrTW9uaXRvciA9ICgpID0+XG4gICAgICAgIHRzX2R1cmF0aW9uID4gbW9uaXRvci50ZCgpXG4gICAgICAgICAgPyB0cnVlIDogKGRvbmUobW9uaXRvciksIGZhbHNlKVxuXG4gICAgbGV0IHRpZFxuICAgIGNvbnN0IHRzX2ludGVydmFsID0gdHNfYWN0aXZlIHx8IHRzX2R1cmF0aW9uLzRcbiAgICBpZiBvcHRpb25zLmFjdGl2ZSB8fCB0c19hY3RpdmUgOjpcbiAgICAgIGNvbnN0IGN0cmwgPSB0aGlzLmNvZGVjKCdjb250cm9sJylcbiAgICAgIGNvbnN0IGNoZWNrUGluZyA9ICgpID0+IDo6XG4gICAgICAgIGlmIHRzX2ludGVydmFsID4gbW9uaXRvci50ZCgpIDo6XG4gICAgICAgICAgY3RybC5pbnZva2UoJ3BpbmcnKVxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja1BpbmcsIHRzX2ludGVydmFsXG4gICAgZWxzZSA6OlxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja01vbml0b3IsIHRzX2ludGVydmFsXG4gICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiBjbGVhckludGVydmFsKHRpZClcblxuICAgIHByb21pc2UudGhlbihjbGVhciwgY2xlYXIpXG4gICAgcmV0dXJuIHByb21pc2VcblxuXG4gIGNvZGVjKG1zZ19jb2RlYywgLi4uYXJncykgOjpcbiAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIG1zZ19jb2RlYyA6OlxuICAgICAgbXNnX2NvZGVjID0gdGhpcy5fbXNnQ29kZWNzW21zZ19jb2RlY11cblxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBtc2dfY29kZWMuc2VuZCA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwYWNrZXQgY29kZWMgcHJvdG9jb2xgXG5cbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEA6XG4gICAgICBfY29kZWM6IEA6IHZhbHVlOiBtc2dfY29kZWNcbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuICBzdGF0aWMgd2l0aENvZGVjcyhtc2dDb2RlY3MpIDo6XG4gICAgZm9yIGNvbnN0IFtuYW1lLCBtc2dfY29kZWNdIG9mIE9iamVjdC5lbnRyaWVzIEAgbXNnQ29kZWNzIDo6XG4gICAgICB0aGlzLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMuY29kZWMgQCBtc2dfY29kZWNcbiAgICB0aGlzLnByb3RvdHlwZS5fbXNnQ29kZWNzID0gbXNnQ29kZWNzXG4gICAgdGhpcy5wcm90b3R5cGUuX2NvZGVjID0gbXNnQ29kZWNzLmRlZmF1bHRcblxuICAgIC8vIGJpbmQgc2VuZF9qc29uIGFzIGZyZXF1ZW50bHkgdXNlZCBmYXN0LXBhdGhcbiAgICBjb25zdCBqc29uX3NlbmQgPSBtc2dDb2RlY3MuanNvbi5zZW5kXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLnByb3RvdHlwZSwgQDpcbiAgICAgIGZhc3RfanNvbjogQHt9IGdldCgpIDo6IHJldHVybiBAOlxuICAgICAgICBzZW5kOiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4IEAganNvbl9zZW5kLCBhcmdzXG4gICAgICAgIHF1ZXJ5OiAoLi4uYXJncykgPT4gdGhpcy5faW52b2tlX2V4IEAganNvbl9zZW5kLCBhcmdzLCB0cnVlXG5cbiAgICByZXR1cm4gdGhpc1xuXG5PYmplY3QuYXNzaWduIEAgTXNnQ3R4LnByb3RvdHlwZSwgQHt9XG4gIG1zX3RpbWVvdXQ6IDUwMDBcblxuIiwiaW1wb3J0IGluaXRfcHJvdG9jb2wgZnJvbSAnLi9wcm90b2NvbC9pbmRleC5qc3knXG5pbXBvcnQgRW5kcG9pbnRCYXNlIGZyb20gJy4vZW5kcG9pbnQuanN5J1xuaW1wb3J0IEVQVGFyZ2V0QmFzZSBmcm9tICcuL2VwX3RhcmdldC5qc3knXG5pbXBvcnQgU2lua0Jhc2UgZnJvbSAnLi9zaW5rLmpzeSdcbmltcG9ydCBNc2dDdHhCYXNlIGZyb20gJy4vbXNnY3R4LmpzeSdcblxuY29uc3QgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyA9IEA6XG4gIHBsdWdpbl9uYW1lOiAnZW5kcG9pbnQnXG4gIG9uX21zZyh7bXNnLCByZXBseSwgaW5mb30pIDo6XG4gICAgY29uc29sZS53YXJuIEAgJ0VORFBPSU5UIE1TRzonLCBAe30gbXNnLCByZXBseSwgaW5mb1xuICBvbl9zZW5kX2Vycm9yKGVwLCBlcnIpIDo6XG4gICAgY29uc29sZS5lcnJvciBAICdFTkRQT0lOVCBTRU5EIEVSUk9SOicsIGVyclxuICAgIGVwLnNodXRkb3duKClcbiAgb25fcmVjdl9lcnJvcihlcCwgZXJyLCBleHRyYSkgOjpcbiAgICBjb25zb2xlLmVycm9yIEAgJ0VORFBPSU5UIFJFQ1YgRVJST1I6JywgZXJyLCBleHRyYVxuICAgIC8vIGNvbnN0IHttc2csIHBrdH0gPSBleHRyYVxuICAgIC8vIHJldHVybiBmYWxzZSB0byBwcmV2ZW50IGF1dG8tc2h1dGRvd25cbiAgb25fc2h1dGRvd24oZXAsIGVyciwgZXh0cmEpIDo6XG4gICAgLy8gY29uc3Qge21zZywgcGt0fSA9IGV4dHJhXG4gICAgY29uc29sZS5lcnJvciBAIGBFTkRQT0lOVCBTSFVURE9XTjogJHtlcnIubWVzc2FnZX1gXG5cbiAgc3ViY2xhc3MoY2xhc3NlcykgOjpcbiAgICAvL2NvbnN0IHtFbmRwb2ludCwgRVBUYXJnZXQsIFNpbmssIE1zZ0N0eCwgcHJvdG9jb2xzfSA9IGNsYXNzZXNcbiAgICByZXR1cm4gY2xhc3Nlc1xuXG4gIGpzb25fcGFjazogSlNPTi5zdHJpbmdpZnlcbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKSAvLyBMUlVNYXAsIEhhc2hiZWx0TWFwXG4gIGNyZWF0ZUNhY2hlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKSAvLyBMUlVNYXAsIEhhc2hiZWx0TWFwXG5cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGx1Z2luX29wdGlvbnMpIDo6XG4gIHBsdWdpbl9vcHRpb25zID0gT2JqZWN0LmFzc2lnbiBAIHt9LCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zLCBwbHVnaW5fb3B0aW9uc1xuICBjb25zdCBAe31cbiAgICBwbHVnaW5fbmFtZSwgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBvbl9tc2c6IGRlZmF1bHRfb25fbXNnXG4gICAgb25fc2VuZF9lcnJvcjogZGVmYXVsdF9vbl9zZW5kX2Vycm9yXG4gICAgb25fcmVjdl9lcnJvcjogZGVmYXVsdF9vbl9yZWN2X2Vycm9yXG4gICAgb25fc2h1dGRvd246IGRlZmF1bHRfb25fc2h1dGRvd25cbiAgICBjcmVhdGVNYXAsIGNyZWF0ZUNhY2hlTWFwXG4gID0gcGx1Z2luX29wdGlvbnNcblxuICByZXR1cm4gQDogb3JkZXI6IDEsIHN1YmNsYXNzLCBwb3N0XG4gIFxuICBmdW5jdGlvbiBzdWJjbGFzcyhGYWJyaWNIdWJfUEksIGJhc2VzKSA6OlxuICAgIGNvbnN0IHtwYWNrZXRQYXJzZXJ9ID0gRmFicmljSHViX1BJLnByb3RvdHlwZVxuICAgIGlmIG51bGw9PXBhY2tldFBhcnNlciB8fCAhIHBhY2tldFBhcnNlci5pc1BhY2tldFBhcnNlcigpIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEludmFsaWQgcGFja2V0UGFyc2VyIGZvciBwbHVnaW5gXG4gICAgXG4gICAgRmFicmljSHViX1BJLnByb3RvdHlwZVtwbHVnaW5fbmFtZV0gPVxuICAgICAgYmluZEVuZHBvaW50QXBpIEAgcGFja2V0UGFyc2VyXG5cbiAgZnVuY3Rpb24gcG9zdChodWIpIDo6XG4gICAgcmV0dXJuIGh1YltwbHVnaW5fbmFtZV0gPSBodWJbcGx1Z2luX25hbWVdKGh1YilcblxuICBmdW5jdGlvbiBiaW5kRW5kcG9pbnRBcGkocGFja2V0UGFyc2VyKSA6OlxuICAgIGNvbnN0IHByb3RvY29scyA9IGluaXRfcHJvdG9jb2wgQCBwYWNrZXRQYXJzZXIsIEB7fSByYW5kb21faWQsIGpzb25fcGFja1xuXG4gICAgY29uc3Qge0VuZHBvaW50LCBFUFRhcmdldCwgU2luaywgTXNnQ3R4fSA9XG4gICAgICBwbHVnaW5fb3B0aW9ucy5zdWJjbGFzcyBAOlxuICAgICAgICBwcm90b2NvbHMsXG4gICAgICAgIFNpbms6IFNpbmtCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgICAgIE1zZ0N0eDogTXNnQ3R4QmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgICAgICBFbmRwb2ludDogRW5kcG9pbnRCYXNlLnN1YmNsYXNzKHtjcmVhdGVNYXB9KVxuICAgICAgICBFUFRhcmdldDogRVBUYXJnZXRCYXNlLnN1YmNsYXNzKHByb3RvY29scylcblxuICAgIHJldHVybiBmdW5jdGlvbihodWIpIDo6XG4gICAgICBjb25zdCByZXNvbHZlUm91dGVDaGFubmVsID0gaHViLmJpbmRSb3V0ZUNoYW5uZWwgQCBudWxsLCBjcmVhdGVDYWNoZU1hcCgpXG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAOiBjcmVhdGUsIHNlcnZlcjogZW5kcG9pbnQsIGNsaWVudCwgY2xpZW50RW5kcG9pbnRcblxuXG4gICAgICBmdW5jdGlvbiBlbmRwb2ludChvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCB0YXJnZXRzID0gaHViLnJvdXRlci50YXJnZXRzXG4gICAgICAgIGRvIHZhciBpZF90YXJnZXQgPSByYW5kb21faWQoKVxuICAgICAgICB3aGlsZSB0YXJnZXRzLmhhcyBAIGlkX3RhcmdldFxuICAgICAgICByZXR1cm4gY3JlYXRlIEAgaWRfdGFyZ2V0LCBvbl9pbml0XG5cbiAgICAgIGZ1bmN0aW9uIGNyZWF0ZShpZF90YXJnZXQsIG9uX2luaXQpIDo6XG4gICAgICAgIGNvbnN0IGZyb21faWQgPSBAe30gaWRfdGFyZ2V0LCBpZF9yb3V0ZXI6IGh1Yi5yb3V0ZXIuaWRfc2VsZlxuICAgICAgICBjb25zdCBtc2dfY3R4ID0gbmV3IE1zZ0N0eCBAIGZyb21faWQsIHJlc29sdmVSb3V0ZUNoYW5uZWxcbiAgICAgICAgY29uc3QgZXBfdGd0ID0gbmV3IEVQVGFyZ2V0KG1zZ19jdHguZnJvbV9pZClcbiAgICAgICAgY29uc3QgZXAgPSBuZXcgRW5kcG9pbnQobXNnX2N0eCwgZXBfdGd0KVxuXG4gICAgICAgIGNvbnN0IHJlYWR5ID0gUHJvbWlzZVxuICAgICAgICAgIC5yZXNvbHZlIEAgb25faW5pdChlcCwgaHViKVxuICAgICAgICAgIC50aGVuIEAgX2FmdGVyX2luaXRcblxuICAgICAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCBlcF90Z3QsIEB7fVxuICAgICAgICAgIHJlYWR5OiBAe30gdmFsdWU6IHJlYWR5LnRoZW4gQCAoKSA9PiBlcF90Z3RcblxuXG4gICAgICAgIGZ1bmN0aW9uIF9hZnRlcl9pbml0KHRhcmdldCkgOjpcbiAgICAgICAgICBpZiBudWxsID09IHRhcmdldCA6OlxuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBlbmRwb2ludCBpbml0IHRvIHJldHVybiBhIGNsb3N1cmUgb3IgaW50ZXJmYWNlYFxuXG4gICAgICAgICAgY29uc3Qgb25fbXNnID0gKHRhcmdldC5vbl9tc2cgfHwgKCdmdW5jdGlvbicgPT09IHR5cGVvZiB0YXJnZXQgPyB0YXJnZXQgOiBkZWZhdWx0X29uX21zZykpLmJpbmQodGFyZ2V0KVxuICAgICAgICAgIGNvbnN0IG9uX3NlbmRfZXJyb3IgPSAodGFyZ2V0Lm9uX3NlbmRfZXJyb3IgfHwgZGVmYXVsdF9vbl9zZW5kX2Vycm9yKS5iaW5kKHRhcmdldCwgZXApXG4gICAgICAgICAgY29uc3Qgb25fcmVjdl9lcnJvciA9ICh0YXJnZXQub25fcmVjdl9lcnJvciB8fCBkZWZhdWx0X29uX3JlY3ZfZXJyb3IpLmJpbmQodGFyZ2V0LCBlcClcbiAgICAgICAgICBjb25zdCBvbl9zaHV0ZG93biA9ICh0YXJnZXQub25fc2h1dGRvd24gfHwgZGVmYXVsdF9vbl9zaHV0ZG93bikuYmluZCh0YXJnZXQsIGVwKVxuXG4gICAgICAgICAgcmVhZHkuY2F0Y2ggQCBvbl9zZW5kX2Vycm9yXG5cbiAgICAgICAgICBjb25zdCBqc29uX3VucGFjayA9IHRhcmdldC5qc29uX3VucGFja1xuICAgICAgICAgICAgPyB0YXJnZXQuanNvbl91bnBhY2suYmluZCh0YXJnZXQpXG4gICAgICAgICAgICA6IEVQVGFyZ2V0Lmpzb25VbnBhY2sobXNnX2N0eClcblxuICAgICAgICAgIGNvbnN0IHNpbmsgPSBuZXcgU2luayBAIGpzb25fdW5wYWNrXG4gICAgICAgICAgc2luay5yZWdpc3RlciBAIGVwLCBodWIsIGlkX3RhcmdldCxcbiAgICAgICAgICAgIEB7fSBvbl9tc2csIG9uX3JlY3ZfZXJyb3IsIG9uX3NodXRkb3duXG5cbiAgICAgICAgICByZXR1cm4gdGFyZ2V0Lm9uX3JlYWR5XG4gICAgICAgICAgICA/IHRhcmdldC5vbl9yZWFkeShlcCwgaHViKVxuICAgICAgICAgICAgOiB0YXJnZXRcblxuXG5cbiAgICAgIGZ1bmN0aW9uIGNsaWVudEVuZHBvaW50KG9uX3JlYWR5KSA6OlxuICAgICAgICBsZXQgZXBfdGd0LCBkb25lID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgICAgIGVwX3RndCA9IGVuZHBvaW50IEAgZXAgPT4gQDpcbiAgICAgICAgICAgIGFzeW5jIG9uX3JlYWR5KGVwLCBodWIpIDo6XG4gICAgICAgICAgICAgIHJlc29sdmUgQCBhd2FpdCBvbl9yZWFkeShlcCwgaHViKVxuICAgICAgICAgICAgICBlcC5zaHV0ZG93bigpXG5cbiAgICAgICAgICAgIG9uX3NodXRkb3duKGVwKSA6OiByZWplY3QoKVxuICAgICAgICAgICAgb25fc2VuZF9lcnJvcihlcCwgZXJyKSA6OiByZWplY3QoZXJyKVxuXG4gICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduIEAgZXBfdGd0LCBAe31cbiAgICAgICAgICB0aGVuKHksbikgOjogcmV0dXJuIGRvbmUudGhlbih5LG4pXG4gICAgICAgICAgY2F0Y2gobikgOjogcmV0dXJuIGRvbmUuY2F0Y2gobilcbiAgICAgICAgICBmaW5hbGx5KGNiKSA6OiByZXR1cm4gZG9uZS50aGVuKGNiLCBjYilcbiAgICAgICAgICBkb25lXG5cblxuICAgICAgZnVuY3Rpb24gY2xpZW50KC4uLmFyZ3MpIDo6XG4gICAgICAgIGlmIDEgPT09IGFyZ3MubGVuZ3RoICYmICdmdW5jdGlvbicgPT09IHR5cGVvZiBhcmdzWzBdIDo6XG4gICAgICAgICAgcmV0dXJuIGNsaWVudEVuZHBvaW50KGFyZ3NbMF0pXG5cbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IG5ldyBNc2dDdHggQCBudWxsLCByZXNvbHZlUm91dGVDaGFubmVsXG4gICAgICAgIHJldHVybiAwICE9PSBhcmdzLmxlbmd0aCA/IG1zZ19jdHgudG8oLi4uYXJncykgOiBtc2dfY3R4XG5cbiIsImltcG9ydCBlbmRwb2ludF9wbHVnaW4gZnJvbSAnLi9wbHVnaW4uanN5J1xuXG5jb25zdCBnZXRSYW5kb21WYWx1ZXMgPSAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIHdpbmRvd1xuICA/IHdpbmRvdy5jcnlwdG8uZ2V0UmFuZG9tVmFsdWVzIDogbnVsbFxuXG5lbmRwb2ludF9icm93c2VyLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuZnVuY3Rpb24gcmFuZG9tX2lkKCkgOjpcbiAgY29uc3QgYXJyID0gbmV3IEludDMyQXJyYXkoMSlcbiAgZ2V0UmFuZG9tVmFsdWVzKGFycilcbiAgcmV0dXJuIGFyclswXVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBlbmRwb2ludF9icm93c2VyKHBsdWdpbl9vcHRpb25zPXt9KSA6OlxuICBpZiBudWxsID09IHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA6OlxuICAgIHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuXG4gIHJldHVybiBlbmRwb2ludF9wbHVnaW4ocGx1Z2luX29wdGlvbnMpXG5cbiJdLCJuYW1lcyI6WyJsaXR0bGVfZW5kaWFuIiwiY19zaW5nbGUiLCJjX2RhdGFncmFtIiwiY19kaXJlY3QiLCJjX211bHRpcGFydCIsImNfc3RyZWFtaW5nIiwiX2Vycl9tc2dpZF9yZXF1aXJlZCIsIl9lcnJfdG9rZW5fcmVxdWlyZWQiLCJmcm1fcm91dGluZyIsInNpemUiLCJiaXRzIiwibWFzayIsIm9iaiIsImZyb21faWQiLCJkdiIsIm9mZnNldCIsInNldEludDMyIiwiaWRfcm91dGVyIiwiaWRfdGFyZ2V0IiwidW5kZWZpbmVkIiwiZ2V0SW50MzIiLCJmcm1fcmVzcG9uc2UiLCJtc2dpZCIsIkVycm9yIiwic2V0SW50MTYiLCJzZXFfYWNrIiwiYWNrX2ZsYWdzIiwidG9rZW4iLCJnZXRJbnQxNiIsImZybV9kYXRhZ3JhbSIsInRyYW5zcG9ydCIsImZybV9kaXJlY3QiLCJmcm1fbXVsdGlwYXJ0Iiwic2VxX3BvcyIsInNlcSIsInNlcV9mbGFncyIsImZybV9zdHJlYW1pbmciLCJiaW5kX3NlcV9uZXh0Iiwic2VxX29mZnNldCIsInNlcV9uZXh0IiwiZmxhZ3MiLCJmaW4iLCJOYU4iLCJjb21wb3NlRnJhbWluZ3MiLCJmcm1fZnJvbSIsImZybV9yZXNwIiwiZnJtX3RyYW5zcG9ydHMiLCJsZW5ndGgiLCJieUJpdHMiLCJ0X2Zyb20iLCJmX3Rlc3QiLCJ0X3Jlc3AiLCJ0MCIsInQxIiwidDIiLCJ0MyIsIm1hcCIsImYiLCJ0ZXN0Qml0cyIsImNob29zZSIsImxzdCIsIlQiLCJiIiwib3AiLCJmbl9rZXkiLCJmbl90cmFuIiwiZm5fZnJvbSIsImZuX3Jlc3AiLCJmcm0iLCJiaW5kQXNzZW1ibGVkIiwiZl9wYWNrIiwiZl91bnBhY2siLCJwYWNrIiwidW5wYWNrIiwicGt0X3R5cGUiLCJwa3Rfb2JqIiwiVHlwZUVycm9yIiwidHlwZSIsIkRhdGFWaWV3IiwiQXJyYXlCdWZmZXIiLCJoZWFkZXIiLCJidWZmZXIiLCJzbGljZSIsInBrdCIsImJ1ZiIsImhlYWRlcl9idWZmZXIiLCJVaW50OEFycmF5IiwiaW5mbyIsIl9iaW5kX2l0ZXJhYmxlIiwiYnVmX2Nsb25lIiwidHRsIiwibmV4dCIsIm9wdGlvbnMiLCJkb25lIiwidmFsdWUiLCJwYWNrZXRQYXJzZXIiLCJmcmFnbWVudF9zaXplIiwiY29uY2F0QnVmZmVycyIsInBhY2tQYWNrZXRPYmoiLCJwYWNrX3V0ZjgiLCJ1bnBhY2tfdXRmOCIsIk51bWJlciIsInJhbmRvbV9pZCIsImpzb25fcGFjayIsImNyZWF0ZVN0cmVhbSIsInBhY2tldEZyYWdtZW50cyIsImNyZWF0ZU11bHRpcGFydCIsInNpbmsiLCJwYXJ0cyIsImZlZWQiLCJib2R5X2J1ZmZlciIsImluY2x1ZGVzIiwiZGVsZXRlU3RhdGVGb3IiLCJyZXMiLCJyZWN2RGF0YSIsInJzdHJlYW0iLCJzdGF0ZSIsImZlZWRfaW5pdCIsImFzX2NvbnRlbnQiLCJmZWVkX2lnbm9yZSIsIm1zZyIsImpzb25fdW5wYWNrIiwiYm9keV91dGY4IiwicmVjdlN0cmVhbSIsInJlY3ZTdHJlYW1EYXRhIiwiYmluZCIsImVyciIsIm9uX2Vycm9yIiwiZmVlZF9ib2R5Iiwib25faW5pdCIsImRhdGEiLCJvbl9kYXRhIiwib25fZW5kIiwiZmVlZF9zZXEiLCJuZXh0X2hkciIsImkiLCJsYXN0SW5uZXIiLCJieXRlTGVuZ3RoIiwiaTAiLCJib2R5IiwiYmluZFRyYW5zcG9ydEltcGxzIiwiaW5ib3VuZCIsImhpZ2hiaXRzIiwidHJhbnNwb3J0cyIsIm91dGJvdW5kIiwiZnJhbWluZ3MiLCJmcmFtZSIsImltcGwiLCJ0X3JlY3YiLCJwYWNrX2hkciIsInJlY3ZfbXNnIiwiYmluZFRyYW5zcG9ydHMiLCJwYWNrQm9keSIsInN0cmVhbWluZyIsInNlbmQiLCJzdHJlYW0iLCJiaW5kX3N0cmVhbSIsIm1vZGUiLCJjaGFuIiwibXNlbmQiLCJtc2VuZF9ieXRlcyIsIm1zZW5kX29iamVjdHMiLCJtc2VuZF9pbXBsIiwib2JqZWN0IiwiYnl0ZXMiLCJ3cml0ZSIsImVuZCIsImNodW5rIiwiY2hlY2tfZm5zIiwia2V5cyIsImtleSIsImpzb25fcHJvdG9jb2wiLCJzaGFyZWQiLCJkYXRhZ3JhbSIsImRpcmVjdCIsInJlY3ZNc2ciLCJzdGF0ZUZvciIsImJvZHlfYnVmIiwidW5wYWNrQm9keSIsImJpbmFyeV9wcm90b2NvbCIsImFzQnVmZmVyIiwicGt0X2J1ZmZlciIsImNvbnRyb2xfcHJvdG9jb2wiLCJoaWdoIiwicGluZ19mcmFtZSIsInBvbmdfZnJhbWUiLCJwb25nX3R5cGUiLCJyZWN2X3BvbmciLCJwaW5nX3R5cGUiLCJyZWN2X3BpbmciLCJwaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsInRzMCIsIkRhdGUiLCJyb3V0ZXIiLCJib2R5X2pzb24iLCJyZWN2Q3RybCIsIl9zZW5kX3BvbmciLCJwa3RfcGluZyIsInJfaWQiLCJ0czEiLCJkaXNwYXRjaCIsImluaXRfcHJvdG9jb2wiLCJzaGFyZWRfcHJvdG8iLCJqc29uIiwianNvbl9wcm90byIsImJpbmFyeSIsImJpbmFyeV9wcm90byIsImNvbnRyb2wiLCJjb250cm9sX3Byb3RvIiwiY29kZWNzIiwiZGVmYXVsdCIsIkVQVGFyZ2V0Iiwic3ViY2xhc3MiLCJleHRlbnNpb25zIiwiYXNzaWduIiwicHJvdG90eXBlIiwiaWQiLCJtc2dfY3R4IiwibXNnX2luZm8iLCJwcm9wcyIsImVudW1lcmFibGUiLCJ0byIsImZhc3RfanNvbiIsIk9iamVjdCIsImRlZmluZVByb3BlcnRpZXMiLCJlcF9lbmNvZGUiLCJqc29uX2FzX3JlcGx5IiwiZnJvbV9qc29uIiwianNvblVucGFjayIsInhmb3JtQnlLZXkiLCJjcmVhdGUiLCJ2IiwiZXBfZGVjb2RlIiwianNvblVucGFja0J5S2V5IiwicmVnIiwiV2Vha01hcCIsInN6IiwicGFyc2UiLCJyZXZpdmVyIiwieGZuIiwic2V0IiwidmZuIiwiZ2V0IiwiYmluZEN0eFByb3BzIiwiaW5pdCIsImN0eCIsInF1ZXJ5Iiwic2ltcGxlIiwiciIsInQiLCJ0b1N0cmluZyIsInNwbGl0IiwicGFyc2VJbnQiLCJFbmRwb2ludCIsImVwX3RndCIsIndpdGhFbmRwb2ludCIsImFzUmVwbHkiLCJjb25zdHJ1Y3RvciIsInRvSlNPTiIsIk1hcCIsImNyZWF0ZU1hcCIsImJ5X3Rva2VuIiwiY3JlYXRlUmVwbHlNYXAiLCJieV90cmFmZmljIiwiY3JlYXRlVHJhZmZpY01hcCIsInRyYWZmaWMiLCJ0cyIsIm5vdyIsInJlY3ZUcmFmZmljIiwiY3JlYXRlU3RhdGVNYXAiLCJyZXBseSIsInJtc2ciLCJyZXNvbHZlIiwidGhlbiIsImlzX3JlcGx5Iiwid2FybiIsImluaXRSZXBseSIsImluaXRSZXBseVByb21pc2UiLCJtc190aW1lb3V0IiwibW9uaXRvciIsInJlamVjdCIsImFucyIsIlByb21pc2UiLCJyZWplY3RfIiwidGltZW91dCIsIlJlcGx5VGltZW91dCIsInRpZCIsInNldFRpbWVvdXQiLCJ1bnJlZiIsImNsZWFyIiwiY2F0Y2giLCJzZW50IiwiU2luayIsImZvclByb3RvY29scyIsIl9wcm90b2NvbCIsImVuZHBvaW50IiwiaHViIiwiaGFuZGxlcnMiLCJ1bnJlZ2lzdGVyIiwidW5yZWdpc3RlclRhcmdldCIsInJlZ2lzdGVyVGFyZ2V0IiwiX2JpbmREaXNwYXRjaCIsIm9uX21zZyIsIm9uX3NodXRkb3duIiwiYWxpdmUiLCJwcm90b2NvbCIsImlzQWxpdmUiLCJzaHV0ZG93biIsImV4dHJhIiwiYmluZFNpbmsiLCJ6b25lIiwidGVybWluYXRlIiwiaWZBYnNlbnQiLCJlbnRyeSIsImJ5X21zZ2lkIiwiZGVsZXRlIiwiTXNnQ3R4Iiwid2l0aENvZGVjcyIsImZyb20iLCJyZXNvbHZlUm91dGVDaGFubmVsIiwiZnJlZXplIiwiX2ludm9rZV9leCIsIl9tc2dDb2RlY3MiLCJhcmdzIiwiX2NvZGVjIiwiZm5PcktleSIsImludm9rZSIsImFzc2VydE1vbml0b3IiLCJ0Z3QiLCJzZWxmIiwiY2xvbmUiLCJyZXBseV9pZCIsIndpdGgiLCJfcm9vdF8iLCJjaGVja01vbml0b3IiLCJhY3RpdmUiLCJpbml0TW9uaXRvciIsInRzX2R1cmF0aW9uIiwidHNfYWN0aXZlIiwicHJvbWlzZSIsInRkIiwidHNfaW50ZXJ2YWwiLCJjdHJsIiwiY29kZWMiLCJjaGVja1BpbmciLCJzZXRJbnRlcnZhbCIsImNsZWFySW50ZXJ2YWwiLCJtc2dfY29kZWMiLCJtc2dDb2RlY3MiLCJuYW1lIiwiZW50cmllcyIsImpzb25fc2VuZCIsImRlZmF1bHRfcGx1Z2luX29wdGlvbnMiLCJlcCIsImVycm9yIiwibWVzc2FnZSIsImNsYXNzZXMiLCJjcmVhdGVDYWNoZU1hcCIsInBsdWdpbl9vcHRpb25zIiwiZGVmYXVsdF9vbl9tc2ciLCJkZWZhdWx0X29uX3NlbmRfZXJyb3IiLCJkZWZhdWx0X29uX3JlY3ZfZXJyb3IiLCJkZWZhdWx0X29uX3NodXRkb3duIiwib3JkZXIiLCJwb3N0IiwiRmFicmljSHViX1BJIiwiYmFzZXMiLCJpc1BhY2tldFBhcnNlciIsInBsdWdpbl9uYW1lIiwiYmluZEVuZHBvaW50QXBpIiwicHJvdG9jb2xzIiwiU2lua0Jhc2UiLCJNc2dDdHhCYXNlIiwiRW5kcG9pbnRCYXNlIiwiRVBUYXJnZXRCYXNlIiwiYmluZFJvdXRlQ2hhbm5lbCIsInNlcnZlciIsImNsaWVudCIsImNsaWVudEVuZHBvaW50IiwidGFyZ2V0cyIsImhhcyIsImlkX3NlbGYiLCJyZWFkeSIsIl9hZnRlcl9pbml0IiwidGFyZ2V0Iiwib25fc2VuZF9lcnJvciIsIm9uX3JlY3ZfZXJyb3IiLCJyZWdpc3RlciIsIm9uX3JlYWR5IiwieSIsIm4iLCJjYiIsImdldFJhbmRvbVZhbHVlcyIsIndpbmRvdyIsImNyeXB0byIsImVuZHBvaW50X2Jyb3dzZXIiLCJhcnIiLCJJbnQzMkFycmF5IiwiZW5kcG9pbnRfcGx1Z2luIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxNQUFNQSxnQkFBZ0IsSUFBdEI7QUFDQSxNQUFNQyxXQUFXLFFBQWpCO0FBQ0EsTUFBTUMsYUFBYSxVQUFuQjtBQUNBLE1BQU1DLFdBQVcsUUFBakI7QUFDQSxNQUFNQyxjQUFj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

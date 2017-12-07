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
        return { sent: msend(true, body) };
      }

      obj.transport = 'single';
      obj.body = body;
      const pack_hdr = outbound.choose(obj);
      const pkt = packPacketObj(pack_hdr(obj));
      return { sent: chan(pkt) };
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
  static forProtocols({}) {
    class EPTarget extends this {}
    return EPTarget;
  }

  constructor(id, msg_ctx) {
    const props = {
      id_router: { enumerable: true, value: id.id_router },
      id_target: { enumerable: true, value: id.id_target } };

    if (msg_ctx) {
      let fn;
      props.send = { get: () => fn || (fn = msg_ctx.to(this).send_json) };
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
    return obj => this.from_json(obj.from_id, msg_ctx);
  }
  static from_json(id, msg_ctx) {
    if (id) {
      return new this(id, msg_ctx);
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
  static forProtocols({}) {
    class Endpoint extends this {}
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
        const rmsg = this.recvCtrl(msg, info);

        const reply = by_token.get(info.token);
        if (undefined !== reply) {
          Promise.resolve({ rmsg, msg, info }).then(reply);
        } else return rmsg;
      },

      recvMsg: (msg, info) => {
        traffic(info.from_id, 'msg');
        const rmsg = this.recvMsg(msg, info);

        const reply = by_token.get(info.token);
        if (undefined !== reply) {
          Promise.resolve(rmsg).then(reply);
        } else return rmsg;
      },

      recvStreamData: (rstream, info) => {
        traffic(info.from_id, 'stream');
      },
      recvStream: (msg, info) => {
        traffic(info.from_id, 'stream');
        const rstream = this.recvStream(msg, info);

        const reply = by_token.get(info.token);
        if (undefined !== reply) {
          Promise.resolve(rstream).then(reply);
        }
        return rstream;
      } };
  }

  recvTraffic(from_id, traffic, ts) {}
  recvCtrl(msg, info) {}
  recvMsg(msg, info) {
    return { msg, info, reply: this.asReply(info) };
  }
  recvStream(msg, info) {
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
    const ans = new Promise((resolve, reject) => {
      this.by_token.set(token, resolve);
      if (ms_timeout) {
        const tid = setTimeout(timeout, ms_timeout);
        if (tid.unref) {
          tid.unref();
        }
        function timeout() {
          reject(new this.ReplyTimeout());
        }
      }
    });

    return sent => {
      ans.sent = sent;
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

  constructor(from_id, resolveRoute) {
    if (null !== from_id) {
      const { id_target, id_router } = from_id;
      from_id = Object.freeze({ id_target, id_router });
    }

    const ctx = { from_id };
    Object.defineProperties(this, {
      _root_: { value: this },
      from_id: { value: from_id },
      ctx: { value: ctx },
      resolveRoute: { value: resolveRoute } });
  }

  withEndpoint(endpoint) {
    return Object.defineProperties(this, {
      endpoint: { value: endpoint } });
  }

  static from(id_target, hub) {
    const from_id = null === id_target ? null : { id_target, id_router: hub.router.id_self };
    return new this(from_id, hub.bindRouteDispatch());
  }

  get to() {
    return (...args) => this.clone().with(...args);
  }

  ping(token = true) {
    return this._invoke_ex(this._msgCodecs.control.ping, [], token);
  }
  send(...args) {
    return this._invoke_ex(this._codec.send, args);
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
    if (undefined === token) {
      token = obj.token;
    }

    this.assertMonitor();
    const chan = this.resolveRoute(obj.id_router);
    if (true !== token) {
      obj.token = token;
      return invoke(chan, obj, ...args);
    } else {
      token = obj.token = this.random_id();
      const reply = this.endpoint.initReply(token, this);
      return reply(invoke(chan, obj, ...args));
    }
  }

  with(...args) {
    const ctx = this.ctx;
    for (let tgt of args) {
      if ('number' === typeof tgt) {
        ctx.id_target = tgt;
        ctx.id_router = ctx.from_id.id_router;
        continue;
      }

      const { from_id: reply_id, id_target, id_router, token, msgid } = tgt;

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
      send_json: { get() {
          return (...args) => this._invoke_ex(json_send, args);
        } } });

    return this;
  }
}

Object.assign(MsgCtx.prototype, {
  ms_timeout: 5000 });

const default_plugin_options = {
  on_error(err, { msg, pkt }) {
    console.error('ENDPOINT ERROR:', err, { msg, pkt });
    // return false to prevent auto-shutdown
  }, on_shutdown(err, { msg, pkt }) {
    console.error('ENDPOINT SHUTDOWN:' + err);
  },

  subclass({ Endpoint: Endpoint$$1, EPTarget: EPTarget$$1, Sink: Sink$$1, MsgCtx: MsgCtx$$1, protocols }) {},

  json_pack: JSON.stringify };

var endpoint_plugin = function (plugin_options) {
  plugin_options = Object.assign({}, default_plugin_options, plugin_options);
  const {
    random_id, json_pack,
    on_error: default_on_error,
    on_shutdown: default_on_shutdown } = plugin_options;

  return { order: 1, subclass, post };

  function subclass(FabricHub_PI, bases) {
    const { packetParser } = FabricHub_PI.prototype;
    if (null == packetParser || !packetParser.isPacketParser()) {
      throw new TypeError(`Invalid packetParser for plugin`);
    }

    FabricHub_PI.prototype.endpoint = bindEndpointApi(packetParser);
  }

  function post(hub) {
    return hub.endpoint = hub.endpoint(hub);
  }

  function bindEndpointApi(packetParser) {
    const protocols = init_protocol(packetParser, { random_id, json_pack });
    const Sink$$1 = Sink.forProtocols(protocols);
    const MsgCtx$$1 = MsgCtx.forProtocols(protocols);
    const Endpoint$$1 = Endpoint.forProtocols(protocols);
    const EPTarget$$1 = EPTarget.forProtocols(protocols);

    plugin_options.subclass({
      Endpoint: Endpoint$$1, EPTarget: EPTarget$$1, Sink: Sink$$1, MsgCtx: MsgCtx$$1, protocols });

    return function (hub) {
      return Object.assign(endpoint, { create, server: endpoint, client });

      function client(...args) {
        const msg_ctx = MsgCtx$$1.from(null, hub);
        return 0 !== args.length ? msg_ctx.with(...args) : msg_ctx;
      }

      function endpoint(on_init) {
        const targets = hub.router.targets;
        do var id_target = random_id(); while (targets.has(id_target));
        return create(id_target, on_init);
      }

      function create(id_target, on_init) {
        const msg_ctx = MsgCtx$$1.from(id_target, hub);
        const ep_tgt = new EPTarget$$1(msg_ctx.from_id);
        const ep = new Endpoint$$1(msg_ctx, ep_tgt);

        const target = on_init(ep, hub);
        const on_msg = (target.on_msg || target).bind(target);
        const on_error = (target.on_error || default_on_error).bind(target);
        const on_shutdown = (target.on_shutdown || default_on_shutdown).bind(target);

        const json_unpack = target.json_unpack ? target.json_unpack.bind(target) : EPTarget$$1.jsonUnpack(msg_ctx);

        const sink = new Sink$$1(json_unpack);
        sink.register(ep, hub, id_target, { on_msg, on_error, on_shutdown });

        let ready = Promise.resolve(target);
        if (target.on_ready) {
          ready = ready.then(target => target.on_ready());
        }

        return Object.defineProperties(ep_tgt, {
          ready: { value: ready.then(() => ep_tgt) } });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3Nlci51bWQuanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvcHJvdG9jb2wvZnJhbWluZy5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL3NoYXJlZC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2pzb24uanN5IiwiLi4vY29kZS9wcm90b2NvbC9iaW5hcnkuanN5IiwiLi4vY29kZS9wcm90b2NvbC9jb250cm9sLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvaW5kZXguanN5IiwiLi4vY29kZS9lcF90YXJnZXQuanN5IiwiLi4vY29kZS9lbmRwb2ludC5qc3kiLCIuLi9jb2RlL3NpbmsuanN5IiwiLi4vY29kZS9tc2djdHguanN5IiwiLi4vY29kZS9wbHVnaW4uanN5IiwiLi4vY29kZS9pbmRleC5icm93c2VyLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBsaXR0bGVfZW5kaWFuID0gdHJ1ZVxuY29uc3QgY19zaW5nbGUgPSAnc2luZ2xlJ1xuY29uc3QgY19kYXRhZ3JhbSA9ICdkYXRhZ3JhbSdcbmNvbnN0IGNfZGlyZWN0ID0gJ2RpcmVjdCdcbmNvbnN0IGNfbXVsdGlwYXJ0ID0gJ211bHRpcGFydCdcbmNvbnN0IGNfc3RyZWFtaW5nID0gJ3N0cmVhbWluZydcblxuY29uc3QgX2Vycl9tc2dpZF9yZXF1aXJlZCA9IGBSZXNwb25zZSByZXFpcmVzICdtc2dpZCdgXG5jb25zdCBfZXJyX3Rva2VuX3JlcXVpcmVkID0gYFRyYW5zcG9ydCByZXFpcmVzICd0b2tlbidgXG5cblxuZnVuY3Rpb24gZnJtX3JvdXRpbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MSwgbWFzayA9IDB4MVxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLmZyb21faWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCB7ZnJvbV9pZH0gPSBvYmpcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF9yb3V0ZXIsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDMyIEAgNCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF90YXJnZXQsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IGZyb21faWQgPSB1bmRlZmluZWQgPT09IG9iai5mcm9tX2lkXG4gICAgICAgID8gb2JqLmZyb21faWQgPSB7fSA6IG9iai5mcm9tX2lkXG4gICAgICBmcm9tX2lkLmlkX3JvdXRlciA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGZyb21faWQuaWRfdGFyZ2V0ID0gZHYuZ2V0SW50MzIgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5mdW5jdGlvbiBmcm1fcmVzcG9uc2UoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MiwgbWFzayA9IDB4MlxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLm1zZ2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoubXNnaWQgOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl9tc2dpZF9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLm1zZ2lkLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXFfYWNrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5hY2tfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50b2tlbiA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfYWNrID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLmFja19mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuXG5cbmZ1bmN0aW9uIGZybV9kYXRhZ3JhbSgpIDo6XG4gIGNvbnN0IHNpemUgPSAwLCBiaXRzID0gMHgwLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RhdGFncmFtXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGF0YWdyYW0gPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kYXRhZ3JhbVxuXG5mdW5jdGlvbiBmcm1fZGlyZWN0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDQsIGJpdHMgPSAweDQsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGlyZWN0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGlyZWN0ID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGlyZWN0XG5cbmZ1bmN0aW9uIGZybV9tdWx0aXBhcnQoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4OCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19tdWx0aXBhcnRcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19tdWx0aXBhcnQgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjogLy8gdXNlIHNlcV9uZXh0XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX211bHRpcGFydFxuXG5mdW5jdGlvbiBmcm1fc3RyZWFtaW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweGMsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfc3RyZWFtaW5nXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfc3RyZWFtaW5nID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW4gLy8gdXNlIHNlcV9uZXh0XG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19zdHJlYW1pbmdcblxuXG5mdW5jdGlvbiBiaW5kX3NlcV9uZXh0KG9mZnNldCkgOjpcbiAgY29uc3Qgc2VxX29mZnNldCA9IHRoaXMuc2VxX3BvcyArIG9mZnNldFxuICBsZXQgc2VxID0gMVxuICByZXR1cm4gZnVuY3Rpb24gc2VxX25leHQoe2ZsYWdzLCBmaW59LCBkdikgOjpcbiAgICBpZiAhIGZpbiA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCBzZXErKywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICBlbHNlIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIC1zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgICBzZXEgPSBOYU5cblxuXG5cbmV4cG9ydCBkZWZhdWx0IGNvbXBvc2VGcmFtaW5ncygpXG5mdW5jdGlvbiBjb21wb3NlRnJhbWluZ3MoKSA6OlxuICBjb25zdCBmcm1fZnJvbSA9IGZybV9yb3V0aW5nKCksIGZybV9yZXNwID0gZnJtX3Jlc3BvbnNlKClcbiAgY29uc3QgZnJtX3RyYW5zcG9ydHMgPSBAW10gZnJtX2RhdGFncmFtKCksIGZybV9kaXJlY3QoKSwgZnJtX211bHRpcGFydCgpLCBmcm1fc3RyZWFtaW5nKClcblxuICBpZiA4ICE9PSBmcm1fZnJvbS5zaXplIHx8IDggIT09IGZybV9yZXNwLnNpemUgfHwgNCAhPSBmcm1fdHJhbnNwb3J0cy5sZW5ndGggOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgRnJhbWluZyBTaXplIGNoYW5nZWBcblxuICBjb25zdCBieUJpdHMgPSBbXSwgbWFzaz0weGZcblxuICA6OlxuICAgIGNvbnN0IHRfZnJvbSA9IGZybV9mcm9tLmZfdGVzdCwgdF9yZXNwID0gZnJtX3Jlc3AuZl90ZXN0XG4gICAgY29uc3QgW3QwLHQxLHQyLHQzXSA9IGZybV90cmFuc3BvcnRzLm1hcCBAIGY9PmYuZl90ZXN0XG5cbiAgICBjb25zdCB0ZXN0Qml0cyA9IGJ5Qml0cy50ZXN0Qml0cyA9IG9iaiA9PlxuICAgICAgMCB8IHRfZnJvbShvYmopIHwgdF9yZXNwKG9iaikgfCB0MChvYmopIHwgdDEob2JqKSB8IHQyKG9iaikgfCB0MyhvYmopXG5cbiAgICBieUJpdHMuY2hvb3NlID0gZnVuY3Rpb24gKG9iaiwgbHN0KSA6OlxuICAgICAgaWYgbnVsbCA9PSBsc3QgOjogbHN0ID0gdGhpcyB8fCBieUJpdHNcbiAgICAgIHJldHVybiBsc3RbdGVzdEJpdHMob2JqKV1cblxuXG4gIGZvciBjb25zdCBUIG9mIGZybV90cmFuc3BvcnRzIDo6XG4gICAgY29uc3Qge2JpdHM6Yiwgc2l6ZSwgdHJhbnNwb3J0fSA9IFRcblxuICAgIGJ5Qml0c1tifDBdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwwLCBtYXNrLCBzaXplOiBzaXplLCBvcDogJydcbiAgICBieUJpdHNbYnwxXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MSwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAnZidcbiAgICBieUJpdHNbYnwyXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MiwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAncidcbiAgICBieUJpdHNbYnwzXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MywgbWFzaywgc2l6ZTogMTYgKyBzaXplLCBvcDogJ2ZyJ1xuXG4gICAgZm9yIGNvbnN0IGZuX2tleSBvZiBbJ2ZfcGFjaycsICdmX3VucGFjayddIDo6XG4gICAgICBjb25zdCBmbl90cmFuID0gVFtmbl9rZXldLCBmbl9mcm9tID0gZnJtX2Zyb21bZm5fa2V5XSwgZm5fcmVzcCA9IGZybV9yZXNwW2ZuX2tleV1cblxuICAgICAgYnlCaXRzW2J8MF1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3RyYW4ob2JqLCBkdiwgMClcbiAgICAgIGJ5Qml0c1tifDFdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwyXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fcmVzcChvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8M11bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3Jlc3Aob2JqLCBkdiwgOCk7IGZuX3RyYW4ob2JqLCBkdiwgMTYpXG5cbiAgZm9yIGNvbnN0IGZybSBvZiBieUJpdHMgOjpcbiAgICBiaW5kQXNzZW1ibGVkIEAgZnJtXG5cbiAgcmV0dXJuIGJ5Qml0c1xuXG5cbmZ1bmN0aW9uIGJpbmRBc3NlbWJsZWQoZnJtKSA6OlxuICBjb25zdCB7VCwgc2l6ZSwgZl9wYWNrLCBmX3VucGFja30gPSBmcm1cbiAgaWYgVC5iaW5kX3NlcV9uZXh0IDo6XG4gICAgZnJtLnNlcV9uZXh0ID0gVC5iaW5kX3NlcV9uZXh0IEAgZnJtLnNpemUgLSBULnNpemVcblxuICBkZWxldGUgZnJtLlRcbiAgZnJtLnBhY2sgPSBwYWNrIDsgZnJtLnVucGFjayA9IHVucGFja1xuICBjb25zdCBzZXFfbmV4dCA9IGZybS5zZXFfbmV4dFxuXG4gIGZ1bmN0aW9uIHBhY2socGt0X3R5cGUsIHBrdF9vYmopIDo6XG4gICAgaWYgISBAIDAgPD0gcGt0X3R5cGUgJiYgcGt0X3R5cGUgPD0gMjU1IDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBrdF90eXBlIHRvIGJlIFswLi4yNTVdYFxuXG4gICAgcGt0X29iai50eXBlID0gcGt0X3R5cGVcbiAgICBpZiBzZXFfbmV4dCAmJiBudWxsID09IHBrdF9vYmouc2VxIDo6XG4gICAgICBwa3Rfb2JqLnNlcSA9IHRydWVcblxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IEFycmF5QnVmZmVyKHNpemUpXG4gICAgZl9wYWNrKHBrdF9vYmosIGR2LCAwKVxuICAgIHBrdF9vYmouaGVhZGVyID0gZHYuYnVmZmVyXG5cbiAgICBpZiB0cnVlID09PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgX2JpbmRfaXRlcmFibGUgQCBwa3Rfb2JqLCBkdi5idWZmZXIuc2xpY2UoMCxzaXplKVxuXG4gIGZ1bmN0aW9uIHVucGFjayhwa3QpIDo6XG4gICAgY29uc3QgYnVmID0gcGt0LmhlYWRlcl9idWZmZXIoKVxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IFVpbnQ4QXJyYXkoYnVmKS5idWZmZXJcblxuICAgIGNvbnN0IGluZm8gPSB7fVxuICAgIGZfdW5wYWNrKGluZm8sIGR2LCAwKVxuICAgIHJldHVybiBwa3QuaW5mbyA9IGluZm9cblxuICBmdW5jdGlvbiBfYmluZF9pdGVyYWJsZShwa3Rfb2JqLCBidWZfY2xvbmUpIDo6XG4gICAgY29uc3Qge3R5cGV9ID0gcGt0X29ialxuICAgIGNvbnN0IHtpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHRsLCB0b2tlbn0gPSBwa3Rfb2JqXG4gICAgcGt0X29iai5uZXh0ID0gbmV4dFxuXG4gICAgZnVuY3Rpb24gbmV4dChvcHRpb25zKSA6OlxuICAgICAgaWYgbnVsbCA9PSBvcHRpb25zIDo6IG9wdGlvbnMgPSB7fVxuICAgICAgY29uc3QgaGVhZGVyID0gYnVmX2Nsb25lLnNsaWNlKClcbiAgICAgIHNlcV9uZXh0IEAgb3B0aW9ucywgbmV3IERhdGFWaWV3IEAgaGVhZGVyXG4gICAgICByZXR1cm4gQHt9IGRvbmU6ICEhIG9wdGlvbnMuZmluLCB2YWx1ZTogQHt9IC8vIHBrdF9vYmpcbiAgICAgICAgaWRfcm91dGVyLCBpZF90YXJnZXQsIHR5cGUsIHR0bCwgdG9rZW4sIGhlYWRlclxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGFja2V0UGFyc2VyLCBvcHRpb25zLCBmcmFnbWVudF9zaXplKSA6OlxuICBjb25zdCB7Y29uY2F0QnVmZmVycywgcGFja1BhY2tldE9iaiwgcGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBwYWNrZXRQYXJzZXJcbiAgZnJhZ21lbnRfc2l6ZSA9IE51bWJlcihmcmFnbWVudF9zaXplIHx8IDgwMDApXG4gIGlmIDEwMjQgPiBmcmFnbWVudF9zaXplIHx8IDY1MDAwIDwgZnJhZ21lbnRfc2l6ZSA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIGZyYWdtZW50IHNpemU6ICR7ZnJhZ21lbnRfc2l6ZX1gXG5cbiAgY29uc3Qge3JhbmRvbV9pZCwganNvbl9wYWNrfSA9IG9wdGlvbnNcbiAgcmV0dXJuIEA6IHBhY2tldFBhcnNlciwgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwgcGFja2V0RnJhZ21lbnRzXG4gICAgYmluZFRyYW5zcG9ydHNcblxuXG4gIGZ1bmN0aW9uIGNyZWF0ZU11bHRpcGFydChwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBwYXJ0cyA9IFtdLCBmaW4gPSBmYWxzZVxuICAgIHJldHVybiBAe30gZmVlZCwgaW5mbzogcGt0LmluZm9cblxuICAgIGZ1bmN0aW9uIGZlZWQocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxIDwgMCA6OiBmaW4gPSB0cnVlOyBzZXEgPSAtc2VxXG4gICAgICBwYXJ0c1tzZXEtMV0gPSBwa3QuYm9keV9idWZmZXIoKVxuXG4gICAgICBpZiAhIGZpbiA6OiByZXR1cm5cbiAgICAgIGlmIHBhcnRzLmluY2x1ZGVzIEAgdW5kZWZpbmVkIDo6IHJldHVyblxuXG4gICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuXG4gICAgICBjb25zdCByZXMgPSBjb25jYXRCdWZmZXJzKHBhcnRzKVxuICAgICAgcGFydHMgPSBudWxsXG4gICAgICByZXR1cm4gcmVzXG5cbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtKHBrdCwgc2luaywgbXNnaWQpIDo6XG4gICAgbGV0IG5leHQ9MCwgZmluID0gZmFsc2UsIHJlY3ZEYXRhLCByc3RyZWFtXG4gICAgY29uc3Qgc3RhdGUgPSBAe30gZmVlZDogZmVlZF9pbml0LCBpbmZvOiBwa3QuaW5mb1xuICAgIHJldHVybiBzdGF0ZVxuXG4gICAgZnVuY3Rpb24gZmVlZF9pbml0KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuXG4gICAgICBjb25zdCBpbmZvID0gcGt0LmluZm9cbiAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiAgICAgIHJzdHJlYW0gPSBzaW5rLnJlY3ZTdHJlYW0obXNnLCBpbmZvKVxuICAgICAgaWYgbnVsbCA9PSByc3RyZWFtIDo6IHJldHVyblxuICAgICAgY2hlY2tfZm5zIEAgcnN0cmVhbSwgJ29uX2Vycm9yJywgJ29uX2RhdGEnLCAnb25fZW5kJyBcbiAgICAgIHJlY3ZEYXRhID0gc2luay5yZWN2U3RyZWFtRGF0YS5iaW5kKHNpbmssIHJzdHJlYW0sIGluZm8pXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9ib2R5XG4gICAgICBpZiByc3RyZWFtLm9uX2luaXQgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25faW5pdChtc2csIHBrdClcblxuICAgIGZ1bmN0aW9uIGZlZWRfYm9keShwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICByZWN2RGF0YSgpXG4gICAgICBsZXQgZGF0YVxuICAgICAgdHJ5IDo6XG4gICAgICAgIGZlZWRfc2VxKHBrdClcbiAgICAgICAgZGF0YSA9IGFzX2NvbnRlbnQocGt0LCBzaW5rKVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgaWYgZmluIDo6XG4gICAgICAgIGNvbnN0IHJlcyA9IHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lbmQgQCByZXMsIHBrdFxuICAgICAgZWxzZSA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9kYXRhIEAgZGF0YSwgcGt0XG5cbiAgICBmdW5jdGlvbiBmZWVkX2lnbm9yZShwa3QpIDo6XG4gICAgICB0cnkgOjogZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG5cbiAgICBmdW5jdGlvbiBmZWVkX3NlcShwa3QpIDo6XG4gICAgICBsZXQgc2VxID0gcGt0LmluZm8uc2VxXG4gICAgICBpZiBzZXEgPj0gMCA6OlxuICAgICAgICBpZiBuZXh0KysgPT09IHNlcSA6OlxuICAgICAgICAgIHJldHVybiAvLyBpbiBvcmRlclxuICAgICAgZWxzZSA6OlxuICAgICAgICBmaW4gPSB0cnVlXG4gICAgICAgIHNpbmsuZGVsZXRlU3RhdGVGb3IobXNnaWQpXG4gICAgICAgIGlmIG5leHQgPT09IC1zZXEgOjpcbiAgICAgICAgICBuZXh0ID0gJ2RvbmUnXG4gICAgICAgICAgcmV0dXJuIC8vIGluLW9yZGVyLCBsYXN0IHBhY2tldFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcbiAgICAgIG5leHQgPSAnaW52YWxpZCdcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYWNrZXQgb3V0IG9mIHNlcXVlbmNlYFxuXG4gIGZ1bmN0aW9uICogcGFja2V0RnJhZ21lbnRzKGJ1ZiwgbmV4dF9oZHIsIGZpbikgOjpcbiAgICBpZiBudWxsID09IGJ1ZiA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICB5aWVsZCBvYmpcbiAgICAgIHJldHVyblxuXG4gICAgbGV0IGkgPSAwLCBsYXN0SW5uZXIgPSBidWYuYnl0ZUxlbmd0aCAtIGZyYWdtZW50X3NpemU7XG4gICAgd2hpbGUgaSA8IGxhc3RJbm5lciA6OlxuICAgICAgY29uc3QgaTAgPSBpXG4gICAgICBpICs9IGZyYWdtZW50X3NpemVcblxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoKVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaTAsIGkpXG4gICAgICB5aWVsZCBvYmpcblxuICAgIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkpXG4gICAgICB5aWVsZCBvYmpcblxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IG91dGJvdW5kID0gW11cbiAgICBvdXRib3VuZC5jaG9vc2UgPSBmcmFtaW5ncy5jaG9vc2VcblxuICAgIGZvciBjb25zdCBmcmFtZSBvZiBmcmFtaW5ncyA6OlxuICAgICAgY29uc3QgaW1wbCA9IGZyYW1lID8gdHJhbnNwb3J0c1tmcmFtZS50cmFuc3BvcnRdIDogbnVsbFxuICAgICAgaWYgISBpbXBsIDo6IGNvbnRpbnVlXG5cbiAgICAgIGNvbnN0IHtiaXRzLCBwYWNrLCB1bnBhY2t9ID0gZnJhbWVcbiAgICAgIGNvbnN0IHBrdF90eXBlID0gaGlnaGJpdHMgfCBiaXRzXG4gICAgICBjb25zdCB7dF9yZWN2fSA9IGltcGxcblxuICAgICAgZnVuY3Rpb24gcGFja19oZHIob2JqKSA6OlxuICAgICAgICBwYWNrKHBrdF90eXBlLCBvYmopXG4gICAgICAgIHJldHVybiBvYmpcblxuICAgICAgZnVuY3Rpb24gcmVjdl9tc2cocGt0LCBzaW5rKSA6OlxuICAgICAgICB1bnBhY2socGt0KVxuICAgICAgICByZXR1cm4gdF9yZWN2KHBrdCwgc2luaylcblxuICAgICAgcGFja19oZHIucGt0X3R5cGUgPSByZWN2X21zZy5wa3RfdHlwZSA9IHBrdF90eXBlXG4gICAgICBvdXRib3VuZFtiaXRzXSA9IHBhY2tfaGRyXG4gICAgICBpbmJvdW5kW3BrdF90eXBlXSA9IHJlY3ZfbXNnXG5cbiAgICAgIGlmICdwcm9kdWN0aW9uJyAhPT0gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgOjpcbiAgICAgICAgY29uc3Qgb3AgPSBwYWNrX2hkci5vcCA9IHJlY3ZfbXNnLm9wID0gZnJhbWUub3BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcGFja19oZHIsICduYW1lJywgQHt9IHZhbHVlOiBgcGFja19oZHIgwqske29wfcK7YFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCByZWN2X21zZywgJ25hbWUnLCBAe30gdmFsdWU6IGByZWN2X21zZyDCqyR7b3B9wrtgXG5cbiAgICByZXR1cm4gb3V0Ym91bmRcblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IHBhY2tCb2R5ID0gdHJhbnNwb3J0cy5wYWNrQm9keVxuICAgIGNvbnN0IG91dGJvdW5kID0gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKVxuICAgIHJldHVybiB0cmFuc3BvcnRzLnN0cmVhbWluZ1xuICAgICAgPyBAe30gc2VuZCwgc3RyZWFtOiBiaW5kX3N0cmVhbSBAIHRyYW5zcG9ydHMuc3RyZWFtaW5nLm1vZGVcbiAgICAgIDogQHt9IHNlbmRcblxuICAgIGZ1bmN0aW9uIHNlbmQoY2hhbiwgb2JqLCBib2R5KSA6OlxuICAgICAgYm9keSA9IHBhY2tCb2R5KGJvZHkpXG4gICAgICBpZiBmcmFnbWVudF9zaXplIDwgYm9keS5ieXRlTGVuZ3RoIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIG9iai50cmFuc3BvcnQgPSAnbXVsdGlwYXJ0J1xuICAgICAgICBjb25zdCBtc2VuZCA9IG1zZW5kX2J5dGVzKGNoYW4sIG9iailcbiAgICAgICAgcmV0dXJuIEB7fSBzZW50OiBtc2VuZCBAIHRydWUsIGJvZHlcblxuICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzaW5nbGUnXG4gICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBwYWNrX2hkcihvYmopXG4gICAgICByZXR1cm4gQHt9IHNlbnQ6IGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIG1zZW5kX2J5dGVzKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGFzeW5jIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBsZXQgcmVzXG4gICAgICAgIGZvciBjb25zdCBvYmogb2YgcGFja2V0RnJhZ21lbnRzIEAgYm9keSwgbmV4dCwgZmluIDo6XG4gICAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICAgIHJlcyA9IGF3YWl0IGNoYW4gQCBwa3RcbiAgICAgICAgaWYgZmluIDo6IG5leHQgPSBudWxsXG4gICAgICAgIHJldHVybiByZXNcblxuICAgIGZ1bmN0aW9uIG1zZW5kX29iamVjdHMoY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBsZXQge25leHR9ID0gcGFja19oZHIob2JqKVxuICAgICAgaWYgbnVsbCAhPT0gbXNnIDo6XG4gICAgICAgIG9iai5ib2R5ID0gbXNnXG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgY2hhbiBAIHBrdFxuXG4gICAgICByZXR1cm4gZnVuY3Rpb24gKGZpbiwgYm9keSkgOjpcbiAgICAgICAgaWYgbnVsbCA9PT0gbmV4dCA6OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvciBAICdXcml0ZSBhZnRlciBlbmQnXG4gICAgICAgIGNvbnN0IG9iaiA9IG5leHQoe2Zpbn0pXG4gICAgICAgIG9iai5ib2R5ID0gYm9keVxuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gICAgZnVuY3Rpb24gYmluZF9zdHJlYW0obW9kZSkgOjpcbiAgICAgIGNvbnN0IG1zZW5kX2ltcGwgPSB7b2JqZWN0OiBtc2VuZF9vYmplY3RzLCBieXRlczogbXNlbmRfYnl0ZXN9W21vZGVdXG4gICAgICBpZiBtc2VuZF9pbXBsIDo6IHJldHVybiBzdHJlYW1cblxuICAgICAgZnVuY3Rpb24gc3RyZWFtKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBvYmoudHJhbnNwb3J0ID0gJ3N0cmVhbWluZydcbiAgICAgICAgY29uc3QgbXNlbmQgPSBtc2VuZF9pbXBsIEAgY2hhbiwgb2JqLCBqc29uX3BhY2sobXNnKVxuICAgICAgICB3cml0ZS53cml0ZSA9IHdyaXRlOyB3cml0ZS5lbmQgPSB3cml0ZS5iaW5kKHRydWUpXG4gICAgICAgIHJldHVybiB3cml0ZVxuXG4gICAgICAgIGZ1bmN0aW9uIHdyaXRlKGNodW5rKSA6OlxuICAgICAgICAgIHJldHVybiBjaHVuayAhPSBudWxsXG4gICAgICAgICAgICA/IG1zZW5kIEAgdHJ1ZT09PXRoaXMsIHBhY2tCb2R5KGNodW5rKVxuICAgICAgICAgICAgOiBtc2VuZCBAIHRydWVcblxuXG5mdW5jdGlvbiBjaGVja19mbnMob2JqLCAuLi5rZXlzKSA6OlxuICBmb3IgY29uc3Qga2V5IG9mIGtleXMgOjpcbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2Ygb2JqW2tleV0gOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgXCIke2tleX1cIiB0byBiZSBhIGZ1bmN0aW9uYFxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ganNvbl9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwganNvbl9wYWNrfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG5cbiAgcmV0dXJuIEB7fVxuICAgIHBhY2tCb2R5XG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0gc2luay5qc29uX3VucGFjayBAIHBrdC5ib2R5X3V0ZjgoKSB8fCB1bmRlZmluZWRcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBib2R5X2J1ZiA9IHN0YXRlLmZlZWQocGt0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IGJvZHlfYnVmIDo6XG4gICAgICAgICAgY29uc3QgbXNnID0gc2luay5qc29uX3VucGFjayBAIHVucGFja191dGY4KGJvZHlfYnVmKSB8fCB1bmRlZmluZWRcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ29iamVjdCdcbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlU3RyZWFtXG4gICAgICAgIHJldHVybiBzdGF0ZS5mZWVkKHBrdCwgdW5wYWNrQm9keSlcblxuICBmdW5jdGlvbiBwYWNrQm9keShib2R5KSA6OlxuICAgIHJldHVybiBwYWNrX3V0ZjggQCBqc29uX3BhY2soYm9keSlcblxuICBmdW5jdGlvbiB1bnBhY2tCb2R5KHBrdCwgc2luaykgOjpcbiAgICByZXR1cm4gc2luay5qc29uX3VucGFjayBAIHBrdC5ib2R5X3V0ZjgoKVxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gYmluYXJ5X3Byb3RvY29sKHNoYXJlZCkgOjpcbiAgY29uc3Qge2NyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG4gIGNvbnN0IHthc0J1ZmZlcn0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keTogYXNCdWZmZXJcblxuICAgIGdldCBkYXRhZ3JhbSgpIDo6IHJldHVybiB0aGlzLmRpcmVjdFxuICAgIGRpcmVjdDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBtc2cgPSBwa3QuYm9keV9idWZmZXIoKVxuICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBwa3QuaW5mb1xuXG4gICAgbXVsdGlwYXJ0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlTXVsdGlwYXJ0XG4gICAgICAgIGNvbnN0IG1zZyA9IHN0YXRlLmZlZWQocGt0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZyA6OlxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuICAgIHN0cmVhbWluZzogQHt9XG4gICAgICBtb2RlOiAnYnl0ZXMnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICBjb25zdCBtc2cgPSBzdGF0ZS5mZWVkKHBrdCwgcGt0X2J1ZmZlcilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2cgOjpcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbmZ1bmN0aW9uIHBrdF9idWZmZXIocGt0KSA6OiByZXR1cm4gcGt0LmJvZHlfYnVmZmVyKClcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGNvbnRyb2xfcHJvdG9jb2woaW5ib3VuZCwgaGlnaCwgc2hhcmVkKSA6OlxuICBjb25zdCB7cmFuZG9tX2lkfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja1BhY2tldE9ian0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG5cbiAgY29uc3QgcGluZ19mcmFtZSA9IGZyYW1pbmdzLmNob29zZSBAOiBmcm9tX2lkOiB0cnVlLCB0b2tlbjogdHJ1ZSwgdHJhbnNwb3J0OiAnZGlyZWN0J1xuICBjb25zdCBwb25nX2ZyYW1lID0gZnJhbWluZ3MuY2hvb3NlIEA6IGZyb21faWQ6IHRydWUsIG1zZ2lkOiB0cnVlLCB0cmFuc3BvcnQ6ICdkYXRhZ3JhbSdcblxuICBjb25zdCBwb25nX3R5cGUgPSBoaWdofDB4ZVxuICBpbmJvdW5kW3BvbmdfdHlwZV0gPSByZWN2X3BvbmdcbiAgY29uc3QgcGluZ190eXBlID0gaGlnaHwweGZcbiAgaW5ib3VuZFtoaWdofDB4Zl0gPSByZWN2X3BpbmdcblxuICByZXR1cm4gQHt9IHNlbmQ6cGluZywgcGluZ1xuXG4gIGZ1bmN0aW9uIHBpbmcoY2hhbiwgb2JqKSA6OlxuICAgIGlmICEgb2JqLnRva2VuIDo6XG4gICAgICBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgIG9iai5ib2R5ID0gSlNPTi5zdHJpbmdpZnkgQDpcbiAgICAgIG9wOiAncGluZycsIHRzMDogbmV3IERhdGUoKVxuICAgIHBpbmdfZnJhbWUucGFjayhwaW5nX3R5cGUsIG9iailcbiAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICBmdW5jdGlvbiByZWN2X3BpbmcocGt0LCBzaW5rLCByb3V0ZXIpIDo6XG4gICAgcGluZ19mcmFtZS51bnBhY2socGt0KVxuICAgIHBrdC5ib2R5ID0gcGt0LmJvZHlfanNvbigpXG4gICAgX3NlbmRfcG9uZyBAIHBrdC5ib2R5LCBwa3QsIHNpbmssIHJvdXRlclxuICAgIHJldHVybiBzaW5rLnJlY3ZDdHJsKHBrdC5ib2R5LCBwa3QuaW5mbylcblxuICBmdW5jdGlvbiBfc2VuZF9wb25nKHt0czB9LCBwa3RfcGluZywgc2luaywgcm91dGVyKSA6OlxuICAgIGNvbnN0IHttc2dpZCwgZnJvbV9pZDpyX2lkfSA9IHBrdF9waW5nLmluZm9cbiAgICBjb25zdCB7aWRfcm91dGVyLCBpZF90YXJnZXR9ID0gcl9pZFxuICAgIGNvbnN0IG9iaiA9IEB7fSBpZF9yb3V0ZXIsIGlkX3RhcmdldFxuICAgICAgZnJvbV9pZDogc2luay5mcm9tX2lkLCBtc2dpZFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkgQDpcbiAgICAgICAgb3A6ICdwb25nJywgdHMwLCB0czE6IG5ldyBEYXRlKClcblxuICAgIHBvbmdfZnJhbWUucGFjayhwb25nX3R5cGUsIG9iailcbiAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgcmV0dXJuIHJvdXRlci5kaXNwYXRjaCBAIFtwa3RdXG5cbiAgZnVuY3Rpb24gcmVjdl9wb25nKHBrdCwgc2luaykgOjpcbiAgICBwb25nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuaW1wb3J0IHNoYXJlZF9wcm90byBmcm9tICcuL3NoYXJlZC5qc3knXG5pbXBvcnQganNvbl9wcm90byBmcm9tICcuL2pzb24uanN5J1xuaW1wb3J0IGJpbmFyeV9wcm90byBmcm9tICcuL2JpbmFyeS5qc3knXG5pbXBvcnQgY29udHJvbF9wcm90byBmcm9tICcuL2NvbnRyb2wuanN5J1xuXG5leHBvcnQgKiBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBpbml0X3Byb3RvY29sKHBhY2tldFBhcnNlciwgb3B0aW9ucykgOjpcbiAgY29uc3Qgc2hhcmVkID0gc2hhcmVkX3Byb3RvIEAgcGFja2V0UGFyc2VyLCBvcHRpb25zXG5cbiAgY29uc3QgaW5ib3VuZCA9IFtdXG4gIGNvbnN0IGpzb24gPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgwMCAvLyAweDAqIOKAlCBKU09OIGJvZHlcbiAgICBqc29uX3Byb3RvKHNoYXJlZClcblxuICBjb25zdCBiaW5hcnkgPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgxMCAvLyAweDEqIOKAlCBiaW5hcnkgYm9keVxuICAgIGJpbmFyeV9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgY29udHJvbCA9IGNvbnRyb2xfcHJvdG8gQCBpbmJvdW5kLFxuICAgIDB4ZjAgLy8gMHhmKiDigJQgY29udHJvbFxuICAgIHNoYXJlZFxuXG4gIGNvbnN0IGNvZGVjcyA9IEA6IGpzb24sIGJpbmFyeSwgY29udHJvbCwgZGVmYXVsdDoganNvblxuXG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIHJldHVybiBAOiBpbmJvdW5kLCBjb2RlY3MsIHJhbmRvbV9pZFxuXG5cbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIEVQVGFyZ2V0IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe30pIDo6XG4gICAgY2xhc3MgRVBUYXJnZXQgZXh0ZW5kcyB0aGlzIDo6XG4gICAgcmV0dXJuIEVQVGFyZ2V0XG5cbiAgY29uc3RydWN0b3IoaWQsIG1zZ19jdHgpIDo6XG4gICAgY29uc3QgcHJvcHMgPSBAe31cbiAgICAgIGlkX3JvdXRlcjogQHt9IGVudW1lcmFibGU6IHRydWUsIHZhbHVlOiBpZC5pZF9yb3V0ZXJcbiAgICAgIGlkX3RhcmdldDogQHt9IGVudW1lcmFibGU6IHRydWUsIHZhbHVlOiBpZC5pZF90YXJnZXRcblxuICAgIGlmIG1zZ19jdHggOjpcbiAgICAgIGxldCBmblxuICAgICAgcHJvcHMuc2VuZCA9IEB7fSBnZXQ6ICgpID0+XG4gICAgICAgIGZuIHx8IEAgZm4gPSBtc2dfY3R4LnRvKHRoaXMpLnNlbmRfanNvblxuXG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgcHJvcHNcblxuXG4gIHZhbHVlT2YoKSA6OiByZXR1cm4gMCB8IHRoaXMuaWRfdGFyZ2V0XG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRVBUYXJnZXQgJHt0aGlzLmVwX2VuY29kZSh0aGlzLCB0cnVlKX3Cu2BcbiAgdG9KU09OKCkgOjogcmV0dXJuIHRoaXMuZXBfZW5jb2RlKHRoaXMpXG4gIGlzRVBUYXJnZXQoKSA6OiByZXR1cm4gdHJ1ZVxuXG4gIHN0YXRpYyBqc29uX2FzX3JlcGx5KG1zZ19jdHgpIDo6XG4gICAgcmV0dXJuIG9iaiA9PiB0aGlzLmZyb21fanNvbihvYmouZnJvbV9pZCwgbXNnX2N0eClcbiAgc3RhdGljIGZyb21fanNvbihpZCwgbXNnX2N0eCkgOjpcbiAgICBpZiBpZCA6OiByZXR1cm4gbmV3IHRoaXMoaWQsIG1zZ19jdHgpXG5cbiAgc3RhdGljIGpzb25VbnBhY2sobXNnX2N0eCwgeGZvcm1CeUtleSkgOjpcbiAgICB4Zm9ybUJ5S2V5ID0gT2JqZWN0LmNyZWF0ZSh4Zm9ybUJ5S2V5IHx8IG51bGwpXG4gICAgeGZvcm1CeUtleVt0aGlzLnRva2VuXSA9IHYgPT5cbiAgICAgIHRoaXMuZnJvbV9qc29uIEAgdGhpcy5lcF9kZWNvZGUodiksIG1zZ19jdHhcbiAgICByZXR1cm4gdGhpcy5qc29uVW5wYWNrQnlLZXkoeGZvcm1CeUtleSlcblxuICBzdGF0aWMganNvblVucGFja0J5S2V5KHhmb3JtQnlLZXkpIDo6XG4gICAgY29uc3QgcmVnID0gbmV3IFdlYWtNYXAoKVxuICAgIHJldHVybiBzeiA9PiBKU09OLnBhcnNlIEAgc3osIHJldml2ZXJcblxuICAgIGZ1bmN0aW9uIHJldml2ZXIoa2V5LCB2YWx1ZSkgOjpcbiAgICAgIGNvbnN0IHhmbiA9IHhmb3JtQnlLZXlba2V5XVxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB4Zm4gOjpcbiAgICAgICAgcmVnLnNldCh0aGlzLCB4Zm4pXG4gICAgICAgIHJldHVybiB2YWx1ZVxuXG4gICAgICBpZiAnb2JqZWN0JyA9PT0gdHlwZW9mIHZhbHVlIDo6XG4gICAgICAgIGNvbnN0IHZmbiA9IHJlZy5nZXQodmFsdWUpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdmZuIDo6XG4gICAgICAgICAgcmV0dXJuIHZmbiBAIHZhbHVlXG4gICAgICByZXR1cm4gdmFsdWVcblxuXG5jb25zdCB0b2tlbiA9ICdcXHUwM0UwJyAvLyAnz6AnXG5FUFRhcmdldC50b2tlbiA9IHRva2VuXG5cbkVQVGFyZ2V0LmVwX2VuY29kZSA9IEVQVGFyZ2V0LnByb3RvdHlwZS5lcF9lbmNvZGUgPSBlcF9lbmNvZGVcbmV4cG9ydCBmdW5jdGlvbiBlcF9lbmNvZGUoZnJvbV9pZCwgc2ltcGxlKSA6OlxuICBsZXQge2lkX3JvdXRlcjpyLCBpZF90YXJnZXQ6dH0gPSBmcm9tX2lkXG4gIHIgPSAocj4+PjApLnRvU3RyaW5nKDM2KVxuICB0ID0gKHQ+Pj4wKS50b1N0cmluZygzNilcbiAgcmV0dXJuIHNpbXBsZVxuICAgID8gYCR7dG9rZW59ICR7cn1+JHt0fWBcbiAgICA6IEB7fSBbdG9rZW5dOiBgJHtyfX4ke3R9YFxuXG5cbkVQVGFyZ2V0LmVwX2RlY29kZSA9IEVQVGFyZ2V0LnByb3RvdHlwZS5lcF9kZWNvZGUgPSBlcF9kZWNvZGVcbmV4cG9ydCBmdW5jdGlvbiBlcF9kZWNvZGUodikgOjpcbiAgY29uc3QgZnJvbV9pZCA9ICdzdHJpbmcnID09PSB0eXBlb2YgdlxuICAgID8gdi5zcGxpdCh0b2tlbilbMV1cbiAgICA6IHZbdG9rZW5dXG4gIGlmICEgZnJvbV9pZCA6OiByZXR1cm5cblxuICBsZXQgW3IsdF0gPSBmcm9tX2lkLnNwbGl0KCd+JylcbiAgaWYgdW5kZWZpbmVkID09PSB0IDo6IHJldHVyblxuICByID0gMCB8IHBhcnNlSW50KHIsIDM2KVxuICB0ID0gMCB8IHBhcnNlSW50KHQsIDM2KVxuXG4gIHJldHVybiBAe30gaWRfcm91dGVyOiByLCBpZF90YXJnZXQ6IHRcblxuIiwiaW1wb3J0IHtlcF9lbmNvZGV9IGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRW5kcG9pbnQgOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7fSkgOjpcbiAgICBjbGFzcyBFbmRwb2ludCBleHRlbmRzIHRoaXMgOjpcbiAgICByZXR1cm4gRW5kcG9pbnRcblxuICB2YWx1ZU9mKCkgOjogcmV0dXJuIHRoaXMuZnJvbV9pZFxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VuZHBvaW50ICR7ZXBfZW5jb2RlKHRoaXMuZnJvbV9pZCwgdHJ1ZSl9wrtgXG5cbiAgY29uc3RydWN0b3IobXNnX2N0eCwgZXBfdGd0KSA6OlxuICAgIG1zZ19jdHggPSBtc2dfY3R4LndpdGhFbmRwb2ludCh0aGlzKVxuICAgIGNvbnN0IGFzUmVwbHkgPSBlcF90Z3QuY29uc3RydWN0b3IuanNvbl9hc19yZXBseShtc2dfY3R4KVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIGZyb21faWQ6IEB7fSB2YWx1ZTogbXNnX2N0eC5mcm9tX2lkLCBlbnVtZXJhYmxlOiB0cnVlXG4gICAgICB0b0pTT046IEB7fSB2YWx1ZSgpIDo6IHJldHVybiBlcF90Z3QudG9KU09OKClcbiAgICAgIHRvOiBAe30gdmFsdWU6IG1zZ19jdHgudG9cbiAgICAgIGFzUmVwbHk6IEB7fSB2YWx1ZTogYXNSZXBseVxuXG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKClcbiAgY3JlYXRlU3RhdGVNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSZXBseU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVRyYWZmaWNNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuXG4gIGJpbmRTaW5rKHNpbmspIDo6XG4gICAgY29uc3QgYnlfdG9rZW4gPSB0aGlzLmNyZWF0ZVJlcGx5TWFwKClcbiAgICBjb25zdCBieV90cmFmZmljID0gdGhpcy5jcmVhdGVUcmFmZmljTWFwKClcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBieV90b2tlbjogQHt9IHZhbHVlOiBieV90b2tlblxuICAgICAgYnlfdHJhZmZpYzogQHt9IHZhbHVlOiBieV90cmFmZmljXG5cbiAgICBjb25zdCB0cmFmZmljID0gKGZyb21faWQsIHRyYWZmaWMpID0+IDo6XG4gICAgICBjb25zdCB0cyA9IERhdGUubm93KClcbiAgICAgIGlmIGZyb21faWQgOjpcbiAgICAgICAgY29uc3QgdCA9IGJ5X3RyYWZmaWMuZ2V0KGZyb21faWQuaWRfdGFyZ2V0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHQgOjpcbiAgICAgICAgICB0LnRzID0gdFtgdHNfJHt0cmFmZmljfWBdID0gdHNcbiAgICAgIHRoaXMucmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpXG5cbiAgICByZXR1cm4gQHt9XG4gICAgICBmcm9tX2lkOiB0aGlzLmZyb21faWRcbiAgICAgIGJ5X21zZ2lkOiB0aGlzLmNyZWF0ZVN0YXRlTWFwKClcblxuICAgICAgcmVjdkN0cmw6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnY3RybCcpXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZDdHJsKG1zZywgaW5mbylcblxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHtybXNnLCBtc2csIGluZm99KS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZNc2c6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnbXNnJylcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdk1zZyhtc2csIGluZm8pXG5cbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnKS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZTdHJlYW1EYXRhOiAocnN0cmVhbSwgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgcmVjdlN0cmVhbTogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgICBjb25zdCByc3RyZWFtID0gdGhpcy5yZWN2U3RyZWFtKG1zZywgaW5mbylcblxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJzdHJlYW0pLnRoZW4ocmVwbHkpXG4gICAgICAgIHJldHVybiByc3RyZWFtXG5cbiAgcmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpIDo6XG4gIHJlY3ZDdHJsKG1zZywgaW5mbykgOjpcbiAgcmVjdk1zZyhtc2csIGluZm8pIDo6XG4gICAgcmV0dXJuIEB7fSBtc2csIGluZm8sIHJlcGx5OiB0aGlzLmFzUmVwbHkoaW5mbylcbiAgcmVjdlN0cmVhbShtc2csIGluZm8pIDo6XG4gICAgY29uc29sZS53YXJuIEAgYFVuaGFuZGxlIHJlY3Ygc3RyZWFtOiAke2luZm99YFxuICAgIHJldHVybiBudWxsXG4gICAgLyogcmV0dXJuIEB7fSBtc2csIGluZm9cbiAgICAgICAgIG9uX2luaXQobXNnLCBwa3QpIDo6IHJldHVybiB0aGlzXG4gICAgICAgICBvbl9kYXRhKGRhdGEsIHBrdCkgOjogdGhpcy5wYXJ0cy5wdXNoIEAgZGF0YVxuICAgICAgICAgb25fZW5kKHJlc3VsdCwgcGt0KSA6OiByZXR1cm4gdGhpcy5wYXJ0cy5qb2luKCcnKVxuICAgICAgICAgb25fZXJyb3IoZXJyLCBwa3QpIDo6IGNvbnNvbGUubG9nIEAgZXJyXG4gICAgKi9cblxuICBpbml0UmVwbHkodG9rZW4sIG1zZ19jdHgpIDo6XG4gICAgcmV0dXJuIHRoaXMuaW5pdFJlcGx5UHJvbWlzZSBAIHRva2VuLCBtc2dfY3R4Lm1zX3RpbWVvdXRcblxuICBpbml0TW9uaXRvcihpZF90YXJnZXQpIDo6XG4gICAgY29uc3Qga2V5ID0gaWRfdGFyZ2V0LmlkX3RhcmdldCB8fCBpZF90YXJnZXRcbiAgICBsZXQgbW9uaXRvciA9IHRoaXMuYnlfdHJhZmZpYy5nZXQgQCBrZXlcbiAgICBpZiB1bmRlZmluZWQgPT09IG1vbml0b3IgOjpcbiAgICAgIG1vbml0b3IgPSBAe30gaWRfdGFyZ2V0LCB0czogRGF0ZS5ub3coKVxuICAgICAgICB0ZCgpIDo6IHJldHVybiBEYXRlLm5vdygpIC0gdGhpcy50c1xuICAgICAgdGhpcy5ieV90cmFmZmljLnNldCBAIGtleSwgbW9uaXRvclxuICAgIHJldHVybiBtb25pdG9yXG5cbiAgaW5pdFJlcGx5UHJvbWlzZSh0b2tlbiwgbXNfdGltZW91dCkgOjpcbiAgICBjb25zdCBhbnMgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICB0aGlzLmJ5X3Rva2VuLnNldCBAIHRva2VuLCByZXNvbHZlXG4gICAgICBpZiBtc190aW1lb3V0IDo6XG4gICAgICAgIGNvbnN0IHRpZCA9IHNldFRpbWVvdXQodGltZW91dCwgbXNfdGltZW91dClcbiAgICAgICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgICAgIGZ1bmN0aW9uIHRpbWVvdXQoKSA6OiByZWplY3QgQCBuZXcgdGhpcy5SZXBseVRpbWVvdXRcblxuICAgIHJldHVybiBzZW50ID0+IDo6XG4gICAgICBhbnMuc2VudCA9IHNlbnRcbiAgICAgIHJldHVybiBhbnNcblxuXG5jbGFzcyBSZXBseVRpbWVvdXQgZXh0ZW5kcyBFcnJvciA6OlxuXG5PYmplY3QuYXNzaWduIEAgRW5kcG9pbnQucHJvdG90eXBlLCBAe31cbiAgUmVwbHlUaW1lb3V0XG5cbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIFNpbmsgOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7aW5ib3VuZH0pIDo6XG4gICAgY2xhc3MgU2luayBleHRlbmRzIHRoaXMgOjpcbiAgICBTaW5rLnByb3RvdHlwZS5fcHJvdG9jb2wgPSBpbmJvdW5kXG4gICAgcmV0dXJuIFNpbmtcblxuICBjb25zdHJ1Y3Rvcihqc29uX3VucGFjaykgOjpcbiAgICB0aGlzLmpzb25fdW5wYWNrID0ganNvbl91bnBhY2tcblxuICByZWdpc3RlcihlbmRwb2ludCwgaHViLCBpZF90YXJnZXQsIGhhbmRsZXJzKSA6OlxuICAgIGNvbnN0IHVucmVnaXN0ZXIgPSAoKSA9PiBodWIucm91dGVyLnVucmVnaXN0ZXJUYXJnZXQoaWRfdGFyZ2V0KVxuXG4gICAgaHViLnJvdXRlci5yZWdpc3RlclRhcmdldCBAIGlkX3RhcmdldCxcbiAgICAgIHRoaXMuX2JpbmREaXNwYXRjaCBAIGVuZHBvaW50LCB1bnJlZ2lzdGVyLCBoYW5kbGVyc1xuICAgIHJldHVybiB0aGlzXG5cbiAgX2JpbmREaXNwYXRjaChlbmRwb2ludCwgdW5yZWdpc3Rlciwge29uX21zZywgb25fZXJyb3IsIG9uX3NodXRkb3dufSkgOjpcbiAgICBsZXQgYWxpdmUgPSB0cnVlXG4gICAgY29uc3QgcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbFxuICAgIGNvbnN0IGlzQWxpdmUgPSAoKSA9PiBhbGl2ZVxuICAgIGNvbnN0IHNodXRkb3duID0gKGVyciwgZXh0cmEpID0+IDo6XG4gICAgICBpZiBhbGl2ZSA6OlxuICAgICAgICB1bnJlZ2lzdGVyKCk7IHVucmVnaXN0ZXIgPSBhbGl2ZSA9IGZhbHNlXG4gICAgICAgIG9uX3NodXRkb3duKGVyciwgZXh0cmEpXG5cbiAgICBPYmplY3QuYXNzaWduIEAgdGhpcywgZW5kcG9pbnQuYmluZFNpbmsodGhpcyksIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuICAgIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG5cbiAgICByZXR1cm4gYXN5bmMgKHBrdCwgcm91dGVyKSA9PiA6OlxuICAgICAgaWYgZmFsc2U9PT1hbGl2ZSB8fCBudWxsPT1wa3QgOjogcmV0dXJuIGFsaXZlXG5cbiAgICAgIGNvbnN0IHJlY3ZfbXNnID0gcHJvdG9jb2xbcGt0LnR5cGVdXG4gICAgICBpZiB1bmRlZmluZWQgPT09IHJlY3ZfbXNnIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZmFsc2UsIEB7fSBwa3QsIHpvbmU6ICdwa3QudHlwZSdcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIHZhciBtc2cgPSBhd2FpdCByZWN2X21zZyBAIHBrdCwgdGhpcywgcm91dGVyXG4gICAgICAgIGlmICEgbXNnIDo6IHJldHVybiBtc2dcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gdm9pZCBvbl9lcnJvciBAIGVyciwgQHt9IHBrdCwgem9uZTogJ3Byb3RvY29sJ1xuXG4gICAgICBpZiBmYWxzZSA9PT0gYWxpdmUgOjpcbiAgICAgICAgcmV0dXJuIGZhbHNlIC8vIGNoYW5nZSB3aGlsZSBhd2FpdGluZyBhYm92ZeKAplxuICAgICAgdHJ5IDo6XG4gICAgICAgIHJldHVybiBhd2FpdCBvbl9tc2cgQCBtc2csIHBrdFxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHRyeSA6OlxuICAgICAgICAgIHZhciB0ZXJtaW5hdGUgPSBvbl9lcnJvciBAIGVyciwgQHt9IG1zZywgcGt0LCB6b25lOiAnZGlzcGF0Y2gnXG4gICAgICAgIGZpbmFsbHkgOjpcbiAgICAgICAgICBpZiBmYWxzZSAhPT0gdGVybWluYXRlIDo6XG4gICAgICAgICAgICBzaHV0ZG93bihlcnIsIHttc2csIHBrdH0pXG4gICAgICAgICAgICByZXR1cm4gZmFsc2UgLy8gc2lnbmFsIHVucmVnaXN0ZXIgdG8gbXNnLWZhYnJpYy1jb3JlL3JvdXRlclxuXG4gIHN0YXRlRm9yKHBrdCwgaWZBYnNlbnQpIDo6XG4gICAgY29uc3QgbXNnaWQgPSBwa3QuaW5mby5tc2dpZFxuICAgIGxldCBlbnRyeSA9IHRoaXMuYnlfbXNnaWQuZ2V0KG1zZ2lkKVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gZW50cnkgOjpcbiAgICAgIGlmICEgbXNnaWQgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYEludmFsaWQgbXNnaWQ6ICR7bXNnaWR9YFxuICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlmQWJzZW50IDo6XG4gICAgICAgIGVudHJ5ID0gaWZBYnNlbnQocGt0LCB0aGlzLCBtc2dpZClcbiAgICAgIGVsc2UgZW50cnkgPSBpZkFic2VudFxuICAgICAgdGhpcy5ieV9tc2dpZC5zZXQgQCBtc2dpZCwgZW50cnlcbiAgICByZXR1cm4gZW50cnlcblxuICBkZWxldGVTdGF0ZUZvcihtc2dpZCkgOjpcbiAgICByZXR1cm4gdGhpcy5ieV9tc2dpZC5kZWxldGUobXNnaWQpXG4iLCJpbXBvcnQge2VwX2VuY29kZX0gZnJvbSAnLi9lcF90YXJnZXQuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNc2dDdHggOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7cmFuZG9tX2lkLCBjb2RlY3N9KSA6OlxuICAgIGNsYXNzIE1zZ0N0eCBleHRlbmRzIHRoaXMgOjpcbiAgICBNc2dDdHgucHJvdG90eXBlLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuICAgIE1zZ0N0eC53aXRoQ29kZWNzIEAgY29kZWNzXG4gICAgcmV0dXJuIE1zZ0N0eFxuXG4gIGluc3BlY3QoKSA6OlxuICAgIGNvbnN0IGN0eCA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuY3R4KVxuICAgIGN0eC5mcm9tID0gZXBfZW5jb2RlKGN0eC5mcm9tX2lkLCB0cnVlKVxuICAgIGN0eC50byA9IGVwX2VuY29kZShjdHgsIHRydWUpXG4gICAgZGVsZXRlIGN0eC5mcm9tX2lkOyBkZWxldGUgY3R4LmlkX3JvdXRlcjsgZGVsZXRlIGN0eC5pZF90YXJnZXRcbiAgICByZXR1cm4gYMKrTXNnQ3R4ICR7SlNPTi5zdHJpbmdpZnkoY3R4KX3Cu2BcblxuICBjb25zdHJ1Y3Rvcihmcm9tX2lkLCByZXNvbHZlUm91dGUpIDo6XG4gICAgaWYgbnVsbCAhPT0gZnJvbV9pZCA6OlxuICAgICAgY29uc3Qge2lkX3RhcmdldCwgaWRfcm91dGVyfSA9IGZyb21faWRcbiAgICAgIGZyb21faWQgPSBPYmplY3QuZnJlZXplIEA6IGlkX3RhcmdldCwgaWRfcm91dGVyXG5cbiAgICBjb25zdCBjdHggPSB7ZnJvbV9pZH1cbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBfcm9vdF86IEA6IHZhbHVlOiB0aGlzXG4gICAgICBmcm9tX2lkOiBAOiB2YWx1ZTogZnJvbV9pZFxuICAgICAgY3R4OiBAOiB2YWx1ZTogY3R4XG4gICAgICByZXNvbHZlUm91dGU6IEA6IHZhbHVlOiByZXNvbHZlUm91dGVcblxuICB3aXRoRW5kcG9pbnQoZW5kcG9pbnQpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBlbmRwb2ludDogQHt9IHZhbHVlOiBlbmRwb2ludFxuXG4gIHN0YXRpYyBmcm9tKGlkX3RhcmdldCwgaHViKSA6OlxuICAgIGNvbnN0IGZyb21faWQgPSBudWxsID09PSBpZF90YXJnZXQgPyBudWxsXG4gICAgICA6IEB7fSBpZF90YXJnZXQsIGlkX3JvdXRlcjogaHViLnJvdXRlci5pZF9zZWxmXG4gICAgcmV0dXJuIG5ldyB0aGlzIEAgZnJvbV9pZCwgaHViLmJpbmRSb3V0ZURpc3BhdGNoKClcblxuICBnZXQgdG8oKSA6OiByZXR1cm4gKC4uLmFyZ3MpID0+IHRoaXMuY2xvbmUoKS53aXRoIEAgLi4uYXJnc1xuXG4gIHBpbmcodG9rZW49dHJ1ZSkgOjogcmV0dXJuIHRoaXMuX2ludm9rZV9leCBAIHRoaXMuX21zZ0NvZGVjcy5jb250cm9sLnBpbmcsIFtdLCB0b2tlblxuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlYy5zZW5kLCBhcmdzXG4gIHN0cmVhbSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5faW52b2tlX2V4IEAgdGhpcy5fY29kZWMuc3RyZWFtLCBhcmdzXG4gIGludm9rZShrZXksIC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLl9pbnZva2VfZXggQCB0aGlzLl9jb2RlY1trZXldLCBhcmdzXG4gIGJpbmRJbnZva2UoZm5PcktleSwgdG9rZW4pIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIGZuT3JLZXkgOjogZm5PcktleSA9IHRoaXMuX2NvZGVjXG4gICAgcmV0dXJuICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXgoZm5PcktleSwgYXJncywgdG9rZW4pXG5cbiAgX2ludm9rZV9leChpbnZva2UsIGFyZ3MsIHRva2VuKSA6OlxuICAgIGNvbnN0IG9iaiA9IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHhcbiAgICBpZiB1bmRlZmluZWQgPT09IHRva2VuIDo6IHRva2VuID0gb2JqLnRva2VuXG5cbiAgICB0aGlzLmFzc2VydE1vbml0b3IoKVxuICAgIGNvbnN0IGNoYW4gPSB0aGlzLnJlc29sdmVSb3V0ZShvYmouaWRfcm91dGVyKVxuICAgIGlmIHRydWUgIT09IHRva2VuIDo6XG4gICAgICBvYmoudG9rZW4gPSB0b2tlblxuICAgICAgcmV0dXJuIGludm9rZSBAIGNoYW4sIG9iaiwgLi4uYXJnc1xuXG4gICAgZWxzZSA6OlxuICAgICAgdG9rZW4gPSBvYmoudG9rZW4gPSB0aGlzLnJhbmRvbV9pZCgpXG4gICAgICBjb25zdCByZXBseSA9IHRoaXMuZW5kcG9pbnQuaW5pdFJlcGx5KHRva2VuLCB0aGlzKVxuICAgICAgcmV0dXJuIHJlcGx5IEAgaW52b2tlIEAgY2hhbiwgb2JqLCAuLi5hcmdzXG5cblxuICB3aXRoKC4uLmFyZ3MpIDo6XG4gICAgY29uc3QgY3R4ID0gdGhpcy5jdHhcbiAgICBmb3IgbGV0IHRndCBvZiBhcmdzIDo6XG4gICAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gdGd0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBjdHguZnJvbV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgY29udGludWVcblxuICAgICAgY29uc3Qge2Zyb21faWQ6IHJlcGx5X2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgdG9rZW4sIG1zZ2lkfSA9IHRndFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IGlkX3RhcmdldCA6OlxuICAgICAgICBpZiB1bmRlZmluZWQgPT09IGlkX3JvdXRlciA6OlxuICAgICAgICAgIGlmICEgY3R4LmlkX3JvdXRlciA6OlxuICAgICAgICAgICAgLy8gaW1wbGljaXRseSBvbiB0aGUgc2FtZSByb3V0ZXJcbiAgICAgICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBjdHguZnJvbV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgZWxzZSBjdHguaWRfcm91dGVyID0gaWRfcm91dGVyXG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSBpZF90YXJnZXRcbiAgICAgIGVsc2UgaWYgdW5kZWZpbmVkICE9PSBpZF9yb3V0ZXIgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFBhc3NpbmcgJ2lkX3JvdXRlcicgcmVxdWlyZXMgJ2lkX3RhcmdldCdgXG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHlfaWQgJiYgISBjdHguaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSByZXBseV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHJlcGx5X2lkLmlkX3RhcmdldFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG5cbiAgICByZXR1cm4gdGhpc1xuXG4gIHdpdGhSZXBseSgpIDo6XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUgQDogdG9rZW46IHRydWVcblxuICByZXNldCguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcy5fcm9vdF8sIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuICBjbG9uZSguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQHt9XG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cblxuICBhc3NlcnRNb25pdG9yKCkgOjpcbiAgICBpZiAhIHRoaXMuY2hlY2tNb25pdG9yKCkgOjpcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBUYXJnZXQgbW9uaXRvciBleHBpcmVkYFxuICBjaGVja01vbml0b3IoKSA6OiByZXR1cm4gdHJ1ZVxuICBtb25pdG9yKG9wdGlvbnM9e30pIDo6XG4gICAgaWYgdHJ1ZSA9PT0gb3B0aW9ucyB8fCBmYWxzZSA9PT0gb3B0aW9ucyA6OlxuICAgICAgb3B0aW9ucyA9IEB7fSBhY3RpdmU6IG9wdGlvbnNcblxuICAgIGNvbnN0IG1vbml0b3IgPSB0aGlzLmVuZHBvaW50LmluaXRNb25pdG9yKHRoaXMuY3R4LmlkX3RhcmdldClcblxuICAgIGNvbnN0IHRzX2R1cmF0aW9uID0gb3B0aW9ucy50c19kdXJhdGlvbiB8fCA1MDAwXG4gICAgbGV0IHRzX2FjdGl2ZSA9IG9wdGlvbnMudHNfYWN0aXZlXG4gICAgaWYgdHJ1ZSA9PT0gdHNfYWN0aXZlIDo6XG4gICAgICB0c19hY3RpdmUgPSB0c19kdXJhdGlvbi80XG5cbiAgICBsZXQgY2hlY2tNb25pdG9yXG4gICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIGNvbnN0IGRvbmUgPSBvcHRpb25zLnJlamVjdCA/IHJlamVjdCA6IHJlc29sdmVcbiAgICAgIHRoaXMuY2hlY2tNb25pdG9yID0gY2hlY2tNb25pdG9yID0gKCkgPT5cbiAgICAgICAgdHNfZHVyYXRpb24gPiBtb25pdG9yLnRkKClcbiAgICAgICAgICA/IHRydWUgOiAoZG9uZShtb25pdG9yKSwgZmFsc2UpXG5cbiAgICBsZXQgdGlkXG4gICAgY29uc3QgdHNfaW50ZXJ2YWwgPSB0c19hY3RpdmUgfHwgdHNfZHVyYXRpb24vNFxuICAgIGlmIG9wdGlvbnMuYWN0aXZlIHx8IHRzX2FjdGl2ZSA6OlxuICAgICAgY29uc3QgY3RybCA9IHRoaXMuY29kZWMoJ2NvbnRyb2wnKVxuICAgICAgY29uc3QgY2hlY2tQaW5nID0gKCkgPT4gOjpcbiAgICAgICAgaWYgdHNfaW50ZXJ2YWwgPiBtb25pdG9yLnRkKCkgOjpcbiAgICAgICAgICBjdHJsLmludm9rZSgncGluZycpXG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrUGluZywgdHNfaW50ZXJ2YWxcbiAgICBlbHNlIDo6XG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrTW9uaXRvciwgdHNfaW50ZXJ2YWxcbiAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcbiAgICBjb25zdCBjbGVhciA9ICgpID0+IGNsZWFySW50ZXJ2YWwodGlkKVxuXG4gICAgcHJvbWlzZS50aGVuKGNsZWFyLCBjbGVhcilcbiAgICByZXR1cm4gcHJvbWlzZVxuXG5cbiAgY29kZWMobXNnX2NvZGVjLCAuLi5hcmdzKSA6OlxuICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgbXNnX2NvZGVjIDo6XG4gICAgICBtc2dfY29kZWMgPSB0aGlzLl9tc2dDb2RlY3NbbXNnX2NvZGVjXVxuXG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG1zZ19jb2RlYy5zZW5kIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBhY2tldCBjb2RlYyBwcm90b2NvbGBcblxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQDpcbiAgICAgIF9jb2RlYzogQDogdmFsdWU6IG1zZ19jb2RlY1xuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG4gIHN0YXRpYyB3aXRoQ29kZWNzKG1zZ0NvZGVjcykgOjpcbiAgICBmb3IgY29uc3QgW25hbWUsIG1zZ19jb2RlY10gb2YgT2JqZWN0LmVudHJpZXMgQCBtc2dDb2RlY3MgOjpcbiAgICAgIHRoaXMucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSA6OlxuICAgICAgICByZXR1cm4gdGhpcy5jb2RlYyBAIG1zZ19jb2RlY1xuICAgIHRoaXMucHJvdG90eXBlLl9tc2dDb2RlY3MgPSBtc2dDb2RlY3NcbiAgICB0aGlzLnByb3RvdHlwZS5fY29kZWMgPSBtc2dDb2RlY3MuZGVmYXVsdFxuXG4gICAgLy8gYmluZCBzZW5kX2pzb24gYXMgZnJlcXVlbnRseSB1c2VkIGZhc3QtcGF0aFxuICAgIGNvbnN0IGpzb25fc2VuZCA9IG1zZ0NvZGVjcy5qc29uLnNlbmRcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMucHJvdG90eXBlLCBAOlxuICAgICAgc2VuZF9qc29uOiBAe30gZ2V0KCkgOjpcbiAgICAgICAgcmV0dXJuICguLi5hcmdzKSA9PiB0aGlzLl9pbnZva2VfZXggQCBqc29uX3NlbmQsIGFyZ3NcblxuICAgIHJldHVybiB0aGlzXG5cbk9iamVjdC5hc3NpZ24gQCBNc2dDdHgucHJvdG90eXBlLCBAe31cbiAgbXNfdGltZW91dDogNTAwMFxuXG4iLCJpbXBvcnQgaW5pdF9wcm90b2NvbCBmcm9tICcuL3Byb3RvY29sL2luZGV4LmpzeSdcbmltcG9ydCBFbmRwb2ludEJhc2UgZnJvbSAnLi9lbmRwb2ludC5qc3knXG5pbXBvcnQgRVBUYXJnZXRCYXNlIGZyb20gJy4vZXBfdGFyZ2V0LmpzeSdcbmltcG9ydCBTaW5rQmFzZSBmcm9tICcuL3NpbmsuanN5J1xuaW1wb3J0IE1zZ0N0eEJhc2UgZnJvbSAnLi9tc2djdHguanN5J1xuXG5jb25zdCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zID0gQDpcbiAgb25fZXJyb3IoZXJyLCB7bXNnLCBwa3R9KSA6OlxuICAgIGNvbnNvbGUuZXJyb3IgQCAnRU5EUE9JTlQgRVJST1I6JywgZXJyLCBAe30gbXNnLCBwa3RcbiAgICAvLyByZXR1cm4gZmFsc2UgdG8gcHJldmVudCBhdXRvLXNodXRkb3duXG4gIG9uX3NodXRkb3duKGVyciwge21zZywgcGt0fSkgOjpcbiAgICBjb25zb2xlLmVycm9yIEAgJ0VORFBPSU5UIFNIVVRET1dOOicgKyBlcnJcblxuICBzdWJjbGFzcyh7RW5kcG9pbnQsIEVQVGFyZ2V0LCBTaW5rLCBNc2dDdHgsIHByb3RvY29sc30pIDo6XG5cbiAganNvbl9wYWNrOiBKU09OLnN0cmluZ2lmeVxuXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBsdWdpbl9vcHRpb25zKSA6OlxuICBwbHVnaW5fb3B0aW9ucyA9IE9iamVjdC5hc3NpZ24gQCB7fSwgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucywgcGx1Z2luX29wdGlvbnNcbiAgY29uc3QgQHt9XG4gICAgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBvbl9lcnJvcjogZGVmYXVsdF9vbl9lcnJvclxuICAgIG9uX3NodXRkb3duOiBkZWZhdWx0X29uX3NodXRkb3duXG4gID0gcGx1Z2luX29wdGlvbnNcblxuICByZXR1cm4gQDogb3JkZXI6IDEsIHN1YmNsYXNzLCBwb3N0XG4gIFxuICBmdW5jdGlvbiBzdWJjbGFzcyhGYWJyaWNIdWJfUEksIGJhc2VzKSA6OlxuICAgIGNvbnN0IHtwYWNrZXRQYXJzZXJ9ID0gRmFicmljSHViX1BJLnByb3RvdHlwZVxuICAgIGlmIG51bGw9PXBhY2tldFBhcnNlciB8fCAhIHBhY2tldFBhcnNlci5pc1BhY2tldFBhcnNlcigpIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEludmFsaWQgcGFja2V0UGFyc2VyIGZvciBwbHVnaW5gXG4gICAgXG4gICAgRmFicmljSHViX1BJLnByb3RvdHlwZS5lbmRwb2ludCA9XG4gICAgICBiaW5kRW5kcG9pbnRBcGkgQCBwYWNrZXRQYXJzZXJcblxuICBmdW5jdGlvbiBwb3N0KGh1YikgOjpcbiAgICByZXR1cm4gaHViLmVuZHBvaW50ID0gaHViLmVuZHBvaW50KGh1YilcblxuICBmdW5jdGlvbiBiaW5kRW5kcG9pbnRBcGkocGFja2V0UGFyc2VyKSA6OlxuICAgIGNvbnN0IHByb3RvY29scyA9IGluaXRfcHJvdG9jb2wgQCBwYWNrZXRQYXJzZXIsIEB7fSByYW5kb21faWQsIGpzb25fcGFja1xuICAgIGNvbnN0IFNpbmsgPSBTaW5rQmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgIGNvbnN0IE1zZ0N0eCA9IE1zZ0N0eEJhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICBjb25zdCBFbmRwb2ludCA9IEVuZHBvaW50QmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgIGNvbnN0IEVQVGFyZ2V0ID0gRVBUYXJnZXRCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG5cbiAgICBwbHVnaW5fb3B0aW9ucy5zdWJjbGFzcyBAOlxuICAgICAgRW5kcG9pbnQsIEVQVGFyZ2V0LCBTaW5rLCBNc2dDdHgsIHByb3RvY29sc1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGh1YikgOjpcbiAgICAgIHJldHVybiBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEA6IGNyZWF0ZSwgc2VydmVyOiBlbmRwb2ludCwgY2xpZW50XG5cbiAgICAgIGZ1bmN0aW9uIGNsaWVudCguLi5hcmdzKSA6OlxuICAgICAgICBjb25zdCBtc2dfY3R4ID0gTXNnQ3R4LmZyb20gQCBudWxsLCBodWJcbiAgICAgICAgcmV0dXJuIDAgIT09IGFyZ3MubGVuZ3RoXG4gICAgICAgICAgPyBtc2dfY3R4LndpdGgoLi4uYXJncykgOiBtc2dfY3R4XG5cbiAgICAgIGZ1bmN0aW9uIGVuZHBvaW50KG9uX2luaXQpIDo6XG4gICAgICAgIGNvbnN0IHRhcmdldHMgPSBodWIucm91dGVyLnRhcmdldHNcbiAgICAgICAgZG8gdmFyIGlkX3RhcmdldCA9IHJhbmRvbV9pZCgpXG4gICAgICAgIHdoaWxlIHRhcmdldHMuaGFzIEAgaWRfdGFyZ2V0XG4gICAgICAgIHJldHVybiBjcmVhdGUgQCBpZF90YXJnZXQsIG9uX2luaXRcblxuICAgICAgZnVuY3Rpb24gY3JlYXRlKGlkX3RhcmdldCwgb25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IE1zZ0N0eC5mcm9tIEAgaWRfdGFyZ2V0LCBodWJcbiAgICAgICAgY29uc3QgZXBfdGd0ID0gbmV3IEVQVGFyZ2V0KG1zZ19jdHguZnJvbV9pZClcbiAgICAgICAgY29uc3QgZXAgPSBuZXcgRW5kcG9pbnQobXNnX2N0eCwgZXBfdGd0KVxuXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IG9uX2luaXQoZXAsIGh1YilcbiAgICAgICAgY29uc3Qgb25fbXNnID0gKHRhcmdldC5vbl9tc2cgfHwgdGFyZ2V0KS5iaW5kKHRhcmdldClcbiAgICAgICAgY29uc3Qgb25fZXJyb3IgPSAodGFyZ2V0Lm9uX2Vycm9yIHx8IGRlZmF1bHRfb25fZXJyb3IpLmJpbmQodGFyZ2V0KVxuICAgICAgICBjb25zdCBvbl9zaHV0ZG93biA9ICh0YXJnZXQub25fc2h1dGRvd24gfHwgZGVmYXVsdF9vbl9zaHV0ZG93bikuYmluZCh0YXJnZXQpXG5cbiAgICAgICAgY29uc3QganNvbl91bnBhY2sgPSB0YXJnZXQuanNvbl91bnBhY2tcbiAgICAgICAgICA/IHRhcmdldC5qc29uX3VucGFjay5iaW5kKHRhcmdldClcbiAgICAgICAgICA6IEVQVGFyZ2V0Lmpzb25VbnBhY2sobXNnX2N0eClcblxuICAgICAgICBjb25zdCBzaW5rID0gbmV3IFNpbmsgQCBqc29uX3VucGFja1xuICAgICAgICBzaW5rLnJlZ2lzdGVyIEAgZXAsIGh1YiwgaWRfdGFyZ2V0LFxuICAgICAgICAgIEB7fSBvbl9tc2csIG9uX2Vycm9yLCBvbl9zaHV0ZG93blxuXG4gICAgICAgIGxldCByZWFkeSA9IFByb21pc2UucmVzb2x2ZSh0YXJnZXQpXG4gICAgICAgIGlmIHRhcmdldC5vbl9yZWFkeSA6OlxuICAgICAgICAgIHJlYWR5ID0gcmVhZHkudGhlbiBAIHRhcmdldCA9PiB0YXJnZXQub25fcmVhZHkoKVxuXG4gICAgICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIGVwX3RndCwgQHt9XG4gICAgICAgICAgcmVhZHk6IEB7fSB2YWx1ZTogcmVhZHkudGhlbiBAICgpID0+IGVwX3RndFxuXG4iLCJpbXBvcnQgZW5kcG9pbnRfcGx1Z2luIGZyb20gJy4vcGx1Z2luLmpzeSdcblxuY29uc3QgZ2V0UmFuZG9tVmFsdWVzID0gJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiB3aW5kb3dcbiAgPyB3aW5kb3cuY3J5cHRvLmdldFJhbmRvbVZhbHVlcyA6IG51bGxcblxuZW5kcG9pbnRfYnJvd3Nlci5yYW5kb21faWQgPSByYW5kb21faWRcbmZ1bmN0aW9uIHJhbmRvbV9pZCgpIDo6XG4gIGNvbnN0IGFyciA9IG5ldyBJbnQzMkFycmF5KDEpXG4gIGdldFJhbmRvbVZhbHVlcyhhcnIpXG4gIHJldHVybiBhcnJbMF1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gZW5kcG9pbnRfYnJvd3NlcihwbHVnaW5fb3B0aW9ucz17fSkgOjpcbiAgaWYgbnVsbCA9PSBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgOjpcbiAgICBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgPSByYW5kb21faWRcblxuICByZXR1cm4gZW5kcG9pbnRfcGx1Z2luKHBsdWdpbl9vcHRpb25zKVxuXG4iXSwibmFtZXMiOlsibGl0dGxlX2VuZGlhbiIsImNfc2luZ2xlIiwiY19kYXRhZ3JhbSIsImNfZGlyZWN0IiwiY19tdWx0aXBhcnQiLCJjX3N0cmVhbWluZyIsIl9lcnJfbXNnaWRfcmVxdWlyZWQiLCJfZXJyX3Rva2VuX3JlcXVpcmVkIiwiZnJtX3JvdXRpbmciLCJzaXplIiwiYml0cyIsIm1hc2siLCJvYmoiLCJmcm9tX2lkIiwiZHYiLCJvZmZzZXQiLCJzZXRJbnQzMiIsImlkX3JvdXRlciIsImlkX3RhcmdldCIsInVuZGVmaW5lZCIsImdldEludDMyIiwiZnJtX3Jlc3BvbnNlIiwibXNnaWQiLCJFcnJvciIsInNldEludDE2Iiwic2VxX2FjayIsImFja19mbGFncyIsInRva2VuIiwiZ2V0SW50MTYiLCJmcm1fZGF0YWdyYW0iLCJ0cmFuc3BvcnQiLCJmcm1fZGlyZWN0IiwiZnJtX211bHRpcGFydCIsInNlcV9wb3MiLCJzZXEiLCJzZXFfZmxhZ3MiLCJmcm1fc3RyZWFtaW5nIiwiYmluZF9zZXFfbmV4dCIsInNlcV9vZmZzZXQiLCJzZXFfbmV4dCIsImZsYWdzIiwiZmluIiwiTmFOIiwiY29tcG9zZUZyYW1pbmdzIiwiZnJtX2Zyb20iLCJmcm1fcmVzcCIsImZybV90cmFuc3BvcnRzIiwibGVuZ3RoIiwiYnlCaXRzIiwidF9mcm9tIiwiZl90ZXN0IiwidF9yZXNwIiwidDAiLCJ0MSIsInQyIiwidDMiLCJtYXAiLCJmIiwidGVzdEJpdHMiLCJjaG9vc2UiLCJsc3QiLCJUIiwiYiIsIm9wIiwiZm5fa2V5IiwiZm5fdHJhbiIsImZuX2Zyb20iLCJmbl9yZXNwIiwiZnJtIiwiYmluZEFzc2VtYmxlZCIsImZfcGFjayIsImZfdW5wYWNrIiwicGFjayIsInVucGFjayIsInBrdF90eXBlIiwicGt0X29iaiIsIlR5cGVFcnJvciIsInR5cGUiLCJEYXRhVmlldyIsIkFycmF5QnVmZmVyIiwiaGVhZGVyIiwiYnVmZmVyIiwic2xpY2UiLCJwa3QiLCJidWYiLCJoZWFkZXJfYnVmZmVyIiwiVWludDhBcnJheSIsImluZm8iLCJfYmluZF9pdGVyYWJsZSIsImJ1Zl9jbG9uZSIsInR0bCIsIm5leHQiLCJvcHRpb25zIiwiZG9uZSIsInZhbHVlIiwicGFja2V0UGFyc2VyIiwiZnJhZ21lbnRfc2l6ZSIsImNvbmNhdEJ1ZmZlcnMiLCJwYWNrUGFja2V0T2JqIiwicGFja191dGY4IiwidW5wYWNrX3V0ZjgiLCJOdW1iZXIiLCJyYW5kb21faWQiLCJqc29uX3BhY2siLCJjcmVhdGVTdHJlYW0iLCJwYWNrZXRGcmFnbWVudHMiLCJjcmVhdGVNdWx0aXBhcnQiLCJzaW5rIiwicGFydHMiLCJmZWVkIiwiYm9keV9idWZmZXIiLCJpbmNsdWRlcyIsImRlbGV0ZVN0YXRlRm9yIiwicmVzIiwicmVjdkRhdGEiLCJyc3RyZWFtIiwic3RhdGUiLCJmZWVkX2luaXQiLCJhc19jb250ZW50IiwiZmVlZF9pZ25vcmUiLCJtc2ciLCJqc29uX3VucGFjayIsImJvZHlfdXRmOCIsInJlY3ZTdHJlYW0iLCJyZWN2U3RyZWFtRGF0YSIsImJpbmQiLCJlcnIiLCJvbl9lcnJvciIsImZlZWRfYm9keSIsIm9uX2luaXQiLCJkYXRhIiwib25fZGF0YSIsIm9uX2VuZCIsImZlZWRfc2VxIiwibmV4dF9oZHIiLCJpIiwibGFzdElubmVyIiwiYnl0ZUxlbmd0aCIsImkwIiwiYm9keSIsImJpbmRUcmFuc3BvcnRJbXBscyIsImluYm91bmQiLCJoaWdoYml0cyIsInRyYW5zcG9ydHMiLCJvdXRib3VuZCIsImZyYW1pbmdzIiwiZnJhbWUiLCJpbXBsIiwidF9yZWN2IiwicGFja19oZHIiLCJyZWN2X21zZyIsImJpbmRUcmFuc3BvcnRzIiwicGFja0JvZHkiLCJzdHJlYW1pbmciLCJzZW5kIiwic3RyZWFtIiwiYmluZF9zdHJlYW0iLCJtb2RlIiwiY2hhbiIsIm1zZW5kIiwibXNlbmRfYnl0ZXMiLCJzZW50IiwibXNlbmRfb2JqZWN0cyIsIm1zZW5kX2ltcGwiLCJvYmplY3QiLCJieXRlcyIsIndyaXRlIiwiZW5kIiwiY2h1bmsiLCJjaGVja19mbnMiLCJrZXlzIiwia2V5IiwianNvbl9wcm90b2NvbCIsInNoYXJlZCIsImRhdGFncmFtIiwiZGlyZWN0IiwicmVjdk1zZyIsInN0YXRlRm9yIiwiYm9keV9idWYiLCJ1bnBhY2tCb2R5IiwiYmluYXJ5X3Byb3RvY29sIiwiYXNCdWZmZXIiLCJwa3RfYnVmZmVyIiwiY29udHJvbF9wcm90b2NvbCIsImhpZ2giLCJwaW5nX2ZyYW1lIiwicG9uZ19mcmFtZSIsInBvbmdfdHlwZSIsInJlY3ZfcG9uZyIsInBpbmdfdHlwZSIsInJlY3ZfcGluZyIsInBpbmciLCJKU09OIiwic3RyaW5naWZ5IiwidHMwIiwiRGF0ZSIsInJvdXRlciIsImJvZHlfanNvbiIsInJlY3ZDdHJsIiwiX3NlbmRfcG9uZyIsInBrdF9waW5nIiwicl9pZCIsInRzMSIsImRpc3BhdGNoIiwiaW5pdF9wcm90b2NvbCIsInNoYXJlZF9wcm90byIsImpzb24iLCJqc29uX3Byb3RvIiwiYmluYXJ5IiwiYmluYXJ5X3Byb3RvIiwiY29udHJvbCIsImNvbnRyb2xfcHJvdG8iLCJjb2RlY3MiLCJkZWZhdWx0IiwiRVBUYXJnZXQiLCJmb3JQcm90b2NvbHMiLCJpZCIsIm1zZ19jdHgiLCJwcm9wcyIsImVudW1lcmFibGUiLCJmbiIsImdldCIsInRvIiwic2VuZF9qc29uIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydGllcyIsImVwX2VuY29kZSIsImpzb25fYXNfcmVwbHkiLCJmcm9tX2pzb24iLCJqc29uVW5wYWNrIiwieGZvcm1CeUtleSIsImNyZWF0ZSIsInYiLCJlcF9kZWNvZGUiLCJqc29uVW5wYWNrQnlLZXkiLCJyZWciLCJXZWFrTWFwIiwic3oiLCJwYXJzZSIsInJldml2ZXIiLCJ4Zm4iLCJzZXQiLCJ2Zm4iLCJwcm90b3R5cGUiLCJzaW1wbGUiLCJyIiwidCIsInRvU3RyaW5nIiwic3BsaXQiLCJwYXJzZUludCIsIkVuZHBvaW50IiwiZXBfdGd0Iiwid2l0aEVuZHBvaW50IiwiYXNSZXBseSIsImNvbnN0cnVjdG9yIiwidG9KU09OIiwiTWFwIiwiY3JlYXRlTWFwIiwiYnlfdG9rZW4iLCJjcmVhdGVSZXBseU1hcCIsImJ5X3RyYWZmaWMiLCJjcmVhdGVUcmFmZmljTWFwIiwidHJhZmZpYyIsInRzIiwibm93IiwicmVjdlRyYWZmaWMiLCJjcmVhdGVTdGF0ZU1hcCIsInJtc2ciLCJyZXBseSIsInJlc29sdmUiLCJ0aGVuIiwid2FybiIsImluaXRSZXBseSIsImluaXRSZXBseVByb21pc2UiLCJtc190aW1lb3V0IiwibW9uaXRvciIsImFucyIsIlByb21pc2UiLCJyZWplY3QiLCJ0aWQiLCJzZXRUaW1lb3V0IiwidGltZW91dCIsInVucmVmIiwiUmVwbHlUaW1lb3V0IiwiYXNzaWduIiwiU2luayIsIl9wcm90b2NvbCIsImVuZHBvaW50IiwiaHViIiwiaGFuZGxlcnMiLCJ1bnJlZ2lzdGVyIiwidW5yZWdpc3RlclRhcmdldCIsInJlZ2lzdGVyVGFyZ2V0IiwiX2JpbmREaXNwYXRjaCIsIm9uX21zZyIsIm9uX3NodXRkb3duIiwiYWxpdmUiLCJwcm90b2NvbCIsImlzQWxpdmUiLCJzaHV0ZG93biIsImV4dHJhIiwiYmluZFNpbmsiLCJ6b25lIiwidGVybWluYXRlIiwiaWZBYnNlbnQiLCJlbnRyeSIsImJ5X21zZ2lkIiwiZGVsZXRlIiwiTXNnQ3R4Iiwid2l0aENvZGVjcyIsImN0eCIsImZyb20iLCJyZXNvbHZlUm91dGUiLCJmcmVlemUiLCJpZF9zZWxmIiwiYmluZFJvdXRlRGlzcGF0Y2giLCJhcmdzIiwiY2xvbmUiLCJ3aXRoIiwiX2ludm9rZV9leCIsIl9tc2dDb2RlY3MiLCJfY29kZWMiLCJmbk9yS2V5IiwiaW52b2tlIiwiYXNzZXJ0TW9uaXRvciIsInRndCIsInJlcGx5X2lkIiwiX3Jvb3RfIiwiY2hlY2tNb25pdG9yIiwiYWN0aXZlIiwiaW5pdE1vbml0b3IiLCJ0c19kdXJhdGlvbiIsInRzX2FjdGl2ZSIsInByb21pc2UiLCJ0ZCIsInRzX2ludGVydmFsIiwiY3RybCIsImNvZGVjIiwiY2hlY2tQaW5nIiwic2V0SW50ZXJ2YWwiLCJjbGVhciIsImNsZWFySW50ZXJ2YWwiLCJtc2dfY29kZWMiLCJtc2dDb2RlY3MiLCJuYW1lIiwiZW50cmllcyIsImpzb25fc2VuZCIsImRlZmF1bHRfcGx1Z2luX29wdGlvbnMiLCJlcnJvciIsInByb3RvY29scyIsInBsdWdpbl9vcHRpb25zIiwiZGVmYXVsdF9vbl9lcnJvciIsImRlZmF1bHRfb25fc2h1dGRvd24iLCJvcmRlciIsInN1YmNsYXNzIiwicG9zdCIsIkZhYnJpY0h1Yl9QSSIsImJhc2VzIiwiaXNQYWNrZXRQYXJzZXIiLCJiaW5kRW5kcG9pbnRBcGkiLCJTaW5rQmFzZSIsIk1zZ0N0eEJhc2UiLCJFbmRwb2ludEJhc2UiLCJFUFRhcmdldEJhc2UiLCJzZXJ2ZXIiLCJjbGllbnQiLCJ0YXJnZXRzIiwiaGFzIiwiZXAiLCJ0YXJnZXQiLCJyZWdpc3RlciIsInJlYWR5Iiwib25fcmVhZHkiLCJnZXRSYW5kb21WYWx1ZXMiLCJ3aW5kb3ciLCJjcnlwdG8iLCJlbmRwb2ludF9icm93c2VyIiwiYXJyIiwiSW50MzJBcnJheSIsImVuZHBvaW50X3BsdWdpbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsTUFBTUEsZ0JBQWdCLElBQXRCO0FBQ0EsTUFBTUMsV0FBVyxRQUFqQjtBQUNBLE1BQU1DLGFBQWEsVUFBbkI7QUFDQSxNQUFNQyxXQUFXLFFBQWpCO0FBQ0EsTUFBTUMsY0FBYyxXQUFwQjtBQUNBLE1BQU1DLGNBQWMsV0FBcEI7O0FBRUEsTUFBTUMsc0JBQXVCLDBCQUE3QjtBQUNBLE1BQU1DLHNCQUF1QiwyQkFBN0I7O0FBR0EsU0FBU0MsV0FBVCxHQUF1QjtRQUNmQyxPQUFPLENBQWI7UUFBZ0JDLE9BQU8sR0FBdkI7UUFBNEJDLE9BQU8sR0FBbkM7U0FDTztRQUFBLEVBQ0NELElBREQsRUFDT0MsSUFEUDs7V0FHRUMsR0FBUCxFQUFZO2FBQVUsUUFBUUEsSUFBSUMsT0FBWixHQUFzQkgsSUFBdEIsR0FBNkIsS0FBcEM7S0FIVjs7V0FLRUUsR0FBUCxFQUFZRSxFQUFaLEVBQWdCQyxNQUFoQixFQUF3QjtZQUNoQixFQUFDRixPQUFELEtBQVlELEdBQWxCO1NBQ0dJLFFBQUgsQ0FBYyxJQUFFRCxNQUFoQixFQUF3QixJQUFFRixRQUFRSSxTQUFsQyxFQUE2Q2pCLGFBQTdDO1NBQ0dnQixRQUFILENBQWMsSUFBRUQsTUFBaEIsRUFBd0IsSUFBRUYsUUFBUUssU0FBbEMsRUFBNkNsQixh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

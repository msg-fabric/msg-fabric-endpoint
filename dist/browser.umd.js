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

class Endpoint {
  static forProtocols({}) {
    class Endpoint extends this {}
    return Endpoint;
  }

  valueOf() {
    return this.from_id;
  }
  inspect() {
    return `«Endpoint ${this.from_id.id_target}»`;
  }

  constructor(msg_ctx) {
    msg_ctx = msg_ctx.withEndpoint(this);
    Object.defineProperties(this, {
      from_id: { value: msg_ctx.from_id, enumerable: true },
      to: { value: msg_ctx.to } });
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
    return { msg, info };
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
  }initReply(token, msg_ctx, kind) {
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
    return this.codec('control', { token }).invoke('ping');
  }
  send(...args) {
    return this.invoke('send', ...args);
  }
  stream(...args) {
    return this.invoke('stream', ...args);
  }

  invoke(key, ...args) {
    const obj = Object.assign({}, this.ctx);
    this.assertMonitor();
    const chan = this.resolveRoute(obj.id_router);
    if (true !== obj.token) {
      return this._codec[key](chan, obj, ...args);
    } else {
      const token = obj.token = this.random_id();
      const reply = this.endpoint.initReply(token, this, key);
      return reply(this._codec[key](chan, obj, ...args));
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

  subclass({ Sink: Sink$$1, Endpoint: Endpoint$$1, MsgCtx: MsgCtx$$1, protocols }) {},

  msg_unpack(ep) {
    return JSON.parse;
  },
  msg_pack() {
    return JSON.stringify;
  } };

var endpoint_plugin = function (plugin_options) {
  plugin_options = Object.assign({}, default_plugin_options, plugin_options);
  const {
    random_id, msg_unpack, msg_pack,
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
    const protocols = init_protocol(packetParser, { random_id, json_pack: msg_pack() });
    const Sink$$1 = Sink.forProtocols(protocols);
    const MsgCtx$$1 = MsgCtx.forProtocols(protocols);
    const Endpoint$$1 = Endpoint.forProtocols(protocols);

    plugin_options.subclass({
      Sink: Sink$$1, Endpoint: Endpoint$$1, MsgCtx: MsgCtx$$1, protocols });

    return function (hub) {
      return Object.assign(endpoint, { create, server: endpoint, client });

      function client(...args) {
        const msg_ctx = MsgCtx$$1.from(null, hub);
        return 0 !== args.length ? msg_ctx.with(...args) : msg_ctx;
      }

      function endpoint(on_init) {
        return create(random_id(), on_init);
      }

      function create(id_target, on_init) {
        const msg_ctx = MsgCtx$$1.from(id_target, hub);
        const ep = new Endpoint$$1(msg_ctx);

        const target = on_init(ep, hub);
        const on_msg = (target.on_msg || target).bind(target);
        const on_error = (target.on_error || default_on_error).bind(target);
        const on_shutdown = (target.on_shutdown || default_on_shutdown).bind(target);

        const sink = new Sink$$1(ep.json_unpack || msg_unpack(ep));
        sink.register(ep, hub, id_target, { on_msg, on_error, on_shutdown });

        let ready = Promise.resolve(target);
        if (target.on_ready) {
          ready = ready.then(target => target.on_ready());
        }

        const res = Object.create(endpoint_target_api, {
          id_router: { enumerable: true, value: hub.router.id_self },
          id_target: { enumerable: true, value: id_target },
          ready: { value: ready.then(() => res) } });
        return res;
      }
    };
  }
};

const endpoint_target_api = {
  valueOf() {
    return 0 | this.id_target;
  },
  inspect() {
    return `«Endpoint Target ${this.id_target}»`;
  } };

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3Nlci51bWQuanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvcHJvdG9jb2wvZnJhbWluZy5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL3NoYXJlZC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2pzb24uanN5IiwiLi4vY29kZS9wcm90b2NvbC9iaW5hcnkuanN5IiwiLi4vY29kZS9wcm90b2NvbC9jb250cm9sLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvaW5kZXguanN5IiwiLi4vY29kZS9lbmRwb2ludC5qc3kiLCIuLi9jb2RlL3NpbmsuanN5IiwiLi4vY29kZS9tc2djdHguanN5IiwiLi4vY29kZS9wbHVnaW4uanN5IiwiLi4vY29kZS9pbmRleC5icm93c2VyLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBsaXR0bGVfZW5kaWFuID0gdHJ1ZVxuY29uc3QgY19zaW5nbGUgPSAnc2luZ2xlJ1xuY29uc3QgY19kYXRhZ3JhbSA9ICdkYXRhZ3JhbSdcbmNvbnN0IGNfZGlyZWN0ID0gJ2RpcmVjdCdcbmNvbnN0IGNfbXVsdGlwYXJ0ID0gJ211bHRpcGFydCdcbmNvbnN0IGNfc3RyZWFtaW5nID0gJ3N0cmVhbWluZydcblxuY29uc3QgX2Vycl9tc2dpZF9yZXF1aXJlZCA9IGBSZXNwb25zZSByZXFpcmVzICdtc2dpZCdgXG5jb25zdCBfZXJyX3Rva2VuX3JlcXVpcmVkID0gYFRyYW5zcG9ydCByZXFpcmVzICd0b2tlbidgXG5cblxuZnVuY3Rpb24gZnJtX3JvdXRpbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MSwgbWFzayA9IDB4MVxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLmZyb21faWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCB7ZnJvbV9pZH0gPSBvYmpcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF9yb3V0ZXIsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDMyIEAgNCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF90YXJnZXQsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IGZyb21faWQgPSB1bmRlZmluZWQgPT09IG9iai5mcm9tX2lkXG4gICAgICAgID8gb2JqLmZyb21faWQgPSB7fSA6IG9iai5mcm9tX2lkXG4gICAgICBmcm9tX2lkLmlkX3JvdXRlciA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGZyb21faWQuaWRfdGFyZ2V0ID0gZHYuZ2V0SW50MzIgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5mdW5jdGlvbiBmcm1fcmVzcG9uc2UoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MiwgbWFzayA9IDB4MlxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLm1zZ2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoubXNnaWQgOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl9tc2dpZF9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLm1zZ2lkLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXFfYWNrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5hY2tfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50b2tlbiA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfYWNrID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLmFja19mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuXG5cbmZ1bmN0aW9uIGZybV9kYXRhZ3JhbSgpIDo6XG4gIGNvbnN0IHNpemUgPSAwLCBiaXRzID0gMHgwLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RhdGFncmFtXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGF0YWdyYW0gPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kYXRhZ3JhbVxuXG5mdW5jdGlvbiBmcm1fZGlyZWN0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDQsIGJpdHMgPSAweDQsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGlyZWN0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGlyZWN0ID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGlyZWN0XG5cbmZ1bmN0aW9uIGZybV9tdWx0aXBhcnQoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4OCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19tdWx0aXBhcnRcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19tdWx0aXBhcnQgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjogLy8gdXNlIHNlcV9uZXh0XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX211bHRpcGFydFxuXG5mdW5jdGlvbiBmcm1fc3RyZWFtaW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweGMsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfc3RyZWFtaW5nXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfc3RyZWFtaW5nID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW4gLy8gdXNlIHNlcV9uZXh0XG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19zdHJlYW1pbmdcblxuXG5mdW5jdGlvbiBiaW5kX3NlcV9uZXh0KG9mZnNldCkgOjpcbiAgY29uc3Qgc2VxX29mZnNldCA9IHRoaXMuc2VxX3BvcyArIG9mZnNldFxuICBsZXQgc2VxID0gMVxuICByZXR1cm4gZnVuY3Rpb24gc2VxX25leHQoe2ZsYWdzLCBmaW59LCBkdikgOjpcbiAgICBpZiAhIGZpbiA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCBzZXErKywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICBlbHNlIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIC1zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgICBzZXEgPSBOYU5cblxuXG5cbmV4cG9ydCBkZWZhdWx0IGNvbXBvc2VGcmFtaW5ncygpXG5mdW5jdGlvbiBjb21wb3NlRnJhbWluZ3MoKSA6OlxuICBjb25zdCBmcm1fZnJvbSA9IGZybV9yb3V0aW5nKCksIGZybV9yZXNwID0gZnJtX3Jlc3BvbnNlKClcbiAgY29uc3QgZnJtX3RyYW5zcG9ydHMgPSBAW10gZnJtX2RhdGFncmFtKCksIGZybV9kaXJlY3QoKSwgZnJtX211bHRpcGFydCgpLCBmcm1fc3RyZWFtaW5nKClcblxuICBpZiA4ICE9PSBmcm1fZnJvbS5zaXplIHx8IDggIT09IGZybV9yZXNwLnNpemUgfHwgNCAhPSBmcm1fdHJhbnNwb3J0cy5sZW5ndGggOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgRnJhbWluZyBTaXplIGNoYW5nZWBcblxuICBjb25zdCBieUJpdHMgPSBbXSwgbWFzaz0weGZcblxuICA6OlxuICAgIGNvbnN0IHRfZnJvbSA9IGZybV9mcm9tLmZfdGVzdCwgdF9yZXNwID0gZnJtX3Jlc3AuZl90ZXN0XG4gICAgY29uc3QgW3QwLHQxLHQyLHQzXSA9IGZybV90cmFuc3BvcnRzLm1hcCBAIGY9PmYuZl90ZXN0XG5cbiAgICBjb25zdCB0ZXN0Qml0cyA9IGJ5Qml0cy50ZXN0Qml0cyA9IG9iaiA9PlxuICAgICAgMCB8IHRfZnJvbShvYmopIHwgdF9yZXNwKG9iaikgfCB0MChvYmopIHwgdDEob2JqKSB8IHQyKG9iaikgfCB0MyhvYmopXG5cbiAgICBieUJpdHMuY2hvb3NlID0gZnVuY3Rpb24gKG9iaiwgbHN0KSA6OlxuICAgICAgaWYgbnVsbCA9PSBsc3QgOjogbHN0ID0gdGhpcyB8fCBieUJpdHNcbiAgICAgIHJldHVybiBsc3RbdGVzdEJpdHMob2JqKV1cblxuXG4gIGZvciBjb25zdCBUIG9mIGZybV90cmFuc3BvcnRzIDo6XG4gICAgY29uc3Qge2JpdHM6Yiwgc2l6ZSwgdHJhbnNwb3J0fSA9IFRcblxuICAgIGJ5Qml0c1tifDBdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwwLCBtYXNrLCBzaXplOiBzaXplLCBvcDogJydcbiAgICBieUJpdHNbYnwxXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MSwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAnZidcbiAgICBieUJpdHNbYnwyXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MiwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAncidcbiAgICBieUJpdHNbYnwzXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MywgbWFzaywgc2l6ZTogMTYgKyBzaXplLCBvcDogJ2ZyJ1xuXG4gICAgZm9yIGNvbnN0IGZuX2tleSBvZiBbJ2ZfcGFjaycsICdmX3VucGFjayddIDo6XG4gICAgICBjb25zdCBmbl90cmFuID0gVFtmbl9rZXldLCBmbl9mcm9tID0gZnJtX2Zyb21bZm5fa2V5XSwgZm5fcmVzcCA9IGZybV9yZXNwW2ZuX2tleV1cblxuICAgICAgYnlCaXRzW2J8MF1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3RyYW4ob2JqLCBkdiwgMClcbiAgICAgIGJ5Qml0c1tifDFdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwyXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fcmVzcChvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8M11bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3Jlc3Aob2JqLCBkdiwgOCk7IGZuX3RyYW4ob2JqLCBkdiwgMTYpXG5cbiAgZm9yIGNvbnN0IGZybSBvZiBieUJpdHMgOjpcbiAgICBiaW5kQXNzZW1ibGVkIEAgZnJtXG5cbiAgcmV0dXJuIGJ5Qml0c1xuXG5cbmZ1bmN0aW9uIGJpbmRBc3NlbWJsZWQoZnJtKSA6OlxuICBjb25zdCB7VCwgc2l6ZSwgZl9wYWNrLCBmX3VucGFja30gPSBmcm1cbiAgaWYgVC5iaW5kX3NlcV9uZXh0IDo6XG4gICAgZnJtLnNlcV9uZXh0ID0gVC5iaW5kX3NlcV9uZXh0IEAgZnJtLnNpemUgLSBULnNpemVcblxuICBkZWxldGUgZnJtLlRcbiAgZnJtLnBhY2sgPSBwYWNrIDsgZnJtLnVucGFjayA9IHVucGFja1xuICBjb25zdCBzZXFfbmV4dCA9IGZybS5zZXFfbmV4dFxuXG4gIGZ1bmN0aW9uIHBhY2socGt0X3R5cGUsIHBrdF9vYmopIDo6XG4gICAgaWYgISBAIDAgPD0gcGt0X3R5cGUgJiYgcGt0X3R5cGUgPD0gMjU1IDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBrdF90eXBlIHRvIGJlIFswLi4yNTVdYFxuXG4gICAgcGt0X29iai50eXBlID0gcGt0X3R5cGVcbiAgICBpZiBzZXFfbmV4dCAmJiBudWxsID09IHBrdF9vYmouc2VxIDo6XG4gICAgICBwa3Rfb2JqLnNlcSA9IHRydWVcblxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IEFycmF5QnVmZmVyKHNpemUpXG4gICAgZl9wYWNrKHBrdF9vYmosIGR2LCAwKVxuICAgIHBrdF9vYmouaGVhZGVyID0gZHYuYnVmZmVyXG5cbiAgICBpZiB0cnVlID09PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgX2JpbmRfaXRlcmFibGUgQCBwa3Rfb2JqLCBkdi5idWZmZXIuc2xpY2UoMCxzaXplKVxuXG4gIGZ1bmN0aW9uIHVucGFjayhwa3QpIDo6XG4gICAgY29uc3QgYnVmID0gcGt0LmhlYWRlcl9idWZmZXIoKVxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IFVpbnQ4QXJyYXkoYnVmKS5idWZmZXJcblxuICAgIGNvbnN0IGluZm8gPSB7fVxuICAgIGZfdW5wYWNrKGluZm8sIGR2LCAwKVxuICAgIHJldHVybiBwa3QuaW5mbyA9IGluZm9cblxuICBmdW5jdGlvbiBfYmluZF9pdGVyYWJsZShwa3Rfb2JqLCBidWZfY2xvbmUpIDo6XG4gICAgY29uc3Qge3R5cGV9ID0gcGt0X29ialxuICAgIGNvbnN0IHtpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHRsLCB0b2tlbn0gPSBwa3Rfb2JqXG4gICAgcGt0X29iai5uZXh0ID0gbmV4dFxuXG4gICAgZnVuY3Rpb24gbmV4dChvcHRpb25zKSA6OlxuICAgICAgaWYgbnVsbCA9PSBvcHRpb25zIDo6IG9wdGlvbnMgPSB7fVxuICAgICAgY29uc3QgaGVhZGVyID0gYnVmX2Nsb25lLnNsaWNlKClcbiAgICAgIHNlcV9uZXh0IEAgb3B0aW9ucywgbmV3IERhdGFWaWV3IEAgaGVhZGVyXG4gICAgICByZXR1cm4gQHt9IGRvbmU6ICEhIG9wdGlvbnMuZmluLCB2YWx1ZTogQHt9IC8vIHBrdF9vYmpcbiAgICAgICAgaWRfcm91dGVyLCBpZF90YXJnZXQsIHR5cGUsIHR0bCwgdG9rZW4sIGhlYWRlclxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGFja2V0UGFyc2VyLCBvcHRpb25zLCBmcmFnbWVudF9zaXplKSA6OlxuICBjb25zdCB7Y29uY2F0QnVmZmVycywgcGFja1BhY2tldE9iaiwgcGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBwYWNrZXRQYXJzZXJcbiAgZnJhZ21lbnRfc2l6ZSA9IE51bWJlcihmcmFnbWVudF9zaXplIHx8IDgwMDApXG4gIGlmIDEwMjQgPiBmcmFnbWVudF9zaXplIHx8IDY1MDAwIDwgZnJhZ21lbnRfc2l6ZSA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIGZyYWdtZW50IHNpemU6ICR7ZnJhZ21lbnRfc2l6ZX1gXG5cbiAgY29uc3Qge3JhbmRvbV9pZCwganNvbl9wYWNrfSA9IG9wdGlvbnNcbiAgcmV0dXJuIEA6IHBhY2tldFBhcnNlciwgcmFuZG9tX2lkLCBqc29uX3BhY2tcbiAgICBjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwgcGFja2V0RnJhZ21lbnRzXG4gICAgYmluZFRyYW5zcG9ydHNcblxuXG4gIGZ1bmN0aW9uIGNyZWF0ZU11bHRpcGFydChwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBwYXJ0cyA9IFtdLCBmaW4gPSBmYWxzZVxuICAgIHJldHVybiBAe30gZmVlZCwgaW5mbzogcGt0LmluZm9cblxuICAgIGZ1bmN0aW9uIGZlZWQocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxIDwgMCA6OiBmaW4gPSB0cnVlOyBzZXEgPSAtc2VxXG4gICAgICBwYXJ0c1tzZXEtMV0gPSBwa3QuYm9keV9idWZmZXIoKVxuXG4gICAgICBpZiAhIGZpbiA6OiByZXR1cm5cbiAgICAgIGlmIHBhcnRzLmluY2x1ZGVzIEAgdW5kZWZpbmVkIDo6IHJldHVyblxuXG4gICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuXG4gICAgICBjb25zdCByZXMgPSBjb25jYXRCdWZmZXJzKHBhcnRzKVxuICAgICAgcGFydHMgPSBudWxsXG4gICAgICByZXR1cm4gcmVzXG5cbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtKHBrdCwgc2luaywgbXNnaWQpIDo6XG4gICAgbGV0IG5leHQ9MCwgZmluID0gZmFsc2UsIHJlY3ZEYXRhLCByc3RyZWFtXG4gICAgY29uc3Qgc3RhdGUgPSBAe30gZmVlZDogZmVlZF9pbml0LCBpbmZvOiBwa3QuaW5mb1xuICAgIHJldHVybiBzdGF0ZVxuXG4gICAgZnVuY3Rpb24gZmVlZF9pbml0KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuXG4gICAgICBjb25zdCBpbmZvID0gcGt0LmluZm9cbiAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiAgICAgIHJzdHJlYW0gPSBzaW5rLnJlY3ZTdHJlYW0obXNnLCBpbmZvKVxuICAgICAgaWYgbnVsbCA9PSByc3RyZWFtIDo6IHJldHVyblxuICAgICAgY2hlY2tfZm5zIEAgcnN0cmVhbSwgJ29uX2Vycm9yJywgJ29uX2RhdGEnLCAnb25fZW5kJyBcbiAgICAgIHJlY3ZEYXRhID0gc2luay5yZWN2U3RyZWFtRGF0YS5iaW5kKHNpbmssIHJzdHJlYW0sIGluZm8pXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9ib2R5XG4gICAgICBpZiByc3RyZWFtLm9uX2luaXQgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25faW5pdChtc2csIHBrdClcblxuICAgIGZ1bmN0aW9uIGZlZWRfYm9keShwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICByZWN2RGF0YSgpXG4gICAgICBsZXQgZGF0YVxuICAgICAgdHJ5IDo6XG4gICAgICAgIGZlZWRfc2VxKHBrdClcbiAgICAgICAgZGF0YSA9IGFzX2NvbnRlbnQocGt0LCBzaW5rKVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgaWYgZmluIDo6XG4gICAgICAgIGNvbnN0IHJlcyA9IHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lbmQgQCByZXMsIHBrdFxuICAgICAgZWxzZSA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9kYXRhIEAgZGF0YSwgcGt0XG5cbiAgICBmdW5jdGlvbiBmZWVkX2lnbm9yZShwa3QpIDo6XG4gICAgICB0cnkgOjogZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG5cbiAgICBmdW5jdGlvbiBmZWVkX3NlcShwa3QpIDo6XG4gICAgICBsZXQgc2VxID0gcGt0LmluZm8uc2VxXG4gICAgICBpZiBzZXEgPj0gMCA6OlxuICAgICAgICBpZiBuZXh0KysgPT09IHNlcSA6OlxuICAgICAgICAgIHJldHVybiAvLyBpbiBvcmRlclxuICAgICAgZWxzZSA6OlxuICAgICAgICBmaW4gPSB0cnVlXG4gICAgICAgIHNpbmsuZGVsZXRlU3RhdGVGb3IobXNnaWQpXG4gICAgICAgIGlmIG5leHQgPT09IC1zZXEgOjpcbiAgICAgICAgICBuZXh0ID0gJ2RvbmUnXG4gICAgICAgICAgcmV0dXJuIC8vIGluLW9yZGVyLCBsYXN0IHBhY2tldFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcbiAgICAgIG5leHQgPSAnaW52YWxpZCdcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYWNrZXQgb3V0IG9mIHNlcXVlbmNlYFxuXG4gIGZ1bmN0aW9uICogcGFja2V0RnJhZ21lbnRzKGJ1ZiwgbmV4dF9oZHIsIGZpbikgOjpcbiAgICBpZiBudWxsID09IGJ1ZiA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICB5aWVsZCBvYmpcbiAgICAgIHJldHVyblxuXG4gICAgbGV0IGkgPSAwLCBsYXN0SW5uZXIgPSBidWYuYnl0ZUxlbmd0aCAtIGZyYWdtZW50X3NpemU7XG4gICAgd2hpbGUgaSA8IGxhc3RJbm5lciA6OlxuICAgICAgY29uc3QgaTAgPSBpXG4gICAgICBpICs9IGZyYWdtZW50X3NpemVcblxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoKVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaTAsIGkpXG4gICAgICB5aWVsZCBvYmpcblxuICAgIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkpXG4gICAgICB5aWVsZCBvYmpcblxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IG91dGJvdW5kID0gW11cbiAgICBvdXRib3VuZC5jaG9vc2UgPSBmcmFtaW5ncy5jaG9vc2VcblxuICAgIGZvciBjb25zdCBmcmFtZSBvZiBmcmFtaW5ncyA6OlxuICAgICAgY29uc3QgaW1wbCA9IGZyYW1lID8gdHJhbnNwb3J0c1tmcmFtZS50cmFuc3BvcnRdIDogbnVsbFxuICAgICAgaWYgISBpbXBsIDo6IGNvbnRpbnVlXG5cbiAgICAgIGNvbnN0IHtiaXRzLCBwYWNrLCB1bnBhY2t9ID0gZnJhbWVcbiAgICAgIGNvbnN0IHBrdF90eXBlID0gaGlnaGJpdHMgfCBiaXRzXG4gICAgICBjb25zdCB7dF9yZWN2fSA9IGltcGxcblxuICAgICAgZnVuY3Rpb24gcGFja19oZHIob2JqKSA6OlxuICAgICAgICBwYWNrKHBrdF90eXBlLCBvYmopXG4gICAgICAgIHJldHVybiBvYmpcblxuICAgICAgZnVuY3Rpb24gcmVjdl9tc2cocGt0LCBzaW5rKSA6OlxuICAgICAgICB1bnBhY2socGt0KVxuICAgICAgICByZXR1cm4gdF9yZWN2KHBrdCwgc2luaylcblxuICAgICAgcGFja19oZHIucGt0X3R5cGUgPSByZWN2X21zZy5wa3RfdHlwZSA9IHBrdF90eXBlXG4gICAgICBvdXRib3VuZFtiaXRzXSA9IHBhY2tfaGRyXG4gICAgICBpbmJvdW5kW3BrdF90eXBlXSA9IHJlY3ZfbXNnXG5cbiAgICAgIGlmICdwcm9kdWN0aW9uJyAhPT0gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgOjpcbiAgICAgICAgY29uc3Qgb3AgPSBwYWNrX2hkci5vcCA9IHJlY3ZfbXNnLm9wID0gZnJhbWUub3BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcGFja19oZHIsICduYW1lJywgQHt9IHZhbHVlOiBgcGFja19oZHIgwqske29wfcK7YFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCByZWN2X21zZywgJ25hbWUnLCBAe30gdmFsdWU6IGByZWN2X21zZyDCqyR7b3B9wrtgXG5cbiAgICByZXR1cm4gb3V0Ym91bmRcblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IHBhY2tCb2R5ID0gdHJhbnNwb3J0cy5wYWNrQm9keVxuICAgIGNvbnN0IG91dGJvdW5kID0gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKVxuICAgIHJldHVybiB0cmFuc3BvcnRzLnN0cmVhbWluZ1xuICAgICAgPyBAe30gc2VuZCwgc3RyZWFtOiBiaW5kX3N0cmVhbSBAIHRyYW5zcG9ydHMuc3RyZWFtaW5nLm1vZGVcbiAgICAgIDogQHt9IHNlbmRcblxuICAgIGZ1bmN0aW9uIHNlbmQoY2hhbiwgb2JqLCBib2R5KSA6OlxuICAgICAgYm9keSA9IHBhY2tCb2R5KGJvZHkpXG4gICAgICBpZiBmcmFnbWVudF9zaXplIDwgYm9keS5ieXRlTGVuZ3RoIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIG9iai50cmFuc3BvcnQgPSAnbXVsdGlwYXJ0J1xuICAgICAgICBjb25zdCBtc2VuZCA9IG1zZW5kX2J5dGVzKGNoYW4sIG9iailcbiAgICAgICAgcmV0dXJuIEB7fSBzZW50OiBtc2VuZCBAIHRydWUsIGJvZHlcblxuICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzaW5nbGUnXG4gICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBwYWNrX2hkcihvYmopXG4gICAgICByZXR1cm4gQHt9IHNlbnQ6IGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIG1zZW5kX2J5dGVzKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGFzeW5jIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBsZXQgcmVzXG4gICAgICAgIGZvciBjb25zdCBvYmogb2YgcGFja2V0RnJhZ21lbnRzIEAgYm9keSwgbmV4dCwgZmluIDo6XG4gICAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICAgIHJlcyA9IGF3YWl0IGNoYW4gQCBwa3RcbiAgICAgICAgaWYgZmluIDo6IG5leHQgPSBudWxsXG4gICAgICAgIHJldHVybiByZXNcblxuICAgIGZ1bmN0aW9uIG1zZW5kX29iamVjdHMoY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBsZXQge25leHR9ID0gcGFja19oZHIob2JqKVxuICAgICAgaWYgbnVsbCAhPT0gbXNnIDo6XG4gICAgICAgIG9iai5ib2R5ID0gbXNnXG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgY2hhbiBAIHBrdFxuXG4gICAgICByZXR1cm4gZnVuY3Rpb24gKGZpbiwgYm9keSkgOjpcbiAgICAgICAgaWYgbnVsbCA9PT0gbmV4dCA6OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvciBAICdXcml0ZSBhZnRlciBlbmQnXG4gICAgICAgIGNvbnN0IG9iaiA9IG5leHQoe2Zpbn0pXG4gICAgICAgIG9iai5ib2R5ID0gYm9keVxuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gICAgZnVuY3Rpb24gYmluZF9zdHJlYW0obW9kZSkgOjpcbiAgICAgIGNvbnN0IG1zZW5kX2ltcGwgPSB7b2JqZWN0OiBtc2VuZF9vYmplY3RzLCBieXRlczogbXNlbmRfYnl0ZXN9W21vZGVdXG4gICAgICBpZiBtc2VuZF9pbXBsIDo6IHJldHVybiBzdHJlYW1cblxuICAgICAgZnVuY3Rpb24gc3RyZWFtKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBvYmoudHJhbnNwb3J0ID0gJ3N0cmVhbWluZydcbiAgICAgICAgY29uc3QgbXNlbmQgPSBtc2VuZF9pbXBsIEAgY2hhbiwgb2JqLCBqc29uX3BhY2sobXNnKVxuICAgICAgICB3cml0ZS53cml0ZSA9IHdyaXRlOyB3cml0ZS5lbmQgPSB3cml0ZS5iaW5kKHRydWUpXG4gICAgICAgIHJldHVybiB3cml0ZVxuXG4gICAgICAgIGZ1bmN0aW9uIHdyaXRlKGNodW5rKSA6OlxuICAgICAgICAgIHJldHVybiBjaHVuayAhPSBudWxsXG4gICAgICAgICAgICA/IG1zZW5kIEAgdHJ1ZT09PXRoaXMsIHBhY2tCb2R5KGNodW5rKVxuICAgICAgICAgICAgOiBtc2VuZCBAIHRydWVcblxuXG5mdW5jdGlvbiBjaGVja19mbnMob2JqLCAuLi5rZXlzKSA6OlxuICBmb3IgY29uc3Qga2V5IG9mIGtleXMgOjpcbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2Ygb2JqW2tleV0gOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgXCIke2tleX1cIiB0byBiZSBhIGZ1bmN0aW9uYFxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ganNvbl9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwganNvbl9wYWNrfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG5cbiAgcmV0dXJuIEB7fVxuICAgIHBhY2tCb2R5XG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0gc2luay5qc29uX3VucGFjayBAIHBrdC5ib2R5X3V0ZjgoKSB8fCB1bmRlZmluZWRcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBib2R5X2J1ZiA9IHN0YXRlLmZlZWQocGt0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IGJvZHlfYnVmIDo6XG4gICAgICAgICAgY29uc3QgbXNnID0gc2luay5qc29uX3VucGFjayBAIHVucGFja191dGY4KGJvZHlfYnVmKSB8fCB1bmRlZmluZWRcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ29iamVjdCdcbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlU3RyZWFtXG4gICAgICAgIHJldHVybiBzdGF0ZS5mZWVkKHBrdCwgdW5wYWNrQm9keSlcblxuICBmdW5jdGlvbiBwYWNrQm9keShib2R5KSA6OlxuICAgIHJldHVybiBwYWNrX3V0ZjggQCBqc29uX3BhY2soYm9keSlcblxuICBmdW5jdGlvbiB1bnBhY2tCb2R5KHBrdCwgc2luaykgOjpcbiAgICByZXR1cm4gc2luay5qc29uX3VucGFjayBAIHBrdC5ib2R5X3V0ZjgoKVxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gYmluYXJ5X3Byb3RvY29sKHNoYXJlZCkgOjpcbiAgY29uc3Qge2NyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG4gIGNvbnN0IHthc0J1ZmZlcn0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keTogYXNCdWZmZXJcblxuICAgIGdldCBkYXRhZ3JhbSgpIDo6IHJldHVybiB0aGlzLmRpcmVjdFxuICAgIGRpcmVjdDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBtc2cgPSBwa3QuYm9keV9idWZmZXIoKVxuICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBwa3QuaW5mb1xuXG4gICAgbXVsdGlwYXJ0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlTXVsdGlwYXJ0XG4gICAgICAgIGNvbnN0IG1zZyA9IHN0YXRlLmZlZWQocGt0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZyA6OlxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuICAgIHN0cmVhbWluZzogQHt9XG4gICAgICBtb2RlOiAnYnl0ZXMnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICBjb25zdCBtc2cgPSBzdGF0ZS5mZWVkKHBrdCwgcGt0X2J1ZmZlcilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2cgOjpcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbmZ1bmN0aW9uIHBrdF9idWZmZXIocGt0KSA6OiByZXR1cm4gcGt0LmJvZHlfYnVmZmVyKClcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGNvbnRyb2xfcHJvdG9jb2woaW5ib3VuZCwgaGlnaCwgc2hhcmVkKSA6OlxuICBjb25zdCB7cmFuZG9tX2lkfSA9IHNoYXJlZFxuICBjb25zdCB7cGFja1BhY2tldE9ian0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG5cbiAgY29uc3QgcGluZ19mcmFtZSA9IGZyYW1pbmdzLmNob29zZSBAOiBmcm9tX2lkOiB0cnVlLCB0b2tlbjogdHJ1ZSwgdHJhbnNwb3J0OiAnZGlyZWN0J1xuICBjb25zdCBwb25nX2ZyYW1lID0gZnJhbWluZ3MuY2hvb3NlIEA6IGZyb21faWQ6IHRydWUsIG1zZ2lkOiB0cnVlLCB0cmFuc3BvcnQ6ICdkYXRhZ3JhbSdcblxuICBjb25zdCBwb25nX3R5cGUgPSBoaWdofDB4ZVxuICBpbmJvdW5kW3BvbmdfdHlwZV0gPSByZWN2X3BvbmdcbiAgY29uc3QgcGluZ190eXBlID0gaGlnaHwweGZcbiAgaW5ib3VuZFtoaWdofDB4Zl0gPSByZWN2X3BpbmdcblxuICByZXR1cm4gQHt9IHNlbmQ6cGluZywgcGluZ1xuXG4gIGZ1bmN0aW9uIHBpbmcoY2hhbiwgb2JqKSA6OlxuICAgIGlmICEgb2JqLnRva2VuIDo6XG4gICAgICBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgIG9iai5ib2R5ID0gSlNPTi5zdHJpbmdpZnkgQDpcbiAgICAgIG9wOiAncGluZycsIHRzMDogbmV3IERhdGUoKVxuICAgIHBpbmdfZnJhbWUucGFjayhwaW5nX3R5cGUsIG9iailcbiAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICBmdW5jdGlvbiByZWN2X3BpbmcocGt0LCBzaW5rLCByb3V0ZXIpIDo6XG4gICAgcGluZ19mcmFtZS51bnBhY2socGt0KVxuICAgIHBrdC5ib2R5ID0gcGt0LmJvZHlfanNvbigpXG4gICAgX3NlbmRfcG9uZyBAIHBrdC5ib2R5LCBwa3QsIHNpbmssIHJvdXRlclxuICAgIHJldHVybiBzaW5rLnJlY3ZDdHJsKHBrdC5ib2R5LCBwa3QuaW5mbylcblxuICBmdW5jdGlvbiBfc2VuZF9wb25nKHt0czB9LCBwa3RfcGluZywgc2luaywgcm91dGVyKSA6OlxuICAgIGNvbnN0IHttc2dpZCwgZnJvbV9pZDpyX2lkfSA9IHBrdF9waW5nLmluZm9cbiAgICBjb25zdCB7aWRfcm91dGVyLCBpZF90YXJnZXR9ID0gcl9pZFxuICAgIGNvbnN0IG9iaiA9IEB7fSBpZF9yb3V0ZXIsIGlkX3RhcmdldFxuICAgICAgZnJvbV9pZDogc2luay5mcm9tX2lkLCBtc2dpZFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkgQDpcbiAgICAgICAgb3A6ICdwb25nJywgdHMwLCB0czE6IG5ldyBEYXRlKClcblxuICAgIHBvbmdfZnJhbWUucGFjayhwb25nX3R5cGUsIG9iailcbiAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgcmV0dXJuIHJvdXRlci5kaXNwYXRjaCBAIFtwa3RdXG5cbiAgZnVuY3Rpb24gcmVjdl9wb25nKHBrdCwgc2luaykgOjpcbiAgICBwb25nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuaW1wb3J0IHNoYXJlZF9wcm90byBmcm9tICcuL3NoYXJlZC5qc3knXG5pbXBvcnQganNvbl9wcm90byBmcm9tICcuL2pzb24uanN5J1xuaW1wb3J0IGJpbmFyeV9wcm90byBmcm9tICcuL2JpbmFyeS5qc3knXG5pbXBvcnQgY29udHJvbF9wcm90byBmcm9tICcuL2NvbnRyb2wuanN5J1xuXG5leHBvcnQgKiBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBpbml0X3Byb3RvY29sKHBhY2tldFBhcnNlciwgb3B0aW9ucykgOjpcbiAgY29uc3Qgc2hhcmVkID0gc2hhcmVkX3Byb3RvIEAgcGFja2V0UGFyc2VyLCBvcHRpb25zXG5cbiAgY29uc3QgaW5ib3VuZCA9IFtdXG4gIGNvbnN0IGpzb24gPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgwMCAvLyAweDAqIOKAlCBKU09OIGJvZHlcbiAgICBqc29uX3Byb3RvKHNoYXJlZClcblxuICBjb25zdCBiaW5hcnkgPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgxMCAvLyAweDEqIOKAlCBiaW5hcnkgYm9keVxuICAgIGJpbmFyeV9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgY29udHJvbCA9IGNvbnRyb2xfcHJvdG8gQCBpbmJvdW5kLFxuICAgIDB4ZjAgLy8gMHhmKiDigJQgY29udHJvbFxuICAgIHNoYXJlZFxuXG4gIGNvbnN0IGNvZGVjcyA9IEA6IGpzb24sIGJpbmFyeSwgY29udHJvbCwgZGVmYXVsdDoganNvblxuXG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIHJldHVybiBAOiBpbmJvdW5kLCBjb2RlY3MsIHJhbmRvbV9pZFxuXG5cbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIEVuZHBvaW50IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe30pIDo6XG4gICAgY2xhc3MgRW5kcG9pbnQgZXh0ZW5kcyB0aGlzIDo6XG4gICAgcmV0dXJuIEVuZHBvaW50XG5cbiAgdmFsdWVPZigpIDo6IHJldHVybiB0aGlzLmZyb21faWRcbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFbmRwb2ludCAke3RoaXMuZnJvbV9pZC5pZF90YXJnZXR9wrtgXG5cbiAgY29uc3RydWN0b3IobXNnX2N0eCkgOjpcbiAgICBtc2dfY3R4ID0gbXNnX2N0eC53aXRoRW5kcG9pbnQodGhpcylcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBmcm9tX2lkOiBAe30gdmFsdWU6IG1zZ19jdHguZnJvbV9pZCwgZW51bWVyYWJsZTogdHJ1ZVxuICAgICAgdG86IEB7fSB2YWx1ZTogbXNnX2N0eC50b1xuXG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKClcbiAgY3JlYXRlU3RhdGVNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSZXBseU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVRyYWZmaWNNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuXG4gIGJpbmRTaW5rKHNpbmspIDo6XG4gICAgY29uc3QgYnlfdG9rZW4gPSB0aGlzLmNyZWF0ZVJlcGx5TWFwKClcbiAgICBjb25zdCBieV90cmFmZmljID0gdGhpcy5jcmVhdGVUcmFmZmljTWFwKClcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBieV90b2tlbjogQHt9IHZhbHVlOiBieV90b2tlblxuICAgICAgYnlfdHJhZmZpYzogQHt9IHZhbHVlOiBieV90cmFmZmljXG5cbiAgICBjb25zdCB0cmFmZmljID0gKGZyb21faWQsIHRyYWZmaWMpID0+IDo6XG4gICAgICBjb25zdCB0cyA9IERhdGUubm93KClcbiAgICAgIGlmIGZyb21faWQgOjpcbiAgICAgICAgY29uc3QgdCA9IGJ5X3RyYWZmaWMuZ2V0KGZyb21faWQuaWRfdGFyZ2V0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHQgOjpcbiAgICAgICAgICB0LnRzID0gdFtgdHNfJHt0cmFmZmljfWBdID0gdHNcbiAgICAgIHRoaXMucmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpXG5cbiAgICByZXR1cm4gQHt9XG4gICAgICBmcm9tX2lkOiB0aGlzLmZyb21faWRcbiAgICAgIGJ5X21zZ2lkOiB0aGlzLmNyZWF0ZVN0YXRlTWFwKClcblxuICAgICAgcmVjdkN0cmw6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnY3RybCcpXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZDdHJsKG1zZywgaW5mbylcblxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHtybXNnLCBtc2csIGluZm99KS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZNc2c6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnbXNnJylcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdk1zZyhtc2csIGluZm8pXG5cbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnKS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZTdHJlYW1EYXRhOiAocnN0cmVhbSwgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgcmVjdlN0cmVhbTogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgICBjb25zdCByc3RyZWFtID0gdGhpcy5yZWN2U3RyZWFtKG1zZywgaW5mbylcblxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJzdHJlYW0pLnRoZW4ocmVwbHkpXG4gICAgICAgIHJldHVybiByc3RyZWFtXG5cbiAgcmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpIDo6XG4gIHJlY3ZDdHJsKG1zZywgaW5mbykgOjpcbiAgcmVjdk1zZyhtc2csIGluZm8pIDo6XG4gICAgcmV0dXJuIEB7fSBtc2csIGluZm9cbiAgcmVjdlN0cmVhbShtc2csIGluZm8pIDo6XG4gICAgY29uc29sZS53YXJuIEAgYFVuaGFuZGxlIHJlY3Ygc3RyZWFtOiAke2luZm99YFxuICAgIHJldHVybiBudWxsXG4gICAgLyogcmV0dXJuIEB7fSBtc2csIGluZm9cbiAgICAgICAgIG9uX2luaXQobXNnLCBwa3QpIDo6IHJldHVybiB0aGlzXG4gICAgICAgICBvbl9kYXRhKGRhdGEsIHBrdCkgOjogdGhpcy5wYXJ0cy5wdXNoIEAgZGF0YVxuICAgICAgICAgb25fZW5kKHJlc3VsdCwgcGt0KSA6OiByZXR1cm4gdGhpcy5wYXJ0cy5qb2luKCcnKVxuICAgICAgICAgb25fZXJyb3IoZXJyLCBwa3QpIDo6IGNvbnNvbGUubG9nIEAgZXJyXG4gICAgKi9cblxuICBpbml0UmVwbHkodG9rZW4sIG1zZ19jdHgsIGtpbmQpIDo6XG4gICAgcmV0dXJuIHRoaXMuaW5pdFJlcGx5UHJvbWlzZSBAIHRva2VuLCBtc2dfY3R4Lm1zX3RpbWVvdXRcblxuICBpbml0TW9uaXRvcihpZF90YXJnZXQpIDo6XG4gICAgY29uc3Qga2V5ID0gaWRfdGFyZ2V0LmlkX3RhcmdldCB8fCBpZF90YXJnZXRcbiAgICBsZXQgbW9uaXRvciA9IHRoaXMuYnlfdHJhZmZpYy5nZXQgQCBrZXlcbiAgICBpZiB1bmRlZmluZWQgPT09IG1vbml0b3IgOjpcbiAgICAgIG1vbml0b3IgPSBAe30gaWRfdGFyZ2V0LCB0czogRGF0ZS5ub3coKVxuICAgICAgICB0ZCgpIDo6IHJldHVybiBEYXRlLm5vdygpIC0gdGhpcy50c1xuICAgICAgdGhpcy5ieV90cmFmZmljLnNldCBAIGtleSwgbW9uaXRvclxuICAgIHJldHVybiBtb25pdG9yXG5cbiAgaW5pdFJlcGx5UHJvbWlzZSh0b2tlbiwgbXNfdGltZW91dCkgOjpcbiAgICBjb25zdCBhbnMgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICB0aGlzLmJ5X3Rva2VuLnNldCBAIHRva2VuLCByZXNvbHZlXG4gICAgICBpZiBtc190aW1lb3V0IDo6XG4gICAgICAgIGNvbnN0IHRpZCA9IHNldFRpbWVvdXQodGltZW91dCwgbXNfdGltZW91dClcbiAgICAgICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgICAgIGZ1bmN0aW9uIHRpbWVvdXQoKSA6OiByZWplY3QgQCBuZXcgdGhpcy5SZXBseVRpbWVvdXRcblxuICAgIHJldHVybiBzZW50ID0+IDo6XG4gICAgICBhbnMuc2VudCA9IHNlbnRcbiAgICAgIHJldHVybiBhbnNcblxuY2xhc3MgUmVwbHlUaW1lb3V0IGV4dGVuZHMgRXJyb3IgOjpcblxuT2JqZWN0LmFzc2lnbiBAIEVuZHBvaW50LnByb3RvdHlwZSwgQHt9XG4gIFJlcGx5VGltZW91dFxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2luayA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtpbmJvdW5kfSkgOjpcbiAgICBjbGFzcyBTaW5rIGV4dGVuZHMgdGhpcyA6OlxuICAgIFNpbmsucHJvdG90eXBlLl9wcm90b2NvbCA9IGluYm91bmRcbiAgICByZXR1cm4gU2lua1xuXG4gIGNvbnN0cnVjdG9yKGpzb25fdW5wYWNrKSA6OlxuICAgIHRoaXMuanNvbl91bnBhY2sgPSBqc29uX3VucGFja1xuXG4gIHJlZ2lzdGVyKGVuZHBvaW50LCBodWIsIGlkX3RhcmdldCwgaGFuZGxlcnMpIDo6XG4gICAgY29uc3QgdW5yZWdpc3RlciA9ICgpID0+IGh1Yi5yb3V0ZXIudW5yZWdpc3RlclRhcmdldChpZF90YXJnZXQpXG5cbiAgICBodWIucm91dGVyLnJlZ2lzdGVyVGFyZ2V0IEAgaWRfdGFyZ2V0LFxuICAgICAgdGhpcy5fYmluZERpc3BhdGNoIEAgZW5kcG9pbnQsIHVucmVnaXN0ZXIsIGhhbmRsZXJzXG4gICAgcmV0dXJuIHRoaXNcblxuICBfYmluZERpc3BhdGNoKGVuZHBvaW50LCB1bnJlZ2lzdGVyLCB7b25fbXNnLCBvbl9lcnJvciwgb25fc2h1dGRvd259KSA6OlxuICAgIGxldCBhbGl2ZSA9IHRydWVcbiAgICBjb25zdCBwcm90b2NvbCA9IHRoaXMuX3Byb3RvY29sXG4gICAgY29uc3QgaXNBbGl2ZSA9ICgpID0+IGFsaXZlXG4gICAgY29uc3Qgc2h1dGRvd24gPSAoZXJyLCBleHRyYSkgPT4gOjpcbiAgICAgIGlmIGFsaXZlIDo6XG4gICAgICAgIHVucmVnaXN0ZXIoKTsgdW5yZWdpc3RlciA9IGFsaXZlID0gZmFsc2VcbiAgICAgICAgb25fc2h1dGRvd24oZXJyLCBleHRyYSlcblxuICAgIE9iamVjdC5hc3NpZ24gQCB0aGlzLCBlbmRwb2ludC5iaW5kU2luayh0aGlzKSwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG4gICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cblxuICAgIHJldHVybiBhc3luYyAocGt0LCByb3V0ZXIpID0+IDo6XG4gICAgICBpZiBmYWxzZT09PWFsaXZlIHx8IG51bGw9PXBrdCA6OiByZXR1cm4gYWxpdmVcblxuICAgICAgY29uc3QgcmVjdl9tc2cgPSBwcm90b2NvbFtwa3QudHlwZV1cbiAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmVjdl9tc2cgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgb25fZXJyb3IgQCBmYWxzZSwgQHt9IHBrdCwgem9uZTogJ3BrdC50eXBlJ1xuXG4gICAgICB0cnkgOjpcbiAgICAgICAgdmFyIG1zZyA9IGF3YWl0IHJlY3ZfbXNnIEAgcGt0LCB0aGlzLCByb3V0ZXJcbiAgICAgICAgaWYgISBtc2cgOjogcmV0dXJuIG1zZ1xuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZXJyLCBAe30gcGt0LCB6b25lOiAncHJvdG9jb2wnXG5cbiAgICAgIGlmIGZhbHNlID09PSBhbGl2ZSA6OlxuICAgICAgICByZXR1cm4gZmFsc2UgLy8gY2hhbmdlIHdoaWxlIGF3YWl0aW5nIGFib3Zl4oCmXG4gICAgICB0cnkgOjpcbiAgICAgICAgcmV0dXJuIGF3YWl0IG9uX21zZyBAIG1zZywgcGt0XG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgdHJ5IDo6XG4gICAgICAgICAgdmFyIHRlcm1pbmF0ZSA9IG9uX2Vycm9yIEAgZXJyLCBAe30gbXNnLCBwa3QsIHpvbmU6ICdkaXNwYXRjaCdcbiAgICAgICAgZmluYWxseSA6OlxuICAgICAgICAgIGlmIGZhbHNlICE9PSB0ZXJtaW5hdGUgOjpcbiAgICAgICAgICAgIHNodXRkb3duKGVyciwge21zZywgcGt0fSlcbiAgICAgICAgICAgIHJldHVybiBmYWxzZSAvLyBzaWduYWwgdW5yZWdpc3RlciB0byBtc2ctZmFicmljLWNvcmUvcm91dGVyXG5cbiAgc3RhdGVGb3IocGt0LCBpZkFic2VudCkgOjpcbiAgICBjb25zdCBtc2dpZCA9IHBrdC5pbmZvLm1zZ2lkXG4gICAgbGV0IGVudHJ5ID0gdGhpcy5ieV9tc2dpZC5nZXQobXNnaWQpXG4gICAgaWYgdW5kZWZpbmVkID09PSBlbnRyeSA6OlxuICAgICAgaWYgISBtc2dpZCA6OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgSW52YWxpZCBtc2dpZDogJHttc2dpZH1gXG4gICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgaWZBYnNlbnQgOjpcbiAgICAgICAgZW50cnkgPSBpZkFic2VudChwa3QsIHRoaXMsIG1zZ2lkKVxuICAgICAgZWxzZSBlbnRyeSA9IGlmQWJzZW50XG4gICAgICB0aGlzLmJ5X21zZ2lkLnNldCBAIG1zZ2lkLCBlbnRyeVxuICAgIHJldHVybiBlbnRyeVxuXG4gIGRlbGV0ZVN0YXRlRm9yKG1zZ2lkKSA6OlxuICAgIHJldHVybiB0aGlzLmJ5X21zZ2lkLmRlbGV0ZShtc2dpZClcbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIE1zZ0N0eCA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtyYW5kb21faWQsIGNvZGVjc30pIDo6XG4gICAgY2xhc3MgTXNnQ3R4IGV4dGVuZHMgdGhpcyA6OlxuICAgIE1zZ0N0eC5wcm90b3R5cGUucmFuZG9tX2lkID0gcmFuZG9tX2lkXG4gICAgTXNnQ3R4LndpdGhDb2RlY3MgQCBjb2RlY3NcbiAgICByZXR1cm4gTXNnQ3R4XG5cbiAgY29uc3RydWN0b3IoZnJvbV9pZCwgcmVzb2x2ZVJvdXRlKSA6OlxuICAgIGlmIG51bGwgIT09IGZyb21faWQgOjpcbiAgICAgIGNvbnN0IHtpZF90YXJnZXQsIGlkX3JvdXRlcn0gPSBmcm9tX2lkXG4gICAgICBmcm9tX2lkID0gT2JqZWN0LmZyZWV6ZSBAOiBpZF90YXJnZXQsIGlkX3JvdXRlclxuXG4gICAgY29uc3QgY3R4ID0ge2Zyb21faWR9XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAOlxuICAgICAgX3Jvb3RfOiBAOiB2YWx1ZTogdGhpc1xuICAgICAgZnJvbV9pZDogQDogdmFsdWU6IGZyb21faWRcbiAgICAgIGN0eDogQDogdmFsdWU6IGN0eFxuICAgICAgcmVzb2x2ZVJvdXRlOiBAOiB2YWx1ZTogcmVzb2x2ZVJvdXRlXG5cbiAgd2l0aEVuZHBvaW50KGVuZHBvaW50KSA6OlxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEB7fVxuICAgICAgZW5kcG9pbnQ6IEB7fSB2YWx1ZTogZW5kcG9pbnRcblxuICBzdGF0aWMgZnJvbShpZF90YXJnZXQsIGh1YikgOjpcbiAgICBjb25zdCBmcm9tX2lkID0gbnVsbCA9PT0gaWRfdGFyZ2V0ID8gbnVsbFxuICAgICAgOiBAe30gaWRfdGFyZ2V0LCBpZF9yb3V0ZXI6IGh1Yi5yb3V0ZXIuaWRfc2VsZlxuICAgIHJldHVybiBuZXcgdGhpcyBAIGZyb21faWQsIGh1Yi5iaW5kUm91dGVEaXNwYXRjaCgpXG5cbiAgZ2V0IHRvKCkgOjogcmV0dXJuICguLi5hcmdzKSA9PiB0aGlzLmNsb25lKCkud2l0aCBAIC4uLmFyZ3NcblxuICBwaW5nKHRva2VuPXRydWUpIDo6IHJldHVybiB0aGlzLmNvZGVjKCdjb250cm9sJywge3Rva2VufSkuaW52b2tlIEAgJ3BpbmcnXG4gIHNlbmQoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuaW52b2tlIEAgJ3NlbmQnLCAuLi5hcmdzXG4gIHN0cmVhbSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5pbnZva2UgQCAnc3RyZWFtJywgLi4uYXJnc1xuXG4gIGludm9rZShrZXksIC4uLmFyZ3MpIDo6XG4gICAgY29uc3Qgb2JqID0gT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eFxuICAgIHRoaXMuYXNzZXJ0TW9uaXRvcigpXG4gICAgY29uc3QgY2hhbiA9IHRoaXMucmVzb2x2ZVJvdXRlKG9iai5pZF9yb3V0ZXIpXG4gICAgaWYgdHJ1ZSAhPT0gb2JqLnRva2VuIDo6XG4gICAgICByZXR1cm4gdGhpcy5fY29kZWNba2V5XSBAIGNoYW4sIG9iaiwgLi4uYXJnc1xuXG4gICAgZWxzZSA6OlxuICAgICAgY29uc3QgdG9rZW4gPSBvYmoudG9rZW4gPSB0aGlzLnJhbmRvbV9pZCgpXG4gICAgICBjb25zdCByZXBseSA9IHRoaXMuZW5kcG9pbnQuaW5pdFJlcGx5KHRva2VuLCB0aGlzLCBrZXkpXG4gICAgICByZXR1cm4gcmVwbHkgQCB0aGlzLl9jb2RlY1trZXldIEAgY2hhbiwgb2JqLCAuLi5hcmdzXG5cblxuICB3aXRoKC4uLmFyZ3MpIDo6XG4gICAgY29uc3QgY3R4ID0gdGhpcy5jdHhcbiAgICBmb3IgbGV0IHRndCBvZiBhcmdzIDo6XG4gICAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gdGd0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBjdHguZnJvbV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgY29udGludWVcblxuICAgICAgY29uc3Qge2Zyb21faWQ6IHJlcGx5X2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgdG9rZW4sIG1zZ2lkfSA9IHRndFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IGlkX3RhcmdldCA6OlxuICAgICAgICBpZiB1bmRlZmluZWQgPT09IGlkX3JvdXRlciA6OlxuICAgICAgICAgIGlmICEgY3R4LmlkX3JvdXRlciA6OlxuICAgICAgICAgICAgLy8gaW1wbGljaXRseSBvbiB0aGUgc2FtZSByb3V0ZXJcbiAgICAgICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBjdHguZnJvbV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgZWxzZSBjdHguaWRfcm91dGVyID0gaWRfcm91dGVyXG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSBpZF90YXJnZXRcbiAgICAgIGVsc2UgaWYgdW5kZWZpbmVkICE9PSBpZF9yb3V0ZXIgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFBhc3NpbmcgJ2lkX3JvdXRlcicgcmVxdWlyZXMgJ2lkX3RhcmdldCdgXG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHlfaWQgJiYgISBjdHguaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSByZXBseV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHJlcGx5X2lkLmlkX3RhcmdldFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG5cbiAgICByZXR1cm4gdGhpc1xuXG4gIHdpdGhSZXBseSgpIDo6XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUgQDogdG9rZW46IHRydWVcblxuICByZXNldCguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcy5fcm9vdF8sIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuICBjbG9uZSguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQHt9XG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cblxuICBhc3NlcnRNb25pdG9yKCkgOjpcbiAgICBpZiAhIHRoaXMuY2hlY2tNb25pdG9yKCkgOjpcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBUYXJnZXQgbW9uaXRvciBleHBpcmVkYFxuICBjaGVja01vbml0b3IoKSA6OiByZXR1cm4gdHJ1ZVxuICBtb25pdG9yKG9wdGlvbnM9e30pIDo6XG4gICAgaWYgdHJ1ZSA9PT0gb3B0aW9ucyB8fCBmYWxzZSA9PT0gb3B0aW9ucyA6OlxuICAgICAgb3B0aW9ucyA9IEB7fSBhY3RpdmU6IG9wdGlvbnNcblxuICAgIGNvbnN0IG1vbml0b3IgPSB0aGlzLmVuZHBvaW50LmluaXRNb25pdG9yKHRoaXMuY3R4LmlkX3RhcmdldClcblxuICAgIGNvbnN0IHRzX2R1cmF0aW9uID0gb3B0aW9ucy50c19kdXJhdGlvbiB8fCA1MDAwXG4gICAgbGV0IHRzX2FjdGl2ZSA9IG9wdGlvbnMudHNfYWN0aXZlXG4gICAgaWYgdHJ1ZSA9PT0gdHNfYWN0aXZlIDo6XG4gICAgICB0c19hY3RpdmUgPSB0c19kdXJhdGlvbi80XG5cbiAgICBsZXQgY2hlY2tNb25pdG9yXG4gICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIGNvbnN0IGRvbmUgPSBvcHRpb25zLnJlamVjdCA/IHJlamVjdCA6IHJlc29sdmVcbiAgICAgIHRoaXMuY2hlY2tNb25pdG9yID0gY2hlY2tNb25pdG9yID0gKCkgPT5cbiAgICAgICAgdHNfZHVyYXRpb24gPiBtb25pdG9yLnRkKClcbiAgICAgICAgICA/IHRydWUgOiAoZG9uZShtb25pdG9yKSwgZmFsc2UpXG5cbiAgICBsZXQgdGlkXG4gICAgY29uc3QgdHNfaW50ZXJ2YWwgPSB0c19hY3RpdmUgfHwgdHNfZHVyYXRpb24vNFxuICAgIGlmIG9wdGlvbnMuYWN0aXZlIHx8IHRzX2FjdGl2ZSA6OlxuICAgICAgY29uc3QgY3RybCA9IHRoaXMuY29kZWMoJ2NvbnRyb2wnKVxuICAgICAgY29uc3QgY2hlY2tQaW5nID0gKCkgPT4gOjpcbiAgICAgICAgaWYgdHNfaW50ZXJ2YWwgPiBtb25pdG9yLnRkKCkgOjpcbiAgICAgICAgICBjdHJsLmludm9rZSgncGluZycpXG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrUGluZywgdHNfaW50ZXJ2YWxcbiAgICBlbHNlIDo6XG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrTW9uaXRvciwgdHNfaW50ZXJ2YWxcbiAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcbiAgICBjb25zdCBjbGVhciA9ICgpID0+IGNsZWFySW50ZXJ2YWwodGlkKVxuXG4gICAgcHJvbWlzZS50aGVuKGNsZWFyLCBjbGVhcilcbiAgICByZXR1cm4gcHJvbWlzZVxuXG5cbiAgY29kZWMobXNnX2NvZGVjLCAuLi5hcmdzKSA6OlxuICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgbXNnX2NvZGVjIDo6XG4gICAgICBtc2dfY29kZWMgPSB0aGlzLl9tc2dDb2RlY3NbbXNnX2NvZGVjXVxuXG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG1zZ19jb2RlYy5zZW5kIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBhY2tldCBjb2RlYyBwcm90b2NvbGBcblxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQDpcbiAgICAgIF9jb2RlYzogQDogdmFsdWU6IG1zZ19jb2RlY1xuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG4gIHN0YXRpYyB3aXRoQ29kZWNzKG1zZ0NvZGVjcykgOjpcbiAgICBmb3IgY29uc3QgW25hbWUsIG1zZ19jb2RlY10gb2YgT2JqZWN0LmVudHJpZXMgQCBtc2dDb2RlY3MgOjpcbiAgICAgIHRoaXMucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSA6OlxuICAgICAgICByZXR1cm4gdGhpcy5jb2RlYyBAIG1zZ19jb2RlY1xuICAgIHRoaXMucHJvdG90eXBlLl9tc2dDb2RlY3MgPSBtc2dDb2RlY3NcbiAgICB0aGlzLnByb3RvdHlwZS5fY29kZWMgPSBtc2dDb2RlY3MuZGVmYXVsdFxuICAgIHJldHVybiB0aGlzXG5cbk9iamVjdC5hc3NpZ24gQCBNc2dDdHgucHJvdG90eXBlLCBAe31cbiAgbXNfdGltZW91dDogNTAwMFxuXG4iLCJpbXBvcnQgaW5pdF9wcm90b2NvbCBmcm9tICcuL3Byb3RvY29sL2luZGV4LmpzeSdcbmltcG9ydCBFbmRwb2ludEJhc2UgZnJvbSAnLi9lbmRwb2ludC5qc3knXG5pbXBvcnQgU2lua0Jhc2UgZnJvbSAnLi9zaW5rLmpzeSdcbmltcG9ydCBNc2dDdHhCYXNlIGZyb20gJy4vbXNnY3R4LmpzeSdcblxuY29uc3QgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyA9IEA6XG4gIG9uX2Vycm9yKGVyciwge21zZywgcGt0fSkgOjpcbiAgICBjb25zb2xlLmVycm9yIEAgJ0VORFBPSU5UIEVSUk9SOicsIGVyciwgQHt9IG1zZywgcGt0XG4gICAgLy8gcmV0dXJuIGZhbHNlIHRvIHByZXZlbnQgYXV0by1zaHV0ZG93blxuICBvbl9zaHV0ZG93bihlcnIsIHttc2csIHBrdH0pIDo6XG4gICAgY29uc29sZS5lcnJvciBAICdFTkRQT0lOVCBTSFVURE9XTjonICsgZXJyXG5cbiAgc3ViY2xhc3Moe1NpbmssIEVuZHBvaW50LCBNc2dDdHgsIHByb3RvY29sc30pIDo6XG5cbiAgbXNnX3VucGFjayhlcCkgOjogcmV0dXJuIEpTT04ucGFyc2VcbiAgbXNnX3BhY2soKSA6OiByZXR1cm4gSlNPTi5zdHJpbmdpZnlcblxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihwbHVnaW5fb3B0aW9ucykgOjpcbiAgcGx1Z2luX29wdGlvbnMgPSBPYmplY3QuYXNzaWduIEAge30sIGRlZmF1bHRfcGx1Z2luX29wdGlvbnMsIHBsdWdpbl9vcHRpb25zXG4gIGNvbnN0IEB7fVxuICAgIHJhbmRvbV9pZCwgbXNnX3VucGFjaywgbXNnX3BhY2tcbiAgICBvbl9lcnJvcjogZGVmYXVsdF9vbl9lcnJvclxuICAgIG9uX3NodXRkb3duOiBkZWZhdWx0X29uX3NodXRkb3duXG4gID0gcGx1Z2luX29wdGlvbnNcblxuICByZXR1cm4gQDogb3JkZXI6IDEsIHN1YmNsYXNzLCBwb3N0XG4gIFxuICBmdW5jdGlvbiBzdWJjbGFzcyhGYWJyaWNIdWJfUEksIGJhc2VzKSA6OlxuICAgIGNvbnN0IHtwYWNrZXRQYXJzZXJ9ID0gRmFicmljSHViX1BJLnByb3RvdHlwZVxuICAgIGlmIG51bGw9PXBhY2tldFBhcnNlciB8fCAhIHBhY2tldFBhcnNlci5pc1BhY2tldFBhcnNlcigpIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEludmFsaWQgcGFja2V0UGFyc2VyIGZvciBwbHVnaW5gXG4gICAgXG4gICAgRmFicmljSHViX1BJLnByb3RvdHlwZS5lbmRwb2ludCA9XG4gICAgICBiaW5kRW5kcG9pbnRBcGkgQCBwYWNrZXRQYXJzZXJcblxuICBmdW5jdGlvbiBwb3N0KGh1YikgOjpcbiAgICByZXR1cm4gaHViLmVuZHBvaW50ID0gaHViLmVuZHBvaW50KGh1YilcblxuICBmdW5jdGlvbiBiaW5kRW5kcG9pbnRBcGkocGFja2V0UGFyc2VyKSA6OlxuICAgIGNvbnN0IHByb3RvY29scyA9IGluaXRfcHJvdG9jb2wgQCBwYWNrZXRQYXJzZXIsIEB7fSByYW5kb21faWQsIGpzb25fcGFjazogbXNnX3BhY2soKVxuICAgIGNvbnN0IFNpbmsgPSBTaW5rQmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgIGNvbnN0IE1zZ0N0eCA9IE1zZ0N0eEJhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICBjb25zdCBFbmRwb2ludCA9IEVuZHBvaW50QmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuXG4gICAgcGx1Z2luX29wdGlvbnMuc3ViY2xhc3MgQDpcbiAgICAgIFNpbmssIEVuZHBvaW50LCBNc2dDdHgsIHByb3RvY29sc1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGh1YikgOjpcbiAgICAgIHJldHVybiBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEA6IGNyZWF0ZSwgc2VydmVyOiBlbmRwb2ludCwgY2xpZW50XG5cbiAgICAgIGZ1bmN0aW9uIGNsaWVudCguLi5hcmdzKSA6OlxuICAgICAgICBjb25zdCBtc2dfY3R4ID0gTXNnQ3R4LmZyb20gQCBudWxsLCBodWJcbiAgICAgICAgcmV0dXJuIDAgIT09IGFyZ3MubGVuZ3RoXG4gICAgICAgICAgPyBtc2dfY3R4LndpdGgoLi4uYXJncykgOiBtc2dfY3R4XG5cbiAgICAgIGZ1bmN0aW9uIGVuZHBvaW50KG9uX2luaXQpIDo6XG4gICAgICAgIHJldHVybiBjcmVhdGUgQCByYW5kb21faWQoKSwgb25faW5pdFxuXG4gICAgICBmdW5jdGlvbiBjcmVhdGUoaWRfdGFyZ2V0LCBvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCBtc2dfY3R4ID0gTXNnQ3R4LmZyb20gQCBpZF90YXJnZXQsIGh1YlxuICAgICAgICBjb25zdCBlcCA9IG5ldyBFbmRwb2ludChtc2dfY3R4KVxuXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IG9uX2luaXQoZXAsIGh1YilcbiAgICAgICAgY29uc3Qgb25fbXNnID0gKHRhcmdldC5vbl9tc2cgfHwgdGFyZ2V0KS5iaW5kKHRhcmdldClcbiAgICAgICAgY29uc3Qgb25fZXJyb3IgPSAodGFyZ2V0Lm9uX2Vycm9yIHx8IGRlZmF1bHRfb25fZXJyb3IpLmJpbmQodGFyZ2V0KVxuICAgICAgICBjb25zdCBvbl9zaHV0ZG93biA9ICh0YXJnZXQub25fc2h1dGRvd24gfHwgZGVmYXVsdF9vbl9zaHV0ZG93bikuYmluZCh0YXJnZXQpXG5cbiAgICAgICAgY29uc3Qgc2luayA9IG5ldyBTaW5rIEAgZXAuanNvbl91bnBhY2sgfHwgbXNnX3VucGFjayhlcClcbiAgICAgICAgc2luay5yZWdpc3RlciBAIGVwLCBodWIsIGlkX3RhcmdldCxcbiAgICAgICAgICBAe30gb25fbXNnLCBvbl9lcnJvciwgb25fc2h1dGRvd25cblxuICAgICAgICBsZXQgcmVhZHkgPSBQcm9taXNlLnJlc29sdmUodGFyZ2V0KVxuICAgICAgICBpZiB0YXJnZXQub25fcmVhZHkgOjpcbiAgICAgICAgICByZWFkeSA9IHJlYWR5LnRoZW4gQCB0YXJnZXQgPT4gdGFyZ2V0Lm9uX3JlYWR5KClcblxuICAgICAgICBjb25zdCByZXMgPSBPYmplY3QuY3JlYXRlIEAgZW5kcG9pbnRfdGFyZ2V0X2FwaSwgQDpcbiAgICAgICAgICBpZF9yb3V0ZXI6IEB7fSBlbnVtZXJhYmxlOiB0cnVlLCB2YWx1ZTogaHViLnJvdXRlci5pZF9zZWxmXG4gICAgICAgICAgaWRfdGFyZ2V0OiBAe30gZW51bWVyYWJsZTogdHJ1ZSwgdmFsdWU6IGlkX3RhcmdldFxuICAgICAgICAgIHJlYWR5OiBAe30gdmFsdWU6IHJlYWR5LnRoZW4gQCAoKSA9PiByZXNcbiAgICAgICAgcmV0dXJuIHJlc1xuXG5jb25zdCBlbmRwb2ludF90YXJnZXRfYXBpID0gQDpcbiAgdmFsdWVPZigpIDo6IHJldHVybiAwIHwgdGhpcy5pZF90YXJnZXRcbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFbmRwb2ludCBUYXJnZXQgJHt0aGlzLmlkX3RhcmdldH3Cu2BcblxuIiwiaW1wb3J0IGVuZHBvaW50X3BsdWdpbiBmcm9tICcuL3BsdWdpbi5qc3knXG5cbmNvbnN0IGdldFJhbmRvbVZhbHVlcyA9ICd1bmRlZmluZWQnICE9PSB0eXBlb2Ygd2luZG93XG4gID8gd2luZG93LmNyeXB0by5nZXRSYW5kb21WYWx1ZXMgOiBudWxsXG5cbmVuZHBvaW50X2Jyb3dzZXIucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5mdW5jdGlvbiByYW5kb21faWQoKSA6OlxuICBjb25zdCBhcnIgPSBuZXcgSW50MzJBcnJheSgxKVxuICBnZXRSYW5kb21WYWx1ZXMoYXJyKVxuICByZXR1cm4gYXJyWzBdXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGVuZHBvaW50X2Jyb3dzZXIocGx1Z2luX29wdGlvbnM9e30pIDo6XG4gIGlmIG51bGwgPT0gcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkIDo6XG4gICAgcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5cbiAgcmV0dXJuIGVuZHBvaW50X3BsdWdpbihwbHVnaW5fb3B0aW9ucylcblxuIl0sIm5hbWVzIjpbImxpdHRsZV9lbmRpYW4iLCJjX3NpbmdsZSIsImNfZGF0YWdyYW0iLCJjX2RpcmVjdCIsImNfbXVsdGlwYXJ0IiwiY19zdHJlYW1pbmciLCJfZXJyX21zZ2lkX3JlcXVpcmVkIiwiX2Vycl90b2tlbl9yZXF1aXJlZCIsImZybV9yb3V0aW5nIiwic2l6ZSIsImJpdHMiLCJtYXNrIiwib2JqIiwiZnJvbV9pZCIsImR2Iiwib2Zmc2V0Iiwic2V0SW50MzIiLCJpZF9yb3V0ZXIiLCJpZF90YXJnZXQiLCJ1bmRlZmluZWQiLCJnZXRJbnQzMiIsImZybV9yZXNwb25zZSIsIm1zZ2lkIiwiRXJyb3IiLCJzZXRJbnQxNiIsInNlcV9hY2siLCJhY2tfZmxhZ3MiLCJ0b2tlbiIsImdldEludDE2IiwiZnJtX2RhdGFncmFtIiwidHJhbnNwb3J0IiwiZnJtX2RpcmVjdCIsImZybV9tdWx0aXBhcnQiLCJzZXFfcG9zIiwic2VxIiwic2VxX2ZsYWdzIiwiZnJtX3N0cmVhbWluZyIsImJpbmRfc2VxX25leHQiLCJzZXFfb2Zmc2V0Iiwic2VxX25leHQiLCJmbGFncyIsImZpbiIsIk5hTiIsImNvbXBvc2VGcmFtaW5ncyIsImZybV9mcm9tIiwiZnJtX3Jlc3AiLCJmcm1fdHJhbnNwb3J0cyIsImxlbmd0aCIsImJ5Qml0cyIsInRfZnJvbSIsImZfdGVzdCIsInRfcmVzcCIsInQwIiwidDEiLCJ0MiIsInQzIiwibWFwIiwiZiIsInRlc3RCaXRzIiwiY2hvb3NlIiwibHN0IiwiVCIsImIiLCJvcCIsImZuX2tleSIsImZuX3RyYW4iLCJmbl9mcm9tIiwiZm5fcmVzcCIsImZybSIsImJpbmRBc3NlbWJsZWQiLCJmX3BhY2siLCJmX3VucGFjayIsInBhY2siLCJ1bnBhY2siLCJwa3RfdHlwZSIsInBrdF9vYmoiLCJUeXBlRXJyb3IiLCJ0eXBlIiwiRGF0YVZpZXciLCJBcnJheUJ1ZmZlciIsImhlYWRlciIsImJ1ZmZlciIsInNsaWNlIiwicGt0IiwiYnVmIiwiaGVhZGVyX2J1ZmZlciIsIlVpbnQ4QXJyYXkiLCJpbmZvIiwiX2JpbmRfaXRlcmFibGUiLCJidWZfY2xvbmUiLCJ0dGwiLCJuZXh0Iiwib3B0aW9ucyIsImRvbmUiLCJ2YWx1ZSIsInBhY2tldFBhcnNlciIsImZyYWdtZW50X3NpemUiLCJjb25jYXRCdWZmZXJzIiwicGFja1BhY2tldE9iaiIsInBhY2tfdXRmOCIsInVucGFja191dGY4IiwiTnVtYmVyIiwicmFuZG9tX2lkIiwianNvbl9wYWNrIiwiY3JlYXRlU3RyZWFtIiwicGFja2V0RnJhZ21lbnRzIiwiY3JlYXRlTXVsdGlwYXJ0Iiwic2luayIsInBhcnRzIiwiZmVlZCIsImJvZHlfYnVmZmVyIiwiaW5jbHVkZXMiLCJkZWxldGVTdGF0ZUZvciIsInJlcyIsInJlY3ZEYXRhIiwicnN0cmVhbSIsInN0YXRlIiwiZmVlZF9pbml0IiwiYXNfY29udGVudCIsImZlZWRfaWdub3JlIiwibXNnIiwianNvbl91bnBhY2siLCJib2R5X3V0ZjgiLCJyZWN2U3RyZWFtIiwicmVjdlN0cmVhbURhdGEiLCJiaW5kIiwiZXJyIiwib25fZXJyb3IiLCJmZWVkX2JvZHkiLCJvbl9pbml0IiwiZGF0YSIsIm9uX2RhdGEiLCJvbl9lbmQiLCJmZWVkX3NlcSIsIm5leHRfaGRyIiwiaSIsImxhc3RJbm5lciIsImJ5dGVMZW5ndGgiLCJpMCIsImJvZHkiLCJiaW5kVHJhbnNwb3J0SW1wbHMiLCJpbmJvdW5kIiwiaGlnaGJpdHMiLCJ0cmFuc3BvcnRzIiwib3V0Ym91bmQiLCJmcmFtaW5ncyIsImZyYW1lIiwiaW1wbCIsInRfcmVjdiIsInBhY2tfaGRyIiwicmVjdl9tc2ciLCJiaW5kVHJhbnNwb3J0cyIsInBhY2tCb2R5Iiwic3RyZWFtaW5nIiwic2VuZCIsInN0cmVhbSIsImJpbmRfc3RyZWFtIiwibW9kZSIsImNoYW4iLCJtc2VuZCIsIm1zZW5kX2J5dGVzIiwic2VudCIsIm1zZW5kX29iamVjdHMiLCJtc2VuZF9pbXBsIiwib2JqZWN0IiwiYnl0ZXMiLCJ3cml0ZSIsImVuZCIsImNodW5rIiwiY2hlY2tfZm5zIiwia2V5cyIsImtleSIsImpzb25fcHJvdG9jb2wiLCJzaGFyZWQiLCJkYXRhZ3JhbSIsImRpcmVjdCIsInJlY3ZNc2ciLCJzdGF0ZUZvciIsImJvZHlfYnVmIiwidW5wYWNrQm9keSIsImJpbmFyeV9wcm90b2NvbCIsImFzQnVmZmVyIiwicGt0X2J1ZmZlciIsImNvbnRyb2xfcHJvdG9jb2wiLCJoaWdoIiwicGluZ19mcmFtZSIsInBvbmdfZnJhbWUiLCJwb25nX3R5cGUiLCJyZWN2X3BvbmciLCJwaW5nX3R5cGUiLCJyZWN2X3BpbmciLCJwaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsInRzMCIsIkRhdGUiLCJyb3V0ZXIiLCJib2R5X2pzb24iLCJyZWN2Q3RybCIsIl9zZW5kX3BvbmciLCJwa3RfcGluZyIsInJfaWQiLCJ0czEiLCJkaXNwYXRjaCIsImluaXRfcHJvdG9jb2wiLCJzaGFyZWRfcHJvdG8iLCJqc29uIiwianNvbl9wcm90byIsImJpbmFyeSIsImJpbmFyeV9wcm90byIsImNvbnRyb2wiLCJjb250cm9sX3Byb3RvIiwiY29kZWNzIiwiZGVmYXVsdCIsIkVuZHBvaW50IiwiZm9yUHJvdG9jb2xzIiwibXNnX2N0eCIsIndpdGhFbmRwb2ludCIsImRlZmluZVByb3BlcnRpZXMiLCJlbnVtZXJhYmxlIiwidG8iLCJNYXAiLCJjcmVhdGVNYXAiLCJieV90b2tlbiIsImNyZWF0ZVJlcGx5TWFwIiwiYnlfdHJhZmZpYyIsImNyZWF0ZVRyYWZmaWNNYXAiLCJ0cmFmZmljIiwidHMiLCJub3ciLCJ0IiwiZ2V0IiwicmVjdlRyYWZmaWMiLCJjcmVhdGVTdGF0ZU1hcCIsInJtc2ciLCJyZXBseSIsInJlc29sdmUiLCJ0aGVuIiwid2FybiIsImluaXRSZXBseSIsImtpbmQiLCJpbml0UmVwbHlQcm9taXNlIiwibXNfdGltZW91dCIsIm1vbml0b3IiLCJzZXQiLCJhbnMiLCJQcm9taXNlIiwicmVqZWN0IiwidGlkIiwic2V0VGltZW91dCIsInRpbWVvdXQiLCJ1bnJlZiIsIlJlcGx5VGltZW91dCIsIk9iamVjdCIsImFzc2lnbiIsInByb3RvdHlwZSIsIlNpbmsiLCJfcHJvdG9jb2wiLCJlbmRwb2ludCIsImh1YiIsImhhbmRsZXJzIiwidW5yZWdpc3RlciIsInVucmVnaXN0ZXJUYXJnZXQiLCJyZWdpc3RlclRhcmdldCIsIl9iaW5kRGlzcGF0Y2giLCJvbl9tc2ciLCJvbl9zaHV0ZG93biIsImFsaXZlIiwicHJvdG9jb2wiLCJpc0FsaXZlIiwic2h1dGRvd24iLCJleHRyYSIsImJpbmRTaW5rIiwiem9uZSIsInRlcm1pbmF0ZSIsImlmQWJzZW50IiwiZW50cnkiLCJieV9tc2dpZCIsImRlbGV0ZSIsIk1zZ0N0eCIsIndpdGhDb2RlY3MiLCJyZXNvbHZlUm91dGUiLCJmcmVlemUiLCJjdHgiLCJmcm9tIiwiaWRfc2VsZiIsImJpbmRSb3V0ZURpc3BhdGNoIiwiYXJncyIsImNsb25lIiwid2l0aCIsImNvZGVjIiwiaW52b2tlIiwiYXNzZXJ0TW9uaXRvciIsIl9jb2RlYyIsInRndCIsInJlcGx5X2lkIiwiY3JlYXRlIiwiX3Jvb3RfIiwiY2hlY2tNb25pdG9yIiwiYWN0aXZlIiwiaW5pdE1vbml0b3IiLCJ0c19kdXJhdGlvbiIsInRzX2FjdGl2ZSIsInByb21pc2UiLCJ0ZCIsInRzX2ludGVydmFsIiwiY3RybCIsImNoZWNrUGluZyIsInNldEludGVydmFsIiwiY2xlYXIiLCJjbGVhckludGVydmFsIiwibXNnX2NvZGVjIiwiX21zZ0NvZGVjcyIsIm1zZ0NvZGVjcyIsIm5hbWUiLCJlbnRyaWVzIiwiZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyIsImVycm9yIiwicHJvdG9jb2xzIiwiZXAiLCJwYXJzZSIsInBsdWdpbl9vcHRpb25zIiwibXNnX3VucGFjayIsIm1zZ19wYWNrIiwiZGVmYXVsdF9vbl9lcnJvciIsImRlZmF1bHRfb25fc2h1dGRvd24iLCJvcmRlciIsInN1YmNsYXNzIiwicG9zdCIsIkZhYnJpY0h1Yl9QSSIsImJhc2VzIiwiaXNQYWNrZXRQYXJzZXIiLCJiaW5kRW5kcG9pbnRBcGkiLCJTaW5rQmFzZSIsIk1zZ0N0eEJhc2UiLCJFbmRwb2ludEJhc2UiLCJzZXJ2ZXIiLCJjbGllbnQiLCJ0YXJnZXQiLCJyZWdpc3RlciIsInJlYWR5Iiwib25fcmVhZHkiLCJlbmRwb2ludF90YXJnZXRfYXBpIiwiZ2V0UmFuZG9tVmFsdWVzIiwid2luZG93IiwiY3J5cHRvIiwiZW5kcG9pbnRfYnJvd3NlciIsImFyciIsIkludDMyQXJyYXkiLCJlbmRwb2ludF9wbHVnaW4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLE1BQU1BLGdCQUFnQixJQUF0QjtBQUNBLE1BQU1DLFdBQVcsUUFBakI7QUFDQSxNQUFNQyxhQUFhLFVBQW5CO0FBQ0EsTUFBTUMsV0FBVyxRQUFqQjtBQUNBLE1BQU1DLGNBQWMsV0FBcEI7QUFDQSxNQUFNQyxjQUFjLFdBQXBCOztBQUVBLE1BQU1DLHNCQUF1QiwwQkFBN0I7QUFDQSxNQUFNQyxzQkFBdUIsMkJBQTdCOztBQUdBLFNBQVNDLFdBQVQsR0FBdUI7UUFDZkMsT0FBTyxDQUFiO1FBQWdCQyxPQUFPLEdBQXZCO1FBQTRCQyxPQUFPLEdBQW5DO1NBQ087UUFBQSxFQUNDRCxJQURELEVBQ09DLElBRFA7O1dBR0VDLEdBQVAsRUFBWTthQUFVLFFBQVFBLElBQUlDLE9BQVosR0FBc0JILElBQXRCLEdBQTZCLEtBQXBDO0tBSFY7O1dBS0VFLEdBQVAsRUFBWUUsRUFBWixFQUFnQkMsTUFBaEIsRUFBd0I7WUFDaEIsRUFBQ0YsT0FBRCxLQUFZRCxHQUFsQjtTQUNHSSxRQUFILENBQWMsSUFBRUQsTUFBaEIsRUFBd0IsSUFBRUYsUUFBUUksU0FBbEMsRUFBNkNqQixhQUE3QztTQUNHZ0IsUUFBSCxDQUFjLElBQUVELE1BQWhCLEVBQXdCLElBQUVGLFFBQVFLLFNBQWxDLEVBQTZDbEIsYUFBN0M7S0FSRzs7YUFVSVksR0FBVCxFQUFjRSxFQUFkLEVBQWtCQyxNQUFsQixFQUEwQjtZQUNsQkYsVUFBVU0sY0FBY1AsSUFBSUMsT0FBbEIs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

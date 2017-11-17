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

  const { random_id, json_reviver, json_replacer } = options;
  return { packetParser, random_id, json_parse, json_stringify,
    createMultipart, createStream, packetFragments,
    bindTransports };

  function json_parse(text) {
    return JSON.parse(text, json_reviver);
  }
  function json_stringify(obj) {
    return JSON.stringify(obj, json_replacer);
  }

  function createMultipart(pkt, sink) {
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

      const res = concatBuffers(parts);
      parts = null;
      return res;
    }
  }

  function createStream(pkt, sink) {
    let next = 0,
        fin = false,
        rstream;
    const state = { feed: feed_init, info: pkt.info };
    return state;

    function on_error(err, pkt) {
      if (undefined === rstream.on_error) {
        return void console.warn(`Error during stream.feed:`, err);
      }
      return rstream.on_error(err, pkt);
    }

    function feed_init(pkt, as_content) {
      state.feed = feed_ignore;

      const msg = json_parse(pkt.body_utf8());
      rstream = sink.recvStream(msg, pkt.info);
      if (null == rstream) {
        return;
      }

      try {
        if (!feed_seq(pkt)) {
          return;
        }
        state.feed = feed_body;
      } catch (err) {
        return on_error(err, pkt);
      }

      if ('function' === typeof rstream.on_init) {
        return rstream.on_init(msg, pkt);
      } else return sink.recvMsg(msg, pkt.info);
    }

    function feed_body(pkt, as_content) {
      let data;
      try {
        if (!feed_seq(pkt)) {
          return;
        }
        data = as_content(pkt);
      } catch (err) {
        return on_error(err, pkt);
      }
      return rstream.on_data(data, pkt);
    }

    function feed_ignore() {}

    function feed_seq(pkt) {
      let seq = pkt.info.seq;
      if (seq < 0) {
        seq = -seq;
      }
      if (next === seq) {
        return ++next;
      }
      state.feed = feed_ignore;
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
    const stream = !transports.streaming ? null : 'object' === transports.streaming.mode ? bind_stream(msend_objects) : bind_stream(msend_bytes);

    return { send, stream };

    function send(chan, obj, body) {
      body = packBody(body);
      if (fragment_size < body.byteLength) {
        if (!obj.token) {
          obj.token = random_id();
        }
        const msend = msend_bytes('multipart', chan, obj);
        return { sent: msend(true, body) };
      }

      obj.transport = 'single';
      obj.body = body;
      const pack_hdr = outbound.choose(obj);
      const pkt = packPacketObj(pack_hdr(obj));
      return { sent: chan(pkt) };
    }

    function msend_bytes(transport, chan, obj, msg) {
      obj.transport = transport;
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

    function msend_objects(transport, chan, obj, msg) {
      obj.transport = transport;
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

    function bind_stream(send_impl) {
      return function stream(chan, obj, msg) {
        if (!obj.token) {
          obj.token = random_id();
        }
        if ('object' !== typeof msg) {
          throw new TypeError(`stream() requires a JSON seralizable msg for initial packet`);
        }
        msg = json_stringify(msg);
        const msend = send_impl('streaming', chan, obj, msg);
        write.write = write;write.end = end;
        return write;

        function write(chunk) {
          return chunk != null ? msend(false, packBody(chunk)) : msend(true);
        }

        function end(chunk) {
          return chunk != null ? msend(true, packBody(chunk)) : msend(true);
        }
      };
    }
  }
};

function json_protocol(shared) {
  const { createMultipart, createStream, json_parse, json_stringify } = shared;
  const { pack_utf8, unpack_utf8 } = shared.packetParser;

  return {
    packBody,
    packStream(chunk, fragment_size) {
      return [packBody(chunk)];
    },

    get datagram() {
      return this.direct;
    },
    direct: {
      t_recv(pkt, sink) {
        const msg = json_parse(pkt.body_utf8() || undefined);
        return sink.recvMsg(msg, pkt.info);
      } },

    multipart: {
      t_recv(pkt, sink) {
        const state = sink.stateFor(pkt, createMultipart);
        const body_buf = state.feed(pkt);
        if (undefined !== body_buf) {
          const msg = json_parse(unpack_utf8(body_buf) || undefined);
          return sink.recvMsg(msg, state.info);
        }
      } },

    streaming: {
      mode: 'object',
      t_recv(pkt, sink) {
        const state = sink.stateFor(pkt, createStream);
        return state.feed(pkt, pkt_as_ndjson);
      } } };

  function packBody(body) {
    return pack_utf8(json_stringify(body));
  }

  function pkt_as_ndjson(pkt) {
    return pkt.body_utf8().split(/\r|\n|\0/).filter(l => l).map(json_parse);
  }
}

function binary_protocol(shared) {
  const { createMultipart, createStream } = shared;
  const { asBuffer } = shared.packetParser;
  return {
    packBody: asBuffer,
    packStream(chunk, fragment_size) {
      return [asBuffer(chunk)];
    },

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
      _by_token: { value: this.createReplyMap() },
      _by_traffic: { value: this.createTrafficMap() },
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
    const by_token = this._by_token;
    const by_traffic = this._by_traffic;
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

      recvStream: (msg, info) => {
        traffic(info.from_id, 'stream');
        const rstream = this.recvStream(msg, info);
        const rmsg = rstream.on_init ? rstream.on_init(msg, info) : this.recvMsg(msg, info);

        if (rstream != null && 'function' !== typeof rstream.on_data) {
          throw new TypeError(`Expected object with on_data(data, pkt) function`);
        }

        const reply = by_token.get(info.token);
        if (undefined !== reply) {
          Promise.resolve(rmsg).then(reply);
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
    //return @{}
    //  on_data(data, pkt) ::
    //  on_error(err, pkt) ::
  }initReply(token, msg_ctx, kind) {
    return this.initReplyPromise(token, msg_ctx.ms_timeout);
  }

  initMonitor(id_target) {
    const key = id_target.id_target || id_target;
    let monitor = this._by_traffic.get(key);
    if (undefined === monitor) {
      monitor = { id_target, ts: Date.now(),
        td() {
          return Date.now() - this.ts;
        } };
      this._by_traffic.set(key, monitor);
    }
    return monitor;
  }

  initReplyPromise(token, ms_timeout) {
    const ans = new Promise((resolve, reject) => {
      this._by_token.set(token, resolve);
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

  static register(endpoint, kw_args) {
    return new this().register(endpoint, kw_args);
  }
  register(endpoint, { hub, id_target, on_msg, on_error }) {
    const unregister = () => hub.router.unregisterTarget(id_target);

    hub.router.registerTarget(id_target, this._bindDispatch(endpoint, on_msg, on_error, unregister));
    return this;
  }

  _bindDispatch(endpoint, on_msg, on_error, unregister) {
    let alive = true;
    const protocol = this._protocol;
    const isAlive = () => alive;
    const shutdown = err => {
      if (alive) {
        unregister();unregister = alive = false;
        if (err) {
          console.error('ENDPOINT SHUTDOWN: ' + err);
        }
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
        return on_error(false, { pkt });
      }

      try {
        var msg = await recv_msg(pkt, this, router);
        if (!msg) {
          return msg;
        }

        return await on_msg(msg, pkt);
      } catch (err) {
        if (false !== on_error(err, { msg, pkt })) {
          endpoint.shutdown(err, { msg, pkt });
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
        entry = ifAbsent(pkt, this);
      } else entry = ifAbsent;
      this.by_msgid.set(msgid, entry);
    }
    return entry;
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
  on_error: console.error,
  subclass({ Sink: Sink$$1, Endpoint: Endpoint$$1, SourceEndpoint, protocols }) {} };

var endpoint_plugin = function (plugin_options) {
  plugin_options = Object.assign({}, default_plugin_options, plugin_options);
  const {
    random_id, json_reviver, json_replacer,
    on_error: default_on_error } = plugin_options;

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
    const protocols = init_protocol(packetParser, { random_id, json_reviver, json_replacer });
    const Sink$$1 = Sink.forProtocols(protocols);
    const MsgCtx$$1 = MsgCtx.forProtocols(protocols);
    const Endpoint$$1 = Endpoint.forProtocols(protocols);

    plugin_options.subclass({
      Sink: Sink$$1, Endpoint: Endpoint$$1, MsgCtx: MsgCtx$$1, protocols });

    return function (hub) {
      return Object.assign(endpoint, { create: endpoint, server: endpoint, client });

      function client(...args) {
        const msg_ctx = MsgCtx$$1.from(null, hub);
        return 0 !== args.length ? msg_ctx.with(...args) : msg_ctx;
      }

      function endpoint(on_init) {
        const id_target = random_id();
        const msg_ctx = MsgCtx$$1.from(id_target, hub);
        const ep = new Endpoint$$1(msg_ctx);

        const target = on_init(ep);
        const on_msg = (target.on_msg || target).bind(target);
        const on_error = (target.on_error || default_on_error).bind(target);

        Sink$$1.register(ep, {
          hub, id_target, on_msg, on_error });

        if (target.on_ready) {
          Promise.resolve(target).then(target => target.on_ready());
        }

        return Object.create(endpoint_target_api, {
          id_router: { enumerable: true, value: hub.router.id_self },
          id_target: { enumerable: true, value: id_target } });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3Nlci51bWQuanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvcHJvdG9jb2wvZnJhbWluZy5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL3NoYXJlZC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2pzb24uanN5IiwiLi4vY29kZS9wcm90b2NvbC9iaW5hcnkuanN5IiwiLi4vY29kZS9wcm90b2NvbC9jb250cm9sLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvaW5kZXguanN5IiwiLi4vY29kZS9lbmRwb2ludC5qc3kiLCIuLi9jb2RlL3NpbmsuanN5IiwiLi4vY29kZS9tc2djdHguanN5IiwiLi4vY29kZS9wbHVnaW4uanN5IiwiLi4vY29kZS9pbmRleC5icm93c2VyLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBsaXR0bGVfZW5kaWFuID0gdHJ1ZVxuY29uc3QgY19zaW5nbGUgPSAnc2luZ2xlJ1xuY29uc3QgY19kYXRhZ3JhbSA9ICdkYXRhZ3JhbSdcbmNvbnN0IGNfZGlyZWN0ID0gJ2RpcmVjdCdcbmNvbnN0IGNfbXVsdGlwYXJ0ID0gJ211bHRpcGFydCdcbmNvbnN0IGNfc3RyZWFtaW5nID0gJ3N0cmVhbWluZydcblxuY29uc3QgX2Vycl9tc2dpZF9yZXF1aXJlZCA9IGBSZXNwb25zZSByZXFpcmVzICdtc2dpZCdgXG5jb25zdCBfZXJyX3Rva2VuX3JlcXVpcmVkID0gYFRyYW5zcG9ydCByZXFpcmVzICd0b2tlbidgXG5cblxuZnVuY3Rpb24gZnJtX3JvdXRpbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MSwgbWFzayA9IDB4MVxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLmZyb21faWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCB7ZnJvbV9pZH0gPSBvYmpcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF9yb3V0ZXIsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDMyIEAgNCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF90YXJnZXQsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IGZyb21faWQgPSB1bmRlZmluZWQgPT09IG9iai5mcm9tX2lkXG4gICAgICAgID8gb2JqLmZyb21faWQgPSB7fSA6IG9iai5mcm9tX2lkXG4gICAgICBmcm9tX2lkLmlkX3JvdXRlciA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGZyb21faWQuaWRfdGFyZ2V0ID0gZHYuZ2V0SW50MzIgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5mdW5jdGlvbiBmcm1fcmVzcG9uc2UoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MiwgbWFzayA9IDB4MlxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLm1zZ2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoubXNnaWQgOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl9tc2dpZF9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLm1zZ2lkLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXFfYWNrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5hY2tfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50b2tlbiA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfYWNrID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLmFja19mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuXG5cbmZ1bmN0aW9uIGZybV9kYXRhZ3JhbSgpIDo6XG4gIGNvbnN0IHNpemUgPSAwLCBiaXRzID0gMHgwLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RhdGFncmFtXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGF0YWdyYW0gPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kYXRhZ3JhbVxuXG5mdW5jdGlvbiBmcm1fZGlyZWN0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDQsIGJpdHMgPSAweDQsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGlyZWN0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGlyZWN0ID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGlyZWN0XG5cbmZ1bmN0aW9uIGZybV9tdWx0aXBhcnQoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4OCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19tdWx0aXBhcnRcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19tdWx0aXBhcnQgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjogLy8gdXNlIHNlcV9uZXh0XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX211bHRpcGFydFxuXG5mdW5jdGlvbiBmcm1fc3RyZWFtaW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweGMsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfc3RyZWFtaW5nXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfc3RyZWFtaW5nID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW4gLy8gdXNlIHNlcV9uZXh0XG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19zdHJlYW1pbmdcblxuXG5mdW5jdGlvbiBiaW5kX3NlcV9uZXh0KG9mZnNldCkgOjpcbiAgY29uc3Qgc2VxX29mZnNldCA9IHRoaXMuc2VxX3BvcyArIG9mZnNldFxuICBsZXQgc2VxID0gMVxuICByZXR1cm4gZnVuY3Rpb24gc2VxX25leHQoe2ZsYWdzLCBmaW59LCBkdikgOjpcbiAgICBpZiAhIGZpbiA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCBzZXErKywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICBlbHNlIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIC1zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgICBzZXEgPSBOYU5cblxuXG5cbmV4cG9ydCBkZWZhdWx0IGNvbXBvc2VGcmFtaW5ncygpXG5mdW5jdGlvbiBjb21wb3NlRnJhbWluZ3MoKSA6OlxuICBjb25zdCBmcm1fZnJvbSA9IGZybV9yb3V0aW5nKCksIGZybV9yZXNwID0gZnJtX3Jlc3BvbnNlKClcbiAgY29uc3QgZnJtX3RyYW5zcG9ydHMgPSBAW10gZnJtX2RhdGFncmFtKCksIGZybV9kaXJlY3QoKSwgZnJtX211bHRpcGFydCgpLCBmcm1fc3RyZWFtaW5nKClcblxuICBpZiA4ICE9PSBmcm1fZnJvbS5zaXplIHx8IDggIT09IGZybV9yZXNwLnNpemUgfHwgNCAhPSBmcm1fdHJhbnNwb3J0cy5sZW5ndGggOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgRnJhbWluZyBTaXplIGNoYW5nZWBcblxuICBjb25zdCBieUJpdHMgPSBbXSwgbWFzaz0weGZcblxuICA6OlxuICAgIGNvbnN0IHRfZnJvbSA9IGZybV9mcm9tLmZfdGVzdCwgdF9yZXNwID0gZnJtX3Jlc3AuZl90ZXN0XG4gICAgY29uc3QgW3QwLHQxLHQyLHQzXSA9IGZybV90cmFuc3BvcnRzLm1hcCBAIGY9PmYuZl90ZXN0XG5cbiAgICBjb25zdCB0ZXN0Qml0cyA9IGJ5Qml0cy50ZXN0Qml0cyA9IG9iaiA9PlxuICAgICAgMCB8IHRfZnJvbShvYmopIHwgdF9yZXNwKG9iaikgfCB0MChvYmopIHwgdDEob2JqKSB8IHQyKG9iaikgfCB0MyhvYmopXG5cbiAgICBieUJpdHMuY2hvb3NlID0gZnVuY3Rpb24gKG9iaiwgbHN0KSA6OlxuICAgICAgaWYgbnVsbCA9PSBsc3QgOjogbHN0ID0gdGhpcyB8fCBieUJpdHNcbiAgICAgIHJldHVybiBsc3RbdGVzdEJpdHMob2JqKV1cblxuXG4gIGZvciBjb25zdCBUIG9mIGZybV90cmFuc3BvcnRzIDo6XG4gICAgY29uc3Qge2JpdHM6Yiwgc2l6ZSwgdHJhbnNwb3J0fSA9IFRcblxuICAgIGJ5Qml0c1tifDBdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwwLCBtYXNrLCBzaXplOiBzaXplLCBvcDogJydcbiAgICBieUJpdHNbYnwxXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MSwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAnZidcbiAgICBieUJpdHNbYnwyXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MiwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAncidcbiAgICBieUJpdHNbYnwzXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MywgbWFzaywgc2l6ZTogMTYgKyBzaXplLCBvcDogJ2ZyJ1xuXG4gICAgZm9yIGNvbnN0IGZuX2tleSBvZiBbJ2ZfcGFjaycsICdmX3VucGFjayddIDo6XG4gICAgICBjb25zdCBmbl90cmFuID0gVFtmbl9rZXldLCBmbl9mcm9tID0gZnJtX2Zyb21bZm5fa2V5XSwgZm5fcmVzcCA9IGZybV9yZXNwW2ZuX2tleV1cblxuICAgICAgYnlCaXRzW2J8MF1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3RyYW4ob2JqLCBkdiwgMClcbiAgICAgIGJ5Qml0c1tifDFdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwyXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fcmVzcChvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8M11bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3Jlc3Aob2JqLCBkdiwgOCk7IGZuX3RyYW4ob2JqLCBkdiwgMTYpXG5cbiAgZm9yIGNvbnN0IGZybSBvZiBieUJpdHMgOjpcbiAgICBiaW5kQXNzZW1ibGVkIEAgZnJtXG5cbiAgcmV0dXJuIGJ5Qml0c1xuXG5cbmZ1bmN0aW9uIGJpbmRBc3NlbWJsZWQoZnJtKSA6OlxuICBjb25zdCB7VCwgc2l6ZSwgZl9wYWNrLCBmX3VucGFja30gPSBmcm1cbiAgaWYgVC5iaW5kX3NlcV9uZXh0IDo6XG4gICAgZnJtLnNlcV9uZXh0ID0gVC5iaW5kX3NlcV9uZXh0IEAgZnJtLnNpemUgLSBULnNpemVcblxuICBkZWxldGUgZnJtLlRcbiAgZnJtLnBhY2sgPSBwYWNrIDsgZnJtLnVucGFjayA9IHVucGFja1xuICBjb25zdCBzZXFfbmV4dCA9IGZybS5zZXFfbmV4dFxuXG4gIGZ1bmN0aW9uIHBhY2socGt0X3R5cGUsIHBrdF9vYmopIDo6XG4gICAgaWYgISBAIDAgPD0gcGt0X3R5cGUgJiYgcGt0X3R5cGUgPD0gMjU1IDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBrdF90eXBlIHRvIGJlIFswLi4yNTVdYFxuXG4gICAgcGt0X29iai50eXBlID0gcGt0X3R5cGVcbiAgICBpZiBzZXFfbmV4dCAmJiBudWxsID09IHBrdF9vYmouc2VxIDo6XG4gICAgICBwa3Rfb2JqLnNlcSA9IHRydWVcblxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IEFycmF5QnVmZmVyKHNpemUpXG4gICAgZl9wYWNrKHBrdF9vYmosIGR2LCAwKVxuICAgIHBrdF9vYmouaGVhZGVyID0gZHYuYnVmZmVyXG5cbiAgICBpZiB0cnVlID09PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgX2JpbmRfaXRlcmFibGUgQCBwa3Rfb2JqLCBkdi5idWZmZXIuc2xpY2UoMCxzaXplKVxuXG4gIGZ1bmN0aW9uIHVucGFjayhwa3QpIDo6XG4gICAgY29uc3QgYnVmID0gcGt0LmhlYWRlcl9idWZmZXIoKVxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IFVpbnQ4QXJyYXkoYnVmKS5idWZmZXJcblxuICAgIGNvbnN0IGluZm8gPSB7fVxuICAgIGZfdW5wYWNrKGluZm8sIGR2LCAwKVxuICAgIHJldHVybiBwa3QuaW5mbyA9IGluZm9cblxuICBmdW5jdGlvbiBfYmluZF9pdGVyYWJsZShwa3Rfb2JqLCBidWZfY2xvbmUpIDo6XG4gICAgY29uc3Qge3R5cGV9ID0gcGt0X29ialxuICAgIGNvbnN0IHtpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHRsLCB0b2tlbn0gPSBwa3Rfb2JqXG4gICAgcGt0X29iai5uZXh0ID0gbmV4dFxuXG4gICAgZnVuY3Rpb24gbmV4dChvcHRpb25zKSA6OlxuICAgICAgaWYgbnVsbCA9PSBvcHRpb25zIDo6IG9wdGlvbnMgPSB7fVxuICAgICAgY29uc3QgaGVhZGVyID0gYnVmX2Nsb25lLnNsaWNlKClcbiAgICAgIHNlcV9uZXh0IEAgb3B0aW9ucywgbmV3IERhdGFWaWV3IEAgaGVhZGVyXG4gICAgICByZXR1cm4gQHt9IGRvbmU6ICEhIG9wdGlvbnMuZmluLCB2YWx1ZTogQHt9IC8vIHBrdF9vYmpcbiAgICAgICAgaWRfcm91dGVyLCBpZF90YXJnZXQsIHR5cGUsIHR0bCwgdG9rZW4sIGhlYWRlclxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGFja2V0UGFyc2VyLCBvcHRpb25zLCBmcmFnbWVudF9zaXplKSA6OlxuICBjb25zdCB7Y29uY2F0QnVmZmVycywgcGFja1BhY2tldE9iaiwgcGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBwYWNrZXRQYXJzZXJcbiAgZnJhZ21lbnRfc2l6ZSA9IE51bWJlcihmcmFnbWVudF9zaXplIHx8IDgwMDApXG4gIGlmIDEwMjQgPiBmcmFnbWVudF9zaXplIHx8IDY1MDAwIDwgZnJhZ21lbnRfc2l6ZSA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIGZyYWdtZW50IHNpemU6ICR7ZnJhZ21lbnRfc2l6ZX1gXG5cbiAgY29uc3Qge3JhbmRvbV9pZCwganNvbl9yZXZpdmVyLCBqc29uX3JlcGxhY2VyfSA9IG9wdGlvbnNcbiAgcmV0dXJuIEA6IHBhY2tldFBhcnNlciwgcmFuZG9tX2lkLCBqc29uX3BhcnNlLCBqc29uX3N0cmluZ2lmeVxuICAgIGNyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtLCBwYWNrZXRGcmFnbWVudHNcbiAgICBiaW5kVHJhbnNwb3J0c1xuXG5cbiAgZnVuY3Rpb24ganNvbl9wYXJzZSh0ZXh0KSA6OlxuICAgIHJldHVybiBKU09OLnBhcnNlIEAgdGV4dCwganNvbl9yZXZpdmVyXG4gIGZ1bmN0aW9uIGpzb25fc3RyaW5naWZ5KG9iaikgOjpcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkgQCBvYmosIGpzb25fcmVwbGFjZXJcblxuXG4gIGZ1bmN0aW9uIGNyZWF0ZU11bHRpcGFydChwa3QsIHNpbmspIDo6XG4gICAgbGV0IHBhcnRzID0gW10sIGZpbiA9IGZhbHNlXG4gICAgcmV0dXJuIEB7fSBmZWVkLCBpbmZvOiBwa3QuaW5mb1xuXG4gICAgZnVuY3Rpb24gZmVlZChwa3QpIDo6XG4gICAgICBsZXQgc2VxID0gcGt0LmluZm8uc2VxXG4gICAgICBpZiBzZXEgPCAwIDo6IGZpbiA9IHRydWU7IHNlcSA9IC1zZXFcbiAgICAgIHBhcnRzW3NlcS0xXSA9IHBrdC5ib2R5X2J1ZmZlcigpXG5cbiAgICAgIGlmICEgZmluIDo6IHJldHVyblxuICAgICAgaWYgcGFydHMuaW5jbHVkZXMgQCB1bmRlZmluZWQgOjogcmV0dXJuXG5cbiAgICAgIGNvbnN0IHJlcyA9IGNvbmNhdEJ1ZmZlcnMocGFydHMpXG4gICAgICBwYXJ0cyA9IG51bGxcbiAgICAgIHJldHVybiByZXNcblxuICBmdW5jdGlvbiBjcmVhdGVTdHJlYW0ocGt0LCBzaW5rKSA6OlxuICAgIGxldCBuZXh0PTAsIGZpbiA9IGZhbHNlLCByc3RyZWFtXG4gICAgY29uc3Qgc3RhdGUgPSBAe30gZmVlZDogZmVlZF9pbml0LCBpbmZvOiBwa3QuaW5mb1xuICAgIHJldHVybiBzdGF0ZVxuXG4gICAgZnVuY3Rpb24gb25fZXJyb3IoZXJyLCBwa3QpIDo6XG4gICAgICBpZiB1bmRlZmluZWQgPT09IHJzdHJlYW0ub25fZXJyb3IgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgY29uc29sZS53YXJuIEBcbiAgICAgICAgICBgRXJyb3IgZHVyaW5nIHN0cmVhbS5mZWVkOmAsIGVyclxuICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgZnVuY3Rpb24gZmVlZF9pbml0KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuXG4gICAgICBjb25zdCBtc2cgPSBqc29uX3BhcnNlIEAgcGt0LmJvZHlfdXRmOCgpXG4gICAgICByc3RyZWFtID0gc2luay5yZWN2U3RyZWFtKG1zZywgcGt0LmluZm8pXG4gICAgICBpZiBudWxsID09IHJzdHJlYW0gOjogcmV0dXJuXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICBpZiAhIGZlZWRfc2VxKHBrdCkgOjogcmV0dXJuXG4gICAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2JvZHlcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gb25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgcnN0cmVhbS5vbl9pbml0IDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2luaXQobXNnLCBwa3QpXG4gICAgICBlbHNlIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG4gICAgXG4gICAgZnVuY3Rpb24gZmVlZF9ib2R5KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIGxldCBkYXRhXG4gICAgICB0cnkgOjpcbiAgICAgICAgaWYgISBmZWVkX3NlcShwa3QpIDo6IHJldHVyblxuICAgICAgICBkYXRhID0gYXNfY29udGVudChwa3QpXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIG9uX2Vycm9yIEAgZXJyLCBwa3RcbiAgICAgIHJldHVybiByc3RyZWFtLm9uX2RhdGEgQCBkYXRhLCBwa3RcblxuICAgIGZ1bmN0aW9uIGZlZWRfaWdub3JlKCkgOjpcblxuICAgIGZ1bmN0aW9uIGZlZWRfc2VxKHBrdCkgOjpcbiAgICAgIGxldCBzZXEgPSBwa3QuaW5mby5zZXFcbiAgICAgIGlmIHNlcSA8IDAgOjogZmluID0gdHJ1ZTsgc2VxID0gLXNlcVxuICAgICAgaWYgbmV4dCA9PT0gc2VxIDo6IHJldHVybiArK25leHRcbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuICAgICAgbmV4dCA9ICdpbnZhbGlkJ1xuICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFBhY2tldCBvdXQgb2Ygc2VxdWVuY2VgXG5cbiAgZnVuY3Rpb24gKiBwYWNrZXRGcmFnbWVudHMoYnVmLCBuZXh0X2hkciwgZmluKSA6OlxuICAgIGlmIG51bGwgPT0gYnVmIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIHlpZWxkIG9ialxuICAgICAgcmV0dXJuXG5cbiAgICBsZXQgaSA9IDAsIGxhc3RJbm5lciA9IGJ1Zi5ieXRlTGVuZ3RoIC0gZnJhZ21lbnRfc2l6ZTtcbiAgICB3aGlsZSBpIDwgbGFzdElubmVyIDo6XG4gICAgICBjb25zdCBpMCA9IGlcbiAgICAgIGkgKz0gZnJhZ21lbnRfc2l6ZVxuXG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcigpXG4gICAgICBvYmouYm9keSA9IGJ1Zi5zbGljZShpMCwgaSlcbiAgICAgIHlpZWxkIG9ialxuXG4gICAgOjpcbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKHtmaW59KVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaSlcbiAgICAgIHlpZWxkIG9ialxuXG5cblxuICBmdW5jdGlvbiBiaW5kVHJhbnNwb3J0SW1wbHMoaW5ib3VuZCwgaGlnaGJpdHMsIHRyYW5zcG9ydHMpIDo6XG4gICAgY29uc3Qgb3V0Ym91bmQgPSBbXVxuICAgIG91dGJvdW5kLmNob29zZSA9IGZyYW1pbmdzLmNob29zZVxuXG4gICAgZm9yIGNvbnN0IGZyYW1lIG9mIGZyYW1pbmdzIDo6XG4gICAgICBjb25zdCBpbXBsID0gZnJhbWUgPyB0cmFuc3BvcnRzW2ZyYW1lLnRyYW5zcG9ydF0gOiBudWxsXG4gICAgICBpZiAhIGltcGwgOjogY29udGludWVcblxuICAgICAgY29uc3Qge2JpdHMsIHBhY2ssIHVucGFja30gPSBmcmFtZVxuICAgICAgY29uc3QgcGt0X3R5cGUgPSBoaWdoYml0cyB8IGJpdHNcbiAgICAgIGNvbnN0IHt0X3JlY3Z9ID0gaW1wbFxuXG4gICAgICBmdW5jdGlvbiBwYWNrX2hkcihvYmopIDo6XG4gICAgICAgIHBhY2socGt0X3R5cGUsIG9iailcbiAgICAgICAgcmV0dXJuIG9ialxuXG4gICAgICBmdW5jdGlvbiByZWN2X21zZyhwa3QsIHNpbmspIDo6XG4gICAgICAgIHVucGFjayhwa3QpXG4gICAgICAgIHJldHVybiB0X3JlY3YocGt0LCBzaW5rKVxuXG4gICAgICBwYWNrX2hkci5wa3RfdHlwZSA9IHJlY3ZfbXNnLnBrdF90eXBlID0gcGt0X3R5cGVcbiAgICAgIG91dGJvdW5kW2JpdHNdID0gcGFja19oZHJcbiAgICAgIGluYm91bmRbcGt0X3R5cGVdID0gcmVjdl9tc2dcblxuICAgICAgaWYgJ3Byb2R1Y3Rpb24nICE9PSBwcm9jZXNzLmVudi5OT0RFX0VOViA6OlxuICAgICAgICBjb25zdCBvcCA9IHBhY2tfaGRyLm9wID0gcmVjdl9tc2cub3AgPSBmcmFtZS5vcFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCBwYWNrX2hkciwgJ25hbWUnLCBAe30gdmFsdWU6IGBwYWNrX2hkciDCqyR7b3B9wrtgXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSBAIHJlY3ZfbXNnLCAnbmFtZScsIEB7fSB2YWx1ZTogYHJlY3ZfbXNnIMKrJHtvcH3Cu2BcblxuICAgIHJldHVybiBvdXRib3VuZFxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydHMoaW5ib3VuZCwgaGlnaGJpdHMsIHRyYW5zcG9ydHMpIDo6XG4gICAgY29uc3QgcGFja0JvZHkgPSB0cmFuc3BvcnRzLnBhY2tCb2R5XG4gICAgY29uc3QgcGFja1N0cmVhbSA9IHRyYW5zcG9ydHMucGFja1N0cmVhbVxuICAgIGNvbnN0IG91dGJvdW5kID0gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKVxuICAgIGNvbnN0IHN0cmVhbSA9ICEgdHJhbnNwb3J0cy5zdHJlYW1pbmcgPyBudWxsIDpcbiAgICAgICdvYmplY3QnID09PSB0cmFuc3BvcnRzLnN0cmVhbWluZy5tb2RlXG4gICAgICAgID8gYmluZF9zdHJlYW0gQCBtc2VuZF9vYmplY3RzXG4gICAgICAgIDogYmluZF9zdHJlYW0gQCBtc2VuZF9ieXRlc1xuXG4gICAgcmV0dXJuIEB7fSBzZW5kLCBzdHJlYW1cblxuICAgIGZ1bmN0aW9uIHNlbmQoY2hhbiwgb2JqLCBib2R5KSA6OlxuICAgICAgYm9keSA9IHBhY2tCb2R5KGJvZHkpXG4gICAgICBpZiBmcmFnbWVudF9zaXplIDwgYm9keS5ieXRlTGVuZ3RoIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIGNvbnN0IG1zZW5kID0gbXNlbmRfYnl0ZXMoJ211bHRpcGFydCcsIGNoYW4sIG9iailcbiAgICAgICAgcmV0dXJuIEB7fSBzZW50OiBtc2VuZCBAIHRydWUsIGJvZHlcblxuICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzaW5nbGUnXG4gICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBwYWNrX2hkcihvYmopXG4gICAgICByZXR1cm4gQHt9IHNlbnQ6IGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIG1zZW5kX2J5dGVzKHRyYW5zcG9ydCwgY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICBvYmoudHJhbnNwb3J0ID0gdHJhbnNwb3J0XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBsZXQge25leHR9ID0gcGFja19oZHIob2JqKVxuICAgICAgaWYgbnVsbCAhPT0gbXNnIDo6XG4gICAgICAgIG9iai5ib2R5ID0gbXNnXG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgY2hhbiBAIHBrdFxuXG4gICAgICByZXR1cm4gYXN5bmMgZnVuY3Rpb24gKGZpbiwgYm9keSkgOjpcbiAgICAgICAgaWYgbnVsbCA9PT0gbmV4dCA6OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvciBAICdXcml0ZSBhZnRlciBlbmQnXG4gICAgICAgIGxldCByZXNcbiAgICAgICAgZm9yIGNvbnN0IG9iaiBvZiBwYWNrZXRGcmFnbWVudHMgQCBib2R5LCBuZXh0LCBmaW4gOjpcbiAgICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgICAgcmVzID0gYXdhaXQgY2hhbiBAIHBrdFxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIHJlc1xuXG4gICAgZnVuY3Rpb24gbXNlbmRfb2JqZWN0cyh0cmFuc3BvcnQsIGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgb2JqLnRyYW5zcG9ydCA9IHRyYW5zcG9ydFxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBjb25zdCBvYmogPSBuZXh0KHtmaW59KVxuICAgICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIGJpbmRfc3RyZWFtKHNlbmRfaW1wbCkgOjpcbiAgICAgIHJldHVybiBmdW5jdGlvbiBzdHJlYW0gKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBpZiAnb2JqZWN0JyAhPT0gdHlwZW9mIG1zZyA6OlxuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgc3RyZWFtKCkgcmVxdWlyZXMgYSBKU09OIHNlcmFsaXphYmxlIG1zZyBmb3IgaW5pdGlhbCBwYWNrZXRgXG4gICAgICAgIG1zZyA9IGpzb25fc3RyaW5naWZ5KG1zZylcbiAgICAgICAgY29uc3QgbXNlbmQgPSBzZW5kX2ltcGwoJ3N0cmVhbWluZycsIGNoYW4sIG9iaiwgbXNnKVxuICAgICAgICB3cml0ZS53cml0ZSA9IHdyaXRlOyB3cml0ZS5lbmQgPSBlbmRcbiAgICAgICAgcmV0dXJuIHdyaXRlXG5cbiAgICAgICAgZnVuY3Rpb24gd3JpdGUoY2h1bmspIDo6XG4gICAgICAgICAgcmV0dXJuIGNodW5rICE9IG51bGxcbiAgICAgICAgICAgID8gbXNlbmQgQCBmYWxzZSwgcGFja0JvZHkgQCBjaHVua1xuICAgICAgICAgICAgOiBtc2VuZCBAIHRydWVcblxuICAgICAgICBmdW5jdGlvbiBlbmQoY2h1bmspIDo6XG4gICAgICAgICAgcmV0dXJuIGNodW5rICE9IG51bGxcbiAgICAgICAgICAgID8gbXNlbmQgQCB0cnVlLCBwYWNrQm9keSBAIGNodW5rXG4gICAgICAgICAgICA6IG1zZW5kIEAgdHJ1ZVxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ganNvbl9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwganNvbl9wYXJzZSwganNvbl9zdHJpbmdpZnl9ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcblxuICByZXR1cm4gQHt9XG4gICAgcGFja0JvZHlcbiAgICBwYWNrU3RyZWFtKGNodW5rLCBmcmFnbWVudF9zaXplKSA6OlxuICAgICAgcmV0dXJuIEBbXSBwYWNrQm9keShjaHVuaylcblxuICAgIGdldCBkYXRhZ3JhbSgpIDo6IHJldHVybiB0aGlzLmRpcmVjdFxuICAgIGRpcmVjdDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBtc2cgPSBqc29uX3BhcnNlIEAgcGt0LmJvZHlfdXRmOCgpIHx8IHVuZGVmaW5lZFxuICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBwa3QuaW5mb1xuXG4gICAgbXVsdGlwYXJ0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlTXVsdGlwYXJ0XG4gICAgICAgIGNvbnN0IGJvZHlfYnVmID0gc3RhdGUuZmVlZChwa3QpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gYm9keV9idWYgOjpcbiAgICAgICAgICBjb25zdCBtc2cgPSBqc29uX3BhcnNlIEAgdW5wYWNrX3V0ZjgoYm9keV9idWYpIHx8IHVuZGVmaW5lZFxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuICAgIHN0cmVhbWluZzogQHt9XG4gICAgICBtb2RlOiAnb2JqZWN0J1xuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVTdHJlYW1cbiAgICAgICAgcmV0dXJuIHN0YXRlLmZlZWQocGt0LCBwa3RfYXNfbmRqc29uKVxuXG4gIGZ1bmN0aW9uIHBhY2tCb2R5KGJvZHkpIDo6XG4gICAgcmV0dXJuIHBhY2tfdXRmOCBAIGpzb25fc3RyaW5naWZ5KGJvZHkpXG5cbiAgZnVuY3Rpb24gcGt0X2FzX25kanNvbihwa3QpIDo6XG4gICAgcmV0dXJuIHBrdC5ib2R5X3V0ZjgoKS5zcGxpdCgvXFxyfFxcbnxcXDAvKVxuICAgICAgLmZpbHRlciBAIGw9PmxcbiAgICAgIC5tYXAgQCBqc29uX3BhcnNlXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBiaW5hcnlfcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW19ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgY29uc3Qge2FzQnVmZmVyfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgcmV0dXJuIEB7fVxuICAgIHBhY2tCb2R5OiBhc0J1ZmZlclxuICAgIHBhY2tTdHJlYW0oY2h1bmssIGZyYWdtZW50X3NpemUpIDo6XG4gICAgICByZXR1cm4gQFtdIGFzQnVmZmVyKGNodW5rKVxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHBrdC5ib2R5X2J1ZmZlcigpXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdieXRlcydcbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlU3RyZWFtXG4gICAgICAgIGNvbnN0IG1zZyA9IHN0YXRlLmZlZWQocGt0LCBwa3RfYnVmZmVyKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZyA6OlxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuZnVuY3Rpb24gcGt0X2J1ZmZlcihwa3QpIDo6IHJldHVybiBwa3QuYm9keV9idWZmZXIoKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gY29udHJvbF9wcm90b2NvbChpbmJvdW5kLCBoaWdoLCBzaGFyZWQpIDo6XG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrUGFja2V0T2JqfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcblxuICBjb25zdCBwaW5nX2ZyYW1lID0gZnJhbWluZ3MuY2hvb3NlIEA6IGZyb21faWQ6IHRydWUsIHRva2VuOiB0cnVlLCB0cmFuc3BvcnQ6ICdkaXJlY3QnXG4gIGNvbnN0IHBvbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgbXNnaWQ6IHRydWUsIHRyYW5zcG9ydDogJ2RhdGFncmFtJ1xuXG4gIGNvbnN0IHBvbmdfdHlwZSA9IGhpZ2h8MHhlXG4gIGluYm91bmRbcG9uZ190eXBlXSA9IHJlY3ZfcG9uZ1xuICBjb25zdCBwaW5nX3R5cGUgPSBoaWdofDB4ZlxuICBpbmJvdW5kW2hpZ2h8MHhmXSA9IHJlY3ZfcGluZ1xuXG4gIHJldHVybiBAe30gc2VuZDpwaW5nLCBwaW5nXG5cbiAgZnVuY3Rpb24gcGluZyhjaGFuLCBvYmopIDo6XG4gICAgaWYgISBvYmoudG9rZW4gOjpcbiAgICAgIG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgb2JqLmJvZHkgPSBKU09OLnN0cmluZ2lmeSBAOlxuICAgICAgb3A6ICdwaW5nJywgdHMwOiBuZXcgRGF0ZSgpXG4gICAgcGluZ19mcmFtZS5wYWNrKHBpbmdfdHlwZSwgb2JqKVxuICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gIGZ1bmN0aW9uIHJlY3ZfcGluZyhwa3QsIHNpbmssIHJvdXRlcikgOjpcbiAgICBwaW5nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICBfc2VuZF9wb25nIEAgcGt0LmJvZHksIHBrdCwgc2luaywgcm91dGVyXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4gIGZ1bmN0aW9uIF9zZW5kX3Bvbmcoe3RzMH0sIHBrdF9waW5nLCBzaW5rLCByb3V0ZXIpIDo6XG4gICAgY29uc3Qge21zZ2lkLCBmcm9tX2lkOnJfaWR9ID0gcGt0X3BpbmcuaW5mb1xuICAgIGNvbnN0IHtpZF9yb3V0ZXIsIGlkX3RhcmdldH0gPSByX2lkXG4gICAgY29uc3Qgb2JqID0gQHt9IGlkX3JvdXRlciwgaWRfdGFyZ2V0XG4gICAgICBmcm9tX2lkOiBzaW5rLmZyb21faWQsIG1zZ2lkXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSBAOlxuICAgICAgICBvcDogJ3BvbmcnLCB0czAsIHRzMTogbmV3IERhdGUoKVxuXG4gICAgcG9uZ19mcmFtZS5wYWNrKHBvbmdfdHlwZSwgb2JqKVxuICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICByZXR1cm4gcm91dGVyLmRpc3BhdGNoIEAgW3BrdF1cblxuICBmdW5jdGlvbiByZWN2X3BvbmcocGt0LCBzaW5rKSA6OlxuICAgIHBvbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIHJldHVybiBzaW5rLnJlY3ZDdHJsKHBrdC5ib2R5LCBwa3QuaW5mbylcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5pbXBvcnQgc2hhcmVkX3Byb3RvIGZyb20gJy4vc2hhcmVkLmpzeSdcbmltcG9ydCBqc29uX3Byb3RvIGZyb20gJy4vanNvbi5qc3knXG5pbXBvcnQgYmluYXJ5X3Byb3RvIGZyb20gJy4vYmluYXJ5LmpzeSdcbmltcG9ydCBjb250cm9sX3Byb3RvIGZyb20gJy4vY29udHJvbC5qc3knXG5cbmV4cG9ydCAqIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGluaXRfcHJvdG9jb2wocGFja2V0UGFyc2VyLCBvcHRpb25zKSA6OlxuICBjb25zdCBzaGFyZWQgPSBzaGFyZWRfcHJvdG8gQCBwYWNrZXRQYXJzZXIsIG9wdGlvbnNcblxuICBjb25zdCBpbmJvdW5kID0gW11cbiAgY29uc3QganNvbiA9IHNoYXJlZC5iaW5kVHJhbnNwb3J0cyBAIGluYm91bmRcbiAgICAweDAwIC8vIDB4MCog4oCUIEpTT04gYm9keVxuICAgIGpzb25fcHJvdG8oc2hhcmVkKVxuXG4gIGNvbnN0IGJpbmFyeSA9IHNoYXJlZC5iaW5kVHJhbnNwb3J0cyBAIGluYm91bmRcbiAgICAweDEwIC8vIDB4MSog4oCUIGJpbmFyeSBib2R5XG4gICAgYmluYXJ5X3Byb3RvKHNoYXJlZClcblxuICBjb25zdCBjb250cm9sID0gY29udHJvbF9wcm90byBAIGluYm91bmQsXG4gICAgMHhmMCAvLyAweGYqIOKAlCBjb250cm9sXG4gICAgc2hhcmVkXG5cbiAgY29uc3QgY29kZWNzID0gQDoganNvbiwgYmluYXJ5LCBjb250cm9sLCBkZWZhdWx0OiBqc29uXG5cbiAgY29uc3Qge3JhbmRvbV9pZH0gPSBzaGFyZWRcbiAgcmV0dXJuIEA6IGluYm91bmQsIGNvZGVjcywgcmFuZG9tX2lkXG5cblxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgRW5kcG9pbnQgOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7fSkgOjpcbiAgICBjbGFzcyBFbmRwb2ludCBleHRlbmRzIHRoaXMgOjpcbiAgICByZXR1cm4gRW5kcG9pbnRcblxuICB2YWx1ZU9mKCkgOjogcmV0dXJuIHRoaXMuZnJvbV9pZFxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VuZHBvaW50ICR7dGhpcy5mcm9tX2lkLmlkX3RhcmdldH3Cu2BcblxuICBjb25zdHJ1Y3Rvcihtc2dfY3R4KSA6OlxuICAgIG1zZ19jdHggPSBtc2dfY3R4LndpdGhFbmRwb2ludCh0aGlzKVxuXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAOlxuICAgICAgX2J5X3Rva2VuOiBAe30gdmFsdWU6IHRoaXMuY3JlYXRlUmVwbHlNYXAoKVxuICAgICAgX2J5X3RyYWZmaWM6IEB7fSB2YWx1ZTogdGhpcy5jcmVhdGVUcmFmZmljTWFwKClcbiAgICAgIGZyb21faWQ6IEB7fSB2YWx1ZTogbXNnX2N0eC5mcm9tX2lkLCBlbnVtZXJhYmxlOiB0cnVlXG4gICAgICB0bzogQHt9IHZhbHVlOiBtc2dfY3R4LnRvXG5cbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKVxuICBjcmVhdGVTdGF0ZU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVJlcGx5TWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlVHJhZmZpY01hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG5cbiAgYmluZFNpbmsoc2luaykgOjpcbiAgICBjb25zdCBieV90b2tlbiA9IHRoaXMuX2J5X3Rva2VuXG4gICAgY29uc3QgYnlfdHJhZmZpYyA9IHRoaXMuX2J5X3RyYWZmaWNcbiAgICBjb25zdCB0cmFmZmljID0gKGZyb21faWQsIHRyYWZmaWMpID0+IDo6XG4gICAgICBjb25zdCB0cyA9IERhdGUubm93KClcbiAgICAgIGlmIGZyb21faWQgOjpcbiAgICAgICAgY29uc3QgdCA9IGJ5X3RyYWZmaWMuZ2V0KGZyb21faWQuaWRfdGFyZ2V0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHQgOjpcbiAgICAgICAgICB0LnRzID0gdFtgdHNfJHt0cmFmZmljfWBdID0gdHNcbiAgICAgIHRoaXMucmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpXG5cbiAgICByZXR1cm4gQHt9XG4gICAgICBmcm9tX2lkOiB0aGlzLmZyb21faWRcbiAgICAgIGJ5X21zZ2lkOiB0aGlzLmNyZWF0ZVN0YXRlTWFwKClcblxuICAgICAgcmVjdkN0cmw6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnY3RybCcpXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZDdHJsKG1zZywgaW5mbylcblxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHtybXNnLCBtc2csIGluZm99KS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZNc2c6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnbXNnJylcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdk1zZyhtc2csIGluZm8pXG5cbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnKS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZTdHJlYW06IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgICAgY29uc3QgcnN0cmVhbSA9IHRoaXMucmVjdlN0cmVhbShtc2csIGluZm8pXG4gICAgICAgIGNvbnN0IHJtc2cgPSByc3RyZWFtLm9uX2luaXRcbiAgICAgICAgICA/IHJzdHJlYW0ub25faW5pdChtc2csIGluZm8pXG4gICAgICAgICAgOiB0aGlzLnJlY3ZNc2cobXNnLCBpbmZvKVxuXG4gICAgICAgIGlmIHJzdHJlYW0gIT0gbnVsbCAmJiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcnN0cmVhbS5vbl9kYXRhIDo6XG4gICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBvYmplY3Qgd2l0aCBvbl9kYXRhKGRhdGEsIHBrdCkgZnVuY3Rpb25gXG5cbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnKS50aGVuKHJlcGx5KVxuICAgICAgICByZXR1cm4gcnN0cmVhbVxuXG4gIHJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKSA6OlxuICByZWN2Q3RybChtc2csIGluZm8pIDo6XG4gIHJlY3ZNc2cobXNnLCBpbmZvKSA6OlxuICAgIHJldHVybiBAe30gbXNnLCBpbmZvXG4gIHJlY3ZTdHJlYW0obXNnLCBpbmZvKSA6OlxuICAgIGNvbnNvbGUud2FybiBAIGBVbmhhbmRsZSByZWN2IHN0cmVhbTogJHtpbmZvfWBcbiAgICAvL3JldHVybiBAe31cbiAgICAvLyAgb25fZGF0YShkYXRhLCBwa3QpIDo6XG4gICAgLy8gIG9uX2Vycm9yKGVyciwgcGt0KSA6OlxuXG4gIGluaXRSZXBseSh0b2tlbiwgbXNnX2N0eCwga2luZCkgOjpcbiAgICByZXR1cm4gdGhpcy5pbml0UmVwbHlQcm9taXNlIEAgdG9rZW4sIG1zZ19jdHgubXNfdGltZW91dFxuXG4gIGluaXRNb25pdG9yKGlkX3RhcmdldCkgOjpcbiAgICBjb25zdCBrZXkgPSBpZF90YXJnZXQuaWRfdGFyZ2V0IHx8IGlkX3RhcmdldFxuICAgIGxldCBtb25pdG9yID0gdGhpcy5fYnlfdHJhZmZpYy5nZXQgQCBrZXlcbiAgICBpZiB1bmRlZmluZWQgPT09IG1vbml0b3IgOjpcbiAgICAgIG1vbml0b3IgPSBAe30gaWRfdGFyZ2V0LCB0czogRGF0ZS5ub3coKVxuICAgICAgICB0ZCgpIDo6IHJldHVybiBEYXRlLm5vdygpIC0gdGhpcy50c1xuICAgICAgdGhpcy5fYnlfdHJhZmZpYy5zZXQgQCBrZXksIG1vbml0b3JcbiAgICByZXR1cm4gbW9uaXRvclxuXG4gIGluaXRSZXBseVByb21pc2UodG9rZW4sIG1zX3RpbWVvdXQpIDo6XG4gICAgY29uc3QgYW5zID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgdGhpcy5fYnlfdG9rZW4uc2V0IEAgdG9rZW4sIHJlc29sdmVcbiAgICAgIGlmIG1zX3RpbWVvdXQgOjpcbiAgICAgICAgY29uc3QgdGlkID0gc2V0VGltZW91dCh0aW1lb3V0LCBtc190aW1lb3V0KVxuICAgICAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcbiAgICAgICAgZnVuY3Rpb24gdGltZW91dCgpIDo6IHJlamVjdCBAIG5ldyB0aGlzLlJlcGx5VGltZW91dFxuXG4gICAgcmV0dXJuIHNlbnQgPT4gOjpcbiAgICAgIGFucy5zZW50ID0gc2VudFxuICAgICAgcmV0dXJuIGFuc1xuXG5jbGFzcyBSZXBseVRpbWVvdXQgZXh0ZW5kcyBFcnJvciA6OlxuXG5PYmplY3QuYXNzaWduIEAgRW5kcG9pbnQucHJvdG90eXBlLCBAe31cbiAgUmVwbHlUaW1lb3V0XG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBTaW5rIDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe2luYm91bmR9KSA6OlxuICAgIGNsYXNzIFNpbmsgZXh0ZW5kcyB0aGlzIDo6XG4gICAgU2luay5wcm90b3R5cGUuX3Byb3RvY29sID0gaW5ib3VuZFxuICAgIHJldHVybiBTaW5rXG5cbiAgc3RhdGljIHJlZ2lzdGVyKGVuZHBvaW50LCBrd19hcmdzKSA6OlxuICAgIHJldHVybiBuZXcgdGhpcygpLnJlZ2lzdGVyKGVuZHBvaW50LCBrd19hcmdzKVxuICByZWdpc3RlcihlbmRwb2ludCwge2h1YiwgaWRfdGFyZ2V0LCBvbl9tc2csIG9uX2Vycm9yfSkgOjpcbiAgICBjb25zdCB1bnJlZ2lzdGVyID0gKCkgPT4gaHViLnJvdXRlci51bnJlZ2lzdGVyVGFyZ2V0KGlkX3RhcmdldClcblxuICAgIGh1Yi5yb3V0ZXIucmVnaXN0ZXJUYXJnZXQgQCBpZF90YXJnZXQsXG4gICAgICB0aGlzLl9iaW5kRGlzcGF0Y2ggQCBlbmRwb2ludCwgb25fbXNnLCBvbl9lcnJvciwgdW5yZWdpc3RlclxuICAgIHJldHVybiB0aGlzXG5cbiAgX2JpbmREaXNwYXRjaChlbmRwb2ludCwgb25fbXNnLCBvbl9lcnJvciwgdW5yZWdpc3RlcikgOjpcbiAgICBsZXQgYWxpdmUgPSB0cnVlXG4gICAgY29uc3QgcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbFxuICAgIGNvbnN0IGlzQWxpdmUgPSAoKSA9PiBhbGl2ZVxuICAgIGNvbnN0IHNodXRkb3duID0gKGVycikgPT4gOjpcbiAgICAgIGlmIGFsaXZlIDo6XG4gICAgICAgIHVucmVnaXN0ZXIoKTsgdW5yZWdpc3RlciA9IGFsaXZlID0gZmFsc2VcbiAgICAgICAgaWYgZXJyIDo6IGNvbnNvbGUuZXJyb3IgQCAnRU5EUE9JTlQgU0hVVERPV046ICcgKyBlcnJcblxuICAgIE9iamVjdC5hc3NpZ24gQCB0aGlzLCBlbmRwb2ludC5iaW5kU2luayh0aGlzKSwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG4gICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cblxuICAgIHJldHVybiBhc3luYyAocGt0LCByb3V0ZXIpID0+IDo6XG4gICAgICBpZiBmYWxzZT09PWFsaXZlIHx8IG51bGw9PXBrdCA6OiByZXR1cm4gYWxpdmVcblxuICAgICAgY29uc3QgcmVjdl9tc2cgPSBwcm90b2NvbFtwa3QudHlwZV1cbiAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmVjdl9tc2cgOjpcbiAgICAgICAgcmV0dXJuIG9uX2Vycm9yIEAgZmFsc2UsIEA6IHBrdFxuXG4gICAgICB0cnkgOjpcbiAgICAgICAgdmFyIG1zZyA9IGF3YWl0IHJlY3ZfbXNnIEAgcGt0LCB0aGlzLCByb3V0ZXJcbiAgICAgICAgaWYgISBtc2cgOjogcmV0dXJuIG1zZ1xuXG4gICAgICAgIHJldHVybiBhd2FpdCBvbl9tc2cgQCBtc2csIHBrdFxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIGlmIGZhbHNlICE9PSBvbl9lcnJvcihlcnIsIHttc2csIHBrdH0pIDo6XG4gICAgICAgICAgZW5kcG9pbnQuc2h1dGRvd24oZXJyLCB7bXNnLCBwa3R9KVxuXG4gIHN0YXRlRm9yKHBrdCwgaWZBYnNlbnQpIDo6XG4gICAgY29uc3QgbXNnaWQgPSBwa3QuaW5mby5tc2dpZFxuICAgIGxldCBlbnRyeSA9IHRoaXMuYnlfbXNnaWQuZ2V0KG1zZ2lkKVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gZW50cnkgOjpcbiAgICAgIGlmICEgbXNnaWQgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYEludmFsaWQgbXNnaWQ6ICR7bXNnaWR9YFxuICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlmQWJzZW50IDo6XG4gICAgICAgIGVudHJ5ID0gaWZBYnNlbnQocGt0LCB0aGlzKVxuICAgICAgZWxzZSBlbnRyeSA9IGlmQWJzZW50XG4gICAgICB0aGlzLmJ5X21zZ2lkLnNldCBAIG1zZ2lkLCBlbnRyeVxuICAgIHJldHVybiBlbnRyeVxuXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBNc2dDdHggOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7cmFuZG9tX2lkLCBjb2RlY3N9KSA6OlxuICAgIGNsYXNzIE1zZ0N0eCBleHRlbmRzIHRoaXMgOjpcbiAgICBNc2dDdHgucHJvdG90eXBlLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuICAgIE1zZ0N0eC53aXRoQ29kZWNzIEAgY29kZWNzXG4gICAgcmV0dXJuIE1zZ0N0eFxuXG4gIGNvbnN0cnVjdG9yKGZyb21faWQsIHJlc29sdmVSb3V0ZSkgOjpcbiAgICBpZiBudWxsICE9PSBmcm9tX2lkIDo6XG4gICAgICBjb25zdCB7aWRfdGFyZ2V0LCBpZF9yb3V0ZXJ9ID0gZnJvbV9pZFxuICAgICAgZnJvbV9pZCA9IE9iamVjdC5mcmVlemUgQDogaWRfdGFyZ2V0LCBpZF9yb3V0ZXJcblxuICAgIGNvbnN0IGN0eCA9IHtmcm9tX2lkfVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIF9yb290XzogQDogdmFsdWU6IHRoaXNcbiAgICAgIGZyb21faWQ6IEA6IHZhbHVlOiBmcm9tX2lkXG4gICAgICBjdHg6IEA6IHZhbHVlOiBjdHhcbiAgICAgIHJlc29sdmVSb3V0ZTogQDogdmFsdWU6IHJlc29sdmVSb3V0ZVxuXG4gIHdpdGhFbmRwb2ludChlbmRwb2ludCkgOjpcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGVuZHBvaW50OiBAe30gdmFsdWU6IGVuZHBvaW50XG5cbiAgc3RhdGljIGZyb20oaWRfdGFyZ2V0LCBodWIpIDo6XG4gICAgY29uc3QgZnJvbV9pZCA9IG51bGwgPT09IGlkX3RhcmdldCA/IG51bGxcbiAgICAgIDogQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICByZXR1cm4gbmV3IHRoaXMgQCBmcm9tX2lkLCBodWIuYmluZFJvdXRlRGlzcGF0Y2goKVxuXG4gIGdldCB0bygpIDo6IHJldHVybiAoLi4uYXJncykgPT4gdGhpcy5jbG9uZSgpLndpdGggQCAuLi5hcmdzXG5cbiAgcGluZyh0b2tlbj10cnVlKSA6OiByZXR1cm4gdGhpcy5jb2RlYygnY29udHJvbCcsIHt0b2tlbn0pLmludm9rZSBAICdwaW5nJ1xuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLmludm9rZSBAICdzZW5kJywgLi4uYXJnc1xuICBzdHJlYW0oLi4uYXJncykgOjogcmV0dXJuIHRoaXMuaW52b2tlIEAgJ3N0cmVhbScsIC4uLmFyZ3NcblxuICBpbnZva2Uoa2V5LCAuLi5hcmdzKSA6OlxuICAgIGNvbnN0IG9iaiA9IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHhcbiAgICB0aGlzLmFzc2VydE1vbml0b3IoKVxuICAgIGNvbnN0IGNoYW4gPSB0aGlzLnJlc29sdmVSb3V0ZShvYmouaWRfcm91dGVyKVxuICAgIGlmIHRydWUgIT09IG9iai50b2tlbiA6OlxuICAgICAgcmV0dXJuIHRoaXMuX2NvZGVjW2tleV0gQCBjaGFuLCBvYmosIC4uLmFyZ3NcblxuICAgIGVsc2UgOjpcbiAgICAgIGNvbnN0IHRva2VuID0gb2JqLnRva2VuID0gdGhpcy5yYW5kb21faWQoKVxuICAgICAgY29uc3QgcmVwbHkgPSB0aGlzLmVuZHBvaW50LmluaXRSZXBseSh0b2tlbiwgdGhpcywga2V5KVxuICAgICAgcmV0dXJuIHJlcGx5IEAgdGhpcy5fY29kZWNba2V5XSBAIGNoYW4sIG9iaiwgLi4uYXJnc1xuXG5cbiAgd2l0aCguLi5hcmdzKSA6OlxuICAgIGNvbnN0IGN0eCA9IHRoaXMuY3R4XG4gICAgZm9yIGxldCB0Z3Qgb2YgYXJncyA6OlxuICAgICAgaWYgJ251bWJlcicgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHRndFxuICAgICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgICAgIGNvbnRpbnVlXG5cbiAgICAgIGNvbnN0IHtmcm9tX2lkOiByZXBseV9pZCwgaWRfdGFyZ2V0LCBpZF9yb3V0ZXIsIHRva2VuLCBtc2dpZH0gPSB0Z3RcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBpZF90YXJnZXQgOjpcbiAgICAgICAgaWYgdW5kZWZpbmVkID09PSBpZF9yb3V0ZXIgOjpcbiAgICAgICAgICBpZiAhIGN0eC5pZF9yb3V0ZXIgOjpcbiAgICAgICAgICAgIC8vIGltcGxpY2l0bHkgb24gdGhlIHNhbWUgcm91dGVyXG4gICAgICAgICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgICAgIGVsc2UgY3R4LmlkX3JvdXRlciA9IGlkX3JvdXRlclxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gaWRfdGFyZ2V0XG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gaWRfcm91dGVyIDo6XG4gICAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYXNzaW5nICdpZF9yb3V0ZXInIHJlcXVpcmVzICdpZF90YXJnZXQnYFxuICAgICAgZWxzZSBpZiB1bmRlZmluZWQgIT09IHJlcGx5X2lkICYmICEgY3R4LmlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfcm91dGVyID0gcmVwbHlfaWQuaWRfcm91dGVyXG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSByZXBseV9pZC5pZF90YXJnZXRcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuXG4gICAgcmV0dXJuIHRoaXNcblxuICB3aXRoUmVwbHkoKSA6OlxuICAgIHJldHVybiB0aGlzLmNsb25lIEA6IHRva2VuOiB0cnVlXG5cbiAgcmVzZXQoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMuX3Jvb3RfLCBAe31cbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcbiAgY2xvbmUoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG5cbiAgYXNzZXJ0TW9uaXRvcigpIDo6XG4gICAgaWYgISB0aGlzLmNoZWNrTW9uaXRvcigpIDo6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgVGFyZ2V0IG1vbml0b3IgZXhwaXJlZGBcbiAgY2hlY2tNb25pdG9yKCkgOjogcmV0dXJuIHRydWVcbiAgbW9uaXRvcihvcHRpb25zPXt9KSA6OlxuICAgIGlmIHRydWUgPT09IG9wdGlvbnMgfHwgZmFsc2UgPT09IG9wdGlvbnMgOjpcbiAgICAgIG9wdGlvbnMgPSBAe30gYWN0aXZlOiBvcHRpb25zXG5cbiAgICBjb25zdCBtb25pdG9yID0gdGhpcy5lbmRwb2ludC5pbml0TW9uaXRvcih0aGlzLmN0eC5pZF90YXJnZXQpXG5cbiAgICBjb25zdCB0c19kdXJhdGlvbiA9IG9wdGlvbnMudHNfZHVyYXRpb24gfHwgNTAwMFxuICAgIGxldCB0c19hY3RpdmUgPSBvcHRpb25zLnRzX2FjdGl2ZVxuICAgIGlmIHRydWUgPT09IHRzX2FjdGl2ZSA6OlxuICAgICAgdHNfYWN0aXZlID0gdHNfZHVyYXRpb24vNFxuXG4gICAgbGV0IGNoZWNrTW9uaXRvclxuICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBjb25zdCBkb25lID0gb3B0aW9ucy5yZWplY3QgPyByZWplY3QgOiByZXNvbHZlXG4gICAgICB0aGlzLmNoZWNrTW9uaXRvciA9IGNoZWNrTW9uaXRvciA9ICgpID0+XG4gICAgICAgIHRzX2R1cmF0aW9uID4gbW9uaXRvci50ZCgpXG4gICAgICAgICAgPyB0cnVlIDogKGRvbmUobW9uaXRvciksIGZhbHNlKVxuXG4gICAgbGV0IHRpZFxuICAgIGNvbnN0IHRzX2ludGVydmFsID0gdHNfYWN0aXZlIHx8IHRzX2R1cmF0aW9uLzRcbiAgICBpZiBvcHRpb25zLmFjdGl2ZSB8fCB0c19hY3RpdmUgOjpcbiAgICAgIGNvbnN0IGN0cmwgPSB0aGlzLmNvZGVjKCdjb250cm9sJylcbiAgICAgIGNvbnN0IGNoZWNrUGluZyA9ICgpID0+IDo6XG4gICAgICAgIGlmIHRzX2ludGVydmFsID4gbW9uaXRvci50ZCgpIDo6XG4gICAgICAgICAgY3RybC5pbnZva2UoJ3BpbmcnKVxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja1BpbmcsIHRzX2ludGVydmFsXG4gICAgZWxzZSA6OlxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja01vbml0b3IsIHRzX2ludGVydmFsXG4gICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiBjbGVhckludGVydmFsKHRpZClcblxuICAgIHByb21pc2UudGhlbihjbGVhciwgY2xlYXIpXG4gICAgcmV0dXJuIHByb21pc2VcblxuXG4gIGNvZGVjKG1zZ19jb2RlYywgLi4uYXJncykgOjpcbiAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIG1zZ19jb2RlYyA6OlxuICAgICAgbXNnX2NvZGVjID0gdGhpcy5fbXNnQ29kZWNzW21zZ19jb2RlY11cblxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBtc2dfY29kZWMuc2VuZCA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwYWNrZXQgY29kZWMgcHJvdG9jb2xgXG5cbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEA6XG4gICAgICBfY29kZWM6IEA6IHZhbHVlOiBtc2dfY29kZWNcbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuICBzdGF0aWMgd2l0aENvZGVjcyhtc2dDb2RlY3MpIDo6XG4gICAgZm9yIGNvbnN0IFtuYW1lLCBtc2dfY29kZWNdIG9mIE9iamVjdC5lbnRyaWVzIEAgbXNnQ29kZWNzIDo6XG4gICAgICB0aGlzLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMuY29kZWMgQCBtc2dfY29kZWNcbiAgICB0aGlzLnByb3RvdHlwZS5fbXNnQ29kZWNzID0gbXNnQ29kZWNzXG4gICAgdGhpcy5wcm90b3R5cGUuX2NvZGVjID0gbXNnQ29kZWNzLmRlZmF1bHRcbiAgICByZXR1cm4gdGhpc1xuXG5PYmplY3QuYXNzaWduIEAgTXNnQ3R4LnByb3RvdHlwZSwgQHt9XG4gIG1zX3RpbWVvdXQ6IDUwMDBcblxuIiwiaW1wb3J0IGluaXRfcHJvdG9jb2wgZnJvbSAnLi9wcm90b2NvbC9pbmRleC5qc3knXG5pbXBvcnQgRW5kcG9pbnRCYXNlIGZyb20gJy4vZW5kcG9pbnQuanN5J1xuaW1wb3J0IFNpbmtCYXNlIGZyb20gJy4vc2luay5qc3knXG5pbXBvcnQgTXNnQ3R4QmFzZSBmcm9tICcuL21zZ2N0eC5qc3knXG5cbmNvbnN0IGRlZmF1bHRfcGx1Z2luX29wdGlvbnMgPSBAOlxuICBvbl9lcnJvcjogY29uc29sZS5lcnJvclxuICBzdWJjbGFzcyh7U2luaywgRW5kcG9pbnQsIFNvdXJjZUVuZHBvaW50LCBwcm90b2NvbHN9KSA6OlxuXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBsdWdpbl9vcHRpb25zKSA6OlxuICBwbHVnaW5fb3B0aW9ucyA9IE9iamVjdC5hc3NpZ24gQCB7fSwgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucywgcGx1Z2luX29wdGlvbnNcbiAgY29uc3QgQHt9XG4gICAgcmFuZG9tX2lkLCBqc29uX3Jldml2ZXIsIGpzb25fcmVwbGFjZXJcbiAgICBvbl9lcnJvcjogZGVmYXVsdF9vbl9lcnJvclxuICA9IHBsdWdpbl9vcHRpb25zXG5cbiAgcmV0dXJuIEA6IG9yZGVyOiAxLCBzdWJjbGFzcywgcG9zdFxuICBcbiAgZnVuY3Rpb24gc3ViY2xhc3MoRmFicmljSHViX1BJLCBiYXNlcykgOjpcbiAgICBjb25zdCB7cGFja2V0UGFyc2VyfSA9IEZhYnJpY0h1Yl9QSS5wcm90b3R5cGVcbiAgICBpZiBudWxsPT1wYWNrZXRQYXJzZXIgfHwgISBwYWNrZXRQYXJzZXIuaXNQYWNrZXRQYXJzZXIoKSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBJbnZhbGlkIHBhY2tldFBhcnNlciBmb3IgcGx1Z2luYFxuICAgIFxuICAgIEZhYnJpY0h1Yl9QSS5wcm90b3R5cGUuZW5kcG9pbnQgPVxuICAgICAgYmluZEVuZHBvaW50QXBpIEAgcGFja2V0UGFyc2VyXG5cbiAgZnVuY3Rpb24gcG9zdChodWIpIDo6XG4gICAgcmV0dXJuIGh1Yi5lbmRwb2ludCA9IGh1Yi5lbmRwb2ludChodWIpXG5cbiAgZnVuY3Rpb24gYmluZEVuZHBvaW50QXBpKHBhY2tldFBhcnNlcikgOjpcbiAgICBjb25zdCBwcm90b2NvbHMgPSBpbml0X3Byb3RvY29sIEAgcGFja2V0UGFyc2VyLCBAe30gcmFuZG9tX2lkLCBqc29uX3Jldml2ZXIsIGpzb25fcmVwbGFjZXJcbiAgICBjb25zdCBTaW5rID0gU2lua0Jhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICBjb25zdCBNc2dDdHggPSBNc2dDdHhCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgY29uc3QgRW5kcG9pbnQgPSBFbmRwb2ludEJhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcblxuICAgIHBsdWdpbl9vcHRpb25zLnN1YmNsYXNzIEA6XG4gICAgICBTaW5rLCBFbmRwb2ludCwgTXNnQ3R4LCBwcm90b2NvbHNcblxuICAgIHJldHVybiBmdW5jdGlvbihodWIpIDo6XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAOiBjcmVhdGU6IGVuZHBvaW50LCBzZXJ2ZXI6IGVuZHBvaW50LCBjbGllbnRcblxuICAgICAgZnVuY3Rpb24gY2xpZW50KC4uLmFyZ3MpIDo6XG4gICAgICAgIGNvbnN0IG1zZ19jdHggPSBNc2dDdHguZnJvbSBAIG51bGwsIGh1YlxuICAgICAgICByZXR1cm4gMCAhPT0gYXJncy5sZW5ndGhcbiAgICAgICAgICA/IG1zZ19jdHgud2l0aCguLi5hcmdzKSA6IG1zZ19jdHhcblxuICAgICAgZnVuY3Rpb24gZW5kcG9pbnQob25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgaWRfdGFyZ2V0ID0gcmFuZG9tX2lkKClcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IE1zZ0N0eC5mcm9tIEAgaWRfdGFyZ2V0LCBodWJcbiAgICAgICAgY29uc3QgZXAgPSBuZXcgRW5kcG9pbnQobXNnX2N0eClcblxuICAgICAgICBjb25zdCB0YXJnZXQgPSBvbl9pbml0KGVwKVxuICAgICAgICBjb25zdCBvbl9tc2cgPSAodGFyZ2V0Lm9uX21zZyB8fCB0YXJnZXQpLmJpbmQodGFyZ2V0KVxuICAgICAgICBjb25zdCBvbl9lcnJvciA9ICh0YXJnZXQub25fZXJyb3IgfHwgZGVmYXVsdF9vbl9lcnJvcikuYmluZCh0YXJnZXQpXG5cbiAgICAgICAgU2luay5yZWdpc3RlciBAIGVwLCBAe31cbiAgICAgICAgICBodWIsIGlkX3RhcmdldCwgb25fbXNnLCBvbl9lcnJvclxuXG4gICAgICAgIGlmIHRhcmdldC5vbl9yZWFkeSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZSh0YXJnZXQpLnRoZW4gQFxuICAgICAgICAgICAgdGFyZ2V0ID0+IHRhcmdldC5vbl9yZWFkeSgpXG5cbiAgICAgICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCBlbmRwb2ludF90YXJnZXRfYXBpLCBAOlxuICAgICAgICAgIGlkX3JvdXRlcjogQHt9IGVudW1lcmFibGU6IHRydWUsIHZhbHVlOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICAgICAgICBpZF90YXJnZXQ6IEB7fSBlbnVtZXJhYmxlOiB0cnVlLCB2YWx1ZTogaWRfdGFyZ2V0XG5cbmNvbnN0IGVuZHBvaW50X3RhcmdldF9hcGkgPSBAOlxuICB2YWx1ZU9mKCkgOjogcmV0dXJuIDAgfCB0aGlzLmlkX3RhcmdldFxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VuZHBvaW50IFRhcmdldCAke3RoaXMuaWRfdGFyZ2V0fcK7YFxuXG4iLCJpbXBvcnQgZW5kcG9pbnRfcGx1Z2luIGZyb20gJy4vcGx1Z2luLmpzeSdcblxuY29uc3QgZ2V0UmFuZG9tVmFsdWVzID0gJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiB3aW5kb3dcbiAgPyB3aW5kb3cuY3J5cHRvLmdldFJhbmRvbVZhbHVlcyA6IG51bGxcblxuZW5kcG9pbnRfYnJvd3Nlci5yYW5kb21faWQgPSByYW5kb21faWRcbmZ1bmN0aW9uIHJhbmRvbV9pZCgpIDo6XG4gIGNvbnN0IGFyciA9IG5ldyBJbnQzMkFycmF5KDEpXG4gIGdldFJhbmRvbVZhbHVlcyhhcnIpXG4gIHJldHVybiBhcnJbMF1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gZW5kcG9pbnRfYnJvd3NlcihwbHVnaW5fb3B0aW9ucz17fSkgOjpcbiAgaWYgbnVsbCA9PSBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgOjpcbiAgICBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgPSByYW5kb21faWRcblxuICByZXR1cm4gZW5kcG9pbnRfcGx1Z2luKHBsdWdpbl9vcHRpb25zKVxuXG4iXSwibmFtZXMiOlsibGl0dGxlX2VuZGlhbiIsImNfc2luZ2xlIiwiY19kYXRhZ3JhbSIsImNfZGlyZWN0IiwiY19tdWx0aXBhcnQiLCJjX3N0cmVhbWluZyIsIl9lcnJfbXNnaWRfcmVxdWlyZWQiLCJfZXJyX3Rva2VuX3JlcXVpcmVkIiwiZnJtX3JvdXRpbmciLCJzaXplIiwiYml0cyIsIm1hc2siLCJvYmoiLCJmcm9tX2lkIiwiZHYiLCJvZmZzZXQiLCJzZXRJbnQzMiIsImlkX3JvdXRlciIsImlkX3RhcmdldCIsInVuZGVmaW5lZCIsImdldEludDMyIiwiZnJtX3Jlc3BvbnNlIiwibXNnaWQiLCJFcnJvciIsInNldEludDE2Iiwic2VxX2FjayIsImFja19mbGFncyIsInRva2VuIiwiZ2V0SW50MTYiLCJmcm1fZGF0YWdyYW0iLCJ0cmFuc3BvcnQiLCJmcm1fZGlyZWN0IiwiZnJtX211bHRpcGFydCIsInNlcV9wb3MiLCJzZXEiLCJzZXFfZmxhZ3MiLCJmcm1fc3RyZWFtaW5nIiwiYmluZF9zZXFfbmV4dCIsInNlcV9vZmZzZXQiLCJzZXFfbmV4dCIsImZsYWdzIiwiZmluIiwiTmFOIiwiY29tcG9zZUZyYW1pbmdzIiwiZnJtX2Zyb20iLCJmcm1fcmVzcCIsImZybV90cmFuc3BvcnRzIiwibGVuZ3RoIiwiYnlCaXRzIiwidF9mcm9tIiwiZl90ZXN0IiwidF9yZXNwIiwidDAiLCJ0MSIsInQyIiwidDMiLCJtYXAiLCJmIiwidGVzdEJpdHMiLCJjaG9vc2UiLCJsc3QiLCJUIiwiYiIsIm9wIiwiZm5fa2V5IiwiZm5fdHJhbiIsImZuX2Zyb20iLCJmbl9yZXNwIiwiZnJtIiwiYmluZEFzc2VtYmxlZCIsImZfcGFjayIsImZfdW5wYWNrIiwicGFjayIsInVucGFjayIsInBrdF90eXBlIiwicGt0X29iaiIsIlR5cGVFcnJvciIsInR5cGUiLCJEYXRhVmlldyIsIkFycmF5QnVmZmVyIiwiaGVhZGVyIiwiYnVmZmVyIiwic2xpY2UiLCJwa3QiLCJidWYiLCJoZWFkZXJfYnVmZmVyIiwiVWludDhBcnJheSIsImluZm8iLCJfYmluZF9pdGVyYWJsZSIsImJ1Zl9jbG9uZSIsInR0bCIsIm5leHQiLCJvcHRpb25zIiwiZG9uZSIsInZhbHVlIiwicGFja2V0UGFyc2VyIiwiZnJhZ21lbnRfc2l6ZSIsImNvbmNhdEJ1ZmZlcnMiLCJwYWNrUGFja2V0T2JqIiwicGFja191dGY4IiwidW5wYWNrX3V0ZjgiLCJOdW1iZXIiLCJyYW5kb21faWQiLCJqc29uX3Jldml2ZXIiLCJqc29uX3JlcGxhY2VyIiwianNvbl9wYXJzZSIsImpzb25fc3RyaW5naWZ5IiwiY3JlYXRlU3RyZWFtIiwicGFja2V0RnJhZ21lbnRzIiwidGV4dCIsIkpTT04iLCJwYXJzZSIsInN0cmluZ2lmeSIsImNyZWF0ZU11bHRpcGFydCIsInNpbmsiLCJwYXJ0cyIsImZlZWQiLCJib2R5X2J1ZmZlciIsImluY2x1ZGVzIiwicmVzIiwicnN0cmVhbSIsInN0YXRlIiwiZmVlZF9pbml0Iiwib25fZXJyb3IiLCJlcnIiLCJjb25zb2xlIiwid2FybiIsImFzX2NvbnRlbnQiLCJmZWVkX2lnbm9yZSIsIm1zZyIsImJvZHlfdXRmOCIsInJlY3ZTdHJlYW0iLCJmZWVkX3NlcSIsImZlZWRfYm9keSIsIm9uX2luaXQiLCJyZWN2TXNnIiwiZGF0YSIsIm9uX2RhdGEiLCJuZXh0X2hkciIsImkiLCJsYXN0SW5uZXIiLCJieXRlTGVuZ3RoIiwiaTAiLCJib2R5IiwiYmluZFRyYW5zcG9ydEltcGxzIiwiaW5ib3VuZCIsImhpZ2hiaXRzIiwidHJhbnNwb3J0cyIsIm91dGJvdW5kIiwiZnJhbWluZ3MiLCJmcmFtZSIsImltcGwiLCJ0X3JlY3YiLCJwYWNrX2hkciIsInJlY3ZfbXNnIiwiYmluZFRyYW5zcG9ydHMiLCJwYWNrQm9keSIsInN0cmVhbSIsInN0cmVhbWluZyIsIm1vZGUiLCJiaW5kX3N0cmVhbSIsIm1zZW5kX29iamVjdHMiLCJtc2VuZF9ieXRlcyIsInNlbmQiLCJjaGFuIiwibXNlbmQiLCJzZW50Iiwic2VuZF9pbXBsIiwid3JpdGUiLCJlbmQiLCJjaHVuayIsImpzb25fcHJvdG9jb2wiLCJzaGFyZWQiLCJkYXRhZ3JhbSIsImRpcmVjdCIsInN0YXRlRm9yIiwiYm9keV9idWYiLCJwa3RfYXNfbmRqc29uIiwic3BsaXQiLCJmaWx0ZXIiLCJsIiwiYmluYXJ5X3Byb3RvY29sIiwiYXNCdWZmZXIiLCJwa3RfYnVmZmVyIiwiY29udHJvbF9wcm90b2NvbCIsImhpZ2giLCJwaW5nX2ZyYW1lIiwicG9uZ19mcmFtZSIsInBvbmdfdHlwZSIsInJlY3ZfcG9uZyIsInBpbmdfdHlwZSIsInJlY3ZfcGluZyIsInBpbmciLCJ0czAiLCJEYXRlIiwicm91dGVyIiwiYm9keV9qc29uIiwicmVjdkN0cmwiLCJfc2VuZF9wb25nIiwicGt0X3BpbmciLCJyX2lkIiwidHMxIiwiZGlzcGF0Y2giLCJpbml0X3Byb3RvY29sIiwic2hhcmVkX3Byb3RvIiwianNvbiIsImpzb25fcHJvdG8iLCJiaW5hcnkiLCJiaW5hcnlfcHJvdG8iLCJjb250cm9sIiwiY29udHJvbF9wcm90byIsImNvZGVjcyIsImRlZmF1bHQiLCJFbmRwb2ludCIsImZvclByb3RvY29scyIsIm1zZ19jdHgiLCJ3aXRoRW5kcG9pbnQiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiY3JlYXRlUmVwbHlNYXAiLCJjcmVhdGVUcmFmZmljTWFwIiwiZW51bWVyYWJsZSIsInRvIiwiTWFwIiwiY3JlYXRlTWFwIiwiYnlfdG9rZW4iLCJfYnlfdG9rZW4iLCJieV90cmFmZmljIiwiX2J5X3RyYWZmaWMiLCJ0cmFmZmljIiwidHMiLCJub3ciLCJ0IiwiZ2V0IiwicmVjdlRyYWZmaWMiLCJjcmVhdGVTdGF0ZU1hcCIsInJtc2ciLCJyZXBseSIsInJlc29sdmUiLCJ0aGVuIiwiaW5pdFJlcGx5Iiwia2luZCIsImluaXRSZXBseVByb21pc2UiLCJtc190aW1lb3V0Iiwia2V5IiwibW9uaXRvciIsInNldCIsImFucyIsIlByb21pc2UiLCJyZWplY3QiLCJ0aWQiLCJzZXRUaW1lb3V0IiwidGltZW91dCIsInVucmVmIiwiUmVwbHlUaW1lb3V0IiwiT2JqZWN0IiwiYXNzaWduIiwicHJvdG90eXBlIiwiU2luayIsIl9wcm90b2NvbCIsInJlZ2lzdGVyIiwiZW5kcG9pbnQiLCJrd19hcmdzIiwiaHViIiwib25fbXNnIiwidW5yZWdpc3RlciIsInVucmVnaXN0ZXJUYXJnZXQiLCJyZWdpc3RlclRhcmdldCIsIl9iaW5kRGlzcGF0Y2giLCJhbGl2ZSIsInByb3RvY29sIiwiaXNBbGl2ZSIsInNodXRkb3duIiwiZXJyb3IiLCJiaW5kU2luayIsImlmQWJzZW50IiwiZW50cnkiLCJieV9tc2dpZCIsIk1zZ0N0eCIsIndpdGhDb2RlY3MiLCJyZXNvbHZlUm91dGUiLCJmcmVlemUiLCJjdHgiLCJmcm9tIiwiaWRfc2VsZiIsImJpbmRSb3V0ZURpc3BhdGNoIiwiYXJncyIsImNsb25lIiwid2l0aCIsImNvZGVjIiwiaW52b2tlIiwiYXNzZXJ0TW9uaXRvciIsIl9jb2RlYyIsInRndCIsInJlcGx5X2lkIiwiY3JlYXRlIiwiX3Jvb3RfIiwiY2hlY2tNb25pdG9yIiwiYWN0aXZlIiwiaW5pdE1vbml0b3IiLCJ0c19kdXJhdGlvbiIsInRzX2FjdGl2ZSIsInByb21pc2UiLCJ0ZCIsInRzX2ludGVydmFsIiwiY3RybCIsImNoZWNrUGluZyIsInNldEludGVydmFsIiwiY2xlYXIiLCJjbGVhckludGVydmFsIiwibXNnX2NvZGVjIiwiX21zZ0NvZGVjcyIsIm1zZ0NvZGVjcyIsIm5hbWUiLCJlbnRyaWVzIiwiZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyIsIlNvdXJjZUVuZHBvaW50IiwicHJvdG9jb2xzIiwicGx1Z2luX29wdGlvbnMiLCJkZWZhdWx0X29uX2Vycm9yIiwib3JkZXIiLCJzdWJjbGFzcyIsInBvc3QiLCJGYWJyaWNIdWJfUEkiLCJiYXNlcyIsImlzUGFja2V0UGFyc2VyIiwiYmluZEVuZHBvaW50QXBpIiwiU2lua0Jhc2UiLCJNc2dDdHhCYXNlIiwiRW5kcG9pbnRCYXNlIiwic2VydmVyIiwiY2xpZW50IiwiZXAiLCJ0YXJnZXQiLCJiaW5kIiwib25fcmVhZHkiLCJlbmRwb2ludF90YXJnZXRfYXBpIiwiZ2V0UmFuZG9tVmFsdWVzIiwid2luZG93IiwiY3J5cHRvIiwiZW5kcG9pbnRfYnJvd3NlciIsImFyciIsIkludDMyQXJyYXkiLCJlbmRwb2ludF9wbHVnaW4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLE1BQU1BLGdCQUFnQixJQUF0QjtBQUNBLE1BQU1DLFdBQVcsUUFBakI7QUFDQSxNQUFNQyxhQUFhLFVBQW5CO0FBQ0EsTUFBTUMsV0FBVyxRQUFqQjtBQUNBLE1BQU1DLGNBQWMsV0FBcEI7QUFDQSxNQUFNQyxjQUFjLFdBQXBCOztBQUVBLE1BQU1DLHNCQUF1QiwwQkFBN0I7QUFDQSxNQUFNQyxzQkFBdUIsMkJBQTdCOztBQUdBLFNBQVNDLFdBQVQsR0FBdUI7UUFDZkMsT0FBTyxDQUFiO1FBQWdCQyxPQUFPLEdBQXZCO1FBQTRCQyxPQUFPLEdBQW5DO1NBQ087UUFBQSxFQUNDRCxJQURELEVBQ09DLElBRFA7O1dBR0VDLEdBQVAsRUFBWTthQUFVLFFBQVFBLElBQUlDLE9BQVosR0FBc0JILElBQXRCLEdBQTZCLEtBQXBDO0tBSFY7O1dBS0VFLEdBQVAsRUFBWUUsRUFBWixFQUFnQkMsTUFBaEIsRUFBd0I7WUFDaEIsRUFBQ0YsT0FBRCxLQUFZRCxHQUFsQjtTQUNHSSxRQUFILENBQWMsSUFBRUQsTUFBaEIsRUFBd0IsSUFBRUYsUUFBUUksU0FBbEMsRUFBNkNqQixhQUE3QztTQUNHZ0IsUUFBSCxDQUFjLElBQUVELE1BQWhCLEVBQXdCLElBQUVGLFFBQVFLLFNBQWxDLEVBQTZD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

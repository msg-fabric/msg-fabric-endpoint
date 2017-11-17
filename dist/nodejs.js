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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZWpzLmpzIiwic291cmNlcyI6WyIuLi9jb2RlL3Byb3RvY29sL2ZyYW1pbmcuanN5IiwiLi4vY29kZS9wcm90b2NvbC9zaGFyZWQuanN5IiwiLi4vY29kZS9wcm90b2NvbC9qc29uLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvYmluYXJ5LmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvY29udHJvbC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2luZGV4LmpzeSIsIi4uL2NvZGUvZW5kcG9pbnQuanN5IiwiLi4vY29kZS9zaW5rLmpzeSIsIi4uL2NvZGUvbXNnY3R4LmpzeSIsIi4uL2NvZGUvcGx1Z2luLmpzeSIsIi4uL2NvZGUvaW5kZXgubm9kZWpzLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBsaXR0bGVfZW5kaWFuID0gdHJ1ZVxuY29uc3QgY19zaW5nbGUgPSAnc2luZ2xlJ1xuY29uc3QgY19kYXRhZ3JhbSA9ICdkYXRhZ3JhbSdcbmNvbnN0IGNfZGlyZWN0ID0gJ2RpcmVjdCdcbmNvbnN0IGNfbXVsdGlwYXJ0ID0gJ211bHRpcGFydCdcbmNvbnN0IGNfc3RyZWFtaW5nID0gJ3N0cmVhbWluZydcblxuY29uc3QgX2Vycl9tc2dpZF9yZXF1aXJlZCA9IGBSZXNwb25zZSByZXFpcmVzICdtc2dpZCdgXG5jb25zdCBfZXJyX3Rva2VuX3JlcXVpcmVkID0gYFRyYW5zcG9ydCByZXFpcmVzICd0b2tlbidgXG5cblxuZnVuY3Rpb24gZnJtX3JvdXRpbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MSwgbWFzayA9IDB4MVxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLmZyb21faWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCB7ZnJvbV9pZH0gPSBvYmpcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF9yb3V0ZXIsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDMyIEAgNCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF90YXJnZXQsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IGZyb21faWQgPSB1bmRlZmluZWQgPT09IG9iai5mcm9tX2lkXG4gICAgICAgID8gb2JqLmZyb21faWQgPSB7fSA6IG9iai5mcm9tX2lkXG4gICAgICBmcm9tX2lkLmlkX3JvdXRlciA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGZyb21faWQuaWRfdGFyZ2V0ID0gZHYuZ2V0SW50MzIgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5mdW5jdGlvbiBmcm1fcmVzcG9uc2UoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MiwgbWFzayA9IDB4MlxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLm1zZ2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoubXNnaWQgOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl9tc2dpZF9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLm1zZ2lkLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXFfYWNrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5hY2tfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50b2tlbiA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfYWNrID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLmFja19mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuXG5cbmZ1bmN0aW9uIGZybV9kYXRhZ3JhbSgpIDo6XG4gIGNvbnN0IHNpemUgPSAwLCBiaXRzID0gMHgwLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RhdGFncmFtXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGF0YWdyYW0gPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kYXRhZ3JhbVxuXG5mdW5jdGlvbiBmcm1fZGlyZWN0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDQsIGJpdHMgPSAweDQsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGlyZWN0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGlyZWN0ID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGlyZWN0XG5cbmZ1bmN0aW9uIGZybV9tdWx0aXBhcnQoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4OCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19tdWx0aXBhcnRcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19tdWx0aXBhcnQgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjogLy8gdXNlIHNlcV9uZXh0XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX211bHRpcGFydFxuXG5mdW5jdGlvbiBmcm1fc3RyZWFtaW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweGMsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfc3RyZWFtaW5nXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfc3RyZWFtaW5nID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW4gLy8gdXNlIHNlcV9uZXh0XG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19zdHJlYW1pbmdcblxuXG5mdW5jdGlvbiBiaW5kX3NlcV9uZXh0KG9mZnNldCkgOjpcbiAgY29uc3Qgc2VxX29mZnNldCA9IHRoaXMuc2VxX3BvcyArIG9mZnNldFxuICBsZXQgc2VxID0gMVxuICByZXR1cm4gZnVuY3Rpb24gc2VxX25leHQoe2ZsYWdzLCBmaW59LCBkdikgOjpcbiAgICBpZiAhIGZpbiA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCBzZXErKywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICBlbHNlIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIC1zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgICBzZXEgPSBOYU5cblxuXG5cbmV4cG9ydCBkZWZhdWx0IGNvbXBvc2VGcmFtaW5ncygpXG5mdW5jdGlvbiBjb21wb3NlRnJhbWluZ3MoKSA6OlxuICBjb25zdCBmcm1fZnJvbSA9IGZybV9yb3V0aW5nKCksIGZybV9yZXNwID0gZnJtX3Jlc3BvbnNlKClcbiAgY29uc3QgZnJtX3RyYW5zcG9ydHMgPSBAW10gZnJtX2RhdGFncmFtKCksIGZybV9kaXJlY3QoKSwgZnJtX211bHRpcGFydCgpLCBmcm1fc3RyZWFtaW5nKClcblxuICBpZiA4ICE9PSBmcm1fZnJvbS5zaXplIHx8IDggIT09IGZybV9yZXNwLnNpemUgfHwgNCAhPSBmcm1fdHJhbnNwb3J0cy5sZW5ndGggOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgRnJhbWluZyBTaXplIGNoYW5nZWBcblxuICBjb25zdCBieUJpdHMgPSBbXSwgbWFzaz0weGZcblxuICA6OlxuICAgIGNvbnN0IHRfZnJvbSA9IGZybV9mcm9tLmZfdGVzdCwgdF9yZXNwID0gZnJtX3Jlc3AuZl90ZXN0XG4gICAgY29uc3QgW3QwLHQxLHQyLHQzXSA9IGZybV90cmFuc3BvcnRzLm1hcCBAIGY9PmYuZl90ZXN0XG5cbiAgICBjb25zdCB0ZXN0Qml0cyA9IGJ5Qml0cy50ZXN0Qml0cyA9IG9iaiA9PlxuICAgICAgMCB8IHRfZnJvbShvYmopIHwgdF9yZXNwKG9iaikgfCB0MChvYmopIHwgdDEob2JqKSB8IHQyKG9iaikgfCB0MyhvYmopXG5cbiAgICBieUJpdHMuY2hvb3NlID0gZnVuY3Rpb24gKG9iaiwgbHN0KSA6OlxuICAgICAgaWYgbnVsbCA9PSBsc3QgOjogbHN0ID0gdGhpcyB8fCBieUJpdHNcbiAgICAgIHJldHVybiBsc3RbdGVzdEJpdHMob2JqKV1cblxuXG4gIGZvciBjb25zdCBUIG9mIGZybV90cmFuc3BvcnRzIDo6XG4gICAgY29uc3Qge2JpdHM6Yiwgc2l6ZSwgdHJhbnNwb3J0fSA9IFRcblxuICAgIGJ5Qml0c1tifDBdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwwLCBtYXNrLCBzaXplOiBzaXplLCBvcDogJydcbiAgICBieUJpdHNbYnwxXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MSwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAnZidcbiAgICBieUJpdHNbYnwyXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MiwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAncidcbiAgICBieUJpdHNbYnwzXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MywgbWFzaywgc2l6ZTogMTYgKyBzaXplLCBvcDogJ2ZyJ1xuXG4gICAgZm9yIGNvbnN0IGZuX2tleSBvZiBbJ2ZfcGFjaycsICdmX3VucGFjayddIDo6XG4gICAgICBjb25zdCBmbl90cmFuID0gVFtmbl9rZXldLCBmbl9mcm9tID0gZnJtX2Zyb21bZm5fa2V5XSwgZm5fcmVzcCA9IGZybV9yZXNwW2ZuX2tleV1cblxuICAgICAgYnlCaXRzW2J8MF1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3RyYW4ob2JqLCBkdiwgMClcbiAgICAgIGJ5Qml0c1tifDFdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwyXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fcmVzcChvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8M11bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3Jlc3Aob2JqLCBkdiwgOCk7IGZuX3RyYW4ob2JqLCBkdiwgMTYpXG5cbiAgZm9yIGNvbnN0IGZybSBvZiBieUJpdHMgOjpcbiAgICBiaW5kQXNzZW1ibGVkIEAgZnJtXG5cbiAgcmV0dXJuIGJ5Qml0c1xuXG5cbmZ1bmN0aW9uIGJpbmRBc3NlbWJsZWQoZnJtKSA6OlxuICBjb25zdCB7VCwgc2l6ZSwgZl9wYWNrLCBmX3VucGFja30gPSBmcm1cbiAgaWYgVC5iaW5kX3NlcV9uZXh0IDo6XG4gICAgZnJtLnNlcV9uZXh0ID0gVC5iaW5kX3NlcV9uZXh0IEAgZnJtLnNpemUgLSBULnNpemVcblxuICBkZWxldGUgZnJtLlRcbiAgZnJtLnBhY2sgPSBwYWNrIDsgZnJtLnVucGFjayA9IHVucGFja1xuICBjb25zdCBzZXFfbmV4dCA9IGZybS5zZXFfbmV4dFxuXG4gIGZ1bmN0aW9uIHBhY2socGt0X3R5cGUsIHBrdF9vYmopIDo6XG4gICAgaWYgISBAIDAgPD0gcGt0X3R5cGUgJiYgcGt0X3R5cGUgPD0gMjU1IDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBrdF90eXBlIHRvIGJlIFswLi4yNTVdYFxuXG4gICAgcGt0X29iai50eXBlID0gcGt0X3R5cGVcbiAgICBpZiBzZXFfbmV4dCAmJiBudWxsID09IHBrdF9vYmouc2VxIDo6XG4gICAgICBwa3Rfb2JqLnNlcSA9IHRydWVcblxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IEFycmF5QnVmZmVyKHNpemUpXG4gICAgZl9wYWNrKHBrdF9vYmosIGR2LCAwKVxuICAgIHBrdF9vYmouaGVhZGVyID0gZHYuYnVmZmVyXG5cbiAgICBpZiB0cnVlID09PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgX2JpbmRfaXRlcmFibGUgQCBwa3Rfb2JqLCBkdi5idWZmZXIuc2xpY2UoMCxzaXplKVxuXG4gIGZ1bmN0aW9uIHVucGFjayhwa3QpIDo6XG4gICAgY29uc3QgYnVmID0gcGt0LmhlYWRlcl9idWZmZXIoKVxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IFVpbnQ4QXJyYXkoYnVmKS5idWZmZXJcblxuICAgIGNvbnN0IGluZm8gPSB7fVxuICAgIGZfdW5wYWNrKGluZm8sIGR2LCAwKVxuICAgIHJldHVybiBwa3QuaW5mbyA9IGluZm9cblxuICBmdW5jdGlvbiBfYmluZF9pdGVyYWJsZShwa3Rfb2JqLCBidWZfY2xvbmUpIDo6XG4gICAgY29uc3Qge3R5cGV9ID0gcGt0X29ialxuICAgIGNvbnN0IHtpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHRsLCB0b2tlbn0gPSBwa3Rfb2JqXG4gICAgcGt0X29iai5uZXh0ID0gbmV4dFxuXG4gICAgZnVuY3Rpb24gbmV4dChvcHRpb25zKSA6OlxuICAgICAgaWYgbnVsbCA9PSBvcHRpb25zIDo6IG9wdGlvbnMgPSB7fVxuICAgICAgY29uc3QgaGVhZGVyID0gYnVmX2Nsb25lLnNsaWNlKClcbiAgICAgIHNlcV9uZXh0IEAgb3B0aW9ucywgbmV3IERhdGFWaWV3IEAgaGVhZGVyXG4gICAgICByZXR1cm4gQHt9IGRvbmU6ICEhIG9wdGlvbnMuZmluLCB2YWx1ZTogQHt9IC8vIHBrdF9vYmpcbiAgICAgICAgaWRfcm91dGVyLCBpZF90YXJnZXQsIHR5cGUsIHR0bCwgdG9rZW4sIGhlYWRlclxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGFja2V0UGFyc2VyLCBvcHRpb25zLCBmcmFnbWVudF9zaXplKSA6OlxuICBjb25zdCB7Y29uY2F0QnVmZmVycywgcGFja1BhY2tldE9iaiwgcGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBwYWNrZXRQYXJzZXJcbiAgZnJhZ21lbnRfc2l6ZSA9IE51bWJlcihmcmFnbWVudF9zaXplIHx8IDgwMDApXG4gIGlmIDEwMjQgPiBmcmFnbWVudF9zaXplIHx8IDY1MDAwIDwgZnJhZ21lbnRfc2l6ZSA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIGZyYWdtZW50IHNpemU6ICR7ZnJhZ21lbnRfc2l6ZX1gXG5cbiAgY29uc3Qge3JhbmRvbV9pZCwganNvbl9yZXZpdmVyLCBqc29uX3JlcGxhY2VyfSA9IG9wdGlvbnNcbiAgcmV0dXJuIEA6IHBhY2tldFBhcnNlciwgcmFuZG9tX2lkLCBqc29uX3BhcnNlLCBqc29uX3N0cmluZ2lmeVxuICAgIGNyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtLCBwYWNrZXRGcmFnbWVudHNcbiAgICBiaW5kVHJhbnNwb3J0c1xuXG5cbiAgZnVuY3Rpb24ganNvbl9wYXJzZSh0ZXh0KSA6OlxuICAgIHJldHVybiBKU09OLnBhcnNlIEAgdGV4dCwganNvbl9yZXZpdmVyXG4gIGZ1bmN0aW9uIGpzb25fc3RyaW5naWZ5KG9iaikgOjpcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkgQCBvYmosIGpzb25fcmVwbGFjZXJcblxuXG4gIGZ1bmN0aW9uIGNyZWF0ZU11bHRpcGFydChwa3QsIHNpbmspIDo6XG4gICAgbGV0IHBhcnRzID0gW10sIGZpbiA9IGZhbHNlXG4gICAgcmV0dXJuIEB7fSBmZWVkLCBpbmZvOiBwa3QuaW5mb1xuXG4gICAgZnVuY3Rpb24gZmVlZChwa3QpIDo6XG4gICAgICBsZXQgc2VxID0gcGt0LmluZm8uc2VxXG4gICAgICBpZiBzZXEgPCAwIDo6IGZpbiA9IHRydWU7IHNlcSA9IC1zZXFcbiAgICAgIHBhcnRzW3NlcS0xXSA9IHBrdC5ib2R5X2J1ZmZlcigpXG5cbiAgICAgIGlmICEgZmluIDo6IHJldHVyblxuICAgICAgaWYgcGFydHMuaW5jbHVkZXMgQCB1bmRlZmluZWQgOjogcmV0dXJuXG5cbiAgICAgIGNvbnN0IHJlcyA9IGNvbmNhdEJ1ZmZlcnMocGFydHMpXG4gICAgICBwYXJ0cyA9IG51bGxcbiAgICAgIHJldHVybiByZXNcblxuICBmdW5jdGlvbiBjcmVhdGVTdHJlYW0ocGt0LCBzaW5rKSA6OlxuICAgIGxldCBuZXh0PTAsIGZpbiA9IGZhbHNlLCByc3RyZWFtXG4gICAgY29uc3Qgc3RhdGUgPSBAe30gZmVlZDogZmVlZF9pbml0LCBpbmZvOiBwa3QuaW5mb1xuICAgIHJldHVybiBzdGF0ZVxuXG4gICAgZnVuY3Rpb24gb25fZXJyb3IoZXJyLCBwa3QpIDo6XG4gICAgICBpZiB1bmRlZmluZWQgPT09IHJzdHJlYW0ub25fZXJyb3IgOjpcbiAgICAgICAgcmV0dXJuIHZvaWQgY29uc29sZS53YXJuIEBcbiAgICAgICAgICBgRXJyb3IgZHVyaW5nIHN0cmVhbS5mZWVkOmAsIGVyclxuICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgZnVuY3Rpb24gZmVlZF9pbml0KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuXG4gICAgICBjb25zdCBtc2cgPSBqc29uX3BhcnNlIEAgcGt0LmJvZHlfdXRmOCgpXG4gICAgICByc3RyZWFtID0gc2luay5yZWN2U3RyZWFtKG1zZywgcGt0LmluZm8pXG4gICAgICBpZiBudWxsID09IHJzdHJlYW0gOjogcmV0dXJuXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICBpZiAhIGZlZWRfc2VxKHBrdCkgOjogcmV0dXJuXG4gICAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2JvZHlcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gb25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgcnN0cmVhbS5vbl9pbml0IDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2luaXQobXNnLCBwa3QpXG4gICAgICBlbHNlIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG4gICAgXG4gICAgZnVuY3Rpb24gZmVlZF9ib2R5KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIGxldCBkYXRhXG4gICAgICB0cnkgOjpcbiAgICAgICAgaWYgISBmZWVkX3NlcShwa3QpIDo6IHJldHVyblxuICAgICAgICBkYXRhID0gYXNfY29udGVudChwa3QpXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIG9uX2Vycm9yIEAgZXJyLCBwa3RcbiAgICAgIHJldHVybiByc3RyZWFtLm9uX2RhdGEgQCBkYXRhLCBwa3RcblxuICAgIGZ1bmN0aW9uIGZlZWRfaWdub3JlKCkgOjpcblxuICAgIGZ1bmN0aW9uIGZlZWRfc2VxKHBrdCkgOjpcbiAgICAgIGxldCBzZXEgPSBwa3QuaW5mby5zZXFcbiAgICAgIGlmIHNlcSA8IDAgOjogZmluID0gdHJ1ZTsgc2VxID0gLXNlcVxuICAgICAgaWYgbmV4dCA9PT0gc2VxIDo6IHJldHVybiArK25leHRcbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuICAgICAgbmV4dCA9ICdpbnZhbGlkJ1xuICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFBhY2tldCBvdXQgb2Ygc2VxdWVuY2VgXG5cbiAgZnVuY3Rpb24gKiBwYWNrZXRGcmFnbWVudHMoYnVmLCBuZXh0X2hkciwgZmluKSA6OlxuICAgIGlmIG51bGwgPT0gYnVmIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIHlpZWxkIG9ialxuICAgICAgcmV0dXJuXG5cbiAgICBsZXQgaSA9IDAsIGxhc3RJbm5lciA9IGJ1Zi5ieXRlTGVuZ3RoIC0gZnJhZ21lbnRfc2l6ZTtcbiAgICB3aGlsZSBpIDwgbGFzdElubmVyIDo6XG4gICAgICBjb25zdCBpMCA9IGlcbiAgICAgIGkgKz0gZnJhZ21lbnRfc2l6ZVxuXG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcigpXG4gICAgICBvYmouYm9keSA9IGJ1Zi5zbGljZShpMCwgaSlcbiAgICAgIHlpZWxkIG9ialxuXG4gICAgOjpcbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKHtmaW59KVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaSlcbiAgICAgIHlpZWxkIG9ialxuXG5cblxuICBmdW5jdGlvbiBiaW5kVHJhbnNwb3J0SW1wbHMoaW5ib3VuZCwgaGlnaGJpdHMsIHRyYW5zcG9ydHMpIDo6XG4gICAgY29uc3Qgb3V0Ym91bmQgPSBbXVxuICAgIG91dGJvdW5kLmNob29zZSA9IGZyYW1pbmdzLmNob29zZVxuXG4gICAgZm9yIGNvbnN0IGZyYW1lIG9mIGZyYW1pbmdzIDo6XG4gICAgICBjb25zdCBpbXBsID0gZnJhbWUgPyB0cmFuc3BvcnRzW2ZyYW1lLnRyYW5zcG9ydF0gOiBudWxsXG4gICAgICBpZiAhIGltcGwgOjogY29udGludWVcblxuICAgICAgY29uc3Qge2JpdHMsIHBhY2ssIHVucGFja30gPSBmcmFtZVxuICAgICAgY29uc3QgcGt0X3R5cGUgPSBoaWdoYml0cyB8IGJpdHNcbiAgICAgIGNvbnN0IHt0X3JlY3Z9ID0gaW1wbFxuXG4gICAgICBmdW5jdGlvbiBwYWNrX2hkcihvYmopIDo6XG4gICAgICAgIHBhY2socGt0X3R5cGUsIG9iailcbiAgICAgICAgcmV0dXJuIG9ialxuXG4gICAgICBmdW5jdGlvbiByZWN2X21zZyhwa3QsIHNpbmspIDo6XG4gICAgICAgIHVucGFjayhwa3QpXG4gICAgICAgIHJldHVybiB0X3JlY3YocGt0LCBzaW5rKVxuXG4gICAgICBwYWNrX2hkci5wa3RfdHlwZSA9IHJlY3ZfbXNnLnBrdF90eXBlID0gcGt0X3R5cGVcbiAgICAgIG91dGJvdW5kW2JpdHNdID0gcGFja19oZHJcbiAgICAgIGluYm91bmRbcGt0X3R5cGVdID0gcmVjdl9tc2dcblxuICAgICAgaWYgJ3Byb2R1Y3Rpb24nICE9PSBwcm9jZXNzLmVudi5OT0RFX0VOViA6OlxuICAgICAgICBjb25zdCBvcCA9IHBhY2tfaGRyLm9wID0gcmVjdl9tc2cub3AgPSBmcmFtZS5vcFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCBwYWNrX2hkciwgJ25hbWUnLCBAe30gdmFsdWU6IGBwYWNrX2hkciDCqyR7b3B9wrtgXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSBAIHJlY3ZfbXNnLCAnbmFtZScsIEB7fSB2YWx1ZTogYHJlY3ZfbXNnIMKrJHtvcH3Cu2BcblxuICAgIHJldHVybiBvdXRib3VuZFxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydHMoaW5ib3VuZCwgaGlnaGJpdHMsIHRyYW5zcG9ydHMpIDo6XG4gICAgY29uc3QgcGFja0JvZHkgPSB0cmFuc3BvcnRzLnBhY2tCb2R5XG4gICAgY29uc3QgcGFja1N0cmVhbSA9IHRyYW5zcG9ydHMucGFja1N0cmVhbVxuICAgIGNvbnN0IG91dGJvdW5kID0gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKVxuICAgIGNvbnN0IHN0cmVhbSA9ICEgdHJhbnNwb3J0cy5zdHJlYW1pbmcgPyBudWxsIDpcbiAgICAgICdvYmplY3QnID09PSB0cmFuc3BvcnRzLnN0cmVhbWluZy5tb2RlXG4gICAgICAgID8gYmluZF9zdHJlYW0gQCBtc2VuZF9vYmplY3RzXG4gICAgICAgIDogYmluZF9zdHJlYW0gQCBtc2VuZF9ieXRlc1xuXG4gICAgcmV0dXJuIEB7fSBzZW5kLCBzdHJlYW1cblxuICAgIGZ1bmN0aW9uIHNlbmQoY2hhbiwgb2JqLCBib2R5KSA6OlxuICAgICAgYm9keSA9IHBhY2tCb2R5KGJvZHkpXG4gICAgICBpZiBmcmFnbWVudF9zaXplIDwgYm9keS5ieXRlTGVuZ3RoIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIGNvbnN0IG1zZW5kID0gbXNlbmRfYnl0ZXMoJ211bHRpcGFydCcsIGNoYW4sIG9iailcbiAgICAgICAgcmV0dXJuIEB7fSBzZW50OiBtc2VuZCBAIHRydWUsIGJvZHlcblxuICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzaW5nbGUnXG4gICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBwYWNrX2hkcihvYmopXG4gICAgICByZXR1cm4gQHt9IHNlbnQ6IGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIG1zZW5kX2J5dGVzKHRyYW5zcG9ydCwgY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICBvYmoudHJhbnNwb3J0ID0gdHJhbnNwb3J0XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBsZXQge25leHR9ID0gcGFja19oZHIob2JqKVxuICAgICAgaWYgbnVsbCAhPT0gbXNnIDo6XG4gICAgICAgIG9iai5ib2R5ID0gbXNnXG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgY2hhbiBAIHBrdFxuXG4gICAgICByZXR1cm4gYXN5bmMgZnVuY3Rpb24gKGZpbiwgYm9keSkgOjpcbiAgICAgICAgaWYgbnVsbCA9PT0gbmV4dCA6OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvciBAICdXcml0ZSBhZnRlciBlbmQnXG4gICAgICAgIGxldCByZXNcbiAgICAgICAgZm9yIGNvbnN0IG9iaiBvZiBwYWNrZXRGcmFnbWVudHMgQCBib2R5LCBuZXh0LCBmaW4gOjpcbiAgICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgICAgcmVzID0gYXdhaXQgY2hhbiBAIHBrdFxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIHJlc1xuXG4gICAgZnVuY3Rpb24gbXNlbmRfb2JqZWN0cyh0cmFuc3BvcnQsIGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgb2JqLnRyYW5zcG9ydCA9IHRyYW5zcG9ydFxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBjb25zdCBvYmogPSBuZXh0KHtmaW59KVxuICAgICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIGJpbmRfc3RyZWFtKHNlbmRfaW1wbCkgOjpcbiAgICAgIHJldHVybiBmdW5jdGlvbiBzdHJlYW0gKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBpZiAnb2JqZWN0JyAhPT0gdHlwZW9mIG1zZyA6OlxuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgc3RyZWFtKCkgcmVxdWlyZXMgYSBKU09OIHNlcmFsaXphYmxlIG1zZyBmb3IgaW5pdGlhbCBwYWNrZXRgXG4gICAgICAgIG1zZyA9IGpzb25fc3RyaW5naWZ5KG1zZylcbiAgICAgICAgY29uc3QgbXNlbmQgPSBzZW5kX2ltcGwoJ3N0cmVhbWluZycsIGNoYW4sIG9iaiwgbXNnKVxuICAgICAgICB3cml0ZS53cml0ZSA9IHdyaXRlOyB3cml0ZS5lbmQgPSBlbmRcbiAgICAgICAgcmV0dXJuIHdyaXRlXG5cbiAgICAgICAgZnVuY3Rpb24gd3JpdGUoY2h1bmspIDo6XG4gICAgICAgICAgcmV0dXJuIGNodW5rICE9IG51bGxcbiAgICAgICAgICAgID8gbXNlbmQgQCBmYWxzZSwgcGFja0JvZHkgQCBjaHVua1xuICAgICAgICAgICAgOiBtc2VuZCBAIHRydWVcblxuICAgICAgICBmdW5jdGlvbiBlbmQoY2h1bmspIDo6XG4gICAgICAgICAgcmV0dXJuIGNodW5rICE9IG51bGxcbiAgICAgICAgICAgID8gbXNlbmQgQCB0cnVlLCBwYWNrQm9keSBAIGNodW5rXG4gICAgICAgICAgICA6IG1zZW5kIEAgdHJ1ZVxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ganNvbl9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbSwganNvbl9wYXJzZSwganNvbl9zdHJpbmdpZnl9ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcblxuICByZXR1cm4gQHt9XG4gICAgcGFja0JvZHlcbiAgICBwYWNrU3RyZWFtKGNodW5rLCBmcmFnbWVudF9zaXplKSA6OlxuICAgICAgcmV0dXJuIEBbXSBwYWNrQm9keShjaHVuaylcblxuICAgIGdldCBkYXRhZ3JhbSgpIDo6IHJldHVybiB0aGlzLmRpcmVjdFxuICAgIGRpcmVjdDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBtc2cgPSBqc29uX3BhcnNlIEAgcGt0LmJvZHlfdXRmOCgpIHx8IHVuZGVmaW5lZFxuICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBwa3QuaW5mb1xuXG4gICAgbXVsdGlwYXJ0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlTXVsdGlwYXJ0XG4gICAgICAgIGNvbnN0IGJvZHlfYnVmID0gc3RhdGUuZmVlZChwa3QpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gYm9keV9idWYgOjpcbiAgICAgICAgICBjb25zdCBtc2cgPSBqc29uX3BhcnNlIEAgdW5wYWNrX3V0ZjgoYm9keV9idWYpIHx8IHVuZGVmaW5lZFxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuICAgIHN0cmVhbWluZzogQHt9XG4gICAgICBtb2RlOiAnb2JqZWN0J1xuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVTdHJlYW1cbiAgICAgICAgcmV0dXJuIHN0YXRlLmZlZWQocGt0LCBwa3RfYXNfbmRqc29uKVxuXG4gIGZ1bmN0aW9uIHBhY2tCb2R5KGJvZHkpIDo6XG4gICAgcmV0dXJuIHBhY2tfdXRmOCBAIGpzb25fc3RyaW5naWZ5KGJvZHkpXG5cbiAgZnVuY3Rpb24gcGt0X2FzX25kanNvbihwa3QpIDo6XG4gICAgcmV0dXJuIHBrdC5ib2R5X3V0ZjgoKS5zcGxpdCgvXFxyfFxcbnxcXDAvKVxuICAgICAgLmZpbHRlciBAIGw9PmxcbiAgICAgIC5tYXAgQCBqc29uX3BhcnNlXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBiaW5hcnlfcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW19ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgY29uc3Qge2FzQnVmZmVyfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgcmV0dXJuIEB7fVxuICAgIHBhY2tCb2R5OiBhc0J1ZmZlclxuICAgIHBhY2tTdHJlYW0oY2h1bmssIGZyYWdtZW50X3NpemUpIDo6XG4gICAgICByZXR1cm4gQFtdIGFzQnVmZmVyKGNodW5rKVxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHBrdC5ib2R5X2J1ZmZlcigpXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdieXRlcydcbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlU3RyZWFtXG4gICAgICAgIGNvbnN0IG1zZyA9IHN0YXRlLmZlZWQocGt0LCBwa3RfYnVmZmVyKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZyA6OlxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuZnVuY3Rpb24gcGt0X2J1ZmZlcihwa3QpIDo6IHJldHVybiBwa3QuYm9keV9idWZmZXIoKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gY29udHJvbF9wcm90b2NvbChpbmJvdW5kLCBoaWdoLCBzaGFyZWQpIDo6XG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrUGFja2V0T2JqfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcblxuICBjb25zdCBwaW5nX2ZyYW1lID0gZnJhbWluZ3MuY2hvb3NlIEA6IGZyb21faWQ6IHRydWUsIHRva2VuOiB0cnVlLCB0cmFuc3BvcnQ6ICdkaXJlY3QnXG4gIGNvbnN0IHBvbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgbXNnaWQ6IHRydWUsIHRyYW5zcG9ydDogJ2RhdGFncmFtJ1xuXG4gIGNvbnN0IHBvbmdfdHlwZSA9IGhpZ2h8MHhlXG4gIGluYm91bmRbcG9uZ190eXBlXSA9IHJlY3ZfcG9uZ1xuICBjb25zdCBwaW5nX3R5cGUgPSBoaWdofDB4ZlxuICBpbmJvdW5kW2hpZ2h8MHhmXSA9IHJlY3ZfcGluZ1xuXG4gIHJldHVybiBAe30gc2VuZDpwaW5nLCBwaW5nXG5cbiAgZnVuY3Rpb24gcGluZyhjaGFuLCBvYmopIDo6XG4gICAgaWYgISBvYmoudG9rZW4gOjpcbiAgICAgIG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgb2JqLmJvZHkgPSBKU09OLnN0cmluZ2lmeSBAOlxuICAgICAgb3A6ICdwaW5nJywgdHMwOiBuZXcgRGF0ZSgpXG4gICAgcGluZ19mcmFtZS5wYWNrKHBpbmdfdHlwZSwgb2JqKVxuICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gIGZ1bmN0aW9uIHJlY3ZfcGluZyhwa3QsIHNpbmssIHJvdXRlcikgOjpcbiAgICBwaW5nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICBfc2VuZF9wb25nIEAgcGt0LmJvZHksIHBrdCwgc2luaywgcm91dGVyXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4gIGZ1bmN0aW9uIF9zZW5kX3Bvbmcoe3RzMH0sIHBrdF9waW5nLCBzaW5rLCByb3V0ZXIpIDo6XG4gICAgY29uc3Qge21zZ2lkLCBmcm9tX2lkOnJfaWR9ID0gcGt0X3BpbmcuaW5mb1xuICAgIGNvbnN0IHtpZF9yb3V0ZXIsIGlkX3RhcmdldH0gPSByX2lkXG4gICAgY29uc3Qgb2JqID0gQHt9IGlkX3JvdXRlciwgaWRfdGFyZ2V0XG4gICAgICBmcm9tX2lkOiBzaW5rLmZyb21faWQsIG1zZ2lkXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSBAOlxuICAgICAgICBvcDogJ3BvbmcnLCB0czAsIHRzMTogbmV3IERhdGUoKVxuXG4gICAgcG9uZ19mcmFtZS5wYWNrKHBvbmdfdHlwZSwgb2JqKVxuICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICByZXR1cm4gcm91dGVyLmRpc3BhdGNoIEAgW3BrdF1cblxuICBmdW5jdGlvbiByZWN2X3BvbmcocGt0LCBzaW5rKSA6OlxuICAgIHBvbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIHJldHVybiBzaW5rLnJlY3ZDdHJsKHBrdC5ib2R5LCBwa3QuaW5mbylcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5pbXBvcnQgc2hhcmVkX3Byb3RvIGZyb20gJy4vc2hhcmVkLmpzeSdcbmltcG9ydCBqc29uX3Byb3RvIGZyb20gJy4vanNvbi5qc3knXG5pbXBvcnQgYmluYXJ5X3Byb3RvIGZyb20gJy4vYmluYXJ5LmpzeSdcbmltcG9ydCBjb250cm9sX3Byb3RvIGZyb20gJy4vY29udHJvbC5qc3knXG5cbmV4cG9ydCAqIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGluaXRfcHJvdG9jb2wocGFja2V0UGFyc2VyLCBvcHRpb25zKSA6OlxuICBjb25zdCBzaGFyZWQgPSBzaGFyZWRfcHJvdG8gQCBwYWNrZXRQYXJzZXIsIG9wdGlvbnNcblxuICBjb25zdCBpbmJvdW5kID0gW11cbiAgY29uc3QganNvbiA9IHNoYXJlZC5iaW5kVHJhbnNwb3J0cyBAIGluYm91bmRcbiAgICAweDAwIC8vIDB4MCog4oCUIEpTT04gYm9keVxuICAgIGpzb25fcHJvdG8oc2hhcmVkKVxuXG4gIGNvbnN0IGJpbmFyeSA9IHNoYXJlZC5iaW5kVHJhbnNwb3J0cyBAIGluYm91bmRcbiAgICAweDEwIC8vIDB4MSog4oCUIGJpbmFyeSBib2R5XG4gICAgYmluYXJ5X3Byb3RvKHNoYXJlZClcblxuICBjb25zdCBjb250cm9sID0gY29udHJvbF9wcm90byBAIGluYm91bmQsXG4gICAgMHhmMCAvLyAweGYqIOKAlCBjb250cm9sXG4gICAgc2hhcmVkXG5cbiAgY29uc3QgY29kZWNzID0gQDoganNvbiwgYmluYXJ5LCBjb250cm9sLCBkZWZhdWx0OiBqc29uXG5cbiAgY29uc3Qge3JhbmRvbV9pZH0gPSBzaGFyZWRcbiAgcmV0dXJuIEA6IGluYm91bmQsIGNvZGVjcywgcmFuZG9tX2lkXG5cblxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgRW5kcG9pbnQgOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7fSkgOjpcbiAgICBjbGFzcyBFbmRwb2ludCBleHRlbmRzIHRoaXMgOjpcbiAgICByZXR1cm4gRW5kcG9pbnRcblxuICB2YWx1ZU9mKCkgOjogcmV0dXJuIHRoaXMuZnJvbV9pZFxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VuZHBvaW50ICR7dGhpcy5mcm9tX2lkLmlkX3RhcmdldH3Cu2BcblxuICBjb25zdHJ1Y3Rvcihtc2dfY3R4KSA6OlxuICAgIG1zZ19jdHggPSBtc2dfY3R4LndpdGhFbmRwb2ludCh0aGlzKVxuXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAOlxuICAgICAgX2J5X3Rva2VuOiBAe30gdmFsdWU6IHRoaXMuY3JlYXRlUmVwbHlNYXAoKVxuICAgICAgX2J5X3RyYWZmaWM6IEB7fSB2YWx1ZTogdGhpcy5jcmVhdGVUcmFmZmljTWFwKClcbiAgICAgIGZyb21faWQ6IEB7fSB2YWx1ZTogbXNnX2N0eC5mcm9tX2lkLCBlbnVtZXJhYmxlOiB0cnVlXG4gICAgICB0bzogQHt9IHZhbHVlOiBtc2dfY3R4LnRvXG5cbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKVxuICBjcmVhdGVTdGF0ZU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVJlcGx5TWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlVHJhZmZpY01hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG5cbiAgYmluZFNpbmsoc2luaykgOjpcbiAgICBjb25zdCBieV90b2tlbiA9IHRoaXMuX2J5X3Rva2VuXG4gICAgY29uc3QgYnlfdHJhZmZpYyA9IHRoaXMuX2J5X3RyYWZmaWNcbiAgICBjb25zdCB0cmFmZmljID0gKGZyb21faWQsIHRyYWZmaWMpID0+IDo6XG4gICAgICBjb25zdCB0cyA9IERhdGUubm93KClcbiAgICAgIGlmIGZyb21faWQgOjpcbiAgICAgICAgY29uc3QgdCA9IGJ5X3RyYWZmaWMuZ2V0KGZyb21faWQuaWRfdGFyZ2V0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHQgOjpcbiAgICAgICAgICB0LnRzID0gdFtgdHNfJHt0cmFmZmljfWBdID0gdHNcbiAgICAgIHRoaXMucmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpXG5cbiAgICByZXR1cm4gQHt9XG4gICAgICBmcm9tX2lkOiB0aGlzLmZyb21faWRcbiAgICAgIGJ5X21zZ2lkOiB0aGlzLmNyZWF0ZVN0YXRlTWFwKClcblxuICAgICAgcmVjdkN0cmw6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnY3RybCcpXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZDdHJsKG1zZywgaW5mbylcblxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHtybXNnLCBtc2csIGluZm99KS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZNc2c6IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnbXNnJylcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdk1zZyhtc2csIGluZm8pXG5cbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnKS50aGVuKHJlcGx5KVxuICAgICAgICBlbHNlIHJldHVybiBybXNnXG5cbiAgICAgIHJlY3ZTdHJlYW06IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgICAgY29uc3QgcnN0cmVhbSA9IHRoaXMucmVjdlN0cmVhbShtc2csIGluZm8pXG4gICAgICAgIGNvbnN0IHJtc2cgPSByc3RyZWFtLm9uX2luaXRcbiAgICAgICAgICA/IHJzdHJlYW0ub25faW5pdChtc2csIGluZm8pXG4gICAgICAgICAgOiB0aGlzLnJlY3ZNc2cobXNnLCBpbmZvKVxuXG4gICAgICAgIGlmIHJzdHJlYW0gIT0gbnVsbCAmJiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgcnN0cmVhbS5vbl9kYXRhIDo6XG4gICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBvYmplY3Qgd2l0aCBvbl9kYXRhKGRhdGEsIHBrdCkgZnVuY3Rpb25gXG5cbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShybXNnKS50aGVuKHJlcGx5KVxuICAgICAgICByZXR1cm4gcnN0cmVhbVxuXG4gIHJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKSA6OlxuICByZWN2Q3RybChtc2csIGluZm8pIDo6XG4gIHJlY3ZNc2cobXNnLCBpbmZvKSA6OlxuICAgIHJldHVybiBAe30gbXNnLCBpbmZvXG4gIHJlY3ZTdHJlYW0obXNnLCBpbmZvKSA6OlxuICAgIGNvbnNvbGUud2FybiBAIGBVbmhhbmRsZSByZWN2IHN0cmVhbTogJHtpbmZvfWBcbiAgICAvL3JldHVybiBAe31cbiAgICAvLyAgb25fZGF0YShkYXRhLCBwa3QpIDo6XG4gICAgLy8gIG9uX2Vycm9yKGVyciwgcGt0KSA6OlxuXG4gIGluaXRSZXBseSh0b2tlbiwgbXNnX2N0eCwga2luZCkgOjpcbiAgICByZXR1cm4gdGhpcy5pbml0UmVwbHlQcm9taXNlIEAgdG9rZW4sIG1zZ19jdHgubXNfdGltZW91dFxuXG4gIGluaXRNb25pdG9yKGlkX3RhcmdldCkgOjpcbiAgICBjb25zdCBrZXkgPSBpZF90YXJnZXQuaWRfdGFyZ2V0IHx8IGlkX3RhcmdldFxuICAgIGxldCBtb25pdG9yID0gdGhpcy5fYnlfdHJhZmZpYy5nZXQgQCBrZXlcbiAgICBpZiB1bmRlZmluZWQgPT09IG1vbml0b3IgOjpcbiAgICAgIG1vbml0b3IgPSBAe30gaWRfdGFyZ2V0LCB0czogRGF0ZS5ub3coKVxuICAgICAgICB0ZCgpIDo6IHJldHVybiBEYXRlLm5vdygpIC0gdGhpcy50c1xuICAgICAgdGhpcy5fYnlfdHJhZmZpYy5zZXQgQCBrZXksIG1vbml0b3JcbiAgICByZXR1cm4gbW9uaXRvclxuXG4gIGluaXRSZXBseVByb21pc2UodG9rZW4sIG1zX3RpbWVvdXQpIDo6XG4gICAgY29uc3QgYW5zID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgdGhpcy5fYnlfdG9rZW4uc2V0IEAgdG9rZW4sIHJlc29sdmVcbiAgICAgIGlmIG1zX3RpbWVvdXQgOjpcbiAgICAgICAgY29uc3QgdGlkID0gc2V0VGltZW91dCh0aW1lb3V0LCBtc190aW1lb3V0KVxuICAgICAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcbiAgICAgICAgZnVuY3Rpb24gdGltZW91dCgpIDo6IHJlamVjdCBAIG5ldyB0aGlzLlJlcGx5VGltZW91dFxuXG4gICAgcmV0dXJuIHNlbnQgPT4gOjpcbiAgICAgIGFucy5zZW50ID0gc2VudFxuICAgICAgcmV0dXJuIGFuc1xuXG5jbGFzcyBSZXBseVRpbWVvdXQgZXh0ZW5kcyBFcnJvciA6OlxuXG5PYmplY3QuYXNzaWduIEAgRW5kcG9pbnQucHJvdG90eXBlLCBAe31cbiAgUmVwbHlUaW1lb3V0XG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBTaW5rIDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe2luYm91bmR9KSA6OlxuICAgIGNsYXNzIFNpbmsgZXh0ZW5kcyB0aGlzIDo6XG4gICAgU2luay5wcm90b3R5cGUuX3Byb3RvY29sID0gaW5ib3VuZFxuICAgIHJldHVybiBTaW5rXG5cbiAgc3RhdGljIHJlZ2lzdGVyKGVuZHBvaW50LCBrd19hcmdzKSA6OlxuICAgIHJldHVybiBuZXcgdGhpcygpLnJlZ2lzdGVyKGVuZHBvaW50LCBrd19hcmdzKVxuICByZWdpc3RlcihlbmRwb2ludCwge2h1YiwgaWRfdGFyZ2V0LCBvbl9tc2csIG9uX2Vycm9yfSkgOjpcbiAgICBjb25zdCB1bnJlZ2lzdGVyID0gKCkgPT4gaHViLnJvdXRlci51bnJlZ2lzdGVyVGFyZ2V0KGlkX3RhcmdldClcblxuICAgIGh1Yi5yb3V0ZXIucmVnaXN0ZXJUYXJnZXQgQCBpZF90YXJnZXQsXG4gICAgICB0aGlzLl9iaW5kRGlzcGF0Y2ggQCBlbmRwb2ludCwgb25fbXNnLCBvbl9lcnJvciwgdW5yZWdpc3RlclxuICAgIHJldHVybiB0aGlzXG5cbiAgX2JpbmREaXNwYXRjaChlbmRwb2ludCwgb25fbXNnLCBvbl9lcnJvciwgdW5yZWdpc3RlcikgOjpcbiAgICBsZXQgYWxpdmUgPSB0cnVlXG4gICAgY29uc3QgcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbFxuICAgIGNvbnN0IGlzQWxpdmUgPSAoKSA9PiBhbGl2ZVxuICAgIGNvbnN0IHNodXRkb3duID0gKGVycikgPT4gOjpcbiAgICAgIGlmIGFsaXZlIDo6XG4gICAgICAgIHVucmVnaXN0ZXIoKTsgdW5yZWdpc3RlciA9IGFsaXZlID0gZmFsc2VcbiAgICAgICAgaWYgZXJyIDo6IGNvbnNvbGUuZXJyb3IgQCAnRU5EUE9JTlQgU0hVVERPV046ICcgKyBlcnJcblxuICAgIE9iamVjdC5hc3NpZ24gQCB0aGlzLCBlbmRwb2ludC5iaW5kU2luayh0aGlzKSwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG4gICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cblxuICAgIHJldHVybiBhc3luYyAocGt0LCByb3V0ZXIpID0+IDo6XG4gICAgICBpZiBmYWxzZT09PWFsaXZlIHx8IG51bGw9PXBrdCA6OiByZXR1cm4gYWxpdmVcblxuICAgICAgY29uc3QgcmVjdl9tc2cgPSBwcm90b2NvbFtwa3QudHlwZV1cbiAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmVjdl9tc2cgOjpcbiAgICAgICAgcmV0dXJuIG9uX2Vycm9yIEAgZmFsc2UsIEA6IHBrdFxuXG4gICAgICB0cnkgOjpcbiAgICAgICAgdmFyIG1zZyA9IGF3YWl0IHJlY3ZfbXNnIEAgcGt0LCB0aGlzLCByb3V0ZXJcbiAgICAgICAgaWYgISBtc2cgOjogcmV0dXJuIG1zZ1xuXG4gICAgICAgIHJldHVybiBhd2FpdCBvbl9tc2cgQCBtc2csIHBrdFxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIGlmIGZhbHNlICE9PSBvbl9lcnJvcihlcnIsIHttc2csIHBrdH0pIDo6XG4gICAgICAgICAgZW5kcG9pbnQuc2h1dGRvd24oZXJyLCB7bXNnLCBwa3R9KVxuXG4gIHN0YXRlRm9yKHBrdCwgaWZBYnNlbnQpIDo6XG4gICAgY29uc3QgbXNnaWQgPSBwa3QuaW5mby5tc2dpZFxuICAgIGxldCBlbnRyeSA9IHRoaXMuYnlfbXNnaWQuZ2V0KG1zZ2lkKVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gZW50cnkgOjpcbiAgICAgIGlmICEgbXNnaWQgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYEludmFsaWQgbXNnaWQ6ICR7bXNnaWR9YFxuICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlmQWJzZW50IDo6XG4gICAgICAgIGVudHJ5ID0gaWZBYnNlbnQocGt0LCB0aGlzKVxuICAgICAgZWxzZSBlbnRyeSA9IGlmQWJzZW50XG4gICAgICB0aGlzLmJ5X21zZ2lkLnNldCBAIG1zZ2lkLCBlbnRyeVxuICAgIHJldHVybiBlbnRyeVxuXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBNc2dDdHggOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7cmFuZG9tX2lkLCBjb2RlY3N9KSA6OlxuICAgIGNsYXNzIE1zZ0N0eCBleHRlbmRzIHRoaXMgOjpcbiAgICBNc2dDdHgucHJvdG90eXBlLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuICAgIE1zZ0N0eC53aXRoQ29kZWNzIEAgY29kZWNzXG4gICAgcmV0dXJuIE1zZ0N0eFxuXG4gIGNvbnN0cnVjdG9yKGZyb21faWQsIHJlc29sdmVSb3V0ZSkgOjpcbiAgICBpZiBudWxsICE9PSBmcm9tX2lkIDo6XG4gICAgICBjb25zdCB7aWRfdGFyZ2V0LCBpZF9yb3V0ZXJ9ID0gZnJvbV9pZFxuICAgICAgZnJvbV9pZCA9IE9iamVjdC5mcmVlemUgQDogaWRfdGFyZ2V0LCBpZF9yb3V0ZXJcblxuICAgIGNvbnN0IGN0eCA9IHtmcm9tX2lkfVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIF9yb290XzogQDogdmFsdWU6IHRoaXNcbiAgICAgIGZyb21faWQ6IEA6IHZhbHVlOiBmcm9tX2lkXG4gICAgICBjdHg6IEA6IHZhbHVlOiBjdHhcbiAgICAgIHJlc29sdmVSb3V0ZTogQDogdmFsdWU6IHJlc29sdmVSb3V0ZVxuXG4gIHdpdGhFbmRwb2ludChlbmRwb2ludCkgOjpcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGVuZHBvaW50OiBAe30gdmFsdWU6IGVuZHBvaW50XG5cbiAgc3RhdGljIGZyb20oaWRfdGFyZ2V0LCBodWIpIDo6XG4gICAgY29uc3QgZnJvbV9pZCA9IG51bGwgPT09IGlkX3RhcmdldCA/IG51bGxcbiAgICAgIDogQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICByZXR1cm4gbmV3IHRoaXMgQCBmcm9tX2lkLCBodWIuYmluZFJvdXRlRGlzcGF0Y2goKVxuXG4gIGdldCB0bygpIDo6IHJldHVybiAoLi4uYXJncykgPT4gdGhpcy5jbG9uZSgpLndpdGggQCAuLi5hcmdzXG5cbiAgcGluZyh0b2tlbj10cnVlKSA6OiByZXR1cm4gdGhpcy5jb2RlYygnY29udHJvbCcsIHt0b2tlbn0pLmludm9rZSBAICdwaW5nJ1xuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLmludm9rZSBAICdzZW5kJywgLi4uYXJnc1xuICBzdHJlYW0oLi4uYXJncykgOjogcmV0dXJuIHRoaXMuaW52b2tlIEAgJ3N0cmVhbScsIC4uLmFyZ3NcblxuICBpbnZva2Uoa2V5LCAuLi5hcmdzKSA6OlxuICAgIGNvbnN0IG9iaiA9IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHhcbiAgICB0aGlzLmFzc2VydE1vbml0b3IoKVxuICAgIGNvbnN0IGNoYW4gPSB0aGlzLnJlc29sdmVSb3V0ZShvYmouaWRfcm91dGVyKVxuICAgIGlmIHRydWUgIT09IG9iai50b2tlbiA6OlxuICAgICAgcmV0dXJuIHRoaXMuX2NvZGVjW2tleV0gQCBjaGFuLCBvYmosIC4uLmFyZ3NcblxuICAgIGVsc2UgOjpcbiAgICAgIGNvbnN0IHRva2VuID0gb2JqLnRva2VuID0gdGhpcy5yYW5kb21faWQoKVxuICAgICAgY29uc3QgcmVwbHkgPSB0aGlzLmVuZHBvaW50LmluaXRSZXBseSh0b2tlbiwgdGhpcywga2V5KVxuICAgICAgcmV0dXJuIHJlcGx5IEAgdGhpcy5fY29kZWNba2V5XSBAIGNoYW4sIG9iaiwgLi4uYXJnc1xuXG5cbiAgd2l0aCguLi5hcmdzKSA6OlxuICAgIGNvbnN0IGN0eCA9IHRoaXMuY3R4XG4gICAgZm9yIGxldCB0Z3Qgb2YgYXJncyA6OlxuICAgICAgaWYgJ251bWJlcicgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHRndFxuICAgICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgICAgIGNvbnRpbnVlXG5cbiAgICAgIGNvbnN0IHtmcm9tX2lkOiByZXBseV9pZCwgaWRfdGFyZ2V0LCBpZF9yb3V0ZXIsIHRva2VuLCBtc2dpZH0gPSB0Z3RcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBpZF90YXJnZXQgOjpcbiAgICAgICAgaWYgdW5kZWZpbmVkID09PSBpZF9yb3V0ZXIgOjpcbiAgICAgICAgICBpZiAhIGN0eC5pZF9yb3V0ZXIgOjpcbiAgICAgICAgICAgIC8vIGltcGxpY2l0bHkgb24gdGhlIHNhbWUgcm91dGVyXG4gICAgICAgICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgICAgIGVsc2UgY3R4LmlkX3JvdXRlciA9IGlkX3JvdXRlclxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gaWRfdGFyZ2V0XG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gaWRfcm91dGVyIDo6XG4gICAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYXNzaW5nICdpZF9yb3V0ZXInIHJlcXVpcmVzICdpZF90YXJnZXQnYFxuICAgICAgZWxzZSBpZiB1bmRlZmluZWQgIT09IHJlcGx5X2lkICYmICEgY3R4LmlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfcm91dGVyID0gcmVwbHlfaWQuaWRfcm91dGVyXG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSByZXBseV9pZC5pZF90YXJnZXRcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuXG4gICAgcmV0dXJuIHRoaXNcblxuICB3aXRoUmVwbHkoKSA6OlxuICAgIHJldHVybiB0aGlzLmNsb25lIEA6IHRva2VuOiB0cnVlXG5cbiAgcmVzZXQoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMuX3Jvb3RfLCBAe31cbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcbiAgY2xvbmUoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG5cbiAgYXNzZXJ0TW9uaXRvcigpIDo6XG4gICAgaWYgISB0aGlzLmNoZWNrTW9uaXRvcigpIDo6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgVGFyZ2V0IG1vbml0b3IgZXhwaXJlZGBcbiAgY2hlY2tNb25pdG9yKCkgOjogcmV0dXJuIHRydWVcbiAgbW9uaXRvcihvcHRpb25zPXt9KSA6OlxuICAgIGlmIHRydWUgPT09IG9wdGlvbnMgfHwgZmFsc2UgPT09IG9wdGlvbnMgOjpcbiAgICAgIG9wdGlvbnMgPSBAe30gYWN0aXZlOiBvcHRpb25zXG5cbiAgICBjb25zdCBtb25pdG9yID0gdGhpcy5lbmRwb2ludC5pbml0TW9uaXRvcih0aGlzLmN0eC5pZF90YXJnZXQpXG5cbiAgICBjb25zdCB0c19kdXJhdGlvbiA9IG9wdGlvbnMudHNfZHVyYXRpb24gfHwgNTAwMFxuICAgIGxldCB0c19hY3RpdmUgPSBvcHRpb25zLnRzX2FjdGl2ZVxuICAgIGlmIHRydWUgPT09IHRzX2FjdGl2ZSA6OlxuICAgICAgdHNfYWN0aXZlID0gdHNfZHVyYXRpb24vNFxuXG4gICAgbGV0IGNoZWNrTW9uaXRvclxuICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBjb25zdCBkb25lID0gb3B0aW9ucy5yZWplY3QgPyByZWplY3QgOiByZXNvbHZlXG4gICAgICB0aGlzLmNoZWNrTW9uaXRvciA9IGNoZWNrTW9uaXRvciA9ICgpID0+XG4gICAgICAgIHRzX2R1cmF0aW9uID4gbW9uaXRvci50ZCgpXG4gICAgICAgICAgPyB0cnVlIDogKGRvbmUobW9uaXRvciksIGZhbHNlKVxuXG4gICAgbGV0IHRpZFxuICAgIGNvbnN0IHRzX2ludGVydmFsID0gdHNfYWN0aXZlIHx8IHRzX2R1cmF0aW9uLzRcbiAgICBpZiBvcHRpb25zLmFjdGl2ZSB8fCB0c19hY3RpdmUgOjpcbiAgICAgIGNvbnN0IGN0cmwgPSB0aGlzLmNvZGVjKCdjb250cm9sJylcbiAgICAgIGNvbnN0IGNoZWNrUGluZyA9ICgpID0+IDo6XG4gICAgICAgIGlmIHRzX2ludGVydmFsID4gbW9uaXRvci50ZCgpIDo6XG4gICAgICAgICAgY3RybC5pbnZva2UoJ3BpbmcnKVxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja1BpbmcsIHRzX2ludGVydmFsXG4gICAgZWxzZSA6OlxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja01vbml0b3IsIHRzX2ludGVydmFsXG4gICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiBjbGVhckludGVydmFsKHRpZClcblxuICAgIHByb21pc2UudGhlbihjbGVhciwgY2xlYXIpXG4gICAgcmV0dXJuIHByb21pc2VcblxuXG4gIGNvZGVjKG1zZ19jb2RlYywgLi4uYXJncykgOjpcbiAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIG1zZ19jb2RlYyA6OlxuICAgICAgbXNnX2NvZGVjID0gdGhpcy5fbXNnQ29kZWNzW21zZ19jb2RlY11cblxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBtc2dfY29kZWMuc2VuZCA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwYWNrZXQgY29kZWMgcHJvdG9jb2xgXG5cbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEA6XG4gICAgICBfY29kZWM6IEA6IHZhbHVlOiBtc2dfY29kZWNcbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuICBzdGF0aWMgd2l0aENvZGVjcyhtc2dDb2RlY3MpIDo6XG4gICAgZm9yIGNvbnN0IFtuYW1lLCBtc2dfY29kZWNdIG9mIE9iamVjdC5lbnRyaWVzIEAgbXNnQ29kZWNzIDo6XG4gICAgICB0aGlzLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMuY29kZWMgQCBtc2dfY29kZWNcbiAgICB0aGlzLnByb3RvdHlwZS5fbXNnQ29kZWNzID0gbXNnQ29kZWNzXG4gICAgdGhpcy5wcm90b3R5cGUuX2NvZGVjID0gbXNnQ29kZWNzLmRlZmF1bHRcbiAgICByZXR1cm4gdGhpc1xuXG5PYmplY3QuYXNzaWduIEAgTXNnQ3R4LnByb3RvdHlwZSwgQHt9XG4gIG1zX3RpbWVvdXQ6IDUwMDBcblxuIiwiaW1wb3J0IGluaXRfcHJvdG9jb2wgZnJvbSAnLi9wcm90b2NvbC9pbmRleC5qc3knXG5pbXBvcnQgRW5kcG9pbnRCYXNlIGZyb20gJy4vZW5kcG9pbnQuanN5J1xuaW1wb3J0IFNpbmtCYXNlIGZyb20gJy4vc2luay5qc3knXG5pbXBvcnQgTXNnQ3R4QmFzZSBmcm9tICcuL21zZ2N0eC5qc3knXG5cbmNvbnN0IGRlZmF1bHRfcGx1Z2luX29wdGlvbnMgPSBAOlxuICBvbl9lcnJvcjogY29uc29sZS5lcnJvclxuICBzdWJjbGFzcyh7U2luaywgRW5kcG9pbnQsIFNvdXJjZUVuZHBvaW50LCBwcm90b2NvbHN9KSA6OlxuXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBsdWdpbl9vcHRpb25zKSA6OlxuICBwbHVnaW5fb3B0aW9ucyA9IE9iamVjdC5hc3NpZ24gQCB7fSwgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucywgcGx1Z2luX29wdGlvbnNcbiAgY29uc3QgQHt9XG4gICAgcmFuZG9tX2lkLCBqc29uX3Jldml2ZXIsIGpzb25fcmVwbGFjZXJcbiAgICBvbl9lcnJvcjogZGVmYXVsdF9vbl9lcnJvclxuICA9IHBsdWdpbl9vcHRpb25zXG5cbiAgcmV0dXJuIEA6IG9yZGVyOiAxLCBzdWJjbGFzcywgcG9zdFxuICBcbiAgZnVuY3Rpb24gc3ViY2xhc3MoRmFicmljSHViX1BJLCBiYXNlcykgOjpcbiAgICBjb25zdCB7cGFja2V0UGFyc2VyfSA9IEZhYnJpY0h1Yl9QSS5wcm90b3R5cGVcbiAgICBpZiBudWxsPT1wYWNrZXRQYXJzZXIgfHwgISBwYWNrZXRQYXJzZXIuaXNQYWNrZXRQYXJzZXIoKSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBJbnZhbGlkIHBhY2tldFBhcnNlciBmb3IgcGx1Z2luYFxuICAgIFxuICAgIEZhYnJpY0h1Yl9QSS5wcm90b3R5cGUuZW5kcG9pbnQgPVxuICAgICAgYmluZEVuZHBvaW50QXBpIEAgcGFja2V0UGFyc2VyXG5cbiAgZnVuY3Rpb24gcG9zdChodWIpIDo6XG4gICAgcmV0dXJuIGh1Yi5lbmRwb2ludCA9IGh1Yi5lbmRwb2ludChodWIpXG5cbiAgZnVuY3Rpb24gYmluZEVuZHBvaW50QXBpKHBhY2tldFBhcnNlcikgOjpcbiAgICBjb25zdCBwcm90b2NvbHMgPSBpbml0X3Byb3RvY29sIEAgcGFja2V0UGFyc2VyLCBAe30gcmFuZG9tX2lkLCBqc29uX3Jldml2ZXIsIGpzb25fcmVwbGFjZXJcbiAgICBjb25zdCBTaW5rID0gU2lua0Jhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICBjb25zdCBNc2dDdHggPSBNc2dDdHhCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgY29uc3QgRW5kcG9pbnQgPSBFbmRwb2ludEJhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcblxuICAgIHBsdWdpbl9vcHRpb25zLnN1YmNsYXNzIEA6XG4gICAgICBTaW5rLCBFbmRwb2ludCwgTXNnQ3R4LCBwcm90b2NvbHNcblxuICAgIHJldHVybiBmdW5jdGlvbihodWIpIDo6XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAOiBjcmVhdGU6IGVuZHBvaW50LCBzZXJ2ZXI6IGVuZHBvaW50LCBjbGllbnRcblxuICAgICAgZnVuY3Rpb24gY2xpZW50KC4uLmFyZ3MpIDo6XG4gICAgICAgIGNvbnN0IG1zZ19jdHggPSBNc2dDdHguZnJvbSBAIG51bGwsIGh1YlxuICAgICAgICByZXR1cm4gMCAhPT0gYXJncy5sZW5ndGhcbiAgICAgICAgICA/IG1zZ19jdHgud2l0aCguLi5hcmdzKSA6IG1zZ19jdHhcblxuICAgICAgZnVuY3Rpb24gZW5kcG9pbnQob25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgaWRfdGFyZ2V0ID0gcmFuZG9tX2lkKClcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IE1zZ0N0eC5mcm9tIEAgaWRfdGFyZ2V0LCBodWJcbiAgICAgICAgY29uc3QgZXAgPSBuZXcgRW5kcG9pbnQobXNnX2N0eClcblxuICAgICAgICBjb25zdCB0YXJnZXQgPSBvbl9pbml0KGVwKVxuICAgICAgICBjb25zdCBvbl9tc2cgPSAodGFyZ2V0Lm9uX21zZyB8fCB0YXJnZXQpLmJpbmQodGFyZ2V0KVxuICAgICAgICBjb25zdCBvbl9lcnJvciA9ICh0YXJnZXQub25fZXJyb3IgfHwgZGVmYXVsdF9vbl9lcnJvcikuYmluZCh0YXJnZXQpXG5cbiAgICAgICAgU2luay5yZWdpc3RlciBAIGVwLCBAe31cbiAgICAgICAgICBodWIsIGlkX3RhcmdldCwgb25fbXNnLCBvbl9lcnJvclxuXG4gICAgICAgIGlmIHRhcmdldC5vbl9yZWFkeSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZSh0YXJnZXQpLnRoZW4gQFxuICAgICAgICAgICAgdGFyZ2V0ID0+IHRhcmdldC5vbl9yZWFkeSgpXG5cbiAgICAgICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCBlbmRwb2ludF90YXJnZXRfYXBpLCBAOlxuICAgICAgICAgIGlkX3JvdXRlcjogQHt9IGVudW1lcmFibGU6IHRydWUsIHZhbHVlOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICAgICAgICBpZF90YXJnZXQ6IEB7fSBlbnVtZXJhYmxlOiB0cnVlLCB2YWx1ZTogaWRfdGFyZ2V0XG5cbmNvbnN0IGVuZHBvaW50X3RhcmdldF9hcGkgPSBAOlxuICB2YWx1ZU9mKCkgOjogcmV0dXJuIDAgfCB0aGlzLmlkX3RhcmdldFxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VuZHBvaW50IFRhcmdldCAke3RoaXMuaWRfdGFyZ2V0fcK7YFxuXG4iLCJpbXBvcnQge3JhbmRvbUJ5dGVzfSBmcm9tICdjcnlwdG8nXG5pbXBvcnQgZW5kcG9pbnRfcGx1Z2luIGZyb20gJy4vcGx1Z2luLmpzeSdcblxuZW5kcG9pbnRfbm9kZWpzLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuZnVuY3Rpb24gcmFuZG9tX2lkKCkgOjpcbiAgcmV0dXJuIHJhbmRvbUJ5dGVzKDQpLnJlYWRJbnQzMkxFKClcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gZW5kcG9pbnRfbm9kZWpzKHBsdWdpbl9vcHRpb25zPXt9KSA6OlxuICBpZiBudWxsID09IHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA6OlxuICAgIHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuXG4gIHJldHVybiBlbmRwb2ludF9wbHVnaW4ocGx1Z2luX29wdGlvbnMpXG5cbiJdLCJuYW1lcyI6WyJsaXR0bGVfZW5kaWFuIiwiY19zaW5nbGUiLCJjX2RhdGFncmFtIiwiY19kaXJlY3QiLCJjX211bHRpcGFydCIsImNfc3RyZWFtaW5nIiwiX2Vycl9tc2dpZF9yZXF1aXJlZCIsIl9lcnJfdG9rZW5fcmVxdWlyZWQiLCJmcm1fcm91dGluZyIsInNpemUiLCJiaXRzIiwibWFzayIsIm9iaiIsImZyb21faWQiLCJkdiIsIm9mZnNldCIsInNldEludDMyIiwiaWRfcm91dGVyIiwiaWRfdGFyZ2V0IiwidW5kZWZpbmVkIiwiZ2V0SW50MzIiLCJmcm1fcmVzcG9uc2UiLCJtc2dpZCIsIkVycm9yIiwic2V0SW50MTYiLCJzZXFfYWNrIiwiYWNrX2ZsYWdzIiwidG9rZW4iLCJnZXRJbnQxNiIsImZybV9kYXRhZ3JhbSIsInRyYW5zcG9ydCIsImZybV9kaXJlY3QiLCJmcm1fbXVsdGlwYXJ0Iiwic2VxX3BvcyIsInNlcSIsInNlcV9mbGFncyIsImZybV9zdHJlYW1pbmciLCJiaW5kX3NlcV9uZXh0Iiwic2VxX29mZnNldCIsInNlcV9uZXh0IiwiZmxhZ3MiLCJmaW4iLCJOYU4iLCJjb21wb3NlRnJhbWluZ3MiLCJmcm1fZnJvbSIsImZybV9yZXNwIiwiZnJtX3RyYW5zcG9ydHMiLCJsZW5ndGgiLCJieUJpdHMiLCJ0X2Zyb20iLCJmX3Rlc3QiLCJ0X3Jlc3AiLCJ0MCIsInQxIiwidDIiLCJ0MyIsIm1hcCIsImYiLCJ0ZXN0Qml0cyIsImNob29zZSIsImxzdCIsIlQiLCJiIiwib3AiLCJmbl9rZXkiLCJmbl90cmFuIiwiZm5fZnJvbSIsImZuX3Jlc3AiLCJmcm0iLCJiaW5kQXNzZW1ibGVkIiwiZl9wYWNrIiwiZl91bnBhY2siLCJwYWNrIiwidW5wYWNrIiwicGt0X3R5cGUiLCJwa3Rfb2JqIiwiVHlwZUVycm9yIiwidHlwZSIsIkRhdGFWaWV3IiwiQXJyYXlCdWZmZXIiLCJoZWFkZXIiLCJidWZmZXIiLCJzbGljZSIsInBrdCIsImJ1ZiIsImhlYWRlcl9idWZmZXIiLCJVaW50OEFycmF5IiwiaW5mbyIsIl9iaW5kX2l0ZXJhYmxlIiwiYnVmX2Nsb25lIiwidHRsIiwibmV4dCIsIm9wdGlvbnMiLCJkb25lIiwidmFsdWUiLCJwYWNrZXRQYXJzZXIiLCJmcmFnbWVudF9zaXplIiwiY29uY2F0QnVmZmVycyIsInBhY2tQYWNrZXRPYmoiLCJwYWNrX3V0ZjgiLCJ1bnBhY2tfdXRmOCIsIk51bWJlciIsInJhbmRvbV9pZCIsImpzb25fcmV2aXZlciIsImpzb25fcmVwbGFjZXIiLCJqc29uX3BhcnNlIiwianNvbl9zdHJpbmdpZnkiLCJjcmVhdGVTdHJlYW0iLCJwYWNrZXRGcmFnbWVudHMiLCJ0ZXh0IiwiSlNPTiIsInBhcnNlIiwic3RyaW5naWZ5IiwiY3JlYXRlTXVsdGlwYXJ0Iiwic2luayIsInBhcnRzIiwiZmVlZCIsImJvZHlfYnVmZmVyIiwiaW5jbHVkZXMiLCJyZXMiLCJyc3RyZWFtIiwic3RhdGUiLCJmZWVkX2luaXQiLCJvbl9lcnJvciIsImVyciIsImNvbnNvbGUiLCJ3YXJuIiwiYXNfY29udGVudCIsImZlZWRfaWdub3JlIiwibXNnIiwiYm9keV91dGY4IiwicmVjdlN0cmVhbSIsImZlZWRfc2VxIiwiZmVlZF9ib2R5Iiwib25faW5pdCIsInJlY3ZNc2ciLCJkYXRhIiwib25fZGF0YSIsIm5leHRfaGRyIiwiaSIsImxhc3RJbm5lciIsImJ5dGVMZW5ndGgiLCJpMCIsImJvZHkiLCJiaW5kVHJhbnNwb3J0SW1wbHMiLCJpbmJvdW5kIiwiaGlnaGJpdHMiLCJ0cmFuc3BvcnRzIiwib3V0Ym91bmQiLCJmcmFtaW5ncyIsImZyYW1lIiwiaW1wbCIsInRfcmVjdiIsInBhY2tfaGRyIiwicmVjdl9tc2ciLCJiaW5kVHJhbnNwb3J0cyIsInBhY2tCb2R5Iiwic3RyZWFtIiwic3RyZWFtaW5nIiwibW9kZSIsImJpbmRfc3RyZWFtIiwibXNlbmRfb2JqZWN0cyIsIm1zZW5kX2J5dGVzIiwic2VuZCIsImNoYW4iLCJtc2VuZCIsInNlbnQiLCJzZW5kX2ltcGwiLCJ3cml0ZSIsImVuZCIsImNodW5rIiwianNvbl9wcm90b2NvbCIsInNoYXJlZCIsImRhdGFncmFtIiwiZGlyZWN0Iiwic3RhdGVGb3IiLCJib2R5X2J1ZiIsInBrdF9hc19uZGpzb24iLCJzcGxpdCIsImZpbHRlciIsImwiLCJiaW5hcnlfcHJvdG9jb2wiLCJhc0J1ZmZlciIsInBrdF9idWZmZXIiLCJjb250cm9sX3Byb3RvY29sIiwiaGlnaCIsInBpbmdfZnJhbWUiLCJwb25nX2ZyYW1lIiwicG9uZ190eXBlIiwicmVjdl9wb25nIiwicGluZ190eXBlIiwicmVjdl9waW5nIiwicGluZyIsInRzMCIsIkRhdGUiLCJyb3V0ZXIiLCJib2R5X2pzb24iLCJyZWN2Q3RybCIsIl9zZW5kX3BvbmciLCJwa3RfcGluZyIsInJfaWQiLCJ0czEiLCJkaXNwYXRjaCIsImluaXRfcHJvdG9jb2wiLCJzaGFyZWRfcHJvdG8iLCJqc29uIiwianNvbl9wcm90byIsImJpbmFyeSIsImJpbmFyeV9wcm90byIsImNvbnRyb2wiLCJjb250cm9sX3Byb3RvIiwiY29kZWNzIiwiZGVmYXVsdCIsIkVuZHBvaW50IiwiZm9yUHJvdG9jb2xzIiwibXNnX2N0eCIsIndpdGhFbmRwb2ludCIsImRlZmluZVByb3BlcnRpZXMiLCJjcmVhdGVSZXBseU1hcCIsImNyZWF0ZVRyYWZmaWNNYXAiLCJlbnVtZXJhYmxlIiwidG8iLCJNYXAiLCJjcmVhdGVNYXAiLCJieV90b2tlbiIsIl9ieV90b2tlbiIsImJ5X3RyYWZmaWMiLCJfYnlfdHJhZmZpYyIsInRyYWZmaWMiLCJ0cyIsIm5vdyIsInQiLCJnZXQiLCJyZWN2VHJhZmZpYyIsImNyZWF0ZVN0YXRlTWFwIiwicm1zZyIsInJlcGx5IiwicmVzb2x2ZSIsInRoZW4iLCJpbml0UmVwbHkiLCJraW5kIiwiaW5pdFJlcGx5UHJvbWlzZSIsIm1zX3RpbWVvdXQiLCJrZXkiLCJtb25pdG9yIiwic2V0IiwiYW5zIiwiUHJvbWlzZSIsInJlamVjdCIsInRpZCIsInNldFRpbWVvdXQiLCJ0aW1lb3V0IiwidW5yZWYiLCJSZXBseVRpbWVvdXQiLCJPYmplY3QiLCJhc3NpZ24iLCJwcm90b3R5cGUiLCJTaW5rIiwiX3Byb3RvY29sIiwicmVnaXN0ZXIiLCJlbmRwb2ludCIsImt3X2FyZ3MiLCJodWIiLCJvbl9tc2ciLCJ1bnJlZ2lzdGVyIiwidW5yZWdpc3RlclRhcmdldCIsInJlZ2lzdGVyVGFyZ2V0IiwiX2JpbmREaXNwYXRjaCIsImFsaXZlIiwicHJvdG9jb2wiLCJpc0FsaXZlIiwic2h1dGRvd24iLCJlcnJvciIsImJpbmRTaW5rIiwiaWZBYnNlbnQiLCJlbnRyeSIsImJ5X21zZ2lkIiwiTXNnQ3R4Iiwid2l0aENvZGVjcyIsInJlc29sdmVSb3V0ZSIsImZyZWV6ZSIsImN0eCIsImZyb20iLCJpZF9zZWxmIiwiYmluZFJvdXRlRGlzcGF0Y2giLCJhcmdzIiwiY2xvbmUiLCJ3aXRoIiwiY29kZWMiLCJpbnZva2UiLCJhc3NlcnRNb25pdG9yIiwiX2NvZGVjIiwidGd0IiwicmVwbHlfaWQiLCJjcmVhdGUiLCJfcm9vdF8iLCJjaGVja01vbml0b3IiLCJhY3RpdmUiLCJpbml0TW9uaXRvciIsInRzX2R1cmF0aW9uIiwidHNfYWN0aXZlIiwicHJvbWlzZSIsInRkIiwidHNfaW50ZXJ2YWwiLCJjdHJsIiwiY2hlY2tQaW5nIiwic2V0SW50ZXJ2YWwiLCJjbGVhciIsImNsZWFySW50ZXJ2YWwiLCJtc2dfY29kZWMiLCJfbXNnQ29kZWNzIiwibXNnQ29kZWNzIiwibmFtZSIsImVudHJpZXMiLCJkZWZhdWx0X3BsdWdpbl9vcHRpb25zIiwiU291cmNlRW5kcG9pbnQiLCJwcm90b2NvbHMiLCJwbHVnaW5fb3B0aW9ucyIsImRlZmF1bHRfb25fZXJyb3IiLCJvcmRlciIsInN1YmNsYXNzIiwicG9zdCIsIkZhYnJpY0h1Yl9QSSIsImJhc2VzIiwiaXNQYWNrZXRQYXJzZXIiLCJiaW5kRW5kcG9pbnRBcGkiLCJTaW5rQmFzZSIsIk1zZ0N0eEJhc2UiLCJFbmRwb2ludEJhc2UiLCJzZXJ2ZXIiLCJjbGllbnQiLCJlcCIsInRhcmdldCIsImJpbmQiLCJvbl9yZWFkeSIsImVuZHBvaW50X3RhcmdldF9hcGkiLCJlbmRwb2ludF9ub2RlanMiLCJyYW5kb21CeXRlcyIsInJlYWRJbnQzMkxFIiwiZW5kcG9pbnRfcGx1Z2luIl0sIm1hcHBpbmdzIjoiOzs7O0FBQUEsTUFBTUEsZ0JBQWdCLElBQXRCO0FBQ0EsTUFBTUMsV0FBVyxRQUFqQjtBQUNBLE1BQU1DLGFBQWEsVUFBbkI7QUFDQSxNQUFNQyxXQUFXLFFBQWpCO0FBQ0EsTUFBTUMsY0FBYyxXQUFwQjtBQUNBLE1BQU1DLGNBQWMsV0FBcEI7O0FBRUEsTUFBTUMsc0JBQXVCLDBCQUE3QjtBQUNBLE1BQU1DLHNCQUF1QiwyQkFBN0I7O0FBR0EsU0FBU0MsV0FBVCxHQUF1QjtRQUNmQyxPQUFPLENBQWI7UUFBZ0JDLE9BQU8sR0FBdkI7UUFBNEJDLE9BQU8sR0FBbkM7U0FDTztRQUFBLEVBQ0NELElBREQsRUFDT0MsSUFEUDs7V0FHRUMsR0FBUCxFQUFZO2FBQVUsUUFBUUEsSUFBSUMsT0FBWixHQUFzQkgsSUFBdEIsR0FBNkIsS0FBcEM7S0FIVjs7V0FLRUUsR0FBUCxFQUFZRSxFQUFaLEVBQWdCQyxNQUFoQixFQUF3QjtZQUNoQixFQUFDRixPQUFELEtBQVlELEdBQWxCO1NBQ0dJLFFBQUgsQ0FBYyxJQUFFRCxNQUFoQixFQUF3QixJQUFFRixRQUFRSSxTQUFsQyxFQUE2Q2pCLGFBQTdDO1NBQ0dnQixRQUFILENBQWMsSUFBRUQsTUFBaEIsRUFBd0IsSUFBRUYsUUFBUUssU0FBbEMsRUFBNkNsQixhQUE3QztLQVJHOzthQVVJWSxHQUFULEVBQWNFLEVBQWQsRUFBa0JDLE1BQWxCLEVBQTBCO1lBQ2xCRixVQUFVTSxjQUFjUCxJQUFJQyxPQUFsQixHQUNaRCxJQUFJQyxPQUFKLEdBQWMsRUFERixHQUNPRCxJQUFJQyxPQUQzQjtjQUVRSSxTQUFSLEdBQW9CSCxHQUFHTSxRQUFILENBQWMsSUFBRUwsTUFBaEIsRUFBd0JmLGFBQXhCLENBQXBCO2NBQ1FrQixTQUFSLEdBQW9CSixHQUFHTSxRQUFILENBQWMsSUFBRUwsTUFBaEIsRUFBd0JmLGFBQXhCLENBQXBCO0tBZEcsRUFBUDs7O0FBZ0JGLFNBQVNxQixZQUFULEdBQXdCO1FBQ2hCWixPQUFPLENBQWI7UUFBZ0JDLE9BQU8sR0FBdkI7UUFBNEJDLE9BQU8sR0FBbkM7U0FDTztRQUFBLEVBQ0NELElBREQsRUFDT0MsSUFEUDs7V0FHRUMsR0FBUCxFQUFZO2FBQVUsUUFBUUEsSUFBSVUsS0FBWixHQUFvQlosSUFBcEIsR0FBMkIsS0FBbEM7S0FIVjs7V0FLRUUsR0FBUCxFQUFZRSxFQUFaLEVBQWdCQyxNQUFoQixFQUF3QjtVQUNuQixDQUFFSCxJQUFJVSxLQUFULEVBQWlCO2NBQU8sSUFBSUMsS0FBSixDQUFZakIsbUJBQVosQ0FBTjs7U0FDZlUsUUFBSCxDQUFjLElBQUVELE1BQWhCLEVBQXdCSCxJQUFJVSxLQUE1QixFQUFtQ3RCLGFBQW5DO1NBQ0d3QixRQUFILENBQWMsSUFBRVQsTUFBaEIsRUFBd0IsSUFBRUgsSUFBSWEsT0FBOUIsRUFBdUN6QixhQUF2QztTQUNHd0IsUUFBSCxDQUFjLElBQUVULE1BQWhCLEVBQXdCLElBQUVILElBQUljLFNBQTlCLEVBQXlDMUIsYUFBekM7S0FURzs7YUFXSVksR0FBVCxFQUFjRSxFQUFkLEVBQWtCQyxNQUFsQixFQUEwQjtVQUNwQlksS0FBSixHQUFZYixHQUFHTSxRQUFILENBQWMsSUFBRUwsTUFBaEIsRUFBd0JmLGFBQXhCLENBQVo7VUFDSXlCLE9BQUosR0FBY1gsR0FBR2MsUUFBSCxDQUFjLElBQUViLE1BQWhCLEVBQXdCZixhQUF4QixDQUFkO1VBQ0kwQixTQUFKLEdBQWdCWixHQUFHYyxRQUFILENBQWMsSUFBRWIsTUFBaEIsRUFBd0JmLGFBQXhCLENBQWhCO0tBZEcsRUFBUDs7O0FBa0JGLFNBQVM2QixZQUFULEdBQXdCO1FBQ2hCcEIsT0FBTyxDQUFiO1FBQWdCQyxPQUFPLEdBQXZCO1FBQTRCQyxPQUFPLEdBQW5DO1NBQ08sRUFBSW1CLFdBQVc1QixVQUFmO1FBQUEsRUFDQ1EsSUFERCxFQUNPQyxJQURQOztXQUdFQyxHQUFQLEVBQVk7VUFDUFYsZUFBZVUsSUFBSWtCLFNBQXRCLEVBQWtDO2VBQVFwQixJQUFQOztVQUNoQ0UsSUFBSWtCLFNBQUosSUFBaUI3QixhQUFhVyxJQUFJa0IsU0FBckMsRUFBaUQ7ZUFBUSxLQUFQOzthQUMzQyxDQUFFbEIsSUFBSWUsS0FBTixHQUFjakIsSUFBZCxHQUFxQixLQUE1QjtLQU5HOztXQVFFRSxHQUFQLEVBQVlFLEVBQVosRUFBZ0JDLE1BQWhCLEVBQXdCLEVBUm5COzthQVVJSCxHQUFULEVBQWNFLEVBQWQsRUFBa0JDLE1BQWxCLEVBQTBCO1VBQ3BCZSxTQUFKLEdBQWdCNUIsVUFBaEI7S0FYRyxFQUFQOzs7QUFhRixTQUFTNkIsVUFBVCxHQUFzQjtRQUNkdEIsT0FBTyxDQUFiO1FBQWdCQyxPQUFPLEdBQXZCO1FBQTRCQyxPQUFPLEdBQW5DO1NBQ08sRUFBSW1CLFdBQVczQixRQUFmO1FBQUEsRUFDQ08sSUFERCxFQUNPQyxJQURQOztXQUdFQyxHQUFQLEVBQVk7VUFDUFQsYUFBYVMsSUFBSWtCLFNBQXBCLEVBQWdDO2VBQVFwQixJQUFQOztVQUM5QkUsSUFBSWtCLFNBQUosSUFBaUI3QixhQUFhVyxJQUFJa0IsU0FBckMsRUFBaUQ7ZUFBUSxLQUFQOzthQUMzQyxDQUFDLENBQUVsQixJQUFJZSxLQUFQLEdBQWVqQixJQUFmLEdBQXNCLEtBQTdCO0tBTkc7O1dBUUVFLEdBQVAsRUFBWUUsRUFBWixFQUFnQkMsTUFBaEIsRUFBd0I7VUFDbkIsQ0FBRUgsSUFBSWUsS0FBVCxFQUFpQjtjQUFPLElBQUlKLEtBQUosQ0FBWWhCLG1CQUFaLENBQU47O1NBQ2ZTLFFBQUgsQ0FBYyxJQUFFRCxNQUFoQixFQUF3QkgsSUFBSWUsS0FBNUIsRUFBbUMzQixhQUFuQztLQVZHOzthQVlJWSxHQUFULEVBQWNFLEVBQWQsRUFBa0JDLE1BQWxCLEVBQTBCO1VBQ3BCTyxLQUFKLEdBQVlSLEdBQUdNLFFBQUgsQ0FBYyxJQUFFTCxNQUFoQixFQUF3QmYsYUFBeEIsQ0FBWjtVQUNJOEIsU0FBSixHQUFnQjNCLFFBQWhCO0tBZEcsRUFBUDs7O0FBZ0JGLFNBQVM2QixhQUFULEdBQXlCO1FBQ2pCdkIsT0FBTyxDQUFiO1FBQWdCQyxPQUFPLEdBQXZCO1FBQTRCQyxPQUFPLEdBQW5DO1NBQ08sRUFBSW1CLFdBQVcxQixXQUFmO1FBQUEsRUFDQ00sSUFERCxFQUNPQyxJQURQOztXQUdFQyxHQUFQLEVBQVk7YUFBVVIsZ0JBQWdCUSxJQUFJa0IsU0FBcEIsR0FBZ0NwQixJQUFoQyxHQUF1QyxLQUE5QztLQUhWOztpQkFBQSxFQUtVdUIsU0FBUyxDQUxuQjtXQU1FckIsR0FBUCxFQUFZRSxFQUFaLEVBQWdCQyxNQUFoQixFQUF3QjtVQUNuQixDQUFFSCxJQUFJZSxLQUFULEVBQWlCO2NBQU8sSUFBSUosS0FBSixDQUFZaEIsbUJBQVosQ0FBTjs7U0FDZlMsUUFBSCxDQUFjLElBQUVELE1BQWhCLEVBQXdCSCxJQUFJZSxLQUE1QixFQUFtQzNCLGFBQW5DO1VBQ0csUUFBUVksSUFBSXNCLEdBQWYsRUFBcUI7O1dBQ2hCVixRQUFILENBQWMsSUFBRVQsTUFBaEIsRUFBd0IsQ0FBeEIsRUFBMkJmLGFBQTNCO09BREYsTUFFS2MsR0FBR1UsUUFBSCxDQUFjLElBQUVULE1BQWhCLEVBQXdCLElBQUVILElBQUlzQixHQUE5QixFQUFtQ2xDLGFBQW5DO1NBQ0Z3QixRQUFILENBQWMsSUFBRVQsTUFBaEIsRUFBd0IsSUFBRUgsSUFBSXVCLFNBQTlCLEVBQXlDbkMsYUFBekM7S0FaRzs7YUFjSVksR0FBVCxFQUFjRSxFQUFkLEVBQWtCQyxNQUFsQixFQUEwQjtVQUNwQk8sS0FBSixHQUFnQlIsR0FBR00sUUFBSCxDQUFjLElBQUVMLE1BQWhCLEVBQXdCZixhQUF4QixDQUFoQjtVQUNJa0MsR0FBSixHQUFnQnBCLEdBQUdjLFFBQUgsQ0FBYyxJQUFFYixNQUFoQixFQUF3QmYsYUFBeEIsQ0FBaEI7VUFDSW1DLFNBQUosR0FBZ0JyQixHQUFHYyxRQUFILENBQWMsSUFBRWIsTUFBaEIsRUFBd0JmLGFBQXhCLENBQWhCO1VBQ0k4QixTQUFKLEdBQWdCMUIsV0FBaEI7S0FsQkcsRUFBUDs7O0FBb0JGLFNBQVNnQyxhQUFULEdBQXlCO1FBQ2pCM0IsT0FBTyxDQUFiO1FBQWdCQyxPQUFPLEdBQXZCO1FBQTRCQyxPQUFPLEdBQW5DO1NBQ08sRUFBSW1CLFdBQVd6QixXQUFmO1FBQUEsRUFDQ0ssSUFERCxFQUNPQyxJQURQOztXQUdFQyxHQUFQLEVBQVk7YUFBVVAsZ0JBQWdCTyxJQUFJa0IsU0FBcEIsR0FBZ0NwQixJQUFoQyxHQUF1QyxLQUE5QztLQUhWOztpQkFBQSxFQUtVdUIsU0FBUyxDQUxuQjtXQU1FckIsR0FBUCxFQUFZRSxFQUFaLEVBQWdCQyxNQUFoQixFQUF3QjtVQUNuQixDQUFFSCxJQUFJZSxLQUFULEVBQWlCO2NBQU8sSUFBSUosS0FBSixDQUFZaEIsbUJBQVosQ0FBTjs7U0FDZlMsUUFBSCxDQUFjLElBQUVELE1BQWhCLEVBQXdCSCxJQUFJZSxLQUE1QixFQUFtQzNCLGFBQW5DO1VBQ0csUUFBUVksSUFBSXNCLEdBQWYsRUFBcUI7V0FDaEJWLFFBQUgsQ0FBYyxJQUFFVCxNQUFoQixFQUF3QixDQUF4QixFQUEyQmYsYUFBM0I7O09BREYsTUFFS2MsR0FBR1UsUUFBSCxDQUFjLElBQUVULE1BQWhCLEVBQXdCLElBQUVILElBQUlzQixHQUE5QixFQUFtQ2xDLGFBQW5DO1NBQ0Z3QixRQUFILENBQWMsSUFBRVQsTUFBaEIsRUFBd0IsSUFBRUgsSUFBSXVCLFNBQTlCLEVBQXlDbkMsYUFBekM7S0FaRzs7YUFjSVksR0FBVCxFQUFjRSxFQUFkLEVBQWtCQyxNQUFsQixFQUEwQjtVQUNwQk8sS0FBSixHQUFnQlIsR0FBR00sUUFBSCxDQUFjLElBQUVMLE1BQWhCLEVBQXdCZixhQUF4QixDQUFoQjtVQUNJa0MsR0FBSixHQUFnQnBCLEdBQUdjLFFBQUgsQ0FBYyxJQUFFYixNQUFoQixFQUF3QmYsYUFBeEIsQ0FBaEI7VUFDSW1DLFNBQUosR0FBZ0JyQixHQUFHYyxRQUFILENBQWMsSUFBRWIsTUFBaEIsRUFBd0JmLGFBQXhCLENBQWhCO1VBQ0k4QixTQUFKLEdBQWdCekIsV0FBaEI7S0FsQkcsRUFBUDs7O0FBcUJGLFNBQVNnQyxhQUFULENBQXVCdEIsTUFBdkIsRUFBK0I7UUFDdkJ1QixhQUFhLEtBQUtMLE9BQUwsR0FBZWxCLE1BQWxDO01BQ0ltQixNQUFNLENBQVY7U0FDTyxTQUFTSyxRQUFULENBQWtCLEVBQUNDLEtBQUQsRUFBUUMsR0FBUixFQUFsQixFQUFnQzNCLEVBQWhDLEVBQW9DO1FBQ3RDLENBQUUyQixHQUFMLEVBQVc7U0FDTmpCLFFBQUgsQ0FBY2MsVUFBZCxFQUEwQkosS0FBMUIsRUFBaUNsQyxhQUFqQztTQUNHd0IsUUFBSCxDQUFjLElBQUVjLFVBQWhCLEVBQTRCLElBQUVFLEtBQTlCLEVBQXFDeEMsYUFBckM7S0FGRixNQUdLO1NBQ0F3QixRQUFILENBQWNjLFVBQWQsRUFBMEIsQ0FBQ0osR0FBM0IsRUFBZ0NsQyxhQUFoQztTQUNHd0IsUUFBSCxDQUFjLElBQUVjLFVBQWhCLEVBQTRCLElBQUVFLEtBQTlCLEVBQXFDeEMsYUFBckM7WUFDTTBDLEdBQU47O0dBUEo7OztBQVdGLGVBQWVDLGlCQUFmO0FBQ0EsU0FBU0EsZUFBVCxHQUEyQjtRQUNuQkMsV0FBV3BDLGFBQWpCO1FBQWdDcUMsV0FBV3hCLGNBQTNDO1FBQ015QixpQkFBaUIsQ0FBSWpCLGNBQUosRUFBb0JFLFlBQXBCLEVBQWtDQyxlQUFsQyxFQUFtREksZUFBbkQsQ0FBdkI7O01BRUcsTUFBTVEsU0FBU25DLElBQWYsSUFBdUIsTUFBTW9DLFNBQVNwQyxJQUF0QyxJQUE4QyxLQUFLcUMsZUFBZUMsTUFBckUsRUFBOEU7VUFDdEUsSUFBSXhCLEtBQUosQ0FBYSxxQkFBYixDQUFOOzs7UUFFSXlCLFNBQVMsRUFBZjtRQUFtQnJDLE9BQUssR0FBeEI7OztVQUdRc0MsU0FBU0wsU0FBU00sTUFBeEI7VUFBZ0NDLFNBQVNOLFNBQVNLLE1BQWxEO1VBQ00sQ0FBQ0UsRUFBRCxFQUFJQyxFQUFKLEVBQU9DLEVBQVAsRUFBVUMsRUFBVixJQUFnQlQsZUFBZVUsR0FBZixDQUFxQkMsS0FBR0EsRUFBRVAsTUFBMUIsQ0FBdEI7O1VBRU1RLFdBQVdWLE9BQU9VLFFBQVAsR0FBa0I5QyxPQUNqQyxJQUFJcUMsT0FBT3JDLEdBQVAsQ0FBSixHQUFrQnVDLE9BQU92QyxHQUFQLENBQWxCLEdBQWdDd0MsR0FBR3hDLEdBQUgsQ0FBaEMsR0FBMEN5QyxHQUFHekMsR0FBSCxDQUExQyxHQUFvRDBDLEdBQUcxQyxHQUFILENBQXBELEdBQThEMkMsR0FBRzNDLEdBQUgsQ0FEaEU7O1dBR08rQyxNQUFQLEdBQWdCLFVBQVUvQyxHQUFWLEVBQWVnRCxHQUFmLEVBQW9CO1VBQy9CLFFBQVFBLEdBQVgsRUFBaUI7Y0FBTyxRQUFRWixNQUFkOzthQUNYWSxJQUFJRixTQUFTOUMsR0FBVCxDQUFKLENBQVA7S0FGRjs7O09BS0UsTUFBTWlELENBQVYsSUFBZWYsY0FBZixFQUFnQztVQUN4QixFQUFDcEMsTUFBS29ELENBQU4sRUFBU3JELElBQVQsRUFBZXFCLFNBQWYsS0FBNEIrQixDQUFsQzs7V0FFT0MsSUFBRSxDQUFULElBQWMsRUFBSUQsQ0FBSixFQUFPL0IsU0FBUCxFQUFrQnBCLE1BQU1vRCxJQUFFLENBQTFCLEVBQTZCbkQsSUFBN0IsRUFBbUNGLE1BQU1BLElBQXpDLEVBQStDc0QsSUFBSSxFQUFuRCxFQUFkO1dBQ09ELElBQUUsQ0FBVCxJQUFjLEVBQUlELENBQUosRUFBTy9CLFNBQVAsRUFBa0JwQixNQUFNb0QsSUFBRSxDQUExQixFQUE2Qm5ELElBQTdCLEVBQW1DRixNQUFNLElBQUlBLElBQTdDLEVBQW1Ec0QsSUFBSSxHQUF2RCxFQUFkO1dBQ09ELElBQUUsQ0FBVCxJQUFjLEVBQUlELENBQUosRUFBTy9CLFNBQVAsRUFBa0JwQixNQUFNb0QsSUFBRSxDQUExQixFQUE2Qm5ELElBQTdCLEVBQW1DRixNQUFNLElBQUlBLElBQTdDLEVBQW1Ec0QsSUFBSSxHQUF2RCxFQUFkO1dBQ09ELElBQUUsQ0FBVCxJQUFjLEVBQUlELENBQUosRUFBTy9CLFNBQVAsRUFBa0JwQixNQUFNb0QsSUFBRSxDQUExQixFQUE2Qm5ELElBQTdCLEVBQW1DRixNQUFNLEtBQUtBLElBQTlDLEVBQW9Ec0QsSUFBSSxJQUF4RCxFQUFkOztTQUVJLE1BQU1DLE1BQVYsSUFBb0IsQ0FBQyxRQUFELEVBQVcsVUFBWCxDQUFwQixFQUE2QztZQUNyQ0MsVUFBVUosRUFBRUcsTUFBRixDQUFoQjtZQUEyQkUsVUFBVXRCLFNBQVNvQixNQUFULENBQXJDO1lBQXVERyxVQUFVdEIsU0FBU21CLE1BQVQsQ0FBakU7O2FBRU9GLElBQUUsQ0FBVCxFQUFZRSxNQUFaLElBQXNCLFVBQVNwRCxHQUFULEVBQWNFLEVBQWQsRUFBa0I7Z0JBQVdGLEdBQVIsRUFBYUUsRUFBYixFQUFpQixDQUFqQjtPQUEzQzthQUNPZ0QsSUFBRSxDQUFULEVBQVlFLE1BQVosSUFBc0IsVUFBU3BELEdBQVQsRUFBY0UsRUFBZCxFQUFrQjtnQkFBV0YsR0FBUixFQUFhRSxFQUFiLEVBQWlCLENBQWpCLEVBQXFCbUQsUUFBUXJELEdBQVIsRUFBYUUsRUFBYixFQUFpQixDQUFqQjtPQUFoRTthQUNPZ0QsSUFBRSxDQUFULEVBQVlFLE1BQVosSUFBc0IsVUFBU3BELEdBQVQsRUFBY0UsRUFBZCxFQUFrQjtnQkFBV0YsR0FBUixFQUFhRSxFQUFiLEVBQWlCLENBQWpCLEVBQXFCbUQsUUFBUXJELEdBQVIsRUFBYUUsRUFBYixFQUFpQixDQUFqQjtPQUFoRTthQUNPZ0QsSUFBRSxDQUFULEVBQVlFLE1BQVosSUFBc0IsVUFBU3BELEdBQVQsRUFBY0UsRUFBZCxFQUFrQjtnQkFBV0YsR0FBUixFQUFhRSxFQUFiLEVBQWlCLENBQWpCLEVBQXFCcUQsUUFBUXZELEdBQVIsRUFBYUUsRUFBYixFQUFpQixDQUFqQixFQUFxQm1ELFFBQVFyRCxHQUFSLEVBQWFFLEVBQWIsRUFBaUIsRUFBakI7T0FBckY7Ozs7T0FFQSxNQUFNc0QsR0FBVixJQUFpQnBCLE1BQWpCLEVBQTBCO2tCQUNSb0IsR0FBaEI7OztTQUVLcEIsTUFBUDs7O0FBR0YsU0FBU3FCLGFBQVQsQ0FBdUJELEdBQXZCLEVBQTRCO1FBQ3BCLEVBQUNQLENBQUQsRUFBSXBELElBQUosRUFBVTZELE1BQVYsRUFBa0JDLFFBQWxCLEtBQThCSCxHQUFwQztNQUNHUCxFQUFFeEIsYUFBTCxFQUFxQjtRQUNmRSxRQUFKLEdBQWVzQixFQUFFeEIsYUFBRixDQUFrQitCLElBQUkzRCxJQUFKLEdBQVdvRCxFQUFFcEQsSUFBL0IsQ0FBZjs7O1NBRUsyRCxJQUFJUCxDQUFYO01BQ0lXLElBQUosR0FBV0EsSUFBWCxDQUFrQkosSUFBSUssTUFBSixHQUFhQSxNQUFiO1FBQ1psQyxXQUFXNkIsSUFBSTdCLFFBQXJCOztXQUVTaUMsSUFBVCxDQUFjRSxRQUFkLEVBQXdCQyxPQUF4QixFQUFpQztRQUM1QixFQUFJLEtBQUtELFFBQUwsSUFBaUJBLFlBQVksR0FBakMsQ0FBSCxFQUEwQztZQUNsQyxJQUFJRSxTQUFKLENBQWlCLGtDQUFqQixDQUFOOzs7WUFFTUMsSUFBUixHQUFlSCxRQUFmO1FBQ0duQyxZQUFZLFFBQVFvQyxRQUFRekMsR0FBL0IsRUFBcUM7Y0FDM0JBLEdBQVIsR0FBYyxJQUFkOzs7VUFFSXBCLEtBQUssSUFBSWdFLFFBQUosQ0FBZSxJQUFJQyxXQUFKLENBQWdCdEUsSUFBaEIsQ0FBZixDQUFYO1dBQ09rRSxPQUFQLEVBQWdCN0QsRUFBaEIsRUFBb0IsQ0FBcEI7WUFDUWtFLE1BQVIsR0FBaUJsRSxHQUFHbUUsTUFBcEI7O1FBRUcsU0FBU04sUUFBUXpDLEdBQXBCLEVBQTBCO3FCQUNQeUMsT0FBakIsRUFBMEI3RCxHQUFHbUUsTUFBSCxDQUFVQyxLQUFWLENBQWdCLENBQWhCLEVBQWtCekUsSUFBbEIsQ0FBMUI7Ozs7V0FFS2dFLE1BQVQsQ0FBZ0JVLEdBQWhCLEVBQXFCO1VBQ2JDLE1BQU1ELElBQUlFLGFBQUosRUFBWjtVQUNNdkUsS0FBSyxJQUFJZ0UsUUFBSixDQUFlLElBQUlRLFVBQUosQ0FBZUYsR0FBZixFQUFvQkgsTUFBbkMsQ0FBWDs7VUFFTU0sT0FBTyxFQUFiO2FBQ1NBLElBQVQsRUFBZXpFLEVBQWYsRUFBbUIsQ0FBbkI7V0FDT3FFLElBQUlJLElBQUosR0FBV0EsSUFBbEI7OztXQUVPQyxjQUFULENBQXdCYixPQUF4QixFQUFpQ2MsU0FBakMsRUFBNEM7VUFDcEMsRUFBQ1osSUFBRCxLQUFTRixPQUFmO1VBQ00sRUFBQzFELFNBQUQsRUFBWUMsU0FBWixFQUF1QndFLEdBQXZCLEVBQTRCL0QsS0FBNUIsS0FBcUNnRCxPQUEzQztZQUNRZ0IsSUFBUixHQUFlQSxJQUFmOzthQUVTQSxJQUFULENBQWNDLE9BQWQsRUFBdUI7VUFDbEIsUUFBUUEsT0FBWCxFQUFxQjtrQkFBVyxFQUFWOztZQUNoQlosU0FBU1MsVUFBVVAsS0FBVixFQUFmO2VBQ1dVLE9BQVgsRUFBb0IsSUFBSWQsUUFBSixDQUFlRSxNQUFmLENBQXBCO2FBQ08sRUFBSWEsTUFBTSxDQUFDLENBQUVELFFBQVFuRCxHQUFyQixFQUEwQnFELE9BQU87U0FBakMsRUFDTDdFLFNBREssRUFDTUMsU0FETixFQUNpQjJELElBRGpCLEVBQ3VCYSxHQUR2QixFQUM0Qi9ELEtBRDVCLEVBQ21DcUQsTUFEbkMsRUFBUDs7Ozs7QUNoT04sbUJBQWUsVUFBU2UsWUFBVCxFQUF1QkgsT0FBdkIsRUFBZ0NJLGFBQWhDLEVBQStDO1FBQ3RELEVBQUNDLGFBQUQsRUFBZ0JDLGFBQWhCLEVBQStCQyxTQUEvQixFQUEwQ0MsV0FBMUMsS0FBeURMLFlBQS9EO2tCQUNnQk0sT0FBT0wsaUJBQWlCLElBQXhCLENBQWhCO01BQ0csT0FBT0EsYUFBUCxJQUF3QixRQUFRQSxhQUFuQyxFQUFtRDtVQUMzQyxJQUFJekUsS0FBSixDQUFhLDBCQUF5QnlFLGFBQWMsRUFBcEQsQ0FBTjs7O1FBRUksRUFBQ00sU0FBRCxFQUFZQyxZQUFaLEVBQTBCQyxhQUExQixLQUEyQ1osT0FBakQ7U0FDUyxFQUFDRyxZQUFELEVBQWVPLFNBQWYsRUFBMEJHLFVBQTFCLEVBQXNDQyxjQUF0QzttQkFBQSxFQUNVQyxZQURWLEVBQ3dCQyxlQUR4QjtrQkFBQSxFQUFUOztXQUtTSCxVQUFULENBQW9CSSxJQUFwQixFQUEwQjtXQUNqQkMsS0FBS0MsS0FBTCxDQUFhRixJQUFiLEVBQW1CTixZQUFuQixDQUFQOztXQUNPRyxjQUFULENBQXdCOUYsR0FBeEIsRUFBNkI7V0FDcEJrRyxLQUFLRSxTQUFMLENBQWlCcEcsR0FBakIsRUFBc0I0RixhQUF0QixDQUFQOzs7V0FHT1MsZUFBVCxDQUF5QjlCLEdBQXpCLEVBQThCK0IsSUFBOUIsRUFBb0M7UUFDOUJDLFFBQVEsRUFBWjtRQUFnQjFFLE1BQU0sS0FBdEI7V0FDTyxFQUFJMkUsSUFBSixFQUFVN0IsTUFBTUosSUFBSUksSUFBcEIsRUFBUDs7YUFFUzZCLElBQVQsQ0FBY2pDLEdBQWQsRUFBbUI7VUFDYmpELE1BQU1pRCxJQUFJSSxJQUFKLENBQVNyRCxHQUFuQjtVQUNHQSxNQUFNLENBQVQsRUFBYTtjQUFPLElBQU4sQ0FBWUEsTUFBTSxDQUFDQSxHQUFQOztZQUNwQkEsTUFBSSxDQUFWLElBQWVpRCxJQUFJa0MsV0FBSixFQUFmOztVQUVHLENBQUU1RSxHQUFMLEVBQVc7OztVQUNSMEUsTUFBTUcsUUFBTixDQUFpQm5HLFNBQWpCLENBQUgsRUFBZ0M7Ozs7WUFFMUJvRyxNQUFNdEIsY0FBY2tCLEtBQWQsQ0FBWjtjQUNRLElBQVI7YUFDT0ksR0FBUDs7OztXQUVLWixZQUFULENBQXNCeEIsR0FBdEIsRUFBMkIrQixJQUEzQixFQUFpQztRQUMzQnZCLE9BQUssQ0FBVDtRQUFZbEQsTUFBTSxLQUFsQjtRQUF5QitFLE9BQXpCO1VBQ01DLFFBQVEsRUFBSUwsTUFBTU0sU0FBVixFQUFxQm5DLE1BQU1KLElBQUlJLElBQS9CLEVBQWQ7V0FDT2tDLEtBQVA7O2FBRVNFLFFBQVQsQ0FBa0JDLEdBQWxCLEVBQXVCekMsR0FBdkIsRUFBNEI7VUFDdkJoRSxjQUFjcUcsUUFBUUcsUUFBekIsRUFBb0M7ZUFDM0IsS0FBS0UsUUFBUUMsSUFBUixDQUNULDJCQURTLEVBQ21CRixHQURuQixDQUFaOzthQUVLSixRQUFRRyxRQUFSLENBQW1CQyxHQUFuQixFQUF3QnpDLEdBQXhCLENBQVA7OzthQUVPdUMsU0FBVCxDQUFtQnZDLEdBQW5CLEVBQXdCNEMsVUFBeEIsRUFBb0M7WUFDNUJYLElBQU4sR0FBYVksV0FBYjs7WUFFTUMsTUFBTXhCLFdBQWF0QixJQUFJK0MsU0FBSixFQUFiLENBQVo7Z0JBQ1VoQixLQUFLaUIsVUFBTCxDQUFnQkYsR0FBaEIsRUFBcUI5QyxJQUFJSSxJQUF6QixDQUFWO1VBQ0csUUFBUWlDLE9BQVgsRUFBcUI7Ozs7VUFFakI7WUFDQyxDQUFFWSxTQUFTakQsR0FBVCxDQUFMLEVBQXFCOzs7Y0FDZmlDLElBQU4sR0FBYWlCLFNBQWI7T0FGRixDQUdBLE9BQU1ULEdBQU4sRUFBWTtlQUNIRCxTQUFXQyxHQUFYLEVBQWdCekMsR0FBaEIsQ0FBUDs7O1VBRUMsZUFBZSxPQUFPcUMsUUFBUWMsT0FBakMsRUFBMkM7ZUFDbENkLFFBQVFjLE9BQVIsQ0FBZ0JMLEdBQWhCLEVBQXFCOUMsR0FBckIsQ0FBUDtPQURGLE1BRUssT0FBTytCLEtBQUtxQixPQUFMLENBQWVOLEdBQWYsRUFBb0I5QyxJQUFJSSxJQUF4QixDQUFQOzs7YUFFRThDLFNBQVQsQ0FBbUJsRCxHQUFuQixFQUF3QjRDLFVBQXhCLEVBQW9DO1VBQzlCUyxJQUFKO1VBQ0k7WUFDQyxDQUFFSixTQUFTakQsR0FBVCxDQUFMLEVBQXFCOzs7ZUFDZDRDLFdBQVc1QyxHQUFYLENBQVA7T0FGRixDQUdBLE9BQU15QyxHQUFOLEVBQVk7ZUFDSEQsU0FBV0MsR0FBWCxFQUFnQnpDLEdBQWhCLENBQVA7O2FBQ0txQyxRQUFRaUIsT0FBUixDQUFrQkQsSUFBbEIsRUFBd0JyRCxHQUF4QixDQUFQOzs7YUFFTzZDLFdBQVQsR0FBdUI7O2FBRWRJLFFBQVQsQ0FBa0JqRCxHQUFsQixFQUF1QjtVQUNqQmpELE1BQU1pRCxJQUFJSSxJQUFKLENBQVNyRCxHQUFuQjtVQUNHQSxNQUFNLENBQVQsRUFBYTtRQUFhQSxNQUFNLENBQUNBLEdBQVA7O1VBQ3ZCeUQsU0FBU3pELEdBQVosRUFBa0I7ZUFBUSxFQUFFeUQsSUFBVDs7WUFDYnlCLElBQU4sR0FBYVksV0FBYjthQUNPLFNBQVA7WUFDTSxJQUFJekcsS0FBSixDQUFhLHdCQUFiLENBQU47Ozs7WUFFT3FGLGVBQVgsQ0FBMkJ4QixHQUEzQixFQUFnQ3NELFFBQWhDLEVBQTBDakcsR0FBMUMsRUFBK0M7UUFDMUMsUUFBUTJDLEdBQVgsRUFBaUI7WUFDVHhFLE1BQU04SCxTQUFTLEVBQUNqRyxHQUFELEVBQVQsQ0FBWjtZQUNNN0IsR0FBTjs7OztRQUdFK0gsSUFBSSxDQUFSO1FBQVdDLFlBQVl4RCxJQUFJeUQsVUFBSixHQUFpQjdDLGFBQXhDO1dBQ00yQyxJQUFJQyxTQUFWLEVBQXNCO1lBQ2RFLEtBQUtILENBQVg7V0FDSzNDLGFBQUw7O1lBRU1wRixNQUFNOEgsVUFBWjtVQUNJSyxJQUFKLEdBQVczRCxJQUFJRixLQUFKLENBQVU0RCxFQUFWLEVBQWNILENBQWQsQ0FBWDtZQUNNL0gsR0FBTjs7OztZQUdNQSxNQUFNOEgsU0FBUyxFQUFDakcsR0FBRCxFQUFULENBQVo7VUFDSXNHLElBQUosR0FBVzNELElBQUlGLEtBQUosQ0FBVXlELENBQVYsQ0FBWDtZQUNNL0gsR0FBTjs7OztXQUlLb0ksa0JBQVQsQ0FBNEJDLE9BQTVCLEVBQXFDQyxRQUFyQyxFQUErQ0MsVUFBL0MsRUFBMkQ7VUFDbkRDLFdBQVcsRUFBakI7YUFDU3pGLE1BQVQsR0FBa0IwRixTQUFTMUYsTUFBM0I7O1NBRUksTUFBTTJGLEtBQVYsSUFBbUJELFFBQW5CLEVBQThCO1lBQ3RCRSxPQUFPRCxRQUFRSCxXQUFXRyxNQUFNeEgsU0FBakIsQ0FBUixHQUFzQyxJQUFuRDtVQUNHLENBQUV5SCxJQUFMLEVBQVk7Ozs7WUFFTixFQUFDN0ksSUFBRCxFQUFPOEQsSUFBUCxFQUFhQyxNQUFiLEtBQXVCNkUsS0FBN0I7WUFDTTVFLFdBQVd3RSxXQUFXeEksSUFBNUI7WUFDTSxFQUFDOEksTUFBRCxLQUFXRCxJQUFqQjs7ZUFFU0UsUUFBVCxDQUFrQjdJLEdBQWxCLEVBQXVCO2FBQ2hCOEQsUUFBTCxFQUFlOUQsR0FBZjtlQUNPQSxHQUFQOzs7ZUFFTzhJLFFBQVQsQ0FBa0J2RSxHQUFsQixFQUF1QitCLElBQXZCLEVBQTZCO2VBQ3BCL0IsR0FBUDtlQUNPcUUsT0FBT3JFLEdBQVAsRUFBWStCLElBQVosQ0FBUDs7O2VBRU94QyxRQUFULEdBQW9CZ0YsU0FBU2hGLFFBQVQsR0FBb0JBLFFBQXhDO2VBQ1NoRSxJQUFULElBQWlCK0ksUUFBakI7Y0FDUS9FLFFBQVIsSUFBb0JnRixRQUFwQjs7Ozs7V0FPS04sUUFBUDs7O1dBR09PLGNBQVQsQ0FBd0JWLE9BQXhCLEVBQWlDQyxRQUFqQyxFQUEyQ0MsVUFBM0MsRUFBdUQ7VUFDL0NTLFdBQVdULFdBQVdTLFFBQTVCO1VBRU1SLFdBQVdKLG1CQUFtQkMsT0FBbkIsRUFBNEJDLFFBQTVCLEVBQXNDQyxVQUF0QyxDQUFqQjtVQUNNVSxTQUFTLENBQUVWLFdBQVdXLFNBQWIsR0FBeUIsSUFBekIsR0FDYixhQUFhWCxXQUFXVyxTQUFYLENBQXFCQyxJQUFsQyxHQUNJQyxZQUFjQyxhQUFkLENBREosR0FFSUQsWUFBY0UsV0FBZCxDQUhOOztXQUtPLEVBQUlDLElBQUosRUFBVU4sTUFBVixFQUFQOzthQUVTTSxJQUFULENBQWNDLElBQWQsRUFBb0J4SixHQUFwQixFQUF5Qm1JLElBQXpCLEVBQStCO2FBQ3RCYSxTQUFTYixJQUFULENBQVA7VUFDRy9DLGdCQUFnQitDLEtBQUtGLFVBQXhCLEVBQXFDO1lBQ2hDLENBQUVqSSxJQUFJZSxLQUFULEVBQWlCO2NBQUtBLEtBQUosR0FBWTJFLFdBQVo7O2NBQ1orRCxRQUFRSCxZQUFZLFdBQVosRUFBeUJFLElBQXpCLEVBQStCeEosR0FBL0IsQ0FBZDtlQUNPLEVBQUkwSixNQUFNRCxNQUFRLElBQVIsRUFBY3RCLElBQWQsQ0FBVixFQUFQOzs7VUFFRWpILFNBQUosR0FBZ0IsUUFBaEI7VUFDSWlILElBQUosR0FBV0EsSUFBWDtZQUNNVSxXQUFXTCxTQUFTekYsTUFBVCxDQUFnQi9DLEdBQWhCLENBQWpCO1lBQ011RSxNQUFNZSxjQUFnQnVELFNBQVM3SSxHQUFULENBQWhCLENBQVo7YUFDTyxFQUFJMEosTUFBTUYsS0FBT2pGLEdBQVAsQ0FBVixFQUFQOzs7YUFFTytFLFdBQVQsQ0FBcUJwSSxTQUFyQixFQUFnQ3NJLElBQWhDLEVBQXNDeEosR0FBdEMsRUFBMkNxSCxHQUEzQyxFQUFnRDtVQUMxQ25HLFNBQUosR0FBZ0JBLFNBQWhCO1lBQ00ySCxXQUFXTCxTQUFTekYsTUFBVCxDQUFnQi9DLEdBQWhCLENBQWpCO1VBQ0ksRUFBQytFLElBQUQsS0FBUzhELFNBQVM3SSxHQUFULENBQWI7VUFDRyxTQUFTcUgsR0FBWixFQUFrQjtZQUNaYyxJQUFKLEdBQVdkLEdBQVg7Y0FDTTlDLE1BQU1lLGNBQWdCdEYsR0FBaEIsQ0FBWjthQUNPdUUsR0FBUDs7O2FBRUssZ0JBQWdCMUMsR0FBaEIsRUFBcUJzRyxJQUFyQixFQUEyQjtZQUM3QixTQUFTcEQsSUFBWixFQUFtQjtnQkFDWCxJQUFJcEUsS0FBSixDQUFZLGlCQUFaLENBQU47O1lBQ0VnRyxHQUFKO2FBQ0ksTUFBTTNHLEdBQVYsSUFBaUJnRyxnQkFBa0JtQyxJQUFsQixFQUF3QnBELElBQXhCLEVBQThCbEQsR0FBOUIsQ0FBakIsRUFBcUQ7Z0JBQzdDMEMsTUFBTWUsY0FBZ0J0RixHQUFoQixDQUFaO2dCQUNNLE1BQU13SixLQUFPakYsR0FBUCxDQUFaOztZQUNDMUMsR0FBSCxFQUFTO2lCQUFRLElBQVA7O2VBQ0g4RSxHQUFQO09BUkY7OzthQVVPMEMsYUFBVCxDQUF1Qm5JLFNBQXZCLEVBQWtDc0ksSUFBbEMsRUFBd0N4SixHQUF4QyxFQUE2Q3FILEdBQTdDLEVBQWtEO1VBQzVDbkcsU0FBSixHQUFnQkEsU0FBaEI7WUFDTTJILFdBQVdMLFNBQVN6RixNQUFULENBQWdCL0MsR0FBaEIsQ0FBakI7VUFDSSxFQUFDK0UsSUFBRCxLQUFTOEQsU0FBUzdJLEdBQVQsQ0FBYjtVQUNHLFNBQVNxSCxHQUFaLEVBQWtCO1lBQ1pjLElBQUosR0FBV2QsR0FBWDtjQUNNOUMsTUFBTWUsY0FBZ0J0RixHQUFoQixDQUFaO2FBQ091RSxHQUFQOzs7YUFFSyxVQUFVMUMsR0FBVixFQUFlc0csSUFBZixFQUFxQjtZQUN2QixTQUFTcEQsSUFBWixFQUFtQjtnQkFDWCxJQUFJcEUsS0FBSixDQUFZLGlCQUFaLENBQU47O2NBQ0lYLE1BQU0rRSxLQUFLLEVBQUNsRCxHQUFELEVBQUwsQ0FBWjtZQUNJc0csSUFBSixHQUFXQSxJQUFYO2NBQ001RCxNQUFNZSxjQUFnQnRGLEdBQWhCLENBQVo7WUFDRzZCLEdBQUgsRUFBUztpQkFBUSxJQUFQOztlQUNIMkgsS0FBT2pGLEdBQVAsQ0FBUDtPQVBGOzs7YUFTTzZFLFdBQVQsQ0FBcUJPLFNBQXJCLEVBQWdDO2FBQ3ZCLFNBQVNWLE1BQVQsQ0FBaUJPLElBQWpCLEVBQXVCeEosR0FBdkIsRUFBNEJxSCxHQUE1QixFQUFpQztZQUNuQyxDQUFFckgsSUFBSWUsS0FBVCxFQUFpQjtjQUFLQSxLQUFKLEdBQVkyRSxXQUFaOztZQUNmLGFBQWEsT0FBTzJCLEdBQXZCLEVBQTZCO2dCQUNyQixJQUFJckQsU0FBSixDQUFpQiw2REFBakIsQ0FBTjs7Y0FDSThCLGVBQWV1QixHQUFmLENBQU47Y0FDTW9DLFFBQVFFLFVBQVUsV0FBVixFQUF1QkgsSUFBdkIsRUFBNkJ4SixHQUE3QixFQUFrQ3FILEdBQWxDLENBQWQ7Y0FDTXVDLEtBQU4sR0FBY0EsS0FBZCxDQUFxQkEsTUFBTUMsR0FBTixHQUFZQSxHQUFaO2VBQ2RELEtBQVA7O2lCQUVTQSxLQUFULENBQWVFLEtBQWYsRUFBc0I7aUJBQ2JBLFNBQVMsSUFBVCxHQUNITCxNQUFRLEtBQVIsRUFBZVQsU0FBV2MsS0FBWCxDQUFmLENBREcsR0FFSEwsTUFBUSxJQUFSLENBRko7OztpQkFJT0ksR0FBVCxDQUFhQyxLQUFiLEVBQW9CO2lCQUNYQSxTQUFTLElBQVQsR0FDSEwsTUFBUSxJQUFSLEVBQWNULFNBQVdjLEtBQVgsQ0FBZCxDQURHLEdBRUhMLE1BQVEsSUFBUixDQUZKOztPQWZKOzs7OztBQ3ZNUyxTQUFTTSxhQUFULENBQXVCQyxNQUF2QixFQUErQjtRQUN0QyxFQUFDM0QsZUFBRCxFQUFrQk4sWUFBbEIsRUFBZ0NGLFVBQWhDLEVBQTRDQyxjQUE1QyxLQUE4RGtFLE1BQXBFO1FBQ00sRUFBQ3pFLFNBQUQsRUFBWUMsV0FBWixLQUEyQndFLE9BQU83RSxZQUF4Qzs7U0FFTztZQUFBO2VBRU0yRSxLQUFYLEVBQWtCMUUsYUFBbEIsRUFBaUM7YUFDeEIsQ0FBSTRELFNBQVNjLEtBQVQsQ0FBSixDQUFQO0tBSEc7O1FBS0RHLFFBQUosR0FBZTthQUFVLEtBQUtDLE1BQVo7S0FMYjtZQU1HO2FBQ0MzRixHQUFQLEVBQVkrQixJQUFaLEVBQWtCO2NBQ1ZlLE1BQU14QixXQUFhdEIsSUFBSStDLFNBQUosTUFBbUIvRyxTQUFoQyxDQUFaO2VBQ08rRixLQUFLcUIsT0FBTCxDQUFlTixHQUFmLEVBQW9COUMsSUFBSUksSUFBeEIsQ0FBUDtPQUhJLEVBTkg7O2VBV007YUFDRkosR0FBUCxFQUFZK0IsSUFBWixFQUFrQjtjQUNWTyxRQUFRUCxLQUFLNkQsUUFBTCxDQUFnQjVGLEdBQWhCLEVBQXFCOEIsZUFBckIsQ0FBZDtjQUNNK0QsV0FBV3ZELE1BQU1MLElBQU4sQ0FBV2pDLEdBQVgsQ0FBakI7WUFDR2hFLGNBQWM2SixRQUFqQixFQUE0QjtnQkFDcEIvQyxNQUFNeEIsV0FBYUwsWUFBWTRFLFFBQVosS0FBeUI3SixTQUF0QyxDQUFaO2lCQUNPK0YsS0FBS3FCLE9BQUwsQ0FBZU4sR0FBZixFQUFvQlIsTUFBTWxDLElBQTFCLENBQVA7O09BTkssRUFYTjs7ZUFtQk07WUFDSCxRQURHO2FBRUZKLEdBQVAsRUFBWStCLElBQVosRUFBa0I7Y0FDVk8sUUFBUVAsS0FBSzZELFFBQUwsQ0FBZ0I1RixHQUFoQixFQUFxQndCLFlBQXJCLENBQWQ7ZUFDT2MsTUFBTUwsSUFBTixDQUFXakMsR0FBWCxFQUFnQjhGLGFBQWhCLENBQVA7T0FKTyxFQW5CTixFQUFQOztXQXlCU3JCLFFBQVQsQ0FBa0JiLElBQWxCLEVBQXdCO1dBQ2Y1QyxVQUFZTyxlQUFlcUMsSUFBZixDQUFaLENBQVA7OztXQUVPa0MsYUFBVCxDQUF1QjlGLEdBQXZCLEVBQTRCO1dBQ25CQSxJQUFJK0MsU0FBSixHQUFnQmdELEtBQWhCLENBQXNCLFVBQXRCLEVBQ0pDLE1BREksQ0FDS0MsS0FBR0EsQ0FEUixFQUVKNUgsR0FGSSxDQUVFaUQsVUFGRixDQUFQOzs7O0FDakNXLFNBQVM0RSxlQUFULENBQXlCVCxNQUF6QixFQUFpQztRQUN4QyxFQUFDM0QsZUFBRCxFQUFrQk4sWUFBbEIsS0FBa0NpRSxNQUF4QztRQUVNLEVBQUNVLFFBQUQsS0FBYVYsT0FBTzdFLFlBQTFCO1NBQ087Y0FDS3VGLFFBREw7ZUFFTVosS0FBWCxFQUFrQjFFLGFBQWxCLEVBQWlDO2FBQ3hCLENBQUlzRixTQUFTWixLQUFULENBQUosQ0FBUDtLQUhHOztRQUtERyxRQUFKLEdBQWU7YUFBVSxLQUFLQyxNQUFaO0tBTGI7WUFNRzthQUNDM0YsR0FBUCxFQUFZK0IsSUFBWixFQUFrQjtjQUNWZSxNQUFNOUMsSUFBSWtDLFdBQUosRUFBWjtlQUNPSCxLQUFLcUIsT0FBTCxDQUFlTixHQUFmLEVBQW9COUMsSUFBSUksSUFBeEIsQ0FBUDtPQUhJLEVBTkg7O2VBV007YUFDRkosR0FBUCxFQUFZK0IsSUFBWixFQUFrQjtjQUNWTyxRQUFRUCxLQUFLNkQsUUFBTCxDQUFnQjVGLEdBQWhCLEVBQXFCOEIsZUFBckIsQ0FBZDtjQUNNZ0IsTUFBTVIsTUFBTUwsSUFBTixDQUFXakMsR0FBWCxDQUFaO1lBQ0doRSxjQUFjOEcsR0FBakIsRUFBdUI7aUJBQ2RmLEtBQUtxQixPQUFMLENBQWVOLEdBQWYsRUFBb0JSLE1BQU1sQyxJQUExQixDQUFQOztPQUxLLEVBWE47O2VBa0JNO1lBQ0gsT0FERzthQUVGSixHQUFQLEVBQVkrQixJQUFaLEVBQWtCO2NBQ1ZPLFFBQVFQLEtBQUs2RCxRQUFMLENBQWdCNUYsR0FBaEIsRUFBcUJ3QixZQUFyQixDQUFkO2NBQ01zQixNQUFNUixNQUFNTCxJQUFOLENBQVdqQyxHQUFYLEVBQWdCb0csVUFBaEIsQ0FBWjtZQUNHcEssY0FBYzhHLEdBQWpCLEVBQXVCO2lCQUNkZixLQUFLcUIsT0FBTCxDQUFlTixHQUFmLEVBQW9CUixNQUFNbEMsSUFBMUIsQ0FBUDs7T0FOSyxFQWxCTixFQUFQOzs7QUEwQkYsU0FBU2dHLFVBQVQsQ0FBb0JwRyxHQUFwQixFQUF5QjtTQUFVQSxJQUFJa0MsV0FBSixFQUFQOzs7QUM1QmIsU0FBU21FLGdCQUFULENBQTBCdkMsT0FBMUIsRUFBbUN3QyxJQUFuQyxFQUF5Q2IsTUFBekMsRUFBaUQ7UUFDeEQsRUFBQ3RFLFNBQUQsS0FBY3NFLE1BQXBCO1FBQ00sRUFBQzFFLGFBQUQsS0FBa0IwRSxPQUFPN0UsWUFBL0I7O1FBRU0yRixhQUFhckMsU0FBUzFGLE1BQVQsQ0FBa0IsRUFBQzlDLFNBQVMsSUFBVixFQUFnQmMsT0FBTyxJQUF2QixFQUE2QkcsV0FBVyxRQUF4QyxFQUFsQixDQUFuQjtRQUNNNkosYUFBYXRDLFNBQVMxRixNQUFULENBQWtCLEVBQUM5QyxTQUFTLElBQVYsRUFBZ0JTLE9BQU8sSUFBdkIsRUFBNkJRLFdBQVcsVUFBeEMsRUFBbEIsQ0FBbkI7O1FBRU04SixZQUFZSCxPQUFLLEdBQXZCO1VBQ1FHLFNBQVIsSUFBcUJDLFNBQXJCO1FBQ01DLFlBQVlMLE9BQUssR0FBdkI7VUFDUUEsT0FBSyxHQUFiLElBQW9CTSxTQUFwQjs7U0FFTyxFQUFJNUIsTUFBSzZCLElBQVQsRUFBZUEsSUFBZixFQUFQOztXQUVTQSxJQUFULENBQWM1QixJQUFkLEVBQW9CeEosR0FBcEIsRUFBeUI7UUFDcEIsQ0FBRUEsSUFBSWUsS0FBVCxFQUFpQjtVQUNYQSxLQUFKLEdBQVkyRSxXQUFaOztRQUNFeUMsSUFBSixHQUFXakMsS0FBS0UsU0FBTCxDQUFpQjtVQUN0QixNQURzQixFQUNkaUYsS0FBSyxJQUFJQyxJQUFKLEVBRFMsRUFBakIsQ0FBWDtlQUVXMUgsSUFBWCxDQUFnQnNILFNBQWhCLEVBQTJCbEwsR0FBM0I7VUFDTXVFLE1BQU1lLGNBQWdCdEYsR0FBaEIsQ0FBWjtXQUNPd0osS0FBT2pGLEdBQVAsQ0FBUDs7O1dBRU80RyxTQUFULENBQW1CNUcsR0FBbkIsRUFBd0IrQixJQUF4QixFQUE4QmlGLE1BQTlCLEVBQXNDO2VBQ3pCMUgsTUFBWCxDQUFrQlUsR0FBbEI7UUFDSTRELElBQUosR0FBVzVELElBQUlpSCxTQUFKLEVBQVg7ZUFDYWpILElBQUk0RCxJQUFqQixFQUF1QjVELEdBQXZCLEVBQTRCK0IsSUFBNUIsRUFBa0NpRixNQUFsQztXQUNPakYsS0FBS21GLFFBQUwsQ0FBY2xILElBQUk0RCxJQUFsQixFQUF3QjVELElBQUlJLElBQTVCLENBQVA7OztXQUVPK0csVUFBVCxDQUFvQixFQUFDTCxHQUFELEVBQXBCLEVBQTJCTSxRQUEzQixFQUFxQ3JGLElBQXJDLEVBQTJDaUYsTUFBM0MsRUFBbUQ7VUFDM0MsRUFBQzdLLEtBQUQsRUFBUVQsU0FBUTJMLElBQWhCLEtBQXdCRCxTQUFTaEgsSUFBdkM7VUFDTSxFQUFDdEUsU0FBRCxFQUFZQyxTQUFaLEtBQXlCc0wsSUFBL0I7VUFDTTVMLE1BQU0sRUFBSUssU0FBSixFQUFlQyxTQUFmO2VBQ0RnRyxLQUFLckcsT0FESixFQUNhUyxLQURiO1lBRUp3RixLQUFLRSxTQUFMLENBQWlCO1lBQ2pCLE1BRGlCLEVBQ1RpRixHQURTLEVBQ0pRLEtBQUssSUFBSVAsSUFBSixFQURELEVBQWpCLENBRkksRUFBWjs7ZUFLVzFILElBQVgsQ0FBZ0JvSCxTQUFoQixFQUEyQmhMLEdBQTNCO1VBQ011RSxNQUFNZSxjQUFnQnRGLEdBQWhCLENBQVo7V0FDT3VMLE9BQU9PLFFBQVAsQ0FBa0IsQ0FBQ3ZILEdBQUQsQ0FBbEIsQ0FBUDs7O1dBRU8wRyxTQUFULENBQW1CMUcsR0FBbkIsRUFBd0IrQixJQUF4QixFQUE4QjtlQUNqQnpDLE1BQVgsQ0FBa0JVLEdBQWxCO1FBQ0k0RCxJQUFKLEdBQVc1RCxJQUFJaUgsU0FBSixFQUFYO1dBQ09sRixLQUFLbUYsUUFBTCxDQUFjbEgsSUFBSTRELElBQWxCLEVBQXdCNUQsSUFBSUksSUFBNUIsQ0FBUDs7OztBQ3RDVyxTQUFTb0gsYUFBVCxDQUF1QjVHLFlBQXZCLEVBQXFDSCxPQUFyQyxFQUE4QztRQUNyRGdGLFNBQVNnQyxhQUFlN0csWUFBZixFQUE2QkgsT0FBN0IsQ0FBZjs7UUFFTXFELFVBQVUsRUFBaEI7UUFDTTRELE9BQU9qQyxPQUFPakIsY0FBUCxDQUF3QlYsT0FBeEIsRUFDWCxJQURXO0lBRVg2RCxjQUFXbEMsTUFBWCxDQUZXLENBQWI7O1FBSU1tQyxTQUFTbkMsT0FBT2pCLGNBQVAsQ0FBd0JWLE9BQXhCLEVBQ2IsSUFEYTtJQUViK0QsZ0JBQWFwQyxNQUFiLENBRmEsQ0FBZjs7UUFJTXFDLFVBQVVDLGlCQUFnQmpFLE9BQWhCLEVBQ2QsSUFEYztJQUVkMkIsTUFGYyxDQUFoQjs7UUFJTXVDLFNBQVcsRUFBQ04sSUFBRCxFQUFPRSxNQUFQLEVBQWVFLE9BQWYsRUFBd0JHLFNBQVNQLElBQWpDLEVBQWpCOztRQUVNLEVBQUN2RyxTQUFELEtBQWNzRSxNQUFwQjtTQUNTLEVBQUMzQixPQUFELEVBQVVrRSxNQUFWLEVBQWtCN0csU0FBbEIsRUFBVDs7O0FDM0JhLE1BQU0rRyxRQUFOLENBQWU7U0FDckJDLFlBQVAsQ0FBb0IsRUFBcEIsRUFBd0I7VUFDaEJELFFBQU4sU0FBdUIsSUFBdkIsQ0FBNEI7V0FDckJBLFFBQVA7OztZQUVRO1dBQVUsS0FBS3hNLE9BQVo7O1lBQ0g7V0FBVyxhQUFZLEtBQUtBLE9BQUwsQ0FBYUssU0FBVSxHQUEzQzs7O2NBRURxTSxPQUFaLEVBQXFCO2NBQ1RBLFFBQVFDLFlBQVIsQ0FBcUIsSUFBckIsQ0FBVjs7V0FFT0MsZ0JBQVAsQ0FBMEIsSUFBMUIsRUFBa0M7aUJBQ3JCLEVBQUkzSCxPQUFPLEtBQUs0SCxjQUFMLEVBQVgsRUFEcUI7bUJBRW5CLEVBQUk1SCxPQUFPLEtBQUs2SCxnQkFBTCxFQUFYLEVBRm1CO2VBR3ZCLEVBQUk3SCxPQUFPeUgsUUFBUTFNLE9BQW5CLEVBQTRCK00sWUFBWSxJQUF4QyxFQUh1QjtVQUk1QixFQUFJOUgsT0FBT3lILFFBQVFNLEVBQW5CLEVBSjRCLEVBQWxDOzs7Y0FNVTtXQUFVLElBQUlDLEdBQUosRUFBUDs7bUJBQ0U7V0FBVSxLQUFLQyxTQUFMLEVBQVA7O21CQUNIO1dBQVUsS0FBS0EsU0FBTCxFQUFQOztxQkFDRDtXQUFVLEtBQUtBLFNBQUwsRUFBUDs7O1dBRWI3RyxJQUFULEVBQWU7VUFDUDhHLFdBQVcsS0FBS0MsU0FBdEI7VUFDTUMsYUFBYSxLQUFLQyxXQUF4QjtVQUNNQyxVQUFVLENBQUN2TixPQUFELEVBQVV1TixPQUFWLEtBQXNCO1lBQzlCQyxLQUFLbkMsS0FBS29DLEdBQUwsRUFBWDtVQUNHek4sT0FBSCxFQUFhO2NBQ0wwTixJQUFJTCxXQUFXTSxHQUFYLENBQWUzTixRQUFRSyxTQUF2QixDQUFWO1lBQ0dDLGNBQWNvTixDQUFqQixFQUFxQjtZQUNqQkYsRUFBRixHQUFPRSxFQUFHLE1BQUtILE9BQVEsRUFBaEIsSUFBcUJDLEVBQTVCOzs7V0FDQ0ksV0FBTCxDQUFpQjVOLE9BQWpCLEVBQTBCdU4sT0FBMUIsRUFBbUNDLEVBQW5DO0tBTkY7O1dBUU87ZUFDSSxLQUFLeE4sT0FEVDtnQkFFSyxLQUFLNk4sY0FBTCxFQUZMOztnQkFJSyxDQUFDekcsR0FBRCxFQUFNMUMsSUFBTixLQUFlO2dCQUNmQSxLQUFLMUUsT0FBYixFQUFzQixNQUF0QjtjQUNNOE4sT0FBTyxLQUFLdEMsUUFBTCxDQUFjcEUsR0FBZCxFQUFtQjFDLElBQW5CLENBQWI7O2NBRU1xSixRQUFRWixTQUFTUSxHQUFULENBQWFqSixLQUFLNUQsS0FBbEIsQ0FBZDtZQUNHUixjQUFjeU4sS0FBakIsRUFBeUI7a0JBQ2ZDLE9BQVIsQ0FBZ0IsRUFBQ0YsSUFBRCxFQUFPMUcsR0FBUCxFQUFZMUMsSUFBWixFQUFoQixFQUFtQ3VKLElBQW5DLENBQXdDRixLQUF4QztTQURGLE1BRUssT0FBT0QsSUFBUDtPQVhGOztlQWFJLENBQUMxRyxHQUFELEVBQU0xQyxJQUFOLEtBQWU7Z0JBQ2RBLEtBQUsxRSxPQUFiLEVBQXNCLEtBQXRCO2NBQ004TixPQUFPLEtBQUtwRyxPQUFMLENBQWFOLEdBQWIsRUFBa0IxQyxJQUFsQixDQUFiOztjQUVNcUosUUFBUVosU0FBU1EsR0FBVCxDQUFhakosS0FBSzVELEtBQWxCLENBQWQ7WUFDR1IsY0FBY3lOLEtBQWpCLEVBQXlCO2tCQUNmQyxPQUFSLENBQWdCRixJQUFoQixFQUFzQkcsSUFBdEIsQ0FBMkJGLEtBQTNCO1NBREYsTUFFSyxPQUFPRCxJQUFQO09BcEJGOztrQkFzQk8sQ0FBQzFHLEdBQUQsRUFBTTFDLElBQU4sS0FBZTtnQkFDakJBLEtBQUsxRSxPQUFiLEVBQXNCLFFBQXRCO2NBQ00yRyxVQUFVLEtBQUtXLFVBQUwsQ0FBZ0JGLEdBQWhCLEVBQXFCMUMsSUFBckIsQ0FBaEI7Y0FDTW9KLE9BQU9uSCxRQUFRYyxPQUFSLEdBQ1RkLFFBQVFjLE9BQVIsQ0FBZ0JMLEdBQWhCLEVBQXFCMUMsSUFBckIsQ0FEUyxHQUVULEtBQUtnRCxPQUFMLENBQWFOLEdBQWIsRUFBa0IxQyxJQUFsQixDQUZKOztZQUlHaUMsV0FBVyxJQUFYLElBQW1CLGVBQWUsT0FBT0EsUUFBUWlCLE9BQXBELEVBQThEO2dCQUN0RCxJQUFJN0QsU0FBSixDQUFpQixrREFBakIsQ0FBTjs7O2NBRUlnSyxRQUFRWixTQUFTUSxHQUFULENBQWFqSixLQUFLNUQsS0FBbEIsQ0FBZDtZQUNHUixjQUFjeU4sS0FBakIsRUFBeUI7a0JBQ2ZDLE9BQVIsQ0FBZ0JGLElBQWhCLEVBQXNCRyxJQUF0QixDQUEyQkYsS0FBM0I7O2VBQ0twSCxPQUFQO09BbkNHLEVBQVA7OztjQXFDVTNHLE9BQVosRUFBcUJ1TixPQUFyQixFQUE4QkMsRUFBOUIsRUFBa0M7V0FDekJwRyxHQUFULEVBQWMxQyxJQUFkLEVBQW9CO1VBQ1owQyxHQUFSLEVBQWExQyxJQUFiLEVBQW1CO1dBQ1YsRUFBSTBDLEdBQUosRUFBUzFDLElBQVQsRUFBUDs7YUFDUzBDLEdBQVgsRUFBZ0IxQyxJQUFoQixFQUFzQjtZQUNadUMsSUFBUixDQUFnQix5QkFBd0J2QyxJQUFLLEVBQTdDOzs7O0dBS0Z3SixVQUFVcE4sS0FBVixFQUFpQjRMLE9BQWpCLEVBQTBCeUIsSUFBMUIsRUFBZ0M7V0FDdkIsS0FBS0MsZ0JBQUwsQ0FBd0J0TixLQUF4QixFQUErQjRMLFFBQVEyQixVQUF2QyxDQUFQOzs7Y0FFVWhPLFNBQVosRUFBdUI7VUFDZmlPLE1BQU1qTyxVQUFVQSxTQUFWLElBQXVCQSxTQUFuQztRQUNJa08sVUFBVSxLQUFLakIsV0FBTCxDQUFpQkssR0FBakIsQ0FBdUJXLEdBQXZCLENBQWQ7UUFDR2hPLGNBQWNpTyxPQUFqQixFQUEyQjtnQkFDZixFQUFJbE8sU0FBSixFQUFlbU4sSUFBSW5DLEtBQUtvQyxHQUFMLEVBQW5CO2FBQ0g7aUJBQVVwQyxLQUFLb0MsR0FBTCxLQUFhLEtBQUtELEVBQXpCO1NBREEsRUFBVjtXQUVLRixXQUFMLENBQWlCa0IsR0FBakIsQ0FBdUJGLEdBQXZCLEVBQTRCQyxPQUE1Qjs7V0FDS0EsT0FBUDs7O21CQUVlek4sS0FBakIsRUFBd0J1TixVQUF4QixFQUFvQztVQUM1QkksTUFBTSxJQUFJQyxPQUFKLENBQWMsQ0FBQ1YsT0FBRCxFQUFVVyxNQUFWLEtBQXFCO1dBQ3hDdkIsU0FBTCxDQUFlb0IsR0FBZixDQUFxQjFOLEtBQXJCLEVBQTRCa04sT0FBNUI7VUFDR0ssVUFBSCxFQUFnQjtjQUNSTyxNQUFNQyxXQUFXQyxPQUFYLEVBQW9CVCxVQUFwQixDQUFaO1lBQ0dPLElBQUlHLEtBQVAsRUFBZTtjQUFLQSxLQUFKOztpQkFDUEQsT0FBVCxHQUFtQjtpQkFBWSxJQUFJLEtBQUtFLFlBQVQsRUFBVDs7O0tBTGQsQ0FBWjs7V0FPT3ZGLFFBQVE7VUFDVEEsSUFBSixHQUFXQSxJQUFYO2FBQ09nRixHQUFQO0tBRkY7Ozs7QUFJSixNQUFNTyxZQUFOLFNBQTJCdE8sS0FBM0IsQ0FBaUM7O0FBRWpDdU8sT0FBT0MsTUFBUCxDQUFnQjFDLFNBQVMyQyxTQUF6QixFQUFvQztjQUFBLEVBQXBDOztBQzFHZSxNQUFNQyxJQUFOLENBQVc7U0FDakIzQyxZQUFQLENBQW9CLEVBQUNyRSxPQUFELEVBQXBCLEVBQStCO1VBQ3ZCZ0gsSUFBTixTQUFtQixJQUFuQixDQUF3QjtTQUNuQkQsU0FBTCxDQUFlRSxTQUFmLEdBQTJCakgsT0FBM0I7V0FDT2dILElBQVA7OztTQUVLRSxRQUFQLENBQWdCQyxRQUFoQixFQUEwQkMsT0FBMUIsRUFBbUM7V0FDMUIsSUFBSSxJQUFKLEdBQVdGLFFBQVgsQ0FBb0JDLFFBQXBCLEVBQThCQyxPQUE5QixDQUFQOztXQUNPRCxRQUFULEVBQW1CLEVBQUNFLEdBQUQsRUFBTXBQLFNBQU4sRUFBaUJxUCxNQUFqQixFQUF5QjVJLFFBQXpCLEVBQW5CLEVBQXVEO1VBQy9DNkksYUFBYSxNQUFNRixJQUFJbkUsTUFBSixDQUFXc0UsZ0JBQVgsQ0FBNEJ2UCxTQUE1QixDQUF6Qjs7UUFFSWlMLE1BQUosQ0FBV3VFLGNBQVgsQ0FBNEJ4UCxTQUE1QixFQUNFLEtBQUt5UCxhQUFMLENBQXFCUCxRQUFyQixFQUErQkcsTUFBL0IsRUFBdUM1SSxRQUF2QyxFQUFpRDZJLFVBQWpELENBREY7V0FFTyxJQUFQOzs7Z0JBRVlKLFFBQWQsRUFBd0JHLE1BQXhCLEVBQWdDNUksUUFBaEMsRUFBMEM2SSxVQUExQyxFQUFzRDtRQUNoREksUUFBUSxJQUFaO1VBQ01DLFdBQVcsS0FBS1gsU0FBdEI7VUFDTVksVUFBVSxNQUFNRixLQUF0QjtVQUNNRyxXQUFZbkosR0FBRCxJQUFTO1VBQ3JCZ0osS0FBSCxFQUFXO3FCQUNLSixhQUFhSSxRQUFRLEtBQXJCO1lBQ1hoSixHQUFILEVBQVM7a0JBQVNvSixLQUFSLENBQWdCLHdCQUF3QnBKLEdBQXhDOzs7S0FIZDs7V0FLT21JLE1BQVAsQ0FBZ0IsSUFBaEIsRUFBc0JLLFNBQVNhLFFBQVQsQ0FBa0IsSUFBbEIsQ0FBdEIsRUFBK0MsRUFBSUgsT0FBSixFQUFhQyxRQUFiLEVBQS9DO1dBQ09oQixNQUFQLENBQWdCSyxRQUFoQixFQUEwQixFQUFJVSxPQUFKLEVBQWFDLFFBQWIsRUFBMUI7O1dBRU8sT0FBTzVMLEdBQVAsRUFBWWdILE1BQVosS0FBdUI7VUFDekIsVUFBUXlFLEtBQVIsSUFBaUIsUUFBTXpMLEdBQTFCLEVBQWdDO2VBQVF5TCxLQUFQOzs7WUFFM0JsSCxXQUFXbUgsU0FBUzFMLElBQUlOLElBQWIsQ0FBakI7VUFDRzFELGNBQWN1SSxRQUFqQixFQUE0QjtlQUNuQi9CLFNBQVcsS0FBWCxFQUFvQixFQUFDeEMsR0FBRCxFQUFwQixDQUFQOzs7VUFFRTtZQUNFOEMsTUFBTSxNQUFNeUIsU0FBV3ZFLEdBQVgsRUFBZ0IsSUFBaEIsRUFBc0JnSCxNQUF0QixDQUFoQjtZQUNHLENBQUVsRSxHQUFMLEVBQVc7aUJBQVFBLEdBQVA7OztlQUVMLE1BQU1zSSxPQUFTdEksR0FBVCxFQUFjOUMsR0FBZCxDQUFiO09BSkYsQ0FLQSxPQUFNeUMsR0FBTixFQUFZO1lBQ1AsVUFBVUQsU0FBU0MsR0FBVCxFQUFjLEVBQUNLLEdBQUQsRUFBTTlDLEdBQU4sRUFBZCxDQUFiLEVBQXlDO21CQUM5QjRMLFFBQVQsQ0FBa0JuSixHQUFsQixFQUF1QixFQUFDSyxHQUFELEVBQU05QyxHQUFOLEVBQXZCOzs7S0FkTjs7O1dBZ0JPQSxHQUFULEVBQWMrTCxRQUFkLEVBQXdCO1VBQ2hCNVAsUUFBUTZELElBQUlJLElBQUosQ0FBU2pFLEtBQXZCO1FBQ0k2UCxRQUFRLEtBQUtDLFFBQUwsQ0FBYzVDLEdBQWQsQ0FBa0JsTixLQUFsQixDQUFaO1FBQ0dILGNBQWNnUSxLQUFqQixFQUF5QjtVQUNwQixDQUFFN1AsS0FBTCxFQUFhO2NBQ0wsSUFBSUMsS0FBSixDQUFhLGtCQUFpQkQsS0FBTSxFQUFwQyxDQUFOOztVQUNDLGVBQWUsT0FBTzRQLFFBQXpCLEVBQW9DO2dCQUMxQkEsU0FBUy9MLEdBQVQsRUFBYyxJQUFkLENBQVI7T0FERixNQUVLZ00sUUFBUUQsUUFBUjtXQUNBRSxRQUFMLENBQWMvQixHQUFkLENBQW9CL04sS0FBcEIsRUFBMkI2UCxLQUEzQjs7V0FDS0EsS0FBUDs7OztBQ3JEVyxNQUFNRSxNQUFOLENBQWE7U0FDbkIvRCxZQUFQLENBQW9CLEVBQUNoSCxTQUFELEVBQVk2RyxNQUFaLEVBQXBCLEVBQXlDO1VBQ2pDa0UsTUFBTixTQUFxQixJQUFyQixDQUEwQjtXQUNuQnJCLFNBQVAsQ0FBaUIxSixTQUFqQixHQUE2QkEsU0FBN0I7V0FDT2dMLFVBQVAsQ0FBb0JuRSxNQUFwQjtXQUNPa0UsTUFBUDs7O2NBRVV4USxPQUFaLEVBQXFCMFEsWUFBckIsRUFBbUM7UUFDOUIsU0FBUzFRLE9BQVosRUFBc0I7WUFDZCxFQUFDSyxTQUFELEVBQVlELFNBQVosS0FBeUJKLE9BQS9CO2dCQUNVaVAsT0FBTzBCLE1BQVAsQ0FBZ0IsRUFBQ3RRLFNBQUQsRUFBWUQsU0FBWixFQUFoQixDQUFWOzs7VUFFSXdRLE1BQU0sRUFBQzVRLE9BQUQsRUFBWjtXQUNPNE0sZ0JBQVAsQ0FBMEIsSUFBMUIsRUFBa0M7Y0FDdEIsRUFBQzNILE9BQU8sSUFBUixFQURzQjtlQUVyQixFQUFDQSxPQUFPakYsT0FBUixFQUZxQjtXQUd6QixFQUFDaUYsT0FBTzJMLEdBQVIsRUFIeUI7b0JBSWhCLEVBQUMzTCxPQUFPeUwsWUFBUixFQUpnQixFQUFsQzs7O2VBTVduQixRQUFiLEVBQXVCO1dBQ2ROLE9BQU9yQyxnQkFBUCxDQUEwQixJQUExQixFQUFnQztnQkFDM0IsRUFBSTNILE9BQU9zSyxRQUFYLEVBRDJCLEVBQWhDLENBQVA7OztTQUdLc0IsSUFBUCxDQUFZeFEsU0FBWixFQUF1Qm9QLEdBQXZCLEVBQTRCO1VBQ3BCelAsVUFBVSxTQUFTSyxTQUFULEdBQXFCLElBQXJCLEdBQ1osRUFBSUEsU0FBSixFQUFlRCxXQUFXcVAsSUFBSW5FLE1BQUosQ0FBV3dGLE9BQXJDLEVBREo7V0FFTyxJQUFJLElBQUosQ0FBVzlRLE9BQVgsRUFBb0J5UCxJQUFJc0IsaUJBQUosRUFBcEIsQ0FBUDs7O01BRUUvRCxFQUFKLEdBQVM7V0FBVSxDQUFDLEdBQUdnRSxJQUFKLEtBQWEsS0FBS0MsS0FBTCxHQUFhQyxJQUFiLENBQW9CLEdBQUdGLElBQXZCLENBQXBCOzs7T0FFUGxRLFFBQU0sSUFBWCxFQUFpQjtXQUFVLEtBQUtxUSxLQUFMLENBQVcsU0FBWCxFQUFzQixFQUFDclEsS0FBRCxFQUF0QixFQUErQnNRLE1BQS9CLENBQXdDLE1BQXhDLENBQVA7O09BQ2YsR0FBR0osSUFBUixFQUFjO1dBQVUsS0FBS0ksTUFBTCxDQUFjLE1BQWQsRUFBc0IsR0FBR0osSUFBekIsQ0FBUDs7U0FDVixHQUFHQSxJQUFWLEVBQWdCO1dBQVUsS0FBS0ksTUFBTCxDQUFjLFFBQWQsRUFBd0IsR0FBR0osSUFBM0IsQ0FBUDs7O1NBRVoxQyxHQUFQLEVBQVksR0FBRzBDLElBQWYsRUFBcUI7VUFDYmpSLE1BQU1rUCxPQUFPQyxNQUFQLENBQWdCLEVBQWhCLEVBQW9CLEtBQUswQixHQUF6QixDQUFaO1NBQ0tTLGFBQUw7VUFDTTlILE9BQU8sS0FBS21ILFlBQUwsQ0FBa0IzUSxJQUFJSyxTQUF0QixDQUFiO1FBQ0csU0FBU0wsSUFBSWUsS0FBaEIsRUFBd0I7YUFDZixLQUFLd1EsTUFBTCxDQUFZaEQsR0FBWixFQUFtQi9FLElBQW5CLEVBQXlCeEosR0FBekIsRUFBOEIsR0FBR2lSLElBQWpDLENBQVA7S0FERixNQUdLO1lBQ0dsUSxRQUFRZixJQUFJZSxLQUFKLEdBQVksS0FBSzJFLFNBQUwsRUFBMUI7WUFDTXNJLFFBQVEsS0FBS3dCLFFBQUwsQ0FBY3JCLFNBQWQsQ0FBd0JwTixLQUF4QixFQUErQixJQUEvQixFQUFxQ3dOLEdBQXJDLENBQWQ7YUFDT1AsTUFBUSxLQUFLdUQsTUFBTCxDQUFZaEQsR0FBWixFQUFtQi9FLElBQW5CLEVBQXlCeEosR0FBekIsRUFBOEIsR0FBR2lSLElBQWpDLENBQVIsQ0FBUDs7OztPQUdDLEdBQUdBLElBQVIsRUFBYztVQUNOSixNQUFNLEtBQUtBLEdBQWpCO1NBQ0ksSUFBSVcsR0FBUixJQUFlUCxJQUFmLEVBQXNCO1VBQ2pCLGFBQWEsT0FBT08sR0FBdkIsRUFBNkI7WUFDdkJsUixTQUFKLEdBQWdCa1IsR0FBaEI7WUFDSW5SLFNBQUosR0FBZ0J3USxJQUFJNVEsT0FBSixDQUFZSSxTQUE1Qjs7OztZQUdJLEVBQUNKLFNBQVN3UixRQUFWLEVBQW9CblIsU0FBcEIsRUFBK0JELFNBQS9CLEVBQTBDVSxLQUExQyxFQUFpREwsS0FBakQsS0FBMEQ4USxHQUFoRTs7VUFFR2pSLGNBQWNELFNBQWpCLEVBQTZCO1lBQ3hCQyxjQUFjRixTQUFqQixFQUE2QjtjQUN4QixDQUFFd1EsSUFBSXhRLFNBQVQsRUFBcUI7O2dCQUVmQSxTQUFKLEdBQWdCd1EsSUFBSTVRLE9BQUosQ0FBWUksU0FBNUI7O1NBSEosTUFJS3dRLElBQUl4USxTQUFKLEdBQWdCQSxTQUFoQjtZQUNEQyxTQUFKLEdBQWdCQSxTQUFoQjtPQU5GLE1BT0ssSUFBR0MsY0FBY0YsU0FBakIsRUFBNkI7Y0FDMUIsSUFBSU0sS0FBSixDQUFhLDBDQUFiLENBQU47T0FERyxNQUVBLElBQUdKLGNBQWNrUixRQUFkLElBQTBCLENBQUVaLElBQUl2USxTQUFuQyxFQUErQztZQUM5Q0QsU0FBSixHQUFnQm9SLFNBQVNwUixTQUF6QjtZQUNJQyxTQUFKLEdBQWdCbVIsU0FBU25SLFNBQXpCOzs7VUFFQ0MsY0FBY1EsS0FBakIsRUFBeUI7WUFBS0EsS0FBSixHQUFZQSxLQUFaOztVQUN2QlIsY0FBY0csS0FBakIsRUFBeUI7WUFBS0EsS0FBSixHQUFZQSxLQUFaOzs7O1dBRXJCLElBQVA7OztjQUVVO1dBQ0gsS0FBS3dRLEtBQUwsQ0FBYSxFQUFDblEsT0FBTyxJQUFSLEVBQWIsQ0FBUDs7O1FBRUksR0FBR2tRLElBQVQsRUFBZTtXQUNOL0IsT0FBT3dDLE1BQVAsQ0FBZ0IsS0FBS0MsTUFBckIsRUFBNkI7V0FDM0IsRUFBQ3pNLE9BQU9nSyxPQUFPQyxNQUFQLENBQWdCLEVBQWhCLEVBQW9CLEtBQUswQixHQUF6QixFQUE4QixHQUFHSSxJQUFqQyxDQUFSLEVBRDJCLEVBQTdCLENBQVA7O1FBRUksR0FBR0EsSUFBVCxFQUFlO1dBQ04vQixPQUFPd0MsTUFBUCxDQUFnQixJQUFoQixFQUFzQjtXQUNwQixFQUFDeE0sT0FBT2dLLE9BQU9DLE1BQVAsQ0FBZ0IsRUFBaEIsRUFBb0IsS0FBSzBCLEdBQXpCLEVBQThCLEdBQUdJLElBQWpDLENBQVIsRUFEb0IsRUFBdEIsQ0FBUDs7O2tCQUljO1FBQ1gsQ0FBRSxLQUFLVyxZQUFMLEVBQUwsRUFBMkI7WUFDbkIsSUFBSWpSLEtBQUosQ0FBYSx3QkFBYixDQUFOOzs7aUJBQ1c7V0FBVSxJQUFQOztVQUNWcUUsVUFBUSxFQUFoQixFQUFvQjtRQUNmLFNBQVNBLE9BQVQsSUFBb0IsVUFBVUEsT0FBakMsRUFBMkM7Z0JBQy9CLEVBQUk2TSxRQUFRN00sT0FBWixFQUFWOzs7VUFFSXdKLFVBQVUsS0FBS2dCLFFBQUwsQ0FBY3NDLFdBQWQsQ0FBMEIsS0FBS2pCLEdBQUwsQ0FBU3ZRLFNBQW5DLENBQWhCOztVQUVNeVIsY0FBYy9NLFFBQVErTSxXQUFSLElBQXVCLElBQTNDO1FBQ0lDLFlBQVloTixRQUFRZ04sU0FBeEI7UUFDRyxTQUFTQSxTQUFaLEVBQXdCO2tCQUNWRCxjQUFZLENBQXhCOzs7UUFFRUgsWUFBSjtVQUNNSyxVQUFVLElBQUl0RCxPQUFKLENBQWMsQ0FBQ1YsT0FBRCxFQUFVVyxNQUFWLEtBQXFCO1lBQzNDM0osT0FBT0QsUUFBUTRKLE1BQVIsR0FBaUJBLE1BQWpCLEdBQTBCWCxPQUF2QztXQUNLMkQsWUFBTCxHQUFvQkEsZUFBZSxNQUNqQ0csY0FBY3ZELFFBQVEwRCxFQUFSLEVBQWQsR0FDSSxJQURKLElBQ1lqTixLQUFLdUosT0FBTCxHQUFlLEtBRDNCLENBREY7S0FGYyxDQUFoQjs7UUFNSUssR0FBSjtVQUNNc0QsY0FBY0gsYUFBYUQsY0FBWSxDQUE3QztRQUNHL00sUUFBUTZNLE1BQVIsSUFBa0JHLFNBQXJCLEVBQWlDO1lBQ3pCSSxPQUFPLEtBQUtoQixLQUFMLENBQVcsU0FBWCxDQUFiO1lBQ01pQixZQUFZLE1BQU07WUFDbkJGLGNBQWMzRCxRQUFRMEQsRUFBUixFQUFqQixFQUFnQztlQUN6QmIsTUFBTCxDQUFZLE1BQVo7O09BRko7WUFHTWlCLFlBQWNELFNBQWQsRUFBeUJGLFdBQXpCLENBQU47S0FMRixNQU1LO1lBQ0dHLFlBQWNWLFlBQWQsRUFBNEJPLFdBQTVCLENBQU47O1FBQ0N0RCxJQUFJRyxLQUFQLEVBQWU7VUFBS0EsS0FBSjs7VUFDVnVELFFBQVEsTUFBTUMsY0FBYzNELEdBQWQsQ0FBcEI7O1lBRVFYLElBQVIsQ0FBYXFFLEtBQWIsRUFBb0JBLEtBQXBCO1dBQ09OLE9BQVA7OztRQUdJUSxTQUFOLEVBQWlCLEdBQUd4QixJQUFwQixFQUEwQjtRQUNyQixhQUFhLE9BQU93QixTQUF2QixFQUFtQztrQkFDckIsS0FBS0MsVUFBTCxDQUFnQkQsU0FBaEIsQ0FBWjs7O1FBRUMsZUFBZSxPQUFPQSxVQUFVbEosSUFBbkMsRUFBMEM7WUFDbEMsSUFBSXZGLFNBQUosQ0FBaUIsZ0NBQWpCLENBQU47OztXQUVLa0wsT0FBT3dDLE1BQVAsQ0FBZ0IsSUFBaEIsRUFBd0I7Y0FDbkIsRUFBQ3hNLE9BQU91TixTQUFSLEVBRG1CO1dBRXRCLEVBQUN2TixPQUFPZ0ssT0FBT0MsTUFBUCxDQUFnQixFQUFoQixFQUFvQixLQUFLMEIsR0FBekIsRUFBOEIsR0FBR0ksSUFBakMsQ0FBUixFQUZzQixFQUF4QixDQUFQOzs7U0FJS1AsVUFBUCxDQUFrQmlDLFNBQWxCLEVBQTZCO1NBQ3ZCLE1BQU0sQ0FBQ0MsSUFBRCxFQUFPSCxTQUFQLENBQVYsSUFBK0J2RCxPQUFPMkQsT0FBUCxDQUFpQkYsU0FBakIsQ0FBL0IsRUFBNEQ7V0FDckR2RCxTQUFMLENBQWV3RCxJQUFmLElBQXVCLFlBQVc7ZUFDekIsS0FBS3hCLEtBQUwsQ0FBYXFCLFNBQWIsQ0FBUDtPQURGOztTQUVHckQsU0FBTCxDQUFlc0QsVUFBZixHQUE0QkMsU0FBNUI7U0FDS3ZELFNBQUwsQ0FBZW1DLE1BQWYsR0FBd0JvQixVQUFVbkcsT0FBbEM7V0FDTyxJQUFQOzs7O0FBRUowQyxPQUFPQyxNQUFQLENBQWdCc0IsT0FBT3JCLFNBQXZCLEVBQWtDO2NBQ3BCLElBRG9CLEVBQWxDOztBQzNJQSxNQUFNMEQseUJBQTJCO1lBQ3JCN0wsUUFBUW1KLEtBRGE7V0FFdEIsUUFBQ2YsT0FBRCxZQUFPNUMsV0FBUCxFQUFpQnNHLGNBQWpCLEVBQWlDQyxTQUFqQyxFQUFULEVBQXNELEVBRnZCLEVBQWpDOztBQUtBLHNCQUFlLFVBQVNDLGNBQVQsRUFBeUI7bUJBQ3JCL0QsT0FBT0MsTUFBUCxDQUFnQixFQUFoQixFQUFvQjJELHNCQUFwQixFQUE0Q0csY0FBNUMsQ0FBakI7UUFDTTthQUFBLEVBQ090TixZQURQLEVBQ3FCQyxhQURyQjtjQUVNc04sZ0JBRk4sS0FHSkQsY0FIRjs7U0FLUyxFQUFDRSxPQUFPLENBQVIsRUFBV0MsUUFBWCxFQUFxQkMsSUFBckIsRUFBVDs7V0FFU0QsUUFBVCxDQUFrQkUsWUFBbEIsRUFBZ0NDLEtBQWhDLEVBQXVDO1VBQy9CLEVBQUNwTyxZQUFELEtBQWlCbU8sYUFBYWxFLFNBQXBDO1FBQ0csUUFBTWpLLFlBQU4sSUFBc0IsQ0FBRUEsYUFBYXFPLGNBQWIsRUFBM0IsRUFBMkQ7WUFDbkQsSUFBSXhQLFNBQUosQ0FBaUIsaUNBQWpCLENBQU47OztpQkFFV29MLFNBQWIsQ0FBdUJJLFFBQXZCLEdBQ0VpRSxnQkFBa0J0TyxZQUFsQixDQURGOzs7V0FHT2tPLElBQVQsQ0FBYzNELEdBQWQsRUFBbUI7V0FDVkEsSUFBSUYsUUFBSixHQUFlRSxJQUFJRixRQUFKLENBQWFFLEdBQWIsQ0FBdEI7OztXQUVPK0QsZUFBVCxDQUF5QnRPLFlBQXpCLEVBQXVDO1VBQy9CNk4sWUFBWWpILGNBQWdCNUcsWUFBaEIsRUFBOEIsRUFBSU8sU0FBSixFQUFlQyxZQUFmLEVBQTZCQyxhQUE3QixFQUE5QixDQUFsQjtVQUNNeUosVUFBT3FFLEtBQVNoSCxZQUFULENBQXNCc0csU0FBdEIsQ0FBYjtVQUNNdkMsWUFBU2tELE9BQVdqSCxZQUFYLENBQXdCc0csU0FBeEIsQ0FBZjtVQUNNdkcsY0FBV21ILFNBQWFsSCxZQUFiLENBQTBCc0csU0FBMUIsQ0FBakI7O21CQUVlSSxRQUFmLENBQTBCO21CQUFBLFlBQ2xCM0csV0FEa0IsVUFDUmdFLFNBRFEsRUFDQXVDLFNBREEsRUFBMUI7O1dBR08sVUFBU3RELEdBQVQsRUFBYzthQUNaUixPQUFPQyxNQUFQLENBQWdCSyxRQUFoQixFQUE0QixFQUFDa0MsUUFBUWxDLFFBQVQsRUFBbUJxRSxRQUFRckUsUUFBM0IsRUFBcUNzRSxNQUFyQyxFQUE1QixDQUFQOztlQUVTQSxNQUFULENBQWdCLEdBQUc3QyxJQUFuQixFQUF5QjtjQUNqQnRFLFVBQVU4RCxVQUFPSyxJQUFQLENBQWMsSUFBZCxFQUFvQnBCLEdBQXBCLENBQWhCO2VBQ08sTUFBTXVCLEtBQUs5TyxNQUFYLEdBQ0h3SyxRQUFRd0UsSUFBUixDQUFhLEdBQUdGLElBQWhCLENBREcsR0FDcUJ0RSxPQUQ1Qjs7O2VBR082QyxRQUFULENBQWtCOUgsT0FBbEIsRUFBMkI7Y0FDbkJwSCxZQUFZb0YsV0FBbEI7Y0FDTWlILFVBQVU4RCxVQUFPSyxJQUFQLENBQWN4USxTQUFkLEVBQXlCb1AsR0FBekIsQ0FBaEI7Y0FDTXFFLEtBQUssSUFBSXRILFdBQUosQ0FBYUUsT0FBYixDQUFYOztjQUVNcUgsU0FBU3RNLFFBQVFxTSxFQUFSLENBQWY7Y0FDTXBFLFNBQVMsQ0FBQ3FFLE9BQU9yRSxNQUFQLElBQWlCcUUsTUFBbEIsRUFBMEJDLElBQTFCLENBQStCRCxNQUEvQixDQUFmO2NBQ01qTixXQUFXLENBQUNpTixPQUFPak4sUUFBUCxJQUFtQm1NLGdCQUFwQixFQUFzQ2UsSUFBdEMsQ0FBMkNELE1BQTNDLENBQWpCOztnQkFFS3pFLFFBQUwsQ0FBZ0J3RSxFQUFoQixFQUFvQjthQUFBLEVBQ2J6VCxTQURhLEVBQ0ZxUCxNQURFLEVBQ001SSxRQUROLEVBQXBCOztZQUdHaU4sT0FBT0UsUUFBVixFQUFxQjtrQkFDWGpHLE9BQVIsQ0FBZ0IrRixNQUFoQixFQUF3QjlGLElBQXhCLENBQ0U4RixVQUFVQSxPQUFPRSxRQUFQLEVBRFo7OztlQUdLaEYsT0FBT3dDLE1BQVAsQ0FBZ0J5QyxtQkFBaEIsRUFBdUM7cUJBQ2pDLEVBQUluSCxZQUFZLElBQWhCLEVBQXNCOUgsT0FBT3dLLElBQUluRSxNQUFKLENBQVd3RixPQUF4QyxFQURpQztxQkFFakMsRUFBSS9ELFlBQVksSUFBaEIsRUFBc0I5SCxPQUFPNUUsU0FBN0IsRUFGaUMsRUFBdkMsQ0FBUDs7S0F4Qko7Ozs7QUE0QkosTUFBTTZULHNCQUF3QjtZQUNsQjtXQUFVLElBQUksS0FBSzdULFNBQWhCO0dBRGU7WUFFbEI7V0FBVyxvQkFBbUIsS0FBS0EsU0FBVSxHQUExQztHQUZlLEVBQTlCOztBQ2hFQThULGdCQUFnQjFPLFNBQWhCLEdBQTRCQSxTQUE1QjtBQUNBLFNBQVNBLFNBQVQsR0FBcUI7U0FDWjJPLG1CQUFZLENBQVosRUFBZUMsV0FBZixFQUFQOzs7QUFFRixBQUFlLFNBQVNGLGVBQVQsQ0FBeUJuQixpQkFBZSxFQUF4QyxFQUE0QztNQUN0RCxRQUFRQSxlQUFldk4sU0FBMUIsRUFBc0M7bUJBQ3JCQSxTQUFmLEdBQTJCQSxTQUEzQjs7O1NBRUs2TyxnQkFBZ0J0QixjQUFoQixDQUFQOzs7OzsifQ==

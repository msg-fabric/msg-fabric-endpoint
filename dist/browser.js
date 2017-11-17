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

module.exports = endpoint_browser;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3Nlci5qcyIsInNvdXJjZXMiOlsiLi4vY29kZS9wcm90b2NvbC9mcmFtaW5nLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvc2hhcmVkLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvanNvbi5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2JpbmFyeS5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2NvbnRyb2wuanN5IiwiLi4vY29kZS9wcm90b2NvbC9pbmRleC5qc3kiLCIuLi9jb2RlL2VuZHBvaW50LmpzeSIsIi4uL2NvZGUvc2luay5qc3kiLCIuLi9jb2RlL21zZ2N0eC5qc3kiLCIuLi9jb2RlL3BsdWdpbi5qc3kiLCIuLi9jb2RlL2luZGV4LmJyb3dzZXIuanN5Il0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IGxpdHRsZV9lbmRpYW4gPSB0cnVlXG5jb25zdCBjX3NpbmdsZSA9ICdzaW5nbGUnXG5jb25zdCBjX2RhdGFncmFtID0gJ2RhdGFncmFtJ1xuY29uc3QgY19kaXJlY3QgPSAnZGlyZWN0J1xuY29uc3QgY19tdWx0aXBhcnQgPSAnbXVsdGlwYXJ0J1xuY29uc3QgY19zdHJlYW1pbmcgPSAnc3RyZWFtaW5nJ1xuXG5jb25zdCBfZXJyX21zZ2lkX3JlcXVpcmVkID0gYFJlc3BvbnNlIHJlcWlyZXMgJ21zZ2lkJ2BcbmNvbnN0IF9lcnJfdG9rZW5fcmVxdWlyZWQgPSBgVHJhbnNwb3J0IHJlcWlyZXMgJ3Rva2VuJ2BcblxuXG5mdW5jdGlvbiBmcm1fcm91dGluZygpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHgxLCBtYXNrID0gMHgxXG4gIHJldHVybiBAe31cbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gbnVsbCAhPSBvYmouZnJvbV9pZCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IHtmcm9tX2lkfSA9IG9ialxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgMHxmcm9tX2lkLmlkX3JvdXRlciwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MzIgQCA0K29mZnNldCwgMHxmcm9tX2lkLmlkX3RhcmdldCwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgY29uc3QgZnJvbV9pZCA9IHVuZGVmaW5lZCA9PT0gb2JqLmZyb21faWRcbiAgICAgICAgPyBvYmouZnJvbV9pZCA9IHt9IDogb2JqLmZyb21faWRcbiAgICAgIGZyb21faWQuaWRfcm91dGVyID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgZnJvbV9pZC5pZF90YXJnZXQgPSBkdi5nZXRJbnQzMiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG5cbmZ1bmN0aW9uIGZybV9yZXNwb25zZSgpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHgyLCBtYXNrID0gMHgyXG4gIHJldHVybiBAe31cbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gbnVsbCAhPSBvYmoubXNnaWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai5tc2dpZCA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX21zZ2lkX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoubXNnaWQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcV9hY2ssIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLmFja19mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLnRva2VuID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9hY2sgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouYWNrX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5cblxuZnVuY3Rpb24gZnJtX2RhdGFncmFtKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDAsIGJpdHMgPSAweDAsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGF0YWdyYW1cbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OlxuICAgICAgaWYgY19kYXRhZ3JhbSA9PT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gYml0c1xuICAgICAgaWYgb2JqLnRyYW5zcG9ydCAmJiBjX3NpbmdsZSAhPT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gZmFsc2VcbiAgICAgIHJldHVybiAhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX2RhdGFncmFtXG5cbmZ1bmN0aW9uIGZybV9kaXJlY3QoKSA6OlxuICBjb25zdCBzaXplID0gNCwgYml0cyA9IDB4NCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19kaXJlY3RcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OlxuICAgICAgaWYgY19kaXJlY3QgPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISEgb2JqLnRva2VuID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kaXJlY3RcblxuZnVuY3Rpb24gZnJtX211bHRpcGFydCgpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHg4LCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX211bHRpcGFydFxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBjX211bHRpcGFydCA9PT0gb2JqLnRyYW5zcG9ydCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgYmluZF9zZXFfbmV4dCwgc2VxX3BvczogNFxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cbiAgICAgIGlmIHRydWUgPT0gb2JqLnNlcSA6OiAvLyB1c2Ugc2VxX25leHRcbiAgICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMCwgbGl0dGxlX2VuZGlhblxuICAgICAgZWxzZSBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLnNlcV9mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkICAgICA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXEgICAgICAgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfbXVsdGlwYXJ0XG5cbmZ1bmN0aW9uIGZybV9zdHJlYW1pbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4YywgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19zdHJlYW1pbmdcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19zdHJlYW1pbmcgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjpcbiAgICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMCwgbGl0dGxlX2VuZGlhbiAvLyB1c2Ugc2VxX25leHRcbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX3N0cmVhbWluZ1xuXG5cbmZ1bmN0aW9uIGJpbmRfc2VxX25leHQob2Zmc2V0KSA6OlxuICBjb25zdCBzZXFfb2Zmc2V0ID0gdGhpcy5zZXFfcG9zICsgb2Zmc2V0XG4gIGxldCBzZXEgPSAxXG4gIHJldHVybiBmdW5jdGlvbiBzZXFfbmV4dCh7ZmxhZ3MsIGZpbn0sIGR2KSA6OlxuICAgIGlmICEgZmluIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIHNlcSsrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDIrc2VxX29mZnNldCwgMHxmbGFncywgbGl0dGxlX2VuZGlhblxuICAgIGVsc2UgOjpcbiAgICAgIGR2LnNldEludDE2IEAgc2VxX29mZnNldCwgLXNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICAgIHNlcSA9IE5hTlxuXG5cblxuZXhwb3J0IGRlZmF1bHQgY29tcG9zZUZyYW1pbmdzKClcbmZ1bmN0aW9uIGNvbXBvc2VGcmFtaW5ncygpIDo6XG4gIGNvbnN0IGZybV9mcm9tID0gZnJtX3JvdXRpbmcoKSwgZnJtX3Jlc3AgPSBmcm1fcmVzcG9uc2UoKVxuICBjb25zdCBmcm1fdHJhbnNwb3J0cyA9IEBbXSBmcm1fZGF0YWdyYW0oKSwgZnJtX2RpcmVjdCgpLCBmcm1fbXVsdGlwYXJ0KCksIGZybV9zdHJlYW1pbmcoKVxuXG4gIGlmIDggIT09IGZybV9mcm9tLnNpemUgfHwgOCAhPT0gZnJtX3Jlc3Auc2l6ZSB8fCA0ICE9IGZybV90cmFuc3BvcnRzLmxlbmd0aCA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBGcmFtaW5nIFNpemUgY2hhbmdlYFxuXG4gIGNvbnN0IGJ5Qml0cyA9IFtdLCBtYXNrPTB4ZlxuXG4gIDo6XG4gICAgY29uc3QgdF9mcm9tID0gZnJtX2Zyb20uZl90ZXN0LCB0X3Jlc3AgPSBmcm1fcmVzcC5mX3Rlc3RcbiAgICBjb25zdCBbdDAsdDEsdDIsdDNdID0gZnJtX3RyYW5zcG9ydHMubWFwIEAgZj0+Zi5mX3Rlc3RcblxuICAgIGNvbnN0IHRlc3RCaXRzID0gYnlCaXRzLnRlc3RCaXRzID0gb2JqID0+XG4gICAgICAwIHwgdF9mcm9tKG9iaikgfCB0X3Jlc3Aob2JqKSB8IHQwKG9iaikgfCB0MShvYmopIHwgdDIob2JqKSB8IHQzKG9iailcblxuICAgIGJ5Qml0cy5jaG9vc2UgPSBmdW5jdGlvbiAob2JqLCBsc3QpIDo6XG4gICAgICBpZiBudWxsID09IGxzdCA6OiBsc3QgPSB0aGlzIHx8IGJ5Qml0c1xuICAgICAgcmV0dXJuIGxzdFt0ZXN0Qml0cyhvYmopXVxuXG5cbiAgZm9yIGNvbnN0IFQgb2YgZnJtX3RyYW5zcG9ydHMgOjpcbiAgICBjb25zdCB7Yml0czpiLCBzaXplLCB0cmFuc3BvcnR9ID0gVFxuXG4gICAgYnlCaXRzW2J8MF0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDAsIG1hc2ssIHNpemU6IHNpemUsIG9wOiAnJ1xuICAgIGJ5Qml0c1tifDFdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwxLCBtYXNrLCBzaXplOiA4ICsgc2l6ZSwgb3A6ICdmJ1xuICAgIGJ5Qml0c1tifDJdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwyLCBtYXNrLCBzaXplOiA4ICsgc2l6ZSwgb3A6ICdyJ1xuICAgIGJ5Qml0c1tifDNdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwzLCBtYXNrLCBzaXplOiAxNiArIHNpemUsIG9wOiAnZnInXG5cbiAgICBmb3IgY29uc3QgZm5fa2V5IG9mIFsnZl9wYWNrJywgJ2ZfdW5wYWNrJ10gOjpcbiAgICAgIGNvbnN0IGZuX3RyYW4gPSBUW2ZuX2tleV0sIGZuX2Zyb20gPSBmcm1fZnJvbVtmbl9rZXldLCBmbl9yZXNwID0gZnJtX3Jlc3BbZm5fa2V5XVxuXG4gICAgICBieUJpdHNbYnwwXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fdHJhbihvYmosIGR2LCAwKVxuICAgICAgYnlCaXRzW2J8MV1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3RyYW4ob2JqLCBkdiwgOClcbiAgICAgIGJ5Qml0c1tifDJdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9yZXNwKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwzXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fZnJvbShvYmosIGR2LCAwKTsgZm5fcmVzcChvYmosIGR2LCA4KTsgZm5fdHJhbihvYmosIGR2LCAxNilcblxuICBmb3IgY29uc3QgZnJtIG9mIGJ5Qml0cyA6OlxuICAgIGJpbmRBc3NlbWJsZWQgQCBmcm1cblxuICByZXR1cm4gYnlCaXRzXG5cblxuZnVuY3Rpb24gYmluZEFzc2VtYmxlZChmcm0pIDo6XG4gIGNvbnN0IHtULCBzaXplLCBmX3BhY2ssIGZfdW5wYWNrfSA9IGZybVxuICBpZiBULmJpbmRfc2VxX25leHQgOjpcbiAgICBmcm0uc2VxX25leHQgPSBULmJpbmRfc2VxX25leHQgQCBmcm0uc2l6ZSAtIFQuc2l6ZVxuXG4gIGRlbGV0ZSBmcm0uVFxuICBmcm0ucGFjayA9IHBhY2sgOyBmcm0udW5wYWNrID0gdW5wYWNrXG4gIGNvbnN0IHNlcV9uZXh0ID0gZnJtLnNlcV9uZXh0XG5cbiAgZnVuY3Rpb24gcGFjayhwa3RfdHlwZSwgcGt0X29iaikgOjpcbiAgICBpZiAhIEAgMCA8PSBwa3RfdHlwZSAmJiBwa3RfdHlwZSA8PSAyNTUgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgcGt0X3R5cGUgdG8gYmUgWzAuLjI1NV1gXG5cbiAgICBwa3Rfb2JqLnR5cGUgPSBwa3RfdHlwZVxuICAgIGlmIHNlcV9uZXh0ICYmIG51bGwgPT0gcGt0X29iai5zZXEgOjpcbiAgICAgIHBrdF9vYmouc2VxID0gdHJ1ZVxuXG4gICAgY29uc3QgZHYgPSBuZXcgRGF0YVZpZXcgQCBuZXcgQXJyYXlCdWZmZXIoc2l6ZSlcbiAgICBmX3BhY2socGt0X29iaiwgZHYsIDApXG4gICAgcGt0X29iai5oZWFkZXIgPSBkdi5idWZmZXJcblxuICAgIGlmIHRydWUgPT09IHBrdF9vYmouc2VxIDo6XG4gICAgICBfYmluZF9pdGVyYWJsZSBAIHBrdF9vYmosIGR2LmJ1ZmZlci5zbGljZSgwLHNpemUpXG5cbiAgZnVuY3Rpb24gdW5wYWNrKHBrdCkgOjpcbiAgICBjb25zdCBidWYgPSBwa3QuaGVhZGVyX2J1ZmZlcigpXG4gICAgY29uc3QgZHYgPSBuZXcgRGF0YVZpZXcgQCBuZXcgVWludDhBcnJheShidWYpLmJ1ZmZlclxuXG4gICAgY29uc3QgaW5mbyA9IHt9XG4gICAgZl91bnBhY2soaW5mbywgZHYsIDApXG4gICAgcmV0dXJuIHBrdC5pbmZvID0gaW5mb1xuXG4gIGZ1bmN0aW9uIF9iaW5kX2l0ZXJhYmxlKHBrdF9vYmosIGJ1Zl9jbG9uZSkgOjpcbiAgICBjb25zdCB7dHlwZX0gPSBwa3Rfb2JqXG4gICAgY29uc3Qge2lkX3JvdXRlciwgaWRfdGFyZ2V0LCB0dGwsIHRva2VufSA9IHBrdF9vYmpcbiAgICBwa3Rfb2JqLm5leHQgPSBuZXh0XG5cbiAgICBmdW5jdGlvbiBuZXh0KG9wdGlvbnMpIDo6XG4gICAgICBpZiBudWxsID09IG9wdGlvbnMgOjogb3B0aW9ucyA9IHt9XG4gICAgICBjb25zdCBoZWFkZXIgPSBidWZfY2xvbmUuc2xpY2UoKVxuICAgICAgc2VxX25leHQgQCBvcHRpb25zLCBuZXcgRGF0YVZpZXcgQCBoZWFkZXJcbiAgICAgIHJldHVybiBAe30gZG9uZTogISEgb3B0aW9ucy5maW4sIHZhbHVlOiBAe30gLy8gcGt0X29ialxuICAgICAgICBpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHlwZSwgdHRsLCB0b2tlbiwgaGVhZGVyXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihwYWNrZXRQYXJzZXIsIG9wdGlvbnMsIGZyYWdtZW50X3NpemUpIDo6XG4gIGNvbnN0IHtjb25jYXRCdWZmZXJzLCBwYWNrUGFja2V0T2JqLCBwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHBhY2tldFBhcnNlclxuICBmcmFnbWVudF9zaXplID0gTnVtYmVyKGZyYWdtZW50X3NpemUgfHwgODAwMClcbiAgaWYgMTAyNCA+IGZyYWdtZW50X3NpemUgfHwgNjUwMDAgPCBmcmFnbWVudF9zaXplIDo6XG4gICAgdGhyb3cgbmV3IEVycm9yIEAgYEludmFsaWQgZnJhZ21lbnQgc2l6ZTogJHtmcmFnbWVudF9zaXplfWBcblxuICBjb25zdCB7cmFuZG9tX2lkLCBqc29uX3Jldml2ZXIsIGpzb25fcmVwbGFjZXJ9ID0gb3B0aW9uc1xuICByZXR1cm4gQDogcGFja2V0UGFyc2VyLCByYW5kb21faWQsIGpzb25fcGFyc2UsIGpzb25fc3RyaW5naWZ5XG4gICAgY3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIHBhY2tldEZyYWdtZW50c1xuICAgIGJpbmRUcmFuc3BvcnRzXG5cblxuICBmdW5jdGlvbiBqc29uX3BhcnNlKHRleHQpIDo6XG4gICAgcmV0dXJuIEpTT04ucGFyc2UgQCB0ZXh0LCBqc29uX3Jldml2ZXJcbiAgZnVuY3Rpb24ganNvbl9zdHJpbmdpZnkob2JqKSA6OlxuICAgIHJldHVybiBKU09OLnN0cmluZ2lmeSBAIG9iaiwganNvbl9yZXBsYWNlclxuXG5cbiAgZnVuY3Rpb24gY3JlYXRlTXVsdGlwYXJ0KHBrdCwgc2luaykgOjpcbiAgICBsZXQgcGFydHMgPSBbXSwgZmluID0gZmFsc2VcbiAgICByZXR1cm4gQHt9IGZlZWQsIGluZm86IHBrdC5pbmZvXG5cbiAgICBmdW5jdGlvbiBmZWVkKHBrdCkgOjpcbiAgICAgIGxldCBzZXEgPSBwa3QuaW5mby5zZXFcbiAgICAgIGlmIHNlcSA8IDAgOjogZmluID0gdHJ1ZTsgc2VxID0gLXNlcVxuICAgICAgcGFydHNbc2VxLTFdID0gcGt0LmJvZHlfYnVmZmVyKClcblxuICAgICAgaWYgISBmaW4gOjogcmV0dXJuXG4gICAgICBpZiBwYXJ0cy5pbmNsdWRlcyBAIHVuZGVmaW5lZCA6OiByZXR1cm5cblxuICAgICAgY29uc3QgcmVzID0gY29uY2F0QnVmZmVycyhwYXJ0cylcbiAgICAgIHBhcnRzID0gbnVsbFxuICAgICAgcmV0dXJuIHJlc1xuXG4gIGZ1bmN0aW9uIGNyZWF0ZVN0cmVhbShwa3QsIHNpbmspIDo6XG4gICAgbGV0IG5leHQ9MCwgZmluID0gZmFsc2UsIHJzdHJlYW1cbiAgICBjb25zdCBzdGF0ZSA9IEB7fSBmZWVkOiBmZWVkX2luaXQsIGluZm86IHBrdC5pbmZvXG4gICAgcmV0dXJuIHN0YXRlXG5cbiAgICBmdW5jdGlvbiBvbl9lcnJvcihlcnIsIHBrdCkgOjpcbiAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcnN0cmVhbS5vbl9lcnJvciA6OlxuICAgICAgICByZXR1cm4gdm9pZCBjb25zb2xlLndhcm4gQFxuICAgICAgICAgIGBFcnJvciBkdXJpbmcgc3RyZWFtLmZlZWQ6YCwgZXJyXG4gICAgICByZXR1cm4gcnN0cmVhbS5vbl9lcnJvciBAIGVyciwgcGt0XG5cbiAgICBmdW5jdGlvbiBmZWVkX2luaXQocGt0LCBhc19jb250ZW50KSA6OlxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfaWdub3JlXG5cbiAgICAgIGNvbnN0IG1zZyA9IGpzb25fcGFyc2UgQCBwa3QuYm9keV91dGY4KClcbiAgICAgIHJzdHJlYW0gPSBzaW5rLnJlY3ZTdHJlYW0obXNnLCBwa3QuaW5mbylcbiAgICAgIGlmIG51bGwgPT0gcnN0cmVhbSA6OiByZXR1cm5cblxuICAgICAgdHJ5IDo6XG4gICAgICAgIGlmICEgZmVlZF9zZXEocGt0KSA6OiByZXR1cm5cbiAgICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfYm9keVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiBvbl9lcnJvciBAIGVyciwgcGt0XG5cbiAgICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiByc3RyZWFtLm9uX2luaXQgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25faW5pdChtc2csIHBrdClcbiAgICAgIGVsc2UgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cbiAgICBcbiAgICBmdW5jdGlvbiBmZWVkX2JvZHkocGt0LCBhc19jb250ZW50KSA6OlxuICAgICAgbGV0IGRhdGFcbiAgICAgIHRyeSA6OlxuICAgICAgICBpZiAhIGZlZWRfc2VxKHBrdCkgOjogcmV0dXJuXG4gICAgICAgIGRhdGEgPSBhc19jb250ZW50KHBrdClcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gb25fZXJyb3IgQCBlcnIsIHBrdFxuICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuXG4gICAgZnVuY3Rpb24gZmVlZF9pZ25vcmUoKSA6OlxuXG4gICAgZnVuY3Rpb24gZmVlZF9zZXEocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxIDwgMCA6OiBmaW4gPSB0cnVlOyBzZXEgPSAtc2VxXG4gICAgICBpZiBuZXh0ID09PSBzZXEgOjogcmV0dXJuICsrbmV4dFxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfaWdub3JlXG4gICAgICBuZXh0ID0gJ2ludmFsaWQnXG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgUGFja2V0IG91dCBvZiBzZXF1ZW5jZWBcblxuICBmdW5jdGlvbiAqIHBhY2tldEZyYWdtZW50cyhidWYsIG5leHRfaGRyLCBmaW4pIDo6XG4gICAgaWYgbnVsbCA9PSBidWYgOjpcbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKHtmaW59KVxuICAgICAgeWllbGQgb2JqXG4gICAgICByZXR1cm5cblxuICAgIGxldCBpID0gMCwgbGFzdElubmVyID0gYnVmLmJ5dGVMZW5ndGggLSBmcmFnbWVudF9zaXplO1xuICAgIHdoaWxlIGkgPCBsYXN0SW5uZXIgOjpcbiAgICAgIGNvbnN0IGkwID0gaVxuICAgICAgaSArPSBmcmFnbWVudF9zaXplXG5cbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKClcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkwLCBpKVxuICAgICAgeWllbGQgb2JqXG5cbiAgICA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICBvYmouYm9keSA9IGJ1Zi5zbGljZShpKVxuICAgICAgeWllbGQgb2JqXG5cblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRJbXBscyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cykgOjpcbiAgICBjb25zdCBvdXRib3VuZCA9IFtdXG4gICAgb3V0Ym91bmQuY2hvb3NlID0gZnJhbWluZ3MuY2hvb3NlXG5cbiAgICBmb3IgY29uc3QgZnJhbWUgb2YgZnJhbWluZ3MgOjpcbiAgICAgIGNvbnN0IGltcGwgPSBmcmFtZSA/IHRyYW5zcG9ydHNbZnJhbWUudHJhbnNwb3J0XSA6IG51bGxcbiAgICAgIGlmICEgaW1wbCA6OiBjb250aW51ZVxuXG4gICAgICBjb25zdCB7Yml0cywgcGFjaywgdW5wYWNrfSA9IGZyYW1lXG4gICAgICBjb25zdCBwa3RfdHlwZSA9IGhpZ2hiaXRzIHwgYml0c1xuICAgICAgY29uc3Qge3RfcmVjdn0gPSBpbXBsXG5cbiAgICAgIGZ1bmN0aW9uIHBhY2tfaGRyKG9iaikgOjpcbiAgICAgICAgcGFjayhwa3RfdHlwZSwgb2JqKVxuICAgICAgICByZXR1cm4gb2JqXG5cbiAgICAgIGZ1bmN0aW9uIHJlY3ZfbXNnKHBrdCwgc2luaykgOjpcbiAgICAgICAgdW5wYWNrKHBrdClcbiAgICAgICAgcmV0dXJuIHRfcmVjdihwa3QsIHNpbmspXG5cbiAgICAgIHBhY2tfaGRyLnBrdF90eXBlID0gcmVjdl9tc2cucGt0X3R5cGUgPSBwa3RfdHlwZVxuICAgICAgb3V0Ym91bmRbYml0c10gPSBwYWNrX2hkclxuICAgICAgaW5ib3VuZFtwa3RfdHlwZV0gPSByZWN2X21zZ1xuXG4gICAgICBpZiAncHJvZHVjdGlvbicgIT09IHByb2Nlc3MuZW52Lk5PREVfRU5WIDo6XG4gICAgICAgIGNvbnN0IG9wID0gcGFja19oZHIub3AgPSByZWN2X21zZy5vcCA9IGZyYW1lLm9wXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSBAIHBhY2tfaGRyLCAnbmFtZScsIEB7fSB2YWx1ZTogYHBhY2tfaGRyIMKrJHtvcH3Cu2BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcmVjdl9tc2csICduYW1lJywgQHt9IHZhbHVlOiBgcmVjdl9tc2cgwqske29wfcK7YFxuXG4gICAgcmV0dXJuIG91dGJvdW5kXG5cblxuICBmdW5jdGlvbiBiaW5kVHJhbnNwb3J0cyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cykgOjpcbiAgICBjb25zdCBwYWNrQm9keSA9IHRyYW5zcG9ydHMucGFja0JvZHlcbiAgICBjb25zdCBwYWNrU3RyZWFtID0gdHJhbnNwb3J0cy5wYWNrU3RyZWFtXG4gICAgY29uc3Qgb3V0Ym91bmQgPSBiaW5kVHJhbnNwb3J0SW1wbHMoaW5ib3VuZCwgaGlnaGJpdHMsIHRyYW5zcG9ydHMpXG4gICAgY29uc3Qgc3RyZWFtID0gISB0cmFuc3BvcnRzLnN0cmVhbWluZyA/IG51bGwgOlxuICAgICAgJ29iamVjdCcgPT09IHRyYW5zcG9ydHMuc3RyZWFtaW5nLm1vZGVcbiAgICAgICAgPyBiaW5kX3N0cmVhbSBAIG1zZW5kX29iamVjdHNcbiAgICAgICAgOiBiaW5kX3N0cmVhbSBAIG1zZW5kX2J5dGVzXG5cbiAgICByZXR1cm4gQHt9IHNlbmQsIHN0cmVhbVxuXG4gICAgZnVuY3Rpb24gc2VuZChjaGFuLCBvYmosIGJvZHkpIDo6XG4gICAgICBib2R5ID0gcGFja0JvZHkoYm9keSlcbiAgICAgIGlmIGZyYWdtZW50X3NpemUgPCBib2R5LmJ5dGVMZW5ndGggOjpcbiAgICAgICAgaWYgISBvYmoudG9rZW4gOjogb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICAgICAgY29uc3QgbXNlbmQgPSBtc2VuZF9ieXRlcygnbXVsdGlwYXJ0JywgY2hhbiwgb2JqKVxuICAgICAgICByZXR1cm4gQHt9IHNlbnQ6IG1zZW5kIEAgdHJ1ZSwgYm9keVxuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gJ3NpbmdsZSdcbiAgICAgIG9iai5ib2R5ID0gYm9keVxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIHBhY2tfaGRyKG9iailcbiAgICAgIHJldHVybiBAe30gc2VudDogY2hhbiBAIHBrdFxuXG4gICAgZnVuY3Rpb24gbXNlbmRfYnl0ZXModHJhbnNwb3J0LCBjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgIG9iai50cmFuc3BvcnQgPSB0cmFuc3BvcnRcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGxldCB7bmV4dH0gPSBwYWNrX2hkcihvYmopXG4gICAgICBpZiBudWxsICE9PSBtc2cgOjpcbiAgICAgICAgb2JqLmJvZHkgPSBtc2dcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBjaGFuIEAgcGt0XG5cbiAgICAgIHJldHVybiBhc3luYyBmdW5jdGlvbiAoZmluLCBib2R5KSA6OlxuICAgICAgICBpZiBudWxsID09PSBuZXh0IDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgJ1dyaXRlIGFmdGVyIGVuZCdcbiAgICAgICAgbGV0IHJlc1xuICAgICAgICBmb3IgY29uc3Qgb2JqIG9mIHBhY2tldEZyYWdtZW50cyBAIGJvZHksIG5leHQsIGZpbiA6OlxuICAgICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgICByZXMgPSBhd2FpdCBjaGFuIEAgcGt0XG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gcmVzXG5cbiAgICBmdW5jdGlvbiBtc2VuZF9vYmplY3RzKHRyYW5zcG9ydCwgY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICBvYmoudHJhbnNwb3J0ID0gdHJhbnNwb3J0XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBsZXQge25leHR9ID0gcGFja19oZHIob2JqKVxuICAgICAgaWYgbnVsbCAhPT0gbXNnIDo6XG4gICAgICAgIG9iai5ib2R5ID0gbXNnXG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgY2hhbiBAIHBrdFxuXG4gICAgICByZXR1cm4gZnVuY3Rpb24gKGZpbiwgYm9keSkgOjpcbiAgICAgICAgaWYgbnVsbCA9PT0gbmV4dCA6OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvciBAICdXcml0ZSBhZnRlciBlbmQnXG4gICAgICAgIGNvbnN0IG9iaiA9IG5leHQoe2Zpbn0pXG4gICAgICAgIG9iai5ib2R5ID0gYm9keVxuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gICAgZnVuY3Rpb24gYmluZF9zdHJlYW0oc2VuZF9pbXBsKSA6OlxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIHN0cmVhbSAoY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIGlmICdvYmplY3QnICE9PSB0eXBlb2YgbXNnIDo6XG4gICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBzdHJlYW0oKSByZXF1aXJlcyBhIEpTT04gc2VyYWxpemFibGUgbXNnIGZvciBpbml0aWFsIHBhY2tldGBcbiAgICAgICAgbXNnID0ganNvbl9zdHJpbmdpZnkobXNnKVxuICAgICAgICBjb25zdCBtc2VuZCA9IHNlbmRfaW1wbCgnc3RyZWFtaW5nJywgY2hhbiwgb2JqLCBtc2cpXG4gICAgICAgIHdyaXRlLndyaXRlID0gd3JpdGU7IHdyaXRlLmVuZCA9IGVuZFxuICAgICAgICByZXR1cm4gd3JpdGVcblxuICAgICAgICBmdW5jdGlvbiB3cml0ZShjaHVuaykgOjpcbiAgICAgICAgICByZXR1cm4gY2h1bmsgIT0gbnVsbFxuICAgICAgICAgICAgPyBtc2VuZCBAIGZhbHNlLCBwYWNrQm9keSBAIGNodW5rXG4gICAgICAgICAgICA6IG1zZW5kIEAgdHJ1ZVxuXG4gICAgICAgIGZ1bmN0aW9uIGVuZChjaHVuaykgOjpcbiAgICAgICAgICByZXR1cm4gY2h1bmsgIT0gbnVsbFxuICAgICAgICAgICAgPyBtc2VuZCBAIHRydWUsIHBhY2tCb2R5IEAgY2h1bmtcbiAgICAgICAgICAgIDogbXNlbmQgQCB0cnVlXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBqc29uX3Byb3RvY29sKHNoYXJlZCkgOjpcbiAgY29uc3Qge2NyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtLCBqc29uX3BhcnNlLCBqc29uX3N0cmluZ2lmeX0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keVxuICAgIHBhY2tTdHJlYW0oY2h1bmssIGZyYWdtZW50X3NpemUpIDo6XG4gICAgICByZXR1cm4gQFtdIHBhY2tCb2R5KGNodW5rKVxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IGpzb25fcGFyc2UgQCBwa3QuYm9keV91dGY4KCkgfHwgdW5kZWZpbmVkXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgYm9keV9idWYgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBib2R5X2J1ZiA6OlxuICAgICAgICAgIGNvbnN0IG1zZyA9IGpzb25fcGFyc2UgQCB1bnBhY2tfdXRmOChib2R5X2J1ZikgfHwgdW5kZWZpbmVkXG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdvYmplY3QnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICByZXR1cm4gc3RhdGUuZmVlZChwa3QsIHBrdF9hc19uZGpzb24pXG5cbiAgZnVuY3Rpb24gcGFja0JvZHkoYm9keSkgOjpcbiAgICByZXR1cm4gcGFja191dGY4IEAganNvbl9zdHJpbmdpZnkoYm9keSlcblxuICBmdW5jdGlvbiBwa3RfYXNfbmRqc29uKHBrdCkgOjpcbiAgICByZXR1cm4gcGt0LmJvZHlfdXRmOCgpLnNwbGl0KC9cXHJ8XFxufFxcMC8pXG4gICAgICAuZmlsdGVyIEAgbD0+bFxuICAgICAgLm1hcCBAIGpzb25fcGFyc2VcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGJpbmFyeV9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbX0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICBjb25zdCB7YXNCdWZmZXJ9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICByZXR1cm4gQHt9XG4gICAgcGFja0JvZHk6IGFzQnVmZmVyXG4gICAgcGFja1N0cmVhbShjaHVuaywgZnJhZ21lbnRfc2l6ZSkgOjpcbiAgICAgIHJldHVybiBAW10gYXNCdWZmZXIoY2h1bmspXG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0gcGt0LmJvZHlfYnVmZmVyKClcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBtc2cgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2cgOjpcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ2J5dGVzJ1xuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVTdHJlYW1cbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QsIHBrdF9idWZmZXIpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG5mdW5jdGlvbiBwa3RfYnVmZmVyKHBrdCkgOjogcmV0dXJuIHBrdC5ib2R5X2J1ZmZlcigpXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBjb250cm9sX3Byb3RvY29sKGluYm91bmQsIGhpZ2gsIHNoYXJlZCkgOjpcbiAgY29uc3Qge3JhbmRvbV9pZH0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tQYWNrZXRPYmp9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIGNvbnN0IHBpbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgdG9rZW46IHRydWUsIHRyYW5zcG9ydDogJ2RpcmVjdCdcbiAgY29uc3QgcG9uZ19mcmFtZSA9IGZyYW1pbmdzLmNob29zZSBAOiBmcm9tX2lkOiB0cnVlLCBtc2dpZDogdHJ1ZSwgdHJhbnNwb3J0OiAnZGF0YWdyYW0nXG5cbiAgY29uc3QgcG9uZ190eXBlID0gaGlnaHwweGVcbiAgaW5ib3VuZFtwb25nX3R5cGVdID0gcmVjdl9wb25nXG4gIGNvbnN0IHBpbmdfdHlwZSA9IGhpZ2h8MHhmXG4gIGluYm91bmRbaGlnaHwweGZdID0gcmVjdl9waW5nXG5cbiAgcmV0dXJuIEB7fSBzZW5kOnBpbmcsIHBpbmdcblxuICBmdW5jdGlvbiBwaW5nKGNoYW4sIG9iaikgOjpcbiAgICBpZiAhIG9iai50b2tlbiA6OlxuICAgICAgb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICBvYmouYm9keSA9IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICBvcDogJ3BpbmcnLCB0czA6IG5ldyBEYXRlKClcbiAgICBwaW5nX2ZyYW1lLnBhY2socGluZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgZnVuY3Rpb24gcmVjdl9waW5nKHBrdCwgc2luaywgcm91dGVyKSA6OlxuICAgIHBpbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIF9zZW5kX3BvbmcgQCBwa3QuYm9keSwgcGt0LCBzaW5rLCByb3V0ZXJcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiAgZnVuY3Rpb24gX3NlbmRfcG9uZyh7dHMwfSwgcGt0X3BpbmcsIHNpbmssIHJvdXRlcikgOjpcbiAgICBjb25zdCB7bXNnaWQsIGZyb21faWQ6cl9pZH0gPSBwa3RfcGluZy5pbmZvXG4gICAgY29uc3Qge2lkX3JvdXRlciwgaWRfdGFyZ2V0fSA9IHJfaWRcbiAgICBjb25zdCBvYmogPSBAe30gaWRfcm91dGVyLCBpZF90YXJnZXRcbiAgICAgIGZyb21faWQ6IHNpbmsuZnJvbV9pZCwgbXNnaWRcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICAgIG9wOiAncG9uZycsIHRzMCwgdHMxOiBuZXcgRGF0ZSgpXG5cbiAgICBwb25nX2ZyYW1lLnBhY2socG9uZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiByb3V0ZXIuZGlzcGF0Y2ggQCBbcGt0XVxuXG4gIGZ1bmN0aW9uIHJlY3ZfcG9uZyhwa3QsIHNpbmspIDo6XG4gICAgcG9uZ19mcmFtZS51bnBhY2socGt0KVxuICAgIHBrdC5ib2R5ID0gcGt0LmJvZHlfanNvbigpXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcbmltcG9ydCBzaGFyZWRfcHJvdG8gZnJvbSAnLi9zaGFyZWQuanN5J1xuaW1wb3J0IGpzb25fcHJvdG8gZnJvbSAnLi9qc29uLmpzeSdcbmltcG9ydCBiaW5hcnlfcHJvdG8gZnJvbSAnLi9iaW5hcnkuanN5J1xuaW1wb3J0IGNvbnRyb2xfcHJvdG8gZnJvbSAnLi9jb250cm9sLmpzeSdcblxuZXhwb3J0ICogZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gaW5pdF9wcm90b2NvbChwYWNrZXRQYXJzZXIsIG9wdGlvbnMpIDo6XG4gIGNvbnN0IHNoYXJlZCA9IHNoYXJlZF9wcm90byBAIHBhY2tldFBhcnNlciwgb3B0aW9uc1xuXG4gIGNvbnN0IGluYm91bmQgPSBbXVxuICBjb25zdCBqc29uID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MDAgLy8gMHgwKiDigJQgSlNPTiBib2R5XG4gICAganNvbl9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgYmluYXJ5ID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MTAgLy8gMHgxKiDigJQgYmluYXJ5IGJvZHlcbiAgICBiaW5hcnlfcHJvdG8oc2hhcmVkKVxuXG4gIGNvbnN0IGNvbnRyb2wgPSBjb250cm9sX3Byb3RvIEAgaW5ib3VuZCxcbiAgICAweGYwIC8vIDB4Ziog4oCUIGNvbnRyb2xcbiAgICBzaGFyZWRcblxuICBjb25zdCBjb2RlY3MgPSBAOiBqc29uLCBiaW5hcnksIGNvbnRyb2wsIGRlZmF1bHQ6IGpzb25cblxuICBjb25zdCB7cmFuZG9tX2lkfSA9IHNoYXJlZFxuICByZXR1cm4gQDogaW5ib3VuZCwgY29kZWNzLCByYW5kb21faWRcblxuXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBFbmRwb2ludCA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHt9KSA6OlxuICAgIGNsYXNzIEVuZHBvaW50IGV4dGVuZHMgdGhpcyA6OlxuICAgIHJldHVybiBFbmRwb2ludFxuXG4gIHZhbHVlT2YoKSA6OiByZXR1cm4gdGhpcy5mcm9tX2lkXG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRW5kcG9pbnQgJHt0aGlzLmZyb21faWQuaWRfdGFyZ2V0fcK7YFxuXG4gIGNvbnN0cnVjdG9yKG1zZ19jdHgpIDo6XG4gICAgbXNnX2N0eCA9IG1zZ19jdHgud2l0aEVuZHBvaW50KHRoaXMpXG5cbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBfYnlfdG9rZW46IEB7fSB2YWx1ZTogdGhpcy5jcmVhdGVSZXBseU1hcCgpXG4gICAgICBfYnlfdHJhZmZpYzogQHt9IHZhbHVlOiB0aGlzLmNyZWF0ZVRyYWZmaWNNYXAoKVxuICAgICAgZnJvbV9pZDogQHt9IHZhbHVlOiBtc2dfY3R4LmZyb21faWQsIGVudW1lcmFibGU6IHRydWVcbiAgICAgIHRvOiBAe30gdmFsdWU6IG1zZ19jdHgudG9cblxuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpXG4gIGNyZWF0ZVN0YXRlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUmVwbHlNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVUcmFmZmljTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcblxuICBiaW5kU2luayhzaW5rKSA6OlxuICAgIGNvbnN0IGJ5X3Rva2VuID0gdGhpcy5fYnlfdG9rZW5cbiAgICBjb25zdCBieV90cmFmZmljID0gdGhpcy5fYnlfdHJhZmZpY1xuICAgIGNvbnN0IHRyYWZmaWMgPSAoZnJvbV9pZCwgdHJhZmZpYykgPT4gOjpcbiAgICAgIGNvbnN0IHRzID0gRGF0ZS5ub3coKVxuICAgICAgaWYgZnJvbV9pZCA6OlxuICAgICAgICBjb25zdCB0ID0gYnlfdHJhZmZpYy5nZXQoZnJvbV9pZC5pZF90YXJnZXQpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdCA6OlxuICAgICAgICAgIHQudHMgPSB0W2B0c18ke3RyYWZmaWN9YF0gPSB0c1xuICAgICAgdGhpcy5yZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cylcblxuICAgIHJldHVybiBAe31cbiAgICAgIGZyb21faWQ6IHRoaXMuZnJvbV9pZFxuICAgICAgYnlfbXNnaWQ6IHRoaXMuY3JlYXRlU3RhdGVNYXAoKVxuXG4gICAgICByZWN2Q3RybDogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdjdHJsJylcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdkN0cmwobXNnLCBpbmZvKVxuXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUoe3Jtc2csIG1zZywgaW5mb30pLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdk1zZzogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdtc2cnKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2TXNnKG1zZywgaW5mbylcblxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cpLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdlN0cmVhbTogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdzdHJlYW0nKVxuICAgICAgICBjb25zdCByc3RyZWFtID0gdGhpcy5yZWN2U3RyZWFtKG1zZywgaW5mbylcbiAgICAgICAgY29uc3Qgcm1zZyA9IHJzdHJlYW0ub25faW5pdFxuICAgICAgICAgID8gcnN0cmVhbS5vbl9pbml0KG1zZywgaW5mbylcbiAgICAgICAgICA6IHRoaXMucmVjdk1zZyhtc2csIGluZm8pXG5cbiAgICAgICAgaWYgcnN0cmVhbSAhPSBudWxsICYmICdmdW5jdGlvbicgIT09IHR5cGVvZiByc3RyZWFtLm9uX2RhdGEgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIG9iamVjdCB3aXRoIG9uX2RhdGEoZGF0YSwgcGt0KSBmdW5jdGlvbmBcblxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cpLnRoZW4ocmVwbHkpXG4gICAgICAgIHJldHVybiByc3RyZWFtXG5cbiAgcmVjdlRyYWZmaWMoZnJvbV9pZCwgdHJhZmZpYywgdHMpIDo6XG4gIHJlY3ZDdHJsKG1zZywgaW5mbykgOjpcbiAgcmVjdk1zZyhtc2csIGluZm8pIDo6XG4gICAgcmV0dXJuIEB7fSBtc2csIGluZm9cbiAgcmVjdlN0cmVhbShtc2csIGluZm8pIDo6XG4gICAgY29uc29sZS53YXJuIEAgYFVuaGFuZGxlIHJlY3Ygc3RyZWFtOiAke2luZm99YFxuICAgIC8vcmV0dXJuIEB7fVxuICAgIC8vICBvbl9kYXRhKGRhdGEsIHBrdCkgOjpcbiAgICAvLyAgb25fZXJyb3IoZXJyLCBwa3QpIDo6XG5cbiAgaW5pdFJlcGx5KHRva2VuLCBtc2dfY3R4LCBraW5kKSA6OlxuICAgIHJldHVybiB0aGlzLmluaXRSZXBseVByb21pc2UgQCB0b2tlbiwgbXNnX2N0eC5tc190aW1lb3V0XG5cbiAgaW5pdE1vbml0b3IoaWRfdGFyZ2V0KSA6OlxuICAgIGNvbnN0IGtleSA9IGlkX3RhcmdldC5pZF90YXJnZXQgfHwgaWRfdGFyZ2V0XG4gICAgbGV0IG1vbml0b3IgPSB0aGlzLl9ieV90cmFmZmljLmdldCBAIGtleVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gbW9uaXRvciA6OlxuICAgICAgbW9uaXRvciA9IEB7fSBpZF90YXJnZXQsIHRzOiBEYXRlLm5vdygpXG4gICAgICAgIHRkKCkgOjogcmV0dXJuIERhdGUubm93KCkgLSB0aGlzLnRzXG4gICAgICB0aGlzLl9ieV90cmFmZmljLnNldCBAIGtleSwgbW9uaXRvclxuICAgIHJldHVybiBtb25pdG9yXG5cbiAgaW5pdFJlcGx5UHJvbWlzZSh0b2tlbiwgbXNfdGltZW91dCkgOjpcbiAgICBjb25zdCBhbnMgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICB0aGlzLl9ieV90b2tlbi5zZXQgQCB0b2tlbiwgcmVzb2x2ZVxuICAgICAgaWYgbXNfdGltZW91dCA6OlxuICAgICAgICBjb25zdCB0aWQgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIG1zX3RpbWVvdXQpXG4gICAgICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuICAgICAgICBmdW5jdGlvbiB0aW1lb3V0KCkgOjogcmVqZWN0IEAgbmV3IHRoaXMuUmVwbHlUaW1lb3V0XG5cbiAgICByZXR1cm4gc2VudCA9PiA6OlxuICAgICAgYW5zLnNlbnQgPSBzZW50XG4gICAgICByZXR1cm4gYW5zXG5cbmNsYXNzIFJlcGx5VGltZW91dCBleHRlbmRzIEVycm9yIDo6XG5cbk9iamVjdC5hc3NpZ24gQCBFbmRwb2ludC5wcm90b3R5cGUsIEB7fVxuICBSZXBseVRpbWVvdXRcbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIFNpbmsgOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7aW5ib3VuZH0pIDo6XG4gICAgY2xhc3MgU2luayBleHRlbmRzIHRoaXMgOjpcbiAgICBTaW5rLnByb3RvdHlwZS5fcHJvdG9jb2wgPSBpbmJvdW5kXG4gICAgcmV0dXJuIFNpbmtcblxuICBzdGF0aWMgcmVnaXN0ZXIoZW5kcG9pbnQsIGt3X2FyZ3MpIDo6XG4gICAgcmV0dXJuIG5ldyB0aGlzKCkucmVnaXN0ZXIoZW5kcG9pbnQsIGt3X2FyZ3MpXG4gIHJlZ2lzdGVyKGVuZHBvaW50LCB7aHViLCBpZF90YXJnZXQsIG9uX21zZywgb25fZXJyb3J9KSA6OlxuICAgIGNvbnN0IHVucmVnaXN0ZXIgPSAoKSA9PiBodWIucm91dGVyLnVucmVnaXN0ZXJUYXJnZXQoaWRfdGFyZ2V0KVxuXG4gICAgaHViLnJvdXRlci5yZWdpc3RlclRhcmdldCBAIGlkX3RhcmdldCxcbiAgICAgIHRoaXMuX2JpbmREaXNwYXRjaCBAIGVuZHBvaW50LCBvbl9tc2csIG9uX2Vycm9yLCB1bnJlZ2lzdGVyXG4gICAgcmV0dXJuIHRoaXNcblxuICBfYmluZERpc3BhdGNoKGVuZHBvaW50LCBvbl9tc2csIG9uX2Vycm9yLCB1bnJlZ2lzdGVyKSA6OlxuICAgIGxldCBhbGl2ZSA9IHRydWVcbiAgICBjb25zdCBwcm90b2NvbCA9IHRoaXMuX3Byb3RvY29sXG4gICAgY29uc3QgaXNBbGl2ZSA9ICgpID0+IGFsaXZlXG4gICAgY29uc3Qgc2h1dGRvd24gPSAoZXJyKSA9PiA6OlxuICAgICAgaWYgYWxpdmUgOjpcbiAgICAgICAgdW5yZWdpc3RlcigpOyB1bnJlZ2lzdGVyID0gYWxpdmUgPSBmYWxzZVxuICAgICAgICBpZiBlcnIgOjogY29uc29sZS5lcnJvciBAICdFTkRQT0lOVCBTSFVURE9XTjogJyArIGVyclxuXG4gICAgT2JqZWN0LmFzc2lnbiBAIHRoaXMsIGVuZHBvaW50LmJpbmRTaW5rKHRoaXMpLCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cbiAgICBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuXG4gICAgcmV0dXJuIGFzeW5jIChwa3QsIHJvdXRlcikgPT4gOjpcbiAgICAgIGlmIGZhbHNlPT09YWxpdmUgfHwgbnVsbD09cGt0IDo6IHJldHVybiBhbGl2ZVxuXG4gICAgICBjb25zdCByZWN2X21zZyA9IHByb3RvY29sW3BrdC50eXBlXVxuICAgICAgaWYgdW5kZWZpbmVkID09PSByZWN2X21zZyA6OlxuICAgICAgICByZXR1cm4gb25fZXJyb3IgQCBmYWxzZSwgQDogcGt0XG5cbiAgICAgIHRyeSA6OlxuICAgICAgICB2YXIgbXNnID0gYXdhaXQgcmVjdl9tc2cgQCBwa3QsIHRoaXMsIHJvdXRlclxuICAgICAgICBpZiAhIG1zZyA6OiByZXR1cm4gbXNnXG5cbiAgICAgICAgcmV0dXJuIGF3YWl0IG9uX21zZyBAIG1zZywgcGt0XG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgaWYgZmFsc2UgIT09IG9uX2Vycm9yKGVyciwge21zZywgcGt0fSkgOjpcbiAgICAgICAgICBlbmRwb2ludC5zaHV0ZG93bihlcnIsIHttc2csIHBrdH0pXG5cbiAgc3RhdGVGb3IocGt0LCBpZkFic2VudCkgOjpcbiAgICBjb25zdCBtc2dpZCA9IHBrdC5pbmZvLm1zZ2lkXG4gICAgbGV0IGVudHJ5ID0gdGhpcy5ieV9tc2dpZC5nZXQobXNnaWQpXG4gICAgaWYgdW5kZWZpbmVkID09PSBlbnRyeSA6OlxuICAgICAgaWYgISBtc2dpZCA6OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgSW52YWxpZCBtc2dpZDogJHttc2dpZH1gXG4gICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgaWZBYnNlbnQgOjpcbiAgICAgICAgZW50cnkgPSBpZkFic2VudChwa3QsIHRoaXMpXG4gICAgICBlbHNlIGVudHJ5ID0gaWZBYnNlbnRcbiAgICAgIHRoaXMuYnlfbXNnaWQuc2V0IEAgbXNnaWQsIGVudHJ5XG4gICAgcmV0dXJuIGVudHJ5XG5cbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIE1zZ0N0eCA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtyYW5kb21faWQsIGNvZGVjc30pIDo6XG4gICAgY2xhc3MgTXNnQ3R4IGV4dGVuZHMgdGhpcyA6OlxuICAgIE1zZ0N0eC5wcm90b3R5cGUucmFuZG9tX2lkID0gcmFuZG9tX2lkXG4gICAgTXNnQ3R4LndpdGhDb2RlY3MgQCBjb2RlY3NcbiAgICByZXR1cm4gTXNnQ3R4XG5cbiAgY29uc3RydWN0b3IoZnJvbV9pZCwgcmVzb2x2ZVJvdXRlKSA6OlxuICAgIGlmIG51bGwgIT09IGZyb21faWQgOjpcbiAgICAgIGNvbnN0IHtpZF90YXJnZXQsIGlkX3JvdXRlcn0gPSBmcm9tX2lkXG4gICAgICBmcm9tX2lkID0gT2JqZWN0LmZyZWV6ZSBAOiBpZF90YXJnZXQsIGlkX3JvdXRlclxuXG4gICAgY29uc3QgY3R4ID0ge2Zyb21faWR9XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAOlxuICAgICAgX3Jvb3RfOiBAOiB2YWx1ZTogdGhpc1xuICAgICAgZnJvbV9pZDogQDogdmFsdWU6IGZyb21faWRcbiAgICAgIGN0eDogQDogdmFsdWU6IGN0eFxuICAgICAgcmVzb2x2ZVJvdXRlOiBAOiB2YWx1ZTogcmVzb2x2ZVJvdXRlXG5cbiAgd2l0aEVuZHBvaW50KGVuZHBvaW50KSA6OlxuICAgIHJldHVybiBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEB7fVxuICAgICAgZW5kcG9pbnQ6IEB7fSB2YWx1ZTogZW5kcG9pbnRcblxuICBzdGF0aWMgZnJvbShpZF90YXJnZXQsIGh1YikgOjpcbiAgICBjb25zdCBmcm9tX2lkID0gbnVsbCA9PT0gaWRfdGFyZ2V0ID8gbnVsbFxuICAgICAgOiBAe30gaWRfdGFyZ2V0LCBpZF9yb3V0ZXI6IGh1Yi5yb3V0ZXIuaWRfc2VsZlxuICAgIHJldHVybiBuZXcgdGhpcyBAIGZyb21faWQsIGh1Yi5iaW5kUm91dGVEaXNwYXRjaCgpXG5cbiAgZ2V0IHRvKCkgOjogcmV0dXJuICguLi5hcmdzKSA9PiB0aGlzLmNsb25lKCkud2l0aCBAIC4uLmFyZ3NcblxuICBwaW5nKHRva2VuPXRydWUpIDo6IHJldHVybiB0aGlzLmNvZGVjKCdjb250cm9sJywge3Rva2VufSkuaW52b2tlIEAgJ3BpbmcnXG4gIHNlbmQoLi4uYXJncykgOjogcmV0dXJuIHRoaXMuaW52b2tlIEAgJ3NlbmQnLCAuLi5hcmdzXG4gIHN0cmVhbSguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5pbnZva2UgQCAnc3RyZWFtJywgLi4uYXJnc1xuXG4gIGludm9rZShrZXksIC4uLmFyZ3MpIDo6XG4gICAgY29uc3Qgb2JqID0gT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eFxuICAgIHRoaXMuYXNzZXJ0TW9uaXRvcigpXG4gICAgY29uc3QgY2hhbiA9IHRoaXMucmVzb2x2ZVJvdXRlKG9iai5pZF9yb3V0ZXIpXG4gICAgaWYgdHJ1ZSAhPT0gb2JqLnRva2VuIDo6XG4gICAgICByZXR1cm4gdGhpcy5fY29kZWNba2V5XSBAIGNoYW4sIG9iaiwgLi4uYXJnc1xuXG4gICAgZWxzZSA6OlxuICAgICAgY29uc3QgdG9rZW4gPSBvYmoudG9rZW4gPSB0aGlzLnJhbmRvbV9pZCgpXG4gICAgICBjb25zdCByZXBseSA9IHRoaXMuZW5kcG9pbnQuaW5pdFJlcGx5KHRva2VuLCB0aGlzLCBrZXkpXG4gICAgICByZXR1cm4gcmVwbHkgQCB0aGlzLl9jb2RlY1trZXldIEAgY2hhbiwgb2JqLCAuLi5hcmdzXG5cblxuICB3aXRoKC4uLmFyZ3MpIDo6XG4gICAgY29uc3QgY3R4ID0gdGhpcy5jdHhcbiAgICBmb3IgbGV0IHRndCBvZiBhcmdzIDo6XG4gICAgICBpZiAnbnVtYmVyJyA9PT0gdHlwZW9mIHRndCA6OlxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gdGd0XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBjdHguZnJvbV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgY29udGludWVcblxuICAgICAgY29uc3Qge2Zyb21faWQ6IHJlcGx5X2lkLCBpZF90YXJnZXQsIGlkX3JvdXRlciwgdG9rZW4sIG1zZ2lkfSA9IHRndFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IGlkX3RhcmdldCA6OlxuICAgICAgICBpZiB1bmRlZmluZWQgPT09IGlkX3JvdXRlciA6OlxuICAgICAgICAgIGlmICEgY3R4LmlkX3JvdXRlciA6OlxuICAgICAgICAgICAgLy8gaW1wbGljaXRseSBvbiB0aGUgc2FtZSByb3V0ZXJcbiAgICAgICAgICAgIGN0eC5pZF9yb3V0ZXIgPSBjdHguZnJvbV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgZWxzZSBjdHguaWRfcm91dGVyID0gaWRfcm91dGVyXG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSBpZF90YXJnZXRcbiAgICAgIGVsc2UgaWYgdW5kZWZpbmVkICE9PSBpZF9yb3V0ZXIgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFBhc3NpbmcgJ2lkX3JvdXRlcicgcmVxdWlyZXMgJ2lkX3RhcmdldCdgXG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHlfaWQgJiYgISBjdHguaWRfdGFyZ2V0IDo6XG4gICAgICAgIGN0eC5pZF9yb3V0ZXIgPSByZXBseV9pZC5pZF9yb3V0ZXJcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHJlcGx5X2lkLmlkX3RhcmdldFxuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IHRva2VuIDo6IGN0eC50b2tlbiA9IHRva2VuXG4gICAgICBpZiB1bmRlZmluZWQgIT09IG1zZ2lkIDo6IGN0eC5tc2dpZCA9IG1zZ2lkXG5cbiAgICByZXR1cm4gdGhpc1xuXG4gIHdpdGhSZXBseSgpIDo6XG4gICAgcmV0dXJuIHRoaXMuY2xvbmUgQDogdG9rZW46IHRydWVcblxuICByZXNldCguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcy5fcm9vdF8sIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuICBjbG9uZSguLi5hcmdzKSA6OlxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQHt9XG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cblxuICBhc3NlcnRNb25pdG9yKCkgOjpcbiAgICBpZiAhIHRoaXMuY2hlY2tNb25pdG9yKCkgOjpcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBUYXJnZXQgbW9uaXRvciBleHBpcmVkYFxuICBjaGVja01vbml0b3IoKSA6OiByZXR1cm4gdHJ1ZVxuICBtb25pdG9yKG9wdGlvbnM9e30pIDo6XG4gICAgaWYgdHJ1ZSA9PT0gb3B0aW9ucyB8fCBmYWxzZSA9PT0gb3B0aW9ucyA6OlxuICAgICAgb3B0aW9ucyA9IEB7fSBhY3RpdmU6IG9wdGlvbnNcblxuICAgIGNvbnN0IG1vbml0b3IgPSB0aGlzLmVuZHBvaW50LmluaXRNb25pdG9yKHRoaXMuY3R4LmlkX3RhcmdldClcblxuICAgIGNvbnN0IHRzX2R1cmF0aW9uID0gb3B0aW9ucy50c19kdXJhdGlvbiB8fCA1MDAwXG4gICAgbGV0IHRzX2FjdGl2ZSA9IG9wdGlvbnMudHNfYWN0aXZlXG4gICAgaWYgdHJ1ZSA9PT0gdHNfYWN0aXZlIDo6XG4gICAgICB0c19hY3RpdmUgPSB0c19kdXJhdGlvbi80XG5cbiAgICBsZXQgY2hlY2tNb25pdG9yXG4gICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIGNvbnN0IGRvbmUgPSBvcHRpb25zLnJlamVjdCA/IHJlamVjdCA6IHJlc29sdmVcbiAgICAgIHRoaXMuY2hlY2tNb25pdG9yID0gY2hlY2tNb25pdG9yID0gKCkgPT5cbiAgICAgICAgdHNfZHVyYXRpb24gPiBtb25pdG9yLnRkKClcbiAgICAgICAgICA/IHRydWUgOiAoZG9uZShtb25pdG9yKSwgZmFsc2UpXG5cbiAgICBsZXQgdGlkXG4gICAgY29uc3QgdHNfaW50ZXJ2YWwgPSB0c19hY3RpdmUgfHwgdHNfZHVyYXRpb24vNFxuICAgIGlmIG9wdGlvbnMuYWN0aXZlIHx8IHRzX2FjdGl2ZSA6OlxuICAgICAgY29uc3QgY3RybCA9IHRoaXMuY29kZWMoJ2NvbnRyb2wnKVxuICAgICAgY29uc3QgY2hlY2tQaW5nID0gKCkgPT4gOjpcbiAgICAgICAgaWYgdHNfaW50ZXJ2YWwgPiBtb25pdG9yLnRkKCkgOjpcbiAgICAgICAgICBjdHJsLmludm9rZSgncGluZycpXG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrUGluZywgdHNfaW50ZXJ2YWxcbiAgICBlbHNlIDo6XG4gICAgICB0aWQgPSBzZXRJbnRlcnZhbCBAIGNoZWNrTW9uaXRvciwgdHNfaW50ZXJ2YWxcbiAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcbiAgICBjb25zdCBjbGVhciA9ICgpID0+IGNsZWFySW50ZXJ2YWwodGlkKVxuXG4gICAgcHJvbWlzZS50aGVuKGNsZWFyLCBjbGVhcilcbiAgICByZXR1cm4gcHJvbWlzZVxuXG5cbiAgY29kZWMobXNnX2NvZGVjLCAuLi5hcmdzKSA6OlxuICAgIGlmICdzdHJpbmcnID09PSB0eXBlb2YgbXNnX2NvZGVjIDo6XG4gICAgICBtc2dfY29kZWMgPSB0aGlzLl9tc2dDb2RlY3NbbXNnX2NvZGVjXVxuXG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG1zZ19jb2RlYy5zZW5kIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBhY2tldCBjb2RlYyBwcm90b2NvbGBcblxuICAgIHJldHVybiBPYmplY3QuY3JlYXRlIEAgdGhpcywgQDpcbiAgICAgIF9jb2RlYzogQDogdmFsdWU6IG1zZ19jb2RlY1xuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG4gIHN0YXRpYyB3aXRoQ29kZWNzKG1zZ0NvZGVjcykgOjpcbiAgICBmb3IgY29uc3QgW25hbWUsIG1zZ19jb2RlY10gb2YgT2JqZWN0LmVudHJpZXMgQCBtc2dDb2RlY3MgOjpcbiAgICAgIHRoaXMucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSA6OlxuICAgICAgICByZXR1cm4gdGhpcy5jb2RlYyBAIG1zZ19jb2RlY1xuICAgIHRoaXMucHJvdG90eXBlLl9tc2dDb2RlY3MgPSBtc2dDb2RlY3NcbiAgICB0aGlzLnByb3RvdHlwZS5fY29kZWMgPSBtc2dDb2RlY3MuZGVmYXVsdFxuICAgIHJldHVybiB0aGlzXG5cbk9iamVjdC5hc3NpZ24gQCBNc2dDdHgucHJvdG90eXBlLCBAe31cbiAgbXNfdGltZW91dDogNTAwMFxuXG4iLCJpbXBvcnQgaW5pdF9wcm90b2NvbCBmcm9tICcuL3Byb3RvY29sL2luZGV4LmpzeSdcbmltcG9ydCBFbmRwb2ludEJhc2UgZnJvbSAnLi9lbmRwb2ludC5qc3knXG5pbXBvcnQgU2lua0Jhc2UgZnJvbSAnLi9zaW5rLmpzeSdcbmltcG9ydCBNc2dDdHhCYXNlIGZyb20gJy4vbXNnY3R4LmpzeSdcblxuY29uc3QgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyA9IEA6XG4gIG9uX2Vycm9yOiBjb25zb2xlLmVycm9yXG4gIHN1YmNsYXNzKHtTaW5rLCBFbmRwb2ludCwgU291cmNlRW5kcG9pbnQsIHByb3RvY29sc30pIDo6XG5cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGx1Z2luX29wdGlvbnMpIDo6XG4gIHBsdWdpbl9vcHRpb25zID0gT2JqZWN0LmFzc2lnbiBAIHt9LCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zLCBwbHVnaW5fb3B0aW9uc1xuICBjb25zdCBAe31cbiAgICByYW5kb21faWQsIGpzb25fcmV2aXZlciwganNvbl9yZXBsYWNlclxuICAgIG9uX2Vycm9yOiBkZWZhdWx0X29uX2Vycm9yXG4gID0gcGx1Z2luX29wdGlvbnNcblxuICByZXR1cm4gQDogb3JkZXI6IDEsIHN1YmNsYXNzLCBwb3N0XG4gIFxuICBmdW5jdGlvbiBzdWJjbGFzcyhGYWJyaWNIdWJfUEksIGJhc2VzKSA6OlxuICAgIGNvbnN0IHtwYWNrZXRQYXJzZXJ9ID0gRmFicmljSHViX1BJLnByb3RvdHlwZVxuICAgIGlmIG51bGw9PXBhY2tldFBhcnNlciB8fCAhIHBhY2tldFBhcnNlci5pc1BhY2tldFBhcnNlcigpIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEludmFsaWQgcGFja2V0UGFyc2VyIGZvciBwbHVnaW5gXG4gICAgXG4gICAgRmFicmljSHViX1BJLnByb3RvdHlwZS5lbmRwb2ludCA9XG4gICAgICBiaW5kRW5kcG9pbnRBcGkgQCBwYWNrZXRQYXJzZXJcblxuICBmdW5jdGlvbiBwb3N0KGh1YikgOjpcbiAgICByZXR1cm4gaHViLmVuZHBvaW50ID0gaHViLmVuZHBvaW50KGh1YilcblxuICBmdW5jdGlvbiBiaW5kRW5kcG9pbnRBcGkocGFja2V0UGFyc2VyKSA6OlxuICAgIGNvbnN0IHByb3RvY29scyA9IGluaXRfcHJvdG9jb2wgQCBwYWNrZXRQYXJzZXIsIEB7fSByYW5kb21faWQsIGpzb25fcmV2aXZlciwganNvbl9yZXBsYWNlclxuICAgIGNvbnN0IFNpbmsgPSBTaW5rQmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgIGNvbnN0IE1zZ0N0eCA9IE1zZ0N0eEJhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICBjb25zdCBFbmRwb2ludCA9IEVuZHBvaW50QmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuXG4gICAgcGx1Z2luX29wdGlvbnMuc3ViY2xhc3MgQDpcbiAgICAgIFNpbmssIEVuZHBvaW50LCBNc2dDdHgsIHByb3RvY29sc1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGh1YikgOjpcbiAgICAgIHJldHVybiBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEA6IGNyZWF0ZTogZW5kcG9pbnQsIHNlcnZlcjogZW5kcG9pbnQsIGNsaWVudFxuXG4gICAgICBmdW5jdGlvbiBjbGllbnQoLi4uYXJncykgOjpcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IE1zZ0N0eC5mcm9tIEAgbnVsbCwgaHViXG4gICAgICAgIHJldHVybiAwICE9PSBhcmdzLmxlbmd0aFxuICAgICAgICAgID8gbXNnX2N0eC53aXRoKC4uLmFyZ3MpIDogbXNnX2N0eFxuXG4gICAgICBmdW5jdGlvbiBlbmRwb2ludChvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCBpZF90YXJnZXQgPSByYW5kb21faWQoKVxuICAgICAgICBjb25zdCBtc2dfY3R4ID0gTXNnQ3R4LmZyb20gQCBpZF90YXJnZXQsIGh1YlxuICAgICAgICBjb25zdCBlcCA9IG5ldyBFbmRwb2ludChtc2dfY3R4KVxuXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IG9uX2luaXQoZXApXG4gICAgICAgIGNvbnN0IG9uX21zZyA9ICh0YXJnZXQub25fbXNnIHx8IHRhcmdldCkuYmluZCh0YXJnZXQpXG4gICAgICAgIGNvbnN0IG9uX2Vycm9yID0gKHRhcmdldC5vbl9lcnJvciB8fCBkZWZhdWx0X29uX2Vycm9yKS5iaW5kKHRhcmdldClcblxuICAgICAgICBTaW5rLnJlZ2lzdGVyIEAgZXAsIEB7fVxuICAgICAgICAgIGh1YiwgaWRfdGFyZ2V0LCBvbl9tc2csIG9uX2Vycm9yXG5cbiAgICAgICAgaWYgdGFyZ2V0Lm9uX3JlYWR5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHRhcmdldCkudGhlbiBAXG4gICAgICAgICAgICB0YXJnZXQgPT4gdGFyZ2V0Lm9uX3JlYWR5KClcblxuICAgICAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIGVuZHBvaW50X3RhcmdldF9hcGksIEA6XG4gICAgICAgICAgaWRfcm91dGVyOiBAe30gZW51bWVyYWJsZTogdHJ1ZSwgdmFsdWU6IGh1Yi5yb3V0ZXIuaWRfc2VsZlxuICAgICAgICAgIGlkX3RhcmdldDogQHt9IGVudW1lcmFibGU6IHRydWUsIHZhbHVlOiBpZF90YXJnZXRcblxuY29uc3QgZW5kcG9pbnRfdGFyZ2V0X2FwaSA9IEA6XG4gIHZhbHVlT2YoKSA6OiByZXR1cm4gMCB8IHRoaXMuaWRfdGFyZ2V0XG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRW5kcG9pbnQgVGFyZ2V0ICR7dGhpcy5pZF90YXJnZXR9wrtgXG5cbiIsImltcG9ydCBlbmRwb2ludF9wbHVnaW4gZnJvbSAnLi9wbHVnaW4uanN5J1xuXG5jb25zdCBnZXRSYW5kb21WYWx1ZXMgPSAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIHdpbmRvd1xuICA/IHdpbmRvdy5jcnlwdG8uZ2V0UmFuZG9tVmFsdWVzIDogbnVsbFxuXG5lbmRwb2ludF9icm93c2VyLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuZnVuY3Rpb24gcmFuZG9tX2lkKCkgOjpcbiAgY29uc3QgYXJyID0gbmV3IEludDMyQXJyYXkoMSlcbiAgZ2V0UmFuZG9tVmFsdWVzKGFycilcbiAgcmV0dXJuIGFyclswXVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBlbmRwb2ludF9icm93c2VyKHBsdWdpbl9vcHRpb25zPXt9KSA6OlxuICBpZiBudWxsID09IHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA6OlxuICAgIHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuXG4gIHJldHVybiBlbmRwb2ludF9wbHVnaW4ocGx1Z2luX29wdGlvbnMpXG5cbiJdLCJuYW1lcyI6WyJsaXR0bGVfZW5kaWFuIiwiY19zaW5nbGUiLCJjX2RhdGFncmFtIiwiY19kaXJlY3QiLCJjX211bHRpcGFydCIsImNfc3RyZWFtaW5nIiwiX2Vycl9tc2dpZF9yZXF1aXJlZCIsIl9lcnJfdG9rZW5fcmVxdWlyZWQiLCJmcm1fcm91dGluZyIsInNpemUiLCJiaXRzIiwibWFzayIsIm9iaiIsImZyb21faWQiLCJkdiIsIm9mZnNldCIsInNldEludDMyIiwiaWRfcm91dGVyIiwiaWRfdGFyZ2V0IiwidW5kZWZpbmVkIiwiZ2V0SW50MzIiLCJmcm1fcmVzcG9uc2UiLCJtc2dpZCIsIkVycm9yIiwic2V0SW50MTYiLCJzZXFfYWNrIiwiYWNrX2ZsYWdzIiwidG9rZW4iLCJnZXRJbnQxNiIsImZybV9kYXRhZ3JhbSIsInRyYW5zcG9ydCIsImZybV9kaXJlY3QiLCJmcm1fbXVsdGlwYXJ0Iiwic2VxX3BvcyIsInNlcSIsInNlcV9mbGFncyIsImZybV9zdHJlYW1pbmciLCJiaW5kX3NlcV9uZXh0Iiwic2VxX29mZnNldCIsInNlcV9uZXh0IiwiZmxhZ3MiLCJmaW4iLCJOYU4iLCJjb21wb3NlRnJhbWluZ3MiLCJmcm1fZnJvbSIsImZybV9yZXNwIiwiZnJtX3RyYW5zcG9ydHMiLCJsZW5ndGgiLCJieUJpdHMiLCJ0X2Zyb20iLCJmX3Rlc3QiLCJ0X3Jlc3AiLCJ0MCIsInQxIiwidDIiLCJ0MyIsIm1hcCIsImYiLCJ0ZXN0Qml0cyIsImNob29zZSIsImxzdCIsIlQiLCJiIiwib3AiLCJmbl9rZXkiLCJmbl90cmFuIiwiZm5fZnJvbSIsImZuX3Jlc3AiLCJmcm0iLCJiaW5kQXNzZW1ibGVkIiwiZl9wYWNrIiwiZl91bnBhY2siLCJwYWNrIiwidW5wYWNrIiwicGt0X3R5cGUiLCJwa3Rfb2JqIiwiVHlwZUVycm9yIiwidHlwZSIsIkRhdGFWaWV3IiwiQXJyYXlCdWZmZXIiLCJoZWFkZXIiLCJidWZmZXIiLCJzbGljZSIsInBrdCIsImJ1ZiIsImhlYWRlcl9idWZmZXIiLCJVaW50OEFycmF5IiwiaW5mbyIsIl9iaW5kX2l0ZXJhYmxlIiwiYnVmX2Nsb25lIiwidHRsIiwibmV4dCIsIm9wdGlvbnMiLCJkb25lIiwidmFsdWUiLCJwYWNrZXRQYXJzZXIiLCJmcmFnbWVudF9zaXplIiwiY29uY2F0QnVmZmVycyIsInBhY2tQYWNrZXRPYmoiLCJwYWNrX3V0ZjgiLCJ1bnBhY2tfdXRmOCIsIk51bWJlciIsInJhbmRvbV9pZCIsImpzb25fcmV2aXZlciIsImpzb25fcmVwbGFjZXIiLCJqc29uX3BhcnNlIiwianNvbl9zdHJpbmdpZnkiLCJjcmVhdGVTdHJlYW0iLCJwYWNrZXRGcmFnbWVudHMiLCJ0ZXh0IiwiSlNPTiIsInBhcnNlIiwic3RyaW5naWZ5IiwiY3JlYXRlTXVsdGlwYXJ0Iiwic2luayIsInBhcnRzIiwiZmVlZCIsImJvZHlfYnVmZmVyIiwiaW5jbHVkZXMiLCJyZXMiLCJyc3RyZWFtIiwic3RhdGUiLCJmZWVkX2luaXQiLCJvbl9lcnJvciIsImVyciIsImNvbnNvbGUiLCJ3YXJuIiwiYXNfY29udGVudCIsImZlZWRfaWdub3JlIiwibXNnIiwiYm9keV91dGY4IiwicmVjdlN0cmVhbSIsImZlZWRfc2VxIiwiZmVlZF9ib2R5Iiwib25faW5pdCIsInJlY3ZNc2ciLCJkYXRhIiwib25fZGF0YSIsIm5leHRfaGRyIiwiaSIsImxhc3RJbm5lciIsImJ5dGVMZW5ndGgiLCJpMCIsImJvZHkiLCJiaW5kVHJhbnNwb3J0SW1wbHMiLCJpbmJvdW5kIiwiaGlnaGJpdHMiLCJ0cmFuc3BvcnRzIiwib3V0Ym91bmQiLCJmcmFtaW5ncyIsImZyYW1lIiwiaW1wbCIsInRfcmVjdiIsInBhY2tfaGRyIiwicmVjdl9tc2ciLCJiaW5kVHJhbnNwb3J0cyIsInBhY2tCb2R5Iiwic3RyZWFtIiwic3RyZWFtaW5nIiwibW9kZSIsImJpbmRfc3RyZWFtIiwibXNlbmRfb2JqZWN0cyIsIm1zZW5kX2J5dGVzIiwic2VuZCIsImNoYW4iLCJtc2VuZCIsInNlbnQiLCJzZW5kX2ltcGwiLCJ3cml0ZSIsImVuZCIsImNodW5rIiwianNvbl9wcm90b2NvbCIsInNoYXJlZCIsImRhdGFncmFtIiwiZGlyZWN0Iiwic3RhdGVGb3IiLCJib2R5X2J1ZiIsInBrdF9hc19uZGpzb24iLCJzcGxpdCIsImZpbHRlciIsImwiLCJiaW5hcnlfcHJvdG9jb2wiLCJhc0J1ZmZlciIsInBrdF9idWZmZXIiLCJjb250cm9sX3Byb3RvY29sIiwiaGlnaCIsInBpbmdfZnJhbWUiLCJwb25nX2ZyYW1lIiwicG9uZ190eXBlIiwicmVjdl9wb25nIiwicGluZ190eXBlIiwicmVjdl9waW5nIiwicGluZyIsInRzMCIsIkRhdGUiLCJyb3V0ZXIiLCJib2R5X2pzb24iLCJyZWN2Q3RybCIsIl9zZW5kX3BvbmciLCJwa3RfcGluZyIsInJfaWQiLCJ0czEiLCJkaXNwYXRjaCIsImluaXRfcHJvdG9jb2wiLCJzaGFyZWRfcHJvdG8iLCJqc29uIiwianNvbl9wcm90byIsImJpbmFyeSIsImJpbmFyeV9wcm90byIsImNvbnRyb2wiLCJjb250cm9sX3Byb3RvIiwiY29kZWNzIiwiZGVmYXVsdCIsIkVuZHBvaW50IiwiZm9yUHJvdG9jb2xzIiwibXNnX2N0eCIsIndpdGhFbmRwb2ludCIsImRlZmluZVByb3BlcnRpZXMiLCJjcmVhdGVSZXBseU1hcCIsImNyZWF0ZVRyYWZmaWNNYXAiLCJlbnVtZXJhYmxlIiwidG8iLCJNYXAiLCJjcmVhdGVNYXAiLCJieV90b2tlbiIsIl9ieV90b2tlbiIsImJ5X3RyYWZmaWMiLCJfYnlfdHJhZmZpYyIsInRyYWZmaWMiLCJ0cyIsIm5vdyIsInQiLCJnZXQiLCJyZWN2VHJhZmZpYyIsImNyZWF0ZVN0YXRlTWFwIiwicm1zZyIsInJlcGx5IiwicmVzb2x2ZSIsInRoZW4iLCJpbml0UmVwbHkiLCJraW5kIiwiaW5pdFJlcGx5UHJvbWlzZSIsIm1zX3RpbWVvdXQiLCJrZXkiLCJtb25pdG9yIiwic2V0IiwiYW5zIiwiUHJvbWlzZSIsInJlamVjdCIsInRpZCIsInNldFRpbWVvdXQiLCJ0aW1lb3V0IiwidW5yZWYiLCJSZXBseVRpbWVvdXQiLCJPYmplY3QiLCJhc3NpZ24iLCJwcm90b3R5cGUiLCJTaW5rIiwiX3Byb3RvY29sIiwicmVnaXN0ZXIiLCJlbmRwb2ludCIsImt3X2FyZ3MiLCJodWIiLCJvbl9tc2ciLCJ1bnJlZ2lzdGVyIiwidW5yZWdpc3RlclRhcmdldCIsInJlZ2lzdGVyVGFyZ2V0IiwiX2JpbmREaXNwYXRjaCIsImFsaXZlIiwicHJvdG9jb2wiLCJpc0FsaXZlIiwic2h1dGRvd24iLCJlcnJvciIsImJpbmRTaW5rIiwiaWZBYnNlbnQiLCJlbnRyeSIsImJ5X21zZ2lkIiwiTXNnQ3R4Iiwid2l0aENvZGVjcyIsInJlc29sdmVSb3V0ZSIsImZyZWV6ZSIsImN0eCIsImZyb20iLCJpZF9zZWxmIiwiYmluZFJvdXRlRGlzcGF0Y2giLCJhcmdzIiwiY2xvbmUiLCJ3aXRoIiwiY29kZWMiLCJpbnZva2UiLCJhc3NlcnRNb25pdG9yIiwiX2NvZGVjIiwidGd0IiwicmVwbHlfaWQiLCJjcmVhdGUiLCJfcm9vdF8iLCJjaGVja01vbml0b3IiLCJhY3RpdmUiLCJpbml0TW9uaXRvciIsInRzX2R1cmF0aW9uIiwidHNfYWN0aXZlIiwicHJvbWlzZSIsInRkIiwidHNfaW50ZXJ2YWwiLCJjdHJsIiwiY2hlY2tQaW5nIiwic2V0SW50ZXJ2YWwiLCJjbGVhciIsImNsZWFySW50ZXJ2YWwiLCJtc2dfY29kZWMiLCJfbXNnQ29kZWNzIiwibXNnQ29kZWNzIiwibmFtZSIsImVudHJpZXMiLCJkZWZhdWx0X3BsdWdpbl9vcHRpb25zIiwiU291cmNlRW5kcG9pbnQiLCJwcm90b2NvbHMiLCJwbHVnaW5fb3B0aW9ucyIsImRlZmF1bHRfb25fZXJyb3IiLCJvcmRlciIsInN1YmNsYXNzIiwicG9zdCIsIkZhYnJpY0h1Yl9QSSIsImJhc2VzIiwiaXNQYWNrZXRQYXJzZXIiLCJiaW5kRW5kcG9pbnRBcGkiLCJTaW5rQmFzZSIsIk1zZ0N0eEJhc2UiLCJFbmRwb2ludEJhc2UiLCJzZXJ2ZXIiLCJjbGllbnQiLCJlcCIsInRhcmdldCIsImJpbmQiLCJvbl9yZWFkeSIsImVuZHBvaW50X3RhcmdldF9hcGkiLCJnZXRSYW5kb21WYWx1ZXMiLCJ3aW5kb3ciLCJjcnlwdG8iLCJlbmRwb2ludF9icm93c2VyIiwiYXJyIiwiSW50MzJBcnJheSIsImVuZHBvaW50X3BsdWdpbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQSxNQUFNQSxnQkFBZ0IsSUFBdEI7QUFDQSxNQUFNQyxXQUFXLFFBQWpCO0FBQ0EsTUFBTUMsYUFBYSxVQUFuQjtBQUNBLE1BQU1DLFdBQVcsUUFBakI7QUFDQSxNQUFNQyxjQUFjLFdBQXBCO0FBQ0EsTUFBTUMsY0FBYyxXQUFwQjs7QUFFQSxNQUFNQyxzQkFBdUIsMEJBQTdCO0FBQ0EsTUFBTUMsc0JBQXVCLDJCQUE3Qjs7QUFHQSxTQUFTQyxXQUFULEdBQXVCO1FBQ2ZDLE9BQU8sQ0FBYjtRQUFnQkMsT0FBTyxHQUF2QjtRQUE0QkMsT0FBTyxHQUFuQztTQUNPO1FBQUEsRUFDQ0QsSUFERCxFQUNPQyxJQURQOztXQUdFQyxHQUFQLEVBQVk7YUFBVSxRQUFRQSxJQUFJQyxPQUFaLEdBQXNCSCxJQUF0QixHQUE2QixLQUFwQztLQUhWOztXQUtFRSxHQUFQLEVBQVlFLEVBQVosRUFBZ0JDLE1BQWhCLEVBQXdCO1lBQ2hCLEVBQUNGLE9BQUQsS0FBWUQsR0FBbEI7U0FDR0ksUUFBSCxDQUFjLElBQUVELE1BQWhCLEVBQXdCLElBQUVGLFFBQVFJLFNBQWxDLEVBQTZDakIsYUFBN0M7U0FDR2dCLFFBQUgsQ0FBYyxJQUFFRCxNQUFoQixFQUF3QixJQUFFRixRQUFRSyxTQUFsQyxFQUE2Q2xCLGFBQTdD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

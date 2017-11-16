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

var shared_proto = function (packetParser, random_id, fragment_size) {
  const { concatBuffers, packPacketObj, pack_utf8, unpack_utf8 } = packetParser;
  fragment_size = Number(fragment_size || 8000);
  if (1024 > fragment_size || 65000 < fragment_size) {
    throw new Error(`Invalid fragment size: ${fragment_size}`);
  }

  return { packetParser, random_id,
    createMultipart, createStream, packetFragments,
    bindTransports };

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

      const msg = pkt.body_json();
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
        msg = JSON.stringify(msg);
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
  const { createMultipart, createStream } = shared;
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
        const msg = JSON.parse(pkt.body_utf8() || undefined);
        return sink.recvMsg(msg, pkt.info);
      } },

    multipart: {
      t_recv(pkt, sink) {
        const state = sink.stateFor(pkt, createMultipart);
        const body_buf = state.feed(pkt);
        if (undefined !== body_buf) {
          const msg = JSON.parse(unpack_utf8(body_buf) || undefined);
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
    return pack_utf8(JSON.stringify(body));
  }
}

function pkt_as_ndjson(pkt) {
  return pkt.body_utf8().split(/\r|\n|\0/).filter(l => l).map(l => JSON.parse(l));
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

function init_protocol(packetParser, random_id) {
  const shared = shared_proto(packetParser, random_id);

  const inbound = [];
  const json = shared.bindTransports(inbound, 0x00 // 0x0* — JSON body
  , json_protocol(shared));

  const binary = shared.bindTransports(inbound, 0x10 // 0x1* — binary body
  , binary_protocol(shared));

  const control = control_protocol(inbound, 0xf0 // 0xf* — control
  , shared);

  const codecs = { json, binary, control, default: json };

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
    random_id,
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
    const protocols = init_protocol(packetParser, random_id);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3Nlci5qcyIsInNvdXJjZXMiOlsiLi4vY29kZS9wcm90b2NvbC9mcmFtaW5nLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvc2hhcmVkLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvanNvbi5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2JpbmFyeS5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2NvbnRyb2wuanN5IiwiLi4vY29kZS9wcm90b2NvbC9pbmRleC5qc3kiLCIuLi9jb2RlL2VuZHBvaW50LmpzeSIsIi4uL2NvZGUvc2luay5qc3kiLCIuLi9jb2RlL21zZ2N0eC5qc3kiLCIuLi9jb2RlL3BsdWdpbi5qc3kiLCIuLi9jb2RlL2luZGV4LmJyb3dzZXIuanN5Il0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IGxpdHRsZV9lbmRpYW4gPSB0cnVlXG5jb25zdCBjX3NpbmdsZSA9ICdzaW5nbGUnXG5jb25zdCBjX2RhdGFncmFtID0gJ2RhdGFncmFtJ1xuY29uc3QgY19kaXJlY3QgPSAnZGlyZWN0J1xuY29uc3QgY19tdWx0aXBhcnQgPSAnbXVsdGlwYXJ0J1xuY29uc3QgY19zdHJlYW1pbmcgPSAnc3RyZWFtaW5nJ1xuXG5jb25zdCBfZXJyX21zZ2lkX3JlcXVpcmVkID0gYFJlc3BvbnNlIHJlcWlyZXMgJ21zZ2lkJ2BcbmNvbnN0IF9lcnJfdG9rZW5fcmVxdWlyZWQgPSBgVHJhbnNwb3J0IHJlcWlyZXMgJ3Rva2VuJ2BcblxuXG5mdW5jdGlvbiBmcm1fcm91dGluZygpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHgxLCBtYXNrID0gMHgxXG4gIHJldHVybiBAe31cbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gbnVsbCAhPSBvYmouZnJvbV9pZCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IHtmcm9tX2lkfSA9IG9ialxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgMHxmcm9tX2lkLmlkX3JvdXRlciwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MzIgQCA0K29mZnNldCwgMHxmcm9tX2lkLmlkX3RhcmdldCwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgY29uc3QgZnJvbV9pZCA9IHVuZGVmaW5lZCA9PT0gb2JqLmZyb21faWRcbiAgICAgICAgPyBvYmouZnJvbV9pZCA9IHt9IDogb2JqLmZyb21faWRcbiAgICAgIGZyb21faWQuaWRfcm91dGVyID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgZnJvbV9pZC5pZF90YXJnZXQgPSBkdi5nZXRJbnQzMiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG5cbmZ1bmN0aW9uIGZybV9yZXNwb25zZSgpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHgyLCBtYXNrID0gMHgyXG4gIHJldHVybiBAe31cbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gbnVsbCAhPSBvYmoubXNnaWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai5tc2dpZCA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX21zZ2lkX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoubXNnaWQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcV9hY2ssIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLmFja19mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLnRva2VuID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9hY2sgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouYWNrX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5cblxuZnVuY3Rpb24gZnJtX2RhdGFncmFtKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDAsIGJpdHMgPSAweDAsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGF0YWdyYW1cbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OlxuICAgICAgaWYgY19kYXRhZ3JhbSA9PT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gYml0c1xuICAgICAgaWYgb2JqLnRyYW5zcG9ydCAmJiBjX3NpbmdsZSAhPT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gZmFsc2VcbiAgICAgIHJldHVybiAhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX2RhdGFncmFtXG5cbmZ1bmN0aW9uIGZybV9kaXJlY3QoKSA6OlxuICBjb25zdCBzaXplID0gNCwgYml0cyA9IDB4NCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19kaXJlY3RcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OlxuICAgICAgaWYgY19kaXJlY3QgPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISEgb2JqLnRva2VuID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kaXJlY3RcblxuZnVuY3Rpb24gZnJtX211bHRpcGFydCgpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHg4LCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX211bHRpcGFydFxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBjX211bHRpcGFydCA9PT0gb2JqLnRyYW5zcG9ydCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgYmluZF9zZXFfbmV4dCwgc2VxX3BvczogNFxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cbiAgICAgIGlmIHRydWUgPT0gb2JqLnNlcSA6OiAvLyB1c2Ugc2VxX25leHRcbiAgICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMCwgbGl0dGxlX2VuZGlhblxuICAgICAgZWxzZSBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLnNlcV9mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkICAgICA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXEgICAgICAgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfbXVsdGlwYXJ0XG5cbmZ1bmN0aW9uIGZybV9zdHJlYW1pbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4YywgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19zdHJlYW1pbmdcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19zdHJlYW1pbmcgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjpcbiAgICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMCwgbGl0dGxlX2VuZGlhbiAvLyB1c2Ugc2VxX25leHRcbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX3N0cmVhbWluZ1xuXG5cbmZ1bmN0aW9uIGJpbmRfc2VxX25leHQob2Zmc2V0KSA6OlxuICBjb25zdCBzZXFfb2Zmc2V0ID0gdGhpcy5zZXFfcG9zICsgb2Zmc2V0XG4gIGxldCBzZXEgPSAxXG4gIHJldHVybiBmdW5jdGlvbiBzZXFfbmV4dCh7ZmxhZ3MsIGZpbn0sIGR2KSA6OlxuICAgIGlmICEgZmluIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIHNlcSsrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDIrc2VxX29mZnNldCwgMHxmbGFncywgbGl0dGxlX2VuZGlhblxuICAgIGVsc2UgOjpcbiAgICAgIGR2LnNldEludDE2IEAgc2VxX29mZnNldCwgLXNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICAgIHNlcSA9IE5hTlxuXG5cblxuZXhwb3J0IGRlZmF1bHQgY29tcG9zZUZyYW1pbmdzKClcbmZ1bmN0aW9uIGNvbXBvc2VGcmFtaW5ncygpIDo6XG4gIGNvbnN0IGZybV9mcm9tID0gZnJtX3JvdXRpbmcoKSwgZnJtX3Jlc3AgPSBmcm1fcmVzcG9uc2UoKVxuICBjb25zdCBmcm1fdHJhbnNwb3J0cyA9IEBbXSBmcm1fZGF0YWdyYW0oKSwgZnJtX2RpcmVjdCgpLCBmcm1fbXVsdGlwYXJ0KCksIGZybV9zdHJlYW1pbmcoKVxuXG4gIGlmIDggIT09IGZybV9mcm9tLnNpemUgfHwgOCAhPT0gZnJtX3Jlc3Auc2l6ZSB8fCA0ICE9IGZybV90cmFuc3BvcnRzLmxlbmd0aCA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBGcmFtaW5nIFNpemUgY2hhbmdlYFxuXG4gIGNvbnN0IGJ5Qml0cyA9IFtdLCBtYXNrPTB4ZlxuXG4gIDo6XG4gICAgY29uc3QgdF9mcm9tID0gZnJtX2Zyb20uZl90ZXN0LCB0X3Jlc3AgPSBmcm1fcmVzcC5mX3Rlc3RcbiAgICBjb25zdCBbdDAsdDEsdDIsdDNdID0gZnJtX3RyYW5zcG9ydHMubWFwIEAgZj0+Zi5mX3Rlc3RcblxuICAgIGNvbnN0IHRlc3RCaXRzID0gYnlCaXRzLnRlc3RCaXRzID0gb2JqID0+XG4gICAgICAwIHwgdF9mcm9tKG9iaikgfCB0X3Jlc3Aob2JqKSB8IHQwKG9iaikgfCB0MShvYmopIHwgdDIob2JqKSB8IHQzKG9iailcblxuICAgIGJ5Qml0cy5jaG9vc2UgPSBmdW5jdGlvbiAob2JqLCBsc3QpIDo6XG4gICAgICBpZiBudWxsID09IGxzdCA6OiBsc3QgPSB0aGlzIHx8IGJ5Qml0c1xuICAgICAgcmV0dXJuIGxzdFt0ZXN0Qml0cyhvYmopXVxuXG5cbiAgZm9yIGNvbnN0IFQgb2YgZnJtX3RyYW5zcG9ydHMgOjpcbiAgICBjb25zdCB7Yml0czpiLCBzaXplLCB0cmFuc3BvcnR9ID0gVFxuXG4gICAgYnlCaXRzW2J8MF0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDAsIG1hc2ssIHNpemU6IHNpemUsIG9wOiAnJ1xuICAgIGJ5Qml0c1tifDFdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwxLCBtYXNrLCBzaXplOiA4ICsgc2l6ZSwgb3A6ICdmJ1xuICAgIGJ5Qml0c1tifDJdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwyLCBtYXNrLCBzaXplOiA4ICsgc2l6ZSwgb3A6ICdyJ1xuICAgIGJ5Qml0c1tifDNdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwzLCBtYXNrLCBzaXplOiAxNiArIHNpemUsIG9wOiAnZnInXG5cbiAgICBmb3IgY29uc3QgZm5fa2V5IG9mIFsnZl9wYWNrJywgJ2ZfdW5wYWNrJ10gOjpcbiAgICAgIGNvbnN0IGZuX3RyYW4gPSBUW2ZuX2tleV0sIGZuX2Zyb20gPSBmcm1fZnJvbVtmbl9rZXldLCBmbl9yZXNwID0gZnJtX3Jlc3BbZm5fa2V5XVxuXG4gICAgICBieUJpdHNbYnwwXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fdHJhbihvYmosIGR2LCAwKVxuICAgICAgYnlCaXRzW2J8MV1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3RyYW4ob2JqLCBkdiwgOClcbiAgICAgIGJ5Qml0c1tifDJdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9yZXNwKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwzXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fZnJvbShvYmosIGR2LCAwKTsgZm5fcmVzcChvYmosIGR2LCA4KTsgZm5fdHJhbihvYmosIGR2LCAxNilcblxuICBmb3IgY29uc3QgZnJtIG9mIGJ5Qml0cyA6OlxuICAgIGJpbmRBc3NlbWJsZWQgQCBmcm1cblxuICByZXR1cm4gYnlCaXRzXG5cblxuZnVuY3Rpb24gYmluZEFzc2VtYmxlZChmcm0pIDo6XG4gIGNvbnN0IHtULCBzaXplLCBmX3BhY2ssIGZfdW5wYWNrfSA9IGZybVxuICBpZiBULmJpbmRfc2VxX25leHQgOjpcbiAgICBmcm0uc2VxX25leHQgPSBULmJpbmRfc2VxX25leHQgQCBmcm0uc2l6ZSAtIFQuc2l6ZVxuXG4gIGRlbGV0ZSBmcm0uVFxuICBmcm0ucGFjayA9IHBhY2sgOyBmcm0udW5wYWNrID0gdW5wYWNrXG4gIGNvbnN0IHNlcV9uZXh0ID0gZnJtLnNlcV9uZXh0XG5cbiAgZnVuY3Rpb24gcGFjayhwa3RfdHlwZSwgcGt0X29iaikgOjpcbiAgICBpZiAhIEAgMCA8PSBwa3RfdHlwZSAmJiBwa3RfdHlwZSA8PSAyNTUgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgcGt0X3R5cGUgdG8gYmUgWzAuLjI1NV1gXG5cbiAgICBwa3Rfb2JqLnR5cGUgPSBwa3RfdHlwZVxuICAgIGlmIHNlcV9uZXh0ICYmIG51bGwgPT0gcGt0X29iai5zZXEgOjpcbiAgICAgIHBrdF9vYmouc2VxID0gdHJ1ZVxuXG4gICAgY29uc3QgZHYgPSBuZXcgRGF0YVZpZXcgQCBuZXcgQXJyYXlCdWZmZXIoc2l6ZSlcbiAgICBmX3BhY2socGt0X29iaiwgZHYsIDApXG4gICAgcGt0X29iai5oZWFkZXIgPSBkdi5idWZmZXJcblxuICAgIGlmIHRydWUgPT09IHBrdF9vYmouc2VxIDo6XG4gICAgICBfYmluZF9pdGVyYWJsZSBAIHBrdF9vYmosIGR2LmJ1ZmZlci5zbGljZSgwLHNpemUpXG5cbiAgZnVuY3Rpb24gdW5wYWNrKHBrdCkgOjpcbiAgICBjb25zdCBidWYgPSBwa3QuaGVhZGVyX2J1ZmZlcigpXG4gICAgY29uc3QgZHYgPSBuZXcgRGF0YVZpZXcgQCBuZXcgVWludDhBcnJheShidWYpLmJ1ZmZlclxuXG4gICAgY29uc3QgaW5mbyA9IHt9XG4gICAgZl91bnBhY2soaW5mbywgZHYsIDApXG4gICAgcmV0dXJuIHBrdC5pbmZvID0gaW5mb1xuXG4gIGZ1bmN0aW9uIF9iaW5kX2l0ZXJhYmxlKHBrdF9vYmosIGJ1Zl9jbG9uZSkgOjpcbiAgICBjb25zdCB7dHlwZX0gPSBwa3Rfb2JqXG4gICAgY29uc3Qge2lkX3JvdXRlciwgaWRfdGFyZ2V0LCB0dGwsIHRva2VufSA9IHBrdF9vYmpcbiAgICBwa3Rfb2JqLm5leHQgPSBuZXh0XG5cbiAgICBmdW5jdGlvbiBuZXh0KG9wdGlvbnMpIDo6XG4gICAgICBpZiBudWxsID09IG9wdGlvbnMgOjogb3B0aW9ucyA9IHt9XG4gICAgICBjb25zdCBoZWFkZXIgPSBidWZfY2xvbmUuc2xpY2UoKVxuICAgICAgc2VxX25leHQgQCBvcHRpb25zLCBuZXcgRGF0YVZpZXcgQCBoZWFkZXJcbiAgICAgIHJldHVybiBAe30gZG9uZTogISEgb3B0aW9ucy5maW4sIHZhbHVlOiBAe30gLy8gcGt0X29ialxuICAgICAgICBpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHlwZSwgdHRsLCB0b2tlbiwgaGVhZGVyXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihwYWNrZXRQYXJzZXIsIHJhbmRvbV9pZCwgZnJhZ21lbnRfc2l6ZSkgOjpcbiAgY29uc3Qge2NvbmNhdEJ1ZmZlcnMsIHBhY2tQYWNrZXRPYmosIHBhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gcGFja2V0UGFyc2VyXG4gIGZyYWdtZW50X3NpemUgPSBOdW1iZXIoZnJhZ21lbnRfc2l6ZSB8fCA4MDAwKVxuICBpZiAxMDI0ID4gZnJhZ21lbnRfc2l6ZSB8fCA2NTAwMCA8IGZyYWdtZW50X3NpemUgOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgSW52YWxpZCBmcmFnbWVudCBzaXplOiAke2ZyYWdtZW50X3NpemV9YFxuXG4gIHJldHVybiBAOiBwYWNrZXRQYXJzZXIsIHJhbmRvbV9pZFxuICAgIGNyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtLCBwYWNrZXRGcmFnbWVudHNcbiAgICBiaW5kVHJhbnNwb3J0c1xuXG5cblxuICBmdW5jdGlvbiBjcmVhdGVNdWx0aXBhcnQocGt0LCBzaW5rKSA6OlxuICAgIGxldCBwYXJ0cyA9IFtdLCBmaW4gPSBmYWxzZVxuICAgIHJldHVybiBAe30gZmVlZCwgaW5mbzogcGt0LmluZm9cblxuICAgIGZ1bmN0aW9uIGZlZWQocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxIDwgMCA6OiBmaW4gPSB0cnVlOyBzZXEgPSAtc2VxXG4gICAgICBwYXJ0c1tzZXEtMV0gPSBwa3QuYm9keV9idWZmZXIoKVxuXG4gICAgICBpZiAhIGZpbiA6OiByZXR1cm5cbiAgICAgIGlmIHBhcnRzLmluY2x1ZGVzIEAgdW5kZWZpbmVkIDo6IHJldHVyblxuXG4gICAgICBjb25zdCByZXMgPSBjb25jYXRCdWZmZXJzKHBhcnRzKVxuICAgICAgcGFydHMgPSBudWxsXG4gICAgICByZXR1cm4gcmVzXG5cbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtKHBrdCwgc2luaykgOjpcbiAgICBsZXQgbmV4dD0wLCBmaW4gPSBmYWxzZSwgcnN0cmVhbVxuICAgIGNvbnN0IHN0YXRlID0gQHt9IGZlZWQ6IGZlZWRfaW5pdCwgaW5mbzogcGt0LmluZm9cbiAgICByZXR1cm4gc3RhdGVcblxuICAgIGZ1bmN0aW9uIG9uX2Vycm9yKGVyciwgcGt0KSA6OlxuICAgICAgaWYgdW5kZWZpbmVkID09PSByc3RyZWFtLm9uX2Vycm9yIDo6XG4gICAgICAgIHJldHVybiB2b2lkIGNvbnNvbGUud2FybiBAXG4gICAgICAgICAgYEVycm9yIGR1cmluZyBzdHJlYW0uZmVlZDpgLCBlcnJcbiAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgIGZ1bmN0aW9uIGZlZWRfaW5pdChwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcblxuICAgICAgY29uc3QgbXNnID0gcGt0LmJvZHlfanNvbigpXG4gICAgICByc3RyZWFtID0gc2luay5yZWN2U3RyZWFtKG1zZywgcGt0LmluZm8pXG4gICAgICBpZiBudWxsID09IHJzdHJlYW0gOjogcmV0dXJuXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICBpZiAhIGZlZWRfc2VxKHBrdCkgOjogcmV0dXJuXG4gICAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2JvZHlcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gb25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgICBpZiAnZnVuY3Rpb24nID09PSB0eXBlb2YgcnN0cmVhbS5vbl9pbml0IDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2luaXQobXNnLCBwa3QpXG4gICAgICBlbHNlIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG4gICAgXG4gICAgZnVuY3Rpb24gZmVlZF9ib2R5KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIGxldCBkYXRhXG4gICAgICB0cnkgOjpcbiAgICAgICAgaWYgISBmZWVkX3NlcShwa3QpIDo6IHJldHVyblxuICAgICAgICBkYXRhID0gYXNfY29udGVudChwa3QpXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIG9uX2Vycm9yIEAgZXJyLCBwa3RcbiAgICAgIHJldHVybiByc3RyZWFtLm9uX2RhdGEgQCBkYXRhLCBwa3RcblxuICAgIGZ1bmN0aW9uIGZlZWRfaWdub3JlKCkgOjpcblxuICAgIGZ1bmN0aW9uIGZlZWRfc2VxKHBrdCkgOjpcbiAgICAgIGxldCBzZXEgPSBwa3QuaW5mby5zZXFcbiAgICAgIGlmIHNlcSA8IDAgOjogZmluID0gdHJ1ZTsgc2VxID0gLXNlcVxuICAgICAgaWYgbmV4dCA9PT0gc2VxIDo6IHJldHVybiArK25leHRcbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuICAgICAgbmV4dCA9ICdpbnZhbGlkJ1xuICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFBhY2tldCBvdXQgb2Ygc2VxdWVuY2VgXG5cbiAgZnVuY3Rpb24gKiBwYWNrZXRGcmFnbWVudHMoYnVmLCBuZXh0X2hkciwgZmluKSA6OlxuICAgIGlmIG51bGwgPT0gYnVmIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIHlpZWxkIG9ialxuICAgICAgcmV0dXJuXG5cbiAgICBsZXQgaSA9IDAsIGxhc3RJbm5lciA9IGJ1Zi5ieXRlTGVuZ3RoIC0gZnJhZ21lbnRfc2l6ZTtcbiAgICB3aGlsZSBpIDwgbGFzdElubmVyIDo6XG4gICAgICBjb25zdCBpMCA9IGlcbiAgICAgIGkgKz0gZnJhZ21lbnRfc2l6ZVxuXG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcigpXG4gICAgICBvYmouYm9keSA9IGJ1Zi5zbGljZShpMCwgaSlcbiAgICAgIHlpZWxkIG9ialxuXG4gICAgOjpcbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKHtmaW59KVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaSlcbiAgICAgIHlpZWxkIG9ialxuXG5cblxuICBmdW5jdGlvbiBiaW5kVHJhbnNwb3J0SW1wbHMoaW5ib3VuZCwgaGlnaGJpdHMsIHRyYW5zcG9ydHMpIDo6XG4gICAgY29uc3Qgb3V0Ym91bmQgPSBbXVxuICAgIG91dGJvdW5kLmNob29zZSA9IGZyYW1pbmdzLmNob29zZVxuXG4gICAgZm9yIGNvbnN0IGZyYW1lIG9mIGZyYW1pbmdzIDo6XG4gICAgICBjb25zdCBpbXBsID0gZnJhbWUgPyB0cmFuc3BvcnRzW2ZyYW1lLnRyYW5zcG9ydF0gOiBudWxsXG4gICAgICBpZiAhIGltcGwgOjogY29udGludWVcblxuICAgICAgY29uc3Qge2JpdHMsIHBhY2ssIHVucGFja30gPSBmcmFtZVxuICAgICAgY29uc3QgcGt0X3R5cGUgPSBoaWdoYml0cyB8IGJpdHNcbiAgICAgIGNvbnN0IHt0X3JlY3Z9ID0gaW1wbFxuXG4gICAgICBmdW5jdGlvbiBwYWNrX2hkcihvYmopIDo6XG4gICAgICAgIHBhY2socGt0X3R5cGUsIG9iailcbiAgICAgICAgcmV0dXJuIG9ialxuXG4gICAgICBmdW5jdGlvbiByZWN2X21zZyhwa3QsIHNpbmspIDo6XG4gICAgICAgIHVucGFjayhwa3QpXG4gICAgICAgIHJldHVybiB0X3JlY3YocGt0LCBzaW5rKVxuXG4gICAgICBwYWNrX2hkci5wa3RfdHlwZSA9IHJlY3ZfbXNnLnBrdF90eXBlID0gcGt0X3R5cGVcbiAgICAgIG91dGJvdW5kW2JpdHNdID0gcGFja19oZHJcbiAgICAgIGluYm91bmRbcGt0X3R5cGVdID0gcmVjdl9tc2dcblxuICAgICAgaWYgJ3Byb2R1Y3Rpb24nICE9PSBwcm9jZXNzLmVudi5OT0RFX0VOViA6OlxuICAgICAgICBjb25zdCBvcCA9IHBhY2tfaGRyLm9wID0gcmVjdl9tc2cub3AgPSBmcmFtZS5vcFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCBwYWNrX2hkciwgJ25hbWUnLCBAe30gdmFsdWU6IGBwYWNrX2hkciDCqyR7b3B9wrtgXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSBAIHJlY3ZfbXNnLCAnbmFtZScsIEB7fSB2YWx1ZTogYHJlY3ZfbXNnIMKrJHtvcH3Cu2BcblxuICAgIHJldHVybiBvdXRib3VuZFxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydHMoaW5ib3VuZCwgaGlnaGJpdHMsIHRyYW5zcG9ydHMpIDo6XG4gICAgY29uc3QgcGFja0JvZHkgPSB0cmFuc3BvcnRzLnBhY2tCb2R5XG4gICAgY29uc3QgcGFja1N0cmVhbSA9IHRyYW5zcG9ydHMucGFja1N0cmVhbVxuICAgIGNvbnN0IG91dGJvdW5kID0gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKVxuICAgIGNvbnN0IHN0cmVhbSA9ICEgdHJhbnNwb3J0cy5zdHJlYW1pbmcgPyBudWxsIDpcbiAgICAgICdvYmplY3QnID09PSB0cmFuc3BvcnRzLnN0cmVhbWluZy5tb2RlXG4gICAgICAgID8gYmluZF9zdHJlYW0gQCBtc2VuZF9vYmplY3RzXG4gICAgICAgIDogYmluZF9zdHJlYW0gQCBtc2VuZF9ieXRlc1xuXG4gICAgcmV0dXJuIEB7fSBzZW5kLCBzdHJlYW1cblxuICAgIGZ1bmN0aW9uIHNlbmQoY2hhbiwgb2JqLCBib2R5KSA6OlxuICAgICAgYm9keSA9IHBhY2tCb2R5KGJvZHkpXG4gICAgICBpZiBmcmFnbWVudF9zaXplIDwgYm9keS5ieXRlTGVuZ3RoIDo6XG4gICAgICAgIGlmICEgb2JqLnRva2VuIDo6IG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgICAgIGNvbnN0IG1zZW5kID0gbXNlbmRfYnl0ZXMoJ211bHRpcGFydCcsIGNoYW4sIG9iailcbiAgICAgICAgcmV0dXJuIEB7fSBzZW50OiBtc2VuZCBAIHRydWUsIGJvZHlcblxuICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzaW5nbGUnXG4gICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBwYWNrX2hkcihvYmopXG4gICAgICByZXR1cm4gQHt9IHNlbnQ6IGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIG1zZW5kX2J5dGVzKHRyYW5zcG9ydCwgY2hhbiwgb2JqLCBtc2cpIDo6XG4gICAgICBvYmoudHJhbnNwb3J0ID0gdHJhbnNwb3J0XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBsZXQge25leHR9ID0gcGFja19oZHIob2JqKVxuICAgICAgaWYgbnVsbCAhPT0gbXNnIDo6XG4gICAgICAgIG9iai5ib2R5ID0gbXNnXG4gICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgY2hhbiBAIHBrdFxuXG4gICAgICByZXR1cm4gYXN5bmMgZnVuY3Rpb24gKGZpbiwgYm9keSkgOjpcbiAgICAgICAgaWYgbnVsbCA9PT0gbmV4dCA6OlxuICAgICAgICAgIHRocm93IG5ldyBFcnJvciBAICdXcml0ZSBhZnRlciBlbmQnXG4gICAgICAgIGxldCByZXNcbiAgICAgICAgZm9yIGNvbnN0IG9iaiBvZiBwYWNrZXRGcmFnbWVudHMgQCBib2R5LCBuZXh0LCBmaW4gOjpcbiAgICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgICAgcmVzID0gYXdhaXQgY2hhbiBAIHBrdFxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIHJlc1xuXG4gICAgZnVuY3Rpb24gbXNlbmRfb2JqZWN0cyh0cmFuc3BvcnQsIGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgb2JqLnRyYW5zcG9ydCA9IHRyYW5zcG9ydFxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBjb25zdCBvYmogPSBuZXh0KHtmaW59KVxuICAgICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIGJpbmRfc3RyZWFtKHNlbmRfaW1wbCkgOjpcbiAgICAgIHJldHVybiBmdW5jdGlvbiBzdHJlYW0gKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBpZiAnb2JqZWN0JyAhPT0gdHlwZW9mIG1zZyA6OlxuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgc3RyZWFtKCkgcmVxdWlyZXMgYSBKU09OIHNlcmFsaXphYmxlIG1zZyBmb3IgaW5pdGlhbCBwYWNrZXRgXG4gICAgICAgIG1zZyA9IEpTT04uc3RyaW5naWZ5KG1zZylcbiAgICAgICAgY29uc3QgbXNlbmQgPSBzZW5kX2ltcGwoJ3N0cmVhbWluZycsIGNoYW4sIG9iaiwgbXNnKVxuICAgICAgICB3cml0ZS53cml0ZSA9IHdyaXRlOyB3cml0ZS5lbmQgPSBlbmRcbiAgICAgICAgcmV0dXJuIHdyaXRlXG5cbiAgICAgICAgZnVuY3Rpb24gd3JpdGUoY2h1bmspIDo6XG4gICAgICAgICAgcmV0dXJuIGNodW5rICE9IG51bGxcbiAgICAgICAgICAgID8gbXNlbmQgQCBmYWxzZSwgcGFja0JvZHkgQCBjaHVua1xuICAgICAgICAgICAgOiBtc2VuZCBAIHRydWVcblxuICAgICAgICBmdW5jdGlvbiBlbmQoY2h1bmspIDo6XG4gICAgICAgICAgcmV0dXJuIGNodW5rICE9IG51bGxcbiAgICAgICAgICAgID8gbXNlbmQgQCB0cnVlLCBwYWNrQm9keSBAIGNodW5rXG4gICAgICAgICAgICA6IG1zZW5kIEAgdHJ1ZVxuIiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ganNvbl9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbX0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keVxuICAgIHBhY2tTdHJlYW0oY2h1bmssIGZyYWdtZW50X3NpemUpIDo6XG4gICAgICByZXR1cm4gQFtdIHBhY2tCb2R5KGNodW5rKVxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IEpTT04ucGFyc2UgQCBwa3QuYm9keV91dGY4KCkgfHwgdW5kZWZpbmVkXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgYm9keV9idWYgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBib2R5X2J1ZiA6OlxuICAgICAgICAgIGNvbnN0IG1zZyA9IEpTT04ucGFyc2UgQCB1bnBhY2tfdXRmOChib2R5X2J1ZikgfHwgdW5kZWZpbmVkXG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdvYmplY3QnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICByZXR1cm4gc3RhdGUuZmVlZChwa3QsIHBrdF9hc19uZGpzb24pXG5cbiAgZnVuY3Rpb24gcGFja0JvZHkoYm9keSkgOjpcbiAgICByZXR1cm4gcGFja191dGY4IEAgSlNPTi5zdHJpbmdpZnkoYm9keSlcblxuZnVuY3Rpb24gcGt0X2FzX25kanNvbihwa3QpIDo6XG4gIHJldHVybiBwa3QuYm9keV91dGY4KCkuc3BsaXQoL1xccnxcXG58XFwwLylcbiAgICAuZmlsdGVyIEAgbD0+bFxuICAgIC5tYXAgQCBsPT5KU09OLnBhcnNlKGwpXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBiaW5hcnlfcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW19ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgY29uc3Qge2FzQnVmZmVyfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgcmV0dXJuIEB7fVxuICAgIHBhY2tCb2R5OiBhc0J1ZmZlclxuICAgIHBhY2tTdHJlYW0oY2h1bmssIGZyYWdtZW50X3NpemUpIDo6XG4gICAgICByZXR1cm4gQFtdIGFzQnVmZmVyKGNodW5rKVxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHBrdC5ib2R5X2J1ZmZlcigpXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdieXRlcydcbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlU3RyZWFtXG4gICAgICAgIGNvbnN0IG1zZyA9IHN0YXRlLmZlZWQocGt0LCBwa3RfYnVmZmVyKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZyA6OlxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuZnVuY3Rpb24gcGt0X2J1ZmZlcihwa3QpIDo6IHJldHVybiBwa3QuYm9keV9idWZmZXIoKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gY29udHJvbF9wcm90b2NvbChpbmJvdW5kLCBoaWdoLCBzaGFyZWQpIDo6XG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrUGFja2V0T2JqfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcblxuICBjb25zdCBwaW5nX2ZyYW1lID0gZnJhbWluZ3MuY2hvb3NlIEA6IGZyb21faWQ6IHRydWUsIHRva2VuOiB0cnVlLCB0cmFuc3BvcnQ6ICdkaXJlY3QnXG4gIGNvbnN0IHBvbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgbXNnaWQ6IHRydWUsIHRyYW5zcG9ydDogJ2RhdGFncmFtJ1xuXG4gIGNvbnN0IHBvbmdfdHlwZSA9IGhpZ2h8MHhlXG4gIGluYm91bmRbcG9uZ190eXBlXSA9IHJlY3ZfcG9uZ1xuICBjb25zdCBwaW5nX3R5cGUgPSBoaWdofDB4ZlxuICBpbmJvdW5kW2hpZ2h8MHhmXSA9IHJlY3ZfcGluZ1xuXG4gIHJldHVybiBAe30gc2VuZDpwaW5nLCBwaW5nXG5cbiAgZnVuY3Rpb24gcGluZyhjaGFuLCBvYmopIDo6XG4gICAgaWYgISBvYmoudG9rZW4gOjpcbiAgICAgIG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgb2JqLmJvZHkgPSBKU09OLnN0cmluZ2lmeSBAOlxuICAgICAgb3A6ICdwaW5nJywgdHMwOiBuZXcgRGF0ZSgpXG4gICAgcGluZ19mcmFtZS5wYWNrKHBpbmdfdHlwZSwgb2JqKVxuICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gIGZ1bmN0aW9uIHJlY3ZfcGluZyhwa3QsIHNpbmssIHJvdXRlcikgOjpcbiAgICBwaW5nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICBfc2VuZF9wb25nIEAgcGt0LmJvZHksIHBrdCwgc2luaywgcm91dGVyXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4gIGZ1bmN0aW9uIF9zZW5kX3Bvbmcoe3RzMH0sIHBrdF9waW5nLCBzaW5rLCByb3V0ZXIpIDo6XG4gICAgY29uc3Qge21zZ2lkLCBmcm9tX2lkOnJfaWR9ID0gcGt0X3BpbmcuaW5mb1xuICAgIGNvbnN0IHtpZF9yb3V0ZXIsIGlkX3RhcmdldH0gPSByX2lkXG4gICAgY29uc3Qgb2JqID0gQHt9IGlkX3JvdXRlciwgaWRfdGFyZ2V0XG4gICAgICBmcm9tX2lkOiBzaW5rLmZyb21faWQsIG1zZ2lkXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSBAOlxuICAgICAgICBvcDogJ3BvbmcnLCB0czAsIHRzMTogbmV3IERhdGUoKVxuXG4gICAgcG9uZ19mcmFtZS5wYWNrKHBvbmdfdHlwZSwgb2JqKVxuICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICByZXR1cm4gcm91dGVyLmRpc3BhdGNoIEAgW3BrdF1cblxuICBmdW5jdGlvbiByZWN2X3BvbmcocGt0LCBzaW5rKSA6OlxuICAgIHBvbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIHJldHVybiBzaW5rLnJlY3ZDdHJsKHBrdC5ib2R5LCBwa3QuaW5mbylcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5pbXBvcnQgc2hhcmVkX3Byb3RvIGZyb20gJy4vc2hhcmVkLmpzeSdcbmltcG9ydCBqc29uX3Byb3RvIGZyb20gJy4vanNvbi5qc3knXG5pbXBvcnQgYmluYXJ5X3Byb3RvIGZyb20gJy4vYmluYXJ5LmpzeSdcbmltcG9ydCBjb250cm9sX3Byb3RvIGZyb20gJy4vY29udHJvbC5qc3knXG5cbmV4cG9ydCAqIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGluaXRfcHJvdG9jb2wocGFja2V0UGFyc2VyLCByYW5kb21faWQpIDo6XG4gIGNvbnN0IHNoYXJlZCA9IHNoYXJlZF9wcm90byBAIHBhY2tldFBhcnNlciwgcmFuZG9tX2lkXG5cbiAgY29uc3QgaW5ib3VuZCA9IFtdXG4gIGNvbnN0IGpzb24gPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgwMCAvLyAweDAqIOKAlCBKU09OIGJvZHlcbiAgICBqc29uX3Byb3RvKHNoYXJlZClcblxuICBjb25zdCBiaW5hcnkgPSBzaGFyZWQuYmluZFRyYW5zcG9ydHMgQCBpbmJvdW5kXG4gICAgMHgxMCAvLyAweDEqIOKAlCBiaW5hcnkgYm9keVxuICAgIGJpbmFyeV9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgY29udHJvbCA9IGNvbnRyb2xfcHJvdG8gQCBpbmJvdW5kLFxuICAgIDB4ZjAgLy8gMHhmKiDigJQgY29udHJvbFxuICAgIHNoYXJlZFxuXG4gIGNvbnN0IGNvZGVjcyA9IEA6IGpzb24sIGJpbmFyeSwgY29udHJvbCwgZGVmYXVsdDoganNvblxuXG4gIHJldHVybiBAOiBpbmJvdW5kLCBjb2RlY3MsIHJhbmRvbV9pZFxuXG5cbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIEVuZHBvaW50IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe30pIDo6XG4gICAgY2xhc3MgRW5kcG9pbnQgZXh0ZW5kcyB0aGlzIDo6XG4gICAgcmV0dXJuIEVuZHBvaW50XG5cbiAgdmFsdWVPZigpIDo6IHJldHVybiB0aGlzLmZyb21faWRcbiAgaW5zcGVjdCgpIDo6IHJldHVybiBgwqtFbmRwb2ludCAke3RoaXMuZnJvbV9pZC5pZF90YXJnZXR9wrtgXG5cbiAgY29uc3RydWN0b3IobXNnX2N0eCkgOjpcbiAgICBtc2dfY3R4ID0gbXNnX2N0eC53aXRoRW5kcG9pbnQodGhpcylcblxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIF9ieV90b2tlbjogQHt9IHZhbHVlOiB0aGlzLmNyZWF0ZVJlcGx5TWFwKClcbiAgICAgIF9ieV90cmFmZmljOiBAe30gdmFsdWU6IHRoaXMuY3JlYXRlVHJhZmZpY01hcCgpXG4gICAgICBmcm9tX2lkOiBAe30gdmFsdWU6IG1zZ19jdHguZnJvbV9pZCwgZW51bWVyYWJsZTogdHJ1ZVxuICAgICAgdG86IEB7fSB2YWx1ZTogbXNnX2N0eC50b1xuXG4gIGNyZWF0ZU1hcCgpIDo6IHJldHVybiBuZXcgTWFwKClcbiAgY3JlYXRlU3RhdGVNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVSZXBseU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVRyYWZmaWNNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuXG4gIGJpbmRTaW5rKHNpbmspIDo6XG4gICAgY29uc3QgYnlfdG9rZW4gPSB0aGlzLl9ieV90b2tlblxuICAgIGNvbnN0IGJ5X3RyYWZmaWMgPSB0aGlzLl9ieV90cmFmZmljXG4gICAgY29uc3QgdHJhZmZpYyA9IChmcm9tX2lkLCB0cmFmZmljKSA9PiA6OlxuICAgICAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gICAgICBpZiBmcm9tX2lkIDo6XG4gICAgICAgIGNvbnN0IHQgPSBieV90cmFmZmljLmdldChmcm9tX2lkLmlkX3RhcmdldClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0IDo6XG4gICAgICAgICAgdC50cyA9IHRbYHRzXyR7dHJhZmZpY31gXSA9IHRzXG4gICAgICB0aGlzLnJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKVxuXG4gICAgcmV0dXJuIEB7fVxuICAgICAgZnJvbV9pZDogdGhpcy5mcm9tX2lkXG4gICAgICBieV9tc2dpZDogdGhpcy5jcmVhdGVTdGF0ZU1hcCgpXG5cbiAgICAgIHJlY3ZDdHJsOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ2N0cmwnKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2Q3RybChtc2csIGluZm8pXG5cbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZSh7cm1zZywgbXNnLCBpbmZvfSkudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2TXNnOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ21zZycpXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZNc2cobXNnLCBpbmZvKVxuXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZykudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2U3RyZWFtOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICAgIGNvbnN0IHJzdHJlYW0gPSB0aGlzLnJlY3ZTdHJlYW0obXNnLCBpbmZvKVxuICAgICAgICBjb25zdCBybXNnID0gcnN0cmVhbS5vbl9pbml0XG4gICAgICAgICAgPyByc3RyZWFtLm9uX2luaXQobXNnLCBpbmZvKVxuICAgICAgICAgIDogdGhpcy5yZWN2TXNnKG1zZywgaW5mbylcblxuICAgICAgICBpZiByc3RyZWFtICE9IG51bGwgJiYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIHJzdHJlYW0ub25fZGF0YSA6OlxuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgb2JqZWN0IHdpdGggb25fZGF0YShkYXRhLCBwa3QpIGZ1bmN0aW9uYFxuXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZykudGhlbihyZXBseSlcbiAgICAgICAgcmV0dXJuIHJzdHJlYW1cblxuICByZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cykgOjpcbiAgcmVjdkN0cmwobXNnLCBpbmZvKSA6OlxuICByZWN2TXNnKG1zZywgaW5mbykgOjpcbiAgICByZXR1cm4gQHt9IG1zZywgaW5mb1xuICByZWN2U3RyZWFtKG1zZywgaW5mbykgOjpcbiAgICBjb25zb2xlLndhcm4gQCBgVW5oYW5kbGUgcmVjdiBzdHJlYW06ICR7aW5mb31gXG4gICAgLy9yZXR1cm4gQHt9XG4gICAgLy8gIG9uX2RhdGEoZGF0YSwgcGt0KSA6OlxuICAgIC8vICBvbl9lcnJvcihlcnIsIHBrdCkgOjpcblxuICBpbml0UmVwbHkodG9rZW4sIG1zZ19jdHgsIGtpbmQpIDo6XG4gICAgcmV0dXJuIHRoaXMuaW5pdFJlcGx5UHJvbWlzZSBAIHRva2VuLCBtc2dfY3R4Lm1zX3RpbWVvdXRcblxuICBpbml0TW9uaXRvcihpZF90YXJnZXQpIDo6XG4gICAgY29uc3Qga2V5ID0gaWRfdGFyZ2V0LmlkX3RhcmdldCB8fCBpZF90YXJnZXRcbiAgICBsZXQgbW9uaXRvciA9IHRoaXMuX2J5X3RyYWZmaWMuZ2V0IEAga2V5XG4gICAgaWYgdW5kZWZpbmVkID09PSBtb25pdG9yIDo6XG4gICAgICBtb25pdG9yID0gQHt9IGlkX3RhcmdldCwgdHM6IERhdGUubm93KClcbiAgICAgICAgdGQoKSA6OiByZXR1cm4gRGF0ZS5ub3coKSAtIHRoaXMudHNcbiAgICAgIHRoaXMuX2J5X3RyYWZmaWMuc2V0IEAga2V5LCBtb25pdG9yXG4gICAgcmV0dXJuIG1vbml0b3JcblxuICBpbml0UmVwbHlQcm9taXNlKHRva2VuLCBtc190aW1lb3V0KSA6OlxuICAgIGNvbnN0IGFucyA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHRoaXMuX2J5X3Rva2VuLnNldCBAIHRva2VuLCByZXNvbHZlXG4gICAgICBpZiBtc190aW1lb3V0IDo6XG4gICAgICAgIGNvbnN0IHRpZCA9IHNldFRpbWVvdXQodGltZW91dCwgbXNfdGltZW91dClcbiAgICAgICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgICAgIGZ1bmN0aW9uIHRpbWVvdXQoKSA6OiByZWplY3QgQCBuZXcgdGhpcy5SZXBseVRpbWVvdXRcblxuICAgIHJldHVybiBzZW50ID0+IDo6XG4gICAgICBhbnMuc2VudCA9IHNlbnRcbiAgICAgIHJldHVybiBhbnNcblxuY2xhc3MgUmVwbHlUaW1lb3V0IGV4dGVuZHMgRXJyb3IgOjpcblxuT2JqZWN0LmFzc2lnbiBAIEVuZHBvaW50LnByb3RvdHlwZSwgQHt9XG4gIFJlcGx5VGltZW91dFxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2luayA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHtpbmJvdW5kfSkgOjpcbiAgICBjbGFzcyBTaW5rIGV4dGVuZHMgdGhpcyA6OlxuICAgIFNpbmsucHJvdG90eXBlLl9wcm90b2NvbCA9IGluYm91bmRcbiAgICByZXR1cm4gU2lua1xuXG4gIHN0YXRpYyByZWdpc3RlcihlbmRwb2ludCwga3dfYXJncykgOjpcbiAgICByZXR1cm4gbmV3IHRoaXMoKS5yZWdpc3RlcihlbmRwb2ludCwga3dfYXJncylcbiAgcmVnaXN0ZXIoZW5kcG9pbnQsIHtodWIsIGlkX3RhcmdldCwgb25fbXNnLCBvbl9lcnJvcn0pIDo6XG4gICAgY29uc3QgdW5yZWdpc3RlciA9ICgpID0+IGh1Yi5yb3V0ZXIudW5yZWdpc3RlclRhcmdldChpZF90YXJnZXQpXG5cbiAgICBodWIucm91dGVyLnJlZ2lzdGVyVGFyZ2V0IEAgaWRfdGFyZ2V0LFxuICAgICAgdGhpcy5fYmluZERpc3BhdGNoIEAgZW5kcG9pbnQsIG9uX21zZywgb25fZXJyb3IsIHVucmVnaXN0ZXJcbiAgICByZXR1cm4gdGhpc1xuXG4gIF9iaW5kRGlzcGF0Y2goZW5kcG9pbnQsIG9uX21zZywgb25fZXJyb3IsIHVucmVnaXN0ZXIpIDo6XG4gICAgbGV0IGFsaXZlID0gdHJ1ZVxuICAgIGNvbnN0IHByb3RvY29sID0gdGhpcy5fcHJvdG9jb2xcbiAgICBjb25zdCBpc0FsaXZlID0gKCkgPT4gYWxpdmVcbiAgICBjb25zdCBzaHV0ZG93biA9IChlcnIpID0+IDo6XG4gICAgICBpZiBhbGl2ZSA6OlxuICAgICAgICB1bnJlZ2lzdGVyKCk7IHVucmVnaXN0ZXIgPSBhbGl2ZSA9IGZhbHNlXG4gICAgICAgIGlmIGVyciA6OiBjb25zb2xlLmVycm9yIEAgJ0VORFBPSU5UIFNIVVRET1dOOiAnICsgZXJyXG5cbiAgICBPYmplY3QuYXNzaWduIEAgdGhpcywgZW5kcG9pbnQuYmluZFNpbmsodGhpcyksIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuICAgIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG5cbiAgICByZXR1cm4gYXN5bmMgKHBrdCwgcm91dGVyKSA9PiA6OlxuICAgICAgaWYgZmFsc2U9PT1hbGl2ZSB8fCBudWxsPT1wa3QgOjogcmV0dXJuIGFsaXZlXG5cbiAgICAgIGNvbnN0IHJlY3ZfbXNnID0gcHJvdG9jb2xbcGt0LnR5cGVdXG4gICAgICBpZiB1bmRlZmluZWQgPT09IHJlY3ZfbXNnIDo6XG4gICAgICAgIHJldHVybiBvbl9lcnJvciBAIGZhbHNlLCBAOiBwa3RcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIHZhciBtc2cgPSBhd2FpdCByZWN2X21zZyBAIHBrdCwgdGhpcywgcm91dGVyXG4gICAgICAgIGlmICEgbXNnIDo6IHJldHVybiBtc2dcblxuICAgICAgICByZXR1cm4gYXdhaXQgb25fbXNnIEAgbXNnLCBwa3RcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICBpZiBmYWxzZSAhPT0gb25fZXJyb3IoZXJyLCB7bXNnLCBwa3R9KSA6OlxuICAgICAgICAgIGVuZHBvaW50LnNodXRkb3duKGVyciwge21zZywgcGt0fSlcblxuICBzdGF0ZUZvcihwa3QsIGlmQWJzZW50KSA6OlxuICAgIGNvbnN0IG1zZ2lkID0gcGt0LmluZm8ubXNnaWRcbiAgICBsZXQgZW50cnkgPSB0aGlzLmJ5X21zZ2lkLmdldChtc2dpZClcbiAgICBpZiB1bmRlZmluZWQgPT09IGVudHJ5IDo6XG4gICAgICBpZiAhIG1zZ2lkIDo6XG4gICAgICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIG1zZ2lkOiAke21zZ2lkfWBcbiAgICAgIGlmICdmdW5jdGlvbicgPT09IHR5cGVvZiBpZkFic2VudCA6OlxuICAgICAgICBlbnRyeSA9IGlmQWJzZW50KHBrdCwgdGhpcylcbiAgICAgIGVsc2UgZW50cnkgPSBpZkFic2VudFxuICAgICAgdGhpcy5ieV9tc2dpZC5zZXQgQCBtc2dpZCwgZW50cnlcbiAgICByZXR1cm4gZW50cnlcblxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgTXNnQ3R4IDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe3JhbmRvbV9pZCwgY29kZWNzfSkgOjpcbiAgICBjbGFzcyBNc2dDdHggZXh0ZW5kcyB0aGlzIDo6XG4gICAgTXNnQ3R4LnByb3RvdHlwZS5yYW5kb21faWQgPSByYW5kb21faWRcbiAgICBNc2dDdHgud2l0aENvZGVjcyBAIGNvZGVjc1xuICAgIHJldHVybiBNc2dDdHhcblxuICBjb25zdHJ1Y3Rvcihmcm9tX2lkLCByZXNvbHZlUm91dGUpIDo6XG4gICAgaWYgbnVsbCAhPT0gZnJvbV9pZCA6OlxuICAgICAgY29uc3Qge2lkX3RhcmdldCwgaWRfcm91dGVyfSA9IGZyb21faWRcbiAgICAgIGZyb21faWQgPSBPYmplY3QuZnJlZXplIEA6IGlkX3RhcmdldCwgaWRfcm91dGVyXG5cbiAgICBjb25zdCBjdHggPSB7ZnJvbV9pZH1cbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyBAIHRoaXMsIEA6XG4gICAgICBfcm9vdF86IEA6IHZhbHVlOiB0aGlzXG4gICAgICBmcm9tX2lkOiBAOiB2YWx1ZTogZnJvbV9pZFxuICAgICAgY3R4OiBAOiB2YWx1ZTogY3R4XG4gICAgICByZXNvbHZlUm91dGU6IEA6IHZhbHVlOiByZXNvbHZlUm91dGVcblxuICB3aXRoRW5kcG9pbnQoZW5kcG9pbnQpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQHt9XG4gICAgICBlbmRwb2ludDogQHt9IHZhbHVlOiBlbmRwb2ludFxuXG4gIHN0YXRpYyBmcm9tKGlkX3RhcmdldCwgaHViKSA6OlxuICAgIGNvbnN0IGZyb21faWQgPSBudWxsID09PSBpZF90YXJnZXQgPyBudWxsXG4gICAgICA6IEB7fSBpZF90YXJnZXQsIGlkX3JvdXRlcjogaHViLnJvdXRlci5pZF9zZWxmXG4gICAgcmV0dXJuIG5ldyB0aGlzIEAgZnJvbV9pZCwgaHViLmJpbmRSb3V0ZURpc3BhdGNoKClcblxuICBnZXQgdG8oKSA6OiByZXR1cm4gKC4uLmFyZ3MpID0+IHRoaXMuY2xvbmUoKS53aXRoIEAgLi4uYXJnc1xuXG4gIHBpbmcodG9rZW49dHJ1ZSkgOjogcmV0dXJuIHRoaXMuY29kZWMoJ2NvbnRyb2wnLCB7dG9rZW59KS5pbnZva2UgQCAncGluZydcbiAgc2VuZCguLi5hcmdzKSA6OiByZXR1cm4gdGhpcy5pbnZva2UgQCAnc2VuZCcsIC4uLmFyZ3NcbiAgc3RyZWFtKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLmludm9rZSBAICdzdHJlYW0nLCAuLi5hcmdzXG5cbiAgaW52b2tlKGtleSwgLi4uYXJncykgOjpcbiAgICBjb25zdCBvYmogPSBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4XG4gICAgdGhpcy5hc3NlcnRNb25pdG9yKClcbiAgICBjb25zdCBjaGFuID0gdGhpcy5yZXNvbHZlUm91dGUob2JqLmlkX3JvdXRlcilcbiAgICBpZiB0cnVlICE9PSBvYmoudG9rZW4gOjpcbiAgICAgIHJldHVybiB0aGlzLl9jb2RlY1trZXldIEAgY2hhbiwgb2JqLCAuLi5hcmdzXG5cbiAgICBlbHNlIDo6XG4gICAgICBjb25zdCB0b2tlbiA9IG9iai50b2tlbiA9IHRoaXMucmFuZG9tX2lkKClcbiAgICAgIGNvbnN0IHJlcGx5ID0gdGhpcy5lbmRwb2ludC5pbml0UmVwbHkodG9rZW4sIHRoaXMsIGtleSlcbiAgICAgIHJldHVybiByZXBseSBAIHRoaXMuX2NvZGVjW2tleV0gQCBjaGFuLCBvYmosIC4uLmFyZ3NcblxuXG4gIHdpdGgoLi4uYXJncykgOjpcbiAgICBjb25zdCBjdHggPSB0aGlzLmN0eFxuICAgIGZvciBsZXQgdGd0IG9mIGFyZ3MgOjpcbiAgICAgIGlmICdudW1iZXInID09PSB0eXBlb2YgdGd0IDo6XG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSB0Z3RcbiAgICAgICAgY3R4LmlkX3JvdXRlciA9IGN0eC5mcm9tX2lkLmlkX3JvdXRlclxuICAgICAgICBjb250aW51ZVxuXG4gICAgICBjb25zdCB7ZnJvbV9pZDogcmVwbHlfaWQsIGlkX3RhcmdldCwgaWRfcm91dGVyLCB0b2tlbiwgbXNnaWR9ID0gdGd0XG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gaWRfdGFyZ2V0IDo6XG4gICAgICAgIGlmIHVuZGVmaW5lZCA9PT0gaWRfcm91dGVyIDo6XG4gICAgICAgICAgaWYgISBjdHguaWRfcm91dGVyIDo6XG4gICAgICAgICAgICAvLyBpbXBsaWNpdGx5IG9uIHRoZSBzYW1lIHJvdXRlclxuICAgICAgICAgICAgY3R4LmlkX3JvdXRlciA9IGN0eC5mcm9tX2lkLmlkX3JvdXRlclxuICAgICAgICBlbHNlIGN0eC5pZF9yb3V0ZXIgPSBpZF9yb3V0ZXJcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IGlkX3RhcmdldFxuICAgICAgZWxzZSBpZiB1bmRlZmluZWQgIT09IGlkX3JvdXRlciA6OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgUGFzc2luZyAnaWRfcm91dGVyJyByZXF1aXJlcyAnaWRfdGFyZ2V0J2BcbiAgICAgIGVsc2UgaWYgdW5kZWZpbmVkICE9PSByZXBseV9pZCAmJiAhIGN0eC5pZF90YXJnZXQgOjpcbiAgICAgICAgY3R4LmlkX3JvdXRlciA9IHJlcGx5X2lkLmlkX3JvdXRlclxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gcmVwbHlfaWQuaWRfdGFyZ2V0XG5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdG9rZW4gOjogY3R4LnRva2VuID0gdG9rZW5cbiAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnaWQgOjogY3R4Lm1zZ2lkID0gbXNnaWRcblxuICAgIHJldHVybiB0aGlzXG5cbiAgd2l0aFJlcGx5KCkgOjpcbiAgICByZXR1cm4gdGhpcy5jbG9uZSBAOiB0b2tlbjogdHJ1ZVxuXG4gIHJlc2V0KC4uLmFyZ3MpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLl9yb290XywgQHt9XG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG4gIGNsb25lKC4uLmFyZ3MpIDo6XG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAe31cbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuXG4gIGFzc2VydE1vbml0b3IoKSA6OlxuICAgIGlmICEgdGhpcy5jaGVja01vbml0b3IoKSA6OlxuICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYFRhcmdldCBtb25pdG9yIGV4cGlyZWRgXG4gIGNoZWNrTW9uaXRvcigpIDo6IHJldHVybiB0cnVlXG4gIG1vbml0b3Iob3B0aW9ucz17fSkgOjpcbiAgICBpZiB0cnVlID09PSBvcHRpb25zIHx8IGZhbHNlID09PSBvcHRpb25zIDo6XG4gICAgICBvcHRpb25zID0gQHt9IGFjdGl2ZTogb3B0aW9uc1xuXG4gICAgY29uc3QgbW9uaXRvciA9IHRoaXMuZW5kcG9pbnQuaW5pdE1vbml0b3IodGhpcy5jdHguaWRfdGFyZ2V0KVxuXG4gICAgY29uc3QgdHNfZHVyYXRpb24gPSBvcHRpb25zLnRzX2R1cmF0aW9uIHx8IDUwMDBcbiAgICBsZXQgdHNfYWN0aXZlID0gb3B0aW9ucy50c19hY3RpdmVcbiAgICBpZiB0cnVlID09PSB0c19hY3RpdmUgOjpcbiAgICAgIHRzX2FjdGl2ZSA9IHRzX2R1cmF0aW9uLzRcblxuICAgIGxldCBjaGVja01vbml0b3JcbiAgICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgY29uc3QgZG9uZSA9IG9wdGlvbnMucmVqZWN0ID8gcmVqZWN0IDogcmVzb2x2ZVxuICAgICAgdGhpcy5jaGVja01vbml0b3IgPSBjaGVja01vbml0b3IgPSAoKSA9PlxuICAgICAgICB0c19kdXJhdGlvbiA+IG1vbml0b3IudGQoKVxuICAgICAgICAgID8gdHJ1ZSA6IChkb25lKG1vbml0b3IpLCBmYWxzZSlcblxuICAgIGxldCB0aWRcbiAgICBjb25zdCB0c19pbnRlcnZhbCA9IHRzX2FjdGl2ZSB8fCB0c19kdXJhdGlvbi80XG4gICAgaWYgb3B0aW9ucy5hY3RpdmUgfHwgdHNfYWN0aXZlIDo6XG4gICAgICBjb25zdCBjdHJsID0gdGhpcy5jb2RlYygnY29udHJvbCcpXG4gICAgICBjb25zdCBjaGVja1BpbmcgPSAoKSA9PiA6OlxuICAgICAgICBpZiB0c19pbnRlcnZhbCA+IG1vbml0b3IudGQoKSA6OlxuICAgICAgICAgIGN0cmwuaW52b2tlKCdwaW5nJylcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tQaW5nLCB0c19pbnRlcnZhbFxuICAgIGVsc2UgOjpcbiAgICAgIHRpZCA9IHNldEludGVydmFsIEAgY2hlY2tNb25pdG9yLCB0c19pbnRlcnZhbFxuICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuICAgIGNvbnN0IGNsZWFyID0gKCkgPT4gY2xlYXJJbnRlcnZhbCh0aWQpXG5cbiAgICBwcm9taXNlLnRoZW4oY2xlYXIsIGNsZWFyKVxuICAgIHJldHVybiBwcm9taXNlXG5cblxuICBjb2RlYyhtc2dfY29kZWMsIC4uLmFyZ3MpIDo6XG4gICAgaWYgJ3N0cmluZycgPT09IHR5cGVvZiBtc2dfY29kZWMgOjpcbiAgICAgIG1zZ19jb2RlYyA9IHRoaXMuX21zZ0NvZGVjc1ttc2dfY29kZWNdXG5cbiAgICBpZiAnZnVuY3Rpb24nICE9PSB0eXBlb2YgbXNnX2NvZGVjLnNlbmQgOjpcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IgQCBgRXhwZWN0ZWQgcGFja2V0IGNvZGVjIHByb3RvY29sYFxuXG4gICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCB0aGlzLCBAOlxuICAgICAgX2NvZGVjOiBAOiB2YWx1ZTogbXNnX2NvZGVjXG4gICAgICBjdHg6IEA6IHZhbHVlOiBPYmplY3QuYXNzaWduIEAge30sIHRoaXMuY3R4LCAuLi5hcmdzXG5cbiAgc3RhdGljIHdpdGhDb2RlY3MobXNnQ29kZWNzKSA6OlxuICAgIGZvciBjb25zdCBbbmFtZSwgbXNnX2NvZGVjXSBvZiBPYmplY3QuZW50cmllcyBAIG1zZ0NvZGVjcyA6OlxuICAgICAgdGhpcy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIDo6XG4gICAgICAgIHJldHVybiB0aGlzLmNvZGVjIEAgbXNnX2NvZGVjXG4gICAgdGhpcy5wcm90b3R5cGUuX21zZ0NvZGVjcyA9IG1zZ0NvZGVjc1xuICAgIHRoaXMucHJvdG90eXBlLl9jb2RlYyA9IG1zZ0NvZGVjcy5kZWZhdWx0XG4gICAgcmV0dXJuIHRoaXNcblxuT2JqZWN0LmFzc2lnbiBAIE1zZ0N0eC5wcm90b3R5cGUsIEB7fVxuICBtc190aW1lb3V0OiA1MDAwXG5cbiIsImltcG9ydCBpbml0X3Byb3RvY29sIGZyb20gJy4vcHJvdG9jb2wvaW5kZXguanN5J1xuaW1wb3J0IEVuZHBvaW50QmFzZSBmcm9tICcuL2VuZHBvaW50LmpzeSdcbmltcG9ydCBTaW5rQmFzZSBmcm9tICcuL3NpbmsuanN5J1xuaW1wb3J0IE1zZ0N0eEJhc2UgZnJvbSAnLi9tc2djdHguanN5J1xuXG5jb25zdCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zID0gQDpcbiAgb25fZXJyb3I6IGNvbnNvbGUuZXJyb3JcbiAgc3ViY2xhc3Moe1NpbmssIEVuZHBvaW50LCBTb3VyY2VFbmRwb2ludCwgcHJvdG9jb2xzfSkgOjpcblxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbihwbHVnaW5fb3B0aW9ucykgOjpcbiAgcGx1Z2luX29wdGlvbnMgPSBPYmplY3QuYXNzaWduIEAge30sIGRlZmF1bHRfcGx1Z2luX29wdGlvbnMsIHBsdWdpbl9vcHRpb25zXG4gIGNvbnN0IEB7fVxuICAgIHJhbmRvbV9pZFxuICAgIG9uX2Vycm9yOiBkZWZhdWx0X29uX2Vycm9yXG4gID0gcGx1Z2luX29wdGlvbnNcblxuICByZXR1cm4gQDogb3JkZXI6IDEsIHN1YmNsYXNzLCBwb3N0XG4gIFxuICBmdW5jdGlvbiBzdWJjbGFzcyhGYWJyaWNIdWJfUEksIGJhc2VzKSA6OlxuICAgIGNvbnN0IHtwYWNrZXRQYXJzZXJ9ID0gRmFicmljSHViX1BJLnByb3RvdHlwZVxuICAgIGlmIG51bGw9PXBhY2tldFBhcnNlciB8fCAhIHBhY2tldFBhcnNlci5pc1BhY2tldFBhcnNlcigpIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEludmFsaWQgcGFja2V0UGFyc2VyIGZvciBwbHVnaW5gXG4gICAgXG4gICAgRmFicmljSHViX1BJLnByb3RvdHlwZS5lbmRwb2ludCA9XG4gICAgICBiaW5kRW5kcG9pbnRBcGkgQCBwYWNrZXRQYXJzZXJcblxuICBmdW5jdGlvbiBwb3N0KGh1YikgOjpcbiAgICByZXR1cm4gaHViLmVuZHBvaW50ID0gaHViLmVuZHBvaW50KGh1YilcblxuICBmdW5jdGlvbiBiaW5kRW5kcG9pbnRBcGkocGFja2V0UGFyc2VyKSA6OlxuICAgIGNvbnN0IHByb3RvY29scyA9IGluaXRfcHJvdG9jb2wgQCBwYWNrZXRQYXJzZXIsIHJhbmRvbV9pZFxuICAgIGNvbnN0IFNpbmsgPSBTaW5rQmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuICAgIGNvbnN0IE1zZ0N0eCA9IE1zZ0N0eEJhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICBjb25zdCBFbmRwb2ludCA9IEVuZHBvaW50QmFzZS5mb3JQcm90b2NvbHMocHJvdG9jb2xzKVxuXG4gICAgcGx1Z2luX29wdGlvbnMuc3ViY2xhc3MgQDpcbiAgICAgIFNpbmssIEVuZHBvaW50LCBNc2dDdHgsIHByb3RvY29sc1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGh1YikgOjpcbiAgICAgIHJldHVybiBPYmplY3QuYXNzaWduIEAgZW5kcG9pbnQsIEA6IGNyZWF0ZTogZW5kcG9pbnQsIHNlcnZlcjogZW5kcG9pbnQsIGNsaWVudFxuXG4gICAgICBmdW5jdGlvbiBjbGllbnQoLi4uYXJncykgOjpcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IE1zZ0N0eC5mcm9tIEAgbnVsbCwgaHViXG4gICAgICAgIHJldHVybiAwICE9PSBhcmdzLmxlbmd0aFxuICAgICAgICAgID8gbXNnX2N0eC53aXRoKC4uLmFyZ3MpIDogbXNnX2N0eFxuXG4gICAgICBmdW5jdGlvbiBlbmRwb2ludChvbl9pbml0KSA6OlxuICAgICAgICBjb25zdCBpZF90YXJnZXQgPSByYW5kb21faWQoKVxuICAgICAgICBjb25zdCBtc2dfY3R4ID0gTXNnQ3R4LmZyb20gQCBpZF90YXJnZXQsIGh1YlxuICAgICAgICBjb25zdCBlcCA9IG5ldyBFbmRwb2ludChtc2dfY3R4KVxuXG4gICAgICAgIGNvbnN0IHRhcmdldCA9IG9uX2luaXQoZXApXG4gICAgICAgIGNvbnN0IG9uX21zZyA9ICh0YXJnZXQub25fbXNnIHx8IHRhcmdldCkuYmluZCh0YXJnZXQpXG4gICAgICAgIGNvbnN0IG9uX2Vycm9yID0gKHRhcmdldC5vbl9lcnJvciB8fCBkZWZhdWx0X29uX2Vycm9yKS5iaW5kKHRhcmdldClcblxuICAgICAgICBTaW5rLnJlZ2lzdGVyIEAgZXAsIEB7fVxuICAgICAgICAgIGh1YiwgaWRfdGFyZ2V0LCBvbl9tc2csIG9uX2Vycm9yXG5cbiAgICAgICAgaWYgdGFyZ2V0Lm9uX3JlYWR5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHRhcmdldCkudGhlbiBAXG4gICAgICAgICAgICB0YXJnZXQgPT4gdGFyZ2V0Lm9uX3JlYWR5KClcblxuICAgICAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIGVuZHBvaW50X3RhcmdldF9hcGksIEA6XG4gICAgICAgICAgaWRfcm91dGVyOiBAe30gZW51bWVyYWJsZTogdHJ1ZSwgdmFsdWU6IGh1Yi5yb3V0ZXIuaWRfc2VsZlxuICAgICAgICAgIGlkX3RhcmdldDogQHt9IGVudW1lcmFibGU6IHRydWUsIHZhbHVlOiBpZF90YXJnZXRcblxuY29uc3QgZW5kcG9pbnRfdGFyZ2V0X2FwaSA9IEA6XG4gIHZhbHVlT2YoKSA6OiByZXR1cm4gMCB8IHRoaXMuaWRfdGFyZ2V0XG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRW5kcG9pbnQgVGFyZ2V0ICR7dGhpcy5pZF90YXJnZXR9wrtgXG5cbiIsImltcG9ydCBlbmRwb2ludF9wbHVnaW4gZnJvbSAnLi9wbHVnaW4uanN5J1xuXG5jb25zdCBnZXRSYW5kb21WYWx1ZXMgPSAndW5kZWZpbmVkJyAhPT0gdHlwZW9mIHdpbmRvd1xuICA/IHdpbmRvdy5jcnlwdG8uZ2V0UmFuZG9tVmFsdWVzIDogbnVsbFxuXG5lbmRwb2ludF9icm93c2VyLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuZnVuY3Rpb24gcmFuZG9tX2lkKCkgOjpcbiAgY29uc3QgYXJyID0gbmV3IEludDMyQXJyYXkoMSlcbiAgZ2V0UmFuZG9tVmFsdWVzKGFycilcbiAgcmV0dXJuIGFyclswXVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBlbmRwb2ludF9icm93c2VyKHBsdWdpbl9vcHRpb25zPXt9KSA6OlxuICBpZiBudWxsID09IHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA6OlxuICAgIHBsdWdpbl9vcHRpb25zLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuXG4gIHJldHVybiBlbmRwb2ludF9wbHVnaW4ocGx1Z2luX29wdGlvbnMpXG5cbiJdLCJuYW1lcyI6WyJsaXR0bGVfZW5kaWFuIiwiY19zaW5nbGUiLCJjX2RhdGFncmFtIiwiY19kaXJlY3QiLCJjX211bHRpcGFydCIsImNfc3RyZWFtaW5nIiwiX2Vycl9tc2dpZF9yZXF1aXJlZCIsIl9lcnJfdG9rZW5fcmVxdWlyZWQiLCJmcm1fcm91dGluZyIsInNpemUiLCJiaXRzIiwibWFzayIsIm9iaiIsImZyb21faWQiLCJkdiIsIm9mZnNldCIsInNldEludDMyIiwiaWRfcm91dGVyIiwiaWRfdGFyZ2V0IiwidW5kZWZpbmVkIiwiZ2V0SW50MzIiLCJmcm1fcmVzcG9uc2UiLCJtc2dpZCIsIkVycm9yIiwic2V0SW50MTYiLCJzZXFfYWNrIiwiYWNrX2ZsYWdzIiwidG9rZW4iLCJnZXRJbnQxNiIsImZybV9kYXRhZ3JhbSIsInRyYW5zcG9ydCIsImZybV9kaXJlY3QiLCJmcm1fbXVsdGlwYXJ0Iiwic2VxX3BvcyIsInNlcSIsInNlcV9mbGFncyIsImZybV9zdHJlYW1pbmciLCJiaW5kX3NlcV9uZXh0Iiwic2VxX29mZnNldCIsInNlcV9uZXh0IiwiZmxhZ3MiLCJmaW4iLCJOYU4iLCJjb21wb3NlRnJhbWluZ3MiLCJmcm1fZnJvbSIsImZybV9yZXNwIiwiZnJtX3RyYW5zcG9ydHMiLCJsZW5ndGgiLCJieUJpdHMiLCJ0X2Zyb20iLCJmX3Rlc3QiLCJ0X3Jlc3AiLCJ0MCIsInQxIiwidDIiLCJ0MyIsIm1hcCIsImYiLCJ0ZXN0Qml0cyIsImNob29zZSIsImxzdCIsIlQiLCJiIiwib3AiLCJmbl9rZXkiLCJmbl90cmFuIiwiZm5fZnJvbSIsImZuX3Jlc3AiLCJmcm0iLCJiaW5kQXNzZW1ibGVkIiwiZl9wYWNrIiwiZl91bnBhY2siLCJwYWNrIiwidW5wYWNrIiwicGt0X3R5cGUiLCJwa3Rfb2JqIiwiVHlwZUVycm9yIiwidHlwZSIsIkRhdGFWaWV3IiwiQXJyYXlCdWZmZXIiLCJoZWFkZXIiLCJidWZmZXIiLCJzbGljZSIsInBrdCIsImJ1ZiIsImhlYWRlcl9idWZmZXIiLCJVaW50OEFycmF5IiwiaW5mbyIsIl9iaW5kX2l0ZXJhYmxlIiwiYnVmX2Nsb25lIiwidHRsIiwibmV4dCIsIm9wdGlvbnMiLCJkb25lIiwidmFsdWUiLCJwYWNrZXRQYXJzZXIiLCJyYW5kb21faWQiLCJmcmFnbWVudF9zaXplIiwiY29uY2F0QnVmZmVycyIsInBhY2tQYWNrZXRPYmoiLCJwYWNrX3V0ZjgiLCJ1bnBhY2tfdXRmOCIsIk51bWJlciIsImNyZWF0ZVN0cmVhbSIsInBhY2tldEZyYWdtZW50cyIsImNyZWF0ZU11bHRpcGFydCIsInNpbmsiLCJwYXJ0cyIsImZlZWQiLCJib2R5X2J1ZmZlciIsImluY2x1ZGVzIiwicmVzIiwicnN0cmVhbSIsInN0YXRlIiwiZmVlZF9pbml0Iiwib25fZXJyb3IiLCJlcnIiLCJjb25zb2xlIiwid2FybiIsImFzX2NvbnRlbnQiLCJmZWVkX2lnbm9yZSIsIm1zZyIsImJvZHlfanNvbiIsInJlY3ZTdHJlYW0iLCJmZWVkX3NlcSIsImZlZWRfYm9keSIsIm9uX2luaXQiLCJyZWN2TXNnIiwiZGF0YSIsIm9uX2RhdGEiLCJuZXh0X2hkciIsImkiLCJsYXN0SW5uZXIiLCJieXRlTGVuZ3RoIiwiaTAiLCJib2R5IiwiYmluZFRyYW5zcG9ydEltcGxzIiwiaW5ib3VuZCIsImhpZ2hiaXRzIiwidHJhbnNwb3J0cyIsIm91dGJvdW5kIiwiZnJhbWluZ3MiLCJmcmFtZSIsImltcGwiLCJ0X3JlY3YiLCJwYWNrX2hkciIsInJlY3ZfbXNnIiwiYmluZFRyYW5zcG9ydHMiLCJwYWNrQm9keSIsInN0cmVhbSIsInN0cmVhbWluZyIsIm1vZGUiLCJiaW5kX3N0cmVhbSIsIm1zZW5kX29iamVjdHMiLCJtc2VuZF9ieXRlcyIsInNlbmQiLCJjaGFuIiwibXNlbmQiLCJzZW50Iiwic2VuZF9pbXBsIiwiSlNPTiIsInN0cmluZ2lmeSIsIndyaXRlIiwiZW5kIiwiY2h1bmsiLCJqc29uX3Byb3RvY29sIiwic2hhcmVkIiwiZGF0YWdyYW0iLCJkaXJlY3QiLCJwYXJzZSIsImJvZHlfdXRmOCIsInN0YXRlRm9yIiwiYm9keV9idWYiLCJwa3RfYXNfbmRqc29uIiwic3BsaXQiLCJmaWx0ZXIiLCJsIiwiYmluYXJ5X3Byb3RvY29sIiwiYXNCdWZmZXIiLCJwa3RfYnVmZmVyIiwiY29udHJvbF9wcm90b2NvbCIsImhpZ2giLCJwaW5nX2ZyYW1lIiwicG9uZ19mcmFtZSIsInBvbmdfdHlwZSIsInJlY3ZfcG9uZyIsInBpbmdfdHlwZSIsInJlY3ZfcGluZyIsInBpbmciLCJ0czAiLCJEYXRlIiwicm91dGVyIiwicmVjdkN0cmwiLCJfc2VuZF9wb25nIiwicGt0X3BpbmciLCJyX2lkIiwidHMxIiwiZGlzcGF0Y2giLCJpbml0X3Byb3RvY29sIiwic2hhcmVkX3Byb3RvIiwianNvbiIsImpzb25fcHJvdG8iLCJiaW5hcnkiLCJiaW5hcnlfcHJvdG8iLCJjb250cm9sIiwiY29udHJvbF9wcm90byIsImNvZGVjcyIsImRlZmF1bHQiLCJFbmRwb2ludCIsImZvclByb3RvY29scyIsIm1zZ19jdHgiLCJ3aXRoRW5kcG9pbnQiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiY3JlYXRlUmVwbHlNYXAiLCJjcmVhdGVUcmFmZmljTWFwIiwiZW51bWVyYWJsZSIsInRvIiwiTWFwIiwiY3JlYXRlTWFwIiwiYnlfdG9rZW4iLCJfYnlfdG9rZW4iLCJieV90cmFmZmljIiwiX2J5X3RyYWZmaWMiLCJ0cmFmZmljIiwidHMiLCJub3ciLCJ0IiwiZ2V0IiwicmVjdlRyYWZmaWMiLCJjcmVhdGVTdGF0ZU1hcCIsInJtc2ciLCJyZXBseSIsInJlc29sdmUiLCJ0aGVuIiwiaW5pdFJlcGx5Iiwia2luZCIsImluaXRSZXBseVByb21pc2UiLCJtc190aW1lb3V0Iiwia2V5IiwibW9uaXRvciIsInNldCIsImFucyIsIlByb21pc2UiLCJyZWplY3QiLCJ0aWQiLCJzZXRUaW1lb3V0IiwidGltZW91dCIsInVucmVmIiwiUmVwbHlUaW1lb3V0IiwiT2JqZWN0IiwiYXNzaWduIiwicHJvdG90eXBlIiwiU2luayIsIl9wcm90b2NvbCIsInJlZ2lzdGVyIiwiZW5kcG9pbnQiLCJrd19hcmdzIiwiaHViIiwib25fbXNnIiwidW5yZWdpc3RlciIsInVucmVnaXN0ZXJUYXJnZXQiLCJyZWdpc3RlclRhcmdldCIsIl9iaW5kRGlzcGF0Y2giLCJhbGl2ZSIsInByb3RvY29sIiwiaXNBbGl2ZSIsInNodXRkb3duIiwiZXJyb3IiLCJiaW5kU2luayIsImlmQWJzZW50IiwiZW50cnkiLCJieV9tc2dpZCIsIk1zZ0N0eCIsIndpdGhDb2RlY3MiLCJyZXNvbHZlUm91dGUiLCJmcmVlemUiLCJjdHgiLCJmcm9tIiwiaWRfc2VsZiIsImJpbmRSb3V0ZURpc3BhdGNoIiwiYXJncyIsImNsb25lIiwid2l0aCIsImNvZGVjIiwiaW52b2tlIiwiYXNzZXJ0TW9uaXRvciIsIl9jb2RlYyIsInRndCIsInJlcGx5X2lkIiwiY3JlYXRlIiwiX3Jvb3RfIiwiY2hlY2tNb25pdG9yIiwiYWN0aXZlIiwiaW5pdE1vbml0b3IiLCJ0c19kdXJhdGlvbiIsInRzX2FjdGl2ZSIsInByb21pc2UiLCJ0ZCIsInRzX2ludGVydmFsIiwiY3RybCIsImNoZWNrUGluZyIsInNldEludGVydmFsIiwiY2xlYXIiLCJjbGVhckludGVydmFsIiwibXNnX2NvZGVjIiwiX21zZ0NvZGVjcyIsIm1zZ0NvZGVjcyIsIm5hbWUiLCJlbnRyaWVzIiwiZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyIsIlNvdXJjZUVuZHBvaW50IiwicHJvdG9jb2xzIiwicGx1Z2luX29wdGlvbnMiLCJkZWZhdWx0X29uX2Vycm9yIiwib3JkZXIiLCJzdWJjbGFzcyIsInBvc3QiLCJGYWJyaWNIdWJfUEkiLCJiYXNlcyIsImlzUGFja2V0UGFyc2VyIiwiYmluZEVuZHBvaW50QXBpIiwiU2lua0Jhc2UiLCJNc2dDdHhCYXNlIiwiRW5kcG9pbnRCYXNlIiwic2VydmVyIiwiY2xpZW50IiwiZXAiLCJ0YXJnZXQiLCJiaW5kIiwib25fcmVhZHkiLCJlbmRwb2ludF90YXJnZXRfYXBpIiwiZ2V0UmFuZG9tVmFsdWVzIiwid2luZG93IiwiY3J5cHRvIiwiZW5kcG9pbnRfYnJvd3NlciIsImFyciIsIkludDMyQXJyYXkiLCJlbmRwb2ludF9wbHVnaW4iXSwibWFwcGluZ3MiOiI7O0FBQUEsTUFBTUEsZ0JBQWdCLElBQXRCO0FBQ0EsTUFBTUMsV0FBVyxRQUFqQjtBQUNBLE1BQU1DLGFBQWEsVUFBbkI7QUFDQSxNQUFNQyxXQUFXLFFBQWpCO0FBQ0EsTUFBTUMsY0FBYyxXQUFw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

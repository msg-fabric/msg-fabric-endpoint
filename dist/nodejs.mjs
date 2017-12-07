import { randomBytes } from 'crypto';

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

endpoint_nodejs.random_id = random_id;
function random_id() {
  return randomBytes(4).readInt32LE();
}

function endpoint_nodejs(plugin_options = {}) {
  if (null == plugin_options.random_id) {
    plugin_options.random_id = random_id;
  }

  return endpoint_plugin(plugin_options);
}

export default endpoint_nodejs;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZWpzLm1qcyIsInNvdXJjZXMiOlsiLi4vY29kZS9wcm90b2NvbC9mcmFtaW5nLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvc2hhcmVkLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvanNvbi5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2JpbmFyeS5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2NvbnRyb2wuanN5IiwiLi4vY29kZS9wcm90b2NvbC9pbmRleC5qc3kiLCIuLi9jb2RlL2VuZHBvaW50LmpzeSIsIi4uL2NvZGUvc2luay5qc3kiLCIuLi9jb2RlL21zZ2N0eC5qc3kiLCIuLi9jb2RlL3BsdWdpbi5qc3kiLCIuLi9jb2RlL2luZGV4Lm5vZGVqcy5qc3kiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgbGl0dGxlX2VuZGlhbiA9IHRydWVcbmNvbnN0IGNfc2luZ2xlID0gJ3NpbmdsZSdcbmNvbnN0IGNfZGF0YWdyYW0gPSAnZGF0YWdyYW0nXG5jb25zdCBjX2RpcmVjdCA9ICdkaXJlY3QnXG5jb25zdCBjX211bHRpcGFydCA9ICdtdWx0aXBhcnQnXG5jb25zdCBjX3N0cmVhbWluZyA9ICdzdHJlYW1pbmcnXG5cbmNvbnN0IF9lcnJfbXNnaWRfcmVxdWlyZWQgPSBgUmVzcG9uc2UgcmVxaXJlcyAnbXNnaWQnYFxuY29uc3QgX2Vycl90b2tlbl9yZXF1aXJlZCA9IGBUcmFuc3BvcnQgcmVxaXJlcyAndG9rZW4nYFxuXG5cbmZ1bmN0aW9uIGZybV9yb3V0aW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDEsIG1hc2sgPSAweDFcbiAgcmV0dXJuIEB7fVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBudWxsICE9IG9iai5mcm9tX2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgY29uc3Qge2Zyb21faWR9ID0gb2JqXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCAwfGZyb21faWQuaWRfcm91dGVyLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQzMiBAIDQrb2Zmc2V0LCAwfGZyb21faWQuaWRfdGFyZ2V0LCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCBmcm9tX2lkID0gdW5kZWZpbmVkID09PSBvYmouZnJvbV9pZFxuICAgICAgICA/IG9iai5mcm9tX2lkID0ge30gOiBvYmouZnJvbV9pZFxuICAgICAgZnJvbV9pZC5pZF9yb3V0ZXIgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBmcm9tX2lkLmlkX3RhcmdldCA9IGR2LmdldEludDMyIEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuZnVuY3Rpb24gZnJtX3Jlc3BvbnNlKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDIsIG1hc2sgPSAweDJcbiAgcmV0dXJuIEB7fVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBudWxsICE9IG9iai5tc2dpZCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLm1zZ2lkIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfbXNnaWRfcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai5tc2dpZCwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxX2FjaywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouYWNrX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudG9rZW4gPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2FjayA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5hY2tfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG5cblxuXG5mdW5jdGlvbiBmcm1fZGF0YWdyYW0oKSA6OlxuICBjb25zdCBzaXplID0gMCwgYml0cyA9IDB4MCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19kYXRhZ3JhbVxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6XG4gICAgICBpZiBjX2RhdGFncmFtID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEgb2JqLnRva2VuID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGF0YWdyYW1cblxuZnVuY3Rpb24gZnJtX2RpcmVjdCgpIDo6XG4gIGNvbnN0IHNpemUgPSA0LCBiaXRzID0gMHg0LCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RpcmVjdFxuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6XG4gICAgICBpZiBjX2RpcmVjdCA9PT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gYml0c1xuICAgICAgaWYgb2JqLnRyYW5zcG9ydCAmJiBjX3NpbmdsZSAhPT0gb2JqLnRyYW5zcG9ydCA6OiByZXR1cm4gZmFsc2VcbiAgICAgIHJldHVybiAhISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX2RpcmVjdFxuXG5mdW5jdGlvbiBmcm1fbXVsdGlwYXJ0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweDgsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfbXVsdGlwYXJ0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfbXVsdGlwYXJ0ID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6IC8vIHVzZSBzZXFfbmV4dFxuICAgICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwLCBsaXR0bGVfZW5kaWFuXG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19tdWx0aXBhcnRcblxuZnVuY3Rpb24gZnJtX3N0cmVhbWluZygpIDo6XG4gIGNvbnN0IHNpemUgPSA4LCBiaXRzID0gMHhjLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX3N0cmVhbWluZ1xuICAgIHNpemUsIGJpdHMsIG1hc2tcblxuICAgIGZfdGVzdChvYmopIDo6IHJldHVybiBjX3N0cmVhbWluZyA9PT0gb2JqLnRyYW5zcG9ydCA/IGJpdHMgOiBmYWxzZVxuXG4gICAgYmluZF9zZXFfbmV4dCwgc2VxX3BvczogNFxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBpZiAhIG9iai50b2tlbiA6OiB0aHJvdyBuZXcgRXJyb3IgQCBfZXJyX3Rva2VuX3JlcXVpcmVkXG4gICAgICBkdi5zZXRJbnQzMiBAIDArb2Zmc2V0LCBvYmoudG9rZW4sIGxpdHRsZV9lbmRpYW5cbiAgICAgIGlmIHRydWUgPT0gb2JqLnNlcSA6OlxuICAgICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwLCBsaXR0bGVfZW5kaWFuIC8vIHVzZSBzZXFfbmV4dFxuICAgICAgZWxzZSBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgNitvZmZzZXQsIDB8b2JqLnNlcV9mbGFncywgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkICAgICA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXEgICAgICAgPSBkdi5nZXRJbnQxNiBAIDQrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxX2ZsYWdzID0gZHYuZ2V0SW50MTYgQCA2K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfc3RyZWFtaW5nXG5cblxuZnVuY3Rpb24gYmluZF9zZXFfbmV4dChvZmZzZXQpIDo6XG4gIGNvbnN0IHNlcV9vZmZzZXQgPSB0aGlzLnNlcV9wb3MgKyBvZmZzZXRcbiAgbGV0IHNlcSA9IDFcbiAgcmV0dXJuIGZ1bmN0aW9uIHNlcV9uZXh0KHtmbGFncywgZmlufSwgZHYpIDo6XG4gICAgaWYgISBmaW4gOjpcbiAgICAgIGR2LnNldEludDE2IEAgc2VxX29mZnNldCwgc2VxKyssIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgZWxzZSA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCAtc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDIrc2VxX29mZnNldCwgMHxmbGFncywgbGl0dGxlX2VuZGlhblxuICAgICAgc2VxID0gTmFOXG5cblxuXG5leHBvcnQgZGVmYXVsdCBjb21wb3NlRnJhbWluZ3MoKVxuZnVuY3Rpb24gY29tcG9zZUZyYW1pbmdzKCkgOjpcbiAgY29uc3QgZnJtX2Zyb20gPSBmcm1fcm91dGluZygpLCBmcm1fcmVzcCA9IGZybV9yZXNwb25zZSgpXG4gIGNvbnN0IGZybV90cmFuc3BvcnRzID0gQFtdIGZybV9kYXRhZ3JhbSgpLCBmcm1fZGlyZWN0KCksIGZybV9tdWx0aXBhcnQoKSwgZnJtX3N0cmVhbWluZygpXG5cbiAgaWYgOCAhPT0gZnJtX2Zyb20uc2l6ZSB8fCA4ICE9PSBmcm1fcmVzcC5zaXplIHx8IDQgIT0gZnJtX3RyYW5zcG9ydHMubGVuZ3RoIDo6XG4gICAgdGhyb3cgbmV3IEVycm9yIEAgYEZyYW1pbmcgU2l6ZSBjaGFuZ2VgXG5cbiAgY29uc3QgYnlCaXRzID0gW10sIG1hc2s9MHhmXG5cbiAgOjpcbiAgICBjb25zdCB0X2Zyb20gPSBmcm1fZnJvbS5mX3Rlc3QsIHRfcmVzcCA9IGZybV9yZXNwLmZfdGVzdFxuICAgIGNvbnN0IFt0MCx0MSx0Mix0M10gPSBmcm1fdHJhbnNwb3J0cy5tYXAgQCBmPT5mLmZfdGVzdFxuXG4gICAgY29uc3QgdGVzdEJpdHMgPSBieUJpdHMudGVzdEJpdHMgPSBvYmogPT5cbiAgICAgIDAgfCB0X2Zyb20ob2JqKSB8IHRfcmVzcChvYmopIHwgdDAob2JqKSB8IHQxKG9iaikgfCB0MihvYmopIHwgdDMob2JqKVxuXG4gICAgYnlCaXRzLmNob29zZSA9IGZ1bmN0aW9uIChvYmosIGxzdCkgOjpcbiAgICAgIGlmIG51bGwgPT0gbHN0IDo6IGxzdCA9IHRoaXMgfHwgYnlCaXRzXG4gICAgICByZXR1cm4gbHN0W3Rlc3RCaXRzKG9iaildXG5cblxuICBmb3IgY29uc3QgVCBvZiBmcm1fdHJhbnNwb3J0cyA6OlxuICAgIGNvbnN0IHtiaXRzOmIsIHNpemUsIHRyYW5zcG9ydH0gPSBUXG5cbiAgICBieUJpdHNbYnwwXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MCwgbWFzaywgc2l6ZTogc2l6ZSwgb3A6ICcnXG4gICAgYnlCaXRzW2J8MV0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDEsIG1hc2ssIHNpemU6IDggKyBzaXplLCBvcDogJ2YnXG4gICAgYnlCaXRzW2J8Ml0gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDIsIG1hc2ssIHNpemU6IDggKyBzaXplLCBvcDogJ3InXG4gICAgYnlCaXRzW2J8M10gPSBAe30gVCwgdHJhbnNwb3J0LCBiaXRzOiBifDMsIG1hc2ssIHNpemU6IDE2ICsgc2l6ZSwgb3A6ICdmcidcblxuICAgIGZvciBjb25zdCBmbl9rZXkgb2YgWydmX3BhY2snLCAnZl91bnBhY2snXSA6OlxuICAgICAgY29uc3QgZm5fdHJhbiA9IFRbZm5fa2V5XSwgZm5fZnJvbSA9IGZybV9mcm9tW2ZuX2tleV0sIGZuX3Jlc3AgPSBmcm1fcmVzcFtmbl9rZXldXG5cbiAgICAgIGJ5Qml0c1tifDBdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl90cmFuKG9iaiwgZHYsIDApXG4gICAgICBieUJpdHNbYnwxXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fZnJvbShvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8Ml1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3Jlc3Aob2JqLCBkdiwgMCk7IGZuX3RyYW4ob2JqLCBkdiwgOClcbiAgICAgIGJ5Qml0c1tifDNdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl9yZXNwKG9iaiwgZHYsIDgpOyBmbl90cmFuKG9iaiwgZHYsIDE2KVxuXG4gIGZvciBjb25zdCBmcm0gb2YgYnlCaXRzIDo6XG4gICAgYmluZEFzc2VtYmxlZCBAIGZybVxuXG4gIHJldHVybiBieUJpdHNcblxuXG5mdW5jdGlvbiBiaW5kQXNzZW1ibGVkKGZybSkgOjpcbiAgY29uc3Qge1QsIHNpemUsIGZfcGFjaywgZl91bnBhY2t9ID0gZnJtXG4gIGlmIFQuYmluZF9zZXFfbmV4dCA6OlxuICAgIGZybS5zZXFfbmV4dCA9IFQuYmluZF9zZXFfbmV4dCBAIGZybS5zaXplIC0gVC5zaXplXG5cbiAgZGVsZXRlIGZybS5UXG4gIGZybS5wYWNrID0gcGFjayA7IGZybS51bnBhY2sgPSB1bnBhY2tcbiAgY29uc3Qgc2VxX25leHQgPSBmcm0uc2VxX25leHRcblxuICBmdW5jdGlvbiBwYWNrKHBrdF90eXBlLCBwa3Rfb2JqKSA6OlxuICAgIGlmICEgQCAwIDw9IHBrdF90eXBlICYmIHBrdF90eXBlIDw9IDI1NSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwa3RfdHlwZSB0byBiZSBbMC4uMjU1XWBcblxuICAgIHBrdF9vYmoudHlwZSA9IHBrdF90eXBlXG4gICAgaWYgc2VxX25leHQgJiYgbnVsbCA9PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgcGt0X29iai5zZXEgPSB0cnVlXG5cbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyBAIG5ldyBBcnJheUJ1ZmZlcihzaXplKVxuICAgIGZfcGFjayhwa3Rfb2JqLCBkdiwgMClcbiAgICBwa3Rfb2JqLmhlYWRlciA9IGR2LmJ1ZmZlclxuXG4gICAgaWYgdHJ1ZSA9PT0gcGt0X29iai5zZXEgOjpcbiAgICAgIF9iaW5kX2l0ZXJhYmxlIEAgcGt0X29iaiwgZHYuYnVmZmVyLnNsaWNlKDAsc2l6ZSlcblxuICBmdW5jdGlvbiB1bnBhY2socGt0KSA6OlxuICAgIGNvbnN0IGJ1ZiA9IHBrdC5oZWFkZXJfYnVmZmVyKClcbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyBAIG5ldyBVaW50OEFycmF5KGJ1ZikuYnVmZmVyXG5cbiAgICBjb25zdCBpbmZvID0ge31cbiAgICBmX3VucGFjayhpbmZvLCBkdiwgMClcbiAgICByZXR1cm4gcGt0LmluZm8gPSBpbmZvXG5cbiAgZnVuY3Rpb24gX2JpbmRfaXRlcmFibGUocGt0X29iaiwgYnVmX2Nsb25lKSA6OlxuICAgIGNvbnN0IHt0eXBlfSA9IHBrdF9vYmpcbiAgICBjb25zdCB7aWRfcm91dGVyLCBpZF90YXJnZXQsIHR0bCwgdG9rZW59ID0gcGt0X29ialxuICAgIHBrdF9vYmoubmV4dCA9IG5leHRcblxuICAgIGZ1bmN0aW9uIG5leHQob3B0aW9ucykgOjpcbiAgICAgIGlmIG51bGwgPT0gb3B0aW9ucyA6OiBvcHRpb25zID0ge31cbiAgICAgIGNvbnN0IGhlYWRlciA9IGJ1Zl9jbG9uZS5zbGljZSgpXG4gICAgICBzZXFfbmV4dCBAIG9wdGlvbnMsIG5ldyBEYXRhVmlldyBAIGhlYWRlclxuICAgICAgcmV0dXJuIEB7fSBkb25lOiAhISBvcHRpb25zLmZpbiwgdmFsdWU6IEB7fSAvLyBwa3Rfb2JqXG4gICAgICAgIGlkX3JvdXRlciwgaWRfdGFyZ2V0LCB0eXBlLCB0dGwsIHRva2VuLCBoZWFkZXJcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBhY2tldFBhcnNlciwgb3B0aW9ucywgZnJhZ21lbnRfc2l6ZSkgOjpcbiAgY29uc3Qge2NvbmNhdEJ1ZmZlcnMsIHBhY2tQYWNrZXRPYmosIHBhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gcGFja2V0UGFyc2VyXG4gIGZyYWdtZW50X3NpemUgPSBOdW1iZXIoZnJhZ21lbnRfc2l6ZSB8fCA4MDAwKVxuICBpZiAxMDI0ID4gZnJhZ21lbnRfc2l6ZSB8fCA2NTAwMCA8IGZyYWdtZW50X3NpemUgOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgSW52YWxpZCBmcmFnbWVudCBzaXplOiAke2ZyYWdtZW50X3NpemV9YFxuXG4gIGNvbnN0IHtyYW5kb21faWQsIGpzb25fcGFja30gPSBvcHRpb25zXG4gIHJldHVybiBAOiBwYWNrZXRQYXJzZXIsIHJhbmRvbV9pZCwganNvbl9wYWNrXG4gICAgY3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIHBhY2tldEZyYWdtZW50c1xuICAgIGJpbmRUcmFuc3BvcnRzXG5cblxuICBmdW5jdGlvbiBjcmVhdGVNdWx0aXBhcnQocGt0LCBzaW5rLCBtc2dpZCkgOjpcbiAgICBsZXQgcGFydHMgPSBbXSwgZmluID0gZmFsc2VcbiAgICByZXR1cm4gQHt9IGZlZWQsIGluZm86IHBrdC5pbmZvXG5cbiAgICBmdW5jdGlvbiBmZWVkKHBrdCkgOjpcbiAgICAgIGxldCBzZXEgPSBwa3QuaW5mby5zZXFcbiAgICAgIGlmIHNlcSA8IDAgOjogZmluID0gdHJ1ZTsgc2VxID0gLXNlcVxuICAgICAgcGFydHNbc2VxLTFdID0gcGt0LmJvZHlfYnVmZmVyKClcblxuICAgICAgaWYgISBmaW4gOjogcmV0dXJuXG4gICAgICBpZiBwYXJ0cy5pbmNsdWRlcyBAIHVuZGVmaW5lZCA6OiByZXR1cm5cblxuICAgICAgc2luay5kZWxldGVTdGF0ZUZvcihtc2dpZClcblxuICAgICAgY29uc3QgcmVzID0gY29uY2F0QnVmZmVycyhwYXJ0cylcbiAgICAgIHBhcnRzID0gbnVsbFxuICAgICAgcmV0dXJuIHJlc1xuXG4gIGZ1bmN0aW9uIGNyZWF0ZVN0cmVhbShwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBuZXh0PTAsIGZpbiA9IGZhbHNlLCByZWN2RGF0YSwgcnN0cmVhbVxuICAgIGNvbnN0IHN0YXRlID0gQHt9IGZlZWQ6IGZlZWRfaW5pdCwgaW5mbzogcGt0LmluZm9cbiAgICByZXR1cm4gc3RhdGVcblxuICAgIGZ1bmN0aW9uIGZlZWRfaW5pdChwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcblxuICAgICAgY29uc3QgaW5mbyA9IHBrdC5pbmZvXG4gICAgICBjb25zdCBtc2cgPSBzaW5rLmpzb25fdW5wYWNrIEAgcGt0LmJvZHlfdXRmOCgpXG4gICAgICByc3RyZWFtID0gc2luay5yZWN2U3RyZWFtKG1zZywgaW5mbylcbiAgICAgIGlmIG51bGwgPT0gcnN0cmVhbSA6OiByZXR1cm5cbiAgICAgIGNoZWNrX2ZucyBAIHJzdHJlYW0sICdvbl9lcnJvcicsICdvbl9kYXRhJywgJ29uX2VuZCcgXG4gICAgICByZWN2RGF0YSA9IHNpbmsucmVjdlN0cmVhbURhdGEuYmluZChzaW5rLCByc3RyZWFtLCBpbmZvKVxuXG4gICAgICB0cnkgOjpcbiAgICAgICAgZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfYm9keVxuICAgICAgaWYgcnN0cmVhbS5vbl9pbml0IDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2luaXQobXNnLCBwa3QpXG5cbiAgICBmdW5jdGlvbiBmZWVkX2JvZHkocGt0LCBhc19jb250ZW50KSA6OlxuICAgICAgcmVjdkRhdGEoKVxuICAgICAgbGV0IGRhdGFcbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICAgIGRhdGEgPSBhc19jb250ZW50KHBrdCwgc2luaylcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lcnJvciBAIGVyciwgcGt0XG5cbiAgICAgIGlmIGZpbiA6OlxuICAgICAgICBjb25zdCByZXMgPSByc3RyZWFtLm9uX2RhdGEgQCBkYXRhLCBwa3RcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZW5kIEAgcmVzLCBwa3RcbiAgICAgIGVsc2UgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuXG4gICAgZnVuY3Rpb24gZmVlZF9pZ25vcmUocGt0KSA6OlxuICAgICAgdHJ5IDo6IGZlZWRfc2VxKHBrdClcbiAgICAgIGNhdGNoIGVyciA6OlxuXG4gICAgZnVuY3Rpb24gZmVlZF9zZXEocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxID49IDAgOjpcbiAgICAgICAgaWYgbmV4dCsrID09PSBzZXEgOjpcbiAgICAgICAgICByZXR1cm4gLy8gaW4gb3JkZXJcbiAgICAgIGVsc2UgOjpcbiAgICAgICAgZmluID0gdHJ1ZVxuICAgICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuICAgICAgICBpZiBuZXh0ID09PSAtc2VxIDo6XG4gICAgICAgICAgbmV4dCA9ICdkb25lJ1xuICAgICAgICAgIHJldHVybiAvLyBpbi1vcmRlciwgbGFzdCBwYWNrZXRcblxuICAgICAgc3RhdGUuZmVlZCA9IGZlZWRfaWdub3JlXG4gICAgICBuZXh0ID0gJ2ludmFsaWQnXG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgUGFja2V0IG91dCBvZiBzZXF1ZW5jZWBcblxuICBmdW5jdGlvbiAqIHBhY2tldEZyYWdtZW50cyhidWYsIG5leHRfaGRyLCBmaW4pIDo6XG4gICAgaWYgbnVsbCA9PSBidWYgOjpcbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKHtmaW59KVxuICAgICAgeWllbGQgb2JqXG4gICAgICByZXR1cm5cblxuICAgIGxldCBpID0gMCwgbGFzdElubmVyID0gYnVmLmJ5dGVMZW5ndGggLSBmcmFnbWVudF9zaXplO1xuICAgIHdoaWxlIGkgPCBsYXN0SW5uZXIgOjpcbiAgICAgIGNvbnN0IGkwID0gaVxuICAgICAgaSArPSBmcmFnbWVudF9zaXplXG5cbiAgICAgIGNvbnN0IG9iaiA9IG5leHRfaGRyKClcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkwLCBpKVxuICAgICAgeWllbGQgb2JqXG5cbiAgICA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICBvYmouYm9keSA9IGJ1Zi5zbGljZShpKVxuICAgICAgeWllbGQgb2JqXG5cblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRJbXBscyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cykgOjpcbiAgICBjb25zdCBvdXRib3VuZCA9IFtdXG4gICAgb3V0Ym91bmQuY2hvb3NlID0gZnJhbWluZ3MuY2hvb3NlXG5cbiAgICBmb3IgY29uc3QgZnJhbWUgb2YgZnJhbWluZ3MgOjpcbiAgICAgIGNvbnN0IGltcGwgPSBmcmFtZSA/IHRyYW5zcG9ydHNbZnJhbWUudHJhbnNwb3J0XSA6IG51bGxcbiAgICAgIGlmICEgaW1wbCA6OiBjb250aW51ZVxuXG4gICAgICBjb25zdCB7Yml0cywgcGFjaywgdW5wYWNrfSA9IGZyYW1lXG4gICAgICBjb25zdCBwa3RfdHlwZSA9IGhpZ2hiaXRzIHwgYml0c1xuICAgICAgY29uc3Qge3RfcmVjdn0gPSBpbXBsXG5cbiAgICAgIGZ1bmN0aW9uIHBhY2tfaGRyKG9iaikgOjpcbiAgICAgICAgcGFjayhwa3RfdHlwZSwgb2JqKVxuICAgICAgICByZXR1cm4gb2JqXG5cbiAgICAgIGZ1bmN0aW9uIHJlY3ZfbXNnKHBrdCwgc2luaykgOjpcbiAgICAgICAgdW5wYWNrKHBrdClcbiAgICAgICAgcmV0dXJuIHRfcmVjdihwa3QsIHNpbmspXG5cbiAgICAgIHBhY2tfaGRyLnBrdF90eXBlID0gcmVjdl9tc2cucGt0X3R5cGUgPSBwa3RfdHlwZVxuICAgICAgb3V0Ym91bmRbYml0c10gPSBwYWNrX2hkclxuICAgICAgaW5ib3VuZFtwa3RfdHlwZV0gPSByZWN2X21zZ1xuXG4gICAgICBpZiAncHJvZHVjdGlvbicgIT09IHByb2Nlc3MuZW52Lk5PREVfRU5WIDo6XG4gICAgICAgIGNvbnN0IG9wID0gcGFja19oZHIub3AgPSByZWN2X21zZy5vcCA9IGZyYW1lLm9wXG4gICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSBAIHBhY2tfaGRyLCAnbmFtZScsIEB7fSB2YWx1ZTogYHBhY2tfaGRyIMKrJHtvcH3Cu2BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcmVjdl9tc2csICduYW1lJywgQHt9IHZhbHVlOiBgcmVjdl9tc2cgwqske29wfcK7YFxuXG4gICAgcmV0dXJuIG91dGJvdW5kXG5cblxuICBmdW5jdGlvbiBiaW5kVHJhbnNwb3J0cyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cykgOjpcbiAgICBjb25zdCBwYWNrQm9keSA9IHRyYW5zcG9ydHMucGFja0JvZHlcbiAgICBjb25zdCBvdXRib3VuZCA9IGJpbmRUcmFuc3BvcnRJbXBscyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cylcbiAgICByZXR1cm4gdHJhbnNwb3J0cy5zdHJlYW1pbmdcbiAgICAgID8gQHt9IHNlbmQsIHN0cmVhbTogYmluZF9zdHJlYW0gQCB0cmFuc3BvcnRzLnN0cmVhbWluZy5tb2RlXG4gICAgICA6IEB7fSBzZW5kXG5cbiAgICBmdW5jdGlvbiBzZW5kKGNoYW4sIG9iaiwgYm9keSkgOjpcbiAgICAgIGJvZHkgPSBwYWNrQm9keShib2R5KVxuICAgICAgaWYgZnJhZ21lbnRfc2l6ZSA8IGJvZHkuYnl0ZUxlbmd0aCA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBvYmoudHJhbnNwb3J0ID0gJ211bHRpcGFydCdcbiAgICAgICAgY29uc3QgbXNlbmQgPSBtc2VuZF9ieXRlcyhjaGFuLCBvYmopXG4gICAgICAgIHJldHVybiBAe30gc2VudDogbXNlbmQgQCB0cnVlLCBib2R5XG5cbiAgICAgIG9iai50cmFuc3BvcnQgPSAnc2luZ2xlJ1xuICAgICAgb2JqLmJvZHkgPSBib2R5XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgcGFja19oZHIob2JqKVxuICAgICAgcmV0dXJuIEB7fSBzZW50OiBjaGFuIEAgcGt0XG5cbiAgICBmdW5jdGlvbiBtc2VuZF9ieXRlcyhjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGxldCB7bmV4dH0gPSBwYWNrX2hkcihvYmopXG4gICAgICBpZiBudWxsICE9PSBtc2cgOjpcbiAgICAgICAgb2JqLmJvZHkgPSBtc2dcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBjaGFuIEAgcGt0XG5cbiAgICAgIHJldHVybiBhc3luYyBmdW5jdGlvbiAoZmluLCBib2R5KSA6OlxuICAgICAgICBpZiBudWxsID09PSBuZXh0IDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgJ1dyaXRlIGFmdGVyIGVuZCdcbiAgICAgICAgbGV0IHJlc1xuICAgICAgICBmb3IgY29uc3Qgb2JqIG9mIHBhY2tldEZyYWdtZW50cyBAIGJvZHksIG5leHQsIGZpbiA6OlxuICAgICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgICByZXMgPSBhd2FpdCBjaGFuIEAgcGt0XG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gcmVzXG5cbiAgICBmdW5jdGlvbiBtc2VuZF9vYmplY3RzKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBjb25zdCBvYmogPSBuZXh0KHtmaW59KVxuICAgICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIGJpbmRfc3RyZWFtKG1vZGUpIDo6XG4gICAgICBjb25zdCBtc2VuZF9pbXBsID0ge29iamVjdDogbXNlbmRfb2JqZWN0cywgYnl0ZXM6IG1zZW5kX2J5dGVzfVttb2RlXVxuICAgICAgaWYgbXNlbmRfaW1wbCA6OiByZXR1cm4gc3RyZWFtXG5cbiAgICAgIGZ1bmN0aW9uIHN0cmVhbShjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgICAgaWYgISBvYmoudG9rZW4gOjogb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzdHJlYW1pbmcnXG4gICAgICAgIGNvbnN0IG1zZW5kID0gbXNlbmRfaW1wbCBAIGNoYW4sIG9iaiwganNvbl9wYWNrKG1zZylcbiAgICAgICAgd3JpdGUud3JpdGUgPSB3cml0ZTsgd3JpdGUuZW5kID0gd3JpdGUuYmluZCh0cnVlKVxuICAgICAgICByZXR1cm4gd3JpdGVcblxuICAgICAgICBmdW5jdGlvbiB3cml0ZShjaHVuaykgOjpcbiAgICAgICAgICByZXR1cm4gY2h1bmsgIT0gbnVsbFxuICAgICAgICAgICAgPyBtc2VuZCBAIHRydWU9PT10aGlzLCBwYWNrQm9keShjaHVuaylcbiAgICAgICAgICAgIDogbXNlbmQgQCB0cnVlXG5cblxuZnVuY3Rpb24gY2hlY2tfZm5zKG9iaiwgLi4ua2V5cykgOjpcbiAgZm9yIGNvbnN0IGtleSBvZiBrZXlzIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG9ialtrZXldIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIFwiJHtrZXl9XCIgdG8gYmUgYSBmdW5jdGlvbmBcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGpzb25fcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIGpzb25fcGFja30gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIHJldHVybiBAe31cbiAgICBwYWNrQm9keVxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KCkgfHwgdW5kZWZpbmVkXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgYm9keV9idWYgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBib2R5X2J1ZiA6OlxuICAgICAgICAgIGNvbnN0IG1zZyA9IHNpbmsuanNvbl91bnBhY2sgQCB1bnBhY2tfdXRmOChib2R5X2J1ZikgfHwgdW5kZWZpbmVkXG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdvYmplY3QnXG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZVN0cmVhbVxuICAgICAgICByZXR1cm4gc3RhdGUuZmVlZChwa3QsIHVucGFja0JvZHkpXG5cbiAgZnVuY3Rpb24gcGFja0JvZHkoYm9keSkgOjpcbiAgICByZXR1cm4gcGFja191dGY4IEAganNvbl9wYWNrKGJvZHkpXG5cbiAgZnVuY3Rpb24gdW5wYWNrQm9keShwa3QsIHNpbmspIDo6XG4gICAgcmV0dXJuIHNpbmsuanNvbl91bnBhY2sgQCBwa3QuYm9keV91dGY4KClcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGJpbmFyeV9wcm90b2NvbChzaGFyZWQpIDo6XG4gIGNvbnN0IHtjcmVhdGVNdWx0aXBhcnQsIGNyZWF0ZVN0cmVhbX0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tfdXRmOCwgdW5wYWNrX3V0Zjh9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICBjb25zdCB7YXNCdWZmZXJ9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuICByZXR1cm4gQHt9XG4gICAgcGFja0JvZHk6IGFzQnVmZmVyXG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0gcGt0LmJvZHlfYnVmZmVyKClcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBtc2cgPSBzdGF0ZS5mZWVkKHBrdClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2cgOjpcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ2J5dGVzJ1xuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVTdHJlYW1cbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QsIHBrdF9idWZmZXIpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG5mdW5jdGlvbiBwa3RfYnVmZmVyKHBrdCkgOjogcmV0dXJuIHBrdC5ib2R5X2J1ZmZlcigpXG5cbiIsImltcG9ydCBmcmFtaW5ncyBmcm9tICcuL2ZyYW1pbmcuanN5J1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBjb250cm9sX3Byb3RvY29sKGluYm91bmQsIGhpZ2gsIHNoYXJlZCkgOjpcbiAgY29uc3Qge3JhbmRvbV9pZH0gPSBzaGFyZWRcbiAgY29uc3Qge3BhY2tQYWNrZXRPYmp9ID0gc2hhcmVkLnBhY2tldFBhcnNlclxuXG4gIGNvbnN0IHBpbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgdG9rZW46IHRydWUsIHRyYW5zcG9ydDogJ2RpcmVjdCdcbiAgY29uc3QgcG9uZ19mcmFtZSA9IGZyYW1pbmdzLmNob29zZSBAOiBmcm9tX2lkOiB0cnVlLCBtc2dpZDogdHJ1ZSwgdHJhbnNwb3J0OiAnZGF0YWdyYW0nXG5cbiAgY29uc3QgcG9uZ190eXBlID0gaGlnaHwweGVcbiAgaW5ib3VuZFtwb25nX3R5cGVdID0gcmVjdl9wb25nXG4gIGNvbnN0IHBpbmdfdHlwZSA9IGhpZ2h8MHhmXG4gIGluYm91bmRbaGlnaHwweGZdID0gcmVjdl9waW5nXG5cbiAgcmV0dXJuIEB7fSBzZW5kOnBpbmcsIHBpbmdcblxuICBmdW5jdGlvbiBwaW5nKGNoYW4sIG9iaikgOjpcbiAgICBpZiAhIG9iai50b2tlbiA6OlxuICAgICAgb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICBvYmouYm9keSA9IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICBvcDogJ3BpbmcnLCB0czA6IG5ldyBEYXRlKClcbiAgICBwaW5nX2ZyYW1lLnBhY2socGluZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiBjaGFuIEAgcGt0XG5cbiAgZnVuY3Rpb24gcmVjdl9waW5nKHBrdCwgc2luaywgcm91dGVyKSA6OlxuICAgIHBpbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIF9zZW5kX3BvbmcgQCBwa3QuYm9keSwgcGt0LCBzaW5rLCByb3V0ZXJcbiAgICByZXR1cm4gc2luay5yZWN2Q3RybChwa3QuYm9keSwgcGt0LmluZm8pXG5cbiAgZnVuY3Rpb24gX3NlbmRfcG9uZyh7dHMwfSwgcGt0X3BpbmcsIHNpbmssIHJvdXRlcikgOjpcbiAgICBjb25zdCB7bXNnaWQsIGZyb21faWQ6cl9pZH0gPSBwa3RfcGluZy5pbmZvXG4gICAgY29uc3Qge2lkX3JvdXRlciwgaWRfdGFyZ2V0fSA9IHJfaWRcbiAgICBjb25zdCBvYmogPSBAe30gaWRfcm91dGVyLCBpZF90YXJnZXRcbiAgICAgIGZyb21faWQ6IHNpbmsuZnJvbV9pZCwgbXNnaWRcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5IEA6XG4gICAgICAgIG9wOiAncG9uZycsIHRzMCwgdHMxOiBuZXcgRGF0ZSgpXG5cbiAgICBwb25nX2ZyYW1lLnBhY2socG9uZ190eXBlLCBvYmopXG4gICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgIHJldHVybiByb3V0ZXIuZGlzcGF0Y2ggQCBbcGt0XVxuXG4gIGZ1bmN0aW9uIHJlY3ZfcG9uZyhwa3QsIHNpbmspIDo6XG4gICAgcG9uZ19mcmFtZS51bnBhY2socGt0KVxuICAgIHBrdC5ib2R5ID0gcGt0LmJvZHlfanNvbigpXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcbmltcG9ydCBzaGFyZWRfcHJvdG8gZnJvbSAnLi9zaGFyZWQuanN5J1xuaW1wb3J0IGpzb25fcHJvdG8gZnJvbSAnLi9qc29uLmpzeSdcbmltcG9ydCBiaW5hcnlfcHJvdG8gZnJvbSAnLi9iaW5hcnkuanN5J1xuaW1wb3J0IGNvbnRyb2xfcHJvdG8gZnJvbSAnLi9jb250cm9sLmpzeSdcblxuZXhwb3J0ICogZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gaW5pdF9wcm90b2NvbChwYWNrZXRQYXJzZXIsIG9wdGlvbnMpIDo6XG4gIGNvbnN0IHNoYXJlZCA9IHNoYXJlZF9wcm90byBAIHBhY2tldFBhcnNlciwgb3B0aW9uc1xuXG4gIGNvbnN0IGluYm91bmQgPSBbXVxuICBjb25zdCBqc29uID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MDAgLy8gMHgwKiDigJQgSlNPTiBib2R5XG4gICAganNvbl9wcm90byhzaGFyZWQpXG5cbiAgY29uc3QgYmluYXJ5ID0gc2hhcmVkLmJpbmRUcmFuc3BvcnRzIEAgaW5ib3VuZFxuICAgIDB4MTAgLy8gMHgxKiDigJQgYmluYXJ5IGJvZHlcbiAgICBiaW5hcnlfcHJvdG8oc2hhcmVkKVxuXG4gIGNvbnN0IGNvbnRyb2wgPSBjb250cm9sX3Byb3RvIEAgaW5ib3VuZCxcbiAgICAweGYwIC8vIDB4Ziog4oCUIGNvbnRyb2xcbiAgICBzaGFyZWRcblxuICBjb25zdCBjb2RlY3MgPSBAOiBqc29uLCBiaW5hcnksIGNvbnRyb2wsIGRlZmF1bHQ6IGpzb25cblxuICBjb25zdCB7cmFuZG9tX2lkfSA9IHNoYXJlZFxuICByZXR1cm4gQDogaW5ib3VuZCwgY29kZWNzLCByYW5kb21faWRcblxuXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBFbmRwb2ludCA6OlxuICBzdGF0aWMgZm9yUHJvdG9jb2xzKHt9KSA6OlxuICAgIGNsYXNzIEVuZHBvaW50IGV4dGVuZHMgdGhpcyA6OlxuICAgIHJldHVybiBFbmRwb2ludFxuXG4gIHZhbHVlT2YoKSA6OiByZXR1cm4gdGhpcy5mcm9tX2lkXG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRW5kcG9pbnQgJHt0aGlzLmZyb21faWQuaWRfdGFyZ2V0fcK7YFxuXG4gIGNvbnN0cnVjdG9yKG1zZ19jdHgpIDo6XG4gICAgbXNnX2N0eCA9IG1zZ19jdHgud2l0aEVuZHBvaW50KHRoaXMpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAOlxuICAgICAgZnJvbV9pZDogQHt9IHZhbHVlOiBtc2dfY3R4LmZyb21faWQsIGVudW1lcmFibGU6IHRydWVcbiAgICAgIHRvOiBAe30gdmFsdWU6IG1zZ19jdHgudG9cblxuICBjcmVhdGVNYXAoKSA6OiByZXR1cm4gbmV3IE1hcCgpXG4gIGNyZWF0ZVN0YXRlTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlUmVwbHlNYXAoKSA6OiByZXR1cm4gdGhpcy5jcmVhdGVNYXAoKVxuICBjcmVhdGVUcmFmZmljTWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcblxuICBiaW5kU2luayhzaW5rKSA6OlxuICAgIGNvbnN0IGJ5X3Rva2VuID0gdGhpcy5jcmVhdGVSZXBseU1hcCgpXG4gICAgY29uc3QgYnlfdHJhZmZpYyA9IHRoaXMuY3JlYXRlVHJhZmZpY01hcCgpXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAOlxuICAgICAgYnlfdG9rZW46IEB7fSB2YWx1ZTogYnlfdG9rZW5cbiAgICAgIGJ5X3RyYWZmaWM6IEB7fSB2YWx1ZTogYnlfdHJhZmZpY1xuXG4gICAgY29uc3QgdHJhZmZpYyA9IChmcm9tX2lkLCB0cmFmZmljKSA9PiA6OlxuICAgICAgY29uc3QgdHMgPSBEYXRlLm5vdygpXG4gICAgICBpZiBmcm9tX2lkIDo6XG4gICAgICAgIGNvbnN0IHQgPSBieV90cmFmZmljLmdldChmcm9tX2lkLmlkX3RhcmdldClcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSB0IDo6XG4gICAgICAgICAgdC50cyA9IHRbYHRzXyR7dHJhZmZpY31gXSA9IHRzXG4gICAgICB0aGlzLnJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKVxuXG4gICAgcmV0dXJuIEB7fVxuICAgICAgZnJvbV9pZDogdGhpcy5mcm9tX2lkXG4gICAgICBieV9tc2dpZDogdGhpcy5jcmVhdGVTdGF0ZU1hcCgpXG5cbiAgICAgIHJlY3ZDdHJsOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ2N0cmwnKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2Q3RybChtc2csIGluZm8pXG5cbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZSh7cm1zZywgbXNnLCBpbmZvfSkudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2TXNnOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ21zZycpXG4gICAgICAgIGNvbnN0IHJtc2cgPSB0aGlzLnJlY3ZNc2cobXNnLCBpbmZvKVxuXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocm1zZykudGhlbihyZXBseSlcbiAgICAgICAgZWxzZSByZXR1cm4gcm1zZ1xuXG4gICAgICByZWN2U3RyZWFtRGF0YTogKHJzdHJlYW0sIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgIHJlY3ZTdHJlYW06IChtc2csIGluZm8pID0+IDo6XG4gICAgICAgIHRyYWZmaWMoaW5mby5mcm9tX2lkLCAnc3RyZWFtJylcbiAgICAgICAgY29uc3QgcnN0cmVhbSA9IHRoaXMucmVjdlN0cmVhbShtc2csIGluZm8pXG5cbiAgICAgICAgY29uc3QgcmVwbHkgPSBieV90b2tlbi5nZXQoaW5mby50b2tlbilcbiAgICAgICAgaWYgdW5kZWZpbmVkICE9PSByZXBseSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZShyc3RyZWFtKS50aGVuKHJlcGx5KVxuICAgICAgICByZXR1cm4gcnN0cmVhbVxuXG4gIHJlY3ZUcmFmZmljKGZyb21faWQsIHRyYWZmaWMsIHRzKSA6OlxuICByZWN2Q3RybChtc2csIGluZm8pIDo6XG4gIHJlY3ZNc2cobXNnLCBpbmZvKSA6OlxuICAgIHJldHVybiBAe30gbXNnLCBpbmZvXG4gIHJlY3ZTdHJlYW0obXNnLCBpbmZvKSA6OlxuICAgIGNvbnNvbGUud2FybiBAIGBVbmhhbmRsZSByZWN2IHN0cmVhbTogJHtpbmZvfWBcbiAgICByZXR1cm4gbnVsbFxuICAgIC8qIHJldHVybiBAe30gbXNnLCBpbmZvXG4gICAgICAgICBvbl9pbml0KG1zZywgcGt0KSA6OiByZXR1cm4gdGhpc1xuICAgICAgICAgb25fZGF0YShkYXRhLCBwa3QpIDo6IHRoaXMucGFydHMucHVzaCBAIGRhdGFcbiAgICAgICAgIG9uX2VuZChyZXN1bHQsIHBrdCkgOjogcmV0dXJuIHRoaXMucGFydHMuam9pbignJylcbiAgICAgICAgIG9uX2Vycm9yKGVyciwgcGt0KSA6OiBjb25zb2xlLmxvZyBAIGVyclxuICAgICovXG5cbiAgaW5pdFJlcGx5KHRva2VuLCBtc2dfY3R4LCBraW5kKSA6OlxuICAgIHJldHVybiB0aGlzLmluaXRSZXBseVByb21pc2UgQCB0b2tlbiwgbXNnX2N0eC5tc190aW1lb3V0XG5cbiAgaW5pdE1vbml0b3IoaWRfdGFyZ2V0KSA6OlxuICAgIGNvbnN0IGtleSA9IGlkX3RhcmdldC5pZF90YXJnZXQgfHwgaWRfdGFyZ2V0XG4gICAgbGV0IG1vbml0b3IgPSB0aGlzLmJ5X3RyYWZmaWMuZ2V0IEAga2V5XG4gICAgaWYgdW5kZWZpbmVkID09PSBtb25pdG9yIDo6XG4gICAgICBtb25pdG9yID0gQHt9IGlkX3RhcmdldCwgdHM6IERhdGUubm93KClcbiAgICAgICAgdGQoKSA6OiByZXR1cm4gRGF0ZS5ub3coKSAtIHRoaXMudHNcbiAgICAgIHRoaXMuYnlfdHJhZmZpYy5zZXQgQCBrZXksIG1vbml0b3JcbiAgICByZXR1cm4gbW9uaXRvclxuXG4gIGluaXRSZXBseVByb21pc2UodG9rZW4sIG1zX3RpbWVvdXQpIDo6XG4gICAgY29uc3QgYW5zID0gbmV3IFByb21pc2UgQCAocmVzb2x2ZSwgcmVqZWN0KSA9PiA6OlxuICAgICAgdGhpcy5ieV90b2tlbi5zZXQgQCB0b2tlbiwgcmVzb2x2ZVxuICAgICAgaWYgbXNfdGltZW91dCA6OlxuICAgICAgICBjb25zdCB0aWQgPSBzZXRUaW1lb3V0KHRpbWVvdXQsIG1zX3RpbWVvdXQpXG4gICAgICAgIGlmIHRpZC51bnJlZiA6OiB0aWQudW5yZWYoKVxuICAgICAgICBmdW5jdGlvbiB0aW1lb3V0KCkgOjogcmVqZWN0IEAgbmV3IHRoaXMuUmVwbHlUaW1lb3V0XG5cbiAgICByZXR1cm4gc2VudCA9PiA6OlxuICAgICAgYW5zLnNlbnQgPSBzZW50XG4gICAgICByZXR1cm4gYW5zXG5cbmNsYXNzIFJlcGx5VGltZW91dCBleHRlbmRzIEVycm9yIDo6XG5cbk9iamVjdC5hc3NpZ24gQCBFbmRwb2ludC5wcm90b3R5cGUsIEB7fVxuICBSZXBseVRpbWVvdXRcbiIsImV4cG9ydCBkZWZhdWx0IGNsYXNzIFNpbmsgOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7aW5ib3VuZH0pIDo6XG4gICAgY2xhc3MgU2luayBleHRlbmRzIHRoaXMgOjpcbiAgICBTaW5rLnByb3RvdHlwZS5fcHJvdG9jb2wgPSBpbmJvdW5kXG4gICAgcmV0dXJuIFNpbmtcblxuICBjb25zdHJ1Y3Rvcihqc29uX3VucGFjaykgOjpcbiAgICB0aGlzLmpzb25fdW5wYWNrID0ganNvbl91bnBhY2tcblxuICByZWdpc3RlcihlbmRwb2ludCwgaHViLCBpZF90YXJnZXQsIGhhbmRsZXJzKSA6OlxuICAgIGNvbnN0IHVucmVnaXN0ZXIgPSAoKSA9PiBodWIucm91dGVyLnVucmVnaXN0ZXJUYXJnZXQoaWRfdGFyZ2V0KVxuXG4gICAgaHViLnJvdXRlci5yZWdpc3RlclRhcmdldCBAIGlkX3RhcmdldCxcbiAgICAgIHRoaXMuX2JpbmREaXNwYXRjaCBAIGVuZHBvaW50LCB1bnJlZ2lzdGVyLCBoYW5kbGVyc1xuICAgIHJldHVybiB0aGlzXG5cbiAgX2JpbmREaXNwYXRjaChlbmRwb2ludCwgdW5yZWdpc3Rlciwge29uX21zZywgb25fZXJyb3IsIG9uX3NodXRkb3dufSkgOjpcbiAgICBsZXQgYWxpdmUgPSB0cnVlXG4gICAgY29uc3QgcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbFxuICAgIGNvbnN0IGlzQWxpdmUgPSAoKSA9PiBhbGl2ZVxuICAgIGNvbnN0IHNodXRkb3duID0gKGVyciwgZXh0cmEpID0+IDo6XG4gICAgICBpZiBhbGl2ZSA6OlxuICAgICAgICB1bnJlZ2lzdGVyKCk7IHVucmVnaXN0ZXIgPSBhbGl2ZSA9IGZhbHNlXG4gICAgICAgIG9uX3NodXRkb3duKGVyciwgZXh0cmEpXG5cbiAgICBPYmplY3QuYXNzaWduIEAgdGhpcywgZW5kcG9pbnQuYmluZFNpbmsodGhpcyksIEB7fSBpc0FsaXZlLCBzaHV0ZG93blxuICAgIE9iamVjdC5hc3NpZ24gQCBlbmRwb2ludCwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG5cbiAgICByZXR1cm4gYXN5bmMgKHBrdCwgcm91dGVyKSA9PiA6OlxuICAgICAgaWYgZmFsc2U9PT1hbGl2ZSB8fCBudWxsPT1wa3QgOjogcmV0dXJuIGFsaXZlXG5cbiAgICAgIGNvbnN0IHJlY3ZfbXNnID0gcHJvdG9jb2xbcGt0LnR5cGVdXG4gICAgICBpZiB1bmRlZmluZWQgPT09IHJlY3ZfbXNnIDo6XG4gICAgICAgIHJldHVybiB2b2lkIG9uX2Vycm9yIEAgZmFsc2UsIEB7fSBwa3QsIHpvbmU6ICdwa3QudHlwZSdcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIHZhciBtc2cgPSBhd2FpdCByZWN2X21zZyBAIHBrdCwgdGhpcywgcm91dGVyXG4gICAgICAgIGlmICEgbXNnIDo6IHJldHVybiBtc2dcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gdm9pZCBvbl9lcnJvciBAIGVyciwgQHt9IHBrdCwgem9uZTogJ3Byb3RvY29sJ1xuXG4gICAgICBpZiBmYWxzZSA9PT0gYWxpdmUgOjpcbiAgICAgICAgcmV0dXJuIGZhbHNlIC8vIGNoYW5nZSB3aGlsZSBhd2FpdGluZyBhYm92ZeKAplxuICAgICAgdHJ5IDo6XG4gICAgICAgIHJldHVybiBhd2FpdCBvbl9tc2cgQCBtc2csIHBrdFxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHRyeSA6OlxuICAgICAgICAgIHZhciB0ZXJtaW5hdGUgPSBvbl9lcnJvciBAIGVyciwgQHt9IG1zZywgcGt0LCB6b25lOiAnZGlzcGF0Y2gnXG4gICAgICAgIGZpbmFsbHkgOjpcbiAgICAgICAgICBpZiBmYWxzZSAhPT0gdGVybWluYXRlIDo6XG4gICAgICAgICAgICBzaHV0ZG93bihlcnIsIHttc2csIHBrdH0pXG4gICAgICAgICAgICByZXR1cm4gZmFsc2UgLy8gc2lnbmFsIHVucmVnaXN0ZXIgdG8gbXNnLWZhYnJpYy1jb3JlL3JvdXRlclxuXG4gIHN0YXRlRm9yKHBrdCwgaWZBYnNlbnQpIDo6XG4gICAgY29uc3QgbXNnaWQgPSBwa3QuaW5mby5tc2dpZFxuICAgIGxldCBlbnRyeSA9IHRoaXMuYnlfbXNnaWQuZ2V0KG1zZ2lkKVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gZW50cnkgOjpcbiAgICAgIGlmICEgbXNnaWQgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYEludmFsaWQgbXNnaWQ6ICR7bXNnaWR9YFxuICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlmQWJzZW50IDo6XG4gICAgICAgIGVudHJ5ID0gaWZBYnNlbnQocGt0LCB0aGlzLCBtc2dpZClcbiAgICAgIGVsc2UgZW50cnkgPSBpZkFic2VudFxuICAgICAgdGhpcy5ieV9tc2dpZC5zZXQgQCBtc2dpZCwgZW50cnlcbiAgICByZXR1cm4gZW50cnlcblxuICBkZWxldGVTdGF0ZUZvcihtc2dpZCkgOjpcbiAgICByZXR1cm4gdGhpcy5ieV9tc2dpZC5kZWxldGUobXNnaWQpXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBNc2dDdHggOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7cmFuZG9tX2lkLCBjb2RlY3N9KSA6OlxuICAgIGNsYXNzIE1zZ0N0eCBleHRlbmRzIHRoaXMgOjpcbiAgICBNc2dDdHgucHJvdG90eXBlLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuICAgIE1zZ0N0eC53aXRoQ29kZWNzIEAgY29kZWNzXG4gICAgcmV0dXJuIE1zZ0N0eFxuXG4gIGNvbnN0cnVjdG9yKGZyb21faWQsIHJlc29sdmVSb3V0ZSkgOjpcbiAgICBpZiBudWxsICE9PSBmcm9tX2lkIDo6XG4gICAgICBjb25zdCB7aWRfdGFyZ2V0LCBpZF9yb3V0ZXJ9ID0gZnJvbV9pZFxuICAgICAgZnJvbV9pZCA9IE9iamVjdC5mcmVlemUgQDogaWRfdGFyZ2V0LCBpZF9yb3V0ZXJcblxuICAgIGNvbnN0IGN0eCA9IHtmcm9tX2lkfVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIF9yb290XzogQDogdmFsdWU6IHRoaXNcbiAgICAgIGZyb21faWQ6IEA6IHZhbHVlOiBmcm9tX2lkXG4gICAgICBjdHg6IEA6IHZhbHVlOiBjdHhcbiAgICAgIHJlc29sdmVSb3V0ZTogQDogdmFsdWU6IHJlc29sdmVSb3V0ZVxuXG4gIHdpdGhFbmRwb2ludChlbmRwb2ludCkgOjpcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGVuZHBvaW50OiBAe30gdmFsdWU6IGVuZHBvaW50XG5cbiAgc3RhdGljIGZyb20oaWRfdGFyZ2V0LCBodWIpIDo6XG4gICAgY29uc3QgZnJvbV9pZCA9IG51bGwgPT09IGlkX3RhcmdldCA/IG51bGxcbiAgICAgIDogQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICByZXR1cm4gbmV3IHRoaXMgQCBmcm9tX2lkLCBodWIuYmluZFJvdXRlRGlzcGF0Y2goKVxuXG4gIGdldCB0bygpIDo6IHJldHVybiAoLi4uYXJncykgPT4gdGhpcy5jbG9uZSgpLndpdGggQCAuLi5hcmdzXG5cbiAgcGluZyh0b2tlbj10cnVlKSA6OiByZXR1cm4gdGhpcy5jb2RlYygnY29udHJvbCcsIHt0b2tlbn0pLmludm9rZSBAICdwaW5nJ1xuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLmludm9rZSBAICdzZW5kJywgLi4uYXJnc1xuICBzdHJlYW0oLi4uYXJncykgOjogcmV0dXJuIHRoaXMuaW52b2tlIEAgJ3N0cmVhbScsIC4uLmFyZ3NcblxuICBpbnZva2Uoa2V5LCAuLi5hcmdzKSA6OlxuICAgIGNvbnN0IG9iaiA9IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHhcbiAgICB0aGlzLmFzc2VydE1vbml0b3IoKVxuICAgIGNvbnN0IGNoYW4gPSB0aGlzLnJlc29sdmVSb3V0ZShvYmouaWRfcm91dGVyKVxuICAgIGlmIHRydWUgIT09IG9iai50b2tlbiA6OlxuICAgICAgcmV0dXJuIHRoaXMuX2NvZGVjW2tleV0gQCBjaGFuLCBvYmosIC4uLmFyZ3NcblxuICAgIGVsc2UgOjpcbiAgICAgIGNvbnN0IHRva2VuID0gb2JqLnRva2VuID0gdGhpcy5yYW5kb21faWQoKVxuICAgICAgY29uc3QgcmVwbHkgPSB0aGlzLmVuZHBvaW50LmluaXRSZXBseSh0b2tlbiwgdGhpcywga2V5KVxuICAgICAgcmV0dXJuIHJlcGx5IEAgdGhpcy5fY29kZWNba2V5XSBAIGNoYW4sIG9iaiwgLi4uYXJnc1xuXG5cbiAgd2l0aCguLi5hcmdzKSA6OlxuICAgIGNvbnN0IGN0eCA9IHRoaXMuY3R4XG4gICAgZm9yIGxldCB0Z3Qgb2YgYXJncyA6OlxuICAgICAgaWYgJ251bWJlcicgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHRndFxuICAgICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgICAgIGNvbnRpbnVlXG5cbiAgICAgIGNvbnN0IHtmcm9tX2lkOiByZXBseV9pZCwgaWRfdGFyZ2V0LCBpZF9yb3V0ZXIsIHRva2VuLCBtc2dpZH0gPSB0Z3RcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBpZF90YXJnZXQgOjpcbiAgICAgICAgaWYgdW5kZWZpbmVkID09PSBpZF9yb3V0ZXIgOjpcbiAgICAgICAgICBpZiAhIGN0eC5pZF9yb3V0ZXIgOjpcbiAgICAgICAgICAgIC8vIGltcGxpY2l0bHkgb24gdGhlIHNhbWUgcm91dGVyXG4gICAgICAgICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgICAgIGVsc2UgY3R4LmlkX3JvdXRlciA9IGlkX3JvdXRlclxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gaWRfdGFyZ2V0XG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gaWRfcm91dGVyIDo6XG4gICAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYXNzaW5nICdpZF9yb3V0ZXInIHJlcXVpcmVzICdpZF90YXJnZXQnYFxuICAgICAgZWxzZSBpZiB1bmRlZmluZWQgIT09IHJlcGx5X2lkICYmICEgY3R4LmlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfcm91dGVyID0gcmVwbHlfaWQuaWRfcm91dGVyXG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSByZXBseV9pZC5pZF90YXJnZXRcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuXG4gICAgcmV0dXJuIHRoaXNcblxuICB3aXRoUmVwbHkoKSA6OlxuICAgIHJldHVybiB0aGlzLmNsb25lIEA6IHRva2VuOiB0cnVlXG5cbiAgcmVzZXQoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMuX3Jvb3RfLCBAe31cbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcbiAgY2xvbmUoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG5cbiAgYXNzZXJ0TW9uaXRvcigpIDo6XG4gICAgaWYgISB0aGlzLmNoZWNrTW9uaXRvcigpIDo6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgVGFyZ2V0IG1vbml0b3IgZXhwaXJlZGBcbiAgY2hlY2tNb25pdG9yKCkgOjogcmV0dXJuIHRydWVcbiAgbW9uaXRvcihvcHRpb25zPXt9KSA6OlxuICAgIGlmIHRydWUgPT09IG9wdGlvbnMgfHwgZmFsc2UgPT09IG9wdGlvbnMgOjpcbiAgICAgIG9wdGlvbnMgPSBAe30gYWN0aXZlOiBvcHRpb25zXG5cbiAgICBjb25zdCBtb25pdG9yID0gdGhpcy5lbmRwb2ludC5pbml0TW9uaXRvcih0aGlzLmN0eC5pZF90YXJnZXQpXG5cbiAgICBjb25zdCB0c19kdXJhdGlvbiA9IG9wdGlvbnMudHNfZHVyYXRpb24gfHwgNTAwMFxuICAgIGxldCB0c19hY3RpdmUgPSBvcHRpb25zLnRzX2FjdGl2ZVxuICAgIGlmIHRydWUgPT09IHRzX2FjdGl2ZSA6OlxuICAgICAgdHNfYWN0aXZlID0gdHNfZHVyYXRpb24vNFxuXG4gICAgbGV0IGNoZWNrTW9uaXRvclxuICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBjb25zdCBkb25lID0gb3B0aW9ucy5yZWplY3QgPyByZWplY3QgOiByZXNvbHZlXG4gICAgICB0aGlzLmNoZWNrTW9uaXRvciA9IGNoZWNrTW9uaXRvciA9ICgpID0+XG4gICAgICAgIHRzX2R1cmF0aW9uID4gbW9uaXRvci50ZCgpXG4gICAgICAgICAgPyB0cnVlIDogKGRvbmUobW9uaXRvciksIGZhbHNlKVxuXG4gICAgbGV0IHRpZFxuICAgIGNvbnN0IHRzX2ludGVydmFsID0gdHNfYWN0aXZlIHx8IHRzX2R1cmF0aW9uLzRcbiAgICBpZiBvcHRpb25zLmFjdGl2ZSB8fCB0c19hY3RpdmUgOjpcbiAgICAgIGNvbnN0IGN0cmwgPSB0aGlzLmNvZGVjKCdjb250cm9sJylcbiAgICAgIGNvbnN0IGNoZWNrUGluZyA9ICgpID0+IDo6XG4gICAgICAgIGlmIHRzX2ludGVydmFsID4gbW9uaXRvci50ZCgpIDo6XG4gICAgICAgICAgY3RybC5pbnZva2UoJ3BpbmcnKVxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja1BpbmcsIHRzX2ludGVydmFsXG4gICAgZWxzZSA6OlxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja01vbml0b3IsIHRzX2ludGVydmFsXG4gICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiBjbGVhckludGVydmFsKHRpZClcblxuICAgIHByb21pc2UudGhlbihjbGVhciwgY2xlYXIpXG4gICAgcmV0dXJuIHByb21pc2VcblxuXG4gIGNvZGVjKG1zZ19jb2RlYywgLi4uYXJncykgOjpcbiAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIG1zZ19jb2RlYyA6OlxuICAgICAgbXNnX2NvZGVjID0gdGhpcy5fbXNnQ29kZWNzW21zZ19jb2RlY11cblxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBtc2dfY29kZWMuc2VuZCA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwYWNrZXQgY29kZWMgcHJvdG9jb2xgXG5cbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEA6XG4gICAgICBfY29kZWM6IEA6IHZhbHVlOiBtc2dfY29kZWNcbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuICBzdGF0aWMgd2l0aENvZGVjcyhtc2dDb2RlY3MpIDo6XG4gICAgZm9yIGNvbnN0IFtuYW1lLCBtc2dfY29kZWNdIG9mIE9iamVjdC5lbnRyaWVzIEAgbXNnQ29kZWNzIDo6XG4gICAgICB0aGlzLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMuY29kZWMgQCBtc2dfY29kZWNcbiAgICB0aGlzLnByb3RvdHlwZS5fbXNnQ29kZWNzID0gbXNnQ29kZWNzXG4gICAgdGhpcy5wcm90b3R5cGUuX2NvZGVjID0gbXNnQ29kZWNzLmRlZmF1bHRcbiAgICByZXR1cm4gdGhpc1xuXG5PYmplY3QuYXNzaWduIEAgTXNnQ3R4LnByb3RvdHlwZSwgQHt9XG4gIG1zX3RpbWVvdXQ6IDUwMDBcblxuIiwiaW1wb3J0IGluaXRfcHJvdG9jb2wgZnJvbSAnLi9wcm90b2NvbC9pbmRleC5qc3knXG5pbXBvcnQgRW5kcG9pbnRCYXNlIGZyb20gJy4vZW5kcG9pbnQuanN5J1xuaW1wb3J0IFNpbmtCYXNlIGZyb20gJy4vc2luay5qc3knXG5pbXBvcnQgTXNnQ3R4QmFzZSBmcm9tICcuL21zZ2N0eC5qc3knXG5cbmNvbnN0IGRlZmF1bHRfcGx1Z2luX29wdGlvbnMgPSBAOlxuICBvbl9lcnJvcihlcnIsIHttc2csIHBrdH0pIDo6XG4gICAgY29uc29sZS5lcnJvciBAICdFTkRQT0lOVCBFUlJPUjonLCBlcnIsIEB7fSBtc2csIHBrdFxuICAgIC8vIHJldHVybiBmYWxzZSB0byBwcmV2ZW50IGF1dG8tc2h1dGRvd25cbiAgb25fc2h1dGRvd24oZXJyLCB7bXNnLCBwa3R9KSA6OlxuICAgIGNvbnNvbGUuZXJyb3IgQCAnRU5EUE9JTlQgU0hVVERPV046JyArIGVyclxuXG4gIHN1YmNsYXNzKHtTaW5rLCBFbmRwb2ludCwgTXNnQ3R4LCBwcm90b2NvbHN9KSA6OlxuXG4gIG1zZ191bnBhY2soZXApIDo6IHJldHVybiBKU09OLnBhcnNlXG4gIG1zZ19wYWNrKCkgOjogcmV0dXJuIEpTT04uc3RyaW5naWZ5XG5cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGx1Z2luX29wdGlvbnMpIDo6XG4gIHBsdWdpbl9vcHRpb25zID0gT2JqZWN0LmFzc2lnbiBAIHt9LCBkZWZhdWx0X3BsdWdpbl9vcHRpb25zLCBwbHVnaW5fb3B0aW9uc1xuICBjb25zdCBAe31cbiAgICByYW5kb21faWQsIG1zZ191bnBhY2ssIG1zZ19wYWNrXG4gICAgb25fZXJyb3I6IGRlZmF1bHRfb25fZXJyb3JcbiAgICBvbl9zaHV0ZG93bjogZGVmYXVsdF9vbl9zaHV0ZG93blxuICA9IHBsdWdpbl9vcHRpb25zXG5cbiAgcmV0dXJuIEA6IG9yZGVyOiAxLCBzdWJjbGFzcywgcG9zdFxuICBcbiAgZnVuY3Rpb24gc3ViY2xhc3MoRmFicmljSHViX1BJLCBiYXNlcykgOjpcbiAgICBjb25zdCB7cGFja2V0UGFyc2VyfSA9IEZhYnJpY0h1Yl9QSS5wcm90b3R5cGVcbiAgICBpZiBudWxsPT1wYWNrZXRQYXJzZXIgfHwgISBwYWNrZXRQYXJzZXIuaXNQYWNrZXRQYXJzZXIoKSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBJbnZhbGlkIHBhY2tldFBhcnNlciBmb3IgcGx1Z2luYFxuICAgIFxuICAgIEZhYnJpY0h1Yl9QSS5wcm90b3R5cGUuZW5kcG9pbnQgPVxuICAgICAgYmluZEVuZHBvaW50QXBpIEAgcGFja2V0UGFyc2VyXG5cbiAgZnVuY3Rpb24gcG9zdChodWIpIDo6XG4gICAgcmV0dXJuIGh1Yi5lbmRwb2ludCA9IGh1Yi5lbmRwb2ludChodWIpXG5cbiAgZnVuY3Rpb24gYmluZEVuZHBvaW50QXBpKHBhY2tldFBhcnNlcikgOjpcbiAgICBjb25zdCBwcm90b2NvbHMgPSBpbml0X3Byb3RvY29sIEAgcGFja2V0UGFyc2VyLCBAe30gcmFuZG9tX2lkLCBqc29uX3BhY2s6IG1zZ19wYWNrKClcbiAgICBjb25zdCBTaW5rID0gU2lua0Jhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICBjb25zdCBNc2dDdHggPSBNc2dDdHhCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgY29uc3QgRW5kcG9pbnQgPSBFbmRwb2ludEJhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcblxuICAgIHBsdWdpbl9vcHRpb25zLnN1YmNsYXNzIEA6XG4gICAgICBTaW5rLCBFbmRwb2ludCwgTXNnQ3R4LCBwcm90b2NvbHNcblxuICAgIHJldHVybiBmdW5jdGlvbihodWIpIDo6XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAOiBjcmVhdGUsIHNlcnZlcjogZW5kcG9pbnQsIGNsaWVudFxuXG4gICAgICBmdW5jdGlvbiBjbGllbnQoLi4uYXJncykgOjpcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IE1zZ0N0eC5mcm9tIEAgbnVsbCwgaHViXG4gICAgICAgIHJldHVybiAwICE9PSBhcmdzLmxlbmd0aFxuICAgICAgICAgID8gbXNnX2N0eC53aXRoKC4uLmFyZ3MpIDogbXNnX2N0eFxuXG4gICAgICBmdW5jdGlvbiBlbmRwb2ludChvbl9pbml0KSA6OlxuICAgICAgICByZXR1cm4gY3JlYXRlIEAgcmFuZG9tX2lkKCksIG9uX2luaXRcblxuICAgICAgZnVuY3Rpb24gY3JlYXRlKGlkX3RhcmdldCwgb25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IE1zZ0N0eC5mcm9tIEAgaWRfdGFyZ2V0LCBodWJcbiAgICAgICAgY29uc3QgZXAgPSBuZXcgRW5kcG9pbnQobXNnX2N0eClcblxuICAgICAgICBjb25zdCB0YXJnZXQgPSBvbl9pbml0KGVwLCBodWIpXG4gICAgICAgIGNvbnN0IG9uX21zZyA9ICh0YXJnZXQub25fbXNnIHx8IHRhcmdldCkuYmluZCh0YXJnZXQpXG4gICAgICAgIGNvbnN0IG9uX2Vycm9yID0gKHRhcmdldC5vbl9lcnJvciB8fCBkZWZhdWx0X29uX2Vycm9yKS5iaW5kKHRhcmdldClcbiAgICAgICAgY29uc3Qgb25fc2h1dGRvd24gPSAodGFyZ2V0Lm9uX3NodXRkb3duIHx8IGRlZmF1bHRfb25fc2h1dGRvd24pLmJpbmQodGFyZ2V0KVxuXG4gICAgICAgIGNvbnN0IHNpbmsgPSBuZXcgU2luayBAIGVwLmpzb25fdW5wYWNrIHx8IG1zZ191bnBhY2soZXApXG4gICAgICAgIHNpbmsucmVnaXN0ZXIgQCBlcCwgaHViLCBpZF90YXJnZXQsXG4gICAgICAgICAgQHt9IG9uX21zZywgb25fZXJyb3IsIG9uX3NodXRkb3duXG5cbiAgICAgICAgbGV0IHJlYWR5ID0gUHJvbWlzZS5yZXNvbHZlKHRhcmdldClcbiAgICAgICAgaWYgdGFyZ2V0Lm9uX3JlYWR5IDo6XG4gICAgICAgICAgcmVhZHkgPSByZWFkeS50aGVuIEAgdGFyZ2V0ID0+IHRhcmdldC5vbl9yZWFkeSgpXG5cbiAgICAgICAgY29uc3QgcmVzID0gT2JqZWN0LmNyZWF0ZSBAIGVuZHBvaW50X3RhcmdldF9hcGksIEA6XG4gICAgICAgICAgaWRfcm91dGVyOiBAe30gZW51bWVyYWJsZTogdHJ1ZSwgdmFsdWU6IGh1Yi5yb3V0ZXIuaWRfc2VsZlxuICAgICAgICAgIGlkX3RhcmdldDogQHt9IGVudW1lcmFibGU6IHRydWUsIHZhbHVlOiBpZF90YXJnZXRcbiAgICAgICAgICByZWFkeTogQHt9IHZhbHVlOiByZWFkeS50aGVuIEAgKCkgPT4gcmVzXG4gICAgICAgIHJldHVybiByZXNcblxuY29uc3QgZW5kcG9pbnRfdGFyZ2V0X2FwaSA9IEA6XG4gIHZhbHVlT2YoKSA6OiByZXR1cm4gMCB8IHRoaXMuaWRfdGFyZ2V0XG4gIGluc3BlY3QoKSA6OiByZXR1cm4gYMKrRW5kcG9pbnQgVGFyZ2V0ICR7dGhpcy5pZF90YXJnZXR9wrtgXG5cbiIsImltcG9ydCB7cmFuZG9tQnl0ZXN9IGZyb20gJ2NyeXB0bydcbmltcG9ydCBlbmRwb2ludF9wbHVnaW4gZnJvbSAnLi9wbHVnaW4uanN5J1xuXG5lbmRwb2ludF9ub2RlanMucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5mdW5jdGlvbiByYW5kb21faWQoKSA6OlxuICByZXR1cm4gcmFuZG9tQnl0ZXMoNCkucmVhZEludDMyTEUoKVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBlbmRwb2ludF9ub2RlanMocGx1Z2luX29wdGlvbnM9e30pIDo6XG4gIGlmIG51bGwgPT0gcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkIDo6XG4gICAgcGx1Z2luX29wdGlvbnMucmFuZG9tX2lkID0gcmFuZG9tX2lkXG5cbiAgcmV0dXJuIGVuZHBvaW50X3BsdWdpbihwbHVnaW5fb3B0aW9ucylcblxuIl0sIm5hbWVzIjpbImxpdHRsZV9lbmRpYW4iLCJjX3NpbmdsZSIsImNfZGF0YWdyYW0iLCJjX2RpcmVjdCIsImNfbXVsdGlwYXJ0IiwiY19zdHJlYW1pbmciLCJfZXJyX21zZ2lkX3JlcXVpcmVkIiwiX2Vycl90b2tlbl9yZXF1aXJlZCIsImZybV9yb3V0aW5nIiwic2l6ZSIsImJpdHMiLCJtYXNrIiwib2JqIiwiZnJvbV9pZCIsImR2Iiwib2Zmc2V0Iiwic2V0SW50MzIiLCJpZF9yb3V0ZXIiLCJpZF90YXJnZXQiLCJ1bmRlZmluZWQiLCJnZXRJbnQzMiIsImZybV9yZXNwb25zZSIsIm1zZ2lkIiwiRXJyb3IiLCJzZXRJbnQxNiIsInNlcV9hY2siLCJhY2tfZmxhZ3MiLCJ0b2tlbiIsImdldEludDE2IiwiZnJtX2RhdGFncmFtIiwidHJhbnNwb3J0IiwiZnJtX2RpcmVjdCIsImZybV9tdWx0aXBhcnQiLCJzZXFfcG9zIiwic2VxIiwic2VxX2ZsYWdzIiwiZnJtX3N0cmVhbWluZyIsImJpbmRfc2VxX25leHQiLCJzZXFfb2Zmc2V0Iiwic2VxX25leHQiLCJmbGFncyIsImZpbiIsIk5hTiIsImNvbXBvc2VGcmFtaW5ncyIsImZybV9mcm9tIiwiZnJtX3Jlc3AiLCJmcm1fdHJhbnNwb3J0cyIsImxlbmd0aCIsImJ5Qml0cyIsInRfZnJvbSIsImZfdGVzdCIsInRfcmVzcCIsInQwIiwidDEiLCJ0MiIsInQzIiwibWFwIiwiZiIsInRlc3RCaXRzIiwiY2hvb3NlIiwibHN0IiwiVCIsImIiLCJvcCIsImZuX2tleSIsImZuX3RyYW4iLCJmbl9mcm9tIiwiZm5fcmVzcCIsImZybSIsImJpbmRBc3NlbWJsZWQiLCJmX3BhY2siLCJmX3VucGFjayIsInBhY2siLCJ1bnBhY2siLCJwa3RfdHlwZSIsInBrdF9vYmoiLCJUeXBlRXJyb3IiLCJ0eXBlIiwiRGF0YVZpZXciLCJBcnJheUJ1ZmZlciIsImhlYWRlciIsImJ1ZmZlciIsInNsaWNlIiwicGt0IiwiYnVmIiwiaGVhZGVyX2J1ZmZlciIsIlVpbnQ4QXJyYXkiLCJpbmZvIiwiX2JpbmRfaXRlcmFibGUiLCJidWZfY2xvbmUiLCJ0dGwiLCJuZXh0Iiwib3B0aW9ucyIsImRvbmUiLCJ2YWx1ZSIsInBhY2tldFBhcnNlciIsImZyYWdtZW50X3NpemUiLCJjb25jYXRCdWZmZXJzIiwicGFja1BhY2tldE9iaiIsInBhY2tfdXRmOCIsInVucGFja191dGY4IiwiTnVtYmVyIiwicmFuZG9tX2lkIiwianNvbl9wYWNrIiwiY3JlYXRlU3RyZWFtIiwicGFja2V0RnJhZ21lbnRzIiwiY3JlYXRlTXVsdGlwYXJ0Iiwic2luayIsInBhcnRzIiwiZmVlZCIsImJvZHlfYnVmZmVyIiwiaW5jbHVkZXMiLCJkZWxldGVTdGF0ZUZvciIsInJlcyIsInJlY3ZEYXRhIiwicnN0cmVhbSIsInN0YXRlIiwiZmVlZF9pbml0IiwiYXNfY29udGVudCIsImZlZWRfaWdub3JlIiwibXNnIiwianNvbl91bnBhY2siLCJib2R5X3V0ZjgiLCJyZWN2U3RyZWFtIiwicmVjdlN0cmVhbURhdGEiLCJiaW5kIiwiZXJyIiwib25fZXJyb3IiLCJmZWVkX2JvZHkiLCJvbl9pbml0IiwiZGF0YSIsIm9uX2RhdGEiLCJvbl9lbmQiLCJmZWVkX3NlcSIsIm5leHRfaGRyIiwiaSIsImxhc3RJbm5lciIsImJ5dGVMZW5ndGgiLCJpMCIsImJvZHkiLCJiaW5kVHJhbnNwb3J0SW1wbHMiLCJpbmJvdW5kIiwiaGlnaGJpdHMiLCJ0cmFuc3BvcnRzIiwib3V0Ym91bmQiLCJmcmFtaW5ncyIsImZyYW1lIiwiaW1wbCIsInRfcmVjdiIsInBhY2tfaGRyIiwicmVjdl9tc2ciLCJiaW5kVHJhbnNwb3J0cyIsInBhY2tCb2R5Iiwic3RyZWFtaW5nIiwic2VuZCIsInN0cmVhbSIsImJpbmRfc3RyZWFtIiwibW9kZSIsImNoYW4iLCJtc2VuZCIsIm1zZW5kX2J5dGVzIiwic2VudCIsIm1zZW5kX29iamVjdHMiLCJtc2VuZF9pbXBsIiwib2JqZWN0IiwiYnl0ZXMiLCJ3cml0ZSIsImVuZCIsImNodW5rIiwiY2hlY2tfZm5zIiwia2V5cyIsImtleSIsImpzb25fcHJvdG9jb2wiLCJzaGFyZWQiLCJkYXRhZ3JhbSIsImRpcmVjdCIsInJlY3ZNc2ciLCJzdGF0ZUZvciIsImJvZHlfYnVmIiwidW5wYWNrQm9keSIsImJpbmFyeV9wcm90b2NvbCIsImFzQnVmZmVyIiwicGt0X2J1ZmZlciIsImNvbnRyb2xfcHJvdG9jb2wiLCJoaWdoIiwicGluZ19mcmFtZSIsInBvbmdfZnJhbWUiLCJwb25nX3R5cGUiLCJyZWN2X3BvbmciLCJwaW5nX3R5cGUiLCJyZWN2X3BpbmciLCJwaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsInRzMCIsIkRhdGUiLCJyb3V0ZXIiLCJib2R5X2pzb24iLCJyZWN2Q3RybCIsIl9zZW5kX3BvbmciLCJwa3RfcGluZyIsInJfaWQiLCJ0czEiLCJkaXNwYXRjaCIsImluaXRfcHJvdG9jb2wiLCJzaGFyZWRfcHJvdG8iLCJqc29uIiwianNvbl9wcm90byIsImJpbmFyeSIsImJpbmFyeV9wcm90byIsImNvbnRyb2wiLCJjb250cm9sX3Byb3RvIiwiY29kZWNzIiwiZGVmYXVsdCIsIkVuZHBvaW50IiwiZm9yUHJvdG9jb2xzIiwibXNnX2N0eCIsIndpdGhFbmRwb2ludCIsImRlZmluZVByb3BlcnRpZXMiLCJlbnVtZXJhYmxlIiwidG8iLCJNYXAiLCJjcmVhdGVNYXAiLCJieV90b2tlbiIsImNyZWF0ZVJlcGx5TWFwIiwiYnlfdHJhZmZpYyIsImNyZWF0ZVRyYWZmaWNNYXAiLCJ0cmFmZmljIiwidHMiLCJub3ciLCJ0IiwiZ2V0IiwicmVjdlRyYWZmaWMiLCJjcmVhdGVTdGF0ZU1hcCIsInJtc2ciLCJyZXBseSIsInJlc29sdmUiLCJ0aGVuIiwid2FybiIsImluaXRSZXBseSIsImtpbmQiLCJpbml0UmVwbHlQcm9taXNlIiwibXNfdGltZW91dCIsIm1vbml0b3IiLCJzZXQiLCJhbnMiLCJQcm9taXNlIiwicmVqZWN0IiwidGlkIiwic2V0VGltZW91dCIsInRpbWVvdXQiLCJ1bnJlZiIsIlJlcGx5VGltZW91dCIsIk9iamVjdCIsImFzc2lnbiIsInByb3RvdHlwZSIsIlNpbmsiLCJfcHJvdG9jb2wiLCJlbmRwb2ludCIsImh1YiIsImhhbmRsZXJzIiwidW5yZWdpc3RlciIsInVucmVnaXN0ZXJUYXJnZXQiLCJyZWdpc3RlclRhcmdldCIsIl9iaW5kRGlzcGF0Y2giLCJvbl9tc2ciLCJvbl9zaHV0ZG93biIsImFsaXZlIiwicHJvdG9jb2wiLCJpc0FsaXZlIiwic2h1dGRvd24iLCJleHRyYSIsImJpbmRTaW5rIiwiem9uZSIsInRlcm1pbmF0ZSIsImlmQWJzZW50IiwiZW50cnkiLCJieV9tc2dpZCIsImRlbGV0ZSIsIk1zZ0N0eCIsIndpdGhDb2RlY3MiLCJyZXNvbHZlUm91dGUiLCJmcmVlemUiLCJjdHgiLCJmcm9tIiwiaWRfc2VsZiIsImJpbmRSb3V0ZURpc3BhdGNoIiwiYXJncyIsImNsb25lIiwid2l0aCIsImNvZGVjIiwiaW52b2tlIiwiYXNzZXJ0TW9uaXRvciIsIl9jb2RlYyIsInRndCIsInJlcGx5X2lkIiwiY3JlYXRlIiwiX3Jvb3RfIiwiY2hlY2tNb25pdG9yIiwiYWN0aXZlIiwiaW5pdE1vbml0b3IiLCJ0c19kdXJhdGlvbiIsInRzX2FjdGl2ZSIsInByb21pc2UiLCJ0ZCIsInRzX2ludGVydmFsIiwiY3RybCIsImNoZWNrUGluZyIsInNldEludGVydmFsIiwiY2xlYXIiLCJjbGVhckludGVydmFsIiwibXNnX2NvZGVjIiwiX21zZ0NvZGVjcyIsIm1zZ0NvZGVjcyIsIm5hbWUiLCJlbnRyaWVzIiwiZGVmYXVsdF9wbHVnaW5fb3B0aW9ucyIsImVycm9yIiwicHJvdG9jb2xzIiwiZXAiLCJwYXJzZSIsInBsdWdpbl9vcHRpb25zIiwibXNnX3VucGFjayIsIm1zZ19wYWNrIiwiZGVmYXVsdF9vbl9lcnJvciIsImRlZmF1bHRfb25fc2h1dGRvd24iLCJvcmRlciIsInN1YmNsYXNzIiwicG9zdCIsIkZhYnJpY0h1Yl9QSSIsImJhc2VzIiwiaXNQYWNrZXRQYXJzZXIiLCJiaW5kRW5kcG9pbnRBcGkiLCJTaW5rQmFzZSIsIk1zZ0N0eEJhc2UiLCJFbmRwb2ludEJhc2UiLCJzZXJ2ZXIiLCJjbGllbnQiLCJ0YXJnZXQiLCJyZWdpc3RlciIsInJlYWR5Iiwib25fcmVhZHkiLCJlbmRwb2ludF90YXJnZXRfYXBpIiwiZW5kcG9pbnRfbm9kZWpzIiwicmFuZG9tQnl0ZXMiLCJyZWFkSW50MzJMRSIsImVuZHBvaW50X3BsdWdpbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQSxNQUFNQSxnQkFBZ0IsSUFBdEI7QUFDQSxNQUFNQyxXQUFXLFFBQWpCO0FBQ0EsTUFBTUMsYUFBYSxVQUFuQjtBQUNBLE1BQU1DLFdBQVcsUUFBakI7QUFDQSxNQUFNQyxjQUFjLFdBQXBCO0FBQ0EsTUFBTUMsY0FBYyxXQUFwQjs7QUFFQSxNQUFNQyxzQkFBdUIsMEJBQTdCO0FBQ0EsTUFBTUMsc0JBQXVCLDJCQUE3Qjs7QUFHQSxTQUFTQyxXQUFULEdBQXVCO1FBQ2ZDLE9BQU8sQ0FBYjtRQUFnQkMsT0FBTyxHQUF2QjtRQUE0QkMsT0FBTyxHQUFuQztTQUNPO1FBQUEsRUFDQ0QsSUFERCxFQUNPQyxJQURQOztXQUdFQyxHQUFQLEVBQVk7YUFBVSxRQUFRQSxJQUFJQyxPQUFaLEdBQXNCSCxJQUF0QixHQUE2QixLQUFwQztLQUhWOztXQUtFRSxHQUFQLEVBQVlFLEVBQVosRUFBZ0JDLE1BQWhCLEVBQXdCO1lBQ2hCLEVBQUNGLE9BQUQsS0FBWUQsR0FBbEI7U0FDR0ksUUFBSCxDQUFjLElBQUVELE1BQWhCLEVBQXdCLElBQUVGLFFBQVFJLFNBQWxDLEVBQTZDakIsYUFBN0M7U0FDR2dCLFFBQUgsQ0FBYyxJQUFFRCxNQUFoQixFQUF3QixJQUFFRixRQUFRSyxTQUFsQyxFQUE2Q2xCLGFBQTdDO0tBUkc7O2FBVUlZLEdBQVQsRUFBY0UsRUFBZCxFQUFrQkMsTUFBbEIsRUFBMEI7WUFDbEJGLFVBQVVNLGNBQWNQLElBQUlDLE9BQWxCLEdBQ1pELElBQUlDLE9BQUosR0FBYyxFQURGLEdBQ09ELElBQUlDLE9BRDNCO2NBRVFJLFNBQVIsR0FBb0JILEdBQUdNLFFBQUgsQ0FBYyxJQUFFTCxNQUFoQixFQUF3QmYsYUFBeEIsQ0FBcEI7Y0FDUWtCLFNBQVIsR0FBb0JKLEdBQUdNLFFB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

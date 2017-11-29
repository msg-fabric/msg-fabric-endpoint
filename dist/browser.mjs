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
      const msg = json_parse(pkt.body_utf8());
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
        data = as_content(pkt);
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
        const msend = msend_impl(chan, obj, json_stringify(msg));
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
        return state.feed(pkt, unpackBody);
      } } };

  function packBody(body) {
    return pack_utf8(json_stringify(body));
  }

  function unpackBody(pkt) {
    return json_parse(pkt.body_utf8());
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
      } catch (err) {
        return on_error(err, { pkt });
      }

      try {
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

export default endpoint_browser;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3Nlci5tanMiLCJzb3VyY2VzIjpbIi4uL2NvZGUvcHJvdG9jb2wvZnJhbWluZy5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL3NoYXJlZC5qc3kiLCIuLi9jb2RlL3Byb3RvY29sL2pzb24uanN5IiwiLi4vY29kZS9wcm90b2NvbC9iaW5hcnkuanN5IiwiLi4vY29kZS9wcm90b2NvbC9jb250cm9sLmpzeSIsIi4uL2NvZGUvcHJvdG9jb2wvaW5kZXguanN5IiwiLi4vY29kZS9lbmRwb2ludC5qc3kiLCIuLi9jb2RlL3NpbmsuanN5IiwiLi4vY29kZS9tc2djdHguanN5IiwiLi4vY29kZS9wbHVnaW4uanN5IiwiLi4vY29kZS9pbmRleC5icm93c2VyLmpzeSJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBsaXR0bGVfZW5kaWFuID0gdHJ1ZVxuY29uc3QgY19zaW5nbGUgPSAnc2luZ2xlJ1xuY29uc3QgY19kYXRhZ3JhbSA9ICdkYXRhZ3JhbSdcbmNvbnN0IGNfZGlyZWN0ID0gJ2RpcmVjdCdcbmNvbnN0IGNfbXVsdGlwYXJ0ID0gJ211bHRpcGFydCdcbmNvbnN0IGNfc3RyZWFtaW5nID0gJ3N0cmVhbWluZydcblxuY29uc3QgX2Vycl9tc2dpZF9yZXF1aXJlZCA9IGBSZXNwb25zZSByZXFpcmVzICdtc2dpZCdgXG5jb25zdCBfZXJyX3Rva2VuX3JlcXVpcmVkID0gYFRyYW5zcG9ydCByZXFpcmVzICd0b2tlbidgXG5cblxuZnVuY3Rpb24gZnJtX3JvdXRpbmcoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MSwgbWFzayA9IDB4MVxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLmZyb21faWQgPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBjb25zdCB7ZnJvbV9pZH0gPSBvYmpcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF9yb3V0ZXIsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDMyIEAgNCtvZmZzZXQsIDB8ZnJvbV9pZC5pZF90YXJnZXQsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGNvbnN0IGZyb21faWQgPSB1bmRlZmluZWQgPT09IG9iai5mcm9tX2lkXG4gICAgICAgID8gb2JqLmZyb21faWQgPSB7fSA6IG9iai5mcm9tX2lkXG4gICAgICBmcm9tX2lkLmlkX3JvdXRlciA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGZyb21faWQuaWRfdGFyZ2V0ID0gZHYuZ2V0SW50MzIgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuXG5mdW5jdGlvbiBmcm1fcmVzcG9uc2UoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4MiwgbWFzayA9IDB4MlxuICByZXR1cm4gQHt9XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIG51bGwgIT0gb2JqLm1zZ2lkID8gYml0cyA6IGZhbHNlXG5cbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoubXNnaWQgOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl9tc2dpZF9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLm1zZ2lkLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDQrb2Zmc2V0LCAwfG9iai5zZXFfYWNrLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5hY2tfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai50b2tlbiA9IGR2LmdldEludDMyIEAgMCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfYWNrID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLmFja19mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cblxuXG5cbmZ1bmN0aW9uIGZybV9kYXRhZ3JhbSgpIDo6XG4gIGNvbnN0IHNpemUgPSAwLCBiaXRzID0gMHgwLCBtYXNrID0gMHhjXG4gIHJldHVybiBAe30gdHJhbnNwb3J0OiBjX2RhdGFncmFtXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGF0YWdyYW0gPT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGJpdHNcbiAgICAgIGlmIG9iai50cmFuc3BvcnQgJiYgY19zaW5nbGUgIT09IG9iai50cmFuc3BvcnQgOjogcmV0dXJuIGZhbHNlXG4gICAgICByZXR1cm4gISBvYmoudG9rZW4gPyBiaXRzIDogZmFsc2VcblxuICAgIGZfcGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19kYXRhZ3JhbVxuXG5mdW5jdGlvbiBmcm1fZGlyZWN0KCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDQsIGJpdHMgPSAweDQsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfZGlyZWN0XG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjpcbiAgICAgIGlmIGNfZGlyZWN0ID09PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBiaXRzXG4gICAgICBpZiBvYmoudHJhbnNwb3J0ICYmIGNfc2luZ2xlICE9PSBvYmoudHJhbnNwb3J0IDo6IHJldHVybiBmYWxzZVxuICAgICAgcmV0dXJuICEhIG9iai50b2tlbiA/IGJpdHMgOiBmYWxzZVxuXG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuXG4gICAgZl91bnBhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgb2JqLm1zZ2lkID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnRyYW5zcG9ydCA9IGNfZGlyZWN0XG5cbmZ1bmN0aW9uIGZybV9tdWx0aXBhcnQoKSA6OlxuICBjb25zdCBzaXplID0gOCwgYml0cyA9IDB4OCwgbWFzayA9IDB4Y1xuICByZXR1cm4gQHt9IHRyYW5zcG9ydDogY19tdWx0aXBhcnRcbiAgICBzaXplLCBiaXRzLCBtYXNrXG5cbiAgICBmX3Rlc3Qob2JqKSA6OiByZXR1cm4gY19tdWx0aXBhcnQgPT09IG9iai50cmFuc3BvcnQgPyBiaXRzIDogZmFsc2VcblxuICAgIGJpbmRfc2VxX25leHQsIHNlcV9wb3M6IDRcbiAgICBmX3BhY2sob2JqLCBkdiwgb2Zmc2V0KSA6OlxuICAgICAgaWYgISBvYmoudG9rZW4gOjogdGhyb3cgbmV3IEVycm9yIEAgX2Vycl90b2tlbl9yZXF1aXJlZFxuICAgICAgZHYuc2V0SW50MzIgQCAwK29mZnNldCwgb2JqLnRva2VuLCBsaXR0bGVfZW5kaWFuXG4gICAgICBpZiB0cnVlID09IG9iai5zZXEgOjogLy8gdXNlIHNlcV9uZXh0XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGVsc2UgZHYuc2V0SW50MTYgQCA0K29mZnNldCwgMHxvYmouc2VxLCBsaXR0bGVfZW5kaWFuXG4gICAgICBkdi5zZXRJbnQxNiBAIDYrb2Zmc2V0LCAwfG9iai5zZXFfZmxhZ3MsIGxpdHRsZV9lbmRpYW5cblxuICAgIGZfdW5wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIG9iai5tc2dpZCAgICAgPSBkdi5nZXRJbnQzMiBAIDArb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmouc2VxICAgICAgID0gZHYuZ2V0SW50MTYgQCA0K29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcV9mbGFncyA9IGR2LmdldEludDE2IEAgNitvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai50cmFuc3BvcnQgPSBjX211bHRpcGFydFxuXG5mdW5jdGlvbiBmcm1fc3RyZWFtaW5nKCkgOjpcbiAgY29uc3Qgc2l6ZSA9IDgsIGJpdHMgPSAweGMsIG1hc2sgPSAweGNcbiAgcmV0dXJuIEB7fSB0cmFuc3BvcnQ6IGNfc3RyZWFtaW5nXG4gICAgc2l6ZSwgYml0cywgbWFza1xuXG4gICAgZl90ZXN0KG9iaikgOjogcmV0dXJuIGNfc3RyZWFtaW5nID09PSBvYmoudHJhbnNwb3J0ID8gYml0cyA6IGZhbHNlXG5cbiAgICBiaW5kX3NlcV9uZXh0LCBzZXFfcG9zOiA0XG4gICAgZl9wYWNrKG9iaiwgZHYsIG9mZnNldCkgOjpcbiAgICAgIGlmICEgb2JqLnRva2VuIDo6IHRocm93IG5ldyBFcnJvciBAIF9lcnJfdG9rZW5fcmVxdWlyZWRcbiAgICAgIGR2LnNldEludDMyIEAgMCtvZmZzZXQsIG9iai50b2tlbiwgbGl0dGxlX2VuZGlhblxuICAgICAgaWYgdHJ1ZSA9PSBvYmouc2VxIDo6XG4gICAgICAgIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDAsIGxpdHRsZV9lbmRpYW4gLy8gdXNlIHNlcV9uZXh0XG4gICAgICBlbHNlIGR2LnNldEludDE2IEAgNCtvZmZzZXQsIDB8b2JqLnNlcSwgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCA2K29mZnNldCwgMHxvYmouc2VxX2ZsYWdzLCBsaXR0bGVfZW5kaWFuXG5cbiAgICBmX3VucGFjayhvYmosIGR2LCBvZmZzZXQpIDo6XG4gICAgICBvYmoubXNnaWQgICAgID0gZHYuZ2V0SW50MzIgQCAwK29mZnNldCwgbGl0dGxlX2VuZGlhblxuICAgICAgb2JqLnNlcSAgICAgICA9IGR2LmdldEludDE2IEAgNCtvZmZzZXQsIGxpdHRsZV9lbmRpYW5cbiAgICAgIG9iai5zZXFfZmxhZ3MgPSBkdi5nZXRJbnQxNiBAIDYrb2Zmc2V0LCBsaXR0bGVfZW5kaWFuXG4gICAgICBvYmoudHJhbnNwb3J0ID0gY19zdHJlYW1pbmdcblxuXG5mdW5jdGlvbiBiaW5kX3NlcV9uZXh0KG9mZnNldCkgOjpcbiAgY29uc3Qgc2VxX29mZnNldCA9IHRoaXMuc2VxX3BvcyArIG9mZnNldFxuICBsZXQgc2VxID0gMVxuICByZXR1cm4gZnVuY3Rpb24gc2VxX25leHQoe2ZsYWdzLCBmaW59LCBkdikgOjpcbiAgICBpZiAhIGZpbiA6OlxuICAgICAgZHYuc2V0SW50MTYgQCBzZXFfb2Zmc2V0LCBzZXErKywgbGl0dGxlX2VuZGlhblxuICAgICAgZHYuc2V0SW50MTYgQCAyK3NlcV9vZmZzZXQsIDB8ZmxhZ3MsIGxpdHRsZV9lbmRpYW5cbiAgICBlbHNlIDo6XG4gICAgICBkdi5zZXRJbnQxNiBAIHNlcV9vZmZzZXQsIC1zZXEsIGxpdHRsZV9lbmRpYW5cbiAgICAgIGR2LnNldEludDE2IEAgMitzZXFfb2Zmc2V0LCAwfGZsYWdzLCBsaXR0bGVfZW5kaWFuXG4gICAgICBzZXEgPSBOYU5cblxuXG5cbmV4cG9ydCBkZWZhdWx0IGNvbXBvc2VGcmFtaW5ncygpXG5mdW5jdGlvbiBjb21wb3NlRnJhbWluZ3MoKSA6OlxuICBjb25zdCBmcm1fZnJvbSA9IGZybV9yb3V0aW5nKCksIGZybV9yZXNwID0gZnJtX3Jlc3BvbnNlKClcbiAgY29uc3QgZnJtX3RyYW5zcG9ydHMgPSBAW10gZnJtX2RhdGFncmFtKCksIGZybV9kaXJlY3QoKSwgZnJtX211bHRpcGFydCgpLCBmcm1fc3RyZWFtaW5nKClcblxuICBpZiA4ICE9PSBmcm1fZnJvbS5zaXplIHx8IDggIT09IGZybV9yZXNwLnNpemUgfHwgNCAhPSBmcm1fdHJhbnNwb3J0cy5sZW5ndGggOjpcbiAgICB0aHJvdyBuZXcgRXJyb3IgQCBgRnJhbWluZyBTaXplIGNoYW5nZWBcblxuICBjb25zdCBieUJpdHMgPSBbXSwgbWFzaz0weGZcblxuICA6OlxuICAgIGNvbnN0IHRfZnJvbSA9IGZybV9mcm9tLmZfdGVzdCwgdF9yZXNwID0gZnJtX3Jlc3AuZl90ZXN0XG4gICAgY29uc3QgW3QwLHQxLHQyLHQzXSA9IGZybV90cmFuc3BvcnRzLm1hcCBAIGY9PmYuZl90ZXN0XG5cbiAgICBjb25zdCB0ZXN0Qml0cyA9IGJ5Qml0cy50ZXN0Qml0cyA9IG9iaiA9PlxuICAgICAgMCB8IHRfZnJvbShvYmopIHwgdF9yZXNwKG9iaikgfCB0MChvYmopIHwgdDEob2JqKSB8IHQyKG9iaikgfCB0MyhvYmopXG5cbiAgICBieUJpdHMuY2hvb3NlID0gZnVuY3Rpb24gKG9iaiwgbHN0KSA6OlxuICAgICAgaWYgbnVsbCA9PSBsc3QgOjogbHN0ID0gdGhpcyB8fCBieUJpdHNcbiAgICAgIHJldHVybiBsc3RbdGVzdEJpdHMob2JqKV1cblxuXG4gIGZvciBjb25zdCBUIG9mIGZybV90cmFuc3BvcnRzIDo6XG4gICAgY29uc3Qge2JpdHM6Yiwgc2l6ZSwgdHJhbnNwb3J0fSA9IFRcblxuICAgIGJ5Qml0c1tifDBdID0gQHt9IFQsIHRyYW5zcG9ydCwgYml0czogYnwwLCBtYXNrLCBzaXplOiBzaXplLCBvcDogJydcbiAgICBieUJpdHNbYnwxXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MSwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAnZidcbiAgICBieUJpdHNbYnwyXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MiwgbWFzaywgc2l6ZTogOCArIHNpemUsIG9wOiAncidcbiAgICBieUJpdHNbYnwzXSA9IEB7fSBULCB0cmFuc3BvcnQsIGJpdHM6IGJ8MywgbWFzaywgc2l6ZTogMTYgKyBzaXplLCBvcDogJ2ZyJ1xuXG4gICAgZm9yIGNvbnN0IGZuX2tleSBvZiBbJ2ZfcGFjaycsICdmX3VucGFjayddIDo6XG4gICAgICBjb25zdCBmbl90cmFuID0gVFtmbl9rZXldLCBmbl9mcm9tID0gZnJtX2Zyb21bZm5fa2V5XSwgZm5fcmVzcCA9IGZybV9yZXNwW2ZuX2tleV1cblxuICAgICAgYnlCaXRzW2J8MF1bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX3RyYW4ob2JqLCBkdiwgMClcbiAgICAgIGJ5Qml0c1tifDFdW2ZuX2tleV0gPSBmdW5jdGlvbihvYmosIGR2KSA6OiBmbl9mcm9tKG9iaiwgZHYsIDApOyBmbl90cmFuKG9iaiwgZHYsIDgpXG4gICAgICBieUJpdHNbYnwyXVtmbl9rZXldID0gZnVuY3Rpb24ob2JqLCBkdikgOjogZm5fcmVzcChvYmosIGR2LCAwKTsgZm5fdHJhbihvYmosIGR2LCA4KVxuICAgICAgYnlCaXRzW2J8M11bZm5fa2V5XSA9IGZ1bmN0aW9uKG9iaiwgZHYpIDo6IGZuX2Zyb20ob2JqLCBkdiwgMCk7IGZuX3Jlc3Aob2JqLCBkdiwgOCk7IGZuX3RyYW4ob2JqLCBkdiwgMTYpXG5cbiAgZm9yIGNvbnN0IGZybSBvZiBieUJpdHMgOjpcbiAgICBiaW5kQXNzZW1ibGVkIEAgZnJtXG5cbiAgcmV0dXJuIGJ5Qml0c1xuXG5cbmZ1bmN0aW9uIGJpbmRBc3NlbWJsZWQoZnJtKSA6OlxuICBjb25zdCB7VCwgc2l6ZSwgZl9wYWNrLCBmX3VucGFja30gPSBmcm1cbiAgaWYgVC5iaW5kX3NlcV9uZXh0IDo6XG4gICAgZnJtLnNlcV9uZXh0ID0gVC5iaW5kX3NlcV9uZXh0IEAgZnJtLnNpemUgLSBULnNpemVcblxuICBkZWxldGUgZnJtLlRcbiAgZnJtLnBhY2sgPSBwYWNrIDsgZnJtLnVucGFjayA9IHVucGFja1xuICBjb25zdCBzZXFfbmV4dCA9IGZybS5zZXFfbmV4dFxuXG4gIGZ1bmN0aW9uIHBhY2socGt0X3R5cGUsIHBrdF9vYmopIDo6XG4gICAgaWYgISBAIDAgPD0gcGt0X3R5cGUgJiYgcGt0X3R5cGUgPD0gMjU1IDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIHBrdF90eXBlIHRvIGJlIFswLi4yNTVdYFxuXG4gICAgcGt0X29iai50eXBlID0gcGt0X3R5cGVcbiAgICBpZiBzZXFfbmV4dCAmJiBudWxsID09IHBrdF9vYmouc2VxIDo6XG4gICAgICBwa3Rfb2JqLnNlcSA9IHRydWVcblxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IEFycmF5QnVmZmVyKHNpemUpXG4gICAgZl9wYWNrKHBrdF9vYmosIGR2LCAwKVxuICAgIHBrdF9vYmouaGVhZGVyID0gZHYuYnVmZmVyXG5cbiAgICBpZiB0cnVlID09PSBwa3Rfb2JqLnNlcSA6OlxuICAgICAgX2JpbmRfaXRlcmFibGUgQCBwa3Rfb2JqLCBkdi5idWZmZXIuc2xpY2UoMCxzaXplKVxuXG4gIGZ1bmN0aW9uIHVucGFjayhwa3QpIDo6XG4gICAgY29uc3QgYnVmID0gcGt0LmhlYWRlcl9idWZmZXIoKVxuICAgIGNvbnN0IGR2ID0gbmV3IERhdGFWaWV3IEAgbmV3IFVpbnQ4QXJyYXkoYnVmKS5idWZmZXJcblxuICAgIGNvbnN0IGluZm8gPSB7fVxuICAgIGZfdW5wYWNrKGluZm8sIGR2LCAwKVxuICAgIHJldHVybiBwa3QuaW5mbyA9IGluZm9cblxuICBmdW5jdGlvbiBfYmluZF9pdGVyYWJsZShwa3Rfb2JqLCBidWZfY2xvbmUpIDo6XG4gICAgY29uc3Qge3R5cGV9ID0gcGt0X29ialxuICAgIGNvbnN0IHtpZF9yb3V0ZXIsIGlkX3RhcmdldCwgdHRsLCB0b2tlbn0gPSBwa3Rfb2JqXG4gICAgcGt0X29iai5uZXh0ID0gbmV4dFxuXG4gICAgZnVuY3Rpb24gbmV4dChvcHRpb25zKSA6OlxuICAgICAgaWYgbnVsbCA9PSBvcHRpb25zIDo6IG9wdGlvbnMgPSB7fVxuICAgICAgY29uc3QgaGVhZGVyID0gYnVmX2Nsb25lLnNsaWNlKClcbiAgICAgIHNlcV9uZXh0IEAgb3B0aW9ucywgbmV3IERhdGFWaWV3IEAgaGVhZGVyXG4gICAgICByZXR1cm4gQHt9IGRvbmU6ICEhIG9wdGlvbnMuZmluLCB2YWx1ZTogQHt9IC8vIHBrdF9vYmpcbiAgICAgICAgaWRfcm91dGVyLCBpZF90YXJnZXQsIHR5cGUsIHR0bCwgdG9rZW4sIGhlYWRlclxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24ocGFja2V0UGFyc2VyLCBvcHRpb25zLCBmcmFnbWVudF9zaXplKSA6OlxuICBjb25zdCB7Y29uY2F0QnVmZmVycywgcGFja1BhY2tldE9iaiwgcGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBwYWNrZXRQYXJzZXJcbiAgZnJhZ21lbnRfc2l6ZSA9IE51bWJlcihmcmFnbWVudF9zaXplIHx8IDgwMDApXG4gIGlmIDEwMjQgPiBmcmFnbWVudF9zaXplIHx8IDY1MDAwIDwgZnJhZ21lbnRfc2l6ZSA6OlxuICAgIHRocm93IG5ldyBFcnJvciBAIGBJbnZhbGlkIGZyYWdtZW50IHNpemU6ICR7ZnJhZ21lbnRfc2l6ZX1gXG5cbiAgY29uc3Qge3JhbmRvbV9pZCwganNvbl9yZXZpdmVyLCBqc29uX3JlcGxhY2VyfSA9IG9wdGlvbnNcbiAgcmV0dXJuIEA6IHBhY2tldFBhcnNlciwgcmFuZG9tX2lkLCBqc29uX3BhcnNlLCBqc29uX3N0cmluZ2lmeVxuICAgIGNyZWF0ZU11bHRpcGFydCwgY3JlYXRlU3RyZWFtLCBwYWNrZXRGcmFnbWVudHNcbiAgICBiaW5kVHJhbnNwb3J0c1xuXG5cbiAgZnVuY3Rpb24ganNvbl9wYXJzZSh0ZXh0KSA6OlxuICAgIHJldHVybiBKU09OLnBhcnNlIEAgdGV4dCwganNvbl9yZXZpdmVyXG4gIGZ1bmN0aW9uIGpzb25fc3RyaW5naWZ5KG9iaikgOjpcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkgQCBvYmosIGpzb25fcmVwbGFjZXJcblxuXG4gIGZ1bmN0aW9uIGNyZWF0ZU11bHRpcGFydChwa3QsIHNpbmssIG1zZ2lkKSA6OlxuICAgIGxldCBwYXJ0cyA9IFtdLCBmaW4gPSBmYWxzZVxuICAgIHJldHVybiBAe30gZmVlZCwgaW5mbzogcGt0LmluZm9cblxuICAgIGZ1bmN0aW9uIGZlZWQocGt0KSA6OlxuICAgICAgbGV0IHNlcSA9IHBrdC5pbmZvLnNlcVxuICAgICAgaWYgc2VxIDwgMCA6OiBmaW4gPSB0cnVlOyBzZXEgPSAtc2VxXG4gICAgICBwYXJ0c1tzZXEtMV0gPSBwa3QuYm9keV9idWZmZXIoKVxuXG4gICAgICBpZiAhIGZpbiA6OiByZXR1cm5cbiAgICAgIGlmIHBhcnRzLmluY2x1ZGVzIEAgdW5kZWZpbmVkIDo6IHJldHVyblxuXG4gICAgICBzaW5rLmRlbGV0ZVN0YXRlRm9yKG1zZ2lkKVxuXG4gICAgICBjb25zdCByZXMgPSBjb25jYXRCdWZmZXJzKHBhcnRzKVxuICAgICAgcGFydHMgPSBudWxsXG4gICAgICByZXR1cm4gcmVzXG5cbiAgZnVuY3Rpb24gY3JlYXRlU3RyZWFtKHBrdCwgc2luaywgbXNnaWQpIDo6XG4gICAgbGV0IG5leHQ9MCwgZmluID0gZmFsc2UsIHJlY3ZEYXRhLCByc3RyZWFtXG4gICAgY29uc3Qgc3RhdGUgPSBAe30gZmVlZDogZmVlZF9pbml0LCBpbmZvOiBwa3QuaW5mb1xuICAgIHJldHVybiBzdGF0ZVxuXG4gICAgZnVuY3Rpb24gZmVlZF9pbml0KHBrdCwgYXNfY29udGVudCkgOjpcbiAgICAgIHN0YXRlLmZlZWQgPSBmZWVkX2lnbm9yZVxuXG4gICAgICBjb25zdCBpbmZvID0gcGt0LmluZm9cbiAgICAgIGNvbnN0IG1zZyA9IGpzb25fcGFyc2UgQCBwa3QuYm9keV91dGY4KClcbiAgICAgIHJzdHJlYW0gPSBzaW5rLnJlY3ZTdHJlYW0obXNnLCBpbmZvKVxuICAgICAgaWYgbnVsbCA9PSByc3RyZWFtIDo6IHJldHVyblxuICAgICAgY2hlY2tfZm5zIEAgcnN0cmVhbSwgJ29uX2Vycm9yJywgJ29uX2RhdGEnLCAnb25fZW5kJyBcbiAgICAgIHJlY3ZEYXRhID0gc2luay5yZWN2U3RyZWFtRGF0YS5iaW5kKHNpbmssIHJzdHJlYW0sIGluZm8pXG5cbiAgICAgIHRyeSA6OlxuICAgICAgICBmZWVkX3NlcShwa3QpXG4gICAgICBjYXRjaCBlcnIgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25fZXJyb3IgQCBlcnIsIHBrdFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9ib2R5XG4gICAgICBpZiByc3RyZWFtLm9uX2luaXQgOjpcbiAgICAgICAgcmV0dXJuIHJzdHJlYW0ub25faW5pdChtc2csIHBrdClcblxuICAgIGZ1bmN0aW9uIGZlZWRfYm9keShwa3QsIGFzX2NvbnRlbnQpIDo6XG4gICAgICByZWN2RGF0YSgpXG4gICAgICBsZXQgZGF0YVxuICAgICAgdHJ5IDo6XG4gICAgICAgIGZlZWRfc2VxKHBrdClcbiAgICAgICAgZGF0YSA9IGFzX2NvbnRlbnQocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIHJldHVybiByc3RyZWFtLm9uX2Vycm9yIEAgZXJyLCBwa3RcblxuICAgICAgaWYgZmluIDo6XG4gICAgICAgIGNvbnN0IHJlcyA9IHJzdHJlYW0ub25fZGF0YSBAIGRhdGEsIHBrdFxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9lbmQgQCByZXMsIHBrdFxuICAgICAgZWxzZSA6OlxuICAgICAgICByZXR1cm4gcnN0cmVhbS5vbl9kYXRhIEAgZGF0YSwgcGt0XG5cbiAgICBmdW5jdGlvbiBmZWVkX2lnbm9yZShwa3QpIDo6XG4gICAgICB0cnkgOjogZmVlZF9zZXEocGt0KVxuICAgICAgY2F0Y2ggZXJyIDo6XG5cbiAgICBmdW5jdGlvbiBmZWVkX3NlcShwa3QpIDo6XG4gICAgICBsZXQgc2VxID0gcGt0LmluZm8uc2VxXG4gICAgICBpZiBzZXEgPj0gMCA6OlxuICAgICAgICBpZiBuZXh0KysgPT09IHNlcSA6OlxuICAgICAgICAgIHJldHVybiAvLyBpbiBvcmRlclxuICAgICAgZWxzZSA6OlxuICAgICAgICBmaW4gPSB0cnVlXG4gICAgICAgIHNpbmsuZGVsZXRlU3RhdGVGb3IobXNnaWQpXG4gICAgICAgIGlmIG5leHQgPT09IC1zZXEgOjpcbiAgICAgICAgICBuZXh0ID0gJ2RvbmUnXG4gICAgICAgICAgcmV0dXJuIC8vIGluLW9yZGVyLCBsYXN0IHBhY2tldFxuXG4gICAgICBzdGF0ZS5mZWVkID0gZmVlZF9pZ25vcmVcbiAgICAgIG5leHQgPSAnaW52YWxpZCdcbiAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYWNrZXQgb3V0IG9mIHNlcXVlbmNlYFxuXG4gIGZ1bmN0aW9uICogcGFja2V0RnJhZ21lbnRzKGJ1ZiwgbmV4dF9oZHIsIGZpbikgOjpcbiAgICBpZiBudWxsID09IGJ1ZiA6OlxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoe2Zpbn0pXG4gICAgICB5aWVsZCBvYmpcbiAgICAgIHJldHVyblxuXG4gICAgbGV0IGkgPSAwLCBsYXN0SW5uZXIgPSBidWYuYnl0ZUxlbmd0aCAtIGZyYWdtZW50X3NpemU7XG4gICAgd2hpbGUgaSA8IGxhc3RJbm5lciA6OlxuICAgICAgY29uc3QgaTAgPSBpXG4gICAgICBpICs9IGZyYWdtZW50X3NpemVcblxuICAgICAgY29uc3Qgb2JqID0gbmV4dF9oZHIoKVxuICAgICAgb2JqLmJvZHkgPSBidWYuc2xpY2UoaTAsIGkpXG4gICAgICB5aWVsZCBvYmpcblxuICAgIDo6XG4gICAgICBjb25zdCBvYmogPSBuZXh0X2hkcih7ZmlufSlcbiAgICAgIG9iai5ib2R5ID0gYnVmLnNsaWNlKGkpXG4gICAgICB5aWVsZCBvYmpcblxuXG5cbiAgZnVuY3Rpb24gYmluZFRyYW5zcG9ydEltcGxzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IG91dGJvdW5kID0gW11cbiAgICBvdXRib3VuZC5jaG9vc2UgPSBmcmFtaW5ncy5jaG9vc2VcblxuICAgIGZvciBjb25zdCBmcmFtZSBvZiBmcmFtaW5ncyA6OlxuICAgICAgY29uc3QgaW1wbCA9IGZyYW1lID8gdHJhbnNwb3J0c1tmcmFtZS50cmFuc3BvcnRdIDogbnVsbFxuICAgICAgaWYgISBpbXBsIDo6IGNvbnRpbnVlXG5cbiAgICAgIGNvbnN0IHtiaXRzLCBwYWNrLCB1bnBhY2t9ID0gZnJhbWVcbiAgICAgIGNvbnN0IHBrdF90eXBlID0gaGlnaGJpdHMgfCBiaXRzXG4gICAgICBjb25zdCB7dF9yZWN2fSA9IGltcGxcblxuICAgICAgZnVuY3Rpb24gcGFja19oZHIob2JqKSA6OlxuICAgICAgICBwYWNrKHBrdF90eXBlLCBvYmopXG4gICAgICAgIHJldHVybiBvYmpcblxuICAgICAgZnVuY3Rpb24gcmVjdl9tc2cocGt0LCBzaW5rKSA6OlxuICAgICAgICB1bnBhY2socGt0KVxuICAgICAgICByZXR1cm4gdF9yZWN2KHBrdCwgc2luaylcblxuICAgICAgcGFja19oZHIucGt0X3R5cGUgPSByZWN2X21zZy5wa3RfdHlwZSA9IHBrdF90eXBlXG4gICAgICBvdXRib3VuZFtiaXRzXSA9IHBhY2tfaGRyXG4gICAgICBpbmJvdW5kW3BrdF90eXBlXSA9IHJlY3ZfbXNnXG5cbiAgICAgIGlmICdwcm9kdWN0aW9uJyAhPT0gcHJvY2Vzcy5lbnYuTk9ERV9FTlYgOjpcbiAgICAgICAgY29uc3Qgb3AgPSBwYWNrX2hkci5vcCA9IHJlY3ZfbXNnLm9wID0gZnJhbWUub3BcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IEAgcGFja19oZHIsICduYW1lJywgQHt9IHZhbHVlOiBgcGFja19oZHIgwqske29wfcK7YFxuICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgQCByZWN2X21zZywgJ25hbWUnLCBAe30gdmFsdWU6IGByZWN2X21zZyDCqyR7b3B9wrtgXG5cbiAgICByZXR1cm4gb3V0Ym91bmRcblxuXG4gIGZ1bmN0aW9uIGJpbmRUcmFuc3BvcnRzKGluYm91bmQsIGhpZ2hiaXRzLCB0cmFuc3BvcnRzKSA6OlxuICAgIGNvbnN0IHBhY2tCb2R5ID0gdHJhbnNwb3J0cy5wYWNrQm9keVxuICAgIGNvbnN0IHBhY2tTdHJlYW0gPSB0cmFuc3BvcnRzLnBhY2tTdHJlYW1cbiAgICBjb25zdCBvdXRib3VuZCA9IGJpbmRUcmFuc3BvcnRJbXBscyhpbmJvdW5kLCBoaWdoYml0cywgdHJhbnNwb3J0cylcbiAgICByZXR1cm4gdHJhbnNwb3J0cy5zdHJlYW1pbmdcbiAgICAgID8gQHt9IHNlbmQsIHN0cmVhbTogYmluZF9zdHJlYW0gQCB0cmFuc3BvcnRzLnN0cmVhbWluZy5tb2RlXG4gICAgICA6IEB7fSBzZW5kXG5cbiAgICBmdW5jdGlvbiBzZW5kKGNoYW4sIG9iaiwgYm9keSkgOjpcbiAgICAgIGJvZHkgPSBwYWNrQm9keShib2R5KVxuICAgICAgaWYgZnJhZ21lbnRfc2l6ZSA8IGJvZHkuYnl0ZUxlbmd0aCA6OlxuICAgICAgICBpZiAhIG9iai50b2tlbiA6OiBvYmoudG9rZW4gPSByYW5kb21faWQoKVxuICAgICAgICBvYmoudHJhbnNwb3J0ID0gJ211bHRpcGFydCdcbiAgICAgICAgY29uc3QgbXNlbmQgPSBtc2VuZF9ieXRlcyhjaGFuLCBvYmopXG4gICAgICAgIHJldHVybiBAe30gc2VudDogbXNlbmQgQCB0cnVlLCBib2R5XG5cbiAgICAgIG9iai50cmFuc3BvcnQgPSAnc2luZ2xlJ1xuICAgICAgb2JqLmJvZHkgPSBib2R5XG4gICAgICBjb25zdCBwYWNrX2hkciA9IG91dGJvdW5kLmNob29zZShvYmopXG4gICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgcGFja19oZHIob2JqKVxuICAgICAgcmV0dXJuIEB7fSBzZW50OiBjaGFuIEAgcGt0XG5cbiAgICBmdW5jdGlvbiBtc2VuZF9ieXRlcyhjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgIGNvbnN0IHBhY2tfaGRyID0gb3V0Ym91bmQuY2hvb3NlKG9iailcbiAgICAgIGxldCB7bmV4dH0gPSBwYWNrX2hkcihvYmopXG4gICAgICBpZiBudWxsICE9PSBtc2cgOjpcbiAgICAgICAgb2JqLmJvZHkgPSBtc2dcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBjaGFuIEAgcGt0XG5cbiAgICAgIHJldHVybiBhc3luYyBmdW5jdGlvbiAoZmluLCBib2R5KSA6OlxuICAgICAgICBpZiBudWxsID09PSBuZXh0IDo6XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgJ1dyaXRlIGFmdGVyIGVuZCdcbiAgICAgICAgbGV0IHJlc1xuICAgICAgICBmb3IgY29uc3Qgb2JqIG9mIHBhY2tldEZyYWdtZW50cyBAIGJvZHksIG5leHQsIGZpbiA6OlxuICAgICAgICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICAgICAgICByZXMgPSBhd2FpdCBjaGFuIEAgcGt0XG4gICAgICAgIGlmIGZpbiA6OiBuZXh0ID0gbnVsbFxuICAgICAgICByZXR1cm4gcmVzXG5cbiAgICBmdW5jdGlvbiBtc2VuZF9vYmplY3RzKGNoYW4sIG9iaiwgbXNnKSA6OlxuICAgICAgY29uc3QgcGFja19oZHIgPSBvdXRib3VuZC5jaG9vc2Uob2JqKVxuICAgICAgbGV0IHtuZXh0fSA9IHBhY2tfaGRyKG9iailcbiAgICAgIGlmIG51bGwgIT09IG1zZyA6OlxuICAgICAgICBvYmouYm9keSA9IG1zZ1xuICAgICAgICBjb25zdCBwa3QgPSBwYWNrUGFja2V0T2JqIEAgb2JqXG4gICAgICAgIGNoYW4gQCBwa3RcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmaW4sIGJvZHkpIDo6XG4gICAgICAgIGlmIG51bGwgPT09IG5leHQgOjpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgQCAnV3JpdGUgYWZ0ZXIgZW5kJ1xuICAgICAgICBjb25zdCBvYmogPSBuZXh0KHtmaW59KVxuICAgICAgICBvYmouYm9keSA9IGJvZHlcbiAgICAgICAgY29uc3QgcGt0ID0gcGFja1BhY2tldE9iaiBAIG9ialxuICAgICAgICBpZiBmaW4gOjogbmV4dCA9IG51bGxcbiAgICAgICAgcmV0dXJuIGNoYW4gQCBwa3RcblxuICAgIGZ1bmN0aW9uIGJpbmRfc3RyZWFtKG1vZGUpIDo6XG4gICAgICBjb25zdCBtc2VuZF9pbXBsID0ge29iamVjdDogbXNlbmRfb2JqZWN0cywgYnl0ZXM6IG1zZW5kX2J5dGVzfVttb2RlXVxuICAgICAgaWYgbXNlbmRfaW1wbCA6OiByZXR1cm4gc3RyZWFtXG5cbiAgICAgIGZ1bmN0aW9uIHN0cmVhbShjaGFuLCBvYmosIG1zZykgOjpcbiAgICAgICAgaWYgISBvYmoudG9rZW4gOjogb2JqLnRva2VuID0gcmFuZG9tX2lkKClcbiAgICAgICAgb2JqLnRyYW5zcG9ydCA9ICdzdHJlYW1pbmcnXG4gICAgICAgIGNvbnN0IG1zZW5kID0gbXNlbmRfaW1wbCBAIGNoYW4sIG9iaiwganNvbl9zdHJpbmdpZnkobXNnKVxuICAgICAgICB3cml0ZS53cml0ZSA9IHdyaXRlOyB3cml0ZS5lbmQgPSB3cml0ZS5iaW5kKHRydWUpXG4gICAgICAgIHJldHVybiB3cml0ZVxuXG4gICAgICAgIGZ1bmN0aW9uIHdyaXRlKGNodW5rKSA6OlxuICAgICAgICAgIHJldHVybiBjaHVuayAhPSBudWxsXG4gICAgICAgICAgICA/IG1zZW5kIEAgdHJ1ZT09PXRoaXMsIHBhY2tCb2R5IEAgY2h1bmtcbiAgICAgICAgICAgIDogbXNlbmQgQCB0cnVlXG5cblxuZnVuY3Rpb24gY2hlY2tfZm5zKG9iaiwgLi4ua2V5cykgOjpcbiAgZm9yIGNvbnN0IGtleSBvZiBrZXlzIDo6XG4gICAgaWYgJ2Z1bmN0aW9uJyAhPT0gdHlwZW9mIG9ialtrZXldIDo6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yIEAgYEV4cGVjdGVkIFwiJHtrZXl9XCIgdG8gYmUgYSBmdW5jdGlvbmBcbiIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGpzb25fcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW0sIGpzb25fcGFyc2UsIGpzb25fc3RyaW5naWZ5fSA9IHNoYXJlZFxuICBjb25zdCB7cGFja191dGY4LCB1bnBhY2tfdXRmOH0gPSBzaGFyZWQucGFja2V0UGFyc2VyXG5cbiAgcmV0dXJuIEB7fVxuICAgIHBhY2tCb2R5XG4gICAgcGFja1N0cmVhbShjaHVuaywgZnJhZ21lbnRfc2l6ZSkgOjpcbiAgICAgIHJldHVybiBAW10gcGFja0JvZHkoY2h1bmspXG5cbiAgICBnZXQgZGF0YWdyYW0oKSA6OiByZXR1cm4gdGhpcy5kaXJlY3RcbiAgICBkaXJlY3Q6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3QgbXNnID0ganNvbl9wYXJzZSBAIHBrdC5ib2R5X3V0ZjgoKSB8fCB1bmRlZmluZWRcbiAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgcGt0LmluZm9cblxuICAgIG11bHRpcGFydDogQHt9XG4gICAgICB0X3JlY3YocGt0LCBzaW5rKSA6OlxuICAgICAgICBjb25zdCBzdGF0ZSA9IHNpbmsuc3RhdGVGb3IgQCBwa3QsIGNyZWF0ZU11bHRpcGFydFxuICAgICAgICBjb25zdCBib2R5X2J1ZiA9IHN0YXRlLmZlZWQocGt0KVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IGJvZHlfYnVmIDo6XG4gICAgICAgICAgY29uc3QgbXNnID0ganNvbl9wYXJzZSBAIHVucGFja191dGY4KGJvZHlfYnVmKSB8fCB1bmRlZmluZWRcbiAgICAgICAgICByZXR1cm4gc2luay5yZWN2TXNnIEAgbXNnLCBzdGF0ZS5pbmZvXG5cbiAgICBzdHJlYW1pbmc6IEB7fVxuICAgICAgbW9kZTogJ29iamVjdCdcbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlU3RyZWFtXG4gICAgICAgIHJldHVybiBzdGF0ZS5mZWVkKHBrdCwgdW5wYWNrQm9keSlcblxuICBmdW5jdGlvbiBwYWNrQm9keShib2R5KSA6OlxuICAgIHJldHVybiBwYWNrX3V0ZjggQCBqc29uX3N0cmluZ2lmeShib2R5KVxuXG4gIGZ1bmN0aW9uIHVucGFja0JvZHkocGt0KSA6OlxuICAgIHJldHVybiBqc29uX3BhcnNlIEAgcGt0LmJvZHlfdXRmOCgpXG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBiaW5hcnlfcHJvdG9jb2woc2hhcmVkKSA6OlxuICBjb25zdCB7Y3JlYXRlTXVsdGlwYXJ0LCBjcmVhdGVTdHJlYW19ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrX3V0ZjgsIHVucGFja191dGY4fSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgY29uc3Qge2FzQnVmZmVyfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcbiAgcmV0dXJuIEB7fVxuICAgIHBhY2tCb2R5OiBhc0J1ZmZlclxuICAgIHBhY2tTdHJlYW0oY2h1bmssIGZyYWdtZW50X3NpemUpIDo6XG4gICAgICByZXR1cm4gQFtdIGFzQnVmZmVyKGNodW5rKVxuXG4gICAgZ2V0IGRhdGFncmFtKCkgOjogcmV0dXJuIHRoaXMuZGlyZWN0XG4gICAgZGlyZWN0OiBAe31cbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IG1zZyA9IHBrdC5ib2R5X2J1ZmZlcigpXG4gICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHBrdC5pbmZvXG5cbiAgICBtdWx0aXBhcnQ6IEB7fVxuICAgICAgdF9yZWN2KHBrdCwgc2luaykgOjpcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBzaW5rLnN0YXRlRm9yIEAgcGt0LCBjcmVhdGVNdWx0aXBhcnRcbiAgICAgICAgY29uc3QgbXNnID0gc3RhdGUuZmVlZChwa3QpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gbXNnIDo6XG4gICAgICAgICAgcmV0dXJuIHNpbmsucmVjdk1zZyBAIG1zZywgc3RhdGUuaW5mb1xuXG4gICAgc3RyZWFtaW5nOiBAe31cbiAgICAgIG1vZGU6ICdieXRlcydcbiAgICAgIHRfcmVjdihwa3QsIHNpbmspIDo6XG4gICAgICAgIGNvbnN0IHN0YXRlID0gc2luay5zdGF0ZUZvciBAIHBrdCwgY3JlYXRlU3RyZWFtXG4gICAgICAgIGNvbnN0IG1zZyA9IHN0YXRlLmZlZWQocGt0LCBwa3RfYnVmZmVyKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IG1zZyA6OlxuICAgICAgICAgIHJldHVybiBzaW5rLnJlY3ZNc2cgQCBtc2csIHN0YXRlLmluZm9cblxuZnVuY3Rpb24gcGt0X2J1ZmZlcihwa3QpIDo6IHJldHVybiBwa3QuYm9keV9idWZmZXIoKVxuXG4iLCJpbXBvcnQgZnJhbWluZ3MgZnJvbSAnLi9mcmFtaW5nLmpzeSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gY29udHJvbF9wcm90b2NvbChpbmJvdW5kLCBoaWdoLCBzaGFyZWQpIDo6XG4gIGNvbnN0IHtyYW5kb21faWR9ID0gc2hhcmVkXG4gIGNvbnN0IHtwYWNrUGFja2V0T2JqfSA9IHNoYXJlZC5wYWNrZXRQYXJzZXJcblxuICBjb25zdCBwaW5nX2ZyYW1lID0gZnJhbWluZ3MuY2hvb3NlIEA6IGZyb21faWQ6IHRydWUsIHRva2VuOiB0cnVlLCB0cmFuc3BvcnQ6ICdkaXJlY3QnXG4gIGNvbnN0IHBvbmdfZnJhbWUgPSBmcmFtaW5ncy5jaG9vc2UgQDogZnJvbV9pZDogdHJ1ZSwgbXNnaWQ6IHRydWUsIHRyYW5zcG9ydDogJ2RhdGFncmFtJ1xuXG4gIGNvbnN0IHBvbmdfdHlwZSA9IGhpZ2h8MHhlXG4gIGluYm91bmRbcG9uZ190eXBlXSA9IHJlY3ZfcG9uZ1xuICBjb25zdCBwaW5nX3R5cGUgPSBoaWdofDB4ZlxuICBpbmJvdW5kW2hpZ2h8MHhmXSA9IHJlY3ZfcGluZ1xuXG4gIHJldHVybiBAe30gc2VuZDpwaW5nLCBwaW5nXG5cbiAgZnVuY3Rpb24gcGluZyhjaGFuLCBvYmopIDo6XG4gICAgaWYgISBvYmoudG9rZW4gOjpcbiAgICAgIG9iai50b2tlbiA9IHJhbmRvbV9pZCgpXG4gICAgb2JqLmJvZHkgPSBKU09OLnN0cmluZ2lmeSBAOlxuICAgICAgb3A6ICdwaW5nJywgdHMwOiBuZXcgRGF0ZSgpXG4gICAgcGluZ19mcmFtZS5wYWNrKHBpbmdfdHlwZSwgb2JqKVxuICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICByZXR1cm4gY2hhbiBAIHBrdFxuXG4gIGZ1bmN0aW9uIHJlY3ZfcGluZyhwa3QsIHNpbmssIHJvdXRlcikgOjpcbiAgICBwaW5nX2ZyYW1lLnVucGFjayhwa3QpXG4gICAgcGt0LmJvZHkgPSBwa3QuYm9keV9qc29uKClcbiAgICBfc2VuZF9wb25nIEAgcGt0LmJvZHksIHBrdCwgc2luaywgcm91dGVyXG4gICAgcmV0dXJuIHNpbmsucmVjdkN0cmwocGt0LmJvZHksIHBrdC5pbmZvKVxuXG4gIGZ1bmN0aW9uIF9zZW5kX3Bvbmcoe3RzMH0sIHBrdF9waW5nLCBzaW5rLCByb3V0ZXIpIDo6XG4gICAgY29uc3Qge21zZ2lkLCBmcm9tX2lkOnJfaWR9ID0gcGt0X3BpbmcuaW5mb1xuICAgIGNvbnN0IHtpZF9yb3V0ZXIsIGlkX3RhcmdldH0gPSByX2lkXG4gICAgY29uc3Qgb2JqID0gQHt9IGlkX3JvdXRlciwgaWRfdGFyZ2V0XG4gICAgICBmcm9tX2lkOiBzaW5rLmZyb21faWQsIG1zZ2lkXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSBAOlxuICAgICAgICBvcDogJ3BvbmcnLCB0czAsIHRzMTogbmV3IERhdGUoKVxuXG4gICAgcG9uZ19mcmFtZS5wYWNrKHBvbmdfdHlwZSwgb2JqKVxuICAgIGNvbnN0IHBrdCA9IHBhY2tQYWNrZXRPYmogQCBvYmpcbiAgICByZXR1cm4gcm91dGVyLmRpc3BhdGNoIEAgW3BrdF1cblxuICBmdW5jdGlvbiByZWN2X3BvbmcocGt0LCBzaW5rKSA6OlxuICAgIHBvbmdfZnJhbWUudW5wYWNrKHBrdClcbiAgICBwa3QuYm9keSA9IHBrdC5ib2R5X2pzb24oKVxuICAgIHJldHVybiBzaW5rLnJlY3ZDdHJsKHBrdC5ib2R5LCBwa3QuaW5mbylcblxuIiwiaW1wb3J0IGZyYW1pbmdzIGZyb20gJy4vZnJhbWluZy5qc3knXG5pbXBvcnQgc2hhcmVkX3Byb3RvIGZyb20gJy4vc2hhcmVkLmpzeSdcbmltcG9ydCBqc29uX3Byb3RvIGZyb20gJy4vanNvbi5qc3knXG5pbXBvcnQgYmluYXJ5X3Byb3RvIGZyb20gJy4vYmluYXJ5LmpzeSdcbmltcG9ydCBjb250cm9sX3Byb3RvIGZyb20gJy4vY29udHJvbC5qc3knXG5cbmV4cG9ydCAqIGZyb20gJy4vZnJhbWluZy5qc3knXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGluaXRfcHJvdG9jb2wocGFja2V0UGFyc2VyLCBvcHRpb25zKSA6OlxuICBjb25zdCBzaGFyZWQgPSBzaGFyZWRfcHJvdG8gQCBwYWNrZXRQYXJzZXIsIG9wdGlvbnNcblxuICBjb25zdCBpbmJvdW5kID0gW11cbiAgY29uc3QganNvbiA9IHNoYXJlZC5iaW5kVHJhbnNwb3J0cyBAIGluYm91bmRcbiAgICAweDAwIC8vIDB4MCog4oCUIEpTT04gYm9keVxuICAgIGpzb25fcHJvdG8oc2hhcmVkKVxuXG4gIGNvbnN0IGJpbmFyeSA9IHNoYXJlZC5iaW5kVHJhbnNwb3J0cyBAIGluYm91bmRcbiAgICAweDEwIC8vIDB4MSog4oCUIGJpbmFyeSBib2R5XG4gICAgYmluYXJ5X3Byb3RvKHNoYXJlZClcblxuICBjb25zdCBjb250cm9sID0gY29udHJvbF9wcm90byBAIGluYm91bmQsXG4gICAgMHhmMCAvLyAweGYqIOKAlCBjb250cm9sXG4gICAgc2hhcmVkXG5cbiAgY29uc3QgY29kZWNzID0gQDoganNvbiwgYmluYXJ5LCBjb250cm9sLCBkZWZhdWx0OiBqc29uXG5cbiAgY29uc3Qge3JhbmRvbV9pZH0gPSBzaGFyZWRcbiAgcmV0dXJuIEA6IGluYm91bmQsIGNvZGVjcywgcmFuZG9tX2lkXG5cblxuIiwiZXhwb3J0IGRlZmF1bHQgY2xhc3MgRW5kcG9pbnQgOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7fSkgOjpcbiAgICBjbGFzcyBFbmRwb2ludCBleHRlbmRzIHRoaXMgOjpcbiAgICByZXR1cm4gRW5kcG9pbnRcblxuICB2YWx1ZU9mKCkgOjogcmV0dXJuIHRoaXMuZnJvbV9pZFxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VuZHBvaW50ICR7dGhpcy5mcm9tX2lkLmlkX3RhcmdldH3Cu2BcblxuICBjb25zdHJ1Y3Rvcihtc2dfY3R4KSA6OlxuICAgIG1zZ19jdHggPSBtc2dfY3R4LndpdGhFbmRwb2ludCh0aGlzKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIGZyb21faWQ6IEB7fSB2YWx1ZTogbXNnX2N0eC5mcm9tX2lkLCBlbnVtZXJhYmxlOiB0cnVlXG4gICAgICB0bzogQHt9IHZhbHVlOiBtc2dfY3R4LnRvXG5cbiAgY3JlYXRlTWFwKCkgOjogcmV0dXJuIG5ldyBNYXAoKVxuICBjcmVhdGVTdGF0ZU1hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG4gIGNyZWF0ZVJlcGx5TWFwKCkgOjogcmV0dXJuIHRoaXMuY3JlYXRlTWFwKClcbiAgY3JlYXRlVHJhZmZpY01hcCgpIDo6IHJldHVybiB0aGlzLmNyZWF0ZU1hcCgpXG5cbiAgYmluZFNpbmsoc2luaykgOjpcbiAgICBjb25zdCBieV90b2tlbiA9IHRoaXMuY3JlYXRlUmVwbHlNYXAoKVxuICAgIGNvbnN0IGJ5X3RyYWZmaWMgPSB0aGlzLmNyZWF0ZVRyYWZmaWNNYXAoKVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIGJ5X3Rva2VuOiBAe30gdmFsdWU6IGJ5X3Rva2VuXG4gICAgICBieV90cmFmZmljOiBAe30gdmFsdWU6IGJ5X3RyYWZmaWNcblxuICAgIGNvbnN0IHRyYWZmaWMgPSAoZnJvbV9pZCwgdHJhZmZpYykgPT4gOjpcbiAgICAgIGNvbnN0IHRzID0gRGF0ZS5ub3coKVxuICAgICAgaWYgZnJvbV9pZCA6OlxuICAgICAgICBjb25zdCB0ID0gYnlfdHJhZmZpYy5nZXQoZnJvbV9pZC5pZF90YXJnZXQpXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gdCA6OlxuICAgICAgICAgIHQudHMgPSB0W2B0c18ke3RyYWZmaWN9YF0gPSB0c1xuICAgICAgdGhpcy5yZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cylcblxuICAgIHJldHVybiBAe31cbiAgICAgIGZyb21faWQ6IHRoaXMuZnJvbV9pZFxuICAgICAgYnlfbXNnaWQ6IHRoaXMuY3JlYXRlU3RhdGVNYXAoKVxuXG4gICAgICByZWN2Q3RybDogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdjdHJsJylcbiAgICAgICAgY29uc3Qgcm1zZyA9IHRoaXMucmVjdkN0cmwobXNnLCBpbmZvKVxuXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUoe3Jtc2csIG1zZywgaW5mb30pLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdk1zZzogKG1zZywgaW5mbykgPT4gOjpcbiAgICAgICAgdHJhZmZpYyhpbmZvLmZyb21faWQsICdtc2cnKVxuICAgICAgICBjb25zdCBybXNnID0gdGhpcy5yZWN2TXNnKG1zZywgaW5mbylcblxuICAgICAgICBjb25zdCByZXBseSA9IGJ5X3Rva2VuLmdldChpbmZvLnRva2VuKVxuICAgICAgICBpZiB1bmRlZmluZWQgIT09IHJlcGx5IDo6XG4gICAgICAgICAgUHJvbWlzZS5yZXNvbHZlKHJtc2cpLnRoZW4ocmVwbHkpXG4gICAgICAgIGVsc2UgcmV0dXJuIHJtc2dcblxuICAgICAgcmVjdlN0cmVhbURhdGE6IChyc3RyZWFtLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICByZWN2U3RyZWFtOiAobXNnLCBpbmZvKSA9PiA6OlxuICAgICAgICB0cmFmZmljKGluZm8uZnJvbV9pZCwgJ3N0cmVhbScpXG4gICAgICAgIGNvbnN0IHJzdHJlYW0gPSB0aGlzLnJlY3ZTdHJlYW0obXNnLCBpbmZvKVxuXG4gICAgICAgIGNvbnN0IHJlcGx5ID0gYnlfdG9rZW4uZ2V0KGluZm8udG9rZW4pXG4gICAgICAgIGlmIHVuZGVmaW5lZCAhPT0gcmVwbHkgOjpcbiAgICAgICAgICBQcm9taXNlLnJlc29sdmUocnN0cmVhbSkudGhlbihyZXBseSlcbiAgICAgICAgcmV0dXJuIHJzdHJlYW1cblxuICByZWN2VHJhZmZpYyhmcm9tX2lkLCB0cmFmZmljLCB0cykgOjpcbiAgcmVjdkN0cmwobXNnLCBpbmZvKSA6OlxuICByZWN2TXNnKG1zZywgaW5mbykgOjpcbiAgICByZXR1cm4gQHt9IG1zZywgaW5mb1xuICByZWN2U3RyZWFtKG1zZywgaW5mbykgOjpcbiAgICBjb25zb2xlLndhcm4gQCBgVW5oYW5kbGUgcmVjdiBzdHJlYW06ICR7aW5mb31gXG4gICAgcmV0dXJuIG51bGxcbiAgICAvKiByZXR1cm4gQHt9IG1zZywgaW5mb1xuICAgICAgICAgb25faW5pdChtc2csIHBrdCkgOjogcmV0dXJuIHRoaXNcbiAgICAgICAgIG9uX2RhdGEoZGF0YSwgcGt0KSA6OiB0aGlzLnBhcnRzLnB1c2ggQCBkYXRhXG4gICAgICAgICBvbl9lbmQocmVzdWx0LCBwa3QpIDo6IHJldHVybiB0aGlzLnBhcnRzLmpvaW4oJycpXG4gICAgICAgICBvbl9lcnJvcihlcnIsIHBrdCkgOjogY29uc29sZS5sb2cgQCBlcnJcbiAgICAqL1xuXG4gIGluaXRSZXBseSh0b2tlbiwgbXNnX2N0eCwga2luZCkgOjpcbiAgICByZXR1cm4gdGhpcy5pbml0UmVwbHlQcm9taXNlIEAgdG9rZW4sIG1zZ19jdHgubXNfdGltZW91dFxuXG4gIGluaXRNb25pdG9yKGlkX3RhcmdldCkgOjpcbiAgICBjb25zdCBrZXkgPSBpZF90YXJnZXQuaWRfdGFyZ2V0IHx8IGlkX3RhcmdldFxuICAgIGxldCBtb25pdG9yID0gdGhpcy5ieV90cmFmZmljLmdldCBAIGtleVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gbW9uaXRvciA6OlxuICAgICAgbW9uaXRvciA9IEB7fSBpZF90YXJnZXQsIHRzOiBEYXRlLm5vdygpXG4gICAgICAgIHRkKCkgOjogcmV0dXJuIERhdGUubm93KCkgLSB0aGlzLnRzXG4gICAgICB0aGlzLmJ5X3RyYWZmaWMuc2V0IEAga2V5LCBtb25pdG9yXG4gICAgcmV0dXJuIG1vbml0b3JcblxuICBpbml0UmVwbHlQcm9taXNlKHRva2VuLCBtc190aW1lb3V0KSA6OlxuICAgIGNvbnN0IGFucyA9IG5ldyBQcm9taXNlIEAgKHJlc29sdmUsIHJlamVjdCkgPT4gOjpcbiAgICAgIHRoaXMuYnlfdG9rZW4uc2V0IEAgdG9rZW4sIHJlc29sdmVcbiAgICAgIGlmIG1zX3RpbWVvdXQgOjpcbiAgICAgICAgY29uc3QgdGlkID0gc2V0VGltZW91dCh0aW1lb3V0LCBtc190aW1lb3V0KVxuICAgICAgICBpZiB0aWQudW5yZWYgOjogdGlkLnVucmVmKClcbiAgICAgICAgZnVuY3Rpb24gdGltZW91dCgpIDo6IHJlamVjdCBAIG5ldyB0aGlzLlJlcGx5VGltZW91dFxuXG4gICAgcmV0dXJuIHNlbnQgPT4gOjpcbiAgICAgIGFucy5zZW50ID0gc2VudFxuICAgICAgcmV0dXJuIGFuc1xuXG5jbGFzcyBSZXBseVRpbWVvdXQgZXh0ZW5kcyBFcnJvciA6OlxuXG5PYmplY3QuYXNzaWduIEAgRW5kcG9pbnQucHJvdG90eXBlLCBAe31cbiAgUmVwbHlUaW1lb3V0XG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBTaW5rIDo6XG4gIHN0YXRpYyBmb3JQcm90b2NvbHMoe2luYm91bmR9KSA6OlxuICAgIGNsYXNzIFNpbmsgZXh0ZW5kcyB0aGlzIDo6XG4gICAgU2luay5wcm90b3R5cGUuX3Byb3RvY29sID0gaW5ib3VuZFxuICAgIHJldHVybiBTaW5rXG5cbiAgc3RhdGljIHJlZ2lzdGVyKGVuZHBvaW50LCBrd19hcmdzKSA6OlxuICAgIHJldHVybiBuZXcgdGhpcygpLnJlZ2lzdGVyKGVuZHBvaW50LCBrd19hcmdzKVxuICByZWdpc3RlcihlbmRwb2ludCwge2h1YiwgaWRfdGFyZ2V0LCBvbl9tc2csIG9uX2Vycm9yfSkgOjpcbiAgICBjb25zdCB1bnJlZ2lzdGVyID0gKCkgPT4gaHViLnJvdXRlci51bnJlZ2lzdGVyVGFyZ2V0KGlkX3RhcmdldClcblxuICAgIGh1Yi5yb3V0ZXIucmVnaXN0ZXJUYXJnZXQgQCBpZF90YXJnZXQsXG4gICAgICB0aGlzLl9iaW5kRGlzcGF0Y2ggQCBlbmRwb2ludCwgb25fbXNnLCBvbl9lcnJvciwgdW5yZWdpc3RlclxuICAgIHJldHVybiB0aGlzXG5cbiAgX2JpbmREaXNwYXRjaChlbmRwb2ludCwgb25fbXNnLCBvbl9lcnJvciwgdW5yZWdpc3RlcikgOjpcbiAgICBsZXQgYWxpdmUgPSB0cnVlXG4gICAgY29uc3QgcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbFxuICAgIGNvbnN0IGlzQWxpdmUgPSAoKSA9PiBhbGl2ZVxuICAgIGNvbnN0IHNodXRkb3duID0gKGVycikgPT4gOjpcbiAgICAgIGlmIGFsaXZlIDo6XG4gICAgICAgIHVucmVnaXN0ZXIoKTsgdW5yZWdpc3RlciA9IGFsaXZlID0gZmFsc2VcbiAgICAgICAgaWYgZXJyIDo6IGNvbnNvbGUuZXJyb3IgQCAnRU5EUE9JTlQgU0hVVERPV046ICcgKyBlcnJcblxuICAgIE9iamVjdC5hc3NpZ24gQCB0aGlzLCBlbmRwb2ludC5iaW5kU2luayh0aGlzKSwgQHt9IGlzQWxpdmUsIHNodXRkb3duXG4gICAgT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAe30gaXNBbGl2ZSwgc2h1dGRvd25cblxuICAgIHJldHVybiBhc3luYyAocGt0LCByb3V0ZXIpID0+IDo6XG4gICAgICBpZiBmYWxzZT09PWFsaXZlIHx8IG51bGw9PXBrdCA6OiByZXR1cm4gYWxpdmVcblxuICAgICAgY29uc3QgcmVjdl9tc2cgPSBwcm90b2NvbFtwa3QudHlwZV1cbiAgICAgIGlmIHVuZGVmaW5lZCA9PT0gcmVjdl9tc2cgOjpcbiAgICAgICAgcmV0dXJuIG9uX2Vycm9yIEAgZmFsc2UsIEB7fSBwa3RcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIHZhciBtc2cgPSBhd2FpdCByZWN2X21zZyBAIHBrdCwgdGhpcywgcm91dGVyXG4gICAgICAgIGlmICEgbXNnIDo6IHJldHVybiBtc2dcbiAgICAgIGNhdGNoIGVyciA6OlxuICAgICAgICByZXR1cm4gb25fZXJyb3IgQCBlcnIsIEB7fSBwa3RcblxuICAgICAgdHJ5IDo6XG4gICAgICAgIHJldHVybiBhd2FpdCBvbl9tc2cgQCBtc2csIHBrdFxuICAgICAgY2F0Y2ggZXJyIDo6XG4gICAgICAgIGlmIGZhbHNlICE9PSBvbl9lcnJvcihlcnIsIHttc2csIHBrdH0pIDo6XG4gICAgICAgICAgZW5kcG9pbnQuc2h1dGRvd24oZXJyLCB7bXNnLCBwa3R9KVxuXG4gIHN0YXRlRm9yKHBrdCwgaWZBYnNlbnQpIDo6XG4gICAgY29uc3QgbXNnaWQgPSBwa3QuaW5mby5tc2dpZFxuICAgIGxldCBlbnRyeSA9IHRoaXMuYnlfbXNnaWQuZ2V0KG1zZ2lkKVxuICAgIGlmIHVuZGVmaW5lZCA9PT0gZW50cnkgOjpcbiAgICAgIGlmICEgbXNnaWQgOjpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yIEAgYEludmFsaWQgbXNnaWQ6ICR7bXNnaWR9YFxuICAgICAgaWYgJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGlmQWJzZW50IDo6XG4gICAgICAgIGVudHJ5ID0gaWZBYnNlbnQocGt0LCB0aGlzLCBtc2dpZClcbiAgICAgIGVsc2UgZW50cnkgPSBpZkFic2VudFxuICAgICAgdGhpcy5ieV9tc2dpZC5zZXQgQCBtc2dpZCwgZW50cnlcbiAgICByZXR1cm4gZW50cnlcblxuICBkZWxldGVTdGF0ZUZvcihtc2dpZCkgOjpcbiAgICByZXR1cm4gdGhpcy5ieV9tc2dpZC5kZWxldGUobXNnaWQpXG4iLCJleHBvcnQgZGVmYXVsdCBjbGFzcyBNc2dDdHggOjpcbiAgc3RhdGljIGZvclByb3RvY29scyh7cmFuZG9tX2lkLCBjb2RlY3N9KSA6OlxuICAgIGNsYXNzIE1zZ0N0eCBleHRlbmRzIHRoaXMgOjpcbiAgICBNc2dDdHgucHJvdG90eXBlLnJhbmRvbV9pZCA9IHJhbmRvbV9pZFxuICAgIE1zZ0N0eC53aXRoQ29kZWNzIEAgY29kZWNzXG4gICAgcmV0dXJuIE1zZ0N0eFxuXG4gIGNvbnN0cnVjdG9yKGZyb21faWQsIHJlc29sdmVSb3V0ZSkgOjpcbiAgICBpZiBudWxsICE9PSBmcm9tX2lkIDo6XG4gICAgICBjb25zdCB7aWRfdGFyZ2V0LCBpZF9yb3V0ZXJ9ID0gZnJvbV9pZFxuICAgICAgZnJvbV9pZCA9IE9iamVjdC5mcmVlemUgQDogaWRfdGFyZ2V0LCBpZF9yb3V0ZXJcblxuICAgIGNvbnN0IGN0eCA9IHtmcm9tX2lkfVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzIEAgdGhpcywgQDpcbiAgICAgIF9yb290XzogQDogdmFsdWU6IHRoaXNcbiAgICAgIGZyb21faWQ6IEA6IHZhbHVlOiBmcm9tX2lkXG4gICAgICBjdHg6IEA6IHZhbHVlOiBjdHhcbiAgICAgIHJlc29sdmVSb3V0ZTogQDogdmFsdWU6IHJlc29sdmVSb3V0ZVxuXG4gIHdpdGhFbmRwb2ludChlbmRwb2ludCkgOjpcbiAgICByZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnRpZXMgQCB0aGlzLCBAe31cbiAgICAgIGVuZHBvaW50OiBAe30gdmFsdWU6IGVuZHBvaW50XG5cbiAgc3RhdGljIGZyb20oaWRfdGFyZ2V0LCBodWIpIDo6XG4gICAgY29uc3QgZnJvbV9pZCA9IG51bGwgPT09IGlkX3RhcmdldCA/IG51bGxcbiAgICAgIDogQHt9IGlkX3RhcmdldCwgaWRfcm91dGVyOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICByZXR1cm4gbmV3IHRoaXMgQCBmcm9tX2lkLCBodWIuYmluZFJvdXRlRGlzcGF0Y2goKVxuXG4gIGdldCB0bygpIDo6IHJldHVybiAoLi4uYXJncykgPT4gdGhpcy5jbG9uZSgpLndpdGggQCAuLi5hcmdzXG5cbiAgcGluZyh0b2tlbj10cnVlKSA6OiByZXR1cm4gdGhpcy5jb2RlYygnY29udHJvbCcsIHt0b2tlbn0pLmludm9rZSBAICdwaW5nJ1xuICBzZW5kKC4uLmFyZ3MpIDo6IHJldHVybiB0aGlzLmludm9rZSBAICdzZW5kJywgLi4uYXJnc1xuICBzdHJlYW0oLi4uYXJncykgOjogcmV0dXJuIHRoaXMuaW52b2tlIEAgJ3N0cmVhbScsIC4uLmFyZ3NcblxuICBpbnZva2Uoa2V5LCAuLi5hcmdzKSA6OlxuICAgIGNvbnN0IG9iaiA9IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHhcbiAgICB0aGlzLmFzc2VydE1vbml0b3IoKVxuICAgIGNvbnN0IGNoYW4gPSB0aGlzLnJlc29sdmVSb3V0ZShvYmouaWRfcm91dGVyKVxuICAgIGlmIHRydWUgIT09IG9iai50b2tlbiA6OlxuICAgICAgcmV0dXJuIHRoaXMuX2NvZGVjW2tleV0gQCBjaGFuLCBvYmosIC4uLmFyZ3NcblxuICAgIGVsc2UgOjpcbiAgICAgIGNvbnN0IHRva2VuID0gb2JqLnRva2VuID0gdGhpcy5yYW5kb21faWQoKVxuICAgICAgY29uc3QgcmVwbHkgPSB0aGlzLmVuZHBvaW50LmluaXRSZXBseSh0b2tlbiwgdGhpcywga2V5KVxuICAgICAgcmV0dXJuIHJlcGx5IEAgdGhpcy5fY29kZWNba2V5XSBAIGNoYW4sIG9iaiwgLi4uYXJnc1xuXG5cbiAgd2l0aCguLi5hcmdzKSA6OlxuICAgIGNvbnN0IGN0eCA9IHRoaXMuY3R4XG4gICAgZm9yIGxldCB0Z3Qgb2YgYXJncyA6OlxuICAgICAgaWYgJ251bWJlcicgPT09IHR5cGVvZiB0Z3QgOjpcbiAgICAgICAgY3R4LmlkX3RhcmdldCA9IHRndFxuICAgICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgICAgIGNvbnRpbnVlXG5cbiAgICAgIGNvbnN0IHtmcm9tX2lkOiByZXBseV9pZCwgaWRfdGFyZ2V0LCBpZF9yb3V0ZXIsIHRva2VuLCBtc2dpZH0gPSB0Z3RcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBpZF90YXJnZXQgOjpcbiAgICAgICAgaWYgdW5kZWZpbmVkID09PSBpZF9yb3V0ZXIgOjpcbiAgICAgICAgICBpZiAhIGN0eC5pZF9yb3V0ZXIgOjpcbiAgICAgICAgICAgIC8vIGltcGxpY2l0bHkgb24gdGhlIHNhbWUgcm91dGVyXG4gICAgICAgICAgICBjdHguaWRfcm91dGVyID0gY3R4LmZyb21faWQuaWRfcm91dGVyXG4gICAgICAgIGVsc2UgY3R4LmlkX3JvdXRlciA9IGlkX3JvdXRlclxuICAgICAgICBjdHguaWRfdGFyZ2V0ID0gaWRfdGFyZ2V0XG4gICAgICBlbHNlIGlmIHVuZGVmaW5lZCAhPT0gaWRfcm91dGVyIDo6XG4gICAgICAgIHRocm93IG5ldyBFcnJvciBAIGBQYXNzaW5nICdpZF9yb3V0ZXInIHJlcXVpcmVzICdpZF90YXJnZXQnYFxuICAgICAgZWxzZSBpZiB1bmRlZmluZWQgIT09IHJlcGx5X2lkICYmICEgY3R4LmlkX3RhcmdldCA6OlxuICAgICAgICBjdHguaWRfcm91dGVyID0gcmVwbHlfaWQuaWRfcm91dGVyXG4gICAgICAgIGN0eC5pZF90YXJnZXQgPSByZXBseV9pZC5pZF90YXJnZXRcblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSB0b2tlbiA6OiBjdHgudG9rZW4gPSB0b2tlblxuICAgICAgaWYgdW5kZWZpbmVkICE9PSBtc2dpZCA6OiBjdHgubXNnaWQgPSBtc2dpZFxuXG4gICAgcmV0dXJuIHRoaXNcblxuICB3aXRoUmVwbHkoKSA6OlxuICAgIHJldHVybiB0aGlzLmNsb25lIEA6IHRva2VuOiB0cnVlXG5cbiAgcmVzZXQoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMuX3Jvb3RfLCBAe31cbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcbiAgY2xvbmUoLi4uYXJncykgOjpcbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEB7fVxuICAgICAgY3R4OiBAOiB2YWx1ZTogT2JqZWN0LmFzc2lnbiBAIHt9LCB0aGlzLmN0eCwgLi4uYXJnc1xuXG5cbiAgYXNzZXJ0TW9uaXRvcigpIDo6XG4gICAgaWYgISB0aGlzLmNoZWNrTW9uaXRvcigpIDo6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IgQCBgVGFyZ2V0IG1vbml0b3IgZXhwaXJlZGBcbiAgY2hlY2tNb25pdG9yKCkgOjogcmV0dXJuIHRydWVcbiAgbW9uaXRvcihvcHRpb25zPXt9KSA6OlxuICAgIGlmIHRydWUgPT09IG9wdGlvbnMgfHwgZmFsc2UgPT09IG9wdGlvbnMgOjpcbiAgICAgIG9wdGlvbnMgPSBAe30gYWN0aXZlOiBvcHRpb25zXG5cbiAgICBjb25zdCBtb25pdG9yID0gdGhpcy5lbmRwb2ludC5pbml0TW9uaXRvcih0aGlzLmN0eC5pZF90YXJnZXQpXG5cbiAgICBjb25zdCB0c19kdXJhdGlvbiA9IG9wdGlvbnMudHNfZHVyYXRpb24gfHwgNTAwMFxuICAgIGxldCB0c19hY3RpdmUgPSBvcHRpb25zLnRzX2FjdGl2ZVxuICAgIGlmIHRydWUgPT09IHRzX2FjdGl2ZSA6OlxuICAgICAgdHNfYWN0aXZlID0gdHNfZHVyYXRpb24vNFxuXG4gICAgbGV0IGNoZWNrTW9uaXRvclxuICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZSBAIChyZXNvbHZlLCByZWplY3QpID0+IDo6XG4gICAgICBjb25zdCBkb25lID0gb3B0aW9ucy5yZWplY3QgPyByZWplY3QgOiByZXNvbHZlXG4gICAgICB0aGlzLmNoZWNrTW9uaXRvciA9IGNoZWNrTW9uaXRvciA9ICgpID0+XG4gICAgICAgIHRzX2R1cmF0aW9uID4gbW9uaXRvci50ZCgpXG4gICAgICAgICAgPyB0cnVlIDogKGRvbmUobW9uaXRvciksIGZhbHNlKVxuXG4gICAgbGV0IHRpZFxuICAgIGNvbnN0IHRzX2ludGVydmFsID0gdHNfYWN0aXZlIHx8IHRzX2R1cmF0aW9uLzRcbiAgICBpZiBvcHRpb25zLmFjdGl2ZSB8fCB0c19hY3RpdmUgOjpcbiAgICAgIGNvbnN0IGN0cmwgPSB0aGlzLmNvZGVjKCdjb250cm9sJylcbiAgICAgIGNvbnN0IGNoZWNrUGluZyA9ICgpID0+IDo6XG4gICAgICAgIGlmIHRzX2ludGVydmFsID4gbW9uaXRvci50ZCgpIDo6XG4gICAgICAgICAgY3RybC5pbnZva2UoJ3BpbmcnKVxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja1BpbmcsIHRzX2ludGVydmFsXG4gICAgZWxzZSA6OlxuICAgICAgdGlkID0gc2V0SW50ZXJ2YWwgQCBjaGVja01vbml0b3IsIHRzX2ludGVydmFsXG4gICAgaWYgdGlkLnVucmVmIDo6IHRpZC51bnJlZigpXG4gICAgY29uc3QgY2xlYXIgPSAoKSA9PiBjbGVhckludGVydmFsKHRpZClcblxuICAgIHByb21pc2UudGhlbihjbGVhciwgY2xlYXIpXG4gICAgcmV0dXJuIHByb21pc2VcblxuXG4gIGNvZGVjKG1zZ19jb2RlYywgLi4uYXJncykgOjpcbiAgICBpZiAnc3RyaW5nJyA9PT0gdHlwZW9mIG1zZ19jb2RlYyA6OlxuICAgICAgbXNnX2NvZGVjID0gdGhpcy5fbXNnQ29kZWNzW21zZ19jb2RlY11cblxuICAgIGlmICdmdW5jdGlvbicgIT09IHR5cGVvZiBtc2dfY29kZWMuc2VuZCA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBFeHBlY3RlZCBwYWNrZXQgY29kZWMgcHJvdG9jb2xgXG5cbiAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSBAIHRoaXMsIEA6XG4gICAgICBfY29kZWM6IEA6IHZhbHVlOiBtc2dfY29kZWNcbiAgICAgIGN0eDogQDogdmFsdWU6IE9iamVjdC5hc3NpZ24gQCB7fSwgdGhpcy5jdHgsIC4uLmFyZ3NcblxuICBzdGF0aWMgd2l0aENvZGVjcyhtc2dDb2RlY3MpIDo6XG4gICAgZm9yIGNvbnN0IFtuYW1lLCBtc2dfY29kZWNdIG9mIE9iamVjdC5lbnRyaWVzIEAgbXNnQ29kZWNzIDo6XG4gICAgICB0aGlzLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkgOjpcbiAgICAgICAgcmV0dXJuIHRoaXMuY29kZWMgQCBtc2dfY29kZWNcbiAgICB0aGlzLnByb3RvdHlwZS5fbXNnQ29kZWNzID0gbXNnQ29kZWNzXG4gICAgdGhpcy5wcm90b3R5cGUuX2NvZGVjID0gbXNnQ29kZWNzLmRlZmF1bHRcbiAgICByZXR1cm4gdGhpc1xuXG5PYmplY3QuYXNzaWduIEAgTXNnQ3R4LnByb3RvdHlwZSwgQHt9XG4gIG1zX3RpbWVvdXQ6IDUwMDBcblxuIiwiaW1wb3J0IGluaXRfcHJvdG9jb2wgZnJvbSAnLi9wcm90b2NvbC9pbmRleC5qc3knXG5pbXBvcnQgRW5kcG9pbnRCYXNlIGZyb20gJy4vZW5kcG9pbnQuanN5J1xuaW1wb3J0IFNpbmtCYXNlIGZyb20gJy4vc2luay5qc3knXG5pbXBvcnQgTXNnQ3R4QmFzZSBmcm9tICcuL21zZ2N0eC5qc3knXG5cbmNvbnN0IGRlZmF1bHRfcGx1Z2luX29wdGlvbnMgPSBAOlxuICBvbl9lcnJvcjogY29uc29sZS5lcnJvclxuICBzdWJjbGFzcyh7U2luaywgRW5kcG9pbnQsIFNvdXJjZUVuZHBvaW50LCBwcm90b2NvbHN9KSA6OlxuXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHBsdWdpbl9vcHRpb25zKSA6OlxuICBwbHVnaW5fb3B0aW9ucyA9IE9iamVjdC5hc3NpZ24gQCB7fSwgZGVmYXVsdF9wbHVnaW5fb3B0aW9ucywgcGx1Z2luX29wdGlvbnNcbiAgY29uc3QgQHt9XG4gICAgcmFuZG9tX2lkLCBqc29uX3Jldml2ZXIsIGpzb25fcmVwbGFjZXJcbiAgICBvbl9lcnJvcjogZGVmYXVsdF9vbl9lcnJvclxuICA9IHBsdWdpbl9vcHRpb25zXG5cbiAgcmV0dXJuIEA6IG9yZGVyOiAxLCBzdWJjbGFzcywgcG9zdFxuICBcbiAgZnVuY3Rpb24gc3ViY2xhc3MoRmFicmljSHViX1BJLCBiYXNlcykgOjpcbiAgICBjb25zdCB7cGFja2V0UGFyc2VyfSA9IEZhYnJpY0h1Yl9QSS5wcm90b3R5cGVcbiAgICBpZiBudWxsPT1wYWNrZXRQYXJzZXIgfHwgISBwYWNrZXRQYXJzZXIuaXNQYWNrZXRQYXJzZXIoKSA6OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvciBAIGBJbnZhbGlkIHBhY2tldFBhcnNlciBmb3IgcGx1Z2luYFxuICAgIFxuICAgIEZhYnJpY0h1Yl9QSS5wcm90b3R5cGUuZW5kcG9pbnQgPVxuICAgICAgYmluZEVuZHBvaW50QXBpIEAgcGFja2V0UGFyc2VyXG5cbiAgZnVuY3Rpb24gcG9zdChodWIpIDo6XG4gICAgcmV0dXJuIGh1Yi5lbmRwb2ludCA9IGh1Yi5lbmRwb2ludChodWIpXG5cbiAgZnVuY3Rpb24gYmluZEVuZHBvaW50QXBpKHBhY2tldFBhcnNlcikgOjpcbiAgICBjb25zdCBwcm90b2NvbHMgPSBpbml0X3Byb3RvY29sIEAgcGFja2V0UGFyc2VyLCBAe30gcmFuZG9tX2lkLCBqc29uX3Jldml2ZXIsIGpzb25fcmVwbGFjZXJcbiAgICBjb25zdCBTaW5rID0gU2lua0Jhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcbiAgICBjb25zdCBNc2dDdHggPSBNc2dDdHhCYXNlLmZvclByb3RvY29scyhwcm90b2NvbHMpXG4gICAgY29uc3QgRW5kcG9pbnQgPSBFbmRwb2ludEJhc2UuZm9yUHJvdG9jb2xzKHByb3RvY29scylcblxuICAgIHBsdWdpbl9vcHRpb25zLnN1YmNsYXNzIEA6XG4gICAgICBTaW5rLCBFbmRwb2ludCwgTXNnQ3R4LCBwcm90b2NvbHNcblxuICAgIHJldHVybiBmdW5jdGlvbihodWIpIDo6XG4gICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbiBAIGVuZHBvaW50LCBAOiBjcmVhdGU6IGVuZHBvaW50LCBzZXJ2ZXI6IGVuZHBvaW50LCBjbGllbnRcblxuICAgICAgZnVuY3Rpb24gY2xpZW50KC4uLmFyZ3MpIDo6XG4gICAgICAgIGNvbnN0IG1zZ19jdHggPSBNc2dDdHguZnJvbSBAIG51bGwsIGh1YlxuICAgICAgICByZXR1cm4gMCAhPT0gYXJncy5sZW5ndGhcbiAgICAgICAgICA/IG1zZ19jdHgud2l0aCguLi5hcmdzKSA6IG1zZ19jdHhcblxuICAgICAgZnVuY3Rpb24gZW5kcG9pbnQob25faW5pdCkgOjpcbiAgICAgICAgY29uc3QgaWRfdGFyZ2V0ID0gcmFuZG9tX2lkKClcbiAgICAgICAgY29uc3QgbXNnX2N0eCA9IE1zZ0N0eC5mcm9tIEAgaWRfdGFyZ2V0LCBodWJcbiAgICAgICAgY29uc3QgZXAgPSBuZXcgRW5kcG9pbnQobXNnX2N0eClcblxuICAgICAgICBjb25zdCB0YXJnZXQgPSBvbl9pbml0KGVwKVxuICAgICAgICBjb25zdCBvbl9tc2cgPSAodGFyZ2V0Lm9uX21zZyB8fCB0YXJnZXQpLmJpbmQodGFyZ2V0KVxuICAgICAgICBjb25zdCBvbl9lcnJvciA9ICh0YXJnZXQub25fZXJyb3IgfHwgZGVmYXVsdF9vbl9lcnJvcikuYmluZCh0YXJnZXQpXG5cbiAgICAgICAgU2luay5yZWdpc3RlciBAIGVwLCBAe31cbiAgICAgICAgICBodWIsIGlkX3RhcmdldCwgb25fbXNnLCBvbl9lcnJvclxuXG4gICAgICAgIGlmIHRhcmdldC5vbl9yZWFkeSA6OlxuICAgICAgICAgIFByb21pc2UucmVzb2x2ZSh0YXJnZXQpLnRoZW4gQFxuICAgICAgICAgICAgdGFyZ2V0ID0+IHRhcmdldC5vbl9yZWFkeSgpXG5cbiAgICAgICAgcmV0dXJuIE9iamVjdC5jcmVhdGUgQCBlbmRwb2ludF90YXJnZXRfYXBpLCBAOlxuICAgICAgICAgIGlkX3JvdXRlcjogQHt9IGVudW1lcmFibGU6IHRydWUsIHZhbHVlOiBodWIucm91dGVyLmlkX3NlbGZcbiAgICAgICAgICBpZF90YXJnZXQ6IEB7fSBlbnVtZXJhYmxlOiB0cnVlLCB2YWx1ZTogaWRfdGFyZ2V0XG5cbmNvbnN0IGVuZHBvaW50X3RhcmdldF9hcGkgPSBAOlxuICB2YWx1ZU9mKCkgOjogcmV0dXJuIDAgfCB0aGlzLmlkX3RhcmdldFxuICBpbnNwZWN0KCkgOjogcmV0dXJuIGDCq0VuZHBvaW50IFRhcmdldCAke3RoaXMuaWRfdGFyZ2V0fcK7YFxuXG4iLCJpbXBvcnQgZW5kcG9pbnRfcGx1Z2luIGZyb20gJy4vcGx1Z2luLmpzeSdcblxuY29uc3QgZ2V0UmFuZG9tVmFsdWVzID0gJ3VuZGVmaW5lZCcgIT09IHR5cGVvZiB3aW5kb3dcbiAgPyB3aW5kb3cuY3J5cHRvLmdldFJhbmRvbVZhbHVlcyA6IG51bGxcblxuZW5kcG9pbnRfYnJvd3Nlci5yYW5kb21faWQgPSByYW5kb21faWRcbmZ1bmN0aW9uIHJhbmRvbV9pZCgpIDo6XG4gIGNvbnN0IGFyciA9IG5ldyBJbnQzMkFycmF5KDEpXG4gIGdldFJhbmRvbVZhbHVlcyhhcnIpXG4gIHJldHVybiBhcnJbMF1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gZW5kcG9pbnRfYnJvd3NlcihwbHVnaW5fb3B0aW9ucz17fSkgOjpcbiAgaWYgbnVsbCA9PSBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgOjpcbiAgICBwbHVnaW5fb3B0aW9ucy5yYW5kb21faWQgPSByYW5kb21faWRcblxuICByZXR1cm4gZW5kcG9pbnRfcGx1Z2luKHBsdWdpbl9vcHRpb25zKVxuXG4iXSwibmFtZXMiOlsibGl0dGxlX2VuZGlhbiIsImNfc2luZ2xlIiwiY19kYXRhZ3JhbSIsImNfZGlyZWN0IiwiY19tdWx0aXBhcnQiLCJjX3N0cmVhbWluZyIsIl9lcnJfbXNnaWRfcmVxdWlyZWQiLCJfZXJyX3Rva2VuX3JlcXVpcmVkIiwiZnJtX3JvdXRpbmciLCJzaXplIiwiYml0cyIsIm1hc2siLCJvYmoiLCJmcm9tX2lkIiwiZHYiLCJvZmZzZXQiLCJzZXRJbnQzMiIsImlkX3JvdXRlciIsImlkX3RhcmdldCIsInVuZGVmaW5lZCIsImdldEludDMyIiwiZnJtX3Jlc3BvbnNlIiwibXNnaWQiLCJFcnJvciIsInNldEludDE2Iiwic2VxX2FjayIsImFja19mbGFncyIsInRva2VuIiwiZ2V0SW50MTYiLCJmcm1fZGF0YWdyYW0iLCJ0cmFuc3BvcnQiLCJmcm1fZGlyZWN0IiwiZnJtX211bHRpcGFydCIsInNlcV9wb3MiLCJzZXEiLCJzZXFfZmxhZ3MiLCJmcm1fc3RyZWFtaW5nIiwiYmluZF9zZXFfbmV4dCIsInNlcV9vZmZzZXQiLCJzZXFfbmV4dCIsImZsYWdzIiwiZmluIiwiTmFOIiwiY29tcG9zZUZyYW1pbmdzIiwiZnJtX2Zyb20iLCJmcm1fcmVzcCIsImZybV90cmFuc3BvcnRzIiwibGVuZ3RoIiwiYnlCaXRzIiwidF9mcm9tIiwiZl90ZXN0IiwidF9yZXNwIiwidDAiLCJ0MSIsInQyIiwidDMiLCJtYXAiLCJmIiwidGVzdEJpdHMiLCJjaG9vc2UiLCJsc3QiLCJUIiwiYiIsIm9wIiwiZm5fa2V5IiwiZm5fdHJhbiIsImZuX2Zyb20iLCJmbl9yZXNwIiwiZnJtIiwiYmluZEFzc2VtYmxlZCIsImZfcGFjayIsImZfdW5wYWNrIiwicGFjayIsInVucGFjayIsInBrdF90eXBlIiwicGt0X29iaiIsIlR5cGVFcnJvciIsInR5cGUiLCJEYXRhVmlldyIsIkFycmF5QnVmZmVyIiwiaGVhZGVyIiwiYnVmZmVyIiwic2xpY2UiLCJwa3QiLCJidWYiLCJoZWFkZXJfYnVmZmVyIiwiVWludDhBcnJheSIsImluZm8iLCJfYmluZF9pdGVyYWJsZSIsImJ1Zl9jbG9uZSIsInR0bCIsIm5leHQiLCJvcHRpb25zIiwiZG9uZSIsInZhbHVlIiwicGFja2V0UGFyc2VyIiwiZnJhZ21lbnRfc2l6ZSIsImNvbmNhdEJ1ZmZlcnMiLCJwYWNrUGFja2V0T2JqIiwicGFja191dGY4IiwidW5wYWNrX3V0ZjgiLCJOdW1iZXIiLCJyYW5kb21faWQiLCJqc29uX3Jldml2ZXIiLCJqc29uX3JlcGxhY2VyIiwianNvbl9wYXJzZSIsImpzb25fc3RyaW5naWZ5IiwiY3JlYXRlU3RyZWFtIiwicGFja2V0RnJhZ21lbnRzIiwidGV4dCIsIkpTT04iLCJwYXJzZSIsInN0cmluZ2lmeSIsImNyZWF0ZU11bHRpcGFydCIsInNpbmsiLCJwYXJ0cyIsImZlZWQiLCJib2R5X2J1ZmZlciIsImluY2x1ZGVzIiwiZGVsZXRlU3RhdGVGb3IiLCJyZXMiLCJyZWN2RGF0YSIsInJzdHJlYW0iLCJzdGF0ZSIsImZlZWRfaW5pdCIsImFzX2NvbnRlbnQiLCJmZWVkX2lnbm9yZSIsIm1zZyIsImJvZHlfdXRmOCIsInJlY3ZTdHJlYW0iLCJyZWN2U3RyZWFtRGF0YSIsImJpbmQiLCJlcnIiLCJvbl9lcnJvciIsImZlZWRfYm9keSIsIm9uX2luaXQiLCJkYXRhIiwib25fZGF0YSIsIm9uX2VuZCIsImZlZWRfc2VxIiwibmV4dF9oZHIiLCJpIiwibGFzdElubmVyIiwiYnl0ZUxlbmd0aCIsImkwIiwiYm9keSIsImJpbmRUcmFuc3BvcnRJbXBscyIsImluYm91bmQiLCJoaWdoYml0cyIsInRyYW5zcG9ydHMiLCJvdXRib3VuZCIsImZyYW1pbmdzIiwiZnJhbWUiLCJpbXBsIiwidF9yZWN2IiwicGFja19oZHIiLCJyZWN2X21zZyIsImJpbmRUcmFuc3BvcnRzIiwicGFja0JvZHkiLCJzdHJlYW1pbmciLCJzZW5kIiwic3RyZWFtIiwiYmluZF9zdHJlYW0iLCJtb2RlIiwiY2hhbiIsIm1zZW5kIiwibXNlbmRfYnl0ZXMiLCJzZW50IiwibXNlbmRfb2JqZWN0cyIsIm1zZW5kX2ltcGwiLCJvYmplY3QiLCJieXRlcyIsIndyaXRlIiwiZW5kIiwiY2h1bmsiLCJjaGVja19mbnMiLCJrZXlzIiwia2V5IiwianNvbl9wcm90b2NvbCIsInNoYXJlZCIsImRhdGFncmFtIiwiZGlyZWN0IiwicmVjdk1zZyIsInN0YXRlRm9yIiwiYm9keV9idWYiLCJ1bnBhY2tCb2R5IiwiYmluYXJ5X3Byb3RvY29sIiwiYXNCdWZmZXIiLCJwa3RfYnVmZmVyIiwiY29udHJvbF9wcm90b2NvbCIsImhpZ2giLCJwaW5nX2ZyYW1lIiwicG9uZ19mcmFtZSIsInBvbmdfdHlwZSIsInJlY3ZfcG9uZyIsInBpbmdfdHlwZSIsInJlY3ZfcGluZyIsInBpbmciLCJ0czAiLCJEYXRlIiwicm91dGVyIiwiYm9keV9qc29uIiwicmVjdkN0cmwiLCJfc2VuZF9wb25nIiwicGt0X3BpbmciLCJyX2lkIiwidHMxIiwiZGlzcGF0Y2giLCJpbml0X3Byb3RvY29sIiwic2hhcmVkX3Byb3RvIiwianNvbiIsImpzb25fcHJvdG8iLCJiaW5hcnkiLCJiaW5hcnlfcHJvdG8iLCJjb250cm9sIiwiY29udHJvbF9wcm90byIsImNvZGVjcyIsImRlZmF1bHQiLCJFbmRwb2ludCIsImZvclByb3RvY29scyIsIm1zZ19jdHgiLCJ3aXRoRW5kcG9pbnQiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiZW51bWVyYWJsZSIsInRvIiwiTWFwIiwiY3JlYXRlTWFwIiwiYnlfdG9rZW4iLCJjcmVhdGVSZXBseU1hcCIsImJ5X3RyYWZmaWMiLCJjcmVhdGVUcmFmZmljTWFwIiwidHJhZmZpYyIsInRzIiwibm93IiwidCIsImdldCIsInJlY3ZUcmFmZmljIiwiY3JlYXRlU3RhdGVNYXAiLCJybXNnIiwicmVwbHkiLCJyZXNvbHZlIiwidGhlbiIsIndhcm4iLCJpbml0UmVwbHkiLCJraW5kIiwiaW5pdFJlcGx5UHJvbWlzZSIsIm1zX3RpbWVvdXQiLCJtb25pdG9yIiwic2V0IiwiYW5zIiwiUHJvbWlzZSIsInJlamVjdCIsInRpZCIsInNldFRpbWVvdXQiLCJ0aW1lb3V0IiwidW5yZWYiLCJSZXBseVRpbWVvdXQiLCJPYmplY3QiLCJhc3NpZ24iLCJwcm90b3R5cGUiLCJTaW5rIiwiX3Byb3RvY29sIiwicmVnaXN0ZXIiLCJlbmRwb2ludCIsImt3X2FyZ3MiLCJodWIiLCJvbl9tc2ciLCJ1bnJlZ2lzdGVyIiwidW5yZWdpc3RlclRhcmdldCIsInJlZ2lzdGVyVGFyZ2V0IiwiX2JpbmREaXNwYXRjaCIsImFsaXZlIiwicHJvdG9jb2wiLCJpc0FsaXZlIiwic2h1dGRvd24iLCJlcnJvciIsImJpbmRTaW5rIiwiaWZBYnNlbnQiLCJlbnRyeSIsImJ5X21zZ2lkIiwiZGVsZXRlIiwiTXNnQ3R4Iiwid2l0aENvZGVjcyIsInJlc29sdmVSb3V0ZSIsImZyZWV6ZSIsImN0eCIsImZyb20iLCJpZF9zZWxmIiwiYmluZFJvdXRlRGlzcGF0Y2giLCJhcmdzIiwiY2xvbmUiLCJ3aXRoIiwiY29kZWMiLCJpbnZva2UiLCJhc3NlcnRNb25pdG9yIiwiX2NvZGVjIiwidGd0IiwicmVwbHlfaWQiLCJjcmVhdGUiLCJfcm9vdF8iLCJjaGVja01vbml0b3IiLCJhY3RpdmUiLCJpbml0TW9uaXRvciIsInRzX2R1cmF0aW9uIiwidHNfYWN0aXZlIiwicHJvbWlzZSIsInRkIiwidHNfaW50ZXJ2YWwiLCJjdHJsIiwiY2hlY2tQaW5nIiwic2V0SW50ZXJ2YWwiLCJjbGVhciIsImNsZWFySW50ZXJ2YWwiLCJtc2dfY29kZWMiLCJfbXNnQ29kZWNzIiwibXNnQ29kZWNzIiwibmFtZSIsImVudHJpZXMiLCJkZWZhdWx0X3BsdWdpbl9vcHRpb25zIiwiY29uc29sZSIsIlNvdXJjZUVuZHBvaW50IiwicHJvdG9jb2xzIiwicGx1Z2luX29wdGlvbnMiLCJkZWZhdWx0X29uX2Vycm9yIiwib3JkZXIiLCJzdWJjbGFzcyIsInBvc3QiLCJGYWJyaWNIdWJfUEkiLCJiYXNlcyIsImlzUGFja2V0UGFyc2VyIiwiYmluZEVuZHBvaW50QXBpIiwiU2lua0Jhc2UiLCJNc2dDdHhCYXNlIiwiRW5kcG9pbnRCYXNlIiwic2VydmVyIiwiY2xpZW50IiwiZXAiLCJ0YXJnZXQiLCJvbl9yZWFkeSIsImVuZHBvaW50X3RhcmdldF9hcGkiLCJnZXRSYW5kb21WYWx1ZXMiLCJ3aW5kb3ciLCJjcnlwdG8iLCJlbmRwb2ludF9icm93c2VyIiwiYXJyIiwiSW50MzJBcnJheSIsImVuZHBvaW50X3BsdWdpbiJdLCJtYXBwaW5ncyI6IkFBQUEsTUFBTUEsZ0JBQWdCLElBQXRCO0FBQ0EsTUFBTUMsV0FBVyxRQUFqQjtBQUNBLE1BQU1DLGFBQWEsVUFBbkI7QUFDQSxNQUFNQyxXQUFXLFFBQWpCO0FBQ0EsTUFBTUMsY0FBYyxXQUFwQjtBQUNBLE1BQU1DLGNBQWMsV0FBcEI7O0FBRUEsTUFBTUMsc0JBQXVCLDBCQUE3QjtBQUNBLE1BQU1DLHNCQUF1QiwyQkFBN0I7O0FBR0EsU0FBU0MsV0FBVCxHQUF1QjtRQUNmQyxPQUFPLENBQWI7UUFBZ0JDLE9BQU8sR0FBdkI7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

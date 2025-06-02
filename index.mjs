"use strict";
import tls from 'tls';
import WebSocket from 'ws';
import extractJsonFromString from 'extract-json-from-string';
import http2 from 'http2';
let newRestartInterval;
const token = ""; //token
const password = ""; // pass
const guildId = ""; // sw id
const listener = ''; // token
const guilds = {};
let mfaToken = null;
function restartConnections() {
  console.log('reset websocket');
  if (tlsSocket && !tlsSocket.destroyed) {
    clearInterval(tlsHeartbeatInterval);
    tlsSocket.destroy();
  }
  process.exit(0);
}
const session = http2.connect('https://canary.discord.com', {
  maxSessionMemory: 4096000,
  maxDeflateDynamicTableSize: 32768,
  maxHeaderListPairs: 1024,
  maxOutstandingPings: 100,
  peerMaxConcurrentStreams: 4000,
  enablePush: false,
  settings: {
    maxConcurrentStreams: 4000,
    initialWindowSize: 1024 * 1024 * 50,
    maxFrameSize: 16777215,
    maxHeaderListSize: 1048576,
    headerTableSize: 131072,
    enablePush: false
  }
});
const ENDPOINTS = [
  { domain: "discord.com", apiVersion: "v10" },
  { domain: "canary.discord.com", apiVersion: "v9" }
];
const sessions = new Map();
ENDPOINTS.forEach(endpoint => {
  sessions.set(endpoint.domain, http2.connect(`https://${endpoint.domain}`, {
    maxSessionMemory: 16384000, 
    settings: {
      maxConcurrentStreams: 8000,
      initialWindowSize: 1024 * 1024 * 100,
      maxFrameSize: 16777215,
      enablePush: true
    },
  }));
});
const baseHeaders = {
  "Content-Type": "application/json",
  "Authorization": token,
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  "X-Super-Properties": "eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiIiwic3lzdGVtX2xvY2FsZSI6InRyLVRSIiwiY2xpZW50X21vZHMiOmZhbHNlLCJicm93c2VyX3VzZXJfYWdlbnQiOiJNb3ppbGxhLzUuMCAoV2luZG93cyBOVCAxMC4wOyBXaW42NDsgeDY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvMTMyLjAuMC4wIFNhZmFyaS81MzcuMzYiLCJicm93c2VyX3ZlcnNpb24iOiIxMzIuMC4wLjAiLCJvc192ZXJzaW9uIjoiMTAifQ=="
};
const restartInterval = setInterval(restartConnections, 30 * 60 * 1000);
async function req(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const socket = tls.connect({
      host: 'canary.discord.com',
      port: 443,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3'
    }, () => {
      if (!socket.authorized) return reject();
      const headers = [
        `${method} ${path} HTTP/1.3`,
        'Host: canary.discord.com',
        'Connection: close',
        'Content-Type: application/json',
        `Content-Length: ${Buffer.byteLength(data)}`,
        `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0)`,
        `Authorization: ${token}`,
        `X-Super-Properties: eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiRmlyZWZveCIsImRldmljZSI6IiIsInN5c3RlbV9sb2NhbGUiOiJ0ci1UUiIsImJyb3dzZXJfdXNlcl9hZ2VudCI6Ik1vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQ7IHJ2OjEzMy4wKSBHZWNrby8yMDEwMDEwMSBGaXJlZm94LzEzMy4wIiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTMzLjAiLCJvc192ZXJzaW9uIjoiMTAiLCJyZWZlcnJlciI6Imh0dHBzOi8vd3d3Lmdvb2dsZS5jb20vIiwicmVmZXJyaW5nX2RvbWFpbiI6Ind3dy5nb29nbGUuY29tIiwic2VhcmNoX2VuZ2luZSI6Imdvb2dsZSIsInJlZmVycmVyX2N1cnJlbnQiOiIiLCJyZWZlcnJpbmdfZG9tYWluX2N1cnJlbnQiOiIiLCJyZWxlYXNlX2NoYW5uZWwiOiJjYW5hcnkiLCJjbGllbnRfYnVpbGRfbnVtYmVyIjozNTYxNDAsImNsaWVudF9ldmVudF9zb3VyY2UiOm51bGwsImhhc19jbGllbnRfbW9kcyI6ZmFsc2V9`
      ];
      if (extraHeaders['X-Discord-MFA-Authorization']) {
        headers.push(`X-Discord-MFA-Authorization: ${extraHeaders['X-Discord-MFA-Authorization']}`);
      }
      headers.push('', data);
      socket.write(headers.join('\r\n'));
      let output = '';
      socket.on('data', chunk => output += chunk.toString());
      socket.on('end', () => {
        try {
          const i = output.indexOf('\r\n\r\n');
          if (i === -1) {
            resolve('{}');
            return;
          }
          
          let b = output.slice(i + 4);
          if (output.toLowerCase().includes('transfer-encoding: chunked')) {
            let r = '', o = 0;
            while (o < b.length) {
              const s = b.indexOf('\r\n', o);
              if (s === -1) break;
              const c = parseInt(b.substring(o, s), 16);
              if (c === 0) break;
              r += b.substring(s + 2, s + 2 + c);
              o = s + 2 + c + 2;
            }
            resolve(r || '{}');
          } else {
            resolve(b || '{}');
          }
        } catch {
          resolve('{}');
        } finally {
          socket.destroy();
        }
      });
    });
    
    socket.setTimeout(5000, () => {
      reject();
      socket.destroy();
    });
    socket.on('error', reject);
  });
}

function http2req(code, count = 1) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({ code });
    const bodyBuffer = Buffer.from(requestBody);
    const contentLength = bodyBuffer.length;
    const endpoint = ENDPOINTS[0];
    const { domain, apiVersion } = endpoint;
    const currentSession = sessions.get(domain) || session;
    const headers = {
      ":authority": domain,
      ":scheme": "https",
      ":method": "PATCH",
      ":path": `/api/${apiVersion}/guilds/${guildId}/vanity-url`,
      "Content-Length": contentLength,
      "Cookie": `__Secure-recent_mfa=${mfaToken}`,
      ...baseHeaders
    };
    const req = currentSession.request(headers);
    let responseData = '';
    req.on('response', (headers) => {
      req.on('data', (chunk) => {
        responseData += chunk.toString();
      });
      req.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          if (response.code === code) {
          }
          resolve(responseData);
        } catch (e) {
          console.error('Error parsing HTTP2 response:', e);
          resolve('{}');
        }
      });
    });
    req.on('error', (err) => {
      console.error('HTTP2 request error:', err);
      reject(err);
    });
    req.write(bodyBuffer);
    req.end();
    if (count > 1) {
      for (let i = 1; i < count; i++) {
        const additionalReq = currentSession.request(headers);
        additionalReq.write(bodyBuffer);
        additionalReq.end();
      }
    }
  });
}

async function mfaAuth() {
  try {
    const response = await req("PATCH", `/api/v7/guilds/${guildId}/vanity-url`);
    let data;
    try {
      data = JSON.parse(response);
    } catch {
      return null;
    }
    if (data.code === 60003 || (data.mfa && data.mfa.ticket)) {
      const ticket = data.mfa ? data.mfa.ticket : data.ticket;
      if (!ticket) return null;
      const authResponse = await req('POST', '/api/v10/mfa/finish', {
        ticket: ticket,
        mfa_type: "password",
        data: password
      });
      try {
        const mfaData = JSON.parse(authResponse);
        if (mfaData.token) {
          console.log(`MFA: ${mfaData.token}`);
          return mfaData.token;
        }
      } catch {}
    }
  } catch {}
  return null;
}
const tlsSocket = tls.connect({
  host: 'canary.discord.com',
  port: 443,
  rejectUnauthorized: true,
  secureContext: tls.createSecureContext({
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.2'
  }),
});
tlsSocket.setKeepAlive(true, 15000);
tlsSocket.setTimeout(0);
let isHeartbeatResponse = false;
const tlsHeartbeatInterval = setInterval(() => {
  if (tlsSocket.writable) {
    try {
      isHeartbeatResponse = true;
      tlsSocket.write("HEAD /api/v9/users/@me HTTP/1.1\r\nHost: canary.discord.com\r\nAuthorization: " + token + "\r\nConnection: keep-alive\r\n\r\n");
      setTimeout(() => {
        isHeartbeatResponse = false;
      }, 1000);
    } catch (error) {
      isHeartbeatResponse = false;
    }
  }
}, 2457);
tlsSocket.on("data", async (data) => {
  if (isHeartbeatResponse) {
    return;
  }
  const ext = await extractJsonFromString(data.toString());
  const find = ext.find((e) => e.code) || ext.find((e) => e.message);
  console.log('TLS response:', find);
});
tlsSocket.on("error", (error) => {
  console.error('TLS socket error:', error);
  clearInterval(tlsHeartbeatInterval);
  clearInterval(newRestartInterval);
  return process.exit();
});
tlsSocket.on("end", (event) => {
  console.log('TLS socket ended');
  clearInterval(tlsHeartbeatInterval);
  clearInterval(newRestartInterval);
  return process.exit();
});
tlsSocket.on("secureConnect", () => {
  console.log('TLS socket connected securely');
  clearInterval(restartInterval);
  const gatewayWs = new WebSocket("wss://gateway.discord.gg", {
    perMessageDeflate: false,
      handshakeTimeout: 3000,
      followRedirects: true,
      maxPayload: 104857600,
      skipUTF8Validation: true, 
      skipPermessageDeflateCheck: true,
      maxReceivedMessageSize: 104857600,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
      }
    });
  const gatewayusWs = new WebSocket("wss://gateway-us-east1-b.discord.gg", {
    perMessageDeflate: false,
    handshakeTimeout: 5000,
    followRedirects: true,
    maxPayload: 104857600,
    skipUTF8Validation: true,
    skipPermessageDeflateCheck: true,
    maxReceivedMessageSize: 104857600
  });
  gatewayWs.onclose = (event) => {
    console.log('Gateway WebSocket closed');
    return process.exit();
  };
  gatewayusWs.onclose = (event) => {
    console.log('Gateway-PRD WebSocket closed');
  };
  gatewayWs.onmessage = async (message) => {
    const { d, op, t } = JSON.parse(message.data);
    if (t === "GUILD_UPDATE" || t === "GUILD_DELETE") {
      const find = guilds[d.guild_id || d.id];
      if (find && find !== d.vanity_url_code) {
        try {
          const http2Response = await http2req(find);
          const tlsResponse = await req("PATCH", `/api/v7/guilds/${guildId}/vanity-url`, 
            { code: find }, 
            { "X-Discord-MFA-Authorization": mfaToken });
          console.log(`TLS Response: ${find} ${tlsResponse}`);;
          console.log(`HTTP2 Response: ${find} ${http2Response}`);
        } catch (error) {
          console.error('Error sending vanity requests:', error);
        }
      }
    } else if (t === "READY") {
      d.guilds.forEach((guild) => {
        if (guild.vanity_url_code) {
          guilds[guild.id] = guild.vanity_url_code;
          console.log(`1=${guild.id} URL=${guild.vanity_url_code}`);
        }
      });
    }
    if (op === 10) {
      sendIdentify(gatewayWs);
      setInterval(() => gatewayWs.send(JSON.stringify({ op: 1, d: {}, s: null, t: "heartbeat" })), d.heartbeat_interval);
    } else if (op === 7) {
      return process.exit();
    }
  };
  gatewayusWs.onmessage = async (message) => {
    const { d, op, t } = JSON.parse(message.data);
    if (t === "GUILD_UPDATE" || t === "GUILD_DELETE") {
      const find = guilds[d.guild_id || d.id];
      if (find && find !== d.vanity_url_code) {
        try {
          const tlsResponse = await req("PATCH", `/api/v7/guilds/${guildId}/vanity-url`, 
                                        { code: find }, 
                                        { "X-Discord-MFA-Authorization": mfaToken });
          console.log(`PRD TLS Response: ${find} ${tlsResponse}`);;
        } catch (error) {
          console.error('Error sending PRD vanity requests:', error);
        }
      }
    } else if (t === "READY") {
      d.guilds.forEach((guild) => {
        if (guild.vanity_url_code) {
          guilds[guild.id] = guild.vanity_url_code;
          console.log(`2=${guild.id} URL=${guild.vanity_url_code}`);
        }
      });
    }
    if (op === 10) {
      sendIdentify(gatewayusWs);
      setInterval(() => gatewayusWs.send(JSON.stringify({ op: 1, d: {}, s: null, t: "heartbeat" })), d.heartbeat_interval);
    }
  };
  setInterval(() => {
    req("HEAD", "/").catch(() => {});
  }, 125);
  setInterval(() => {
    ENDPOINTS.forEach(endpoint => {
      const { domain } = endpoint;
      const currentSession = sessions.get(domain) || session;
      if (currentSession && !currentSession.destroyed) {
        const pingReq = currentSession.request({
          ':authority': domain,
          ':scheme': 'https',
          ':method': 'GET',
          ':path': '/'
        });
        pingReq.on('error', (err) => {
          console.error(`Heartbeat error for ${domain}:`, err.message);
        });
        pingReq.end();
      }
    });
  }, 250);
  function sendIdentify(ws) {
    ws.send(JSON.stringify({
      op: 2,
      d: {
        token: listener,
        intents: 1,
        properties: {
          os: "MacOs",
          browser: "firefox",
          device: "",
        },
      },
    }));
  }
  (async () => {
    mfaToken = await mfaAuth();
    setInterval(async () => {
      const newToken = await mfaAuth();
      if (newToken) mfaToken = newToken;
    }, 240 * 1000);
  })();
});

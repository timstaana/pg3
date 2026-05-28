// server.js
const express = require('express');
const { WebSocketServer } = require('ws');
const os   = require('os');
const fs   = require('fs');
const path = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('.'));
app.get('/health', (_, res) => res.status(200).send('OK'));

function getLocalIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return 'localhost';
}

const server = app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`Server :${PORT}  ws://${ip}:${PORT}`);
});

const wss = new WebSocketServer({ server, perMessageDeflate: false });

// Single global player pool — no rooms, everyone shares one world.
const players = new Map(); // id → { ws, state }

// ── Server-side NPC simulation ────────────────────────────────────────────
const SRV_NPC_RADIUS     = 0.25;
const SRV_NPC_WALK_SPEED = 3.8;
const SRV_NPC_FLEE_SPEED = 5.8;
const SRV_NPC_FOL_SPEED  = 4.2;
const SRV_NPC_TURN_RATE  = 180;
const SRV_GRAVITY        = 30;
const SRV_DEATH_Y        = -10;
const SRV_MIN_GROUND_NY  = Math.cos(50 * Math.PI / 180); // ~0.643 — matches client

const _npcs = [
  { x:  4, y: 2, z: -3, vy: 0, grounded: false, yaw:   0, behavior: 'wander', behaviorTimer: 2, wanderTarget: null, wanderArrived: true, jumpPhase: 0,         edgeCooldown: 0, jumpCooldown: 0, frame: 0, frameTime: 0 },
  { x: -5, y: 2, z:  1, vy: 0, grounded: false, yaw:  90, behavior: 'wander', behaviorTimer: 3, wanderTarget: null, wanderArrived: true, jumpPhase: Math.PI/2, edgeCooldown: 0, jumpCooldown: 0, frame: 0, frameTime: 0 },
  { x:  2, y: 2, z:  5, vy: 0, grounded: false, yaw: 180, behavior: 'wander', behaviorTimer: 1, wanderTarget: null, wanderArrived: true, jumpPhase: Math.PI,   edgeCooldown: 0, jumpCooldown: 0, frame: 0, frameTime: 0 },
];

// ── World geometry for NPC ground queries ─────────────────────────────────
// Mirrors LEVEL_MODELS in main.js — keep in sync if models change.
const _worldTris = (() => {
  const models = [
    { src: 'assets/world.obj', pos: [0,0,0], rot: [0,0,0], scale: 1 },
  ];
  const tris = [];
  for (const def of models) {
    let text;
    try { text = fs.readFileSync(path.join(__dirname, def.src), 'utf8'); }
    catch { console.warn(`[npc] geometry not found: ${def.src}`); continue; }

    // Parse OBJ (vertices + triangulated faces)
    const verts = [], faces = [];
    for (const raw of text.split('\n')) {
      const p = raw.trim().split(/\s+/);
      if (p[0] === 'v')  { verts.push([+p[1], +p[2], +p[3]]); }
      else if (p[0] === 'f') {
        const idx = p.slice(1).map(s => parseInt(s) - 1);
        for (let i = 1; i < idx.length - 1; i++) faces.push([idx[0], idx[i], idx[i+1]]);
      }
    }

    // Build transform matrix from def (identity when pos/rot=[0,0,0], scale=1)
    const [px, py, pz] = def.pos;
    const yr = def.rot[1]*Math.PI/180, xr = def.rot[0]*Math.PI/180, zr = def.rot[2]*Math.PI/180;
    const cy=Math.cos(yr),sy=Math.sin(yr),cp=Math.cos(xr),sp=Math.sin(xr),cr=Math.cos(zr),sr=Math.sin(zr);
    const m = [ cy*cr+sy*sp*sr, sr*cp, -sy*cr+cy*sp*sr,
               -cy*sr+sy*sp*cr, cr*cp,  sy*sr+cy*sp*cr,
                sy*cp,         -sp,     cy*cp ];
    const s = def.scale;
    const xf = ([vx,vy,vz]) => [
      m[0]*vx*s + m[1]*vy*s + m[2]*vz*s + px,
      m[3]*vx*s + m[4]*vy*s + m[5]*vz*s + py,
      m[6]*vx*s + m[7]*vy*s + m[8]*vz*s + pz,
    ];

    for (const [i0,i1,i2] of faces) {
      const [ax,ay,az]=xf(verts[i0]), [bx,by,bz]=xf(verts[i1]), [cx,cy2,cz]=xf(verts[i2]);
      const e1x=bx-ax,e1y=by-ay,e1z=bz-az, e2x=cx-ax,e2y=cy2-ay,e2z=cz-az;
      let nx=e1y*e2z-e1z*e2y, ny=e1z*e2x-e1x*e2z, nz=e1x*e2y-e1y*e2x;
      const nl=Math.hypot(nx,ny,nz); if (nl<1e-10) continue;
      nx/=nl; ny/=nl; nz/=nl;
      if (Math.abs(ny)>=SRV_MIN_GROUND_NY && ny<0) { nx=-nx; ny=-ny; nz=-nz; }
      tris.push({
        ax,ay,az, bx,by,bz, cx,cy:cy2,cz, nx,ny,nz,
        minX:Math.min(ax,bx,cx), maxX:Math.max(ax,bx,cx),
        minY:Math.min(ay,by,cy2), maxY:Math.max(ay,by,cy2),
        minZ:Math.min(az,bz,cz), maxZ:Math.max(az,bz,cz),
      });
    }
  }
  console.log(`[npc] ${tris.length} collision tris loaded`);
  return tris;
})();

// Vertical downward ray — returns highest ground-triangle y within maxDrop, or null.
const _rayGroundY = (x, z, fromY, maxDrop) => {
  let best = null;
  for (const t of _worldTris) {
    if (t.ny < SRV_MIN_GROUND_NY) continue;
    if (x < t.minX || x > t.maxX || z < t.minZ || z > t.maxZ) continue;
    if (t.maxY > fromY + 0.05) continue;
    const e1x=t.bx-t.ax, e1y=t.by-t.ay, e1z=t.bz-t.az;
    const e2x=t.cx-t.ax, e2y=t.cy-t.ay, e2z=t.cz-t.az;
    const det=e1z*e2x-e1x*e2z; if (Math.abs(det)<1e-8) continue;
    const f=1/det, sx=x-t.ax, sy=fromY-t.ay, sz=z-t.az;
    const u=f*(sz*e2x-sx*e2z); if (u<0||u>1) continue;
    const v=-f*(sz*e1x-sx*e1z); if (v<0||u+v>1) continue;
    const d=f*(e2x*(sy*e1z-sz*e1y)+e2y*(sz*e1x-sx*e1z)+e2z*(sx*e1y-sy*e1x));
    if (d<1e-4||d>maxDrop) continue;
    const hy=fromY-d; if (best===null||hy>best) best=hy;
  }
  return best;
};

// Returns true if there is ground within 1.8 units below a point 0.8 units ahead.
const _groundAhead = (x, y, z, nx, nz) =>
  _rayGroundY(x + nx*0.8, z + nz*0.8, y + 0.5, 2.3) !== null;

// ── Sphere-triangle collision (ported from collision.js, plain JS) ─────────

const _dSqToSeg = (px,py,pz, ax,ay,az, bx,by,bz) => {
  const abx=bx-ax,aby=by-ay,abz=bz-az, apx=px-ax,apy=py-ay,apz=pz-az;
  const ab2=abx*abx+aby*aby+abz*abz;
  const t=ab2<1e-10?0:Math.max(0,Math.min(1,(apx*abx+apy*aby+apz*abz)/ab2));
  const ex=apx-abx*t,ey=apy-aby*t,ez=apz-abz*t;
  return ex*ex+ey*ey+ez*ez;
};

const _closestPtOnTri = (px,py,pz, ax,ay,az, bx,by,bz, cx,cy,cz) => {
  const e1x=bx-ax,e1y=by-ay,e1z=bz-az, e2x=cx-ax,e2y=cy-ay,e2z=cz-az;
  const apx=px-ax,apy=py-ay,apz=pz-az;
  const d1=e1x*apx+e1y*apy+e1z*apz, d2=e2x*apx+e2y*apy+e2z*apz;
  if (d1<=0&&d2<=0) return [ax,ay,az];
  const bpx=px-bx,bpy=py-by,bpz=pz-bz;
  const d3=e1x*bpx+e1y*bpy+e1z*bpz, d4=e2x*bpx+e2y*bpy+e2z*bpz;
  if (d3>=0&&d4<=d3) return [bx,by,bz];
  const vc=d1*d4-d3*d2;
  if (vc<=0&&d1>=0&&d3<=0) { const v=d1/(d1-d3); return [ax+e1x*v,ay+e1y*v,az+e1z*v]; }
  const cpx=px-cx,cpy=py-cy,cpz=pz-cz;
  const d5=e1x*cpx+e1y*cpy+e1z*cpz, d6=e2x*cpx+e2y*cpy+e2z*cpz;
  if (d6>=0&&d5<=d6) return [cx,cy,cz];
  const vb=d5*d2-d1*d6;
  if (vb<=0&&d2>=0&&d6<=0) { const w=d2/(d2-d6); return [ax+e2x*w,ay+e2y*w,az+e2z*w]; }
  const va=d3*d6-d5*d4;
  if (va<=0&&(d4-d3)>=0&&(d5-d6)>=0) {
    const w=(d4-d3)/((d4-d3)+(d5-d6));
    return [bx+(cx-bx)*w,by+(cy-by)*w,bz+(cz-bz)*w];
  }
  const den=1/(va+vb+vc),v=vb*den,w=vc*den;
  return [ax+e1x*v+e2x*w, ay+e1y*v+e2y*w, az+e1z*v+e2z*w];
};

const _sphereVsTri = (px,py,pz, radius, tri) => {
  const [qx,qy,qz]=_closestPtOnTri(px,py,pz, tri.ax,tri.ay,tri.az, tri.bx,tri.by,tri.bz, tri.cx,tri.cy,tri.cz);
  const dx=px-qx,dy=py-qy,dz=pz-qz, dSq=dx*dx+dy*dy+dz*dz;
  if (dSq>=radius*radius) return null;
  const d=Math.sqrt(dSq);
  return d<1e-5
    ? {nx:tri.nx,ny:tri.ny,nz:tri.nz, depth:radius, px:qx,py:qy,pz:qz}
    : {nx:dx/d,  ny:dy/d,  nz:dz/d,   depth:radius-d, px:qx,py:qy,pz:qz};
};

const _queryTrisNear = (x,y,z,r) => {
  const ex=r+0.5;
  return _worldTris.filter(t =>
    t.maxX>=x-ex&&t.minX<=x+ex&&t.maxY>=y-2.0&&t.minY<=y+2.0&&t.maxZ>=z-ex&&t.minZ<=z+ex
  );
};

const _GROUNDING_TOL = 0.001;

// Full sphere-triangle resolution — mirrors CollisionSystem.js.
// Mutates pos (.x .y .z) and vel ({x,y,z}). Returns true when grounded.
// Returns { grounded, hitWall } — hitWall is true when horizontal motion was projected off a surface.
const _npcCollide = (pos, vel) => {
  const r=SRV_NPC_RADIUS, eSq=(r*0.3)**2;
  let grounded=false, hitWall=false;
  const cands=_queryTrisNear(pos.x,pos.y,pos.z,r);
  for (let iter=0;iter<3;iter++) {
    let bestGnd=null,bestGndY=-Infinity, bestEdge=null,bestEdgeY=-Infinity, hit=false;
    for (const tri of cands) {
      // Backface cull only walls — ground tris must catch the NPC from below too
      if (tri.ny < SRV_MIN_GROUND_NY) {
        const dx=pos.x-tri.ax,dy=pos.y-tri.ay,dz=pos.z-tri.az;
        if (dx*tri.nx+dy*tri.ny+dz*tri.nz<=0) continue;
      }
      const c=_sphereVsTri(pos.x,pos.y,pos.z, r+_GROUNDING_TOL, tri);
      if (!c) continue;
      if (c.depth>_GROUNDING_TOL) {
        hit=true;
        const d=c.depth-_GROUNDING_TOL;
        pos.x+=c.nx*d; pos.y+=c.ny*d; pos.z+=c.nz*d;
      }
      if (c.ny>=SRV_MIN_GROUND_NY) {
        const nv=(c.px-tri.ax)**2+(c.py-tri.ay)**2+(c.pz-tri.az)**2<eSq||
                 (c.px-tri.bx)**2+(c.py-tri.by)**2+(c.pz-tri.bz)**2<eSq||
                 (c.px-tri.cx)**2+(c.py-tri.cy)**2+(c.pz-tri.cz)**2<eSq;
        const ne=!nv&&(_dSqToSeg(c.px,c.py,c.pz,tri.ax,tri.ay,tri.az,tri.bx,tri.by,tri.bz)<eSq||
                        _dSqToSeg(c.px,c.py,c.pz,tri.bx,tri.by,tri.bz,tri.cx,tri.cy,tri.cz)<eSq||
                        _dSqToSeg(c.px,c.py,c.pz,tri.cx,tri.cy,tri.cz,tri.ax,tri.ay,tri.az)<eSq);
        if (!nv&&!ne){if(c.py>bestGndY){bestGnd=c;bestGndY=c.py;}}
        else         {if(c.py>bestEdgeY){bestEdge=c;bestEdgeY=c.py;}}
      } else {
        const dot=vel.x*c.nx+vel.y*c.ny+vel.z*c.nz;
        if (dot<0){vel.x-=c.nx*dot;vel.y-=c.ny*dot;vel.z-=c.nz*dot; hitWall=true;}
      }
    }
    const g=bestGnd||bestEdge;
    if (g) {
      grounded=true;
      const dot=vel.x*g.nx+vel.y*g.ny+vel.z*g.nz;
      if (dot<0){vel.x-=g.nx*dot;vel.y-=g.ny*dot;vel.z-=g.nz*dot;}
    }
    if (!hit) break;
  }
  return { grounded, hitWall };
};

const _npcYaw  = (dx, dz) => Math.atan2(-dx, dz) * 180 / Math.PI;
const _npcTurn = (npc, targetYaw, dt) => {
  let d = targetYaw - npc.yaw;
  while (d >  180) d -= 360;
  while (d < -180) d += 360;
  npc.yaw += Math.sign(d) * Math.min(Math.abs(d), SRV_NPC_TURN_RATE * dt);
};

const _npcTick = (dt) => {
  const pp = [];
  players.forEach(c => { if (c.state) pp.push(c.state); });

  for (let i = 0; i < _npcs.length; i++) {
    const npc = _npcs[i];

    npc.behaviorTimer -= dt;
    if (npc.behaviorTimer <= 0) {
      const pool = ['wander', 'wander', 'flee', 'follow', 'jumpy'];
      npc.behavior      = pool[Math.floor(Math.random() * pool.length)];
      npc.behaviorTimer = 5 + Math.random() * 9;
      npc.wanderArrived = true;
    }

    let nearPlayer = null, nearDist = Infinity;
    for (const p of pp) {
      const d = Math.hypot(npc.x - p.x, npc.z - p.z);
      if (d < nearDist) { nearDist = d; nearPlayer = p; }
    }
    if (nearDist < 4.0 && npc.behavior !== 'flee' && npc.behavior !== 'follow') {
      npc.behavior      = Math.random() < 0.65 ? 'flee' : 'follow';
      npc.behaviorTimer = 4 + Math.random() * 5;
    }

    let vx = 0, vz = 0;
    switch (npc.behavior) {
      case 'wander': {
        if (!npc.wanderTarget || npc.wanderArrived) {
          npc.wanderTarget  = { x: (Math.random()-0.5)*20, z: (Math.random()-0.5)*20 };
          npc.wanderArrived = false;
        }
        const dx = npc.wanderTarget.x - npc.x, dz = npc.wanderTarget.z - npc.z;
        const d  = Math.hypot(dx, dz);
        if (d < 1.0) { npc.wanderArrived = true; break; }
        _npcTurn(npc, _npcYaw(dx, dz), dt);
        const spd = SRV_NPC_WALK_SPEED * Math.min(d * 0.4, 1.0);
        const rad = npc.yaw * Math.PI / 180;
        vx = -Math.sin(rad) * spd; vz = Math.cos(rad) * spd;
        break;
      }
      case 'flee': {
        if (nearPlayer && Math.hypot(npc.x-nearPlayer.x, npc.z-nearPlayer.z) < 11) {
          _npcTurn(npc, _npcYaw(npc.x-nearPlayer.x, npc.z-nearPlayer.z), dt);
          const rad = npc.yaw * Math.PI / 180;
          vx = -Math.sin(rad) * SRV_NPC_FLEE_SPEED; vz = Math.cos(rad) * SRV_NPC_FLEE_SPEED;
        }
        break;
      }
      case 'follow': {
        if (nearPlayer) {
          const dx = nearPlayer.x-npc.x, dz = nearPlayer.z-npc.z, d = Math.hypot(dx, dz);
          if (d > 2.2) {
            _npcTurn(npc, _npcYaw(dx, dz), dt);
            const rad = npc.yaw * Math.PI / 180;
            const spd = Math.min(SRV_NPC_FOL_SPEED, d * 1.5);
            vx = -Math.sin(rad) * spd; vz = Math.cos(rad) * spd;
          }
        }
        break;
      }
      case 'jumpy': {
        npc.jumpPhase -= dt;
        if (npc.grounded && npc.jumpPhase <= 0) {
          npc.vy = Math.sqrt(2 * SRV_GRAVITY * 0.85); // launch ~0.85 u high
          npc.grounded = false;
          npc.jumpPhase = 0.4 + Math.random() * 0.5;
        }
        npc.yaw += (Math.random()-0.5) * 60 * dt;
        const rad = npc.yaw * Math.PI / 180;
        vx = -Math.sin(rad) * SRV_NPC_WALK_SPEED * 0.85;
        vz =  Math.cos(rad) * SRV_NPC_WALK_SPEED * 0.85;
        break;
      }
    }

    // Edge avoidance — geometry-aware, only while grounded
    npc.edgeCooldown = Math.max(0, npc.edgeCooldown - dt);
    const hSpd = Math.hypot(vx, vz);
    if (npc.grounded && npc.edgeCooldown <= 0 && hSpd > 0.1) {
      if (!_groundAhead(npc.x, npc.y, npc.z, vx/hSpd, vz/hSpd)) {
        npc.yaw += 150 + Math.random() * 60;
        npc.wanderArrived = true;
        vx = 0; vz = 0;
        npc.edgeCooldown = 0.4;
      }
    }

    // Sub-stepped gravity + collision (5 × 0.01 s → max 0.2 u/step < radius, prevents tunneling)
    const vel = { x: vx, y: npc.vy, z: vz };
    const sdt = dt / 5;
    let hitWall = false;
    for (let s = 0; s < 5; s++) {
      if (!npc.grounded) {
        vel.y -= SRV_GRAVITY * sdt;
        if (vel.y < -20) vel.y = -20;
      }
      npc.x += vel.x * sdt;
      npc.y += vel.y * sdt;
      npc.z += vel.z * sdt;
      const r = _npcCollide(npc, vel);
      npc.grounded = r.grounded;
      if (r.hitWall) hitWall = true;
    }
    npc.vy = vel.y;

    // Jump over obstacles — triggered when grounded, moving, and hitting a wall
    npc.jumpCooldown = Math.max(0, npc.jumpCooldown - dt);
    if (hitWall && npc.grounded && hSpd > 0.1 && npc.jumpCooldown <= 0 && npc.behavior !== 'jumpy') {
      npc.vy = Math.sqrt(2 * SRV_GRAVITY * 1.1); // ~8.1 m/s, clears ~1.1 u
      npc.grounded = false;
      npc.jumpCooldown = 0.6;
    }

    // Respawn after falling off
    if (npc.y < SRV_DEATH_Y) {
      npc.x = (Math.random()-0.5)*10; npc.z = (Math.random()-0.5)*10;
      npc.y = 3.0; npc.vy = 0; npc.grounded = false;
      npc.wanderArrived = true; npc.behavior = 'wander';
      npc.behaviorTimer = 2 + Math.random() * 3;
    }

    // NPC-to-NPC separation
    for (let j = 0; j < _npcs.length; j++) {
      if (i === j) continue;
      const o = _npcs[j];
      const dx = npc.x-o.x, dz = npc.z-o.z, distSq = dx*dx+dz*dz;
      const minD = SRV_NPC_RADIUS * 2;
      if (distSq < minD*minD && distSq > 0.0001) {
        const dist = Math.sqrt(distSq), ov = (minD-dist)*0.5;
        npc.x += (dx/dist)*ov; npc.z += (dz/dist)*ov;
      }
    }

    // Animation frame
    if (hSpd > 0.15) {
      const fps = 6 * Math.max(hSpd / SRV_NPC_WALK_SPEED, 0.4);
      npc.frameTime += dt;
      if (npc.frame === 0) npc.frame = 1;
      if (npc.frameTime >= 1/fps) { npc.frameTime -= 1/fps; npc.frame = npc.frame === 1 ? 2 : 1; }
    } else { npc.frame = 0; npc.frameTime = 0; }
  }
};

// ── Server tick: run NPC AI + broadcast world state every 50 ms ──────────
setInterval(() => {
  _npcTick(0.05);
  if (players.size === 0) return;

  const npcSnapshot = _npcs.map((n, i) => ({
    id: i, x: +n.x.toFixed(2), y: +n.y.toFixed(2), z: +n.z.toFixed(2),
    yaw: +n.yaw.toFixed(1), frame: n.frame,
  }));

  const playerSnapshot = {};
  players.forEach((c, id) => { if (c.state) playerSnapshot[id] = c.state; });

  const msg = JSON.stringify({ type: 'update', players: playerSnapshot, npcs: npcSnapshot });
  players.forEach(c => { if (c.ws.readyState === 1) c.ws.send(msg); });
}, 50);

// ── Connections ───────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  let playerId = null;

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      switch (msg.type) {

        case 'join': {
          playerId = msg.id;
          const state = { x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, skin: msg.skin };

          const welcome = {};
          players.forEach((c, id) => { if (id !== playerId && c.state) welcome[id] = c.state; });

          // Register (overwrites stale entry from quick-reconnect)
          players.set(playerId, { ws, state });

          const npcSnapshot = _npcs.map((n, i) => ({
            id: i, x: +n.x.toFixed(2), y: +n.y.toFixed(2), z: +n.z.toFixed(2),
            yaw: +n.yaw.toFixed(1), frame: n.frame,
          }));
          ws.send(JSON.stringify({ type: 'welcome', players: welcome, npcs: npcSnapshot }));
          broadcast({ type: 'join', id: playerId, ...state }, playerId);

          console.log(`+ ${playerId.slice(-8)} joined (${players.size} online)`);
          break;
        }

        case 'mv': {
          const c = players.get(playerId);
          if (c) c.state = { x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, skin: msg.skin };
          break;
        }

        case 'emote': {
          if (playerId) broadcast({ type: 'emote', wx: msg.wx, wy: msg.wy, wz: msg.wz, emoteId: msg.emoteId }, playerId);
          break;
        }
      }
    } catch (err) { console.error('msg err:', err.message); }
  });

  ws.on('close', () => {
    if (!playerId) return;
    const cur = players.get(playerId);
    if (!cur || cur.ws !== ws) return; // stale close after quick reconnect
    players.delete(playerId);
    broadcast({ type: 'leave', id: playerId });
    console.log(`- ${playerId.slice(-8)} left  (${players.size} online)`);
  });

  ws.on('error', () => {});
});

// Heartbeat: kill silent connections every 30 s
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

function broadcast(message, excludeId = null) {
  const data = JSON.stringify(message);
  players.forEach((c, id) => {
    if (id !== excludeId && c.ws.readyState === 1) {
      try { c.ws.send(data); } catch {}
    }
  });
}

process.on('SIGTERM', () => server.close(() => process.exit(0)));

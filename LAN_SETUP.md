# LAN (Local Network) Setup Guide

This guide explains how to play multiplayer on your local network (multiple PCs in your home/office).

## Quick Setup

### 1. Start the Server (Host PC)

On the PC that will host the game server:

```bash
cd /home/timmy/Documents/pg3
npm start
```

You'll see output like:
```
🚀 Server running on port 3000
   Local:   http://localhost:3000
   Network: http://192.168.8.217:3000
   WebSocket: ws://192.168.8.217:3000

💡 For LAN access, use: ws://192.168.8.217:3000 in config.json
```

**Copy the Network URL** (e.g., `http://192.168.8.217:3000`)

### 2. Enable Multiplayer

Edit `config.json` on **ALL PCs** (same config for everyone):

```json
{
  "multiplayer": {
    "enabled": true,
    "serverUrl": null,
    "room": null
  }
}
```

**Note**: `serverUrl` is `null` - it auto-detects from the browser URL!

### 3. Open the Game

- **Host PC**: Open `http://localhost:3000` in browser
- **Other PCs**: Open `http://192.168.8.217:3000` in browser (use host's IP)

The game will **automatically connect** to the correct server based on the URL you opened!

You should now see each other as billboards in the game!

## Troubleshooting

### "Can't connect to server" on other PCs

**Check firewall:**

```bash
# Allow port 3000 on host PC (Linux)
sudo ufw allow 3000/tcp

# Or use firewalld
sudo firewall-cmd --add-port=3000/tcp --permanent
sudo firewall-cmd --reload
```

**Test connection from other PC:**

```bash
# Replace with your host PC's IP
curl http://192.168.8.217:3000/health
```

Should return `OK` if server is accessible.

### "Players can't see each other"

1. Check both are in same room (check browser console logs)
2. Verify WebSocket connection:
   - Open DevTools (F12)
   - Go to Network tab → WS (WebSocket)
   - Should show active connection

### "Wrong IP address"

If the server shows the wrong IP (e.g., VPN IP), manually find your LAN IP:

**Linux:**
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
```

**Windows:**
```cmd
ipconfig
```
Look for "IPv4 Address" under your network adapter (usually `192.168.x.x` or `10.0.x.x`).

**macOS:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

## How Auto-Detection Works

The game automatically detects the server URL from the browser's address bar:

- Open `http://localhost:3000` → connects to `ws://localhost:3000`
- Open `http://192.168.8.217:3000` → connects to `ws://192.168.8.217:3000`
- Open `https://my-app.fly.dev` → connects to `wss://my-app.fly.dev`

**No manual configuration needed!** Just open the correct URL.

## Room System

By default, the room name is set to the **level name** (`gallery001`). This means:

- ✅ Players in the same level see each other
- ❌ Players in different levels don't see each other

To use a custom room name, edit `config.json`:

```json
{
  "multiplayer": {
    "enabled": true,
    "serverUrl": null,
    "room": "my-custom-room"
  }
}
```

## Manual Server URL (Optional)

If you need to override auto-detection (e.g., custom port), set `serverUrl`:

```json
{
  "multiplayer": {
    "enabled": true,
    "serverUrl": "ws://192.168.8.217:8080",
    "room": null
  }
}
```

## Performance Tips

### Wired Connection
- Use **Ethernet cables** instead of WiFi for best performance
- WiFi adds ~5-20ms latency

### Router Settings
- Enable **QoS** (Quality of Service) and prioritize gaming traffic
- Disable **bandwidth limiting** for game traffic

### Network Load
- Close bandwidth-heavy apps (downloads, streaming) while playing
- Each player uses ~6KB/s (very low, but consistent)

## Testing on Same PC

You can test multiplayer on a single PC:

1. Enable multiplayer in `config.json`
2. Start server: `npm start`
3. Open 2+ tabs to `http://localhost:3000`

Each tab will auto-connect and you'll see multiple instances of yourself!

## Security Note

The server binds to `0.0.0.0:3000`, making it accessible to your entire local network. This is safe on trusted networks (home/office) but **not recommended on public WiFi**.

For public networks, use:
- VPN to create private network
- SSH tunnel to host PC
- Deploy to fly.io and use internet connection

## Summary

1. **Host PC**: Run `npm start`, note the Network IP address
2. **All PCs**: Enable multiplayer in config (`"enabled": true`)
3. **Check firewall**: Allow port 3000 on host PC
4. **Host PC**: Open `http://localhost:3000`
5. **Other PCs**: Open `http://HOST_IP:3000` (use host's IP)

Server URL is **auto-detected** from the browser address - no manual configuration needed!

That's it! Enjoy playing together!

# omp-sbx Integration

## Running vchb from inside the Docker sandbox

The omp-sbx sandbox bind-mounts the workspace at the identical path, so path mapping is
identity (no `VCHB_PATH_MAP` needed).

### Networking

The bridge runs on the host's `127.0.0.1`. From inside the container:

1. The CLI auto-detects the container environment (`WORKSPACE_DIR` env or `/.dockerenv`)
2. It prefers the `dockerBridge` URL from the session file (default `host.docker.internal:<port>`)
3. It bypasses the HTTP proxy for bridge requests (adds the bridge host to `NO_PROXY`)

If `host.docker.internal` doesn't resolve correctly, configure the extension setting
`vchb.dockerBridgeHost` to a reachable host address (e.g. the host's LAN IP or
`gateway.docker.internal`).

### Manual override

```bash
# Explicitly set the bridge URL/token (bypasses session discovery)
export VCHB_BRIDGE_URL=http://host.docker.internal:47321
export VCHB_BRIDGE_TOKEN=<token from VS Code "VCHB: Copy env vars" command>

vchb sessions
vchb selection --json
```

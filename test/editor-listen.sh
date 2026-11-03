#!/usr/bin/env bash
# Where the all-in-one container's editor listens (ADR-0035), checked from a second container on a Docker network with
# IPv6: IPv4 and IPv6 by default; the user's own HOST and PORT (container variables or .env) go to Glance and leave
# the editor alone; IPv4 only when the container can't open IPv6 sockets (a seccomp profile stands in for a kernel
# without IPv6); and IPv4 keeps working with net.ipv6.bindv6only=1. Needs the image: set GLANCE_EDITOR_IMAGE.
source "$(dirname "$0")/lib.sh"
guard_docker_host
image="${GLANCE_EDITOR_IMAGE:?set GLANCE_EDITOR_IMAGE to the editor image to test}"

net="$TEST_PREFIX-listen"
work="$(mktemp -d)"
trap 'cleanup_test_containers; docker network rm "$net" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
cleanup_test_containers
docker network rm "$net" >/dev/null 2>&1 || true
docker network create --ipv6 --label "$TEST_LABEL" "$net" >/dev/null

# A dashboard that shows the user's own HOST and PORT, to see they reach Glance.
cat > "$work/glance.yml" <<'EOF'
pages:
  - name: Host ${HOST} port ${PORT}
    columns:
      - size: full
        widgets: []
EOF
# shellcheck disable=SC2016 # the placeholders are meant literally
sed 's/Host ${HOST} port ${PORT}/Plain/' "$work/glance.yml" > "$work/plain.yml" # no placeholders: unset ones stop Glance
# Refuses IPv6 sockets (socket(AF_INET6, ...) fails with EAFNOSUPPORT), as a kernel without IPv6 does.
cat > "$work/no-ipv6.json" <<'EOF'
{"defaultAction": "SCMP_ACT_ALLOW",
 "syscalls": [{"names": ["socket"], "action": "SCMP_ACT_ERRNO", "errnoRet": 97,
               "args": [{"index": 0, "value": 10, "op": "SCMP_CMP_EQ"}]}]}
EOF

failures=0
check() { if "$@"; then log "ok   $desc"; else log "BAD  $desc"; failures=$((failures + 1)); fi; }
# Starts an editor container on the network; extra docker run args follow the name.
start() { local n="$TEST_PREFIX-listen-$1"; shift; docker run -d --name "$n" --label "$TEST_LABEL" --network "$net" "$@" "$image" >/dev/null; }
# Waits for the editor's "Listening on" line (or a listen error) in the container's log.
settle() { for _ in $(seq 1 60); do docker logs "$1" 2>&1 | grep -qE '\[editor\] (Listening on|Error)' && return 0; sleep 0.5; done; }
ip4() { docker inspect -f "{{(index .NetworkSettings.Networks \"$net\").IPAddress}}" "$1"; }
ip6() { docker inspect -f "{{(index .NetworkSettings.Networks \"$net\").GlobalIPv6Address}}" "$1"; }
# GETs a URL from a second container on the network; prints the status, the page title, or the error code.
probe() { docker run --rm --label "$TEST_LABEL" --network "$net" --entrypoint node "$image" -e "
  fetch(process.argv[1], {signal: AbortSignal.timeout(4000)}).then(async (r) => {
    const t = (await r.text()).match(/<title>([^<]*)/);
    console.log(process.argv[2] === 'title' ? (t ? t[1] : 'no title') : r.status);
  }, (e) => console.log((e.cause && e.cause.code) || e.name))" "$1" "${2:-status}"; }
# The image's own health check (Dockerfile HEALTHCHECK): /healthz on 127.0.0.1:3000, from inside.
healthy() { docker exec "$1" node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"; }
logged() { docker logs "$1" 2>&1 | grep -qF -- "$2"; }

a="$TEST_PREFIX-listen-a"
start a
settle "$a"
desc="default: the log says IPv4 and IPv6";              check logged "$a" "the editor listens on IPv4 and IPv6"
desc="default: the editor answers over IPv4";            check test "$(probe "http://$(ip4 "$a"):3000/healthz")" = 200
desc="default: the editor answers over IPv6";            check test "$(probe "http://[$(ip6 "$a")]:3000/healthz")" = 200
desc="default: the health check passes";                 check healthy "$a"

b="$TEST_PREFIX-listen-b"
start b -e HOST=192.0.2.10 -e PORT=8123
settle "$b"
docker cp "$work/glance.yml" "$b:/data/config/glance.yml"
desc="user's HOST and PORT: the editor answers over IPv4 on 3000";  check test "$(probe "http://$(ip4 "$b"):3000/healthz")" = 200
desc="user's HOST and PORT: the editor answers over IPv6 on 3000";  check test "$(probe "http://[$(ip6 "$b")]:3000/healthz")" = 200
desc="user's HOST and PORT: the health check passes";               check healthy "$b"
desc="user's HOST and PORT: no listen error in the log";            check bash -c "! docker logs $b 2>&1 | grep -qE 'EADDRNOTAVAIL|ENOTFOUND'"
for _ in $(seq 1 40); do [[ "$(probe "http://$(ip4 "$b"):8080/" title)" == Host* ]] && break; sleep 0.5; done
desc="user's HOST and PORT: they reach Glance";          check test "$(probe "http://$(ip4 "$b"):8080/" title)" = "Host 192.0.2.10 port 8123"

c="$TEST_PREFIX-listen-c"
start c --security-opt "seccomp=$work/no-ipv6.json"
settle "$c"
docker cp "$work/plain.yml" "$c:/data/config/glance.yml"
desc="no IPv6: the log says IPv4 only";                  check logged "$c" "no IPv6 in this container: the editor listens on IPv4 only"
desc="no IPv6: the editor answers over IPv4";            check test "$(probe "http://$(ip4 "$c"):3000/healthz")" = 200
desc="no IPv6: the health check passes";                 check healthy "$c"
for _ in $(seq 1 40); do [[ "$(probe "http://$(ip4 "$c"):8080/" title)" == Plain ]] && break; sleep 0.5; done
desc="no IPv6: the dashboard answers over IPv4";         check test "$(probe "http://$(ip4 "$c"):8080/" title)" = Plain

e="$TEST_PREFIX-listen-e"
start e
settle "$e"
printf 'HOST=dashboard.example\nPORT=8124\n' > "$work/.env"
docker cp "$work/.env" "$e:/data/config/.env"
docker cp "$work/glance.yml" "$e:/data/config/glance.yml"
for _ in $(seq 1 40); do [[ "$(probe "http://$(ip4 "$e"):8080/" title)" == Host* ]] && break; sleep 0.5; done
desc="HOST and PORT in .env: they reach Glance";         check test "$(probe "http://$(ip4 "$e"):8080/" title)" = "Host dashboard.example port 8124"
desc="HOST and PORT in .env: the editor answers on 3000"; check test "$(probe "http://$(ip4 "$e"):3000/healthz")" = 200

d="$TEST_PREFIX-listen-d"
start d --sysctl net.ipv6.bindv6only=1
settle "$d"
desc="bindv6only=1: the editor answers over IPv4";       check test "$(probe "http://$(ip4 "$d"):3000/healthz")" = 200
desc="bindv6only=1: the editor answers over IPv6";       check test "$(probe "http://[$(ip6 "$d")]:3000/healthz")" = 200
desc="bindv6only=1: the health check passes";            check healthy "$d"

if ((failures > 0)); then
  for n in "$a" "$b" "$c" "$e" "$d"; do log "--- $n"; docker logs "$n" 2>&1 | tail -15 >&2; done
  fail "$failures editor-listen check(s) failed"
fi
log "all editor-listen checks passed"

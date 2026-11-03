// ADR-0035: the container's start program picks the editor's listen address. The container cases (IPv6 network, no
// IPv6, the user's own HOST and PORT) are in test/editor-listen.sh.
import { createServer, connect } from "node:net";
import { describe, expect, it } from "vitest";
import { canListen, editorListenAddress } from "../../../image/listen.ts";

const ipv6 = await canListen("::");

describe("canListen", () => {
  it("is true for an address of this machine", async () => {
    expect(await canListen("127.0.0.1")).toBe(true);
  });

  it("is false for an address or a name this machine can't listen on (what a user's own HOST might hold)", async () => {
    expect(await canListen("192.0.2.10")).toBe(false); // a documentation address (RFC 5737)
    expect(await canListen("dashboard.invalid")).toBe(false); // a reserved name that never resolves (RFC 2606)
  });
});

describe("editorListenAddress", () => {
  it("is :: where IPv6 sockets open, else 0.0.0.0", async () => {
    expect(await editorListenAddress()).toBe(ipv6 ? "::" : "0.0.0.0");
  });

  it.runIf(ipv6)("on ::, IPv4 connections reach it too (the health check uses 127.0.0.1)", async () => {
    const server = createServer((s) => s.end("ok"));
    await new Promise<void>((r) => server.listen({ host: "::", port: 0 }, r));
    const { port } = server.address() as { port: number };
    const got = await new Promise<string>((resolve, reject) => {
      const c = connect({ host: "127.0.0.1", port });
      let data = "";
      c.on("data", (d) => (data += d)).on("end", () => resolve(data)).on("error", reject);
    });
    await new Promise((r) => server.close(r));
    expect(got).toBe("ok");
  });
});

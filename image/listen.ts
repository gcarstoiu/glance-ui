// Where the editor listens inside the container (ADR-0035). "::" takes IPv4 and IPv6 alike, as Glance's ":8080"
// does; a kernel without IPv6 can't open it, and then the editor listens on IPv4 only.
import { createServer } from "node:net";

/** Whether a TCP socket can listen on this address (on a free port, closed again at once). */
export function canListen(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.listen({ host, port: 0 }, () => s.close(() => resolve(true)));
  });
}

/** The editor's listen address: "::" when the container can open IPv6 sockets, else "0.0.0.0". */
export async function editorListenAddress(): Promise<"::" | "0.0.0.0"> {
  return (await canListen("::")) ? "::" : "0.0.0.0";
}

"""Launch RoomPing; LAN binding always requires an explicit command."""
import argparse

from . import __version__
from .server import create_server


def main(argv=None):
    parser = argparse.ArgumentParser(description="RoomPing: PC–phone LAN HTTP measurements (trusted LAN only)")
    parser.add_argument("--host", default="127.0.0.1", help="IPv4 bind address; default is local PC only")
    parser.add_argument("--port", type=int, default=8767, help="TCP port (default: 8767)")
    parser.add_argument("--advertise", help="PC LAN IPv4 address for QR/link; required with --host 0.0.0.0")
    parser.add_argument("--version", action="version", version=__version__)
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    try:
        server = create_server(args.host, args.port, advertised_host=args.advertise)
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
    print(f"RoomPing {__version__}\nOpen this private join URL on the PC or phone:\n{server.join_url}")
    print("Use the QR in the browser. Keep this process open; Ctrl+C stops it.")
    print("HTTP is unencrypted. Use a trusted LAN; do not expose this port to the internet.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nRoomPing stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

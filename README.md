# rsynx

rsynx is an open-source command-line tool for live terminal sharing between two
people — something like AnyDesk, but for the terminal; no SSH required, no public IP
required, and no firewall configuration.

![Running rsynx host in the terminal](docs/assets/cli-screenshot.png)

## Features

- **No network setup**: no SSH, no public IP, no port forwarding — just a six-digit
  code and a four-character password.
- **End-to-end encryption**: the encryption key exists only in the memory of the two
  session participants; the relay server never has access to message content or the
  key.
- **Explicit host approval**: no connection, and no transfer of typing control, ever
  happens without the host's direct, in-the-moment approval.
- **In-page chat**: no need for a separate tool to coordinate during a sharing session.
- **Standalone binary**: install with a single command, no Node.js or separate
  dependency required.

## Installation

```bash
curl -fsSL https://rsynx.ir/i | sh
```

## Usage

The host creates a new session:

```bash
rsynx host
```

A six-digit code and a four-character password are displayed. The other side connects
with that same code:

```bash
rsynx join <code>
```

After entering the password, the host approves or rejects the connection request. Once
approved, the guest can watch the host's terminal live, chat on the same screen, and —
if the host approves again — temporarily take typing control of the terminal, which
the host can revoke at any moment.

## Folder structure

```
rsynx/
├── apps/
│   ├── cli/       command-line tool (host/join, TUI)
│   ├── relay/     WebSocket relay server (only forwards encrypted messages)
│   └── web/       landing page and install script
├── packages/
│   └── protocol/  encryption, key derivation, and shared message types
├── docs/          documentation, including SPEC.md
└── .github/       CI/CD
```

The full protocol specification lives in [`docs/SPEC.md`](docs/SPEC.md).

## Contributing

Pull requests are welcome. Please open an issue before large changes so we can align
on the approach.

## License

MIT — see [`LICENSE`](LICENSE).

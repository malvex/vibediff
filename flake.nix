{
  description = "VibeDiff - A local Git diff viewer with Go backend and React frontend";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Go toolchain
            go
            gopls
            gotools
            go-tools
            golangci-lint

            # Node.js toolchain
            nodejs

            # Build tools
            go-task

            # Git (for runtime)
            git
          ];

          shellHook = ''
            echo "VibeDiff development environment"
            echo "================================"
            echo "Go version: $(go version)"
            echo "Node version: $(node --version)"
            echo "npm version: $(npm --version)"
            echo ""
            echo "Available commands:"
            echo "  task run        - Run backend (serves embedded assets)"
            echo "  task build      - Build single binary with embedded web assets"
            echo "  task test       - Run backend tests"
            echo "  task lint       - Run Go linting"
            echo "  task fmt        - Format Go code"
            echo ""
            echo "  cd web && npm install  - Install frontend dependencies"
            echo "  cd web && npm run dev  - Run frontend dev server"
            echo "  cd web && npm test     - Run frontend tests"
            echo ""
          '';
        };
      }
    );
}

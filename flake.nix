{
  description = "development environment for Evolu monorepo";

  inputs = {
    nixpkgs.url = "https://flakehub.com/f/NixOS/nixpkgs/0.1.*.tar.gz";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      overlays = [
        (final: prev: {
          # NOTE: see package.json engines.node
          nodejs = prev.nodejs_22;
          pnpm = prev.nodePackages.pnpm.override rec {
            # NOTE: see package.json packageManager
            version = "10.5.2";
            src = prev.fetchurl {
              url = "https://registry.npmjs.org/pnpm/-/pnpm-${version}.tgz";
              # generate sha256 hash using `nix-hash --type sha256 --flat pnpm-*.tgz`
              sha256 = "79a98daa90248b50815e31460790f118c56fe099113370826caa0153be6daba5";
            };
          };
        })
      ];
      pkgs = import nixpkgs {inherit overlays system;};
    in {
      devShells = {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs
            pnpm
          ];
        };
      };
    });
}

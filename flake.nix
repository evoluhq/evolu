{
  description = "A Nix-flake-based Node.js development environment";

  inputs.nixpkgs.url = "https://flakehub.com/f/NixOS/nixpkgs/0.1.*.tar.gz";

  outputs = { self, nixpkgs }:
    let
      overlays = [
        (final: prev: rec {
          nodejs = prev.nodejs_18;
          pnpm = prev.nodePackages.pnpm.override rec {
            version = "9.1.3";
            src = prev.fetchurl {
              url = "https://registry.npmjs.org/pnpm/-/pnpm-${version}.tgz";
              sha256 = "sha256-f2MAHtwHfxz/lsrLqQHzUHlih6KADfqD/omPlBg+T18=";
            };
          };
        })
      ];
      supportedSystems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forEachSupportedSystem = f: nixpkgs.lib.genAttrs supportedSystems (system: f {
        pkgs = import nixpkgs { inherit overlays system; };
      });
    in
    {
      devShells = forEachSupportedSystem ({ pkgs }: {
        default = pkgs.mkShell {
          packages = with pkgs; [ 
            nodejs 
            pnpm
          ];
        };
      });
    };
}

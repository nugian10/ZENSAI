#!/usr/bin/env python3
"""Extract ABI + bytecode from Hardhat artifacts into site/zensai-artifact.json
for the browser deploy page. Run after `npx hardhat compile`."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def load(name):
    p = os.path.join(ROOT, "contracts", "artifacts", "contracts", f"{name}.sol", f"{name}.json")
    with open(p) as f:
        return json.load(f)
out = {}
for key, name in (("token", "ZensaiToken"), ("nft", "ZensaiNFT")):
    a = load(name)
    out[key] = {"abi": a["abi"], "bytecode": a["bytecode"]}
out["baseURI"] = "https://raw.githubusercontent.com/nugian10/ZENSAI/main/collection/metadata/"
out["owner"] = "0x0262e8e5E4584D8AB840fD950a6E2E0A414d4097"
out["revenue"] = "0x89c37649Ba3BAA9E1ce028612b7DE4e9c3a947B7"
out["registry"] = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F"
with open(os.path.join(ROOT, "site", "zensai-artifact.json"), "w") as f:
    json.dump(out, f)
print("wrote site/zensai-artifact.json:",
      "token abi", len(out["token"]["abi"]), "bytecode", len(out["token"]["bytecode"]),
      "| nft abi", len(out["nft"]["abi"]), "bytecode", len(out["nft"]["bytecode"]))
